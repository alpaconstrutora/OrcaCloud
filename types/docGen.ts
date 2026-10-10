import type { OpuraDocumentCategoria } from './documents';
import type { ApprovalStep } from './financial';

/**
 * Motor de documentos parametrizados (Documentos › Ofícios).
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * O Ofício é o primeiro `tipo_documental`; o desenho é genérico de propósito
 * para que cartas, declarações, memorandos etc. entrem sem outro motor.
 */
export type DocGenTipoDocumental = 'OFICIO';
export type DocGenModeloStatus = 'rascunho' | 'ativo' | 'inativo';

/** Marca de formatação inline do TipTap (negrito, itálico, link…). */
export interface MarcaTipTap {
    type: string;
    attrs?: Record<string, unknown>;
}

/** Nó do documento TipTap — a forma que o editor grava em JSON. */
export interface NoTipTap {
    type: string;
    attrs?: Record<string, unknown>;
    content?: NoTipTap[];
    marks?: MarcaTipTap[];
    text?: string;
}

/** Documento TipTap inteiro (`type: 'doc'`). */
export interface DocTipTap {
    type: 'doc';
    content?: NoTipTap[];
}

export const DOC_TIPTAP_VAZIO: DocTipTap = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Fontes embutidas no PDF (vfs do pdfmake). Fonte livre fica para a Fase 3. */
export type FonteDocumento = 'Roboto';

export interface LayoutModelo {
    fonte: FonteDocumento;
    /** Tamanho do corpo, em pt. */
    tamanhoFonte: number;
    /** Entrelinha relativa (1 = simples, 1.15, 1.5). */
    entrelinha: number;
    /** Espaço depois de cada parágrafo, em pt. */
    espacoParagrafo: number;
    /** Margens em mm. */
    margens: { superior: number; inferior: number; esquerda: number; direita: number };
    cabecalho: {
        mostrar: boolean;
        /** Logo da organização à esquerda do texto do cabeçalho. */
        logo: 'organizacao' | 'nenhuma';
        /** Texto com variáveis {{…}}; quebras de linha são respeitadas. */
        texto: string;
        alinhamento: 'left' | 'center' | 'right';
    };
    rodape: {
        mostrar: boolean;
        texto: string;
        alinhamento: 'left' | 'center' | 'right';
        /** "Página X de Y" à direita. */
        paginacao: boolean;
    };
}

export const LAYOUT_PADRAO: LayoutModelo = {
    fonte: 'Roboto',
    tamanhoFonte: 11,
    entrelinha: 1.15,
    espacoParagrafo: 6,
    margens: { superior: 20, inferior: 20, esquerda: 25, direita: 20 },
    cabecalho: {
        mostrar: true,
        logo: 'organizacao',
        texto: '{{empresa.razao_social}}\n{{empresa.endereco_completo}}',
        alinhamento: 'right',
    },
    rodape: {
        mostrar: true,
        texto: '{{empresa.telefone}} · {{empresa.email}} · {{empresa.site}}',
        alinhamento: 'left',
        paginacao: true,
    },
};

