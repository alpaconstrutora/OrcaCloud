import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintClimatizacaoService } from '../services/blueprintClimatizacaoService';
import {
  HIPOTESES_CLIMATIZACAO_PADRAO,
  gravarInsolacaoNoNavegador,
  hipotesesClimatizacaoDaColuna,
  insolacaoDoNavegador,
  type HipotesesClimatizacao,
} from '../utils/blueprintClimatizacao';

/**
 * As PREMISSAS de climatização do ESTUDO (E0.1/E0.2 do roadmap de
 * climatização, 04/10/2026). Mesmo desenho de `useBlueprintHidro`: estado
 * local que responde na hora, gravação atrás com respiro de 500 ms.
 *
 * A INSOLAÇÃO (data, hora solar, latitude suposta, sol no 3D) morava só no
 * navegador (`blueprint:insolacao`), e o mesmo estudo calculava diferente em
 * outra máquina. A passagem é a do hidro:
 *  - o estudo tem linha → vale a linha;
 *  - não tem → adota a insolação que ESTE navegador já tinha (e grava no estudo);
 *  - sem a tabela (migration ausente) → a insolação segue no navegador, como
 *    antes, e o resto vale só na sessão; a tela diz.
 */
export interface ClimatizacaoDoEstudo {
  hipoteses: HipotesesClimatizacao;
  setHipoteses: (h: HipotesesClimatizacao) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

const comInsolacaoDoNavegador = (): HipotesesClimatizacao => {
  const doNavegador = insolacaoDoNavegador();
  return doNavegador ? { ...HIPOTESES_CLIMATIZACAO_PADRAO, insolacao: doNavegador } : HIPOTESES_CLIMATIZACAO_PADRAO;
};

export function useBlueprintClimatizacao(studyId: string, organizationId: string): ClimatizacaoDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesClimatizacao>(comInsolacaoDoNavegador);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintClimatizacaoService.get(studyId);
        if (!vivo) return;
        if (row) {
          setLocal(hipotesesClimatizacaoDaColuna(row.hipoteses));
        } else {
          // Estudo sem premissas próprias: adota a insolação do navegador e grava no estudo.
          const adotadas = comInsolacaoDoNavegador();
          setLocal(adotadas);
          if (adotadas !== HIPOTESES_CLIMATIZACAO_PADRAO) {
            blueprintClimatizacaoService.save(studyId, organizationId, adotadas).catch((e) => console.warn('[climatizacao] não gravou a insolação adotada:', e));
          }
        }
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[climatizacao] premissas sem persistência no estudo (migration ausente?) — a insolação segue no navegador:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId, organizationId]);

  const setHipoteses = useCallback(
    (h: HipotesesClimatizacao) => {
      setLocal(h);
      if (persistenciaIndisponivel) {
        gravarInsolacaoNoNavegador(h.insolacao);
        return;
      }
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintClimatizacaoService.save(studyId, organizationId, h).catch((e) => console.warn('[climatizacao] não gravou as premissas:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
