/**
 * F9 — TAXA DE OCUPAÇÃO DO ELETRODUTO (NBR 5410 6.2.11.1.6), 13/09/2026.
 *
 * 53 % com um condutor, 31 % com dois, 40 % com três ou mais. Os diâmetros
 * (externo do condutor, interno do eletroduto) NÃO são da norma: são tabelas
 * típicas de catálogo, declaradas como hipótese — e a regra diz isso.
 *
 * ─── ⚠️ O QUE UMA IMPLEMENTAÇÃO INGÊNUA ERRA ────────────────────────────────
 *
 * · usar o diâmetro NOMINAL do eletroduto como interno (Ø25 tem ~22,4 mm por
 *   dentro — a ocupação sobe 25 %);
 * · aproximar seção ou bitola fora da tabela em vez de dizer "não avaliado";
 * · aplicar 40 % a dois condutores (é 31 %).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import {
  DIAMETRO_EXTERNO_CONDUTOR_MM,
  DIAMETRO_INTERNO_ELETRODUTO_MM,
  HIPOTESES_PADRAO,
  limiteDeOcupacaoPct,
  ocupacaoDoEletroduto,
  ocupacaoDoTrecho,
} from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';

describe('limite pelo número de condutores', () => {
  it('1 → 53 %, 2 → 31 %, 3+ → 40 %', () => {
    expect(limiteDeOcupacaoPct(1)).toBe(53);
    expect(limiteDeOcupacaoPct(2)).toBe(31);
    expect(limiteDeOcupacaoPct(3)).toBe(40);
    expect(limiteDeOcupacaoPct(7)).toBe(40);
  });
});

describe('ocupação do eletroduto', () => {
  it('3 × 2,5 mm² em Ø20: área 3·π·1,8² = 30,5 mm² sobre π·8,7² = 237,8 mm² → 12,8 %, atende', () => {
    const o = ocupacaoDoEletroduto(20, 3, 2.5)!;
    expect(o.diametroCondutorMm).toBe(3.6);
    expect(o.diametroInternoMm).toBe(17.4);
    expect(o.ocupacaoPct).toBeCloseTo((3 * Math.PI * 1.8 ** 2) / (Math.PI * 8.7 ** 2) * 100, 9);
    expect(o.ocupacaoPct).toBeCloseTo(12.8, 1);
    expect(o.atende).toBe(true);
    expect(o.bitolaQueAtendeMm).toBeNull();
  });

  it('⚠️ o INTERNO, não o nominal: 7 × 10 mm² em Ø20 estoura (com o nominal passaria)', () => {
    const o = ocupacaoDoEletroduto(20, 7, 10)!;
    // 7 · π · 3² = 197,9 mm²; interno 17,4 → 237,8 mm² → 83 % (nominal 20 → 314 mm² → 63 %, também estoura, mas o ponto é a base).
    expect(o.ocupacaoPct).toBeGreaterThan(40);
    expect(o.atende).toBe(false);
    expect(o.bitolaQueAtendeMm).toBe(32); // Ø25 (22,4): 197,9/394 = 50 % não; Ø32 (29,4): 29 % sim
  });

  it('⚠️ dois condutores usam 31 %: 2 × 6 mm² em Ø16 (36,2 mm² / 138,9 mm² = 26 %) passa; 2 × 10 mm² (56,5 / 138,9 = 41 %) não', () => {
    expect(ocupacaoDoEletroduto(16, 2, 6)!.atende).toBe(true);
    const o = ocupacaoDoEletroduto(16, 2, 10)!;
    expect(o.limitePct).toBe(31);
    expect(o.atende).toBe(false);
  });

  it('bitola ou seção fora das tabelas → null, nunca aproximação', () => {
    expect(ocupacaoDoEletroduto(19, 3, 2.5)).toBeNull();
    expect(ocupacaoDoEletroduto(20, 3, 3)).toBeNull();
    expect(ocupacaoDoEletroduto(20, 0, 2.5)).toBeNull();
  });

  it('as tabelas são hipótese e viajam em HIPOTESES_PADRAO', () => {
    expect(HIPOTESES_PADRAO.diametroExternoCondutorMm).toBe(DIAMETRO_EXTERNO_CONDUTOR_MM);
    expect(HIPOTESES_PADRAO.diametroInternoEletrodutoMm).toBe(DIAMETRO_INTERNO_ELETRODUTO_MM);
    // Uma tabela de fabricante diferente muda o veredito — é para isso que é hipótese.
    const folgada = { ...HIPOTESES_PADRAO, diametroInternoEletrodutoMm: [[16, 30]] as const };
    expect(ocupacaoDoEletroduto(16, 2, 10, folgada)!.atende).toBe(true);
  });
});

function cena(): { m: BlueprintModel; levelId: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
  return { m, levelId };
}

describe('ocupação do TRECHO no desenho', () => {
  it('lê a seção DECLARADA do circuito; sem condutores ou sem circuito, diz o motivo', () => {
    const { m: m0, levelId } = cena();
    let m = applyCommand(m0, { type: 'AddCircuito', quadroId: m0.quadros[0].id, nome: 'C1', tensaoV: 127, secaoMm2: 2.5 }).model;
    const c1 = m.circuitos[0].id;
    m = applyCommand(m, { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(4000, 0), cotaAMm: 300, cotaBMm: 300, bitolaMm: 20 }).model;
    const trecho = m.trechos[0];
    expect(ocupacaoDoTrecho(m, trecho).motivo).toMatch(/condutores não declarados/);
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: trecho.id, condutores: 3 }).model;
    expect(ocupacaoDoTrecho(m, m.trechos[0]).motivo).toMatch(/sem circuito/);
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: trecho.id, circuitoId: c1 }).model;
    const r = ocupacaoDoTrecho(m, m.trechos[0]);
    expect(r.motivo).toBeNull();
    expect(r.ocupacao).toMatchObject({ condutores: 3, secaoMm2: 2.5, bitolaMm: 20, atende: true });
  });

  it('⚠️ a regra 6.2.11.1.6 acusa o eletroduto cheio e sugere a bitola — e declara a hipótese das tabelas', () => {
    const { m: m0, levelId } = cena();
    let m = applyCommand(m0, { type: 'AddCircuito', quadroId: m0.quadros[0].id, nome: 'C1', tensaoV: 127, secaoMm2: 10 }).model;
    const c1 = m.circuitos[0].id;
    m = applyCommand(m, { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(4000, 0), cotaAMm: 300, cotaBMm: 300, bitolaMm: 16 }).model;
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[0].id, circuitoId: c1, condutores: 3 }).model;
    const r = conferirNbr5410(m).regras.find((x) => x.codigo === '6.2.11.1.6')!;
    expect(r.avaliados).toBe(1);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/Ø16 com 3 × 10 mm²/);
    expect(r.achados[0].mensagem).toMatch(/atenderia/);
    expect(r.achados[0].ids).toEqual([m.trechos[0].id]);
    expect(r.naoAvaliado.join(' ')).toMatch(/catálogo/);
  });
});
