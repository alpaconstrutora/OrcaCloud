/**
 * Primitivas geométricas exatas sobre coordenadas inteiras em milímetros.
 *
 * Todos os predicados de decisão (orientação, colinearidade, "está entre") são
 * calculados em ARITMÉTICA INTEIRA e são exatos — não usam epsilon. Epsilon só
 * aparece onde a resposta é genuinamente contínua (o ponto de interseção), e ali
 * o resultado volta a inteiro por `roundToMm`.
 *
 * Essa separação é o que torna o kernel determinístico: a topologia (quantas faces,
 * quem toca quem) nunca depende de um comparador de ponto flutuante.
 */

import { DEFAULT_TOLERANCE_MM, KernelError, assertIntegerMm, roundToMm } from './units';

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export function point(x: number, y: number): Point {
  return { x: assertIntegerMm(x, 'x'), y: assertIntegerMm(y, 'y') };
}

export function pointsEqual(p: Point, q: Point): boolean {
  return p.x === q.x && p.y === q.y;
}

/**
 * Chave textual estável de um ponto. Usada para deduplicar vértices sem depender
 * de ordem de inserção em Map.
 */
export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Predicados exatos (inteiros)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produto vetorial (b−a) × (c−a). Exato para coordenadas até ±1e6 mm.
 *
 * > 0  → c está à esquerda de a→b (anti-horário)
 * < 0  → c está à direita (horário)
 * = 0  → colineares
 */
