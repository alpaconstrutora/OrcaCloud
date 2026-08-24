import { supabase } from '../lib/supabase';
import { Empreendimento } from '../types';
import { findChildProject } from './budgetResolver';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { costCenterService } from './costCenterService';
import { isSystemProject } from '../utils/systemProjects';

/**
 * Vínculos de um Empreendimento — o que alimenta a aba "Vinculações".
 *
 * Os vínculos vivem espalhados e em direções diferentes:
 *   - Obra:          `empreendimentos.project_id` (principal) e `empreendimento_towers.project_id`
 *   - Orçamento/Plan: pendurados na OBRA por `projects.settings.linkedProjectId` (filho → pai)
 *   - Áreas NBR:     `area_projects.empreendimento_id`
 *   - Planta IA:     `empreendimentos.planta_ai_study_id`
 *   - Viabilidade:   `empreendimentos.imovib_study_id`
 *   - Centro custo:  `cost_centers_v2.empreendimento_id` (1:1, índice único parcial
 *                    `uidx_cost_center_por_empreendimento` — 20270905000024)
 *   - Contrato:      por DUAS vias — a obra (`contracts.project_id`) e, desde
 *                    20270905000028, o vínculo direto `contracts.empreendimento_id`,
 *                    que é o único caminho para contrato SEM obra (despesa administrativa)
 *   - Financeiro:    NÃO se liga ao empreendimento — chega pela obra (`project_id`)
 *
 * ⚠️ Nenhuma das colunas de obra/estudo tem FOREIGN KEY (DDL deadlocka neste módulo —
 * ver 20270719000000). O id apontado pode não existir mais: quando isso acontece o
 * vínculo vem com `missing: true` e a UI oferece só "Desvincular".
 */

export type EmpreendimentoLinkKind =
    | 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'AREAS_NBR'
    | 'PLANTA_IA' | 'ESTUDO_VIABILIDADE' | 'CONTRATO' | 'FINANCEIRO'
    | 'CENTRO_CUSTO';

export interface EmpreendimentoLink {
    kind: EmpreendimentoLinkKind;
    id: string;
    label: string;
    sublabel?: string;
    /** Torre de origem do vínculo, quando a obra é por torre. */
    towerId?: string | null;
    towerName?: string | null;
    /** Obra sob a qual este vínculo vive (orçamento, contrato, lançamento). */
    parentObraId?: string | null;
    /** Vínculo apontando para registro inexistente — coluna sem FK. */
    missing?: boolean;
    meta?: Record<string, unknown>;
}

export interface EmpreendimentoFinanceSummary {
    /** Amostra das últimas movimentações, para a lista. */
    rows: EmpreendimentoLink[];
    totalCredit: number;
    totalDebit: number;
    /** Lançamentos ainda não liquidados. */
    open: number;
}

export interface EmpreendimentoLinksSnapshot {
    obras: EmpreendimentoLink[];
    orcamentos: EmpreendimentoLink[];
    planejamentos: EmpreendimentoLink[];
    areas: EmpreendimentoLink[];
    plantaIA: EmpreendimentoLink[];
    viabilidade: EmpreendimentoLink[];
    contratos: EmpreendimentoLink[];
    /** 0 ou 1 — o vínculo é 1:1 no banco. Lista por simetria com as demais seções. */
    centrosCusto: EmpreendimentoLink[];
    financeiro: EmpreendimentoFinanceSummary;
    /** Total de vínculos quebrados em todas as seções — vira KPI de atenção. */
    orphanCount: number;
}

/** Contexto mínimo que toda operação de vínculo precisa para registrar o histórico. */
export interface LinkContext {
    empreendimentoId: string;
    organizationId?: string | null;
}

const EMPTY_FINANCE: EmpreendimentoFinanceSummary = { rows: [], totalCredit: 0, totalDebit: 0, open: 0 };

const CLASSIFICATION_LABEL: Record<string, string> = {
    ORCAMENTO: 'Orçamento',
    PLANEJAMENTO: 'Planejamento',
};

