/**
 * E5.3 — COLETOR PREDIAL E LIGAÇÃO À REDE PÚBLICA (29/09/2026): da CI à peça
 * "Ligação à rede pública", DN pela tabela 7, caixas intermediárias (≤ 15 m da
 * ligação, ≤ 25 m entre caixas) e o aviso de elevatória quando a rede está alta.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, esgotoTrechoATrecho, planejarEsgoto, trechosDeEsgotoSemDestino } from '../utils/blueprintEsgotoAutomatico';
import { ROTULO_DA_CI_DO_COLETOR, ROTULO_DO_COLETOR, planejarColetorPredial } from '../utils/blueprintColetorPredial';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

const planejar = (m: BlueprintModel) => planejarColetorPredial(m, HIPOTESES_ESGOTO_PADRAO);
/** O sobrado (CI em (6000, −1500), fundo −0,70) com a ligação onde e na cota pedidas. */
const comLigacao = (x: number, y: number, cota: number) => {
  const m = sobrado(true, { cotaDaCaixaMm: 4500 });
  return applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'ESGOTO', tipo: 'Ligação', at: point(x, y), cotaMm: cota, tipoHidraulico: 'LIGACAO_ESGOTO' }).model;
};

describe('E5.3 — sem o que ligar', () => {
  it('sem a ligação: diz onde pôr; e a ligação NÃO é fonte do esgoto automático', () => {
    const m = sobrado(true, { cotaDaCaixaMm: 4500 });
    expect(planejar(m).motivo).toMatch(/^Coloque a ligação à rede pública/);
    const com = comLigacao(6000, -6000, -800);
    expect(planejarEsgoto(com).aLigar).toBe(planejarEsgoto(m).aLigar);
  });
});

describe('E5.3 — o coletor', () => {
  it('4,5 m até a rede a −0,80: DN 100, 2,22 %, por gravidade, sem caixa intermediária', () => {
    const p = planejar(comLigacao(6000, -6000, -800));
    expect(p.motivo).toBeNull();
    expect(p.comprimentoM).toBeCloseTo(4.5, 6);
    expect(p.declividadePct).toBeCloseTo((100 / 4500) * 100, 6);
    expect(p).toMatchObject({ dnMm: 100, porGravidade: true, caixasIntermediarias: 0, uhc: 20 });
    const trechos = p.comandos.filter((c) => c.type === 'AddTrecho');
    expect(trechos).toHaveLength(1);
    expect(trechos[0]).toMatchObject({ a: { x: 6000, y: -1500 }, b: { x: 6000, y: -6000 }, cotaAMm: -700, cotaBMm: -800, bitolaMm: 100, rotulo: ROTULO_DO_COLETOR, sugerido: true });
  });

  it('60 m: caixas a 20 m e a 45 m (a última a 15 m da ligação, 25 m entre elas), nas cotas da linha', () => {
    const p = planejar(comLigacao(6000, -61500, -1900));
    expect(p.caixasIntermediarias).toBe(2);
    const cis = p.comandos.filter((c) => c.type === 'AddTerminal');
    expect(cis.map((c) => (c as { at: { y: number } }).at.y)).toEqual([-1500 - 20000, -1500 - 45000]);
    // −0,70 → −1,90 em 60 m: 2 % ; a 20 m, −0,70 − 0,40 = −1,10.
    expect((cis[0] as { cotaMm: number }).cotaMm).toBe(-1100);
    expect(cis.every((c) => (c as { rotulo: string }).rotulo === ROTULO_DA_CI_DO_COLETOR)).toBe(true);
    expect(p.comandos.filter((c) => c.type === 'AddTrecho')).toHaveLength(3);
  });

  it('rede acima do fundo da caixa: não chega por gravidade — o aviso fala em elevatória', () => {
    const p = planejar(comLigacao(6000, -6000, -500));
    expect(p.porGravidade).toBe(false);
    expect(p.avisos[0]).toMatch(/não chega por gravidade — precisa de estação elevatória/);
  });
});

describe('E5.3 — depois de lançado', () => {
  const m = sobrado(true, { cotaDaCaixaMm: 4500, ligacao: true });

  it('o coletor é COLETOR PREDIAL no cálculo, com todas as UHC; nada solto nem em contrafluxo', () => {
    const col = esgotoTrechoATrecho(m).filter((c) => c.rotulo === ROTULO_DO_COLETOR);
    expect(col).toHaveLength(1);
    expect(col[0]).toMatchObject({ papel: 'COLETOR_PREDIAL', uhc: 20, dnNecessarioMm: 100, contrafluxo: false });
    expect(trechosDeEsgotoSemDestino(m)).toEqual([]);
    expect(marcasDeVerificacao(m).filter((x) => ['CONTRAFLUXO', 'DECLIVIDADE_BAIXA', 'DN_DIMINUI', 'SEM_DESTINO', 'PONTA_ABERTA'].includes(x.tipo) && x.disciplina === 'ESGOTO')).toEqual([]);
  });

  it('a conferência atende; relançar apaga o coletor sugerido e refaz', () => {
    const r = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, { nome: 'Ana', titulo: 'Eng', conselho: 'CREA', registro: '1', artNumero: '2', artData: '2026-09-29' });
    expect(r.verificacoes.find((v) => v.item === 'Coletor predial até a rede pública')).toMatchObject({ atende: true });
    const de2 = planejar(m);
    expect(de2.apagados).toBe(1);
    expect(de2.comandos[0]).toMatchObject({ type: 'DeleteTrecho' });
    const refeito = applyBatch(m, de2.comandos).model;
    expect(refeito.trechos!.filter((t) => t.rotulo === ROTULO_DO_COLETOR)).toHaveLength(1);
  });
});
