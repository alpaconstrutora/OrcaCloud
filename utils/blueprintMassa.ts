/**
 * ESTUDO DE MASSA — o motor (fase M1 do plano `2026-10-01-estudo-de-massa.md`).
 *
 * Mede o que os BLOCOS de massa (`Bloco`, kernel 0.90.0) fazem com o terreno e
 * com a lei: projeção, área construída, computável, altura, pavimentos, "cabe
 * no envelope?" piso a piso, acima do gabarito — e os indicadores urbanísticos
 * do estudo (TO, CA, gabarito, permeabilidade, aproveitamento do potencial).
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Recebe o modelo, o terreno, as divisas, os recuos e a zona; devolve números.
 * Nada é gravado: tudo é derivado do desenho a cada leitura, como o envelope
 * 3D. É o que deixa "recuo lateral 2 m → 3 m" regenerar a massa inteira na
 * hora, sem nenhuma conta guardada que possa ficar velha.
 *
 * ─── A MESMA RÉGUA DO ENVELOPE 3D ───────────────────────────────────────────
 *
 * O envelope de cada piso do bloco é o de `envelopeVertical` (E3.3): recuos
 * efetivos na altura do TOPO daquele piso (afastamento progressivo, recuo de
 * frente escalonado pelo ordinal), menos as faixas restritas, em peças quando
 * a servidão divide o lote. A conferência é `conferirNoEnvelope`, a mesma
 * função do prisma do pavimento — duas cópias da regra divergiriam calado.
 *
 * ─── O QUE NÃO SE MEDE NÃO VIRA ZERO ────────────────────────────────────────
 *
 * Sem terreno, sem zona ou sem o limite da lei, o indicador sai SEM_DADO ou
 * SEM_LIMITE, com o motivo — nunca 0 % nem "atende" em silêncio.
 */
import {
  pointInPolygon,
  signedArea,
  type BlueprintModel,
  type Bloco,
  type Boundary,
  type ObjectId,
  type Point,
  type UsoDoBloco,
} from './blueprintKernel';
import { envelopeConstrutivo, type Recuos, type Terreno } from './blueprintTerreno';
import { recuosEfetivos } from './blueprintZonaUrbanistica';
import { conferirNoEnvelope, type ZonaDoEnvelope } from './blueprintEnvelope3d';
import { variaveisDePermeabilidade } from './blueprintSubRegioes';

// ─── Hipóteses ───────────────────────────────────────────────────────────────

/**
 * O que NÃO conta no coeficiente de aproveitamento. Cada município escreve a
 * sua lista (garagem, área técnica, varanda até X %, subsolo…); estes padrões
 * são os mais comuns e ficam DITOS na tela, editáveis — não são norma.
 */
export interface HipotesesDaMassa {
  /** Fração (0–1) da área de cada uso que fica FORA do CA. */
  naoComputavelPorUso: Record<UsoDoBloco, number>;
  /** Piso de subsolo (base abaixo de 0) fora do CA. */
  subsoloNaoComputavel: boolean;
  /** Piso a piso usado para dizer "pavimentos possíveis" pelo gabarito em altura, mm. */
  peDireitoDeReferenciaMm: number;
}

export const HIPOTESES_DA_MASSA_PADRAO: HipotesesDaMassa = {
  naoComputavelPorUso: { RESIDENCIAL: 0, COMERCIAL: 0, MISTO: 0, GARAGEM: 1, LAZER: 0, TECNICO: 1 },
  subsoloNaoComputavel: true,
  peDireitoDeReferenciaMm: 3000,
};

/** O que o motor precisa da zona: o do envelope 3D + TO, CA e permeabilidade. */
export interface ZonaDaMassa extends ZonaDoEnvelope {
  /** Em PORCENTAGEM (60 = 60 %), como `ValoresDaZona`. */
  taxaOcupacaoMaxPct: number | null;
  coeficienteMax: number | null;
  /** Em PORCENTAGEM. */
  taxaPermeabilidadeMinPct: number | null;
}

