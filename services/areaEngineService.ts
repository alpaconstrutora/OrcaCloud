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
    AreaVersionCommonDistributionScope,
    AreaVersionUnitAccessoryLink,
    AreaVersionCommonAllocation,
} from '../types/areaEngine';
import { empreendimentoService } from './empreendimentoService';
import type {
    EmpreendimentoWithChildren,
    EmpreendimentoTipo,
    FloorTipo,
} from '../types/empreendimento';

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

export interface AreaAccessoryLinkInput {
    parentUnitId: string;
    accessoryUnitId: string;
    linkType: 'parking' | 'storage' | 'box' | 'exclusive_area' | 'other';
    affectsPrivateArea: boolean;
    affectsCoefficient: boolean;
    legalNote?: string;
}

export interface AreaCommonAllocationInput {
    commonSpaceId: string;
    targetUnitId: string;
    allocationMethod: 'fixed_area' | 'percentage';
    allocatedRealArea?: number | null;
    percentage?: number | null;
    justification?: string;
}

function omitCloneFields<T extends Record<string, unknown>>(row: T): Omit<T, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'> {
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, created_by: _createdBy, updated_by: _updatedBy, ...rest } = row;
    return rest;
}
function raiseAreaEngineError(context: string, error: { message: string }): never {
    console.error(`[areaEngineService] ${context}:`, error);
    throw new Error(`Erro no motor de areas: ${error.message}`);
}

type AreaAuditAction = 'create' | 'update' | 'delete' | 'calculate' | 'approve' | 'reject' | 'lock' | 'export';

async function recordStructureAudit(input: {
    versionId: string;
    entityType: string;
    entityId?: string | null;
    action: AreaAuditAction;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    reason: string;
}): Promise<void> {
    const { error } = await supabase
        .from('area_version_audit_logs')
        .insert({
            area_version_id: input.versionId,
            entity_type: input.entityType,
            entity_id: input.entityId || null,
            action: input.action,
            field_name: 'structure',
            old_value: input.oldValue || null,
            new_value: input.newValue || null,
            reason: input.reason,
        });

    if (error) raiseAreaEngineError(`recordStructureAudit.${input.entityType}.${input.action}`, error);
}

async function invalidateVersionCalculation(versionId: string): Promise<void> {
    const deletions = await Promise.all([
        supabase.from('area_version_quadro_i_rows').delete().eq('area_version_id', versionId),
        supabase.from('area_version_quadro_ii_rows').delete().eq('area_version_id', versionId),
        supabase.from('area_version_quadro_ivb_rows').delete().eq('area_version_id', versionId),
        supabase.from('area_version_fraction_ideals').delete().eq('area_version_id', versionId),
    ]);

    deletions.forEach((result, index) => {
        if (result.error) {
            const labels = ['quadro_i', 'quadro_ii', 'quadro_ivb', 'fractions'];
            raiseAreaEngineError(`invalidateVersionCalculation.${labels[index]}`, result.error);
        }
    });

    const { error } = await supabase
        .from('area_versions')
        .update({
            status: 'draft',
            version_payload_hash: null,
            version_identity_hash: null,
            canonical_payload_json: null,
            locked_at: null,
        })
        .eq('id', versionId)
        .in('status', ['draft', 'calculated']);

    if (error) raiseAreaEngineError('invalidateVersionCalculation.version', error);
}

// ── Import de Empreendimento → projeto de áreas (Camada A do PLANO) ──────────
export interface AreaResyncDrift {
    blocksAdded: string[];
    blocksRemoved: string[];
    unitsAdded: string[];
    unitsRemoved: string[];
    unitsAreaChanged: { code: string; before: number; after: number }[];
}

export interface AreaImportReport {
    projectId: string;
    versionId: string;
    blocks: number;
    floors: number;
    units: number;
    privateSpaces: number;
    commonSpaces: number;
    skippedUnitsNoArea: number;
    skippedCommonsNoArea: number;
    // F3 — re-sincronização
    isNewProject: boolean;
    versionNumber: number;
    previousVersionId: string | null;
    drift: AreaResyncDrift | null;
    warnings: string[];
}

// F4 — escrita reversa: fração ideal calculada (Quadro IV-B) → cadastro do Empreendimento.
export interface AreaWriteBackReport {
    unitsUpdated: number;
    unitsWithoutSource: number; // unidades da versão sem source_empreendimento_unit_id (criadas manualmente no editor)
    warnings: string[];
}

function mapEmpreendimentoTipo(tipo?: EmpreendimentoTipo | null): AreaProject['project_type'] {
    switch (tipo) {
        case 'VERTICAL': return 'vertical';
        case 'HORIZONTAL': return 'horizontal';
        case 'MISTO': return 'mixed';
        case 'COND_LOGISTICO':
        case 'COND_INDUSTRIAL': return 'commercial';
        default: return 'vertical';
    }
}

