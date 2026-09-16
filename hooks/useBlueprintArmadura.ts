import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintArmaduraService } from '../services/blueprintArmaduraService';
import {
  HIPOTESES_ARMADURA_PADRAO,
  hipotesesDeArmaduraDaColuna,
  type HipotesesDeArmadura,
} from '../utils/blueprintArmadura';

/**
 * As HIPÓTESES da armadura esquemática do estudo (16/09/2026).
 *
 * Mesmo desenho de `useBlueprintEletrica`: estado local que responde na hora,
 * gravação atrás com respiro, degradação sem a migration
 * (`persistenciaIndisponivel` — aí vale só na sessão). Do ESTUDO, e não do
 * navegador, porque o kg entra no quantitativo e no orçamento: duas pessoas
 * abrindo o mesmo estudo têm de ver o mesmo aço.
 */
export interface ArmaduraDoEstudo {
  hipoteses: HipotesesDeArmadura;
  setHipoteses: (h: HipotesesDeArmadura) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintArmadura(studyId: string, organizationId: string): ArmaduraDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesDeArmadura>(HIPOTESES_ARMADURA_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintArmaduraService.get(studyId);
        if (!vivo) return;
        setLocal(row ? hipotesesDeArmaduraDaColuna(row.hipoteses) : HIPOTESES_ARMADURA_PADRAO);
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[armadura] hipóteses sem persistência (migration ausente?):', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const setHipoteses = useCallback(
    (h: HipotesesDeArmadura) => {
      setLocal(h);
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintArmaduraService
          .save(studyId, organizationId, h)
          .catch((e) => console.warn('[armadura] não gravou as hipóteses:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
