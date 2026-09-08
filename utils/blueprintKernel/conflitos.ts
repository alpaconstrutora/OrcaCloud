import { pointInPolygon, type Point } from './geom';
import type { BlueprintModel, ObjectId, Trecho } from './model';
import { pegadaEmPlanta } from './sobreposicao';

/**
 * CONFLITO — uma instalação ocupando o mesmo espaço que outra coisa.
 *
 * ─── ⚠️ ISTO NÃO É `sobreposicao.ts`, E CONFUNDIR OS DOIS SERIA CARO ────────
 *
 * `sobreposicao.ts` mede parede × pilar, e a saída dele vira DESCONTO no
 * quantitativo: o mesmo metro cúbico não pode ser pago como concreto e como
 * alvenaria. É um problema de DINHEIRO.
 *
 * Um cano atravessando uma viga é outra coisa inteiramente. Ninguém desconta
 * volume de concreto porque passou um eletroduto por dentro — o furo é
 * desprezível e, se não for, ele é decisão de projeto estrutural, não uma
 * subtração automática. É um problema de COORDENAÇÃO: alguém tem de olhar e
 * decidir se fura, se desvia ou se muda a viga.
 *
 * Reusar o caminho do desconto faria a tubulação comer concreto da estrutura —
 * exatamente o erro que `sobreposicao.ts` existe para impedir, de cabeça para
 * baixo. Por isso este arquivo tem saída PRÓPRIA e não toca no quantitativo.
 *
 * ─── ⚠️ CANO DENTRO DE PAREDE NÃO É CONFLITO ────────────────────────────────
 *
 * É onde ele mora. Eletroduto sobe embutido na alvenaria e cano de água corre
 * dentro dela; rasgo em parede é rotina de obra, não pendência de projeto.
 * Acusar cada um encheria a lista de centenas de linhas normais, e a primeira
 * consequência de uma lista assim é ninguém mais olhar — inclusive nos casos em
 * que a viga está de fato no caminho.
 *
 * O que ENTRA:
 *
 * - **trecho × ESTRUTURA** (pilar, viga, laje, fundação): furar concreto é
 *   decisão, não rotina;
 * - **trecho × trecho de OUTRA disciplina**: dois canos no mesmo lugar. Da
 *   MESMA disciplina não entra — dois trechos de água fria que se encontram são
 *   uma junção, que é a rede funcionando.
 */
export interface Conflito {
  trechoId: ObjectId;
  trechoUid: string;
  /** O outro lado: uma peça estrutural ou outro trecho. */
  outroId: ObjectId;
  outroUid: string;
  classe: 'ESTRUTURA' | 'REDE';
  /**
   * Quanto do trecho corre DENTRO do outro corpo, em mm.
   *
   * Zero num encontro de raspão — o eixo passa por fora, mas a espessura do
   * cano alcança. Zero não é "não há conflito": há, e ele está na lista.
   */
  comprimentoDentroMm: number;
  /** A menor distância entre os EIXOS, em mm. Zero quando eles se cruzam. */
  folgaEntreEixosMm: number;
}

interface Ponto3 {
  x: number;
  y: number;
  z: number;
}

/** As duas pontas do trecho no mundo, já com a cota do pavimento somada. */
export function pontasNoMundo(t: Trecho, elevacaoDoNivelMm: number): [Ponto3, Ponto3] {
  return [
    { x: t.a.x, y: t.a.y, z: elevacaoDoNivelMm + t.cotaAMm },
    { x: t.b.x, y: t.b.y, z: elevacaoDoNivelMm + t.cotaBMm },
  ];
}

/** Distância de um ponto a um segmento, em 2D. */
function distanciaPontoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distância entre dois segmentos em 2D. Zero quando se cruzam. */
function distanciaEntreSegmentos(a: Point, b: Point, c: Point, d: Point): number {
  // Cruzamento próprio: distância zero, sem precisar de projeção.
  const s1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const s2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const s3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const s4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  if (s1 * s2 < 0 && s3 * s4 < 0) return 0;
  return Math.min(
    distanciaPontoSegmento(a, c, d),
    distanciaPontoSegmento(b, c, d),
    distanciaPontoSegmento(c, a, b),
    distanciaPontoSegmento(d, a, b),
  );
}

