/**
 * 11/10/2026 — as três pendências do teste do usuário no app real ("resolva as 3 pendencias"):
 *  1. mover a evaporadora: o ELETRODUTO do ponto de força é refeito (o ramal sai, a rede do
 *     quadro é relançada e liga o ponto na posição nova) — antes só a ponta presa acompanhava;
 *  2. APAGAR a evaporadora leva o ponto de força dela (antes ficava solto, com 1.400 VA);
 *  3. BRASÍLIA nas tabelas de clima e de chuva (o estudo do usuário é em Brasília).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { CLIMA_POR_CIDADE, HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, capitalMaisProxima, cidadeDaTabela, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { INTENSIDADE_POR_CIDADE } from '../utils/blueprintPluvial';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { planejarLinhasFrigorigenas } from '../utils/blueprintLinhaFrigorigena';
import { HIPOTESES_ELETRODUTO_PADRAO, planejarEletrodutos } from '../utils/blueprintEletrodutos';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { comandosAoMoverClimatizacao, ramalDoPonto } from '../utils/blueprintMoverClimatizacao';
import { pontoEletricoDaEvaporadora, pontosQueSaemComAsEvaporadoras } from '../utils/blueprintPontosHidraulicos';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 31.3, tbuExternaC: 19.6, altitudeM: 1160 } };
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const evapDe = (m: BlueprintModel) => terminais(m).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
const pontoDe = (m: BlueprintModel) => terminais(m).find((x) => x.tipoEletrico === 'AR_CONDICIONADO')!;
const eletrodutos = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA');

/** A sala do usuário com a porta ao sul; o split lançado e aceito; um quadro e o circuito do ar ligados por eletroduto. */
function salaComSplitEEletroduto() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(3475, 1475, 3475, 5725), w(3475, 5725, 11925, 5725), w(11925, 1475, 3475, 1475), w(11925, 5725, 11925, 1475)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Ambiente 1', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  const sul = m.walls.find((x) => x.a.y === 1475 && x.b.y === 1475)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 411, widthMm: 900, heightMm: 2100, sillMm: 0 } as never).model;
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  m = applyBatch(m, planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO).comandos).model;
  m = applyBatch(m, planejarLinhasFrigorigenas(m, t, HIPOTESES_DA_LINHA_PADRAO).comandos).model;
  m = applyBatch(m, [
    ...terminais(m).filter((x) => x.sugerida).map((x) => ({ type: 'SetTerminalProps', terminalId: x.id, sugerida: false }) as Command),
    ...(m.trechos ?? []).filter((x) => x.sugerido).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command),
  ]).model;
  // O quadro na parede oeste e o circuito do ar; o eletroduto pelo planejador da elétrica, aceito.
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(3550, 3600), cotaMm: 1600 }).model;
  const quadro = m.quadros![0];
  m = applyCommand(m, { type: 'AddCircuito', quadroId: quadro.id, nome: 'C1', ligacao: 'FF' }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: pontoDe(m).id, circuitoId: m.circuitos![0].id }).model;
  m = applyBatch(m, planejarEletrodutos(m, m.quadros![0], HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).comandos).model;
  m = applyBatch(m, eletrodutos(m).filter((x) => x.sugerido).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command)).model;
  return { m, t };
}

