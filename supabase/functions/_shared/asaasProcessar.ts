// Gravação dos eventos da Asaas — o ÚNICO caminho que muda estado por evento.
//
// Chamado pelo `asaas-webhook` (evento real) e pelo `asaas-status-sync`
// (evento sintético montado a partir do status consultado). A decisão do que
// fazer mora em `utils/asaasEventos.ts` (puro, testado no Vitest); aqui só se
// grava. Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 1).
//
// Idempotência por "reivindicação": cada transição é um UPDATE condicionado ao
// estado de origem com `.select('id')`. Se voltar vazio, outro processamento
// (reenvio da Asaas, CONFIRMED + RECEIVED quase juntos, polling) já fez a
// transição — e a taxa não é lançada duas vezes. O check-then-update anterior
// deixava a corrida aberta entre a leitura e a escrita.
//
// Boleto e nota NÃO são tocados no caminho com título: o gatilho
// `trg_sync_boleto_baixa` leva boleto→'pago'/invoice→'paid' na baixa do título
// e desfaz no estorno. Só o boleto SEM título (sequela antiga) é gravado aqui.

import {
    type PayloadAsaas,
    ramoDoEvento,
    dataDoMovimento,
    taxaDaCobranca,
    cobrancaAtiva,
    cobrancaPaga,
    decidirCobranca,
    statusLocalDoDesfazimento,
    decidirSaida,
    motivoDaFalha,
    STATUS_COBRANCA_PAGA,
    STATUS_COBRANCA_ENCERRADA,
    STATUS_SAIDA_TERMINAL,
} from "../../../utils/asaasEventos.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface ResultadoProcessamento {
    ok: boolean;
    acao: string;
    detalhe?: string;
}

const agora = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const listaPostgrest = (xs: readonly string[]) => `(${xs.join(',')})`;

/**
 * supabase-js não lança em UPDATE/INSERT recusado — devolve `{ error }` e
 * segue. Sem isto o webhook respondia 200 com metade gravada e a Asaas nunca
 * reenviava. Lançando, o webhook devolve 500 e a Asaas tenta de novo.
 */
function gravou(r: { error?: { message?: string } | null }): void {
    if (r?.error) throw new Error(r.error.message ?? 'falha de gravação');
}

/** Ponto de entrada. Nunca lança por evento desconhecido — devolve `ignorado`. */
export async function processarEventoAsaas(admin: Admin, payload: PayloadAsaas): Promise<ResultadoProcessamento> {
    const ramo = ramoDoEvento(payload);
    const evento = payload.event ?? '';
    if (ramo === 'payment') return processarCobranca(admin, evento, payload);
    if (ramo === 'bill' || ramo === 'transfer') return processarSaida(admin, ramo, evento, payload);
    return { ok: true, acao: 'ignorado', detalhe: 'evento_sem_tratamento' };
}

// ─── Cobrança ao cliente ────────────────────────────────────────────────

