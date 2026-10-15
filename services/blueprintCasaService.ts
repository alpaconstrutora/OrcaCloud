// services/blueprintCasaService.ts
//
// As PREMISSAS da casa automática de um estudo (F10 da casa automática,
// 15/10/2026) — uma linha por estudo, JSONB parcial completado com o padrão na
// leitura. Ida e volta ao Supabase, e só. Mesmo desenho de `blueprintClimatizacaoService`.

import { supabase } from '../lib/supabase';
import type { BlueprintCasaRow } from '../types/blueprint';
import type { PremissasDaCasa } from '../utils/blueprintPremissasDaCasa';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintCasa/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintCasaService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas premissas da casa. */
  async get(studyId: string): Promise<BlueprintCasaRow | null> {
    const { data, error } = await supabase.from('blueprint_study_casa').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintCasaRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: PremissasDaCasa): Promise<BlueprintCasaRow> {
    const { data, error } = await supabase
      .from('blueprint_study_casa')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintCasaRow;
  },
};
