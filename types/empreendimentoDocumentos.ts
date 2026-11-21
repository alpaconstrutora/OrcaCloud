// types/empreendimentoDocumentos.ts
// Checklist de documentos legais do empreendimento (aba Documentos).
// Tabela: empreendimento_documentos_legais (aplicar_20271112995000).
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
  | 'CONVENCAO' | 'INDIVIDUALIZACAO'
  // lista Incorporação (Lei 4.591/64, art. 32) — 21/11/2026
  | 'MEMORIAL_INCORPORACAO' | 'CND_TRIBUTOS' | 'CERTIDOES_JUSTICA' | 'CERTIDOES_PROTESTO'
  | 'HISTORICO_TITULOS' | 'QUADROS_NBR_12721' | 'ATESTADO_IDONEIDADE' | 'CONTRATO_PADRAO'
  | 'DECLARACAO_PARCELA_PRECO' | 'CERTIDAO_MANDATO' | 'DECLARACAO_CARENCIA'
  | 'OUTRO';

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
 * CATÁLOGO de tipos (rótulo, categoria do GED, órgão, se vence). Quais tipos
 * entram por "Carregar lista padrão" — e com que título — é de LISTAS_PADRAO.
 * Os 18 primeiros estão na ordem do ciclo (terreno → aprovação → obra →
 * entrega → condomínio); o mesmo tipo pode ter vários itens no checklist
 * (duas escrituras, p.ex.) desde 21/11/2026.
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
  // ── Incorporação (Lei 4.591/64, art. 32) ──
  { tipo: 'MEMORIAL_INCORPORACAO', rotulo: 'Memorial de incorporação', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'CND_TRIBUTOS', rotulo: 'Certidões negativas de tributos federais, estaduais e municipais', categoria: 'juridico', orgao: 'Receita Federal, Sefaz e Prefeitura', vence: true },
  { tipo: 'CERTIDOES_JUSTICA', rotulo: 'Certidões das justiças federal e estadual', categoria: 'juridico', orgao: 'Justiça Federal e Justiça Estadual', vence: true },
  { tipo: 'CERTIDOES_PROTESTO', rotulo: 'Certidões de protesto de títulos', categoria: 'juridico', orgao: 'Tabelionato de Protesto', vence: true },
  { tipo: 'HISTORICO_TITULOS', rotulo: 'Histórico dos títulos de propriedade do imóvel (últimos 20 anos)', categoria: 'juridico', orgao: 'Cartório de Registro de Imóveis' },
  { tipo: 'QUADROS_NBR_12721', rotulo: 'Quadros da NBR 12.721:2006, com ART/RRT', categoria: 'engenharia', orgao: 'CREA/CAU' },
  { tipo: 'ATESTADO_IDONEIDADE', rotulo: 'Atestado de idoneidade financeira', categoria: 'financeiro', orgao: 'Instituição financeira' },
  { tipo: 'CONTRATO_PADRAO', rotulo: 'Contrato-padrão', categoria: 'juridico' },
  { tipo: 'DECLARACAO_PARCELA_PRECO', rotulo: 'Declaração em que se defina a parcela do preço (art. 39, II, Lei 4.591/64)', categoria: 'juridico' },
  { tipo: 'CERTIDAO_MANDATO', rotulo: 'Certidão de instrumento público de mandato', categoria: 'juridico', orgao: 'Tabelionato de Notas' },
  { tipo: 'DECLARACAO_CARENCIA', rotulo: 'Declaração do prazo de carência', categoria: 'juridico' },
];

export type ListaPadraoId = 'GERAL' | 'INCORPORACAO';

export interface ListaPadrao {
  id: ListaPadraoId;
  rotulo: string;
  descricao: string;
  /** Soma ao `sort_order` (base + 10, 20…): cada lista fica no seu bloco, em qualquer ordem de carga. */
  baseOrdem: number;
  /** `titulo` próprio da lista; sem ele, vale o rótulo do catálogo. */
  itens: { tipo: TipoDocumentoLegal; titulo?: string }[];
}

const tiposGerais: TipoDocumentoLegal[] = [
  'ESCRITURA', 'MATRICULA', 'CERTIDOES_IMOVEL', 'CND_PROPRIETARIO', 'APROVACAO_PROJETO',
  'ALVARA_DEMOLICAO', 'ALVARA_CONSTRUCAO', 'LICENCA_AMBIENTAL', 'ART_RRT', 'REGISTRO_INCORPORACAO',
  'CNO', 'AVCB', 'HABITE_SE', 'CND_INSS_OBRA', 'AVERBACAO', 'INSTITUICAO_CONDOMINIO', 'CONVENCAO',
  'INDIVIDUALIZACAO',
];

/**
 * Listas que "Carregar lista padrão" oferece. Um tipo que está nas duas
 * (escritura, certidões do imóvel, projeto, alvará de construção) entra UMA vez:
 * a segunda lista pula o tipo que o checklist já tem (decisão do usuário, 21/11).
 */
export const LISTAS_PADRAO: ListaPadrao[] = [
  {
    id: 'GERAL',
    rotulo: 'Geral (ciclo do empreendimento)',
    descricao: 'Do terreno ao condomínio: escritura, alvarás, habite-se, averbação e convenção.',
    baseOrdem: 0,
    itens: tiposGerais.map(tipo => ({ tipo })),
  },
  {
    id: 'INCORPORACAO',
    rotulo: 'Incorporação (Lei 4.591/64)',
    descricao: 'Documentos do art. 32 para registrar a incorporação no Cartório de Registro de Imóveis.',
    baseOrdem: 1000,
    itens: [
      { tipo: 'MEMORIAL_INCORPORACAO' },
      { tipo: 'ESCRITURA', titulo: 'Título de propriedade do terreno' },
      { tipo: 'CND_TRIBUTOS' },
      { tipo: 'CERTIDOES_JUSTICA' },
      { tipo: 'CERTIDOES_PROTESTO' },
      { tipo: 'CERTIDOES_IMOVEL', titulo: 'Certidões do imóvel' },
      { tipo: 'HISTORICO_TITULOS' },
      { tipo: 'QUADROS_NBR_12721' },
      { tipo: 'APROVACAO_PROJETO', titulo: 'Projeto arquitetônico de construção' },
      { tipo: 'ALVARA_CONSTRUCAO', titulo: 'Alvará de construção' },
      { tipo: 'ATESTADO_IDONEIDADE' },
      { tipo: 'CONTRATO_PADRAO' },
      { tipo: 'DECLARACAO_PARCELA_PRECO' },
      { tipo: 'CERTIDAO_MANDATO' },
      { tipo: 'DECLARACAO_CARENCIA' },
    ],
  },
];

export function listaPadrao(id: ListaPadraoId): ListaPadrao {
  return LISTAS_PADRAO.find(l => l.id === id)!;
}

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
