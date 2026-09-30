import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintIncendioService } from '../services/blueprintIncendioService';
import { HIPOTESES_INCENDIO_PADRAO, hipotesesIncendioDaColuna, type HipotesesIncendio } from '../utils/blueprintIncendioClassificacao';

/**
 * As PREMISSAS de incêndio do ESTUDO (E0.1 do roadmap de incêndio, 30/09/2026).
 * Mesmo desenho de `useBlueprintHidro`: estado local que responde na hora,
 * gravação atrás com respiro de 500 ms. Nasceram no estudo — não há chave
 * antiga de navegador a adotar. Sem a tabela (migration ainda não aplicada),
 * valem só na sessão, e a tela diz.
 */
export interface IncendioDoEstudo {
  hipoteses: HipotesesIncendio;
  setHipoteses: (h: HipotesesIncendio) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintIncendio(studyId: string, organizationId: string): IncendioDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesIncendio>(HIPOTESES_INCENDIO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintIncendioService.get(studyId);
        if (!vivo) return;
        setLocal(row ? hipotesesIncendioDaColuna(row.hipoteses) : HIPOTESES_INCENDIO_PADRAO);
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[incendio] premissas sem persistência no estudo (migration ausente?) — valem só nesta sessão:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId, organizationId]);

  const setHipoteses = useCallback(
    (h: HipotesesIncendio) => {
      setLocal(h);
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintIncendioService.save(studyId, organizationId, h).catch((e) => console.warn('[incendio] não gravou as premissas:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
