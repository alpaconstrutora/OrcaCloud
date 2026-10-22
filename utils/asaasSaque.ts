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
        bankAccount?: { pixAddressKey?: string | null; cpfCnpj?: string | null; ownerName?: string | null } | null;
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
    /** CPF/CNPJ do favorecido: o do cadastro ao disparar; o resolvido pela Asaas depois da resposta. */
    beneficiary_document?: string | null;
    /** CPF/CNPJ da ENTIDADE (fornecedor, colaborador, sócio; no avulso, o digitado), gravado no
     *  disparo e nunca regravado — a referência para conferir o titular da chave. */
    favorecido_documento_esperado?: string | null;
    /** Conta marcada por gestor como "titular diferente autorizado" (cópia no disparo). */
    titular_diferente_autorizado?: boolean | null;
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

/** Mínimo de dígitos visíveis para aceitar um CPF/CNPJ mascarado pela Asaas. */
const MIN_VISIVEIS = 6;

/** Documento só com dígitos e '*' (a máscara), sem pontuação. */
const comMascara = (s: string | null | undefined) => (s ?? '').replace(/[^\d*]/g, '');

type Conferencia = 'confere' | 'difere' | 'mascarado_demais';

/**
 * CPF/CNPJ informado pela Asaas × o do cadastro (11 ou 14 dígitos).
 *
 * 22/10/2026: a Asaas manda o CPF do titular de chave de pessoa física MASCARADO
 * (`***.533.946-**`); CNPJ vem inteiro. Mascarado, confere posição por posição:
 * cada dígito visível tem de ser o do cadastro na MESMA posição, com pelo menos
 * MIN_VISIVEIS visíveis — menos que isso não dá para conferir (falha fechada).
 */
function conferirDocumento(informado: string | null | undefined, cadastro: string | null | undefined): Conferencia {
    const c = so(cadastro);
    const i = comMascara(informado);
    if ((c.length !== 11 && c.length !== 14) || i.length !== c.length) return 'difere';
    if (!i.includes('*')) return i === c ? 'confere' : 'difere';
    let visiveis = 0;
    for (let k = 0; k < i.length; k++) {
        if (i[k] === '*') continue;
        if (i[k] !== c[k]) return 'difere';
        visiveis++;
    }
    return visiveis >= MIN_VISIVEIS ? 'confere' : 'mascarado_demais';
}

/** Mesmo CPF/CNPJ: `a` o informado pela Asaas (pode vir mascarado), `b` o do cadastro. Vazio = não confere. */
export function mesmoDocumento(a: string | null | undefined, b: string | null | undefined): boolean {
    return conferirDocumento(a, b) === 'confere';
}

/**
 * Busca de RESERVA (18/10/2026, conferida contra a doc oficial): a Asaas pergunta
 * ~5 s depois de criar o saque; se o OrçaCloud ainda não gravou o id da Asaas,
 * procura o registro recém-criado. O exemplo oficial do pedido de PIX vem com
 * `pixAddressKey: null` — conferir "a chave quando vier" deixava a reserva aprovar
 * SÓ PELO VALOR. Agora: PIX exige valor E CPF/CNPJ do favorecido iguais; boleto
 * exige a linha digitável igual. Mais de uma candidata = ambíguo = nenhuma.
 */
export function escolherReserva<T extends PagamentoRegistrado>(p: PedidoDeSaque, candidatos: T[]): T | null {
    let ok: T[] = [];
    if (p.type === 'TRANSFER') {
        const doc = p.transfer?.bankAccount?.cpfCnpj;
        ok = candidatos.filter(c => c.payment_type === 'PIX_TRANSFER'
            && Math.abs(Number(p.transfer?.value ?? NaN) - Number(c.value)) < 0.005
            && mesmoDocumento(doc, c.beneficiary_document));
    } else if (p.type === 'BILL') {
        const linha = so(p.bill?.identificationField);
        ok = candidatos.filter(c => c.payment_type === 'BILL' && linha.length >= 44 && so(c.identification_field) === linha);
    }
    return ok.length === 1 ? ok[0] : null;
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
        // Titular da chave (18/10/2026, plano 2026-10-18-asaas-seguranca-chaves-pix): a chave
        // pode ter sido TROCADA no cadastro por quem quer desviar o pagamento — conferir a chave
        // com o cadastro não pega isso. A Asaas informa o CPF/CNPJ do dono da chave; ele tem de
        // ser o da entidade, salvo conta marcada por gestor como titular diferente autorizado.
        if (!registro.titular_diferente_autorizado) {
            const esperado = so(registro.favorecido_documento_esperado);
            const informado = (p.transfer?.bankAccount?.cpfCnpj ?? '').trim();
            if (esperado.length !== 11 && esperado.length !== 14) {
                return recusa('Favorecido sem CPF/CNPJ registrado no OrçaCloud para conferir o titular da chave.');
            }
            if (!comMascara(informado)) return recusa('A Asaas não informou o titular da chave — sem como conferir.');
            const conferencia = conferirDocumento(informado, esperado);
            if (conferencia === 'mascarado_demais') {
                return recusa(`A Asaas informou o CPF/CNPJ do titular mascarado demais para conferir (${informado}).`);
            }
            if (conferencia === 'difere') {
                return recusa(informado.includes('*')
                    ? `O titular da chave (CPF/CNPJ ${informado}) não é o favorecido cadastrado.`
                    : `O titular da chave (CPF/CNPJ terminado em ${so(informado).slice(-4)}) não é o favorecido cadastrado.`);
            }
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
