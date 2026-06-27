// types/assets.ts

export type AssetCategory =
  | 'equipamento'
  | 'ferramenta'
  | 'veiculo'
  | 'tecnologia'
  | 'imovel'
  | 'mobiliario';

export type AssetStatus =
  | 'disponivel'
  | 'em_uso'
  | 'manutencao'
  | 'ocioso'
  | 'baixado';

export type MaintenanceType = 'preventiva' | 'corretiva' | 'calibracao';
export type MaintenanceStatus = 'agendada' | 'em_execucao' | 'concluida' | 'cancelada';
export type ReservationStatus = 'pendente' | 'aprovada' | 'ativa' | 'finalizada' | 'cancelada';

export interface OpuraAsset {
  id: string;
  organization_id: string;
  parent_asset_id?: string;
  code: string;
  name: string;
  category: AssetCategory;
  subcategory?: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  purchase_date?: string;
  purchase_value: number;
  useful_life_months?: number;
  residual_value?: number;
  status: AssetStatus;
  responsible_worker_id?: string;
  current_project_id?: string;
  tracking_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type OpuraAssetInsert = Omit<
  OpuraAsset,
  'id' | 'created_at' | 'updated_at'
>;

export type OpuraAssetUpdate = Partial<OpuraAssetInsert>;

export interface OpuraAssetMovement {
  id: string;
  organization_id: string;
  asset_id: string;
  origin_project_id?: string;
  destination_project_id?: string;
  movement_date: string;
  responsible_worker_id?: string;
  notes?: string;
  created_at: string;
}

export type OpuraAssetMovementInsert = Omit<OpuraAssetMovement, 'id' | 'created_at'>;

export interface OpuraAssetMaintenance {
  id: string;
  organization_id: string;
  asset_id: string;
  type: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  scheduled_date: string;
  executed_date?: string;
  cost: number;
  current_odometer?: number;
  current_hourmeter?: number;
  checklist_responses?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type OpuraAssetMaintenanceInsert = Omit<
  OpuraAssetMaintenance,
  'id' | 'created_at' | 'updated_at'
>;

export type OpuraAssetMaintenanceUpdate = Partial<OpuraAssetMaintenanceInsert>;

export interface OpuraAssetReservation {
  id: string;
  organization_id: string;
  asset_id: string;
  project_id: string;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  requested_by_email: string;
  approved_by_email?: string;
  notes?: string;
  responsible_employee_id?: string;
  created_at: string;
  updated_at: string;
}

export type OpuraAssetReservationInsert = Omit<
  OpuraAssetReservation,
  'id' | 'created_at' | 'updated_at'
>;

export type OpuraAssetReservationUpdate = Partial<OpuraAssetReservationInsert>;

export type AssetDocumentType = 'seguro' | 'licenciamento' | 'termo_responsabilidade' | 'outro';
export type AssetDocumentStatus = 'ativo' | 'vencido' | 'suspenso';

export interface OpuraAssetDocument {
  id: string;
  organization_id: string;
  asset_id: string;
  type: AssetDocumentType;
  name: string;
  document_number?: string;
  expiration_date?: string;
  file_url?: string;
  status: AssetDocumentStatus;
  created_at: string;
  updated_at: string;
}

export type OpuraAssetDocumentInsert = Omit<
  OpuraAssetDocument,
  'id' | 'created_at' | 'updated_at'
>;

export type OpuraAssetDocumentUpdate = Partial<OpuraAssetDocumentInsert>;

// Estrutura consolidada para rateio de depreciação linear por obra
export interface OpuraAssetDepreciationRateio {
  project_id: string;
  project_name: string;
  assets_count: number;
  total_days: number;
  allocated_cost: number;
  percentage: number;
}

// Interfaces para gestão de marcas
export interface OpuraAssetBrand {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type OpuraAssetBrandInsert = Omit<OpuraAssetBrand, 'id' | 'created_at' | 'updated_at'>;
export type OpuraAssetBrandUpdate = Partial<OpuraAssetBrandInsert>;
