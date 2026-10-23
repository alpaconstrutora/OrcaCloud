import { describe, it, expect } from 'vitest';
import {
  ITENS_ELETRICOS,
  chaveDoItem,
  type ItemEletrico,
} from '../utils/preferencias/catalogo';
import {
  EXIBICAO_ELETRICA_PADRAO,
  comDependenciasAplicadas,
  exibicaoEletricaDaTela,
  exibicaoEletricaDaPrancha,
  origemDoValor,
  type LinhaDePreferencia,
} from '../utils/preferencias/resolver';

const linha = (
  escopo: LinhaDePreferencia['escopo'],
  alvo: 'tela' | 'prancha',
  item: ItemEletrico,
  valor: unknown,
): LinhaDePreferencia => ({ escopo, chave: chaveDoItem(alvo, item), valor });

describe('catálogo da planta elétrica', () => {
  it('tem 9 itens, sem repetição, todos com padrão ligado', () => {
    const itens = ITENS_ELETRICOS.map((i) => i.item);
    expect(itens).toHaveLength(9);
    expect(new Set(itens).size).toBe(9);
    expect(ITENS_ELETRICOS.every((i) => i.padrao === true)).toBe(true);
  });

  it('segue a ordem da tela e traz rótulo e explicação em todos', () => {
    expect(ITENS_ELETRICOS.map((i) => i.item)).toEqual([
      'fios', 'circuitoNosFios', 'bitola', 'diametro', 'circuitoNoPonto',
      'potencia', 'comando', 'instrucaoSugerida', 'condutoresDoTrecho',
    ]);
    for (const i of ITENS_ELETRICOS) {
      expect(i.rotulo.length).toBeGreaterThan(0);
      expect(i.explicacao.length).toBeGreaterThan(0);
    }
  });

  it('declara as dependências de "fios" e os itens que a prancha não escreve', () => {
    const dependentes = ITENS_ELETRICOS.filter((i) => i.dependeDe === 'fios').map((i) => i.item);
    expect(dependentes).toEqual(['circuitoNosFios', 'bitola', 'condutoresDoTrecho']);
    const soNaTela = ITENS_ELETRICOS.filter((i) => !i.naPrancha).map((i) => i.item);
    expect(soNaTela).toEqual(['instrucaoSugerida', 'condutoresDoTrecho']);
  });

  it('monta a chave planta.eletrica.<alvo>.<item>', () => {
    expect(chaveDoItem('tela', 'fios')).toBe('planta.eletrica.tela.fios');
    expect(chaveDoItem('prancha', 'bitola')).toBe('planta.eletrica.prancha.bitola');
  });
});

describe('exibicaoEletricaDaTela / DaPrancha', () => {
  it('sem linhas: tela é o padrão; prancha desliga o que ela não escreve', () => {
    expect(exibicaoEletricaDaTela([])).toEqual(EXIBICAO_ELETRICA_PADRAO);
    expect(Object.values(EXIBICAO_ELETRICA_PADRAO).every((v) => v === true)).toBe(true);
    expect(exibicaoEletricaDaPrancha([])).toEqual({
      ...EXIBICAO_ELETRICA_PADRAO,
      instrucaoSugerida: false,
      condutoresDoTrecho: false,
    });
  });

  it('a preferência da tela não vaza para a prancha', () => {
    const linhas = [linha('USUARIO', 'tela', 'potencia', false)];
    expect(exibicaoEletricaDaTela(linhas).potencia).toBe(false);
    expect(exibicaoEletricaDaPrancha(linhas).potencia).toBe(true);
  });

  it('a tela só considera o USUARIO', () => {
    const linhas = [
      linha('ORGANIZACAO', 'tela', 'potencia', false),
      linha('ESTUDO', 'tela', 'comando', false),
    ];
    expect(exibicaoEletricaDaTela(linhas)).toEqual(EXIBICAO_ELETRICA_PADRAO);
  });

  it('prancha: ESTUDO vence ORGANIZACAO; só ORGANIZACAO vale; USUARIO não entra', () => {
    const org = linha('ORGANIZACAO', 'prancha', 'bitola', false);
    const estudo = linha('ESTUDO', 'prancha', 'bitola', true);
    expect(exibicaoEletricaDaPrancha([org, estudo]).bitola).toBe(true);
    expect(exibicaoEletricaDaPrancha([estudo, org]).bitola).toBe(true);
    expect(exibicaoEletricaDaPrancha([org]).bitola).toBe(false);
    expect(exibicaoEletricaDaPrancha([linha('USUARIO', 'prancha', 'bitola', false)]).bitola).toBe(true);
  });

  it('fios desligado leva circuitoNosFios, bitola e condutoresDoTrecho junto (tela e prancha)', () => {
    const tela = exibicaoEletricaDaTela([
      linha('USUARIO', 'tela', 'fios', false),
      linha('USUARIO', 'tela', 'circuitoNosFios', true),
    ]);
    expect(tela.fios).toBe(false);
    expect(tela.circuitoNosFios).toBe(false);
    expect(tela.bitola).toBe(false);
    expect(tela.condutoresDoTrecho).toBe(false);
    expect(tela.diametro).toBe(true);

    const prancha = exibicaoEletricaDaPrancha([
      linha('ORGANIZACAO', 'prancha', 'fios', false),
      linha('ESTUDO', 'prancha', 'circuitoNosFios', true),
    ]);
    expect(prancha.circuitoNosFios).toBe(false);
    expect(prancha.bitola).toBe(false);
  });

  it('valor que não é booleano ou chave fora do catálogo: ignorado, sem lançar', () => {
    const linhas: LinhaDePreferencia[] = [
      { escopo: 'USUARIO', chave: chaveDoItem('tela', 'potencia'), valor: 'sim' },
      { escopo: 'USUARIO', chave: 'planta.eletrica.tela.xyz', valor: false },
      { escopo: 'USUARIO', chave: chaveDoItem('tela', 'comando'), valor: null },
      { escopo: 'USUARIO', chave: chaveDoItem('tela', 'bitola'), valor: 0 },
    ];
    expect(() => exibicaoEletricaDaTela(linhas)).not.toThrow();
    expect(exibicaoEletricaDaTela(linhas)).toEqual(EXIBICAO_ELETRICA_PADRAO);
  });

  it('linha inválida do ESTUDO não esconde a válida da ORGANIZACAO', () => {
    const linhas: LinhaDePreferencia[] = [
      { escopo: 'ESTUDO', chave: chaveDoItem('prancha', 'bitola'), valor: 'talvez' },
      linha('ORGANIZACAO', 'prancha', 'bitola', false),
    ];
    expect(exibicaoEletricaDaPrancha(linhas).bitola).toBe(false);
  });
});

