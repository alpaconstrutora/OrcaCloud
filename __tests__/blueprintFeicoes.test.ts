/**
 * FEIÇÕES DE LEVANTAMENTO (A2).
 *
 * O que se protege:
 *  - o código do caderno de campo vira feição ("CE1" cerca, "PO" poste) e a
 *    LINHA DE QUEBRA continua sendo só LQ/BL/BRK — uma cerca nunca vira breakline;
 *  - a importação preserva nome, código e descrição (antes eram descartados);
 *  - exportar e reimportar 500 pontos devolve os MESMOS nomes, códigos e descrições;
 *  - duplicados por posição e por nome; pontuar e interpolar; KML e DXF por camada.
 */
import { describe, expect, it } from 'vitest';
import {
  contarFeicoes,
  csvDoLevantamento,
  duplicados,
  interpolarSobreLinha,
  kmlDoLevantamento,
  lerCodigo,
  linhasDasFeicoes,
  pontuarPolilinha,
  semDuplicadosDePosicao,
  type PontoDeLevantamento,
} from '../utils/blueprintFeicoes';
import { importarPontos } from '../utils/blueprintTopografiaImportacao';
import { gerarDxfDaTopografia } from '../utils/blueprintDxf';

describe('lerCodigo', () => {
  it('prefixo + sequência, sem acento nem caixa', () => {
    expect(lerCodigo('CE1')).toEqual({ feicao: 'CERCA', sequencia: '1' });
    expect(lerCodigo('cerca 2')).toEqual({ feicao: 'CERCA', sequencia: '2' });
    expect(lerCodigo('MU')).toEqual({ feicao: 'MURO', sequencia: null });
    expect(lerCodigo('árvore')).toEqual({ feicao: 'ARVORE', sequencia: null });
    expect(lerCodigo('PO luz')).toEqual({ feicao: 'POSTE', sequencia: null });
    expect(lerCodigo('MF-3')).toEqual({ feicao: 'MEIO_FIO', sequencia: '3' });
  });

  it('LQ/BL/BRK é linha de quebra, não feição; código desconhecido não casa', () => {
    expect(lerCodigo('LQ1').feicao).toBeNull();
    expect(lerCodigo('BRK 2').feicao).toBeNull();
    expect(lerCodigo('XYZ').feicao).toBeNull();
    expect(lerCodigo('').feicao).toBeNull();
    expect(lerCodigo(undefined).feicao).toBeNull();
  });
});

describe('linhas das feições', () => {
  const p = (x: number, codigo?: string): PontoDeLevantamento => ({ x, y: 0, cotaM: 100, codigo });

  it('com sequência junta pelo número mesmo intercalado; sem sequência, corrida consecutiva', () => {
    const pontos = [p(0, 'CE1'), p(1000, 'CE2'), p(2000, 'CE1'), p(3000, 'CE2'), p(4000, 'MU'), p(5000, 'MU'), p(6000, 'PO'), p(7000, 'MU'), p(8000, 'MU')];
    const linhas = linhasDasFeicoes(pontos);
    expect(linhas.map((l) => [l.chave, l.indices])).toEqual([
      ['CERCA#1', [0, 2]],
      ['CERCA#2', [1, 3]],
      ['MURO@4', [4, 5]],
      ['MURO@7', [7, 8]],
    ]);
  });

  it('ponto de feição PONTUAL não faz linha; linha de um ponto só não é linha', () => {
    expect(linhasDasFeicoes([p(0, 'PO'), p(1, 'PO')])).toEqual([]);
    expect(linhasDasFeicoes([p(0, 'CE1')])).toEqual([]);
  });

  it('contagem por feição, códigos desconhecidos e sem código', () => {
    const c = contarFeicoes([p(0, 'CE1'), p(1, 'PO'), p(2, 'XY'), p(3, 'ZZ 9'), p(4), p(5, 'LQ1')]);
    expect(c.porFeicao).toEqual({ CERCA: 1, POSTE: 1 });
    expect(c.semFeicao).toBe(2);
    expect(c.codigosDesconhecidos).toEqual(['XY', 'ZZ']);
    expect(c.semCodigo).toBe(1);
  });
});

