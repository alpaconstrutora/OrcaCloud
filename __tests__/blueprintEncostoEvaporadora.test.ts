/**
 * 11/10/2026 (teste do usuário no app real, estudo "Planta 26/09/2026"): a evaporadora
 * inserida à mão ficou com o centro NA FACE interna da parede — metade do aparelho dentro
 * da alvenaria —, o ponto de força no mesmo lugar (escondido sob ela), sem capacidade, e
 * a condensadora que o gerador lançou também sem capacidade.
 *
 * A geometria é a do rascunho do usuário: sala 8,45 × 4,25 m (paredes de 150 mm com eixo
 * em y = 1475 e y = 5725), a evaporadora em (7610, 1550) — a face interna da parede sul.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { pointInPolygon } from '../utils/blueprintKernel/geom';
import { encostoNaParede, estaEncostada, giroParaSoprarParaDentro } from '../utils/blueprintEncostoNaParede';
import {
  comandosDaCapacidadeDaCondensadora,
  comandosParaEncostarEvaporadora,
  pontoEletricoDaEvaporadora,
  pontoEletricoDaEvaporadoraExistente,
} from '../utils/blueprintPontosHidraulicos';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { gerarClimatizacao } from '../utils/blueprintGeradorClimatizacao';
import { comandosDaLinhaPelaCapacidade } from '../utils/blueprintLinhaFrigorigena';

const terminais = (m: BlueprintModel) => m.terminais ?? [];
const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 31.3, tbuExternaC: 19.6, altitudeM: 1160 } };

/** A sala do usuário; com `comEvaporadora`, a evaporadora e o ponto de força como ele deixou (centro na face, sem giro). */
function salaDoUsuario(comEvaporadora = true) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(3475, 1475, 3475, 5725), w(3475, 5725, 11925, 5725), w(11925, 1475, 3475, 1475), w(11925, 5725, 11925, 1475)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Ambiente 1', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  if (comEvaporadora) {
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Evaporadora hi-wall', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(7610, 1550), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Ar-condicionado (ponto de força)', tipoEletrico: 'AR_CONDICIONADO', at: point(7610, 1550), cotaMm: 2200, potenciaW: 1400 } as Command,
    ]).model;
  }
  return { m, t, sala: m.spaces[0] };
}
const evapDe = (m: BlueprintModel) => terminais(m).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
const pontoDe = (m: BlueprintModel) => terminais(m).filter((x) => x.tipoEletrico === 'AR_CONDICIONADO');

