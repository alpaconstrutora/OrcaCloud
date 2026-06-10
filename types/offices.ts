// ÒPURA Offices — Interfaces de Dados (Fase 1)

export type OfficesLeadStatus = 'BRIEFING' | 'PROPOSTA' | 'CONTRATADO' | 'PERDIDO';

export interface OfficesLead {
  id: string;
  user_id: string;
  nome_cliente: string;
  contato?: string;
  briefing?: string;
  valor_estimado: number;
  status: OfficesLeadStatus;
  created_at: string;
}

export type OfficesAprovacaoStatus = 'PENDENTE' | 'APROVADO' | 'RECUSADO';

export interface OfficesEspecificacao {
  id: string;
  user_id: string;
  projeto_id: string;
  ambiente: string;
  item_nome: string;
  fabricante_fornecedor?: string;
  quantidade: number;
  preco_unitario: number;
  foto_url?: string;
  status_aprovacao: OfficesAprovacaoStatus;
  comentario_cliente?: string;
  created_at: string;
}

export interface OfficesTimesheet {
  id: string;
  user_id: string;
  projeto_id: string;
  horas: number;
  descricao_atividade?: string;
  data_lancamento: string;
  created_at: string;
}
