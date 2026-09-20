// utils/blueprintCompras.ts
//
// PLANTA → COMPRAS (20/09/2026, roadmap E10.3) — o último elo da cadeia
// "planta → quantitativo → orçamento → cronograma → compras".
//
// ─── O QUE ESTE MÓDULO FAZ, E O QUE NÃO FAZ ──────────────────────────────────
//
// Recebe as linhas de orçamento que a planta gera (`bp:<estudo>:…`, ver
// `blueprintBudget.ts`) e as EXPLODE em insumos compráveis: composição ×
// quantidade, só material e equipamento (mão de obra não se compra no
// Suprimentos; subcomposição já veio aberta pelo catálogo). Agrupa por insumo,
// data cada um pelo CRONOGRAMA da obra quando a tarefa da linha tem data (a
// ponte 4D: a tarefa tem o MESMO id da linha) e aplica o prazo de entrega do
// fornecedor. O resultado são linhas prontas para `procurement_plan_items` — a
// mesma tabela que o motor do Plano de Aquisições alimenta, com a MESMA
// semântica de colunas, para que a tela do plano, a cotação e o pedido não
// saibam de onde veio.
//
// Não decide preço (vem do catálogo, como no orçamento) nem grava nada: quem
// vai ao banco é `services/blueprintComprasService.ts`. Aqui é puro e testável.
//
// ─── A ORIGEM É A LINHA DA PLANTA ────────────────────────────────────────────
//
//   source_budget_item_id = bp:<estudo>:compras:<chave do insumo>
//
// O prefixo `bp:<estudo>:` é o que permite REGERAR sem empilhar: os itens
// pendentes desta planta na obra são substituídos, os que já viraram cotação ou
// pedido ficam (mesma política de `procurementService.generatePlan`). As linhas
// da planta que compõem cada insumo vão em `notes`, uma por linha, com a
// quantidade que cada uma contribuiu — é a memória de cálculo do comprador.

import { SinapiCategory, SinapiType, type BudgetEntry } from '../types/budget';

/** Uma linha da planta que contribuiu para um insumo, e com quanto. */
export interface OrigemDoInsumo {
  /** `bp:<estudo>:…` — a linha de orçamento; também o id da tarefa no cronograma. */
  linhaId: string;
  descricao: string;
  /** Quantidade do INSUMO que esta linha pede (já multiplicada). */
  quantidade: number;
}

export interface InsumoDaPlanta {
  /** Código do insumo (SINAPI, próprio ou interno da biblioteca); `null` quando o catálogo só deu descrição. */
  codigo: string | null;
  /** Chave de agrupamento: o código, ou a descrição normalizada quando não há código. */
  chave: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  /** `true` quando a própria linha da planta é o insumo (item de catálogo sem composição, tipo INSUMO). */
  direto: boolean;
  origens: OrigemDoInsumo[];
}

