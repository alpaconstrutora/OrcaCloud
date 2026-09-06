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
    findInternalTransferPairs,
    janelaDeTitulos,
    montarAjustes,
    montarIndiceDeContrapartes,
    planMatching,
    AJUSTES_PADRAO,
    type BankRowParaPlano,
    type PartyIndex,
    type ReconciliationEngineSettings,
    type TituloParaPlano,
} from "../../../utils/reconciliationRules.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

/** O SDK entra por URL e sem tipos; isto é só o suficiente para o compilador não adivinhar. */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** O PostgREST corta em 1000 linhas por requisição; aqui pagina até esgotar. */
// `PromiseLike`, e não `Promise`: o construtor de consulta do PostgREST é "thenable" —
// dá para dar `await` nele —, mas não é uma Promise (não tem `catch`/`finally`). Exigir
// Promise aqui fazia `deno check` reprovar o arquivo inteiro, o que ninguém via porque o
// deploy não roda checagem de tipos.
async function todasAsPaginas<T>(monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
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
 * Ajustes do motor para esta organização. As duas tabelas são opcionais; a mistura com os
 * padrões é `montarAjustes`, no módulo de regras — nunca reescrita aqui. Se este arquivo
 * tivesse a própria cópia de `auto_threshold: 100`, o servidor poderia passar a conciliar
 * sozinho o que o navegador só sugeriria, e ninguém veria a divergência.
 */
async function carregarAjustes(servico: SupabaseLike, orgId: string): Promise<ReconciliationEngineSettings> {
    try {
        const [{ data: asaas }, { data: rs }] = await Promise.all([
            servico.from('asaas_charge_config').select('fine_percent, interest_percent_month').eq('organization_id', orgId).maybeSingle(),
            servico.from('reconciliation_settings').select('value_tol_abs, value_tol_pct, encargos_tol_pct, date_window_days, auto_threshold, suggestion_min').eq('organization_id', orgId).maybeSingle(),
        ]);
        return montarAjustes(asaas, rs);
    } catch {
        return AJUSTES_PADRAO;
    }
}

/** Aliases aprendidos + documentos de fornecedores, clientes e contas de fornecedor. */
async function carregarContrapartes(servico: SupabaseLike, orgId: string): Promise<PartyIndex> {
    const orgOuNulo = `organization_id.eq.${orgId},organization_id.is.null`;
    const [aliases, fornecedores, clientes, contas] = await Promise.all([
        servico.from('reconciliation_aliases').select('alias_token, party_type, party_id, party_name, hit_count').eq('organization_id', orgId).order('hit_count', { ascending: false }).limit(2000),
        servico.from('suppliers').select('id, name, document').or(orgOuNulo),
        servico.from('clients').select('id, name, document').or(orgOuNulo),
        servico.from('supplier_bank_accounts').select('supplier_id, pix_key, pix_key_type, beneficiary_document').eq('organization_id', orgId),
    ]);
    return montarIndiceDeContrapartes(
        aliases.data || [], fornecedores.data || [], clientes.data || [], contas.data || []);
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

    // `CRON` é reservado a quem provou ser o cron. Uma pessoa pode dizer se clicou
    // (`MANUAL`) ou se veio logo depois de importar (`IMPORT`) — as duas coisas são
    // verdade sobre ela —, mas não pode se declarar rotina: senão o histórico deixa de
    // responder "isso rodou sozinho ou alguém clicou?".
    const DE_PESSOA = ['MANUAL', 'IMPORT'];
    const pedido = corpo.trigger ?? '';
    const gatilho = doCron
        ? (pedido === 'CRON' || DE_PESSOA.includes(pedido) ? pedido : 'CRON')
        : (DE_PESSOA.includes(pedido) ? pedido : 'MANUAL');

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

        // ── 2. Pontuação: o mesmo plano que o navegador calculava ──
        //
        // Até 06/09/2026 esta função fazia só a metade DETERMINÍSTICA (transferências e
        // pares exatos únicos) e gravava `suggestions: 0` no registro. Quem lesse
        // `reconciliation_runs` via uma execução DONE com zero sugestões e entendia "não
        // achou nada", quando a verdade era "não fez essa parte" — número plausível no
        // lugar de "não sei", que é a assinatura de erro engolido que já mordeu esta tela
        // três vezes. Agora o servidor faz as DUAS metades, e o zero passa a significar
        // zero de verdade.
        const movimentos = await todasAsPaginas<BankRowParaPlano>(
            (de, ate) => servico.from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name, bank_account_id')
                .eq('bank_account_id', contaId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true }).order('id', { ascending: true })
                .range(de, ate));

        if (movimentos.length === 0) {
            if (runId) {
                await servico.from('reconciliation_runs').update({
                    status: 'DONE', auto_matched: 0, exact_unique: 0,
                    transfers_paired: transferencias, suggestions: 0,
                    bank_rows_scanned: 0, title_rows_scanned: 0,
                    finished_at: new Date().toISOString(), duration_ms: Date.now() - inicio,
                }).eq('id', runId);
            }
            return json({ ok: true, run_id: runId, auto_matched: 0, exact_unique: 0,
                transfers_paired: transferencias, suggestions: 0,
                bank_rows_scanned: 0, title_rows_scanned: 0, duration_ms: Date.now() - inicio });
        }

        // Só os títulos da janela que o extrato alcança — a mesma conta dos dois lados.
        const janela = janelaDeTitulos(movimentos.map(m => m.transaction_date));
        const titulos = await todasAsPaginas<TituloParaPlano>(
            (de, ate) => servico.from('internal_transactions')
                .select('id, transaction_date, due_date, amount, direction, description, entity_name, party_name, party_id, payment_account_id')
                .eq('organization_id', orgId)
                .eq('status', 'PENDING')
                .gte('transaction_date', janela.inicio)
                .lte('transaction_date', janela.fim)
                .order('transaction_date', { ascending: true }).order('id', { ascending: true })
                .range(de, ate));

        const settings = await carregarAjustes(servico, orgId);
        const partyIndex = await carregarContrapartes(servico, orgId);
        const plano = planMatching(movimentos, titulos, settings, partyIndex);

        // 2.a) Sugestões: apaga as da conta e regrava. Em lotes, porque o PostgREST tem
        //      limite de tamanho de requisição e a lista chega a centenas de linhas.
        const idsDoExtrato = movimentos.map(m => m.id);
        for (let i = 0; i < idsDoExtrato.length; i += 100) {
            await servico.from('reconciliation_suggestions').delete().in('bank_transaction_id', idsDoExtrato.slice(i, i + 100));
        }
        for (let i = 0; i < plano.suggestionRows.length; i += 200) {
            await servico.from('reconciliation_suggestions').insert(plano.suggestionRows.slice(i, i + 200));
        }

        // 2.b) Carimba no extrato a contraparte reconhecida por CNPJ/PIX/alias.
        for (const [nome, ids] of plano.partyUpdates) {
            for (let i = 0; i < ids.length; i += 100) {
                await servico.from('bank_transactions').update({ counterparty_name: nome }).in('id', ids.slice(i, i + 100));
            }
        }

        // 2.c) Aplica os vínculos automáticos, um a um: cada `fn_reconcile_match` é uma
        //      transação com auditoria, e uma recusa (período fechado, por exemplo) não
        //      pode derrubar o lote inteiro.
        let conciliados = 0;
        for (const m of plano.autoMatches) {
            const { error } = await servico.rpc('fn_reconcile_match', {
                p_bank_id: m.bankId, p_internal_id: m.internalId,
                p_match_type: 'HEURISTIC', p_confidence: Math.min(m.score, 100), p_adjustment_category: null,
            });
            if (!error) conciliados++;
        }

        if (runId) {
            await servico.from('reconciliation_runs').update({
                status: 'DONE', auto_matched: conciliados, exact_unique: plano.exactUnique,
                transfers_paired: transferencias, suggestions: plano.suggestionRows.length,
                bank_rows_scanned: movimentos.length, title_rows_scanned: titulos.length,
                finished_at: new Date().toISOString(), duration_ms: Date.now() - inicio,
            }).eq('id', runId);
        }

        return json({
            ok: true, run_id: runId,
            auto_matched: conciliados, exact_unique: plano.exactUnique, transfers_paired: transferencias,
            suggestions: plano.suggestionRows.length,
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
