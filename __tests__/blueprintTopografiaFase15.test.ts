/**
 * Fase 15: as cinco pendências do importador e da TIN — linhas de quebra e
 * TIN importada (com índice por balde), `transform` no SVG, blocos INSERT no
 * DXF, Bézier/arco achatados e o perfil SVG com valores exatos.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import {
  amostrarLevantamento,
  amostrarPontosCotados,
  densificarLinha,
  hashDaEntrada,
  interpoladorComQuebras,
  interpoladorDaTin,
  interpoladorDaTinImportada,
  planejarGrade,
  triangular,
  type PontoCotado,
} from '../utils/blueprintTopografia';
import { detectarFormato, importarPontos, verticesDoPath } from '../utils/blueprintTopografiaImportacao';
import { aplicar, elementosDoSvg, matrizDoTransform, multiplicar } from '../utils/blueprintTopografiaSvg';
import { lerDxfTopografia } from '../utils/blueprintTopografiaDxf';
import { svgDoPerfil } from '../utils/blueprintTopografiaExport';
import type { EstatisticasDoPerfil, PontoDoPerfil } from '../utils/blueprintTopografiaAnalises';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];
const CTX = { anel: LOTE, georreferencia: null };
const CANTOS: PontoCotado[] = LOTE.map((p) => ({ ...p, cotaM: 100 }));

/** Varredura linear de referência — o que `interpoladorDaTin` fazia antes do índice. */
function varreduraLinear(pontos: PontoCotado[]): (p: Point) => number | null {
  const tris = triangular(pontos);
  return (p) => {
    for (const t of tris) {
      const a = pontos[t.a];
      const b = pontos[t.b];
      const c = pontos[t.c];
      const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (det === 0) continue;
      const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
      const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a.cotaM + l2 * b.cotaM + l3 * c.cotaM;
    }
    return null;
  };
}

function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('índice por balde (fase 15)', () => {
  it('devolve exatamente o que a varredura linear devolvia — inclusive null fora do casco', () => {
    const rnd = aleatorio(42);
    const vistos = new Set<string>();
    const pontos: PontoCotado[] = [];
    while (pontos.length < 2000) {
      const x = Math.round(rnd() * 12000);
      const y = Math.round(rnd() * 30000);
      if (vistos.has(`${x},${y}`)) continue;
      vistos.add(`${x},${y}`);
      pontos.push({ x, y, cotaM: 100 + Math.sin(x / 900) * 3 + Math.cos(y / 1300) * 2 });
    }
    const rapido = interpoladorDaTin(pontos)!;
    const lento = varreduraLinear(pontos);
    let nulos = 0;
    for (let i = 0; i < 5000; i++) {
      const p = { x: rnd() * 14000 - 1000, y: rnd() * 32000 - 1000 };
      const a = rapido(p);
      const b = lento(p);
      expect(a).toBe(b);
      if (a === null) nulos++;
    }
    expect(nulos).toBeGreaterThan(0);
  });
});

