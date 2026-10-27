import { useEffect, useState } from 'react';
import { empreendimentoService } from '../services/empreendimentoService';
import type { EmpreendimentoFloor, EmpreendimentoTower, EmpreendimentoWithChildren } from '../types/empreendimento';

/**
 * As TORRES com as UNIDADES do Empreendimento ligado ao estudo (25/10/2026) — uma leitura para as duas telas da
 * Planta que constroem pelos dados dele: a Casa automática (a unidade preenche o programa) e o Produto da massa
 * (o mix vem das unidades). Era um efeito só da Casa no editor. Plano:
 * docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
 *
 * Só lê com `ativo` (a tela aberta) e recarrega ao reabrir — as unidades mudam em outra tela. `carregadoDe` diz de
 * qual empreendimento é a lista na mão: a tela não age sobre a lista de outro (troca de vínculo no meio).
 *
 * 27/10/2026: traz também o cadastro de pavimentos de cada torre (`empreendimento_floors`, que o `getById` não traz)
 * — os blocos da massa seguem as torres com os pavimentos e os nomes deles (`utils/blueprintEstruturaDaTorre`).
 */
export interface UnidadesDoEmpreendimento {
  torres: EmpreendimentoTower[];
  /** Torre → pavimentos cadastrados (vazio = a torre não tem cadastro de pavimentos). */
  pavimentosPorTorre: ReadonlyMap<string, EmpreendimentoFloor[]>;
  /** O empreendimento da lista em `torres`; `null` = nada carregado ainda. */
  carregadoDe: string | null;
  erro: string | null;
}

export function useUnidadesDoEmpreendimento(empreendimentoId: string | null, ativo: boolean): UnidadesDoEmpreendimento {
  const [estado, setEstado] = useState<UnidadesDoEmpreendimento>({ torres: [], pavimentosPorTorre: new Map(), carregadoDe: null, erro: null });

  useEffect(() => {
    if (!ativo || !empreendimentoId) return;
    // A resposta pode chegar depois de a tela fechar — sem o `vivo`, setState em componente desmontado
    // derrubou a CI uma vez (PR #79, "window is not defined").
    let vivo = true;
    empreendimentoService
      .getById(empreendimentoId, { includeChildren: true })
      .then(async (e) => {
        const torres = (e as EmpreendimentoWithChildren | null)?.towers ?? [];
        const pavimentos = await empreendimentoService.listFloorsDasTorres(torres.map((t) => t.id));
        if (!vivo) return;
        const pavimentosPorTorre = new Map<string, EmpreendimentoFloor[]>();
        for (const f of pavimentos) pavimentosPorTorre.set(f.tower_id, [...(pavimentosPorTorre.get(f.tower_id) ?? []), f]);
        setEstado({ torres, pavimentosPorTorre, carregadoDe: empreendimentoId, erro: null });
      })
      .catch((err) => {
        if (!vivo) return;
        console.warn('[planta] unidades do empreendimento indisponíveis:', err);
        setEstado({ torres: [], pavimentosPorTorre: new Map(), carregadoDe: null, erro: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      vivo = false;
    };
  }, [ativo, empreendimentoId]);

  return estado;
}