export interface LinhaSemComposicao {
  linhaId: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface ExplosaoDeInsumos {
  insumos: InsumoDaPlanta[];
  /** Linhas que não explodem: composição/serviço sem componentes no catálogo. Ficam de fora e a tela diz. */
  semComposicao: LinhaSemComposicao[];
  /** Linhas cuja composição só tem mão de obra — nada a comprar. */
  soMaoDeObra: number;
}

const arred = (v: number, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;

function chaveDaDescricao(descricao: string): string {
  return `desc:${descricao.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function ehMaoDeObra(categoria: string | undefined): boolean {
  return categoria === SinapiCategory.MAO_DE_OBRA || categoria === 'Mão de Obra';
}

/**
 * Explode as linhas da planta em insumos.
 *
 * Regras, na ordem:
 *   1. Linha com composição → cada componente que não é mão de obra nem
 *      subcomposição vira insumo, com quantidade = coeficiente × quantidade da linha.
 *   2. Linha SEM composição cujo item é INSUMO (porta pronta, louça, material da
 *      biblioteca) → a própria linha é o insumo (`direto`).
 *   3. Linha sem composição de outro tipo → `semComposicao` (não se inventa insumo).
 *
 * Determinístico: insumos em ordem de descrição, origens na ordem das linhas.
 */
export function explodirEmInsumos(linhas: readonly BudgetEntry[]): ExplosaoDeInsumos {
  const porChave = new Map<string, InsumoDaPlanta>();
  const semComposicao: LinhaSemComposicao[] = [];
  let soMaoDeObra = 0;

  const somar = (
    chave: string,
    base: Omit<InsumoDaPlanta, 'chave' | 'quantidade' | 'origens'>,
    origem: OrigemDoInsumo,
  ) => {
    const atual = porChave.get(chave);
    if (atual) {
      atual.quantidade += origem.quantidade;
      atual.origens.push(origem);
      // Preço: o primeiro não nulo vence — o catálogo é um só, divergir seria erro dele.
      if (atual.custoUnitario === 0 && base.custoUnitario > 0) atual.custoUnitario = base.custoUnitario;
      return;
    }
    porChave.set(chave, { ...base, chave, quantidade: origem.quantidade, origens: [origem] });
  };

  for (const linha of linhas) {
    const item = linha.sinapiItem;
    const qtd = Number(linha.quantity ?? 0);
    if (!item || !(qtd > 0)) continue;
    // O catálogo às vezes entrega a composição como string JSON; quem lê do banco já converte, mas aqui não se confia.
    const comp = Array.isArray(item.composition) ? item.composition : [];

    if (comp.length === 0) {
      if (item.type === SinapiType.INPUT) {
        const codigo = item.code?.trim() || null;
        somar(codigo ?? chaveDaDescricao(item.description), {
          codigo,
          descricao: item.description,
          unidade: item.unit,
          custoUnitario: Number(item.price ?? 0),
          direto: true,
        }, { linhaId: linha.id, descricao: item.description, quantidade: qtd });
      } else {
        semComposicao.push({ linhaId: linha.id, descricao: item.description, quantidade: qtd, unidade: item.unit });
      }
      continue;
    }

    let comprou = false;
    for (const c of comp) {
      const subcomposicao = c.type === SinapiType.COMPOSITION || (c.type as string) === 'COMPOSITION';
      if (subcomposicao || ehMaoDeObra(c.category)) continue;
      const coef = Number(c.quantity ?? 0);
      if (!(coef > 0)) continue;
      comprou = true;
      const codigo = c.code?.trim() || null;
      somar(codigo ?? chaveDaDescricao(c.description), {
        codigo,
        descricao: c.description,
        unidade: c.unit,
        custoUnitario: Number(c.price ?? 0),
        direto: false,
      }, { linhaId: linha.id, descricao: item.description, quantidade: coef * qtd });
    }
    if (!comprou) soMaoDeObra += 1;
  }

  const insumos = [...porChave.values()]
    .map((i) => ({
      ...i,
      quantidade: arred(i.quantidade),
      origens: i.origens.map((o) => ({ ...o, quantidade: arred(o.quantidade) })),
    }))
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR') || a.chave.localeCompare(b.chave));

  return { insumos, semComposicao, soMaoDeObra };
}

/**
 * Preenche o custo dos insumos que a composição trouxe sem preço (o SINAPI
 * importado guarda só código e coeficiente nos componentes) com o preço do
 * catálogo, por código. Quem já tinha preço não muda. Devolve nova explosão.
 */
export function precificarInsumos(explosao: ExplosaoDeInsumos, precos: ReadonlyMap<string, number>): ExplosaoDeInsumos {
  return {
    ...explosao,
    insumos: explosao.insumos.map((i) => {
      if (i.custoUnitario > 0 || !i.codigo) return i;
      const p = precos.get(i.codigo);
      return p && p > 0 ? { ...i, custoUnitario: p } : i;
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas: cronograma primeiro, data padrão depois
// ─────────────────────────────────────────────────────────────────────────────

/** O mínimo do cronograma que este módulo precisa: quando cada tarefa (= linha) começa. */
export interface TarefaDatada {
  id: string;
  startDate?: string;
}

/** `YYYY-MM-DD` ± dias, sem `Date` local (fuso já mordeu o Gantt deste projeto). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Quando o insumo precisa estar na obra: a MENOR data de início entre as
 * tarefas das linhas que o pedem (a primeira parede a levantar já precisa do
 * bloco). Sem nenhuma tarefa datada, vale a data padrão escolhida na tela —
 * e `doCronograma` diz de onde veio, para a tela não vender palpite como plano.
 */
export function dataDeNecessidade(
  insumo: Pick<InsumoDaPlanta, 'origens'>,
  tarefas: ReadonlyMap<string, string>,
  dataPadrao: string,
): { data: string; doCronograma: boolean } {
  let menor: string | null = null;
  for (const o of insumo.origens) {
    const inicio = tarefas.get(o.linhaId)?.slice(0, 10);
    if (!inicio) continue;
    if (menor === null || inicio < menor) menor = inicio;
  }
  return menor ? { data: menor, doCronograma: true } : { data: dataPadrao.slice(0, 10), doCronograma: false };
}

export function indexarTarefas(tarefas: readonly TarefaDatada[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of tarefas) if (t.startDate) m.set(t.id, t.startDate);
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prazo de entrega
// ─────────────────────────────────────────────────────────────────────────────

/** O que interessa de `supplier_lead_times`: por insumo, ou genérico do fornecedor (`inputCode` vazio). */
export interface PrazoDeEntrega {
  inputCode?: string | null;
  supplierId?: string;
  leadTimeDays: number;
}

/** Prazo: específico do insumo > genérico > 0 — a mesma precedência do motor do plano. */
export function prazoDoInsumo(codigo: string | null, prazos: readonly PrazoDeEntrega[]): { dias: number; supplierId?: string } {
  const especifico = codigo ? prazos.find((p) => p.inputCode === codigo) : undefined;
  const generico = prazos.find((p) => !p.inputCode);
  const p = especifico ?? generico;
  return { dias: p?.leadTimeDays ?? 0, supplierId: p?.supplierId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Linhas do plano
// ─────────────────────────────────────────────────────────────────────────────

/** Prefixo dos itens do plano gerados por esta planta — o que se substitui ao regerar. */
export function prefixoDeCompras(studyId: string): string {
  return `bp:${studyId}:compras:`;
}

/** Uma linha de `procurement_plan_items`, nas colunas do banco. */
export interface LinhaDoPlano {
  organization_id: string;
  project_id: string;
  is_stale: false;
  input_code: string | null;
  input_description: string;
  input_unit: string;
  source_budget_item_id: string;
  source_budget_item_desc: string;
  source_budget_item_unit: string;
  required_qty: number;
  net_required_qty: number;
  period_id: string;
  period_date: string;
  need_date: string;
  lead_time_days: number;
  suggested_buy_date: string;
  suggested_supplier_id: string | null;
  estimated_unit_cost: number;
  status: 'pending';
  notes: string;
}

export interface ContextoDeCompras {
  studyId: string;
  studyName: string;
  revision: number;
  projectId: string;
  organizationId: string;
  /** Vale quando o cronograma não data a linha. */
  dataPadrao: string;
  tarefas: ReadonlyMap<string, string>;
  prazos: readonly PrazoDeEntrega[];
  /** Posição líquida de estoque por código (Almoxarifado); ausente = compra tudo. */
  posicaoLiquida?: ReadonlyMap<string, number>;
}

export interface InsumoDatado extends InsumoDaPlanta {
  necessarioEm: string;
  doCronograma: boolean;
  prazoDias: number;
  comprarAte: string;
  emEstoque: number;
  aComprar: number;
}

/** Cada insumo com data, prazo e estoque resolvidos — o que a tela mostra e o que vira linha. */
export function datarInsumos(explosao: ExplosaoDeInsumos, ctx: ContextoDeCompras): InsumoDatado[] {
  return explosao.insumos.map((i) => {
    const { data, doCronograma } = dataDeNecessidade(i, ctx.tarefas, ctx.dataPadrao);
    const prazo = prazoDoInsumo(i.codigo, ctx.prazos);
    const emEstoque = Math.max(0, (i.codigo && ctx.posicaoLiquida?.get(i.codigo)) || 0);
    return {
      ...i,
      necessarioEm: data,
      doCronograma,
      prazoDias: prazo.dias,
      comprarAte: prazo.dias > 0 ? somarDias(data, -prazo.dias) : data,
      emEstoque,
      aComprar: arred(Math.max(0, i.quantidade - emEstoque)),
    };
  });
}

/** Memória de cálculo do insumo, uma linha da planta por linha de texto. */
export function memoriaDoInsumo(i: InsumoDaPlanta, unidade = i.unidade): string {
  const MAX = 30;
  const linhas = i.origens.slice(0, MAX).map((o) => `${o.linhaId} · ${o.descricao} → ${o.quantidade} ${unidade}`);
  if (i.origens.length > MAX) linhas.push(`… e mais ${i.origens.length - MAX} linha(s)`);
  return linhas.join('\n');
}

export function linhasDoPlano(explosao: ExplosaoDeInsumos, ctx: ContextoDeCompras): LinhaDoPlano[] {
  const prefixo = prefixoDeCompras(ctx.studyId);
  return datarInsumos(explosao, ctx).map((i) => {
    const prazo = prazoDoInsumo(i.codigo, ctx.prazos);
    return {
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      is_stale: false,
      input_code: i.codigo,
      input_description: i.descricao,
      input_unit: i.unidade,
      source_budget_item_id: `${prefixo}${i.chave}`,
      source_budget_item_desc: `Planta "${ctx.studyName}" rev. ${ctx.revision} · ${i.origens.length} linha(s)${i.direto ? ' · compra direta' : ''}`,
      source_budget_item_unit: i.unidade,
      required_qty: i.quantidade,
      net_required_qty: i.aComprar,
      period_id: `planta:${ctx.studyId}`,
      period_date: i.necessarioEm,
      need_date: i.necessarioEm,
      lead_time_days: i.prazoDias,
      suggested_buy_date: i.comprarAte,
      suggested_supplier_id: prazo.supplierId ?? null,
      estimated_unit_cost: i.custoUnitario,
      status: 'pending',
      notes: `${i.doCronograma ? 'Data do cronograma da obra.' : 'Data padrão (linha sem tarefa datada).'}\n${memoriaDoInsumo(i)}`,
    };
  });
}

export interface ResumoDeCompras {
  insumos: number;
  linhasDaPlanta: number;
  datadosPeloCronograma: number;
  totalEstimado: number;
}

export function resumirCompras(insumos: readonly InsumoDatado[]): ResumoDeCompras {
  const linhas = new Set<string>();
  for (const i of insumos) for (const o of i.origens) linhas.add(o.linhaId);
  return {
    insumos: insumos.length,
    linhasDaPlanta: linhas.size,
    datadosPeloCronograma: insumos.filter((i) => i.doCronograma).length,
    totalEstimado: arred(insumos.reduce((s, i) => s + i.aComprar * i.custoUnitario, 0), 2),
  };
}
