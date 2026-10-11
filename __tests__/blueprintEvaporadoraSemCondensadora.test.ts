/**
 * 11/10/2026 (teste do usuário no app real): a evaporadora CONFIRMADA (inserida à
 * mão) sem condensadora fazia o ambiente contar como "já atendido", e o gerador
 * parava ali — sem condensadora não há linha nem dreno. Agora ela ganha a
 * condensadora no lugar que o split novo teria (fora da parede externa, de
 * preferência a dela), as duas ficam ligadas no mesmo lote, e a linha e o dreno
 * seguem. Sem lugar, o relatório diz.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { pointInPolygon } from '../utils/blueprintKernel/geom';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { gerarClimatizacao } from '../utils/blueprintGeradorClimatizacao';
import { linhaExistente, sistemasDoNivel } from '../utils/blueprintLinhaFrigorigena';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hip = HIPOTESES_DE_SELECAO_PADRAO;
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const terminais = (m: BlueprintModel) => m.terminais ?? [];

/** Sala 4 × 4 e Cozinha; a evaporadora confirmada na parede norte da Sala, sem condensadora. */
function casa(fechada = false) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Evaporadora hi-wall', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3815), cotaMm: 2200, capacidadeBtuH: 12000, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
  ]).model;
  if (fechada) {
    // Um anel de ambientes em volta: nenhuma parede da Sala é externa, e nenhum ambiente técnico.
    m = applyBatch(m, [w(-3000, -3000, 11000, -3000), w(11000, -3000, 11000, 7000), w(11000, 7000, -3000, 7000), w(-3000, 7000, -3000, -3000)]).model;
    const anel = m.spaces.find((s) => s.ring.some((p) => p.x < -1000))!;
    m = applyCommand(m, { type: 'NameSpace', spaceId: anel.id, name: 'Circulação' }).model;
  }
  return { m, t, sala: m.spaces.find((s) => s.ring.every((p) => p.x <= 4100 && p.x >= -100))! };
}
const planejar = (m: BlueprintModel, t: string) => {
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  return planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, hip, catalogo), carga, hip);
};

describe('a evaporadora existente sem condensadora ganha a dela', () => {
  it('a condensadora nasce do lado de fora da parede da evaporadora, sugerida, e as duas saem ligadas — a evaporadora não é duplicada', () => {
    const { m, t, sala } = casa();
    const plano = planejar(m, t);
    expect(plano.aCriar).toEqual([]);
    expect(plano.jaAtendidos).toEqual([]);
    expect(plano.condensadorasParaExistentes).toEqual([expect.objectContaining({ nome: 'Sala', lugarDaCondensadora: 'FACHADA' })]);
    expect(plano.resumo).toContain('Sala: a evaporadora existente ganha a condensadora na fachada, ligada a ela');
    const depois = applyBatch(m, plano.comandos).model;
    const evaps = terminais(depois).filter((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL');
    const cond = terminais(depois).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(evaps).toHaveLength(1);
    expect(evaps[0].condensadoraId).toBe(cond.id);
    expect(cond).toMatchObject({ sugerida: true, capacidadeBtuH: 12000 });
    // Do lado de fora, atrás da parede norte (a da evaporadora).
    expect(pointInPolygon(sala.ring, cond.at)).toBe(false);
    expect(cond.at.y).toBeGreaterThan(4000);
    // E o ponto de força dela, que a inserção à mão não trouxe — sugerido, um só.
    expect(terminais(depois).filter((x) => x.tipoEletrico === 'AR_CONDICIONADO')).toEqual([expect.objectContaining({ sugerida: true })]);
    // Agora a linha e o dreno têm o sistema.
    expect(sistemasDoNivel(depois, t)).toHaveLength(1);
  });

  it('relançar refaz o mesmo (a condensadora sugerida sai e volta); com o sistema confirmado, o ambiente está atendido', () => {
    const { m, t } = casa();
    const p1 = planejar(m, t);
    const m1 = applyBatch(m, p1.comandos).model;
    const m2 = applyBatch(m1, planejar(m1, t).comandos).model;
    const ass = (x: BlueprintModel) => terminais(x).map((y) => [y.tipoHidraulico, y.at.x, y.at.y, y.condensadoraId ? 'ligada' : '']).sort();
    expect(ass(m2)).toEqual(ass(m1));
    const cond = terminais(m2).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const aceito = applyCommand(m2, { type: 'SetTerminalProps', terminalId: cond.id, sugerida: false }).model;
    const p3 = planejar(aceito, t);
    expect(p3.jaAtendidos).toEqual(['Sala']);
    expect(p3.condensadorasParaExistentes).toEqual([]);
  });

  it('sem fachada externa nem ambiente técnico, o relatório diz — nada é lançado às cegas', () => {
    const { m, t } = casa(true);
    const plano = planejar(m, t);
    expect(plano.condensadorasParaExistentes).toEqual([]);
    expect(plano.semLugar).toEqual([expect.objectContaining({ nome: 'Sala', motivo: expect.stringMatching(/não tem condensadora, e não há fachada externa nem ambiente técnico/) })]);
  });

  it('o gerador inteiro: a condensadora entra, e a linha e o dreno seguem (o caso do usuário)', () => {
    const { m, t } = casa();
    const plano = gerarClimatizacao(m, hipClima, { modelos: catalogo });
    const etapa = (id: string) => plano.etapas.find((e) => e.id === id)!;
    expect(etapa('EQUIPAMENTOS').situacao).toBe('LANCOU');
    expect(etapa('LINHA').situacao).toBe('LANCOU');
    const depois = applyBatch(m, plano.comandos).model;
    const s = sistemasDoNivel(depois, t)[0];
    expect(linhaExistente(depois, s)).not.toBeNull();
  });
});
