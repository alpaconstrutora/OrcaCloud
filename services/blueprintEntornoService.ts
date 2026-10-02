// services/blueprintEntornoService.ts
//
// O ENTORNO do estudo (M5b) — os vizinhos por divisa, uma linha por estudo,
// JSONB sanitizado na leitura por `vizinhosDaColuna`. Ida e volta ao Supabase,
// e só. Molde: `blueprintProdutoService`.

import { supabase } from '../lib/supabase';
import type { BlueprintEntornoRow } from '../types/blueprint';
import type { VizinhoDoEntorno } from '../utils/blueprintInsolacao';

const COLS = 'id, study_id, organization_id, vizinhos, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintEntorno/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintEntornoService = {
  /** `null` é o estado normal: o estudo ainda não declarou o entorno. */
  async get(studyId: string): Promise<BlueprintEntornoRow | null> {
    const { data, error } = await supabase.from('blueprint_study_entorno').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintEntornoRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, vizinhos: VizinhoDoEntorno[]): Promise<BlueprintEntornoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_entorno')
      .upsert({ study_id: studyId, organization_id: organizationId, vizinhos }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintEntornoRow;
  },
};
