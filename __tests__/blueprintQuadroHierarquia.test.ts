/**
 * HIERARQUIA DE QUADROS (E4.1 do roadmap elétrico, 29/09/2026, kernel 0.76.0).
 *
 * `Quadro.tipo`, `Quadro.quadroPaiId` e `Circuito.reserva`. O filho vira uma
 * linha no quadro de cargas do pai (IB = demanda do filho); o pai soma os
 * filhos; o alimentador do filho é o eletroduto entre os dois quando existe.
 * Ciclo e auto-alimentação são recusados; apagar o pai solta os filhos.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, applyCommand, cadeiaDeQuadros, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, comprimentoEntreQuadros, preDimensionarCircuito, preDimensionarQuadroCompleto } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { desenharUnifilar, montarUnifilar, rodapeDoUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { numeroSequencialDoCircuito } from '../utils/blueprintCircuitosAutomaticos';

const TETO = 2800;
/** QGBT (0,0) alimenta QD1 (6000,0) e QD2 (0,6000). QD1: C1 TUG 1200 VA · C2 luz 300 VA. QD2: C3 chuveiro 5000 VA. QGBT: C0 próprio 600 VA. */
function predio(): { m: BlueprintModel; qgbt: string; qd1: string; qd2: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QGBT', at: point(0, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, tipo: 'QGBT' }).model;
  const qgbt = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QD1', at: point(6000, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: qgbt }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QD2', at: point(0, 6000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: qgbt, alimentadorM: 10 }).model;
  const [, qd1, qd2] = m.quadros.map((q) => q.id);
  const circuito = (quadroId: string, nome: string, potencias: [number, number, string][]) => {
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome, tensaoV: 127, ligacao: 'FN' }).model;
    const cid = m.circuitos[m.circuitos.length - 1].id;
    for (const [x, w, tipo] of potencias) {
      m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo, at: point(x, 300), cotaMm: 300, tipoEletrico: tipo as 'TUG', potenciaW: w }).model;
      m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: cid }).model;
    }
  };
  circuito(qgbt, 'C0', [[1000, 600, 'TUG']]);
  circuito(qd1, 'C1', [[7000, 1200, 'TUG']]);
  circuito(qd1, 'C2', [[8000, 300, 'ILUMINACAO_TETO']]);
  circuito(qd2, 'C3', [[1000, 5000, 'LIGACAO_DIRETA']]);
  return { m, qgbt, qd1, qd2 };
}

