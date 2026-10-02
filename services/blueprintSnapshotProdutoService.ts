// services/blueprintSnapshotProdutoService.ts
//
// O PRODUTO do Estudo de Massa congelado em cada versão publicada (M4). O
// produto vivo mora em `blueprint_study_produto`; ao publicar, a cópia vem para
// cá, amarrada ao snapshot. Imutável; some com o snapshot. Molde:
// `blueprintSnapshotTopografiaService`.

import { supabase } from '../lib/supabase';
import type { Produto } from '../utils/blueprintProduto';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintSnapshotProduto/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintSnapshotProdutoService = {
  /** Grava a cópia logo depois de publicar. Idempotente: já existe → nada muda (a tabela é imutável). */
  async congelar(snapshotId: string, studyId: string, organizationId: string, produto: Produto): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('blueprint_snapshot_produto')
      .upsert({ snapshot_id: snapshotId, study_id: studyId, organization_id: organizationId, produto, created_by: user?.user?.id ?? null }, { onConflict: 'snapshot_id', ignoreDuplicates: true });
    if (error) fail('congelar', error);
  },

  /** O produto congelado numa versão; `null` = versão publicada antes da M4 (ou sem produto). */
  async daVersao(snapshotId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.from('blueprint_snapshot_produto').select('produto').eq('snapshot_id', snapshotId).maybeSingle();
    if (error) fail('daVersao', error);
    return ((data as { produto?: Record<string, unknown> } | null)?.produto ?? null) as Record<string, unknown> | null;
  },
};