export function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function orientation(a: Point, b: Point, c: Point): -1 | 0 | 1 {
  const v = cross(a, b, c);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function areCollinear(a: Point, b: Point, c: Point): boolean {
  return cross(a, b, c) === 0;
}

/** Quadrado da distância. Inteiro, exato — evita a raiz e o float que vem com ela. */
export function distanceSq(p: Point, q: Point): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

export function withinTolerance(p: Point, q: Point, toleranceMm = DEFAULT_TOLERANCE_MM): boolean {
  return distanceSq(p, q) <= toleranceMm * toleranceMm;
}

/** `c` está no segmento a→b, assumindo os três já colineares. Fronteiras inclusas. */
export function isBetween(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** `c` está no interior aberto do segmento a→b (colinear e distinto das pontas). */
export function isStrictlyOnSegment(a: Point, b: Point, c: Point): boolean {
  if (!areCollinear(a, b, c)) return false;
  if (pointsEqual(a, c) || pointsEqual(b, c)) return false;
  return isBetween(a, b, c);
}

/**
 * `c` é um corte válido no interior de a→b, sabendo que `c` VEIO de uma interseção
 * calculada sobre este próprio segmento e depois arredondada para mm inteiro.
 *
 * Não exige colinearidade exata de propósito. O arredondamento desloca o ponto em
 * até 0,5 mm por eixo, então `cross(a, b, c)` deixa de ser zero e um teste exato
 * rejeitaria o corte — o que só não quebra geometria ortogonal porque ali a
 * interseção cai em coordenada inteira por sorte. Em paredes oblíquas o teste exato
 * descartava TODOS os cortes, o grafo planar nunca fechava e a planta não produzia
 * nenhum ambiente.
 *
 * O que precisa ser verdade é só: o ponto está dentro da caixa do segmento e não
 * coincide com uma das pontas. A pertinência à reta já foi estabelecida por
 * construção, por quem calculou a interseção.
 */
export function isInteriorCut(a: Point, b: Point, c: Point): boolean {
  if (pointsEqual(a, c) || pointsEqual(b, c)) return false;
  return isBetween(a, b, c);
}

export function segmentLengthSq(s: Segment): number {
  return distanceSq(s.a, s.b);
}

export function isDegenerate(s: Segment): boolean {
  return pointsEqual(s.a, s.b);
}

/** Dois segmentos apontam na mesma direção ou na oposta (mesma reta suporte). */
export function areParallel(s: Segment, t: Segment): boolean {
  const d1x = s.b.x - s.a.x;
  const d1y = s.b.y - s.a.y;
  const d2x = t.b.x - t.a.x;
  const d2y = t.b.y - t.a.y;
  return d1x * d2y - d1y * d2x === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interseção
// ─────────────────────────────────────────────────────────────────────────────

export type IntersectionKind = 'none' | 'point' | 'overlap';

export interface IntersectionResult {
  kind: IntersectionKind;
  /** Preenchido em 'point'. Já arredondado para mm inteiro. */
  at?: Point;
  /** Preenchido em 'overlap': o trecho comum às duas retas colineares. */
  overlap?: Segment;
}

/**
 * Interseção de dois segmentos fechados.
 *
 * O caso colinear devolve 'overlap' em vez de um ponto arbitrário. Isso importa:
 * duas paredes desenhadas por cima uma da outra não têm "um" ponto de cruzamento, e
 * fingir que têm produziria faces fantasma no arranjo planar.
 */
export function intersectSegments(s: Segment, t: Segment): IntersectionResult {
  if (isDegenerate(s) || isDegenerate(t)) return { kind: 'none' };

  const d1 = orientation(s.a, s.b, t.a);
  const d2 = orientation(s.a, s.b, t.b);
  const d3 = orientation(t.a, t.b, s.a);
  const d4 = orientation(t.a, t.b, s.b);

  // Colineares: procurar sobreposição projetando na direção dominante.
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const horizontal = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y);
    const key = (p: Point) => (horizontal ? p.x : p.y);

    const sLo = key(s.a) <= key(s.b) ? s.a : s.b;
    const sHi = key(s.a) <= key(s.b) ? s.b : s.a;
    const tLo = key(t.a) <= key(t.b) ? t.a : t.b;
    const tHi = key(t.a) <= key(t.b) ? t.b : t.a;

    const lo = key(sLo) >= key(tLo) ? sLo : tLo;
    const hi = key(sHi) <= key(tHi) ? sHi : tHi;

    if (key(lo) > key(hi)) return { kind: 'none' };
    if (pointsEqual(lo, hi)) return { kind: 'point', at: lo };
    return { kind: 'overlap', overlap: { a: lo, b: hi } };
  }

  // Cruzamento próprio ou toque em ponta.
  const proper = d1 !== d2 && d3 !== d4;
  const touches =
    (d1 === 0 && isBetween(s.a, s.b, t.a)) ||
    (d2 === 0 && isBetween(s.a, s.b, t.b)) ||
    (d3 === 0 && isBetween(t.a, t.b, s.a)) ||
    (d4 === 0 && isBetween(t.a, t.b, s.b));

  if (!proper && !touches) return { kind: 'none' };

  // Toque exato numa ponta: devolver a ponta em si, sem passar pela divisão.
  // Além de mais rápido, evita que o arredondamento desloque um vértice que já
  // era exato — origem clássica de junção que "quase" fecha.
  if (d1 === 0 && isBetween(s.a, s.b, t.a)) return { kind: 'point', at: t.a };
  if (d2 === 0 && isBetween(s.a, s.b, t.b)) return { kind: 'point', at: t.b };
  if (d3 === 0 && isBetween(t.a, t.b, s.a)) return { kind: 'point', at: s.a };
  if (d4 === 0 && isBetween(t.a, t.b, s.b)) return { kind: 'point', at: s.b };

  const r1x = s.b.x - s.a.x;
  const r1y = s.b.y - s.a.y;
  const r2x = t.b.x - t.a.x;
  const r2y = t.b.y - t.a.y;

  const denom = r1x * r2y - r1y * r2x;
  if (denom === 0) return { kind: 'none' }; // já coberto acima; guarda defensiva

  const num = (t.a.x - s.a.x) * r2y - (t.a.y - s.a.y) * r2x;
  const u = num / denom;

  return {
    kind: 'point',
    at: { x: roundToMm(s.a.x + u * r1x), y: roundToMm(s.a.y + u * r1y) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Polígonos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Área com sinal pelo laço do agrimensor, em mm².
 *
 * Devolve o DOBRO da área como inteiro exato e só então divide por 2 — assim a
 * soma inteira acumula sem erro e a divisão acontece uma única vez no fim.
 * Positivo = anti-horário.
 */
export function signedArea(ring: Point[]): number {
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

export function polygonArea(ring: Point[]): number {
  return Math.abs(signedArea(ring));
}

export function polygonPerimeter(ring: Point[]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    total += Math.sqrt(distanceSq(p, q));
  }
  return roundToMm(total);
}

export function isCounterClockwise(ring: Point[]): boolean {
  return signedArea(ring) > 0;
}

/** Ponto-em-polígono por ray casting, com fronteira contando como dentro. */
export function pointInPolygon(ring: Point[], p: Point): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (areCollinear(a, b, p) && isBetween(a, b, p)) return true;
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < xCross) inside = !inside;
  }
  return inside;
}

/**
 * Projeta `para` no eixo dominante em relação a `de` — a trava ortogonal.
 *
 * Vive no kernel porque é GEOMETRIA, não interação. A lição custou caro uma vez:
 * a regra de ponta livre tinha uma cópia no renderizador e a exportação nasceu
 * sem ela, deixando o canto certo na tela e aberto no papel.
 *
 * Aplicar DEPOIS do encaixe na grade, nunca antes: como uma das coordenadas é
 * copiada de `de`, que já está na grade, o resultado continua na grade. Travar
 * primeiro e encaixar depois devolveria o ponto para fora do eixo.
 *
 * O eixo escolhido é o de maior deslocamento — o que o usuário está indicando
 * com o movimento. No empate exato vence a horizontal; a escolha é arbitrária, o
 * que não pode é oscilar entre os dois na mesma posição.
 */
export function travarOrtogonal(de: Point, para: Point): Point {
  return Math.abs(para.x - de.x) >= Math.abs(para.y - de.y)
    ? { x: para.x, y: de.y }
    : { x: de.x, y: para.y };
}

/**
 * Ponto a `comprimentoMm` de `de`, na direção de `de` → `para`.
 *
 * Serve ao painel de propriedades: quem digita "4,10 m" no comprimento da
 * parede está pedindo para a ponta ANDAR NO PRÓPRIO EIXO, não para a parede
 * girar — `para` só informa a direção (normalmente a ponta atual, do lado que
 * fica). Encolher (`comprimentoMm` menor que o atual) é o mesmo cálculo, só que
 * o ponto cai mais perto de `de`.
 *
 * Vive no kernel pela mesma razão de `eixoDaParede` e `cantosDaParede`: é
 * geometria, e cópia no renderizador é cópia que diverge silenciosamente.
 *
 * `comprimentoMm` deve ser positivo — comprimento zero é parede degenerada, que
 * o kernel já recusa em `AddWall`/`MoveVertex`, e esta função não duplica a
 * validação: devolve o ponto matemático, ainda que degenerado, e deixa o
 * comando recusar.
 *
 * `de` e `para` iguais não têm direção nenhuma para seguir; a chamada é um erro
 * de quem chama (a parede já teria comprimento zero antes de qualquer edição), e
 * a função devolve `de` em vez de propagar `NaN` para dentro do kernel.
 */
export function pontaEsticada(de: Point, para: Point, comprimentoMm: number): Point {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return point(de.x, de.y);

  const ux = dx / comp;
  const uy = dy / comp;
  return point(roundToMm(de.x + ux * comprimentoMm), roundToMm(de.y + uy * comprimentoMm));
}

// ─────────────────────────────────────────────────────────────────────────────
// Alinhamento do traçado (eixo × face)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De que lado do traçado o CORPO da parede cresce.
 *
 * `EIXO` é o que o kernel guarda (a parede é o eixo, espessura é propriedade), e
 * era o único jeito de desenhar: o clique caía no MEIO da espessura. Quem copia
 * uma planta de fundo, porém, aponta o CANTO da parede — a face — e esperava a
 * parede nascer inteira para dentro daquele canto, não meia espessura para cada
 * lado.
 *
 * `DIREITA`/`ESQUERDA` são relativos ao sentido do desenho e valem também para
 * quem olha a tela: o Y do modelo aponta para cima e o da tela para baixo, e
 * essa inversão troca o sinal do sentido e o da normal ao mesmo tempo — as duas
 * trocas se cancelam. Andando para a direita na tela, "à direita" é para baixo,
 * que é o mesmo lado que a mão direita de quem caminha aponta.
 */
export type AlinhamentoParede = 'EIXO' | 'DIREITA' | 'ESQUERDA';

/**
 * Teto da mitra, em múltiplos de meia espessura.
 *
 * Canto muito agudo joga a interseção das duas faces para longe — no limite, ao
 * infinito. Sem teto, uma dobra de poucos graus produziria uma farpa de metros e
 * a coordenada estouraria `MAX_COORD_MM`. Estourado o teto, o certo é desistir da
 * mitra e deslocar a ponta em reta: o canto fica com uma falha visível de meia
 * espessura, que se arruma arrastando, em vez de uma parede absurda.
 */
const MITRA_MAX = 4;

/** Normal unitária do lado em que o corpo cresce. `null` em traço degenerado. */
function normalDoLado(
  a: Point,
  b: Point,
  lado: 'DIREITA' | 'ESQUERDA',
): { x: number; y: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return null;
  return lado === 'DIREITA'
    ? { x: dy / comp, y: -dx / comp }
    : { x: -dy / comp, y: dx / comp };
}

/**
 * Vértice do EIXO no canto `q`, entre os traços p→q e q→r.
 *
 * É a interseção das duas faces deslocadas — a mitra. Sem ela, cada trecho seria
 * deslocado por conta própria e as pontas deixariam de coincidir: num canto reto
 * elas ficariam a meia espessura uma da outra em cada eixo, o contorno não
 * fecharia e o ambiente não apareceria. Esse é o defeito que o deslocamento
 * ingênuo produz, e ele só aparece DEPOIS, na lista de ambientes vazia.
 *
 * `null` quando não há canto (colinear ou 180°: retas deslocadas paralelas) ou
 * quando a mitra estoura `MITRA_MAX`. Nos dois casos quem chama desloca em reta.
 */
function mitra(
  p: Point,
  q: Point,
  r: Point,
  meia: number,
  lado: 'DIREITA' | 'ESQUERDA',
  /**
   * Deslocamento do segundo lado, quando ele difere do primeiro.
   *
   * Existe para o RECUO de terreno: frente, fundos e laterais são distâncias
   * DIFERENTES, e o canto entre duas delas é a interseção de duas paralelas
   * deslocadas por valores distintos. A conta já era essa — só faltava deixar os
   * dois valores entrarem. Omitido, os dois lados usam `meia`, que é o caso da
   * parede (espessura única) e mantém o comportamento de sempre.
   */
  meiaDoSegundo = meia,
): Point | null {
  const n1 = normalDoLado(p, q, lado);
  const n2 = normalDoLado(q, r, lado);
  if (!n1 || !n2) return null;

  const d1 = { x: q.x - p.x, y: q.y - p.y };
  const d2 = { x: r.x - q.x, y: r.y - q.y };
  // Coordenadas são inteiras, então este determinante é EXATO: "tem canto ou não"
  // nunca depende de epsilon.
  const den = d1.x * d2.y - d1.y * d2.x;
  if (den === 0) return null;

  const a1 = { x: q.x + n1.x * meia, y: q.y + n1.y * meia };
  const a2 = { x: q.x + n2.x * meiaDoSegundo, y: q.y + n2.y * meiaDoSegundo };
  const t = ((a2.x - a1.x) * d2.y - (a2.y - a1.y) * d2.x) / den;
  const cruz = { x: a1.x + t * d1.x, y: a1.y + t * d1.y };

  // O teto usa o MAIOR dos dois deslocamentos: com valores diferentes, medir
  // contra o menor recusaria mitras legítimas de um recuo grande ao lado de um
  // pequeno, e o canto cairia em reta bem onde ele mais precisa fechar.
  const teto = Math.max(Math.abs(meia), Math.abs(meiaDoSegundo)) * MITRA_MAX;
  if (Math.hypot(cruz.x - q.x, cruz.y - q.y) > teto) return null;
  return point(roundToMm(cruz.x), roundToMm(cruz.y));
}

/**
 * O anel deslocado para DENTRO, com um recuo por lado.
 *
 * É o envelope construtivo do lote: cada divisa recua pela sua distância
 * (frente, fundos, laterais são medidas diferentes) e os cantos fecham pela
 * interseção das paralelas — a mesma mitra que fecha o canto da parede.
 *
 * `recuos[i]` é o recuo do lado que vai de `anel[i]` a `anel[i+1]`. Recuo zero
 * mantém o lado onde está.
 *
 * ⚠️ Recuo grande demais num lote estreito faz os lados se cruzarem e o anel
 * "virar do avesso". Não é erro do cálculo: é o lote não comportar aqueles
 * recuos, e quem chama precisa dizer isso a quem olha, em vez de desenhar um
 * polígono impossível. `envelopeValido` responde isso.
 */
export function anelRecuado(anel: Point[], recuos: number[]): Point[] {
  const n = anel.length;
  if (n < 3 || recuos.length !== n) return [];

  // Sentido do contorno decide para que lado é "dentro". Anti-horário → a normal
  // que aponta para dentro é a da ESQUERDA; horário, a da DIREITA. Sem isto o
  // envelope cresceria para FORA em metade dos lotes, sem nada explicando.
  const lado: 'DIREITA' | 'ESQUERDA' = signedArea(anel) > 0 ? 'ESQUERDA' : 'DIREITA';

  const saida: Point[] = [];
  for (let i = 0; i < n; i++) {
    const anterior = anel[(i + n - 1) % n];
    const atual = anel[i];
    const proximo = anel[(i + 1) % n];
    // O vértice `i` é o encontro do lado (i−1 → i) com o lado (i → i+1), então
    // ele usa os recuos DESSES dois lados.
    const recuoAntes = recuos[(i + n - 1) % n];
    const recuoDepois = recuos[i];

    const canto = mitra(anterior, atual, proximo, recuoAntes, lado, recuoDepois);
    if (!canto) {
      // Colinear ou mitra estourada: desloca em reta pelo lado que segue.
      const nrm = normalDoLado(atual, proximo, lado);
      if (!nrm) return [];
      saida.push(
        point(roundToMm(atual.x + nrm.x * recuoDepois), roundToMm(atual.y + nrm.y * recuoDepois)),
      );
      continue;
    }
    saida.push(canto);
  }
  return saida;
}

/**
 * O envelope ainda é um polígono de verdade?
 *
 * Recuos maiores que o lote produzem um anel invertido — área positiva que não
 * significa nada. Três checagens, e **a terceira é a que pega o caso simétrico**:
 *
 * 1. o polígono é simples (nenhum lado cruza outro);
 * 2. o sentido do contorno é o mesmo do lote;
 * 3. **cada lado mantém a DIREÇÃO do lado que o originou.**
 *
 * Sem a terceira, um retângulo recuado além da metade passa: os dois eixos se
 * invertem, a orientação inverte DUAS vezes e volta ao normal, e o resultado é
 * um retângulo perfeitamente simples, do lado errado do lote. Foi exatamente o
 * que o teste "recuo maior que o lote" pegou. Um lado que apontava para a
 * direita e passou a apontar para a esquerda cruzou o lado oposto — e isso é
 * local, barato e não depende de simetria nenhuma.
 */
export function envelopeValido(anel: Point[], envelope: Point[]): boolean {
  if (anel.length < 3 || envelope.length !== anel.length) return false;
  if (!isSimplePolygon(envelope)) return false;
  if (signedArea(anel) > 0 !== signedArea(envelope) > 0) return false;

  const n = anel.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const original = { x: anel[j].x - anel[i].x, y: anel[j].y - anel[i].y };
    const recuado = { x: envelope[j].x - envelope[i].x, y: envelope[j].y - envelope[i].y };
    if (original.x * recuado.x + original.y * recuado.y <= 0) return false;
  }
  return true;
}

