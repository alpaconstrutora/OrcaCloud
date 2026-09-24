// utils/blueprintCoberturaOrcamento.ts
//
// QUANTO DA PLANTA JÁ TEM PREÇO (P2.55, 24/09/2026).
//
// ─── A PERGUNTA QUE NINGUÉM RESPONDIA ───────────────────────────────────────
//
// O painel de orçamento tem PREVER e APLICAR: mostra as linhas que saem e as
// divergências que impedem cada uma. O que ele não diz é o contrário — **o que
// a planta mede e não vira linha nenhuma**, porque ninguém mapeou aquela medida
// para um item. Essa parte não aparece como divergência: divergência é
// mapeamento que falhou; aqui nem há mapeamento.
//
// O efeito prático é um total que parece completo. A planta mede 1.240 m² de
// alvenaria e 90 esquadrias; se só o piso está mapeado, o orçamento sai com o
// piso, sem um aviso de que o resto do prédio ficou fora. A P2.49 encontrou a
// mesma classe de silêncio na esquadria sem tipo, e a saída é a mesma: contar e
// dizer.
//
// ─── COBERTURA SE CONTA EM MEDIDA, NÃO EM DINHEIRO ──────────────────────────
//
// ⚠️ "X% do orçamento coberto" seria mentira: não se sabe o preço do que não tem
// item — é exatamente o que falta. O que dá para afirmar é quantas MEDIDAS da
// planta têm de-para com item e preço, e qual é a quantidade medida de cada uma
// que ficou fora. Com isso a pessoa prioriza: 1.240 m² sem item importa mais que
// 3 un sem item, e a lista mostra os dois com a quantidade ao lado.

import { MEDIDA_POR_ID, dimensaoDaUnidade, type Dimensao, type MapeamentoOrcamento } from './blueprintBudget';

export type EstadoDaMedida =
  /** Tem mapeamento ativo, item no catálogo e unidade compatível: vira linha. */
  | 'COM_PRECO'
  /** Ninguém mapeou esta medida para um item. */
  | 'SEM_MAPEAMENTO'
  /** Mapeada, mas o item não foi achado no catálogo. */
  | 'ITEM_AUSENTE'
  /** Mapeada, item existe, mas a unidade dele não casa com a dimensão da medida. */
  | 'UNIDADE_INCOMPATIVEL'
  /** Mapeamento desligado à mão. */
  | 'DESLIGADO';

export interface LinhaDeCobertura {
  medidaId: string;
  rotulo: string;
  dimensao: Dimensao;
  /** Quanto a planta mede disto. `0` = a planta não tem este elemento. */
  quantidade: number;
  estado: EstadoDaMedida;
  itemCode: string;
  /** Preço unitário do catálogo, quando há item. */
  precoUnitario: number | null;
  /** Quantidade × preço, quando dá para calcular. */
  valor: number | null;
}

export interface Cobertura {
  linhas: LinhaDeCobertura[];
  /** Medidas que a planta realmente tem (quantidade > 0). */
  medidasComQuantidade: number;
  /** Destas, quantas viram linha de orçamento. */
  comPreco: number;
  /** A soma do que tem preço. */
  totalEstimado: number;
  /** As que a planta mede e o orçamento ignora, da maior quantidade para a menor. */
  faltando: LinhaDeCobertura[];
}

export interface ItemDoCatalogo {
  code: string;
  unit?: string | null;
  price?: number | null;
}

/**
 * Cruza o que a planta MEDE com o de-para e o catálogo.
 *
 * `medidos` vem de `resumoDasMedidas` (o mesmo `medir` que gera as linhas, para
 * que cobertura e orçamento nunca discordem sobre a quantidade).
 */
export function coberturaDoOrcamento(
  medidos: readonly { medidaId: string; quantidade: number }[],
  mapeamentos: readonly MapeamentoOrcamento[],
  itens: ReadonlyMap<string, ItemDoCatalogo>,
): Cobertura {
  const linhas: LinhaDeCobertura[] = [];

  for (const m of medidos) {
    const def = MEDIDA_POR_ID.get(m.medidaId);
    if (!def) continue;
    // ⚠️ Um mapeamento por medida é o que a tela mostra; havendo mais de um, o
    // ATIVO manda — um desligado ao lado de um ativo não é "desligado".
    const doMapa = mapeamentos.filter((x) => x.medida === m.medidaId);
    const mapeamento = doMapa.find((x) => x.active) ?? doMapa[0] ?? null;
    const item = mapeamento ? itens.get(mapeamento.item_code) ?? null : null;

    let estado: EstadoDaMedida;
    if (!mapeamento) estado = 'SEM_MAPEAMENTO';
    else if (!mapeamento.active) estado = 'DESLIGADO';
    else if (!item) estado = 'ITEM_AUSENTE';
    else if (dimensaoDaUnidade(item.unit) !== def.dimensao) estado = 'UNIDADE_INCOMPATIVEL';
    else estado = 'COM_PRECO';

    const precoUnitario = item?.price ?? null;
    linhas.push({
      medidaId: m.medidaId,
      rotulo: def.rotulo,
      dimensao: def.dimensao,
      quantidade: m.quantidade,
      estado,
      itemCode: mapeamento?.item_code ?? '',
      precoUnitario,
      valor: estado === 'COM_PRECO' && precoUnitario !== null ? m.quantidade * precoUnitario : null,
    });
  }

  const comQuantidade = linhas.filter((l) => l.quantidade > 0);
  return {
    linhas,
    medidasComQuantidade: comQuantidade.length,
    comPreco: comQuantidade.filter((l) => l.estado === 'COM_PRECO').length,
    totalEstimado: comQuantidade.reduce((s, l) => s + (l.valor ?? 0), 0),
    // Ordenar pela quantidade é o que torna a lista acionável: o que tem mais
    // metro quadrado fora do orçamento aparece primeiro. Dimensões diferentes
    // não se comparam em rigor, mas a ordem ainda separa o grande do miúdo.
    faltando: comQuantidade
      .filter((l) => l.estado !== 'COM_PRECO')
      .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo)),
  };
}

/** Como a tela nomeia cada estado. */
export const ROTULO_DO_ESTADO: Record<EstadoDaMedida, string> = {
  COM_PRECO: 'com preço',
  SEM_MAPEAMENTO: 'sem item vinculado',
  ITEM_AUSENTE: 'item fora do catálogo',
  UNIDADE_INCOMPATIVEL: 'unidade incompatível',
  DESLIGADO: 'de-para desligado',
};
