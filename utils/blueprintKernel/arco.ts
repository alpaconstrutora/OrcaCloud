/**
 * PAREDE CURVA (20/09/2026, backlog P2 — P2.12): o arco DISCRETIZADO com metadado.
 *
 * ─── A DECISÃO ──────────────────────────────────────────────────────────────
 *
 * Uma parede curva não é uma entidade nova: é uma CORRENTE de paredes retas
 * curtas (o arco discretizado), cada uma com o metadado `arco` = {centro,
 * raioMm} do círculo em que os dois vértices estão. Tudo o que o kernel já
 * sabe fazer com parede reta — arranjo planar, ambiente, área, abertura,
 * quantitativo, orçamento, IFC, 3D — continua valendo sem uma linha nova; o
 * metadado serve para o CANVAS desenhar a curva de verdade (arco, não corda) e
 * para o painel dizer "trecho de parede curva, raio X". É o mesmo caminho do
 * Revit por trás ("arc wall" é um perfil; os quantitativos vêm por faceta) e
 * é o que "arco discretizado com metadado" do roadmap quis dizer.
 *
 * ─── O METADADO É DETERMINÍSTICO ────────────────────────────────────────────
 *
 * Não há "id do arco": segmentos do mesmo arco se reconhecem pelo MESMO
 * (centro, raio) no mesmo pavimento. Um id sorteado entraria no payload
 * canônico e faria duas sessões que desenham a mesma curva produzirem hashes
 * diferentes — o que o canônico existe para impedir.
 *
 * ─── O METADADO É DESCARTÁVEL ───────────────────────────────────────────────
 *
 * Ele só é verdadeiro enquanto as duas pontas estão sobre o círculo. Comando
 * que mova UMA ponta (MoveVertex, ponta esticada por `manterJuncoes`, ponta
 * aparada) tira o segmento do círculo, e o kernel então RETIRA o metadado em
 * vez de desenhar um arco que não passa mais pelas pontas — a parede vira o
 * que ela sempre foi por baixo: reta. Translação, rotação e espelho rígidos
 * levam o centro junto e o arco sobrevive. Ver `arcoConsistente` e
 * `retirarArcosDesfeitos` em `commands.ts`.
 */
import type { Point } from './geom';
import { roundToMm } from './units';

/** Passo angular máximo de uma faceta (graus). 15° = 24 facetas no círculo cheio. */
export const PASSO_MAX_DO_ARCO_GRAUS = 15;
/** Flecha máxima entre a corda e o arco (mm): abaixo disto a faceta não se vê a 1:50. */
export const FLECHA_MAX_DO_ARCO_MM = 10;
/** Teto de facetas por gesto — protege o modelo de um raio enorme com flecha mínima. */
export const MAX_FACETAS_DO_ARCO = 90;
/** Distância admitida entre a ponta e o círculo para o metadado continuar válido (mm). */
export const TOLERANCIA_DO_ARCO_MM = 3;

export interface Circulo {
  centro: Point;
  raioMm: number;
}

/**
 * Círculo que passa por três pontos. `null` quando são colineares (ou dois
 * coincidem): não há círculo, o gesto é uma reta.
 */
