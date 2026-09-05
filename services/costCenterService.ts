import { supabase } from '../lib/supabase';
import { CostCenterV2 } from '../types/financial';

const COLUMNS = 'id, organization_id, empresa_id, parent_id, project_id, empreendimento_id, code, name, description, created_at, updated_at';

export interface CostCenterInput {
    organization_id: string;
    empresa_id?: string | null;
    parent_id?: string | null;
    /** Obra vinculada (opcional). */
    project_id?: string | null;
    /** Empreendimento ancorado neste centro de custo (1:1 — índice único parcial
     *  `uidx_cost_center_por_empreendimento`). Gravado pela aba Vinculações do
     *  Empreendimento e pelo módulo de Condomínios. */
    empreendimento_id?: string | null;
    name: string;
    description?: string | null;
    /** Código manual — se omitido, `create` gera via RPC (001, 002...). */
    code?: string;
}

export const costCenterService = {
    // REGRA #5 (ui_ux_guia_unificado/CLAUDE.md): "Todas as organizações" (organizationId
    // null/undefined) NUNCA bloqueia leitura — deixa a RLS filtrar pelas orgs do usuário.
    async list(organizationId?: string | null): Promise<CostCenterV2[]> {
        let query = supabase.from('cost_centers_v2').select(COLUMNS);
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query.order('code');
        if (error) throw error;
        return data || [];
    },

    async getNextCode(organizationId: string): Promise<string> {
        const { data, error } = await supabase.rpc('get_next_cost_center_v2_code', { p_org_id: organizationId });
        if (error) throw error;
        return data as string;
    },

    async create(input: CostCenterInput): Promise<CostCenterV2> {
        const code = input.code || (await costCenterService.getNextCode(input.organization_id));
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .insert({
                organization_id: input.organization_id,
                empresa_id: input.empresa_id ?? null,
                parent_id: input.parent_id ?? null,
                project_id: input.project_id ?? null,
                empreendimento_id: input.empreendimento_id ?? null,
                code,
                name: input.name,
                description: input.description ?? null,
            })
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data;
    },

    async update(id: string, input: Partial<CostCenterInput>): Promise<CostCenterV2> {
        const payload: Record<string, unknown> = {};
        if (input.parent_id !== undefined) payload.parent_id = input.parent_id;
        if (input.name !== undefined) payload.name = input.name;
        if (input.description !== undefined) payload.description = input.description;
        if (input.empresa_id !== undefined) payload.empresa_id = input.empresa_id;
        if (input.project_id !== undefined) payload.project_id = input.project_id;
        if (input.empreendimento_id !== undefined) payload.empreendimento_id = input.empreendimento_id;

        const { data, error } = await supabase
            .from('cost_centers_v2')
            .update(payload)
            .eq('id', id)
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data;
    },

    /** `empreendimento_id` NÃO é copiado de propósito: o vínculo é 1:1 e a cópia
     *  seria recusada pelo índice único — a cópia nasce livre para ser vinculada. */
    async duplicate(item: CostCenterV2): Promise<CostCenterV2> {
        return costCenterService.create({
            organization_id: item.organization_id,
            empresa_id: item.empresa_id,
            parent_id: item.parent_id,
            project_id: item.project_id,
            name: `${item.name} (cópia)`,
            description: item.description,
        });
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase.from('cost_centers_v2').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Vínculo com Obra (`project_id`) ──────────────────────────────────────
    // A coluna existe desde 20270907000000 e NÃO tem índice único: uma obra pode
    // ser vinculada a vários centros de custo (pedido do usuário em 04/09/2026),
    // ao contrário de `empreendimento_id`, que é 1:1.

    /** Centros de custo desta obra, com o nome do grupo pai já resolvido. */
    async listByProject(projectId: string): Promise<(CostCenterV2 & { grupo: string | null })[]> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select(COLUMNS)
            .eq('project_id', projectId)
            .order('code');
        if (error) throw error;

        const rows = (data || []) as CostCenterV2[];
        if (!rows.length) return [];

        const paisIds = [...new Set(rows.map(r => r.parent_id).filter(Boolean))] as string[];
        const nomePai = new Map<string, string>();
        if (paisIds.length) {
            const { data: pais } = await supabase.from('cost_centers_v2').select('id, name').in('id', paisIds);
            for (const p of (pais || []) as { id: string; name: string }[]) nomePai.set(p.id, p.name);
        }
        return rows.map(r => ({ ...r, grupo: r.parent_id ? nomePai.get(r.parent_id) ?? null : null }));
    },

    /**
     * Candidatos ao vínculo: só FILHOS (`parent_id` preenchido) — grupo é família
     * de despesa, não unidade de caixa — e ainda sem obra. Organização ausente
     * ("Todas") não bloqueia a leitura; a RLS recorta (CLAUDE.md REGRA #5).
     */
    async listLinkableForProject(organizationId?: string | null): Promise<CostCenterV2[]> {
        let query = supabase
            .from('cost_centers_v2')
            .select(COLUMNS)
            .is('project_id', null)
            .not('parent_id', 'is', null);
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query.order('code');
        if (error) throw error;
        return (data || []) as CostCenterV2[];
    },

    /** Aponta um centro de custo existente para a obra. */
    async linkToProject(id: string, projectId: string): Promise<CostCenterV2> {
        return costCenterService.update(id, { project_id: projectId });
    },

    /** Desfaz o vínculo sem apagar o centro de custo nem os lançamentos dele. */
    async unlinkFromProject(id: string): Promise<CostCenterV2> {
        return costCenterService.update(id, { project_id: null });
    },

    /**
     * Grupo "Obras", criado sob demanda — é o pai padrão do centro de custo novo
     * quando o usuário não escolhe um. Sem pai, ele nasceria no primeiro nível,
     * lado a lado com as famílias de despesa. Tolera plural/variação do cadastro
     * manual antes de criar (mesmo cuidado de `garantirGrupoEmpreendimentos`).
     */
    async ensureGrupoObras(organizationId: string): Promise<string> {
        for (const padrao of ['obra%', 'constru%']) {
            const { data } = await supabase
                .from('cost_centers_v2')
                .select('id')
                .eq('organization_id', organizationId)
                .is('parent_id', null)
                .ilike('name', padrao)
                .limit(1)
                .maybeSingle();
            if (data) return (data as { id: string }).id;
        }
        const grupo = await costCenterService.create({
            organization_id: organizationId,
            name: 'Obras',
            description: 'Grupo dos centros de custo de obras.',
        });
        return grupo.id;
    },

    /** Cria o centro de custo JÁ vinculado à obra — um único insert, sem lixo se
     *  o segundo passo falhasse. O código sai do RPC via `create`. */
    async createForProject(params: {
        projectId: string;
        organizationId: string;
        name: string;
        /** Grupo pai; omitido, cai no grupo "Obras" criado sob demanda. */
        parentId?: string | null;
        description?: string | null;
    }): Promise<CostCenterV2> {
        const parentId = params.parentId || (await costCenterService.ensureGrupoObras(params.organizationId));
        return costCenterService.create({
            organization_id: params.organizationId,
            parent_id: parentId,
            project_id: params.projectId,
            name: params.name,
            description: params.description ?? null,
        });
    },

    async importRows(
        organizationId: string,
        rows: { group?: string; name: string; description?: string }[]
    ): Promise<{ created: number; errors: number }> {
        let created = 0;
        let errors = 0;
        const existing = await costCenterService.list(organizationId);
        const groupByName = new Map(existing.filter(c => !c.parent_id).map(c => [c.name.trim().toLowerCase(), c]));

        for (const row of rows) {
            try {
                let parentId: string | null = null;
                if (row.group?.trim()) {
                    const key = row.group.trim().toLowerCase();
                    let group = groupByName.get(key);
                    if (!group) {
                        group = await costCenterService.create({ organization_id: organizationId, name: row.group.trim() });
                        groupByName.set(key, group);
                    }
                    parentId = group.id;
                }
                await costCenterService.create({
                    organization_id: organizationId,
                    parent_id: parentId,
                    name: row.name,
                    description: row.description,
                });
                created++;
            } catch (e) {
                console.error('Erro ao importar centro de custo:', row, e);
                errors++;
            }
        }
        return { created, errors };
    },
};
