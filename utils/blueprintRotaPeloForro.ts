/**
 * A REDE PELO FORRO (F14b da casa automática, 16/10/2026).
 *
 * Decisões do usuário: *"Forro com faixas"* (15/10) — forro rebaixado, plenum onde cada rede corre na FAIXA de cota
 * dela — e *"Manter 2,80 m, furar vigas"* (16/10): com o pé-direito de 2,80 m e vigas de 30–60 cm, o forro no
 * mínimo do uso (2,50 m) fica acima do fundo de TODAS as vigas; o forro fica entre elas, e a rede que passa de um
 * cômodo ao outro atravessa a viga (furo previsto, F14c).
 *
 * ⚠️ No plenum a rede NÃO pode correr pelo eixo da parede, como dentro da alvenaria: a viga mora em cima da parede,
 * com a mesma largura, e o tubo correria DENTRO dela de ponta a ponta. Corre no forro do cômodo, ao longo da parede,
 * afastada da face da viga — cada disciplina a uma distância (o afastamento) e numa cota (a faixa) dela:
 *
 *   - `paredesDoForro`: as "paredes" por onde a árvore anda (o mesmo `arvorePelasParedes` de sempre) — o anel de
 *     cada cômodo recuado da face da parede (ou da viga, se mais larga) e uma TRAVESSIA no meio de cada parede que
 *     separa dois cômodos (a passagem pela viga);
 *   - `descidaDoForro`: do forro ao ponto — desce junto da viga (no caixote de gesso), entra na parede logo abaixo
 *     dela e desce dentro da alvenaria até a peça; a que cairia num vão de porta ou janela desce ao lado dele.
 *
 * Com afastamentos diferentes, a descida de uma disciplina não cruza o ramal de outra; com cotas diferentes, as
 * travessias não se encontram. Um afastamento ≥ raio + raio do vizinho é responsabilidade das hipóteses.
 */
import { anelRecuado, distanciaEntreEixos3D, envelopeDoTrecho, envelopeValido, pavimentosDoNucleo, pegadaEmPlanta, pointInPolygon, type BlueprintModel, type DisciplinaDeRede, type ObjectId, type Point, type Wall } from './blueprintKernel';
import { semEspiculas } from './blueprintDistribuicao';
import { anelDoPilar, fracaoDentro, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { encaixarNaParede } from './blueprintRotaPelasParedes';
import { HIPOTESES_DOS_FUROS_PADRAO, distanciaAoApoioDaViga } from './blueprintFurosPrevistos';
import { TOLERANCIA_DO_LADO_MM, paredeContemLado, paredeDoLado } from './blueprintLadoDaParede';

type P2 = { x: number; y: number };

/** A faixa de UMA rede no forro: a cota (abaixo da laje) e o afastamento da face da parede/viga. */
export interface FaixaDoForro {
  /** O eixo da rede a esta distância ABAIXO do teto (o fundo da laje), mm. */
  abaixoDoTetoMm: number;
  /** O eixo da rede a esta distância da FACE da parede (ou da viga, se mais larga), dentro do cômodo, mm. */
  afastamentoDaFaceMm: number;
  /**
   * F14c: abaixo da viga, a rede entra na parede este tanto MAIS BAIXO que a folga comum — cada rede no seu degrau.
   * No mesmo degrau, a fria cortava a face da parede (do anel ao eixo) a 8 mm do eletroduto que corria nela até a
   * tomada (sobrado a 30°). Ausente = 0.
   */
  degrauNaParedeMm?: number;
}

/** A cota da faixa num pavimento: o teto dele menos a distância da faixa. */
export function cotaDaFaixa(tetoMm: number, f: FaixaDoForro): number {
  return Math.round(tetoMm - f.abaixoDoTetoMm);
}

/** Viga "de teto": o topo dela a até isto do teto do pavimento. */
const VIGA_DE_TETO_MM = 200;
/** A travessia só entra onde os dois cômodos dividem ao menos isto de parede, além dos afastamentos. */
const TRAVESSIA_MINIMA_MM = 200;
/** F14c: a travessia (furo na viga) a pelo menos isto × a altura da viga da face do apoio — NBR 6118, 13.2.5.1. */
const DISTANCIA_DO_APOIO_EM_ALTURAS = HIPOTESES_DOS_FUROS_PADRAO.distanciaDoApoioEmAlturas;
/**
 * Correção 1 (24/10/2026): a régua de `furosPrevistos` mede da FACE do furo — desconta o raio dele. A travessia serve a
 * toda disciplina; com a metade do maior furo que ainda dispensa a verificação (Ø 12 cm), a face de qualquer furo
 * dispensável fica fora da zona do apoio (e a 2h do furo vizinho).
 */
const MEIO_FURO_MAXIMO_MM = HIPOTESES_DOS_FUROS_PADRAO.diametroMaximoMm / 2;
/** A descida que cairia num vão desce a esta folga do batente. */
const FOLGA_DO_VAO_MM = 50;

const vigasDeTeto = (model: BlueprintModel, levelId: ObjectId) => {
  const teto = model.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? 0;
  return (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === levelId && s.pontos.length >= 2 && s.baseMm + s.alturaMm >= teto - VIGA_DE_TETO_MM);
};

/** Os cômodos que ganham rede no forro: os do pavimento com nome (o vazio da escada e o shaft não têm forro). */
export function comodosComForro(model: BlueprintModel, levelId: ObjectId): BlueprintModel['spaces'] {
  return model.spaces.filter((s) => s.levelId === levelId && (s.name ?? '').trim() && !/escada|shaft/i.test(s.name ?? ''));
}

/** Um lado do anel no EIXO, como o arranjo o deu: a parede dele e o lado juntado (do anel recuado) a que pertence. */
interface LadoNoEixo {
  a: Point;
  b: Point;
  parede: Wall | null;
  recuo: number;
  juntado: number;
}

interface AnelDoForro {
  spaceId: ObjectId;
  /** O anel recuado, um vértice por lado JUNTADO. */
  recuado: Point[];
  lados: LadoNoEixo[];
}

/** O vértice do meio está na reta dos vizinhos (a até `TOLERANCIA_DO_LADO_MM`)? */
function colinear(a: P2, b: P2, c: P2): boolean {
  const L = Math.hypot(c.x - a.x, c.y - a.y);
  if (L < 1) return true;
  const d = Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / L;
  const t = ((b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y)) / (L * L);
  return d <= TOLERANCIA_DO_LADO_MM && t > 0 && t < 1;
}

/**
 * F14c: o contorno sem os DEDOS estreitos — dois lados opostos (antiparalelos), ligados por um lado curto, mais perto
 * um do outro que a soma dos recuos deles, com cantos convexos nas duas pontas do lado curto (uma saliência, não um
 * recorte). Recuado, o dedo vira do avesso e o anel inteiro era recusado: a sala do sobrado a 30° tem uma fresta de
 * 25 cm entre duas paredes paralelas, ficava sem forro, e a água ligava as pontas soltas em reta pelo plenum (9,6 m).
 * O dedo é cortado rente à base, no braço mais curto; o corte é lado novo, sem parede (recua o do lado curto).
 * `novo[k]` = o lado de agora do lado `k` de antes (−1 = saiu). `null` = nada a cortar.
 */
export function semDedosEstreitos(vertices: readonly P2[], recuos: readonly number[]): { vertices: P2[]; recuos: number[]; novo: number[] } | null {
  type Lado = { recuo: number; de: number[] };
  let v = vertices.map((p) => ({ x: p.x, y: p.y }));
  let l: Lado[] = recuos.map((r, k) => ({ recuo: r, de: [k] }));
  let mudou = false;
  const unit = (a: P2, b: P2) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  };
  for (let volta = 0; volta < 4 && v.length >= 5; volta++) {
    const m = v.length;
    const at = (i: number) => v[((i % m) + m) % m];
    const ld = (i: number) => l[((i % m) + m) % m];
    const orient = Math.sign(v.reduce((acc, p, i) => acc + p.x * at(i + 1).y - at(i + 1).x * p.y, 0));
    const convexo = (a: P2, b: P2, c: P2) => orient * ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 0;
    let i = -1;
    for (let k = 0; k < m; k++) {
      const [a0, a1, b0, b1] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
      const [uA, uB] = [unit(a0, a1), unit(b0, b1)];
      if (uA.x * uB.x + uA.y * uB.y > -0.98) continue;
      if (Math.hypot(b0.x - a1.x, b0.y - a1.y) >= ld(k - 1).recuo + ld(k + 1).recuo) continue;
      if (!convexo(a0, a1, b0) || !convexo(a1, b0, b1)) continue;
      i = k;
      break;
    }
    if (i < 0) break;
    const [a0, a1, b0, b1] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const LA = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    const LB = Math.hypot(b1.x - b0.x, b1.y - b0.y);
    const corte: Lado = { recuo: ld(i).recuo, de: [] };
    // Os vértices i e i+1 (as pontas do lado curto) dão lugar a P; os lados i−1, i, i+1 dão lugar a dois.
    let P: P2;
    let antes: Lado;
    let depois: Lado;
    if (LA <= LB) {
      const uB = unit(b0, b1);
      const t = (a0.x - b0.x) * uB.x + (a0.y - b0.y) * uB.y;
      P = { x: b0.x + uB.x * t, y: b0.y + uB.y * t };
      antes = corte;
      // O resto do braço longo continua com a parede dele; consumido inteiro, sai.
      depois = Math.hypot(b1.x - P.x, b1.y - P.y) < 1 ? { recuo: ld(i + 1).recuo, de: [] } : ld(i + 1);
    } else {
      const uA = unit(a0, a1);
      const t = (b1.x - a0.x) * uA.x + (b1.y - a0.y) * uA.y;
      P = { x: a0.x + uA.x * t, y: a0.y + uA.y * t };
      antes = Math.hypot(P.x - a0.x, P.y - a0.y) < 1 ? { recuo: ld(i - 1).recuo, de: [] } : ld(i - 1);
      depois = corte;
    }
    const nv: P2[] = [];
    const nl: Lado[] = [];
    for (let k = 0; k < m; k++) {
      const j = (i + 2 + k) % m; // começa no vértice depois do dedo
      if (j === i % m || j === (i + 1) % m) continue;
      nv.push(v[j]);
      // O lado que sai de j: o de antes do dedo (j = i−1) vira `antes`, e depois dele vem P com `depois`.
      if (j === ((i - 1) % m + m) % m) {
        nl.push(antes);
        nv.push(P);
        nl.push(depois);
      } else nl.push(l[j]);
    }
    v = nv;
    l = nl;
    // E os vértices que ficaram na reta dos vizinhos saem (os lados se juntam, com o maior recuo).
    for (let k = 0; k < v.length && v.length > 3; ) {
      const n2 = v.length;
      const a = v[(k + n2 - 1) % n2];
      const c = v[(k + 1) % n2];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      const d = L < 1 ? 0 : Math.abs((c.x - a.x) * (v[k].y - a.y) - (c.y - a.y) * (v[k].x - a.x)) / L;
      if (d <= TOLERANCIA_DO_LADO_MM) {
        const anterior = (k + n2 - 1) % n2;
        l[anterior] = { recuo: Math.max(l[anterior].recuo, l[k].recuo), de: [...l[anterior].de, ...l[k].de] };
        v.splice(k, 1);
        l.splice(k, 1);
        continue;
      }
      k++;
    }
    mudou = true;
  }
  if (!mudou) return null;
  const novo = recuos.map(() => -1);
  l.forEach((x, k) => {
    for (const o of x.de) novo[o] = k;
  });
  return { vertices: v, recuos: l.map((x) => x.recuo), novo };
}