export interface DocGenModelo {
    id: string;
    organization_id: string;
    nome: string;
    descricao: string | null;
    tipo_documental: DocGenTipoDocumental;
    categoria_ged: OpuraDocumentCategoria;
    department_id: string | null;
    status: DocGenModeloStatus;
    conteudo: DocTipTap;
    layout: LayoutModelo;
    campos_obrigatorios: string[];
    signatario_member_id: string | null;
    responsavel_email: string | null;
    /** F4: ofício deste modelo só é emitido depois de aprovado (fila de aprovação). */
    exige_aprovacao: boolean;
    /** F4: ofício deste modelo só é emitido com a assinatura eletrônica de todos os signatários. */
    exige_assinatura: boolean;
    versao: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export type DocGenModeloInsert = Omit<DocGenModelo, 'id' | 'versao' | 'created_at' | 'updated_at' | 'created_by'>;
export type DocGenModeloUpdate = Partial<Omit<DocGenModeloInsert, 'organization_id'>>;

export interface DocGenModeloVersao {
    id: string;
    modelo_id: string;
    organization_id: string;
    versao: number;
    conteudo: DocTipTap;
    layout: LayoutModelo;
    created_by: string | null;
    created_at: string;
}

/** Quem assina — snapshot do usuário da organização no momento do documento. */
export interface SignatarioDoc {
    memberId?: string | null;
    nome: string;
    cargo?: string | null;
    registroProfissional?: string | null;
    departamento?: string | null;
    telefone?: string | null;
    email?: string | null;
    /** Imagem da assinatura já lida (data URL), quando o PDF deve desenhá-la. */
    imagemDataUrl?: string | null;
}

/** Destinatário normalizado — qualquer origem (cliente, fornecedor, manual…) vira isto. */
export interface DestinatarioSnapshot {
    tipo: 'CLIENTE' | 'FORNECEDOR' | 'ORGANIZACAO' | 'COLABORADOR' | 'CORRETOR' | 'INVESTIDOR' | 'MANUAL';
    id?: string | null;
    razao_social: string;
    nome_fantasia?: string | null;
    cpf_cnpj?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
    contato_nome?: string | null;
    contato_email?: string | null;
    contato_telefone?: string | null;
}

// ─── F2: o documento (ofício) ────────────────────────────────────────────────
/** F4: depois de EMITIDO, a situação anda só pela tramitação (`doc_gen_tramitar`). */
export type DocGenDocumentoStatus = 'RASCUNHO' | 'EMITIDO' | 'ENVIADO' | 'RECEBIDO' | 'RESPONDIDO' | 'ENCERRADO' | 'CANCELADO';
/** Situações depois da emissão para as quais a tramitação leva. */
export type DocGenSituacaoTramitacao = Exclude<DocGenDocumentoStatus, 'RASCUNHO' | 'EMITIDO'>;
export type DocGenAprovacaoStatus = 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';
export type DestinatarioTipo = DestinatarioSnapshot['tipo'];

/** Anexo listado no documento. Do GED aponta o documento; descrito é só o nome. */
export interface AnexoDoc {
    tipo: 'GED' | 'DESCRITO';
    nome: string;
    documentId?: string | null;
}

export interface DocGenDocumento {
    id: string;
    organization_id: string;
    company_id: string | null;
    modelo_id: string;
    modelo_versao: number;
    tipo_documental: DocGenTipoDocumental;
    status: DocGenDocumentoStatus;
    numero: string | null;
    assunto: string;
    /** `YYYY-MM-DD`; null = data automática (a da emissão). */
    data_documento: string | null;
    cidade: string | null;
    department_id: string | null;
    destinatario_tipo: DestinatarioTipo | null;
    destinatario_id: string | null;
    destinatario_snapshot: DestinatarioSnapshot | null;
    project_id: string | null;
    empreendimento_id: string | null;
    contract_id: string | null;
    client_id: string | null;
    supplier_id: string | null;
    /** Só os overrides "preencher só neste documento" (chave → valor). */
    valores: Record<string, string>;
    /** Texto de cada campo livre do modelo (nome → documento TipTap). */
    conteudo: Record<string, DocTipTap>;
    signatarios: SignatarioDoc[];
    anexos: AnexoDoc[];
    documento_relacionado_id: string | null;
    resposta_esperada_ate: string | null;
    /** F5: os anexos do GED entram DENTRO do PDF (páginas depois do texto). */
    anexos_no_pdf: boolean;
    versao: number;
    ged_document_id: string | null;
    ged_version_id: string | null;
    emitido_por: string | null;
    emitido_em: string | null;
    /** F4 — aprovação pela primitiva única (`approvalService`, entidade `doc_gen_documento`). */
    approval_status: DocGenAprovacaoStatus;
    approval_chain: ApprovalStep[];
    approval_required_levels: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

/** Campos que o banco/serviço controla — o formulário nunca os grava. */
export type CamposControlados = 'id' | 'status' | 'numero' | 'versao' | 'ged_document_id' | 'ged_version_id' | 'emitido_por' | 'emitido_em'
    | 'approval_status' | 'approval_chain' | 'approval_required_levels' | 'created_by' | 'created_at' | 'updated_at';

/** O que o formulário edita (tudo menos o que o banco/serviço controla). */
export type DocGenDocumentoRascunho = Omit<DocGenDocumento, CamposControlados>;

export interface DocGenDocumentoVersao {
    id: string;
    documento_id: string;
    organization_id: string;
    versao: number;
    snapshot: DocGenDocumentoRascunho;
    autor: string | null;
    congelada: boolean;
    created_at: string;
}

// ─── F4: tramitação ──────────────────────────────────────────────────────────

/** Assinatura eletrônica interna — vale para a `versao` do rascunho que foi assinada. */
export interface DocGenAssinatura {
    id: string;
    documento_id: string;
    member_id: string;
    nome: string;
    email: string | null;
    versao: number;
    assinado_em: string;
}

/** Linha do tempo do documento (gravada só pelo banco). */
export interface DocGenEvento {
    id: string;
    documento_id: string;
    tipo: string;
    dados: Record<string, unknown>;
    autor: string | null;
    created_at: string;
}

export type DocGenVinculoTipo = 'RESPONDE' | 'ENCAMINHA' | 'RETIFICA' | 'REFERENCIA';

/** "DE <tipo> PARA" — cada ponta é um ofício do sistema OU um documento do GED. */
export interface DocGenVinculo {
    id: string;
    organization_id: string;
    de_documento_id: string | null;
    de_ged_id: string | null;
    para_documento_id: string | null;
    para_ged_id: string | null;
    tipo: DocGenVinculoTipo;
    observacao: string | null;
    created_by: string | null;
    created_at: string;
}

/** Ofício RECEBIDO de terceiro: um documento do GED com `metadados.tipo = 'OFICIO_RECEBIDO'`. */
export interface MetadadosOficioRecebido {
    tipo: 'OFICIO_RECEBIDO';
    numero: string | null;
    assunto: string;
    remetente: string;
    remetente_supplier_id?: string | null;
    data_documento?: string | null;
    recebido_em: string;
    responder_ate?: string | null;
}

// ─── F6: biblioteca de blocos ────────────────────────────────────────────────

/** Trecho pronto da organização — inserir copia o conteúdo para o modelo/ofício. */
export interface DocGenBloco {
    id: string;
    organization_id: string;
    nome: string;
    descricao: string | null;
    conteudo: DocTipTap;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}
