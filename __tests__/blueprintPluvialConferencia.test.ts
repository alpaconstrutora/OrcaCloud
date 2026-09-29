/**
 * E6.4 — A CONFERÊNCIA NBR 10844 E OS MEMORIAIS (29/09/2026): redes
 * independentes (a pluvial não encosta no esgoto), o grupo NBR 10844 da
 * emissão, a seção de águas pluviais nos dois memoriais e o nome da calha no
 * quantitativo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { nomeDaCalha, planejarCalhas } from '../utils/blueprintCalhas';
import { planejarCondutores } from '../utils/blueprintCondutoresPluviais';
import { HIPOTESES_PLUVIAIS_PADRAO, misturasPluvialEsgoto } from '../utils/blueprintPluvial';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro, memorialDescritivoHidro, type BlocoDoMemorial } from '../utils/blueprintMemorialHidro';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
const CTX = { nomeDoEstudo: 'Casa', geradoEm: '2026-09-29T12:00:00Z' };
const hip = HIPOTESES_PLUVIAIS_PADRAO;

/** Casa térrea 10 × 8 m, duas águas, caixa de areia e saída; calhas e (opcional) condutores lançados. */
const casa = (opcoes: { condutores?: boolean; saida?: boolean } = {}): BlueprintModel => {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddAgua', levelId: l, pontos: [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    { type: 'AddAgua', levelId: l, pontos: [point(0, 4000), point(10000, 4000), point(10000, 8000), point(0, 8000)], beiralIndex: 2, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'CA', at: point(-1000, 4000), cotaMm: -600, tipoHidraulico: 'CAIXA_AREIA' },
    ...(opcoes.saida === false ? [] : [{ type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'Saída', at: point(-1000, 12000), cotaMm: -800, tipoHidraulico: 'LIGACAO_PLUVIAL' }]),
  ] as never).model;
  m = applyBatch(m, planejarCalhas(m, hip).comandos).model;
  if (opcoes.condutores !== false) m = applyBatch(m, planejarCondutores(m, hip).comandos).model;
  return m;
};
const doGrupo = (m: BlueprintModel) => verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.filter((v) => v.grupo === 'NBR10844');
const textos = (b: BlocoDoMemorial[]) => b.map((x) => ('texto' in x ? x.texto : 'cabecalho' in x ? x.cabecalho.join('|') + '\n' + x.linhas.map((l) => l.join('|')).join('\n') : ''));

describe('E6.4 — redes independentes', () => {
  it('a casa lançada: nenhum encontro entre pluvial e esgoto', () => {
    expect(misturasPluvialEsgoto(casa())).toEqual([]);
  });

  it('o condutor pluvial que termina na caixa de inspeção e o tubo de esgoto que entra na caixa de areia: dois encontros, marca de erro', () => {
    const m0 = casa();
    const l = m0.levels[0].id;
    const m = applyBatch(m0, [
      { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'CI', at: point(12000, 4000), cotaMm: -700, tipoHidraulico: 'CAIXA_INSPECAO' },
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(10000, 4000), b: point(12000, 4000), cotaAMm: -300, cotaBMm: -400, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: l, disciplina: 'ESGOTO', a: point(-3000, 4000), b: point(-1000, 4000), cotaAMm: -200, cotaBMm: -300, bitolaMm: 100 },
    ] as Command[]).model;
    const x = misturasPluvialEsgoto(m);
    expect(x.map((y) => y.com)).toEqual(['CAIXA', 'CAIXA']);
    const marcas = marcasDeVerificacao(m, null, [], hip).filter((y) => y.tipo === 'PLUVIAL_NO_ESGOTO');
    expect(marcas.map((y) => y.texto).sort()).toEqual(['esgoto ligado à pluvial', 'pluvial ligada ao esgoto']);
    expect(doGrupo(m).find((v) => v.item === 'Rede pluvial independente do esgoto')).toMatchObject({ atende: false, obtido: '2 encontro(s)' });
  });

  it('um tubo pluvial e um de esgoto no MESMO nó: encontro de trecho', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m0.levels[0].id;
    const m = applyBatch(m0, [
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(0, 0), b: point(2000, 0), cotaAMm: -300, cotaBMm: -320, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: l, disciplina: 'ESGOTO', a: point(2000, 0), b: point(4000, 0), cotaAMm: -320, cotaBMm: -360, bitolaMm: 100 },
    ] as Command[]).model;
    expect(misturasPluvialEsgoto(m).map((y) => y.com)).toEqual(['TRECHO', 'TRECHO']);
  });
});

describe('E6.4 — a conferência NBR 10844', () => {
  it('calhas e condutores lançados até a saída: o grupo inteiro atende', () => {
    const g = doGrupo(casa());
    expect(g.map((v) => v.item)).toEqual([
      'Intensidade pluviométrica definida',
      'Calhas: capacidade e declividade',
      'Condutores: capacidade, DN e declividade',
      'Todo bocal e ralo pluvial com condutor',
      'A água chega à saída (sarjeta ou galeria)',
      'Rede pluvial independente do esgoto',
    ]);
    expect(g.every((v) => v.atende)).toBe(true);
  });

  it('só as calhas: os bocais sem condutor e a água que não chega à saída são pendências', () => {
    const g = doGrupo(casa({ condutores: false }));
    expect(g.find((v) => v.item === 'Todo bocal e ralo pluvial com condutor')).toMatchObject({ atende: false, obtido: '2 sem condutor' });
    expect(g.find((v) => v.item === 'A água chega à saída (sarjeta ou galeria)')).toMatchObject({ atende: false });
  });

  it('sem rede pluvial no desenho, o grupo não aparece', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(doGrupo(m)).toEqual([]);
  });
});

describe('E6.4 — os memoriais', () => {
  it('cálculo: a seção de águas pluviais com a intensidade, as áreas, as calhas e os condutores', () => {
    const t = textos(memorialDeCalculoHidro(casa(), HIPOTESES_HIDRO_PADRAO, CTX));
    const i = t.indexOf('Águas pluviais');
    expect(i).toBeGreaterThan(0);
    const depois = t.slice(i).join('\n');
    expect(depois).toMatch(/Intensidade pluviométrica de projeto: 150 mm\/h \(NBR 10844, 5\.1\.4/);
    for (const s of ['Áreas de contribuição', 'Calhas', 'Condutores', 'Meia-cana ø100', 'Wyly–Eaton']) expect(depois).toContain(s);
  });

  it('descritivo: a norma, o sistema, a calha nos materiais e o ensaio', () => {
    const t = textos(memorialDescritivoHidro(casa(), HIPOTESES_HIDRO_PADRAO, CTX)).join('\n');
    expect(t).toContain('ABNT NBR 10844:1989|Instalações prediais de águas pluviais');
    expect(t).toMatch(/A rede pluvial é independente da de esgoto sanitário/);
    expect(t).toContain('Águas pluviais — calha meia-cana|100');
    expect(t).toContain('Águas pluviais — PVC série R (NBR 5688)');
    expect(t).toMatch(/Nenhuma ligação entre a rede pluvial e a de esgoto/);
  });
});

describe('E6.4 — a calha no quantitativo', () => {
  it('a linha de compra pelo nome da seção', () => {
    expect(nomeDaCalha('SEMICIRCULAR', 150)).toBe('Calha meia-cana ø150');
    expect(nomeDaCalha('RETANGULAR', 200)).toBe('Calha retangular 200 mm de largura');
  });
});
