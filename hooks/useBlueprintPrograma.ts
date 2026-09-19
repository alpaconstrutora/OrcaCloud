import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintProgramService } from '../services/blueprintProgramService';
import { programaDaColuna, programaVazio, type Programa } from '../utils/blueprintPrograma';

/**
 * O PROGRAMA DE NECESSIDADES do estudo (19/09/2026, E4.1).
 *
 * Mesmo desenho de `useBlueprintArmadura`: estado local que responde na hora,
 * gravação atrás com respiro, degradação sem a migration
 * (`persistenciaIndisponivel` — aí vale só na sessão). Do ESTUDO, e não do
 * navegador: a conferência (E4.3) e o gerador (E6) leem o mesmo programa que
 * o colega editou.
 */
export interface ProgramaDoEstudo {
  programa: Programa;
  setPrograma: (p: Programa | ((atual: Programa) => Programa)) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
  /** Último erro de gravação, para a tela acusar. */
  erroDeGravacao: string | null;
}

export function useBlueprintPrograma(studyId: string, organizationId: string): ProgramaDoEstudo {
  const [programa, setLocal] = useState<Programa>(() => programaVazio());
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const [erroDeGravacao, setErro] = useState<string | null>(null);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<Programa | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintProgramService.get(studyId);
        if (!vivo) return;
        setLocal(row ? programaDaColuna(row.programa) : programaVazio());
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[programa] sem persistência (migration ausente?):', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const setPrograma = useCallback(
    (p: Programa | ((atual: Programa) => Programa)) => {
      setLocal((atual) => {
        const proximo = typeof p === 'function' ? p(atual) : p;
        pendente.current = proximo;
        return proximo;
      });
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        const alvo = pendente.current;
        if (!alvo) return;
        blueprintProgramService
          .save(studyId, organizationId, alvo)
          .then(() => setErro(null))
          .catch((e) => {
            console.warn('[programa] não gravou:', e);
            setErro(e instanceof Error ? e.message : String(e));
          });
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { programa, setPrograma, carregando, persistenciaIndisponivel, erroDeGravacao };
}
