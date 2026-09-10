// services/blueprintTopografiaService.ts
//
// As versões de topografia (curvas de nível) de um estudo de Planta Inteligente.
//
// O CÁLCULO não mora aqui: está em `utils/blueprintTopografia.ts`, puro e
// testável sem banco. Aqui há só ida e volta ao Supabase — e nenhuma
// atualização, porque a tabela não concede UPDATE: versão gerada é imutável
// (RN-005). Ver o cabeçalho de `aplicar_20270921000005_blueprint_topografia.sql`.

import { supabase } from '../lib/supabase';
import type { BlueprintTopografiaRow } from '../types/blueprint';

const COLS =
  'id, study_id, organization_id, versao, fonte_codigo, fonte_nome, dataset_versao, ' +
  'resolucao_fonte_m, referencia_vertical, classe_qualidade, grade, equidistancia_m, ' +
  'curvas, estatisticas, pontos_cotados, anel, georreferencia, algoritmo_nome, ' +
  'algoritmo_versao, hash_entrada, hash_resultado, avisos, created_by, created_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintTopografia/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

/** O que se grava: tudo menos o que o banco preenche. */
export type TopografiaInput = Omit<BlueprintTopografiaRow, 'id' | 'created_by' | 'created_at'>;

export const blueprintTopografiaService = {
  /** Todas as versões do estudo, da mais nova para a mais antiga. */
  async listar(studyId: string): Promise<BlueprintTopografiaRow[]> {
    const { data, error } = await supabase
      .from('blueprint_study_topografia')
      .select(COLS)
      .eq('study_id', studyId)
      .order('versao', { ascending: false });

    if (error) fail('listar', error);
    return (data ?? []) as unknown as BlueprintTopografiaRow[];
  },

  /**
   * Grava uma versão nova. `versao` vem de quem chama (máximo conhecido + 1);
   * duas abas gerando ao mesmo tempo estouram o UNIQUE, e o erro chega inteiro
   * — é melhor que uma delas gravar por cima da outra em silêncio.
   */
  async criar(input: TopografiaInput): Promise<BlueprintTopografiaRow> {
    const { data, error } = await supabase
      .from('blueprint_study_topografia')
      .insert(input)
      .select(COLS)
      .single();

    if (error) fail('criar', error);
    return data as unknown as BlueprintTopografiaRow;
  },

  /** Apaga uma versão. A única forma de "editar": gerar outra e apagar esta. */
  async apagar(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_topografia').delete().eq('id', id);
    if (error) fail('apagar', error);
  },
};
