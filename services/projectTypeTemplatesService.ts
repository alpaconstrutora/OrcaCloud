import { supabase } from '../lib/supabase';
import { TipoObra, ProjectTypeTemplate } from '../types/project';

/** Só os campos de conteúdo — sem `id` e sem `org_id`, que quem grava define. */
export type ProjectTypeTemplateContent = Omit<ProjectTypeTemplate, 'id' | 'org_id'>;

export const projectTypeTemplatesService = {
    // Retorna template da org primeiro; cai no sistema se não existir.
    // `orgId` nulo = "Todas as organizações": lê direto o template do sistema.
    async getTemplate(tipoObra: TipoObra, orgId?: string | null): Promise<ProjectTypeTemplate | null> {
        if (orgId) {
            const { data: orgTemplate } = await supabase
                .from('project_type_templates')
                .select('id, tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template')
                .eq('tipo_obra', tipoObra)
                .eq('org_id', orgId)
                .maybeSingle();

            if (orgTemplate) return orgTemplate as ProjectTypeTemplate;
        }

        const { data: systemTemplate } = await supabase
            .from('project_type_templates')
            .select('id, tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template')
            .eq('tipo_obra', tipoObra)
            .is('org_id', null)
            .maybeSingle();

        return (systemTemplate as ProjectTypeTemplate) ?? null;
    },

    async getAllSystemTemplates(): Promise<ProjectTypeTemplate[]> {
        const { data, error } = await supabase
            .from('project_type_templates')
            .select('id, tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template')
            .is('org_id', null)
            .order('tipo_obra');

        if (error) throw error;
        return (data ?? []) as ProjectTypeTemplate[];
    },

    /**
     * Salva o template personalizado de UMA organização.
     *
     * ⚠️ A linha é montada campo a campo, de propósito — nunca `...template`.
     * O editor monta o rascunho clonando o template do SISTEMA, e um spread
     * levaria o `id` da linha de sistema junto: bastaria o conflito ser
     * inferido pela chave primária para o "salvar" da organização virar um
     * UPDATE na linha compartilhada, sequestrando-a para um cliente só.
     * `org_id` também vem do parâmetro, não do objeto, para não existir
     * caminho em que a org do rascunho diverge da org de destino.
     *
     * O `onConflict` depende do índice único (tipo_obra, org_id) criado na
     * migration `aplicar_20270919000008` — sem ele o Postgres devolve 42P10 e
     * NENHUM template de organização é gravado. Ver o cabeçalho da migration.
     */
    async saveOrgTemplate(orgId: string, template: ProjectTypeTemplateContent): Promise<ProjectTypeTemplate> {
        const { data, error } = await supabase
            .from('project_type_templates')
            .upsert(
                {
                    tipo_obra: template.tipo_obra,
                    org_id: orgId,
                    eap_phases: template.eap_phases,
                    required_docs: template.required_docs,
                    indicators: template.indicators,
                    checklist_template: template.checklist_template,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'tipo_obra,org_id' }
            )
            .select('id, tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template')
            .single();

        if (error) throw error;
        return data as ProjectTypeTemplate;
    },
};
