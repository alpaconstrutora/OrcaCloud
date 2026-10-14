import type { BudgetEntry } from '../types';
import type { DiaryActivity, DiaryEntry } from '../types/diary';
import type { ProjectSchedule } from '../types/project';
import type { ItemScheduleDetails } from '../types/schedule';
import { isUnplannedActivity } from './diaryActivities';

/**
 * Diário ↔ cronograma do Planejamento — regras puras, as MESMAS na tela desktop
 * (`ProjectDiaryManager`) e no app mobile (`DiaryMobileApp`). Antes viviam só no
 * desktop: o mobile lançava atividade sem vínculo e não empurrava evolução, e
 * editar no celular uma atividade vinculada no desktop deixava diário e
 * cronograma divergindo.
 */

export interface ProjetoParaVinculo {
    id: string;
    settings?: { classification?: string; linkedProjectId?: string | null } | null;
}

/**
 * Qual projeto tem o cronograma deste diário. O diário aponta (`linkedProjectId`)
 * para uma Obra, um Orçamento ou um Planejamento; o cronograma mora no
 * Planejamento. Sem achar, devolve o próprio vínculo (fallback histórico).
 */
export function resolverPlanejamentoDoDiario(
    linkedProjectId: string | null | undefined,
    projects: ProjetoParaVinculo[],
): string | null {
    const baseId = linkedProjectId;
    if (!baseId) return null;

    const linked = projects.find(p => p.id === baseId);
    if (!linked) return baseId;
    const cls = linked.settings?.classification;
    if (cls === 'PLANEJAMENTO') return baseId;

    const ehPlanejamentoDe = (p: ProjetoParaVinculo, alvo: string) =>
        p.settings?.classification === 'PLANEJAMENTO' && p.settings?.linkedProjectId === alvo;

    // 1. Planejamento que aponta direto para o vínculo
    const direto = projects.find(p => ehPlanejamentoDe(p, baseId));
    if (direto) return direto.id;

    // 2. Obra → Orçamento da obra → Planejamento desse orçamento
    if (cls === 'OBRA') {
        const orcamentos = projects
            .filter(p => p.settings?.classification === 'ORCAMENTO' && p.settings?.linkedProjectId === baseId)
            .map(p => p.id);
        const indireto = projects.find(p =>
            p.settings?.classification === 'PLANEJAMENTO' && orcamentos.includes(p.settings?.linkedProjectId ?? ''));
        if (indireto) return indireto.id;
    }

    // 3. Orçamento → Obra dele → Planejamento da obra
    if (cls === 'ORCAMENTO' && linked.settings?.linkedProjectId) {
        const obraId = linked.settings.linkedProjectId;
        const viaObra = projects.find(p => ehPlanejamentoDe(p, obraId));
        if (viaObra) return viaObra.id;
    }

    return baseId;
}

export interface ItemVinculavel {
    schedule: ItemScheduleDetails;
    budget: BudgetEntry;
}

/**
 * Itens do cronograma que podem ser vinculados: só os que ainda existem no
 * orçamento do planejamento. `itemSchedules` guarda linhas órfãs de versões
 * anteriores do orçamento (Divino Espírito Santo: 132 no cronograma, 37 no
 * orçamento) — sem nome, viravam dezenas de "Item sem nome". Mesmo critério de
 * OperacionalForm.
 */
export function itensCronogramaVinculaveis(
    schedule: ProjectSchedule | null | undefined,
    budget: BudgetEntry[],
): ItemVinculavel[] {
    const porId = new Map(budget.map(b => [b.id, b]));
    return (schedule?.itemSchedules || [])
        .map(is => ({ schedule: is, budget: porId.get(is.id) }))
        .filter((x): x is ItemVinculavel => !!x.budget && !!x.budget.sinapiItem?.description);
}

/**
 * Vincula (ou desvincula, com `vinculo` ausente) a atividade a um item. Ao
 * vincular, a descrição e a quantidade vêm do orçamento e a evolução parte do
 * que o cronograma já registra.
 */
export function vincularAtividade(a: DiaryActivity, vinculo: ItemVinculavel | undefined): DiaryActivity {
    if (!vinculo) return { ...a, itemId: '' };
    const plannedQty = vinculo.budget.quantity || 0;
    const evolution = vinculo.schedule.manualRealPct || 0;
    return {
        ...a,
        itemId: vinculo.schedule.id,
        description: vinculo.budget.sinapiItem?.description || a.description,
        plannedQty,
        evolution,
        realizedQty: (evolution / 100) * plannedQty,
        status: evolution === 100 ? 'Finalizada' : 'Em Andamento',
    };
}

/** Alguma atividade da lista empurra evolução para o cronograma? */
export function temAtividadeVinculada(activities: DiaryActivity[] | undefined): boolean {
    return (activities || []).some(a => !!a.itemId && !isUnplannedActivity(a));
}

/**
 * Evolução de cada item = a MAIOR entre todos os registros não recusados — um
 * registro antigo com evolução menor não pode puxar o cronograma para trás.
 * Devolve o cronograma novo e se algo mudou.
 */
export function aplicarEvolucaoNoCronograma(
    schedule: ProjectSchedule,
    entries: DiaryEntry[],
): { schedule: ProjectSchedule; mudou: boolean } {
    const maxPorItem = new Map<string, number>();
    entries.forEach(entry => {
        if (entry.status === 'Recusado') return;
        entry.activities?.forEach(act => {
            if (act.itemId && !isUnplannedActivity(act)) {
                maxPorItem.set(act.itemId, Math.max(maxPorItem.get(act.itemId) || 0, act.evolution || 0));
            }
        });
    });

    const itemSchedules = [...(schedule.itemSchedules || [])];
    let mudou = false;
    maxPorItem.forEach((max, itemId) => {
        const idx = itemSchedules.findIndex(is => is.id === itemId);
        if (idx >= 0) {
            if (itemSchedules[idx].manualRealPct !== max) {
                itemSchedules[idx] = { ...itemSchedules[idx], manualRealPct: max };
                mudou = true;
            }
        } else {
            // Item que não existe no cronograma: entra (fallback de segurança, comportamento histórico)
            itemSchedules.push({ id: itemId, manualRealPct: max });
            mudou = true;
        }
    });

    return { schedule: mudou ? { ...schedule, itemSchedules } : schedule, mudou };
}
