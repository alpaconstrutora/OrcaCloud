import { supabase } from '../lib/supabase';
import { Empreendimento } from '../types';
import { findChildProject } from './budgetResolver';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
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
 *   - Contratos/Fin: NÃO se ligam ao empreendimento — chegam pela obra (`project_id`)
 *
 * ⚠️ Nenhuma das colunas de obra/estudo tem FOREIGN KEY (DDL deadlocka neste módulo —
 * ver 20270719000000). O id apontado pode não existir mais: quando isso acontece o
 * vínculo vem com `missing: true` e a UI oferece só "Desvincular".
 */

export type EmpreendimentoLinkKind =
    | 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'AREAS_NBR'
    | 'PLANTA_IA' | 'ESTUDO_VIABILIDADE' | 'CONTRATO' | 'FINANCEIRO';

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

        const [children, areaProject, contratos, financeiro] = await Promise.all([
            this.loadBudgetsAndPlans(validObras),
            this.loadAreaProject(emp.id, orgId),
            this.loadContracts(obraIds, validObras),
            this.loadFinance(obraIds, validObras),
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
     * Contratos das obras do empreendimento. Uma query com `.in()` — o
     * `contractService.listContracts` só aceita um `projectId` por chamada.
     * Sem filtro de organização: a RLS de `contracts` já recorta.
     */
    async loadContracts(obraIds: string[], obras: EmpreendimentoLink[]): Promise<EmpreendimentoLink[]> {
        if (!obraIds.length) return [];
        try {
            const { data } = await supabase
                .from('contracts')
                .select('id, number, title, status, domain, direction, current_value, original_value, project_id')
                .in('project_id', obraIds)
                .order('created_at', { ascending: false });
            const obraName = new Map(obras.map(o => [o.id, o.label]));
            return ((data || []) as any[]).map(c => ({
                kind: 'CONTRATO' as const,
                id: c.id,
                label: c.title || c.number || 'Contrato',
                sublabel: [c.number, obraName.get(c.project_id)].filter(Boolean).join(' · '),
                parentObraId: c.project_id,
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
