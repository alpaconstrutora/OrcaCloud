// services/blueprintApprovalService.ts
//
// Aprovação de uma REVISÃO PUBLICADA da Planta Inteligente (Etapa 5).
//
// ─── POR QUE É UM WRAPPER FINO, E NÃO UM FLUXO NOVO ─────────────────────────
//
// `approvalService` se declara "primitiva ÚNICA de aprovação" e já serve
// transação, contrato, compra e passo de processo. Um segundo fluxo daria duas
// filas de ação, dois vocabulários de status e duas telas — e a segunda seria a
// pior. Aqui só se injeta o que a planta tem de diferente: ela não vale
// dinheiro.
//
// ⚠️ `amount: 0` e `organizationId` EXPLÍCITOS, sempre. É o que o próprio
// `approvalService` manda fazer para entidade não monetária, e é o que impede
// `submit` de tentar ler uma coluna de valor que `blueprint_snapshots` não tem.
//
// ─── O QUE SE APROVA É O SNAPSHOT ───────────────────────────────────────────
//
// E não o estudo. O snapshot é imutável e carrega o hash, então o carimbo diz
// exatamente O QUE foi aprovado. Um estado de revisão no estudo congelaria o
// desenho inteiro enquanto uma revisão está sob análise — e organização nunca
// bloqueia trabalho.

import { approvalService } from './approvalService';
import { supabase } from '../lib/supabase';
import type { ApprovalStep } from '../types/financial';

/** O carimbo de uma revisão, como o IFC e o PDF o mostram. */
export interface CarimboDeAprovacao {
  status: string;
  /** Quem aprovou o último nível, e quando. `null` enquanto não houver. */
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  /** O hash da revisão aprovada — é ele que diz O QUE foi aprovado. */
  hash: string;
  revisao: number;
}

export const blueprintApprovalService = {
  /**
   * Manda a revisão para a fila.
   *
   * `semFaixa: 'exigir1'` é o certo aqui: sem faixa configurada a planta ainda
   * assim precisa de alguém dizendo "aprovado". Liberar sozinha faria o carimbo
   * afirmar uma aprovação que ninguém deu.
   */
  async enviarParaAprovacao(snapshotId: string, organizationId: string) {
    return approvalService.submit('blueprint_snapshot', snapshotId, {}, {
      organizationId,
      amount: 0,
      semFaixa: 'exigir1',
    });
  },

  async aprovar(
    snapshotId: string,
    level: 1 | 2,
    aprovadoPor: string,
    labels: { level1_label: string; level2_label?: string },
    notas?: string,
  ) {
    return approvalService.approve('blueprint_snapshot', snapshotId, level, aprovadoPor, labels, notas);
  },

  async rejeitar(snapshotId: string, rejeitadoPor: string, motivo: string) {
    return approvalService.reject('blueprint_snapshot', snapshotId, rejeitadoPor, motivo);
  },

  /**
   * O carimbo de uma revisão. `null` quando ela nunca entrou na fila.
   *
   * Sem `select('*')`: o snapshot carrega o payload inteiro do desenho, e
   * trazê-lo para ler três colunas seria megabytes por consulta.
   */
  async carimbo(snapshotId: string): Promise<CarimboDeAprovacao | null> {
    const { data, error } = await supabase
      .from('blueprint_snapshots')
      .select('approval_status, approval_chain, hash, revision')
      .eq('id', snapshotId)
      .single();
    if (error) throw error;
    if (!data?.approval_status) return null;

    const cadeia = ((data.approval_chain ?? []) as ApprovalStep[]).filter(
      (p) => p.action === 'APROVADO',
    );
    const ultimo = cadeia[cadeia.length - 1] ?? null;
    return {
      status: data.approval_status as string,
      aprovadoPor: ultimo?.approved_by ?? null,
      aprovadoEm: ultimo?.approved_at ?? null,
      hash: data.hash as string,
      revisao: data.revision as number,
    };
  },
};
