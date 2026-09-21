/**
 * PLANTA DE FORRO (20/09/2026, backlog P2 — P2.14): a vista `forro` — rótulo
 * do ambiente com material, rebaixo e pé-direito útil; esconde o que está no
 * chão e mantém o que está no teto; resumo da faixa.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { forrosDoNivel, idsOcultosNaPlantaDeForro, resumoDaPlantaDeForro } from '../utils/blueprintPlantaDeForro';
import { AJUSTE_DA_VISTA, idsOcultosNaVista, nivelDaVista, VISTAS_DE_PLANTA } from '../utils/blueprintVistasDePlanta';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 5000), w(8000, 5000, 0, 5000), w(0, 5000, 0, 0), w(4000, 0, 4000, 5000)]).model;
  const [s1, s2] = m.spaces;
  m = applyCommand(m, {
    type: 'NameSpace',
    spaceId: s1.id,
    name: 'Sala',
    acabamentos: { forro: { rebaixoMm: 300, camadas: [{ espessuraMm: 12, itemCode: '96109', descricao: 'Forro de gesso acartonado', funcao: 'ACABAMENTO' }] } },
  }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: s2.id, name: 'Cozinha' }).model;
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz teto', at: point(2000, 2500), cotaMm: 2900, tipoEletrico: 'ILUMINACAO_TETO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada', at: point(300, 2500), cotaMm: 300, tipoEletrico: 'TUG' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Interruptor', at: point(3800, 300), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR' },
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(6000, 2500), cotaMm: 2600 },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Pia', at: point(7500, 1000), cotaMm: 1100 },
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(2000, 2500), b: point(3800, 300), cotaAMm: 2900, cotaBMm: 2900, bitolaMm: 25 } as Command,
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(300, 2500), b: point(300, 4000), cotaAMm: 300, cotaBMm: 300, bitolaMm: 25 } as Command,
    { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(2000, 1500) },
  ]).model;
  return { m, t };
}

describe('planta de forro (P2.14)', () => {
  it('rótulo por ambiente: material, rebaixo e pé-direito útil; sem forro declarado = laje aparente', () => {
    const { m } = casa();
    const nivel = m.levels[0];
    const forros = forrosDoNivel(m, nivel);
    expect(forros).toHaveLength(2);
    const sala = forros.find((f) => f.nome === 'Sala')!;
    expect(sala.material).toBe('Forro de gesso acartonado');
    expect(sala.rebaixoMm).toBe(300);
    expect(sala.peDireitoUtilMm).toBe(2700);
    expect(sala.linhas).toEqual(['Sala', 'Forro: Forro de gesso acartonado', 'rebaixo 0,30 m · PD 2,70 m']);
    const coz = forros.find((f) => f.nome === 'Cozinha')!;
    expect(coz.material).toBeNull();
    expect(coz.linhas).toEqual(['Cozinha', 'Laje aparente (sem forro declarado)', 'PD 3,00 m']);
    expect(resumoDaPlantaDeForro(m, nivel)).toEqual({ ambientes: 2, comForro: 1, luminarias: 1, difusores: 1 });
  });

  it('esconde o que está no chão (tomada, eletroduto baixo, hidráulica, sofá) e mantém o teto (luz, interruptor, eletroduto alto, difusor) e as paredes', () => {
    const { m } = casa();
    const nivel = m.levels[0];
    const ocultos = idsOcultosNaPlantaDeForro(m, nivel);
    const porTipo = (tipo: string) => m.terminais.find((x) => x.tipo === tipo)!.id;
    expect(ocultos.has(porTipo('Tomada'))).toBe(true);
    expect(ocultos.has(porTipo('Pia'))).toBe(true);
    expect(ocultos.has(porTipo('Luz teto'))).toBe(false);
    expect(ocultos.has(porTipo('Interruptor'))).toBe(false);
    expect(ocultos.has(porTipo('Difusor'))).toBe(false);
    const [alto, baixo] = m.trechos;
    expect(ocultos.has(alto.id)).toBe(false);
    expect(ocultos.has(baixo.id)).toBe(true);
    expect(ocultos.has(m.componentes![0].id)).toBe(true);
    for (const w of m.walls) expect(ocultos.has(w.id)).toBe(false);
    // Pela vista: `forro` está na lista, é do pavimento ATUAL (o editor resolve) e delega a regra.
    expect(VISTAS_DE_PLANTA).toContain('forro');
    expect(AJUSTE_DA_VISTA.forro.nivel).toBe('ATUAL');
    expect(nivelDaVista(m, 'forro')).toBeNull();
    expect(idsOcultosNaVista(m, 'forro', nivel)).toEqual(ocultos);
    // As outras vistas continuam escondendo TODOS os terminais e as paredes internas.
    expect(idsOcultosNaVista(m, 'situacao', nivel).has(porTipo('Luz teto'))).toBe(true);
  });
});