describe('linhas de quebra (fase 15)', () => {
  // Um vale: cantos a 100, dois pontos a 90 no eixo do vale (8 m entre si), e
  // uma crista a 100 atravessando o vale (11 m). Sem a quebra, o Delaunay
  // escolhe a diagonal CURTA (o vale) e a crista some; com a quebra, fica.
  const vale: PontoCotado[] = [...CANTOS, { x: 6000, y: 11000, cotaM: 90 }, { x: 6000, y: 19000, cotaM: 90 }];
  const crista = { pontos: [{ x: 500, y: 15000, cotaM: 100 }, { x: 11500, y: 15000, cotaM: 100 }] };

  it('densificarLinha: passo, mm inteiro, cota interpolada, sem repetidos', () => {
    const d = densificarLinha({ pontos: [{ x: 0, y: 0, cotaM: 100 }, { x: 1000, y: 0, cotaM: 101 }] }, 250);
    expect(d.map((p) => p.x)).toEqual([0, 250, 500, 750, 1000]);
    expect(d[2].cotaM).toBeCloseTo(100.5, 9);
    expect(densificarLinha({ pontos: [{ x: 0, y: 0, cotaM: 1 }, { x: 0, y: 0, cotaM: 1 }] }, 250)).toHaveLength(1);
  });

  it('sem a quebra o relevo atravessa a crista; com ela, não', () => {
    const grade = planejarGrade(LOTE, 500);
    const sem = amostrarPontosCotados(grade, [...vale, ...crista.pontos]);
    const com = amostrarLevantamento(grade, [...vale, ...crista.pontos], { linhasDeQuebra: [crista] });
    const no = (g: typeof grade, x: number, y: number) => g.cotasM[((y - g.origem.y) / g.espacamentoMm) * g.colunas + (x - g.origem.x) / g.espacamentoMm];
    expect(no(sem, 6000, 15000)).toBeCloseTo(90, 6);
    expect(no(com.grade, 6000, 15000)).toBeCloseTo(100, 6);
    // Meio caminho entre a crista (100) e o fundo do vale (90, 4 m ao norte).
    expect(no(sem, 6000, 15500)).toBeCloseTo(90, 6);
    expect(no(com.grade, 6000, 15500)).toBeCloseTo(98.75, 6);
    expect(com.avisos.some((a) => /não coincidem/.test(a))).toBe(false);
    const r = interpoladorComQuebras([...vale, ...crista.pontos], [crista], 250);
    expect(r.trechosNaoHonrados).toBe(0);
    expect(r.vertices).toBeGreaterThan(40);
  });

  it('quebras que se cruzam: pelo menos um trecho não vira aresta, e o aviso diz', () => {
    const a = { pontos: [{ x: 300, y: 300, cotaM: 100 }, { x: 11700, y: 29700, cotaM: 100 }] };
    const b = { pontos: [{ x: 300, y: 29700, cotaM: 90 }, { x: 11700, y: 300, cotaM: 90 }] };
    const r = interpoladorComQuebras(CANTOS, [a, b], 250);
    expect(r.trechosNaoHonrados).toBeGreaterThan(0);
    expect(r.avisos.some((s) => /não coincidem com arestas/.test(s))).toBe(true);
    expect(r.f).not.toBeNull();
  });

  it('vértice densificado em cima de um ponto do levantamento: a cota do topógrafo vence', () => {
    const r = interpoladorComQuebras([...CANTOS, { x: 6000, y: 15000, cotaM: 97 }], [crista], 250);
    expect(r.f!({ x: 6000, y: 15000 })).toBeCloseTo(97, 6);
  });
});

describe('TIN importada (fase 15)', () => {
  const quad: PontoCotado[] = [
    { x: 0, y: 0, cotaM: 100 },
    { x: 12000, y: 0, cotaM: 110 },
    { x: 12000, y: 30000, cotaM: 100 },
    { x: 0, y: 30000, cotaM: 110 },
  ];
  it('as faces mandam: a diagonal escolhida decide a cota no centro', () => {
    const ac = interpoladorDaTinImportada(quad, { faces: [0, 1, 2, 0, 2, 3] });
    const bd = interpoladorDaTinImportada(quad, { faces: [0, 1, 3, 1, 2, 3] });
    expect(ac.f!({ x: 6000, y: 15000 })).toBeCloseTo(100, 6);
    expect(bd.f!({ x: 6000, y: 15000 })).toBeCloseTo(110, 6);
    expect(ac.avisos).toEqual([]);
    // amostrarLevantamento prefere a TIN importada às quebras e à TIN pura.
    const grade = planejarGrade(LOTE, 1000);
    const r = amostrarLevantamento(grade, quad, { tinImportada: { faces: [0, 1, 3, 1, 2, 3] } });
    const i = ((15000 - grade.origem.y) / 1000) * grade.colunas + (6000 - grade.origem.x) / 1000;
    expect(r.grade.cotasM[i]).toBeCloseTo(110, 6);
  });
  it('índice fora da lista e face degenerada são ignorados e avisados; sem face válida cai na TIN calculada', () => {
    const r = interpoladorDaTinImportada(quad, { faces: [0, 1, 9, 0, 1, 1, 0, 1, 2] });
    expect(r.avisos.join(' ')).toMatch(/1 face\(s\) da TIN importada apontam/);
    expect(r.avisos.join(' ')).toMatch(/1 face\(s\) degeneradas/);
    expect(r.f!({ x: 100, y: 10 })).not.toBeNull();
    const so = amostrarLevantamento(planejarGrade(LOTE, 1000), quad, { tinImportada: { faces: [0, 1, 1] } });
    expect(so.avisos.some((a) => /não tem face válida/.test(a))).toBe(true);
    expect(so.grade.cotasM.some((c) => c !== null)).toBe(true);
  });
});

