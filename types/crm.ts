export type CrmLeadSource =
  | 'SITE'
  | 'WHATSAPP'
  | 'INDICACAO'
  | 'CORRETOR'
  | 'PORTAL'
  | 'EVENTO'
  | 'INTERNO';

export type CrmPipelineStageId =
  | 'novo'
  | 'primeiro-contato'
  | 'qualificacao'
  | 'visita'
  | 'proposta'
  | 'negociacao'
  | 'contrato'
  | 'ganho'
  | 'perdido';

export type CrmOpportunityTemperature = 'frio' | 'morno' | 'quente';

export type CrmOpportunityKind = 'VENDA_IMOVEL' | 'LOCACAO' | 'SERVICO' | 'INVESTIMENTO';

export type CrmTaskType = 'LIGACAO' | 'WHATSAPP' | 'REUNIAO' | 'VISITA' | 'PROPOSTA' | 'RETORNO';

export interface CrmPipelineStage {
  id: CrmPipelineStageId;
  label: string;
  order: number;
}

export interface CrmContact {
  id: string;
  organization_id?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  document?: string;
}

export interface CrmTask {
  id: string;
  organization_id?: string;
  opportunity_id: string;
  type: CrmTaskType;
  title: string;
  due_at: string;
  status: 'PENDENTE' | 'CONCLUIDA' | 'ATRASADA';
}

export interface CrmProposal {
  id: string;
  organization_id?: string;
  opportunity_id: string;
  version: number;
  value: number;
  discount_pct: number;
  expires_at: string;
  status: 'RASCUNHO' | 'ENVIADA' | 'ACEITA' | 'RECUSADA' | 'VENCIDA';
}

export interface CrmTimelineEvent {
  id: string;
  organization_id?: string;
  opportunity_id: string;
  at: string;
  title: string;
  description: string;
}

export interface CrmOpportunity {
  id: string;
  organization_id?: string;
  contact_id?: string;
  title: string;
  kind: CrmOpportunityKind;
  contact: CrmContact;
  source: CrmLeadSource;
  stage_id: CrmPipelineStageId;
  temperature: CrmOpportunityTemperature;
  value: number;
  property_id?: string;
  property_name?: string;
  building_name?: string;
  owner_name?: string;
  next_action_at?: string;
  loss_reason?: string;
  created_at: string;
  updated_at: string;
}