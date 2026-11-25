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

/**
 * INSERIR CANTO (25/11/2026, pedido: *"inserir canto com duplo clique num lado do platô no 3D"*): o ponto clicado é
 * PROJETADO no lado mais próximo (inclusive o de fecho, do último ao primeiro canto) e entra entre as duas pontas
 * dele, em mm inteiros. Em cima de um canto que já existe, nada muda.
 */
export function inserirCanto(anel: readonly Point[], ponto: Point): Point[] {
  let melhor = { i: -1, d: Infinity, p: ponto };
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((ponto.x - a.x) * dx + (ponto.y - a.y) * dy) / L2));
    const p = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(ponto.x - p.x, ponto.y - p.y);
    if (d < melhor.d) melhor = { i, d, p };
  }
  const novo = { x: Math.round(melhor.p.x), y: Math.round(melhor.p.y) };
  if (melhor.i < 0 || anel.some((q) => q.x === novo.x && q.y === novo.y)) return [...anel];
  return [...anel.slice(0, melhor.i + 1), novo, ...anel.slice(melhor.i + 1)];
}

/** REMOVER CANTO (botão direito numa bolinha): tira o i-ésimo — mas o platô nunca fica com menos de 3. */
export function removerCanto(anel: readonly Point[], i: number): Point[] {
  if (anel.length <= 3) return [...anel];
  return anel.filter((_, k) => k !== i);
}

/**
 * A ALÇA DO MEIO DO LADO (25/11/2026, reel "Terrain Modification Tool": arrastar o lado inteiro). O lado `i`
 * (`anel[i]` → `anel[i+1]`, o último fecha no primeiro) anda na PERPENDICULAR dele: só o componente do `deslocamento`
 * na normal conta (o lado não escorrega ao longo de si). Os dois cantos do lado andam juntos; mm inteiros.
 */
export function moverLado(anel: readonly Point[], i: number, deslocamento: Point): Point[] {
  const n = anel.length;
  const a = anel[i];
  const b = anel[(i + 1) % n];
  const comp = Math.hypot(b.x - a.x, b.y - a.y);
  if (comp === 0) return anel.slice();
  const nx = (b.y - a.y) / comp;
  const ny = -(b.x - a.x) / comp;
  const d = deslocamento.x * nx + deslocamento.y * ny;
  const mover = (p: Point): Point => ({ x: Math.round(p.x + nx * d), y: Math.round(p.y + ny * d) });
  return anel.map((p, k) => (k === i || k === (i + 1) % n ? mover(p) : p));
}
