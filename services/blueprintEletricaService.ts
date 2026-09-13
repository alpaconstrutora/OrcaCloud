// services/blueprintEletricaService.ts
//
// As HIPÓTESES do pré-dimensionamento elétrico de um estudo — uma linha por
// estudo, JSONB parcial completado com o padrão na leitura. Ida e volta ao
// Supabase, e só: a conta está em `utils/blueprintEletricaDimensionamento.ts`.
// Mesmo desenho de `blueprintTerraplenagemService`.

import { supabase } from '../lib/supabase';
import type { BlueprintEletricaRow } from '../types/blueprint';
import type { HipotesesEletricas } from '../utils/blueprintEletricaDimensionamento';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintEletrica/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintEletricaService = {
  /** `null` é o estado normal: o estudo nunca mexeu nas hipóteses. */
  async get(studyId: string): Promise<BlueprintEletricaRow | null> {
    const { data, error } = await supabase
      .from('blueprint_study_eletrica')
      .select(COLS)
      .eq('study_id', studyId)
      .maybeSingle();
    if (error) fail('get', error);
    return (data as BlueprintEletricaRow | null) ?? null;
  },

  /** Cria ou substitui — UNIQUE em `study_id`. */
  async save(studyId: string, organizationId: string, hipoteses: Partial<HipotesesEletricas>): Promise<BlueprintEletricaRow> {
    const { data, error } = await supabase
      .from('blueprint_study_eletrica')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return data as unknown as BlueprintEletricaRow;
  },
};