/** F18: o lado mais curto que isto, entre dois lados mais longos, é um CHANFRO do encontro imperfeito de duas paredes. */
const CHANFRO_MAXIMO_MM = 100;

/**
 * F18 da casa automática: tira os CHANFROS do anel — o lado minúsculo em diagonal (5 × 2 cm) que o encontro imperfeito
 * de duas paredes deixa — trocando os dois vértices dele pelo encontro dos lados vizinhos. Recuado, ele virava do
 * avesso e o cômodo inteiro ficava sem forro (a área de serviço do R1-A: a água quente ia em reta pelo forro).
 */
function semChanfros(anel: Point[]): Point[] {
  let pts = [...anel];
  for (let volta = 0; volta < pts.length && pts.length > 3; volta++) {
    const n = pts.length;
    const i = pts.findIndex((a, k) => Math.hypot(pts[(k + 1) % n].x - a.x, pts[(k + 1) % n].y - a.y) < CHANFRO_MAXIMO_MM);
    if (i < 0) break;
    const [p0, a, b, p3] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    // O encontro das retas p0→a e b→p3.
    const r = { x: a.x - p0.x, y: a.y - p0.y };
    const q = { x: p3.x - b.x, y: p3.y - b.y };
    const den = r.x * q.y - r.y * q.x;
    if (Math.abs(den) < 1e-9) break;
    const t = ((b.x - p0.x) * q.y - (b.y - p0.y) * q.x) / den;
    const x = { x: Math.round(p0.x + r.x * t), y: Math.round(p0.y + r.y * t) } as Point;
    const novo = pts.filter((_, k) => k !== i && k !== (i + 1) % n);
    novo.splice(i < (i + 1) % n ? i : 0, 0, x);
    pts = novo;
  }
  return pts;
}

function aneisDoForro(model: BlueprintModel, levelId: ObjectId, afastamentoMm: number): AnelDoForro[] {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const vigas = vigasDeTeto(model, levelId).map((v) => ({ a: v.pontos[0], b: v.pontos[v.pontos.length - 1], largura: v.larguraMm }));
  const saida: AnelDoForro[] = [];
  for (const s of comodosComForro(model, levelId)) {
    const eixo = semChanfros(semEspiculas(s.ring) as Point[]);
    const n = eixo.length;
    if (n < 3) continue;
    const lados: LadoNoEixo[] = eixo.map((a, i) => {
      const b = eixo[(i + 1) % n];
      const parede = paredeDoLado(paredes, a, b);
      const viga = vigas.filter((v) => paredeContemLado(v, a, b)).reduce((m, v) => Math.max(m, v.largura), 0);
      return { a, b, parede, recuo: Math.round(Math.max(parede?.thicknessMm ?? 0, viga) / 2 + afastamentoMm), juntado: -1 };
    });
    // ⚠️ Os lados COLINEARES se juntam antes de recuar: o encontro em T deixa no anel um pedaço de 2 cm (a ponta da
    // parede que passa do encontro) — recuado 12 cm, ele vira do avesso e o anel inteiro é recusado (F14b, 16/10:
    // 10 dos 12 cômodos da térrea ficavam sem forro). O lado juntado recua o MAIOR dos recuos dele.
    const cantos: number[] = [];
    for (let i = 0; i < n; i++) if (!colinear(eixo[(i + n - 1) % n], eixo[i], eixo[(i + 1) % n])) cantos.push(i);
    if (cantos.length < 3) continue;
    const vertices = cantos.map((i) => eixo[i]);
    const recuos = cantos.map((i, k) => {
      const ate = cantos[(k + 1) % cantos.length];
      let r = 0;
      for (let j = i; ; j = (j + 1) % n) {
        lados[j].juntado = k;
        r = Math.max(r, lados[j].recuo);
        if ((j + 1) % n === ate) break;
      }
      return r;
    });
    // F14c: o DEDO estreito do contorno sai antes de recuar (ver `semDedosEstreitos`); os lados dele ficam sem anel.
    const limpo = semDedosEstreitos(vertices, recuos);
    const [vs, rs] = limpo ? [limpo.vertices, limpo.recuos] : [vertices, recuos];
    if (limpo) for (const l of lados) l.juntado = l.juntado >= 0 ? limpo.novo[l.juntado] : -1;
    const recuado = anelRecuado(vs as Point[], rs);
    // Cômodo estreito demais para o afastamento: fica sem rede no forro (a árvore contorna).
    if (!envelopeValido(vs as Point[], recuado)) continue;
    saida.push({ spaceId: s.id, recuado, lados });
  }
  return saida;
}

