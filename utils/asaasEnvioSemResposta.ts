// Envio à Asaas sem resposta conclusiva — regras puras (Deno + Vitest, SEM imports).
//
// Plano: docs/planos/2026-11-13-asaas-boleto-data-e-cancelamento.md (item 6). Doc "Boas práticas
// gerais" da Asaas (conferida em 14/11/2026): em timeout ou falha de comunicação "não reenvie a
// mesma conta imediatamente" — "verifique se o pagamento já foi criado por meio dos eventos
// recebidos". Até aqui, falta de resposta (e 5xx) virava FAILED, liberando um segundo envio do
// que a Asaas podia ter criado; e o aviso da Asaas com um id desconhecido era ignorado.

export const MOTIVO_SEM_CONFIRMACAO =
    'Envio sem confirmação da Asaas (sem resposta) — o pagamento pode ter sido criado; o OrçaCloud liga e atualiza sozinho quando a Asaas avisar.';

/**
 * O que a resposta do POST de criação (boleto ou PIX) quer dizer.
 * - `aceito`: 2xx com id;
 * - `recusado`: 4xx (exceto 408) — a Asaas recusou, nada foi criado;
 * - `sem_confirmacao`: sem resposta, 408, 5xx ou 2xx sem id — PODE ter sido criado.
 */
export function resultadoDoEnvio(httpStatus: number | null, temId: boolean): 'aceito' | 'recusado' | 'sem_confirmacao' {
    if (httpStatus === null) return 'sem_confirmacao';
    if (httpStatus >= 200 && httpStatus < 300) return temId ? 'aceito' : 'sem_confirmacao';
    if (httpStatus === 408 || httpStatus >= 500) return 'sem_confirmacao';
    return 'recusado';
}

/** Linha "aprovada" sem número da Asaas há mais de `minutos`: envio que ninguém confirmou. */
export function envioSemConfirmacao(
    sp: { status: string; asaas_bill_id?: string | null; asaas_transfer_id?: string | null; created_at?: string | null },
    agoraMs: number,
    minutos = 5,
): boolean {
    if (sp.status !== 'APPROVED' || sp.asaas_bill_id || sp.asaas_transfer_id || !sp.created_at) return false;
    const criado = Date.parse(sp.created_at);
    return Number.isFinite(criado) && agoraMs - criado >= minutos * 60_000;
}

/**
 * Aviso da Asaas com id desconhecido: qual registro "aprovado sem número" é o dono, pela
 * `externalReference` (boleto → id do boleto; PIX/saque → id do supplier_payments) e pela conta
 * que consultou. Mais de um = ambíguo = nenhum.
 */
export function candidatoDaReferencia<T extends { id: string; boleto_id?: string | null; payment_account_id: string | null }>(
    candidatos: T[],
    contaId: string,
    externalReference: string | null | undefined,
): T | null {
    if (!externalReference) return null;
    const achados = candidatos.filter(c => c.payment_account_id === contaId
        && (c.id === externalReference || c.boleto_id === externalReference));
    return achados.length === 1 ? achados[0] : null;
}
