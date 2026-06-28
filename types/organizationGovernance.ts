// ÒPURA Organization & Governance — Interfaces de Dados (Fase 2)

export type OrgRelationshipType = 'hierarquico' | 'funcional' | 'operacional' | 'comunicacao' | 'consulta' | 'auditoria';
export type AuthorityFlowType = 'compras' | 'pagamentos' | 'contratos' | 'investimentos';
export type ReadinessLevel = 'imediato' | '1_a_2_anos' | '3_a_5_anos' | 'longo_prazo';
export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico';
export type RaciRoleType = 'R' | 'A' | 'C' | 'I';

// ─── 0. FUNÇÕES (org_funcoes) ────────────────────────────────

export type OrgFuncaoCategoria = 'operacional' | 'tecnica' | 'administrativa' | 'gerencial' | 'comercial';

export interface OrgFuncao {
  id: string;
  company_id: string;
  nome: string;
  descricao?: string | null;
  categoria: OrgFuncaoCategoria;
  created_at: string;
  updated_at: string;
}

export type OrgFuncaoInsert = Omit<OrgFuncao, 'id' | 'created_at' | 'updated_at'>;

// ─── 1. CARGOS (org_roles) ───────────────────────────────────

export interface OrgRole {
  id: string;
  company_id: string;
  nome: string;
  codigo?: string | null;
  descricao?: string | null;
  nivel_hierarquico: number;
  responsabilidades: string[];
  salario_minimo?: number | null;
  salario_maximo?: number | null;
  competencias: string[];
  proximo_cargo_id?: string | null;
  funcao_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type OrgRoleInsert = Omit<OrgRole, 'id' | 'created_at' | 'updated_at'>;
export type OrgRoleUpdate = Partial<OrgRoleInsert>;

// ─── 2. RELACIONAMENTOS DINÂMICOS (org_relationships) ────────

export interface OrgRelationship {
  id: string;
  company_id: string;
  relationship_type: OrgRelationshipType;
  
  source_role_id?: string | null;
  target_role_id?: string | null;
  
  source_employee_id?: string | null;
  target_employee_id?: string | null;
  
  data_inicio: string; // YYYY-MM-DD
  data_fim?: string | null; // YYYY-MM-DD
  created_at: string;
}

export type OrgRelationshipInsert = Omit<OrgRelationship, 'id' | 'created_at'>;
export type OrgRelationshipUpdate = Partial<OrgRelationshipInsert>;

// ─── 3. LIMITES DE AUTORIDADE / ALÇADAS (org_authority_limits) ──

export interface OrgAuthorityLimit {
  id: string;
  company_id: string;
  flow_type: AuthorityFlowType;
  
  role_id?: string | null;
  department_id?: string | null;
  employee_id?: string | null;
  
  limite_minimo: number;
  limite_maximo: number;
  requer_dupla_assinatura: boolean;
  
  created_at: string;
  updated_at: string;
}

export type OrgAuthorityLimitInsert = Omit<OrgAuthorityLimit, 'id' | 'created_at' | 'updated_at'>;
export type OrgAuthorityLimitUpdate = Partial<OrgAuthorityLimitInsert>;

// ─── 4. DELEGAÇÕES TEMPORÁRIAS (org_delegations) ─────────────

export interface OrgDelegation {
  id: string;
  company_id: string;
  delegator_employee_id: string;
  delegatee_employee_id: string;
  flow_type?: AuthorityFlowType | null;
  limite_maximo?: number | null;
  
  data_inicio: string; // TIMESTAMPTZ (ISO String)
  data_fim: string; // TIMESTAMPTZ (ISO String)
  status: 'ativa' | 'expirada' | 'revogada';
  motivo?: string | null;
  
  created_at: string;
}

export type OrgDelegationInsert = Omit<OrgDelegation, 'id' | 'created_at'>;
export type OrgDelegationUpdate = Partial<OrgDelegationInsert>;

// ─── 5. MATRIZ RACI (org_raci_matrix) ────────────────────────

export interface OrgRaciMatrix {
  id: string;
  company_id: string;
  processo_nome: string;
  etapa_nome?: string | null;
  role_type: RaciRoleType;
  
  role_id?: string | null;
  department_id?: string | null;
  employee_id?: string | null;
  
  created_at: string;
}

export type OrgRaciMatrixInsert = Omit<OrgRaciMatrix, 'id' | 'created_at'>;
export type OrgRaciMatrixUpdate = Partial<OrgRaciMatrixInsert>;

// ─── 6. GESTÃO DE COMITÊS (org_committees) ───────────────────

export interface OrgCommittee {
  id: string;
  company_id: string;
  nome: string;
  descricao?: string | null;
  data_constituicao?: string | null; // YYYY-MM-DD
  data_encerramento?: string | null; // YYYY-MM-DD
  status: 'ativo' | 'inativo' | 'suspenso';
  created_at: string;
}

export type OrgCommitteeInsert = Omit<OrgCommittee, 'id' | 'created_at'>;
export type OrgCommitteeUpdate = Partial<OrgCommitteeInsert>;

export interface OrgCommitteeMember {
  id: string;
  committee_id: string;
  employee_id: string;
  papel: string; // Presidente, Secretário, Membro
  data_inicio: string; // YYYY-MM-DD
  data_fim?: string | null; // YYYY-MM-DD
  created_at: string;
}

export type OrgCommitteeMemberInsert = Omit<OrgCommitteeMember, 'id' | 'created_at'>;
export type OrgCommitteeMemberUpdate = Partial<OrgCommitteeMemberInsert>;

// ─── 7. PLANOS DE SUCESSÃO (org_succession_plans) ────────────

export interface OrgSuccessionPlan {
  id: string;
  company_id: string;
  target_role_id: string;
  current_employee_id?: string | null;
  successor_employee_id: string;
  
  prontidao: ReadinessLevel;
  risco_perda: RiskLevel;
  gap_competencias: string[];
  plano_desenvolvimento?: string | null;
  
  created_at: string;
  updated_at: string;
}

export type OrgSuccessionPlanInsert = Omit<OrgSuccessionPlan, 'id' | 'created_at' | 'updated_at'>;
export type OrgSuccessionPlanUpdate = Partial<OrgSuccessionPlanInsert>;

// ─── 8. MODO SANDBOX (org_sandbox_scenarios) ────────────────

export interface OrgSandboxScenario {
  id: string;
  company_id: string;
  nome: string;
  descricao?: string | null;
  estrutura_dados: any; // Snapshots das alterações hierárquicas
  criador_email: string;
  status: 'rascunho' | 'aprovado' | 'arquivado';
  created_at: string;
  updated_at: string;
}

export type OrgSandboxScenarioInsert = Omit<OrgSandboxScenario, 'id' | 'created_at' | 'updated_at'>;
export type OrgSandboxScenarioUpdate = Partial<OrgSandboxScenarioInsert>;
