/**
 * Carregar um projeto para a tela: settings + o orçamento EFETIVO (resolvido) — UM caminho só.
 *
 * Por que existe (publicação 3 de docs/planos/2026-11-15-planejamento-lista-critica-2.md): havia
 * dois carregamentos que disparam juntos ao trocar o projeto ativo —
 *  - `useProjectOperations.handleLoadProject` resolvia o orçamento (`resolveProjectBudget`: snapshot
 *    congelado → budget próprio → vínculo com o orçamento, versão fixada/ativa ou ao vivo);
 *  - a reidratação de `hooks/usePersistenceSync.ts` punha nos itens a coluna `budget` CRUA.
 * Num planejamento com budget vazio e vínculo "ao vivo", quem chegava por último decidia: abria
 * VAZIO (teste com gravação do "Novo planejamento", 15/11/2026). Com os dois passando por aqui,
 * os dois chegam ao mesmo orçamento e a ordem deixa de importar.
 */
import { projectService } from './projectService';
import { resolveProjectBudget, type ResolveOptions } from './budgetResolver';
import { INITIAL_PROJECT_SETTINGS } from '../constants';
import type { BudgetEntry, ProjectSettings } from '../types';

export interface ProjetoCarregado {
    /** Linha crua do banco (colunas + settings + budget). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectData: any;
    /** O que o BANCO tem — registre como persistido ANTES do congelamento, para o salvamento
     *  automático gravar só o que mudou (e gravar o congelamento, que precisa ir para o banco). */
    settingsDoBanco: ProjectSettings;
    budgetDoBanco: BudgetEntry[];
    /** O que a tela usa: settings já com a versão congelada (se congelou agora) e o orçamento efetivo. */
    settings: ProjectSettings;
    budget: BudgetEntry[];
}

export async function carregarProjeto(id: string, options: ResolveOptions = {}): Promise<ProjetoCarregado | null> {
    const projectData = await projectService.loadProject(id);
    if (!projectData) return null;
    const settingsDoBanco = {
        ...INITIAL_PROJECT_SETTINGS,
        ...projectData.settings,
        ...(projectData.code ? { code: projectData.code } : {}),
    } as ProjectSettings;
    // Versionamento orçamento × planejamento: o planejamento é FIXADO a uma versão do orçamento
    // (basedOnBudgetVersionId) e sempre carrega aquela versão congelada — não drifta.
    const resolved = await resolveProjectBudget({ ...projectData, settings: settingsDoBanco }, options);
    const settings = { ...settingsDoBanco };
    if (resolved.snapshotToPersist) {
        // A resolução congelou a versão agora (primeira abertura ou migração).
        settings.basedOnBudgetSnapshot = resolved.snapshotToPersist;
        if (resolved.versionId) settings.basedOnBudgetVersionId = resolved.versionId;
        if (resolved.versionItem !== undefined) settings.basedOnBudgetVersionItem = resolved.versionItem;
    }
    return { projectData, settingsDoBanco, budgetDoBanco: projectData.budget || [], settings, budget: resolved.budget };
}
