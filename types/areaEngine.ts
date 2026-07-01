export type AreaProjectStatus = 'draft' | 'active' | 'archived';
export type AreaVersionStatus =
    | 'draft'
    | 'calculated'
    | 'pending_technical_approval'
    | 'technically_approved'
    | 'pending_legal_approval'
    | 'legally_approved'
    | 'locked'
    | 'superseded'
    | 'cancelled';

export type AreaProjectType = 'vertical' | 'mixed' | 'commercial' | 'residential' | 'horizontal' | 'other';
export type AreaApprovalType = 'technical' | 'legal' | 'product_owner';
export type AreaApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AreaEngineRpcIssue {
    code: string;
    message: string;
    count?: number;
    [key: string]: unknown;
}

export interface AreaEngineRpcResult {
    status: 'success' | 'failed' | string;
    version_id?: string;
    version_status?: AreaVersionStatus | string;
    version_payload_hash?: string;
    version_identity_hash?: string;
    approval_type?: AreaApprovalType;
    approval_hash?: string;
    locked_at?: string;
    blocking_errors?: AreaEngineRpcIssue[];
    warnings?: AreaEngineRpcIssue[];
    [key: string]: unknown;
}

export interface AreaProject {
    id: string;
    organization_id: string;
    empreendimento_id?: string | null;
    name: string;
    normative_reference: string;
    normative_valid_from: string;
    project_type: AreaProjectType;
    status: AreaProjectStatus;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

export type AreaProjectInsert = Omit<AreaProject, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
};

export type AreaProjectUpdate = Partial<Omit<AreaProject, 'id' | 'created_at' | 'updated_at'>>;

export interface AreaVersion {
    id: string;
    area_project_id: string;
    version_number: number;
    version_label: string;
    source_version_id?: string | null;
    status: AreaVersionStatus;
    calculation_engine_version: string;
    normative_reference: string;
    normative_valid_from: string;
    rounding_profile: Record<string, unknown>;
    version_payload_hash?: string | null;
    version_identity_hash?: string | null;
    canonical_payload_json?: Record<string, unknown> | null;
    locked_at?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

export type AreaVersionInsert = Omit<
    AreaVersion,
    | 'id'
    | 'status'
    | 'calculation_engine_version'
    | 'normative_reference'
    | 'normative_valid_from'
    | 'rounding_profile'
    | 'version_payload_hash'
    | 'version_identity_hash'
    | 'canonical_payload_json'
    | 'locked_at'
    | 'created_at'
    | 'updated_at'
> & {
    id?: string;
    status?: AreaVersionStatus;
    calculation_engine_version?: string;
    normative_reference?: string;
    normative_valid_from?: string;
    rounding_profile?: Record<string, unknown>;
};

export type AreaVersionUpdate = Partial<Omit<AreaVersion, 'id' | 'created_at' | 'updated_at'>>;

export interface AreaQuadroIRow {
    id: string;
    area_version_id: string;
    block_id: string;
    floor_id: string;
    row_order: number;
    floor_label: string;
    qi_17_floor_real_total_raw: number;
    qi_18_floor_equivalent_total_raw: number;
    [key: string]: unknown;
}

export interface AreaQuadroIIRow {
    id: string;
    area_version_id: string;
    unit_id: string;
    row_order: number;
    unit_label: string;
    qii_31_proportionality_coefficient_raw: number;
    qii_37_unit_real_total_raw: number;
    qii_38_unit_equivalent_total_raw: number;
    [key: string]: unknown;
}

export interface AreaQuadroIVBRow {
    id: string;
    area_version_id: string;
    unit_id: string;
    row_order: number;
    unit_label: string;
    qivb_f_real_total_area_raw: number;
    qivb_g_proportionality_coefficient_raw: number;
    fraction_decimal_raw: number;
    [key: string]: unknown;
}

export interface AreaFractionIdeal {
    id: string;
    area_version_id: string;
    unit_id: string;
    source_coefficient: number;
    fraction_decimal_raw: number;
    fraction_percent_raw: number;
    fraction_thousandths_raw: number;
    derivation_method: 'derived_from_coefficient' | 'manual_legal_adjustment';
    [key: string]: unknown;
}
export interface AreaVersionBlock {
    id: string;
    area_version_id: string;
    code?: string | null;
    name: string;
    sort_order: number;
    [key: string]: unknown;
}

export interface AreaVersionFloor {
    id: string;
    area_version_id: string;
    block_id: string;
    code?: string | null;
    name: string;
    floor_type: string;
    sort_order: number;
    materialized_label?: string | null;
    [key: string]: unknown;
}

export interface AreaVersionUnit {
    id: string;
    area_version_id: string;
    block_id: string;
    primary_floor_id?: string | null;
    code: string;
    name?: string | null;
    unit_type: string;
    typology_code?: string | null;
    is_autonomous: boolean;
    is_active: boolean;
    materialized_label?: string | null;
    [key: string]: unknown;
}

export interface AreaVersionSpace {
    id: string;
    area_version_id: string;
    block_id: string;
    floor_id?: string | null;
    unit_id?: string | null;
    code?: string | null;
    name: string;
    use_class: 'private' | 'common';
    private_nature: string;
    coverage_class: string;
    common_division_class: string;
    ownership_accounting_mode: string;
    real_area_m2_raw: number;
    coefficient_value?: number | null;
    equivalent_area_m2_raw?: number | null;
    materialized_label?: string | null;
    [key: string]: unknown;
}

export interface AreaVersionStructure {
    blocks: AreaVersionBlock[];
    floors: AreaVersionFloor[];
    units: AreaVersionUnit[];
    spaces: AreaVersionSpace[];
}