describe('hash da entrada com quebras e TIN (fase 15)', () => {
  const base = { fonteCodigo: 'PONTOS_COTADOS', datasetVersao: 'x', anel: LOTE, georreferencia: null, espacamentoMm: 500, equidistanciaM: 1, pontosCotados: CANTOS };
  it('undefined não muda o hash das versões antigas; uma linha muda; [] também muda (por isso o hook manda undefined)', () => {
    const h0 = hashDaEntrada(base);
    expect(hashDaEntrada({ ...base, linhasDeQuebra: undefined, tinImportada: undefined })).toBe(h0);
    expect(hashDaEntrada({ ...base, linhasDeQuebra: [{ pontos: CANTOS.slice(0, 2) }] })).not.toBe(h0);
    expect(hashDaEntrada({ ...base, tinImportada: { faces: [0, 1, 2] } })).not.toBe(h0);
    expect(hashDaEntrada({ ...base, linhasDeQuebra: [] })).not.toBe(h0);
  });
});

describe('fontes de linhas de quebra (fase 15)', () => {
  it('TEXTO: códigos LQ1/LQ2 agrupam vértices na ordem do arquivo', () => {
    const r = importarPontos('1;10;2;100,5;LQ1\n2;20;4;101;LQ1\n3;5;8;100,8;LQ2\n4;6;9;101;lq2\n5;1;1;99;', 'TEXTO', CTX);
    expect(r.pontos).toHaveLength(5);
    expect(r.linhasDeQuebra).toHaveLength(2);
    expect(r.linhasDeQuebra[0].pontos).toEqual([{ x: 2000, y: 10000, cotaM: 100.5 }, { x: 4000, y: 20000, cotaM: 101 }]);
    expect(r.linhasDeQuebra[1].pontos).toHaveLength(2);
    expect(r.detectado.linhasDeQuebra).toBe(2);
    expect(r.tinImportada).toBeNull();
  });

  const par = (c: number | string, v: number | string) => `${c}\n${v}\n`;
  const secao = (nome: string, corpo: string) => par(0, 'SECTION') + par(2, nome) + corpo + par(0, 'ENDSEC');

  it('DXF: LWPOLYLINE com elevação, POLYLINE 3D, LINE com Z viram quebras; 3DFACE vira TIN; 2D fica de fora', () => {
    const dxf =
      secao('HEADER', par(9, '$INSUNITS') + par(70, 6)) +
      secao(
        'ENTITIES',
        par(0, 'LWPOLYLINE') + par(8, 'TALUDE') + par(38, 101) + par(70, 0) + par(10, 1) + par(20, 1) + par(10, 5) + par(20, 1) + par(10, 5) + par(20, 5) +
          par(0, 'POLYLINE') + par(70, 8) + par(0, 'VERTEX') + par(10, 2) + par(20, 20) + par(30, 102) + par(0, 'VERTEX') + par(10, 8) + par(20, 20) + par(30, 103) + par(0, 'SEQEND') +
          par(0, 'LINE') + par(10, 1) + par(20, 25) + par(30, 104) + par(11, 9) + par(21, 25) + par(31, 105) +
          par(0, 'LWPOLYLINE') + par(70, 0) + par(10, 0) + par(20, 0) + par(10, 3) + par(20, 3) +
          par(0, '3DFACE') + par(10, 0) + par(20, 0) + par(30, 100) + par(11, 12) + par(21, 0) + par(31, 100) + par(12, 12) + par(22, 30) + par(32, 100) + par(13, 12) + par(23, 30) + par(33, 100) +
          par(0, '3DFACE') + par(10, 0) + par(20, 0) + par(30, 100) + par(11, 12) + par(21, 30) + par(31, 100) + par(12, 0) + par(22, 30) + par(32, 100) + par(13, 0) + par(23, 30) + par(33, 100),
      );
    const r = importarPontos(dxf, 'DXF', CTX);
    expect(r.detectado.unidade).toBe('M');
    expect(r.linhasDeQuebra).toHaveLength(3);
    expect(r.linhasDeQuebra[0].pontos).toEqual([{ x: 1000, y: 1000, cotaM: 101 }, { x: 5000, y: 1000, cotaM: 101 }, { x: 5000, y: 5000, cotaM: 101 }]);
    expect(r.linhasDeQuebra[1].pontos.map((p) => p.cotaM)).toEqual([102, 103]);
    expect(r.linhasDeQuebra[2].pontos).toEqual([{ x: 1000, y: 25000, cotaM: 104 }, { x: 9000, y: 25000, cotaM: 105 }]);
    expect(r.tinImportada?.faces).toHaveLength(6);
    // Os 4 cantos das duas faces viram 4 pontos (o (0,0) e o (12,30) repetidos não duplicam).
    const daFace = r.pontos.filter((p) => p.codigo === 'face');
    expect(daFace).toHaveLength(4);
    expect(r.tinImportada!.faces.every((i) => r.pontos[i].codigo === 'face')).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/1 linha\(s\)\/polilinha\(s\) sem Z/);
    expect(r.avisos.join(' ')).toMatch(/TIN importada com 2 faces/);
  });

  it('DXF: INSERT resolvido (inserção, rotação, escala, aninhado, ATTRIB de cota); bloco inexistente e recursão avisam', () => {
    const dxf =
      secao('HEADER', par(9, '$INSUNITS') + par(70, 6)) +
      secao(
        'BLOCKS',
        par(0, 'BLOCK') + par(2, 'PT') + par(10, 0) + par(20, 0) + par(30, 0) + par(0, 'CIRCLE') + par(10, 0) + par(20, 0) + par(40, 0.2) + par(0, 'ENDBLK') +
          par(0, 'BLOCK') + par(2, 'PAR') + par(10, 0) + par(20, 0) + par(0, 'INSERT') + par(2, 'PT') + par(10, 1) + par(20, 0) + par(0, 'TEXT') + par(10, 1.1) + par(20, 0.1) + par(40, 0.5) + par(1, '102') + par(0, 'ENDBLK') +
          par(0, 'BLOCK') + par(2, 'REC') + par(10, 0) + par(20, 0) + par(0, 'POINT') + par(10, 0) + par(20, 0) + par(30, 5) + par(0, 'INSERT') + par(2, 'REC') + par(10, 1) + par(20, 0) + par(0, 'ENDBLK'),
      ) +
      secao(
        'ENTITIES',
        par(0, 'INSERT') + par(66, 1) + par(2, 'PT') + par(10, 4) + par(20, 20) + par(41, 2) + par(42, 2) + par(50, 90) +
          par(0, 'ATTRIB') + par(2, 'ELEV') + par(10, 4.5) + par(20, 20.5) + par(40, 0.3) + par(1, '101,00') + par(0, 'SEQEND') +
          par(0, 'INSERT') + par(2, 'PAR') + par(10, 10) + par(20, 10) +
          par(0, 'INSERT') + par(2, 'REC') + par(10, 50) + par(20, 50) +
          par(0, 'INSERT') + par(2, 'NAO_EXISTE') + par(10, 1) + par(20, 1),
      );
    const lido = lerDxfTopografia(dxf);
    expect(lido.entidades.filter((e) => e.tipo === 'CIRCLE')).toHaveLength(2);
    expect(lido.avisos.join(' ')).toMatch(/"NAO_EXISTE"/);
    expect(lido.avisos.join(' ')).toMatch(/aninhado além de 4/);
    const r = importarPontos(dxf, 'DXF', { anel: null, georreferencia: null });
    const pt = r.pontos.find((p) => p.cotaM === 101);
    expect(pt).toEqual(expect.objectContaining({ x: 4000, y: 20000 }));
    const par2 = r.pontos.find((p) => p.cotaM === 102);
    expect(par2).toEqual(expect.objectContaining({ x: 11000, y: 10000 }));
    // Recursão: REC em (50,50) até 4 níveis → 4 pontos com Z 5 em y = 50.
    expect(r.pontos.filter((p) => p.cotaM === 5).map((p) => p.x).sort((a, b) => a - b)).toEqual([50000, 51000, 52000, 53000]);
  });

  it('LandXML: superfície com faces, linha de quebra e unidade', () => {
    const xml =
      '<?xml version="1.0"?><LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"><Units><Metric linearUnit="meter"/></Units>' +
      '<Surfaces><Surface name="S"><Definition surfType="TIN"><Pnts><P id="1">0 0 100</P><P id="2">0 12 110</P><P id="3">30 12 100</P><P id="4">30 0 110</P></Pnts>' +
      '<Faces><F>1 2 3</F><F>1 3 4</F><F i="1">1 2 4</F></Faces></Definition>' +
      '<Breaklines><Breakline brkType="standard"><PntList3D>5 2 101 25 2 103</PntList3D></Breakline></Breaklines></Surface></Surfaces></LandXML>';
    expect(detectarFormato('superficie.xml', xml)).toBe('LANDXML');
    expect(detectarFormato('outro.xml', '<root/>')).toBeNull();
    const r = importarPontos(xml, 'LANDXML', CTX);
    expect(r.pontos).toHaveLength(6);
    // Norte, este, cota: id 3 é n = 30, e = 12 → x = 12 m, y = 30 m.
    expect(r.pontos[2]).toEqual(expect.objectContaining({ x: 12000, y: 30000, cotaM: 100 }));
    expect(r.tinImportada?.faces).toEqual([0, 1, 2, 0, 2, 3]);
    expect(r.linhasDeQuebra).toEqual([{ pontos: [{ x: 2000, y: 5000, cotaM: 101 }, { x: 2000, y: 25000, cotaM: 103 }] }]);
    expect(r.dentroDoLote).toBe(6);
  });

  it('SVG: cada curva com cota é também uma linha de quebra plana', () => {
    const svg = '<svg viewBox="0 0 100 100"><polyline points="10,10 50,10 90,10"/><text x="52" y="8">101,5</text><polyline points="10,50 50,50 90,50"/><text x="52" y="48">102</text></svg>';
    const r = importarPontos(svg, 'SVG', { anel: null, georreferencia: null });
    expect(r.detectado.curvasLidas).toBe(2);
    expect(r.linhasDeQuebra).toHaveLength(2);
    expect(r.linhasDeQuebra[0].pontos.every((p) => p.cotaM === 101.5)).toBe(true);
  });
});

