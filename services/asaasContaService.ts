import { supabase } from '../lib/supabase';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import type { ResumoAReceber } from '../utils/asaasExtrato';

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

/** Conta Asaas ativa, como a tela Financeiro › Conta Asaas lista. */
export interface ContaAsaasResumo {
    payment_account_id: string;
    nome: string;
    organization_id: string;
    env: AmbienteAsaas;
    saldo: number | null;
    saldo_em: string | null;
    extrato_desde: string;
    extrato_sincronizado_ate: string | null;
    ultimo_erro: string | null;
    ultimo_erro_em: string | null;
}

export interface ResumoContaAsaas {
    ok: boolean;
    env: AmbienteAsaas;
    saldo: number | null;
    saldo_em: string;
    a_receber: ResumoAReceber;
    a_receber_erro: string | null;
}

/** Linha do histórico lida ao vivo (antes de `extrato_desde`). `valor` negativo = saída. */
export interface LinhaHistoricoAsaas {
    id: string;
    data: string;
    valor: number;
    saldo_apos: number | null;
    tipo: string | null;
    descricao: string | null;
}

interface LinhaExtratoBanco {
    id: string;
    external_id: string | null;
    transaction_date: string;
    amount: number | string;
    direction: 'CREDIT' | 'DEBIT';
    description_raw: string | null;
    transaction_type: string | null;
    status: string;
    saldo_apos: number | string | null;
}

/** Linha da tabela da tela — gravada (com status de conciliação) ou do histórico (só consulta). */
export interface LinhaExtratoAsaas {
    id: string;
    idAsaas: string | null;
    data: string;
    /** Negativo = saída. */
    valor: number;
    saldoApos: number | null;
    tipo: string | null;
    descricao: string | null;
    /** Status em `bank_transactions`; null no histórico. */
    status: string | null;
    titulo: string | null;
    /** Lida ao vivo da Asaas, fora da conciliação. */
    historico: boolean;
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

    // ─── Tela Financeiro › Conta Asaas (plano 2026-11-09-conta-asaas-tela-financeiro) ───

    /**
     * Contas Asaas ATIVAS visíveis ao usuário (a policy de `payment_account_gateway`
     * só mostra as da org dona). `orgId` null = "Todas as organizações": a RLS recorta.
     */
    async contasAsaas(orgId: string | null): Promise<ContaAsaasResumo[]> {
        let q = supabase
            .from('payment_account_gateway')
            .select('payment_account_id,env,saldo,saldo_em,extrato_desde,extrato_sincronizado_ate,ultimo_erro,ultimo_erro_em,payment_accounts!inner(name,organization_id,is_active)')
            .eq('ativo', true)
            .neq('payment_accounts.is_active', false);
        if (orgId) q = q.eq('payment_accounts.organization_id', orgId);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        type Linha = {
            payment_account_id: string; env: AmbienteAsaas; saldo: number | string | null; saldo_em: string | null;
            extrato_desde: string; extrato_sincronizado_ate: string | null; ultimo_erro: string | null; ultimo_erro_em: string | null;
            payment_accounts: { name: string; organization_id: string } | { name: string; organization_id: string }[];
        };
        return ((data ?? []) as unknown as Linha[]).map(l => {
            const pa = Array.isArray(l.payment_accounts) ? l.payment_accounts[0] : l.payment_accounts;
            return {
                payment_account_id: l.payment_account_id,
                nome: pa?.name ?? 'Conta Asaas',
                organization_id: pa?.organization_id ?? '',
                env: l.env,
                saldo: l.saldo == null ? null : Number(l.saldo),
                saldo_em: l.saldo_em,
                extrato_desde: l.extrato_desde,
                extrato_sincronizado_ate: l.extrato_sincronizado_ate,
                ultimo_erro: l.ultimo_erro,
                ultimo_erro_em: l.ultimo_erro_em,
            };
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },

    /** Saldo ao vivo + a receber (Edge `asaas-conta`, ação `resumo`). Também regrava o saldo. */
    resumo(paymentAccountId: string) {
        return invocar<ResumoContaAsaas>('resumo', { payment_account_id: paymentAccountId });
    },

    /** Histórico ANTERIOR a `extrato_desde`, lido da Asaas — não é gravado nem entra na conciliação. */
    extratoConsulta(paymentAccountId: string, inicio: string, fim: string) {
        return invocar<{ ok: boolean; janela: { inicio: string; fim: string }; truncado: boolean; linhas: LinhaHistoricoAsaas[] }>(
            'extrato_consulta', { payment_account_id: paymentAccountId, inicio, fim },
        );
    },

    /**
     * Extrato GRAVADO da conta no período, com o título que cada linha liquidou
     * (vínculo em `reconciliation_matches`).
     */
    async listarExtrato(paymentAccountId: string, inicio: string, fim: string): Promise<LinhaExtratoAsaas[]> {
        const { data, error } = await fetchAllPages<LinhaExtratoBanco>(() => supabase
            .from('bank_transactions')
            .select('id,external_id,transaction_date,amount,direction,description_raw,transaction_type,status,saldo_apos')
            .eq('bank_account_id', paymentAccountId)
            .gte('transaction_date', inicio)
            .lte('transaction_date', fim)
            .order('transaction_date', { ascending: true })
            .order('id', { ascending: true }) as unknown as RangeableQuery<LinhaExtratoBanco>);
        if (error) throw new Error(error instanceof Error ? error.message : String((error as { message?: string }).message ?? error));

        const titulos = new Map<string, string>();
        const ids = data.map(l => l.id);
        for (let i = 0; i < ids.length; i += 200) {
            const { data: m, error: eM } = await supabase
                .from('reconciliation_matches')
                .select('bank_transaction_id, internal_transaction:internal_transaction_id(description,party_name)')
                .in('bank_transaction_id', ids.slice(i, i + 200));
            if (eM) throw new Error(eM.message);
            type Vinc = { bank_transaction_id: string; internal_transaction: { description: string | null; party_name: string | null } | { description: string | null; party_name: string | null }[] | null };
            for (const v of (m ?? []) as unknown as Vinc[]) {
                const t = Array.isArray(v.internal_transaction) ? v.internal_transaction[0] : v.internal_transaction;
                if (!t) continue;
                const texto = [t.party_name, t.description].filter(Boolean).join(' — ') || 'Título vinculado';
                const anterior = titulos.get(v.bank_transaction_id);
                titulos.set(v.bank_transaction_id, anterior ? `${anterior}; ${texto}` : texto);
            }
        }

        return data.map(l => ({
            id: l.id,
            idAsaas: l.external_id,
            data: l.transaction_date,
            valor: Number(l.amount) * (l.direction === 'DEBIT' ? -1 : 1),
            saldoApos: l.saldo_apos == null ? null : Number(l.saldo_apos),
            tipo: l.transaction_type,
            descricao: l.description_raw,
            status: l.status,
            titulo: titulos.get(l.id) ?? null,
            historico: false,
        }));
    },

    /** Conta Asaas que atende a organização (dona primeiro), ou null. */
    async contaDaOrg(organizationId: string): Promise<string | null> {
        const { data, error } = await supabase.rpc('fn_conta_asaas_da_org', { p_org: organizationId });
        if (error) throw new Error(error.message);
        return (data as string | null) ?? null;
    },
};
