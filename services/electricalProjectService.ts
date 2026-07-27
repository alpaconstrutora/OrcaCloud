import { supabase } from '../lib/supabase';
import { 
  OpuraElectricalProject, 
  OpuraElectricalVersion, 
  OpuraElectricalPlan, 
  OpuraElectricalRoom,
  OpuraElectricalWall,
  OpuraElectricalPoint,
  OpuraElectricalBoard,
  OpuraElectricalCircuit,
  OpuraElectricalTakeoff
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
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const fileName = `${organizationId}/${Date.now()}_${safeName}`;
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
    
    // WALLS
    async listWallsByPlan(planId: string): Promise<OpuraElectricalWall[]> {
        const { data, error } = await supabase.from('opura_electrical_walls')
            .select('*').eq('plan_id', planId).order('created_at', { ascending: true });
        if (error) throw new Error(`Erro ao listar paredes: ${error.message}`);
        return (data || []).map(mapWallToCamelCase);
    },

    async createWall(item: Partial<OpuraElectricalWall>): Promise<OpuraElectricalWall> {
        const dbItem = mapWallToSnakeCase(item);
        const { data, error } = await supabase.from('opura_electrical_walls')
            .insert(dbItem).select().single();
        if (error) throw new Error(`Erro ao criar parede: ${error.message}`);
        return mapWallToCamelCase(data);
    },

    async updateWall(id: string, updates: Partial<OpuraElectricalWall>): Promise<OpuraElectricalWall> {
        const dbUpdates = mapWallToSnakeCase(updates);
        const { data, error } = await supabase.from('opura_electrical_walls')
            .update(dbUpdates).eq('id', id).select().single();
        if (error) throw new Error(`Erro ao atualizar parede: ${error.message}`);
        return mapWallToCamelCase(data);
    },

    async deleteWall(id: string): Promise<void> {
        const { error } = await supabase.from('opura_electrical_walls')
            .delete().eq('id', id);
        if (error) throw new Error(`Erro ao deletar parede: ${error.message}`);
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
    },

    // TAKEOFFS (Quantitativos e Orçamento)
    async listTakeoffs(versionId: string): Promise<OpuraElectricalTakeoff[]> {
        const { data, error } = await supabase.from('opura_electrical_takeoffs')
            .select('*').eq('version_id', versionId).order('created_at', { ascending: true });
        if (error) throw new Error(`Erro ao listar quantitativos: ${error.message}`);
        return (data || []).map(mapTakeoffToCamelCase);
    },

    async generateTakeoffs(versionId: string, organizationId: string): Promise<OpuraElectricalTakeoff[]> {
        // 1. Fetch all project entities
        const boards = await this.listBoards(versionId);
        
        let allCircuits: OpuraElectricalCircuit[] = [];
        for (const bd of boards) {
            const cts = await this.listCircuits(bd.id);
            allCircuits = [...allCircuits, ...cts];
        }

        const plans = await supabase.from('opura_electrical_plans').select('id').eq('version_id', versionId);
        let allRooms: OpuraElectricalRoom[] = [];
        if (plans.data && plans.data.length > 0) {
            for (const plan of plans.data) {
                const rms = await this.listRoomsByPlan(plan.id);
                allRooms = [...allRooms, ...rms];
            }
        }

        let allPoints: OpuraElectricalPoint[] = [];
        if (allRooms.length > 0) {
            allPoints = await this.listPointsByRooms(allRooms.map(r => r.id));
        }

        // 2. Count items
        const takeoffMap: Record<string, { desc: string; type: string; qty: number; unit: string; cost: number }> = {};

        // Boards
        boards.forEach(b => {
            const key = `board_${b.boardType || 'QDC'}`;
            if (!takeoffMap[key]) takeoffMap[key] = { desc: `Quadro de Distribuição (${b.boardType || 'QDC'})`, type: 'quadro', qty: 0, unit: 'un', cost: 150.00 };
            takeoffMap[key].qty += 1;
            
            if (b.mainBreakerCapacity) {
                const bkKey = `breaker_main_${b.mainBreakerCapacity}`;
                if (!takeoffMap[bkKey]) takeoffMap[bkKey] = { desc: `Disjuntor Geral DIN ${b.mainBreakerCapacity}A`, type: 'disjuntor', qty: 0, unit: 'un', cost: 45.00 };
                takeoffMap[bkKey].qty += 1;
            }
        });

        // Circuits (Breakers)
        allCircuits.forEach(c => {
            const cap = c.breakerCapacity || 20;
            const bkKey = `breaker_${cap}`;
            if (!takeoffMap[bkKey]) takeoffMap[bkKey] = { desc: `Disjuntor DIN ${cap}A (Circuito)`, type: 'disjuntor', qty: 0, unit: 'un', cost: 18.50 };
            takeoffMap[bkKey].qty += 1;
        });

        // Points (Outlets, Switches, Light fixtures)
        allPoints.forEach(p => {
            const type = p.pointType || 'tomada_baixa';
            if (!takeoffMap[type]) {
                let desc = type.replace(/_/g, ' ');
                desc = desc.charAt(0).toUpperCase() + desc.slice(1);
                let cost = 15.00;
                if (type.includes('interruptor')) cost = 12.00;
                if (type.includes('iluminacao')) cost = 35.00;
                
                takeoffMap[type] = { desc: `Ponto de ${desc}`, type: 'ponto', qty: 0, unit: 'un', cost };
            }
            takeoffMap[type].qty += 1;
        });

        // 3. Clear existing takeoffs for this version
        await supabase.from('opura_electrical_takeoffs').delete().eq('version_id', versionId);

        // 4. Save new takeoffs
        const takeoffsToInsert = Object.values(takeoffMap).map(t => mapTakeoffToSnakeCase({
            organizationId,
            versionId,
            itemType: t.type,
            description: t.desc,
            quantity: t.qty,
            unit: t.unit,
            unitCost: t.cost,
            wasteFactor: 0.05
        }));

        if (takeoffsToInsert.length > 0) {
            const { data, error } = await supabase.from('opura_electrical_takeoffs').insert(takeoffsToInsert).select();
            if (error) throw new Error(`Erro ao salvar quantitativos: ${error.message}`);
            return (data || []).map(mapTakeoffToCamelCase);
        }

        return [];
    }
};

