/**
 * PADRÕES DE HACHURA DE MATERIAL (F6 do plano `2026-10-11-planta-recursos-video-synaps.md`, kernel 0.96.0).
 *
 * A geometria PURA que tela e PDF compartilham: dado um contorno (o ambiente, a
 * faixa de uma camada de parede), as linhas do padrão já recortadas por ele, em
 * mm do modelo. O kernel só guarda a ESCOLHA (`CamadaParede.hachura`); o módulo
 * de cada padrão a 100 % mora aqui.
 *
 * ─── ANCORADO NA ORIGEM ─────────────────────────────────────────────────────
 *
 * O padrão é gerado num referencial girado em torno da ORIGEM DO MODELO, com a
 * grade em múltiplos do módulo — e não a partir do canto de cada contorno. É o
 * que faz dois ambientes vizinhos com o mesmo porcelanato alinharem as juntas, e
 * duas paredes colineares com o mesmo tijolo continuarem a mesma fiada.
 *
 * ─── O GIRO ─────────────────────────────────────────────────────────────────
 *
 * `rotacaoGraus` da camada + `anguloBaseRad` de quem chama. Na parede, a base é o
 * ângulo da própria parede: o tijolo corre AO LONGO dela em qualquer direção, e o
 * giro da camada fica para o caso raro. No piso, a base é zero.
 */

import type { HachuraDaCamada, PadraoDeMaterial, Point } from './blueprintKernel';
import { recortarSegmento, type Segmento } from './blueprintHumanizada';

/** Módulo de cada padrão a 100 %, em mm — o que a escala multiplica. */
export const MODULO_DO_PADRAO_MM: Record<PadraoDeMaterial, number> = {
  DIAGONAL: 100,
  CRUZADA: 150,
  AZULEJO: 200,
  PORCELANATO: 600,
  TABUA: 150,
  ESPINHA_DE_PEIXE: 200,
  TIJOLO: 100,
  CONCRETO: 150,
  ISOLAMENTO: 150,
};

/** Trama demais é ruído, não desenho — e trava a tela num piso enorme a 10 %. */
export const LIMITE_DE_SEGMENTOS = 6000;

const girar = (p: Point, c: number, s: number): Point => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }) as Point;