async function processarCobranca(admin: Admin, evento: string, p: PayloadAsaas): Promise<ResultadoProcessamento> {
    const paymentId = p.payment!.id!;
    const statusAsaas = p.payment?.status ?? null;

    const { data: charge } = await admin
        .from('client_charges')
        .select('id,transaction_id,organization_id,status,payment_account_id')
        .eq('asaas_payment_id', paymentId)
        .maybeSingle();
    // Não é cobrança nossa (ou ainda não persistida): ack para a Asaas não reenviar.
    if (!charge) return { ok: true, acao: 'ignorado', detalhe: 'cobranca_desconhecida' };

    const acao = decidirCobranca(evento, charge.status);
    const data = dataDoMovimento(p, hojeISO());

    if (acao === 'ignorar') return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

    if (acao === 'baixar') {
        const { data: reivindicada, error: erroAoReivindicar } = await admin.from('client_charges').update({
            status: statusAsaas && cobrancaPaga(statusAsaas) ? statusAsaas : 'RECEIVED',
            paid_at: p.payment?.paymentDate ?? p.payment?.clientPaymentDate ?? agora(),
            updated_at: agora(),
        }).eq('id', charge.id)
          .not('status', 'in', listaPostgrest(STATUS_COBRANCA_PAGA))
          .select('id');
        if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
        if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

        // Depois da reivindicação, falha de REGRA (competência fechada em Contas
        // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
        // encontraria o evento já reivindicado, e depois de várias falhas pausaria
        // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
        const pendencia = await comPendencia(async () => {
            if (charge.transaction_id) {
                gravou(await admin.from('internal_transactions').update({
                    business_status: 'RECEBIDO',
                    status: 'CONCILIATED',
                    payment_date: data,
                    // Conta Asaas por onde o dinheiro entrou (Fase 2). Sem ela a
                    // baixa não tinha conta e o caixa da Asaas não existia.
                    ...(charge.payment_account_id ? { payment_account_id: charge.payment_account_id } : {}),
                    updated_at: agora(),
                }).eq('id', charge.transaction_id)
                  .eq('organization_id', charge.organization_id));

                const fee = taxaDaCobranca(p.payment?.value, p.payment?.netValue);
                if (fee > 0) {
                    await lancarTaxa(admin, {
                        organizationId: charge.organization_id,
                        contaId: charge.payment_account_id ?? null,
                        tituloId: charge.transaction_id,
                        asaasId: paymentId,
                        valor: fee,
                        data,
                        descricao: `Taxa Gateway Asaas — ${paymentId}`,
                    });
                }
            }
        }, (m) => anotarPendencia(admin, 'cobranca', charge.id, m));
        if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
        return { ok: true, acao: 'recebido' };
    }

    if (acao === 'estornar') {
        const { data: reivindicada, error: erroAoReivindicar } = await admin.from('client_charges').update({
            status: statusLocalDoDesfazimento(evento, statusAsaas),
            updated_at: agora(),
        }).eq('id', charge.id)
          .in('status', [...STATUS_COBRANCA_PAGA])
          .select('id');
        if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
        if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

        // Depois da reivindicação, falha de REGRA (competência fechada em Contas
        // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
        // encontraria o evento já reivindicado, e depois de várias falhas pausaria
        // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
        const pendencia = await comPendencia(async () => {
            // O recebível volta a PREVISTO — fica livre para nova emissão. Só
            // desfaz o que a baixa por Asaas fez: título baixado à mão por outro
            // caminho não está em RECEBIDO por causa desta cobrança e não é tocado
            // se já saiu desse estado.
            if (charge.transaction_id) {
                await exigirSemConciliacaoBancaria(admin, [charge.transaction_id]);
                gravou(await admin.from('internal_transactions').update({
                    business_status: 'PREVISTO',
                    status: 'PENDING',
                    payment_date: null,
                    ...(charge.payment_account_id ? { payment_account_id: null } : {}),
                    updated_at: agora(),
                }).eq('id', charge.transaction_id)
                  .eq('organization_id', charge.organization_id)
                  .eq('business_status', 'RECEBIDO'));
            }
            await cancelarTaxa(admin, charge.organization_id, paymentId);
        }, (m) => anotarPendencia(admin, 'cobranca', charge.id, m));
        if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
        return { ok: true, acao: 'estornado' };
    }

    if (acao === 'cancelar') {
        const { data: reivindicada, error: erroAoReivindicar } = await admin.from('client_charges').update({
            status: statusLocalDoDesfazimento(evento, statusAsaas),
            updated_at: agora(),
        }).eq('id', charge.id)
          .not('status', 'in', listaPostgrest(STATUS_COBRANCA_ENCERRADA))
          .select('id');
        if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
        if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

        // Depois da reivindicação, falha de REGRA (competência fechada em Contas
        // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
        // encontraria o evento já reivindicado, e depois de várias falhas pausaria
        // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
        const pendencia = await comPendencia(async () => {
            // Mesmo efeito da ação `cancel` da asaas-charge: libera reemissão.
            if (charge.transaction_id) {
                gravou(await admin.from('internal_transactions').update({
                    business_status: 'PREVISTO',
                    updated_at: agora(),
                }).eq('id', charge.transaction_id)
                  .eq('organization_id', charge.organization_id)
                  .in('business_status', ['EMITIDO', 'ENVIADO']));
            }
        }, (m) => anotarPendencia(admin, 'cobranca', charge.id, m));
        if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
        return { ok: true, acao: 'cancelado' };
    }

    // refletir — sem rebaixar cobrança paga ou encerrada (um PAYMENT_OVERDUE
    // atrasado não pode transformar RECEIVED em OVERDUE). Encerrada também não
    // reabre por aqui (PAYMENT_RESTORED): o recebível pode já ter outra
    // cobrança viva, o índice `uq_client_charges_tx_ativa` recusaria, e o 500
    // faria a Asaas reenviar para sempre. Restaurar é decisão de tela.
    const podeRefletir = !cobrancaPaga(charge.status) && cobrancaAtiva(charge.status);
    if (statusAsaas && podeRefletir) {
        gravou(await admin.from('client_charges').update({
            status: statusAsaas,
            updated_at: agora(),
        }).eq('id', charge.id));
    }
    return { ok: true, acao: 'status_refletido' };
}

