// services/blueprintClimatizacaoService.ts
//
// As PREMISSAS de climatização de um estudo (E0.1 do roadmap de climatização,
// 04/10/2026) — uma linha por estudo, JSONB parcial completado com o padrão na
// leitura. Ida e volta ao Supabase, e só. Mesmo desenho de `blueprintIncendioService`.

import { supabase } from '../lib/supabase';
import type { BlueprintClimatizacaoRow } from '../types/blueprint';
import type { HipotesesClimatizacao } from '../utils/blueprintClimatizacao';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintClimatizacao/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintClimatizacaoService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas premissas. */
  async get(studyId: string): Promise<BlueprintClimatizacaoRow | null> {
    const { data, error } = await supabase.from('blueprint_study_climatizacao').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintClimatizacaoRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: HipotesesClimatizacao): Promise<BlueprintClimatizacaoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_climatizacao')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintClimatizacaoRow;
  },
};
