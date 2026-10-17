// Validação de saque pela Asaas — decisão pura (Deno + Vitest, SEM imports).
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 0/4).
// Contrato conferido na documentação oficial em 17/10/2026
// (docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks):
//   POST { type: 'TRANSFER' | 'BILL' | 'PIX_QR_CODE' | 'MOBILE_PHONE_RECHARGE'
//          | 'PIX_REFUND' | 'PAYMENT_SPLIT', <objeto>: {...} }
//   resposta { status: 'APPROVED' } | { status: 'REFUSED', refuseReason }
//   sem resposta válida, ou 3 falhas seguidas → a Asaas CANCELA a operação.
//
// Por que existe: a Asaas exige um mecanismo extra para saque via API
// ("A chave de API fornecida não possui permissão para realizar operações de
// saque via API"). IP fixo não serve (Edge Function não tem IP fixo); este é
// o outro. E ele SOMA ao portão de disparo: mesmo com a chave vazada, um saque
// que o OrçaCloud não disparou é recusado aqui.

export interface PedidoDeSaque {
    type?: string;
    transfer?: {
        id?: string;
        value?: number;
        operationType?: string;
        bankAccount?: { pixAddressKey?: string | null; cpfCnpj?: string | null } | null;
    };
    bill?: { id?: number | string; value?: number; identificationField?: string };
}

/** O que o OrçaCloud registrou do pagamento (linha de supplier_payments). */
export interface PagamentoRegistrado {
    payment_type: string;           // 'PIX_TRANSFER' | 'BILL'
    status: string;
    value: number;
    pix_key: string | null;
    identification_field: string | null;
}

export interface DecisaoDeSaque {
    status: 'APPROVED' | 'REFUSED';
    refuseReason?: string;
}

/** Estados em que um pagamento nosso pode estar sendo efetivado agora. */
const EM_ANDAMENTO = ['APPROVED', 'PENDING', 'SCHEDULED'];

const recusa = (motivo: string): DecisaoDeSaque => ({ status: 'REFUSED', refuseReason: motivo });
const so = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Chave como a Asaas devolve x como guardamos: compara sem pontuação/caixa. */
function mesmaChave(a: string | null | undefined, b: string | null | undefined): boolean {
    const na = (a ?? '').trim().toLowerCase();
    const nb = (b ?? '').trim().toLowerCase();
    if (!na || !nb) return false;
    if (na === nb) return true;
    // CPF/CNPJ/telefone: a Asaas pode mandar com ou sem +55/pontuação.
    const da = so(na), db = so(nb);
    return da.length >= 10 && (da === db || da === db.replace(/^55/, '') || db === da.replace(/^55/, ''));
}

/** Id do objeto da Asaas a procurar em supplier_payments, ou null se o tipo não é nosso. */
export function idDoPedido(p: PedidoDeSaque): { coluna: 'asaas_transfer_id' | 'asaas_bill_id'; id: string } | null {
    if (p.type === 'TRANSFER' && p.transfer?.id) return { coluna: 'asaas_transfer_id', id: String(p.transfer.id) };
    if (p.type === 'BILL' && p.bill?.id != null) return { coluna: 'asaas_bill_id', id: String(p.bill.id) };
    return null;
}

export function decidirSaque(p: PedidoDeSaque, registro: PagamentoRegistrado | null): DecisaoDeSaque {
    if (p.type !== 'TRANSFER' && p.type !== 'BILL') {
        return recusa(`Operação ${p.type ?? 'desconhecida'} não é disparada pelo OrçaCloud.`);
    }
    if (!registro) return recusa('Pagamento não encontrado no OrçaCloud.');
    if (!EM_ANDAMENTO.includes(registro.status)) {
        return recusa(`Pagamento no OrçaCloud está ${registro.status}, não em andamento.`);
    }

    if (p.type === 'TRANSFER') {
        if (registro.payment_type !== 'PIX_TRANSFER') return recusa('Tipo diferente do registrado no OrçaCloud.');
        if (Math.abs(Number(p.transfer?.value ?? NaN) - Number(registro.value)) >= 0.005) {
            return recusa('Valor diferente do registrado no OrçaCloud.');
        }
        const chaveAsaas = p.transfer?.bankAccount?.pixAddressKey ?? null;
        // A Asaas nem sempre manda a chave no pedido de validação; quando manda, tem de bater.
        if (chaveAsaas && !mesmaChave(chaveAsaas, registro.pix_key)) {
            return recusa('Chave PIX diferente da registrada no OrçaCloud.');
        }
        return { status: 'APPROVED' };
    }

    // BILL
    if (registro.payment_type !== 'BILL') return recusa('Tipo diferente do registrado no OrçaCloud.');
    if (so(p.bill?.identificationField) !== so(registro.identification_field)) {
        return recusa('Linha digitável diferente da registrada no OrçaCloud.');
    }
    return { status: 'APPROVED' };
}