// ─── Saída: boleto de terceiro (BILL) e transferência PIX (TRANSFER) ────

async function processarSaida(
    admin: Admin,
    tipo: 'bill' | 'transfer',
    evento: string,
    p: PayloadAsaas,
): Promise<ResultadoProcessamento> {
    const asaasId = tipo === 'bill' ? p.bill!.id! : p.transfer!.id!;
    const coluna = tipo === 'bill' ? 'asaas_bill_id' : 'asaas_transfer_id';

    const { data: sp } = await admin
        .from('supplier_payments')
        .select('id,boleto_id,transaction_id,organization_id,status,payment_type,payment_account_id')
        .eq(coluna, asaasId)
        .maybeSingle();
    if (!sp) return { ok: true, acao: 'ignorado', detalhe: 'pagamento_desconhecido' };

    const acao = decidirSaida(tipo, evento, sp.status);
    const data = dataDoMovimento(p, hojeISO());

    if (acao === 'ignorar') return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };
    if (acao === 'acompanhar') return { ok: true, acao: 'acompanhado' };

    if (acao === 'concluir') {
        const fee = tipo === 'bill' ? Number(p.bill?.fee ?? 0) : Number(p.transfer?.transferFee ?? 0);
        const { data: reivindicada, error: erroAoReivindicar } = await admin.from('supplier_payments').update({
            status: 'DONE',
            receipt_url: (tipo === 'bill' ? p.bill?.transactionReceiptUrl : p.transfer?.transactionReceiptUrl) ?? null,
            fee: fee > 0 ? fee : null,
            updated_at: agora(),
        }).eq('id', sp.id)
          .not('status', 'in', listaPostgrest(STATUS_SAIDA_TERMINAL))
          .select('id');
        if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
        if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

        // Depois da reivindicação, falha de REGRA (competência fechada em Contas
        // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
        // encontraria o evento já reivindicado, e depois de várias falhas pausaria
        // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
        const pendencia = await comPendencia(async () => {
            const titulos = await idsDosTitulos(admin, sp);
            if (titulos.length) {
                const baixa: Record<string, unknown> = {
                    business_status: 'PAGO',
                    status: 'CONCILIATED',
                    payment_date: data,
                    updated_at: agora(),
                };
                if (tipo === 'transfer') baixa.payment_type = 'PIX';
                if (sp.payment_account_id) baixa.payment_account_id = sp.payment_account_id;
                gravou(await admin.from('internal_transactions').update(baixa).in('id', titulos));
            } else if (sp.boleto_id) {
                // Boleto sem título no razão: o gatilho não tem por onde agir.
                gravou(await admin.from('boletos').update({ status: 'pago' }).eq('id', sp.boleto_id)
                    .not('status', 'in', '(pago,cancelado)'));
            }

            if (fee > 0) {
                await lancarTaxa(admin, {
                    organizationId: sp.organization_id,
                    contaId: sp.payment_account_id ?? null,
                    tituloId: titulos[0] ?? null,
                    boletoId: sp.boleto_id ?? null,
                    asaasId,
                    valor: fee,
                    data,
                    descricao: tipo === 'bill'
                        ? `Taxa Gateway Asaas (pagamento de boleto) — ${asaasId}`
                        : `Taxa Gateway Asaas (PIX enviado) — ${asaasId}`,
                });
            }
        }, (m) => anotarPendencia(admin, 'saida', sp.id, m));
        if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
        return { ok: true, acao: tipo === 'bill' ? 'boleto_pago' : 'pix_enviado' };
    }

    if (acao === 'falhar' || acao === 'cancelar') {
        const { data: reivindicada, error: erroAoReivindicar } = await admin.from('supplier_payments').update({
            status: acao === 'cancelar' ? 'CANCELLED' : 'FAILED',
            failure_reason: motivoDaFalha(evento, p),
            updated_at: agora(),
        }).eq('id', sp.id)
          .not('status', 'in', listaPostgrest(STATUS_SAIDA_TERMINAL))
          .select('id');
        if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
        if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

        // Depois da reivindicação, falha de REGRA (competência fechada em Contas
        // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
        // encontraria o evento já reivindicado, e depois de várias falhas pausaria
        // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
        const pendencia = await comPendencia(async () => {
            // Libera nova tentativa: o boleto sai de 'programado'. Título não
            // muda — nunca foi baixado por este pagamento.
            if (sp.boleto_id) {
                gravou(await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                    .eq('status', 'programado'));
            }
        }, (m) => anotarPendencia(admin, 'saida', sp.id, m));
        if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
        return { ok: true, acao: acao === 'cancelar' ? 'cancelado' : 'falhou' };
    }

    // estornar — estava DONE e o dinheiro voltou para a conta Asaas.
    const { data: reivindicada, error: erroAoReivindicar } = await admin.from('supplier_payments').update({
        status: 'FAILED',
        failure_reason: `Estornado pela Asaas (${evento}): ${motivoDaFalha(evento, p)}`,
        updated_at: agora(),
    }).eq('id', sp.id)
      .eq('status', 'DONE')
      .select('id');
    if (erroAoReivindicar) throw new Error(erroAoReivindicar.message);
    if (!reivindicada?.length) return { ok: true, acao: 'ignorado', detalhe: 'ja_processado' };

    // Depois da reivindicação, falha de REGRA (competência fechada em Contas
    // a Pagar, período fechado) não pode virar 500: a Asaas reenviaria,
    // encontraria o evento já reivindicado, e depois de várias falhas pausaria
    // a fila de webhooks da conta inteira. Vira pendência anotada no registro.
    const pendencia = await comPendencia(async () => {
        const titulos = await idsDosTitulos(admin, sp);
        if (titulos.length) {
            await exigirSemConciliacaoBancaria(admin, titulos);
            // Volta a APROVADO: houve disparo, logo o título tinha passado pela
            // aprovação. O gatilho desfaz boleto 'pago' → 'aprovado' e nota.
            gravou(await admin.from('internal_transactions').update({
                business_status: 'APROVADO',
                status: 'PENDING',
                payment_date: null,
                ...(sp.payment_account_id ? { payment_account_id: null } : {}),
                updated_at: agora(),
            }).in('id', titulos)
              .eq('business_status', 'PAGO'));
        } else if (sp.boleto_id) {
            gravou(await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                .eq('status', 'pago'));
        }
        await cancelarTaxa(admin, sp.organization_id, asaasId);
    }, (m) => anotarPendencia(admin, 'saida', sp.id, m));
    if (pendencia) return { ok: true, acao: 'pendencia', detalhe: pendencia };
    return { ok: true, acao: 'estornado' };
}

