// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, respostaDeErro, PAPEIS_GESTORES } from "../_shared/auth.ts"
import { resolverContaAsaas, contaDoRegistro, contaPorId, cabecalhosAsaas, type ContaAsaas } from "../_shared/asaasConta.ts"
import { lerTitulo, avaliarDisparo } from "../_shared/asaasDisparo.ts"
import { destinoDoTitulo, opcaoEscolhida, opcoesPublicas, contaDaOpcao } from "../_shared/pixFavorecido.ts"
import { processarEventoAsaas } from "../_shared/asaasProcessar.ts"
import { validarChavePix, tipoParaAsaas, type TipoChavePix } from "../../../utils/pixKey.ts"
import { validateCpfCnpj } from "../../../lib/validators.ts"
import { quarentenaDaChave, HORAS_QUARENTENA, bloqueiosDoSaqueProprio, type DestinoDoSaque } from "../../../utils/asaasGovernanca.ts"
import { dataDoPagamentoDeBoleto, cancelamentoConfirmado, decisaoDoCancelamento } from "../../../utils/asaasBoletoPagamento.ts"
import { resultadoDoEnvio, MOTIVO_SEM_CONFIRMACAO } from "../../../utils/asaasEnvioSemResposta.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

// asaas-payment — dinheiro SAINDO pela Asaas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fases 1, 3 e 4).
//   quote / pay      — boleto de terceiro (POST /v3/bill/simulate, /v3/bill)
//   pix_quote / pix_pay — PIX (POST /v3/transfers — contrato conferido na doc
//                      oficial em 17/10/2026)
//   cancel           — boleto (POST /v3/bill/{id}/cancel) ou PIX
//                      (DELETE /v3/transfers/{id}/cancel), só antes de concluir
//   saque_quote / saque_pay — saldo da conta Asaas → conta bancária PRÓPRIA da
//                      mesma organização, por PIX, SEM título (plano
//                      docs/planos/2026-11-09-conta-asaas-tela-financeiro.md, PR 2).
//                      Portão próprio: `bloqueiosDoSaqueProprio` (testado).
//
// Portão de disparo único (`avaliarDisparo` → `bloqueiosDoDisparo`, testado):
// só owner/admin; título aprovado na alçada (ou sem faixa); tetos da conta
// Asaas (por pagamento, por dia, avulso); piloto; competência aberta; nenhum
// pagamento em curso; e CONTA ASAAS CADASTRADA — a chave global de reserva
// não paga nada. Os *_quote devolvem a mesma lista de bloqueios para a tela.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

// Schema confirmado via OpenAPI oficial da Asaas (2026-07-03):
// POST /v3/bill/simulate → { fee, minimumScheduleDate, bankSlipInfo: { beneficiaryName, beneficiaryCpfCnpj, value, dueDate, isOverdue, companyName, ... } }
// POST /v3/bill (create)  → { id, status, value, fee, companyName, transactionReceiptUrl, canBeCancelled, ... } — NÃO tem beneficiaryName, só companyName.
interface BankSlipInfo {
    beneficiaryName?: string;
    beneficiaryCpfCnpj?: string;
    companyName?: string;
    value?: number;
    dueDate?: string;
    isOverdue?: boolean;
    bank?: string;
}
interface BillSimulateResponse {
    fee?: number;
    minimumScheduleDate?: string;
    bankSlipInfo?: BankSlipInfo;
}
interface BillResponse {
    id?: string;
    status?: string;
    value?: number;
    fee?: number;
    companyName?: string;
    transactionReceiptUrl?: string;
    canBeCancelled?: boolean;
}
interface TransferResponse {
    id?: string;
    status?: string;            // PENDING | BANK_PROCESSING | DONE | CANCELLED | FAILED
    value?: number;
    transferFee?: number;
    effectiveDate?: string;
    scheduleDate?: string;
    authorized?: boolean;
    failReason?: string;
    transactionReceiptUrl?: string;
    /** Titular que a Asaas resolveu pela chave PIX (DICT) — o nome real de quem recebe. */
    bankAccount?: { ownerName?: string; cpfCnpj?: string };
}

const hojeBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

// deno-lint-ignore no-explicit-any
type Admin = any;

interface DestinoComChave {
    destino: DestinoDoSaque;
    banco: string;
    chave: string | null;
    tipo: TipoChavePix | null;
    /** Razão social da empresa dona da conta — o titular esperado da chave. */
    titular: string | null;
    quarentena: ReturnType<typeof quarentenaDaChave>;
}

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '') || null;

/**
 * Fatos do saque para conta própria, lidos no SERVIDOR (nunca do corpo): saldo
 * ao vivo, CNPJ da empresa da conta Asaas e as contas bancárias da organização
 * com chave PIX, CNPJ da empresa e quarentena da chave.
 */
