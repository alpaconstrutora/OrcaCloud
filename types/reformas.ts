// ÒPURA Reformas — Interfaces de Dados (Fase 2 MVP)

export type ReformaProjetoStatus = 'PLANEJAMENTO' | 'EM_ANDAMENTO' | 'FINALIZADO';

export interface ReformaProjeto {
  id: string;
  user_id: string;
  nome_cliente: string;
  endereco?: string;
  data_inicio: string;
  data_fim?: string;
  status: ReformaProjetoStatus;
  orcamento_total: number;
  created_at: string;
}

export interface ReformaDiario {
  id: string;
  user_id: string;
  reforma_id: string;
  data_registro: string;
  resumo_markdown: string;
  fotos_urls: string[];
  audio_transcrito?: string;
  clima: string;
  temperatura: string;
  created_at: string;
}

export type ReformaCronogramaStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO';

export interface ReformaCronograma {
  id: string;
  user_id: string;
  reforma_id: string;
  tarefa: string;
  responsavel?: string;
  data_limite?: string;
  status: ReformaCronogramaStatus;
  created_at: string;
}