export function circuloPorTresPontos(a: Point, m: Point, b: Point): Circulo | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const m2 = m.x * m.x + m.y * m.y;
  const b2 = b.x * b.x + b.y * b.y;
  const ux = (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d;
  const uy = (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d;
  const raio = Math.hypot(a.x - ux, a.y - uy);
  if (!Number.isFinite(raio) || raio < 1) return null;
  return { centro: { x: ux, y: uy }, raioMm: raio };
}

/** Ângulo polar de `p` em torno de `c`, em radianos (−π, π]. */
export function anguloEmTorno(c: Point, p: Point): number {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

/**
 * Varredura assinada de `a` até `b` em torno de `centro`, escolhendo o sentido
 * que passa por `passandoPor`. Positiva = anti-horária no sistema do kernel.
 */
export function varreduraDoArco(centro: Point, a: Point, b: Point, passandoPor: Point): number {
  const ta = anguloEmTorno(centro, a);
  const tb = anguloEmTorno(centro, b);
  const tm = anguloEmTorno(centro, passandoPor);
  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccw = norm(tb - ta); // varredura anti-horária de a até b
  const ccwAteM = norm(tm - ta);
  // Se o ponto do meio está DENTRO da varredura anti-horária, é ela; senão, é a horária.
  return ccwAteM <= ccw ? ccw : ccw - 2 * Math.PI;
}

/** Quantas facetas o arco pede, pela flecha e pelo passo máximo. */
export function facetasDoArco(raioMm: number, varreduraRad: number): number {
  const varredura = Math.abs(varreduraRad);
  const passoPelaFlecha = raioMm > FLECHA_MAX_DO_ARCO_MM ? 2 * Math.acos(1 - FLECHA_MAX_DO_ARCO_MM / raioMm) : Math.PI;
  const passo = Math.min((PASSO_MAX_DO_ARCO_GRAUS * Math.PI) / 180, passoPelaFlecha);
  return Math.max(2, Math.min(MAX_FACETAS_DO_ARCO, Math.ceil(varredura / passo - 1e-9)));
}

export interface ArcoDiscretizado extends Circulo {
  /** Vértices em mm inteiros, de `a` a `b` inclusive (facetas + 1 pontos). */
  vertices: Point[];
  varreduraRad: number;
}

/**
 * O arco por três pontos (início, fim e um ponto por onde passa) em facetas.
 * `null` quando os três são colineares, quando duas facetas consecutivas
 * arredondariam para o mesmo milímetro (raio minúsculo) ou quando início e
 * fim coincidem (círculo fechado não é gesto de parede: fecha-se com duas
 * curvas).
 */
export function discretizarArco(a: Point, b: Point, passandoPor: Point): ArcoDiscretizado | null {
  if (a.x === b.x && a.y === b.y) return null;
  const circ = circuloPorTresPontos(a, passandoPor, b);
  if (!circ) return null;
  const varredura = varreduraDoArco(circ.centro, a, b, passandoPor);
  const n = facetasDoArco(circ.raioMm, varredura);
  const ta = anguloEmTorno(circ.centro, a);
  const vertices: Point[] = [{ x: a.x, y: a.y }];
  for (let i = 1; i < n; i++) {
    const t = ta + (varredura * i) / n;
    vertices.push({ x: roundToMm(circ.centro.x + circ.raioMm * Math.cos(t)), y: roundToMm(circ.centro.y + circ.raioMm * Math.sin(t)) });
  }
  vertices.push({ x: b.x, y: b.y });
  for (let i = 1; i < vertices.length; i++) {
    if (vertices[i].x === vertices[i - 1].x && vertices[i].y === vertices[i - 1].y) return null;
  }
  return {
    centro: { x: roundToMm(circ.centro.x), y: roundToMm(circ.centro.y) },
    raioMm: Math.max(1, roundToMm(circ.raioMm)),
    vertices,
    varreduraRad: varredura,
  };
}

/** As duas pontas continuam sobre o círculo do metadado (dentro da tolerância)? */
export function arcoConsistente(w: { a: Point; b: Point; arco?: Circulo }): boolean {
  if (!w.arco) return true;
  const { centro, raioMm } = w.arco;
  const da = Math.abs(Math.hypot(w.a.x - centro.x, w.a.y - centro.y) - raioMm);
  const db = Math.abs(Math.hypot(w.b.x - centro.x, w.b.y - centro.y) - raioMm);
  return da <= TOLERANCIA_DO_ARCO_MM && db <= TOLERANCIA_DO_ARCO_MM;
}

/** Os segmentos do mesmo arco que este (mesmo pavimento, mesmo centro e raio). */
export function segmentosDoMesmoArco<W extends { levelId: string; arco?: Circulo }>(walls: readonly W[], w: W): W[] {
  if (!w.arco) return [w];
  return walls.filter((o) => o.levelId === w.levelId && o.arco && o.arco.raioMm === w.arco!.raioMm && o.arco.centro.x === w.arco!.centro.x && o.arco.centro.y === w.arco!.centro.y);
}
