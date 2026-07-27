import { supabase } from '../lib/supabase';
import { 
  OpuraElectricalProject, 
  OpuraElectricalVersion, 
  OpuraElectricalPlan, 
  OpuraElectricalRoom,
  OpuraElectricalPoint,
  OpuraElectricalBoard,
  OpuraElectricalCircuit
} from '../types/electrical';

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
        return (data || []).map(mapProjectToCamelCase);
    },

    async getProjectById(id: string): Promise<OpuraElectricalProject | null> {
        const { data, error } = await supabase.from('opura_electrical_projects')
            .select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Erro ao buscar projeto: ${error.message}`);
        return data ? mapProjectToCamelCase(data) : null;
    },

    async createProject(item: Partial<OpuraElectricalProject>): Promise<OpuraElectricalProject> {
        const dbItem = mapProjectToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_projects')
            .insert(dbItem).select().single();
        if (error) {
            console.error('[electricalProjectService] createProject error:', error);
            throw new Error(`Erro ao criar projeto: ${error.message}`);
        }
        return mapProjectToCamelCase(data);
    },

    async updateProject(id: string, updates: Partial<OpuraElectricalProject>): Promise<OpuraElectricalProject> {
        const dbUpdates = mapProjectToSnakeCase(updates);
        const { data, error } = await supabase.from('opura_electrical_projects')
            .update(dbUpdates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar projeto: ${error.message}`);
        return mapProjectToCamelCase(data);
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
        return (data || []).map(mapVersionToCamelCase);
    },

    async createVersion(item: Partial<OpuraElectricalVersion>): Promise<OpuraElectricalVersion> {
        const dbItem = mapVersionToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_versions')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar versão: ${error.message}`);
        return mapVersionToCamelCase(data);
    },

    // PLANS
    async getPlanByVersion(versionId: string): Promise<OpuraElectricalPlan | null> {
        const { data, error } = await supabase.from('opura_electrical_plans')
            .select('*').eq('version_id', versionId).maybeSingle();
        if (error) throw new Error(`Erro ao buscar planta: ${error.message}`);
        return data ? mapPlanToCamelCase(data) : null;
    },

    async createPlan(item: Partial<OpuraElectricalPlan>): Promise<OpuraElectricalPlan> {
        const dbItem = mapPlanToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_plans')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar planta: ${error.message}`);
        return mapPlanToCamelCase(data);
    },

    async updatePlan(id: string, updates: Partial<OpuraElectricalPlan>): Promise<OpuraElectricalPlan> {
        const dbUpdates = mapPlanToSnakeCase(updates);
        const { data, error } = await supabase.from('opura_electrical_plans')
            .update(dbUpdates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar planta: ${error.message}`);
        return mapPlanToCamelCase(data);
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
        return (data || []).map(mapRoomToCamelCase);
    },

    async createRoom(item: Partial<OpuraElectricalRoom>): Promise<OpuraElectricalRoom> {
        const dbItem = mapRoomToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_rooms')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar ambiente: ${error.message}`);
        return mapRoomToCamelCase(data);
    },

    async updateRoom(id: string, updates: Partial<OpuraElectricalRoom>): Promise<OpuraElectricalRoom> {
        const dbUpdates = mapRoomToSnakeCase(updates);
        const { data, error } = await supabase.from('opura_electrical_rooms')
            .update(dbUpdates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar ambiente: ${error.message}`);
        return mapRoomToCamelCase(data);
    },

    async deleteRoom(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_rooms')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar ambiente: ${error.message}`);
    },
    
    // POINTS
    async listPointsByRooms(roomIds: string[]): Promise<OpuraElectricalPoint[]> {
        if (!roomIds.length) return [];
        const { data, error } = await supabase.from('opura_electrical_points')
            .select('*').in('room_id', roomIds);
        if (error) throw new Error(`Erro ao listar pontos: ${error.message}`);
        return (data || []).map(mapPointToCamelCase);
    },

    async listPointsByRoom(roomId: string): Promise<OpuraElectricalPoint[]> {
        const { data, error } = await supabase.from('opura_electrical_points')
            .select('*').eq('room_id', roomId);
        if (error) throw new Error(`Erro ao listar pontos: ${error.message}`);
        return (data || []).map(mapPointToCamelCase);
    },

    async createPoint(item: Partial<OpuraElectricalPoint>): Promise<OpuraElectricalPoint> {
        const dbItem = mapPointToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_points')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar ponto: ${error.message}`);
        return mapPointToCamelCase(data);
    },

    async updatePoint(id: string, updates: Partial<OpuraElectricalPoint>): Promise<OpuraElectricalPoint> {
        const dbUpdates = mapPointToSnakeCase(updates);
        const { data, error } = await supabase.from('opura_electrical_points')
            .update(dbUpdates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar ponto: ${error.message}`);
        return mapPointToCamelCase(data);
    },

    async deletePoint(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_points')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar ponto: ${error.message}`);
    },

    // BOARDS
    async listBoards(versionId: string): Promise<OpuraElectricalBoard[]> {
        const { data, error } = await supabase.from('opura_electrical_boards')
            .select('*').eq('version_id', versionId).order('created_at', { ascending: true });
        if (error) throw new Error(`Erro ao listar quadros: ${error.message}`);
        return (data || []).map(mapBoardToCamelCase);
    },

    async createBoard(item: Partial<OpuraElectricalBoard>): Promise<OpuraElectricalBoard> {
        const dbItem = mapBoardToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_boards')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar quadro: ${error.message}`);
        return mapBoardToCamelCase(data);
    },

    // CIRCUITS
    async listCircuits(boardId: string): Promise<OpuraElectricalCircuit[]> {
        const { data, error } = await supabase.from('opura_electrical_circuits')
            .select('*').eq('board_id', boardId).order('created_at', { ascending: true });
        if (error) throw new Error(`Erro ao listar circuitos: ${error.message}`);
        return (data || []).map(mapCircuitToCamelCase);
    },

    async createCircuit(item: Partial<OpuraElectricalCircuit>): Promise<OpuraElectricalCircuit> {
        const dbItem = mapCircuitToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_circuits')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar circuito: ${error.message}`);
        return mapCircuitToCamelCase(data);
    }
};