describe('hierarquia · kernel 0.76.0', () => {
  it('versão; tipo e pai gravam; canônico omite sem hierarquia e leva `pai` por índice com ida e volta; auto-alimentação, pai inexistente e ciclo recusados', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.81.0');
    const { m, qgbt, qd1, qd2 } = predio();
    expect(m.quadros[0].tipo).toBe('QGBT');
    expect(m.quadros[1].quadroPaiId).toBe(qgbt);
    expect(cadeiaDeQuadros(m, qd1).map((q) => q.nome)).toEqual(['QGBT']);
    expect(cadeiaDeQuadros(m, qgbt)).toEqual([]);
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"pai":');
    expect(texto).toContain('"tipo":"QGBT"');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    const pai = volta.quadros.find((q) => q.nome === 'QGBT')!;
    expect(volta.quadros.find((q) => q.nome === 'QD1')!.quadroPaiId).toBe(pai.id);
    expect(volta.quadros.find((q) => q.nome === 'QD2')!.quadroPaiId).toBe(pai.id);
    expect(pai.tipo).toBe('QGBT');
    expect(canonicalPayload(volta)).toBe(texto);
    // Um desenho sem hierarquia não ganha chave nenhuma.
    let solo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: TETO }).model;
    solo = applyCommand(solo, { type: 'AddQuadro', levelId: solo.levels[0].id, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
    const ts = canonicalPayload(solo) as unknown as string;
    expect(ts).not.toContain('"pai"');
    expect(ts).not.toContain('"tipo"');
    // Recusas.
    expect(() => applyCommand(m, { type: 'SetQuadroProps', quadroId: qd1, quadroPaiId: qd1 })).toThrow(/a si mesmo/);
    expect(() => applyCommand(m, { type: 'SetQuadroProps', quadroId: qd1, quadroPaiId: 'qdr_9999' })).toThrow(/não encontrado/);
    expect(() => applyCommand(m, { type: 'SetQuadroProps', quadroId: qgbt, quadroPaiId: qd1 })).toThrow(/Ciclo/);
    // QD2 pode passar a ser alimentado por QD1 (sem ciclo).
    const re = applyCommand(m, { type: 'SetQuadroProps', quadroId: qd2, quadroPaiId: qd1 }).model;
    expect(cadeiaDeQuadros(re, qd2).map((q) => q.nome)).toEqual(['QD1', 'QGBT']);
    // Apagar o pai solta os filhos (viram entrada), não os apaga.
    const semPai = applyCommand(m, { type: 'DeleteQuadro', quadroId: qgbt }).model;
    expect(semPai.quadros.map((q) => q.nome)).toEqual(['QD1', 'QD2']);
    expect(semPai.quadros.every((q) => q.quadroPaiId == null)).toBe(true);
  });

  it('reserva: circuito sem ponto por desenho — grava, canônico só quando marcado, e o pré-dim não o trata como pendência', () => {
    const { m: m0, qd1 } = predio();
    const m = applyCommand(m0, { type: 'AddCircuito', quadroId: qd1, nome: 'C9 — reserva', tensaoV: 127, reserva: true }).model;
    const c9 = m.circuitos[m.circuitos.length - 1];
    expect(c9.reserva).toBe(true);
    expect((canonicalPayload(m) as unknown as string)).toContain('"reserva":true');
    expect((canonicalPayload(m0) as unknown as string)).not.toContain('"reserva"');
    const r = preDimensionarCircuito(m, c9, HIPOTESES_PADRAO);
    expect(r.reserva).toBe(true);
    expect(r.naoAvaliado).toEqual(['circuito de reserva (sem pontos, por desenho)']);
    const [, dQd1] = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(dQd1.ramais.find((x) => x.nome === 'C9 — reserva')!.reserva).toBe(true);
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dQd1, 0, 0, 1);
    expect(d.textos()).toContain('RESERVA');
    expect(rodapeDoUnifilar([dQd1]).some((l) => l.startsWith('RESERVA:'))).toBe(true);
    expect(numeroSequencialDoCircuito('C9 — reserva')).toBe(9);
    expect(numeroSequencialDoCircuito('Bomba')).toBeNull();
  });
});