// FloorTipo do Empreendimento → area_floor_type do motor. Sem correspondência clara
// (MEZANINO/GARAGEM/OUTRO) cai em 'other'; quando o tipo vem nulo, infere pelo número.
function mapFloorTipo(tipo?: FloorTipo | null, floorNumber?: number): string {
    switch (tipo) {
        case 'SUBSOLO': return 'basement';
        case 'TERREO': return 'ground';
        case 'TIPO': return 'type';
        case 'COBERTURA': return 'roof';
        case 'TECNICO': return 'technical';
        case 'MEZANINO':
        case 'GARAGEM':
        case 'OUTRO': return 'other';
        default:
            if (floorNumber === undefined || floorNumber === null) return 'type';
            if (floorNumber < 0) return 'basement';
            if (floorNumber === 0) return 'ground';
            return 'type';
    }
}

function floorLabelFromNumber(floorNumber: number): string {
    if (floorNumber < 0) return `Subsolo ${Math.abs(floorNumber)}`;
    if (floorNumber === 0) return 'Térreo';
    return `Pavimento ${floorNumber}`;
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

    // F3: projeto de áreas já vinculado a um empreendimento (o mais antigo, se houver vários).
    async getProjectByEmpreendimento(empreendimentoId: string, organizationId: string): Promise<AreaProject | null> {
        const { data, error } = await supabase
            .from('area_projects')
            .select('*')
            .eq('empreendimento_id', empreendimentoId)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) raiseAreaEngineError('getProjectByEmpreendimento', error);
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
            supabase.from('area_version_unit_accessory_links').select('*').eq('area_version_id', sourceVersionId),
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
                .from('area_version_unit_accessory_links')
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
        const [blocksRes, floorsRes, unitsRes, spacesRes, scopesRes, accessoryLinksRes, allocationsRes] = await Promise.all([
            supabase.from('area_version_blocks').select('*').eq('area_version_id', versionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_floors').select('*').eq('area_version_id', versionId).order('sort_order', { ascending: true }),
            supabase.from('area_version_units').select('*').eq('area_version_id', versionId).order('materialized_index', { ascending: true }),
            supabase.from('area_version_spaces').select('*').eq('area_version_id', versionId).order('materialized_index', { ascending: true }),
            supabase.from('area_version_common_distribution_scopes').select('*').eq('area_version_id', versionId),
            supabase.from('area_version_unit_accessory_links').select('*').eq('area_version_id', versionId),
            supabase.from('area_version_common_allocations').select('*').eq('area_version_id', versionId),
        ]);

        if (blocksRes.error) raiseAreaEngineError('getStructure.blocks', blocksRes.error);
        if (floorsRes.error) raiseAreaEngineError('getStructure.floors', floorsRes.error);
        if (unitsRes.error) raiseAreaEngineError('getStructure.units', unitsRes.error);
        if (spacesRes.error) raiseAreaEngineError('getStructure.spaces', spacesRes.error);
        if (scopesRes.error) raiseAreaEngineError('getStructure.scopes', scopesRes.error);
        if (accessoryLinksRes.error) raiseAreaEngineError('getStructure.accessoryLinks', accessoryLinksRes.error);
        if (allocationsRes.error) raiseAreaEngineError('getStructure.allocations', allocationsRes.error);

        return {
            blocks: (blocksRes.data || []) as AreaVersionBlock[],
            floors: (floorsRes.data || []) as AreaVersionFloor[],
            units: (unitsRes.data || []) as AreaVersionUnit[],
            spaces: (spacesRes.data || []) as AreaVersionSpace[],
            commonDistributionScopes: (scopesRes.data || []) as AreaVersionCommonDistributionScope[],
            accessoryLinks: (accessoryLinksRes.data || []) as AreaVersionUnitAccessoryLink[],
            commonAllocations: (allocationsRes.data || []) as AreaVersionCommonAllocation[],
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
        const block = data as AreaVersionBlock;
        await recordStructureAudit({
            versionId,
            entityType: 'area_version_block',
            entityId: block.id,
            action: 'create',
            newValue: block as Record<string, unknown>,
            reason: 'Bloco criado pelo editor granular do app',
        });
        await invalidateVersionCalculation(versionId);
        return block;
    },

    async updateBlock(blockId: string, input: AreaBlockInput): Promise<AreaVersionBlock> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_blocks')
            .select('*')
            .eq('id', blockId)
            .single();
        if (beforeError) raiseAreaEngineError('updateBlock.before', beforeError);

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
        const block = data as AreaVersionBlock;
        await recordStructureAudit({
            versionId: block.area_version_id,
            entityType: 'area_version_block',
            entityId: block.id,
            action: 'update',
            oldValue: before as Record<string, unknown>,
            newValue: block as Record<string, unknown>,
            reason: 'Bloco atualizado pelo editor granular do app',
        });
        await invalidateVersionCalculation(block.area_version_id);
        return block;
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
        const floor = data as AreaVersionFloor;
        await recordStructureAudit({
            versionId,
            entityType: 'area_version_floor',
            entityId: floor.id,
            action: 'create',
            newValue: floor as Record<string, unknown>,
            reason: 'Pavimento criado pelo editor granular do app',
        });
        await invalidateVersionCalculation(versionId);
        return floor;
    },

    async updateFloor(floorId: string, input: AreaFloorInput): Promise<AreaVersionFloor> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_floors')
            .select('*')
            .eq('id', floorId)
            .single();
        if (beforeError) raiseAreaEngineError('updateFloor.before', beforeError);

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
        const floor = data as AreaVersionFloor;
        await recordStructureAudit({
            versionId: floor.area_version_id,
            entityType: 'area_version_floor',
            entityId: floor.id,
            action: 'update',
            oldValue: before as Record<string, unknown>,
            newValue: floor as Record<string, unknown>,
            reason: 'Pavimento atualizado pelo editor granular do app',
        });
        await invalidateVersionCalculation(floor.area_version_id);
        return floor;
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
        const unit = data as AreaVersionUnit;
        await recordStructureAudit({
            versionId,
            entityType: 'area_version_unit',
            entityId: unit.id,
            action: 'create',
            newValue: unit as Record<string, unknown>,
            reason: 'Unidade criada pelo editor granular do app',
        });
        await invalidateVersionCalculation(versionId);
        return unit;
    },

    async updateUnit(unitId: string, input: AreaUnitInput): Promise<AreaVersionUnit> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_units')
            .select('*')
            .eq('id', unitId)
            .single();
        if (beforeError) raiseAreaEngineError('updateUnit.before', beforeError);

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
        const unit = data as AreaVersionUnit;
        await recordStructureAudit({
            versionId: unit.area_version_id,
            entityType: 'area_version_unit',
            entityId: unit.id,
            action: 'update',
            oldValue: before as Record<string, unknown>,
            newValue: unit as Record<string, unknown>,
            reason: 'Unidade atualizada pelo editor granular do app',
        });
        await invalidateVersionCalculation(unit.area_version_id);
        return unit;
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

        await recordStructureAudit({
            versionId,
            entityType: 'area_version_space',
            entityId: space.id,
            action: 'create',
            newValue: space as Record<string, unknown>,
            reason: 'Espaco criado pelo editor granular do app',
        });
        await invalidateVersionCalculation(versionId);
        return space;
    },

    async updateSpace(spaceId: string, input: AreaSpaceInput): Promise<AreaVersionSpace> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_spaces')
            .select('*')
            .eq('id', spaceId)
            .single();
        if (beforeError) raiseAreaEngineError('updateSpace.before', beforeError);

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

        await recordStructureAudit({
            versionId: space.area_version_id,
            entityType: 'area_version_space',
            entityId: space.id,
            action: 'update',
            oldValue: before as Record<string, unknown>,
            newValue: space as Record<string, unknown>,
            reason: 'Espaco atualizado pelo editor granular do app',
        });
        await invalidateVersionCalculation(space.area_version_id);
        return space;
    },

    async deleteBlock(blockId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_blocks')
            .select('*')
            .eq('id', blockId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteBlock.before', beforeError);

        const { error } = await supabase.from('area_version_blocks').delete().eq('id', blockId);
        if (error) raiseAreaEngineError('deleteBlock', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_block',
            entityId: blockId,
            action: 'delete',
            oldValue: before as Record<string, unknown>,
            reason: 'Bloco removido pelo editor granular do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
    },

    async deleteFloor(floorId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_floors')
            .select('*')
            .eq('id', floorId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteFloor.before', beforeError);

        const { error } = await supabase.from('area_version_floors').delete().eq('id', floorId);
        if (error) raiseAreaEngineError('deleteFloor', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_floor',
            entityId: floorId,
            action: 'delete',
            oldValue: before as Record<string, unknown>,
            reason: 'Pavimento removido pelo editor granular do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
    },

    async deleteUnit(unitId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_units')
            .select('*')
            .eq('id', unitId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteUnit.before', beforeError);

        const { data: linkedSpaces, error: linkedSpacesError } = await supabase
            .from('area_version_spaces')
            .select('*')
            .eq('unit_id', unitId);
        if (linkedSpacesError) raiseAreaEngineError('deleteUnit.linkedSpaces', linkedSpacesError);

        const { error: spacesError } = await supabase.from('area_version_spaces').delete().eq('unit_id', unitId);
        if (spacesError) raiseAreaEngineError('deleteUnit.spaces', spacesError);
        const { error } = await supabase.from('area_version_units').delete().eq('id', unitId);
        if (error) raiseAreaEngineError('deleteUnit', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_unit',
            entityId: unitId,
            action: 'delete',
            oldValue: { unit: before, linkedSpaces: linkedSpaces || [] },
            reason: 'Unidade removida pelo editor granular do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
    },

    async deleteSpace(spaceId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_spaces')
            .select('*')
            .eq('id', spaceId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteSpace.before', beforeError);

        const { error } = await supabase.from('area_version_spaces').delete().eq('id', spaceId);
        if (error) raiseAreaEngineError('deleteSpace', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_space',
            entityId: spaceId,
            action: 'delete',
            oldValue: before as Record<string, unknown>,
            reason: 'Espaco removido pelo editor granular do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
    },

    async createAccessoryUnitLink(versionId: string, input: AreaAccessoryLinkInput): Promise<AreaVersionUnitAccessoryLink> {
        const { data, error } = await supabase
            .from('area_version_unit_accessory_links')
            .insert({
                area_version_id: versionId,
                parent_unit_id: input.parentUnitId,
                accessory_unit_id: input.accessoryUnitId,
                accessory_space_id: null,
                link_type: input.linkType,
                affects_private_area: input.affectsPrivateArea,
                affects_coefficient: input.affectsCoefficient,
                legal_note: input.legalNote?.trim() || null,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createAccessoryUnitLink', error);
        const link = data as AreaVersionUnitAccessoryLink;
        await recordStructureAudit({
            versionId,
            entityType: 'area_version_unit_accessory_link',
            entityId: link.id,
            action: 'create',
            newValue: link as Record<string, unknown>,
            reason: 'Vinculo acessorio criado pelo editor do app',
        });
        await invalidateVersionCalculation(versionId);
        return link;
    },

    async deleteAccessoryLink(linkId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_unit_accessory_links')
            .select('*')
            .eq('id', linkId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteAccessoryLink.before', beforeError);

        const { error } = await supabase.from('area_version_unit_accessory_links').delete().eq('id', linkId);
        if (error) raiseAreaEngineError('deleteAccessoryLink', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_unit_accessory_link',
            entityId: linkId,
            action: 'delete',
            oldValue: before as Record<string, unknown>,
            reason: 'Vinculo acessorio removido pelo editor do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
    },

    async createCommonAllocation(versionId: string, input: AreaCommonAllocationInput): Promise<AreaVersionCommonAllocation> {
        const { data, error } = await supabase
            .from('area_version_common_allocations')
            .insert({
                area_version_id: versionId,
                common_space_id: input.commonSpaceId,
                target_unit_id: input.targetUnitId,
                allocation_method: input.allocationMethod,
                allocated_real_area_m2_raw: input.allocationMethod === 'fixed_area' ? input.allocatedRealArea : null,
                allocated_equivalent_area_m2_raw: null,
                percentage: input.allocationMethod === 'percentage' ? input.percentage : null,
                justification: input.justification?.trim() || null,
            })
            .select()
            .single();

        if (error) raiseAreaEngineError('createCommonAllocation', error);
        const allocation = data as AreaVersionCommonAllocation;
        await recordStructureAudit({
            versionId,
            entityType: 'area_version_common_allocation',
            entityId: allocation.id,
            action: 'create',
            newValue: allocation as Record<string, unknown>,
            reason: 'Alocacao comum nao proporcional criada pelo editor do app',
        });
        await invalidateVersionCalculation(versionId);
        return allocation;
    },

    async deleteCommonAllocation(allocationId: string): Promise<void> {
        const { data: before, error: beforeError } = await supabase
            .from('area_version_common_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();
        if (beforeError) raiseAreaEngineError('deleteCommonAllocation.before', beforeError);

        const { error } = await supabase.from('area_version_common_allocations').delete().eq('id', allocationId);
        if (error) raiseAreaEngineError('deleteCommonAllocation', error);
        await recordStructureAudit({
            versionId: before.area_version_id,
            entityType: 'area_version_common_allocation',
            entityId: allocationId,
            action: 'delete',
            oldValue: before as Record<string, unknown>,
            reason: 'Alocacao comum nao proporcional removida pelo editor do app',
        });
        await invalidateVersionCalculation(before.area_version_id);
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

    // Camada A do PLANO_INTEGRACAO_AREAS_EMPREENDIMENTOS: gera projeto + versão v1 (draft)
    // a partir de um Empreendimento. Materializa torres→blocos, andares distintos das
    // unidades→pavimentos, unidades→unidades e 1 espaço privativo por unidade (private_area).
    // Áreas comuns viram espaços proporcionais (global/bloco). NÃO importa common_area/
    // total_area da unidade (o motor rateia a comum sozinho — evita dupla contagem) nem vagas.
    async importFromEmpreendimento(empreendimentoId: string, organizationId: string): Promise<AreaImportReport> {
        const emp = await empreendimentoService.getById(empreendimentoId, { includeChildren: true }) as EmpreendimentoWithChildren | null;
        if (!emp) throw new Error('Empreendimento nao encontrado.');
        if (emp.organization_id !== organizationId) throw new Error('Empreendimento pertence a outra organizacao.');
        const towers = emp.towers || [];
        if (towers.length === 0) throw new Error('Empreendimento sem torres cadastradas — nada a importar.');

        const warnings: string[] = [];

        // 1. Projeto + versao v1. notes guarda o que nao cabe no tipo (endereco/RT).
        const enderecoResumo = [emp.endereco_street, emp.endereco_number, emp.endereco_neighborhood, emp.endereco_city, emp.endereco_state].filter(Boolean).join(', ');
        const notesParts = [
            `Importado do empreendimento "${emp.name}".`,
            enderecoResumo ? `Endereco: ${enderecoResumo}.` : '',
            emp.matricula ? `Matricula: ${emp.matricula}.` : '',
            emp.responsavel_tecnico ? `Resp. tecnico: ${emp.responsavel_tecnico}${emp.crea_cau ? ` (${emp.crea_cau})` : ''}.` : '',
        ].filter(Boolean);

        // F3: se já existe projeto de áreas para este empreendimento, cria uma NOVA versão
        // (rebuild a partir do estado atual do empreendimento) em vez de duplicar o projeto.
        // A versão anterior nunca é mutada — serve de baseline para o relatório de drift.
        const existingProject = await this.getProjectByEmpreendimento(emp.id, organizationId);
        let project: AreaProject;
        let versionNumber: number;
        let previousVersionId: string | null = null;
        if (existingProject) {
            project = existingProject;
            const existingVersions = await this.listVersions(existingProject.id);
            versionNumber = Math.max(0, ...existingVersions.map(v => v.version_number || 0)) + 1;
            previousVersionId = existingVersions[0]?.id ?? null; // listVersions ordena desc por número
            // Mantém dados-mestres do projeto alinhados com o empreendimento.
            await this.updateProject(existingProject.id, {
                name: emp.name,
                project_type: mapEmpreendimentoTipo(emp.tipo),
                notes: notesParts.join(' '),
            });
        } else {
            project = await this.createProject({
                organization_id: organizationId,
                empreendimento_id: emp.id,
                name: emp.name,
                normative_reference: 'ABNT NBR 12721:2006',
                normative_valid_from: '2007-01-21',
                project_type: mapEmpreendimentoTipo(emp.tipo),
                status: 'active',
                notes: notesParts.join(' '),
            });
            versionNumber = 1;
        }

        const version = await this.createVersion({
            area_project_id: project.id,
            version_number: versionNumber,
            version_label: versionNumber === 1 ? `Importado de ${emp.name}` : `Re-sincronizado v${versionNumber}`,
            source_version_id: previousVersionId,
        });
        const versionId = version.id;

        // 2. Blocos (1 por torre)
        const blockRows = towers.map((t, i) => ({
            area_version_id: versionId,
            code: `B${i + 1}`,
            name: t.name || `Torre ${i + 1}`,
            sort_order: t.sort_order ?? i + 1,
        }));
        const { data: insertedBlocks, error: blockError } = await supabase
            .from('area_version_blocks').insert(blockRows).select('id, code');
        if (blockError) raiseAreaEngineError('importFromEmpreendimento.blocks', blockError);
        const blockIdByCode = new Map<string, string>();
        (insertedBlocks || []).forEach(b => blockIdByCode.set(b.code, b.id));
        const blockIdByTower = new Map<string, string>();
        towers.forEach((t, i) => { const id = blockIdByCode.get(`B${i + 1}`); if (id) blockIdByTower.set(t.id, id); });
        const firstBlockId = blockIdByCode.get('B1');
        if (!firstBlockId) throw new Error('Falha ao materializar blocos do empreendimento.');

        // 3. Pavimentos (F2): preferir os templates de empreendimento_floors, expandindo
        //    repeat_count — inclui andares SEM unidade (garagem/tecnico), que o Quadro I
        //    (por pavimento) precisa. Fallback: derivar dos andares distintos das unidades.
        const floorsByTower = new Map<string, Awaited<ReturnType<typeof empreendimentoService.listFloors>>>();
        await Promise.all(towers.map(async t => {
            try { floorsByTower.set(t.id, await empreendimentoService.listFloors(t.id)); }
            catch { floorsByTower.set(t.id, []); }
        }));

        const floorRows: Record<string, unknown>[] = [];
        const floorCodeByKey = new Map<string, string>(); // `${towerId}:${floorNum}` -> floorCode
        let floorSeq = 0;
        for (const t of towers) {
            const blockId = blockIdByTower.get(t.id);
            const templates = floorsByTower.get(t.id) || [];
            if (templates.length > 0) {
                for (const fl of templates) {
                    const reps = Math.max(1, fl.repeat_count || 1);
                    for (let rep = 0; rep < reps; rep++) {
                        const floorNum = fl.floor_number + rep;
                        const key = `${t.id}:${floorNum}`;
                        if (floorCodeByKey.has(key)) continue; // andares de templates que se sobrepoem
                        const code = `F${++floorSeq}`;
                        floorCodeByKey.set(key, code);
                        const base = fl.name?.trim() || floorLabelFromNumber(floorNum);
                        const label = reps > 1 ? `${base} ${floorNum}` : base;
                        floorRows.push({
                            area_version_id: versionId,
                            block_id: blockId,
                            code,
                            name: label,
                            floor_type: mapFloorTipo(fl.tipo, floorNum),
                            sort_order: floorNum,
                            is_template: false,
                            is_materialized: true,
                            materialized_label: label,
                            materialized_index: floorNum,
                        });
                    }
                }
            } else {
                // Fallback: sem template de pavimentos, derivar dos andares das unidades.
                const seen = new Set<number>();
                for (const u of (t.units || [])) {
                    const fn = u.floor;
                    if (fn === undefined || fn === null || seen.has(fn)) continue;
                    seen.add(fn);
                    const code = `F${++floorSeq}`;
                    floorCodeByKey.set(`${t.id}:${fn}`, code);
                    floorRows.push({
                        area_version_id: versionId,
                        block_id: blockId,
                        code,
                        name: floorLabelFromNumber(fn),
                        floor_type: mapFloorTipo(u.floor_tipo, fn),
                        sort_order: fn,
                        is_template: false,
                        is_materialized: true,
                        materialized_label: floorLabelFromNumber(fn),
                        materialized_index: fn,
                    });
                }
                if ((t.units || []).length > 0) {
                    warnings.push(`Torre "${t.name}": pavimentos derivados das unidades (sem template) — andares sem unidade nao aparecem no Quadro I.`);
                }
            }
        }
        const floorIdByCode = new Map<string, string>();
        if (floorRows.length > 0) {
            const { data: insertedFloors, error: floorError } = await supabase
                .from('area_version_floors').insert(floorRows).select('id, code');
            if (floorError) raiseAreaEngineError('importFromEmpreendimento.floors', floorError);
            (insertedFloors || []).forEach(f => floorIdByCode.set(f.code, f.id));
        }

        // 4. Unidades (dedupe de codigo por versao)
        const unitRows: Record<string, unknown>[] = [];
        const usedCodes = new Set<string>();
        const unitMeta: { empUnitId: string; code: string; towerId: string; floorNum?: number | null; privateArea?: number | null }[] = [];
        let unitIdx = 0;
        for (const t of towers) {
            for (const u of (t.units || [])) {
                let code = (u.name || '').trim() || `Unid ${++unitIdx}`;
                if (usedCodes.has(code)) {
                    let n = 2;
                    while (usedCodes.has(`${code} (${n})`)) n++;
                    code = `${code} (${n})`;
                }
                usedCodes.add(code);
                const floorCode = (u.floor !== undefined && u.floor !== null) ? floorCodeByKey.get(`${t.id}:${u.floor}`) : undefined;
                unitRows.push({
                    area_version_id: versionId,
                    block_id: blockIdByTower.get(t.id),
                    primary_floor_id: floorCode ? floorIdByCode.get(floorCode) : null,
                    code,
                    unit_type: 'apartment',
                    typology_code: u.typology?.trim() || null,
                    is_autonomous: true,
                    is_active: true,
                    is_template: false,
                    is_materialized: true,
                    materialized_label: code,
                    materialized_index: unitRows.length + 1,
                    source_empreendimento_unit_id: u.id,
                });
                unitMeta.push({ empUnitId: u.id, code, towerId: t.id, floorNum: u.floor, privateArea: u.private_area });
            }
        }
        const unitIdByCode = new Map<string, string>();
        if (unitRows.length > 0) {
            const { data: insertedUnits, error: unitError } = await supabase
                .from('area_version_units').insert(unitRows).select('id, code');
            if (unitError) raiseAreaEngineError('importFromEmpreendimento.units', unitError);
            (insertedUnits || []).forEach(u => unitIdByCode.set(u.code, u.id));
        }

        // 5. Espacos privativos (1 por unidade com private_area > 0) — coverage padrao, coef 1
        const privateSpaceRows: Record<string, unknown>[] = [];
        let skippedUnitsNoArea = 0;
        for (const m of unitMeta) {
            const area = Number(m.privateArea ?? 0);
            if (!Number.isFinite(area) || area <= 0) { skippedUnitsNoArea++; continue; }
            const unitId = unitIdByCode.get(m.code);
            if (!unitId) continue;
            const floorCode = (m.floorNum !== undefined && m.floorNum !== null) ? floorCodeByKey.get(`${m.towerId}:${m.floorNum}`) : undefined;
            privateSpaceRows.push({
                area_version_id: versionId,
                block_id: blockIdByTower.get(m.towerId),
                floor_id: floorCode ? floorIdByCode.get(floorCode) : null,
                unit_id: unitId,
                code: `${m.code}-PRIV`,
                name: `Area privativa ${m.code}`,
                use_class: 'private',
                private_nature: 'main',
                coverage_class: 'covered_standard',
                common_division_class: 'not_applicable',
                ownership_accounting_mode: 'direct_unit',
                real_area_m2_raw: area,
                coefficient_value: 1,
                source_type: 'api',
                source_reference: `empreendimento_unit:${m.empUnitId}`,
                is_template: false,
                is_materialized: true,
                materialized_label: `Area privativa ${m.code}`,
                materialized_index: privateSpaceRows.length + 1,
            });
        }
        if (privateSpaceRows.length > 0) {
            const { error: spaceError } = await supabase.from('area_version_spaces').insert(privateSpaceRows);
            if (spaceError) raiseAreaEngineError('importFromEmpreendimento.privateSpaces', spaceError);
        }
        if (skippedUnitsNoArea > 0) warnings.push(`${skippedUnitsNoArea} unidade(s) sem area privativa nao geraram espaco — informe a area no editor.`);

        // 6. Areas comuns (proporcional global/bloco) + escopo de distribuicao
        const commonAreas = emp.common_areas || [];
        let skippedCommonsNoArea = 0;
        let commonSpaceCount = 0;
        for (let i = 0; i < commonAreas.length; i++) {
            const ca = commonAreas[i];
            const area = Number(ca.area ?? 0);
            if (!Number.isFinite(area) || area <= 0) { skippedCommonsNoArea++; continue; }
            const towerBlockId = ca.tower_id ? blockIdByTower.get(ca.tower_id) : undefined;
            const blockId = towerBlockId || firstBlockId;
            const scope = towerBlockId ? 'block' : 'global';
            // Atribui o pavimento quando a comum pertence a uma torre e tem andar identificavel.
            const caFloorCode = (ca.tower_id && ca.floor !== undefined && ca.floor !== null)
                ? floorCodeByKey.get(`${ca.tower_id}:${ca.floor}`) : undefined;
            const caFloorId = caFloorCode ? floorIdByCode.get(caFloorCode) ?? null : null;
            const { data: commonSpace, error: commonError } = await supabase
                .from('area_version_spaces')
                .insert({
                    area_version_id: versionId,
                    block_id: blockId,
                    floor_id: caFloorId,
                    unit_id: null,
                    code: `COM-${i + 1}`,
                    name: ca.name || `Area comum ${i + 1}`,
                    use_class: 'common',
                    private_nature: 'not_applicable',
                    coverage_class: 'covered_standard',
                    common_division_class: 'proportional',
                    ownership_accounting_mode: 'common_area',
                    real_area_m2_raw: area,
                    coefficient_value: 1,
                    source_type: 'api',
                    source_reference: `empreendimento_common_area:${ca.id}`,
                    is_template: false,
                    is_materialized: true,
                    materialized_label: ca.name || `Area comum ${i + 1}`,
                    materialized_index: privateSpaceRows.length + i + 1,
                })
                .select('id')
                .single();
            if (commonError) raiseAreaEngineError('importFromEmpreendimento.commonSpace', commonError);
            const { error: scopeError } = await supabase
                .from('area_version_common_distribution_scopes')
                .insert({
                    area_version_id: versionId,
                    common_space_id: commonSpace.id,
                    distribution_scope: scope,
                    block_id: scope === 'block' ? blockId : null,
                    notes: 'Escopo criado pelo importador de Empreendimento',
                });
            if (scopeError) raiseAreaEngineError('importFromEmpreendimento.scope', scopeError);
            commonSpaceCount++;
        }
        if (skippedCommonsNoArea > 0) warnings.push(`${skippedCommonsNoArea} area(s) comum(ns) sem metragem nao foram importadas.`);
        warnings.push('Revise coeficientes de equivalencia, coberturas e vagas no editor antes de calcular (Camada B).');

        // 7. Auditoria da importacao
        await supabase.from('area_version_audit_logs').insert({
            area_version_id: versionId,
            entity_type: 'area_versions',
            entity_id: versionId,
            action: 'create',
            field_name: 'empreendimento_id',
            old_value: null,
            new_value: {
                empreendimento_id: emp.id,
                blocks: blockRows.length,
                floors: floorRows.length,
                units: unitRows.length,
                private_spaces: privateSpaceRows.length,
                common_spaces: commonSpaceCount,
            },
            reason: previousVersionId
                ? `Versao re-sincronizada do empreendimento "${emp.name}" (v${versionNumber})`
                : `Projeto de areas importado do empreendimento "${emp.name}"`,
        });

        // F3: relatório de drift vs a versão anterior (quando houver).
        let drift: AreaResyncDrift | null = null;
        if (previousVersionId) {
            try {
                drift = await this.computeAreaDrift(previousVersionId, versionId);
                const changes = drift.blocksAdded.length + drift.blocksRemoved.length + drift.unitsAdded.length + drift.unitsRemoved.length + drift.unitsAreaChanged.length;
                warnings.unshift(changes === 0
                    ? `Re-sincronizado como v${versionNumber} — nenhuma mudanca estrutural vs a versao anterior.`
                    : `Re-sincronizado como v${versionNumber}: +${drift.unitsAdded.length}/-${drift.unitsRemoved.length} unidade(s), ${drift.unitsAreaChanged.length} area(s) alterada(s), +${drift.blocksAdded.length}/-${drift.blocksRemoved.length} bloco(s).`);
            } catch (err) {
                console.error('[areaEngineService] falha ao computar drift:', err);
            }
        }

        return {
            projectId: project.id,
            versionId,
            blocks: blockRows.length,
            floors: floorRows.length,
            units: unitRows.length,
            privateSpaces: privateSpaceRows.length,
            commonSpaces: commonSpaceCount,
            skippedUnitsNoArea,
            skippedCommonsNoArea,
            isNewProject: !existingProject,
            versionNumber,
            previousVersionId,
            drift,
            warnings,
        };
    },

    // F3: compara a estrutura de duas versões (baseline × nova) por código de unidade,
    // área privativa e nome de bloco. Só leitura — não muta nenhuma das versões.
    async computeAreaDrift(previousVersionId: string, newVersionId: string): Promise<AreaResyncDrift> {
        const [prev, next] = await Promise.all([
            this.getStructure(previousVersionId),
            this.getStructure(newVersionId),
        ]);
        const privateAreaByUnitCode = (s: AreaVersionStructure) => {
            const unitCodeById = new Map(s.units.map(u => [u.id, u.code]));
            const areaByCode = new Map<string, number>();
            for (const sp of s.spaces) {
                if (sp.use_class !== 'private' || !sp.unit_id) continue;
                const code = unitCodeById.get(sp.unit_id);
                if (!code) continue;
                areaByCode.set(code, (areaByCode.get(code) || 0) + Number(sp.real_area_m2_raw || 0));
            }
            return areaByCode;
        };
        const prevAreas = privateAreaByUnitCode(prev);
        const nextAreas = privateAreaByUnitCode(next);
        const prevCodes = new Set(prev.units.map(u => u.code));
        const nextCodes = new Set(next.units.map(u => u.code));
        const prevBlocks = new Set(prev.blocks.map(b => b.name));
        const nextBlocks = new Set(next.blocks.map(b => b.name));

        const unitsAreaChanged: { code: string; before: number; after: number }[] = [];
        for (const code of nextCodes) {
            if (!prevCodes.has(code)) continue;
            const before = prevAreas.get(code) || 0;
            const after = nextAreas.get(code) || 0;
            if (Math.abs(before - after) > 0.005) unitsAreaChanged.push({ code, before, after });
        }

        return {
            blocksAdded: [...nextBlocks].filter(b => !prevBlocks.has(b)),
            blocksRemoved: [...prevBlocks].filter(b => !nextBlocks.has(b)),
            unitsAdded: [...nextCodes].filter(c => !prevCodes.has(c)),
            unitsRemoved: [...prevCodes].filter(c => !nextCodes.has(c)),
            unitsAreaChanged,
        };
    },
    // F4 — Camada de escrita reversa: leva a fração ideal + área real total (Quadro IV-B)
    // calculadas pelo motor de volta ao cadastro do Empreendimento. So-leitura para o
    // usuario do Comercial; NUNCA sobrescreve private_area/common_area (dados de origem).
    // So atua sobre unidades com proveniencia do importador (source_empreendimento_unit_id);
    // unidades criadas manualmente no editor (fora de um import) sao contadas e ignoradas.
    async writeBackFractionsToEmpreendimento(versionId: string): Promise<AreaWriteBackReport> {
        const version = await this.getVersion(versionId);
        if (!version) throw new Error('Versao de areas nao encontrada.');
        if (['draft', 'superseded', 'cancelled'].includes(version.status)) {
            throw new Error('A versao precisa estar calculada (ou aprovada/travada) para escrever a fracao ideal no Empreendimento.');
        }

        const [structure, fractions, quadroIVB] = await Promise.all([
            this.getStructure(versionId),
            this.listFractions(versionId),
            this.listQuadroIVB(versionId),
        ]);

        const fractionByUnitId = new Map(fractions.map(f => [f.unit_id, f]));
        const realTotalByUnitId = new Map(quadroIVB.map(row => [row.unit_id, Number(row.qivb_f_real_total_area_raw ?? 0)]));

        const warnings: string[] = [];
        const updates: { sourceUnitId: string; fracaoDecimal: number; fracaoThousandths: number; areaRealTotal: number }[] = [];
        let unitsWithoutSource = 0;

        for (const unit of structure.units) {
            const sourceUnitId = (unit as { source_empreendimento_unit_id?: string | null }).source_empreendimento_unit_id;
            if (!sourceUnitId) { unitsWithoutSource++; continue; }
            const fraction = fractionByUnitId.get(unit.id);
            if (!fraction) continue; // versao ainda nao calculada para esta unidade
            updates.push({
                sourceUnitId,
                fracaoDecimal: Number(fraction.fraction_decimal_raw ?? 0),
                fracaoThousandths: Number(fraction.fraction_thousandths_raw ?? 0),
                areaRealTotal: realTotalByUnitId.get(unit.id) ?? 0,
            });
        }

        if (unitsWithoutSource > 0) {
            warnings.push(`${unitsWithoutSource} unidade(s) desta versao nao tem proveniencia de um Empreendimento (criadas manualmente no editor) — nao foram atualizadas.`);
        }
        if (updates.length === 0) {
            warnings.push('Nenhuma unidade elegivel para escrita reversa. Calcule a versao antes de escrever no Empreendimento.');
        }

        const now = new Date().toISOString();
        const results = await Promise.all(updates.map(u =>
            supabase
                .from('empreendimento_units')
                .update({
                    fracao_ideal_decimal: u.fracaoDecimal,
                    fracao_ideal_thousandths: u.fracaoThousandths,
                    area_real_total_m2: u.areaRealTotal,
                    area_engine_version_id: versionId,
                    area_engine_synced_at: now,
                })
                .eq('id', u.sourceUnitId)
        ));
        const firstError = results.find(r => r.error)?.error;
        if (firstError) raiseAreaEngineError('writeBackFractionsToEmpreendimento', firstError);

        await supabase.from('area_version_audit_logs').insert({
            area_version_id: versionId,
            entity_type: 'empreendimento_write_back',
            entity_id: versionId,
            action: 'update',
            field_name: 'fracao_ideal',
            old_value: null,
            new_value: { units_updated: updates.length, units_without_source: unitsWithoutSource },
            reason: 'Escrita reversa da fracao ideal e area real total para o Empreendimento',
        });

        return { unitsUpdated: updates.length, unitsWithoutSource, warnings };
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
