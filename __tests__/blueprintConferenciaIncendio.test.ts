/**
 * INCÊNDIO E2.4 (30/09/2026): o diagnóstico do lançamento (sempre), o do
 * cálculo (com a tarefa aberta) e a conferência em três estados.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { conferenciaDeIncendio, marcasDoCalculoDeIncendio, marcasDoLancamentoDeIncendio } from '../utils/blueprintConferenciaIncendio';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

function base() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}
const t = (l: string, ax: number, ca: number, bx: number, cb: number, dn = 65): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
const p = (l: string, tipo: string, x: number, c: number, y = 0): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, y), cotaMm: c, tipoHidraulico: tipo }) as Command;

function rede(opts: { semBomba?: boolean; dn?: number; hidranteSolto?: boolean } = {}): BlueprintModel {
  const { m, l } = base();
  return applyBatch(m, [
    ...(opts.semBomba ? [] : [p(l, 'BOMBA_INCENDIO', 0, 300)]),
    t(l, 0, 300, 0, 2600, opts.dn),
    t(l, 0, 2600, 20000, 2600, opts.dn),
    t(l, 20000, 2600, 20000, 1300, opts.dn),
    p(l, 'HIDRANTE_SIMPLES', 20000, 1300),
    ...(opts.hidranteSolto ? [p(l, 'HIDRANTE_SIMPLES', 5000, 1300, 9000)] : []),
  ]).model;
}

describe('E2.4 · diagnóstico do lançamento', () => {
  it('rede sã: nenhuma marca de incêndio', () => {
    expect(marcasDoLancamentoDeIncendio(rede())).toEqual([]);
  });

  it('hidrante solto: "fora da rede", e a marca chega ao desenho pela verificação geral', () => {
    const m = rede({ hidranteSolto: true });
    const marcas = marcasDoLancamentoDeIncendio(m).map((x) => x.tipo);
    expect(marcas).toContain('INCENDIO_FORA_DA_REDE');
    expect(marcasDeVerificacao(m).some((x) => x.tipo === 'INCENDIO_FORA_DA_REDE')).toBe(true);
  });

  it('rede sem bomba: "sem entrada de água", uma marca por pedaço de rede', () => {
    const marcas = marcasDoLancamentoDeIncendio(rede({ semBomba: true })).filter((x) => x.tipo === 'INCENDIO_SEM_BOMBA');
    expect(marcas).toHaveLength(1);
  });

  it('tubo DN 50 chegando no hidrante DN 65: peça maior que o tubo', () => {
    const marcas = marcasDoLancamentoDeIncendio(rede({ dn: 50 })).filter((x) => x.tipo === 'INCENDIO_DN_PECA');
    expect(marcas.length).toBeGreaterThan(0);
    expect(marcas[0].texto).toBe('tubo DN 50 < DN 65 da peça');
  });

  it('tubo de incêndio que atravessa pilar ganha a marca da estrutura, como a água', () => {
    const { m, l } = base();
    const comPilar = applyBatch(m, [
      t(l, 0, 2600, 6000, 2600),
      { type: 'AddStructural', levelId: l, kind: 'PILAR', pontos: [{ x: 3000, y: 0 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command,
    ]).model;
    expect(marcasDeVerificacao(comPilar).some((x) => x.tipo === 'ATRAVESSA_PILAR' && x.disciplina === 'INCENDIO')).toBe(true);
  });
});

describe('E2.4 · diagnóstico do cálculo e conferência', () => {
  it('DN 32: o cálculo marca velocidade acima da máxima e a conferência diz FALTA, com o trecho a selecionar', () => {
    const m = rede({ dn: 32 });
    const c = calculoDeIncendio(m, HIP);
    const marcas = marcasDoCalculoDeIncendio(m, c, HIP);
    expect(marcas.some((x) => x.tipo === 'INCENDIO_VELOCIDADE')).toBe(true);
    const vel = conferenciaDeIncendio(m, c, HIP).find((i) => i.item === 'Velocidade da água nos trechos')!;
    expect(vel.estado).toBe('FALTA');
    expect(vel.alvos.length).toBeGreaterThan(0);
  });

  it('pressão máxima baixa demais: a estática passa e vira FALTA', () => {
    const m = rede();
    const hip = { ...HIP, pressaoMaximaKpa: 300 };
    const c = calculoDeIncendio(m, hip);
    expect(marcasDoCalculoDeIncendio(m, c, hip).some((x) => x.tipo === 'INCENDIO_PRESSAO_ALTA')).toBe(true);
    expect(conferenciaDeIncendio(m, c, hip).find((i) => i.item === 'Pressão estática nos hidrantes')!.estado).toBe('FALTA');
  });

  it('rede sã: vazão ATENDE, fonte ATENDE; sem reserva desenhada a RTI FALTA (E3.2)', () => {
    const m = rede();
    const itens = conferenciaDeIncendio(m, calculoDeIncendio(m, HIP), HIP);
    expect(itens.find((i) => i.item.startsWith('Vazão no esguicho'))!.estado).toBe('ATENDE');
    expect(itens.find((i) => i.item === 'Fonte ligada à rede (bomba ou caixa de incêndio)')!.estado).toBe('ATENDE');
    expect(itens.find((i) => i.item === 'Reserva técnica de incêndio')!.estado).toBe('FALTA');
  });

  it('E3.2: RTI na caixa de água fria compartilhada — atende com volume suficiente, e pede a saída de consumo acima dela', () => {
    const m = rede();
    const l = m.levels[0].id;
    const comCaixa = applyBatch(m, [
      { type: 'AddTerminal', levelId: l, disciplina: 'AGUA_FRIA', tipo: 'CX', at: point(0, 9000), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 30000, volumeRtiL: 20000, larguraMm: 4000, profundidadeMm: 2500, alturaMm: 3000 } as Command,
    ]).model;
    const itens = conferenciaDeIncendio(comCaixa, calculoDeIncendio(comCaixa, HIP), HIP);
    expect(itens.find((i) => i.item === 'Reserva técnica de incêndio')!.estado).toBe('ATENDE');
    const saida = itens.find((i) => i.item === 'Saída de consumo acima da reserva de incêndio')!;
    // 20 m³ numa base de 4 × 2,5 m = 2 m de lâmina.
    expect(saida.exigido).toBe('tomada de consumo ≥ 200 cm acima do fundo');
    expect(saida.estado).toBe('NAO_AVALIADO');
  });

  it('E3.1: registro de recalque — falta sem ele; atende quando ligado à rede', () => {
    const m = rede();
    const item = (x: BlueprintModel) => conferenciaDeIncendio(x, calculoDeIncendio(x, HIP), HIP).find((i) => i.item === 'Registro de recalque ligado à rede')!;
    expect(item(m).estado).toBe('FALTA');
    const l = m.levels[0].id;
    const comRR = applyBatch(m, [t(l, 0, 300, 0, -300), p(l, 'HIDRANTE_RECALQUE', 0, -300)]).model;
    expect(item(comRR).estado).toBe('ATENDE');
  });

  it('sem bomba: a bomba FALTA e o resto do cálculo fica NÃO AVALIADO — nunca "atende" por omissão', () => {
    const m = rede({ semBomba: true });
    const itens = conferenciaDeIncendio(m, calculoDeIncendio(m, HIP), HIP);
    expect(itens.find((i) => i.item === 'Fonte ligada à rede (bomba ou caixa de incêndio)')!.estado).toBe('FALTA');
    expect(itens.find((i) => i.item.startsWith('Vazão no esguicho'))!.estado).toBe('NAO_AVALIADO');
    expect(itens.find((i) => i.item === 'Velocidade da água nos trechos')!.estado).toBe('NAO_AVALIADO');
  });
});
