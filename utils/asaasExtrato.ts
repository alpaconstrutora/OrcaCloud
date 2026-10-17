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
    status: 'NORMALIZED';
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
