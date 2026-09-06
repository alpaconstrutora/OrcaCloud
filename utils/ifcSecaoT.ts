// utils/ifcSecaoT.ts
//
// Reconhecer uma seção em T num perfil poligonal do IFC.
//
// ─── POR QUE RECONHECER, E NÃO APROXIMAR ─────────────────────────────────────
//
// O exportador que gerou os modelos reais (AltoQi Eberick) nunca usa
// `IfcTShapeProfileDef`: ele escreve os oito cantos como
// `IfcArbitraryClosedProfileDef`. A forma está TODA no arquivo — mesa, alma,
// espessuras. Ler isso é leitura; deduzir uma T de uma malha seria estimativa,
// e é o que este módulo continua recusando.
//
// Medido em 06/09/2026: das vigas com perfil poligonal dos dois modelos
// estruturais reais, 219 são T e zero são L, I, U ou cruz.

import { limparContorno } from '../services/ifcParametricoService';

export interface SecaoTLida {
  /** Largura total — a da mesa, que é o que a viga ocupa em planta. */
  larguraLocal: number;
  /** Altura total da seção. */
  alturaLocal: number;
  /** Espessura da mesa. */
  mesaAlturaLocal: number;
  /** Largura da alma. */
  almaLarguraLocal: number;
  /**
   * A mesa está no lado de MAIOR coordenada do eixo de altura?
   *
   * Quem chama sabe se esse eixo aponta para cima ou para baixo no mundo, e é
   * quem decide se isso é uma T ou uma T invertida.
   */
  mesaNoMaior: boolean;
}

/** Motivo pelo qual o perfil não é uma T legível. `null` = é uma. */
export type RecusaDaSecaoT = string | null;

/**
 * Lê a seção T de um contorno, ou diz por que não é uma.
 *
 * `eixoAltura` diz qual coordenada do perfil é a ALTURA da seção — quem chama
 * descobre isso pela matriz, e passar errado daria uma T deitada.
 *
 * O que caracteriza a T, e cada teste existe porque a alternativa é um número
 * plausível e errado:
 *
 *   • OITO vértices depois de limpar pontos repetidos e colineares;
 *   • todos os lados paralelos aos eixos — uma T girada dentro do perfil não
 *     cabe em `secaoT`, que só guarda medidas;
 *   • exatamente DOIS cantos reflexos, que é o que distingue T de retângulo;
 *   • um dos lados da altura ocupa a largura INTEIRA (a mesa) e o outro não;
 *   • e o lado estreito é UM trecho só — dois trechos seriam um U, e tratá-lo
 *     como T daria o dobro do concreto no lugar errado.
 */
export function lerSecaoT(
  pontos: { x: number; y: number }[],
  eixoAltura: 'x' | 'y',
): { secao: SecaoTLida } | { recusa: string } {
  const q = limparContorno(pontos);
  if (q.length !== 8) return { recusa: `a seção tem ${q.length} vértices, e a T tem 8` };

  const h = (p: { x: number; y: number }) => (eixoAltura === 'x' ? p.x : p.y);
  const w = (p: { x: number; y: number }) => (eixoAltura === 'x' ? p.y : p.x);

  const tol = 1e-6;
  const ortogonal = q.every((c, i) => {
    const d = q[(i + 1) % 8];
    return Math.abs(c.x - d.x) <= tol || Math.abs(c.y - d.y) <= tol;
  });
  if (!ortogonal) return { recusa: 'a seção tem lados oblíquos, e a T do kernel é ortogonal' };

  let dobro = 0;
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    dobro += q[i].x * q[j].y - q[j].x * q[i].y;
  }
  const sinal = dobro >= 0 ? 1 : -1;
  let reflexos = 0;
  for (let i = 0; i < 8; i++) {
    const a = q[(i + 7) % 8];
    const b = q[i];
    const c = q[(i + 1) % 8];
    if (((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) * sinal < -tol) reflexos++;
  }
  if (reflexos !== 2) return { recusa: `a seção tem ${reflexos} cantos reentrantes, e a T tem 2` };

  const hs = q.map(h);
  const ws = q.map(w);
  const hMin = Math.min(...hs);
  const hMax = Math.max(...hs);
  const wMin = Math.min(...ws);
  const wMax = Math.max(...ws);
  const alturaLocal = hMax - hMin;
  const larguraLocal = wMax - wMin;
  if (!(alturaLocal > 0) || !(larguraLocal > 0)) return { recusa: 'a seção é degenerada' };

  /** Os trechos de material que uma horizontal atravessa, na altura `y`. */
  const cortes = (altura: number): number[] => {
    const xs: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = q[i];
      const b = q[(i + 1) % 8];
      const ha = h(a);
      const hb = h(b);
      if ((ha <= altura && hb > altura) || (hb <= altura && ha > altura)) {
        xs.push(w(a) + ((altura - ha) / (hb - ha)) * (w(b) - w(a)));
      }
    }
    return xs.sort((x, y) => x - y);
  };

  const perto = cortes(hMin + alturaLocal * 0.02);
  const longe = cortes(hMax - alturaLocal * 0.02);
  const largo = (c: number[]) => c.length === 2 && Math.abs(c[1] - c[0] - larguraLocal) <= tol * larguraLocal + 1e-9;

  const mesaNoMaior = largo(longe);
  const mesaNoMenor = largo(perto);
  if (mesaNoMaior === mesaNoMenor) {
    return { recusa: 'a seção não tem um lado cheio e outro estreito, como a T tem' };
  }

  const estreito = mesaNoMaior ? perto : longe;
  if (estreito.length !== 2) {
    // Quatro cortes = duas pernas = um U. O kernel não tem essa seção, e
    // chamá-la de T poria concreto onde há vazio.
    return { recusa: `a seção tem ${estreito.length / 2} almas, e a T tem 1` };
  }
  const almaLarguraLocal = estreito[1] - estreito[0];

  // A espessura da mesa: a altura em que a seção deixa de ocupar a largura toda.
  const alturasDaMesa = q
    .filter((p) => Math.abs(w(p)) === Math.max(...q.map((r) => Math.abs(w(r)))))
    .map(h);
  const mesaAlturaLocal = mesaNoMaior
    ? hMax - Math.min(...alturasDaMesa)
    : Math.max(...alturasDaMesa) - hMin;

  if (!(mesaAlturaLocal > 0) || mesaAlturaLocal >= alturaLocal) {
    return { recusa: 'a mesa da seção tem espessura inválida' };
  }
  if (!(almaLarguraLocal > 0) || almaLarguraLocal >= larguraLocal) {
    return { recusa: 'a alma da seção tem largura inválida' };
  }

  return {
    secao: { larguraLocal, alturaLocal, mesaAlturaLocal, almaLarguraLocal, mesaNoMaior },
  };
}