/**
 * Eixo da parede a partir do traçado, aplicando o alinhamento.
 *
 * `vizinhos.antes` e `vizinhos.depois` são os pontos do traçado que ladeiam este
 * trecho — o anterior e o seguinte na mesma polilinha. Só com eles é possível
 * mitrar o canto; sem eles a ponta é deslocada em reta, que é o certo para a
 * primeira e a última ponta de um contorno aberto.
 *
 * Vive no kernel, e não no canvas, pela mesma razão que `travarOrtogonal` e
 * `isFreeWallEnd`: é GEOMETRIA. A cópia que mora no renderizador é a cópia que
 * diverge da exportação — já aconteceu uma vez, e o canto ficou certo na tela e
 * aberto no papel.
 */
export function eixoDaParede(
  tracado: Segment,
  espessuraMm: number,
  alinhamento: AlinhamentoParede,
  vizinhos: { antes?: Point | null; depois?: Point | null } = {},
): Segment {
  const cru = { a: { ...tracado.a }, b: { ...tracado.b } };
  if (alinhamento === 'EIXO') return cru;

  const meia = espessuraMm / 2;
  const n = normalDoLado(tracado.a, tracado.b, alinhamento);
  if (!n) return cru;

  const desloca = (p: Point): Point =>
    point(roundToMm(p.x + n.x * meia), roundToMm(p.y + n.y * meia));

  const antes = vizinhos.antes;
  const depois = vizinhos.depois;

  return {
    a: (antes && mitra(antes, tracado.a, tracado.b, meia, alinhamento)) || desloca(tracado.a),
    b: (depois && mitra(tracado.a, tracado.b, depois, meia, alinhamento)) || desloca(tracado.b),
  };
}

