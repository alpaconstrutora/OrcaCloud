import { supabase } from '../lib/supabase';
import { motivoParaNaoPagar, MOTIVO_ALCADA_PENDENTE, MOTIVO_ALCADA_REJEITADA } from '../utils/situacaoAprovacaoTitulo';

/**
 * Baixa × alçada (plano docs/planos/2026-10-16-torre-fluxo-financeiro.md, item H.1).
 *
 * Decisão do usuário (17/10/2026): a baixa MANUAL de um título a pagar que ainda
 * está PENDENTE na alçada é recusada — no serviço (a garantia) e no botão (que
 * diz o motivo). A conciliação com o extrato NÃO é bloqueada: o dinheiro já saiu
 * do banco, e travar o vínculo deixaria o extrato sem par. Esse caminho ganha o
 * carimbo `pago_sem_alcada_em` (gatilho no banco, `aplicar_20271017400000`), que
 * a Torre e a fila de Aprovações mostram.
 *
 * 26/10/2026 (plano 2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao): todo
 * título a pagar nasce PENDENTE; REJEITADO ("Bloqueado") também trava, e o PIX
 * pela Asaas passou a ser recusado (botão + Edge Function `asaas-payment`). A
 * regra e os textos moram em `utils/situacaoAprovacaoTitulo.ts`.
 */
export { MOTIVO_ALCADA_PENDENTE, MOTIVO_ALCADA_REJEITADA };

/** Lança o motivo se o título está pendente ou rejeitado na alçada. Chamar ANTES de gravar a baixa manual. */
export async function exigirAlcadaLiberada(internalTransactionId: string): Promise<void> {
    const { data, error } = await supabase
        .from('internal_transactions')
        .select('id, approval_status')
        .eq('id', internalTransactionId)
        .maybeSingle();
    if (error) throw new Error(`Não foi possível conferir a alçada do título: ${error.message}`);
    const motivo = motivoParaNaoPagar((data as { approval_status?: string | null } | null)?.approval_status);
    if (motivo) throw new Error(motivo);
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