/**
 * O trecho contra um PRISMA — um polígono em planta extrudado entre duas cotas.
 *
 * ⚠️ A faixa vertical é alargada pelo RAIO do cano antes do corte, e a distância
 * em planta é comparada com o mesmo raio. Sem isso, um cano de 100 mm que passa
 * a 40 mm da face da viga não seria acusado — o EIXO dele está livre, e a
 * tubulação não é uma linha.
 */
function contraPrisma(
  A: Ponto3,
  B: Ponto3,
  raioMm: number,
  anel: Point[],
  zBaixoMm: number,
  zAltoMm: number,
): { dentroMm: number; folgaMm: number } | null {
  if (anel.length < 3) return null;

  const lo = zBaixoMm - raioMm;
  const hi = zAltoMm + raioMm;
  const dz = B.z - A.z;

  // O intervalo de `t` em que o trecho está dentro da faixa de cotas.
  let t0 = 0;
  let t1 = 1;
  if (dz === 0) {
    if (A.z < lo || A.z > hi) return null;
  } else {
    const ta = (lo - A.z) / dz;
    const tb = (hi - A.z) / dz;
    t0 = Math.max(0, Math.min(ta, tb));
    t1 = Math.min(1, Math.max(ta, tb));
    if (t0 > t1) return null;
  }

  const em = (t: number): Ponto3 => ({
    x: A.x + (B.x - A.x) * t,
    y: A.y + (B.y - A.y) * t,
    z: A.z + dz * t,
  });
  const P = em(t0);
  const Q = em(t1);
  const comprimentoDoPedaco = Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);

  // Quanto do pedaço está DENTRO do polígono, exatamente: os pontos de
  // cruzamento com as arestas partem o segmento, e cada pedaço é classificado
  // pelo próprio meio — que é o único ponto que não está em cima de uma aresta.
  const cortes: number[] = [0, 1];
  for (let i = 0; i < anel.length; i++) {
    const c = anel[i];
    const d = anel[(i + 1) % anel.length];
    const den = (Q.x - P.x) * (d.y - c.y) - (Q.y - P.y) * (d.x - c.x);
    if (den === 0) continue;
    const u = ((c.x - P.x) * (d.y - c.y) - (c.y - P.y) * (d.x - c.x)) / den;
    const v = ((c.x - P.x) * (Q.y - P.y) - (c.y - P.y) * (Q.x - P.x)) / den;
    if (u > 0 && u < 1 && v >= 0 && v <= 1) cortes.push(u);
  }
  cortes.sort((x, y) => x - y);

  let dentro = 0;
  for (let i = 0; i + 1 < cortes.length; i++) {
    const meio = (cortes[i] + cortes[i + 1]) / 2;
    const p = { x: P.x + (Q.x - P.x) * meio, y: P.y + (Q.y - P.y) * meio };
    if (pointInPolygon(anel, p)) dentro += comprimentoDoPedaco * (cortes[i + 1] - cortes[i]);
  }

  if (dentro > 0) return { dentroMm: dentro, folgaMm: 0 };

  // Nada por dentro: sobra o encontro de raspão, em que a espessura alcança.
  let folga = Infinity;
  for (let i = 0; i < anel.length; i++) {
    folga = Math.min(
      folga,
      distanciaEntreSegmentos(P, Q, anel[i], anel[(i + 1) % anel.length]),
    );
  }
  return folga <= raioMm ? { dentroMm: 0, folgaMm: folga } : null;
}

/**
 * A menor distância entre dois segmentos NO ESPAÇO.
 *
 * ⚠️ Em 3D, e não em planta: dois canos que se cruzam vistos de cima podem estar
 * a um metro um do outro em altura, e é justamente para isso que a cota existe.
 * Medir em planta acusaria conflito em cada cruzamento de traço — o mesmo ruído
 * que a parede evita.
 */
