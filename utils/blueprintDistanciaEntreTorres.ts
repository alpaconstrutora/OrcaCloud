// utils/blueprintDistanciaEntreTorres.ts
//
// DISTÂNCIA ENTRE TORRES NA MASSA (28/10/2026): a distância que o Empreendimento pede entre cada par de torres
// (`utils/empreendimentoDistanciasEntreTorres`) conferida nos blocos da Planta, e o afastamento que o "Ajustar ao
// Empreendimento" aplica (decisão do usuário: o ajuste afasta as torres). Plano:
// docs/planos/2026-10-28-distancia-entre-torres.md.
//
// A distância é de CONTORNO A CONTORNO, em planta (a menor entre as faces); sobrepostos ou encostados = 0. Puro.

import type { Point } from './blueprintKernel';

function dentro(p: Point, anel: readonly Point[]): boolean {
  let d = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i];
    const b = anel[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) d = !d;
  }
  return d;
}

function pontoAoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function cruzam(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** A menor distância entre os dois contornos (mm); 0 quando se sobrepõem ou encostam. */
export function distanciaEntrePoligonosMm(a: readonly Point[], b: readonly Point[]): number {
  if (a.length < 3 || b.length < 3) return Infinity;
  if (a.some((p) => dentro(p, b)) || b.some((p) => dentro(p, a))) return 0;
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (cruzam(a1, a2, b1, b2)) return 0;
      min = Math.min(min, pontoAoSegmento(a1, b1, b2), pontoAoSegmento(a2, b1, b2), pontoAoSegmento(b1, a1, a2), pontoAoSegmento(b2, a1, a2));
    }
  }
  return Math.round(min);
}

export function transladar(anel: readonly Point[], d: Point): Point[] {
  return anel.map((p) => ({ x: Math.round(p.x + d.x), y: Math.round(p.y + d.y) }));
}

const centro = (anel: readonly Point[]) => ({ x: anel.reduce((s, p) => s + p.x, 0) / anel.length, y: anel.reduce((s, p) => s + p.y, 0) / anel.length });

/**
 * O deslocamento (mm) que leva `movel` a `exigidaMm` de `fixa`, na direção de um centro para o outro (mesmo centro: o
 * eixo x); null quando já cumpre. Busca binária no tamanho do passo, arredondado para cima ao mm.
 */
export function afastamentoNecessario(fixa: readonly Point[], movel: readonly Point[], exigidaMm: number): Point | null {
  if (distanciaEntrePoligonosMm(fixa, movel) >= exigidaMm) return null;
  const cf = centro(fixa);
  const cm = centro(movel);
  const len = Math.hypot(cm.x - cf.x, cm.y - cf.y);
  const u = len < 1 ? { x: 1, y: 0 } : { x: (cm.x - cf.x) / len, y: (cm.y - cf.y) / len };
  const caixa = (anel: readonly Point[]) => Math.hypot(Math.max(...anel.map((p) => p.x)) - Math.min(...anel.map((p) => p.x)), Math.max(...anel.map((p) => p.y)) - Math.min(...anel.map((p) => p.y)));
  let lo = 0;
  let hi = exigidaMm + caixa(fixa) + caixa(movel);
  for (let k = 0; k < 50; k++) {
    const meio = (lo + hi) / 2;
    if (distanciaEntrePoligonosMm(fixa, transladar(movel, { x: u.x * meio, y: u.y * meio })) >= exigidaMm) hi = meio;
    else lo = meio;
  }
  const t = Math.ceil(hi);
  return { x: u.x * t, y: u.y * t };
}
