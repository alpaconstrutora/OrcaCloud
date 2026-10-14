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
import type { QuadroCongelado, UnidadeCongelada } from '../utils/blueprintNbr12721';
import type { UnidadeDoEmpreendimentoParaVincular } from '../utils/nbr12721/vinculos';
import { empreendimentoAuditService } from './empreendimentoAuditService';

export type TipoDeAprovacaoNbr12721 = 'TECNICA' | 'JURIDICA';

export interface QuadroDaVersao {
  snapshotId: string;
  studyId: string;
  /** A organização da versão — é por ela que a permissão `canEditAreaEngine` vale. */
  organizationId: string;
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
        unidades: q.unidades,
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
      .select('snapshot_id, study_id, organization_id, hash, versao_motor, created_at, status:saida->>status')
      .eq('snapshot_id', snapshotId)
      .maybeSingle();
    if (error) fail('daVersao', error);
    if (!data) return null;
    const d = data as unknown as { snapshot_id: string; study_id: string; organization_id: string; hash: string; versao_motor: string; created_at: string; status: string };
    return { snapshotId: d.snapshot_id, studyId: d.study_id, organizationId: d.organization_id, hash: d.hash, status: d.status === 'success' ? 'success' : 'failed', versaoMotor: d.versao_motor, congeladoEm: d.created_at };
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

  // ── Fase 9: a fração da versão aprovada de volta ao Empreendimento ──────────

  /** Código ↔ chave ↔ número congelados na versão (vazio = versão anterior à Fase 9: publique de novo). */
  async unidadesDaVersao(snapshotId: string): Promise<UnidadeCongelada[]> {
    const { data, error } = await supabase.from('blueprint_snapshot_nbr12721').select('unidades').eq('snapshot_id', snapshotId).maybeSingle();
    if (error) fail('unidadesDaVersao', error);
    return ((data as { unidades?: UnidadeCongelada[] } | null)?.unidades ?? []) as UnidadeCongelada[];
  },

  /** O Empreendimento ligado ao estudo (`empreendimentos.blueprint_study_id`); `null` = estudo solto. */
  async empreendimentoDoEstudo(studyId: string): Promise<{ id: string; name: string; organizationId: string } | null> {
    const { data, error } = await supabase.from('empreendimentos').select('id, name, organization_id').eq('blueprint_study_id', studyId).limit(1).maybeSingle();
    if (error) fail('empreendimentoDoEstudo', error);
    const e = data as { id: string; name: string; organization_id: string } | null;
    return e ? { id: e.id, name: e.name, organizationId: e.organization_id } : null;
  },

  /** As unidades do Empreendimento (todas as torres), com a chave e a origem da fração. */
  async unidadesDoEmpreendimento(empreendimentoId: string): Promise<(UnidadeDoEmpreendimentoParaVincular & { torre: string; milesimos: number | null })[]> {
    const { data, error } = await supabase
      .from('empreendimento_units')
      .select('id, name, blueprint_unidade_chave, fracao_ideal_origem, fracao_ideal_thousandths, empreendimento_towers!inner(empreendimento_id, name, sort_order)')
      .eq('empreendimento_towers.empreendimento_id', empreendimentoId);
    if (error) fail('unidadesDoEmpreendimento', error);
    type Linha = { id: string; name: string; blueprint_unidade_chave: string | null; fracao_ideal_origem: 'MOTOR' | 'CONVENCAO' | null; fracao_ideal_thousandths: number | null; empreendimento_towers: { name: string; sort_order: number | null } };
    return ((data ?? []) as unknown as Linha[])
      .map((u) => ({
        id: u.id,
        nome: u.name,
        chave: u.blueprint_unidade_chave,
        origem: u.fracao_ideal_origem,
        torre: u.empreendimento_towers?.name ?? '',
        ordemDaTorre: u.empreendimento_towers?.sort_order ?? 0,
        milesimos: u.fracao_ideal_thousandths == null ? null : Number(u.fracao_ideal_thousandths),
      }))
      .sort((a, b) => a.ordemDaTorre - b.ordemDaTorre || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
      .map(({ ordemDaTorre: _o, ...u }) => u);
  },

  /**
   * Devolve a fração pela RPC `devolver_nbr12721_ao_empreendimento` — é ela que
   * confere membro, estudo ligado, aprovação técnica E jurídica e cada par, e
   * grava tudo numa transação. Registra o evento no histórico do Empreendimento.
   */
  async devolverAoEmpreendimento(
    snapshotId: string,
    empreendimento: { id: string; organizationId: string },
    pares: { unit_id: string; chave: string | null }[],
  ): Promise<RelatorioDaDevolucao> {
    const { data, error } = await supabase.rpc('devolver_nbr12721_ao_empreendimento', { p_snapshot_id: snapshotId, p_empreendimento_id: empreendimento.id, p_pares: pares });
    if (error) fail('devolverAoEmpreendimento', error);
    const r = data as RelatorioDaDevolucao;
    await empreendimentoAuditService.record({
      empreendimentoId: empreendimento.id,
      organizationId: empreendimento.organizationId,
      entityType: 'unit',
      entityLabel: `Frações NBR 12721 da versão ${r.revisao} da Planta`,
      action: 'sync',
      metadata: { snapshotId, ...r },
      source: 'sync_blueprint',
    });
    return r;
  },

  /** Aprova pela RPC — é ela que confere organização, pendência e ordem; o erro do banco sobe com o motivo. */
  async aprovar(snapshotId: string, tipo: TipoDeAprovacaoNbr12721, observacao: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('aprovar_nbr12721_da_versao', { p_snapshot_id: snapshotId, p_tipo: tipo, p_observacao: observacao });
    if (error) fail('aprovar', error);
    return data as string;
  },
};

export interface RelatorioDaDevolucao {
  revisao: number;
  /** Unidades ligadas a uma unidade da Planta depois da devolução. */
  vinculos: number;
  /** Frações gravadas (origem MOTOR). */
  gravadas: number;
  /** Ligadas, mas com fração de CONVENÇÃO — a fração não foi tocada. */
  convencao: string[];
  /** Ligadas a uma unidade sem fração (não autônoma). */
  semFracao: string[];
}
