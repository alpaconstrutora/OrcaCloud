/**
 * UNIDADES (18/09/2026, roadmap E2.2): tudo o que a unidade TEM é derivado
 * daqui — o kernel só guarda número, tipologia, PCD e as etiquetas.
 *
 * ─── ÁREA PRIVATIVA PELO CRITÉRIO DA NBR 12721 ──────────────────────────────
 *
 * A norma mede a área privativa coberta pelo EIXO das paredes que separam a
 * unidade de outra unidade ou de área comum (a "geminada" entra pela METADE)
 * e pela FACE EXTERNA das paredes externas (entram inteiras). O anel do
 * ambiente que o arranjo planar produz já corre no EIXO — então a soma das
 * áreas de eixo dos ambientes JÁ tem a metade de toda parede compartilhada e
 * a metade INTERNA das externas. O que falta é a metade externa das paredes
 * externas: `Σ comprimento do lado × espessura / 2`, lado a lado do anel.
 *
 * O lado do anel é classificado olhando o que há do OUTRO lado dele:
 * - outro ambiente da MESMA unidade → INTERNA (já inteira na soma);
 * - ambiente de OUTRA unidade → GEMINADA (metade, marcada na planta);
 * - ambiente sem unidade (hall, circulação) → COMUM (metade);
 * - nenhum ambiente → EXTERNA (soma a metade de fora).
 *
 * Aproximação declarada: a metade externa é `comprimento × espessura/2` por
 * lado, sem o acerto de canto (`recuo² × tan(giro/2)`) que `areaRecuada`
 * faz — na casa dos 0,01 m² por canto, abaixo da tolerância da própria norma
 * (a área real é a que o cartório recebe, arredondada a 2 casas).
 *
 * ÁREA COMUM do pavimento = área construída do pavimento (face externa,
 * `areaConstruidaMm2`) − Σ privativas do pavimento. FRAÇÃO IDEAL = privativa
 * da unidade ÷ Σ privativas de TODAS as unidades do estudo (o critério
 * simplificado do art. 1.331 §3º do CC e do Quadro IV-B quando não há
 * coeficiente de padrão diferente entre unidades — quem precisa do coeficiente
 * tem o módulo Áreas NBR 12721, que recebe estas privativas como entrada).
 */
import {
  areaConstruidaMm2,
  areCollinear,
  isBetween,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type Level,
  type ObjectId,
  type Space,
  type Unidade,
  type Wall,
} from './blueprintKernel';

export type LadoDaUnidade = 'INTERNA' | 'GEMINADA' | 'COMUM' | 'EXTERNA';

export interface ParedeDaUnidade {
  wallId: ObjectId;
  lado: LadoDaUnidade;
  /** Comprimento do trecho do anel que corre sobre a parede, em mm. */
  comprimentoMm: number;
  espessuraMm: number;
  /** A unidade do outro lado, quando GEMINADA. */
  vizinhaId?: ObjectId;
}

export interface MedidaDaUnidade {
  id: ObjectId;
  uid: string;
  numero: string;
  tipologia: string | null;
  pcd: boolean;
  /** Pavimentos que a unidade ocupa (duplex tem dois). */
  levelIds: ObjectId[];
  ambientes: Space[];
  /** Σ área de eixo dos ambientes. */
  areaDeEixoMm2: number;
  /** Metade externa das paredes externas (ver cabeçalho). */
  areaDasParedesExternasMm2: number;
  /** Privativa NBR 12721 = eixo + metade externa. */
  areaPrivativaMm2: number;
  paredes: ParedeDaUnidade[];
  /** Unidades com que divide parede. */
  geminadaCom: ObjectId[];
}

export interface PavimentoDoQuadro {
  levelId: ObjectId;
  nome: string;
  unidades: number;
  areaConstruidaMm2: number;
  areaPrivativaMm2: number;
  /** Construída − privativas. Nunca negativa (o desenho pode estar aberto). */
  areaComumMm2: number;
}

export interface QuadroDeUnidades {
  unidades: (MedidaDaUnidade & { fracaoIdeal: number })[];
  pavimentos: PavimentoDoQuadro[];
  totalPrivativaMm2: number;
  /** Paredes divididas por duas unidades diferentes — a marca na planta. */
  paredesGeminadas: Set<ObjectId>;
}

/** Ponto a `dist` mm do meio de a→b, do lado esquerdo (+) ou direito (−) do sentido a→b. */
function pontoAoLado(a: { x: number; y: number }, b: { x: number; y: number }, dist: number): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2 + (-dy / c) * dist, y: (a.y + b.y) / 2 + (dx / c) * dist };
}