/**
 * Vértices de um polígono REGULAR, na ordem do contorno.
 *
 * `raioMm` é do centro ao VÉRTICE (polígono inscrito na circunferência), e
 * `anguloRad` é onde fica o primeiro vértice. Os dois saem direto do gesto: o
 * cursor é um vértice, então o que se vê arrastando é a esquina que vai nascer.
 *
 * ─── O SENTIDO NÃO É ARBITRÁRIO ─────────────────────────────────────────────
 *
 * Os vértices saem com o ângulo DIMINUINDO, que é o sentido horário na tela
 * (o Y do modelo aponta para cima). É o mesmo sentido que o traçado manual pede
 * para a parede nascer para dentro com o alinhamento "à direita" — gerar no
 * sentido contrário faria o polígono crescer para FORA do que se apontou, sem
 * nada na tela explicando por quê.
 *
 * Devolve `[]` em entrada degenerada, em vez de levantar erro: isto roda a cada
 * movimento do mouse na prévia, e exceção dentro de handler de ponteiro derruba
 * a aba (a mesma razão do limite em `capturar`).
 */
export function poligonoRegular(
  centro: Point,
  raioMm: number,
  lados: number,
  anguloRad = 0,
): Point[] {
  if (!Number.isFinite(raioMm) || raioMm <= 0) return [];
  if (!Number.isInteger(lados) || lados < 3) return [];

  const passo = (2 * Math.PI) / lados;
  const vertices: Point[] = [];
  for (let i = 0; i < lados; i++) {
    const ang = anguloRad - i * passo;
    vertices.push(
      point(
        roundToMm(centro.x + raioMm * Math.cos(ang)),
        roundToMm(centro.y + raioMm * Math.sin(ang)),
      ),
    );
  }

  // Raio pequeno demais para o número de lados: o arredondamento ao milímetro
  // colapsa vértices vizinhos, e o kernel recusaria a parede de comprimento
  // zero. Melhor não oferecer o polígono do que oferecer um que não entra.
  for (let i = 0; i < vertices.length; i++) {
    if (pointsEqual(vertices[i], vertices[(i + 1) % vertices.length])) return [];
  }
  return vertices;
}

