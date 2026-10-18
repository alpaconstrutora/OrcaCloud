// Qual conta Asaas (e qual chave) usar — peça única das Edge Functions Asaas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 2.2).
//
// Até a Fase 2 havia UMA chave global (`ASAAS_API_KEY` + `ASAAS_ENV`) para
// todas as organizações. Agora cada organização aponta para uma
// `payment_accounts` kind='gateway' com a chave no Vault. A chave global ficou
// como RESERVA até 18/10/2026 e saiu (item 5 da segurança, plano
// 2026-10-18-asaas-seguranca-chaves-pix): já era recusada pela Asaas (401), e
// uma chave válida colocada ali passaria por fora das regras por conta (tetos,
// piloto, validação). Sem conta cadastrada, nada fala com a Asaas.

import { baseDaAsaas, type AmbienteAsaas } from "../../../utils/asaasExtrato.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface ContaAsaas {
    paymentAccountId: string | null;
    /** Org DONA da conta. */
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
 * também" — regra em `fn_conta_asaas_da_org`). Sem conta cadastrada, null:
 * quem chama responde "sem conta Asaas".
 */
export async function resolverContaAsaas(admin: Admin, organizationId: string): Promise<ContaAsaas | null> {
    const { data: id, error } = await admin.rpc('fn_conta_asaas_da_org', { p_org: organizationId });
    if (error) throw new Error(error.message);
    if (id) return await contaPorId(admin, String(id));
    return null;
}

/**
 * Conta de um registro já gravado (cobrança/pagamento): a chave DESSA conta,
 * mesmo que a org tenha trocado de conta depois. Registro sem conta (emitido
 * pela chave global antiga — só as 2 cobranças de teste de junho/2026) → null.
 */
export async function contaDoRegistro(admin: Admin, paymentAccountId: string | null | undefined): Promise<ContaAsaas | null> {
    if (paymentAccountId) return await contaPorId(admin, paymentAccountId);
    return null;
}
