// services/blueprintMedicaoService.ts
//
// Formas medidas: persistência e a ponte para o orçamento.
//
// O cálculo NÃO mora aqui — está em `utils/blueprintMedicoes.ts`, puro e
// testável. Aqui há ida e volta ao banco e a montagem da linha de orçamento.

import { supabase } from '../lib/supabase';
import type { BudgetEntry, SinapiItem } from '../types/budget';
import {
  codigoDeItemAvulso,
  medir,
  perimetroM,
  temDestinoNoOrcamento,
  type FormaMedida,
  type TipoMedida,
} from '../utils/blueprintMedicoes';
import { SinapiType } from '../types/budget';
import { prefixoDoEstudo } from '../utils/blueprintBudget';
import type { Point } from '../utils/blueprintKernel';

const COLS =
  'id, study_id, organization_id, level_id, underlay_id, tipo, pontos, nome, ' +
  'item_code, item_nome, item_preco, camada, cor, created_at, updated_at';

export interface MedicaoRow {
  id: string;
  study_id: string;
  organization_id: string;
  level_id: string | null;
  tipo: TipoMedida;
  pontos: Point[];
  nome: string;
  item_code: string | null;
  item_nome: string | null;
  item_preco: number | null;
  underlay_id: string | null;
  camada: string;
  cor: string;
  created_at: string;
  updated_at: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintMedicao/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export function formaDaLinha(r: MedicaoRow): FormaMedida {
  return {
    id: r.id,
    tipo: r.tipo,
    pontos: r.pontos,
    nome: r.nome,
    itemCode: r.item_code,
    itemNome: r.item_nome,
    itemPreco: r.item_preco,
    underlayId: r.underlay_id,
    camada: r.camada || 'Geral',
    cor: r.cor,
  };
}

export async function listarMedicoes(
  studyId: string,
  levelId: string | null,
): Promise<MedicaoRow[]> {
  let q = supabase
    .from('blueprint_measurements')
    .select(COLS)
    .eq('study_id', studyId)
    .order('created_at', { ascending: true });

  if (levelId) q = q.eq('level_id', levelId);

  const { data, error } = await q;
  if (error) fail('listarMedicoes', error);
  return (data ?? []) as unknown as MedicaoRow[];
}

export interface SalvarMedicao {
  id?: string;
  study_id: string;
  organization_id: string;
  level_id: string | null;
  forma: FormaMedida;
}

export async function salvarMedicao(e: SalvarMedicao): Promise<MedicaoRow> {
  const linha = {
    study_id: e.study_id,
    organization_id: e.organization_id,
    level_id: e.level_id,
    tipo: e.forma.tipo,
    pontos: e.forma.pontos,
    nome: e.forma.nome,
    item_code: e.forma.itemCode ?? null,
    item_nome: e.forma.itemNome ?? null,
    item_preco: e.forma.itemPreco ?? null,
    underlay_id: e.forma.underlayId ?? null,
    camada: e.forma.camada || 'Geral',
    cor: e.forma.cor,
    updated_at: new Date().toISOString(),
  };

  const query = e.id
    ? supabase.from('blueprint_measurements').update(linha).eq('id', e.id)
    : supabase.from('blueprint_measurements').insert(linha);

  const { data, error } = await query.select(COLS).single();
  if (error) fail('salvarMedicao', error);
  return data as unknown as MedicaoRow;
}

export async function removerMedicao(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_measurements').delete().eq('id', id);
  if (error) fail('removerMedicao', error);
}

/**
 * Regrava várias formas de uma vez.
 *
 * Existe para a recalibração: corrigir a escala transforma TODAS as formas, e
 * gravar uma a uma deixaria o desenho metade numa escala e metade noutra se a
 * rede caísse no meio.
 */
export async function regravarPontos(
  formas: { id: string; pontos: Point[] }[],
): Promise<void> {
  for (const f of formas) {
    const { error } = await supabase
      .from('blueprint_measurements')
      .update({ pontos: f.pontos, updated_at: new Date().toISOString() })
      .eq('id', f.id);
    if (error) fail('regravarPontos', error);
  }
}

export interface ContextoMedicao {
  studyId: string;
  studyName: string;
  /** Da planta de fundo, quando houver: prova sobre o que foi traçado. */
  underlaySha256?: string | null;
  mmPorPixel?: number | null;
}

/**
 * Linhas de orçamento a partir das formas medidas.
 *
 * MARCADAS COMO **MEDIDO**, contra o DERIVADO que vem da geometria. É a razão
 * de ter empilhado as duas camadas em vez de fundi-las: quem revisa o orçamento
 * precisa saber quais números pode recalcular e quais dependem da mão de
 * alguém. Hoje, no Medição Inteligente, essa informação não existe em lugar
 * nenhum.
 *
 * O id é determinístico e usa o mesmo prefixo por estudo do quantitativo
 * derivado, então `aplicarNoOrcamento` substitui os dois de uma vez e regerar
 * nunca duplica.
 */
export function lancamentosDeMedicao(
  formas: FormaMedida[],
  itens: Map<string, SinapiItem>,
  ctx: ContextoMedicao,
): { entries: BudgetEntry[]; semItem: FormaMedida[]; semCatalogo: FormaMedida[] } {
  const entries: BudgetEntry[] = [];
  const semItemLigado: FormaMedida[] = [];
  const semCatalogo: FormaMedida[] = [];

  const procedencia =
    `MEDIDO à mão sobre a planta de fundo de "${ctx.studyName}"` +
    (ctx.mmPorPixel ? `, escala aferida em ${ctx.mmPorPixel.toFixed(2)} mm por pixel` : '') +
    (ctx.underlaySha256 ? ` (documento ${ctx.underlaySha256.slice(0, 12)})` : '') +
    '. NÃO é derivado da geometria — não pode ser recalculado sem retraçar.';

  for (const f of formas) {
    if (!temDestinoNoOrcamento(f)) {
      semItemLigado.push(f);
      continue;
    }

    const m = medir(f);

    // Item do catálogo, ou ARBITRADO pela pessoa. O segundo é a lacuna que o
    // Medição cobria: "Demolição de alvenaria, R$ 45/m²" não existe no SINAPI.
    let item: SinapiItem | undefined;
    if (f.itemCode) {
      item = itens.get(f.itemCode);
      if (!item) {
        semCatalogo.push(f);
        continue;
      }
    } else {
      item = {
        // Código DERIVADO DO NOME, nunca aleatório: o `MED-{4 dígitos}` do
        // Medição muda a cada exportação, o casamento falha e a linha duplica.
        code: codigoDeItemAvulso(f.itemNome!),
        description: f.itemNome!.trim(),
        unit: m.unidade === 'M2' ? 'm²' : m.unidade === 'M' ? 'm' : 'un',
        price: f.itemPreco ?? 0,
        type: SinapiType.INPUT,
        category: 'Medido na planta',
        source: 'Própria',
      };
    }

    const perimetro = perimetroM(f);

    entries.push({
      id: `bp:${ctx.studyId}:med:${f.id}`,
      sinapiItem: item,
      quantity: m.valor,
      phase: '',
      group: 'Medido na planta',
      discipline: 'Planta Inteligente',
      location: { room: f.nome || undefined },
      notes: procedencia,
      calculationMemory: {
        formula: m.formula,
        variables: {
          origem: 'MEDIDO',
          forma: f.tipo,
          vertices: f.pontos.length,
          ...(perimetro !== null ? { perimetroM: perimetro } : {}),
        },
        result: m.valor,
        justification: procedencia,
      },
    });
  }

  return { entries, semItem: semItemLigado, semCatalogo };
}

export { prefixoDoEstudo };
