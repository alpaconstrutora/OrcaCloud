import type { OpuraDocumentCategoria } from './documents';

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
