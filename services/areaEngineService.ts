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
    AreaVersionApproval,
    AreaVersionAuditLog,
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
export interface AreaBlockInput {
    code?: string;
    name: string;
    sortOrder?: number;
}

export interface AreaFloorInput {
    blockId: string;
    code?: string;
    name: string;
    floorType?: string;
    sortOrder?: number;
}

export interface AreaUnitInput {
    blockId: string;
    primaryFloorId?: string | null;
    code: string;
    name?: string;
    unitType?: string;
    typologyCode?: string;
    materializedIndex?: number;
}

export interface AreaSpaceInput {
    blockId: string;
    floorId?: string | null;
    unitId?: string | null;
    code?: string;
    name: string;
    useClass: 'private' | 'common';
    realArea: number;
    coverageClass?: string;
    commonDivisionClass?: 'proportional' | 'non_proportional';
    coefficientValue?: number | null;
    materializedIndex?: number;
    distributionScope?: 'global' | 'block';
}

function omitCloneFields<T extends Record<string, unknown>>(row: T): Omit<T, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'> {
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, created_by: _createdBy, updated_by: _updatedBy, ...rest } = row;
    return rest;
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


    async createRevisionFromVersion(sourceVersionId: string, label?: string): Promise<AreaVersion> {
        const sourceVersion = await this.getVersion(sourceVersionId);
        if (!sourceVersion) throw new Error('Versao de origem nao encontrada.');

        const versions = await this.listVersions(sourceVersion.area_project_id);
        const nextNumber = Math.max(0, ...versions.map(version => version.version_number || 0)) + 1;
        const revision = await this.createVersion({
            area_project_id: sourceVersion.area_project_id,
            version_number: nextNumber,
            version_label: label?.trim() || `Revisao ${nextNumber}`,
            source_version_id: sourceVersion.id,
            rounding_profile: sourceVersion.rounding_profile,
            normative_reference: sourceVersion.normative_reference,
            normative_valid_from: sourceVersion.normative_valid_from,
        });

        const [blocksRes, floorsRes, unitsRes, spacesRes, accessoryLinksRes, allocationsRes, scopesRes] = await Promise.all([
            supabase.from('area_version_blocks').select('*').eq('area_version_id', sourceVersionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_floors').select('*').eq('area_version_id', sourceVersionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_units').select('*').eq('area_version_id', sourceVersionId).order('materialized_index', { ascending: true }),
            supabase.from('area_version_spaces').select('*').eq('area_version_id', sourceVersionId).order('materialized_index', { ascending: true }),
            supabase.from('area_version_accessory_links').select('*').eq('area_version_id', sourceVersionId),
            supabase.from('area_version_common_allocations').select('*').eq('area_version_id', sourceVersionId),
            supabase.from('area_version_common_distribution_scopes').select('*').eq('area_version_id', sourceVersionId),
        ]);

        if (blocksRes.error) raiseAreaEngineError('createRevisionFromVersion.blocks.select', blocksRes.error);
        if (floorsRes.error) raiseAreaEngineError('createRevisionFromVersion.floors.select', floorsRes.error);
        if (unitsRes.error) raiseAreaEngineError('createRevisionFromVersion.units.select', unitsRes.error);
        if (spacesRes.error) raiseAreaEngineError('createRevisionFromVersion.spaces.select', spacesRes.error);
        if (accessoryLinksRes.error) raiseAreaEngineError('createRevisionFromVersion.accessoryLinks.select', accessoryLinksRes.error);
        if (allocationsRes.error) raiseAreaEngineError('createRevisionFromVersion.allocations.select', allocationsRes.error);
        if (scopesRes.error) raiseAreaEngineError('createRevisionFromVersion.scopes.select', scopesRes.error);

        const blockIdMap = new Map<string, string>();
        const floorIdMap = new Map<string, string>();
        const unitIdMap = new Map<string, string>();
        const spaceIdMap = new Map<string, string>();

        const sourceBlocks = (blocksRes.data || []) as Record<string, unknown>[];
        if (sourceBlocks.length > 0) {
            const { data, error } = await supabase
                .from('area_version_blocks')
                .insert(sourceBlocks.map(block => ({ ...omitCloneFields(block), area_version_id: revision.id })))
                .select('id');
            if (error) raiseAreaEngineError('createRevisionFromVersion.blocks.insert', error);
            sourceBlocks.forEach((block, index) => blockIdMap.set(String(block.id), data?.[index]?.id));
        }

        const sourceFloors = (floorsRes.data || []) as Record<string, unknown>[];
        if (sourceFloors.length > 0) {
            const { data, error } = await supabase
                .from('area_version_floors')
                .insert(sourceFloors.map(floor => ({
                    ...omitCloneFields(floor),
                    area_version_id: revision.id,
                    block_id: blockIdMap.get(String(floor.block_id)),
                    template_source_id: null,
                    materialization_batch_id: null,
                })))
                .select('id');
            if (error) raiseAreaEngineError('createRevisionFromVersion.floors.insert', error);
            sourceFloors.forEach((floor, index) => floorIdMap.set(String(floor.id), data?.[index]?.id));
        }

        const sourceUnits = (unitsRes.data || []) as Record<string, unknown>[];
        if (sourceUnits.length > 0) {
            const { data, error } = await supabase
                .from('area_version_units')
                .insert(sourceUnits.map(unit => ({
                    ...omitCloneFields(unit),
                    area_version_id: revision.id,
                    block_id: blockIdMap.get(String(unit.block_id)),
                    primary_floor_id: unit.primary_floor_id ? floorIdMap.get(String(unit.primary_floor_id)) : null,
                    template_source_id: null,
                    materialization_batch_id: null,
                })))
                .select('id');
            if (error) raiseAreaEngineError('createRevisionFromVersion.units.insert', error);
            sourceUnits.forEach((unit, index) => unitIdMap.set(String(unit.id), data?.[index]?.id));
        }

        const sourceSpaces = (spacesRes.data || []) as Record<string, unknown>[];
        if (sourceSpaces.length > 0) {
            const { data, error } = await supabase
                .from('area_version_spaces')
                .insert(sourceSpaces.map(space => ({
                    ...omitCloneFields(space),
                    area_version_id: revision.id,
                    block_id: blockIdMap.get(String(space.block_id)),
                    floor_id: space.floor_id ? floorIdMap.get(String(space.floor_id)) : null,
                    unit_id: space.unit_id ? unitIdMap.get(String(space.unit_id)) : null,
                    coefficient_id: null,
                    template_source_id: null,
                    materialization_batch_id: null,
                })))
                .select('id');
            if (error) raiseAreaEngineError('createRevisionFromVersion.spaces.insert', error);
            sourceSpaces.forEach((space, index) => spaceIdMap.set(String(space.id), data?.[index]?.id));
        }

        const sourceAccessoryLinks = (accessoryLinksRes.data || []) as Record<string, unknown>[];
        if (sourceAccessoryLinks.length > 0) {
            const { error } = await supabase
                .from('area_version_accessory_links')
                .insert(sourceAccessoryLinks.map(link => ({
                    ...omitCloneFields(link),
                    area_version_id: revision.id,
                    parent_unit_id: unitIdMap.get(String(link.parent_unit_id)),
                    accessory_space_id: link.accessory_space_id ? spaceIdMap.get(String(link.accessory_space_id)) : null,
                    accessory_unit_id: link.accessory_unit_id ? unitIdMap.get(String(link.accessory_unit_id)) : null,
                })));
            if (error) raiseAreaEngineError('createRevisionFromVersion.accessoryLinks.insert', error);
        }

        const sourceAllocations = (allocationsRes.data || []) as Record<string, unknown>[];
        if (sourceAllocations.length > 0) {
            const { error } = await supabase
                .from('area_version_common_allocations')
                .insert(sourceAllocations.map(allocation => ({
                    ...omitCloneFields(allocation),
                    area_version_id: revision.id,
                    common_space_id: spaceIdMap.get(String(allocation.common_space_id)),
                    target_unit_id: unitIdMap.get(String(allocation.target_unit_id)),
                })));
            if (error) raiseAreaEngineError('createRevisionFromVersion.allocations.insert', error);
        }
        const sourceScopes = (scopesRes.data || []) as Record<string, unknown>[];
        if (sourceScopes.length > 0) {
            const { error } = await supabase
                .from('area_version_common_distribution_scopes')
                .insert(sourceScopes.map(scope => ({
                    ...omitCloneFields(scope),
                    area_version_id: revision.id,
                    common_space_id: spaceIdMap.get(String(scope.common_space_id)),
                    block_id: scope.block_id ? blockIdMap.get(String(scope.block_id)) : null,
                })));
            if (error) raiseAreaEngineError('createRevisionFromVersion.scopes.insert', error);
        }

        const { error: auditError } = await supabase
            .from('area_version_audit_logs')
            .insert({
                area_version_id: revision.id,
                entity_type: 'area_versions',
                entity_id: revision.id,
                action: 'create',
                field_name: 'source_version_id',
                old_value: null,
                new_value: { source_version_id: sourceVersion.id, source_version_number: sourceVersion.version_number },
                reason: 'Nova revisao criada a partir de versao existente',
            });
        if (auditError) raiseAreaEngineError('createRevisionFromVersion.audit', auditError);

        return revision;
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


    async listApprovals(versionId: string): Promise<AreaVersionApproval[]> {
        const { data, error } = await supabase
            .from('area_version_approvals')
            .select('*')
            .eq('area_version_id', versionId)
            .order('approval_type', { ascending: true });

        if (error) raiseAreaEngineError('listApprovals', error);
        return (data || []) as AreaVersionApproval[];
    },


    async recordExportAudit(versionId: string, exportType: 'pdf' | 'xlsx', payload: Record<string, unknown>): Promise<void> {
        const { error } = await supabase
            .from('area_version_audit_logs')
            .insert({
                area_version_id: versionId,
                entity_type: 'area_export_package',
                entity_id: versionId,
                action: 'export',
                field_name: exportType,
                old_value: null,
                new_value: payload,
                reason: `Exportacao ${exportType.toUpperCase()} via app`,
            });

        if (error) raiseAreaEngineError('recordExportAudit', error);
    },
    async listAuditLogs(versionId: string, limit = 20): Promise<AreaVersionAuditLog[]> {
        const { data, error } = await supabase
            .from('area_version_audit_logs')
            .select('*')
            .eq('area_version_id', versionId)
            .order('performed_at', { ascending: false })
            .limit(limit);

        if (error) raiseAreaEngineError('listAuditLogs', error);
        return (data || []) as AreaVersionAuditLog[];
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

    async createBlock(versionId: string, input: AreaBlockInput): Promise<AreaVersionBlock> {
        const { data, error } = await supabase
            .from('area_version_blocks')
            .insert({
                area_version_id: versionId,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                sort_order: input.sortOrder ?? 0,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createBlock', error);
        return data as AreaVersionBlock;
    },

    async updateBlock(blockId: string, input: AreaBlockInput): Promise<AreaVersionBlock> {
        const { data, error } = await supabase
            .from('area_version_blocks')
            .update({
                code: input.code?.trim() || null,
                name: input.name.trim(),
                sort_order: input.sortOrder ?? 0,
            })
            .eq('id', blockId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateBlock', error);
        return data as AreaVersionBlock;
    },

    async createFloor(versionId: string, input: AreaFloorInput): Promise<AreaVersionFloor> {
        const sortOrder = input.sortOrder ?? 0;
        const { data, error } = await supabase
            .from('area_version_floors')
            .insert({
                area_version_id: versionId,
                block_id: input.blockId,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                floor_type: input.floorType || 'other',
                sort_order: sortOrder,
                is_template: false,
                is_materialized: true,
                materialized_label: input.name.trim(),
                materialized_index: sortOrder,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createFloor', error);
        return data as AreaVersionFloor;
    },

    async updateFloor(floorId: string, input: AreaFloorInput): Promise<AreaVersionFloor> {
        const sortOrder = input.sortOrder ?? 0;
        const { data, error } = await supabase
            .from('area_version_floors')
            .update({
                block_id: input.blockId,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                floor_type: input.floorType || 'other',
                sort_order: sortOrder,
                materialized_label: input.name.trim(),
                materialized_index: sortOrder,
            })
            .eq('id', floorId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateFloor', error);
        return data as AreaVersionFloor;
    },

    async createUnit(versionId: string, input: AreaUnitInput): Promise<AreaVersionUnit> {
        const materializedIndex = input.materializedIndex ?? 0;
        const { data, error } = await supabase
            .from('area_version_units')
            .insert({
                area_version_id: versionId,
                block_id: input.blockId,
                primary_floor_id: input.primaryFloorId || null,
                code: input.code.trim(),
                name: input.name?.trim() || null,
                unit_type: input.unitType || 'apartment',
                typology_code: input.typologyCode?.trim() || null,
                is_autonomous: true,
                is_active: true,
                is_template: false,
                is_materialized: true,
                materialized_label: input.code.trim(),
                materialized_index: materializedIndex,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createUnit', error);
        return data as AreaVersionUnit;
    },

    async updateUnit(unitId: string, input: AreaUnitInput): Promise<AreaVersionUnit> {
        const materializedIndex = input.materializedIndex ?? 0;
        const { data, error } = await supabase
            .from('area_version_units')
            .update({
                block_id: input.blockId,
                primary_floor_id: input.primaryFloorId || null,
                code: input.code.trim(),
                name: input.name?.trim() || null,
                unit_type: input.unitType || 'apartment',
                typology_code: input.typologyCode?.trim() || null,
                materialized_label: input.code.trim(),
                materialized_index: materializedIndex,
            })
            .eq('id', unitId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateUnit', error);
        return data as AreaVersionUnit;
    },

    async createSpace(versionId: string, input: AreaSpaceInput): Promise<AreaVersionSpace> {
        const isCommon = input.useClass === 'common';
        const commonDivisionClass = isCommon ? (input.commonDivisionClass || 'proportional') : 'not_applicable';
        const coefficientValue = input.coefficientValue === undefined ? 1 : input.coefficientValue;
        const materializedIndex = input.materializedIndex ?? 0;

        const { data, error } = await supabase
            .from('area_version_spaces')
            .insert({
                area_version_id: versionId,
                block_id: input.blockId,
                floor_id: input.floorId || null,
                unit_id: isCommon ? null : input.unitId || null,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                use_class: input.useClass,
                private_nature: isCommon ? 'not_applicable' : 'main',
                coverage_class: input.coverageClass || 'covered_standard',
                common_division_class: commonDivisionClass,
                ownership_accounting_mode: isCommon ? 'common_area' : 'direct_unit',
                real_area_m2_raw: input.realArea,
                coefficient_value: coefficientValue,
                source_type: 'manual',
                is_template: false,
                is_materialized: true,
                materialized_label: input.name.trim(),
                materialized_index: materializedIndex,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createSpace', error);
        const space = data as AreaVersionSpace;

        if (isCommon) {
            const distributionScope = input.distributionScope || 'global';
            const { error: scopeError } = await supabase
                .from('area_version_common_distribution_scopes')
                .insert({
                    area_version_id: versionId,
                    common_space_id: space.id,
                    distribution_scope: distributionScope,
                    block_id: distributionScope === 'block' ? input.blockId : null,
                    notes: 'Escopo criado pelo editor granular do app',
                });
            if (scopeError) raiseAreaEngineError('createSpace.scope', scopeError);
        }

        return space;
    },

    async updateSpace(spaceId: string, input: AreaSpaceInput): Promise<AreaVersionSpace> {
        const isCommon = input.useClass === 'common';
        const commonDivisionClass = isCommon ? (input.commonDivisionClass || 'proportional') : 'not_applicable';
        const coefficientValue = input.coefficientValue === undefined ? 1 : input.coefficientValue;
        const materializedIndex = input.materializedIndex ?? 0;

        const { data, error } = await supabase
            .from('area_version_spaces')
            .update({
                block_id: input.blockId,
                floor_id: input.floorId || null,
                unit_id: isCommon ? null : input.unitId || null,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                use_class: input.useClass,
                private_nature: isCommon ? 'not_applicable' : 'main',
                coverage_class: input.coverageClass || 'covered_standard',
                common_division_class: commonDivisionClass,
                ownership_accounting_mode: isCommon ? 'common_area' : 'direct_unit',
                real_area_m2_raw: input.realArea,
                coefficient_value: coefficientValue,
                materialized_label: input.name.trim(),
                materialized_index: materializedIndex,
            })
            .eq('id', spaceId)
            .select()
            .single();

        if (error) raiseAreaEngineError('updateSpace', error);
        const space = data as AreaVersionSpace;

        if (isCommon) {
            const distributionScope = input.distributionScope || 'global';
            const { error: scopeError } = await supabase
                .from('area_version_common_distribution_scopes')
                .upsert({
                    area_version_id: space.area_version_id,
                    common_space_id: space.id,
                    distribution_scope: distributionScope,
                    block_id: distributionScope === 'block' ? input.blockId : null,
                    notes: 'Escopo atualizado pelo editor granular do app',
                }, { onConflict: 'area_version_id,common_space_id' });
            if (scopeError) raiseAreaEngineError('updateSpace.scope', scopeError);
        } else {
            const { error: scopeError } = await supabase
                .from('area_version_common_distribution_scopes')
                .delete()
                .eq('common_space_id', space.id);
            if (scopeError) raiseAreaEngineError('updateSpace.scopeDelete', scopeError);
        }

        return space;
    },

    async deleteBlock(blockId: string): Promise<void> {
        const { error } = await supabase.from('area_version_blocks').delete().eq('id', blockId);
        if (error) raiseAreaEngineError('deleteBlock', error);
    },

    async deleteFloor(floorId: string): Promise<void> {
        const { error } = await supabase.from('area_version_floors').delete().eq('id', floorId);
        if (error) raiseAreaEngineError('deleteFloor', error);
    },

    async deleteUnit(unitId: string): Promise<void> {
        const { error: spacesError } = await supabase.from('area_version_spaces').delete().eq('unit_id', unitId);
        if (spacesError) raiseAreaEngineError('deleteUnit.spaces', spacesError);
        const { error } = await supabase.from('area_version_units').delete().eq('id', unitId);
        if (error) raiseAreaEngineError('deleteUnit', error);
    },

    async deleteSpace(spaceId: string): Promise<void> {
        const { error } = await supabase.from('area_version_spaces').delete().eq('id', spaceId);
        if (error) raiseAreaEngineError('deleteSpace', error);
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
