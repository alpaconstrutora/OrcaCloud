// services/blueprintSigefService.ts
//
// A identificação SIGEF do imóvel (A4): uma linha por estudo em
// `blueprint_study_sigef`. Ida e volta ao Supabase, e só.

import { supabase } from '../lib/supabase';
import { IDENTIFICACAO_VAZIA, type IdentificacaoSigef } from '../utils/geo/sigef';

export const blueprintSigefService = {
  async get(studyId: string): Promise<IdentificacaoSigef | null> {
    const { data, error } = await supabase.from('blueprint_study_sigef').select('identificacao').eq('study_id', studyId).maybeSingle();
    if (error) throw new Error(`blueprintSigef/get: ${error.message}`);
    return data ? { ...IDENTIFICACAO_VAZIA, ...(data.identificacao as Partial<IdentificacaoSigef>) } : null;
  },
  async save(studyId: string, organizationId: string, identificacao: IdentificacaoSigef): Promise<void> {
    const { error } = await supabase
      .from('blueprint_study_sigef')
      .upsert({ study_id: studyId, organization_id: organizationId, identificacao }, { onConflict: 'study_id' });
    if (error) throw new Error(`blueprintSigef/save: ${error.message}`);
  },
};
