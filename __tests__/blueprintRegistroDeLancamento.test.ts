/**
 * O módulo puro do REGISTRO DO LANÇAMENTO (F1 do plano `2026-10-24-relancar-quando-escolha-muda.md`): ler o registro
 * de um motor, comparar as escolhas gravadas com as atuais e dizer, em português, o que mudou.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import {
  comandoDeRegistro,
  diferencasDasEscolhas,
  escolhasNormalizadas,
  registroDe,
  textoDasDiferencas,
} from '../utils/blueprintRegistroDeLancamento';

const ROTULOS = { caixasDePassagem: 'Caixas de passagem', bitolaMm: 'Bitola', encaminhamento: 'Encaminhamento' };
const VALORES = {
  caixasDePassagem: (v: unknown) => (v ? 'com caixas de passagem' : 'sem caixas de passagem'),
  bitolaMm: (v: unknown) => `bitola ${v} mm`,
};

function comQuadro(): { model: BlueprintModel; q: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: m.levels[0].id, nome: 'QD1', at: point(0, 0) }).model;
  return { model: m, q: m.quadros[0].id };
}

describe('registroDe', () => {
  it('acha pelo (motor, alvo); sem registro devolve null (planta antiga incluída)', () => {
    const { model, q } = comQuadro();
    expect(registroDe(model, 'ELETRODUTOS', q)).toBeNull();
    const semCampo = { ...model, registrosDeLancamento: undefined };
    expect(registroDe(semCampo, 'ELETRODUTOS', q)).toBeNull();
    const m = applyCommand(model, comandoDeRegistro('ELETRODUTOS', q, { caixasDePassagem: true })).model;
    expect(registroDe(m, 'ELETRODUTOS', q)).toEqual({ motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true } });
    expect(registroDe(m, 'ELETRODUTOS', null)).toBeNull();
    expect(registroDe(m, 'AGUA', q)).toBeNull();
  });
});

describe('escolhasNormalizadas / comandoDeRegistro', () => {
  it('tira undefined, troca número não finito por null, ordena as chaves', () => {
    const n = escolhasNormalizadas({ z: 1, a: undefined, m: Number.NaN, b: 'x' });
    expect(n).toEqual({ b: 'x', m: null, z: 1 });
    expect(Object.keys(n)).toEqual(['b', 'm', 'z']);
  });

  it('o comando é o RegistrarLancamento com as escolhas normalizadas', () => {
    expect(comandoDeRegistro('AGUA', null, { a: undefined, b: 2 })).toEqual({ type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null, escolhas: { b: 2 } });
  });
});

describe('diferencasDasEscolhas', () => {
  it('iguais → nenhuma diferença', () => {
    const e = { caixasDePassagem: true, bitolaMm: 25 };
    expect(diferencasDasEscolhas(e, { bitolaMm: 25, caixasDePassagem: true }, { rotulos: ROTULOS, valores: VALORES })).toEqual([]);
  });

  it('diferente → item, rótulo, antes e agora formatados', () => {
    const d = diferencasDasEscolhas({ caixasDePassagem: true, bitolaMm: 25 }, { caixasDePassagem: false, bitolaMm: 25 }, { rotulos: ROTULOS, valores: VALORES });
    expect(d).toEqual([{ item: 'caixasDePassagem', rotulo: 'Caixas de passagem', antes: 'com caixas de passagem', agora: 'sem caixas de passagem' }]);
  });

  it('registro ausente → [] (sem registro não se sabe com que se lançou)', () => {
    expect(diferencasDasEscolhas(null, { caixasDePassagem: false }, { rotulos: ROTULOS })).toEqual([]);
  });

  it('chave que só existe de um lado, com o valor PADRÃO do outro → igual', () => {
    const padroes = { caixasDePassagem: false };
    // gravado antes de a escolha existir; hoje está no padrão
    expect(diferencasDasEscolhas({ bitolaMm: 25 }, { bitolaMm: 25, caixasDePassagem: false }, { rotulos: ROTULOS, padroes })).toEqual([]);
    // gravado com o padrão; hoje a tela não manda a chave
    expect(diferencasDasEscolhas({ bitolaMm: 25, caixasDePassagem: false }, { bitolaMm: 25 }, { rotulos: ROTULOS, padroes })).toEqual([]);
    // fora do padrão, conta
    expect(diferencasDasEscolhas({ bitolaMm: 25 }, { bitolaMm: 25, caixasDePassagem: true }, { rotulos: ROTULOS, padroes })).toHaveLength(1);
  });

  it('chave de um lado só, SEM padrão declarado → diferença, com "—" do lado ausente', () => {
    const d = diferencasDasEscolhas({}, { encaminhamento: 'TETO' }, { rotulos: ROTULOS });
    expect(d).toEqual([{ item: 'encaminhamento', rotulo: 'Encaminhamento', antes: 'Encaminhamento: —', agora: 'Encaminhamento: TETO' }]);
  });

  it('chave sem rótulo não é escolha declarada pelo motor — não entra', () => {
    expect(diferencasDasEscolhas({ antiga: 1 }, { antiga: 2 }, { rotulos: ROTULOS })).toEqual([]);
  });

  it('ordem estável: a dos rótulos, não a das chaves dos objetos', () => {
    const d = diferencasDasEscolhas(
      { encaminhamento: 'PISO', bitolaMm: 20, caixasDePassagem: true },
      { caixasDePassagem: false, encaminhamento: 'TETO', bitolaMm: 25 },
      { rotulos: ROTULOS, valores: VALORES },
    );
    expect(d.map((x) => x.item)).toEqual(['caixasDePassagem', 'bitolaMm', 'encaminhamento']);
  });

  it('formatação padrão: sim/não, número em pt-BR, nulo como "—"', () => {
    const rotulos = { a: 'Pela parede', b: 'Rota máxima', c: 'Seção' };
    const d = diferencasDasEscolhas({ a: true, b: 1.5, c: null }, { a: false, b: 2.25, c: 4 }, { rotulos });
    expect(d.map((x) => [x.antes, x.agora])).toEqual([
      ['Pela parede: sim', 'Pela parede: não'],
      ['Rota máxima: 1,5', 'Rota máxima: 2,25'],
      ['Seção: —', 'Seção: 4'],
    ]);
  });
});

describe('textoDasDiferencas', () => {
  it('uma diferença', () => {
    const d = diferencasDasEscolhas({ caixasDePassagem: true }, { caixasDePassagem: false }, { rotulos: ROTULOS, valores: VALORES });
    expect(textoDasDiferencas(d)).toBe('Lançado com: com caixas de passagem · agora: sem caixas de passagem');
  });

  it('várias, separadas por "; "', () => {
    const d = diferencasDasEscolhas({ caixasDePassagem: true, bitolaMm: 20 }, { caixasDePassagem: false, bitolaMm: 25 }, { rotulos: ROTULOS, valores: VALORES });
    expect(textoDasDiferencas(d)).toBe('Lançado com: com caixas de passagem · agora: sem caixas de passagem; Lançado com: bitola 20 mm · agora: bitola 25 mm');
  });

  it('nenhuma → texto vazio', () => {
    expect(textoDasDiferencas([])).toBe('');
  });
});
