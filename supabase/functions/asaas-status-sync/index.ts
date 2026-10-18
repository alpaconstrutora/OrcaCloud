// asaas-status-sync — fallback do webhook da Asaas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 1.9).
//
// Se um webhook se perde (função fora do ar num deploy, fila de webhooks da
// conta pausada pela Asaas, evento descartado), cobrança paga fica PENDING e
// boleto pago fica "programado" para sempre — não havia nada que olhasse de
// novo. A cada 15 min (pg_cron + CRON_SECRET) esta função consulta na Asaas o
// estado do que ainda está em aberto, converte o status em evento
// (`eventoDoStatus`) e entrega ao MESMO `processarEventoAsaas` do webhook.
// Não há segundo caminho de gravação: o que o webhook faria, isto faz.
//
// Rodízio por `asaas_checked_at`: cada execução pega os N conferidos há mais
// tempo (nunca conferido primeiro) e carimba a hora — assim um lote grande
// não repete sempre as mesmas linhas.
//
// Autorização (REGRA #7): só o cron, por `chamadaDeCron`. Sem header → 401.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaDeCron } from "../_shared/auth.ts"
import { processarEventoAsaas } from "../_shared/asaasProcessar.ts"
import { contaDoRegistro, cabecalhosAsaas, type ContaAsaas } from "../_shared/asaasConta.ts"
import { eventoDoStatus, type PayloadAsaas } from "../../../utils/asaasEventos.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Quantas linhas de cada tabela por execução (a Asaas limita requisições por minuto). */
const LOTE = 40;
/** Não reconsulta o que mudou há menos que isto — o webhook costuma chegar antes. */
const CARENCIA_MIN = 20;

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!chamadaDeCron(req)) return json({ error: 'Não autorizado' }, 401);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const limite = new Date(Date.now() - CARENCIA_MIN * 60_000).toISOString();
    const resumo = { cobrancas: 0, pagamentos: 0, eventos: 0, erros: [] as string[] };

    // Cada registro é consultado na conta Asaas que o CRIOU (Fase 2). Sem
    // conta (emitido pela chave global antiga, que saiu em 18/10/2026) → pula.
    const contas = new Map<string, ContaAsaas | null>();
    async function contaDe(paymentAccountId: string | null): Promise<ContaAsaas | null> {
        const k = paymentAccountId ?? '__reserva__';
        if (!contas.has(k)) {
            try { contas.set(k, await contaDoRegistro(admin, paymentAccountId)); }
            catch (e) { resumo.erros.push(`conta ${k}: ${e instanceof Error ? e.message : String(e)}`); contas.set(k, null); }
        }
        return contas.get(k)!;
    }

    async function consultar(paymentAccountId: string | null, caminho: string): Promise<Record<string, unknown> | null> {
        const conta = await contaDe(paymentAccountId);
        if (!conta) return null;
        const r = await fetch(`${conta.base}${caminho}`, { headers: cabecalhosAsaas(conta.apiKey) });
        if (r.status === 404) return { __naoExiste: true };
        if (!r.ok) {
            resumo.erros.push(`${caminho}: HTTP ${r.status}`);
            return null;
        }
        return await r.json().catch(() => null);
    }

    async function entregar(payload: PayloadAsaas, origem: string) {
        try {
            const res = await processarEventoAsaas(admin, payload);
            if (res.acao !== 'ignorado') resumo.eventos++;
        } catch (e) {
            resumo.erros.push(`${origem}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ─── Cobranças ao cliente ainda abertas ─────────────────────────────
    const { data: cobrancas, error: e1 } = await admin
        .from('client_charges')
        .select('id,asaas_payment_id,payment_account_id')
        .in('status', ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'])
        .not('asaas_payment_id', 'is', null)
        .lt('updated_at', limite)
        .order('asaas_checked_at', { ascending: true, nullsFirst: true })
        .limit(LOTE);
    if (e1) resumo.erros.push(`client_charges: ${e1.message}`);

    for (const c of cobrancas ?? []) {
        resumo.cobrancas++;
        const p = await consultar(c.payment_account_id, `/payments/${c.asaas_payment_id}`);
        if (p) {
            const removida = p.__naoExiste === true || p.deleted === true;
            const evento = eventoDoStatus('payment', p.status as string | undefined, removida);
            if (evento) {
                await entregar({
                    event: evento,
                    payment: { ...(p as PayloadAsaas['payment']), id: c.asaas_payment_id },
                }, `cobrança ${c.asaas_payment_id}`);
            }
        }
        await admin.from('client_charges').update({ asaas_checked_at: new Date().toISOString() }).eq('id', c.id);
    }

    // ─── Pagamentos de saída em andamento (boleto e PIX) ────────────────
    const { data: saidas, error: e2 } = await admin
        .from('supplier_payments')
        .select('id,asaas_bill_id,asaas_transfer_id,payment_account_id')
        .in('status', ['PENDING', 'SCHEDULED'])
        .lt('updated_at', limite)
        .order('asaas_checked_at', { ascending: true, nullsFirst: true })
        .limit(LOTE);
    if (e2) resumo.erros.push(`supplier_payments: ${e2.message}`);

    for (const s of saidas ?? []) {
        resumo.pagamentos++;
        if (s.asaas_bill_id) {
            const b = await consultar(s.payment_account_id, `/bill/${s.asaas_bill_id}`);
            if (b && !b.__naoExiste) {
                const evento = eventoDoStatus('bill', b.status as string | undefined);
                if (evento) {
                    await entregar({
                        event: evento,
                        bill: { ...(b as PayloadAsaas['bill']), id: s.asaas_bill_id },
                    }, `boleto ${s.asaas_bill_id}`);
                }
            }
        } else if (s.asaas_transfer_id) {
            const t = await consultar(s.payment_account_id, `/transfers/${s.asaas_transfer_id}`);
            if (t && !t.__naoExiste) {
                const evento = eventoDoStatus('transfer', t.status as string | undefined);
                if (evento) {
                    await entregar({
                        event: evento,
                        transfer: { ...(t as PayloadAsaas['transfer']), id: s.asaas_transfer_id },
                    }, `pix ${s.asaas_transfer_id}`);
                }
            }
        }
        await admin.from('supplier_payments').update({ asaas_checked_at: new Date().toISOString() }).eq('id', s.id);
    }

    if (resumo.erros.length) console.error('[asaas-status-sync]', resumo.erros);
    return json({ ok: true, ...resumo });
});
