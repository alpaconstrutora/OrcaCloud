// Indicadores de prazo de cada planejamento da lista (Engenharia › Planejamento).
//
// A lista já tem `settings.schedule` de cada planejamento, mas não o orçamento (coluna
// `projects.budget`, fora do select de listProjects). Sem o orçamento não dá para saber
// quais itens do cronograma ainda existem nem pesar o avanço pelo valor — por isso esta
// busca leve só de `id, budget`, e a conta é a da Central de Comando
// (utils/planejamentoIndicadores.ts). Lê pelos ids que a lista já recortou (seletor de
// organização do topo, REGRA #5); não decide organização nenhuma.
import React from 'react';
import { supabase } from '../lib/supabase';
import { indicadoresDePrazo, folhasDoOrcamento, type IndicadoresDePrazo } from '../utils/planejamentoIndicadores';

interface PlanejamentoDaLista {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings?: any;
}

export type EstadoDosIndicadores = 'carregando' | 'pronto' | 'erro';

export function useIndicadoresDosPlanejamentos(planejamentos: PlanejamentoDaLista[], ativo: boolean) {
    const [orcamentos, setOrcamentos] = React.useState<Record<string, unknown[]>>({});
    const [estado, setEstado] = React.useState<EstadoDosIndicadores>('carregando');
    const [tentativa, setTentativa] = React.useState(0);

    const chaveIds = ativo ? planejamentos.map(p => p.id).sort().join(',') : '';

    React.useEffect(() => {
        if (!ativo) return;
        const ids = chaveIds ? chaveIds.split(',') : [];
        if (ids.length === 0) { setOrcamentos({}); setEstado('pronto'); return; }
        let cancelado = false;
        setEstado('carregando');
        supabase.from('projects').select('id, budget').in('id', ids).then(({ data, error }) => {
            if (cancelado) return;
            if (error) { setEstado('erro'); return; }
            const porId: Record<string, unknown[]> = {};
            for (const linha of (data ?? []) as { id: string; budget: unknown[] | null }[]) porId[linha.id] = linha.budget ?? [];
            setOrcamentos(porId);
            setEstado('pronto');
        }, () => { if (!cancelado) setEstado('erro'); });
        return () => { cancelado = true; };
    }, [ativo, chaveIds, tentativa]);

    const porProjeto = React.useMemo(() => {
        const mapa: Record<string, IndicadoresDePrazo> = {};
        if (estado !== 'pronto') return mapa;
        for (const p of planejamentos) {
            mapa[p.id] = indicadoresDePrazo(
                folhasDoOrcamento(orcamentos[p.id] as Parameters<typeof folhasDoOrcamento>[0]),
                p.settings?.schedule,
            );
        }
        return mapa;
    }, [planejamentos, orcamentos, estado]);

    const tentarDeNovo = React.useCallback(() => setTentativa(t => t + 1), []);

    return { porProjeto, estado, tentarDeNovo };
}