/** O ponto de um segmento a esta distância de `a`, ao longo dele. */
const aoLongo = (a: P2, u: P2, t: number): P2 => ({ x: a.x + u.x * t, y: a.y + u.y * t });

/**
 * As "paredes" do forro de um pavimento para UMA disciplina: os anéis recuados (cada lado é uma aresta) e as
 * travessias entre cômodos vizinhos — no meio do trecho de parede que eles dividem. Servem a `arvorePelasParedes`
 * no lugar das paredes de verdade (só `id`, `a`, `b`, `levelId` e `thicknessMm` contam lá).
 */
export function paredesDoForro(model: BlueprintModel, levelId: ObjectId, afastamentoMm: number): Wall[] {
  const aneis = aneisDoForro(model, levelId, afastamentoMm);
  const saida: Wall[] = [];
  const parede = (id: string, a: P2, b: P2): Wall => ({ id, levelId, a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) }, thicknessMm: 10 }) as unknown as Wall;
  for (const an of aneis) {
    const n = an.recuado.length;
    for (let i = 0; i < n; i++) {
      const a = an.recuado[i];
      const b = an.recuado[(i + 1) % n];
      if (a.x === b.x && a.y === b.y) continue;
      saida.push(parede(`forro:${an.spaceId}:${i}`, a, b));
    }
  }
  // F14c: a altura da viga de teto sobre o eixo que passa por `m` na direção `u` (0 = sem viga) e os APOIOS dela ao
  // longo desse eixo (o centro de cada pilar sobre ele, menos a meia seção — a face —, medido de `m`).
  const vigas = vigasDeTeto(model, levelId);
  const pilares = (model.structures ?? []).filter((x) => x.kind === 'PILAR' && x.levelId === levelId);
  // As vigas de teto sobre o eixo que passa por `m` na direção `u`.
  const vigasSobre = (m: P2, u: P2) =>
    vigas.filter((v) => {
      const a = v.pontos[0];
      const b = v.pontos[v.pontos.length - 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const paralela = Math.abs(((b.x - a.x) / L) * u.y - ((b.y - a.y) / L) * u.x) < 0.02;
      const d = Math.abs((m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)) / L;
      return paralela && d <= v.larguraMm / 2 + 5;
    });
  const alturaDaVigaSobre = (m: P2, u: P2): number => vigasSobre(m, u).reduce((h, v) => Math.max(h, v.alturaMm), 0);
  // Correção 1 (24/10/2026): os apoios são os de `furosPrevistos` — os pilares sobre o eixo (as faces) e as PONTAS de
  // cada peça de viga sobre ele (onde ela se apoia, em pilar ou em outra viga). Antes, só os pilares.
  const apoiosAoLongo = (m: P2, u: P2): number[] => [
    ...pilares
      .filter((p) => Math.abs((p.pontos[0].x - m.x) * u.y - (p.pontos[0].y - m.y) * u.x) <= Math.max(p.larguraMm, p.profundidadeMm))
      .flatMap((p) => {
        const t = (p.pontos[0].x - m.x) * u.x + (p.pontos[0].y - m.y) * u.y;
        const meia = Math.max(p.larguraMm, p.profundidadeMm) / 2;
        return [t - meia, t + meia];
      }),
    ...vigasSobre(m, u).flatMap((v) => [v.pontos[0], v.pontos[v.pontos.length - 1]].map((q) => (q.x - m.x) * u.x + (q.y - m.y) * u.y)),
  ];
  /** O ponto `p` do eixo está fora da zona de 2h (+ meio furo) do apoio em toda peça de viga que passa por ele? */
  const foraDaZonaDoApoio = (m: P2, u: P2, p: P2): boolean =>
    vigasSobre(m, u).every((v) => {
      const a = v.pontos[0];
      const b = v.pontos[v.pontos.length - 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L;
      if (t <= 0 || t >= L) return true; // o ponto não está nesta peça
      return distanciaAoApoioDaViga(v, p, pilares) >= v.alturaMm * DISTANCIA_DO_APOIO_EM_ALTURAS + MEIO_FURO_MAXIMO_MM;
    });
  // O ponto do meio projetado no lado recuado `k` do anel (dentro dele), ou `null`.
  const pe = (an: AnelDoForro, k: number, m: P2): P2 | null => {
    const r0 = an.recuado[k];
    const r1 = an.recuado[(k + 1) % an.recuado.length];
    const Lr = Math.hypot(r1.x - r0.x, r1.y - r0.y);
    if (Lr < 1) return null;
    const ur = { x: (r1.x - r0.x) / Lr, y: (r1.y - r0.y) / Lr };
    const tr = (m.x - r0.x) * ur.x + (m.y - r0.y) * ur.y;
    if (tr <= 0 || tr >= Lr) return null;
    return aoLongo(r0, ur, tr);
  };
  // As travessias: o mesmo pedaço de parede no anel de dois cômodos (lados opostos sobre o mesmo eixo), uma por par
  // de lados juntados — no meio do maior trecho em comum.
  for (let x = 0; x < aneis.length; x++) {
    for (let y = x + 1; y < aneis.length; y++) {
      const A = aneis[x];
      const B = aneis[y];
      const melhor = new Map<string, { m: P2; u: P2; ka: number; kb: number; comum: number }>();
      for (const la of A.lados) {
        if (!la.parede || la.juntado < 0) continue;
        const L = Math.hypot(la.b.x - la.a.x, la.b.y - la.a.y);
        if (L < 1) continue;
        const u = { x: (la.b.x - la.a.x) / L, y: (la.b.y - la.a.y) / L };
        const t = (p: P2) => (p.x - la.a.x) * u.x + (p.y - la.a.y) * u.y;
        for (const lb of B.lados) {
          if (lb.parede?.id !== la.parede.id || lb.juntado < 0) continue;
          const lo = Math.max(0, Math.min(t(lb.a), t(lb.b)));
          const hi = Math.min(L, Math.max(t(lb.a), t(lb.b)));
          const chave = `${la.juntado}:${lb.juntado}`;
          if (hi - lo <= (melhor.get(chave)?.comum ?? 0)) continue;
          melhor.set(chave, { m: aoLongo(la.a, u, (lo + hi) / 2), u, ka: la.juntado, kb: lb.juntado, comum: hi - lo });
        }
      }
      for (const [chave, c] of [...melhor.entries()].sort((p, q) => p[0].localeCompare(q[0]))) {
        const folga = Math.max(A.lados.find((l) => l.juntado === c.ka)!.recuo, B.lados.find((l) => l.juntado === c.kb)!.recuo);
        if (c.comum < 2 * folga + TRAVESSIA_MINIMA_MM) continue;
        // No meio do trecho em comum e, com folga, perto de cada ponta: com uma travessia só (no meio), a rede que
        // atravessa vários cômodos ia ao meio de cada parede — a água quente do sobrado andava 17 m num térreo de 5 m.
        // F14c: cada travessia é um FURO na viga — fora da zona de 2h junto do apoio (NBR 6118, 13.2.5.1) quando a parede
        // comporta, e a 2h entre si; sem posição boa, fica a do meio (os cômodos não se desligam; a lista a marca).
        const meia = c.comum / 2;
        const ate = meia - folga - TRAVESSIA_MINIMA_MM / 2;
        const h = alturaDaVigaSobre(c.m, c.u);
        const apoios = apoiosAoLongo(c.m, c.u);
        const zona = h * DISTANCIA_DO_APOIO_EM_ALTURAS;
        // Correção 1: a candidata a 2h + meio furo da face do apoio (a face do furo a 2h), e a 2h + um furo da vizinha.
        const zonaDoFuro = zona + MEIO_FURO_MAXIMO_MM;
        const entreFuros = h * HIPOTESES_DOS_FUROS_PADRAO.distanciaEntreFurosEmAlturas + 2 * MEIO_FURO_MAXIMO_MM;
        const candidatas = ate >= TRAVESSIA_MINIMA_MM ? [0, -ate, ate, ...apoios.flatMap((t) => [t - zonaDoFuro, t + zonaDoFuro])].filter((d) => Math.abs(d) <= ate + 1) : [0];
        const livre = (d: number) => !h || foraDaZonaDoApoio(c.m, c.u, aoLongo(c.m, c.u, d));
        const escolhidas: number[] = [];
        for (const d of [...new Set(candidatas.map((x) => Math.round(x)))].sort((x, y) => Math.abs(x) - Math.abs(y))) {
          if (!livre(d) || escolhidas.some((e) => Math.abs(e - d) < Math.max(h ? entreFuros : 0, TRAVESSIA_MINIMA_MM))) continue;
          if (escolhidas.length < 3) escolhidas.push(d);
        }
        const desvios = escolhidas.length ? escolhidas : [0];
        for (const d of desvios) {
          const m = aoLongo(c.m, c.u, d);
          const pa = pe(A, c.ka, m);
          const pb = pe(B, c.kb, m);
          if (!pa || !pb) continue;
          saida.push(parede(`forro:travessia:${A.spaceId}:${B.spaceId}:${chave}:${Math.round(d)}`, pa, pb));
        }
      }
    }
  }
  return saida;
}

/**
 * F27 item 5 da casa automática (19/10/2026): os RAMAIS que correm na laje do pavimento de CIMA (horizontais de outra
 * rede, abaixo do piso dele — o esgoto do banheiro do 1º entre a parede dele e o shaft colado, fora da laje rebaixada)
 * cuja cota REAL encosta na faixa (`cotaMm` + `raioMm` + `folgaMm`, pelas elevações dos pavimentos): viram obstáculo, a
 * faixa de baixo os contorna como contorna pilar. Pela régua das chaves a cota 0 de cima é o teto de baixo, e o ramal a
 * −16 cm parecia 115 mm acima do eletroduto; no espaço, os 10 cm da laje o põem colado nele.
 */
export function ramaisDaLajeDeCima(model: BlueprintModel, levelId: ObjectId, cotaMm: number, disciplina: DisciplinaDeRede, raioMm: number, folgaMm = 10): Point[][] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const i = niveis.findIndex((l) => l.id === levelId);
  const deCima = i >= 0 ? niveis[i + 1] : undefined;
  if (!deCima) return [];
  const zFaixa = niveis[i].elevationMm + cotaMm;
  const saida: Point[][] = [];
  for (const t of model.trechos ?? []) {
    if (t.levelId !== deCima.id || t.disciplina === disciplina) continue;
    // F27 item 5.3: e o PÉ das verticais de cima que desce na laje (a coluna de ventilação que nasce no ramal, a −17 cm).
    if (t.a.x === t.b.x && t.a.y === t.b.y) {
      const zPe = deCima.elevationMm + Math.min(t.cotaAMm, t.cotaBMm);
      if (Math.min(t.cotaAMm, t.cotaBMm) >= 0) continue;
      const env = envelopeDoTrecho(t);
      const r = Math.max(env.raioPlantaMm, env.raioVerticalMm);
      if (zPe >= zFaixa + raioMm + folgaMm) continue;
      const h = Math.ceil(r + raioMm + folgaMm);
      saida.push([{ x: t.a.x - h, y: t.a.y - h }, { x: t.a.x + h, y: t.a.y - h }, { x: t.a.x + h, y: t.a.y + h }, { x: t.a.x - h, y: t.a.y + h }] as Point[]);
      continue;
    }
    if (Math.max(t.cotaAMm, t.cotaBMm) > 0) continue;
    const env = envelopeDoTrecho(t);
    const r = Math.max(env.raioPlantaMm, env.raioVerticalMm);
    const zTubo = deCima.elevationMm + Math.min(t.cotaAMm, t.cotaBMm);
    if (zTubo - r >= zFaixa + raioMm + folgaMm) continue;
    const h = Math.ceil(r + raioMm + folgaMm);
    const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) || 1;
    const u = { x: (t.b.x - t.a.x) / L, y: (t.b.y - t.a.y) / L };
    const n = { x: -u.y, y: u.x };
    const c = (p: { x: number; y: number }, su: number, sn: number) => ({ x: Math.round(p.x + u.x * su * h + n.x * sn * h), y: Math.round(p.y + u.y * su * h + n.y * sn * h) });
    saida.push([c(t.a, -1, -1), c(t.b, 1, -1), c(t.b, 1, 1), c(t.a, -1, 1)] as Point[]);
  }
  return saida;
}

