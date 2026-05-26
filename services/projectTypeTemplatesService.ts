import { supabase } from '../lib/supabase';
import { TipoObra, ProjectTypeTemplate } from '../types/project';

export const projectTypeTemplatesService = {
    // Retorna template da org primeiro; cai no sistema se não existir
    async getTemplate(tipoObra: TipoObra, orgId?: string): Promise<ProjectTypeTemplate | null> {
        if (orgId) {
            const { data: orgTemplate } = await supabase
                .from('project_type_templates')
                .select('*')
                .eq('tipo_obra', tipoObra)
                .eq('org_id', orgId)
                .maybeSingle();

            if (orgTemplate) return orgTemplate as ProjectTypeTemplate;
        }

        const { data: systemTemplate } = await supabase
            .from('project_type_templates')
            .select('*')
            .eq('tipo_obra', tipoObra)
            .is('org_id', null)
            .maybeSingle();

        return (systemTemplate as ProjectTypeTemplate) ?? null;
    },

    async getAllSystemTemplates(): Promise<ProjectTypeTemplate[]> {
        const { data, error } = await supabase
            .from('project_type_templates')
            .select('*')
            .is('org_id', null)
            .order('tipo_obra');

        if (error) throw error;
        return (data ?? []) as ProjectTypeTemplate[];
    },

    // Salva template personalizado da organização
    async saveOrgTemplate(template: Omit<ProjectTypeTemplate, 'id'>): Promise<ProjectTypeTemplate> {
        const { data, error } = await supabase
            .from('project_type_templates')
            .upsert(
                { ...template, updated_at: new Date() },
                { onConflict: 'tipo_obra,org_id' }
            )
            .select()
            .single();

        if (error) throw error;
        return data as ProjectTypeTemplate;
    },
};
