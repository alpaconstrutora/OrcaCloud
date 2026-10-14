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

/**
 * Cronograma e orçamento ligados a um diário — usado pela tela desktop e pelo
 * app mobile. O orçamento vem do próprio planejamento; se ele não tiver, do
 * projeto para o qual o planejamento aponta.
 */
export function useDiaryLinkedPlanning(
    linkedProjectId: string | null | undefined,
    projects: ProjetoParaVinculo[],
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
                const p = await projectService.loadProject(planejamentoId);
                if (cancelled || !p) return;
                setSchedule(p.settings?.schedule || null);
                if (p.budget && p.budget.length > 0) {
                    setBudget(p.budget);
                } else if (p.settings?.linkedProjectId) {
                    const pai = await projectService.loadProject(p.settings.linkedProjectId);
                    if (!cancelled) setBudget(pai?.budget || []);
                } else {
                    setBudget([]);
                }
            } catch (error) {
                console.error('Erro ao carregar o planejamento vinculado ao diário:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [planejamentoId]);

    const itens = useMemo(() => itensCronogramaVinculaveis(schedule, budget), [schedule, budget]);

    return { planejamentoId, schedule, budget, itens, loading, setSchedule };
}
