/**
 * VERIFICAÇÃO DA REDE NO DESENHO (28/09/2026, Etapa 0.1 do roadmap
 * hidrossanitário): pontas abertas, DN do esgoto fora do necessário e louça
 * sem ponto. O teste que mais importa é o do FALSO POSITIVO: rede traçada pelo
 * próprio lançamento automático não pode acender marca nenhuma.
 */
import { planejarVentilacao } from '../utils/blueprintVentilacao';
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../utils/blueprintKernel';
import { planejarEsgoto, verificarDnDoEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { planejarAgua } from '../utils/blueprintAguaAutomatica';
import { marcasDeVerificacao, resumoDaVerificacao } from '../utils/blueprintVerificacaoRede';

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const w = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
const esg = (levelId: string, tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command => ({
  type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo,
});

/** Banheiro + cozinha + CI, e a rede do esgoto automático aplicada. */
function casaComEsgoto(): { m: BlueprintModel; t: string } {
  const { m, t } = nivel();
  const casa = applyBatch(m, [
    w(t, 0, 0, 5000, 0), w(t, 5000, 0, 5000, 3000), w(t, 5000, 3000, 0, 3000), w(t, 0, 3000, 0, 0), w(t, 2000, 0, 2000, 3000),
    esg(t, 'LAVATORIO', 600, 2500, 500),
    esg(t, 'CHUVEIRO', 1500, 2500, 0),
    esg(t, 'CAIXA_SIFONADA', 1200, 2100, 0),
    esg(t, 'VASO_SANITARIO', 600, 800, 0),
    esg(t, 'PIA_COZINHA', 3500, 2600, 500),
    esg(t, 'CAIXA_GORDURA', 5500, -800, -400),
    esg(t, 'CAIXA_INSPECAO', 6000, -1500, -700),
  ]).model;
  return { m: applyBatch(casa, planejarEsgoto(casa).comandos).model, t };
}

describe('sem falso positivo: a rede do lançamento automático não acende nada', () => {
  it('casa térrea com esgoto automático — e, desde a E5.4, a ventilação lançada', () => {
    const { m } = casaComEsgoto();
    // Sem ventilação a casa térrea TEM pendência (a norma pede): o vaso e a sifonada.
    expect(marcasDeVerificacao(m).map((x) => x.tipo)).toEqual(['SEM_VENTILACAO', 'SEM_VENTILACAO']);
    const ventilado = applyBatch(m, planejarVentilacao(m).comandos).model;
    expect(marcasDeVerificacao(ventilado)).toEqual([]);
  });

  it('sobrado: o topo da VENTILAÇÃO é aberto de propósito e não conta; o TQ não é "maior que o necessário"', () => {
    let { m } = nivel();
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [terreo, superior] = m.levels.map((l) => l.id);
    m = applyBatch(m, [
      w(superior, 0, 0, 2000, 0), w(superior, 2000, 0, 2000, 3000), w(superior, 2000, 3000, 0, 3000), w(superior, 0, 3000, 0, 0),
      esg(superior, 'LAVATORIO', 600, 2500, 500),
      esg(superior, 'CAIXA_SIFONADA', 1200, 2100, 0),
      esg(superior, 'VASO_SANITARIO', 600, 800, 0),
      esg(terreo, 'CAIXA_INSPECAO', 5000, -1500, -700),
    ]).model;
    const esgoto = applyBatch(m, planejarEsgoto(m).comandos).model;
    // E5.4: a ventilação do TQ passa da cobertura e a sifonada ganha a sua coluna.
    const aplicado = applyBatch(esgoto, planejarVentilacao(esgoto).comandos).model;
    expect(marcasDeVerificacao(aplicado)).toEqual([]);
  });

  it('água fria automática pelas paredes', () => {
    const { m, t } = nivel();
    const sala = applyBatch(m, [
      w(t, 0, 0, 4000, 0), w(t, 4000, 0, 4000, 3000), w(t, 4000, 3000, 0, 3000), w(t, 0, 3000, 0, 0),
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LV', at: point(3925, 1000), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'CH', at: point(3925, 2500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
    ]).model;
    const aplicado = applyBatch(sala, planejarAgua(sala, sala.terminais![0]).comandos).model;
    expect(marcasDeVerificacao(aplicado)).toEqual([]);
  });
});

describe('o que ela aponta', () => {
  it('PONTA ABERTA: um tubo solto tem duas; o resumo da gaveta conta só as da disciplina pedida', () => {
    const { m, t } = nivel();
    const solto = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(0, 0), b: point(2000, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 }).model;
    const marcas = marcasDeVerificacao(solto);
    expect(marcas.map((x) => x.tipo)).toEqual(['PONTA_ABERTA', 'PONTA_ABERTA']);
    expect(marcas.every((x) => x.severidade === 'ERRO' && x.alvoId === solto.trechos![0].id)).toBe(true);
    expect(resumoDaVerificacao(marcas, ['AGUA_FRIA', 'AGUA_QUENTE']).pontasAbertas).toBe(2);
    expect(resumoDaVerificacao(marcas, ['ESGOTO']).pontasAbertas).toBe(0);
  });

  it('DN do esgoto: o ramal do vaso trocado para DN 50 → MENOR (erro); o do lavatório para DN 100 → MAIOR (aviso)', () => {
    const { m } = casaComEsgoto();
    const horizontalDe = (x: number, y: number) =>
      m.trechos!.find((c) => c.disciplina === 'ESGOTO' && c.a.x === x && c.a.y === y && (c.a.x !== c.b.x || c.a.y !== c.b.y))!;
    const doVaso = horizontalDe(600, 800);
    const doLav = horizontalDe(600, 2500);
    const mexido = applyBatch(m, [
      { type: 'SetTrechoProps', trechoId: doVaso.id, bitolaMm: 50 },
      { type: 'SetTrechoProps', trechoId: doLav.id, bitolaMm: 100 },
    ]).model;
    const v = verificarDnDoEsgoto(mexido);
    expect(v.find((x) => x.trechoId === doVaso.id)).toMatchObject({ tipo: 'MENOR', dnAtualMm: 50, dnNecessarioMm: 100, uhc: 6 });
    expect(v.find((x) => x.trechoId === doLav.id)).toMatchObject({ tipo: 'MAIOR', dnAtualMm: 100, dnNecessarioMm: 40, uhc: 1 });
    const marcas = marcasDeVerificacao(mexido);
    expect(marcas.find((x) => x.alvoId === doVaso.id && x.tipo === 'DN_MENOR')).toMatchObject({ severidade: 'ERRO', texto: 'DN 50 < 100 (6 UHC)' });
    // E5.2: e o DN diminui depois da descida do vaso (DN 100).
    expect(marcas.find((x) => x.alvoId === doVaso.id && x.tipo === 'DN_DIMINUI')).toMatchObject({ severidade: 'ERRO', texto: 'DN 50 depois de 100' });
    expect(marcas.find((x) => x.alvoId === doLav.id)).toMatchObject({ tipo: 'DN_MAIOR', severidade: 'AVISO' });
    expect(resumoDaVerificacao(marcas, ['ESGOTO']).dnFora).toHaveLength(2);
  });

  it('LOUÇA SEM PONTO: o vaso desenhado sem os pontos dele', () => {
    const { m, t } = nivel();
    const comVaso = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(1000, 1000) }).model;
    expect(marcasDeVerificacao(comVaso)).toEqual([
      expect.objectContaining({ tipo: 'LOUCA_SEM_PONTO', severidade: 'AVISO', texto: 'sem ponto (água fria, esgoto)', alvoId: comVaso.componentes![0].id }),
    ]);
  });

  it('o filtro de pavimento usa o pavimento do TRECHO', () => {
    const { m, t } = nivel();
    const dois = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const s = dois.levels[1].id;
    const mm = applyCommand(dois, { type: 'AddTrecho', levelId: s, disciplina: 'ESGOTO', a: point(0, 0), b: point(2000, 0), cotaAMm: -150, cotaBMm: -170, bitolaMm: 50 }).model;
    // As duas pontas abertas e, desde a E5.2, "não chega à caixa de inspeção".
    expect(marcasDeVerificacao(mm, s).map((x) => x.tipo).sort()).toEqual(['PONTA_ABERTA', 'PONTA_ABERTA', 'SEM_DESTINO']);
    expect(marcasDeVerificacao(mm, t)).toHaveLength(0);
  });
});
