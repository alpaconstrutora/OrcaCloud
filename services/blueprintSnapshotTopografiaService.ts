// services/blueprintSnapshotTopografiaService.ts
//
// O vínculo entre uma versão publicada do estudo (snapshot) e a versão de
// topografia que estava em uso. A topografia fica FORA do payload canônico —
// o hash do desenho não muda com dado do mundo — e este registro é o que dá a
// rastreabilidade: "a versão 3 foi publicada sobre a topografia v2, hash …".
// Imutável; some com o snapshot.

import { supabase } from '../lib/supabase';
import type { BlueprintSnapshotTopografiaRow, BlueprintTopografiaRow } from '../types/blueprint';

const COLS = 'snapshot_id, organization_id, study_id, topografia_id, versao, fonte_codigo, hash_resultado, created_by, created_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintSnapshotTopografia/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintSnapshotTopografiaService = {
  /** Grava o vínculo logo depois de publicar. Idempotente: já existe → devolve o existente. */
  async vincular(snapshotId: string, topografia: BlueprintTopografiaRow): Promise<BlueprintSnapshotTopografiaRow> {
    const { data: user } = await supabase.auth.getUser();
    const linha = {
      snapshot_id: snapshotId,
      organization_id: topografia.organization_id,
      study_id: topografia.study_id,
      topografia_id: topografia.id,
      versao: topografia.versao,
      fonte_codigo: topografia.fonte_codigo,
      hash_resultado: topografia.hash_resultado,
      created_by: user?.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from('blueprint_snapshot_topografia')
      .upsert(linha, { onConflict: 'snapshot_id', ignoreDuplicates: true })
      .select(COLS)
      .maybeSingle();
    if (error) fail('vincular', error);
    if (data) return data as BlueprintSnapshotTopografiaRow;
    // `ignoreDuplicates` não devolve a linha existente: busca.
    const { data: existente, error: e2 } = await supabase
      .from('blueprint_snapshot_topografia')
      .select(COLS)
      .eq('snapshot_id', snapshotId)
      .maybeSingle();
    if (e2) fail('vincular/ler', e2);
    return existente as BlueprintSnapshotTopografiaRow;
  },

  /** Os vínculos de todas as versões de um estudo, por snapshot. */
  async porEstudo(studyId: string): Promise<Record<string, BlueprintSnapshotTopografiaRow>> {
    const { data, error } = await supabase.from('blueprint_snapshot_topografia').select(COLS).eq('study_id', studyId);
    if (error) fail('porEstudo', error);
    const saida: Record<string, BlueprintSnapshotTopografiaRow> = {};
    for (const r of (data ?? []) as BlueprintSnapshotTopografiaRow[]) saida[r.snapshot_id] = r;
    return saida;
  },
};