describe('SVG com transform (fase 15)', () => {
  it('matrizes: composição na ordem do SVG, rotate com centro, skew', () => {
    const p = { x: 5, y: 5 };
    expect(aplicar(matrizDoTransform('translate(10,20) scale(2)'), p)).toEqual({ x: 20, y: 30 });
    expect(aplicar(matrizDoTransform('scale(2) translate(10,20)'), p)).toEqual({ x: 30, y: 50 });
    const r = aplicar(matrizDoTransform('rotate(90, 50, 50)'), { x: 60, y: 50 });
    expect(r.x).toBeCloseTo(50, 9);
    expect(r.y).toBeCloseTo(60, 9);
    expect(aplicar(matrizDoTransform('matrix(1 0 0 1 3 4)'), p)).toEqual({ x: 8, y: 9 });
    expect(aplicar(matrizDoTransform('skewX(45)'), { x: 0, y: 10 }).x).toBeCloseTo(10, 9);
    expect(multiplicar([1, 0, 0, 1, 1, 2], [2, 0, 0, 2, 0, 0])).toEqual([2, 0, 0, 2, 1, 2]);
  });

  it('elementos saem com a CTM acumulada; <defs> não sai; transform na raiz é ignorado com aviso', () => {
    const svg =
      '<svg viewBox="0 0 100 100" transform="scale(3)"><!-- <circle cx="99" cy="99"/> --><defs><circle cx="1" cy="1" r="1"/></defs>' +
      '<g transform="translate(10,20)"><g transform="scale(2)"><circle cx="5" cy="5" r="0.5"/><text x="7" y="5">100,5</text></g></g>' +
      '<g transform="rotate(90,50,50)"><circle cx="60" cy="50" r="0.5"/><text x="61" y="50">102</text></g></svg>';
    const { elementos, transformNaRaiz, comTransform } = elementosDoSvg(svg);
    expect(transformNaRaiz).toBe(true);
    expect(comTransform).toBe(3);
    expect(elementos.filter((e) => e.tag === 'circle')).toHaveLength(2);
    expect(elementos.find((e) => e.tag === 'text')?.conteudo).toBe('100,5');
    const r = importarPontos(svg, 'SVG', { anel: null, georreferencia: null });
    expect(r.avisos.join(' ')).toMatch(/raiz tem transform/);
    expect(r.avisos.join(' ')).toMatch(/transform aplicado em 3/);
    // (5,5) → scale 2 → (10,10) → translate → (20,30); Y invertido pela caixa de 100.
    expect(r.pontos).toContainEqual(expect.objectContaining({ x: 20000, y: 70000, cotaM: 100.5 }));
    // (60,50) girado 90° em torno de (50,50) → (50,60).
    expect(r.pontos).toContainEqual(expect.objectContaining({ x: 50000, y: 40000, cotaM: 102 }));
    expect(r.pontos).toHaveLength(2);
  });
});