interface ProjectRow {
    id: string;
    name: string;
    settings: {
        classification?: string;
        organizationId?: string;
        budgetType?: string;
        /** Lido por isSystemProject — projeto de sistema nunca é obra (CLAUDE.md #2). */
        isSystemProject?: boolean;
        name?: string | null;
    } | null;
}

/**
 * Traduz os dois erros que o usuário realmente encontra ao mexer no vínculo de
 * centro de custo: o índice único 1:1 e o UNIQUE de código. A mensagem crua do
 * Postgres cita o nome do índice e não diz o que fazer.
 */
function mapCostCenterError(err: { message?: string } | null, prefixo: string): string {
    const msg = err?.message || '';
    if (msg.includes('uidx_cost_center_por_empreendimento')) {
        return 'Este empreendimento já tem um centro de custo vinculado. Desvincule o atual antes de apontar outro.';
    }
    if (msg.includes('cost_centers_v2') && msg.includes('code')) {
        return 'Já existe um centro de custo com este código nesta organização.';
    }
    return `${prefixo}: ${msg || 'erro desconhecido'}`;
}

/** Busca projetos por id, tolerando ids órfãos (nenhuma coluna de origem tem FK). */
async function fetchProjects(ids: string[]): Promise<Map<string, ProjectRow>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const { data, error } = await supabase
        .from('projects')
        .select('id, name, settings')
        .in('id', unique);
    if (error) throw new Error(`Falha ao carregar obras vinculadas: ${error.message}`);
    return new Map(((data || []) as ProjectRow[]).map(p => [p.id, p]));
}

