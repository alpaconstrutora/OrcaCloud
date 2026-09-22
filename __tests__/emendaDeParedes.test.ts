/**
 * A EMENDA COMPARTILHADA (P2.34) e o lado da porta ao virar a peça (P2.37).
 *
 * `emendarColineares` recompõe duas peças colineares no sentido da primeira —
 * e, quando a segunda foi desenhada ao contrário, VIRA a segunda. Virar troca
 * as duas referências que orientam uma porta (`a`↔`b` e a normal), então
 * `hingeAtStart` e `swingReversed` têm de inverter junto: a porta abre para um
 * lado do MUNDO, não do vetor.
 */
import { describe, expect, it } from 'vitest';
import { emendarColineares, type AberturaLida, type ParedeEmendavel } from '../utils/emendaDeParedes';

const parede = (ax: number, ay: number, bx: number, by: number, aberturas: AberturaLida[] = []): ParedeEmendavel => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  espessuraMm: 150,
  comprimentoMm: Math.round(Math.hypot(bx - ax, by - ay)),
  aberturas,
});

/** Para que lado do mundo a folha abre, e onde fica a dobradiça — a fórmula do canvas. */
function portaNoMundo(p: ParedeEmendavel, ab: AberturaLida) {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
  const ux = (p.b.x - p.a.x) / L;
  const uy = (p.b.y - p.a.y) / L;
  const nx = -uy;
  const ny = ux;
  const lado = ab.swingReversed ? -1 : 1;
  const base = ab.hingeAtStart ? ab.offsetMm : ab.offsetMm + ab.widthMm;
  return {
    dobradica: { x: Math.round(p.a.x + ux * base) + 0, y: Math.round(p.a.y + uy * base) + 0 },
    // `+ 0` normaliza o −0 que o arredondamento produz: −0 e 0 são o mesmo lado.
    abrePara: { x: Math.round(nx * lado) + 0, y: Math.round(ny * lado) + 0 },
  };
}

const PASSAGEM: AberturaLida = { kind: 'passage', offsetMm: 0, widthMm: 0, heightMm: 2800, sillMm: 0 };

describe('emendarColineares · a peça virada mantém a porta no mesmo lado do mundo', () => {
  it('a segunda peça, desenhada ao contrário, entra virada — e a porta dela continua com a dobradiça e o lado de antes', () => {
    // A: (0,0)→(4000,0). B: (10000,0)→(5000,0) — ao contrário. Porta de B: de x=8100 a x=9000,
    // dobradiça em x=9000, abrindo para −y (no sentido de B, n = (0,−1), logo swingReversed=false).
    const a = parede(0, 0, 4000, 0);
    const b = parede(10000, 0, 5000, 0, [{ kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0, hingeAtStart: true, swingReversed: false }]);
    const antes = portaNoMundo(b, b.aberturas[0]);
    expect(antes).toEqual({ dobradica: { x: 9000, y: 0 }, abrePara: { x: 0, y: -1 } });

    const [emendada] = emendarColineares([a, b], { vaoMinMm: 300, vaoMaxMm: 3000, classificar: () => PASSAGEM });
    expect(emendada.a).toEqual({ x: 0, y: 0 });
    expect(emendada.b).toEqual({ x: 10000, y: 0 });
    const porta = emendada.aberturas.find((o) => o.kind === 'door')!;
    // A porta está onde sempre esteve (x de 8100 a 9000) e abre para o MESMO lado do mundo.
    expect(porta.offsetMm).toBe(8100);
    expect(portaNoMundo(emendada, porta)).toEqual(antes);
    // E, em termos dos dois booleanos: os dois viraram.
    expect(porta.hingeAtStart).toBe(false);
    expect(porta.swingReversed).toBe(true);
  });

  it('a peça que NÃO precisa virar não mexe na porta', () => {
    const a = parede(0, 0, 4000, 0);
    const b = parede(5000, 0, 10000, 0, [{ kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0, hingeAtStart: true, swingReversed: false }]);
    const [emendada] = emendarColineares([a, b], { vaoMinMm: 300, vaoMaxMm: 3000, classificar: () => PASSAGEM });
    const porta = emendada.aberturas.find((o) => o.kind === 'door')!;
    expect(porta).toMatchObject({ offsetMm: 6000, hingeAtStart: true, swingReversed: false });
    expect(portaNoMundo(emendada, porta)).toEqual({ dobradica: { x: 6000, y: 0 }, abrePara: { x: 0, y: 1 } });
  });

  it('abertura sem lado declarado (vão livre, janela) continua sem lado ao virar', () => {
    const a = parede(0, 0, 4000, 0);
    const b = parede(10000, 0, 5000, 0, [{ kind: 'window', offsetMm: 1000, widthMm: 1200, heightMm: 1200, sillMm: 1000 }]);
    const [emendada] = emendarColineares([a, b], { vaoMinMm: 300, vaoMaxMm: 3000, classificar: () => PASSAGEM });
    const janela = emendada.aberturas.find((o) => o.kind === 'window')!;
    expect(janela).toEqual({ kind: 'window', offsetMm: 7800, widthMm: 1200, heightMm: 1200, sillMm: 1000 });
  });
});