/**
 * Roda os efeitos de uma transição já reivindicada. Se falharem, anota o
 * motivo no registro de origem (para aparecer na tela) e devolve a mensagem;
 * o chamador responde 200 com `acao: 'pendencia'`.
 */
async function comPendencia(efeitos: () => Promise<void>, anotar: (m: string) => Promise<void>): Promise<string | null> {
    try {
        await efeitos();
        return null;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[asaas] efeito pendente:', msg);
        try { await anotar(msg); } catch (e2) { console.error('[asaas] nem a anotação gravou:', e2); }
        return msg;
    }
}

/**
 * `supplier_payments.failure_reason` / `client_charges.error_message` com o
 * prefixo "Baixa pendente:" — o status NÃO muda (o dinheiro se moveu de fato
 * na Asaas); o que ficou pendente é o reflexo no razão.
 */
async function anotarPendencia(admin: Admin, alvo: 'saida' | 'cobranca', id: string, msg: string): Promise<void> {
    const texto = `Baixa pendente: ${msg}`.slice(0, 1000);
    if (alvo === 'saida') {
        gravou(await admin.from('supplier_payments').update({ failure_reason: texto, updated_at: agora() }).eq('id', id));
    } else {
        gravou(await admin.from('client_charges').update({ error_message: texto, updated_at: agora() }).eq('id', id));
    }
}

