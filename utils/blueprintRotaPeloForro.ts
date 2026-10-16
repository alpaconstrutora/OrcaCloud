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
import { anelRecuado, envelopeDoTrecho, envelopeValido, pavimentosDoNucleo, type BlueprintModel, type DisciplinaDeRede, type ObjectId, type Point, type Wall } from './blueprintKernel';
import { semEspiculas } from './blueprintDistribuicao';
import { TOLERANCIA_DO_LADO_MM, paredeContemLado, paredeDoLado } from './blueprintLadoDaParede';

type P2 = { x: number; y: number };

/** A faixa de UMA rede no forro: a cota (abaixo da laje) e o afastamento da face da parede/viga. */
export interface FaixaDoForro {
  /** O eixo da rede a esta distância ABAIXO do teto (o fundo da laje), mm. */
  abaixoDoTetoMm: number;
  /** O eixo da rede a esta distância da FACE da parede (ou da viga, se mais larga), dentro do cômodo, mm. */
  afastamentoDaFaceMm: number;
}

/** A cota da faixa num pavimento: o teto dele menos a distância da faixa. */
export function cotaDaFaixa(tetoMm: number, f: FaixaDoForro): number {
  return Math.round(tetoMm - f.abaixoDoTetoMm);
}

/** Viga "de teto": o topo dela a até isto do teto do pavimento. */
const VIGA_DE_TETO_MM = 200;
/** A travessia só entra onde os dois cômodos dividem ao menos isto de parede, além dos afastamentos. */
const TRAVESSIA_MINIMA_MM = 200;
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

function aneisDoForro(model: BlueprintModel, levelId: ObjectId, afastamentoMm: number): AnelDoForro[] {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const vigas = vigasDeTeto(model, levelId).map((v) => ({ a: v.pontos[0], b: v.pontos[v.pontos.length - 1], largura: v.larguraMm }));
  const saida: AnelDoForro[] = [];
  for (const s of comodosComForro(model, levelId)) {
    const eixo = semEspiculas(s.ring) as Point[];
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
    const recuado = anelRecuado(vertices, recuos);
    // Cômodo estreito demais para o afastamento: fica sem rede no forro (a árvore contorna).
    if (!envelopeValido(vertices, recuado)) continue;
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
        const meia = c.comum / 2;
        const ate = meia - folga - TRAVESSIA_MINIMA_MM / 2;
        const desvios = ate >= TRAVESSIA_MINIMA_MM ? [-ate, 0, ate] : [0];
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

export interface PedacoDaDescida {
  a: P2;
  b: P2;
  cotaAMm: number;
  cotaBMm: number;
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
 */
export function descidaDoForro(
  model: BlueprintModel,
  levelId: ObjectId,
  o: { q: P2; cotaDaFaixaMm: number; alvo: P2; cotaDoAlvoMm: number; naParede: P2 | null; raioMm: number; folgaSobAVigaMm: number },
): PedacoDaDescida[] {
  const pts: { p: P2; z: number }[] = [{ p: o.q, z: o.cotaDaFaixaMm }];
  const ir = (p: P2, z: number) => {
    const u = pts[pts.length - 1];
    if (u.p.x === p.x && u.p.y === p.y && u.z === z) return;
    pts.push({ p: { x: Math.round(p.x), y: Math.round(p.y) }, z: Math.round(z) });
  };
  if (!o.naParede) {
    ir(o.q, o.cotaDoAlvoMm);
    ir(o.alvo, o.cotaDoAlvoMm);
  } else {
    const w = o.naParede;
    const fundo = fundoDaVigaSobre(model, levelId, w, o.raioMm);
    let entra = fundo == null ? o.cotaDaFaixaMm : Math.min(o.cotaDaFaixaMm, fundo - o.folgaSobAVigaMm - o.raioMm);
    if (entra < o.cotaDoAlvoMm) entra = o.cotaDoAlvoMm;
    ir(o.q, entra);
    ir(w, entra);
    const desvio = foraDoVao(model, levelId, w, Math.min(entra, o.cotaDoAlvoMm), Math.max(entra, o.cotaDoAlvoMm), o.raioMm);
    if (desvio) {
      ir(desvio, entra);
      ir(desvio, o.cotaDoAlvoMm);
    }
    ir(w, o.cotaDoAlvoMm);
    ir(o.alvo, o.cotaDoAlvoMm);
  }
  const saida: PedacoDaDescida[] = [];
  for (let i = 1; i < pts.length; i++) saida.push({ a: pts[i - 1].p, b: pts[i].p, cotaAMm: pts[i - 1].z, cotaBMm: pts[i].z });
  return saida;
}

/**
 * A vertical em `w` de `zLo` a `zHi` cai num vão (porta, janela) da parede de `w`? Devolve o ponto na mesma parede,
 * do lado do batente mais próximo (fora do vão, com folga), onde ela desce; `null` se não cai.
 */
function foraDoVao(model: BlueprintModel, levelId: ObjectId, w: P2, zLo: number, zHi: number, raioMm: number): P2 | null {
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
      return { x: Math.round(parede.a.x + u.x * lado + u.y * s), y: Math.round(parede.a.y + u.y * lado - u.x * s) };
    }
  }
  return null;
}
