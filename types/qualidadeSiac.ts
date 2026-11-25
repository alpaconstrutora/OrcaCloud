export type TipoItemControlado = 'SERVICO' | 'MATERIAL';
export type OrigemItem = 'ANEXO4' | 'PROPRIO' | 'CLIENTE' | 'FAD_DATEC';
export type SituacaoItem = 'ATIVO' | 'DISPENSADO' | 'ARQUIVADO';
export type NivelSiac = 'B' | 'A';

export interface ItemControlado {
  id: string;
  organization_id: string;
  tipo: TipoItemControlado;
  nome: string;
  etapa: string | null;
  origem: OrigemItem;
  anexo4_numero: number | null;
  chave_padrao: string | null;
  substitui_item_id: string | null;
  situacao: SituacaoItem;
  justificativa: string | null;
  procedure_document_id: string | null;
  training_course_id: string | null;
  ordem: number;
  codigos: string[];
}

export interface ProcedimentoResumo {
  id: string;
  nome: string;
  revisao: string | null;
  approval_status: string;
  versao_ativa_em: string | null;
}

export interface RegistroTreinamento {
  employee_id: string;
  data_realizacao: string;
  aprovado: boolean;
  /** academy_externo || contract_type === 'EMPREITEIRO' */
  externo: boolean;
}

export interface MetaDoNivel {
  comProcedimento: number;
  aplicadosComRegistro: number;
  emObraEmAndamento: number;
}
