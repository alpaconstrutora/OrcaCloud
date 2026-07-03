export interface PlantStudy {
  id: string;
  organization_id: string;
  project_id?: string;
  name: string;
  status: 'Rascunho' | 'Em análise' | 'Cenários gerados' | 'Cenário selecionado' | 'Enviado para viabilidade' | 'Arquivado';
  city?: string;
  state?: string;
  neighborhood?: string;
  address?: string;
  responsible_user_id?: string;
  selected_scenario_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PlantTerrain {
  id: string;
  study_id: string;
  terrain_type: string;
  area: number;
  frontage: number;
  depth: number;
  frontage_orientation?: string;
  is_corner: boolean;
  slope_type: string;
  polygon_geometry?: any;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PlantUrbanRuleset {
  id: string;
  study_id: string;
  city?: string;
  state?: string;
  zone_name?: string;
  allowed_use: string;
  occupancy_rate?: number;
  floor_area_ratio_basic?: number;
  floor_area_ratio_max?: number;
  permeability_rate?: number;
  front_setback?: number;
  left_setback?: number;
  right_setback?: number;
  rear_setback?: number;
  max_floors?: number;
  max_height?: number;
  parking_rule_type?: string;
  parking_spaces_per_unit?: number;
  min_unit_area?: number;
  law_reference?: string;
  source_document?: string;
  confidence_level: 'Baixo' | 'Médio' | 'Alto' | 'Validado por profissional' | 'Validado na prefeitura';
  validated_by?: string;
  validated_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PlantBriefing {
  id: string;
  study_id: string;
  development_type: string;
  product_standard: 'Econômico' | 'Médio' | 'Alto' | 'Premium';
  main_objective: 'Maximizar VGV' | 'Maximizar número de unidades' | 'Maximizar área privativa' | 'Maximizar liquidez' | 'Reduzir custo' | 'Equilibrar resultado';
  allowed_typologies: string[];
  target_unit_area_min?: number;
  target_unit_area_max?: number;
  desired_units_per_floor?: number;
  desired_floors?: number;
  parking_per_unit?: number;
  has_elevator: string;
  has_balcony: string;
  has_suite: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PlantScenario {
  id: string;
  study_id: string;
  name: string;
  scenario_type: 'Conservador' | 'Equilibrado' | 'Máximo aproveitamento' | 'Customizado';
  status: string;
  generation_method: string;
  template_id?: string;
  floors_count?: number;
  units_per_floor?: number;
  total_units?: number;
  total_built_area?: number;
  total_private_area?: number;
  total_common_area?: number;
  total_sellable_area?: number;
  total_parking_spaces?: number;
  occupancy_used?: number;
  floor_area_ratio_used?: number;
  efficiency_ratio?: number;
  estimated_vgv?: number;
  estimated_cost?: number;
  urban_score?: number;
  architectural_score?: number;
  commercial_score?: number;
  economic_score?: number;
  construction_score?: number;
  general_score?: number;
  selected: boolean;
  created_at: string;
  updated_at: string;
  validations?: Omit<PlantValidation, 'id' | 'created_at' | 'scenario_id'>[];
}

export interface PlantFloor {
  id: string;
  scenario_id: string;
  floor_number: number;
  floor_type: string;
  gross_area?: number;
  private_area?: number;
  common_area?: number;
  circulation_area?: number;
  geometry_json?: any;
  created_at: string;
  updated_at: string;
}

export interface PlantUnit {
  id: string;
  floor_id: string;
  unit_code?: string;
  unit_type?: string;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  parking_spaces?: number;
  private_area?: number;
  gross_area?: number;
  has_balcony?: boolean;
  has_suite?: boolean;
  geometry_json?: any;
  created_at: string;
  updated_at: string;
}

export interface PlantValidation {
  id: string;
  scenario_id: string;
  validation_type?: 'Urbanístico' | 'Arquitetônico' | 'Comercial';
  severity?: 'Bloqueante' | 'Alta' | 'Média' | 'Baixa' | 'Informativa';
  rule_code?: string;
  title: string;
  message: string;
  allowed_value?: string;
  actual_value?: string;
  affected_entity_type?: string;
  affected_entity_id?: string;
  recommendation?: string;
  status: string;
  created_at: string;
}
