// O webhook da Asaas vira GATILHO: o OrçaCloud não confia no corpo do aviso.
//
// Plano: docs/planos/2026-10-18-asaas-seguranca-chaves-pix.md (item 5). Antes, o
// processador gravava o que o corpo dizia — com o token vazado, um "PAYMENT_RECEIVED"
// ou "TRANSFER_DONE" forjado dava baixa em título. Agora o aviso só fornece o id: o
// objeto é buscado NA ASAAS, com a chave da conta que criou o registro, e o evento é
// derivado do status real (`eventoDoStatus`) — o mesmo caminho da consulta automática
// (`asaas-status-sync`). Aviso forjado, no máximo, faz o OrçaCloud conferir de novo.

import { contaDoRegistro, cabecalhosAsaas } from "./asaasConta.ts";
import { eventoDoStatus, ramoDoEvento, type PayloadAsaas } from "../../../utils/asaasEventos.ts";
import { candidatoDaReferencia } from "../../../utils/asaasEnvioSemResposta.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export type Confirmacao =
    | { tipo: 'confirmado'; payload: PayloadAsaas }
    /** O status real não pede gravação (intermediário: criado, pendente, em processamento). */
    | { tipo: 'sem_mudanca'; status: string | null }
    /** Evento que o OrçaCloud não trata, ou registro que não é nosso (ainda). */
    | { tipo: 'desconhecido' }
    /** Não deu para perguntar à Asaas. `transitorio` = vale a Asaas reenviar o aviso. */
    | { tipo: 'nao_confirmado'; motivo: string; transitorio: boolean };

const ALVO = {
    payment:  { tabela: 'client_charges',    coluna: 'asaas_payment_id',  caminho: '/payments/' },
    bill:     { tabela: 'supplier_payments', coluna: 'asaas_bill_id',     caminho: '/bill/' },
    transfer: { tabela: 'supplier_payments', coluna: 'asaas_transfer_id', caminho: '/transfers/' },
} as const;

export async function confirmarNaAsaas(admin: Admin, aviso: PayloadAsaas): Promise<Confirmacao> {
    const ramo = ramoDoEvento(aviso);
    if (ramo === 'desconhecido') return { tipo: 'desconhecido' };
    const id = String((aviso[ramo] as { id?: string | number }).id);
    const alvo = ALVO[ramo];

    const { data: reg, error } = await admin.from(alvo.tabela).select('payment_account_id').eq(alvo.coluna, id).maybeSingle();
    if (error) return { tipo: 'nao_confirmado', motivo: `leitura do registro: ${error.message}`, transitorio: true };
    if (!reg) {
        // Envio que ficou sem resposta (o OrçaCloud não gravou o id): liga pelo
        // externalReference e confere de novo, agora com o registro (plano
        // 2026-11-13-asaas-boleto-data-e-cancelamento, item 6).
        if (ramo !== 'payment' && await ligarEnvioSemResposta(admin, ramo, id)) return confirmarNaAsaas(admin, aviso);
        return { tipo: 'desconhecido' };
    }

    let conta;
    try { conta = await contaDoRegistro(admin, reg.payment_account_id); }
    catch (e) { return { tipo: 'nao_confirmado', motivo: e instanceof Error ? e.message : String(e), transitorio: false }; }
    if (!conta) return { tipo: 'nao_confirmado', motivo: 'registro sem conta Asaas', transitorio: false };

    let r: Response;
    try { r = await fetch(`${conta.base}${alvo.caminho}${id}`, { headers: cabecalhosAsaas(conta.apiKey) }); }
    catch (e) { return { tipo: 'nao_confirmado', motivo: `Asaas fora do ar: ${e instanceof Error ? e.message : String(e)}`, transitorio: true }; }

    if (r.status === 404) {
        // Cobrança apagada some da API; saída não some (cancelada continua consultável).
        if (ramo === 'payment') return { tipo: 'confirmado', payload: { event: 'PAYMENT_DELETED', payment: { id, deleted: true } as PayloadAsaas['payment'] } };
        return { tipo: 'nao_confirmado', motivo: `${alvo.caminho}${id} não existe na Asaas`, transitorio: false };
    }
    if (r.status === 401 || r.status === 403) return { tipo: 'nao_confirmado', motivo: `chave recusada pela Asaas (HTTP ${r.status})`, transitorio: false };
    if (!r.ok) return { tipo: 'nao_confirmado', motivo: `HTTP ${r.status}`, transitorio: r.status >= 500 || r.status === 429 };

    const obj = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!obj) return { tipo: 'nao_confirmado', motivo: 'resposta da Asaas ilegível', transitorio: true };
    const evento = eventoDoStatus(ramo, obj.status as string | undefined, ramo === 'payment' && obj.deleted === true);
    if (!evento) return { tipo: 'sem_mudanca', status: (obj.status as string | undefined) ?? null };
    return { tipo: 'confirmado', payload: { event: evento, [ramo]: { ...obj, id } } as PayloadAsaas };
}