/**
 * As PRUMADAS de outras redes que atravessam a cota da faixa no pavimento — a coluna da água fria descendo da laje até
 * a faixa dela cruza as faixas de cima. Viram obstáculo (um quadrado com o raio das duas e folga) para quem traça
 * DEPOIS: a árvore contorna como contorna pilar. Quem traçou antes não as vê — por isso a ordem conta.
 */
export function prumadasQueCruzam(model: BlueprintModel, levelId: ObjectId, cotaMm: number, disciplina: DisciplinaDeRede, raioMm: number, folgaMm = 10, incluirShafts = true): Point[][] {
  // O SHAFT do pavimento: as colunas descem nele (a fria no centro, a quente na faixa dela) — o anel do cômodo que o
  // contém não passa por dentro (no sobrado, o anel da quente cruzava a coluna da fria no meio do shaft).
  const saida: Point[][] = incluirShafts
    ? (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT' && pavimentosDoNucleo(model, n).some((l) => l.id === levelId)).map((n) => n.ring.map((p) => ({ x: p.x, y: p.y })) as Point[])
    : [];
  for (const t of model.trechos ?? []) {
    if (t.levelId !== levelId || t.disciplina === disciplina || t.a.x !== t.b.x || t.a.y !== t.b.y) continue;
    if (Math.min(t.cotaAMm, t.cotaBMm) >= cotaMm + raioMm || Math.max(t.cotaAMm, t.cotaBMm) <= cotaMm - raioMm) continue;
    const env = envelopeDoTrecho(t);
    const h = Math.ceil(Math.max(env.raioPlantaMm, env.raioVerticalMm) + raioMm + folgaMm);
    const { x, y } = t.a;
    saida.push([{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }] as Point[]);
  }
  // F14c: a LAJE REBAIXADA (sob o banheiro de cima) desce até o plenum — acima dela é o piso do banheiro: nenhuma faixa
  // passa ali, de nenhuma rede. A pegada dela vira obstáculo, contornado no forro.
  const teto = model.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? Infinity;
  for (const s of model.structures ?? []) {
    if (s.kind !== 'LAJE' || s.levelId !== levelId || s.baseMm >= teto - 1 || s.baseMm >= cotaMm + raioMm) continue;
    saida.push(s.pontos.map((p) => ({ x: p.x, y: p.y })) as Point[]);
  }
  // E a LUZ de teto (na face do forro) e o QUADRO: o eletroduto vai subir dali até a faixa dele, atravessando as de
  // baixo (a travessia da fria passava bem onde os eletrodutos do quadro sobem).
  if (disciplina !== 'ELETRICA') {
    for (const q of model.quadros ?? []) {
      if (q.levelId !== levelId || q.cotaMm >= cotaMm) continue;
      const h = Math.ceil(RAIO_DA_SUBIDA_DO_QUADRO_MM + raioMm + folgaMm);
      const { x, y } = q.at;
      saida.push([{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }] as Point[]);
    }
    for (const t of model.terminais ?? []) {
      if (t.levelId !== levelId || t.tipoEletrico !== 'ILUMINACAO_TETO' || t.cotaMm >= cotaMm) continue;
      const h = Math.ceil(RAIO_DO_ELETRODUTO_DA_LUZ_MM + raioMm + folgaMm);
      const { x, y } = t.at;
      saida.push([{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }] as Point[]);
    }
  }
  return saida;
}

/** Os eletrodutos que sobem do quadro (o tronco chega a DN 75). */
const RAIO_DA_SUBIDA_DO_QUADRO_MM = 37.5;
/** O eletroduto que sobe da luminária (DN 25). */
const RAIO_DO_ELETRODUTO_DA_LUZ_MM = 12.5;

/** F14b: o custo de cada lado do contorno de um obstáculo no forro (shaft, prumada, pilar), mm — pequeno: contornar é o caminho. */
export const PENALIDADE_DO_CONTORNO_NO_FORRO_MM = 200;

/** F14b: no forro, o ponto encaixa no ANEL do cômodo — a travessia é só passagem (ver `arvorePelasParedes`). */
export const encaixaNoAnel = (w: Pick<Wall, 'id'>): boolean => !w.id.startsWith('forro:travessia:');

/** O fundo da viga de teto mais baixa que passa sobre `p` (com o raio do tubo), ou `null`. */
export function fundoDaVigaSobre(model: BlueprintModel, levelId: ObjectId, p: P2, raioMm: number): number | null {
  let fundo: number | null = null;
  for (const v of vigasDeTeto(model, levelId)) {
    for (let k = 0; k + 1 < v.pontos.length; k++) {
      const a = v.pontos[k];
      const b = v.pontos[k + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (d <= v.larguraMm / 2 + raioMm && (fundo == null || v.baseMm < fundo)) fundo = v.baseMm;
    }
  }
  return fundo;
}

/** Item 6: a folga entre a borda da laje rebaixada e a descida que sai dela pela parede, mm. */
export const SAIDA_DO_REBAIXO_FOLGA_MM = 20;

/**
 * Item 6 da casa automática (19/10/2026): o ponto de parede SOB uma laje rebaixada (o rebaixo do banheiro de cima desce
 * até o forro do de baixo, e o ramal de esgoto corre nele). A faixa não passa sobre o rebaixo: a rede chega por fora,
 * pela própria parede — o ponto de saída `s` na face da parede, fora do rebaixo (a borda mais perto, andando pelo eixo),
 * de onde a descida vem da faixa até `cotaMm` (abaixo do rebaixo e da viga da parede, com a folga e o raio), corre na
 * parede até o ponto e desce. `null` quando o ponto não está sob rebaixo, não tem parede, não acha saída ao alcance ou a
 * corrida cruzaria porta ou janela — fica o de antes. Sem isso, o eletroduto ia reto pela faixa até o ponto, por dentro
 * do rebaixo, e descia nele cruzando o ramal (sobrado 10 × 30, 4 dorm.).
 */
export function saidaDoRebaixoPelaParede(
  model: BlueprintModel,
  levelId: ObjectId,
  at: P2,
  cotaDoPontoMm: number,
  raioMm: number,
  folgaSobAVigaMm: number,
  alcanceMm = 3000,
  passoMm = 50,
): { s: P2; cotaMm: number } | null {
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return null;
  const rebaixos = (model.structures ?? [])
    .filter((x) => x.kind === 'LAJE' && x.levelId === levelId && x.baseMm < nivel.defaultHeightMm - 1)
    .map((x) => ({ anel: pegadaEmPlanta(x) as Point[], base: x.baseMm }));
  const sobre = (p: P2) => rebaixos.filter((r) => pointInPolygon(r.anel, p as Point));
  if (!sobre(at).length) return null;
  const e = encaixarNaParede(at, model.walls.filter((w) => w.levelId === levelId), 600);
  if (!e) return null;
  const w = e.parede;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (L < 1) return null;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const off = { x: at.x - e.q.x, y: at.y - e.q.y };
  const t0 = (e.q.x - w.a.x) * u.x + (e.q.y - w.a.y) * u.y;
  const naFace = (t: number): P2 => ({ x: Math.round(w.a.x + u.x * t + off.x), y: Math.round(w.a.y + u.y * t + off.y) });
  const margem = raioMm + SAIDA_DO_REBAIXO_FOLGA_MM;
  const fora = (t: number) => [t - margem, t, t + margem].every((x) => !sobre(naFace(x)).length);
  let tS: number | null = null;
  for (let d = passoMm; d <= alcanceMm && tS == null; d += passoMm)
    for (const k of [1, -1]) {
      const t = t0 + k * d;
      if (t < margem || t > L - margem) continue;
      if (fora(t)) {
        tS = t;
        break;
      }
    }
  if (tS == null) return null;
  // A cota da corrida: abaixo do rebaixo e da viga sobre a parede em todo o caminho.
  let cota = nivel.defaultHeightMm;
  const [lo, hi] = [Math.min(t0, tS), Math.max(t0, tS)];
  for (let t = lo; t <= hi + 1; t += passoMm) {
    const p = naFace(Math.min(t, hi));
    for (const r of sobre(p)) cota = Math.min(cota, r.base - folgaSobAVigaMm - raioMm);
    const viga = fundoDaVigaSobre(model, levelId, { x: w.a.x + u.x * Math.min(t, hi), y: w.a.y + u.y * Math.min(t, hi) }, raioMm);
    if (viga != null) cota = Math.min(cota, viga - folgaSobAVigaMm - raioMm);
  }
  cota = Math.floor(cota);
  if (cota <= cotaDoPontoMm) return null;
  // Nem porta nem janela no caminho, na altura da corrida.
  for (const o of model.openings) {
    if (o.wallId !== w.id) continue;
    if (o.offsetMm + o.widthMm < lo - raioMm || o.offsetMm > hi + raioMm) continue;
    if (cota + raioMm > o.sillMm && cota - raioMm < o.sillMm + o.heightMm) return null;
  }
  return { s: naFace(tS), cotaMm: cota };
}

export interface PedacoDaDescida {
  a: P2;
  b: P2;
  cotaAMm: number;
  cotaBMm: number;
}

/** F20: o raio presumido do tubo que ainda descerá até um ponto da outra água, mm. */
const RAIO_DA_PRUMADA_FUTURA_MM = 12.5;

/** Os tubos de OUTRAS redes perto da descida (no mundo) e, F20, as prumadas que ainda virão até os pontos da outra água. */
function obstaculosDaDescida(
  model: BlueprintModel,
  levelId: ObjectId,
  o: { q: P2; cotaDaFaixaMm: number; alvo: P2; disciplina?: DisciplinaDeRede | null },
  w: P2 | null,
  parede: ReturnType<typeof paredeQueContem>,
): { e0: number; outros: { A: { x: number; y: number; z: number }; B: { x: number; y: number; z: number }; r: number; futura?: boolean }[] } {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const e0 = elevacao.get(levelId) ?? 0;
  const alcance = DESLIZE_DA_DESCIDA_MM + Math.hypot(o.q.x - (w ?? o.alvo).x, o.q.y - (w ?? o.alvo).y) + 300;
  const outros: { A: { x: number; y: number; z: number }; B: { x: number; y: number; z: number }; r: number; futura?: boolean }[] = (model.trechos ?? [])
    .filter((t) => t.disciplina !== o.disciplina && Math.min(t.a.x, t.b.x) < o.q.x + alcance && Math.max(t.a.x, t.b.x) > o.q.x - alcance && Math.min(t.a.y, t.b.y) < o.q.y + alcance && Math.max(t.a.y, t.b.y) > o.q.y - alcance)
    .map((t) => {
      const env = envelopeDoTrecho(t);
      const e = elevacao.get(t.levelId) ?? 0;
      return { A: { x: t.a.x, y: t.a.y, z: e + t.cotaAMm }, B: { x: t.b.x, y: t.b.y, z: e + t.cotaBMm }, r: Math.max(env.raioPlantaMm, env.raioVerticalMm) };
    });
  // F20 da casa automática (17/10/2026): o ponto da OUTRA água ainda sem tubo é a prumada que ainda virá — a descida do
  // forro até ele, no ponto e no eixo da parede. A fria (traçada antes) escorregava na parede e voltava na cota da pia
  // passando diante do ponto da quente; a quente, depois, cruzava a fria para chegar a ele (cozinha, 15 × 30).
  const outraAgua = o.disciplina === 'AGUA_FRIA' ? 'AGUA_QUENTE' : o.disciplina === 'AGUA_QUENTE' ? 'AGUA_FRIA' : null;
  if (outraAgua) {
    const pontas = new Set((model.trechos ?? []).filter((t) => t.levelId === levelId && t.disciplina === outraAgua).flatMap((t) => [`${t.a.x},${t.a.y},${t.cotaAMm}`, `${t.b.x},${t.b.y},${t.cotaBMm}`]));
    for (const k of model.terminais ?? []) {
      if (k.levelId !== levelId || k.disciplina !== outraAgua || k.cotaMm >= o.cotaDaFaixaMm || pontas.has(`${k.at.x},${k.at.y},${k.cotaMm}`)) continue;
      if (Math.abs(k.at.x - o.q.x) > alcance || Math.abs(k.at.y - o.q.y) > alcance) continue;
      const lugares: P2[] = [k.at];
      if (parede) {
        const s0 = (k.at.x - parede.parede.a.x) * parede.u.x + (k.at.y - parede.parede.a.y) * parede.u.y;
        lugares.push({ x: parede.parede.a.x + parede.u.x * s0, y: parede.parede.a.y + parede.u.y * s0 });
      }
      // Só a parte DENTRO da parede: no forro, o cruzamento das faixas já é resolvido (F14b/F16).
      for (const q of lugares) outros.push({ A: { x: q.x, y: q.y, z: e0 + k.cotaMm }, B: { x: q.x, y: q.y, z: e0 + o.cotaDaFaixaMm - 100 }, r: RAIO_DA_PRUMADA_FUTURA_MM, futura: true });
    }
  }
  return { e0, outros };
}

/**
 * Do nó da rede no forro (`q`, na cota da faixa) até a peça (`alvo`, na cota dela).
 *
 * - Peça EMBUTIDA (`naParede` = onde ela fica dentro da alvenaria): desce em `q` até logo abaixo da viga que passa
 *   sobre a parede ali (`folgaSobAVigaMm` + raio), entra na parede, desce até a cota da peça e sai à face. Sem viga
 *   em cima, entra na parede na própria faixa. A que desceria por dentro de um vão de porta ou janela corre na
 *   parede, acima dele, até o lado do batente e desce ali.
 * - Peça APARENTE na face (`naParede` = null — a evaporadora): desce em `q` até a cota dela e vai até ela.
 *
 * Devolve os pedaços na ordem, do forro à peça; nenhum de comprimento zero.
 *
 * F14c (16/10/2026): a entrada na parede é em ÂNGULO RETO — do nó, reto até o eixo (ou a face) da parede, e por
 * dentro dela, abaixo da viga, até o ponto. Antes ia em diagonal do nó ao ponto, pendurada no cômodo: com o nó
 * empurrado por um shaft ou uma prumada, a da fria e a da quente se cruzavam (sobrado: 1,26 m de diagonal sobre o
 * tubo de queda). Com `disciplina`, o nó ESCORREGA pelo contorno (até 40 cm, de 5 em 5) quando a descida cruzaria um
 * tubo de outra rede já traçado — a travessia de viga da fria passando justo onde a quente descia — ou quando a
 * corrida dentro da parede passaria por um vão. Sem lugar livre, fica no nó.
 */
export function descidaDoForro(
  model: BlueprintModel,
  levelId: ObjectId,
  o: { q: P2; cotaDaFaixaMm: number; alvo: P2; cotaDoAlvoMm: number; naParede: P2 | null; raioMm: number; folgaSobAVigaMm: number; disciplina?: DisciplinaDeRede | null },
): PedacoDaDescida[] {
  // F18 da casa automática: o ponto na parede DENTRO do vão de uma janela (a máquina de lavar sob a janela) — acima dele
  // só há a verga, e a descida e o trecho na parede passavam pelo vão. A descida entra na parede AO LADO da janela,
  // desce até a cota do ponto (abaixo do peitoril) e corre por baixo até ele.
  if (o.naParede) {
    // F20: dos dois batentes, o primeiro (o mais perto antes) cuja corrida por baixo da janela até o ponto não cruza
    // outra rede nem a prumada que ainda virá — a fria contornava pelo batente onde o ponto da quente ia descer.
    const laterais = ladosForaDoVao(model, levelId, o.naParede, Math.min(o.cotaDoAlvoMm, o.cotaDaFaixaMm), Math.max(o.cotaDoAlvoMm, o.cotaDaFaixaMm), o.raioMm);
    const naParede = o.naParede;
    const corridaLivre = (lat: P2) => {
      if (!o.disciplina) return true;
      const { e0, outros } = obstaculosDaDescida(model, levelId, o, naParede, paredeQueContem(model, levelId, naParede));
      const A = { x: lat.x, y: lat.y, z: e0 + o.cotaDoAlvoMm };
      const B = { x: naParede.x, y: naParede.y, z: e0 + o.cotaDoAlvoMm };
      return outros.every((t) => distanciaEntreEixos3D(A, B, t.A, t.B) > o.raioMm + t.r + FOLGA_DA_DESCIDA_MM);
    };
    const comLateral = (lateral: P2): PedacoDaDescida[] | null => {
      const abaixo = !foraDoVao(model, levelId, naParede, o.cotaDoAlvoMm - o.raioMm, o.cotaDoAlvoMm + o.raioMm, o.raioMm);
      if (!abaixo || (lateral.x === naParede.x && lateral.y === naParede.y)) return null;
      // O nó do forro anda junto, no forro (a faixa), para descer já ao lado da janela.
      const q2 = { x: Math.round(o.q.x + lateral.x - naParede.x), y: Math.round(o.q.y + lateral.y - naParede.y) };
      const ate = descidaDoForro(model, levelId, { ...o, q: q2, naParede: lateral, alvo: lateral });
      const inicio: PedacoDaDescida[] = q2.x !== o.q.x || q2.y !== o.q.y ? [{ a: { ...o.q }, b: q2, cotaAMm: o.cotaDaFaixaMm, cotaBMm: o.cotaDaFaixaMm }] : [];
      const fim: PedacoDaDescida[] = [{ a: lateral, b: { ...naParede }, cotaAMm: o.cotaDoAlvoMm, cotaBMm: o.cotaDoAlvoMm }];
      if (o.alvo.x !== naParede.x || o.alvo.y !== naParede.y) fim.push({ a: { ...naParede }, b: { ...o.alvo }, cotaAMm: o.cotaDoAlvoMm, cotaBMm: o.cotaDoAlvoMm });
      return [...inicio, ...ate, ...fim];
    };
    // F22: a descida INTEIRA pelo batente (o deslocamento no forro, a descida e a corrida por baixo) livre dos tubos de
    // verdade — o nó do forro, andando junto, caía sobre a linha da fria no forro, e a quente descia através dela.
    const semEncontro = (ps: PedacoDaDescida[]) => {
      if (!o.disciplina) return true;
      const { e0, outros } = obstaculosDaDescida(model, levelId, o, naParede, paredeQueContem(model, levelId, naParede));
      return ps.every((pd) => outros.filter((t) => !t.futura).every((t) => distanciaEntreEixos3D({ x: pd.a.x, y: pd.a.y, z: e0 + pd.cotaAMm }, { x: pd.b.x, y: pd.b.y, z: e0 + pd.cotaBMm }, t.A, t.B) > o.raioMm + t.r + FOLGA_DA_DESCIDA_MM));
    };
    const opcoes = [...laterais.filter(corridaLivre), ...laterais.filter((l) => !corridaLivre(l))].map(comLateral).filter((x): x is PedacoDaDescida[] => !!x);
    const escolhida = opcoes.find(semEncontro) ?? opcoes[0] ?? null;
    if (escolhida) return escolhida;
  }
  const w = o.naParede;
  const parede = w ? paredeQueContem(model, levelId, w) : null;
  const entraEm = (ps: P2[]) => {
    let entra = o.cotaDaFaixaMm;
    for (const p of ps) {
      const fundo = fundoDaVigaSobre(model, levelId, p, o.raioMm);
      if (fundo != null) entra = Math.min(entra, fundo - o.folgaSobAVigaMm - o.raioMm);
    }
    return Math.max(entra, o.cotaDoAlvoMm);
  };
  /** Do forro ao ponto da parede (`w`, na cota de entrada) descendo em `q` — a parte que depende do nó. */
  const cabeca = (q: P2, reto: boolean): { pts: { p: P2; z: number }[]; entra: number; noEixo: P2 | null } => {
    const pts: { p: P2; z: number }[] = [{ p: o.q, z: o.cotaDaFaixaMm }];
    const ir = (p: P2, z: number) => {
      const u = pts[pts.length - 1];
      const r = { x: Math.round(p.x), y: Math.round(p.y) };
      if (u.p.x === r.x && u.p.y === r.y && u.z === Math.round(z)) return;
      pts.push({ p: r, z: Math.round(z) });
    };
    ir(q, o.cotaDaFaixaMm);
    if (!w) {
      ir(q, o.cotaDoAlvoMm);
      return { pts, entra: o.cotaDoAlvoMm, noEixo: null };
    }
    const s = parede ? (q.x - w.x) * parede.u.x + (q.y - w.y) * parede.u.y : 0;
    const noEixo = reto && parede ? { x: w.x + parede.u.x * s, y: w.y + parede.u.y * s } : null;
    const entra = entraEm(noEixo ? [w, noEixo] : [w]);
    ir(q, entra);
    if (noEixo) ir(noEixo, entra);
    ir(w, entra);
    return { pts, entra, noEixo };
  };
  const montar = (c: ReturnType<typeof cabeca>): PedacoDaDescida[] => {
    const pts = [...c.pts];
    const ir = (p: P2, z: number) => {
      const u = pts[pts.length - 1];
      const r = { x: Math.round(p.x), y: Math.round(p.y) };
      if (u.p.x === r.x && u.p.y === r.y && u.z === Math.round(z)) return;
      pts.push({ p: r, z: Math.round(z) });
    };
    if (w) {
      const desvio = foraDoVao(model, levelId, w, Math.min(c.entra, o.cotaDoAlvoMm), Math.max(c.entra, o.cotaDoAlvoMm), o.raioMm);
      if (desvio) {
        ir(desvio, c.entra);
        ir(desvio, o.cotaDoAlvoMm);
      }
      ir(w, o.cotaDoAlvoMm);
    }
    ir(o.alvo, o.cotaDoAlvoMm);
    const saida: PedacoDaDescida[] = [];
    for (let i = 1; i < pts.length; i++) saida.push({ a: pts[i - 1].p, b: pts[i].p, cotaAMm: pts[i - 1].z, cotaBMm: pts[i].z });
    return saida;
  };
  if (!o.disciplina) return montar(cabeca(o.q, true));

  // Os tubos de OUTRAS redes por perto (no mundo: cota + elevação do pavimento) e as prumadas que ainda virão.
  const { e0, outros } = obstaculosDaDescida(model, levelId, o, w, parede);
  const livre = (c: ReturnType<typeof cabeca>, comFuturas = true) => {
    for (let i = 1; i < c.pts.length; i++) {
      const A = { x: c.pts[i - 1].p.x, y: c.pts[i - 1].p.y, z: e0 + c.pts[i - 1].z };
      const B = { x: c.pts[i].p.x, y: c.pts[i].p.y, z: e0 + c.pts[i].z };
      for (const t of outros) if ((comFuturas || !t.futura) && distanciaEntreEixos3D(A, B, t.A, t.B) <= o.raioMm + t.r + FOLGA_DA_DESCIDA_MM) return false;
    }
    // F18 da casa automática: nem por dentro de PILAR — a ligação do aquecedor ao anel corria na parede externa e
    // atravessava o pilar da esquina (R1-A).
    const aneisDosPilares = pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, o.raioMm) as Point[]);
    for (let i = 1; i < c.pts.length; i++) if (fracaoDentro(c.pts[i - 1].p, c.pts[i].p, aneisDosPilares) > 0) return false;
    // A corrida dentro da parede (do pé do nó até `w`) não passa por porta nem janela.
    if (parede && c.noEixo && w) {
      const L = Math.hypot(parede.parede.b.x - parede.parede.a.x, parede.parede.b.y - parede.parede.a.y);
      const ao = (p: P2) => (p.x - parede.parede.a.x) * parede.u.x + (p.y - parede.parede.a.y) * parede.u.y;
      const [de, ate] = [Math.min(ao(c.noEixo), ao(w)), Math.max(ao(c.noEixo), ao(w))];
      for (const v of model.openings) {
        if (v.wallId !== parede.parede.id) continue;
        if (ate < v.offsetMm - o.raioMm || de > v.offsetMm + v.widthMm + o.raioMm || de > L) continue;
        if (c.entra + o.raioMm > v.sillMm && c.entra - o.raioMm < v.sillMm + v.heightMm) return false;
      }
    }
    return true;
  };
  /**
   * F18 da casa automática: a VERTICAL dentro da parede (da entrada à cota do ponto) também não cruza outra rede — o
   * eletroduto que descia até o ponto de força do ar cortava a água que corre na parede (R1-B). Cruzando, ela anda na
   * parede até o lado (`DESLIZE_DA_DESCIDA_MM`, fora do vão), desce ali e volta na cota do ponto.
   */
  const segLivre = (a: P2, za: number, b: P2, zb: number) =>
    outros.every((t) => distanciaEntreEixos3D({ x: a.x, y: a.y, z: e0 + za }, { x: b.x, y: b.y, z: e0 + zb }, t.A, t.B) > o.raioMm + t.r + FOLGA_DA_DESCIDA_MM);
  const aneisDoEscorregao = pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, o.raioMm) as Point[]);
  const semCruzarNaParede = (c: ReturnType<typeof cabeca>): PedacoDaDescida[] => {
    if (!w || !parede || segLivre(w, c.entra, w, o.cotaDoAlvoMm)) return montar(c);
    for (let s = PASSO_DO_DESLIZE_MM; s <= DESLIZE_DA_DESCIDA_MM; s += PASSO_DO_DESLIZE_MM) {
      for (const k of [1, -1]) {
        const w2 = { x: Math.round(w.x + parede.u.x * s * k), y: Math.round(w.y + parede.u.y * s * k) };
        if (!segLivre(w, c.entra, w2, c.entra) || !segLivre(w2, c.entra, w2, o.cotaDoAlvoMm) || !segLivre(w2, o.cotaDoAlvoMm, w, o.cotaDoAlvoMm)) continue;
        // F20: e não entra em PILAR ao andar na parede — com as prumadas futuras, ela escorrega mais e atravessava o pilar
        // da parede (R1-A, 15 × 30 4 dorm.).
        if (fracaoDentro(w, w2, aneisDoEscorregao) > 0 || aneisDoEscorregao.some((g) => pointInPolygon(g, w2 as Point))) continue;
        if (foraDoVao(model, levelId, w2, Math.min(c.entra, o.cotaDoAlvoMm), Math.max(c.entra, o.cotaDoAlvoMm), o.raioMm)) continue;
        if (!dentroDaParede(parede.parede, w2)) continue;
        const pts = [...c.pts, { p: w2, z: c.entra }, { p: w2, z: o.cotaDoAlvoMm }, { p: { x: Math.round(w.x), y: Math.round(w.y) }, z: o.cotaDoAlvoMm }, { p: { x: Math.round(o.alvo.x), y: Math.round(o.alvo.y) }, z: o.cotaDoAlvoMm }];
        const saida: PedacoDaDescida[] = [];
        for (let i = 1; i < pts.length; i++) if (pts[i].p.x !== pts[i - 1].p.x || pts[i].p.y !== pts[i - 1].p.y || pts[i].z !== pts[i - 1].z) saida.push({ a: pts[i - 1].p, b: pts[i].p, cotaAMm: pts[i - 1].z, cotaBMm: pts[i].z });
        return saida;
      }
    }
    return montar(c);
  };
  const inicial = cabeca(o.q, true);
  if (livre(inicial) || !parede) return semCruzarNaParede(inicial);
  // O caminho do escorregão, no forro, não entra em parede, viga, pilar, shaft nem laje rebaixada.
  const barreiras = [...pegadasDePilares(model, levelId), ...prumadasQueCruzam(model, levelId, o.cotaDaFaixaMm, o.disciplina, o.raioMm, 2, true)];
  // F27 item 5: sem o SHAFT — o último recurso desce dentro dele (as colunas de verdade nele, o `livre` confere).
  const barreirasSemShaft = [...pegadasDePilares(model, levelId), ...prumadasQueCruzam(model, levelId, o.cotaDaFaixaMm, o.disciplina, o.raioMm, 2, false)];
  const paredesDoNivel = model.walls.filter((x) => x.levelId === levelId);
  const passa = (p: P2, semShaft = false) =>
    fundoDaVigaSobre(model, levelId, p, o.raioMm) == null &&
    !(semShaft ? barreirasSemShaft : barreiras).some((g) => pointInPolygon(g, p as Point)) &&
    paredesDoNivel.every((x) => distanciaAoEixo(x, p) > x.thicknessMm / 2 + o.raioMm);
  /**
   * `atravessa` (F27 item 5 da casa automática, 19/10/2026): o caminho no forro pode passar sobre parede e viga (a faixa
   * corre na laje, como a própria árvore) e o ponto da descida pode cair no SHAFT — o nó do forro caía do outro lado
   * da parede do ponto, e a corrida na face atravessava a parede e o pilar do encontro (10 × 30 4 dorm., 2º pavimento);
   * a fria que sai do shaft corria na parede pelo pilar até a máquina de lavar (R1-A, térreo).
   */
  const buscar = (comFuturas: boolean, atravessa = false): ReturnType<typeof cabeca> | null => {
    for (let s = PASSO_DO_DESLIZE_MM; s <= DESLIZE_DA_DESCIDA_MM; s += PASSO_DO_DESLIZE_MM) {
      for (const k of [1, -1]) {
        const q = { x: Math.round(o.q.x + parede.u.x * s * k), y: Math.round(o.q.y + parede.u.y * s * k) };
        let ok = true;
        for (let d = 25; d <= s && ok && !atravessa; d += 25) ok = passa({ x: o.q.x + parede.u.x * d * k, y: o.q.y + parede.u.y * d * k });
        if (!ok || !passa(q, atravessa)) continue;
        const c = cabeca(q, true);
        if (livre(c, comFuturas)) return c;
      }
    }
    return null;
  };
  const achada = buscar(true);
  if (achada) return semCruzarNaParede(achada);
  // F20: sem lugar que respeite também as prumadas que AINDA virão, o que respeita as redes de verdade e o pilar — o
  // último recurso (o nó inicial, como está) atravessava o pilar da parede (R1-A, 15 × 30 4 dorm.).
  if (livre(inicial, false)) return semCruzarNaParede(inicial);
  const semFuturas = buscar(false);
  if (semFuturas) return semCruzarNaParede(semFuturas);
  // F27 item 5: por último, o nó que passa sobre a parede no forro e desce do lado do ponto.
  return semCruzarNaParede(buscar(true, true) ?? buscar(false, true) ?? inicial);
}