/** Pseudoaleatório determinístico em [0,1): a hachura não pode mudar entre dois desenhos. */
function ruido(...ns: number[]): number {
  let h = 2166136261;
  for (const n of ns) {
    h ^= Math.trunc(n) & 0xffffffff;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function linhasDoPadrao(
  hachura: HachuraDaCamada,
  anel: readonly Point[],
  furos: readonly (readonly Point[])[] = [],
  anguloBaseRad = 0,
): Segmento[] {
  if (anel.length < 3) return [];
  const m = (MODULO_DO_PADRAO_MM[hachura.padrao] * hachura.escalaPct) / 100;
  if (!(m > 0)) return [];
  const th = (hachura.rotacaoGraus * Math.PI) / 180 + anguloBaseRad;
  const c = Math.cos(th);
  const s = Math.sin(th);
  // Para o referencial do padrão: gira o contorno por −θ; as linhas voltam por +θ.
  const anelL = anel.map((p) => girar(p, c, -s));
  const furosL = furos.map((f) => f.map((p) => girar(p, c, -s)));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of anelL) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const out: Segmento[] = [];
  const cheio = () => out.length >= LIMITE_DE_SEGMENTOS;
  const rec = (a: Point, b: Point) => {
    for (const seg of recortarSegmento(a, b, anelL as Point[], furosL as Point[][])) {
      out.push({ a: girar(seg.a, c, s), b: girar(seg.b, c, s) });
    }
  };
  const ancorado = (v: number, passo: number) => Math.floor(v / passo) * passo;
  const linhasRetas = (passo: number) => {
    for (let y = ancorado(minY, passo); y <= maxY && !cheio(); y += passo) rec({ x: minX, y } as Point, { x: maxX, y } as Point);
  };
  /** Linhas a 45° (sentido +1) ou a −45° (−1), espaçadas `passo` na perpendicular. */
  const diagonais = (passo: number, sentido: 1 | -1) => {
    // x − sentido·y = k·passo·√2  →  varre k no intervalo que a caixa alcança.
    const d = passo * Math.SQRT2;
    const ks = [minX - sentido * minY, minX - sentido * maxY, maxX - sentido * minY, maxX - sentido * maxY];
    const k0 = Math.floor(Math.min(...ks) / d);
    const k1 = Math.ceil(Math.max(...ks) / d);
    for (let k = k0; k <= k1 && !cheio(); k++) {
      const off = k * d;
      // Pontos da reta nas alturas minY e maxY.
      rec({ x: off + sentido * minY, y: minY } as Point, { x: off + sentido * maxY, y: maxY } as Point);
    }
  };
  /** Zigue-zague horizontal: fileiras a cada `passo`, dentes de largura `meio` e altura `amp`. */
  const zigueZague = (passo: number, meio: number, amp: number) => {
    for (let y = ancorado(minY - amp, passo); y <= maxY && !cheio(); y += passo) {
      for (let x = ancorado(minX, 2 * meio); x <= maxX && !cheio(); x += 2 * meio) {
        rec({ x, y } as Point, { x: x + meio, y: y + amp } as Point);
        rec({ x: x + meio, y: y + amp } as Point, { x: x + 2 * meio, y } as Point);
      }
    }
  };
  const juntasDesencontradas = (fiada: number, comprimento: number, fracao: number) => {
    let i = Math.floor(minY / fiada);
    for (let y = i * fiada; y <= maxY && !cheio(); y += fiada, i++) {
      rec({ x: minX, y } as Point, { x: maxX, y } as Point);
      const desloc = (((i % (1 / fracao)) + 1 / fracao) % (1 / fracao)) * comprimento * fracao;
      for (let x = ancorado(minX, comprimento) + desloc - comprimento; x <= maxX && !cheio(); x += comprimento) {
        rec({ x, y } as Point, { x, y: y + fiada } as Point);
      }
    }
  };

  switch (hachura.padrao) {
    case 'DIAGONAL':
      diagonais(m, 1);
      break;
    case 'CRUZADA':
      diagonais(m, 1);
      diagonais(m, -1);
      break;
    case 'AZULEJO':
    case 'PORCELANATO': {
      linhasRetas(m);
      for (let x = ancorado(minX, m); x <= maxX && !cheio(); x += m) rec({ x, y: minY } as Point, { x, y: maxY } as Point);
      break;
    }
    case 'TABUA':
      // Fiadas de `m`, topos a cada 6 módulos, desencontrados um terço por fiada.
      juntasDesencontradas(m, 6 * m, 1 / 3);
      break;
    case 'TIJOLO':
      // Fiadas de `m`, junta a cada 2,5 módulos, meia peça de desencontro (amarração corrida).
      juntasDesencontradas(m, 2.5 * m, 1 / 2);
      break;
    case 'ESPINHA_DE_PEIXE':
      // Chevron: zigue-zagues paralelos — dente de `m` e fileiras a cada `m/√2`.
      zigueZague(m / Math.SQRT2, m, m);
      break;
    case 'ISOLAMENTO':
      // A manta: zigue-zague de dente baixo e fileiras afastadas.
      zigueZague(m, m / 2, m / 2);
      break;
    case 'CONCRETO': {
      // Pontilhado de agregado: um triângulo pequeno e um ponto por célula, posição determinística.
      for (let y = ancorado(minY, m); y <= maxY && !cheio(); y += m) {
        for (let x = ancorado(minX, m); x <= maxX && !cheio(); x += m) {
          const tx = x + m * (0.15 + 0.5 * ruido(x, y, 1));
          const ty = y + m * (0.15 + 0.5 * ruido(x, y, 2));
          const r = m * 0.12;
          rec({ x: tx, y: ty } as Point, { x: tx + r, y: ty } as Point);
          rec({ x: tx + r, y: ty } as Point, { x: tx + r / 2, y: ty + r * 0.87 } as Point);
          rec({ x: tx + r / 2, y: ty + r * 0.87 } as Point, { x: tx, y: ty } as Point);
          const px = x + m * (0.6 + 0.3 * ruido(x, y, 3));
          const py = y + m * (0.55 + 0.35 * ruido(x, y, 4));
          rec({ x: px, y: py } as Point, { x: px + m * 0.04, y: py } as Point);
        }
      }
      break;
    }
  }
  return out;
}
