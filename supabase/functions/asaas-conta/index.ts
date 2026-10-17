// asaas-conta — conta Asaas como Conta de Pagamento (Fase 2).
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (itens 2.1–2.5).
//
// Ações com usuário (JWT): só proprietário/administrador da org DONA da conta.
// A org vem da CONTA (`payment_accounts.organization_id`), nunca do corpo.
//   • salvar_chave { payment_account_id, env, chave } — TESTA a chave na Asaas
//     (GET /finance/balance) e só então guarda no Vault. A chave global de
//     19/06 era recusada (401) e ninguém sabia: chave que não abre nada não
//     entra mais.
//   • testar { payment_account_id } — consulta o saldo com a chave guardada.
//   • sincronizar { payment_account_id } — importa o extrato agora.
// Cron (CRON_SECRET): importa o extrato de todas as contas Asaas ativas.
//
// Extrato → bank_transactions (NORMALIZED) na conta Asaas. O movimento que
// liquida um título NOSSO (cobrança recebida, boleto pago, PIX enviado) e a
// taxa dele são vinculados na hora por `fn_reconcile_match` — vínculo pelo id
// da Asaas, não por semelhança, e só com valor igual. O resto (aporte vindo
// do Itaú, repasse para o Itaú, estornos) fica para a conciliação normal,
// onde o pareamento de transferência entre contas próprias já existe.
//
// REGRA #7, pergunta 3: gate no código (`exigirGestor` / `chamadaDeCron`).
// Sem header → 401.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaDeCron, exigirGestor, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { cabecalhosAsaas, contaPorId, type ContaAsaas } from "../_shared/asaasConta.ts"
import {
    baseDaAsaas, linhaDoExtrato, vinculoDoExtrato, janelaDoExtrato, valoresIguais,
    type ItemExtratoAsaas, type Vinculo,
} from "../../../utils/asaasExtrato.ts"
import { cobrancaPaga } from "../../../utils/asaasEventos.ts"
import { normalizeText } from "../../../utils/reconciliationRules.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Teto de linhas por execução — a Asaas pagina de 100 em 100. */
const MAX_LINHAS = 3000;

