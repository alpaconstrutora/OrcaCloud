import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintProdutoService } from '../services/blueprintProdutoService';
import { produtoDaColuna, produtoVazio, type Produto } from '../utils/blueprintProduto';

/**
 * O PRODUTO do Estudo de Massa (02/10/2026, M2).
 *
 * Mesmo desenho de `useBlueprintPrograma`: estado local que responde na hora,
 * gravação atrás com respiro de 500 ms, degradação sem a migration
 * (`persistenciaIndisponivel` — aí vale só na sessão). Do ESTUDO, e não do
 * navegador: o colega que abre o estudo vê o mesmo mix.
 */
export interface ProdutoDoEstudo {
  produto: Produto;
  setProduto: (p: Produto | ((atual: Produto) => Produto)) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
  /** Último erro de gravação, para a tela acusar. */
  erroDeGravacao: string | null;
}

export function useBlueprintProduto(studyId: string, organizationId: string): ProdutoDoEstudo {
  const [produto, setLocal] = useState<Produto>(() => produtoVazio());
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const [erroDeGravacao, setErro] = useState<string | null>(null);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<Produto | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintProdutoService.get(studyId);
        if (!vivo) return;
        setLocal(row ? produtoDaColuna(row.produto) : produtoVazio());
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[produto] sem persistência (migration ausente?):', e);
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

  const setProduto = useCallback(
    (p: Produto | ((atual: Produto) => Produto)) => {
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
        blueprintProdutoService
          .save(studyId, organizationId, alvo)
          .then(() => setErro(null))
          .catch((e) => {
            console.warn('[produto] não gravou:', e);
            setErro(e instanceof Error ? e.message : String(e));
          });
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { produto, setProduto, carregando, persistenciaIndisponivel, erroDeGravacao };
}
