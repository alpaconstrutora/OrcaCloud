/**
 * CLIMATIZAÇÃO E0.1/E0.2 (04/10/2026): o leitor da coluna `hipoteses` de
 * `blueprint_study_climatizacao` — JSON parcial vira premissa completa, e nada
 * de tipo errado ou fora da faixa passa — e as condições externas em vigor
 * (o declarado vence; o resto é derivado e diz de onde veio).
 */
import { describe, expect, it } from 'vitest';
import {
  CLIMA_POR_CIDADE,
  DISTANCIA_MAXIMA_DA_CAPITAL_KM,
  HIPOTESES_CLIMATIZACAO_PADRAO,
  LIMITES_DE_CONFORTO,
  capitalMaisProxima,
  cidadeDaTabela,
  condicoesExternas,
  hipotesesClimatizacaoDaColuna,
  insolacaoDoNavegador,
} from '../utils/blueprintClimatizacao';
import { INTENSIDADE_POR_CIDADE } from '../utils/blueprintPluvial';

describe('premissas gravadas', () => {
  it('coluna vazia = padrão', () => {
    expect(hipotesesClimatizacaoDaColuna(null)).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    expect(hipotesesClimatizacaoDaColuna({})).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    expect(hipotesesClimatizacaoDaColuna('lixo')).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
  });

  it('valor declarado dentro da faixa vence; parcial é completado', () => {
    const h = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: 22 }, clima: { cidade: 'São Paulo', tbsExternaC: 33 } });
    expect(h.conforto).toEqual({ temperaturaInternaC: 22, umidadeRelativaPct: HIPOTESES_CLIMATIZACAO_PADRAO.conforto.umidadeRelativaPct });
    expect(h.clima).toEqual({ cidade: 'São Paulo', tbsExternaC: 33, tbuExternaC: null, altitudeM: null });
    expect(h.insolacao).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO.insolacao);
  });

  it('tipo errado e fora da faixa viram o padrão — nunca passam', () => {
    const h = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: 'quente', umidadeRelativaPct: 95 }, clima: { cidade: '  ', tbsExternaC: 80, altitudeM: 'alto' } });
    expect(h).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    const fria = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: LIMITES_DE_CONFORTO.temperaturaInternaC.min - 1 } });
    expect(fria.conforto.temperaturaInternaC).toBe(HIPOTESES_CLIMATIZACAO_PADRAO.conforto.temperaturaInternaC);
    expect(hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: Number.NaN } })).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
  });

  it('os limites aceitam as pontas', () => {
    const { min, max } = LIMITES_DE_CONFORTO.umidadeRelativaPct;
    expect(hipotesesClimatizacaoDaColuna({ conforto: { umidadeRelativaPct: min } }).conforto.umidadeRelativaPct).toBe(min);
    expect(hipotesesClimatizacaoDaColuna({ conforto: { umidadeRelativaPct: max } }).conforto.umidadeRelativaPct).toBe(max);
  });

  it('insolação: data ISO válida, hora 0–24, latitude −90..90; o resto vira o padrão', () => {
    const ok = hipotesesClimatizacaoDaColuna({ insolacao: { data: '2026-12-21', horaSolar: 15, latitudeManual: -23.5, solNo3d: false } }).insolacao;
    expect(ok).toEqual({ data: '2026-12-21', horaSolar: 15, latitudeManual: -23.5, solNo3d: false });
    const ruim = hipotesesClimatizacaoDaColuna({ insolacao: { data: '21/12/2026', horaSolar: 30, latitudeManual: 200, solNo3d: 'sim' } }).insolacao;
    expect(ruim).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO.insolacao);
    expect(hipotesesClimatizacaoDaColuna({ insolacao: { data: 'não é data' } }).insolacao.data).toBe(HIPOTESES_CLIMATIZACAO_PADRAO.insolacao.data);
  });

  it('a chave antiga do navegador é lida pelo mesmo leitor (vizinhos ficam de fora); sem chave ou com lixo = null', () => {
    const chave = JSON.stringify({ data: '2026-06-21', horaSolar: 9, latitudeManual: -23.5, vizinhos: [{ id: 'velho' }], solNo3d: true });
    expect(insolacaoDoNavegador(() => chave)).toEqual({ data: '2026-06-21', horaSolar: 9, latitudeManual: -23.5, solNo3d: true });
    expect(insolacaoDoNavegador(() => null)).toBeNull();
    expect(insolacaoDoNavegador(() => '{lixo')).toBeNull();
    expect(
      insolacaoDoNavegador(() => {
        throw new Error('sem storage');
      }),
    ).toBeNull();
  });
});