/**
 * Polígono regular medido pelo LADO: o meio de um lado fica a `apotemaMm` do
 * centro, na direção `anguloRad`.
 *
 * ─── POR QUE É ESTA, E NÃO A MEDIDA PELO VÉRTICE ────────────────────────────
 *
 * Medindo pelo vértice, arrastar na horizontal põe as ESQUINAS nos eixos: um
 * quadrado sai como losango, girado 45° em relação à planta. Foi o que apareceu
 * em uso, no primeiro polígono de 4 lados desenhado sobre uma planta ortogonal.
 *
 * Medindo pelo lado, o lado sob o cursor fica perpendicular ao arraste — e com
 * a trava ortogonal ligada todo polígono de lados pares nasce alinhado aos
 * eixos da planta. De quebra, a distância arrastada passa a ser a metade da
 * medida do quadrado (arrastar 2 m dá 4 × 4 m), que é o que se pensa ao
 * desenhar um cômodo.
 *
 * A conversão é a de sempre: o vértice fica a `apotema / cos(π/n)` do centro, e
 * os dois que ladeiam o lado sob o cursor ficam a meio passo dele.
 */
export function poligonoPeloLado(
  centro: Point,
  apotemaMm: number,
  lados: number,
  anguloRad = 0,
): Point[] {
  if (!Number.isFinite(apotemaMm) || apotemaMm <= 0) return [];
  if (!Number.isInteger(lados) || lados < 3) return [];

  const meioPasso = Math.PI / lados;
  return poligonoRegular(
    centro,
    apotemaMm / Math.cos(meioPasso),
    lados,
    anguloRad + meioPasso,
  );
}

