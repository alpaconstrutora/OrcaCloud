// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirMembro, exigirUsuario, respostaDeErro, chamadaDeCron } from "../_shared/auth.ts";
// ⚠️ MESMO arquivo que o navegador carrega. Não é uma cópia: `utils/reconciliationRules.ts`
// não tem um único import, justamente para Deno e Vite poderem compartilhá-lo. Reescrever
// estas regras aqui criaria duas verdades sobre "o que casa com o quê", e em 06/09/2026
// elas erraram nas duas direções antes de acertar — duas cópias seriam duas chances de
// regredir.
import {
    findExactUniquePairs,
    findInternalTransferPairs,
} from "../../../utils/reconciliationRules.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** O PostgREST corta em 1000 linhas por requisição; aqui pagina até esgotar. */
async function todasAsPaginas<T>(monta: (de: number, ate: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const todas: T[] = [];
    const TAM = 1000;
    for (let de = 0; ; de += TAM) {
        const { data, error } = await monta(de, de + TAM - 1);
        if (error) throw error;
        const pagina = data ?? [];
        todas.push(...pagina);
        if (pagina.length < TAM) break;
    }
    return todas;
}

/**
 * Motor de conciliação, do lado do servidor.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 * O motor rodava só no navegador. Em 06/09/2026 isso custou um dia: ele só
 * executava quando alguém clicava, a aba podia estar com versão antiga em cache,
 * a falha aparecia como um aviso de 3 segundos que nem era desenhado, e 9.958
 * lançamentos eram carregados para a memória do cliente a cada rodada.
 *
 * Aqui roda a parte DETERMINÍSTICA — transferências entre contas próprias e pares
 * de valor exato com candidato único dos dois lados. É a parte que escreve
 * vínculo, e portanto a que mais importa acontecer de forma confiável e auditável.
 * A pontuação das sugestões continua no cliente por enquanto.
 *
 * Autorização: `exigirMembro` valida o JWT E confere que o usuário pertence à
 * organização da CONTA (nunca a que o cliente mandar). `verify_jwt` do gateway não
 * serve como autorização — a chave anon é um JWT válido e vai no bundle.
 */
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    let corpo: { bank_account_id?: string; trigger?: string };
    try {
        corpo = await req.json();
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }

    const contaId = corpo.bank_account_id;
    if (!contaId) return json({ error: 'bank_account_id é obrigatório.' }, 400);

    // ── Quem está chamando, ANTES de tocar no banco ──────────────────────────
    //
    // A ordem aqui é regra, não estilo. Enquanto a busca da conta vinha primeiro,
    // um chamador sem credencial nenhuma recebia 404 "Conta bancária não
    // encontrada" — ou seja, a função respondia se um id existe ou não para quem
    // não provou ser ninguém. Com o `verify_jwt` do gateway desligado (preciso
    // para o segredo do cron, que não é JWT, chegar até aqui), este arquivo é a
    // ÚNICA porta. Então: credencial primeiro, consulta depois.
    //
    // Dois chamadores legítimos, e a diferença importa:
    //
    //  - PESSOA: JWT de usuário. Validado agora, e a associação com a organização
    //    DA CONTA é conferida logo abaixo, quando a conta for conhecida.
    //  - CRON do banco: `chamadaDeCron` compara com o segredo dedicado do vault,
    //    em tempo constante. Não há usuário, então `created_by` fica nulo — e é
    //    isso mesmo: inventar um dono para a varredura seria mentir no registro.
    const doCron = chamadaDeCron(req);
    if (!doCron) {
        const usuario = await exigirUsuario(req);
        if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const servico = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // A organização vem da CONTA, nunca do cliente: é ela que define o escopo, e
    // aceitar do corpo seria deixar o escopo na mão de quem chama.
    const { data: conta, error: erroConta } = await servico
        .from('payment_accounts')
        .select('id, organization_id')
        .eq('id', contaId)
        .maybeSingle();
    if (erroConta || !conta) return json({ error: 'Conta bancária não encontrada.' }, 404);

    // Agora que a conta é conhecida: a pessoa é membro da organização DELA?
    // A chave anon é um JWT válido e vai no bundle do frontend, então passar por
    // `exigirUsuario` acima não basta — é este `exigirMembro` que decide o escopo.
    let quemPediu: string | null = null;
    if (!doCron) {
        const vinculo = await exigirMembro(req, conta.organization_id);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        quemPediu = vinculo.userId;
    }

    // O `trigger` só é aceito do corpo quando a chamada é do cron; de uma pessoa
    // é sempre MANUAL. Deixar o cliente escrever 'CRON' no registro tornaria o
    // histórico incapaz de responder "isso rodou sozinho ou alguém clicou?".
    const GATILHOS = ['MANUAL', 'IMPORT', 'CRON'];
    const gatilho = doCron && GATILHOS.includes(corpo.trigger ?? '') ? corpo.trigger! : (doCron ? 'CRON' : 'MANUAL');

    const orgId = conta.organization_id;
    const inicio = Date.now();

    let runId: string | null = null;
    try {
        const { data: run } = await servico.from('reconciliation_runs')
            .insert({ organization_id: orgId, bank_account_id: contaId, trigger: gatilho, status: 'RUNNING', created_by: quemPediu })
            .select('id').single();
        runId = run?.id ?? null;
    } catch { /* registro é melhor-esforço; não pode impedir de conciliar */ }

    try {
        // ── 1. Transferências entre contas da própria organização ──
        const movimentosDaOrg = await todasAsPaginas<{ id: string; bank_account_id: string; transaction_date: string; amount: number; direction: string }>(
            (de, ate) => servico.from('bank_transactions')
                .select('id, bank_account_id, transaction_date, amount, direction')
                .eq('organization_id', orgId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true }).order('id', { ascending: true })
                .range(de, ate));

        let transferencias = 0;
        for (const par of findInternalTransferPairs(movimentosDaOrg)) {
            const { error } = await servico.rpc('fn_reconcile_transfer', { p_debit_id: par.debitId, p_credit_id: par.creditId });
            if (!error) transferencias++;
        }

        // ── 2. Pares de valor exato com candidato único dos DOIS lados ──
        const movimentos = await todasAsPaginas<{ id: string; amount: number; direction: string; transaction_date: string; counterparty_name?: string; description_normalized?: string; description_raw?: string }>(
            (de, ate) => servico.from('bank_transactions')
                .select('id, amount, direction, transaction_date, counterparty_name, description_normalized, description_raw')
                .eq('bank_account_id', contaId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true }).order('id', { ascending: true })
                .range(de, ate));

        const titulos = await todasAsPaginas<{ id: string; amount: number; direction: string; transaction_date: string; party_name?: string; entity_name?: string }>(
            (de, ate) => servico.from('internal_transactions')
                .select('id, amount, direction, transaction_date, party_name, entity_name')
                .eq('organization_id', orgId)
                .eq('status', 'PENDING')
                .order('transaction_date', { ascending: true }).order('id', { ascending: true })
                .range(de, ate));

        let conciliados = 0;
        const pares = findExactUniquePairs(movimentos, titulos);
        for (const par of pares) {
            const { error } = await servico.rpc('fn_reconcile_match', {
                p_bank_id: par.bankId, p_internal_id: par.internalId,
                p_match_type: 'HEURISTIC', p_confidence: 100, p_adjustment_category: null,
            });
            if (!error) conciliados++;
        }

        if (runId) {
            await servico.from('reconciliation_runs').update({
                status: 'DONE', auto_matched: conciliados, exact_unique: pares.length,
                transfers_paired: transferencias, suggestions: 0,
                bank_rows_scanned: movimentos.length, title_rows_scanned: titulos.length,
                finished_at: new Date().toISOString(), duration_ms: Date.now() - inicio,
            }).eq('id', runId);
        }

        return json({
            ok: true, run_id: runId,
            auto_matched: conciliados, exact_unique: pares.length, transfers_paired: transferencias,
            bank_rows_scanned: movimentos.length, title_rows_scanned: titulos.length,
            duration_ms: Date.now() - inicio,
        });
    } catch (e) {
        const err = e as { message?: string; code?: string };
        if (runId) {
            await servico.from('reconciliation_runs').update({
                status: 'FAILED', error_message: err?.message ?? String(e), error_code: err?.code ?? null,
                finished_at: new Date().toISOString(), duration_ms: Date.now() - inicio,
            }).eq('id', runId);
        }
        return json({ error: err?.message ?? String(e), code: err?.code ?? null }, 500);
    }
});
