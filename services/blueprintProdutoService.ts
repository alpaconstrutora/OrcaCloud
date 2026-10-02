// services/blueprintProdutoService.ts
//
// O PRODUTO do Estudo de Massa (M2) — uma linha por estudo, JSONB sanitizado na
// leitura por `produtoDaColuna`. Ida e volta ao Supabase, e só: tipologias, mix
// e distribuição estão em `utils/blueprintProduto.ts`. Molde:
// `blueprintProgramService`.

import { supabase } from '../lib/supabase';
import type { BlueprintProdutoRow } from '../types/blueprint';
import type { Produto } from '../utils/blueprintProduto';

const COLS = 'id, study_id, organization_id, produto, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintProduto/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintProdutoService = {
  /** `null` é o estado normal: o estudo ainda não tem produto. */
  async get(studyId: string): Promise<BlueprintProdutoRow | null> {
    const { data, error } = await supabase.from('blueprint_study_produto').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintProdutoRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, produto: Produto): Promise<BlueprintProdutoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_produto')
      .upsert({ study_id: studyId, organization_id: organizationId, produto }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintProdutoRow;
  },
};