const hoje = () => new Date().toISOString().slice(0, 10);

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Cron: extrato de todas as contas ativas ────────────────────────
    if (chamadaDeCron(req)) {
        const { data: contas, error } = await admin
            .from('payment_account_gateway')
            .select('payment_account_id')
            .eq('ativo', true)
            .not('vault_secret_id', 'is', null);
        if (error) return json({ error: error.message }, 500);
        const resultados: Record<string, unknown> = {};
        for (const c of contas ?? []) {
            resultados[c.payment_account_id] = await sincronizarComRegistro(admin, c.payment_account_id);
        }
        return json({ ok: true, contas: resultados });
    }

    // ─── Usuário ────────────────────────────────────────────────────────
    // Sessão válida ANTES de qualquer consulta: sem isso, um id inexistente
    // respondia 400 e um existente 401 — o anônimo descobria quais contas existem.
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    const body = await req.json().catch(() => ({})) as {
        acao?: 'salvar_chave' | 'testar' | 'sincronizar';
        payment_account_id?: string;
        env?: string;
        chave?: string;
    };
    if (!body.payment_account_id) return json({ error: 'payment_account_id é obrigatório.' }, 400);

    const { data: pa } = await admin
        .from('payment_accounts')
        .select('id,organization_id')
        .eq('id', body.payment_account_id)
        .maybeSingle();
    // Sem conta → passa nulo ao gate, que responde 400 sem revelar se o id existe.
    const vinculo = await exigirGestor(req, pa?.organization_id ?? null);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
    if (!pa) return json({ error: 'Conta de pagamento não encontrada.' }, 404);

    if (body.acao === 'salvar_chave') {
        const env = body.env === 'production' ? 'production' : body.env === 'sandbox' ? 'sandbox' : null;
        const chave = (body.chave ?? '').trim();
        if (!env) return json({ error: 'Escolha o ambiente: sandbox ou produção.' }, 400);
        if (!chave) return json({ error: 'Informe a chave de API.' }, 400);

        const teste = await consultarSaldo(baseDaAsaas(env), chave);
        if (!teste.ok) {
            return json({
                error: teste.status === 401
                    ? `A Asaas recusou esta chave (HTTP 401). Confira se ela é do ambiente ${env === 'production' ? 'de PRODUÇÃO' : 'SANDBOX'} e se não foi revogada.`
                    : `Não foi possível testar a chave na Asaas: ${teste.erro}`,
            }, 422);
        }

        // Mesma trava de `asaas_conta_salvar`: uma conta Asaas ativa por org
        // dona. Duas ativas fariam `fn_conta_asaas_da_org` recusar tudo.
        const { data: jaTem } = await admin.from('payment_account_gateway').select('payment_account_id').eq('payment_account_id', pa.id).maybeSingle();
        if (!jaTem) {
            const { data: outras } = await admin.from('payment_account_gateway')
                .select('payment_account_id, payment_accounts!inner(organization_id)')
                .eq('ativo', true)
                .eq('payment_accounts.organization_id', pa.organization_id)
                .neq('payment_account_id', pa.id)
                .limit(1);
            if (outras?.length) {
                return json({ error: 'Esta organização já tem outra conta Asaas ativa. Desative-a antes de cadastrar a chave nesta.' }, 409);
            }
        }

        // A configuração (tetos, piloto) nasce pela tela, mas a chave pode vir
        // primeiro: cria a linha com os padrões editáveis.
        const { error: eIns } = await admin.from('payment_account_gateway')
            .upsert({ payment_account_id: pa.id }, { onConflict: 'payment_account_id', ignoreDuplicates: true });
        if (eIns) return json({ error: eIns.message }, 500);
        await admin.from('payment_accounts').update({ kind: 'gateway' }).eq('id', pa.id);
        // Mesmo efeito de `asaas_conta_salvar`: repasse vira transferência entre
        // contas próprias — a regra que confirmava o crédito sozinho sai (só na dona).
        await admin.from('reconciliation_rules').update({ is_active: false })
            .eq('organization_id', pa.organization_id)
            .eq('name', 'Repasse Gateway (Asaas)')
            .eq('is_active', true);

        const { error: eChave } = await admin.rpc('asaas_conta_guardar_chave', {
            p_payment_account_id: pa.id, p_env: env, p_chave: chave,
        });
        if (eChave) return json({ error: eChave.message }, 500);

        await admin.from('payment_account_gateway').update({
            saldo: teste.saldo, saldo_em: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('payment_account_id', pa.id);
        return json({ ok: true, saldo: teste.saldo, env });
    }

    if (body.acao === 'testar') {
        let conta: ContaAsaas;
        try { conta = await contaPorId(admin, pa.id); }
        catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 422); }
        const teste = await consultarSaldo(conta.base, conta.apiKey);
        await registrarSaldoOuErro(admin, pa.id, teste);
        if (!teste.ok) {
            return json({
                error: teste.status === 401
                    ? 'A Asaas recusou a chave guardada (HTTP 401) — cadastre uma nova.'
                    : `Falha ao consultar a Asaas: ${teste.erro}`,
            }, 422);
        }
        return json({ ok: true, saldo: teste.saldo, env: conta.env });
    }

    if (body.acao === 'sincronizar') {
        const r = await sincronizarComRegistro(admin, pa.id);
        if ('erro' in r) return json({ error: r.erro }, 422);
        return json({ ok: true, ...r });
    }

    return json({ error: 'Ação inválida.' }, 400);
});

// ─── Asaas: saldo ───────────────────────────────────────────────────────

interface Teste { ok: boolean; status: number; saldo: number | null; erro: string | null }

