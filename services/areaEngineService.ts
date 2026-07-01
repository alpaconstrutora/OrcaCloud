import { supabase } from '../lib/supabase';
import type {
    AreaApprovalType,
    AreaEngineRpcResult,
    AreaFractionIdeal,
    AreaProject,
    AreaProjectInsert,
    AreaProjectUpdate,
    AreaQuadroIIRow,
    AreaQuadroIRow,
    AreaQuadroIVBRow,
    AreaVersion,
    AreaVersionInsert,
    AreaVersionUpdate,
    AreaVersionStructure,
    AreaVersionBlock,
    AreaVersionFloor,
    AreaVersionUnit,
    AreaVersionSpace,
} from '../types/areaEngine';

export interface AreaMinimalStructureInput {
    blockCode?: string;
    blockName?: string;
    floorCode?: string;
    floorName?: string;
    unit1Code?: string;
    unit1Area: number;
    unit2Code?: string;
    unit2Area: number;
    commonArea: number;
}

function raiseAreaEngineError(context: string, error: { message: string }): never {
    console.error(`[areaEngineService] ${context}:`, error);
    throw new Error(`Erro no motor de areas: ${error.message}`);
}

export const areaEngineService = {
    async listProjects(organizationId: string): Promise<AreaProject[]> {
        const { data, error } = await supabase
            .from('area_projects')
            .select('*')
            .eq('organization_id', organizationId)
            .order('updated_at', { ascending: false });

        if (error) raiseAreaEngineError('listProjects', error);
        return (data || []) as AreaProject[];
    },

    async getProject(projectId: string): Promise<AreaProject | null> {
        const { data, error } = await supabase
            .from('area_projects')
            .select('*')
            .eq('id', projectId)
            .maybeSingle();

        if (error) raiseAreaEngineError('getProject', error);
        return data as AreaProject | null;
    },

    async createProject(project: AreaProjectInsert): Promise<AreaProject> {
        const { data, error } = await supabase
            .from('area_projects')
            .insert(project)
            .select()
            .single();

        if (error) raiseAreaEngineError('createProject', error);
        return data as AreaProject;
    },

    async updateProject(projectId: string, updates: AreaProjectUpdate): Promise<AreaProject> {
        const { data, error } = await supabase
            .from('area_projects')
            .update(updates)
            .eq('id', projectId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateProject', error);
        return data as AreaProject;
    },

    async listVersions(areaProjectId: string): Promise<AreaVersion[]> {
        const { data, error } = await supabase
            .from('area_versions')
            .select('*')
            .eq('area_project_id', areaProjectId)
            .order('version_number', { ascending: false });

        if (error) raiseAreaEngineError('listVersions', error);
        return (data || []) as AreaVersion[];
    },

    async getVersion(versionId: string): Promise<AreaVersion | null> {
        const { data, error } = await supabase
            .from('area_versions')
            .select('*')
            .eq('id', versionId)
            .maybeSingle();

        if (error) raiseAreaEngineError('getVersion', error);
        return data as AreaVersion | null;
    },

    async createVersion(version: AreaVersionInsert): Promise<AreaVersion> {
        const { data, error } = await supabase
            .from('area_versions')
            .insert(version)
            .select()
            .single();

        if (error) raiseAreaEngineError('createVersion', error);
        return data as AreaVersion;
    },

    async updateVersion(versionId: string, updates: AreaVersionUpdate): Promise<AreaVersion> {
        const { data, error } = await supabase
            .from('area_versions')
            .update(updates)
            .eq('id', versionId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateVersion', error);
        return data as AreaVersion;
    },

    async validateVersion(versionId: string): Promise<AreaEngineRpcResult> {
        const { data, error } = await supabase.rpc('validate_area_version', {
            p_area_version_id: versionId,
        });

        if (error) raiseAreaEngineError('validateVersion', error);
        return data as AreaEngineRpcResult;
    },

    async calculateVersion(versionId: string): Promise<AreaEngineRpcResult> {
        const { data, error } = await supabase.rpc('calculate_area_version', {
            p_area_version_id: versionId,
        });

        if (error) raiseAreaEngineError('calculateVersion', error);
        return data as AreaEngineRpcResult;
    },

    async approveVersion(
        versionId: string,
        approvalType: AreaApprovalType,
        comments?: string,
    ): Promise<AreaEngineRpcResult> {
        const { data, error } = await supabase.rpc('approve_area_version', {
            p_area_version_id: versionId,
            p_approval_type: approvalType,
            p_comments: comments ?? null,
        });

        if (error) raiseAreaEngineError('approveVersion', error);
        return data as AreaEngineRpcResult;
    },

    async lockVersion(versionId: string): Promise<AreaEngineRpcResult> {
        const { data, error } = await supabase.rpc('lock_area_version', {
            p_area_version_id: versionId,
        });

        if (error) raiseAreaEngineError('lockVersion', error);
        return data as AreaEngineRpcResult;
    },

    async supersedeVersion(versionId: string, reason?: string): Promise<AreaEngineRpcResult> {
        const { data, error } = await supabase.rpc('supersede_area_version', {
            p_area_version_id: versionId,
            p_reason: reason ?? null,
        });

        if (error) raiseAreaEngineError('supersedeVersion', error);
        return data as AreaEngineRpcResult;
    },

    async getStructure(versionId: string): Promise<AreaVersionStructure> {
        const [blocksRes, floorsRes, unitsRes, spacesRes] = await Promise.all([
            supabase.from('area_version_blocks').select('*').eq('area_version_id', versionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_floors').select('*').eq('area_version_id', versionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_units').select('*').eq('area_version_id', versionId).order('materialized_index', { ascending: true }),
            supabase.from('area_version_spaces').select('*').eq('area_version_id', versionId).order('materialized_index', { ascending: true }),
        ]);

        if (blocksRes.error) raiseAreaEngineError('getStructure.blocks', blocksRes.error);
        if (floorsRes.error) raiseAreaEngineError('getStructure.floors', floorsRes.error);
        if (unitsRes.error) raiseAreaEngineError('getStructure.units', unitsRes.error);
        if (spacesRes.error) raiseAreaEngineError('getStructure.spaces', spacesRes.error);

        return {
            blocks: (blocksRes.data || []) as AreaVersionBlock[],
            floors: (floorsRes.data || []) as AreaVersionFloor[],
            units: (unitsRes.data || []) as AreaVersionUnit[],
            spaces: (spacesRes.data || []) as AreaVersionSpace[],
        };
    },
    async createMinimalStructure(versionId: string, input: AreaMinimalStructureInput): Promise<void> {
        const { count, error: countError } = await supabase
            .from('area_version_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('area_version_id', versionId);

        if (countError) raiseAreaEngineError('createMinimalStructure.countBlocks', countError);
        if ((count ?? 0) > 0) {
            throw new Error('Esta versao ja possui estrutura cadastrada. Edicao granular entra no proximo passo.');
        }

        const { data: block, error: blockError } = await supabase
            .from('area_version_blocks')
            .insert({
                area_version_id: versionId,
                code: input.blockCode || 'T1',
                name: input.blockName || 'Torre Unica',
                sort_order: 1,
            })
            .select('id')
            .single();
        if (blockError) raiseAreaEngineError('createMinimalStructure.block', blockError);

        const { data: floor, error: floorError } = await supabase
            .from('area_version_floors')
            .insert({
                area_version_id: versionId,
                block_id: block.id,
                code: input.floorCode || 'TER',
                name: input.floorName || 'Terreo',
                floor_type: 'ground',
                sort_order: 1,
                is_template: false,
                is_materialized: true,
                materialized_label: input.floorName || 'Terreo',
                materialized_index: 1,
            })
            .select('id')
            .single();
        if (floorError) raiseAreaEngineError('createMinimalStructure.floor', floorError);

        const { data: units, error: unitsError } = await supabase
            .from('area_version_units')
            .insert([
                {
                    area_version_id: versionId,
                    block_id: block.id,
                    primary_floor_id: floor.id,
                    code: input.unit1Code || 'Unidade 01',
                    unit_type: 'apartment',
                    typology_code: 'Tipo A',
                    is_autonomous: true,
                    is_active: true,
                    is_template: false,
                    is_materialized: true,
                    materialized_label: input.unit1Code || 'Unidade 01',
                    materialized_index: 1,
                },
                {
                    area_version_id: versionId,
                    block_id: block.id,
                    primary_floor_id: floor.id,
                    code: input.unit2Code || 'Unidade 02',
                    unit_type: 'apartment',
                    typology_code: 'Tipo A',
                    is_autonomous: true,
                    is_active: true,
                    is_template: false,
                    is_materialized: true,
                    materialized_label: input.unit2Code || 'Unidade 02',
                    materialized_index: 2,
                },
            ])
            .select('id, code')
            .order('code', { ascending: true });
        if (unitsError) raiseAreaEngineError('createMinimalStructure.units', unitsError);
        if (!units || units.length !== 2) throw new Error('Erro ao criar unidades da estrutura minima.');

        const unit1 = units.find(u => u.code === (input.unit1Code || 'Unidade 01')) || units[0];
        const unit2 = units.find(u => u.code === (input.unit2Code || 'Unidade 02')) || units[1];

        const { data: spaces, error: spacesError } = await supabase
            .from('area_version_spaces')
            .insert([
                {
                    area_version_id: versionId,
                    block_id: block.id,
                    floor_id: floor.id,
                    unit_id: unit1.id,
                    code: `${unit1.code}-PRIV`,
                    name: `Area privativa ${unit1.code}`,
                    use_class: 'private',
                    private_nature: 'main',
                    coverage_class: 'covered_standard',
                    common_division_class: 'not_applicable',
                    ownership_accounting_mode: 'direct_unit',
                    real_area_m2_raw: input.unit1Area,
                    coefficient_value: 1,
                    source_type: 'manual',
                    is_template: false,
                    is_materialized: true,
                    materialized_label: `Area privativa ${unit1.code}`,
                    materialized_index: 1,
                },
                {
                    area_version_id: versionId,
                    block_id: block.id,
                    floor_id: floor.id,
                    unit_id: unit2.id,
                    code: `${unit2.code}-PRIV`,
                    name: `Area privativa ${unit2.code}`,
                    use_class: 'private',
                    private_nature: 'main',
                    coverage_class: 'covered_standard',
                    common_division_class: 'not_applicable',
                    ownership_accounting_mode: 'direct_unit',
                    real_area_m2_raw: input.unit2Area,
                    coefficient_value: 1,
                    source_type: 'manual',
                    is_template: false,
                    is_materialized: true,
                    materialized_label: `Area privativa ${unit2.code}`,
                    materialized_index: 2,
                },
                {
                    area_version_id: versionId,
                    block_id: block.id,
                    floor_id: floor.id,
                    unit_id: null,
                    code: 'HALL-COMUM',
                    name: 'Area comum proporcional',
                    use_class: 'common',
                    private_nature: 'not_applicable',
                    coverage_class: 'covered_standard',
                    common_division_class: 'proportional',
                    ownership_accounting_mode: 'common_area',
                    real_area_m2_raw: input.commonArea,
                    coefficient_value: 1,
                    source_type: 'manual',
                    is_template: false,
                    is_materialized: true,
                    materialized_label: 'Area comum proporcional',
                    materialized_index: 3,
                },
            ])
            .select('id, code');
        if (spacesError) raiseAreaEngineError('createMinimalStructure.spaces', spacesError);

        const commonSpace = spaces?.find(space => space.code === 'HALL-COMUM');
        if (!commonSpace) throw new Error('Erro ao criar area comum proporcional.');

        const { error: scopeError } = await supabase
            .from('area_version_common_distribution_scopes')
            .insert({
                area_version_id: versionId,
                common_space_id: commonSpace.id,
                distribution_scope: 'global',
                block_id: null,
                notes: 'Escopo global criado pelo fluxo minimo do app',
            });
        if (scopeError) raiseAreaEngineError('createMinimalStructure.scope', scopeError);
    },
    async listQuadroI(versionId: string): Promise<AreaQuadroIRow[]> {
        const { data, error } = await supabase
            .from('area_version_quadro_i_rows')
            .select('*')
            .eq('area_version_id', versionId)
            .order('row_order', { ascending: true });

        if (error) raiseAreaEngineError('listQuadroI', error);
        return (data || []) as AreaQuadroIRow[];
    },

    async listQuadroII(versionId: string): Promise<AreaQuadroIIRow[]> {
        const { data, error } = await supabase
            .from('area_version_quadro_ii_rows')
            .select('*')
            .eq('area_version_id', versionId)
            .order('row_order', { ascending: true });

        if (error) raiseAreaEngineError('listQuadroII', error);
        return (data || []) as AreaQuadroIIRow[];
    },

    async listQuadroIVB(versionId: string): Promise<AreaQuadroIVBRow[]> {
        const { data, error } = await supabase
            .from('area_version_quadro_ivb_rows')
            .select('*')
            .eq('area_version_id', versionId)
            .order('row_order', { ascending: true });

        if (error) raiseAreaEngineError('listQuadroIVB', error);
        return (data || []) as AreaQuadroIVBRow[];
    },

    async listFractions(versionId: string): Promise<AreaFractionIdeal[]> {
        const { data, error } = await supabase
            .from('area_version_fraction_ideals')
            .select('*')
            .eq('area_version_id', versionId);

        if (error) raiseAreaEngineError('listFractions', error);
        return (data || []) as AreaFractionIdeal[];
    },
};



