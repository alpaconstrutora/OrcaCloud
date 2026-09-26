// services/blueprintViasService.ts
//
// As VIAS DE PROJETO de um estudo (C2): eixo, passo, PIVs do greide e seção
// tipo. Ida e volta ao Supabase, e só: estacas, seções, volumes e nota de
// serviço são conta pura em `utils/blueprintVias.ts`.

import { supabase } from '../lib/supabase';
import type { BlueprintViaRow } from '../types/blueprint';

const COLS = 'id, study_id, organization_id, nome, via_uid, eixo, passo_m, greide, secao_tipo, topografia_id, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintVias/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export type ViaGravavel = Pick<BlueprintViaRow, 'id' | 'nome' | 'via_uid' | 'eixo' | 'passo_m' | 'greide' | 'secao_tipo' | 'topografia_id'>;

export const blueprintViasService = {
  async list(studyId: string): Promise<BlueprintViaRow[]> {
    const { data, error } = await supabase
      .from('blueprint_study_vias')
      .select(COLS)
      .eq('study_id', studyId)
      .order('created_at', { ascending: true });
    if (error) fail('list', error);
    return (data ?? []) as unknown as BlueprintViaRow[];
  },

  /** Cria ou substitui pelo `id` (gerado no cliente). */
  async save(studyId: string, organizationId: string, via: ViaGravavel): Promise<BlueprintViaRow> {
    const { data, error } = await supabase
      .from('blueprint_study_vias')
      .upsert({ ...via, study_id: studyId, organization_id: organizationId }, { onConflict: 'id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintViaRow;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_vias').delete().eq('id', id);
    if (error) fail('remove', error);
  },
};
