/**
 * A frente do lote para as âncoras da hidráulica (13/10/2026) —
 * `utils/blueprintAncorasHidro.ts`. Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 1.1.
 *
 * Lote 10 × 20 m; a rua ao SUL (y = 0 é a divisa da frente).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { RECUO_DA_ANCORA_MM, cotaDoTerrenoEm, frenteDoLote, pontoNaFrente } from '../utils/blueprintAncorasHidro';

const R = RECUO_DA_ANCORA_MM;

function base(): { m: BlueprintModel; nivel: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  return { m, nivel: m.levels[0].id };
}

const RETANGULO: [number, number][] = [[0, 0], [10000, 0], [10000, 20000], [0, 20000]];

/** As divisas do anel; `frentes` = índices dos lados marcados FRENTE (o lado i vai do canto i ao i+1). */
function comDivisas(cantos: [number, number][], frentes: number[] = [], fechado = true): BlueprintModel {
  const { m, nivel } = base();
  const n = cantos.length;
  const cmds: Command[] = [];
  for (let i = 0; i < (fechado ? n : n - 1); i++) {
    const [ax, ay] = cantos[i];
    const [bx, by] = cantos[(i + 1) % n];
    cmds.push({ type: 'AddBoundary', levelId: nivel, a: { x: ax, y: ay }, b: { x: bx, y: by }, kind: 'TERRENO', ...(frentes.includes(i) ? { papel: 'FRENTE' as const } : {}) });
  }
  return applyBatch(m, cmds).model;
}

describe('frenteDoLote / pontoNaFrente — pela divisa marcada FRENTE', () => {
  it('projeta o alvo na frente e recua para DENTRO do lote', () => {
    const m = comDivisas(RETANGULO, [0]);
    expect(frenteDoLote(m)?.origem).toBe('PAPEL');
    expect(pontoNaFrente(m, { x: 3000, y: 5000 })).toEqual({ naDivisa: { x: 3000, y: 0 }, ponto: { x: 3000, y: R }, origem: 'PAPEL' });
  });

  it('anel desenhado no sentido HORÁRIO: o lado de dentro não troca', () => {
    // Mesmo retângulo ao contrário; a frente (0,0)→(10000,0) vira o lado 3: (10000,0)→(0,0).
    const horario: [number, number][] = [[0, 0], [0, 20000], [10000, 20000], [10000, 0]];
    const m = comDivisas(horario, [3]);
    expect(pontoNaFrente(m, { x: 3000, y: 5000 })?.ponto).toEqual({ x: 3000, y: R });
  });

  it('alvo fora do alcance do segmento: preso longe da ponta (canto não é lugar de ligação)', () => {
    const m = comDivisas(RETANGULO, [0]);
    expect(pontoNaFrente(m, { x: -5000, y: 5000 })).toMatchObject({ naDivisa: { x: R, y: 0 }, ponto: { x: R, y: R } });
    expect(pontoNaFrente(m, { x: 15000, y: 5000 })).toMatchObject({ naDivisa: { x: 10000 - R, y: 0 } });
  });

  it('lote de esquina (duas frentes): vale a mais perto do alvo', () => {
    // Frente sul (lado 0) e frente oeste (lado 3: (0,20000)→(0,0)).
    const m = comDivisas(RETANGULO, [0, 3]);
    expect(frenteDoLote(m)?.segmentos).toHaveLength(2);
    expect(pontoNaFrente(m, { x: 1000, y: 8000 })).toMatchObject({ naDivisa: { x: 0, y: 8000 }, ponto: { x: R, y: 8000 } });
    expect(pontoNaFrente(m, { x: 6000, y: 1500 })).toMatchObject({ naDivisa: { x: 6000, y: 0 }, ponto: { x: 6000, y: R } });
  });

  it('contorno ABERTO: dentro é o lado do alvo', () => {
    // Três lados, falta o de cima.
    const m = comDivisas(RETANGULO, [0], false);
    expect(pontoNaFrente(m, { x: 4000, y: 6000 })?.ponto).toEqual({ x: 4000, y: R });
  });
});

