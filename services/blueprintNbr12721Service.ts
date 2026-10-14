// services/blueprintNbr12721Service.ts
//
// As HIPÓTESES NBR 12721 do estudo (Fase 4.2 do plano
// docs/planos/2026-10-13-areas-nbr12721-na-planta.md) — uma linha por estudo,
// JSONB sanitizado na leitura por `hipotesesNbr12721DaColuna`. Ida e volta ao
// Supabase, e só: o cálculo está em `utils/nbr12721/` e a montagem da entrada
// em `utils/blueprintNbr12721.ts`. Molde: `blueprintProdutoService`.
//
// A organização gravada é a DO ESTUDO (quem chama passa `study.organization_id`),
// nunca a do seletor do topo — a linha pertence ao estudo (REGRA #5).

import { supabase } from '../lib/supabase';
import type { BlueprintNbr12721Row } from '../types/blueprint';
import { hipotesesNbr12721DaColuna, type HipotesesNbr12721 } from '../utils/blueprintNbr12721';

const COLS = 'id, study_id, organization_id, hipoteses, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintNbr12721/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintNbr12721Service = {
  /** As hipóteses do estudo, já sanitizadas; sem linha = as padrão (estado normal de um estudo novo). */
  async get(studyId: string): Promise<HipotesesNbr12721> {
    const { data, error } = await supabase.from('blueprint_study_nbr12721').select(COLS).eq('study_id', studyId).maybeSingle();
    if (error) fail('get', error);
    return hipotesesNbr12721DaColuna((data as BlueprintNbr12721Row | null)?.hipoteses ?? null);
  },

  /** Cria ou substitui — UNIQUE em `study_id`. Grava o que a leitura devolveria (sanitizado). */
  async save(studyId: string, organizationId: string, hipoteses: HipotesesNbr12721): Promise<HipotesesNbr12721> {
    const limpas = hipotesesNbr12721DaColuna(hipoteses);
    const { data, error } = await supabase
      .from('blueprint_study_nbr12721')
      .upsert({ study_id: studyId, organization_id: organizationId, hipoteses: limpas }, { onConflict: 'study_id' })
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return hipotesesNbr12721DaColuna((data as unknown as BlueprintNbr12721Row).hipoteses);
  },
};