function dentroDoAmbiente(s: Space, p: { x: number; y: number }): boolean {
  return pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p));
}

/** A parede sobre a qual o lado a→b do anel corre (colinear e contido). */
function paredeDoLado(paredes: Wall[], a: { x: number; y: number }, b: { x: number; y: number }): Wall | null {
  for (const w of paredes) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w;
  }
  return null;
}

/** uid da etiqueta → unidade. */
export function unidadePorEtiqueta(model: BlueprintModel): Map<string, Unidade> {
  const m = new Map<string, Unidade>();
  for (const u of model.unidades ?? []) for (const uid of u.etiquetaUids) m.set(uid, u);
  return m;
}

/** Os ambientes que compõem a unidade (pela etiqueta). */
export function ambientesDaUnidade(model: BlueprintModel, u: Unidade): Space[] {
  const uids = new Set(u.etiquetaUids);
  return model.spaces.filter((s) => s.labelUid && uids.has(s.labelUid));
}

export function medirUnidade(model: BlueprintModel, u: Unidade): MedidaDaUnidade {
  const porEtiqueta = unidadePorEtiqueta(model);
  const ambientes = ambientesDaUnidade(model, u);
  const paredes: ParedeDaUnidade[] = [];
  const geminadaCom = new Set<ObjectId>();
  let externasMm2 = 0;
  for (const s of ambientes) {
    const paredesDoNivel = model.walls.filter((w) => w.levelId === s.levelId);
    const outros = model.spaces.filter((x) => x.levelId === s.levelId && x.id !== s.id);
    // Anel e furos: o furo é um "lado" também (o poço de luz no meio da sala é área comum).
    const contornos = [s.ring, ...s.holes];
    for (const anel of contornos) {
      const n = anel.length;
      for (let i = 0; i < n; i++) {
        const a = anel[i];
        const b = anel[(i + 1) % n];
        const w = paredeDoLado(paredesDoNivel, a, b);
        if (!w) continue;
        const comprimentoMm = Math.hypot(b.x - a.x, b.y - a.y);
        if (comprimentoMm < 1) continue;
        // Um ponto de cada lado do lado; o que NÃO está neste ambiente é o "outro lado".
        const eps = Math.max(1, Math.min(w.thicknessMm / 2, 20));
        const esq = pontoAoLado(a, b, eps);
        const dir = pontoAoLado(a, b, -eps);
        const fora = dentroDoAmbiente(s, esq) ? dir : esq;
        const vizinho = outros.find((x) => dentroDoAmbiente(x, fora)) ?? null;
        let lado: LadoDaUnidade;
        let vizinhaId: ObjectId | undefined;
        if (!vizinho) {
          lado = 'EXTERNA';
          externasMm2 += (comprimentoMm * w.thicknessMm) / 2;
        } else {
          const dona = vizinho.labelUid ? porEtiqueta.get(vizinho.labelUid) : undefined;
          if (dona && dona.id === u.id) lado = 'INTERNA';
          else if (dona) {
            lado = 'GEMINADA';
            vizinhaId = dona.id;
            geminadaCom.add(dona.id);
          } else lado = 'COMUM';
        }
        paredes.push({ wallId: w.id, lado, comprimentoMm: Math.round(comprimentoMm), espessuraMm: w.thicknessMm, ...(vizinhaId ? { vizinhaId } : {}) });
      }
    }
  }
  const areaDeEixoMm2 = ambientes.reduce((soma, s) => soma + s.areaMm2, 0);
  const areaDasParedesExternasMm2 = Math.round(externasMm2);
  return {
    id: u.id,
    uid: u.uid,
    numero: u.numero,
    tipologia: u.tipologia ?? null,
    pcd: u.pcd,
    levelIds: [...new Set(ambientes.map((s) => s.levelId))],
    ambientes,
    areaDeEixoMm2,
    areaDasParedesExternasMm2,
    areaPrivativaMm2: areaDeEixoMm2 + areaDasParedesExternasMm2,
    paredes,
    geminadaCom: [...geminadaCom],
  };
}

