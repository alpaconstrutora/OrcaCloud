// services/blueprintArmaduraService.ts
//
// As HIPÓTESES da armadura esquemática de um estudo — uma linha por estudo,
// JSONB parcial completado com o padrão na leitura. Ida e volta ao Supabase, e
// só: a conta está em `utils/blueprintArmadura.ts`. Mesmo desenho de
// `blueprintEletricaService`.

import { supabase } from '../lib/supabase';
import type { BlueprintArmaduraRow } from '../types/blueprint';
import type { HipotesesDeArmadura } from '../utils/blueprintArmadura';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintArmadura/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintArmaduraService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas hipóteses. */
  async get(studyId: string): Promise<BlueprintArmaduraRow | null> {
    const { data, error } = await supabase
      .from('blueprint_study_armadura')
      .select(COLS)
      .eq('study_id', studyId)
      .maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintArmaduraRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: Partial<HipotesesDeArmadura>): Promise<BlueprintArmaduraRow> {
    const { data, error } = await supabase
      .from('blueprint_study_armadura')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintArmaduraRow;
  },
};
