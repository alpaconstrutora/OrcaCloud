import { supabase } from '../lib/supabase';

/**
 * Baixa × alçada (plano docs/planos/2026-10-16-torre-fluxo-financeiro.md, item H.1).
 *
 * Decisão do usuário (17/10/2026): a baixa MANUAL de um título a pagar que ainda
 * está PENDENTE na alçada é recusada — no serviço (a garantia) e no botão (que
 * diz o motivo). A conciliação com o extrato e o Asaas NÃO são bloqueadas: o
 * dinheiro já saiu do banco, e travar o vínculo deixaria o extrato sem par. Esses
 * caminhos ganham o carimbo `pago_sem_alcada_em` (gatilho no banco,
 * `aplicar_20271017400000`), que a Torre e a fila de Aprovações mostram.
 *
 * Só `PENDENTE` trava: título que nunca foi à alçada (`RASCUNHO`/nulo, abaixo do
 * piso, folha, tributo) segue como sempre — a alçada é decidida por faixa de
 * valor em `approvalService.submit`, não aqui.
 */
export const MOTIVO_ALCADA_PENDENTE =
    'Aguardando aprovação na alçada — aprove em Financeiro › Aprovações antes de dar baixa. ' +
    'A conciliação com o extrato continua liberada.';

/** Lança `MOTIVO_ALCADA_PENDENTE` se o título está pendente na alçada. Chamar ANTES de gravar a baixa manual. */
export async function exigirAlcadaLiberada(internalTransactionId: string): Promise<void> {
    const { data, error } = await supabase
        .from('internal_transactions')
        .select('id, approval_status')
        .eq('id', internalTransactionId)
        .maybeSingle();
    if (error) throw new Error(`Não foi possível conferir a alçada do título: ${error.message}`);
    if ((data as { approval_status?: string | null } | null)?.approval_status === 'PENDENTE') {
        throw new Error(MOTIVO_ALCADA_PENDENTE);
    }
}

/**
 * Ids dos títulos a pagar ABERTOS e pendentes na alçada — para a tela desligar o
 * botão de baixa com o motivo. São poucos (fila de aprovação), por isso uma
 * consulta à parte em vez de pôr `approval_status` na `vw_payables`.
 * Org nula = "Todas" (a RLS recorta) — REGRA #5.
 */
export async function idsComAlcadaPendente(organizationId: string | null): Promise<Set<string>> {
    let q = supabase
        .from('internal_transactions')
        .select('id')
        .eq('direction', 'DEBIT')
        .eq('status', 'PENDING')
        .eq('approval_status', 'PENDENTE');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) { console.warn('[alcadaDaBaixa] pendentes:', error.message); return new Set(); }
    return new Set(((data ?? []) as { id: string }[]).map(r => r.id));
}

/** Ids dos títulos pagos com a alçada ainda pendente (carimbo do banco) — para a fila marcar "Pago sem aprovação". */
export async function idsPagosSemAlcada(organizationId: string | null): Promise<Set<string>> {
    let q = supabase
        .from('internal_transactions')
        .select('id')
        .not('pago_sem_alcada_em', 'is', null)
        .eq('approval_status', 'PENDENTE');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) { console.warn('[alcadaDaBaixa] pagos sem alçada:', error.message); return new Set(); }
    return new Set(((data ?? []) as { id: string }[]).map(r => r.id));
}
