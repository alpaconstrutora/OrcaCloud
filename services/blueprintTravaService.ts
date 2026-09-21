/**
 * TRAVAS EXPLÍCITAS (21/09/2026, backlog P2 "lock fino"): `blueprint_element_locks`
 * por ramo. Só cadastro; quem bloqueia o comando é `bloqueioDasTravas` no editor,
 * e quem avisa os outros é o canal Realtime do ramo (evento `travas`).
 */
import { supabase } from '../lib/supabase';
import type { EscopoDeTrava, TravaExplicita } from '../utils/blueprintColaboracao';

const COLS = 'id, branch_id, escopo, alvos, holder_user_id, holder_email, holder_nome, nota, created_at, expires_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintTrava/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): TravaExplicita {
  return {
    id: String(r.id),
    branchId: String(r.branch_id),
    escopo: String(r.escopo) as EscopoDeTrava,
    alvos: (Array.isArray(r.alvos) ? r.alvos : []).map(String),
    holderUserId: String(r.holder_user_id),
    holderEmail: String(r.holder_email ?? ''),
    holderNome: String(r.holder_nome ?? ''),
    nota: String(r.nota ?? ''),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
}

export interface NovaTrava {
  branchId: string;
  organizationId: string;
  escopo: EscopoDeTrava;
  alvos: string[];
  holderUserId: string;
  holderEmail: string;
  holderNome: string;
  nota: string;
  validadeHoras: number;
}

export const blueprintTravaService = {
  /** As travas do ramo, vencidas incluídas (quem filtra é `travasVigentes`). */
  async list(branchId: string): Promise<TravaExplicita[]> {
    const { data, error } = await supabase.from('blueprint_element_locks').select(COLS).eq('branch_id', branchId).order('created_at');
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  async criar(t: NovaTrava): Promise<TravaExplicita> {
    const expires = new Date(Date.now() + Math.max(1, t.validadeHoras) * 3_600_000).toISOString();
    const { data, error } = await supabase
      .from('blueprint_element_locks')
      .insert({ branch_id: t.branchId, organization_id: t.organizationId, escopo: t.escopo, alvos: t.alvos, holder_user_id: t.holderUserId, holder_email: t.holderEmail, holder_nome: t.holderNome, nota: t.nota.trim().slice(0, 200), expires_at: expires })
      .select(COLS)
      .single();
    if (error) fail('criar', error);
    return mapear(data as Record<string, unknown>);
  },

  /** Solta (a própria) ou força a liberação (a de outra pessoa) — a RLS deixa qualquer membro apagar. */
  async soltar(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_element_locks').delete().eq('id', id);
    if (error) fail('soltar', error);
  },
};