/** F18: o ponto cai no comprimento da parede (o deslize na parede não sai pela ponta dela). */
const dentroDaParede = (x: Wall, p: P2) => {
  const L = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y) || 1;
  const t = ((p.x - x.a.x) * (x.b.x - x.a.x) + (p.y - x.a.y) * (x.b.y - x.a.y)) / L;
  return t >= 0 && t <= L;
};

/** F14c: a folga entre a descida e o tubo de outra rede, além dos dois raios, mm. */
const FOLGA_DA_DESCIDA_MM = 5;
/** F14c: até onde o nó da descida escorrega pelo contorno, e o passo, mm. */
const DESLIZE_DA_DESCIDA_MM = 400;
const PASSO_DO_DESLIZE_MM = 50;

const distanciaAoEixo = (x: Wall, p: P2) => {
  const dx = x.b.x - x.a.x;
  const dy = x.b.y - x.a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - x.a.x) * dx + (p.y - x.a.y) * dy) / L2));
  return Math.hypot(p.x - (x.a.x + t * dx), p.y - (x.a.y + t * dy));
};

/** A parede do pavimento que contém `w` (no eixo, na face, ou na faixa da água quente — até 60 mm além da face). */
function paredeQueContem(model: BlueprintModel, levelId: ObjectId, w: P2): { parede: Wall; u: P2 } | null {
  let melhor: { parede: Wall; u: P2; d: number } | null = null;
  for (const x of model.walls) {
    if (x.levelId !== levelId) continue;
    const L = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y);
    if (L < 1) continue;
    const u = { x: (x.b.x - x.a.x) / L, y: (x.b.y - x.a.y) / L };
    const t = (w.x - x.a.x) * u.x + (w.y - x.a.y) * u.y;
    const d = Math.abs((w.x - x.a.x) * u.y - (w.y - x.a.y) * u.x);
    if (t < -1 || t > L + 1 || d > x.thicknessMm / 2 + 60) continue;
    if (!melhor || d < melhor.d) melhor = { parede: x, u, d };
  }
  return melhor ? { parede: melhor.parede, u: melhor.u } : null;
}

