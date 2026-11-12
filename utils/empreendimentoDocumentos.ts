// utils/empreendimentoDocumentos.ts
// Regras puras do checklist de documentos legais do empreendimento.
// Testes: __tests__/empreendimentoDocumentos.test.ts
import {
  TIPOS_DOCUMENTO_LEGAL, SITUACAO_ROTULO,
  type DocumentoLegal, type DocumentoLegalInsert, type TipoDocumentoLegal,
} from '../types/empreendimentoDocumentos';

/** Data local de hoje em `YYYY-MM-DD` — nunca `toISOString()`, que é UTC e vira o dia à noite. */
export function hojeISO(agora: Date = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}

/**
 * Dias de `de` até `ate` (datas puras `YYYY-MM-DD`). Conta em UTC dos dois lados,
 * então horário de verão e fuso não entram na conta. Negativo = já passou.
 */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export type TomSituacao = 'vencido' | 'vencendo' | 'ok' | 'neutro' | 'dispensado';

export interface SituacaoExibida {
  rotulo: string;
  tom: TomSituacao;
  /** Dias até vencer (negativo = vencido). Só existe quando há validade. */
  dias: number | null;
}

/**
 * O que a coluna "Situação" mostra. A situação GRAVADA é o andamento do
 * processo; o vencimento sai da validade, na leitura — gravar "Vencido" ficaria
 * velho no dia seguinte.
 *
 * - Dispensado ignora a validade (não se cobra o que não é exigido).
 * - Com validade: passou → "Vencido há N d"; dentro do alerta → "Vence em N d".
 * - Sem validade, ou longe dela: o rótulo do andamento.
 */
export function situacaoExibida(
  doc: Pick<DocumentoLegal, 'situacao' | 'data_validade' | 'alerta_dias_antecedencia'>,
  hoje: string = hojeISO(),
): SituacaoExibida {
  if (doc.situacao === 'DISPENSADO') return { rotulo: SITUACAO_ROTULO.DISPENSADO, tom: 'dispensado', dias: null };

  if (doc.data_validade) {
    const dias = diasEntre(hoje, doc.data_validade);
    if (dias < 0) return { rotulo: dias === -1 ? 'Vencido há 1 dia' : `Vencido há ${-dias} dias`, tom: 'vencido', dias };
    if (dias <= Math.max(0, doc.alerta_dias_antecedencia ?? 30)) {
      const rotulo = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`;
      return { rotulo, tom: 'vencendo', dias };
    }
    if (doc.situacao === 'EMITIDO') return { rotulo: SITUACAO_ROTULO.EMITIDO, tom: 'ok', dias };
    return { rotulo: SITUACAO_ROTULO[doc.situacao], tom: 'neutro', dias };
  }

  return {
    rotulo: SITUACAO_ROTULO[doc.situacao],
    tom: doc.situacao === 'EMITIDO' ? 'ok' : 'neutro',
    dias: null,
  };
}

/** Classe de texto do §8 do guia (texto colorido, sem pílula). */
export const COR_DO_TOM: Record<TomSituacao, string> = {
  vencido: 'text-red-700',
  vencendo: 'text-amber-700',
  ok: 'text-emerald-700',
  neutro: 'text-gray-700',
  dispensado: 'text-gray-500',
};

/**
 * Itens da lista padrão que ainda faltam neste empreendimento. Idempotente:
 * rodar de novo com o resultado aplicado devolve []. OUTRO nunca entra.
 */
export function faltantesDaListaPadrao(
  existentes: Pick<DocumentoLegal, 'tipo'>[],
  base: { organization_id: string; empreendimento_id: string },
): DocumentoLegalInsert[] {
  const tem = new Set<TipoDocumentoLegal>(existentes.map(d => d.tipo));
  return TIPOS_DOCUMENTO_LEGAL
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !tem.has(t.tipo))
    .map(({ t, i }) => ({
      organization_id: base.organization_id,
      empreendimento_id: base.empreendimento_id,
      tipo: t.tipo,
      titulo: t.rotulo,
      numero: null,
      orgao_emissor: t.orgao ?? null,
      protocolo: null,
      data_protocolo: null,
      data_emissao: null,
      data_validade: null,
      alerta_dias_antecedencia: 30,
      situacao: 'PENDENTE',
      obrigatorio: true,
      responsavel: null,
      observacoes: null,
      document_id: null,
      storage_path: null,
      sort_order: (i + 1) * 10,
    }));
}

/** Números dos KPIs da aba — da MESMA função que pinta a coluna Situação. */
export function resumoDoChecklist(docs: DocumentoLegal[], hoje: string = hojeISO()) {
  const exigidos = docs.filter(d => d.obrigatorio && d.situacao !== 'DISPENSADO');
  let vencidos = 0;
  let vencendo = 0;
  for (const d of docs) {
    const s = situacaoExibida(d, hoje);
    if (s.tom === 'vencido') vencidos++;
    else if (s.tom === 'vencendo') vencendo++;
  }
  return {
    exigidos: exigidos.length,
    emitidosExigidos: exigidos.filter(d => d.situacao === 'EMITIDO').length,
    pendentes: docs.filter(d => d.situacao === 'PENDENTE' || d.situacao === 'EM_ANDAMENTO').length,
    vencidos,
    vencendo,
  };
}
