/**
 * Definições de parâmetro (20/09/2026, backlog P2 — P2.5): o filtro
 * `compartilhado` nas saídas (planilha e IFC) e a contagem de usos por chave.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { chavesPrivadas, semChavesPrivadas } from '../utils/blueprintFormulas';
import { linhasDeParametros } from '../utils/blueprintPlanilha';
import { gerarIfc } from '../utils/blueprintIfc';
import { usosPorChave } from '../components/blueprint/TelaParametros';

function casa() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  let m = applyBatch(m0, [
    { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command,
  ]).model;
  m = applyBatch(m, [
    { type: 'SetParametros', familia: 'wall', id: m.walls[0].id, valores: { fabricante: 'Acme', custo_interno: 120 } },
    { type: 'SetParametros', familia: 'structural', id: m.structures[0].id, valores: { custo_interno: 80 } },
  ]).model;
  return m;
}

describe('parâmetros privados nas saídas (P2.5)', () => {
  const definicoes = [
    { id: 'd1', chave: 'fabricante', compartilhado: true },
    { id: 'd2', chave: 'custo_interno', compartilhado: false },
    { id: 'd3', chave: 'observacao', compartilhado: false },
  ];

  it('chavesPrivadas e semChavesPrivadas: só o não compartilhado sai; sem definição continua saindo', () => {
    const p = chavesPrivadas(definicoes);
    expect([...p].sort()).toEqual(['custo_interno', 'observacao']);
    expect(semChavesPrivadas({ fabricante: 'Acme', custo_interno: 120, sem_definicao: 'x' }, p)).toEqual({ fabricante: 'Acme', sem_definicao: 'x' });
    expect(semChavesPrivadas({ custo_interno: 120 }, p)).toBeUndefined();
    expect(semChavesPrivadas({ a: 1 }, new Set())).toEqual({ a: 1 });
  });

  it('planilha: a chave privada some das linhas de parâmetro; a pública fica', () => {
    const m = casa();
    const todas = linhasDeParametros(m);
    expect(todas.map((l) => l.chave).sort()).toEqual(['custo_interno', 'custo_interno', 'fabricante']);
    const filtradas = linhasDeParametros(m, undefined, chavesPrivadas(definicoes));
    expect(filtradas.map((l) => l.chave)).toEqual(['fabricante']);
  });

  it('IFC: o Pset_OpuraPersonalizado sai sem a chave privada, e a peça só com privadas não ganha Pset', () => {
    const m = casa();
    const o = { titulo: 'Casa', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-09-20T12:00:00Z') };
    const cheio = gerarIfc(m, o);
    expect(cheio).toMatch(/'custo_interno'/);
    expect(cheio).toMatch(/'fabricante'/);
    const filtrado = gerarIfc(m, { ...o, chavesPrivadas: chavesPrivadas(definicoes) });
    expect(filtrado).not.toMatch(/'custo_interno'/);
    expect(filtrado).toMatch(/'fabricante'/);
    const psets = (txt: string) => (txt.match(/IFCPROPERTYSET\([^\n]*'Pset_OpuraPersonalizado'/g) ?? []).length;
    expect(psets(cheio)).toBe(2);
    expect(psets(filtrado)).toBe(1); // só a parede; o pilar só tinha a privada
  });

  it('usosPorChave conta as peças que carregam cada chave', () => {
    const u = usosPorChave(casa());
    expect(u.get('custo_interno')).toBe(2);
    expect(u.get('fabricante')).toBe(1);
    expect(u.get('nada')).toBeUndefined();
  });
});
