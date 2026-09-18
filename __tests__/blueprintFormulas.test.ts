/**
 * Motor de fórmulas (18/09/2026, E1.3): gramática, funções, erros com coluna,
 * variáveis nativas por família, dependência entre fórmulas e ciclo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../utils/blueprintKernel';
import {
  ErroDeFormula,
  avaliar,
  avaliarDefinicoes,
  erroDeSintaxe,
  formatarValor,
  variaveisCitadas,
  variaveisDaPeca,
} from '../utils/blueprintFormulas';

describe('avaliar', () => {
  it('aritmética com precedência, potência à direita, vírgula decimal e unário', () => {
    expect(avaliar('2 + 3 * 4', {})).toBe(14);
    expect(avaliar('(2 + 3) * 4', {})).toBe(20);
    expect(avaliar('2 ^ 3 ^ 2', {})).toBe(512);
    expect(avaliar('-2 ^ 2', {})).toBe(-4);
    expect(avaliar('0,15 * 100', {})).toBeCloseTo(15);
    expect(avaliar('7 % 3', {})).toBe(1);
  });

  it('comparações, lógica em português e em símbolos, se() e texto', () => {
    expect(avaliar('3 > 2 e 2 >= 2', {})).toBe(true);
    expect(avaliar('3 < 2 ou nao falso', {})).toBe(true);
    expect(avaliar('1 == 1 && 1 != 2', {})).toBe(true);
    expect(avaliar('se(largura >= 0,8, "acessível", "estreita")', { largura: 0.9 })).toBe('acessível');
    expect(avaliar('tipo = "porta"', { tipo: 'porta' })).toBe(true);
    expect(avaliar('"P-" + numero', { numero: 3 })).toBe('P-3');
  });

  it('funções: min, max, abs, arred, piso, teto, raiz, pot, texto, numero, vazio', () => {
    expect(avaliar('min(3, 1, 2)', {})).toBe(1);
    expect(avaliar('max(3, 1, 2)', {})).toBe(3);
    expect(avaliar('abs(-2,5)', {})).toBe(2.5);
    expect(avaliar('arred(2,345, 2)', {})).toBe(2.35);
    expect(avaliar('arred(2,5)', {})).toBe(3);
    expect(avaliar('piso(2,9) + teto(2,1)', {})).toBe(5);
    expect(avaliar('raiz(16)', {})).toBe(4);
    expect(avaliar('pot(2, 10)', {})).toBe(1024);
    expect(avaliar('texto(verdadeiro)', {})).toBe('sim');
    expect(avaliar('numero("1,5") * 2', {})).toBe(3);
    expect(avaliar('vazio("")', {})).toBe(true);
  });

  it('erros dizem o que e onde: variável desconhecida, divisão por zero, texto onde é número, sintaxe', () => {
    expect(() => avaliar('area * custo_m2', { area: 10 })).toThrow(/Variável desconhecida "custo_m2"/);
    expect(() => avaliar('1 / 0', {})).toThrow(/Divisão por zero/);
    expect(() => avaliar('"a" * 2', {})).toThrow(/precisa de número/);
    expect(() => avaliar('raiz(-1)', {})).toThrow(/negativo/);
    try {
      avaliar('2 + * 3', {});
      throw new Error('devia falhar');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroDeFormula);
      expect((e as ErroDeFormula).coluna).toBe(5);
    }
    expect(erroDeSintaxe('se(1, 2')).toMatch(/Faltou "\)"/);
    expect(erroDeSintaxe('2 + 2')).toBeNull();
    expect(erroDeSintaxe('2 + 2 3')).toMatch(/Sobrou/);
    expect(variaveisCitadas('se(area > 10, custo_m2 * area, 0)')).toEqual(['area', 'custo_m2']);
  });

  it('nunca devolve Infinity/NaN, e notação científica não é aceita (é 1 seguido de "e3")', () => {
    expect(() => avaliar('pot(10, 400)', {})).toThrow(/não é um número finito/);
    expect(() => avaliar('1e3', {})).toThrow();
    expect(avaliar('arred(2 / 3, 4)', {})).toBe(0.6667);
  });
});

describe('variaveisDaPeca', () => {
  function cena() {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let r = applyCommand(nivel.model, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 });
    const wallId = r.diff.created[0];
    r = applyBatch(r.model, [
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, 2000), point(5000, 2000)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400 },
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(500, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 },
    ]);
    let m = r.model;
    m = applyCommand(m, { type: 'SetParametros', familia: 'wall', id: wallId, valores: { custo_m2: 180 } }).model;
    return { m, wallId };
  }

  it('parede: comprimento/espessura/altura em metros, área e volume brutos, irmãs em mm, pavimento e os parâmetros gravados', () => {
    const { m } = cena();
    const v = variaveisDaPeca(m, { familia: 'wall', peca: m.walls[0] });
    expect(v).toMatchObject({ comprimento: 4, espessura: 0.15, altura: 2.8, comprimento_mm: 4000, custo_m2: 180, 'pavimento.pe_direito': 2.8, 'pavimento.nome': 'Térreo' });
    expect(v.area).toBeCloseTo(11.2);
    expect(v.volume).toBeCloseTo(1.68);
    expect(avaliar('area * custo_m2', v)).toBeCloseTo(2016);
  });

  it('abertura, pilar, viga e ponto: cada família com as suas', () => {
    const { m } = cena();
    const porta = variaveisDaPeca(m, { familia: 'opening', peca: m.openings[0] });
    expect(porta).toMatchObject({ largura: 0.9, altura: 2.1, tipo: 'porta', 'pavimento.nome': 'Térreo' });
    expect(porta.area).toBeCloseTo(1.89);
    const pilar = variaveisDaPeca(m, { familia: 'structural', peca: m.structures[0] });
    expect(pilar).toMatchObject({ largura: 0.2, profundidade: 0.4, altura: 2.8, tipo: 'pilar' });
    expect(pilar.volume).toBeCloseTo(0.224);
    const viga = variaveisDaPeca(m, { familia: 'structural', peca: m.structures[1] });
    expect(viga).toMatchObject({ comprimento: 5, tipo: 'viga', base: 2.4 });
    expect(viga.volume).toBeCloseTo(0.15 * 0.4 * 5);
    const tug = variaveisDaPeca(m, { familia: 'terminal', peca: m.terminais![0] });
    expect(tug).toMatchObject({ cota: 0.3, potencia_va: 100, disciplina: 'eletrica', tipo: 'tug' });
  });

  it('a nativa vence o parâmetro gravado de mesmo nome', () => {
    const { m, wallId } = cena();
    const x = applyCommand(m, { type: 'SetParametros', familia: 'wall', id: wallId, valores: { area: 999 } }).model;
    expect(variaveisDaPeca(x, { familia: 'wall', peca: x.walls[0] }).area).toBeCloseTo(11.2);
  });
});

describe('avaliarDefinicoes', () => {
  it('resolve em ordem de dependência (fórmula citando fórmula), acusa ciclo nas duas pontas e erro por definição', () => {
    const vars = { area: 10, custo_m2: 200 };
    const r = avaliarDefinicoes(
      [
        { chave: 'custo_com_bdi', formula: 'custo * (1 + bdi)' },
        { chave: 'custo', formula: 'area * custo_m2' },
        { chave: 'bdi', formula: '0,25' },
        { chave: 'digitado', formula: '' },
        { chave: 'quebrada', formula: 'area / zero' },
        { chave: 'a', formula: 'b + 1' },
        { chave: 'b', formula: 'a + 1' },
      ],
      vars,
    );
    const por = Object.fromEntries(r.map((x) => [x.chave, x]));
    expect(por.custo).toMatchObject({ valor: 2000, erro: null });
    expect(por.bdi).toMatchObject({ valor: 0.25 });
    expect(por.custo_com_bdi).toMatchObject({ valor: 2500, erro: null });
    expect(por.quebrada.erro).toMatch(/Variável desconhecida "zero"/);
    expect(por.a.erro).toMatch(/ciclo/);
    expect(por.b.erro).toMatch(/ciclo/);
    expect(por.digitado).toBeUndefined(); // sem fórmula, não entra
    expect(formatarValor(2500)).toBe('2500');
    expect(formatarValor(0.123456)).toBe('0,1235');
    expect(formatarValor(true)).toBe('sim');
  });
});