/**
 * A vertical em `w` de `zLo` a `zHi` cai num vão (porta, janela) da parede de `w`? Devolve o ponto na mesma parede,
 * do lado do batente mais próximo (fora do vão, com folga), onde ela desce; `null` se não cai.
 */
function foraDoVao(model: BlueprintModel, levelId: ObjectId, w: P2, zLo: number, zHi: number, raioMm: number): P2 | null {
  return ladosDoVao(model, levelId, w, zLo, zHi, raioMm, false)[0] ?? null;
}

/** F20: os dois lados do vão (o mais perto primeiro) — vazio se `w` não está em vão. */
function ladosForaDoVao(model: BlueprintModel, levelId: ObjectId, w: P2, zLo: number, zHi: number, raioMm: number): P2[] {
  return ladosDoVao(model, levelId, w, zLo, zHi, raioMm, true);
}

function ladosDoVao(model: BlueprintModel, levelId: ObjectId, w: P2, zLo: number, zHi: number, raioMm: number, todos: boolean): P2[] {
  for (const parede of model.walls) {
    if (parede.levelId !== levelId) continue;
    const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y);
    if (L < 1) continue;
    const u = { x: (parede.b.x - parede.a.x) / L, y: (parede.b.y - parede.a.y) / L };
    const t = (w.x - parede.a.x) * u.x + (w.y - parede.a.y) * u.y;
    const d = Math.abs((w.x - parede.a.x) * u.y - (w.y - parede.a.y) * u.x);
    if (d > parede.thicknessMm / 2 + 1 || t < -1 || t > L + 1) continue;
    for (const v of model.openings) {
      if (v.wallId !== parede.id) continue;
      const de = v.offsetMm - raioMm;
      const ate = v.offsetMm + v.widthMm + raioMm;
      if (t <= de || t >= ate) continue;
      if (zHi <= v.sillMm || zLo >= v.sillMm + v.heightMm) continue;
      const antes = v.offsetMm - raioMm - FOLGA_DO_VAO_MM;
      const depois = v.offsetMm + v.widthMm + raioMm + FOLGA_DO_VAO_MM;
      const lado = t - antes <= depois - t && antes >= 0 ? antes : depois <= L ? depois : antes;
      // O ponto do lado, no mesmo afastamento do eixo que `w`.
      const s = (w.x - parede.a.x) * u.y - (w.y - parede.a.y) * u.x;
      const noLado = (x: number) => ({ x: Math.round(parede.a.x + u.x * x + u.y * s), y: Math.round(parede.a.y + u.y * x - u.x * s) });
      if (todos) return [lado, ...[antes, depois].filter((x) => x !== lado && x >= 0 && x <= L)].map(noLado);
      return [noLado(lado)];
    }
  }
  return [];
}
