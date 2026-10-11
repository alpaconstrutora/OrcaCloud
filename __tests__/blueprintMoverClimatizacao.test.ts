/**
 * 11/10/2026 (teste do usuário no app real: "o comando mover funciona, porém a linha de
 * dreno e a alimentação elétrica não acompanham a nova posição"). O split lançado pelo
 * gerador e ACEITO (como no rascunho do usuário); a evaporadora levada da parede norte
 * para a sul. Decisão do usuário: "refazer sempre" a linha e o dreno do sistema.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type ObjectId } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { linhaExistente, planejarLinhasFrigorigenas, sistemasDoNivel } from '../utils/blueprintLinhaFrigorigena';
import { giroParaSoprarParaDentro } from '../utils/blueprintEncostoNaParede';
import { comandosAoMoverClimatizacao, moveuClimatizacao } from '../utils/blueprintMoverClimatizacao';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 31.3, tbuExternaC: 19.6, altitudeM: 1160 } };
const hip = HIPOTESES_DA_LINHA_PADRAO;
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const deClima = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'FRIGORIGENA' || t.disciplina === 'DRENO_AC');

/** A sala do usuário (8,45 × 4,25 m), porta na parede sul; o split do gerador lançado e TODO aceito. */
function salaComSplitAceito() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(3475, 1475, 3475, 5725), w(3475, 5725, 11925, 5725), w(11925, 1475, 3475, 1475), w(11925, 5725, 11925, 1475)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Ambiente 1', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  // A porta na parede sul, como na sala do usuário: o split nasce na parede NORTE.
  const sul = m.walls.find((x) => x.a.y === 1475 && x.b.y === 1475)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 411, widthMm: 900, heightMm: 2100, sillMm: 0 } as never).model;
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  m = applyBatch(m, planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO).comandos).model;
  m = applyBatch(m, planejarLinhasFrigorigenas(m, t, hip).comandos).model;
  // Aceitar tudo (os painéis Split e Linha e dreno).
  m = applyBatch(m, [
    ...terminais(m).filter((x) => x.sugerida).map((x) => ({ type: 'SetTerminalProps', terminalId: x.id, sugerida: false }) as Command),
    ...(m.trechos ?? []).filter((x) => x.sugerido).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command),
  ]).model;
  return { m, t };
}
const evapDe = (m: BlueprintModel) => terminais(m).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
const condDe = (m: BlueprintModel) => terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
const transladar = (ids: { terminalIds?: ObjectId[]; trechoIds?: ObjectId[] }, delta: { x: number; y: number }): Command =>
  ({ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: ids.terminalIds ?? [], trechoIds: ids.trechoIds ?? [], delta, manterJuncoes: false }) as Command;
/** O gesto do editor: o arraste e o complemento num lote só. */
function mover(m: BlueprintModel, ids: { terminalIds?: ObjectId[]; trechoIds?: ObjectId[] }, delta: { x: number; y: number }) {
  const gesto = transladar(ids, delta);
  const depois = applyBatch(m, [gesto]).model;
  const junto = comandosAoMoverClimatizacao(m, depois, { terminalIds: ids.terminalIds ?? [], trechoIds: ids.trechoIds ?? [] }, hip);
  return { final: applyBatch(m, [gesto, ...junto]).model, junto };
}