describe('tabela de clima', () => {
  it('tem as mesmas cidades da tabela de chuvas do pluvial — o estudo escolhe UMA cidade', () => {
    expect(Object.keys(CLIMA_POR_CIDADE).sort()).toEqual(Object.keys(INTENSIDADE_POR_CIDADE).sort());
  });

  it('TBU nunca passa de TBS, e todos os números são finitos', () => {
    for (const [nome, c] of Object.entries(CLIMA_POR_CIDADE)) {
      expect(c.tbuC, nome).toBeLessThan(c.tbsC);
      for (const v of Object.values(c)) expect(Number.isFinite(v), `${nome}`).toBe(true);
    }
  });

  it('casa o nome sem acento e sem caixa; acha a capital mais próxima', () => {
    expect(cidadeDaTabela('belo horizonte')).toBe('Belo Horizonte');
    expect(cidadeDaTabela('SAO PAULO')).toBe('São Paulo');
    expect(cidadeDaTabela('Uberlândia')).toBeNull();
    expect(capitalMaisProxima({ latitude: -19.9, longitude: -43.9 })).toMatchObject({ cidade: 'Belo Horizonte' });
    expect(capitalMaisProxima({ latitude: -19.9, longitude: -43.9 })!.distanciaKm).toBeLessThan(10);
  });
});

describe('condições externas em vigor', () => {
  const geoBH = { latitude: -19.9, longitude: -43.95, elevacaoM: 900 };

  it('nada declarado, sem contexto nem georreferência: tudo sem valor e a pendência diz o que falta', () => {
    const c = condicoesExternas(HIPOTESES_CLIMATIZACAO_PADRAO.clima);
    expect(c.cidade).toMatchObject({ valor: null, origem: 'SEM' });
    expect(c.tbsC).toEqual({ valor: null, origem: 'SEM' });
    expect(c.conferir).toBe(false);
    expect(c.pendencias.join(' ')).toMatch(/escolha a cidade ou declare TBS e TBU/);
  });

  it('a cidade do contexto urbanístico serve quando está na tabela; fora dela, a pendência pede TBS/TBU', () => {
    const naTabela = condicoesExternas(HIPOTESES_CLIMATIZACAO_PADRAO.clima, { cidadeDoContexto: 'belo horizonte' });
    expect(naTabela.cidade).toMatchObject({ valor: 'Belo Horizonte', origem: 'CONTEXTO', naTabela: true });
    expect(naTabela.tbsC).toEqual({ valor: CLIMA_POR_CIDADE['Belo Horizonte'].tbsC, origem: 'TABELA' });
    expect(naTabela.altitudeM).toEqual({ valor: 850, origem: 'TABELA' });
    expect(naTabela.conferir).toBe(true);
    expect(naTabela.pendencias).toEqual([]);

    const fora = condicoesExternas(HIPOTESES_CLIMATIZACAO_PADRAO.clima, { cidadeDoContexto: 'Uberlândia' });
    expect(fora.cidade).toMatchObject({ valor: 'Uberlândia', origem: 'CONTEXTO', naTabela: false });
    expect(fora.tbsC.valor).toBeNull();
    expect(fora.pendencias.join(' ')).toMatch(/"Uberlândia" não está na tabela/);
  });

  it('com georreferência: a capital mais próxima, a altitude da georreferência e a latitude dela', () => {
    const c = condicoesExternas(HIPOTESES_CLIMATIZACAO_PADRAO.clima, { georreferencia: geoBH });
    expect(c.cidade).toMatchObject({ valor: 'Belo Horizonte', origem: 'MAIS_PROXIMA' });
    expect(c.cidade.distanciaKm).toBeLessThan(10);
    expect(c.altitudeM).toEqual({ valor: 900, origem: 'GEORREFERENCIA' });
    expect(c.latitude).toEqual({ valor: -19.9, origem: 'GEORREFERENCIA' });
    expect(c.pendencias).toEqual([]);
  });

  it('longe de qualquer capital a tabela orienta, mas a pendência avisa a distância', () => {
    // Meio do Mato Grosso do Sul — nenhuma capital da tabela em 300 km.
    const c = condicoesExternas(HIPOTESES_CLIMATIZACAO_PADRAO.clima, { georreferencia: { latitude: -20.5, longitude: -54.6 } });
    expect(c.cidade.origem).toBe('MAIS_PROXIMA');
    expect(c.cidade.distanciaKm).toBeGreaterThan(DISTANCIA_MAXIMA_DA_CAPITAL_KM);
    expect(c.pendencias.join(' ')).toMatch(/está a \d+ km — declare a cidade/);
  });

  it('o declarado vence tudo: cidade sobre o contexto, TBS/TBU/altitude sobre a tabela e a georreferência', () => {
    const c = condicoesExternas({ cidade: 'Curitiba', tbsExternaC: 29, tbuExternaC: 20, altitudeM: 1000 }, { georreferencia: geoBH, cidadeDoContexto: 'Belo Horizonte' });
    expect(c.cidade).toMatchObject({ valor: 'Curitiba', origem: 'DECLARADA', naTabela: true });
    expect(c.tbsC).toEqual({ valor: 29, origem: 'DECLARADA' });
    expect(c.tbuC).toEqual({ valor: 20, origem: 'DECLARADA' });
    expect(c.altitudeM).toEqual({ valor: 1000, origem: 'DECLARADA' });
    expect(c.conferir).toBe(false);
  });

  it('TBU declarada acima da TBS é pendência, não erro silencioso', () => {
    const c = condicoesExternas({ cidade: 'São Paulo', tbsExternaC: null, tbuExternaC: 33, altitudeM: null });
    expect(c.pendencias.join(' ')).toMatch(/TBU maior que TBS/);
  });
});
