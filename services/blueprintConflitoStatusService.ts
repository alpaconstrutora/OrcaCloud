/**
 * Aceites de conflito (20/09/2026, P2.1): a ida e volta a
 * `blueprint_conflict_acceptances`. A regra (o que conta como aberto, quando o
 * aceite caduca) vive em `utils/blueprintConflitoStatus.ts`.
 */
import { supabase } from '../lib/supabase';
import type { AceiteDeConflito } from '../utils/blueprintConflitoStatus';

const COLS = 'id, study_id, chave, classe, medida_mm, justificativa, accepted_email, created_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintConflitoStatus/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): AceiteDeConflito {
  return {
    id: String(r.id),
    studyId: String(r.study_id),
    chave: String(r.chave),
    classe: String(r.classe),
    medidaMm: Number(r.medida_mm ?? 0),
    justificativa: String(r.justificativa),
    acceptedEmail: (r.accepted_email as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export const blueprintConflitoStatusService = {
  async list(studyId: string): Promise<AceiteDeConflito[]> {
    const { data, error } = await supabase.from('blueprint_conflict_acceptances').select(COLS).eq('study_id', studyId).order('created_at');
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  /** Aceita (ou re-aceita, com a medida nova) um par. */
  async aceitar(e: { studyId: string; organizationId: string; chave: string; classe: string; medidaMm: number; justificativa: string }): Promise<AceiteDeConflito> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('blueprint_conflict_acceptances')
      .upsert(
        {
          study_id: e.studyId,
          organization_id: e.organizationId,
          chave: e.chave,
          classe: e.classe,
          medida_mm: Math.max(0, Math.round(e.medidaMm)),
          justificativa: e.justificativa.trim(),
          accepted_by: auth.user?.id ?? null,
          accepted_email: auth.user?.email ?? null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'study_id,chave' },
      )
      .select(COLS)
      .single();
    if (error) fail('aceitar', error);
    return mapear(data as Record<string, unknown>);
  },

  /** Reabre: apaga a decisão; o conflito volta a contar. */
  async reabrir(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_conflict_acceptances').delete().eq('id', id);
    if (error) fail('reabrir', error);
  },
};
