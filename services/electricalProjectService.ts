import { supabase } from '../lib/supabase';
import { 
  OpuraElectricalProject, 
  OpuraElectricalVersion, 
  OpuraElectricalPlan, 
  OpuraElectricalRoom,
  OpuraElectricalPoint
} from '../types';

export const electricalProjectService = {
    async listProjects(organizationId?: string, projectId?: string): Promise<OpuraElectricalProject[]> {
        let query = supabase.from('opura_electrical_projects').select('*').order('created_at', { ascending: false });
        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }
        if (projectId) {
            query = query.eq('project_id', projectId);
        }
        const { data, error } = await query;
        if (error) {
            console.error('[electricalProjectService] listProjects error:', error);
            throw new Error(`Erro ao listar projetos: ${error.message}`);
        }
        return data || [];
    },

    async getProjectById(id: string): Promise<OpuraElectricalProject | null> {
        const { data, error } = await supabase.from('opura_electrical_projects')
            .select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Erro ao buscar projeto: ${error.message}`);
        return data;
    },

    async createProject(item: Partial<OpuraElectricalProject>): Promise<OpuraElectricalProject> {
        const { data, error } = await supabase.from('opura_electrical_projects')
            .insert(item).select().single();
        if (error) {
            console.error('[electricalProjectService] createProject error:', error);
            throw new Error(`Erro ao criar projeto: ${error.message}`);
        }
        return data;
    },

    async updateProject(id: string, updates: Partial<OpuraElectricalProject>): Promise<OpuraElectricalProject> {
        const { data, error } = await supabase.from('opura_electrical_projects')
            .update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar projeto: ${error.message}`);
        return data;
    },

    async deleteProject(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_projects')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar projeto: ${error.message}`);
    },

    // VERSIONS
    async listVersions(electricalProjectId: string): Promise<OpuraElectricalVersion[]> {
        const { data, error } = await supabase.from('opura_electrical_versions')
            .select('*').eq('electrical_project_id', electricalProjectId).order('version_number', { ascending: false });
        if (error) throw new Error(`Erro ao listar versões: ${error.message}`);
        return data || [];
    },

    async createVersion(item: Partial<OpuraElectricalVersion>): Promise<OpuraElectricalVersion> {
        const { data, error } = await supabase.from('opura_electrical_versions')
            .insert(item).select().single();
        if (error) throw new Error(`Erro ao criar versão: ${error.message}`);
        return data;
    },

    // PLANS
    async getPlanByVersion(versionId: string): Promise<OpuraElectricalPlan | null> {
        const { data, error } = await supabase.from('opura_electrical_plans')
            .select('*').eq('version_id', versionId).maybeSingle();
        if (error) throw new Error(`Erro ao buscar planta: ${error.message}`);
        return data;
    },

    async createPlan(item: Partial<OpuraElectricalPlan>): Promise<OpuraElectricalPlan> {
        const { data, error } = await supabase.from('opura_electrical_plans')
            .insert(item).select().single();
        if (error) throw new Error(`Erro ao criar planta: ${error.message}`);
        return data;
    },

    async updatePlan(id: string, updates: Partial<OpuraElectricalPlan>): Promise<OpuraElectricalPlan> {
        const { data, error } = await supabase.from('opura_electrical_plans')
            .update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar planta: ${error.message}`);
        return data;
    },

    async uploadPlanImage(file: File, organizationId: string): Promise<string> {
        const fileName = `${organizationId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabase.storage.from('electrical_plans').upload(fileName, file);
        if (error) throw new Error(`Erro no upload da planta: ${error.message}`);
        const { data: publicUrlData } = supabase.storage.from('electrical_plans').getPublicUrl(data.path);
        return publicUrlData.publicUrl;
    },

    // ROOMS
    async listRoomsByPlan(planId: string): Promise<OpuraElectricalRoom[]> {
        const { data, error } = await supabase.from('opura_electrical_rooms')
            .select('*').eq('plan_id', planId).order('created_at', { ascending: true });
        if (error) throw new Error(`Erro ao listar ambientes: ${error.message}`);
        return data || [];
    },

    async createRoom(item: Partial<OpuraElectricalRoom>): Promise<OpuraElectricalRoom> {
        const { data, error } = await supabase.from('opura_electrical_rooms')
            .insert(item).select().single();
        if (error) throw new Error(`Erro ao criar ambiente: ${error.message}`);
        return data;
    },

    async updateRoom(id: string, updates: Partial<OpuraElectricalRoom>): Promise<OpuraElectricalRoom> {
        const { data, error } = await supabase.from('opura_electrical_rooms')
            .update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar ambiente: ${error.message}`);
        return data;
    },

    async deleteRoom(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_rooms')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar ambiente: ${error.message}`);
    },
    
    // POINTS
    async listPointsByRoom(roomId: string): Promise<OpuraElectricalPoint[]> {
        const { data, error } = await supabase.from('opura_electrical_points')
            .select('*').eq('room_id', roomId);
        if (error) throw new Error(`Erro ao listar pontos: ${error.message}`);
        return data || [];
    },

    async createPoint(item: Partial<OpuraElectricalPoint>): Promise<OpuraElectricalPoint> {
        const { data, error } = await supabase.from('opura_electrical_points')
            .insert(item).select().single();
        if (error) throw new Error(`Erro ao criar ponto: ${error.message}`);
        return data;
    },

    async updatePoint(id: string, updates: Partial<OpuraElectricalPoint>): Promise<OpuraElectricalPoint> {
        const { data, error } = await supabase.from('opura_electrical_points')
            .update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar ponto: ${error.message}`);
        return data;
    },

    async deletePoint(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_points')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar ponto: ${error.message}`);
    }
};