describe('origemDoValor', () => {
  it('PADRAO sem linhas', () => {
    expect(origemDoValor([], 'tela', 'fios')).toBe('PADRAO');
    expect(origemDoValor([], 'prancha', 'fios')).toBe('PADRAO');
  });

  it('ESTUDO quando há linha de estudo (prancha)', () => {
    const linhas = [
      linha('ORGANIZACAO', 'prancha', 'bitola', false),
      linha('ESTUDO', 'prancha', 'bitola', true),
    ];
    expect(origemDoValor(linhas, 'prancha', 'bitola')).toBe('ESTUDO');
  });

  it('ORGANIZACAO quando só há linha da organização (prancha)', () => {
    expect(origemDoValor([linha('ORGANIZACAO', 'prancha', 'bitola', false)], 'prancha', 'bitola')).toBe('ORGANIZACAO');
  });

  it('tela só olha USUARIO', () => {
    expect(origemDoValor([linha('USUARIO', 'tela', 'potencia', false)], 'tela', 'potencia')).toBe('USUARIO');
    expect(origemDoValor([linha('ORGANIZACAO', 'tela', 'potencia', false)], 'tela', 'potencia')).toBe('PADRAO');
  });

  it('ignora linhas inválidas e de outro alvo/item', () => {
    const linhas: LinhaDePreferencia[] = [
      { escopo: 'ESTUDO', chave: chaveDoItem('prancha', 'bitola'), valor: 'sim' },
      linha('ESTUDO', 'prancha', 'potencia', true),
      linha('ESTUDO', 'tela', 'bitola', true),
    ];
    expect(origemDoValor(linhas, 'prancha', 'bitola')).toBe('PADRAO');
  });

  it('⚠️ nunca lança: lista que não é array (undefined, null, objeto) vale como vazia', () => {
    for (const ruim of [undefined, null, {}, 'x', 42]) {
      const linhas = ruim as unknown as LinhaDePreferencia[];
      expect(() => exibicaoEletricaDaTela(linhas)).not.toThrow();
      expect(() => exibicaoEletricaDaPrancha(linhas)).not.toThrow();
      expect(() => origemDoValor(linhas, 'prancha', 'bitola')).not.toThrow();
      expect(exibicaoEletricaDaTela(linhas)).toEqual(EXIBICAO_ELETRICA_PADRAO);
      expect(exibicaoEletricaDaPrancha(linhas)).toEqual(exibicaoEletricaDaPrancha([]));
      expect(origemDoValor(linhas, 'tela', 'fios')).toBe('PADRAO');
    }
  });
});

describe('comDependenciasAplicadas (objeto "cru" no desenho)', () => {
  it('fios desligado leva circuito nos fios, bitola e condutores do trecho; o resto fica', () => {
    const cru = { ...EXIBICAO_ELETRICA_PADRAO, fios: false };
    const efetivo = comDependenciasAplicadas(cru);
    expect(efetivo).toMatchObject({ fios: false, circuitoNosFios: false, bitola: false, condutoresDoTrecho: false });
    expect(efetivo).toMatchObject({ diametro: true, circuitoNoPonto: true, potencia: true, comando: true, instrucaoSugerida: true });
  });
  it('já coerente (padrão ou vindo do resolvedor): devolve o MESMO objeto', () => {
    expect(comDependenciasAplicadas(EXIBICAO_ELETRICA_PADRAO)).toBe(EXIBICAO_ELETRICA_PADRAO);
    const doResolvedor = exibicaoEletricaDaTela([linha('USUARIO', 'tela', 'fios', false)]);
    expect(comDependenciasAplicadas(doResolvedor)).toBe(doResolvedor);
  });
});
