/**
 * ESTUDO DE MASSA — o COMPARADOR de cenários (fase M4 do plano
 * `2026-10-01-estudo-de-massa.md`, §17 do pedido).
 *
 * Cenário = ALTERNATIVA do estudo (ramo, E6.1): cada uma tem os seus blocos. O
 * comparador mede todas com a MESMA régua — a zona, o produto, o CUB e as
 * hipóteses do estudo — e põe os indicadores lado a lado.
 *
 * ─── SEM VENCEDOR ───────────────────────────────────────────────────────────
 *
 * O pedido é explícito: "a comparação não deveria produzir um vencedor
 * automaticamente sem critérios definidos pelo usuário". Por isso cada linha
 * diz o que é "melhor" NELA (maior VGV, menor custo…) e destaca quem ganha
 * aquela linha — e nenhuma nota soma as linhas. O otimizador da M5 é que recebe
 * o critério do usuário.
 */
import type { BlueprintModel } from './blueprintKernel';
import { divisasDoLote, medirTerreno, type Recuos } from './blueprintTerreno';
import { medirMassa, type HipotesesDaMassa, type MedidaDaMassa, type ZonaDaMassa } from './blueprintMassa';
import { distribuirProduto, type Produto, type ResultadoDoProduto } from './blueprintProduto';
import { financeiroDaMassa, type ResultadoFinanceiro } from './blueprintFinanceiroMassa';
import type { CubDoPadrao } from '../services/cubService';

export interface CenarioDeMassa {
  blocos: number;
  pavimentosMax: number;
  alturaMaxM: number;
  toPct: number | null;
  ca: number | null;
  areaConstruidaM2: number;
  unidades: number;
  areaVendavelM2: number;
  eficienciaGlobalPct: number | null;
  vagasQueCabem: number;
  vagasExigidas: number;
  /** Construída − privativa, ÷ unidades, m²; null sem unidade. */
  areaComumPorUnidadeM2: number | null;
  /** Área dos blocos de garagem, somados os pavimentos, m². */
  garagemM2: number;
  vgv: number | null;
  custoTotal: number | null;
  resultado: number | null;
  margemPct: number | null;
  vgvSobreCusto: number | null;
  /** Pavimentos fora do envelope ou acima do gabarito, somados. */
  pisosComProblema: number;
  /**
   * Complexidade construtiva — índice DITO, não medido: nº de blocos + 2 por
   * pavimento de subsolo (escavação, contenção) + 1 por bloco apoiado em outro
   * (transição estrutural). Menor é mais simples.
   */
  complexidade: number;
}

export interface ReguaDoComparador {
  zona: ZonaDaMassa;
  recuosBase: Recuos;
  hipotesesDaMassa?: Partial<HipotesesDaMassa>;
  produto: Produto;
  cub: CubDoPadrao | null;
  vagasPorUnidadeDaZona: number | null;
  /** Vagas por contorno de garagem já calculadas — ver `distribuirProduto`. */
  cacheDeVagas?: Map<string, number>;
}

/** O cenário e as medidas de onde ele saiu — o gerador (M5) precisa do estado da lei e das vagas. */
export interface CenarioMedido {
  cenario: CenarioDeMassa;
  massa: MedidaDaMassa;
  distribuicao: ResultadoDoProduto | null;
  financeiro: ResultadoFinanceiro | null;
}

/** Os indicadores de UM cenário; `null` se a alternativa não tem bloco de massa. */
export function cenarioDeMassa(model: BlueprintModel, r: ReguaDoComparador): CenarioDeMassa | null {
  return medirCenarioDeMassa(model, r)?.cenario ?? null;
}

export function medirCenarioDeMassa(model: BlueprintModel, r: ReguaDoComparador): CenarioMedido | null {
  if ((model.blocos ?? []).length === 0) return null;
  const massa = medirMassa(model, { terreno: medirTerreno(divisasDoLote(model.boundaries)), limites: model.boundaries, recuosBase: r.recuosBase, zona: r.zona, hipoteses: r.hipotesesDaMassa });
  const temProduto = r.produto.tipologias.length > 0;
  const dist = temProduto ? distribuirProduto(model, massa, r.produto, r.vagasPorUnidadeDaZona, r.cacheDeVagas) : null;
  const fin = dist ? financeiroDaMassa(massa, r.produto, dist, r.cub) : null;
  const subsolos = massa.blocos.reduce((s, b) => s + b.pavimentosNoSubsolo, 0);
  const apoiados = massa.blocos.filter((b) => b.apoiadoEm).length;
  const cenario: CenarioDeMassa = {
    blocos: massa.blocos.length,
    pavimentosMax: massa.pavimentosMax,
    alturaMaxM: massa.alturaMaxM,
    toPct: massa.to.usado,
    ca: massa.ca.usado,
    areaConstruidaM2: massa.areaConstruidaM2,
    unidades: dist?.unidades ?? 0,
    areaVendavelM2: dist?.privativaTotalM2 ?? 0,
    eficienciaGlobalPct: dist?.eficienciaGlobalPct ?? null,
    vagasQueCabem: dist?.vagasQueCabem ?? 0,
    vagasExigidas: dist?.vagasExigidas ?? 0,
    areaComumPorUnidadeM2: dist?.areaComumPorUnidadeM2 ?? null,
    garagemM2: Math.round(massa.blocos.filter((b) => b.uso === 'GARAGEM').reduce((s, b) => s + b.areaConstruidaM2, 0) * 100) / 100,
    vgv: fin && fin.vgv > 0 ? fin.vgv : null,
    custoTotal: fin?.custoTotal ?? null,
    resultado: fin?.resultado ?? null,
    margemPct: fin?.margemPct ?? null,
    vgvSobreCusto: fin?.vgvSobreCusto ?? null,
    pisosComProblema: massa.pisosForaDoEnvelope + massa.pisosAcimaDoGabarito,
    complexidade: massa.blocos.length + 2 * subsolos + apoiados,
  };
  return { cenario, massa, distribuicao: dist, financeiro: fin };
}