/**
 * Retângulo definido pelos dois cantos OPOSTOS, no sentido horário da tela.
 *
 * É o gesto de fazer um cômodo depressa: clica num canto, arrasta até o outro.
 * O polígono regular não serve para isso — com 4 lados ele é sempre um QUADRADO
 * e nasce do centro, e cômodo quase nunca é quadrado.
 *
 * Sai sempre alinhado aos eixos, por construção: os lados são paralelos a x e a
 * y. Não há giro a escolher, e é justamente isso que se quer ao copiar planta
 * ortogonal.
 *
 * A ordem é normalizada para o sentido horário da tela (área com sinal negativo,
 * porque o Y do modelo aponta para cima) — o mesmo sentido que faz a parede
 * nascer para dentro com o alinhamento "à direita". Assim tanto faz de qual
 * canto se começa a arrastar: os quatro caminhos dão o mesmo contorno.
 *
 * `[]` quando os dois cantos partilham uma coordenada: não há retângulo, e uma
 * parede de comprimento zero seria recusada pelo kernel logo em seguida.
 */
export function retanguloPorCantos(p: Point, q: Point): Point[] {
  if (p.x === q.x || p.y === q.y) return [];

  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);

  // Começa pelo canto superior esquerdo e desce pela direita: horário na tela.
  return [point(x0, y1), point(x1, y1), point(x1, y0), point(x0, y0)];
}

