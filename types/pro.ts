// ÒPURA Pro — Interfaces de Dados (Fase 1)

export interface ProCliente {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  endereco?: string;
  observacoes?: string;
  created_at: string;
}

export type ProOrcamentoStatus = 'RASCUNHO' | 'ENVIADO' | 'APROVADO' | 'RECUSADO';

export interface ProOrcamento {
  id: string;
  user_id: string;
  cliente_id: string;
  descricao: string;
  valor: number;
  fotos: string[];
  observacoes?: string;
  validade_dias: number;
  garantia_dias?: number;
  status: ProOrcamentoStatus;
  created_at: string;
}

export type ProServicoStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'BLOQUEADO';

export interface ProOSChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface ProServico {
  id: string;
  orcamento_id: string;
  checklist: ProOSChecklistItem[];
  fotos_antes: string[];
  fotos_depois: string[];
  assinatura_nome?: string;
  assinatura_data?: string;
  assinatura_imagem?: string;
  status: ProServicoStatus;
  recorrencia_meses?: number;
  proximo_agendamento?: string;
  created_at: string;
}

export type ProPixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'CELULAR' | 'ALEATORIA';

export interface ProConfig {
  user_id: string;
  pix_key?: string;
  pix_key_type?: ProPixKeyType;
  template_header?: string;
  template_footer?: string;
  profissao?: string;
  templates_custom?: { id: string; titulo: string; descricao: string; valor: number; unidade?: string; quantidade?: number }[];
  created_at: string;
}
