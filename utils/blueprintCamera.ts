/**
 * CÂMERA — as contas (12/10/2026, F12 do plano `2026-10-11-planta-recursos-video-synaps.md`): a lente em
 * ângulo de visão, o cone do símbolo da planta, a posição no mundo do 3D e o tópico BCF da vista.
 *
 * ─── A LENTE ────────────────────────────────────────────────────────────────
 *
 * `focalMm` é a focal EQUIVALENTE a 35 mm (quadro 36 × 24): é como o arquiteto e o fotógrafo de
 * interiores falam ("24 mm"). O que se preserva é o ângulo HORIZONTAL da lente — o que a planta
 * desenha no cone; o vertical sai do formato da tela (o 3D do three.js pede o vertical).
 */
import type { Camera, Point } from './blueprintKernel';
import type { TopicoBcf } from './blueprintBcf';

const GRAUS = 180 / Math.PI;
/** Metade da largura e da altura do quadro de 35 mm. */
const MEIA_LARGURA_35 = 18;
const MEIA_ALTURA_35 = 12;

/** Ângulo HORIZONTAL de visão da lente, em graus (24 mm → 73,7°). */
export function fovHorizontalGraus(focalMm: number): number {
  return 2 * Math.atan(MEIA_LARGURA_35 / focalMm) * GRAUS;
}

/**
 * Ângulo VERTICAL para uma tela de `aspecto` (largura / altura), mantendo o horizontal da lente.
 * No quadro de 35 mm (aspecto 1,5) é o vertical da própria lente: 2·atan(12 / f).
 */
export function fovVerticalGraus(focalMm: number, aspecto = MEIA_LARGURA_35 / MEIA_ALTURA_35): number {
  return 2 * Math.atan(MEIA_LARGURA_35 / focalMm / aspecto) * GRAUS;
}

/** Direção horizontal unitária, da posição para o alvo. */
export function direcaoDaCamera(c: Pick<Camera, 'posicao' | 'alvo'>): { x: number; y: number } {
  const dx = c.alvo.x - c.posicao.x;
  const dy = c.alvo.y - c.posicao.y;
  const n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

/** O CONE da planta: as duas bordas do ângulo horizontal, até a distância do alvo. */
export function coneDaCamera(c: Pick<Camera, 'posicao' | 'alvo' | 'focalMm'>): { esquerda: Point; direita: Point } {
  const d = direcaoDaCamera(c);
  const alcance = Math.hypot(c.alvo.x - c.posicao.x, c.alvo.y - c.posicao.y);
  const meio = (fovHorizontalGraus(c.focalMm) / 2 / GRAUS);
  const girar = (a: number) => ({ x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) });
  const e = girar(meio);
  const r = girar(-meio);
  return {
    esquerda: { x: c.posicao.x + e.x * alcance, y: c.posicao.y + e.y * alcance } as Point,
    direita: { x: c.posicao.x + r.x * alcance, y: c.posicao.y + r.y * alcance } as Point,
  };
}

/**
 * No MUNDO do 3D (metros; X = x do modelo, Y = altura, Z = y do modelo — a convenção de
 * `blueprint3dPecas`): o olho e o ponto olhado, na MESMA altura (a câmera é nivelada).
 */
export function cameraNoMundo3d(c: Pick<Camera, 'posicao' | 'alvo' | 'alturaOlhoMm'>, elevacaoDoNivelMm: number): { posicao: [number, number, number]; alvo: [number, number, number] } {
  const S = 0.001;
  const y = (elevacaoDoNivelMm + c.alturaOlhoMm) * S;
  return { posicao: [c.posicao.x * S, y, c.posicao.y * S], alvo: [c.alvo.x * S, y, c.alvo.y * S] };
}

/**
 * A câmera como TÓPICO BCF ("Vista — nome"): sem componente apontado, com a câmera em PERSPECTIVA no
 * viewpoint — quem abre no Solibri/BIMcollab cai no mesmo ponto de vista. Mundo do BCF: metro, Z para
 * cima (x, y do modelo; z = cota do piso + olho).
 */
export function topicoDaCamera(c: Camera, elevacaoDoNivelMm: number, guid: string, autor: string, criadoEm: Date): TopicoBcf {
  const d = direcaoDaCamera(c);
  const z = elevacaoDoNivelMm + c.alturaOlhoMm;
  return {
    guid,
    titulo: `Vista — ${c.nome}`,
    tipo: 'Issue',
    status: 'Open',
    autor,
    criadoEm,
    descricao: `Ponto de vista salvo na planta: olho a ${(c.alturaOlhoMm / 1000).toFixed(2).replace('.', ',')} m do piso, lente de ${c.focalMm} mm.`,
    componentes: [],
    alvo: { x: c.alvo.x, y: c.alvo.y, z },
    camera: { posicao: { x: c.posicao.x, y: c.posicao.y, z }, direcao: { x: d.x, y: d.y, z: 0 }, fovVerticalGraus: fovVerticalGraus(c.focalMm) },
  };
}
