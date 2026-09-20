/**
 * Permissões por estudo (20/09/2026, E10.1): papel LEITOR/EDITOR por e-mail.
 * Sem linha = EDITOR. A tabela é configuração da organização (RLS de membro);
 * a RESTRIÇÃO do leitor está em policies RESTRICTIVE no banco — a tela só
 * espelha (trava os comandos e diz por quê).
 */
import { supabase } from '../lib/supabase';
import type { PapelNoEstudo, PermissaoDoEstudo } from '../utils/blueprintColaboracao';

export interface PermissaoGravada extends PermissaoDoEstudo {
  id: string;
  organizationId: string;
  createdAt: string;
}

const COLS = 'id, study_id, organization_id, email, papel, created_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintStudyPermission/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): PermissaoGravada {
  return { id: String(r.id), studyId: String(r.study_id), organizationId: String(r.organization_id), email: String(r.email), papel: r.papel as PapelNoEstudo, createdAt: String(r.created_at) };
}

export const blueprintStudyPermissionService = {
  async list(studyId: string): Promise<PermissaoGravada[]> {
    const { data, error } = await supabase.from('blueprint_study_permissions').select(COLS).eq('study_id', studyId).order('email');
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  /** Define o papel de um e-mail no estudo (cria ou atualiza). */
  async definir(studyId: string, organizationId: string, email: string, papel: PapelNoEstudo): Promise<PermissaoGravada> {
    const { data, error } = await supabase
      .from('blueprint_study_permissions')
      .upsert({ study_id: studyId, organization_id: organizationId, email: email.trim().toLowerCase(), papel }, { onConflict: 'study_id,email' })
      .select(COLS)
      .single();
    if (error) fail('definir', error);
    return mapear(data as Record<string, unknown>);
  },

  /** Remove a linha: volta ao padrão (EDITOR). */
  async remover(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_permissions').delete().eq('id', id);
    if (error) fail('remover', error);
  },
};
