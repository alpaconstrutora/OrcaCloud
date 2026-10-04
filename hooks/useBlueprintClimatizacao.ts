import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintClimatizacaoService } from '../services/blueprintClimatizacaoService';
import { HIPOTESES_CLIMATIZACAO_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';

/**
 * As PREMISSAS de climatização do ESTUDO (E0.1 do roadmap de climatização,
 * 04/10/2026). Mesmo desenho de `useBlueprintIncendio`: estado local que
 * responde na hora, gravação atrás com respiro de 500 ms. Nasceram no estudo —
 * não há chave antiga de navegador a adotar. Sem a tabela (migration ainda não
 * aplicada), valem só na sessão, e a tela diz.
 */
export interface ClimatizacaoDoEstudo {
  hipoteses: HipotesesClimatizacao;
  setHipoteses: (h: HipotesesClimatizacao) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintClimatizacao(studyId: string, organizationId: string): ClimatizacaoDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesClimatizacao>(HIPOTESES_CLIMATIZACAO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintClimatizacaoService.get(studyId);
        if (!vivo) return;
        setLocal(row ? hipotesesClimatizacaoDaColuna(row.hipoteses) : HIPOTESES_CLIMATIZACAO_PADRAO);
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[climatizacao] premissas sem persistência no estudo (migration ausente?) — valem só nesta sessão:', e);
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
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintClimatizacaoService.save(studyId, organizationId, h).catch((e) => console.warn('[climatizacao] não gravou as premissas:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