describe('o encosto da evaporadora de parede', () => {
  it('o clique na face (o caso do usuário), dentro da parede ou a 40 cm dela encosta o fundo na face e gira para soprar para dentro; longe, nada', () => {
    const { m, t, sala } = salaDoUsuario(false);
    // A face interna da parede sul é y = 1475 + 75 = 1550; o centro encostado, 110 mm para dentro.
    const esperado = { x: 7610, y: 1660 };
    for (const clique of [point(7610, 1550), point(7610, 1500), point(7610, 1950)]) {
      const enc = encostoNaParede(m, t, clique, 220)!;
      expect(enc.at).toEqual(esperado);
      expect(enc.face).toEqual({ x: 7610, y: 1550 });
      expect(enc.rotacaoGraus).toBe(giroParaSoprarParaDentro({ x: 0, y: 1 }));
      expect(pointInPolygon(sala.ring, enc.at)).toBe(true);
    }
    // Sobre o EIXO da parede: o lado que dá para o ambiente.
    expect(encostoNaParede(m, t, point(7610, 1475), 220)!.at).toEqual(esperado);
    // No meio da sala (a mais de 60 cm de toda face): fica onde se clicou.
    expect(encostoNaParede(m, t, point(7610, 3600), 220)).toBeNull();
  });

  it('a evaporadora do usuário: "Encostar na parede" leva a peça para dentro, gira, e o ponto escondido sob ela vai para o lado — um lote; depois, nada a fazer', () => {
    const { m } = salaDoUsuario();
    const lote = comandosParaEncostarEvaporadora(m, evapDe(m));
    expect(lote.map((c) => c.type)).toEqual(['TranslateEntities', 'SetTerminalProps', 'TranslateEntities']);
    const depois = applyBatch(m, lote).model;
    const evap = evapDe(depois);
    expect(evap.at).toEqual({ x: 7610, y: 1660 });
    expect(evap.rotacaoGraus).toBe(giroParaSoprarParaDentro({ x: 0, y: 1 }));
    // O ponto: na face (y = 1550), meia largura + 150 mm ao lado — fora da largura do aparelho.
    const [ponto] = pontoDe(depois);
    expect(ponto.at.y).toBe(1550);
    expect(Math.abs(ponto.at.x - 7610)).toBe(600);
    // Segue reconhecido como o dela: não nasce outro, e o encosto não tem mais o que fazer.
    expect(pontoEletricoDaEvaporadoraExistente(depois, evap)?.id).toBe(ponto.id);
    expect(pontoEletricoDaEvaporadora(depois, evap, 3)).toEqual([]);
    expect(comandosParaEncostarEvaporadora(depois, evap)).toEqual([]);
    expect(estaEncostada(evap.at, evap.rotacaoGraus, encostoNaParede(depois, evap.levelId, evap.at, 220)!)).toBe(true);
  });

  it('o DRENO que nasce na evaporadora anda com ela (como a linha) — antes ficava no lugar antigo e o gerador lançava outro', () => {
    const { m, t } = salaDoUsuario();
    const m1 = applyBatch(m, [
      { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(7610, 1550), b: point(7610, 1475), cotaAMm: 2200, cotaBMm: 2199, bitolaMm: 25 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(7610, 1550), b: point(7610, 1475), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(7610, 1550), b: point(7000, 1550), cotaAMm: 600, cotaBMm: 600, bitolaMm: 25 } as Command,
    ]).model;
    const depois = applyBatch(m1, comandosParaEncostarEvaporadora(m1, evapDe(m1))).model;
    const ponta = (d: string) => (depois.trechos ?? []).find((x) => x.disciplina === d)!.a;
    expect(ponta('DRENO_AC')).toEqual({ x: 7610, y: 1660 });
    expect(ponta('FRIGORIGENA')).toEqual({ x: 7610, y: 1660 });
    // Outra disciplina no mesmo ponto não é "da" evaporadora: fica.
    expect(ponta('AGUA_FRIA')).toEqual({ x: 7610, y: 1550 });
  });

  it('o ponto que o projetista pôs ao lado (fora da largura) não é mexido; cassete e dutada (forro) não encostam', () => {
    const { m, t } = salaDoUsuario(false);
    const m1 = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Evaporadora hi-wall', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(7610, 1550), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'AC', tipoEletrico: 'AR_CONDICIONADO', at: point(8300, 1550), cotaMm: 2200, potenciaW: 1400 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Cassete', tipoHidraulico: 'EVAPORADORA_CASSETE', at: point(5000, 1550), cotaMm: 2600 } as Command,
    ]).model;
    const lote = comandosParaEncostarEvaporadora(m1, evapDe(m1));
    expect(lote.filter((c) => c.type === 'TranslateEntities')).toHaveLength(1);
    const cassete = terminais(m1).find((x) => x.tipoHidraulico === 'EVAPORADORA_CASSETE')!;
    expect(comandosParaEncostarEvaporadora(m1, cassete)).toEqual([]);
  });
});

