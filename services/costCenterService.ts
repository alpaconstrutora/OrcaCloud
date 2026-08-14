import { supabase } from '../lib/supabase';
import { CostCenterV2 } from '../types/financial';

const COLUMNS = 'id, organization_id, empresa_id, parent_id, project_id, code, name, description, created_at, updated_at';

export interface CostCenterInput {
    organization_id: string;
    empresa_id?: string | null;
    parent_id?: string | null;
    /** Obra vinculada (opcional). */
    project_id?: string | null;
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

        const { data, error } = await supabase
            .from('cost_centers_v2')
            .update(payload)
            .eq('id', id)
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data;
    },

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
