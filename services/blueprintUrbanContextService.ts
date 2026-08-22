// services/blueprintUrbanContextService.ts
//
// A zona do Mapa Regulatório que vale para um estudo de Planta Inteligente.
//
// A TRADUÇÃO da zona (texto da lei → número) não mora aqui: está em
// `utils/blueprintZonaUrbanistica.ts`, pura e testável sem banco. Aqui há só ida
// e volta ao Supabase.
//
// ⚠️ Esta tabela é deliberadamente separada do payload canônico do desenho — ver
// o cabeçalho da migration `aplicar_20270914000000_blueprint_study_urban_context.sql`.

import { supabase } from '../lib/supabase';
import type { BlueprintUrbanContext } from '../types/blueprint';

const COLS =
  'id, study_id, organization_id, empreendimento_id, regulatory_zone_id, ' +
  'zona_rotulo, lei_referencia, zona_origem, regulatory_map_id, '  +
  'recuo_frente_mm, recuo_fundos_mm, ' +
  'recuo_lateral_direita_mm, recuo_lateral_esquerda_mm, taxa_ocupacao_max, ' +
  'taxa_permeabilidade_min, coeficiente_max, gabarito_altura_max_m, ' +
  'gabarito_pavimentos, origem_valores, aplicado_em, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintUrbanContext/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

/** O que se grava. Tudo opcional: o usuário pode ter só ajustado um recuo. */
export type UrbanContextInput = Partial<
  Omit<
    BlueprintUrbanContext,
    'id' | 'study_id' | 'organization_id' | 'created_at' | 'updated_at'
  >
>;

export const blueprintUrbanContextService = {
  /**
   * O contexto do estudo, ou `null` se nunca foi definido.
   *
   * `maybeSingle` e não `single`: estudo sem zona aplicada é o estado NORMAL —
   * a maioria dos desenhos não tem. `single` transformaria isso em erro 406 e a
   * tela abriria com faixa vermelha por nada.
   */
  async get(studyId: string): Promise<BlueprintUrbanContext | null> {
    const { data, error } = await supabase
      .from('blueprint_study_urban_context')
      .select(COLS)
      .eq('study_id', studyId)
      .maybeSingle();

    if (error) fail('get', error);
    return (data as BlueprintUrbanContext | null) ?? null;
  },

  /**
   * Grava o contexto do estudo, criando ou substituindo.
   *
   * `upsert` com `onConflict: 'study_id'` em vez de select-depois-insert: a
   * tabela tem UNIQUE em `study_id`, e duas abas abertas no mesmo estudo fariam
   * a segunda estourar violação de unicidade num caminho que o usuário
   * enxergaria como "não salvou".
   */
  async save(
    studyId: string,
    organizationId: string,
    contexto: UrbanContextInput,
  ): Promise<BlueprintUrbanContext> {
    const { data, error } = await supabase
      .from('blueprint_study_urban_context')
      .upsert(
        { ...contexto, study_id: studyId, organization_id: organizationId },
        { onConflict: 'study_id' },
      )
      .select(COLS)
      .single();

    if (error) fail('save', error);
    // `as unknown as` porque o tipo inferido do upsert com `select` encadeado é
    // uma união que inclui o erro genérico do PostgREST — o `if (error)` acima
    // já eliminou esse caminho, mas o TypeScript não acompanha por aqui.
    return data as unknown as BlueprintUrbanContext;
  },

  /** Desliga o estudo da zona. Volta ao estado de digitar tudo à mão. */
  async clear(studyId: string): Promise<void> {
    const { error } = await supabase
      .from('blueprint_study_urban_context')
      .delete()
      .eq('study_id', studyId);

    if (error) fail('clear', error);
  },
};