/** Ordem natural de número: "2" antes de "10", "101" antes de "102", letras depois. */
export function compararNumeros(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function quadroDeUnidades(model: BlueprintModel): QuadroDeUnidades {
  const medidas = (model.unidades ?? []).map((u) => medirUnidade(model, u)).sort((x, y) => compararNumeros(x.numero, y.numero));
  const totalPrivativaMm2 = medidas.reduce((s, m) => s + m.areaPrivativaMm2, 0);
  const paredesGeminadas = new Set<ObjectId>();
  for (const m of medidas) for (const p of m.paredes) if (p.lado === 'GEMINADA') paredesGeminadas.add(p.wallId);
  const pavimentos: PavimentoDoQuadro[] = model.levels.map((l: Level) => {
    const construida = areaConstruidaMm2(model, l);
    // Unidade que atravessa pavimentos: a privativa de cada pavimento é a dos
    // ambientes DAQUELE pavimento (+ as paredes externas deles).
    let privativa = 0;
    let n = 0;
    for (const m of medidas) {
      const daqui = m.ambientes.filter((s) => s.levelId === l.id);
      if (daqui.length === 0) continue;
      n++;
      privativa += daqui.reduce((s, x) => s + x.areaMm2, 0);
      privativa += m.paredes
        .filter((p) => p.lado === 'EXTERNA' && model.walls.some((w) => w.id === p.wallId && w.levelId === l.id))
        .reduce((s, p) => s + (p.comprimentoMm * p.espessuraMm) / 2, 0);
    }
    privativa = Math.round(privativa);
    return { levelId: l.id, nome: l.name, unidades: n, areaConstruidaMm2: construida, areaPrivativaMm2: privativa, areaComumMm2: Math.max(0, construida - privativa) };
  });
  return {
    unidades: medidas.map((m) => ({ ...m, fracaoIdeal: totalPrivativaMm2 > 0 ? m.areaPrivativaMm2 / totalPrivativaMm2 : 0 })),
    pavimentos,
    totalPrivativaMm2,
    paredesGeminadas,
  };
}

/** "Un. 101 · 2 dorm. · PCD" — a linha da etiqueta na planta e o título nas listas. */
export function rotuloDaUnidade(u: Pick<Unidade, 'numero' | 'tipologia' | 'pcd'>, curto = false): string {
  const partes = [`Un. ${u.numero}`];
  if (!curto && u.tipologia) partes.push(u.tipologia);
  if (u.pcd) partes.push('PCD');
  return partes.join(' · ');
}

/** Fração ideal como texto: "0,125000" e "125,000 ‰". */
export function formatarFracao(f: number): { decimal: string; milesimos: string } {
  return {
    decimal: f.toFixed(6).replace('.', ','),
    milesimos: `${(f * 1000).toFixed(3).replace('.', ',')} ‰`,
  };
}

export function mm2ParaM2(mm2: number): number {
  return Math.round(mm2 / 10_000) / 100;
}

// ─── Ponte com o Planta AI ──────────────────────────────────────────────────

/** O que o Planta AI sabe de uma unidade e a planta aproveita. */
export interface UnidadeExterna {
  /** `plant_units.unit_code` — vira o número. */
  codigo: string;
  /** `unit_type` ou "N dorm." — vira a tipologia. */
  tipologia: string | null;
  /** Prevista pelo gerador de massa, em m² — só para comparar com a medida. */
  areaPrivativaM2: number | null;
  pavimento: number | null;
}

/**
 * Cria as unidades que ainda não existem (por número). Idempotente: rodar de
 * novo não duplica nem mexe nas que já estão. As criadas nascem SEM ambientes
 * — o gerador de massa não desenha cômodos; compor é o próximo gesto, na
 * planta.
 */
export function comandosDeImportacaoDoPlantaAi(model: BlueprintModel, externas: UnidadeExterna[]): { comandos: Command[]; jaExistiam: string[] } {
  const existentes = new Set((model.unidades ?? []).map((u) => u.numero));
  const vistos = new Set<string>();
  const comandos: Command[] = [];
  const jaExistiam: string[] = [];
  for (const e of externas) {
    const numero = e.codigo.trim().slice(0, 16);
    if (!numero || vistos.has(numero)) continue;
    vistos.add(numero);
    if (existentes.has(numero)) {
      jaExistiam.push(numero);
      continue;
    }
    comandos.push({ type: 'AddUnidade', numero, tipologia: e.tipologia?.slice(0, 40) ?? null, pcd: false });
  }
  return { comandos, jaExistiam };
}

/** Converte a linha do `plant_units` no que a ponte consome. */
export function unidadeExternaDoPlantaAi(u: { unit_code?: string; unit_type?: string; bedrooms?: number; private_area?: number; _floor_number?: number }): UnidadeExterna | null {
  if (!u.unit_code) return null;
  return {
    codigo: u.unit_code,
    tipologia: u.unit_type?.trim() || (u.bedrooms ? `${u.bedrooms} dorm.` : null),
    areaPrivativaM2: typeof u.private_area === 'number' ? u.private_area : null,
    pavimento: typeof u._floor_number === 'number' ? u._floor_number : null,
  };
}
