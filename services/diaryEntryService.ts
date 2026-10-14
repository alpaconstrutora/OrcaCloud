import { supabase } from '../lib/supabase';
import type { DiaryEntry } from '../types';
import type { ProjectSchedule } from '../types/project';
import { projectService } from './projectService';
import { aplicarEvolucaoNoCronograma } from '../utils/diaryPlanningLink';

/**
 * Registros do Diário de Obras — gravação UM POR VEZ.
 *
 * Os registros continuam em `projects.settings.diaryEntries` (JSONB), mas não se
 * grava mais a lista inteira pelo `projectService.saveProject`: quem salvava por
 * último apagava o registro do outro (prévia mobile × desktop, campo ×
 * escritório, auto-save). As RPCs travam a linha e trocam só o registro do `id`
 * (`aplicar_20271014500000_diario_gravacao_por_registro.sql`), e um gatilho no
 * banco faz o save do projeto inteiro deixar `diaryEntries` como está.
 *
 * As duas devolvem a lista JÁ GRAVADA (inclui o que outra pessoa lançou) e a
 * versão anterior do registro segundo o banco — é contra ela que se calcula a
 * mídia órfã, não contra a cópia da tela.
 */

export interface DiaryWriteResult {
    entries: DiaryEntry[];
    anterior: DiaryEntry | null;
}

function toResult(data: unknown): DiaryWriteResult {
    const d = (data || {}) as { entries?: DiaryEntry[] | null; anterior?: DiaryEntry | null };
    return { entries: d.entries || [], anterior: d.anterior || null };
}

export async function salvarRegistroDiario(projectId: string, entry: DiaryEntry): Promise<DiaryWriteResult> {
    const { data, error } = await supabase.rpc('diary_upsert_entry', {
        p_project_id: projectId,
        p_entry: entry as unknown as Record<string, unknown>,
    });
    if (error) throw error;
    return toResult(data);
}

export async function excluirRegistroDiario(projectId: string, entryId: string): Promise<DiaryWriteResult> {
    const { data, error } = await supabase.rpc('diary_delete_entry', {
        p_project_id: projectId,
        p_entry_id: entryId,
    });
    if (error) throw error;
    return toResult(data);
}

/** Lista atual do banco — para a tela que ficou com cópia velha (ex.: ao fechar a prévia mobile). */
export async function carregarRegistrosDiario(projectId: string): Promise<DiaryEntry[]> {
    const { data, error } = await supabase
        .from('projects')
        .select('diary:settings->diaryEntries')
        .eq('id', projectId)
        .maybeSingle();
    if (error) throw error;
    return ((data as { diary?: DiaryEntry[] | null } | null)?.diary) || [];
}

/**
 * Empurra a evolução das atividades vinculadas para o cronograma do Planejamento
 * (`manualRealPct`, a maior entre os registros não recusados). Relê o
 * planejamento na hora — não usa cópia da tela. Devolve o cronograma gravado, ou
 * `null` se nada mudou.
 */
export async function sincronizarEvolucaoNoPlanejamento(planejamentoId: string, entries: DiaryEntry[]): Promise<ProjectSchedule | null> {
    const planejamento = await projectService.loadProject(planejamentoId);
    if (!planejamento?.settings?.schedule) return null;
    const { schedule, mudou } = aplicarEvolucaoNoCronograma(planejamento.settings.schedule, entries);
    if (!mudou) return null;
    await projectService.saveProject({
        ...planejamento,
        settings: { ...planejamento.settings, schedule },
    });
    return schedule;
}