async function fatosDoSaque(admin: Admin, conta: ContaAsaas, organizationId: string, quemEnvia: string) {
    let saldo: number | null = null;
    let saldoErro: string | null = null;
    try {
        const r = await fetch(`${conta.base}/finance/balance`, { headers: cabecalhosAsaas(conta.apiKey) });
        const dd = await r.json().catch(() => ({}));
        if (r.ok && typeof dd?.balance === 'number') saldo = dd.balance;
        else saldoErro = dd?.errors?.[0]?.description ?? `HTTP ${r.status}`;
    } catch (e) {
        saldoErro = e instanceof Error ? e.message : String(e);
    }

    const { data: contas } = await admin.from('payment_accounts')
        .select('id,name,kind,is_active,organization_id,bank,branch,account_number,pix_chave,pix_tipo,empresa_id')
        .or(`id.eq.${conta.paymentAccountId},organization_id.eq.${organizationId}`);
    type Pa = { id: string; name: string; kind: string | null; is_active: boolean | null; organization_id: string; bank: string | null; branch: string | null; account_number: string | null; pix_chave: string | null; pix_tipo: string | null; empresa_id: string | null };
    const lista = (contas ?? []) as Pa[];
    const empresas = [...new Set(lista.map(c => c.empresa_id).filter((x): x is string => !!x))];
    const { data: cos } = empresas.length
        ? await admin.from('companies').select('id,cnpj,razao_social').in('id', empresas)
        : { data: [] };
    const empresa = new Map(((cos ?? []) as { id: string; cnpj: string | null; razao_social: string | null }[]).map(c => [c.id, c]));

    const daConta = lista.find(c => c.id === conta.paymentAccountId);
    const documentoDaConta = soDigitos(daConta?.empresa_id ? empresa.get(daConta.empresa_id)?.cnpj : null);

    const candidatas = lista.filter(c => c.id !== conta.paymentAccountId && c.organization_id === organizationId && (c.kind ?? 'banco') === 'banco' && c.is_active !== false);
    const desde = new Date(Date.now() - HORAS_QUARENTENA * 3600_000).toISOString();
    const { data: alteracoes } = candidatas.length
        ? await admin.from('conta_bancaria_auditoria')
            .select('registro_id,autor,created_at')
            .eq('tabela', 'payment_accounts')
            .in('registro_id', candidatas.map(c => c.id)).in('acao', ['criada', 'alterada']).gte('created_at', desde)
            .order('created_at', { ascending: false })
        : { data: [] };
    const ultima = new Map<string, { em: string; por: string }>();
    for (const a of (alteracoes ?? []) as { registro_id: string; autor: string; created_at: string }[]) {
        if (!ultima.has(a.registro_id)) ultima.set(a.registro_id, { em: a.created_at, por: a.autor });
    }

    const destinos: DestinoComChave[] = candidatas.map(c => {
        const v = c.pix_chave ? validarChavePix(c.pix_tipo, c.pix_chave) : null;
        const emp = c.empresa_id ? empresa.get(c.empresa_id) : undefined;
        return {
            destino: {
                id: c.id,
                nome: c.name,
                ativa: c.is_active !== false,
                kind: c.kind ?? 'banco',
                mesmaOrganizacao: c.organization_id === organizationId,
                chaveValida: !!v?.ok,
                chaveInvalida: v && !v.ok ? v.motivo : null,
                documento: soDigitos(emp?.cnpj),
            },
            banco: [c.bank, c.branch && `ag. ${c.branch}`, c.account_number && `c/c ${c.account_number}`].filter(Boolean).join(' · '),
            chave: v?.ok ? v.chave : null,
            tipo: v?.ok ? (c.pix_tipo as TipoChavePix) : null,
            titular: emp?.razao_social ?? null,
            quarentena: quarentenaDaChave(ultima.get(c.id) ?? null, Date.now(), quemEnvia),
        };
    });
    return { saldo, saldoErro, documentoDaConta, destinos };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({})) as {
        organization_id?: string;
        boleto_id?: string;
        transaction_id?: string;
        supplier_payment_id?: string;
        action?: 'quote' | 'pay' | 'cancel' | 'pix_quote' | 'pix_pay' | 'saque_quote' | 'saque_pay';
        /** Saque: a conta Asaas de onde sai e a conta própria que recebe. */
        payment_account_id?: string;
        destino_payment_account_id?: string;
        valor?: number;
        schedule_date?: string;
        destino?: {
            ref?: string;
            avulso?: { tipo?: string; chave?: string; nome?: string; documento?: string };
        };
    };

    const { organization_id, boleto_id } = body;
    const action = body.action ?? 'quote';

    // Achado C2-03: organization_id do corpo SEMPRE conferido contra o chamador.
    const vinculo = await exigirMembro(req, organization_id);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
    const userEmail = vinculo.email;
    const ehGestor = PAPEIS_GESTORES.includes(vinculo.papel);
    const soGestor = () => json({ error: 'Só proprietário ou administrador da organização dispara ou cancela pagamento pela Asaas.' }, 403);

    const semConta = () => json({
        error: 'Nenhuma conta Asaas configurada para esta organização. Cadastre em Minha Organização › Contas.',
    }, 503);

    // Envio sem resposta conclusiva (sem resposta, 408, 5xx, 2xx sem id): o pagamento PODE ter
    // sido criado. Não vira FAILED — liberaria um segundo envio. Fica "aprovado" com o motivo, e
    // o aviso da Asaas (asaasConfirmar, pela externalReference) liga e atualiza. Doc "Boas
    // práticas gerais": em timeout "não reenvie a mesma conta imediatamente".
    const envioSemConfirmacao = async (supplierPaymentId: string, corpo: unknown) => {
        await admin.from('supplier_payments').update({
            failure_reason: MOTIVO_SEM_CONFIRMACAO,
            raw_response: corpo ?? null,
            updated_at: new Date().toISOString(),
        }).eq('id', supplierPaymentId);
        return json({
            error: 'A Asaas não confirmou o envio. O pagamento PODE ter sido criado — não tente de novo agora: '
                + 'quando a Asaas avisar, o OrçaCloud liga e atualiza sozinho. Se em alguns minutos a linha '
                + 'continuar "Envio sem confirmação", confira no painel da Asaas.',
        }, 504);
    };
    const postar = async (url: string, init: RequestInit): Promise<Response | null> => {
        try { return await fetch(url, init); } catch { return null; }
    };

    if (body.schedule_date && (!/^\d{4}-\d{2}-\d{2}$/.test(body.schedule_date) || body.schedule_date < hojeBRT())) {
        return json({ error: 'Data de agendamento inválida (use uma data de hoje em diante).' }, 400);
    }

    // ─── action: cancel (boleto ou PIX) ───────────────────────
    if (action === 'cancel') {
        if (!ehGestor) return soGestor();
        const paymentId = body.supplier_payment_id;
        if (!paymentId) return json({ error: 'supplier_payment_id é obrigatório para cancel.' }, 400);

        const { data: sp } = await admin
            .from('supplier_payments')
            .select('id,asaas_bill_id,asaas_transfer_id,status,boleto_id,payment_account_id')
            .eq('id', paymentId)
            .eq('organization_id', organization_id)
            .maybeSingle();
        if (!sp) return json({ error: 'Pagamento não encontrado.' }, 404);
        if (sp.status === 'CANCELLED') return json({ ok: true, already_cancelled: true });
        if (sp.status === 'DONE') return json({ error: 'Pagamento já concluído — não pode ser cancelado.' }, 422);

        let confirmadoNaAsaas = true;
        if (sp.asaas_bill_id || sp.asaas_transfer_id) {
            // Cancela na conta que DISPAROU o pagamento, não na conta atual da org.
            let contaDoPagamento: ContaAsaas | null;
            try { contaDoPagamento = await contaDoRegistro(admin, sp.payment_account_id); }
            catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 503); }
            if (!contaDoPagamento) return semConta();
            const objeto = sp.asaas_bill_id
                ? `${contaDoPagamento.base}/bill/${sp.asaas_bill_id}`
                : `${contaDoPagamento.base}/transfers/${sp.asaas_transfer_id}`;

            // Consulta ANTES de pedir (doc "Cancelar pagamento de contas", 14/11/2026: "consulte o
            // pagamento e valide `canBeCancelled`"): pedido que a Asaas vai recusar não sai — nem
            // gera SMS à toa —, e o que ela já cancelou (autorizado pelo app, aviso ainda não
            // chegou) fecha aqui. Consulta que falha não bloqueia: o pedido segue como antes.
            const consulta = await fetch(objeto, { headers: cabecalhosAsaas(contaDoPagamento.apiKey) }).catch(() => null);
            const atual = consulta?.ok ? await consulta.json().catch(() => null) : null;
            const decisao = decisaoDoCancelamento(atual);
            if (decisao.acao === 'nao_cancelavel') return json({ error: decisao.motivo }, 422);

            if (decisao.acao === 'pedir') {
                const cancelRes = await fetch(`${objeto}/cancel`, {
                    method: sp.asaas_bill_id ? 'POST' : 'DELETE',
                    headers: cabecalhosAsaas(contaDoPagamento.apiKey),
                });
                const corpo = await cancelRes.json().catch(() => null);
                if (!cancelRes.ok && cancelRes.status !== 404) {
                    const msg = corpo?.errors?.[0]?.description ?? `HTTP ${cancelRes.status}`;
                    return json({ error: `Asaas (cancelamento): ${msg}`, detail: corpo }, 502);
                }
                // Só é cancelado quando a Asaas DIZ que cancelou. Com autorização por token
                // SMS/app exigida, a resposta não traz CANCELLED: até 13/11/2026 o OrçaCloud
                // marcava "cancelado" e devolvia o boleto a "aprovado" enquanto, na Asaas, o
                // pagamento seguia agendado (plano 2026-11-13-asaas-boleto-data-e-cancelamento).
                confirmadoNaAsaas = cancelamentoConfirmado(cancelRes.status, corpo);
            }
        }

        if (!confirmadoNaAsaas) {
            // Registra quem pediu (o histórico atribui o cancelamento a essa pessoa quando a
            // Asaas confirmar) e deixa o status como está: o aviso da Asaas (webhook, que
            // confere na Asaas) ou a consulta automática fecham o ciclo.
            await admin.from('supplier_payments').update({
                cancelled_by_email: userEmail,
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', sp.id);
            return json({ ok: true, aguardando_autorizacao: true });
        }

        // cancelled_by_email: o histórico (gatilho de auditoria) atribui o
        // cancelamento a quem clicou — sem isso, sairia como "Asaas".
        await admin.from('supplier_payments').update({
            status: 'CANCELLED',
            cancelled_by_email: userEmail,
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', sp.id);
        if (sp.boleto_id) {
            await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                .eq('status', 'programado'); // só reverte se ainda estava programado (não sobrescreve 'pago')
        }
        return json({ ok: true });
    }

    // Conta Asaas da organização (dona → atende também → reserva global).
    // ─── Saque para conta própria (sem título) ────────────────
    if (action === 'saque_quote' || action === 'saque_pay') {
        if (!body.payment_account_id) return json({ error: 'payment_account_id é obrigatório.' }, 400);
        let contaSaque: ContaAsaas;
        try { contaSaque = await contaPorId(admin, body.payment_account_id); }
        catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 422); }
        // A org do corpo foi conferida contra o chamador; a conta tem de ser DELA.
        if (contaSaque.organizationId !== organization_id) {
            return json({ error: 'Esta conta Asaas não pertence à organização informada.' }, 403);
        }

        const fatos = await fatosDoSaque(admin, contaSaque, organization_id!, userEmail);

        if (action === 'saque_quote') {
            return json({
                ok: true,
                saldo: fatos.saldo,
                saldo_erro: fatos.saldoErro,
                destinos: fatos.destinos.map(d => ({
                    id: d.destino.id,
                    nome: d.destino.nome,
                    banco: d.banco,
                    chave: d.chave,
                    tipo: d.tipo,
                    titular: d.titular,
                    quarentena: d.quarentena,
                    // Bloqueios do DESTINO (valor ainda não escolhido: conferido no envio).
                    bloqueios: bloqueiosDoSaqueProprio({
                        ehGestor, temConta: true, saldo: fatos.saldo, valor: 0.01,
                        destino: d.destino, documentoDaContaAsaas: fatos.documentoDaConta, quarentena: d.quarentena,
                    }),
                })),
            });
        }

        // ── saque_pay ──
        if (!ehGestor) return soGestor();
        const valor = Math.round(Number(body.valor ?? 0) * 100) / 100;
        const escolhido = fatos.destinos.find(d => d.destino.id === body.destino_payment_account_id) ?? null;
        const bloqueios = bloqueiosDoSaqueProprio({
            ehGestor, temConta: true, saldo: fatos.saldo, valor,
            destino: escolhido?.destino ?? null, documentoDaContaAsaas: fatos.documentoDaConta,
            quarentena: escolhido?.quarentena ?? null,
        });
        if (bloqueios.length) return json({ error: bloqueios[0], bloqueios }, 422);
        const d = escolhido!;

        // Duplo clique / duas abas: o mesmo saque em andamento há menos de 2 min.
        const { data: emCurso } = await admin.from('supplier_payments')
            .select('id')
            .eq('payment_account_id', contaSaque.paymentAccountId)
            .eq('favorecido_origem', 'conta_propria')
            .eq('value', valor)
            .in('status', ['APPROVED', 'PENDING'])
            .gte('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
            .limit(1);
        if (emCurso?.length) return json({ error: 'Um saque igual acabou de ser enviado — confira o extrato antes de repetir.' }, 409);

        const { data: spRow, error: spErr } = await admin.from('supplier_payments').insert({
            organization_id,
            transaction_id: null,
            payment_account_id: contaSaque.paymentAccountId,
            destino_payment_account_id: d.destino.id,
            provider: 'asaas',
            payment_type: 'PIX_TRANSFER',
            pix_key: d.chave,
            pix_key_type: d.tipo,
            beneficiary_name: d.titular,
            beneficiary_document: d.destino.documento,
            favorecido_origem: 'conta_propria',
            favorecido_documento_esperado: d.destino.documento,
            titular_diferente_autorizado: false,
            value: valor,
            status: 'APPROVED',
            approved_by_email: userEmail,
            approved_at: new Date().toISOString(),
            created_by_email: userEmail,
        }).select('id').single();
        if (spErr) return json({ error: 'Falha ao registrar o saque', detail: spErr.message }, 500);

        const res = await postar(`${contaSaque.base}/transfers`, {
            method: 'POST',
            headers: cabecalhosAsaas(contaSaque.apiKey),
            body: JSON.stringify({
                value: valor,
                operationType: 'PIX',
                pixAddressKey: d.chave,
                pixAddressKeyType: tipoParaAsaas(d.tipo!),
                description: `Transferência para conta própria — ${d.destino.nome}`.slice(0, 140),
                externalReference: spRow.id,
            }),
        });
        const t = (res ? await res.json().catch(() => ({})) : {}) as TransferResponse;
        const envioSaque = resultadoDoEnvio(res?.status ?? null, !!t.id);
        if (envioSaque === 'sem_confirmacao') return await envioSemConfirmacao(spRow.id, t);
        if (envioSaque === 'recusado') {
            const msg = (t as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${res?.status}`;
            await admin.from('supplier_payments').update({
                status: 'FAILED', failure_reason: msg, raw_response: t, updated_at: new Date().toISOString(),
            }).eq('id', spRow.id);
            return json({ error: `Asaas (saque): ${msg}`, detail: t }, 502);
        }

        await admin.from('supplier_payments').update({
            asaas_transfer_id: t.id,
            beneficiary_name: t.bankAccount?.ownerName?.trim() || d.titular,
            status: t.status === 'FAILED' ? 'FAILED' : t.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING',
            failure_reason: t.status === 'FAILED' ? (t.failReason ?? 'Recusado pela Asaas') : null,
            fee: t.transferFee ?? null,
            asaas_authorized: t.authorized ?? null,
            raw_response: t,
            updated_at: new Date().toISOString(),
        }).eq('id', spRow.id);

        if (t.status === 'DONE') {
            await processarEventoAsaas(admin, { event: 'TRANSFER_DONE', transfer: { ...t, id: t.id } });
        }

        return json({
            ok: true,
            supplier_payment_id: spRow.id,
            asaas_transfer_id: t.id,
            status: t.status ?? null,
            aguardando_autorizacao: t.authorized === false,
        });
    }

    let conta: ContaAsaas | null;
    try { conta = await resolverContaAsaas(admin, organization_id!); }
    catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 503); }

    // ─── PIX ──────────────────────────────────────────────────
    if (action === 'pix_quote' || action === 'pix_pay') {
        if (!body.transaction_id) return json({ error: 'transaction_id é obrigatório.' }, 400);
        const titulo = await lerTitulo(admin, body.transaction_id, organization_id!);
        if (!titulo) return json({ error: 'Título a pagar não encontrado nesta organização.' }, 404);
        if (titulo.source_system === 'BOLETO') {
            return json({ error: 'Título de boleto se paga pelo boleto (Pagar via Asaas › boleto), não por PIX.' }, 422);
        }

        const destino = await destinoDoTitulo(admin, titulo);

        // Quarentena (item 3 da segurança): chave criada/alterada há menos de 24 h não é
        // enviada por quem a alterou — outro administrador envia (e confirma) ou espera.
        const contas = destino.opcoes.map(o => contaDaOpcao(o.ref)).filter((x): x is string => !!x);
        if (contas.length) {
            const desde = new Date(Date.now() - HORAS_QUARENTENA * 3600_000).toISOString();
            const { data: alteracoes } = await admin.from('conta_bancaria_auditoria')
                .select('registro_id,autor,created_at')
                .in('registro_id', contas).in('acao', ['criada', 'alterada']).gte('created_at', desde)
                .order('created_at', { ascending: false });
            const ultima = new Map<string, { em: string; por: string }>();
            for (const a of (alteracoes ?? []) as { registro_id: string; autor: string; created_at: string }[]) {
                if (!ultima.has(a.registro_id)) ultima.set(a.registro_id, { em: a.created_at, por: a.autor });
            }
            for (const o of destino.opcoes) {
                const id = contaDaOpcao(o.ref);
                o.quarentena = quarentenaDaChave(id ? ultima.get(id) ?? null : null, Date.now(), userEmail);
            }
        }
        const cadastro = await avaliarDisparo(admin, { titulo, conta, ehGestor, avulso: false });
        const avulso = await avaliarDisparo(admin, { titulo, conta, ehGestor, avulso: true });

        // Titular da chave é conferido na validação de saque pelo CPF/CNPJ da ENTIDADE
        // (plano 2026-10-18-asaas-seguranca-chaves-pix). Sem ele, só paga chave de conta
        // marcada por gestor como titular diferente autorizado.
        const docEntidade = String(destino.documento ?? '').replace(/\D/g, '');
        const temDocEntidade = docEntidade.length === 11 || docEntidade.length === 14;
        const MOTIVO_SEM_DOC = 'Favorecido sem CPF/CNPJ no cadastro: preencha o documento — é por ele que o titular da chave PIX é conferido antes de o dinheiro sair.';
        if (!temDocEntidade && destino.opcoes.length && !destino.opcoes.some(o => o.titularDiferente)) {
            cadastro.bloqueios.push(MOTIVO_SEM_DOC);
        }

        if (action === 'pix_quote') {
            return json({
                ok: true,
                titulo: {
                    id: titulo.id, valor: titulo.amount, vencimento: titulo.due_date ?? titulo.transaction_date,
                    descricao: titulo.description, credor: titulo.party_name,
                },
                favorecido: {
                    origem: destino.favorecido.origem, motivo: destino.favorecido.motivo,
                    nome: destino.nome, documento: destino.documento,
                },
                opcoes: opcoesPublicas(destino),
                bloqueios: cadastro.bloqueios,
                bloqueios_avulso: avulso.bloqueios,
                conta: conta ? { env: conta.env, cadastrada: !!conta.paymentAccountId } : null,
            });
        }

        // ── pix_pay ──
        if (!ehGestor) return soGestor();
        if (!conta?.paymentAccountId) return semConta();

        let chave: string;
        let tipo: TipoChavePix;
        let nome: string | null;
        let documento: string | null;
        let origem: string;
        let bloqueios: string[];
        let esperado: string | null;
        let titularDiferente = false;

        if (body.destino?.ref) {
            const op = opcaoEscolhida(destino, body.destino.ref);
            if (!op) return json({ error: 'A chave escolhida não pertence ao favorecido deste título.' }, 422);
            if (op.invalida || !op.tipo) return json({ error: `Chave do cadastro inválida: ${op.invalida ?? 'sem tipo'}` }, 422);
            if (op.quarentena?.bloqueiaVoce) {
                const libera = new Date(op.quarentena.liberaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return json({ error: `Você criou ou alterou esta chave há menos de ${HORAS_QUARENTENA} h. Para proteger contra desvio, outro administrador precisa enviar este PIX — ou aguarde até ${libera}.` }, 422);
            }
            chave = op.chave; tipo = op.tipo; nome = op.titular ?? destino.nome; documento = op.documento ?? destino.documento;
            origem = destino.favorecido.origem;
            bloqueios = cadastro.bloqueios.filter(b => !(op.titularDiferente && b === MOTIVO_SEM_DOC));
            esperado = temDocEntidade ? docEntidade : null;
            titularDiferente = op.titularDiferente;
        } else if (body.destino?.avulso) {
            const a = body.destino.avulso;
            const r = validarChavePix(a.tipo, a.chave);
            if (!r.ok) return json({ error: r.motivo }, 422);
            if (!a.nome?.trim()) return json({ error: 'Informe o nome do favorecido da chave digitada.' }, 422);
            if (!a.documento || !validateCpfCnpj(a.documento)) return json({ error: 'Informe o CPF/CNPJ válido do favorecido da chave digitada.' }, 422);
            chave = r.chave; tipo = a.tipo as TipoChavePix; nome = a.nome.trim(); documento = a.documento.replace(/\D/g, '');
            origem = 'avulso';
            bloqueios = avulso.bloqueios;
            esperado = documento;
        } else {
            return json({ error: 'Escolha uma chave do cadastro ou digite uma chave PIX.' }, 400);
        }
        if (bloqueios.length) return json({ error: bloqueios[0], bloqueios }, 422);

        const agendado = !!body.schedule_date && body.schedule_date > hojeBRT();
        const { data: spRow, error: spErr } = await admin.from('supplier_payments').insert({
            organization_id: titulo.organization_id,
            transaction_id: titulo.id,
            payment_account_id: conta.paymentAccountId,
            supplier_id: titulo.supplier_id,
            provider: 'asaas',
            payment_type: 'PIX_TRANSFER',
            pix_key: chave,
            pix_key_type: tipo,
            beneficiary_name: nome,
            beneficiary_document: documento,
            favorecido_origem: origem,
            favorecido_documento_esperado: esperado,
            titular_diferente_autorizado: titularDiferente,
            value: titulo.amount,
            scheduled_date: agendado ? body.schedule_date : null,
            status: 'APPROVED',
            approved_by_email: userEmail,
            approved_at: new Date().toISOString(),
            created_by_email: userEmail,
        }).select('id').single();
        if (spErr) {
            if ((spErr as { code?: string }).code === '23505') {
                return json({ error: 'Já existe um pagamento deste título em andamento.' }, 409);
            }
            return json({ error: 'Falha ao registrar a ordem de pagamento', detail: spErr.message }, 500);
        }

        const pedido: Record<string, unknown> = {
            value: titulo.amount,
            operationType: 'PIX',
            pixAddressKey: chave,
            pixAddressKeyType: tipoParaAsaas(tipo),
            description: (titulo.description ?? 'Pagamento').slice(0, 140),
            externalReference: spRow.id,
        };
        if (agendado) pedido.scheduleDate = body.schedule_date;

        const res = await postar(`${conta.base}/transfers`, {
            method: 'POST', headers: cabecalhosAsaas(conta.apiKey), body: JSON.stringify(pedido),
        });
        const t = (res ? await res.json().catch(() => ({})) : {}) as TransferResponse;
        const envioPix = resultadoDoEnvio(res?.status ?? null, !!t.id);
        if (envioPix === 'sem_confirmacao') return await envioSemConfirmacao(spRow.id, t);
        if (envioPix === 'recusado') {
            const msg = (t as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${res?.status}`;
            await admin.from('supplier_payments').update({
                status: 'FAILED', failure_reason: msg, raw_response: t, updated_at: new Date().toISOString(),
            }).eq('id', spRow.id);
            return json({ error: `Asaas (PIX): ${msg}`, detail: t }, 502);
        }

        // Titular resolvido pela Asaas vale mais que o do cadastro (que pode estar
        // vazio — 1º PIX real, 18/10/2026, saiu "PIX enviado para .").
        const titularAsaas = t.bankAccount?.ownerName?.trim() || null;
        // CPF vem MASCARADO (`***.533.946-**`, 22/10/2026): sobrar só o miolo apagaria
        // o documento do cadastro — mascarado, fica o do cadastro.
        const docAsaasBruto = t.bankAccount?.cpfCnpj ?? '';
        const docAsaas = docAsaasBruto.includes('*') ? null : (docAsaasBruto.replace(/\D/g, '') || null);
        const favorecidoFinal = titularAsaas ?? nome;

        // Fica em andamento; a conclusão (título PAGO + taxa) é do processador
        // de eventos — o mesmo do webhook. PIX pode voltar DONE já na resposta.
        await admin.from('supplier_payments').update({
            asaas_transfer_id: t.id,
            beneficiary_name: favorecidoFinal,
            beneficiary_document: docAsaas ?? documento,
            status: t.status === 'FAILED' ? 'FAILED' : t.status === 'CANCELLED' ? 'CANCELLED' : (agendado ? 'SCHEDULED' : 'PENDING'),
            failure_reason: t.status === 'FAILED' ? (t.failReason ?? 'Recusado pela Asaas') : null,
            fee: t.transferFee ?? null,
            asaas_authorized: t.authorized ?? null,
            raw_response: t,
            updated_at: new Date().toISOString(),
        }).eq('id', spRow.id);

        if (t.status === 'DONE') {
            await processarEventoAsaas(admin, { event: 'TRANSFER_DONE', transfer: { ...t, id: t.id } });
        }

        return json({
            ok: true,
            supplier_payment_id: spRow.id,
            asaas_transfer_id: t.id,
            status: t.status ?? null,
            aguardando_autorizacao: t.authorized === false,
            beneficiary_name: favorecidoFinal,
        });
    }

    // ─── Boleto: quote / pay ──────────────────────────────────
    if (!boleto_id) return json({ error: 'boleto_id é obrigatório.' }, 400);
    if (!conta) return semConta();
    const asaasBase = conta.base;
    const asaasHeaders = cabecalhosAsaas(conta.apiKey);

    const { data: boleto, error: bErr } = await admin
        .from('boletos')
        .select('id,organization_id,linha_digitavel,valor,vencimento,beneficiario_nome,supplier_id,status,invoice_id')
        .eq('id', boleto_id)
        .eq('organization_id', organization_id)
        .single();
    if (bErr || !boleto) return json({ error: 'Boleto não encontrado.' }, 404);
    if (!boleto.linha_digitavel) return json({ error: 'Boleto sem linha digitável capturada — não é possível pagar via Asaas.' }, 422);
    if (boleto.status !== 'aprovado' && action === 'pay') {
        return json({ error: `Boleto precisa estar aprovado para ser pago (status atual: ${boleto.status}).` }, 422);
    }

    // Título do boleto no razão — o portão de disparo avalia o TÍTULO (alçada,
    // competência, tetos). Sem ele, `supplier_payments.transaction_id` ficava
    // nulo e a trava de `boletoService.desfazerLancamento` nunca achava nada.
    const { data: tituloRef } = await admin
        .from('internal_transactions')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('source_system', 'BOLETO')
        .eq('reference_id', boleto.id)
        .neq('status', 'CANCELLED')
        .limit(1)
        .maybeSingle();
    const titulo = tituloRef ? await lerTitulo(admin, tituloRef.id, organization_id!) : null;
    const portao = titulo
        ? await avaliarDisparo(admin, { titulo, conta, ehGestor, avulso: false, boletoId: boleto.id })
        : { bloqueios: ['O boleto não tem título no Contas a Pagar — aprove o boleto para gerar o título antes de pagar.'] };

    // ─── action: quote ──────────────────────────────────────────
    // Simula o pagamento na Asaas — retorna valor/beneficiário reais para confirmação
    // do usuário ANTES de disparar o pagamento de verdade (mitigação de boleto adulterado).
    if (action === 'quote') {
        const simRes = await fetch(`${asaasBase}/bill/simulate`, {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({ identificationField: boleto.linha_digitavel }),
        });
        const simData = await simRes.json().catch(() => ({})) as BillSimulateResponse;
        if (!simRes.ok) {
            const msg = (simData as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${simRes.status}`;
            return json({ error: `Asaas (simulação): ${msg}`, detail: simData }, 502);
        }

        const info = simData.bankSlipInfo;
        const beneficiaryName = info?.beneficiaryName ?? info?.companyName ?? null;

        // Confere o valor capturado por OCR contra o valor real embutido na linha digitável —
        // divergência pode indicar erro de OCR ou boleto adulterado (ver Seção 6 do PRD).
        const capturedValue = boleto.valor != null ? Number(boleto.valor) : null;
        const realValue = info?.value ?? null;
        const valueMismatch = capturedValue != null && realValue != null
            && Math.abs(capturedValue - realValue) > 0.01;

        return json({
            ok: true,
            simulation: simData,
            fee: simData.fee ?? null,
            beneficiary_name: beneficiaryName ?? boleto.beneficiario_nome ?? null,
            beneficiary_name_source: beneficiaryName ? 'asaas' : 'boleto_capturado',
            beneficiary_cpf_cnpj: info?.beneficiaryCpfCnpj ?? null,
            is_overdue: info?.isOverdue ?? null,
            // Para o campo "Data do pagamento" da tela (plano 2026-11-13): a menor data que a
            // Asaas aceita e o vencimento (limite do agendamento).
            data_minima: simData.minimumScheduleDate ?? null,
            vencimento: info?.dueDate ?? boleto.vencimento ?? null,
            real_value: realValue,
            captured_value: capturedValue,
            value_mismatch: valueMismatch,
            bloqueios: portao.bloqueios,
        });
    }

    // ─── action: pay ────────────────────────────────────────────
    if (!ehGestor) return soGestor();
    if (!boleto.supplier_id) return json({ error: 'Boleto sem fornecedor vinculado.' }, 422);
    if (portao.bloqueios.length) return json({ error: portao.bloqueios[0], bloqueios: portao.bloqueios }, 422);

    // Data do pagamento SEMPRE explícita (medido em 13/11/2026: sem `scheduleDate` a Asaas
    // agenda para o VENCIMENTO). Cliente sem data (tela antiga) → a data mínima da simulação,
    // "o quanto antes". Conta vencida → sem data (imediato). Regra em utils/asaasBoletoPagamento.ts.
    let dataMinima: string | null = null;
    const vencidaAgora = !!boleto.vencimento && boleto.vencimento < hojeBRT();
    if (!body.schedule_date && !vencidaAgora) {
        const sim = await fetch(`${asaasBase}/bill/simulate`, {
            method: 'POST', headers: asaasHeaders,
            body: JSON.stringify({ identificationField: boleto.linha_digitavel }),
        });
        const simJson = await sim.json().catch(() => ({})) as BillSimulateResponse;
        dataMinima = sim.ok ? (simJson.minimumScheduleDate ?? null) : null;
    }
    const dataPagamento = dataDoPagamentoDeBoleto({
        hoje: hojeBRT(), vencimento: boleto.vencimento, escolhida: body.schedule_date ?? null, dataMinima,
    });
    if (dataPagamento.erro) return json({ error: dataPagamento.erro }, 422);

    const { data: spRow, error: spErr } = await admin
        .from('supplier_payments')
        .insert({
            organization_id,
            boleto_id: boleto.id,
            transaction_id: titulo!.id,
            payment_account_id: conta.paymentAccountId,
            supplier_id: boleto.supplier_id,
            provider: 'asaas',
            payment_type: 'BILL',
            identification_field: boleto.linha_digitavel,
            value: boleto.valor ?? 0, // valor real vem da linha digitável; este é o capturado por OCR, só para exibição local
            scheduled_date: dataPagamento.agendado ? dataPagamento.scheduleDate : null,
            status: 'APPROVED',
            approved_by_email: userEmail,
            approved_at: new Date().toISOString(),
            created_by_email: userEmail,
        })
        .select('id')
        .single();
    if (spErr) {
        // 23505 = índice único parcial: outra chamada registrou o pagamento
        // entre a checagem do portão e este INSERT.
        if ((spErr as { code?: string }).code === '23505') {
            return json({ error: 'Já existe um pagamento deste boleto em andamento.' }, 409);
        }
        return json({ error: 'Falha ao registrar ordem de pagamento', detail: spErr.message }, 500);
    }

    // NÃO envia `value`/`dueDate` — a documentação da Asaas é explícita: esses campos são só
    // para contas que NÃO têm essa informação embutida (ex.: fatura de cartão). Um boleto
    // padrão já carrega o valor real na própria linha digitável; enviar um valor divergente
    // (captura por OCR pode ter erro) arriscaria rejeição ou inconsistência.
    const payBody: Record<string, unknown> = {
        identificationField: boleto.linha_digitavel,
        externalReference: boleto.id,
    };
    // Conta de ARRECADAÇÃO (concessionária, tributo — linha começa com 8): o código
    // de barras não traz vencimento, e a Asaas recusa sem `dueDate` ("Informe uma
    // data de vencimento válida", code invalid_dueDate — 1º boleto real, Energisa
    // #1486, 18/10/2026). A doc: dueDate é "a data de vencimento da conta caso seja
    // do tipo que não possui essa informação". Vai o vencimento impresso do boleto.
    if (String(boleto.linha_digitavel).replace(/\D/g, '').startsWith('8')) {
        if (!boleto.vencimento) {
            await admin.from('supplier_payments').update({
                status: 'FAILED', failure_reason: 'Conta de concessionária sem vencimento cadastrado.',
            }).eq('id', spRow.id);
            return json({ error: 'Conta de concessionária sem vencimento: preencha o vencimento do boleto — o código de barras não traz a data e a Asaas exige.' }, 422);
        }
        // VENCIDA: a Asaas usa o dueDate como data do pagamento e recusa data passada
        // ("Contas vencidas não podem ser agendadas" + "A data de agendamento não pode ser
        // inferior à hoje" — #1486, 19/10/2026, dia útil, sem scheduleDate enviado). A
        // simulação da Asaas trata essa conta como NÃO vencida (o código de barras não
        // traz data). Vai a data de hoje; o valor está travado no código de barras e quem
        // aceita ou não o atraso é a concessionária. O vencimento original vai na
        // descrição. Decisão do usuário em 19/10/2026 ("Sim, mandar a data de hoje").
        if (boleto.vencimento < hojeBRT()) {
            payBody.dueDate = hojeBRT();
            const [a, m, d] = String(boleto.vencimento).split('-');
            payBody.description = `Conta vencida em ${d}/${m}/${a}`;
        } else {
            payBody.dueDate = boleto.vencimento;
        }
    }
    // Conta vencida não se agenda (doc da Asaas: "Contas vencidas não podem ser
    // agendadas" — vencido é pagamento imediato): `dataPagamento.scheduleDate` é null.
    if (dataPagamento.scheduleDate) payBody.scheduleDate = dataPagamento.scheduleDate;

    const payRes = await postar(`${asaasBase}/bill`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify(payBody),
    });
    const payData = (payRes ? await payRes.json().catch(() => ({})) : {}) as BillResponse;
    const envioBoleto = resultadoDoEnvio(payRes?.status ?? null, !!payData.id);
    if (envioBoleto === 'sem_confirmacao') return await envioSemConfirmacao(spRow.id, payData);

    if (envioBoleto === 'recusado') {
        let msg = (payData as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${payRes?.status}`;
        // Janelas do mesmo dia (doc "Regras importantes" da Asaas, conferida em
        // 19/10/2026): boleto de cobrança até 23h, conta de consumo até 20h, boleto
        // acima de R$ 250 mil até 16h — sempre em dia útil. A doc pede para não fixar
        // um horário único na integração; aqui só se explica a recusa.
        const JANELAS = 'conta de consumo até 20h, boleto de cobrança até 23h, acima de R$ 250 mil até 16h';
        const diaSemana = new Date(`${hojeBRT()}T12:00:00Z`).getUTCDay();
        const fimDeSemana = diaSemana === 0 || diaSemana === 6;
        // Conta vencida em dia não útil: a Asaas responde "só até às 22 horas" mesmo de
        // manhã (tentaria agendar para o próximo dia útil, e vencida não se agenda) —
        // domingo 18/10/2026, 10:55.
        if (/22 horas/.test(msg) && fimDeSemana) {
            msg = `Conta vencida só pode ser paga em dia útil, dentro da janela do dia (${JANELAS} — regras da Asaas). Hoje é fim de semana: tente no próximo dia útil.`;
        } else if (/fora do hor[aá]rio limite/i.test(msg)) {
            msg = `Pagamento fora do horário limite do dia (${JANELAS} — regras da Asaas). Tente no próximo dia útil, dentro da janela.`;
        }
        await admin.from('supplier_payments').update({
            status: 'FAILED',
            failure_reason: msg,
            raw_response: payData,
        }).eq('id', spRow.id);
        return json({ error: `Asaas (pagamento): ${msg}`, detail: payData }, 502);
    }

    const asaasBillId = payData.id ?? null;
    const asaasStatus = payData.status ?? null;
    const beneficiaryName = payData.companyName ?? boleto.beneficiario_nome ?? null;

    await admin.from('supplier_payments').update({
        asaas_bill_id: asaasBillId,
        status: dataPagamento.agendado ? 'SCHEDULED' : 'PENDING',
        scheduled_date: dataPagamento.agendado ? dataPagamento.scheduleDate : null,
        beneficiary_name: beneficiaryName,
        value: payData.value ?? boleto.valor, // sobrescreve pelo valor real confirmado pela Asaas
        fee: payData.fee ?? null,
        raw_response: payData,
    }).eq('id', spRow.id);

    // Boleto vai para 'programado' — 'pago' só quando o webhook confirmar BILL_PAID.
    await admin.from('boletos').update({ status: 'programado' }).eq('id', boleto.id);
    await admin.from('boletos_auditoria').insert({
        boleto_id: boleto.id,
        organization_id,
        acao: 'pagamento_asaas_disparado',
        metodo: 'usuario',
        usuario_email: userEmail,
        valor_depois: { supplier_payment_id: spRow.id, asaas_bill_id: asaasBillId, status: asaasStatus },
    });

    return json({
        ok: true,
        supplier_payment_id: spRow.id,
        asaas_bill_id: asaasBillId,
        status: asaasStatus,
        beneficiary_name: beneficiaryName,
    });
});
