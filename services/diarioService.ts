import { supabase } from '../lib/supabase';

export interface JournalEntry {
  journal_entry_id: string;
  organization_id: string;
  project_id: string | null;
  entry_date: string;
  description: string;
  source_system: string | null;
  reference_id: string | null;
  debit_amount: number | null;
  debit_account: string | null;
  debit_group: string | null;
  credit_amount: number | null;
  credit_account: string | null;
  credit_group: string | null;
  status: string | null;
  created_at: string | null;
}

export interface JournalEntryPair {
  journalEntryId: string;
  organizationId: string;
  projectId: string | null;
  entryDate: string;
  description: string;
  sourceSystem: string | null;
  referenceId: string | null;
  debitAmount: number;
  debitAccount: string;
  debitGroup: string;
  creditAmount: number;
  creditAccount: string;
  creditGroup: string;
  status: string;
  createdAt: string;
}

function toJournalEntryPair(row: JournalEntry): JournalEntryPair {
  return {
    journalEntryId: row.journal_entry_id,
    organizationId: row.organization_id,
    projectId:      row.project_id,
    entryDate:      row.entry_date,
    description:    row.description,
    sourceSystem:   row.source_system,
    referenceId:    row.reference_id,
    debitAmount:    row.debit_amount  ?? 0,
    debitAccount:   row.debit_account ?? 'Material',
    debitGroup:     row.debit_group   ?? 'CUSTO_OBRA',
    creditAmount:   row.credit_amount  ?? 0,
    creditAccount:  row.credit_account ?? 'Fornecedores a Pagar',
    creditGroup:    row.credit_group   ?? 'PASSIVO',
    status:         row.status    ?? 'PENDING',
    createdAt:      row.created_at ?? '',
  };
}

/** Linhas por requisição — o teto do PostgREST (guia §6.7). */
const PAGINA = 1000;

/**
 * Todos os lançamentos do recorte, em páginas de 1000.
 *
 * Até 14/11/2026 havia `.limit(200)`: a tela mostrava "Total Débitos/Créditos"
 * somando só as 200 primeiras linhas, sem avisar (guia §6.7: "nunca .limit(N)
 * fixo"). Ordem com desempate por `journal_entry_id` — sem ele as páginas podem
 * repetir ou pular linhas.
 */
export async function listJournalEntries(
  organizationId: string | null,
  opts?: { dateFrom?: string; dateTo?: string; projectId?: string }
): Promise<JournalEntryPair[]> {
  const todas: JournalEntry[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase
      .from('vw_journal_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('journal_entry_id', { ascending: true })
      .range(desde, desde + PAGINA - 1);

    if (organizationId) q = q.eq('organization_id', organizationId);

    if (opts?.dateFrom) q = q.gte('entry_date', opts.dateFrom);
    if (opts?.dateTo)   q = q.lte('entry_date', opts.dateTo);
    if (opts?.projectId) q = q.eq('project_id', opts.projectId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as JournalEntry[];
    todas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return todas.map(toJournalEntryPair);
}

export async function getJournalEntryByReference(
  referenceId: string
): Promise<JournalEntryPair | null> {
  const { data, error } = await supabase
    .from('vw_journal_entries')
    .select('*')
    .eq('reference_id', referenceId)
    .maybeSingle<JournalEntry>();

  if (error || !data) return null;
  return toJournalEntryPair(data);
}