export const ZONA_DA_MASSA_VAZIA: ZonaDaMassa = {
  afastamentoProgressivo: null,
  recuoFrenteEscalonado: null,
  gabaritoAlturaMaxM: null,
  gabaritoPavimentos: null,
  taxaOcupacaoMaxPct: null,
  coeficienteMax: null,
  taxaPermeabilidadeMinPct: null,
};

export interface ContextoDaMassa {
  terreno: Terreno | null;
  /** As divisas do pavimento de referência (papéis e faixas restritas). */
  limites: Boundary[];
  recuosBase: Recuos;
  zona: ZonaDaMassa;
  hipoteses?: Partial<HipotesesDaMassa>;
}

// ─── Geometria: área da UNIÃO de polígonos, exata ───────────────────────────

/** Intervalos [y0, y1] em que a vertical x corta o anel (par-ímpar). */
function intervalosNoX(anel: readonly Point[], x: number): [number, number][] {
  const ys: number[] = [];
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
      const t = (x - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
  }
  ys.sort((p, q) => p - q);
  const saida: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) saida.push([ys[i], ys[i + 1]]);
  return saida;
}

function comprimentoDaUniao(intervalos: [number, number][]): number {
  if (intervalos.length === 0) return 0;
  const ord = [...intervalos].sort((p, q) => p[0] - q[0]);
  let total = 0;
  let [ini, fim] = ord[0];
  for (let i = 1; i < ord.length; i++) {
    const [a, b] = ord[i];
    if (a > fim) {
      total += fim - ini;
      ini = a;
      fim = b;
    } else if (b > fim) fim = b;
  }
  return total + (fim - ini);
}

/** x do cruzamento próprio de dois segmentos, ou null (paralelos/disjuntos). */
function xDoCruzamento(p1: Point, p2: Point, p3: Point, p4: Point): number | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return p1.x + t * (p2.x - p1.x);
}

/**
 * Área da UNIÃO de anéis simples, mm² — exata (a menos do ponto flutuante).
 *
 * Faixas verticais entre todo x de vértice e de cruzamento de arestas: dentro
 * de uma faixa nenhuma aresta cruza outra, então a ordem das bordas é fixa e
 * o comprimento da união na vertical é LINEAR em x — a regra do ponto médio é
 * exata. Serve para a TO: podium e torre empilhados não podem contar duas
 * vezes a mesma projeção.
 */
export function areaDaUniaoMm2(aneis: readonly (readonly Point[])[]): number {
  const validos = aneis.filter((a) => a.length >= 3 && Math.abs(signedArea(a as Point[])) > 0);
  if (validos.length === 0) return 0;
  if (validos.length === 1) return Math.abs(signedArea(validos[0] as Point[]));
  const arestas: [Point, Point][] = [];
  const xs = new Set<number>();
  for (const a of validos) {
    for (let i = 0; i < a.length; i++) {
      arestas.push([a[i], a[(i + 1) % a.length]]);
      xs.add(a[i].x);
    }
  }
  for (let i = 0; i < arestas.length; i++) {
    for (let j = i + 1; j < arestas.length; j++) {
      const x = xDoCruzamento(arestas[i][0], arestas[i][1], arestas[j][0], arestas[j][1]);
      if (x !== null) xs.add(x);
    }
  }
  const ord = [...xs].sort((p, q) => p - q);
  let area = 0;
  for (let i = 0; i + 1 < ord.length; i++) {
    const largura = ord[i + 1] - ord[i];
    if (largura <= 1e-9) continue;
    const xm = (ord[i] + ord[i + 1]) / 2;
    area += comprimentoDaUniao(validos.flatMap((a) => intervalosNoX(a, xm))) * largura;
  }
  return area;
}

