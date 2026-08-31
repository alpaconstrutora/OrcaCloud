import { supabase } from '../lib/supabase';
import { generateDocumentNumber } from './documentNumbering';

/**
 * "Regerar número" de uma Proposta do CRM de Serviços já existente
 * (`services_proposals.proposal_number`). Mesmo raciocínio de
 * `contractNumberRegenService.ts`, adaptado para `services_proposals`
 * (migration `aplicar_20270918000002_services_proposal_number_history.sql`).
 *
 * Só ORGANIZACAO é suportado como variável para este doc_type — ver
 * `services/documentNumbering/catalog.ts` e o comentário de
 * `20270912000004_services_numbering_triggers.sql` sobre a limitação de
 * schema do CRM (services_opportunities não tem client_id/cost_center_id).
 *
 * Trava: `status <> 'draft'` — uma vez enviada ao cliente, o número já está
 * na cópia dele.
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getServicesProposalNumberLockReason(proposalId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_services_proposal_number_lock_reason', {
        p_proposal_id: proposalId,
    });
    if (error) throw new Error(`Falha ao verificar se o número pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

export async function regenerateServicesProposalNumber(
    proposalId: string,
    organizationId: string,
): Promise<string> {
    const bloqueio = await getServicesProposalNumberLockReason(proposalId);
    if (bloqueio) throw new Error(bloqueio);

    const novo = await generateDocumentNumber('SERVICE_PROPOSAL', organizationId, {});

    const { data, error } = await supabase.rpc('fn_regenerate_services_proposal_number', {
        p_proposal_id: proposalId,
        p_new_number: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface ServicesProposalNumberHistoryEntry {
    id: string;
    old_number: string | null;
    new_number: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listServicesProposalNumberHistory(proposalId: string): Promise<ServicesProposalNumberHistoryEntry[]> {
    const { data, error } = await supabase
        .from('services_proposal_number_history')
        .select('id, old_number, new_number, changed_by, changed_at')
        .eq('proposal_id', proposalId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ServicesProposalNumberHistoryEntry[];
}
