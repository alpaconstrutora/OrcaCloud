// services/blueprintRegularizacaoService.ts
//
// Dados da REURB e do CAR de um estudo: uma linha em
// `blueprint_study_regularizacao`. Ida e volta ao Supabase, e só. Cada
// gravação manda UMA coluna — o upsert só atualiza o que vai no corpo, e as
// duas gavetas gravam sem pisar uma na outra.

import { supabase } from '../lib/supabase';
import type { DadosDaReurb } from '../utils/blueprintReurb';
import type { BiomaDaReservaLegal } from '../utils/blueprintCar';

export interface DadosDoCar {
  bioma?: BiomaDaReservaLegal;
}

export interface RegularizacaoDoEstudo {
  reurb: Partial<DadosDaReurb>;
  car: DadosDoCar;
}

export const blueprintRegularizacaoService = {
  async get(studyId: string): Promise<RegularizacaoDoEstudo | null> {
    const { data, error } = await supabase.from('blueprint_study_regularizacao').select('reurb, car').eq('study_id', studyId).maybeSingle();
    if (error) throw new Error(`blueprintRegularizacao/get: ${error.message}`);
    return data ? { reurb: (data.reurb ?? {}) as Partial<DadosDaReurb>, car: (data.car ?? {}) as DadosDoCar } : null;
  },
  async salvarReurb(studyId: string, organizationId: string, reurb: DadosDaReurb): Promise<void> {
    const { error } = await supabase
      .from('blueprint_study_regularizacao')
      .upsert({ study_id: studyId, organization_id: organizationId, reurb }, { onConflict: 'study_id' });
    if (error) throw new Error(`blueprintRegularizacao/reurb: ${error.message}`);
  },
  async salvarCar(studyId: string, organizationId: string, car: DadosDoCar): Promise<void> {
    const { error } = await supabase
      .from('blueprint_study_regularizacao')
      .upsert({ study_id: studyId, organization_id: organizationId, car }, { onConflict: 'study_id' });
    if (error) throw new Error(`blueprintRegularizacao/car: ${error.message}`);
  },
};