// Helper mappers for snake_case vs camelCase

function toSnakeCaseObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const snakeObj: any = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        snakeObj[snakeKey] = obj[key];
    }
    return snakeObj;
}

function toCamelCaseObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const camelObj: any = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        camelObj[camelKey] = obj[key];
    }
    return camelObj;
}

const mapProjectToSnakeCase = toSnakeCaseObject;
const mapProjectToCamelCase = toCamelCaseObject;
const mapVersionToSnakeCase = toSnakeCaseObject;
const mapVersionToCamelCase = toCamelCaseObject;
const mapPlanToSnakeCase = toSnakeCaseObject;
const mapPlanToCamelCase = toCamelCaseObject;
const mapRoomToSnakeCase = toSnakeCaseObject;
const mapRoomToCamelCase = toCamelCaseObject;
const mapWallToSnakeCase = toSnakeCaseObject;
const mapWallToCamelCase = toCamelCaseObject;
const mapPointToSnakeCase = toSnakeCaseObject;
const mapPointToCamelCase = toCamelCaseObject;
const mapBoardToSnakeCase = toSnakeCaseObject;
const mapBoardToCamelCase = toCamelCaseObject;
const mapCircuitToSnakeCase = toSnakeCaseObject;
const mapCircuitToCamelCase = toCamelCaseObject;
const mapTakeoffToSnakeCase = toSnakeCaseObject;
const mapTakeoffToCamelCase = toCamelCaseObject;

