// services/blueprintIncendioService.ts
//
// As PREMISSAS de incêndio de um estudo (E0.1 do roadmap de incêndio,
// 30/09/2026) — uma linha por estudo, JSONB parcial completado com o padrão na
// leitura. Ida e volta ao Supabase, e só. Mesmo desenho de `blueprintHidroService`.

import { supabase } from '../lib/supabase';
import type { BlueprintIncendioRow } from '../types/blueprint';
import type { HipotesesIncendio } from '../utils/blueprintIncendioClassificacao';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintIncendio/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintIncendioService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas premissas. */
  async get(studyId: string): Promise<BlueprintIncendioRow | null> {
    const { data, error } = await supabase.from('blueprint_study_incendio').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintIncendioRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: HipotesesIncendio): Promise<BlueprintIncendioRow> {
    const { data, error } = await supabase
      .from('blueprint_study_incendio')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintIncendioRow;
  },
};
