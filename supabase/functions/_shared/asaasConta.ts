// Qual conta Asaas (e qual chave) usar — peça única das Edge Functions Asaas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 2.2).
//
// Até a Fase 2 havia UMA chave global (`ASAAS_API_KEY` + `ASAAS_ENV`) para
// todas as organizações, e o dinheiro não tinha conta no sistema. Agora cada
// organização aponta para uma `payment_accounts` kind='gateway' com a chave
// no Vault. A chave global segue como RESERVA só enquanto a org não tiver
// conta Asaas cadastrada — e devolve `paymentAccountId: null`, para quem
// chama saber que o movimento ficará sem conta.

import { baseDaAsaas, type AmbienteAsaas } from "../../../utils/asaasExtrato.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface ContaAsaas {
    /** null = chave global de reserva (sem conta de pagamento no sistema). */
    paymentAccountId: string | null;
    /** Org DONA da conta (null na reserva). */
    organizationId: string | null;
    env: AmbienteAsaas;
    base: string;
    apiKey: string;
    tetos: { porPagamento: number; porDia: number; avulso: number } | null;
    piloto: boolean;
}

export function cabecalhosAsaas(apiKey: string): Record<string, string> {
    return { 'Content-Type': 'application/json', 'access_token': apiKey, 'User-Agent': 'OrcaCloud' };
}

/** A chave global antiga, se ainda existir. */
export function contaDeReserva(): ContaAsaas | null {
    const apiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
    if (!apiKey) return null;
    const env = (Deno.env.get('ASAAS_ENV') ?? 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    return {
        paymentAccountId: null, organizationId: null, env, base: baseDaAsaas(env), apiKey,
        tetos: null, piloto: false,
    };
}

/** Conta Asaas pelo id da conta de pagamento. Lança se não houver chave guardada. */
export async function contaPorId(admin: Admin, paymentAccountId: string): Promise<ContaAsaas> {
    const { data: g, error } = await admin
        .from('payment_account_gateway')
        .select('payment_account_id,env,ativo,piloto,teto_por_pagamento,teto_por_dia,teto_avulso,payment_accounts!inner(organization_id)')
        .eq('payment_account_id', paymentAccountId)
        .maybeSingle();
    if (error) throw new Error(`conta Asaas: ${error.message}`);
    if (!g) throw new Error('Conta Asaas não configurada.');

    const { data: apiKey, error: e2 } = await admin.rpc('asaas_conta_ler_chave', { p_payment_account_id: paymentAccountId });
    if (e2 || !apiKey) throw new Error(e2?.message ?? 'Conta Asaas sem chave de API.');

    const env: AmbienteAsaas = g.env === 'production' ? 'production' : 'sandbox';
    return {
        paymentAccountId,
        organizationId: g.payment_accounts?.organization_id ?? null,
        env,
        base: baseDaAsaas(env),
        apiKey: String(apiKey),
        tetos: {
            porPagamento: Number(g.teto_por_pagamento),
            porDia: Number(g.teto_por_dia),
            avulso: Number(g.teto_avulso),
        },
        piloto: !!g.piloto,
    };
}

/**
 * Conta Asaas que atende a organização (dona primeiro, depois "Atende
 * também" — regra em `fn_conta_asaas_da_org`). Sem conta cadastrada, cai na
 * reserva global. Sem nenhuma das duas, null: quem chama responde 503.
 */
export async function resolverContaAsaas(admin: Admin, organizationId: string): Promise<ContaAsaas | null> {
    const { data: id, error } = await admin.rpc('fn_conta_asaas_da_org', { p_org: organizationId });
    if (error) throw new Error(error.message);
    if (id) return await contaPorId(admin, String(id));
    const reserva = contaDeReserva();
    if (reserva) console.warn(`[asaas] org ${organizationId} sem conta Asaas cadastrada — usando a chave global de reserva`);
    return reserva;
}

/**
 * Conta de um registro já gravado (cobrança/pagamento). Registro com conta →
 * a chave DESSA conta, mesmo que a org tenha trocado de conta depois; sem
 * conta (emitido pela chave global) → reserva.
 */
export async function contaDoRegistro(admin: Admin, paymentAccountId: string | null | undefined): Promise<ContaAsaas | null> {
    if (paymentAccountId) return await contaPorId(admin, paymentAccountId);
    return contaDeReserva();
}
