/**
 * E6.2 — CALHAS (29/09/2026, NBR 10844 5.5): a calha no kernel (seção, só
 * pluvial, no canônico e no quantitativo), a capacidade por Manning contra a
 * Tabela 3 da norma, o lançamento por beiral com o bocal e a verificação de
 * toda calha do desenho.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { capacidadeDaCalhaLMin, planejarCalhas, secaoComercial, verificarCalhas } from '../utils/blueprintCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { itensDaLegendaHidro } from '../utils/blueprintPranchaHidro';

const hip = HIPOTESES_PLUVIAIS_PADRAO;
const casa = (larguraMm = 10000, fundoMm = 8000): BlueprintModel => {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const meio = fundoMm / 2;
  m = applyBatch(m, [
    { type: 'AddAgua', levelId: l, pontos: [point(0, 0), point(larguraMm, 0), point(larguraMm, meio), point(0, meio)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    { type: 'AddAgua', levelId: l, pontos: [point(0, meio), point(larguraMm, meio), point(larguraMm, fundoMm), point(0, fundoMm)], beiralIndex: 2, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
  ] as never).model;
  return m;
};
const calha = (m: BlueprintModel, extra: Record<string, unknown>): Command =>
  ({ type: 'AddTrecho', levelId: m.levels[0].id, disciplina: 'PLUVIAL', a: point(0, 0), b: point(10000, 0), cotaAMm: 2775, cotaBMm: 2725, bitolaMm: 100, rotulo: 'Calha', secaoCalha: 'SEMICIRCULAR', ...extra }) as Command;

describe('E6.2 — Manning', () => {
  it('meia-cana a 0,5 % com n 0,011 bate com a Tabela 3 da NBR 10844 (130 · 236 · 384 · 829 L/min, ±1 %)', () => {
    const cap = (D: number) => capacidadeDaCalhaLMin({ secao: 'SEMICIRCULAR', larguraMm: D, alturaMm: null }, 0.011, 0.5);
    for (const [D, tabela] of [[100, 130], [125, 236], [150, 384], [200, 829]]) expect(Math.abs(cap(D) / tabela - 1)).toBeLessThan(0.01);
  });

  it('retangular: S = b·h e Rh = S/(b + 2h); mais declividade leva mais; sem declividade não leva', () => {
    const s = { secao: 'RETANGULAR' as const, larguraMm: 200, alturaMm: 100 };
    const esperado = ((60000 * 0.02) / 0.011) * (0.02 / 0.4) ** (2 / 3) * Math.sqrt(0.005);
    expect(capacidadeDaCalhaLMin(s, 0.011, 0.5)).toBeCloseTo(esperado, 6);
    expect(capacidadeDaCalhaLMin(s, 0.011, 2)).toBeCloseTo(esperado * 2, 6);
    expect(capacidadeDaCalhaLMin(s, 0.011, 0)).toBe(0);
  });

  it('a seção comercial é a menor que leva a vazão; acima da maior, nenhuma', () => {
    expect(secaoComercial('SEMICIRCULAR', 115, 0.011, 0.5)).toEqual({ secao: 'SEMICIRCULAR', larguraMm: 100, alturaMm: null });
    expect(secaoComercial('SEMICIRCULAR', 300, 0.011, 0.5)!.larguraMm).toBe(150);
    // 150 × 75 a 0,5 %: S = 0,01125 m², Rh = 0,0375 m → ~486 L/min.
    expect(secaoComercial('RETANGULAR', 300, 0.011, 0.5)).toEqual({ secao: 'RETANGULAR', larguraMm: 150, alturaMm: 75 });
    expect(secaoComercial('SEMICIRCULAR', 5000, 0.011, 0.5)).toBeNull();
  });
});

describe('E6.2 — a calha no kernel', () => {
  it('só na pluvial; a retangular exige altura e a meia-cana a recusa', () => {
    const m = casa();
    expect(() => applyCommand(m, calha(m, { disciplina: 'ESGOTO' }))).toThrow(/Calha inválida/);
    expect(() => applyCommand(m, calha(m, { secaoCalha: 'RETANGULAR' }))).toThrow(/Altura da calha/);
    expect(() => applyCommand(m, calha(m, { alturaCalhaMm: 50 }))).toThrow(/Altura da calha/);
    expect(() => applyCommand(m, calha(m, { secaoCalha: 'RETANGULAR', bitolaMm: 200, alturaCalhaMm: 100 }))).not.toThrow();
  });

  it('ida e volta pelo canônico; o tubo comum não ganha chave; voltar a tubo limpa a altura', () => {
    const m0 = casa();
    const m = applyCommand(m0, calha(m0, { secaoCalha: 'RETANGULAR', bitolaMm: 200, alturaCalhaMm: 100 })).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.trechos![0]).toMatchObject({ secaoCalha: 'RETANGULAR', alturaCalhaMm: 100, bitolaMm: 200 });
    const tubo = applyCommand(m0, { type: 'AddTrecho', levelId: m0.levels[0].id, disciplina: 'PLUVIAL', a: point(0, 0), b: point(0, 3000), cotaAMm: -300, cotaBMm: -330, bitolaMm: 100 }).model;
    expect(canonicalPayload(tubo)).not.toMatch(/secaoCalha|alturaCalhaMm/);
    const deVolta = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos![0].id, secaoCalha: null }).model;
    expect(deVolta.trechos![0]).toMatchObject({ secaoCalha: null, alturaCalhaMm: null });
  });

  it('o quantitativo separa a calha do tubo de mesma bitola', () => {
    const m0 = casa();
    const l = m0.levels[0].id;
    const m = applyBatch(m0, [
      calha(m0, {}),
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(10000, 0), b: point(10000, 3000), cotaAMm: -300, cotaBMm: -330, bitolaMm: 100 },
    ]).model;
    const pluvial = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais.porBitola.filter((b) => b.disciplina === 'PLUVIAL');
    expect(pluvial.map((b) => [b.secaoCalha, b.bitolaMm])).toEqual([[null, 100], ['SEMICIRCULAR', 100]]);
    expect(POLITICA_PADRAO.version).toBe('quant-1.21.0');
    // E na legenda da prancha: a calha pela seção, o tubo pelo material.
    const textos = itensDaLegendaHidro(m).filter((i) => i.grupo === 'Condutos').map((i) => i.texto);
    expect(textos).toEqual(expect.arrayContaining(['Calha meia-cana ø100 mm', 'Águas pluviais · PVC série R (NBR 5688) · ø100 mm']));
  });
});

describe('E6.2 — o lançamento', () => {
  it('casa 10 × 8 m, duas águas de 115 L/min: meia-cana ø100 em cada beiral, 0,5 %, bocal na ponta b', () => {
    const p = planejarCalhas(casa(), hip);
    expect(p.motivo).toBeNull();
    expect(p.calhas.map((c) => [c.secao.larguraMm, Math.round(c.vazaoLMin)])).toEqual([[100, 115], [100, 115]]);
    const trechos = p.comandos.filter((c) => c.type === 'AddTrecho');
    expect(trechos[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 10000, y: 0 }, cotaAMm: 2775, cotaBMm: 2725, bitolaMm: 100, secaoCalha: 'SEMICIRCULAR', rotulo: 'Calha', sugerido: true });
    expect(p.comandos.filter((c) => c.type === 'AddTerminal')).toHaveLength(2);
  });

  it('com caixa de areia, o bocal vai para a ponta mais perto dela', () => {
    const m0 = casa();
    const m = applyCommand(m0, { type: 'AddTerminal', levelId: m0.levels[0].id, disciplina: 'PLUVIAL', tipo: 'CA', at: point(-500, -1500), cotaMm: -600, tipoHidraulico: 'CAIXA_AREIA' }).model;
    const t = planejarCalhas(m, hip).comandos.find((c) => c.type === 'AddTrecho') as { a: { x: number }; b: { x: number } };
    expect([t.a.x, t.b.x]).toEqual([10000, 0]);
  });

  it('depois de lançadas: toda calha atende, nenhuma marca pluvial; relançar troca as sugeridas; a confirmada fica', () => {
    const m = applyBatch(casa(), planejarCalhas(casa(), hip).comandos).model;
    expect(verificarCalhas(m, hip).every((c) => c.atende && c.declividadeOk && Math.abs(c.declividadePct - 0.5) < 1e-9)).toBe(true);
    expect(marcasDeVerificacao(m, null, [], hip).filter((x) => x.disciplina === 'PLUVIAL')).toEqual([]);
    const de2 = planejarCalhas(m, hip);
    expect(de2.apagados).toBe(2);
    const confirmada = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos![0].id, sugerido: false }).model;
    const de3 = planejarCalhas(confirmada, hip);
    expect(de3.jaTemCalha).toBe(1);
    expect(de3.calhas).toHaveLength(1);
  });

  it('sem telhado, ou acima de 100 m² sem intensidade: o motivo', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(planejarCalhas(vazio, hip).motivo).toMatch(/^Desenhe o telhado/);
    expect(planejarCalhas(casa(12000, 10000), hip).motivo).toMatch(/escolha a cidade/);
  });
});

describe('E6.2 — a verificação da calha desenhada', () => {
  it('ø100 num beiral de São Paulo (T = 25): não leva — marca de erro com os números', () => {
    const m0 = casa(12000, 10000);
    const m = applyCommand(m0, calha(m0, { b: point(12000, 0), cotaBMm: 2715 })).model;
    const sp = { ...hip, cidade: 'São Paulo', periodoDeRetornoAnos: 25 as const };
    const [c] = verificarCalhas(m, sp);
    // 60 m² × 1,15 = 69 m²; 191 mm/h → 219,65 L/min.
    expect(c.vazaoLMin).toBeCloseTo((191 * 69) / 60, 6);
    expect(c.atende).toBe(false);
    const marca = marcasDeVerificacao(m, null, [], sp).find((x) => x.tipo === 'CALHA_INSUFICIENTE');
    expect(marca).toMatchObject({ severidade: 'ERRO', disciplina: 'PLUVIAL', texto: `calha leva ${Math.round(c.capacidadeLMin)} < 220 L/min` });
  });

  it('calha sem caimento: marca de declividade; a cabeceira não é ponta aberta, a ponta baixa sem bocal é', () => {
    const m0 = casa();
    const m = applyCommand(m0, calha(m0, { cotaBMm: 2775 })).model;
    const marcas = marcasDeVerificacao(m, null, [], hip).filter((x) => x.disciplina === 'PLUVIAL');
    expect(marcas.map((x) => x.tipo).sort()).toEqual(['CALHA_DECLIVIDADE', 'PONTA_ABERTA']);
  });
});