/**
 * Os quatro cantos do corpo da parede, no sentido do anel.
 *
 * `avancoAMm`/`avancoBMm` empurram a ponta ao longo do eixo, como o desenho faz
 * na ponta que encontra outra parede — é lá que está o canto que se VÊ, e é nele
 * que o clique precisa grudar.
 *
 * ⚠️ VÊM EM MILÍMETRO, e quem chama deve passar exatamente `extensaoDeCanto`.
 * Eram dois booleanos que aqui viravam meia espessura, e isso ficou ERRADO no
 * instante em que o desenho passou a avançar pelo ÂNGULO do canto: num hexágono
 * o traço avança 57,7 mm e o encaixe oferecia 100 mm, então o clique grudava
 * 42 mm além do canto que estava na tela. Duas fontes para a mesma medida
 * divergem — e esta divergiu no mesmo dia em que nasceu.
 */
export function cantosDaParede(
  a: Point,
  b: Point,
  espessuraMm: number,
  avancoAMm = 0,
  avancoBMm = 0,
): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return [];

  const ux = dx / comp;
  const uy = dy / comp;
  const nx = -uy;
  const ny = ux;
  const meia = espessuraMm / 2;

  const pa = { x: a.x - ux * avancoAMm, y: a.y - uy * avancoAMm };
  const pb = { x: b.x + ux * avancoBMm, y: b.y + uy * avancoBMm };

  return [
    point(roundToMm(pa.x + nx * meia), roundToMm(pa.y + ny * meia)),
    point(roundToMm(pb.x + nx * meia), roundToMm(pb.y + ny * meia)),
    point(roundToMm(pb.x - nx * meia), roundToMm(pb.y - ny * meia)),
    point(roundToMm(pa.x - nx * meia), roundToMm(pa.y - ny * meia)),
  ];
}

