/**
 * Situação de uma parcela de contrato no Portal do Parceiro e na visão do
 * gestor (PartnerWorkspaceManager) — o MESMO predicado dos dois lados, para a
 * mesma parcela nunca aparecer "Paga" num e "Pendente" no outro.
 *
 * O payload de `partner_ws_financials` não traz o `effective_status` de
 * vw_payables, então a leitura é por `status` + `business_status`.
 *
 * Até 28/09/2026 a regra era `business_status === 'PAGO' || status !== 'PENDING'`
 * — e CANCELLED não é PENDING: parcela CANCELADA aparecia "Pago" para o
 * parceiro e somava no "pago" do gestor. Em 28/09/2026 os status reais das
 * parcelas de contrato eram só PENDING, CONCILIATED e CANCELLED; a regra nova
 * dá o mesmo resultado da antiga em tudo, exceto nas canceladas.
 * Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md (Fase 2).
 */
export type SituacaoParcela = 'PAGA' | 'CANCELADA' | 'ABERTA';

export function situacaoDaParcela(t: { status: string; business_status: string | null }): SituacaoParcela {
    if (t.status === 'CANCELLED' || t.business_status === 'CANCELADO') return 'CANCELADA';
    if (t.status === 'CONCILIATED' || t.business_status === 'PAGO') return 'PAGA';
    return 'ABERTA';
}
