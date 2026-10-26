import { useEffect, useState } from 'react';
import { empreendimentoService } from '../services/empreendimentoService';
import type { EmpreendimentoTower, EmpreendimentoWithChildren } from '../types/empreendimento';

/**
 * As TORRES com as UNIDADES do Empreendimento ligado ao estudo (25/10/2026) — uma leitura para as duas telas da
 * Planta que constroem pelos dados dele: a Casa automática (a unidade preenche o programa) e o Produto da massa
 * (o mix vem das unidades). Era um efeito só da Casa no editor. Plano:
 * docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
 *
 * Só lê com `ativo` (a tela aberta) e recarrega ao reabrir — as unidades mudam em outra tela. `carregadoDe` diz de
 * qual empreendimento é a lista na mão: a tela não age sobre a lista de outro (troca de vínculo no meio).
 */
export interface UnidadesDoEmpreendimento {
  torres: EmpreendimentoTower[];
  /** O empreendimento da lista em `torres`; `null` = nada carregado ainda. */
  carregadoDe: string | null;
  erro: string | null;
}

export function useUnidadesDoEmpreendimento(empreendimentoId: string | null, ativo: boolean): UnidadesDoEmpreendimento {
  const [estado, setEstado] = useState<UnidadesDoEmpreendimento>({ torres: [], carregadoDe: null, erro: null });

  useEffect(() => {
    if (!ativo || !empreendimentoId) return;
    // A resposta pode chegar depois de a tela fechar — sem o `vivo`, setState em componente desmontado
    // derrubou a CI uma vez (PR #79, "window is not defined").
    let vivo = true;
    empreendimentoService
      .getById(empreendimentoId, { includeChildren: true })
      .then((e) => {
        if (!vivo) return;
        setEstado({ torres: (e as EmpreendimentoWithChildren | null)?.towers ?? [], carregadoDe: empreendimentoId, erro: null });
      })
      .catch((err) => {
        if (!vivo) return;
        console.warn('[planta] unidades do empreendimento indisponíveis:', err);
        setEstado({ torres: [], carregadoDe: null, erro: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      vivo = false;
    };
  }, [ativo, empreendimentoId]);

  return estado;
}
