// services/blueprintSnapshotNbr12721Service.ts
//
// Os Quadros NBR 12721 congelados em cada versão publicada e as aprovações
// técnica e jurídica (Fase 7 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md).
// A tabela do quadro é imutável e some com a versão; a das aprovações só
// acrescenta, e só pela RPC `aprovar_nbr12721_da_versao`, que confere dentro
// do banco: membro da organização da versão, quadro sem pendência
// bloqueante, jurídica depois da técnica, nada repetido. Molde:
// `blueprintSnapshotProdutoService`.

import { supabase } from '../lib/supabase';
import type { QuadroCongelado } from '../utils/blueprintNbr12721';

export type TipoDeAprovacaoNbr12721 = 'TECNICA' | 'JURIDICA';

export interface QuadroDaVersao {
  snapshotId: string;
  hash: string;
  status: 'success' | 'failed';
  versaoMotor: string;
  congeladoEm: string;
}

export interface AprovacaoNbr12721 {
  id: string;
  tipo: TipoDeAprovacaoNbr12721;
  hash: string;
  observacao: string | null;
  aprovadoPor: string;
  aprovadoEm: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintSnapshotNbr12721/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintSnapshotNbr12721Service = {
  /** Grava o quadro logo depois de publicar. Idempotente: já existe → nada muda (a tabela é imutável). */
  async congelar(snapshotId: string, studyId: string, organizationId: string, q: QuadroCongelado): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('blueprint_snapshot_nbr12721').upsert(
      {
        snapshot_id: snapshotId,
        study_id: studyId,
        organization_id: organizationId,
        entrada: q.entrada,
        saida: q.saida,
        hash: q.hash,
        versao_motor: q.versaoMotor,
        created_by: user?.user?.id ?? null,
      },
      { onConflict: 'snapshot_id', ignoreDuplicates: true },
    );
    if (error) fail('congelar', error);
  },

  /** O quadro congelado na versão (sem a entrada/saída inteiras); `null` = versão sem quadro. */
  async daVersao(snapshotId: string): Promise<QuadroDaVersao | null> {
    const { data, error } = await supabase
      .from('blueprint_snapshot_nbr12721')
      .select('snapshot_id, hash, versao_motor, created_at, status:saida->>status')
      .eq('snapshot_id', snapshotId)
      .maybeSingle();
    if (error) fail('daVersao', error);
    if (!data) return null;
    const d = data as unknown as { snapshot_id: string; hash: string; versao_motor: string; created_at: string; status: string };
    return { snapshotId: d.snapshot_id, hash: d.hash, status: d.status === 'success' ? 'success' : 'failed', versaoMotor: d.versao_motor, congeladoEm: d.created_at };
  },

  /** A saída inteira congelada (para exportar o documento da versão). */
  async saidaDaVersao(snapshotId: string): Promise<QuadroCongelado['saida'] | null> {
    const { data, error } = await supabase.from('blueprint_snapshot_nbr12721').select('saida').eq('snapshot_id', snapshotId).maybeSingle();
    if (error) fail('saidaDaVersao', error);
    return ((data as { saida?: QuadroCongelado['saida'] } | null)?.saida ?? null) as QuadroCongelado['saida'] | null;
  },

  async aprovacoes(snapshotId: string): Promise<AprovacaoNbr12721[]> {
    const { data, error } = await supabase
      .from('blueprint_snapshot_nbr12721_aprovacoes')
      .select('id, tipo, hash, observacao, aprovado_por, aprovado_em')
      .eq('snapshot_id', snapshotId)
      .order('aprovado_em');
    if (error) fail('aprovacoes', error);
    return ((data ?? []) as { id: string; tipo: TipoDeAprovacaoNbr12721; hash: string; observacao: string | null; aprovado_por: string; aprovado_em: string }[]).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      hash: a.hash,
      observacao: a.observacao,
      aprovadoPor: a.aprovado_por,
      aprovadoEm: a.aprovado_em,
    }));
  },

  /**
   * Nome de quem aprovou, lido de `organization_members` (a RLS já limita aos
   * colegas das organizações de quem lê). Sem nome cadastrado vale o e-mail;
   * quem não aparece fica fora do mapa e a tela mostra o id curto.
   */
  async nomesDeQuemAprovou(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    const nomes = new Map<string, string>();
    if (!ids.length) return nomes;
    const { data, error } = await supabase.from('organization_members').select('user_id, name, email').in('user_id', ids);
    if (error) fail('nomesDeQuemAprovou', error);
    for (const m of (data ?? []) as { user_id: string; name: string | null; email: string | null }[]) {
      const nome = m.name?.trim() || m.email?.trim();
      if (nome && !nomes.has(m.user_id)) nomes.set(m.user_id, nome);
    }
    return nomes;
  },

  /** Aprova pela RPC — é ela que confere organização, pendência e ordem; o erro do banco sobe com o motivo. */
  async aprovar(snapshotId: string, tipo: TipoDeAprovacaoNbr12721, observacao: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('aprovar_nbr12721_da_versao', { p_snapshot_id: snapshotId, p_tipo: tipo, p_observacao: observacao });
    if (error) fail('aprovar', error);
    return data as string;
  },
};
