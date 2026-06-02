import { supabase } from '../lib/supabase';
import { ProjectSettings, BudgetEntry } from '../types';

export interface ProjectData {
    id?: string;
    name: string;
    settings: ProjectSettings;
    budget: BudgetEntry[];
    empresa_id?: string;
    updated_at?: string;
}

export const projectService = {
    // Salva ou atualiza um projeto
    // Como não temos autenticação completa ainda vamos usar o local storage para guardar o ID do projeto criado
    // para permitir "edição" simples do mesmo projeto
    async saveProject(data: ProjectData) {
        const { id, ...rest } = data;

        // VALIDAÇÃO DE NOME DUPLICADO (Sensível à Classificação)
        const orgId = rest.settings?.organizationId;
        const classification = rest.settings?.classification;

        if (orgId && rest.name !== 'Gestão Comercial') {
            const { data: existing } = await supabase
                .from('projects')
                .select('id, name, settings')
                .ilike('name', rest.name.trim())
                .filter('settings->>organizationId', 'eq', orgId);

            if (existing && existing.length > 0) {
                const isDuplicate = existing.some(p => {
                    const sameId = p.id === id;
                    const sameName = p.name.toLowerCase().trim() === rest.name.toLowerCase().trim();
                    const sameClass = (p.settings as any)?.classification === classification;
                    return !sameId && sameName && sameClass;
                });

                if (isDuplicate) {
                    const typeLabel = classification === 'DIARIO' ? 'diário' : 
                                     classification === 'ORCAMENTO' ? 'orçamento' :
                                     classification === 'PLANEJAMENTO' ? 'planejamento' : 'obra';
                                     
                    throw new Error(`Já existe um ${typeLabel} chamado "${rest.name.trim()}" na sua organização. Por favor, escolha outro nome para este ${typeLabel}.`);
                }
            }
        }

        const tipoObra = rest.settings?.tipoObra ?? null;
        const regimeObra = rest.settings?.regimeObra ?? null;
        const empresaId = rest.empresa_id ?? rest.settings?.empresaId ?? null;

        // Se tivermos um ID, tentamos atualizar
        if (id) {
            const { data: updated, error } = await supabase
                .from('projects')
                .update({
                    name: rest.name,
                    settings: rest.settings,
                    budget: rest.budget,
                    updated_at: new Date(),
                    ...(rest.settings?.code !== undefined ? { code: rest.settings.code || null } : {}),
                    ...(tipoObra !== null ? { tipo_obra: tipoObra } : {}),
                    ...(regimeObra !== null ? { regime_obra: regimeObra } : {}),
                    ...(empresaId ? { empresa_id: empresaId } : {}),
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return updated;
        }
        // Senão, criamos um novo
        else {
            let codeToUse = rest.settings?.code ?? null;

            // Auto-generate sequential code for OBRA projects if not provided
            if (!codeToUse && classification === 'OBRA' && orgId) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_next_project_code', { p_org_id: orgId });
                if (!rpcError && rpcData) {
                    codeToUse = rpcData as string;
                }
            }

            // Auto-generate sequential code for ORCAMENTO projects if not provided
            if (!codeToUse && classification === 'ORCAMENTO' && orgId) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_next_orcamento_code', { p_org_id: orgId });
                if (!rpcError && rpcData) {
                    codeToUse = rpcData as string;
                }
            }

            const settingsWithCode = codeToUse
                ? { ...rest.settings, code: codeToUse }
                : rest.settings;

            const { data: created, error } = await supabase
                .from('projects')
                .insert({
                    name: rest.name,
                    settings: settingsWithCode,
                    budget: rest.budget,
                    code: codeToUse,
                    ...(tipoObra ? { tipo_obra: tipoObra } : {}),
                    ...(regimeObra ? { regime_obra: regimeObra } : {}),
                    ...(empresaId ? { empresa_id: empresaId } : {}),
                })
                .select()
                .single();

            if (error) throw error;
            return created;
        }
    },

    async loadProject(id: string) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        return data;
    },

    async listProjects(
        clientId?: string,
        organizationId?: string,
        includeOrphans: boolean = false,
        empresaId?: string,
    ) {
        let query = supabase
            .from('projects')
            .select('id, name, updated_at, created_at, settings, code, empresa_id')
            .order('updated_at', { ascending: false });

        if (clientId) {
            query = query.filter('settings->>clientId', 'eq', clientId);
        }

        if (empresaId) {
            // Filtro por empresa específica do grupo (coluna própria)
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            if (includeOrphans) {
                query = query.or(`settings->>organizationId.eq.${organizationId},settings->>organizationId.is.null`);
            } else {
                query = query.filter('settings->>organizationId', 'eq', organizationId);
            }
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async deleteProject(id: string) {
        // Bloqueio de segurança para o Gestão Comercial
        const { data: projectToDel } = await supabase.from('projects').select('name').eq('id', id).maybeSingle();
        if (projectToDel && projectToDel.name === 'Gestão Comercial') {
            throw new Error('Não é possível excluir a obra do sistema "Gestão Comercial". Ela é vital para o armazenamento no banco de dados e sincronização.');
        }

        // Primeiro verificamos se existem pedidos vinculados
        const { count, error: countError } = await supabase
            .from('purchase_orders')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', id);

        if (countError) throw countError;

        if (count && count > 0) {
            throw new Error(`Não é possível excluir esta obra pois existem ${count} pedido(s) vinculados a ela. Exclua ou cancele os pedidos primeiro.`);
        }

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Retorna a contagem de pedidos para uma lista de IDs de projeto
    async getOrderCounts(projectIds: string[]) {
        if (projectIds.length === 0) return {};

        const { data, error } = await supabase
            .from('purchase_orders')
            .select('project_id')
            .in('project_id', projectIds);

        if (error) throw error;

        const counts: Record<string, number> = {};
        data?.forEach(o => {
            counts[o.project_id] = (counts[o.project_id] || 0) + 1;
        });
        return counts;
    }
};