describe('mover a peça de climatização leva o sistema junto', () => {
  it('⚠️ PRONTO QUANDO: a evaporadora levada para a parede sul encosta e gira, o ponto de força vai junto e a linha e o dreno ACEITOS são retraçados — nada fica na diagonal', () => {
    const { m, t } = salaComSplitAceito();
    const evap = evapDe(m);
    const antigos = new Set(deClima(m).map((x) => x.id));
    expect(moveuClimatizacao(m, [evap.id])).toBe(true);
    // Solta perto da parede sul, "dentro" da alvenaria (como o print: centro no eixo dela).
    const { final } = mover(m, { terminalIds: [evap.id] }, { x: 8900 - evap.at.x, y: 1475 - evap.at.y });
    const ev = evapDe(final);
    // 1. Encostada na face interna da sul (1475 + 75 + 110) e soprando para dentro (norte).
    expect(ev.at).toEqual({ x: 8900, y: 1660 });
    expect(ev.rotacaoGraus).toBe(giroParaSoprarParaDentro({ x: 0, y: 1 }));
    // 2. O ponto de força dela: na face sul, ao lado (600 mm), e um só.
    const pontos = terminais(final).filter((x) => x.tipoEletrico === 'AR_CONDICIONADO');
    expect(pontos).toHaveLength(1);
    expect(pontos[0].at.y).toBe(1550);
    expect(Math.abs(pontos[0].at.x - 8900)).toBe(600);
    // 3. A linha e o dreno: os antigos (aceitos) saíram, os novos ligam a evaporadora à condensadora
    //    e ao dreno, e nenhum trecho ficou na diagonal.
    const agora = deClima(final);
    expect(agora.some((x) => antigos.has(x.id))).toBe(false);
    const s = sistemasDoNivel(final, t)[0];
    expect(linhaExistente(final, s)).not.toBeNull();
    expect(agora.filter((x) => x.disciplina === 'DRENO_AC').length).toBeGreaterThan(0);
    for (const x of agora) expect(x.a.x === x.b.x || x.a.y === x.b.y).toBe(true);
    // E retraçados como SUGERIDOS (o painel Linha e dreno aceita de novo).
    expect(agora.every((x) => x.sugerido)).toBe(true);
  });

  it('o fluxo do usuário: a evaporadora e depois a condensadora para o sul, em dois gestos — o dreno termina CURTO, junto da condensadora, sem dar a volta na sala', () => {
    const { m, t } = salaComSplitAceito();
    const evap = evapDe(m);
    const cond = condDe(m);
    const pdAntigo = terminais(m).find((x) => x.tipoHidraulico === 'PONTO_DRENO')!;
    const m1 = mover(m, { terminalIds: [evap.id] }, { x: 8900 - evap.at.x, y: 1475 - evap.at.y }).final;
    const m2 = mover(m1, { terminalIds: [cond.id] }, { x: 7800 - cond.at.x, y: 1065 - cond.at.y }).final;
    // O ponto de dreno antigo (posto para a posição de antes, só deste dreno) saiu; o novo está ao sul.
    expect(terminais(m2).some((x) => x.id === pdAntigo.id)).toBe(false);
    const pds = terminais(m2).filter((x) => x.tipoHidraulico === 'PONTO_DRENO');
    expect(pds).toHaveLength(1);
    expect(pds[0].at.y).toBeLessThan(1475);
    const dreno = deClima(m2).filter((x) => x.disciplina === 'DRENO_AC');
    const mm = dreno.reduce((acc, x) => acc + Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y), 0);
    expect(mm).toBeLessThan(3000);
    for (const x of deClima(m2)) expect(x.a.x === x.b.x || x.a.y === x.b.y).toBe(true);
    expect(linhaExistente(m2, sistemasDoNivel(m2, t)[0])).not.toBeNull();
  });

  it('o ponto de dreno que OUTRO dreno também usa fica', () => {
    const { m, t } = salaComSplitAceito();
    const evap = evapDe(m);
    const pd = terminais(m).find((x) => x.tipoHidraulico === 'PONTO_DRENO')!;
    // Um segundo dreno (de outra origem) chegando ao mesmo ponto.
    const m1 = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(pd.at.x - 800, pd.at.y), b: pd.at, cotaAMm: pd.cotaMm, cotaBMm: pd.cotaMm, bitolaMm: 25 } as Command).model;
    const { final } = mover(m1, { terminalIds: [evap.id] }, { x: 8900 - evap.at.x, y: 1475 - evap.at.y });
    expect(terminais(final).some((x) => x.id === pd.id)).toBe(true);
  });

  it('arrastar o CONJUNTO (a peça e o traçado selecionados) não refaz nada; mover outra coisa não chama o complemento', () => {
    const { m } = salaComSplitAceito();
    const evap = evapDe(m);
    const cond = condDe(m);
    const pecas = terminais(m).filter((x) => x.disciplina === 'FRIGORIGENA' || x.disciplina === 'DRENO_AC' || x.tipoEletrico === 'AR_CONDICIONADO').map((x) => x.id);
    const { junto } = mover(m, { terminalIds: pecas, trechoIds: deClima(m).map((x) => x.id) }, { x: 0, y: -300 });
    expect(junto.filter((c) => c.type === 'DeleteTrecho')).toEqual([]);
    expect([evap.id, cond.id].every((id) => pecas.includes(id))).toBe(true);
    const tomada = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(5000, 3000), cotaMm: 300 } as Command).model;
    const tug = terminais(tomada).find((x) => x.tipoEletrico === 'TUG')!;
    expect(moveuClimatizacao(tomada, [tug.id])).toBe(false);
  });
});
