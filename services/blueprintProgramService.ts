// services/blueprintProgramService.ts
//
// O PROGRAMA DE NECESSIDADES de um estudo (E4.1) — uma linha por estudo, JSONB
// sanitizado na leitura por `programaDaColuna`. Ida e volta ao Supabase, e só:
// itens, relações e resumo estão em `utils/blueprintPrograma.ts`. Mesmo
// desenho de `blueprintArmaduraService`.

import { supabase } from '../lib/supabase';
import type { BlueprintProgramRow } from '../types/blueprint';
import type { Programa } from '../utils/blueprintPrograma';

const COLS = 'id, study_id, organization_id, nome, programa, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintProgram/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintProgramService = {
  /** `null` é o estado normal: o estudo ainda não tem programa. */
  async get(studyId: string): Promise<BlueprintProgramRow | null> {
    const { data, error } = await supabase.from('blueprint_programs').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintProgramRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, programa: Programa): Promise<BlueprintProgramRow> {
    const { data, error } = await supabase
      .from('blueprint_programs')
      .upsert({ study_id: studyId, organization_id: organizationId, nome: programa.nome, programa }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintProgramRow;
  },

  async remove(studyId: string): Promise<void> {
    const { error } = await supabase.from('blueprint_programs').delete().eq('study_id', studyId);
    if (error) fail('remove', error);
  },
};
