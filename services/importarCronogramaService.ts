/**
 * Criar um planejamento a partir de um cronograma importado (MS Project XML / modelo Excel) —
 * fase 2c de docs/planos/2026-11-14-planejamento-lista-critica.md.
 *
 * Grava igual ao "Novo planejamento" (hooks/useProjectOperations.ts → handleUpsertProject):
 * classification PLANEJAMENTO, vínculo com o ORÇAMENTO base (é assim que os planejamentos
 * existentes ligam — o painel de versões do orçamento depende disso) e organização HERDADA dele
 * (REGRA #5: com a cascata, não se pergunta organização; o banco trava org diferente do pai —
 * trg_org_cascade_project). Diferença: já nasce com o orçamento congelado (basedOnBudgetSnapshot
 * + budget, o mesmo que o primeiro "abrir" faria) e com o cronograma montado e a linha de base ativa.
 */
import { projectService } from './projectService';
import { INITIAL_PROJECT_SETTINGS } from '../constants';
import type { BudgetEntry, BudgetVersion } from '../types';
import type { CronogramaImportado } from '../utils/cronogramaLeitura';
import { montarCronogramaImportado, type DecisaoDaTarefa, type CronogramaMontado } from '../utils/cronogramaMontagem';
import { genId } from '../utils/scheduleOutline';

export interface OrcamentoBase {
    budget: BudgetEntry[];
    versao: { id: string; item: number } | null;
    bdi: number;
}

/** O orçamento que o planejamento congela: a versão ativa (ou a última), senão o orçamento atual. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orcamentoBaseDoProjeto(projeto: { budget?: BudgetEntry[] | null; settings?: any }): OrcamentoBase {
    const versoes: BudgetVersion[] = projeto.settings?.versions ?? [];
    const ativa = versoes.find(v => v.id === projeto.settings?.activeVersionId) ?? versoes[versoes.length - 1];
    const bdi = Number(projeto.settings?.bdi ?? INITIAL_PROJECT_SETTINGS.bdi ?? 0);
    if (ativa?.budget?.length) return { budget: ativa.budget, versao: { id: ativa.id, item: ativa.item }, bdi };
    return { budget: projeto.budget ?? [], versao: null, bdi };
}

export interface CriarPlanejamentoEntrada {
    orcamentoId: string;
    nome: string;
    cronograma: CronogramaImportado;
    decisoes: Map<string, DecisaoDaTarefa>;
    nomeDoArquivo: string;
}

export async function criarPlanejamentoDoCronograma(e: CriarPlanejamentoEntrada): Promise<{ id: string; montado: CronogramaMontado }> {
    const orcamento = await projectService.loadProject(e.orcamentoId);
    if (!orcamento) throw new Error('O orçamento base não foi encontrado (pode ter sido excluído). Escolha outro.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = orcamento as any;
    const base = orcamentoBaseDoProjeto(o);
    if (base.budget.length === 0) throw new Error('O orçamento base está vazio — não há itens para casar com o cronograma.');

    const montado = montarCronogramaImportado({
        cronograma: e.cronograma, decisoes: e.decisoes, orcamento: base.budget, bdi: base.bdi,
        nomeDoArquivo: e.nomeDoArquivo, agora: new Date().toISOString(), gerarId: genId,
    });

    const organizationId = o.organization_id || o.settings?.organizationId || undefined;
    const empresaId = o.empresa_id || o.settings?.empresaId || undefined;
    const settings = {
        ...INITIAL_PROJECT_SETTINGS,
        name: e.nome.trim(),
        classification: 'PLANEJAMENTO' as const,
        organizationId,
        ...(empresaId ? { empresaId } : {}),
        linkedProjectId: o.id,
        linkedProjectName: o.name,
        basedOnBudgetSnapshot: base.budget,
        ...(base.versao ? { basedOnBudgetVersionId: base.versao.id, basedOnBudgetVersionItem: base.versao.item } : {}),
        schedule: montado.schedule,
    };
    const criado = await projectService.saveProject({
        name: e.nome.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings: settings as any,
        budget: base.budget,
    });
    return { id: (criado as { id: string }).id, montado };
}
