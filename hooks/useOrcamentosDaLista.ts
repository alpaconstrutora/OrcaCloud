// Itens do orçamento (`projects.budget`) de cada linha de uma lista de projetos.
//
// `listProjects` não traz a coluna `budget` (pesada). Quem precisa dela numa lista (indicadores
// de prazo do Planejamento, Valor total dos Orçamentos) faz esta busca leve só de `id, budget`,
// pelos ids que a lista já recortou (seletor de organização do topo, REGRA #5); não decide
// organização nenhuma. `ativo` falso não busca nada.
import React from 'react';
import { supabase } from '../lib/supabase';

export type EstadoDosOrcamentos = 'carregando' | 'pronto' | 'erro';

export function useOrcamentosDaLista(ids: readonly string[], ativo: boolean) {
    const [orcamentos, setOrcamentos] = React.useState<Record<string, unknown[]>>({});
    const [estado, setEstado] = React.useState<EstadoDosOrcamentos>('carregando');
    const [tentativa, setTentativa] = React.useState(0);
    const chaveIds = ativo ? [...ids].sort().join(',') : '';

    React.useEffect(() => {
        if (!ativo) return;
        const lista = chaveIds ? chaveIds.split(',') : [];
        if (lista.length === 0) { setOrcamentos({}); setEstado('pronto'); return; }
        let cancelado = false;
        setEstado('carregando');
        supabase.from('projects').select('id, budget').in('id', lista).then(({ data, error }) => {
            if (cancelado) return;
            if (error) { setEstado('erro'); return; }
            const porId: Record<string, unknown[]> = {};
            for (const linha of (data ?? []) as { id: string; budget: unknown[] | null }[]) porId[linha.id] = linha.budget ?? [];
            setOrcamentos(porId);
            setEstado('pronto');
        }, () => { if (!cancelado) setEstado('erro'); });
        return () => { cancelado = true; };
    }, [ativo, chaveIds, tentativa]);

    const tentarDeNovo = React.useCallback(() => setTentativa(t => t + 1), []);
    return { orcamentos, estado, tentarDeNovo };
}
