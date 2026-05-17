import { supabase } from '../lib/supabase';
import { BrokerMaterial } from '../types';

export const brokerMaterialService = {
    async listMaterials(organizationId?: string, projectId?: string) {
        let query = supabase
            .from('broker_portal_materials')
            .select('*')
            .order('created_at', { ascending: false });

        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        if (organizationId && isUUID(organizationId)) {
            query = query.eq('organization_id', organizationId);
        } else if (organizationId) {
            return []; // Avoid "invalid input syntax for type uuid" error (e.g., when ID is "demo")
        }

        if (projectId && isUUID(projectId)) {
            query = query.eq('project_id', projectId);
        }

        // Removemos o filtro is_active pois a tabela do DB public.broker_portal_materials foi gerada
        // sem a coluna is_active/is_public nas migrations (o que causava Status 400 no Supabase).
        // Se precisar de filtros no futuro, adicione a coluna no banco.
        const { data, error } = await query;

        if (error) {
            console.error('[BROKER MATERIAL SERVICE] Error fetching materials:', error);
            throw error;
        }

        return (data || []) as BrokerMaterial[];
    },

    async incrementViewsCount(materialId: string) {
        try {
            // First fetch current views
            const { data: currentData } = await supabase
                .from('broker_portal_materials')
                .select('views_count')
                .eq('id', materialId)
                .single();

            if (currentData) {
                const newCount = (currentData.views_count || 0) + 1;
                await supabase
                    .from('broker_portal_materials')
                    .update({ views_count: newCount })
                    .eq('id', materialId);
            }
        } catch (error) {
            console.error('[BROKER MATERIAL SERVICE] Error incrementing views:', error);
        }
    },

    async saveMaterial(material: Partial<BrokerMaterial>) {
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        if (material.organization_id && !isUUID(material.organization_id)) {
            throw new Error("Não é possível salvar registros em um ambiente de teste local ('demo') sem uma Organização real definida.");
        }
        if (material.project_id && !isUUID(material.project_id)) {
            material.project_id = undefined;
        }

        // Removendo campos que apenas servem de exibição na UI Front-End e não existem nas colunas do Banco
        const { project_name, ...dbPayload } = material;

        if (dbPayload.id) {
            const { data, error } = await supabase
                .from('broker_portal_materials')
                .update({
                    ...dbPayload,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dbPayload.id)
                .select()
                .single();

            if (error) throw error;
            return data as BrokerMaterial;
        } else {
            const { data, error } = await supabase
                .from('broker_portal_materials')
                .insert(dbPayload)
                .select()
                .single();

            return data as BrokerMaterial;
        }
    },

    async deleteMaterial(id: string) {
        const { error } = await supabase
            .from('broker_portal_materials')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async uploadMaterialFile(organizationId: string, file: File): Promise<string> {
        if (!organizationId) throw new Error("Organization ID is required for upload");

        const fileExt = file.name.split('.').pop();
        const fileName = `${organizationId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        console.log('[BROKER MATERIAL SERVICE] Uploading file to broker-materials:', fileName);

        const { data, error } = await supabase.storage
            .from('broker-materials')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (error) {
            console.error('[BROKER MATERIAL SERVICE] Upload error:', error);
            throw new Error(`Erro ao enviar arquivo: ${error.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
            .from('broker-materials')
            .getPublicUrl(fileName);

        return publicUrl;
    }
};
