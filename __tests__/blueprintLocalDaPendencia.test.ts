/**
 * Etapa C da fase "itens 6 a 11" da casa automática (11/11/2026, plano docs/planos/2026-11-11-casa-automatica-itens-6-a-11.md):
 * ONDE uma pendência acontece — o centro do elemento, o ponto do conflito e a disciplina em que a prévia abre.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Conflito } from '../utils/blueprintKernel';
import { caixaDosElementos, centroDoElemento, disciplinaDoLocal, localDoConflito, localDoElemento } from '../utils/blueprintLocalDaPendencia';

/** Uma sala 6 × 4 com porta, um pilar, um ponto elétrico e dois trechos que se cruzam em (3000, 2000). */
function modelo(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 } as Command,
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(5000, 1000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(500, 300), cotaMm: 300 } as Command,
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(1000, 2000), b: point(5000, 2000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 } as Command,
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(3000, 500), b: point(3000, 3500), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 } as Command,
  ]).model;
  return m;
}

describe('centroDoElemento', () => {
  it('parede no meio; abertura no meio do vão; ponto no lugar; trecho no meio; pilar no ponto; ambiente pela média do anel', () => {
    const m = modelo();
    const t = m.levels[0].id;
    expect(centroDoElemento(m, m.walls[0].id)).toEqual({ levelId: t, ponto: { x: 3000, y: 0 } });
    expect(centroDoElemento(m, m.openings[0].id)).toEqual({ levelId: t, ponto: { x: 1400, y: 0 } });
    expect(centroDoElemento(m, m.terminais![0].id)).toEqual({ levelId: t, ponto: { x: 500, y: 300 } });
    expect(centroDoElemento(m, m.trechos![0].id)).toEqual({ levelId: t, ponto: { x: 3000, y: 2000 } });
    expect(centroDoElemento(m, m.structures![0].id)).toEqual({ levelId: t, ponto: { x: 5000, y: 1000 } });
    expect(centroDoElemento(m, 'nao_existe')).toBeNull();
  });
});

describe('localDoConflito / localDoElemento', () => {
  it('rede × rede: o ponto é o cruzamento; os ids são os dois trechos; o pavimento é o do trecho', () => {
    const m = modelo();
    const [agua, ele] = m.trechos!;
    const c = { trechoId: agua.id, outroId: ele.id, classe: 'REDE' } as Conflito;
    expect(localDoConflito(m, c)).toEqual({ levelId: m.levels[0].id, ids: [agua.id, ele.id], ponto: { x: 3000, y: 2000 } });
  });

  it('trecho × pilar: o ponto do trecho mais perto do pilar', () => {
    const m = modelo();
    const c = { trechoId: m.trechos![0].id, outroId: m.structures![0].id, classe: 'ESTRUTURA' } as Conflito;
    expect(localDoConflito(m, c)?.ponto).toEqual({ x: 5000, y: 2000 });
  });

  it('localDoElemento: os ids que existem, o pavimento e o centro do primeiro; nenhum existe → null', () => {
    const m = modelo();
    expect(localDoElemento(m, [m.terminais![0].id])).toEqual({ levelId: m.levels[0].id, ids: [m.terminais![0].id], ponto: { x: 500, y: 300 } });
    expect(localDoElemento(m, ['x', 'y'])).toBeNull();
  });
});

describe('disciplinaDoLocal', () => {
  it('trecho de água → AGUA; eletroduto ou ponto elétrico → ELETRICA; parede → ARQUITETURA', () => {
    const m = modelo();
    const t = m.levels[0].id;
    expect(disciplinaDoLocal(m, { levelId: t, ids: [m.trechos![0].id], ponto: null })).toBe('AGUA');
    expect(disciplinaDoLocal(m, { levelId: t, ids: [m.trechos![1].id], ponto: null })).toBe('ELETRICA');
    expect(disciplinaDoLocal(m, { levelId: t, ids: [m.terminais![0].id], ponto: null })).toBe('ELETRICA');
    expect(disciplinaDoLocal(m, { levelId: t, ids: [m.walls[0].id], ponto: null })).toBe('ARQUITETURA');
  });
});

describe('caixaDosElementos (12/11/2026: o "Ver no editor" enquadra os elementos da pendência)', () => {
  it('a caixa dos elementos e do ponto, com a folga; ids que não existem ficam de fora; nada → null', () => {
    const m = modelo();
    const [agua, ele] = m.trechos!;
    // Os dois trechos: x de 1000 a 5000 (água) e y de 500 a 3500 (eletroduto); folga de 1,5 m.
    expect(caixaDosElementos(m, [agua.id, ele.id, 'nao_existe'], null)).toEqual({ minX: -500, minY: -1000, maxX: 6500, maxY: 5000 });
    // Um ponto elétrico só, com o ponto da pendência ao lado.
    expect(caixaDosElementos(m, [m.terminais![0].id], { x: 900, y: 300 }, 1000)).toEqual({ minX: -500, minY: -700, maxX: 1900, maxY: 1300 });
    expect(caixaDosElementos(m, ['x'], null)).toBeNull();
  });
});