/**
 * Estorno não desfaz título que a Conciliação já casou com o extrato: o
 * vínculo em `reconciliation_matches` ficaria órfão apontando para um título
 * "a receber/pagar". Vira pendência ("Baixa pendente: …") — quem resolve
 * desfaz o vínculo na Conciliação e estorna à mão.
 */
async function exigirSemConciliacaoBancaria(admin: Admin, ids: string[]): Promise<void> {
    const { data } = await admin.from('internal_transactions')
        .select('id').in('id', ids).not('bank_reconciled_at', 'is', null).limit(1);
    if (data?.length) {
        throw new Error('o título já está conciliado com o extrato — desfaça o vínculo na Conciliação Bancária e estorne à mão');
    }
}

/**
 * Títulos que este pagamento baixa. `transaction_id` é o vínculo direto (PIX,
 * e boleto pago depois da Fase 1). Para boleto antigo cai no par
 * `source_system='BOLETO' + reference_id=boleto_id`, que era o único caminho.
 */
async function idsDosTitulos(
    admin: Admin,
    sp: { transaction_id?: string | null; boleto_id?: string | null; organization_id: string },
): Promise<string[]> {
    if (sp.transaction_id) return [sp.transaction_id];
    if (!sp.boleto_id) return [];
    const { data } = await admin.from('internal_transactions')
        .select('id')
        .eq('organization_id', sp.organization_id)
        .eq('source_system', 'BOLETO')
        .eq('reference_id', sp.boleto_id)
        .neq('status', 'CANCELLED');
    return (data ?? []).map((r: { id: string }) => r.id);
}

// ─── Taxa da Asaas ──────────────────────────────────────────────────────

async function lancarTaxa(admin: Admin, t: {
    organizationId: string;
    /** Conta Asaas de onde a taxa saiu (null = chave global antiga). */
    contaId: string | null;
    tituloId: string | null;
    boletoId?: string | null;
    asaasId: string;
    valor: number;
    data: string;
    descricao: string;
}): Promise<void> {
    let dims: { project_id?: string | null; cost_center_id?: string | null } | null = null;
    if (t.tituloId) {
        const { data } = await admin.from('internal_transactions')
            .select('project_id,cost_center_id').eq('id', t.tituloId).maybeSingle();
        dims = data;
    } else if (t.boletoId) {
        const { data } = await admin.from('boletos')
            .select('project_id,cost_center_id').eq('id', t.boletoId).maybeSingle();
        dims = data;
    }

    gravou(await admin.from('internal_transactions').insert({
        organization_id:  t.organizationId,
        source_system:    'ASAAS_FEE',
        // reference_id = id do objeto na Asaas: é por ele que o estorno acha
        // esta linha. Antes a taxa não guardava vínculo nenhum além do texto.
        reference_id:     t.asaasId,
        direction:        'DEBIT',
        amount:           t.valor,
        transaction_date: t.data,
        due_date:         t.data,
        payment_date:     t.data,
        description:      t.descricao,
        category:         'Taxa Gateway',
        business_status:  'PAGO',
        status:           'CONCILIATED',
        project_id:       dims?.project_id ?? null,
        cost_center_id:   dims?.cost_center_id ?? null,
        party_name:       'Asaas Tecnologia',
        payment_account_id: t.contaId,
    }));
}

/**
 * Cancela a taxa ligada a um objeto da Asaas. Taxas lançadas antes da Fase 1
 * não têm `reference_id` — o id só aparece no fim da descrição
 * ("Taxa Gateway Asaas — pay_xxx"), por isso o OU.
 */
async function cancelarTaxa(admin: Admin, organizationId: string, asaasId: string): Promise<void> {
    const seguro = asaasId.replace(/[^A-Za-z0-9_-]/g, '');
    if (!seguro) return;
    gravou(await admin.from('internal_transactions').update({
        status: 'CANCELLED',
        business_status: 'CANCELADO',
        updated_at: agora(),
    }).eq('organization_id', organizationId)
      .eq('source_system', 'ASAAS_FEE')
      .neq('status', 'CANCELLED')
      .or(`reference_id.eq.${seguro},description.like.*${seguro}`));
}
