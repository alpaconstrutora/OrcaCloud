/**
 * Reconhecer a seção T num perfil poligonal do IFC.
 *
 * O exportador dos modelos reais nunca usa `IfcTShapeProfileDef` — escreve os
 * oito cantos como polígono. A forma está toda no arquivo; ler isso é leitura.
 *
 * Cada recusa aqui existe porque a alternativa seria um número plausível e
 * errado: um U tratado como T põe concreto onde há vazio; uma T girada perde a
 * orientação; um retângulo com pontos sobrando viraria uma T de medidas
 * inventadas.
 */
import { describe, expect, it } from 'vitest';
import { lerSecaoT } from '../utils/ifcSecaoT';

const pts = (...c: [number, number][]) => c.map(([x, y]) => ({ x, y }));

/** T de 99 × 70, mesa 15 no topo, alma 19 — a mais comum do modelo real. */
const T_REAL = pts(
  [-9.5, -35], [9.5, -35], [9.5, 20], [49.5, 20], [49.5, 35], [-49.5, 35], [-49.5, 20], [-9.5, 20],
);

const ok = (r: ReturnType<typeof lerSecaoT>) => {
  if ('recusa' in r) throw new Error(`esperava seção, veio recusa: ${r.recusa}`);
  return r.secao;
};
const recusa = (r: ReturnType<typeof lerSecaoT>) => {
  if (!('recusa' in r)) throw new Error('esperava recusa, veio seção');
  return r.recusa;
};

describe('ifc · ler a seção T', () => {
  it('lê as quatro medidas da T real', () => {
    const s = ok(lerSecaoT(T_REAL, 'y'));
    expect(s.larguraLocal).toBe(99);
    expect(s.alturaLocal).toBe(70);
    expect(s.mesaAlturaLocal).toBe(15);
    expect(s.almaLarguraLocal).toBe(19);
    expect(s.mesaNoMaior).toBe(true);
  });

  it('a T INVERTIDA é lida, e quem chama decide o que fazer com ela', () => {
    // A mesa embaixo. Este módulo relata onde ela está; recusar ou aceitar é
    // decisão de quem conhece a orientação do eixo no mundo.
    const invertida = T_REAL.map((p) => ({ x: p.x, y: -p.y }));
    const s = ok(lerSecaoT(invertida, 'y'));
    expect(s.mesaNoMaior).toBe(false);
    expect(s.mesaAlturaLocal).toBe(15);
  });

  it('com o eixo de altura em X, lê a T deitada no perfil', () => {
    const deitada = T_REAL.map((p) => ({ x: p.y, y: p.x }));
    const s = ok(lerSecaoT(deitada, 'x'));
    expect(s.larguraLocal).toBe(99);
    expect(s.alturaLocal).toBe(70);
  });

  it('pontos colineares sobrando não atrapalham', () => {
    const comSobra = [...T_REAL.slice(0, 5), { x: 0, y: 35 }, ...T_REAL.slice(5)];
    expect(ok(lerSecaoT(comSobra, 'y')).almaLarguraLocal).toBe(19);
  });
});

describe('ifc · o que NÃO é uma T', () => {
  it('retângulo — quatro vértices', () => {
    expect(recusa(lerSecaoT(pts([-9, -35], [9, -35], [9, 35], [-9, 35]), 'y'))).toMatch(
      /4 vértices/,
    );
  });

  it('L — seis vértices e um canto reentrante', () => {
    const l = pts([-30, -35], [30, -35], [30, -15], [-10, -15], [-10, 35], [-30, 35]);
    expect(recusa(lerSecaoT(l, 'y'))).toMatch(/6 vértices/);
  });

  it('U — oito vértices e DUAS almas: o caso perigoso', () => {
    // Mesmo número de vértices e de cantos reentrantes que a T. Só a contagem
    // de trechos no lado estreito separa os dois.
    const u = pts(
      [-49.5, -35], [49.5, -35], [49.5, 35], [29.5, 35], [29.5, -20], [-29.5, -20], [-29.5, 35], [-49.5, 35],
    );
    expect(recusa(lerSecaoT(u, 'y'))).toMatch(/2 almas/);
  });

  it('T girada dentro do perfil — a seção só guarda medidas, não ângulo', () => {
    const girada = T_REAL.map((p) => ({
      x: p.x * Math.cos(0.4) - p.y * Math.sin(0.4),
      y: p.x * Math.sin(0.4) + p.y * Math.cos(0.4),
    }));
    expect(recusa(lerSecaoT(girada, 'y'))).toMatch(/oblíquos/);
  });

  it('cruz — quatro cantos reentrantes', () => {
    const cruz = pts(
      [-10, -35], [10, -35], [10, -10], [40, -10], [40, 10], [10, 10],
      [10, 35], [-10, 35], [-10, 10], [-40, 10], [-40, -10], [-10, -10],
    );
    expect(recusa(lerSecaoT(cruz, 'y'))).toMatch(/12 vértices/);
  });
});