describe('pendência 1: o eletroduto do ponto de força acompanha', () => {
  it('⚠️ PRONTO QUANDO: levada a evaporadora para a parede sul, o ramal antigo sai e o ponto, na posição nova, chega ao quadro por eletroduto', () => {
    const { m } = salaComSplitEEletroduto();
    const ponto = pontoDe(m);
    expect(eletrodutos(m).length).toBeGreaterThan(0);
    const ramalAntes = ramalDoPonto(m, ponto);
    expect(ramalAntes.length).toBeGreaterThan(0);
    const evap = evapDe(m);
    const gesto = { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [evap.id], delta: { x: 8900 - evap.at.x, y: 1475 - evap.at.y }, manterJuncoes: false } as Command;
    const depois = applyBatch(m, [gesto]).model;
    const junto = comandosAoMoverClimatizacao(m, depois, { terminalIds: [evap.id], trechoIds: [] }, HIPOTESES_DA_LINHA_PADRAO, { eletroduto: HIPOTESES_ELETRODUTO_PADRAO, eletricas: HIPOTESES_PADRAO });
    const final = applyBatch(m, [gesto, ...junto]).model;
    const p = pontoDe(final);
    // O ponto foi para a parede sul, e o ramal antigo saiu.
    expect(p.at.y).toBe(1550);
    expect(eletrodutos(final).some((x) => ramalAntes.includes(x.id))).toBe(false);
    // Há eletroduto chegando ao ponto, e o plano do quadro não tem mais ponto a ligar.
    expect(eletrodutos(final).some((x) => (x.a.x === p.at.x && x.a.y === p.at.y) || (x.b.x === p.at.x && x.b.y === p.at.y))).toBe(true);
    expect(planejarEletrodutos(final, final.quadros![0], HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).aLigar).toBe(0);
    // O traçado é o do planejador da elétrica (pela laje, em reta, por padrão) — e vem SUGERIDO, para aceitar.
    expect(eletrodutos(final).filter((x) => !eletrodutos(m).some((y) => y.id === x.id)).every((x) => x.sugerido)).toBe(true);
  });

  it('sem as premissas da elétrica (quem chama não as tem), o eletroduto fica como antes — só a ponta presa', () => {
    const { m } = salaComSplitEEletroduto();
    const evap = evapDe(m);
    const antes = eletrodutos(m).map((x) => x.id).sort();
    const gesto = { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [evap.id], delta: { x: 0, y: -300 }, manterJuncoes: false } as Command;
    const depois = applyBatch(m, [gesto]).model;
    const junto = comandosAoMoverClimatizacao(m, depois, { terminalIds: [evap.id], trechoIds: [] }, HIPOTESES_DA_LINHA_PADRAO);
    expect(eletrodutos(applyBatch(m, [gesto, ...junto]).model).map((x) => x.id).sort()).toEqual(antes);
  });
});

describe('pendência 2: apagar a evaporadora leva o ponto de força dela', () => {
  it('o ponto dela sai junto; o que outra evaporadora que fica também usa, não; o já selecionado não se repete', () => {
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = a.levels[0].id;
    let m = applyBatch(a, [
      { type: 'AddWall', levelId: t, a: point(0, 4000), b: point(8000, 4000), thicknessMm: 150, heightMm: 2800 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3815), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220 } as Command,
    ]).model;
    const ev1 = evapDe(m);
    m = applyBatch(m, pontoEletricoDaEvaporadora(m, ev1, 3)).model;
    const p1 = pontoDe(m);
    expect(pontosQueSaemComAsEvaporadoras(m, [ev1.id])).toEqual([p1.id]);
    expect(pontosQueSaemComAsEvaporadoras(m, [ev1.id, p1.id])).toEqual([]);
    // Uma segunda evaporadora encostada no mesmo ponto: apagar a primeira não leva o ponto da outra.
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(p1.at.x + 400, 3815), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220 } as Command).model;
    expect(pontosQueSaemComAsEvaporadoras(m, [ev1.id])).toEqual([]);
    // Apagar outra coisa não leva ponto nenhum.
    expect(pontosQueSaemComAsEvaporadoras(m, [p1.id])).toEqual([]);
  });
});

describe('pendência 3: Brasília nas tabelas', () => {
  it('está no clima e na chuva (as mesmas cidades), casa sem acento e é a capital mais próxima do estudo do usuário', () => {
    expect(CLIMA_POR_CIDADE['Brasília']).toMatchObject({ tbsC: 31.3, tbuC: 19.6, altitudeM: 1160 });
    expect(INTENSIDADE_POR_CIDADE['Brasília']).toBeDefined();
    expect(cidadeDaTabela('brasilia')).toBe('Brasília');
    expect(capitalMaisProxima({ latitude: -15.79, longitude: -47.88 })).toMatchObject({ cidade: 'Brasília' });
  });
});