/**
 * Aviso de saída (boleto/PIX) com id que o OrçaCloud não conhece: procura entre os pagamentos
 * "aprovados sem número" dos últimos 7 dias qual é o dono — busca o objeto na Asaas, com a conta
 * de cada candidato, e compara a `externalReference` (boleto → id do boleto; PIX/saque → id do
 * pagamento). Achou um só: grava o id e passa o registro para "enviado"/"agendado" (o processador
 * cuida dos estados finais). Doc "Boas práticas gerais": em timeout, "verifique se o pagamento já
 * foi criado por meio dos eventos recebidos".
 */
async function ligarEnvioSemResposta(admin: Admin, ramo: 'bill' | 'transfer', asaasId: string): Promise<boolean> {
    const coluna = ramo === 'bill' ? 'asaas_bill_id' : 'asaas_transfer_id';
    const desde = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    let q = admin.from('supplier_payments').select('id,boleto_id,payment_account_id')
        .eq('status', 'APPROVED').is('asaas_bill_id', null).is('asaas_transfer_id', null)
        .not('payment_account_id', 'is', null).gte('created_at', desde).limit(50);
    q = ramo === 'bill' ? q.eq('payment_type', 'BILL') : q.neq('payment_type', 'BILL');
    const { data: candidatos } = await q;
    if (!candidatos?.length) return false;

    const contas = [...new Set((candidatos as { payment_account_id: string }[]).map(c => c.payment_account_id))];
    for (const contaId of contas) {
        let conta;
        try { conta = await contaDoRegistro(admin, contaId); } catch { continue; }
        if (!conta) continue;
        const r = await fetch(`${conta.base}${ramo === 'bill' ? '/bill/' : '/transfers/'}${asaasId}`, { headers: cabecalhosAsaas(conta.apiKey) }).catch(() => null);
        if (!r?.ok) continue;
        const obj = await r.json().catch(() => null) as { externalReference?: string; scheduleDate?: string } | null;
        const dono = candidatoDaReferencia(candidatos as { id: string; boleto_id: string | null; payment_account_id: string }[], contaId, obj?.externalReference);
        if (!dono) continue;
        const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
        const agendado = !!obj?.scheduleDate && obj.scheduleDate > hoje;
        const { data: ligado } = await admin.from('supplier_payments').update({
            [coluna]: asaasId,
            status: agendado ? 'SCHEDULED' : 'PENDING',
            scheduled_date: agendado ? obj!.scheduleDate : null,
            failure_reason: null,
            raw_response: obj,
            updated_at: new Date().toISOString(),
        }).eq('id', dono.id).eq('status', 'APPROVED').is(coluna, null).select('id');
        if (!ligado?.length) return false;
        if (ramo === 'bill' && dono.boleto_id) {
            await admin.from('boletos').update({ status: 'programado' }).eq('id', dono.boleto_id).eq('status', 'aprovado');
        }
        return true;
    }
    return false;
}