// Helper mappers for snake_case vs camelCase

function mapProjectToSnakeCase(item: Partial<OpuraElectricalProject>): any {
    const { organizationId, projectId, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(organizationId !== undefined && { organization_id: organizationId }),
        ...(projectId !== undefined && { project_id: projectId }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapProjectToCamelCase(row: any): OpuraElectricalProject {
    return {
        ...row,
        organizationId: row.organization_id,
        projectId: row.project_id,
        createdAt: row.created_at,
    };
}

function mapVersionToSnakeCase(item: Partial<OpuraElectricalVersion>): any {
    const { electricalProjectId, versionNumber, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(electricalProjectId !== undefined && { electrical_project_id: electricalProjectId }),
        ...(versionNumber !== undefined && { version_number: versionNumber }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapVersionToCamelCase(row: any): OpuraElectricalVersion {
    return {
        ...row,
        electricalProjectId: row.electrical_project_id,
        versionNumber: row.version_number,
        createdAt: row.created_at,
    };
}

function mapPlanToSnakeCase(item: Partial<OpuraElectricalPlan>): any {
    const { versionId, fileUrl, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(versionId !== undefined && { version_id: versionId }),
        ...(fileUrl !== undefined && { file_url: fileUrl }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapPlanToCamelCase(row: any): OpuraElectricalPlan {
    return {
        ...row,
        versionId: row.version_id,
        fileUrl: row.file_url,
        createdAt: row.created_at,
    };
}

function mapRoomToSnakeCase(item: Partial<OpuraElectricalRoom>): any {
    const { planId, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(planId !== undefined && { plan_id: planId }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapRoomToCamelCase(row: any): OpuraElectricalRoom {
    return {
        ...row,
        planId: row.plan_id,
        createdAt: row.created_at,
    };
}

function mapPointToSnakeCase(item: Partial<OpuraElectricalPoint>): any {
    const { roomId, circuitId, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(roomId !== undefined && { room_id: roomId }),
        ...(circuitId !== undefined && { circuit_id: circuitId }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapPointToCamelCase(row: any): OpuraElectricalPoint {
    return {
        ...row,
        roomId: row.room_id,
        circuitId: row.circuit_id,
        createdAt: row.created_at,
    };
}

function mapBoardToSnakeCase(item: Partial<OpuraElectricalBoard>): any {
    const { versionId, mainBreakerCapacity, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(versionId !== undefined && { version_id: versionId }),
        ...(mainBreakerCapacity !== undefined && { main_breaker_capacity: mainBreakerCapacity }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapBoardToCamelCase(row: any): OpuraElectricalBoard {
    return {
        ...row,
        versionId: row.version_id,
        mainBreakerCapacity: row.main_breaker_capacity,
        createdAt: row.created_at,
    };
}

function mapCircuitToSnakeCase(item: Partial<OpuraElectricalCircuit>): any {
    const { boardId, circuitType, installedPowerW, demandFactor, breakerCapacity, wireSectionMm2, createdAt, ...rest } = item as any;
    return {
        ...rest,
        ...(boardId !== undefined && { board_id: boardId }),
        ...(circuitType !== undefined && { circuit_type: circuitType }),
        ...(installedPowerW !== undefined && { installed_power_w: installedPowerW }),
        ...(demandFactor !== undefined && { demand_factor: demandFactor }),
        ...(breakerCapacity !== undefined && { breaker_capacity: breakerCapacity }),
        ...(wireSectionMm2 !== undefined && { wire_section_mm2: wireSectionMm2 }),
        ...(createdAt !== undefined && { created_at: createdAt }),
    };
}

function mapCircuitToCamelCase(row: any): OpuraElectricalCircuit {
    return {
        ...row,
        boardId: row.board_id,
        circuitType: row.circuit_type,
        installedPowerW: row.installed_power_w,
        demandFactor: row.demand_factor,
        breakerCapacity: row.breaker_capacity,
        wireSectionMm2: row.wire_section_mm2,
        createdAt: row.created_at,
    };
}

