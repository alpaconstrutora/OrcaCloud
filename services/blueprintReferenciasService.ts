// services/blueprintReferenciasService.ts
//
// As REFERÊNCIAS EXTERNAS do 3D de um estudo (10/10/2026, pendência da E10.4b
// do roadmap de climatização) — uma linha por estudo, a lista em JSONB, lida
// sem confiança pelo cliente (`lerReferencias`). Ida e volta ao Supabase, e só.
// Mesmo desenho de `blueprintClimatizacaoService`.

import { supabase } from '../lib/supabase';
import type { BlueprintReferenciasRow } from '../types/blueprint';
import type { ReferenciaExterna } from '../utils/blueprintReferenciaExterna';

const COLS = 'id, study_id, organization_id, referencias, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintReferencias/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintReferenciasService = {
  /** `null` é o estado normal: o estudo nunca teve referência. */
  async get(studyId: string): Promise<BlueprintReferenciasRow | null> {
    const { data, error } = await supabase.from('blueprint_study_referencias').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintReferenciasRow | null) ?? null;
  },

  /** Cria ou substitui a lista inteira — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, referencias: ReferenciaExterna[]): Promise<BlueprintReferenciasRow> {
    const { data, error } = await supabase
      .from('blueprint_study_referencias')
      .upsert({ study_id: studyId, organization_id: organizationId, referencias }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintReferenciasRow;
  },
};
