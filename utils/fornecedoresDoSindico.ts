// utils/fornecedoresDoSindico.ts
//
// Portal do Síndico › Financeiro › Fornecedores e Contratos (G3, 26/11/2026).
// A parte pura (sem React, sem Supabase).
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_fornecedores`, `_editar_fornecedor`,
// `_salvar_conta_fornecedor`, `sindico_portal_contrato_*` — migrations
// aplicar_20271126950000 e aplicar_20271126950100); isto existe para o botão
// desligado dizer o motivo ANTES do clique, com as mesmas frases.

export interface ContaDoFornecedor {
    id: string;
    banco: string | null;
    codigoBanco: string | null;
    agencia: string | null;
    conta: string | null;
    tipoConta: 'corrente' | 'poupanca' | 'pagamento' | null;
    titular: string | null;
    documentoTitular: string | null;
    pix: string | null;
    tipoPix: TipoPix | null;
    principal: boolean;
    ativa: boolean;
}

export type TipoPix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export const TIPOS_PIX: { value: TipoPix; label: string }[] = [
    { value: 'cnpj', label: 'CNPJ' }, { value: 'cpf', label: 'CPF' }, { value: 'email', label: 'E-mail' },
    { value: 'telefone', label: 'Telefone' }, { value: 'aleatoria', label: 'Aleatória' },
];

/** Um fornecedor como `sindico_portal_fornecedores` devolve. */
export interface FornecedorDoCondominio {
    id: string;
    codigo: string | null;
    nome: string;
    apelido: string | null;
    documento: string | null;
    tipo: 'PF' | 'PJ' | null;
    email: string | null;
    telefone: string | null;
    contato: string | null;
    categoria: string | null;
    /** Cadastro da org do condomínio; o compartilhado por outra empresa só se consulta. */
    editavel: boolean;
    lancadoPeloSindico: boolean;
    titulosEmAberto: number;
    contas: ContaDoFornecedor[];
}

/** Mesma frase de `fn_sindico_motivo_nao_edita_fornecedor`. */
export const MOTIVO_FORNECEDOR_DE_OUTRA_ORG =
    'Este fornecedor é de outra organização, disponibilizado para o condomínio: só quem o cadastrou altera.';

export function motivoNaoEditaFornecedor(f: Pick<FornecedorDoCondominio, 'editavel'>, base: string | null): string | null {
    if (base) return base;
    return f.editavel ? null : MOTIVO_FORNECEDOR_DE_OUTRA_ORG;
}

/** CPF tem 11 dígitos, CNPJ 14; vazio vale. */
export function motivoDoDocumento(doc: string, quem = ''): string | null {
    const d = doc.replace(/\D/g, '');
    if (!d) return null;
    return d.length === 11 || d.length === 14 ? null : `CPF${quem} tem 11 dígitos e CNPJ tem 14.`;
}

export interface FormContaDoFornecedor {
    pix: string;
    tipoPix: TipoPix | '';
    banco: string;
    agencia: string;
    conta: string;
    tipoConta: 'corrente' | 'poupanca' | 'pagamento';
    titular: string;
    documentoTitular: string;
    principal: boolean;
}

/** Espelho das checagens de `sindico_portal_salvar_conta_fornecedor` (conta ativa). */
export function motivoDaConta(f: FormContaDoFornecedor): string | null {
    const pix = f.pix.trim();
    const conta = f.conta.trim();
    if (!pix && !conta) return 'Informe a chave PIX ou a conta bancária.';
    if (pix && !f.tipoPix) return 'Escolha o tipo da chave PIX.';
    if (conta && !f.agencia.trim()) return 'Informe a agência da conta.';
    return motivoDoDocumento(f.documentoTitular, ' do titular');
}

/** "PIX CNPJ 11.222… · Sicredi 0812 / 12345-6" — o resumo da conta numa linha. */
export function resumoDaConta(c: Pick<ContaDoFornecedor, 'pix' | 'tipoPix' | 'banco' | 'agencia' | 'conta'>): string {
    const partes: string[] = [];
    if (c.pix) partes.push(`PIX ${TIPOS_PIX.find(t => t.value === c.tipoPix)?.label ?? ''} ${c.pix}`.replace(/\s+/g, ' ').trim());
    const banco = [c.banco, [c.agencia, c.conta].filter(Boolean).join(' / ')].filter(Boolean).join(' ');
    if (banco) partes.push(banco);
    return partes.join(' · ') || '—';
}

// ── Contratos ────────────────────────────────────────────────────────────────

export const PERIODICIDADES = ['Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'] as const;
export type Periodicidade = typeof PERIODICIDADES[number];

/** Um contrato como `sindico_portal_contratos` devolve. */
export interface ContratoDoCondominio {
    id: string;
    numero: string | null;
    objeto: string;
    status: string;
    fornecedorId: string | null;
    fornecedor: string | null;
    valor: number;
    recorrente: boolean;
    periodicidade: Periodicidade | null;
    diaVencimento: number | null;
    inicio: string;
    fim: string | null;
    centroId: string | null;
    categoriaId: string | null;
    parcelas: number;
    pagas: number;
    emAberto: number;
    proximoVencimento: string | null;
}

export const CONTRATO_ENCERRADO = ['Encerrado', 'Cancelado', 'Concluído'];

export interface FormContrato {
    objeto: string;
    fornecedorId: string;
    valor: number;
    periodicidade: Periodicidade;
    diaVencimento: number | null;
    inicio: string;
    fim: string;
    centroId: string;
    categoriaId: string;
}

/** Espelho de `fn_sindico_motivo_contrato` (sem o que só o banco sabe: fornecedor visível, centro do condomínio). */
export function motivoDoContrato(f: FormContrato): string | null {
    if (!f.objeto.trim()) return 'Informe o objeto do contrato.';
    if (!f.fornecedorId) return 'Escolha o fornecedor.';
    if (!(f.valor >= 0.01)) return 'Informe o valor da parcela.';
    if (!f.inicio) return 'Informe o início do contrato.';
    if (f.fim && f.fim < f.inicio) return 'O fim não pode ser antes do início.';
    if (f.diaVencimento == null || f.diaVencimento < 1 || f.diaVencimento > 28) return 'Dia de vencimento de 1 a 28.';
    if (!f.centroId) return 'Escolha um centro de custo deste condomínio.';
    if (!f.categoriaId) return 'Escolha a conta financeira.';
    return null;
}

export function motivoNaoEncerraContrato(c: Pick<ContratoDoCondominio, 'status'>, base: string | null): string | null {
    if (base) return base;
    return CONTRATO_ENCERRADO.includes(c.status) ? 'Este contrato já está encerrado.' : null;
}

/** Parcelas pagas / total — "3 de 12 pagas". */
export function andamentoDoContrato(c: Pick<ContratoDoCondominio, 'parcelas' | 'pagas'>): string {
    if (!c.parcelas) return 'Sem parcelas';
    return `${c.pagas} de ${c.parcelas} ${c.parcelas === 1 ? 'paga' : 'pagas'}`;
}
