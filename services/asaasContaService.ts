import { supabase } from '../lib/supabase';

/**
 * Conta Asaas como Conta de Pagamento (Fase 2 —
 * docs/planos/2026-10-16-asaas-pendencias-e-pix.md).
 *
 * Configuração (ativo, piloto, tetos) pela RPC `asaas_conta_salvar` (só
 * gestor da org dona). Chave de API, teste e extrato pela Edge `asaas-conta`,
 * que TESTA a chave na Asaas antes de guardá-la no Vault. A chave nunca volta
 * para o navegador: a tela só sabe se existe e quando foi trocada.
 */

export type AmbienteAsaas = 'sandbox' | 'production';

export interface ContaAsaasConfig {
    payment_account_id: string;
    env: AmbienteAsaas;
    ativo: boolean;
    piloto: boolean;
    teto_por_pagamento: number;
    teto_por_dia: number;
    teto_avulso: number;
    tem_chave: boolean;
    chave_atualizada_em: string | null;
    extrato_desde: string;
    extrato_sincronizado_ate: string | null;
    saldo: number | null;
    saldo_em: string | null;
    ultimo_erro: string | null;
    ultimo_erro_em: string | null;
}

/** Padrões da tela para conta ainda não configurada — os mesmos da tabela. */
export const CONTA_ASAAS_PADRAO: Omit<ContaAsaasConfig, 'payment_account_id'> = {
    env: 'sandbox',
    ativo: true,
    piloto: true,
    teto_por_pagamento: 500,
    teto_por_dia: 2000,
    teto_avulso: 200,
    tem_chave: false,
    chave_atualizada_em: null,
    extrato_desde: new Date().toISOString().slice(0, 10),
    extrato_sincronizado_ate: null,
    saldo: null,
    saldo_em: null,
    ultimo_erro: null,
    ultimo_erro_em: null,
};

const COLS = 'payment_account_id,env,ativo,piloto,teto_por_pagamento,teto_por_dia,teto_avulso,vault_secret_id,chave_atualizada_em,extrato_desde,extrato_sincronizado_ate,saldo,saldo_em,ultimo_erro,ultimo_erro_em';

/** Mensagem real de uma Edge Function que respondeu não-2xx (corpo { error }). */
async function invocar<T>(acao: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('asaas-conta', { body: { acao, ...body } });
    if (error) {
        let detalhe = '';
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
            try { detalhe = (await ctx.json())?.error ?? ''; } catch { /* corpo não-JSON */ }
        }
        throw new Error(detalhe || error.message);
    }
    if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
    return data as T;
}

export const asaasContaService = {
    /** Configuração da conta, ou null se ela ainda não é conta Asaas. */
    async get(paymentAccountId: string): Promise<ContaAsaasConfig | null> {
        const { data, error } = await supabase
            .from('payment_account_gateway')
            .select(COLS)
            .eq('payment_account_id', paymentAccountId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const { vault_secret_id, ...resto } = data as typeof data & { vault_secret_id: string | null };
        return {
            ...(resto as unknown as Omit<ContaAsaasConfig, 'tem_chave'>),
            teto_por_pagamento: Number(resto.teto_por_pagamento),
            teto_por_dia: Number(resto.teto_por_dia),
            teto_avulso: Number(resto.teto_avulso),
            saldo: resto.saldo == null ? null : Number(resto.saldo),
            tem_chave: !!vault_secret_id,
        };
    },

    async salvar(cfg: Pick<ContaAsaasConfig, 'payment_account_id' | 'ativo' | 'piloto' | 'teto_por_pagamento' | 'teto_por_dia' | 'teto_avulso'>): Promise<void> {
        const { error } = await supabase.rpc('asaas_conta_salvar', {
            p_payment_account_id: cfg.payment_account_id,
            p_ativo: cfg.ativo,
            p_piloto: cfg.piloto,
            p_teto_por_pagamento: cfg.teto_por_pagamento,
            p_teto_por_dia: cfg.teto_por_dia,
            p_teto_avulso: cfg.teto_avulso,
        });
        if (error) throw new Error(error.message);
    },

    /** Testa a chave na Asaas e só então guarda (Vault). Devolve o saldo lido. */
    salvarChave(paymentAccountId: string, env: AmbienteAsaas, chave: string) {
        return invocar<{ ok: boolean; saldo: number | null; env: AmbienteAsaas }>('salvar_chave', {
            payment_account_id: paymentAccountId, env, chave,
        });
    },

    testar(paymentAccountId: string) {
        return invocar<{ ok: boolean; saldo: number | null; env: AmbienteAsaas }>('testar', { payment_account_id: paymentAccountId });
    },

    sincronizarExtrato(paymentAccountId: string) {
        return invocar<{ ok: boolean; no_periodo: number; importadas: number; vinculadas: number; sem_vinculo: number; janela: string }>(
            'sincronizar', { payment_account_id: paymentAccountId },
        );
    },

    /** Conta Asaas que atende a organização (dona primeiro), ou null. */
    async contaDaOrg(organizationId: string): Promise<string | null> {
        const { data, error } = await supabase.rpc('fn_conta_asaas_da_org', { p_org: organizationId });
        if (error) throw new Error(error.message);
        return (data as string | null) ?? null;
    },
};
