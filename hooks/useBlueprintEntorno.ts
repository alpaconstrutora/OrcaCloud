import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintEntornoService } from '../services/blueprintEntornoService';
import { vizinhosDaColuna, type VizinhoDoEntorno } from '../utils/blueprintInsolacao';

/**
 * O ENTORNO do estudo (02/10/2026, M5b): os vizinhos por divisa.
 *
 * Mesmo desenho de `useBlueprintProduto`: estado local que responde na hora,
 * gravação atrás com respiro de 500 ms, degradação sem a migration
 * (`persistenciaIndisponivel` — aí vale só na sessão). Do ESTUDO, e não do
 * navegador: até a M5b os vizinhos viviam numa chave global do navegador, que
 * valia para todos os estudos e não chegava ao colega.
 */
export interface EntornoDoEstudo {
  vizinhos: VizinhoDoEntorno[];
  setVizinhos: (v: VizinhoDoEntorno[]) => void;
  carregando: boolean;
  /** O estudo já tem a linha gravada (mesmo com a lista vazia). */
  gravadoNoEstudo: boolean;
  persistenciaIndisponivel: boolean;
  erroDeGravacao: string | null;
}

export function useBlueprintEntorno(studyId: string, organizationId: string): EntornoDoEstudo {
  const [vizinhos, setLocal] = useState<VizinhoDoEntorno[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gravadoNoEstudo, setGravado] = useState(false);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const [erroDeGravacao, setErro] = useState<string | null>(null);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintEntornoService.get(studyId);
        if (!vivo) return;
        setLocal(row ? vizinhosDaColuna(row.vizinhos) : []);
        setGravado(!!row);
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[entorno] sem persistência (migration ausente?):', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  useEffect(
    () => () => {
      if (gravacao.current) clearTimeout(gravacao.current);
    },
    [],
  );

  const setVizinhos = useCallback(
    (v: VizinhoDoEntorno[]) => {
      setLocal(v);
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintEntornoService
          .save(studyId, organizationId, v)
          .then(() => {
            setErro(null);
            setGravado(true);
          })
          .catch((e) => {
            console.warn('[entorno] não gravou:', e);
            setErro(e instanceof Error ? e.message : String(e));
          });
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { vizinhos, setVizinhos, carregando, gravadoNoEstudo, persistenciaIndisponivel, erroDeGravacao };
}
