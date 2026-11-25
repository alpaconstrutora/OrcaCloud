// services/blueprintTerraplenagemService.ts
//
// A premissa de terraplenagem de um estudo: base e cota do platô, talude,
// empolamento e contração (fase 3), banqueta, via de serviço, talude por
// aresta e a linha desenhada do perfil (fase 4). Ida e volta ao Supabase, e
// só: a conta está em `utils/blueprintTopografiaAnalises.ts`, pura.

import { supabase } from '../lib/supabase';
import type { BlueprintTerraplenagemRow } from '../types/blueprint';

const COLS =
  'id, study_id, organization_id, base, anel_plato, anel_desenhado, cota_plato_m, inclinacao_long_pct, inclinacao_transv_pct, inclinacao_azimute_deg, ' +
  'talude_corte_h, talude_aterro_h, ' +
  'empolamento_pct, contracao_pct, altura_do_lance_m, largura_da_banqueta_m, largura_da_via_m, ' +
  'talude_por_aresta, perfil_polilinha, drenagem, caimento_min_pct, hidraulica, estrutura, created_at, updated_at';

/**
 * Banco ANTIGO (25/11/2026): antes da migration `aplicar_20271125100000` a coluna `anel_desenhado` não existe
 * (Postgres 42703). Ler e gravar repetem SEM ela — o deploy não pode depender da ordem com a migration, senão a
 * terraplenagem de todos os estudos cai em "persistência indisponível".
 */
const COLS_SEM_DESENHO = COLS.replace(' anel_desenhado,', '');
const semAColunaNova = (error: { code?: string; message: string } | null) =>
  !!error && (error.code === '42703' || /anel_desenhado/.test(error.message));

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintTerraplenagem/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export type PremissaDeTerraplenagem = Pick<
  BlueprintTerraplenagemRow,
  | 'base'
  | 'anel_plato'
  | 'anel_desenhado'
  | 'cota_plato_m'
  | 'inclinacao_long_pct'
  | 'inclinacao_transv_pct'
  | 'inclinacao_azimute_deg'
  | 'talude_corte_h'
  | 'talude_aterro_h'
  | 'empolamento_pct'
  | 'contracao_pct'
  | 'altura_do_lance_m'
  | 'largura_da_banqueta_m'
  | 'largura_da_via_m'
  | 'talude_por_aresta'
  | 'perfil_polilinha'
  | 'drenagem'
  | 'caimento_min_pct'
  | 'hidraulica'
  | 'estrutura'
>;

export const blueprintTerraplenagemService = {
  /** `null` é o estado normal: a maioria dos estudos não tem platô. */
  async get(studyId: string): Promise<BlueprintTerraplenagemRow | null> {
    let { data, error } = await supabase
      .from('blueprint_study_terraplenagem')
      .select(COLS)
      .eq('study_id', studyId)
      .maybeSingle();
    if (semAColunaNova(error)) {
      ({ data, error } = await supabase.from('blueprint_study_terraplenagem').select(COLS_SEM_DESENHO).eq('study_id', studyId).maybeSingle());
    }
    if (error) fail('get', error);
    return (data as BlueprintTerraplenagemRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`, como a zona urbanística. */
  async save(
    studyId: string,
    organizationId: string,
    premissa: PremissaDeTerraplenagem,
  ): Promise<BlueprintTerraplenagemRow> {
    let { data, error } = await supabase
      .from('blueprint_study_terraplenagem')
      .upsert({ ...premissa, study_id: studyId, organization_id: organizationId }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (semAColunaNova(error)) {
      // Sem a coluna, o desenho não tem onde ficar: grava o resto (a base DESENHADO, se for o caso, o CHECK antigo
      // recusa — e o erro sobe, como antes).
      const { anel_desenhado: _semColuna, ...resto } = premissa;
      ({ data, error } = await supabase
        .from('blueprint_study_terraplenagem')
        .upsert({ ...resto, study_id: studyId, organization_id: organizationId }, { onConflict: 'study_id' })
        .select(COLS_SEM_DESENHO)
        .single());
    }
    if (error) fail('save', error);
    return data as unknown as BlueprintTerraplenagemRow;
  },

  async clear(studyId: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_terraplenagem').delete().eq('study_id', studyId);
    if (error) fail('clear', error);
  },
};
