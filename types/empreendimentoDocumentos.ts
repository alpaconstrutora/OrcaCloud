// types/empreendimentoDocumentos.ts
// Checklist de documentos legais do empreendimento (aba Documentos).
// Tabela: empreendimento_documentos_legais (aplicar_20271112990000).
// Plano: docs/planos/2026-11-12-empreendimento-aba-documentos.md
//
// O ARQUIVO mora no GED (opura_documents, via document_id). Esta tabela guarda
// o que o checklist precisa saber mesmo sem arquivo: número, órgão, protocolo,
// datas e situação.
import type { OpuraDocumentCategoria } from './documents';

export type TipoDocumentoLegal =
  | 'ESCRITURA' | 'MATRICULA' | 'CERTIDOES_IMOVEL' | 'CND_PROPRIETARIO'
  | 'APROVACAO_PROJETO' | 'ALVARA_CONSTRUCAO' | 'ALVARA_DEMOLICAO'
  | 'LICENCA_AMBIENTAL' | 'ART_RRT' | 'REGISTRO_INCORPORACAO' | 'CNO' | 'AVCB'
  | 'HABITE_SE' | 'CND_INSS_OBRA' | 'AVERBACAO' | 'INSTITUICAO_CONDOMINIO'
  | 'CONVENCAO' | 'INDIVIDUALIZACAO' | 'OUTRO';

/** Gravada no banco. "Vencido" não está aqui de propósito: é derivado da validade. */
export type SituacaoDocumentoLegal = 'PENDENTE' | 'EM_ANDAMENTO' | 'EMITIDO' | 'DISPENSADO';

export interface DocumentoLegal {
  id: string;
  organization_id: string;
  empreendimento_id: string;
  tipo: TipoDocumentoLegal;
  titulo: string;
  numero: string | null;
  orgao_emissor: string | null;
  protocolo: string | null;
  data_protocolo: string | null;
  data_emissao: string | null;
  data_validade: string | null;
  alerta_dias_antecedencia: number;
  situacao: SituacaoDocumentoLegal;
  obrigatorio: boolean;
  responsavel: string | null;
  observacoes: string | null;
  document_id: string | null;
  storage_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DocumentoLegalInsert = Omit<DocumentoLegal, 'id' | 'created_at' | 'updated_at'>;
export type DocumentoLegalUpdate = Partial<Omit<DocumentoLegal, 'id' | 'organization_id' | 'empreendimento_id' | 'created_at' | 'updated_at'>>;

export interface TipoDocumentoLegalInfo {
  tipo: TipoDocumentoLegal;
  rotulo: string;
  /** Categoria do GED em que o arquivo cai (aba do módulo Documentos). */
  categoria: OpuraDocumentCategoria;
  /** Sugestão para o campo "Órgão emissor" ao carregar a lista. */
  orgao?: string;
  /** Documento que costuma ter validade (o formulário destaca o campo). */
  vence?: boolean;
}

/**
 * Lista padrão, na ORDEM do ciclo de um empreendimento: terreno → aprovação →
 * obra → entrega → condomínio. `sort_order` sai desta ordem.
 */
export const TIPOS_DOCUMENTO_LEGAL: TipoDocumentoLegalInfo[] = [
  { tipo: 'ESCRITURA', rotulo: 'Escritura do terreno', categoria: 'juridico', orgao: 'Tabelionato de Notas' },
  { tipo: 'MATRICULA', rotulo: 'Matrícula atualizada', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis', vence: true },
  { tipo: 'CERTIDOES_IMOVEL', rotulo: 'Certidões do imóvel (ônus reais e ações reipersecutórias)', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis', vence: true },
  { tipo: 'CND_PROPRIETARIO', rotulo: 'Certidões negativas do proprietário/SPE', categoria: 'juridico', vence: true },
  { tipo: 'APROVACAO_PROJETO', rotulo: 'Aprovação do projeto arquitetônico', categoria: 'compliance', orgao: 'Prefeitura', vence: true },
  { tipo: 'ALVARA_DEMOLICAO', rotulo: 'Alvará de demolição', categoria: 'compliance', orgao: 'Prefeitura', vence: true },
  { tipo: 'ALVARA_CONSTRUCAO', rotulo: 'Alvará de construção', categoria: 'compliance', orgao: 'Prefeitura', vence: true },
  { tipo: 'LICENCA_AMBIENTAL', rotulo: 'Licença ambiental (LP/LI/LO)', categoria: 'compliance', orgao: 'Órgão ambiental', vence: true },
  { tipo: 'ART_RRT', rotulo: 'ART/RRT de projeto e execução', categoria: 'engenharia', orgao: 'CREA/CAU' },
  { tipo: 'REGISTRO_INCORPORACAO', rotulo: 'Registro de incorporação (memorial – Lei 4.591)', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'CNO', rotulo: 'Cadastro Nacional de Obras (CNO)', categoria: 'compliance', orgao: 'Receita Federal' },
  { tipo: 'AVCB', rotulo: 'AVCB – Corpo de Bombeiros', categoria: 'compliance', orgao: 'Corpo de Bombeiros', vence: true },
  { tipo: 'HABITE_SE', rotulo: 'Habite-se', categoria: 'compliance', orgao: 'Prefeitura' },
  { tipo: 'CND_INSS_OBRA', rotulo: 'CND de obra (INSS) para averbação', categoria: 'compliance', orgao: 'Receita Federal', vence: true },
  { tipo: 'AVERBACAO', rotulo: 'Averbação da construção', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'INSTITUICAO_CONDOMINIO', rotulo: 'Instituição e especificação de condomínio', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'CONVENCAO', rotulo: 'Convenção de condomínio', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'INDIVIDUALIZACAO', rotulo: 'Individualização das matrículas', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
];

/** Tipo avulso — não entra na lista padrão e pode repetir. */
export const TIPO_OUTRO: TipoDocumentoLegalInfo = { tipo: 'OUTRO', rotulo: 'Outro documento', categoria: 'compliance' };

export function infoDoTipo(tipo: TipoDocumentoLegal): TipoDocumentoLegalInfo {
  return TIPOS_DOCUMENTO_LEGAL.find(t => t.tipo === tipo) ?? TIPO_OUTRO;
}

export const SITUACAO_ROTULO: Record<SituacaoDocumentoLegal, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  EMITIDO: 'Emitido',
  DISPENSADO: 'Dispensado',
};

export const CATEGORIA_GED_ROTULO: Record<OpuraDocumentCategoria, string> = {
  juridico: 'Contratos',
  engenharia: 'Projetos',
  compliance: 'Licenças & Alvarás',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  normas: 'Normas',
};
