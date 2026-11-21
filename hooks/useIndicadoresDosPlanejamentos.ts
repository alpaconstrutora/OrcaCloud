// Indicadores de prazo de cada planejamento da lista (Engenharia › Planejamento).
//
// A lista já tem `settings.schedule` de cada planejamento, mas não o orçamento (coluna
// `projects.budget`, fora do select de listProjects). Sem o orçamento não dá para saber
// quais itens do cronograma ainda existem nem pesar o avanço pelo valor — por isso a
// busca leve de `useOrcamentosDaLista`, e a conta é a da Central de Comando
// (utils/planejamentoIndicadores.ts).
import React from 'react';
import { indicadoresDePrazo, folhasDoOrcamento, type IndicadoresDePrazo } from '../utils/planejamentoIndicadores';
import { useOrcamentosDaLista, type EstadoDosOrcamentos } from './useOrcamentosDaLista';

interface PlanejamentoDaLista {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings?: any;
}

export type EstadoDosIndicadores = EstadoDosOrcamentos;

export function useIndicadoresDosPlanejamentos(planejamentos: PlanejamentoDaLista[], ativo: boolean) {
    const ids = React.useMemo(() => planejamentos.map(p => p.id), [planejamentos]);
    const { orcamentos, estado, tentarDeNovo } = useOrcamentosDaLista(ids, ativo);

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

    return { porProjeto, estado, tentarDeNovo };
}