describe('o lugar que o gerador escolhe não fica sobre louça nem móvel encostado', () => {
  /** A sala do usuário como está: porta na parede sul; lavatório e vaso encostados na norte; a cama a 35 cm da oeste. */
  function salaComLoucas(norteInteira = false) {
    const { m, t } = salaDoUsuario(false);
    const sul = m.walls.find((w) => w.a.y === 1475 && w.b.y === 1475)!;
    const cmds: Command[] = [
      { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 411, widthMm: 900, heightMm: 2100, sillMm: 0 } as never,
      { type: 'AddComponente', levelId: t, tipoId: 'LAVATORIO', familia: 'LOUCA', at: point(6600, 5400), larguraMm: 500, profundidadeMm: 450, alturaMm: 850 } as Command,
      { type: 'AddComponente', levelId: t, tipoId: 'VASO', familia: 'LOUCA', at: point(8200, 5400), larguraMm: 400, profundidadeMm: 650, alturaMm: 400 } as Command,
      { type: 'AddComponente', levelId: t, tipoId: 'CAMA_CASAL', familia: 'MOBILIARIO', at: point(4600, 2800), larguraMm: 1400, profundidadeMm: 1900, alturaMm: 500 } as Command,
    ];
    // Variante: armários encostados em TODAS as paredes livres — nenhum trecho sem componente.
    if (norteInteira) {
      for (const at of [point(3700, 3600), point(11700, 3600)]) cmds.push({ type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', familia: 'MOBILIARIO', at, larguraMm: 400, profundidadeMm: 4000, alturaMm: 2100 } as Command);
      for (const x of [4500, 5500, 9500, 10500, 11400]) cmds.push({ type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', familia: 'MOBILIARIO', at: point(x, 5400), larguraMm: 1000, profundidadeMm: 500, alturaMm: 2100 } as Command);
    }
    return { m: applyBatch(m, cmds).model, t };
  }
  const planejar = (m: BlueprintModel, t: string) => {
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    return planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO);
  };

  it('o caso do print: a evaporadora não vai para a parede das louças (nem para a da porta) — vai para a leste ou a oeste', () => {
    const { m, t } = salaComLoucas();
    const plano = planejar(m, t);
    expect(plano.aCriar).toHaveLength(1);
    const ev = plano.aCriar[0].evaporadora;
    const naLesteOuOeste = Math.abs(ev.x - (3550 + 110)) <= 1 || Math.abs(ev.x - (11850 - 110)) <= 1;
    expect(naLesteOuOeste).toBe(true);
  });

  it('sem nenhum trecho livre de componente, o split sai mesmo assim (a regra de antes) — não fica sem lançar', () => {
    const { m, t } = salaComLoucas(true);
    expect(planejar(m, t).aCriar).toHaveLength(1);
  });
});

describe('a capacidade: a condensadora acompanha a evaporadora; o gerador preenche a vazia', () => {
  const comCondensadora = (capCond: number | null, tipoCond = 'Condensadora') => {
    const { m, t } = salaDoUsuario();
    let m1 = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: tipoCond, tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(7700, 935), cotaMm: 350, ...(capCond ? { capacidadeBtuH: capCond } : {}) } as Command).model;
    const cond = terminais(m1).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    m1 = applyCommand(m1, { type: 'SetTerminalProps', terminalId: evapDe(m1).id, condensadoraId: cond.id }).model;
    return { m: m1, cond };
  };

  it('declarar 24.000 na evaporadora leva a condensadora automática junto (capacidade e nome); a declarada pelo projetista fica', () => {
    const { m, cond } = comCondensadora(null);
    const cmds = comandosDaCapacidadeDaCondensadora(m, evapDe(m), 24000);
    expect(cmds).toEqual([{ type: 'SetTerminalProps', terminalId: cond.id, capacidadeBtuH: 24000, tipo: `Condensadora ${(24000).toLocaleString('pt-BR')} BTU/h` }]);
    // A condensadora com capacidade diferente da evaporadora (declarada à parte): não mexe.
    const outra = comCondensadora(30000, 'Minha condensadora');
    expect(comandosDaCapacidadeDaCondensadora(outra.m, evapDe(outra.m), 24000)).toEqual([]);
  });

  it('o gerador no caso do usuário: a evaporadora sem capacidade recebe a do modelo que a carga pede; o ponto de força, a condensadora e o relatório acompanham', () => {
    const { m, t } = salaDoUsuario();
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    const selecao = selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo);
    const pedido = selecao.ambientes[0].sugestao.escolhido!.capacidadeBtuH;
    const plano = planejarEquipamentosSplit(m, selecao, carga, HIPOTESES_DE_SELECAO_PADRAO);
    expect(plano.capacidadesPreenchidas).toEqual([{ nome: 'Ambiente 1', capacidadeBtuH: pedido }]);
    const depois = applyBatch(m, plano.comandos).model;
    const evap = evapDe(depois);
    const cond = terminais(depois).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(evap.capacidadeBtuH).toBe(pedido);
    expect(cond.capacidadeBtuH).toBe(pedido);
    expect(cond.tipo).toBe(`Condensadora ${pedido.toLocaleString('pt-BR')} BTU/h`);
    // O ponto de força era o automático (1400 VA): passa à potência da capacidade.
    expect(pontoDe(depois)).toHaveLength(1);
    expect(pontoDe(depois)[0].potenciaW).not.toBe(1400);
    // E o gerador diz, para conferir.
    const g = gerarClimatizacao(m, hipClima, { modelos: catalogo });
    expect(g.pendencias.some((p) => p.grupo === 'CONFERIR' && /estava sem capacidade/.test(p.texto))).toBe(true);
    expect(g.pendencias.some((p) => p.grupo === 'VERIFICACAO' && /sem capacidade declarada/.test(p.texto))).toBe(false);
  });

  it('a linha já existente acompanha a capacidade: o diâmetro e o isolamento AUTOMÁTICOS sobem para a faixa pedida; o digitado e o maior ficam', () => {
    const { m, t } = salaDoUsuario();
    const evap = evapDe(m);
    let m1 = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(7700, 935), cotaMm: 350 } as Command).model;
    const cond = terminais(m1).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const hip = HIPOTESES_DA_LINHA_PADRAO;
    m1 = applyBatch(m1, [
      { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cond.id, capacidadeBtuH: 24000 },
      // A linha da faixa menor (6/10, como saiu sem capacidade) — automática.
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(7610, 1550), b: point(7610, 1475), cotaAMm: 2200, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: hip.isolamentoAte24kMm } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(7610, 1475), b: point(7700, 1475), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: hip.isolamentoAte24kMm } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(7700, 1475), b: point(7700, 935), cotaAMm: 2500, cotaBMm: 350, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: hip.isolamentoAte24kMm } as Command,
    ]).model;
    const cmds = comandosDaLinhaPelaCapacidade(m1, t, hip);
    expect(cmds).toHaveLength(3);
    for (const c of cmds) expect(c).toMatchObject({ type: 'SetTrechoProps', bitolaMm: 6, bitolaSuccaoMm: 16 });
    const depois = applyBatch(m1, cmds).model;
    expect(comandosDaLinhaPelaCapacidade(depois, t, hip)).toEqual([]);
    // Um trecho com valor DIGITADO (8/12, fora das faixas) não é tocado; um MAIOR que o pedido também não.
    const manual = applyBatch(m1, [
      { type: 'SetTrechoProps', trechoId: (m1.trechos ?? [])[0].id, bitolaMm: 8, bitolaSuccaoMm: 12 },
      { type: 'SetTrechoProps', trechoId: (m1.trechos ?? [])[1].id, bitolaMm: 10, bitolaSuccaoMm: 19 },
    ]).model;
    const ids = comandosDaLinhaPelaCapacidade(manual, t, hip).map((c) => (c as { trechoId: string }).trechoId);
    expect(ids).toEqual([(m1.trechos ?? [])[2].id]);
  });

  it('a capacidade DECLARADA não é tocada', () => {
    const { m } = salaDoUsuario();
    const m1 = applyCommand(m, { type: 'SetTerminalProps', terminalId: evapDe(m).id, capacidadeBtuH: 9000 }).model;
    const t = m1.levels[0].id;
    const carga = cargaTermicaDoNivel(m1, hipClima, t);
    const plano = planejarEquipamentosSplit(m1, selecaoDoNivel(m1, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO);
    expect(plano.capacidadesPreenchidas).toEqual([]);
    expect(evapDe(applyBatch(m1, plano.comandos).model).capacidadeBtuH).toBe(9000);
  });
});
