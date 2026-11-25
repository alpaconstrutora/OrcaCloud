/**
 * EDITAR O PLATÔ NO 3D (25/11/2026, P3 do platô desenhado — reel "Terrain Modification Tool"). As contas puras dos
 * gestos: mover um canto (com a trava de 90° da planta), validar o contorno antes de gravar e a cota da seta.
 * O viewer só converte o mouse em ponto do desenho e chama estas funções.
 */
import { isSimplePolygon, travarOrtogonal, type Point } from './blueprintKernel';

/** Passo da seta: 5 cm (o campo do painel também anda de 0,05 m). */
export const PASSO_DA_SETA_M = 0.05;

/**
 * O anel com o canto `i` em `destino` (mm inteiros). `orto`: alinha ao vizinho (anterior ou seguinte) mais próximo
 * do destino — horizontal ou vertical, como a trava de 90° do desenho na planta.
 */
export function moverCanto(anel: readonly Point[], i: number, destino: Point, orto: boolean): Point[] {
  let alvo = destino;
  if (orto && anel.length >= 2) {
    const ant = anel[(i - 1 + anel.length) % anel.length];
    const seg = anel[(i + 1) % anel.length];
    const vizinho = Math.hypot(destino.x - ant.x, destino.y - ant.y) <= Math.hypot(destino.x - seg.x, destino.y - seg.y) ? ant : seg;
    alvo = travarOrtogonal(vizinho, destino);
  }
  const p = { x: Math.round(alvo.x), y: Math.round(alvo.y) };
  return anel.map((q, k) => (k === i ? p : q));
}

/** O contorno pode ser gravado: ≥ 3 cantos distintos e sem se cruzar. */
export function anelValido(anel: readonly Point[]): boolean {
  const distintos = anel.filter((p, i) => anel.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  return distintos.length >= 3 && distintos.length === anel.length && isSimplePolygon([...anel]);
}

/**
 * Quanto da subida do mouse vira cota (25/11/2026, prova em produção): 1 : 1 deixava a seta sensível demais em
 * terreno grande — no lote de 344 m, 50 px de arraste davam +56 m. Normal = 0,2; com Shift (ajuste fino) = 0,02.
 */
export const FATOR_DA_SETA = 0.2;
export const FATOR_DA_SETA_FINO = 0.02;

/** A cota depois de arrastar a seta `dyMundoM` metros (com Shift: `fino`), arredondada ao passo de 5 cm. */
export function cotaDaSeta(cotaInicialM: number, dyMundoM: number, fino = false): number {
  const dy = dyMundoM * (fino ? FATOR_DA_SETA_FINO : FATOR_DA_SETA);
  const passos = Math.round((cotaInicialM + dy) / PASSO_DA_SETA_M);
  return Math.round(passos * PASSO_DA_SETA_M * 100) / 100;
}