export type ChaveDoComparador = keyof CenarioDeMassa;
export type FormatoDaLinha = 'num' | 'm2' | 'pct' | 'brl' | 'razao' | 'm';

export interface LinhaDoComparador {
  chave: ChaveDoComparador;
  rotulo: string;
  formato: FormatoDaLinha;
  /** O que é melhor nesta linha; `null` = linha informativa, sem destaque. */
  melhor: 'MAIOR' | 'MENOR' | null;
  /** O nome do destaque, como o pedido lista ("maior VGV", "menor custo"…). */
  destaque?: string;
}

export const LINHAS_DO_COMPARADOR: readonly LinhaDoComparador[] = [
  { chave: 'blocos', rotulo: 'Blocos', formato: 'num', melhor: null },
  { chave: 'pavimentosMax', rotulo: 'Pavimentos', formato: 'num', melhor: null },
  { chave: 'alturaMaxM', rotulo: 'Altura', formato: 'm', melhor: null },
  { chave: 'toPct', rotulo: 'Taxa de ocupação', formato: 'pct', melhor: null },
  { chave: 'ca', rotulo: 'Coeficiente (CA)', formato: 'razao', melhor: null },
  { chave: 'areaConstruidaM2', rotulo: 'Área construída', formato: 'm2', melhor: null },
  { chave: 'unidades', rotulo: 'Unidades', formato: 'num', melhor: 'MAIOR', destaque: 'maior número de unidades' },
  { chave: 'areaVendavelM2', rotulo: 'Área vendável', formato: 'm2', melhor: 'MAIOR', destaque: 'maior área vendável' },
  { chave: 'eficienciaGlobalPct', rotulo: 'Eficiência', formato: 'pct', melhor: 'MAIOR', destaque: 'maior eficiência' },
  { chave: 'vagasQueCabem', rotulo: 'Vagas que cabem', formato: 'num', melhor: null },
  { chave: 'vagasExigidas', rotulo: 'Vagas exigidas', formato: 'num', melhor: null },
  { chave: 'areaComumPorUnidadeM2', rotulo: 'Área comum por unidade', formato: 'm2', melhor: 'MENOR', destaque: 'menor área comum por unidade' },
  { chave: 'vgv', rotulo: 'VGV', formato: 'brl', melhor: 'MAIOR', destaque: 'maior VGV' },
  { chave: 'custoTotal', rotulo: 'Custo total', formato: 'brl', melhor: 'MENOR', destaque: 'menor custo' },
  { chave: 'resultado', rotulo: 'Resultado', formato: 'brl', melhor: null },
  { chave: 'margemPct', rotulo: 'Margem', formato: 'pct', melhor: null },
  { chave: 'vgvSobreCusto', rotulo: 'VGV ÷ custo', formato: 'razao', melhor: 'MAIOR', destaque: 'melhor relação VGV/custo' },
  { chave: 'pisosComProblema', rotulo: 'Pavimentos fora da lei', formato: 'num', melhor: null },
  { chave: 'complexidade', rotulo: 'Complexidade construtiva', formato: 'num', melhor: 'MENOR', destaque: 'menor complexidade construtiva' },
];

/**
 * Quem ganha cada linha com critério — índices dos cenários (empate: todos).
 * Linha em que todos empatam, ou com menos de 2 valores medidos, não destaca:
 * "destaque" de quem não tem concorrente não informa nada.
 */
export function destaquesDoComparador(cenarios: readonly (CenarioDeMassa | null)[]): Partial<Record<ChaveDoComparador, number[]>> {
  const saida: Partial<Record<ChaveDoComparador, number[]>> = {};
  for (const l of LINHAS_DO_COMPARADOR) {
    if (!l.melhor) continue;
    const valores = cenarios.map((c, i) => ({ i, v: c ? (c[l.chave] as number | null) : null })).filter((x): x is { i: number; v: number } => x.v != null);
    if (valores.length < 2) continue;
    const alvo = l.melhor === 'MAIOR' ? Math.max(...valores.map((x) => x.v)) : Math.min(...valores.map((x) => x.v));
    const ganham = valores.filter((x) => Math.abs(x.v - alvo) < 1e-9).map((x) => x.i);
    if (ganham.length === valores.length) continue;
    saida[l.chave] = ganham;
  }
  return saida;
}

/** "EM-002 — 10 pav / 80 un" (§22 do pedido). */
export function nomeSugeridoDoCenario(numero: number, c: Pick<CenarioDeMassa, 'pavimentosMax' | 'unidades'> | null): string {
  const n = `EM-${String(Math.max(1, numero)).padStart(3, '0')}`;
  if (!c) return n;
  return c.unidades > 0 ? `${n} — ${c.pavimentosMax} pav / ${c.unidades} un` : `${n} — ${c.pavimentosMax} pav`;
}

export function formatarDoComparador(v: number | null, f: FormatoDaLinha): string {
  if (v == null) return '—';
  const n = (casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  switch (f) {
    case 'm2':
      return `${n(0)} m²`;
    case 'pct':
      return `${n(1)} %`;
    case 'brl':
      return Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi` : `R$ ${n(0)}`;
    case 'razao':
      return n(2);
    case 'm':
      return `${n(2)} m`;
    default:
      return n(0);
  }
}
