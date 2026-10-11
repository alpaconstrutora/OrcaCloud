/**
 * O ENCOSTO da evaporadora de parede (11/10/2026, teste do usuário no app real).
 *
 * A evaporadora inserida à mão ficava onde o clique caía — na planta do usuário,
 * com o centro na face interna da parede, metade do aparelho dentro da alvenaria
 * e sem giro. O gerador já fazia certo (`lugarDaEvaporadora`: recua meia
 * profundidade e gira para soprar para dentro); aqui está a mesma regra para um
 * ponto qualquer: a parede mais perto, o lado em que o ponto está, o fundo da
 * peça encostado na face.
 *
 * E o PONTO DE FORÇA dela, que nascia na face atrás do centro — escondido sob o
 * aparelho —, vai para o LADO, na mesma face (meia largura + afastamento).
 *
 * Puro: não depende de `blueprintPontosHidraulicos` (que usa este arquivo).
 */
import type { BlueprintModel, ObjectId, Point, TipoDePontoHidraulico } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel/geom';
import { encaixarNaParede } from './blueprintRotaPelasParedes';

/** As evaporadoras que se instalam NA PAREDE (cassete e dutada vão no forro). */
export const EVAPORADORAS_DE_PAREDE: readonly TipoDePontoHidraulico[] = ['EVAPORADORA_HI_WALL', 'EVAPORADORA_PISO_TETO'];
export const ehEvaporadoraDeParede = (tipo: string | null | undefined): boolean => !!tipo && (EVAPORADORAS_DE_PAREDE as readonly string[]).includes(tipo);

/** Até onde, da face, um clique ainda encosta a peça na parede (mm). */
export const ALCANCE_DO_ENCOSTO_MM = 600;
/** O ponto de força ao lado do aparelho: meia largura + este afastamento (mm). */
export const AFASTAMENTO_DO_PONTO_DE_FORCA_MM = 150;
/** Abaixo disto (mm, graus) a peça já está encostada — nada a ajustar. */
const TOLERANCIA_MM = 5;

/**
 * O giro da peça para o símbolo soprar para dentro: as lâminas do símbolo
 * ficam no +y LOCAL da tela (y para baixo), e o canvas desenha com
 * `rotate(-giro)`. Para a normal interna `n` do modelo (y para cima), o vetor
 * na tela é (n.x, −n.y), e R(−g)·(0, 1) = (sin g, cos g) ⇒ g = atan2(n.x, −n.y).
 */
export function giroParaSoprarParaDentro(n: { x: number; y: number }): number {
  return Math.round((Math.atan2(n.x, -n.y) * 180) / Math.PI);
}

export interface EncostoNaParede {
  wallId: ObjectId;
  /** O ponto da face diante do centro da peça. */
  face: Point;
  /** O centro da peça encostada (face + meia profundidade para dentro). */
  at: Point;
  /** Para dentro do ambiente (unitária). */
  normal: { x: number; y: number };
  /** Ao longo da parede (unitária). */
  tangente: { x: number; y: number };
  rotacaoGraus: number;
}

/** O encosto da peça de `profundidadeMm` na parede mais perto de `p` — `null` sem parede ao alcance. */
export function encostoNaParede(model: BlueprintModel, levelId: ObjectId, p: Point, profundidadeMm: number, alcanceMm = ALCANCE_DO_ENCOSTO_MM): EncostoNaParede | null {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  // O raio conta do EIXO: a meia espessura + a meia profundidade da peça já encostada + o alcance do clique.
  const e = encaixarNaParede(p, paredes, alcanceMm + profundidadeMm);
  if (!e) return null;
  const w = e.parede;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (L === 0) return null;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const n1 = { x: -u.y, y: u.x };
  const meia = w.thicknessMm / 2;
  const s = (p.x - e.q.x) * n1.x + (p.y - e.q.y) * n1.y;
  let n = s >= 0 ? n1 : { x: -n1.x, y: -n1.y };
  if (Math.abs(s) <= 1) {
    // Sobre o eixo: o lado que dá para um ambiente.
    const dentro = (m: { x: number; y: number }) => {
      const t = { x: e.q.x + m.x * (meia + 300), y: e.q.y + m.y * (meia + 300) };
      return model.spaces.some((sp) => sp.levelId === levelId && pointInPolygon(sp.ring, t));
    };
    if (!dentro(n) && dentro({ x: -n.x, y: -n.y })) n = { x: -n.x, y: -n.y };
  }
  const face = { x: Math.round(e.q.x + n.x * meia), y: Math.round(e.q.y + n.y * meia) };
  return {
    wallId: w.id,
    face,
    at: { x: Math.round(face.x + (n.x * profundidadeMm) / 2), y: Math.round(face.y + (n.y * profundidadeMm) / 2) },
    normal: n,
    tangente: u,
    rotacaoGraus: giroParaSoprarParaDentro(n),
  };
}

/** Os dois lugares do ponto de força ao lado da peça, na face: o primeiro é o preferido (o que cabe na parede). */
export function lugaresDoPontoDeForca(model: BlueprintModel, enc: EncostoNaParede, larguraMm: number): Point[] {
  const w = model.walls.find((x) => x.id === enc.wallId);
  const d = larguraMm / 2 + AFASTAMENTO_DO_PONTO_DE_FORCA_MM;
  const lado = (k: number) => ({ x: Math.round(enc.face.x + enc.tangente.x * d * k), y: Math.round(enc.face.y + enc.tangente.y * d * k) });
  if (!w) return [lado(1), lado(-1)];
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const t = (enc.face.x - w.a.x) * enc.tangente.x + (enc.face.y - w.a.y) * enc.tangente.y;
  // Para o lado em que a parede continua; se nenhum cabe, o de +tangente.
  return t + d <= L || t - d < 0 ? [lado(1), lado(-1)] : [lado(-1), lado(1)];
}

/** A peça já está encostada (posição e giro)? */
export function estaEncostada(at: Point, rotacaoGraus: number | null | undefined, enc: EncostoNaParede): boolean {
  const giro = (g: number) => ((Math.round(g) % 360) + 360) % 360;
  return Math.hypot(at.x - enc.at.x, at.y - enc.at.y) <= TOLERANCIA_MM && Math.abs(giro(rotacaoGraus ?? 0) - giro(enc.rotacaoGraus)) <= TOLERANCIA_MM;
}
