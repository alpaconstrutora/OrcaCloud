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

// ── Novo planejamento: as outras duas origens do painel único (2ª crítica, publicação 2 de
// docs/planos/2026-11-15-planejamento-lista-critica-2.md) ─────────────────────────────────

/**
 * O que um planejamento novo herda do orçamento base — o MESMO que o modal antigo copiava ao
 * clicar "Vincular" (ProjectModal: cliente, endereço, padrão, BDI, datas…), para o planejamento
 * em branco sair igual ao que saía de lá. Organização e empresa vêm dele (REGRA #5: cascata).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function herdadoDoOrcamento(o: { id: string; name: string; organization_id?: string | null; empresa_id?: string | null; settings?: any }) {
    const s = o.settings ?? {};
    const organizationId = o.organization_id || s.organizationId || undefined;
    const empresaId = o.empresa_id || s.empresaId || undefined;
    return {
        organizationId,
        ...(empresaId ? { empresaId } : {}),
        client: s.client || '',
        clientId: s.clientId,
        location: s.location || 'SP',
        standard: s.standard || 'R8-N',
        area: s.area || 100,
        street: s.street || '',
        number: s.number || '',
        complement: s.complement || '',
        neighborhood: s.neighborhood || '',
        city: s.city || '',
        state: s.state || 'SP',
        zipCode: s.zipCode || '',
        database: s.database || 'SINAPI',
        referenceMonth: s.referenceMonth || '01/2025',
        socialChargesMode: s.socialChargesMode || 'Com Desoneração',
        bdi: s.bdi || 25.0,
        budgetType: s.budgetType || 'ANALYTIC',
        linkedProjectId: o.id,
        linkedProjectName: o.name,
    };
}

export interface CriarEmBrancoEntrada {
    orcamentoId: string;
    nome: string;
    /** 'AAAA-MM-DD' ou '' (o cronograma pede ao abrir). */
    inicio: string;
    termino: string;
}

/** Planejamento em branco a partir de um orçamento: o que o modal antigo herdava + o orçamento JÁ
 *  CONGELADO (snapshot, versão fixada e budget), como a importação faz. Gravar com budget vazio, como
 *  o modal fazia, abria VAZIO logo após criar (teste com gravação, 15/11/2026): a reidratação de
 *  hooks/usePersistenceSync.ts põe nos itens a coluna `budget` crua, sem resolver o vínculo, e corre
 *  contra o handleLoadProject. O cronograma é montado pelo app ao abrir. Código: o serviço gera. */
export async function criarPlanejamentoEmBranco(e: CriarEmBrancoEntrada): Promise<{ id: string }> {
    const orcamento = await projectService.loadProject(e.orcamentoId);
    if (!orcamento) throw new Error('O orçamento base não foi encontrado (pode ter sido excluído). Escolha outro.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = orcamento as any;
    const herdado = herdadoDoOrcamento(o);
    const base = orcamentoBaseDoProjeto(o);
    if (base.budget.length === 0) throw new Error('O orçamento base está vazio — não há itens para o cronograma. Escolha outro.');
    const settings = {
        ...INITIAL_PROJECT_SETTINGS,
        ...herdado,
        name: e.nome.trim(),
        classification: 'PLANEJAMENTO' as const,
        basedOnBudgetSnapshot: base.budget,
        ...(base.versao ? { basedOnBudgetVersionId: base.versao.id, basedOnBudgetVersionItem: base.versao.item } : {}),
        startDate: e.inicio || o.settings?.startDate || undefined,
        endDate: e.termino || o.settings?.endDate || undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criado = await projectService.saveProject({ name: e.nome.trim(), settings: settings as any, budget: base.budget });
    return { id: (criado as { id: string }).id };
}

/** Configurações da cópia: tudo do original, com o nome novo e SEM o código — o serviço gera o
 *  próximo da organização. O "Duplicar" antigo copiava o código e deixava dois "001". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function settingsDaCopia(original: any, nome: string) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { code: _codigo, ...resto } = original ?? {};
    return { ...resto, name: nome.trim() };
}

export async function duplicarPlanejamento(e: { planejamentoId: string; nome: string }): Promise<{ id: string }> {
    const original = await projectService.loadProject(e.planejamentoId);
    if (!original) throw new Error('O planejamento a copiar não foi encontrado (pode ter sido excluído).');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = original as any;
    // A empresa vai na COLUNA: é dela que o gatilho sync_org_from_empresa tira o organization_id.
    // O Divino tem empresa só na coluna; copiar só as settings deixava a cópia SEM organização
    // (teste com gravação, 15/11/2026 — o "Duplicar" antigo fazia o mesmo).
    const empresaId = o.empresa_id || o.settings?.empresaId || undefined;
    const criado = await projectService.saveProject({
        name: e.nome.trim(),
        settings: { ...settingsDaCopia(o.settings, e.nome), ...(empresaId ? { empresaId } : {}) },
        budget: o.budget || [],
        ...(empresaId ? { empresa_id: empresaId } : {}),
    });
    return { id: (criado as { id: string }).id };
}