describe('frenteDoLote — sem papel marcado', () => {
  it('pelo lado do anel que dá para a VIA: ao sul, o lado sul; ao norte, o lado norte', () => {
    const m0 = comDivisas(RETANGULO);
    const nivel = m0.levels[0].id;
    const sul = applyCommand(m0, { type: 'AddVia', levelId: nivel, nome: 'Rua 1', eixo: [{ x: -10000, y: -6000 }, { x: 30000, y: -6000 }], larguraMm: 12000 }).model;
    expect(frenteDoLote(sul)?.origem).toBe('VIA');
    expect(pontoNaFrente(sul, { x: 5000, y: 10000 })?.ponto).toEqual({ x: 5000, y: R });
    const norte = applyCommand(m0, { type: 'AddVia', levelId: nivel, nome: 'Rua 2', eixo: [{ x: -10000, y: 26000 }, { x: 30000, y: 26000 }], larguraMm: 12000 }).model;
    expect(pontoNaFrente(norte, { x: 5000, y: 10000 })?.ponto).toEqual({ x: 5000, y: 20000 - R });
  });

  it('a divisa marcada vence a via', () => {
    const m0 = comDivisas(RETANGULO, [0]);
    const norte = applyCommand(m0, { type: 'AddVia', levelId: m0.levels[0].id, nome: 'Rua 2', eixo: [{ x: -10000, y: 26000 }, { x: 30000, y: 26000 }], larguraMm: 12000 }).model;
    expect(pontoNaFrente(norte, { x: 5000, y: 10000 })).toMatchObject({ origem: 'PAPEL', ponto: { x: 5000, y: R } });
  });

  it('pela TESTADA do lote do loteamento que contém o alvo', () => {
    const { m, nivel } = base();
    const pontos = RETANGULO.map(([x, y]) => ({ x, y }));
    // testadaIndex 2: o lado de cima, (10000,20000)→(0,20000).
    const comTestada = applyCommand(m, { type: 'AddLote', levelId: nivel, numero: '1', pontos, testadaIndex: 2 }).model;
    expect(pontoNaFrente(comTestada, { x: 5000, y: 10000 })).toMatchObject({ origem: 'TESTADA', ponto: { x: 5000, y: 20000 - R } });
    // Alvo fora do lote: o lote não serve.
    expect(frenteDoLote(comTestada, { x: 50000, y: 50000 })).toBeNull();
  });

  it('lote sem testada: o lado dele que dá para a via', () => {
    const { m, nivel } = base();
    const pontos = RETANGULO.map(([x, y]) => ({ x, y }));
    const r = applyBatch(m, [
      { type: 'AddLote', levelId: nivel, numero: '1', pontos, testadaIndex: null },
      { type: 'AddVia', levelId: nivel, nome: 'Rua 1', eixo: [{ x: -10000, y: -6000 }, { x: 30000, y: -6000 }], larguraMm: 12000 },
    ]).model;
    expect(pontoNaFrente(r, { x: 5000, y: 10000 })).toMatchObject({ origem: 'TESTADA', ponto: { x: 5000, y: R } });
  });

  it('nada no desenho que diga onde é a rua: null', () => {
    expect(frenteDoLote(base().m)).toBeNull();
    expect(frenteDoLote(comDivisas(RETANGULO))).toBeNull();
    expect(pontoNaFrente(comDivisas(RETANGULO), { x: 5000, y: 10000 })).toBeNull();
  });
});

describe('cotaDoTerrenoEm', () => {
  it('sem topografia: 0 (o térreo)', () => {
    expect(cotaDoTerrenoEm({ x: 0, y: 0 })).toBe(0);
  });
  it('com topografia: a cota relativa ao zero do desenho, em mm', () => {
    expect(cotaDoTerrenoEm({ x: 0, y: 0 }, { cotaEmM: () => 101.2, cotaZeroM: 100 })).toBe(1200);
    expect(cotaDoTerrenoEm({ x: 0, y: 0 }, { cotaEmM: () => 99.35, cotaZeroM: 100 })).toBe(-650);
  });
  it('fora da grade: 0', () => {
    expect(cotaDoTerrenoEm({ x: 0, y: 0 }, { cotaEmM: () => null, cotaZeroM: 100 })).toBe(0);
  });
});
