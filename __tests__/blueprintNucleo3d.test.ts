/**
 * Núcleo vertical no 3D (20/09/2026, backlog P2 — P2.6): o shaft é um prisma
 * do piso de partida ao teto do último pavimento; o elevador ganha caixa, poço,
 * casa de máquinas e cabine, nas cotas da ficha.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../utils/blueprintKernel';
import { ALTURA_DA_CABINE_MM, prismasDoNucleo } from '../utils/blueprintNucleo3d';

function sobrado() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 },
  ]).model;
  const t = m.levels[0].id;
  const ring = [point(0, 0), point(1800, 0), point(1800, 2000), point(0, 2000)];
  m = applyBatch(m, [
    { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring, pocoMm: 1400, casaDeMaquinasMm: 2200, capacidade: 8 },
    { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring: [point(5000, 0), point(5600, 0), point(5600, 600), point(5000, 600)], disciplina: 'MECANICA' },
    { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring: [point(7000, 0), point(7600, 0), point(7600, 600), point(7000, 600)] },
  ]).model;
  return m;
}

describe('núcleo no 3D (P2.6)', () => {
  it('elevador: caixa do piso de partida ao teto do último pavimento, poço abaixo, casa de máquinas acima, cabine recuada de 2,20 m', () => {
    const m = sobrado();
    const e = m.nucleos!.find((n) => n.tipo === 'ELEVADOR')!;
    const p = prismasDoNucleo(m, e);
    expect(p.map((x) => x.parte)).toEqual(['caixa', 'poco', 'casa-de-maquinas', 'cabine']);
    const caixa = p[0];
    expect(caixa).toMatchObject({ baseMm: 0, alturaMm: 5800, opacidade: 0.18 }); // 3000 + 2800
    expect(p[1]).toMatchObject({ parte: 'poco', baseMm: -1400, alturaMm: 1400 });
    expect(p[2]).toMatchObject({ parte: 'casa-de-maquinas', baseMm: 5800, alturaMm: 2200 });
    const cabine = p[3];
    expect(cabine).toMatchObject({ baseMm: 0, alturaMm: ALTURA_DA_CABINE_MM, opacidade: 1 });
    expect(cabine.anel).toEqual([point(100, 100), point(1700, 100), point(1700, 1900), point(100, 1900)]);
    // Elevador sem ficha: só caixa e cabine.
    const semFicha = applyCommand(m, { type: 'SetNucleoProps', nucleoId: e.id, pocoMm: null, casaDeMaquinasMm: null }).model;
    expect(prismasDoNucleo(semFicha, semFicha.nucleos!.find((n) => n.id === e.id)!).map((x) => x.parte)).toEqual(['caixa', 'cabine']);
  });

  it('shaft: um prisma translúcido na cor da disciplina; geral em cinza; até o pavimento de chegada quando declarado', () => {
    const m = sobrado();
    const [mec, geral] = m.nucleos!.filter((n) => n.tipo === 'SHAFT');
    expect(prismasDoNucleo(m, mec)).toEqual([expect.objectContaining({ parte: 'shaft', baseMm: 0, alturaMm: 5800, cor: '#0d9488' })]);
    expect(prismasDoNucleo(m, geral)[0].cor).toBe('#94a3b8');
    const soTerreo = applyCommand(m, { type: 'SetNucleoProps', nucleoId: geral.id, ateLevelId: m.levels[0].id }).model;
    expect(prismasDoNucleo(soTerreo, soTerreo.nucleos!.find((n) => n.id === geral.id)!)[0].alturaMm).toBe(2800);
  });
});
