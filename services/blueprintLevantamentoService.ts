// services/blueprintLevantamentoService.ts
//
// O LEVANTAMENTO EM EDIÇÃO de um estudo (A2): pontos com nome, código e
// descrição, e as linhas de quebra. Uma linha por estudo, mutável. Ida e
// volta ao Supabase, e só: feições, duplicados e exportações são conta pura
// em `utils/blueprintFeicoes.ts`.

import { supabase } from '../lib/supabase';
import type { BlueprintLevantamentoRow } from '../types/blueprint';

const COLS = 'id, study_id, organization_id, pontos, linhas_de_quebra, hash_pontos, origem, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintLevantamento/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export type LevantamentoGravavel = Pick<BlueprintLevantamentoRow, 'pontos' | 'linhas_de_quebra' | 'hash_pontos' | 'origem'>;

export const blueprintLevantamentoService = {
  /** `null` é o estado normal de estudo sem levantamento. */
  async get(studyId: string): Promise<BlueprintLevantamentoRow | null> {
    const { data, error } = await supabase.from('blueprint_study_levantamento').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintLevantamentoRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, lev: LevantamentoGravavel): Promise<BlueprintLevantamentoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_levantamento')
      .upsert({ ...lev, study_id: studyId, organization_id: organizationId }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintLevantamentoRow;
  },
};