async function consultarSaldo(base: string, apiKey: string): Promise<Teste> {
    try {
        const r = await fetch(`${base}/finance/balance`, { headers: cabecalhosAsaas(apiKey) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
            return { ok: false, status: r.status, saldo: null, erro: d?.errors?.[0]?.description ?? `HTTP ${r.status}` };
        }
        return { ok: true, status: r.status, saldo: typeof d?.balance === 'number' ? d.balance : null, erro: null };
    } catch (e) {
        return { ok: false, status: 0, saldo: null, erro: e instanceof Error ? e.message : String(e) };
    }
}

async function registrarSaldoOuErro(admin: Admin, contaId: string, t: Teste): Promise<void> {
    const agora = new Date().toISOString();
    await admin.from('payment_account_gateway').update(
        t.ok
            ? { saldo: t.saldo, saldo_em: agora, ultimo_erro: null, ultimo_erro_em: null, updated_at: agora }
            : { ultimo_erro: t.status === 401 ? 'Chave de API recusada pela Asaas (HTTP 401).' : t.erro, ultimo_erro_em: agora, updated_at: agora },
    ).eq('payment_account_id', contaId);
}

// ─── Extrato ────────────────────────────────────────────────────────────

type ResultadoSync = { importadas: number; vinculadas: number; sem_vinculo: number; janela: string } | { erro: string };

/** Sincroniza e grava o resultado (ou o erro) na própria conta — para a tela mostrar. */
async function sincronizarComRegistro(admin: Admin, contaId: string): Promise<ResultadoSync> {
    try {
        const r = await sincronizarExtrato(admin, contaId);
        return r;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from('payment_account_gateway').update({
            ultimo_erro: `Extrato: ${msg}`.slice(0, 1000), ultimo_erro_em: new Date().toISOString(),
        }).eq('payment_account_id', contaId);
        console.error('[asaas-conta] extrato', contaId, msg);
        return { erro: msg };
    }
}

async function sincronizarExtrato(admin: Admin, contaId: string): Promise<ResultadoSync> {
    const conta = await contaPorId(admin, contaId);
    const { data: g } = await admin.from('payment_account_gateway')
        .select('extrato_desde,extrato_sincronizado_ate')
        .eq('payment_account_id', contaId).single();
    const { inicio, fim } = janelaDoExtrato({ desde: g.extrato_desde, sincronizadoAte: g.extrato_sincronizado_ate, hoje: hoje() });

    // 1. Busca paginada.
    const itens: ItemExtratoAsaas[] = [];
    for (let offset = 0; itens.length < MAX_LINHAS; offset += 100) {
        const url = `${conta.base}/financialTransactions?startDate=${inicio}&finishDate=${fim}&order=asc&offset=${offset}&limit=100`;
        const r = await fetch(url, { headers: cabecalhosAsaas(conta.apiKey) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw new Error(r.status === 401
                ? 'Chave de API recusada pela Asaas (HTTP 401).'
                : (d?.errors?.[0]?.description ?? `HTTP ${r.status}`));
        }
        for (const it of (d?.data ?? []) as ItemExtratoAsaas[]) itens.push(it);
        if (!d?.hasMore) break;
    }

    // 2. Grava (idempotente por (bank_account_id, external_id)).
    const linhas = itens.map(i => linhaDoExtrato(i, contaId, conta.organizationId!, normalizeText));
    let importadas = 0;
    for (let i = 0; i < linhas.length; i += 200) {
        const { data, error } = await admin.from('bank_transactions')
            .upsert(linhas.slice(i, i + 200), { onConflict: 'bank_account_id,external_id', ignoreDuplicates: true })
            .select('id');
        if (error) throw new Error(`gravar extrato: ${error.message}`);
        importadas += (data ?? []).length;
    }

    // 3. Vínculo determinístico — também para linhas de execuções anteriores
    //    ainda soltas dentro da janela (o título pode ter sido baixado depois).
    let vinculadas = 0;
    let semVinculo = 0;
    const porId = new Map(itens.map(i => [i.id, i]));
    const ids = [...porId.keys()];
    for (let i = 0; i < ids.length; i += 200) {
        const { data: soltas } = await admin.from('bank_transactions')
            .select('id,external_id,amount,direction')
            .eq('bank_account_id', contaId)
            .in('external_id', ids.slice(i, i + 200))
            .in('status', ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED']);
        for (const b of soltas ?? []) {
            const v = vinculoDoExtrato(porId.get(b.external_id)!);
            if (!v) { semVinculo++; continue; }
            const titulo = await tituloDoVinculo(admin, v);
            if (!titulo || titulo.direction !== b.direction || !valoresIguais(titulo.amount, b.amount)) { semVinculo++; continue; }
            const { error } = await admin.rpc('fn_reconcile_match', {
                p_bank_id: b.id, p_internal_id: titulo.id, p_match_type: 'RULE', p_confidence: 100, p_adjustment_category: null,
            });
            if (error) { console.warn('[asaas-conta] vínculo recusado', b.external_id, error.message); semVinculo++; continue; }
            vinculadas++;
        }
    }

    // 4. Cursor + saldo.
    const saldo = await consultarSaldo(conta.base, conta.apiKey);
    const agora = new Date().toISOString();
    await admin.from('payment_account_gateway').update({
        extrato_sincronizado_ate: fim,
        ...(saldo.ok ? { saldo: saldo.saldo, saldo_em: agora } : {}),
        ultimo_erro: null, ultimo_erro_em: null, updated_at: agora,
    }).eq('payment_account_id', contaId);

    return { importadas, vinculadas, sem_vinculo: semVinculo, janela: `${inicio}..${fim}` };
}

interface Titulo { id: string; amount: number; direction: string }

/**
 * Título que a linha do extrato liquida. Só vincula o que JÁ está baixado
 * pelo evento correspondente (cobrança paga / pagamento DONE / taxa viva):
 * linha de cobrança estornada não pode re-baixar o recebível que o estorno
 * devolveu a PREVISTO.
 */
async function tituloDoVinculo(admin: Admin, v: Vinculo): Promise<Titulo | null> {
    if (v.taxa) {
        const seguro = v.asaasId.replace(/[^A-Za-z0-9_-]/g, '');
        const { data } = await admin.from('internal_transactions')
            .select('id,amount,direction')
            .eq('source_system', 'ASAAS_FEE')
            .eq('status', 'CONCILIATED')
            .is('bank_reconciled_at', null)
            .or(`reference_id.eq.${seguro},description.like.*${seguro}`)
            .limit(1).maybeSingle();
        return data ?? null;
    }

    let tituloId: string | null = null;
    if (v.origem === 'cobranca') {
        const { data: c } = await admin.from('client_charges')
            .select('transaction_id,status').eq('asaas_payment_id', v.asaasId).maybeSingle();
        if (c && cobrancaPaga(c.status)) tituloId = c.transaction_id;
    } else {
        const coluna = v.origem === 'boleto' ? 'asaas_bill_id' : 'asaas_transfer_id';
        const { data: s } = await admin.from('supplier_payments')
            .select('transaction_id,boleto_id,organization_id,status').eq(coluna, v.asaasId).maybeSingle();
        if (s && s.status === 'DONE') {
            tituloId = s.transaction_id;
            if (!tituloId && s.boleto_id) {
                const { data: t } = await admin.from('internal_transactions')
                    .select('id').eq('organization_id', s.organization_id)
                    .eq('source_system', 'BOLETO').eq('reference_id', s.boleto_id)
                    .neq('status', 'CANCELLED').limit(1).maybeSingle();
                tituloId = t?.id ?? null;
            }
        }
    }
    if (!tituloId) return null;
    const { data: t } = await admin.from('internal_transactions')
        .select('id,amount,direction,bank_reconciled_at').eq('id', tituloId).maybeSingle();
    if (!t || t.bank_reconciled_at) return null;
    return { id: t.id, amount: Number(t.amount), direction: t.direction };
}
