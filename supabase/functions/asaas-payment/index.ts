// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, respostaDeErro, PAPEIS_GESTORES } from "../_shared/auth.ts"
import { resolverContaAsaas, contaDoRegistro, cabecalhosAsaas, type ContaAsaas } from "../_shared/asaasConta.ts"
import { lerTitulo, avaliarDisparo } from "../_shared/asaasDisparo.ts"
import { destinoDoTitulo, opcaoEscolhida, opcoesPublicas } from "../_shared/pixFavorecido.ts"
import { processarEventoAsaas } from "../_shared/asaasProcessar.ts"
import { validarChavePix, tipoParaAsaas, type TipoChavePix } from "../../../utils/pixKey.ts"
import { validateCpfCnpj } from "../../../lib/validators.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

// asaas-payment — dinheiro SAINDO pela Asaas.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fases 1, 3 e 4).
//   quote / pay      — boleto de terceiro (POST /v3/bill/simulate, /v3/bill)
//   pix_quote / pix_pay — PIX (POST /v3/transfers — contrato conferido na doc
//                      oficial em 17/10/2026)
//   cancel           — boleto (POST /v3/bill/{id}/cancel) ou PIX
//                      (DELETE /v3/transfers/{id}/cancel), só antes de concluir
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
}

const hojeBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

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
        action?: 'quote' | 'pay' | 'cancel' | 'pix_quote' | 'pix_pay';
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

        if (sp.asaas_bill_id || sp.asaas_transfer_id) {
            // Cancela na conta que DISPAROU o pagamento, não na conta atual da org.
            let contaDoPagamento: ContaAsaas | null;
            try { contaDoPagamento = await contaDoRegistro(admin, sp.payment_account_id); }
            catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 503); }
            if (!contaDoPagamento) return semConta();
            const url = sp.asaas_bill_id
                ? `${contaDoPagamento.base}/bill/${sp.asaas_bill_id}/cancel`
                : `${contaDoPagamento.base}/transfers/${sp.asaas_transfer_id}/cancel`;
            const cancelRes = await fetch(url, {
                method: sp.asaas_bill_id ? 'POST' : 'DELETE',
                headers: cabecalhosAsaas(contaDoPagamento.apiKey),
            });
            if (!cancelRes.ok && cancelRes.status !== 404) {
                const d = await cancelRes.json().catch(() => ({}));
                const msg = d?.errors?.[0]?.description ?? `HTTP ${cancelRes.status}`;
                return json({ error: `Asaas (cancelamento): ${msg}`, detail: d }, 502);
            }
        }

        await admin.from('supplier_payments').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', sp.id);
        if (sp.boleto_id) {
            await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                .eq('status', 'programado'); // só reverte se ainda estava programado (não sobrescreve 'pago')
        }
        return json({ ok: true });
    }

    // Conta Asaas da organização (dona → atende também → reserva global).
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
        const cadastro = await avaliarDisparo(admin, { titulo, conta, ehGestor, avulso: false });
        const avulso = await avaliarDisparo(admin, { titulo, conta, ehGestor, avulso: true });

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

        if (body.destino?.ref) {
            const op = opcaoEscolhida(destino, body.destino.ref);
            if (!op) return json({ error: 'A chave escolhida não pertence ao favorecido deste título.' }, 422);
            if (op.invalida || !op.tipo) return json({ error: `Chave do cadastro inválida: ${op.invalida ?? 'sem tipo'}` }, 422);
            chave = op.chave; tipo = op.tipo; nome = op.titular ?? destino.nome; documento = op.documento ?? destino.documento;
            origem = destino.favorecido.origem;
            bloqueios = cadastro.bloqueios;
        } else if (body.destino?.avulso) {
            const a = body.destino.avulso;
            const r = validarChavePix(a.tipo, a.chave);
            if (!r.ok) return json({ error: r.motivo }, 422);
            if (!a.nome?.trim()) return json({ error: 'Informe o nome do favorecido da chave digitada.' }, 422);
            if (!a.documento || !validateCpfCnpj(a.documento)) return json({ error: 'Informe o CPF/CNPJ válido do favorecido da chave digitada.' }, 422);
            chave = r.chave; tipo = a.tipo as TipoChavePix; nome = a.nome.trim(); documento = a.documento.replace(/\D/g, '');
            origem = 'avulso';
            bloqueios = avulso.bloqueios;
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

        const res = await fetch(`${conta.base}/transfers`, {
            method: 'POST', headers: cabecalhosAsaas(conta.apiKey), body: JSON.stringify(pedido),
        });
        const t = await res.json().catch(() => ({})) as TransferResponse;
        if (!res.ok || !t.id) {
            const msg = (t as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${res.status}`;
            await admin.from('supplier_payments').update({
                status: 'FAILED', failure_reason: msg, raw_response: t, updated_at: new Date().toISOString(),
            }).eq('id', spRow.id);
            return json({ error: `Asaas (PIX): ${msg}`, detail: t }, 502);
        }

        // Fica em andamento; a conclusão (título PAGO + taxa) é do processador
        // de eventos — o mesmo do webhook. PIX pode voltar DONE já na resposta.
        await admin.from('supplier_payments').update({
            asaas_transfer_id: t.id,
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
            beneficiary_name: nome,
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
            scheduled_date: body.schedule_date ?? null,
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
    if (body.schedule_date) payBody.scheduleDate = body.schedule_date;

    const payRes = await fetch(`${asaasBase}/bill`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify(payBody),
    });
    const payData = await payRes.json().catch(() => ({})) as BillResponse;

    if (!payRes.ok) {
        const msg = (payData as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${payRes.status}`;
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
        status: body.schedule_date ? 'SCHEDULED' : 'PENDING',
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
