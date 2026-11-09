// Regras puras do extrato da conta Asaas — SEM imports (Deno + Vitest).
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 2.4).
// Endpoint conferido na documentação oficial em 17/10/2026:
//   GET /v3/financialTransactions?startDate&finishDate&offset&limit(≤100)&order
//   item: { id, value (negativo = saída), balance, type, date, description,
//           paymentId, transferId, billId, … }
// A taxa da Asaas vem em LINHA PRÓPRIA (PAYMENT_FEE, BILL_PAYMENT_FEE,
// TRANSFER_FEE, …) com o mesmo paymentId/billId/transferId do movimento
// principal — o mesmo desenho do razão: título pelo bruto + linha ASAAS_FEE
// com reference_id = id na Asaas.

export type AmbienteAsaas = 'sandbox' | 'production';

export function baseDaAsaas(env: string | null | undefined): string {
    return String(env).toLowerCase() === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3';
}

export interface ItemExtratoAsaas {
    id: string;
    value: number;
    balance?: number | null;
    type?: string | null;
    date: string;
    description?: string | null;
    paymentId?: string | null;
    transferId?: string | null;
    billId?: string | null;
}

export interface LinhaBancaria {
    organization_id: string;
    bank_account_id: string;
    external_id: string;
    fingerprint: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description_raw: string;
    description_normalized: string;
    transaction_type: string | null;
    /** Saldo da conta logo após o movimento (`balance` da Asaas). */
    saldo_apos: number | null;
    status: 'NORMALIZED';
}

/** `balance` da Asaas → número com 2 casas, ou null quando não veio. */
export function saldoDoItem(item: Pick<ItemExtratoAsaas, 'balance'>): number | null {
    const b = item.balance;
    if (b === null || b === undefined || !Number.isFinite(Number(b))) return null;
    return Math.round(Number(b) * 100) / 100;
}

/**
 * Linha do extrato → `bank_transactions`. `external_id` é o id da Asaas (há
 * UNIQUE (bank_account_id, external_id): reimportar a janela não duplica).
 * O fingerprint também precisa ser único por conta — `asaas:<id>` basta, sem
 * o hash de data/valor/descrição do importador de arquivo.
 * Já nasce NORMALIZED: o motor e o pareamento de transferências do cron
 * (reconciliation-engine) leem a partir daí.
 */
export function linhaDoExtrato(
    item: ItemExtratoAsaas,
    contaId: string,
    orgId: string,
    normalizar: (s: string) => string,
): LinhaBancaria {
    const valor = Number(item.value ?? 0);
    const descricao = (item.description && item.description.trim()) || item.type || 'Movimento Asaas';
    return {
        organization_id: orgId,
        bank_account_id: contaId,
        external_id: item.id,
        fingerprint: `asaas:${item.id}`,
        transaction_date: item.date.slice(0, 10),
        amount: Math.round(Math.abs(valor) * 100) / 100,
        direction: valor < 0 ? 'DEBIT' : 'CREDIT',
        description_raw: descricao,
        description_normalized: normalizar(descricao),
        transaction_type: item.type ?? null,
        saldo_apos: saldoDoItem(item),
        status: 'NORMALIZED',
    };
}

// Tipos que LIQUIDAM um título nosso (movimento principal) e os que são a
// TAXA desse movimento. Tudo o mais (estornos, aporte por PIX recebido sem
// cobrança, transferência para o banco próprio, tarifas avulsas) fica para a
// conciliação normal — inclusive o pareamento de transferência entre contas.
const PRINCIPAL: Record<string, 'cobranca' | 'boleto' | 'pix'> = {
    PAYMENT_RECEIVED: 'cobranca',
    BILL_PAYMENT: 'boleto',
    TRANSFER: 'pix',
};
const TAXA: Record<string, 'cobranca' | 'boleto' | 'pix'> = {
    PAYMENT_FEE: 'cobranca',
    PIX_TRANSACTION_CREDIT_FEE: 'cobranca',
    BILL_PAYMENT_FEE: 'boleto',
    TRANSFER_FEE: 'pix',
};

export interface Vinculo {
    origem: 'cobranca' | 'boleto' | 'pix';
    asaasId: string;
    taxa: boolean;
}

/** A que objeto da Asaas esta linha pertence — ou null (conciliação normal). */
export function vinculoDoExtrato(item: ItemExtratoAsaas): Vinculo | null {
    const tipo = String(item.type ?? '');
    const origem = PRINCIPAL[tipo] ?? TAXA[tipo];
    if (!origem) return null;
    const asaasId = origem === 'cobranca' ? item.paymentId : origem === 'boleto' ? item.billId : item.transferId;
    if (!asaasId) return null;
    return { origem, asaasId, taxa: tipo in TAXA };
}

