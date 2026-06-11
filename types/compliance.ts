// ÒPURA Compliance — Interfaces de Dados (Fase 1)

export interface CompliancePhysicalLocation {
  id: string;
  org_id: string;
  company_id: string | null;
  name: string;
  type: 'sala' | 'posicao_logistica' | 'locker' | 'escritorio' | string;
  coordinates?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    [key: string]: any;
  } | null;
  status: 'disponivel' | 'ocupado' | 'manutencao' | string;
  created_at: string;
  updated_at: string;
}

export type CompliancePhysicalLocationInsert = Omit<CompliancePhysicalLocation, 'id' | 'created_at' | 'updated_at'>;
export type CompliancePhysicalLocationUpdate = Partial<CompliancePhysicalLocationInsert>;

export interface ComplianceRule {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  category: 'tts_mg' | 'licenca' | 'anvisa' | 'avcb' | string;
  metric_threshold?: number | null;
  recurrence_days: number;
  created_at: string;
}

export type ComplianceRuleInsert = Omit<ComplianceRule, 'id' | 'created_at'>;
export type ComplianceRuleUpdate = Partial<ComplianceRuleInsert>;

export type ComplianceChecklistStatus = 'pendente' | 'em_analise' | 'conforme' | 'inconforme';

export interface ComplianceChecklist {
  id: string;
  org_id: string;
  company_id: string;
  rule_id: string | null;
  title: string;
  status: ComplianceChecklistStatus;
  due_date: string;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export type ComplianceChecklistInsert = Omit<ComplianceChecklist, 'id' | 'created_at'>;
export type ComplianceChecklistUpdate = Partial<ComplianceChecklistInsert>;

export interface ComplianceEvidence {
  id: string;
  org_id: string;
  company_id: string;
  checklist_id: string | null;
  operation_type: 'recebimento' | 'expedicao' | 'inventario' | string;
  document_ref?: string | null;
  operator_email: string;
  evidence_url: string;
  file_hash?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  captured_at: string;
  created_at: string;
}

export type ComplianceEvidenceInsert = Omit<ComplianceEvidence, 'id' | 'created_at'>;
export type ComplianceEvidenceUpdate = Partial<ComplianceEvidenceInsert>;
