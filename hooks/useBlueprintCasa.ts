import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintCasaService } from '../services/blueprintCasaService';
import { PREMISSAS_DA_CASA_PADRAO, premissasDaCasaDaColuna, type PremissasDaCasa } from '../utils/blueprintPremissasDaCasa';

/**
 * As PREMISSAS da casa automática do ESTUDO (F10, 15/10/2026). Mesmo desenho de `useBlueprintClimatizacao`:
 * estado local que responde na hora, gravação atrás com respiro de 500 ms. Sem a tabela (migration ausente), as
 * premissas valem só nesta sessão, e a tela diz (`persistenciaIndisponivel`).
 *
 * `vazio`: o estudo nunca gravou premissas da casa — a tela pode pré-preencher o programa pela unidade do
 * Empreendimento sem passar por cima do que alguém já escolheu.
 */
export interface CasaDoEstudo {
  premissas: PremissasDaCasa;
  setPremissas: (p: PremissasDaCasa) => void;
  carregando: boolean;
  vazio: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintCasa(studyId: string, organizationId: string): CasaDoEstudo {
  const [premissas, setLocal] = useState<PremissasDaCasa>(PREMISSAS_DA_CASA_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [vazio, setVazio] = useState(false);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O que está no respiro, para gravar na hora se a tela sair antes dos 500 ms. */
  const pendente = useRef<PremissasDaCasa | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintCasaService.get(studyId);
        if (!vivo) return;
        setVazio(!row);
        if (row) setLocal(premissasDaCasaDaColuna(row.hipoteses));
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[casa] premissas da casa sem persistência no estudo (migration ausente?) — valem só nesta sessão:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId, organizationId]);

  // A gravação pendente não se perde ao desmontar: o que estava no respiro grava na hora.
  useEffect(
    () => () => {
      if (!gravacao.current || !pendente.current) return;
      clearTimeout(gravacao.current);
      blueprintCasaService.save(studyId, organizationId, pendente.current).catch((e) => console.warn('[casa] não gravou as premissas:', e));
    },
    [studyId, organizationId],
  );

  const setPremissas = useCallback(
    (p: PremissasDaCasa) => {
      setLocal(p);
      setVazio(false);
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      pendente.current = p;
      gravacao.current = setTimeout(() => {
        gravacao.current = null;
        pendente.current = null;
        blueprintCasaService.save(studyId, organizationId, p).catch((e) => console.warn('[casa] não gravou as premissas:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { premissas, setPremissas, carregando, vazio, persistenciaIndisponivel };
}
