// services/blueprintTerraplenagemService.ts
//
// A premissa de terraplenagem (base, cota do platô e, desde a fase 3, talude,
// empolamento e contração) de um estudo. Ida e volta ao Supabase, e só: a
// conta de corte e aterro está em `utils/blueprintTopografiaAnalises.ts`, pura.

import { supabase } from '../lib/supabase';
import type { BlueprintTerraplenagemRow } from '../types/blueprint';

const COLS =
  'id, study_id, organization_id, base, cota_plato_m, talude_corte_h, talude_aterro_h, ' +
  'empolamento_pct, contracao_pct, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintTerraplenagem/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export type PremissaDeTerraplenagem = Pick<
  BlueprintTerraplenagemRow,
  'base' | 'cota_plato_m' | 'talude_corte_h' | 'talude_aterro_h' | 'empolamento_pct' | 'contracao_pct'
>;

export const blueprintTerraplenagemService = {
  /** `null` é o estado normal: a maioria dos estudos não tem platô. */
  async get(studyId: string): Promise<BlueprintTerraplenagemRow | null> {
    const { data, error } = await supabase
      .from('blueprint_study_terraplenagem')
      .select(COLS)
      .eq('study_id', studyId)
      .maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintTerraplenagemRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`, como a zona urbanística. */
  async save(
    studyId: string,
    organizationId: string,
    premissa: PremissaDeTerraplenagem,
  ): Promise<BlueprintTerraplenagemRow> {
    const { data, error } = await supabase
      .from('blueprint_study_terraplenagem')
      .upsert({ ...premissa, study_id: studyId, organization_id: organizationId }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintTerraplenagemRow;
  },

  async clear(studyId: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_terraplenagem').delete().eq('study_id', studyId);
    if (error) fail('clear', error);
  },
};