describe('verticesDoPath achata Bézier e arco (fase 15)', () => {
  it('cúbica: ≥ 4 segmentos, pontas exatas, ponto médio sobre a curva; S reflete o controle', () => {
    const [c] = verticesDoPath('M0 0 C 0 10 10 0 10 10');
    expect(c.temCurvasBezier).toBe(true);
    expect(c.pontos.length).toBeGreaterThanOrEqual(5);
    expect(c.pontos[0]).toEqual({ x: 0, y: 0 });
    expect(c.pontos[c.pontos.length - 1]).toEqual({ x: 10, y: 10 });
    expect(c.pontos.some((p) => Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y - 5) < 1e-6)).toBe(true);
    const [s] = verticesDoPath('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0');
    expect(s.pontos.some((p) => Math.abs(p.x - 15) < 1e-6 && Math.abs(p.y + 7.5) < 1e-6)).toBe(true);
    // Com passo 1 e polígono de controle de 22,4, saem 23 segmentos: o meio (5, 5) fica a menos de 0,3 de um vértice.
    const [q] = verticesDoPath('M0 0 Q 5 10 10 0', { passo: 1 });
    expect(q.pontos.some((p) => Math.hypot(p.x - 5, p.y - 5) < 0.3)).toBe(true);
    expect(q.pontos.length).toBe(24);
  });

  it('arco: semicírculo com todos os pontos no raio, nos quatro casos de bandeira; rx = 0 vira reta', () => {
    for (const [fA, fS] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const [a] = verticesDoPath(`M0 0 A 10 10 0 ${fA} ${fS} 20 0`);
      expect(a.pontos.length).toBeGreaterThanOrEqual(5);
      for (const p of a.pontos) expect(Math.hypot(p.x - 10, p.y)).toBeCloseTo(10, 2);
      const meio = a.pontos[Math.floor(a.pontos.length / 2)];
      // sweep = 1 gira no sentido do ângulo positivo, que na tela (Y para baixo)
      // é o horário: da esquerda para a direita passa por CIMA (y negativo).
      expect(Math.sign(meio.y)).toBe(fS === 1 ? -1 : 1);
      expect(a.pontos[a.pontos.length - 1]).toEqual({ x: 20, y: 0 });
    }
    expect(verticesDoPath('M0 0 A 0 0 0 0 1 10 10')[0].pontos).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('perfil SVG exato (fase 15)', () => {
  const perfil: PontoDoPerfil[] = [
    { distM: 0, cotaM: 100.123456, x: 1000, y: 2000 },
    { distM: 8, cotaM: null, x: 5000, y: 8928 },
    { distM: 16, cotaM: 102.456789, x: 9000, y: 15856 },
  ];
  const est: EstatisticasDoPerfil = {
    comprimentoM: 16, cotaInicioM: 100.123456, cotaFimM: 102.456789, cotaMinM: 100.123456, cotaMaxM: 102.456789,
    desnivelM: 2.333333, subidaM: 2.333333, descidaM: 0, declividadeMediaP: 14.6, declividadeMaxP: 29.2, pontosSemCota: 1,
  };
  const svg = svgDoPerfil(perfil, est, { titulo: 'Corte A' });

  it('o SVG leva os metadados e volta exato, sem linha de apoio e sem o aviso de precisão', () => {
    expect(svg).toContain('opura-perfil');
    expect(detectarFormato('perfil.svg', svg)).toBe('PERFIL_SVG');
    const r = importarPontos(svg, 'PERFIL_SVG', CTX);
    expect(r.pontos).toEqual([
      { x: 1000, y: 2000, cotaM: 100.123456 },
      { x: 9000, y: 15856, cotaM: 102.456789 },
    ]);
    expect(r.detectado.linhasLidas).toBe(3);
    expect(r.detectado.linhasIgnoradas).toBe(1);
    expect(r.avisos.join(' ')).toMatch(/exatas/);
    expect(r.avisos.join(' ')).not.toMatch(/precisão/);
  });

  it('um SVG de perfil antigo (sem metadados) continua pelo gráfico, com a linha de apoio e o aviso', () => {
    const antigo = svg.replace(/<metadata>[\s\S]*?<\/metadata>/, '');
    expect(() => importarPontos(antigo, 'PERFIL_SVG', CTX)).toThrow(/escolha em "Perfil altimétrico"/);
    const linha = [
      { distM: 0, x: 1000, y: 2000 },
      { distM: 16, x: 9000, y: 15856 },
    ];
    const r = importarPontos(antigo, 'PERFIL_SVG', { ...CTX, linhaDoPerfil: linha });
    expect(r.avisos.join(' ')).toMatch(/precisão/);
    expect(r.pontos[0].cotaM).toBeCloseTo(100.12, 1);
  });
});