/** Centróide de área do anel (cai fora em L/U — quem usa decide o que fazer). */
export function centroDoAnel(anel: readonly Point[]): Point {
  const a2 = signedArea(anel as Point[]) * 2;
  if (anel.length < 3 || a2 === 0) {
    const n = Math.max(1, anel.length);
    return { x: anel.reduce((s, p) => s + p.x, 0) / n, y: anel.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

// ─── Pisos do bloco ──────────────────────────────────────────────────────────

export interface PisoDoBloco {
  /** 1 = o primeiro pavimento do bloco (de baixo para cima). */
  indice: number;
  /** Cotas ABSOLUTAS (pavimento de referência + cota do bloco), mm. */
  baseMm: number;
  topoMm: number;
  /** Base abaixo de 0: subsolo — não conta no gabarito nem na TO. */
  subsolo: boolean;
  /** Ordem no gabarito de pavimentos (contando os blocos de baixo); null no subsolo. */
  ordinal: number | null;
  acimaDoGabarito: boolean;
  motivoDoGabarito: string | null;
  /** O envelope DESTE piso (ou o lote, no subsolo); vazio sem terreno. */
  pecasDoEnvelope: Point[][];
  /** null = sem terreno para conferir. */
  cabe: boolean | null;
  areaForaMm2: number | null;
  afastamentoMm: number | null;
}

export interface MedidaDoBloco {
  blocoId: ObjectId;
  nome: string;
  uso: UsoDoBloco;
  projecaoM2: number;
  pavimentos: number;
  pavimentosNoSubsolo: number;
  areaConstruidaM2: number;
  areaComputavelM2: number;
  areaNaoComputavelM2: number;
  baseMm: number;
  topoMm: number;
  /** Topo acima do 0 do terreno, m; 0 para o bloco todo enterrado. */
  alturaM: number;
  pisos: PisoDoBloco[];
  pisosAcimaDoGabarito: number;
  pisosForaDoEnvelope: number;
  /** O bloco sobre o qual este está apoiado (podium da torre), quando há. */
  apoiadoEm: ObjectId | null;
}

const m2 = (mm2: number) => Math.round(mm2 / 10_000) / 100;
const fmt = (n: number, casas = 2) => n.toFixed(casas).replace('.', ',');

function elevacaoDoNivel(model: BlueprintModel, levelId: ObjectId): number {
  return model.levels.find((l) => l.id === levelId)?.elevationMm ?? 0;
}

function baseAbsoluta(model: BlueprintModel, b: Bloco): number {
  return elevacaoDoNivel(model, b.levelId) + b.cotaBaseMm;
}

/** Pisos acima do solo (base ≥ 0) de um bloco. */
function pisosAcimaDoSolo(model: BlueprintModel, b: Bloco): number {
  const base = baseAbsoluta(model, b);
  let n = 0;
  for (let i = 0; i < b.pavimentos; i++) if (base + i * b.peDireitoMm >= 0) n++;
  return n;
}

/**
 * Em que bloco este se APOIA: outro bloco cujo topo encosta na base deste
 * (±1 mm) e cuja projeção contém o centro deste. É como podium + torre
 * contam o gabarito de pavimentos: o 1º piso da torre é o 4º do prédio.
 */
function apoioDe(model: BlueprintModel, b: Bloco, blocos: readonly Bloco[]): Bloco | null {
  const base = baseAbsoluta(model, b);
  if (base <= 0) return null;
  const c = centroDoAnel(b.pontos);
  let melhor: Bloco | null = null;
  let melhorTopo = -Infinity;
  for (const o of blocos) {
    if (o.id === b.id) continue;
    const topo = baseAbsoluta(model, o) + o.pavimentos * o.peDireitoMm;
    if (topo > base + 1 || topo < base - 1) continue;
    if (!pointInPolygon(o.pontos, c)) continue;
    if (topo > melhorTopo) {
      melhor = o;
      melhorTopo = topo;
    }
  }
  return melhor;
}

/** Quantos pisos acima do solo há ABAIXO do bloco, pela cadeia de apoios. */
function pisosAbaixo(model: BlueprintModel, b: Bloco, blocos: readonly Bloco[], visitados = new Set<ObjectId>()): number {
  if (visitados.has(b.id)) return 0;
  visitados.add(b.id);
  const apoio = apoioDe(model, b, blocos);
  if (!apoio) return 0;
  return pisosAcimaDoSolo(model, apoio) + pisosAbaixo(model, apoio, blocos, visitados);
}

export function medirBloco(model: BlueprintModel, b: Bloco, ctx: ContextoDaMassa, blocos: readonly Bloco[] = model.blocos ?? []): MedidaDoBloco {
  const hip = { ...HIPOTESES_DA_MASSA_PADRAO, ...(ctx.hipoteses ?? {}) };
  const projecaoMm2 = Math.abs(signedArea(b.pontos));
  const base = baseAbsoluta(model, b);
  const gabaritoMm = ctx.zona.gabaritoAlturaMaxM != null ? Math.round(ctx.zona.gabaritoAlturaMaxM * 1000) : null;
  const abaixo = pisosAbaixo(model, b, blocos);
  const apoio = apoioDe(model, b, blocos);
  const fracaoNaoComputavel = Math.min(1, Math.max(0, hip.naoComputavelPorUso[b.uso] ?? 0));
  const terreno = ctx.terreno && ctx.terreno.anel.length >= 3 ? ctx.terreno : null;
  const loteComoEnvelope = terreno ? { anel: terreno.anel, areaMm2: terreno.areaMm2, valido: true, pecas: [terreno.anel] } : null;

  let ordinal = abaixo;
  let computavelMm2 = 0;
  const pisos: PisoDoBloco[] = [];
  for (let i = 0; i < b.pavimentos; i++) {
    const baseMm = base + i * b.peDireitoMm;
    const topoMm = baseMm + b.peDireitoMm;
    const subsolo = baseMm < 0;
    let ord: number | null = null;
    let acimaEmPav = false;
    if (!subsolo) {
      ordinal++;
      ord = ordinal;
      acimaEmPav = ctx.zona.gabaritoPavimentos != null && ordinal > ctx.zona.gabaritoPavimentos;
    }
    const acimaEmAltura = !subsolo && gabaritoMm != null && topoMm > gabaritoMm + 1;
    let pecas: Point[][] = [];
    let cabe: boolean | null = null;
    let areaFora: number | null = null;
    let afastamentoMm: number | null = null;
    if (terreno) {
      if (subsolo) {
        // O subsolo não tem recuo de lei no envelope desta conta (cada município
        // diz o seu); confere-se só que fica DENTRO do lote — e a tela diz isso.
        const r = conferirNoEnvelope([b.pontos], loteComoEnvelope!);
        pecas = r.pecas;
        cabe = r.cabe;
        areaFora = r.areaForaMm2;
      } else {
        const ef = recuosEfetivos(ctx.recuosBase, { afastamentoProgressivo: ctx.zona.afastamentoProgressivo, recuoFrenteEscalonado: ctx.zona.recuoFrenteEscalonado ?? null }, topoMm / 1000, ord ?? 0);
        afastamentoMm = ef.afastamentoMm;
        const env = envelopeConstrutivo(terreno, ctx.limites, ef.recuos);
        const r = conferirNoEnvelope([b.pontos], env);
        pecas = r.pecas;
        cabe = r.cabe;
        areaFora = r.areaForaMm2;
      }
    }
    if (!(subsolo && hip.subsoloNaoComputavel)) computavelMm2 += projecaoMm2 * (1 - fracaoNaoComputavel);
    pisos.push({
      indice: i + 1,
      baseMm,
      topoMm,
      subsolo,
      ordinal: ord,
      acimaDoGabarito: acimaEmAltura || acimaEmPav,
      motivoDoGabarito: acimaEmAltura
        ? `topo a ${fmt(topoMm / 1000)} m > gabarito ${fmt(ctx.zona.gabaritoAlturaMaxM!)} m`
        : acimaEmPav
          ? `${ord}º pavimento > gabarito de ${ctx.zona.gabaritoPavimentos}`
          : null,
      pecasDoEnvelope: pecas,
      cabe,
      areaForaMm2: areaFora,
      afastamentoMm,
    });
  }
  const construidaMm2 = projecaoMm2 * b.pavimentos;
  const topo = base + b.pavimentos * b.peDireitoMm;
  return {
    blocoId: b.id,
    nome: b.nome,
    uso: b.uso,
    projecaoM2: m2(projecaoMm2),
    pavimentos: b.pavimentos,
    pavimentosNoSubsolo: pisos.filter((p) => p.subsolo).length,
    areaConstruidaM2: m2(construidaMm2),
    areaComputavelM2: m2(computavelMm2),
    areaNaoComputavelM2: m2(construidaMm2 - computavelMm2),
    baseMm: base,
    topoMm: topo,
    alturaM: Math.max(0, topo) / 1000,
    pisos,
    pisosAcimaDoGabarito: pisos.filter((p) => p.acimaDoGabarito).length,
    pisosForaDoEnvelope: pisos.filter((p) => p.cabe === false).length,
    apoiadoEm: apoio?.id ?? null,
  };
}

// ─── Indicadores do estudo ───────────────────────────────────────────────────

export type EstadoDoIndicador = 'ATENDE' | 'EXCEDE' | 'SEM_LIMITE' | 'SEM_DADO';

export interface IndicadorDaMassa {
  /** O valor medido (unidade no rótulo da tela); null = não se pôde medir. */
  usado: number | null;
  /** O limite da zona; null = a lei não disse (ou não foi informada). */
  limite: number | null;
  estado: EstadoDoIndicador;
  /** Por que SEM_DADO/SEM_LIMITE, ou o detalhe do EXCEDE. */
  motivo: string | null;
}

function indicadorMaximo(usado: number | null, limite: number | null, semDado: string, semLimite: string, folga = 1e-6): IndicadorDaMassa {
  if (usado === null) return { usado, limite, estado: 'SEM_DADO', motivo: semDado };
  if (limite === null) return { usado, limite, estado: 'SEM_LIMITE', motivo: semLimite };
  return { usado, limite, estado: usado <= limite + folga ? 'ATENDE' : 'EXCEDE', motivo: null };
}

/** O que a lei deixa no lote, antes de qualquer bloco (§4 do pedido). */
export interface EnvelopeLegal {
  loteM2: number | null;
  /** TO × lote. */
  implantacaoMaxM2: number | null;
  /** Área do envelope no térreo (recuos fixos e faixas restritas). */
  envelopeTerreoM2: number | null;
  /** O menor dos dois: o que se pode de fato ocupar. */
  implantacaoEfetivaM2: number | null;
  /** CA × lote. */
  potencialM2: number | null;
  /** min(gabarito em pavimentos, gabarito em altura ÷ piso a piso, potencial ÷ implantação). */
  pavimentosPossiveis: number | null;
  alturaMaxM: number | null;
  /** De onde saiu cada limite que falta. */
  faltam: string[];
}

export function envelopeLegal(ctx: ContextoDaMassa): EnvelopeLegal {
  const hip = { ...HIPOTESES_DA_MASSA_PADRAO, ...(ctx.hipoteses ?? {}) };
  const z = ctx.zona;
  const terreno = ctx.terreno && ctx.terreno.anel.length >= 3 ? ctx.terreno : null;
  const loteM2 = terreno ? m2(terreno.areaMm2) : null;
  const faltam: string[] = [];
  if (!terreno) faltam.push('o lote (feche as divisas na aba Terreno)');
  if (z.taxaOcupacaoMaxPct == null) faltam.push('a taxa de ocupação da zona');
  if (z.coeficienteMax == null) faltam.push('o coeficiente de aproveitamento da zona');
  if (z.gabaritoPavimentos == null && z.gabaritoAlturaMaxM == null) faltam.push('o gabarito da zona');
  const implantacaoMaxM2 = loteM2 != null && z.taxaOcupacaoMaxPct != null ? Math.round(loteM2 * z.taxaOcupacaoMaxPct) / 100 : null;
  let envelopeTerreoM2: number | null = null;
  if (terreno) {
    const ef = recuosEfetivos(ctx.recuosBase, { afastamentoProgressivo: z.afastamentoProgressivo, recuoFrenteEscalonado: z.recuoFrenteEscalonado ?? null }, hip.peDireitoDeReferenciaMm / 1000, 1);
    const env = envelopeConstrutivo(terreno, ctx.limites, ef.recuos);
    envelopeTerreoM2 = env.valido ? m2(env.areaMm2) : 0;
  }
  const candidatos = [implantacaoMaxM2, envelopeTerreoM2].filter((v): v is number => v != null);
  const implantacaoEfetivaM2 = candidatos.length ? Math.min(...candidatos) : null;
  const potencialM2 = loteM2 != null && z.coeficienteMax != null ? Math.round(loteM2 * z.coeficienteMax * 100) / 100 : null;
  const limitesDePav: number[] = [];
  if (z.gabaritoPavimentos != null) limitesDePav.push(z.gabaritoPavimentos);
  if (z.gabaritoAlturaMaxM != null) limitesDePav.push(Math.floor((z.gabaritoAlturaMaxM * 1000 + 1) / hip.peDireitoDeReferenciaMm));
  if (potencialM2 != null && implantacaoEfetivaM2 != null && implantacaoEfetivaM2 > 0) limitesDePav.push(Math.floor(potencialM2 / implantacaoEfetivaM2 + 1e-9));
  const pavimentosPossiveis = limitesDePav.length ? Math.max(0, Math.min(...limitesDePav)) : null;
  const alturaMaxM =
    z.gabaritoAlturaMaxM != null ? z.gabaritoAlturaMaxM : z.gabaritoPavimentos != null ? (z.gabaritoPavimentos * hip.peDireitoDeReferenciaMm) / 1000 : null;
  return { loteM2, implantacaoMaxM2, envelopeTerreoM2, implantacaoEfetivaM2, potencialM2, pavimentosPossiveis, alturaMaxM, faltam };
}

export interface MedidaDaMassa {
  blocos: MedidaDoBloco[];
  legal: EnvelopeLegal;
  /** União das projeções dos blocos com algum piso acima do solo, m². */
  areaOcupadaM2: number;
  areaConstruidaM2: number;
  areaComputavelM2: number;
  areaNaoComputavelM2: number;
  /** Área permeável desenhada (sub-regiões), m²; null sem sub-região. */
  areaPermeavelM2: number | null;
  alturaMaxM: number;
  /** O maior ordinal de piso acima do solo (o prédio mais alto, em pavimentos). */
  pavimentosMax: number;
  to: IndicadorDaMassa;
  ca: IndicadorDaMassa;
  gabaritoPavimentos: IndicadorDaMassa;
  gabaritoAltura: IndicadorDaMassa;
  permeabilidade: IndicadorDaMassa;
  /** Computável ÷ potencial, %. */
  aproveitamentoDoPotencialPct: number | null;
  pisosForaDoEnvelope: number;
  pisosAcimaDoGabarito: number;
  avisos: string[];
}

/** Blocos que dividem o mesmo espaço (projeção E faixa de altura) — contariam duas vezes. */
function sobreposicoes(model: BlueprintModel, blocos: readonly Bloco[]): string[] {
  const avisos: string[] = [];
  for (let i = 0; i < blocos.length; i++) {
    for (let j = i + 1; j < blocos.length; j++) {
      const a = blocos[i];
      const b = blocos[j];
      const a0 = baseAbsoluta(model, a);
      const a1 = a0 + a.pavimentos * a.peDireitoMm;
      const b0 = baseAbsoluta(model, b);
      const b1 = b0 + b.pavimentos * b.peDireitoMm;
      if (Math.min(a1, b1) - Math.max(a0, b0) <= 1) continue;
      const soma = Math.abs(signedArea(a.pontos)) + Math.abs(signedArea(b.pontos));
      const uniao = areaDaUniaoMm2([a.pontos, b.pontos]);
      if (soma - uniao > 10_000) {
        avisos.push(`"${a.nome}" e "${b.nome}" ocupam o mesmo espaço em ${fmt((soma - uniao) / 1e6)} m² de projeção — a área construída conta duas vezes ali. Apoie um sobre o outro (cota da base) ou separe-os.`);
      }
    }
  }
  return avisos;
}

export function medirMassa(model: BlueprintModel, ctx: ContextoDaMassa): MedidaDaMassa {
  const blocos = model.blocos ?? [];
  const medidas = blocos.map((b) => medirBloco(model, b, ctx, blocos));
  const legal = envelopeLegal(ctx);
  const z = ctx.zona;
  const acima = blocos.filter((b) => pisosAcimaDoSolo(model, b) > 0);
  const ocupadaM2 = m2(areaDaUniaoMm2(acima.map((b) => b.pontos)));
  const construida = medidas.reduce((s, m) => s + m.areaConstruidaM2, 0);
  const computavel = medidas.reduce((s, m) => s + m.areaComputavelM2, 0);
  const lote = legal.loteM2;
  const perm = lote != null ? variaveisDePermeabilidade(model, lote) : {};
  const areaPermeavelM2 = perm.area_permeavel ?? null;
  const pavimentosMax = Math.max(0, ...medidas.flatMap((m) => m.pisos.map((p) => p.ordinal ?? 0)));
  const alturaMaxM = Math.max(0, ...medidas.map((m) => m.alturaM));
  const semLote = 'sem lote: feche as divisas na aba Terreno';
  const semBloco = 'nenhum bloco acima do solo';
  const avisos: string[] = [];
  for (const m of medidas) {
    if (m.pisosForaDoEnvelope > 0) avisos.push(`"${m.nome}": ${m.pisosForaDoEnvelope} pavimento(s) fora do envelope legal.`);
    if (m.pisosAcimaDoGabarito > 0) avisos.push(`"${m.nome}": ${m.pisosAcimaDoGabarito} pavimento(s) acima do gabarito.`);
  }
  avisos.push(...sobreposicoes(model, blocos));
  const r = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;
  return {
    blocos: medidas,
    legal,
    areaOcupadaM2: ocupadaM2,
    areaConstruidaM2: r(construida, 2),
    areaComputavelM2: r(computavel, 2),
    areaNaoComputavelM2: r(construida - computavel, 2),
    areaPermeavelM2,
    alturaMaxM: r(alturaMaxM, 2),
    pavimentosMax,
    to: indicadorMaximo(lote != null && lote > 0 ? r((ocupadaM2 / lote) * 100, 1) : null, z.taxaOcupacaoMaxPct, semLote, 'a zona não informa a taxa de ocupação', 0.05),
    ca: indicadorMaximo(lote != null && lote > 0 ? r(computavel / lote, 2) : null, z.coeficienteMax, semLote, 'a zona não informa o coeficiente de aproveitamento', 0.005),
    gabaritoPavimentos: indicadorMaximo(acima.length ? pavimentosMax : null, z.gabaritoPavimentos, semBloco, 'a zona não informa o gabarito em pavimentos', 0),
    gabaritoAltura: indicadorMaximo(acima.length ? r(alturaMaxM, 2) : null, z.gabaritoAlturaMaxM, semBloco, 'a zona não informa o gabarito em altura', 0.001),
    permeabilidade:
      perm.taxa_permeabilidade == null
        ? { usado: null, limite: z.taxaPermeabilidadeMinPct, estado: 'SEM_DADO', motivo: lote == null ? semLote : 'desenhe as sub-regiões (permeável/impermeável) na aba Terreno' }
        : z.taxaPermeabilidadeMinPct == null
          ? { usado: perm.taxa_permeabilidade, limite: null, estado: 'SEM_LIMITE', motivo: 'a zona não informa a permeabilidade mínima' }
          : { usado: perm.taxa_permeabilidade, limite: z.taxaPermeabilidadeMinPct, estado: perm.taxa_permeabilidade + 0.05 >= z.taxaPermeabilidadeMinPct ? 'ATENDE' : 'EXCEDE', motivo: null },
    aproveitamentoDoPotencialPct: legal.potencialM2 ? r((computavel / legal.potencialM2) * 100, 1) : null,
    pisosForaDoEnvelope: medidas.reduce((s, m) => s + m.pisosForaDoEnvelope, 0),
    pisosAcimaDoGabarito: medidas.reduce((s, m) => s + m.pisosAcimaDoGabarito, 0),
    avisos,
  };
}

// ─── Aproveitamento do estudo inteiro: desenho + massa ───────────────────────

export interface AproveitamentoDoEstudo {
  /** Projeção ÷ lote, fração. */
  taxaOcupacao: number;
  /** Computável ÷ lote. */
  coeficienteAproveitamento: number;
  areaProjetadaM2: number;
  areaConstruidaM2: number;
  areaComputavelM2: number;
  /** O que entrou na conta, para a tela dizer. */
  pavimentosDesenhados: number;
  blocos: number;
}

/**
 * TO e CA do ESTUDO: os ambientes desenhados em TODOS os pavimentos acima do
 * solo + os blocos de massa. Substitui a conta antiga de `calcularAproveitamento`
 * (um pavimento só, TO = CA por construção).
 *
 * Projeção = UNIÃO dos contornos dos ambientes acima do solo e das projeções
 * dos blocos (o térreo e a torre por cima dele não somam duas vezes).
 * Construída = Σ ambientes acima do solo + Σ blocos; computável = ambientes +
 * computável dos blocos (as hipóteses do uso valem só para o bloco — ambiente
 * desenhado conta inteiro, como sempre contou).
 */
export function aproveitamentoDoEstudo(model: BlueprintModel, terreno: Terreno | null, massa: MedidaDaMassa | null): AproveitamentoDoEstudo | null {
  if (!terreno || terreno.areaMm2 <= 0) return null;
  const niveisAcima = new Set(model.levels.filter((l) => l.elevationMm >= 0).map((l) => l.id));
  const ambientes = model.spaces.filter((s) => niveisAcima.has(s.levelId));
  const blocosAcima = (model.blocos ?? []).filter((b) => pisosAcimaDoSolo(model, b) > 0);
  const projecaoMm2 = areaDaUniaoMm2([...ambientes.map((s) => s.ring), ...blocosAcima.map((b) => b.pontos)]);
  const desenhadaMm2 = ambientes.reduce((s, a) => s + a.areaMm2, 0);
  const construidaMm2 = desenhadaMm2 + (massa ? massa.areaConstruidaM2 * 1e6 : 0);
  const computavelMm2 = desenhadaMm2 + (massa ? massa.areaComputavelM2 * 1e6 : 0);
  return {
    taxaOcupacao: projecaoMm2 / terreno.areaMm2,
    coeficienteAproveitamento: computavelMm2 / terreno.areaMm2,
    areaProjetadaM2: m2(projecaoMm2),
    areaConstruidaM2: m2(construidaMm2),
    areaComputavelM2: m2(computavelMm2),
    pavimentosDesenhados: new Set(ambientes.map((a) => a.levelId)).size,
    blocos: (model.blocos ?? []).length,
  };
}

// ─── Rótulos e cores ─────────────────────────────────────────────────────────

/** Cor do bloco pelo uso — a MESMA no 2D e no 3D. */
export const COR_DO_USO_DO_BLOCO: Record<UsoDoBloco, string> = {
  RESIDENCIAL: '#93c5fd',
  COMERCIAL: '#fcd34d',
  MISTO: '#c4b5fd',
  GARAGEM: '#cbd5e1',
  LAZER: '#86efac',
  TECNICO: '#fca5a5',
};

/** "Torre A · 10 pav · 30,00 m" — o rótulo do bloco na planta. */
export function rotuloDoBloco(b: Pick<Bloco, 'nome' | 'pavimentos' | 'peDireitoMm' | 'cotaBaseMm'>): string {
  const altura = (b.pavimentos * b.peDireitoMm) / 1000;
  const sub = b.cotaBaseMm < 0 ? ` · base ${fmt(b.cotaBaseMm / 1000)} m` : b.cotaBaseMm > 0 ? ` · sobre ${fmt(b.cotaBaseMm / 1000)} m` : '';
  return `${b.nome} · ${b.pavimentos} pav · ${fmt(altura)} m${sub}`;
}

/** Nome sugerido para o próximo bloco: "Bloco 1", "Bloco 2"… pelo primeiro livre. */
export function proximoNomeDeBloco(model: BlueprintModel, prefixo = 'Bloco'): string {
  const usados = new Set((model.blocos ?? []).map((b) => b.nome));
  for (let i = 1; ; i++) {
    const nome = `${prefixo} ${i}`;
    if (!usados.has(nome)) return nome;
  }
}