export const empreendimentoLinksService = {
    /**
     * Tudo que está vinculado ao empreendimento, resolvido em paralelo.
     * `organizationId` ausente ("Todas as organizações") nunca bloqueia a leitura —
     * cai para a org da própria entidade (CLAUDE.md regra #5).
     */
    async getSnapshot(
        emp: Empreendimento,
        organizationId?: string | null,
    ): Promise<EmpreendimentoLinksSnapshot> {
        const orgId = organizationId || emp.organization_id || null;

        const towers = await empreendimentoService.listTowers(emp.id);

        // Obra principal + obras por torre. A principal tem precedência: uma obra
        // aparece uma única vez (mesma regra de mapObrasToEmpreendimentos).
        const towerLinks = towers
            .filter(t => t.project_id)
            .map(t => ({ projectId: t.project_id as string, towerId: t.id, towerName: t.name }));
        const obraIdsRaw = [
            ...(emp.project_id ? [emp.project_id] : []),
            ...towerLinks.map(t => t.projectId),
        ];
        const projectsById = await fetchProjects(obraIdsRaw);

        const obras: EmpreendimentoLink[] = [];
        const seen = new Set<string>();
        const pushObra = (projectId: string, towerId: string | null, towerName: string | null) => {
            if (seen.has(projectId)) return;
            seen.add(projectId);
            const row = projectsById.get(projectId);
            obras.push({
                kind: 'OBRA',
                id: projectId,
                label: row?.name ?? 'Obra não encontrada',
                sublabel: towerName ? `Torre ${towerName}` : 'Obra principal',
                towerId,
                towerName,
                missing: !row,
            });
        };
        if (emp.project_id) pushObra(emp.project_id, null, null);
        for (const t of towerLinks) pushObra(t.projectId, t.towerId, t.towerName);

        // Obras existentes e reais — projeto de sistema nunca conta como obra
        // (CLAUDE.md regra #2); se aparecer aqui é vínculo indevido, tratado como órfão.
        const validObras = obras.filter(o => {
            if (o.missing) return false;
            const row = projectsById.get(o.id);
            return !isSystemProject(row ? { name: row.name, settings: row.settings } : null);
        });
        const obraIds = validObras.map(o => o.id);

        const [children, areaProject, contratos, financeiro, centrosCusto] = await Promise.all([
            this.loadBudgetsAndPlans(validObras),
            this.loadAreaProject(emp.id, orgId),
            this.loadContracts(obraIds, validObras, emp.id),
            this.loadFinance(obraIds, validObras),
            this.loadCostCenters(emp.id),
        ]);

        const plantaIA: EmpreendimentoLink[] = emp.planta_ai_study_id
            ? [await this.loadPlantaStudy(emp.planta_ai_study_id, towers.length)]
            : [];
        const viabilidade: EmpreendimentoLink[] = emp.imovib_study_id
            ? [await this.loadImovibStudy(emp.imovib_study_id)]
            : [];

        const all = [
            ...obras, ...children.orcamentos, ...children.planejamentos,
            ...areaProject, ...plantaIA, ...viabilidade,
        ];

        return {
            obras,
            orcamentos: children.orcamentos,
            planejamentos: children.planejamentos,
            areas: areaProject,
            plantaIA,
            viabilidade,
            contratos,
            centrosCusto,
            financeiro,
            orphanCount: all.filter(l => l.missing).length,
        };
    },

    /** Orçamento e planejamento pendurados em cada obra (`settings.linkedProjectId`). */
    async loadBudgetsAndPlans(obras: EmpreendimentoLink[]): Promise<{
        orcamentos: EmpreendimentoLink[];
        planejamentos: EmpreendimentoLink[];
    }> {
        const orcamentos: EmpreendimentoLink[] = [];
        const planejamentos: EmpreendimentoLink[] = [];

        await Promise.all(obras.map(async obra => {
            const [orc, plan] = await Promise.all([
                findChildProject(obra.id, 'ORCAMENTO').catch(() => null),
                findChildProject(obra.id, 'PLANEJAMENTO').catch(() => null),
            ]);
            const toLink = (
                child: { id: string; settings?: { name?: string; budgetType?: string } | null } | null,
                kind: 'ORCAMENTO' | 'PLANEJAMENTO',
            ): EmpreendimentoLink | null => child ? {
                kind,
                id: child.id,
                label: child.settings?.name || CLASSIFICATION_LABEL[kind],
                sublabel: obra.label,
                parentObraId: obra.id,
                towerName: obra.towerName,
                meta: { budgetType: child.settings?.budgetType },
            } : null;

            const o = toLink(orc as any, 'ORCAMENTO');
            if (o) orcamentos.push(o);
            const p = toLink(plan as any, 'PLANEJAMENTO');
            if (p) planejamentos.push(p);
        }));

        return { orcamentos, planejamentos };
    },

    /** Projeto do motor de Áreas NBR 12721 (`area_projects.empreendimento_id`). */
    async loadAreaProject(empreendimentoId: string, organizationId: string | null): Promise<EmpreendimentoLink[]> {
        try {
            // Org ausente ("Todas as organizações") NÃO bloqueia a leitura: o filtro
            // só é aplicado quando existe, e a RLS recorta pelas orgs do usuário
            // (CLAUDE.md regra #5). `getProjectByEmpreendimento` exige org, por isso
            // a query é feita aqui em vez de reusá-lo.
            let query = supabase
                .from('area_projects')
                .select('id, name, status')
                .eq('empreendimento_id', empreendimentoId);
            if (organizationId) query = query.eq('organization_id', organizationId);

            const { data } = await query
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (!data) return [];
            return [{
                kind: 'AREAS_NBR',
                id: (data as any).id,
                label: (data as any).name || 'Quadros NBR 12721',
                sublabel: (data as any).status ? `Situação: ${(data as any).status}` : undefined,
            }];
        } catch {
            return []; // motor de áreas indisponível não pode derrubar a aba
        }
    },

    async loadPlantaStudy(studyId: string, towerCount: number): Promise<EmpreendimentoLink> {
        try {
            const { data } = await supabase
                .from('plant_studies')
                .select('id, name')
                .eq('id', studyId)
                .maybeSingle();
            return {
                kind: 'PLANTA_IA',
                id: studyId,
                label: (data as any)?.name || 'Estudo da Planta IA',
                sublabel: `${towerCount} torre(s) materializada(s)`,
                missing: !data,
            };
        } catch {
            return { kind: 'PLANTA_IA', id: studyId, label: 'Estudo da Planta IA', missing: true };
        }
    },

    async loadImovibStudy(studyId: string): Promise<EmpreendimentoLink> {
        try {
            const { data } = await supabase
                .from('imovib_studies')
                .select('id, name')
                .eq('id', studyId)
                .maybeSingle();
            return {
                kind: 'ESTUDO_VIABILIDADE',
                id: studyId,
                label: (data as any)?.name || 'Estudo de Viabilidade',
                sublabel: 'Imovib — sincronização viva',
                missing: !data,
            };
        } catch {
            return { kind: 'ESTUDO_VIABILIDADE', id: studyId, label: 'Estudo de Viabilidade', missing: true };
        }
    },

    /**
     * Contratos do empreendimento, por DUAS vias que podem se sobrepor:
     *   - pela obra   — `contracts.project_id` ∈ obras do empreendimento (via histórica);
     *   - direta      — `contracts.empreendimento_id` (contrato sem obra também entra).
     *
     * As duas viram uma lista só, deduplicada por id. Query com `.in()` porque o
     * `contractService.listContracts` só aceita um `projectId` por chamada.
     * Sem filtro de organização: a RLS de `contracts` já recorta.
     */
    async loadContracts(obraIds: string[], obras: EmpreendimentoLink[], empreendimentoId?: string): Promise<EmpreendimentoLink[]> {
        const cols = 'id, number, title, status, domain, direction, current_value, original_value, project_id, empreendimento_id';
        try {
            const [porObra, direto] = await Promise.all([
                obraIds.length
                    ? supabase.from('contracts').select(cols).in('project_id', obraIds).order('created_at', { ascending: false })
                    : Promise.resolve({ data: [] as any[] }),
                empreendimentoId
                    ? supabase.from('contracts').select(cols).eq('empreendimento_id', empreendimentoId).order('created_at', { ascending: false })
                    : Promise.resolve({ data: [] as any[] }),
            ]);

            const obraName = new Map(obras.map(o => [o.id, o.label]));
            const byId = new Map<string, any>();
            for (const c of [...((porObra.data || []) as any[]), ...((direto.data || []) as any[])]) {
                if (!byId.has(c.id)) byId.set(c.id, c);
            }

            return [...byId.values()].map(c => ({
                kind: 'CONTRATO' as const,
                id: c.id,
                label: c.title || c.number || 'Contrato',
                sublabel: [c.number, obraName.get(c.project_id) ?? (c.project_id ? undefined : 'Sem obra')].filter(Boolean).join(' · '),
                parentObraId: c.project_id ?? null,
                meta: {
                    status: c.status,
                    domain: c.domain,
                    direction: c.direction,
                    valor: c.current_value ?? c.original_value ?? 0,
                },
            }));
        } catch {
            return [];
        }
    },

    /**
     * Lançamentos financeiros das obras (`internal_transactions.project_id`).
     * Fonte única: é onde Contas a Pagar/Receber lê. O espelho legado
     * `projects.settings.financialInfo` NÃO é considerado aqui.
     */
    async loadFinance(obraIds: string[], obras: EmpreendimentoLink[]): Promise<EmpreendimentoFinanceSummary> {
        if (!obraIds.length) return EMPTY_FINANCE;
        try {
            const { data } = await supabase
                .from('internal_transactions')
                .select('id, description, amount, direction, due_date, business_status, project_id')
                .in('project_id', obraIds)
                .order('due_date', { ascending: false })
                .limit(200);
            const rowsRaw = (data || []) as any[];
            const obraName = new Map(obras.map(o => [o.id, o.label]));

            let totalCredit = 0;
            let totalDebit = 0;
            let open = 0;
            for (const t of rowsRaw) {
                const amount = Number(t.amount) || 0;
                if (t.direction === 'CREDIT') totalCredit += amount; else totalDebit += amount;
                if (t.business_status && t.business_status !== 'REALIZADO') open++;
            }

            return {
                // Só as mais recentes vão para a lista — o agregado já conta a história.
                rows: rowsRaw.slice(0, 10).map(t => ({
                    kind: 'FINANCEIRO' as const,
                    id: t.id,
                    label: t.description || 'Lançamento',
                    sublabel: [obraName.get(t.project_id), t.due_date].filter(Boolean).join(' · '),
                    parentObraId: t.project_id,
                    meta: {
                        valor: Number(t.amount) || 0,
                        direction: t.direction,
                        businessStatus: t.business_status,
                    },
                })),
                totalCredit,
                totalDebit,
                open,
            };
        } catch {
            return EMPTY_FINANCE;
        }
    },

    /**
     * Centro de custo ancorado no empreendimento (`cost_centers_v2.empreendimento_id`).
     * O índice único parcial garante 0 ou 1 — a lista existe só por simetria com as
     * outras seções da aba. O grupo (`parent_id`) vira sublabel: é ele que diz onde a
     * despesa cai na árvore de 2 níveis.
     */
    async loadCostCenters(empreendimentoId: string): Promise<EmpreendimentoLink[]> {
        try {
            const { data } = await supabase
                .from('cost_centers_v2')
                .select('id, code, name, parent_id, organization_id')
                .eq('empreendimento_id', empreendimentoId)
                .order('code', { ascending: true });
            const rows = (data || []) as any[];
            if (!rows.length) return [];

            const paisIds = [...new Set(rows.map(r => r.parent_id).filter(Boolean))] as string[];
            const nomePai = new Map<string, string>();
            if (paisIds.length) {
                const { data: pais } = await supabase
                    .from('cost_centers_v2').select('id, name').in('id', paisIds);
                for (const p of (pais || []) as any[]) nomePai.set(p.id, p.name);
            }

            return rows.map(r => ({
                kind: 'CENTRO_CUSTO' as const,
                id: r.id,
                label: `${r.code} · ${r.name}`,
                sublabel: r.parent_id
                    ? (nomePai.get(r.parent_id) || 'Grupo')
                    // Sem pai a própria linha É um grupo: grupo não recebe lançamento,
                    // então o vínculo existe mas não segrega caixa nenhum.
                    : 'Grupo de primeiro nível — não recebe lançamento',
                meta: { organizationId: r.organization_id, isGroup: !r.parent_id },
            }));
        } catch {
            return []; // centro de custo indisponível não pode derrubar a aba
        }
    },

    /**
     * Centros de custo que ainda não são de nenhum empreendimento — candidatos ao
     * vínculo. Só FILHOS (`parent_id` preenchido): grupo é família de despesa, não
     * unidade de caixa (mesmo critério de `condominioRateioService.listarDisponiveis`).
     * Org ausente ("Todas") não bloqueia — a RLS recorta (CLAUDE.md regra #5).
     */
    async listLinkableCostCenters(
        organizationId?: string | null,
    ): Promise<{ id: string; code: string; name: string; grupo: string | null; organizationId: string | null }[]> {
        let query = supabase
            .from('cost_centers_v2')
            .select('id, code, name, parent_id, organization_id')
            .is('empreendimento_id', null)
            .not('parent_id', 'is', null);
        if (organizationId) query = query.eq('organization_id', organizationId);

        const { data, error } = await query.order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os centros de custo: ${error.message}`);

        const linhas = (data || []) as any[];
        const paisIds = [...new Set(linhas.map(l => l.parent_id).filter(Boolean))] as string[];
        const nomePai = new Map<string, string>();
        if (paisIds.length) {
            const { data: pais } = await supabase
                .from('cost_centers_v2').select('id, name').in('id', paisIds);
            for (const p of (pais || []) as any[]) nomePai.set(p.id, p.name);
        }
        return linhas.map(l => ({
            id: l.id,
            code: l.code,
            name: l.name,
            grupo: nomePai.get(l.parent_id) || null,
            organizationId: l.organization_id ?? null,
        }));
    },

    /** Grupos (nível 1) da organização — destino possível de um centro de custo novo. */
    async listCostCenterGroups(
        organizationId: string,
    ): Promise<{ id: string; code: string; name: string }[]> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name')
            .eq('organization_id', organizationId)
            .is('parent_id', null)
            .order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os grupos: ${error.message}`);
        return (data || []) as any[];
    },

    /**
     * Grupo "Empreendimentos", criado sob demanda — é o pai padrão quando o usuário
     * não escolhe um. Sem pai, o centro de custo nasceria no primeiro nível, lado a
     * lado com Obra/Administrativo/Comercial, que são famílias de despesa.
     * Tolera acentuação/plural do cadastro manual antes de criar (mesmo cuidado de
     * `condominioRateioService.garantirGrupoCondominios`).
     */
    async garantirGrupoEmpreendimentos(organizationId: string): Promise<string> {
        for (const padrao of ['empreendimento%', 'incorpora%']) {
            const { data } = await supabase
                .from('cost_centers_v2')
                .select('id')
                .eq('organization_id', organizationId)
                .is('parent_id', null)
                .ilike('name', padrao)
                .limit(1)
                .maybeSingle();
            if (data) return (data as any).id;
        }

        const grupo = await costCenterService.create({
            organization_id: organizationId,
            name: 'Empreendimentos',
            description: 'Grupo dos centros de custo de empreendimentos.',
        });
        return grupo.id;
    },

    /**
     * Cria um centro de custo JÁ vinculado ao empreendimento (um único insert — não
     * cria solto para vincular depois, que deixaria lixo se o segundo passo falhasse).
     * O código sai do RPC `get_next_cost_center_v2_code` via `costCenterService`.
     */
    async createCostCenter(params: {
        empreendimentoId: string;
        organizationId: string;
        name: string;
        /** Grupo pai. Omitido, cai no grupo "Empreendimentos" criado sob demanda. */
        parentId?: string | null;
        description?: string | null;
    }): Promise<{ id: string; code: string; name: string }> {
        const parentId = params.parentId || await this.garantirGrupoEmpreendimentos(params.organizationId);

        let created;
        try {
            created = await costCenterService.create({
                organization_id: params.organizationId,
                parent_id: parentId,
                empreendimento_id: params.empreendimentoId,
                name: params.name,
                description: params.description ?? null,
            });
        } catch (e: any) {
            throw new Error(mapCostCenterError(e, 'Falha ao criar o centro de custo'));
        }

        await empreendimentoAuditService.record({
            empreendimentoId: params.empreendimentoId,
            organizationId: params.organizationId,
            entityType: 'cost_center',
            entityId: created.id,
            entityLabel: `${created.code} · ${created.name}`,
            action: 'create',
        });
        return { id: created.id, code: created.code, name: created.name };
    },

    /** Aponta um centro de custo EXISTENTE para o empreendimento. */
    async linkCostCenter(costCenterId: string, ctx: LinkContext): Promise<void> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .update({ empreendimento_id: ctx.empreendimentoId })
            .eq('id', costCenterId)
            .select('code, name')
            .single();
        if (error) throw new Error(mapCostCenterError(error, 'Falha ao vincular o centro de custo'));

        await empreendimentoAuditService.record({
            empreendimentoId: ctx.empreendimentoId,
            organizationId: ctx.organizationId,
            entityType: 'cost_center',
            entityId: costCenterId,
            entityLabel: `${(data as any).code} · ${(data as any).name}`,
            action: 'link',
        });
    },

    /** Desfaz o vínculo sem apagar o centro de custo nem os lançamentos dele. */
    async unlinkCostCenter(costCenterId: string, ctx: LinkContext): Promise<void> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .update({ empreendimento_id: null })
            .eq('id', costCenterId)
            .select('code, name')
            .single();
        if (error) throw new Error(`Falha ao desvincular o centro de custo: ${error.message}`);

        await empreendimentoAuditService.record({
            empreendimentoId: ctx.empreendimentoId,
            organizationId: ctx.organizationId,
            entityType: 'cost_center',
            entityId: costCenterId,
            entityLabel: `${(data as any).code} · ${(data as any).name}`,
            action: 'unlink',
        });
    },

    // ── Vincular / desvincular ───────────────────────────────────────────────
    // Cada operação registra o próprio evento no histórico. As que passam pelo
    // empreendimentoService (update / linkTowerToObra) já são auditadas lá.

    /** Obra principal. `projectId` nulo desfaz o vínculo. */
    async setObraPrincipal(empreendimentoId: string, projectId: string | null): Promise<void> {
        await empreendimentoService.update(empreendimentoId, { project_id: projectId } as any);
    },

    /** Obra de uma torre. `projectId` nulo desfaz o vínculo. */
    async linkTowerObra(towerId: string, projectId: string | null): Promise<void> {
        await empreendimentoService.linkTowerToObra(towerId, projectId);
    },

    /** Vincula/desvincula o projeto do motor de Áreas NBR 12721. */
    async linkAreaProject(areaProjectId: string, empreendimentoId: string | null, ctx: LinkContext): Promise<void> {
        const { error } = await supabase
            .from('area_projects')
            .update({ empreendimento_id: empreendimentoId })
            .eq('id', areaProjectId);
        if (error) throw new Error(`Falha ao vincular o projeto de áreas: ${error.message}`);

        await empreendimentoAuditService.record({
            empreendimentoId: ctx.empreendimentoId,
            organizationId: ctx.organizationId,
            entityType: 'area_project',
            entityId: areaProjectId,
            entityLabel: 'Quadros NBR 12721',
            action: empreendimentoId ? 'link' : 'unlink',
            source: 'area_engine',
        });
    },

    /** Vincula/desvincula o estudo da Planta IA. */
    async linkPlantaStudy(studyId: string | null, ctx: LinkContext): Promise<void> {
        await this.updateStudyLink(ctx, 'planta_ai_study_id', studyId, 'Estudo da Planta IA', 'sync_planta');
    },

    /** Vincula/desvincula o estudo de Viabilidade (Imovib). */
    async linkImovibStudy(studyId: string | null, ctx: LinkContext): Promise<void> {
        await this.updateStudyLink(ctx, 'imovib_study_id', studyId, 'Estudo de Viabilidade', 'sync_imovib');
    },

    async updateStudyLink(
        ctx: LinkContext,
        column: 'planta_ai_study_id' | 'imovib_study_id',
        studyId: string | null,
        label: string,
        source: 'sync_planta' | 'sync_imovib',
    ): Promise<void> {
        const { error } = await supabase
            .from('empreendimentos')
            .update({ [column]: studyId })
            .eq('id', ctx.empreendimentoId);
        if (error) throw new Error(`Falha ao atualizar o vínculo do estudo: ${error.message}`);

        await empreendimentoAuditService.record({
            empreendimentoId: ctx.empreendimentoId,
            organizationId: ctx.organizationId,
            entityType: 'study_link',
            entityId: studyId,
            entityLabel: label,
            action: studyId ? 'link' : 'unlink',
            source,
        });
    },

    /** Move um contrato para outra obra (ou solta o vínculo com `projectId` nulo). */
    async linkContractToObra(contractId: string, projectId: string | null, ctx: LinkContext): Promise<void> {
        const { error } = await supabase
            .from('contracts')
            .update({ project_id: projectId })
            .eq('id', contractId);
        if (error) throw new Error(`Falha ao atualizar o contrato: ${error.message}`);

        await empreendimentoAuditService.record({
            empreendimentoId: ctx.empreendimentoId,
            organizationId: ctx.organizationId,
            entityType: 'obra_link',
            entityId: contractId,
            entityLabel: 'Contrato',
            action: projectId ? 'link' : 'unlink',
            newValue: projectId,
        });
    },
};