describe('importação: nome, código e descrição sobrevivem; cerca não é breakline', () => {
  const ctx = { anel: null, georreferencia: null };
  const csv = [
    'P1,1000.000,1000.000,100.00,CE1 cerca de arame',
    'P2,1010.000,1000.000,100.10,CE1',
    'P3,1020.000,1000.000,100.20,CE1',
    'P4,1000.000,1010.000,100.50,LQ1',
    'P5,1010.000,1010.000,100.60,LQ1',
    'P6,1015.000,1005.000,100.30,PO luz',
  ].join('\n');

  it('PNEZD sem cabeçalho: D é o código, o resto é descrição', () => {
    const r = importarPontos(csv, 'TEXTO', ctx, { ancoragem: 'DIRETO', unidade: 'M' });
    expect(r.pontos.map((q) => [q.nome, q.codigo, q.descricao])).toEqual([
      ['P1', 'CE1', 'cerca de arame'],
      ['P2', 'CE1', undefined],
      ['P3', 'CE1', undefined],
      ['P4', 'LQ1', undefined],
      ['P5', 'LQ1', undefined],
      ['P6', 'PO', 'luz'],
    ]);
    // A linha de quebra é SÓ a LQ1; a cerca fica como feição.
    expect(r.linhasDeQuebra).toHaveLength(1);
    expect(r.linhasDeQuebra[0].pontos).toHaveLength(2);
    const linhas = linhasDasFeicoes(r.pontos);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].feicao).toBe('CERCA');
    expect(linhas[0].pontos).toHaveLength(3);
  });

  it('500 pontos: exportar e reimportar devolve os MESMOS nomes, códigos, descrições e coordenadas', () => {
    const codigos = ['CE1', 'CE2', 'MU', 'MF1', 'PO', 'AR', 'ED3', ''];
    const originais: PontoDeLevantamento[] = Array.from({ length: 500 }, (_, i) => ({
      x: 1000 * (i % 25) + 137,
      y: 1000 * Math.floor(i / 25) + 91,
      cotaM: Math.round((100 + Math.sin(i) * 2) * 1000) / 1000,
      nome: `P${i + 1}`,
      ...(codigos[i % codigos.length] ? { codigo: codigos[i % codigos.length] } : {}),
      ...(i % 7 === 0 ? { descricao: `obs ${i}` } : {}),
    }));
    const csv500 = csvDoLevantamento(originais);
    expect(csv500.split('\n')[0]).toBe('ponto;norte;este;cota;codigo;descricao');
    const r = importarPontos(csv500, 'TEXTO', { anel: null, georreferencia: null }, { ancoragem: 'DIRETO', unidade: 'M' });
    expect(r.pontos).toHaveLength(500);
    r.pontos.forEach((q, i) => {
      const o = originais[i];
      expect(q.nome).toBe(o.nome);
      expect(q.codigo || undefined).toBe(o.codigo);
      expect(q.descricao).toBe(o.descricao);
      expect(q.x).toBeCloseTo(o.x, 0);
      expect(q.y).toBeCloseTo(o.y, 0);
      expect(q.cotaM).toBeCloseTo(o.cotaM, 6);
    });
    expect(r.linhasDeQuebra).toEqual([]);
    expect(linhasDasFeicoes(r.pontos).map((l) => l.chave)).toEqual(linhasDasFeicoes(originais).map((l) => l.chave));
  });
});

describe('duplicados', () => {
  it('por posição (≤ 1 cm) e por nome em posições diferentes; remover tira só os de posição', () => {
    const pontos: PontoDeLevantamento[] = [
      { x: 0, y: 0, cotaM: 1, nome: 'A' },
      { x: 5, y: 5, cotaM: 1, nome: 'B' },
      { x: 5000, y: 0, cotaM: 1, nome: 'A' },
      { x: 9000, y: 0, cotaM: 1, nome: 'C' },
    ];
    expect(duplicados(pontos)).toEqual([
      { primeiro: 0, repetido: 1, motivo: 'POSICAO' },
      { primeiro: 0, repetido: 2, motivo: 'NOME' },
    ]);
    expect(semDuplicadosDePosicao(pontos).map((p) => p.nome)).toEqual(['A', 'A', 'C']);
  });
});

describe('pontuar e interpolar', () => {
  it('pontuar: vértices + um a cada passo, cota da superfície; onde a superfície não tem cota, não nasce', () => {
    const r = pontuarPolilinha([{ x: 0, y: 0 }, { x: 10_000, y: 0 }], 2500, (p) => (p.x > 8000 ? null : 100 + p.x / 10_000), 'PP');
    expect(r.map((p) => p.x)).toEqual([0, 2500, 5000, 7500]);
    expect(r[1].cotaM).toBeCloseTo(100.25, 6);
    expect(r.map((p) => p.nome)).toEqual(['PP1', 'PP2', 'PP3', 'PP4']);
  });

  it('interpolar: só os NOVOS, com cota em rampa entre os vértices', () => {
    const r = interpolarSobreLinha([{ x: 0, y: 0, cotaM: 100 }, { x: 10_000, y: 0, cotaM: 101 }], 2500);
    expect(r.map((p) => [p.x, p.cotaM])).toEqual([
      [2500, 100.25],
      [5000, 100.5],
      [7500, 100.75],
    ]);
  });
});

describe('exportação KML e DXF', () => {
  const pontos: PontoDeLevantamento[] = [
    { x: 0, y: 0, cotaM: 100, nome: 'P1', codigo: 'CE1' },
    { x: 10_000, y: 0, cotaM: 100.5, nome: 'P2', codigo: 'CE1' },
    { x: 5000, y: 5000, cotaM: 101, nome: 'P3', codigo: 'PO', descricao: 'luz <alta>' },
  ];

  it('KML: pasta por feição, linha da cerca, texto escapado', () => {
    const kml = kmlDoLevantamento(pontos, { latitude: -19.9, longitude: -43.9, elevacaoM: 0 } as never, 'Lev');
    expect(kml).toContain('<Folder><name>Cerca</name>');
    expect(kml).toContain('<Folder><name>Poste</name>');
    expect(kml).toContain('<Folder><name>Linhas das feições</name>');
    expect(kml).toContain('luz &lt;alta&gt;');
    expect(kml).not.toContain('<alta>');
  });

  it('DXF: a feição vai na sua camada LEV-* e o nome do ponto sai como texto', () => {
    const dxf = gerarDxfDaTopografia(
      { curvas: [], pontosCotados: pontos.map((p) => ({ x: p.x, y: p.y, cotaM: p.cotaM, nome: p.nome })), feicoes: linhasDasFeicoes(pontos).map((l) => ({ camada: 'LEV-CERCA', pontos: l.pontos })) },
      [],
      { titulo: 't', versao: 0, aviso: 'a' },
    );
    expect(dxf).toMatch(/\n2\nLEV-CERCA\n/);
    expect(dxf).toMatch(/POLYLINE\n\s*8\nLEV-CERCA/);
    expect(dxf).toContain('\nP3\n');
  });
});