export function distanciaEntreEixos3D(A: Ponto3, B: Ponto3, C: Ponto3, D: Ponto3): number {
  const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
  const v = { x: D.x - C.x, y: D.y - C.y, z: D.z - C.z };
  const w = { x: A.x - C.x, y: A.y - C.y, z: A.z - C.z };
  const pe = (p: Ponto3, q: Ponto3) => p.x * q.x + p.y * q.y + p.z * q.z;
  const a = pe(u, u);
  const b = pe(u, v);
  const c = pe(v, v);
  const d = pe(u, w);
  const e = pe(v, w);
  const den = a * c - b * b;

  let s: number;
  let t: number;
  if (den < 1e-9) {
    // Paralelos: fixa uma ponta e projeta na outra reta.
    s = 0;
    t = c > 0 ? e / c : 0;
  } else {
    s = (b * e - c * d) / den;
    t = (a * e - b * d) / den;
  }
  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, Math.min(1, t));
  const p = { x: A.x + u.x * s, y: A.y + u.y * s, z: A.z + u.z * s };
  const q = { x: C.x + v.x * t, y: C.y + v.y * t, z: C.z + v.z * t };

  // ⚠️ E o mínimo das QUATRO pontas contra o outro segmento, sempre.
  //
  // Travar `s` e `t` em [0,1] não basta: quando o mínimo das RETAS cai fora dos
  // segmentos, o par travado não é o par mais próximo. E no ramo PARALELO, em
  // que `s` é fixado em zero por não haver solução única, o erro é grosseiro —
  // dois canos colineares e afastados davam a distância da ponta errada.
  // Medido: `[0,1]` contra `[10,11]` no eixo x dava 10, e são 9.
  return Math.min(
    Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z),
    distanciaPontoSegmento3D(A, C, D),
    distanciaPontoSegmento3D(B, C, D),
    distanciaPontoSegmento3D(C, A, B),
    distanciaPontoSegmento3D(D, A, B),
  );
}

/** Distância de um ponto a um segmento, no espaço. */
function distanciaPontoSegmento3D(p: Ponto3, a: Ponto3, b: Ponto3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const den = dx * dx + dy * dy + dz * dz;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy), p.z - (a.z + t * dz));
}

/**
 * Todos os conflitos do modelo.
 *
 * A ordem é estável — por trecho, e dentro dele por id do outro lado — para a
 * tela não reordenar a lista a cada recálculo e para o teste poder afirmar.
 */
export function conflitosDoModelo(model: BlueprintModel): Conflito[] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const trechos = model.trechos ?? [];
  const saida: Conflito[] = [];

  for (const t of trechos) {
    const ez = elevacao.get(t.levelId) ?? 0;
    const [A, B] = pontasNoMundo(t, ez);
    const raio = t.bitolaMm / 2;

    // ── Contra a ESTRUTURA ───────────────────────────────────────────────
    for (const s of model.structures) {
      const es = elevacao.get(s.levelId) ?? 0;
      const r = contraPrisma(
        A,
        B,
        raio,
        pegadaEmPlanta(s),
        es + s.baseMm,
        es + s.baseMm + s.alturaMm,
      );
      if (!r) continue;
      saida.push({
        trechoId: t.id,
        trechoUid: t.uid,
        outroId: s.id,
        outroUid: s.uid,
        classe: 'ESTRUTURA',
        comprimentoDentroMm: r.dentroMm,
        folgaEntreEixosMm: r.folgaMm,
      });
    }

    // ── Contra OUTRA DISCIPLINA ──────────────────────────────────────────
    for (const u of trechos) {
      // `id` só cresce, então o par é visitado uma vez — e nunca contra si.
      if (u.id <= t.id) continue;
      if (u.disciplina === t.disciplina) continue;
      const eu = elevacao.get(u.levelId) ?? 0;
      const [C, D] = pontasNoMundo(u, eu);
      const folga = distanciaEntreEixos3D(A, B, C, D);
      if (folga > raio + u.bitolaMm / 2) continue;
      saida.push({
        trechoId: t.id,
        trechoUid: t.uid,
        outroId: u.id,
        outroUid: u.uid,
        classe: 'REDE',
        comprimentoDentroMm: 0,
        folgaEntreEixosMm: folga,
      });
    }
  }

  return saida.sort(
    (x, y) => (x.trechoId < y.trechoId ? -1 : x.trechoId > y.trechoId ? 1 : 0) ||
      (x.outroId < y.outroId ? -1 : x.outroId > y.outroId ? 1 : 0),
  );
}