/**
 * Janela a pedir à Asaas. Volta `folgaDias` antes do último dia sincronizado:
 * a Asaas pode lançar com data retroativa (compensação de boleto), e a
 * unicidade por id torna a sobreposição inofensiva. Nunca antes de `desde`.
 */
export function janelaDoExtrato(p: {
    desde: string;
    sincronizadoAte?: string | null;
    hoje: string;
    folgaDias?: number;
}): { inicio: string; fim: string } {
    const folga = p.folgaDias ?? 3;
    let inicio = p.desde;
    if (p.sincronizadoAte) {
        const d = new Date(`${p.sincronizadoAte}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - folga);
        const recuado = d.toISOString().slice(0, 10);
        inicio = recuado > p.desde ? recuado : p.desde;
    }
    return { inicio, fim: p.hoje };
}

/** Vínculo automático só com valor IGUAL — diferença (juros, multa) fica para a mão. */
export function valoresIguais(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
    return Math.abs(Number(a ?? NaN) - Number(b ?? NaN)) < 0.005;
}

// ─── Tela Conta Asaas (plano 2026-11-09-conta-asaas-tela-financeiro) ─────

/**
 * Nome em português de cada `type` do extrato. A documentação avisa que
 * surgem tipos novos sem aviso: o desconhecido volta com o próprio código —
 * nunca some nem quebra a tela.
 */
const ROTULOS_DO_TIPO: Record<string, string> = {
    PAYMENT_RECEIVED: 'Cobrança recebida',
    PAYMENT_FEE: 'Taxa da cobrança',
    PAYMENT_FEE_REVERSAL: 'Taxa da cobrança devolvida',
    PAYMENT_REVERSAL: 'Estorno de cobrança',
    PAYMENT_REFUND_CANCELLED: 'Estorno de cobrança cancelado',
    PAYMENT_CUSTODY_BLOCK: 'Bloqueio de custódia',
    PAYMENT_CUSTODY_BLOCK_REVERSAL: 'Desbloqueio de custódia',
    PARTIAL_PAYMENT: 'Pagamento parcial',
    PIX_TRANSACTION_CREDIT: 'PIX recebido',
    PIX_TRANSACTION_CREDIT_FEE: 'Taxa do PIX recebido',
    PIX_TRANSACTION_CREDIT_REFUND: 'PIX recebido devolvido',
    PIX_TRANSACTION_CREDIT_REFUND_CANCELLATION: 'Devolução de PIX recebido cancelada',
    PIX_TRANSACTION_DEBIT: 'PIX pago por QR Code',
    PIX_TRANSACTION_DEBIT_FEE: 'Taxa do PIX pago',
    PIX_TRANSACTION_DEBIT_REFUND: 'PIX pago devolvido',
    TRANSFER: 'Transferência enviada',
    TRANSFER_FEE: 'Taxa da transferência',
    TRANSFER_REVERSAL: 'Transferência devolvida',
    INTERNAL_TRANSFER_CREDIT: 'Entrada de outra conta Asaas',
    INTERNAL_TRANSFER_DEBIT: 'Saída para outra conta Asaas',
    INTERNAL_TRANSFER_REVERSAL: 'Transferência entre contas Asaas devolvida',
    BILL_PAYMENT: 'Pagamento de conta',
    BILL_PAYMENT_FEE: 'Taxa do pagamento de conta',
    BILL_PAYMENT_CANCELLED: 'Pagamento de conta cancelado',
    BILL_PAYMENT_FEE_CANCELLED: 'Taxa do pagamento de conta devolvida',
    BILL_PAYMENT_REFUNDED: 'Pagamento de conta devolvido',
    CREDIT: 'Crédito',
    DEBIT: 'Débito',
    DEBIT_REVERSAL: 'Débito estornado',
    REVERSAL: 'Estorno',
    CHARGEBACK: 'Chargeback',
    CHARGEBACK_REVERSAL: 'Chargeback revertido',
    CHARGED_FEE_REFUND: 'Taxa devolvida',
    PAYMENT_MESSAGING_NOTIFICATION_FEE: 'Taxa de notificação',
    PAYMENT_SMS_NOTIFICATION_FEE: 'Taxa de SMS',
    PHONE_CALL_NOTIFICATION_FEE: 'Taxa de notificação por voz',
    INSTANT_TEXT_MESSAGE_FEE: 'Taxa de WhatsApp',
    POSTAL_SERVICE_FEE: 'Taxa de envio pelos Correios',
    INVOICE_FEE: 'Taxa de nota fiscal',
    PRODUCT_INVOICE_FEE: 'Taxa de nota fiscal de produto',
    CONSUMER_INVOICE_FEE: 'Taxa de nota fiscal ao consumidor',
    PAYMENT_DUNNING_REQUEST_FEE: 'Taxa de negativação',
    PAYMENT_DUNNING_RECEIVED_FEE: 'Taxa de negativação recebida',
    PAYMENT_DUNNING_RECEIVED_IN_CASH_FEE: 'Taxa de negativação recebida em dinheiro',
    PAYMENT_DUNNING_CANCELLATION_FEE: 'Taxa de cancelamento de negativação',
    RECEIVABLE_ANTICIPATION_GROSS_CREDIT: 'Antecipação recebida',
    RECEIVABLE_ANTICIPATION_FEE: 'Taxa da antecipação',
    RECEIVABLE_ANTICIPATION_DEBIT: 'Antecipação descontada',
    RECEIVABLE_ANTICIPATION_CREDIT: 'Crédito de antecipação',
    REFUND_REQUEST_FEE: 'Taxa de pedido de estorno',
    REFUND_REQUEST_CANCELLED: 'Pedido de estorno cancelado',
    REFUND_REQUEST_FEE_REVERSAL: 'Taxa de pedido de estorno devolvida',
    PROMOTIONAL_CODE_CREDIT: 'Crédito promocional',
    PROMOTIONAL_CODE_DEBIT: 'Débito promocional',
    CONTRACTED_CUSTOMER_PLAN_FEE: 'Mensalidade do plano Asaas',
    ACCOUNT_INACTIVITY_FEE: 'Taxa de inatividade',
    BACEN_JUDICIAL_LOCK: 'Bloqueio judicial',
    BACEN_JUDICIAL_UNLOCK: 'Desbloqueio judicial',
    BACEN_JUDICIAL_TRANSFER: 'Transferência judicial',
    MOBILE_PHONE_RECHARGE: 'Recarga de celular',
    REFUND_MOBILE_PHONE_RECHARGE: 'Recarga de celular devolvida',
    CANCEL_MOBILE_PHONE_RECHARGE: 'Recarga de celular cancelada',
    CREDIT_BUREAU_REPORT: 'Consulta Serasa',
    PAYMENT_SPLIT_FEE: 'Taxa de split',
};

export function rotuloDoTipoAsaas(tipo: string | null | undefined): string {
    const t = String(tipo ?? '').trim();
    if (!t) return 'Movimento';
    return ROTULOS_DO_TIPO[t] ?? t;
}

/** Linha que é TAXA cobrada pela Asaas (não a devolução de uma taxa). */
export function ehTaxaAsaas(tipo: string | null | undefined): boolean {
    const t = String(tipo ?? '');
    return /_FEE$/.test(t);
}

/** Resposta de GET /finance/payment/statistics. */
export interface EstatisticaCobrancas {
    quantity?: number | null;
    value?: number | null;
    netValue?: number | null;
}

export interface ValorEQuantidade { quantidade: number; valor: number }

export interface ResumoAReceber {
    /** CONFIRMED: paga, aguardando o crédito na conta (cartão). Valor LÍQUIDO. */
    aguardandoCredito: ValorEQuantidade;
    /** PENDING + OVERDUE: cobranças em aberto. Valor BRUTO (a taxa só sai no pagamento). */
    emAberto: ValorEQuantidade;
    /** OVERDUE — parte do em aberto. */
    vencidas: ValorEQuantidade;
}

const num = (v: unknown) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : 0);
const centavos = (v: number) => Math.round(v * 100) / 100;

export function resumoAReceber(p: {
    confirmadas?: EstatisticaCobrancas | null;
    pendentes?: EstatisticaCobrancas | null;
    vencidas?: EstatisticaCobrancas | null;
}): ResumoAReceber {
    const c = p.confirmadas ?? {};
    const pe = p.pendentes ?? {};
    const v = p.vencidas ?? {};
    return {
        aguardandoCredito: { quantidade: num(c.quantity), valor: centavos(num(c.netValue ?? c.value)) },
        emAberto: { quantidade: num(pe.quantity) + num(v.quantity), valor: centavos(num(pe.value) + num(v.value)) },
        vencidas: { quantidade: num(v.quantity), valor: centavos(num(v.value)) },
    };
}

export interface Periodo { inicio: string; fim: string }

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function diaAnterior(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/**
 * Parte o período pedido na tela em dois: o que está GRAVADO em
 * `bank_transactions` (a partir de `extrato_desde`, entra na conciliação) e o
 * HISTÓRICO anterior, lido ao vivo da Asaas e nunca gravado — gravar jogaria
 * movimentos de antes da integração na fila da Conciliação.
 */
export function partirPeriodo(p: { inicio: string; fim: string; desde: string | null | undefined }): {
    historico: Periodo | null;
    gravado: Periodo | null;
} {
    if (!DATA_ISO.test(p.inicio) || !DATA_ISO.test(p.fim) || p.inicio > p.fim) return { historico: null, gravado: null };
    const desde = p.desde && DATA_ISO.test(p.desde) ? p.desde : p.inicio;
    const historico = p.inicio < desde
        ? { inicio: p.inicio, fim: p.fim < desde ? p.fim : diaAnterior(desde) }
        : null;
    const gravado = p.fim >= desde
        ? { inicio: p.inicio > desde ? p.inicio : desde, fim: p.fim }
        : null;
    return { historico, gravado };
}

interface LinhaComSaldo {
    transaction_date: string;
    amount: number | string;
    direction: string;
    saldo_apos?: number | string | null;
}

const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Ordem cronológica (mais antiga primeiro). Dentro do MESMO dia a data não
 * desempata — a Asaas só manda o dia —, então a ordem sai do encadeamento do
 * saldo: o saldo antes de uma linha é o saldo depois da anterior. Sem saldo,
 * ou com encadeamento ambíguo, o que sobrar mantém a ordem recebida.
 */
export function ordenarPeloSaldo<T extends LinhaComSaldo>(linhas: T[]): T[] {
    const porDia = new Map<string, T[]>();
    for (const l of linhas) {
        const d = String(l.transaction_date).slice(0, 10);
        if (!porDia.has(d)) porDia.set(d, []);
        porDia.get(d)!.push(l);
    }
    const saida: T[] = [];
    // Saldo de fechamento do dia anterior: a âncora do dia seguinte.
    let fechamento: number | null = null;
    for (const dia of [...porDia.keys()].sort()) {
        const ordenado = encadearDia(porDia.get(dia)!, fechamento);
        saida.push(...ordenado);
        const ultima = ordenado[ordenado.length - 1];
        fechamento = ultima?.saldo_apos == null ? null : Number(ultima.saldo_apos);
    }
    return saida;
}

const depoisDe = (l: LinhaComSaldo) => Number(l.saldo_apos);
const antesDe = (l: LinhaComSaldo) => depoisDe(l) - (l.direction === 'DEBIT' ? -1 : 1) * Number(l.amount);

/**
 * Encadeia a partir do saldo de abertura conhecido. Empate (o saldo vai e volta
 * no mesmo dia: PIX −200, devolução +200, PIX −200 — Asaas de produção, 22/10/2026)
 * escolhe a primeira candidata na ordem recebida; só vale se TODAS as linhas
 * couberem na cadeia.
 */
function encadearComAbertura<T extends LinhaComSaldo>(dia: T[], abertura: number): T[] | null {
    const resto = [...dia];
    const ordem: T[] = [];
    let saldo = abertura;
    while (resto.length) {
        const proxima = resto.find(l => mesmoValor(antesDe(l), saldo));
        if (!proxima) return null;
        ordem.push(proxima);
        resto.splice(resto.indexOf(proxima), 1);
        saldo = depoisDe(proxima);
    }
    return ordem;
}

function encadearDia<T extends LinhaComSaldo>(dia: T[], abertura: number | null = null): T[] {
    if (dia.length < 2 || dia.some(l => l.saldo_apos === null || l.saldo_apos === undefined)) return dia;
    if (abertura !== null) {
        const ancorada = encadearComAbertura(dia, abertura);
        if (ancorada) return ancorada;
    }
    const depois = depoisDe;
    const antes = antesDe;
    const resto = [...dia];
    // A primeira do dia: o saldo antes dela não é o saldo depois de nenhuma outra.
    const primeiras = resto.filter(l => !resto.some(o => o !== l && mesmoValor(depois(o), antes(l))));
    if (primeiras.length !== 1) return dia;
    const ordem: T[] = [primeiras[0]];
    resto.splice(resto.indexOf(primeiras[0]), 1);
    while (resto.length) {
        const atual = ordem[ordem.length - 1];
        const seguintes = resto.filter(l => mesmoValor(antes(l), depois(atual)));
        if (seguintes.length !== 1) break;
        ordem.push(seguintes[0]);
        resto.splice(resto.indexOf(seguintes[0]), 1);
    }
    return [...ordem, ...resto];
}