describe('o pai soma os filhos', () => {
  it('⚠️ QGBT: demanda própria 600 + QD1 1.500 + QD2 5.000 = 7.100 VA; os filhos são linhas com IB e geral; QD2 é alimentador declarado 10 m, QD1 não tem eletroduto → dito', () => {
    const { m, qgbt, qd1 } = predio();
    const pai = preDimensionarQuadroCompleto(m, qgbt, HIPOTESES_PADRAO)!;
    expect(pai.tipo).toBe('QGBT');
    expect(pai.paiNome).toBeNull();
    expect(pai.sDemandadaPropriaVA).toBe(600);
    expect(pai.sDemandadaVA).toBe(7100);
    expect(pai.sInstaladaVA).toBe(7100);
    expect(pai.filhos.map((f) => [f.nome, f.sDemandadaVA, f.circuitos])).toEqual([['QD1', 1500, 2], ['QD2', 5000, 1]]);
    expect(pai.ibA).toBeCloseTo(7100 / 127, 3);
    const f2 = pai.filhos[1];
    expect(f2.ibA).toBeCloseTo(5000 / 127, 3);
    expect(f2.disjuntorGeralA).toBe(40);
    const filho1 = preDimensionarQuadroCompleto(m, qd1, HIPOTESES_PADRAO)!;
    expect(filho1.paiNome).toBe('QGBT');
    expect(filho1.alimentadorM).toBeNull();
    expect(filho1.alimentadorOrigem).toBeNull();
    expect(filho1.naoAvaliado.some((x) => /sem eletroduto entre QGBT e este quadro/.test(x))).toBe(true);
    const filho2 = preDimensionarQuadroCompleto(m, m.quadros[2].id, HIPOTESES_PADRAO)!;
    expect(filho2.alimentadorM).toBe(10);
    expect(filho2.alimentadorOrigem).toBe('DECLARADO');
    expect(filho2.quedaAlimentadorPct).not.toBeNull();
  });

  it('⚠️ alimentador DERIVADO do eletroduto entre os quadros (6 m em L pelo teto = 1,2 + 6 + 1,2 = 8,4 m); o declarado vence', () => {
    const { m: m0, qgbt, qd1 } = predio();
    const t = m0.levels[0].id;
    let m = m0;
    const tr = (a: [number, number], ca: number, b: [number, number], cb: number) => {
      m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 32 }).model;
    };
    tr([0, 0], 1600, [0, 0], TETO);
    tr([0, 0], TETO, [6000, 0], TETO);
    tr([6000, 0], TETO, [6000, 0], 1600);
    expect(comprimentoEntreQuadros(m, m.quadros[0], m.quadros[1])).toBeCloseTo(8.4, 6);
    expect(comprimentoEntreQuadros(m, m.quadros[0], m.quadros[2])).toBeNull();
    const r = preDimensionarQuadroCompleto(m, qd1, HIPOTESES_PADRAO)!;
    expect(r.alimentadorM).toBeCloseTo(8.4, 6);
    expect(r.alimentadorOrigem).toBe('ELETRODUTOS');
    expect(r.quedaAlimentadorPct).not.toBeNull();
    const decl = applyCommand(m, { type: 'SetQuadroProps', quadroId: qd1, alimentadorM: 20 }).model;
    expect(preDimensionarQuadroCompleto(decl, qd1, HIPOTESES_PADRAO)!).toMatchObject({ alimentadorM: 20, alimentadorOrigem: 'DECLARADO' });
    void qgbt;
  });

  it('6.3.5.2 pede DPS só no quadro de entrada (QGBT), não nos filhos; unifilar do pai tem "→ QD1"/"→ QD2" e o do filho diz "de QGBT"; a folha lista o filho', () => {
    const { m } = predio();
    const r = conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((x) => x.codigo === '6.3.5.2')!;
    expect(r.avaliados).toBe(1);
    expect(r.achados.map((a) => a.mensagem)).toEqual([expect.stringMatching(/^QGBT: quadro de entrada sem DPS/)]);
    const [dPai, dQd1] = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(dPai.ramais.map((x) => x.nome)).toEqual(['C0', 'QD1', 'QD2']);
    expect(dPai.ramais[1]).toMatchObject({ quadroFilho: true, cargaVA: 1500, pontos: 2 });
    expect(dPai.entrada.alimentadoPor).toBeNull();
    expect(dQd1.entrada.alimentadoPor).toBe('QGBT');
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dPai, 0, 0, 1);
    expect(d.textos().filter((x) => x === '→')).toHaveLength(2);
    expect(d.textos()).toContain('1500 VA dem. · 2 circ.');
    const d2 = new DesenhistaDeProva();
    desenharUnifilar(d2, dQd1, 0, 0, 1);
    expect(d2.textos()).toContain('de QGBT');
    expect(rodapeDoUnifilar([dPai]).some((l) => l.includes('ramal que alimenta outro QUADRO'))).toBe(true);
    const L = linhasDoQuadroDeCargas(m);
    expect(L).toContain('QGBT (QGBT) - FN 127 V');
    expect(L.some((l) => /^QD1 - FN 127 V - alimentado por QGBT$/.test(l))).toBe(true);
    expect(L.some((l) => /^-> QD1 \| FN 127 \| 2 circ\. \| 1500 dem\. \| 11,8 \|/.test(l))).toBe(true);
  });
});
