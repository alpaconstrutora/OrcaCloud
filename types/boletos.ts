export type BoletoStatus =
    | 'rascunho'
    | 'revisao'
    | 'aprovado'
    | 'programado'
    | 'pago'
    | 'cancelado';

export type BoletoMetodoExtracao =
    | 'deterministic'
    | 'pdf_text'
    | 'manual'
    | 'ocr_local'
    | 'ocr_cloud';

export interface BoletoCampoExtraido<T = string> {
    valor: T | null;
    confidence: number;
}

export interface BoletoExtractionResult {
    metodo: BoletoMetodoExtracao;
    confidence_score: number;
    engine_versao: string;
    campos: {
        linha_digitavel: BoletoCampoExtraido<string>;
        codigo_barras: BoletoCampoExtraido<string>;
        qr_pix: BoletoCampoExtraido<string>;
        valor: BoletoCampoExtraido<number>;
        valor_original: BoletoCampoExtraido<number>;
        vencimento: BoletoCampoExtraido<string>;
        beneficiario_nome: BoletoCampoExtraido<string>;
        beneficiario_cnpj: BoletoCampoExtraido<string>;
        banco_codigo: BoletoCampoExtraido<string>;
        banco_nome: BoletoCampoExtraido<string>;
    };
    raw: Record<string, any>;
    erros: string[];
}

export interface Boleto {
    id: string;
    numero?: number;
    organization_id: string;

    documento_path: string;
    documento_nome: string;
    documento_hash: string;
    documento_mime?: string;
    documento_paginas?: number;
    documento_tamanho?: number;

    linha_digitavel?: string;
    codigo_barras?: string;
    qr_pix?: string;
    banco_codigo?: string;
    banco_nome?: string;
    valor?: number;
    valor_original?: number;
    vencimento?: string;
    data_documento?: string;

    beneficiario_nome?: string;
    beneficiario_cnpj?: string;
    beneficiario_banco?: string;
    beneficiario_agencia?: string;
    beneficiario_conta?: string;

    pagador_nome?: string;
    pagador_cnpj?: string;

    metodo_extracao?: BoletoMetodoExtracao;
    confidence_score?: number;
    engine_versao?: string;
    extracao_raw?: Record<string, any>;
    extracao_em?: string;

    checksum_valido?: boolean;
    duplicado_de?: string;
    erros_validacao?: string[];

    project_id?: string;
    cost_center_id?: string;
    supplier_id?: string;
    chart_of_accounts_id?: string;
    invoice_id?: string;

    sugestao_supplier_id?: string;
    sugestao_cc_id?: string;
    sugestao_confianca?: number;

    status: BoletoStatus;
    observacoes?: string;

    created_by?: string;
    created_by_email?: string;
    created_at: string;
    updated_at?: string;
}

export interface BoletoAuditoria {
    id: string;
    boleto_id: string;
    organization_id: string;
    acao: string;
    campo?: string;
    valor_antes?: any;
    valor_depois?: any;
    metodo: 'sistema' | 'usuario';
    usuario_email?: string;
    created_at: string;
}

export interface BoletoFilters {
    status?: BoletoStatus | BoletoStatus[];
    supplier_id?: string;
    project_id?: string;
    vencimento_de?: string;
    vencimento_ate?: string;
    search?: string;
}
