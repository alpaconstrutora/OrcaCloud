// Portão de disparo de dinheiro pela Asaas — reúne os FATOS no banco e aplica
// `bloqueiosDoDisparo` (utils/asaasGovernanca.ts, testado). Usado por boleto
// e PIX na asaas-payment — um portão só, para as duas saídas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 4, disparo).

import { bloqueiosDoDisparo, inicioDoDiaBrasilia, type FatosDoDisparo } from "../../../utils/asaasGovernanca.ts";
import { STATUS_SAIDA_OCUPANDO } from "../../../utils/asaasEventos.ts";
import type { ContaAsaas } from "./asaasConta.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface TituloAPagar {
    id: string;
    organization_id: string;
    amount: number;
    direction: string;
    status: string | null;
    business_status: string | null;
    approval_status: string | null;
    due_date: string | null;
    transaction_date: string | null;
    source_system: string | null;
    party_type: string | null;
    party_name: string | null;
    supplier_id: string | null;
    reference_id: string | null;
    description: string | null;
}

const COLS = 'id,organization_id,amount,direction,status,business_status,approval_status,due_date,transaction_date,source_system,party_type,party_name,supplier_id,reference_id,description';

/** Título a pagar da organização (já conferida pelo gate). null = não existe nela ou não é DEBIT. */
export async function lerTitulo(admin: Admin, tituloId: string, orgId: string): Promise<TituloAPagar | null> {
    const { data } = await admin.from('internal_transactions').select(COLS)
        .eq('id', tituloId).eq('organization_id', orgId).maybeSingle();
    if (!data || data.direction !== 'DEBIT') return null;
    return { ...data, amount: Number(data.amount) };
}

export async function avaliarDisparo(admin: Admin, p: {
    titulo: TituloAPagar;
    conta: ContaAsaas | null;
    ehGestor: boolean;
    avulso: boolean;
    /** Boleto: o pagamento em curso também se procura pelo boleto. */
    boletoId?: string | null;
}): Promise<{ fatos: FatosDoDisparo; bloqueios: string[] }> {
    const { titulo, conta } = p;

    // Alçada: RASCUNHO só passa se o valor não cair em faixa nenhuma (mesma
    // semântica do approvalService com semFaixa: 'liberar').
    let valorTemFaixaDeAlcada = false;
    if ((titulo.approval_status ?? 'RASCUNHO') === 'RASCUNHO') {
        const { data: niveis } = await admin.rpc('fn_resolve_approval_levels', {
            p_organization_id: titulo.organization_id, p_amount: titulo.amount,
        });
        valorTemFaixaDeAlcada = Array.isArray(niveis) && niveis.some((n: { required_levels?: number }) => Number(n.required_levels) > 0);
    }

    // Soma do dia na conta (BRT), sem este título.
    let somaDoDia = 0;
    if (conta?.paymentAccountId) {
        const { data: hoje } = await admin.from('supplier_payments').select('value,transaction_id')
            .eq('payment_account_id', conta.paymentAccountId)
            .in('status', [...STATUS_SAIDA_OCUPANDO])
            .gte('created_at', inicioDoDiaBrasilia(new Date()));
        somaDoDia = (hoje ?? [])
            .filter((r: { transaction_id: string | null }) => r.transaction_id !== titulo.id)
            .reduce((s: number, r: { value: number }) => s + Number(r.value ?? 0), 0);
    }

    // Competência fechada em Contas a Pagar (o gatilho recusa a baixa até para service_role).
    let competenciaFechada: string | null = null;
    const dataTitulo = titulo.due_date ?? titulo.transaction_date;
    if (dataTitulo) {
        const competencia = `${dataTitulo.slice(0, 7)}-01`;
        const { data: fechada } = await admin.from('cost_center_closings').select('competencia')
            .eq('organization_id', titulo.organization_id).eq('competencia', competencia).eq('status', 'FECHADO')
            .limit(1).maybeSingle();
        if (fechada) competenciaFechada = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
    }

    // Pagamento em curso (por título e, no boleto, pelo boleto).
    const filtro = p.boletoId
        ? `transaction_id.eq.${titulo.id},boleto_id.eq.${p.boletoId}`
        : `transaction_id.eq.${titulo.id}`;
    const { data: emCurso } = await admin.from('supplier_payments').select('status')
        .or(filtro).in('status', [...STATUS_SAIDA_OCUPANDO]).limit(1).maybeSingle();

    const fatos: FatosDoDisparo = {
        temConta: !!conta?.paymentAccountId,
        ehGestor: p.ehGestor,
        status: titulo.status,
        businessStatus: titulo.business_status,
        approvalStatus: titulo.approval_status,
        valorTemFaixaDeAlcada,
        valor: titulo.amount,
        tetos: conta?.tetos ?? null,
        somaDoDia,
        avulso: p.avulso,
        piloto: !!conta?.piloto,
        orgDoTitulo: titulo.organization_id,
        orgDaConta: conta?.organizationId ?? null,
        competenciaFechada,
        pagamentoEmCurso: emCurso?.status ?? null,
    };
    return { fatos, bloqueios: bloqueiosDoDisparo(fatos) };
}
