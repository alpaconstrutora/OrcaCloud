import { useEffect, useMemo, useState } from 'react';
import type { BudgetEntry } from '../types';
import type { ProjectSchedule } from '../types/project';
import { projectService } from '../services/projectService';
import {
    resolverPlanejamentoDoDiario,
    itensCronogramaVinculaveis,
    ItemVinculavel,
    ProjetoParaVinculo,
} from '../utils/diaryPlanningLink';

export interface DiaryLinkedPlanning {
    /** Projeto que tem o cronograma (normalmente o Planejamento). */
    planejamentoId: string | null;
    schedule: ProjectSchedule | null;
    budget: BudgetEntry[];
    itens: ItemVinculavel[];
    loading: boolean;
    /** Depois de sincronizar: a tela passa a partir do cronograma gravado. */
    setSchedule: (s: ProjectSchedule) => void;
}

export interface PlanejamentoCarregado {
    schedule: ProjectSchedule | null;
    budget: BudgetEntry[];
}

/** Cronograma e orçamento de um planejamento; `null` = projeto não encontrado (a tela fica como está). */
export type CarregarPlanejamento = (planejamentoId: string) => Promise<PlanejamentoCarregado | null>;

/**
 * Carregador padrão (sessão logada): lê o planejamento pelo `projectService`. O
 * orçamento vem do próprio planejamento; se ele não tiver, do projeto para o
 * qual o planejamento aponta (`settings.linkedProjectId`).
 */
export const carregarPlanejamentoPorProjeto: CarregarPlanejamento = async planejamentoId => {
    const p = await projectService.loadProject(planejamentoId);
    if (!p) return null;
    const schedule: ProjectSchedule | null = p.settings?.schedule || null;
    if (p.budget && p.budget.length > 0) return { schedule, budget: p.budget };
    if (p.settings?.linkedProjectId) {
        const pai = await projectService.loadProject(p.settings.linkedProjectId);
        return { schedule, budget: pai?.budget || [] };
    }
    return { schedule, budget: [] };
};

/**
 * Cronograma e orçamento ligados a um diário — usado pela tela desktop e pelo
 * app mobile.
 *
 * `carregar` substitui o carregador padrão (o link do celular lê pela RPC
 * `celular_planejamento_ler`). Tem de ser ESTÁVEL (`useCallback`): entra nas
 * dependências do efeito, e uma função nova a cada render recarregaria em laço.
 */
export function useDiaryLinkedPlanning(
    linkedProjectId: string | null | undefined,
    projects: ProjetoParaVinculo[],
    carregar: CarregarPlanejamento = carregarPlanejamentoPorProjeto,
): DiaryLinkedPlanning {
    const planejamentoId = useMemo(
        () => resolverPlanejamentoDoDiario(linkedProjectId, projects),
        [linkedProjectId, projects],
    );
    const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
    const [budget, setBudget] = useState<BudgetEntry[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!planejamentoId) {
            setSchedule(null);
            setBudget([]);
            return;
        }
        (async () => {
            setLoading(true);
            try {
                const r = await carregar(planejamentoId);
                if (cancelled || !r) return;
                setSchedule(r.schedule);
                setBudget(r.budget);
            } catch (error) {
                console.error('Erro ao carregar o planejamento vinculado ao diário:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [planejamentoId, carregar]);

    const itens = useMemo(() => itensCronogramaVinculaveis(schedule, budget), [schedule, budget]);

    return { planejamentoId, schedule, budget, itens, loading, setSchedule };
}