/**
 * Um ponto garantidamente DENTRO do polígono, respeitando os buracos.
 *
 * Serve de âncora para a etiqueta de ambiente. O centroide resolve o caso comum
 * e falha justamente nos que interessam: num "L" ele cai fora, e num ambiente
 * com vazio central ele cai dentro do vazio. Nos dois casos a etiqueta ficaria
 * ancorada onde o ambiente não está, e o nome sumiria na próxima rederivação.
 *
 * O plano B varre uma linha horizontal e escolhe o MEIO do maior trecho
 * interno — que é onde a etiqueta cabe, e não por acaso onde um projetista a
 * colocaria.
 */
export function interiorPoint(ring: Point[], holes: Point[][] = []): Point {
  const dentro = (p: Point) =>
    pointInPolygon(ring, p) && !holes.some((h) => pointInPolygon(h, p));

  // Plano A: centroide de área.
  let duasVezes = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const f = a.x * b.y - b.x * a.y;
    duasVezes += f;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  if (duasVezes !== 0) {
    const centroide = point(Math.round(cx / (3 * duasVezes)), Math.round(cy / (3 * duasVezes)));
    if (dentro(centroide)) return centroide;
  }

  // Plano B: varredura horizontal, no meio do maior trecho interno.
  const ys = [...new Set([...ring, ...holes.flat()].map((p) => p.y))].sort((a, b) => a - b);
  let melhor: Point | null = null;
  let maiorVao = -1;

  for (let i = 0; i + 1 < ys.length; i++) {
    const y = Math.round((ys[i] + ys[i + 1]) / 2);
    const xs: number[] = [];
    for (const anel of [ring, ...holes]) {
      for (let j = 0; j < anel.length; j++) {
        const a = anel[j];
        const b = anel[(j + 1) % anel.length];
        if (a.y > y === b.y > y) continue;
        xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const vao = xs[k + 1] - xs[k];
      if (vao <= maiorVao) continue;
      const candidato = point(Math.round((xs[k] + xs[k + 1]) / 2), y);
      if (!dentro(candidato)) continue;
      maiorVao = vao;
      melhor = candidato;
    }
  }

  // Degenerado (anel com menos de 3 pontos, área nula): devolve o primeiro
  // vértice em vez de mentir com um ponto inventado.
  return melhor ?? ring[0] ?? point(0, 0);
}

/** Auto-interseção: qualquer par de arestas não adjacentes que se cruzam. */
export function isSimplePolygon(ring: Point[]): boolean {
  const n = ring.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const s: Segment = { a: ring[i], b: ring[(i + 1) % n] };
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const t: Segment = { a: ring[j], b: ring[(j + 1) % n] };
      const hit = intersectSegments(s, t);

      if (adjacent) {
        // Vizinhas podem tocar no vértice comum, mas não sobrepor.
        if (hit.kind === 'overlap') return false;
        continue;
      }
      if (hit.kind !== 'none') return false;
    }
  }
  return true;
}

/**
 * Rotaciona o anel para começar pelo vértice lexicograficamente menor e o orienta
 * anti-horário. Dois anéis com a mesma forma geométrica passam a ter exatamente a
 * mesma lista de pontos — é isso que permite comparar faces por igualdade estrutural
 * em vez de por tolerância.
 */
export function canonicalizeRing(ring: Point[]): Point[] {
  if (ring.length === 0) return [];

  let start = 0;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    const best = ring[start];
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) start = i;
  }

  const rotated = [...ring.slice(start), ...ring.slice(0, start)];
  if (!isCounterClockwise(rotated)) {
    // Inverter mantendo o primeiro vértice na frente.
    return [rotated[0], ...rotated.slice(1).reverse()];
  }
  return rotated;
}

export function assertFiniteRing(ring: Point[]): void {
  for (const p of ring) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      throw new KernelError('NOT_INTEGER_MM', `Anel com vértice não inteiro: ${pointKey(p)}`);
    }
  }
}
