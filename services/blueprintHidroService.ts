// services/blueprintHidroService.ts
//
// As PREMISSAS hidrossanitárias de um estudo (E3.3, 29/09/2026) — uma linha por
// estudo, JSONB parcial `{ agua, pressao, esgoto }` completado com o padrão na
// leitura. Ida e volta ao Supabase, e só. Mesmo desenho de `blueprintEletricaService`.

import { supabase } from '../lib/supabase';
import type { BlueprintHidroRow } from '../types/blueprint';
import type { HipotesesHidro } from '../utils/blueprintMemorialHidro';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintHidro/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintHidroService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas premissas. */
  async get(studyId: string): Promise<BlueprintHidroRow | null> {
    const { data, error } = await supabase.from('blueprint_study_hidro').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintHidroRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: HipotesesHidro): Promise<BlueprintHidroRow> {
    const { data, error } = await supabase
      .from('blueprint_study_hidro')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintHidroRow;
  },
};
