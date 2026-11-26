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
  /**
   * Ficha modelo do serviço (fase 2): modelo de checklist do Controle Operacional, da mesma
   * organização do item. Escolher o serviço na OE aplica esta ficha. Ausente = não lida.
   */
  checklist_template_id?: string | null;
}

export interface ProcedimentoResumo {
  id: string;
  nome: string;
  revisao: string | null;
  /** `opura_documents.status` (GED): 'ativo' | 'vencido' | 'alerta' | 'arquivado' | 'pendente_aprovacao' */
  status: string;
  /** `opura_documents.approval_status` (GED, minúsculo): 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' */
  approval_status: string;
  versao_ativa_em: string | null;
  /**
   * Quando o documento foi aprovado pela última vez (`updated_at` da linha mais recente de
   * `opura_document_approvals` com status 'aprovado'). A aprovação no GED é do documento, não da
   * versão: subir versão nova não mexe em `approval_status` — por isso a data.
   */
  aprovado_em: string | null;
}

export interface RegistroTreinamento {
  employee_id: string;
  data_realizacao: string;
  aprovado: boolean;
  /** academy_externo || contract_type === 'EMPREITEIRO' */
  externo: boolean;
  /** `employee_trainings.created_at` — desempata treinamento e revisão nova no mesmo dia. */
  registrado_em: string | null;
  /**
   * `employee_trainings.data_validade` (fase 2). Validade anterior a hoje (data local) tira o
   * registro da conta; o `status` VENCIDO sozinho não tira. Ausente/null = sem validade.
   */
  data_validade?: string | null;
}

/** Executor congelado na aprovação da inspeção (`work_order_validations.executores`). */
export interface ExecutorDaInspecao {
  employee_id: string;
  nome: string;
  /** Treinado na revisão vigente do procedimento no momento da aprovação. */
  treinado: boolean;
}

/**
 * Inspeção aprovada de OE de serviço controlado (fase 2) — `work_order_validations` type
 * 'inspection' status 'approved' — no formato de CONTAGEM da RPC
 * `quality_inspecoes_aprovadas_do_sgq` (migration aplicar_20271126140000): o membro do SGQ conta as
 * OEs das SPEs que apontam para ele sem ver nomes nem ids delas.
 */
export interface InspecaoAprovada {
  controlled_item_id: string;
  /** `liberado_em` (ou `created_at` da validação, se faltar). */
  aprovado_em: string;
  /** `projects.settings->>'obraStatus' = 'Em andamento'`. */
  obra_em_andamento: boolean;
  /** Executores congelados na aprovação. */
  executores_total: number;
  /** Dos executores, quantos estavam treinados na revisão vigente do procedimento. */
  executores_treinados: number;
}

export interface MetaDoNivel {
  comProcedimento: number;
  aplicadosComRegistro: number;
  emObraEmAndamento: number;
}
