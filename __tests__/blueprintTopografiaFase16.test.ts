/**
 * Fase 16: as pendências miúdas da fase 15 — `<use>`/`<symbol>` no SVG,
 * MINSERT com todas as instâncias, bulge da LWPOLYLINE tesselado, e o
 * cruzamento de linhas de quebra resolvido com um vértice comum.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { resolverCruzamentos, type PontoCotado } from '../utils/blueprintTopografia';
import { importarPontos } from '../utils/blueprintTopografiaImportacao';
import { elementosDoSvg } from '../utils/blueprintTopografiaSvg';
import { lerDxfTopografia } from '../utils/blueprintTopografiaDxf';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];
const SEM_LOTE = { anel: null, georreferencia: null };

describe('<use> e <symbol> no SVG (fase 16)', () => {
  it('um símbolo com círculo e texto usado três vezes vira três marcas, na posição de cada use', () => {
    const svg =
      '<svg viewBox="0 0 100 100"><defs><symbol id="pc"><circle cx="0" cy="0" r="1"/></symbol><g id="marca"><circle cx="0" cy="0" r="0.5"/></g></defs>' +
      '<use href="#pc" x="10" y="20"/><text x="12" y="20">101</text>' +
      '<use xlink:href="#pc" x="30" y="40"/><text x="32" y="40">102</text>' +
      '<g transform="translate(50,0)"><use href="#marca" x="0" y="60"/><text x="2" y="60">103</text></g>' +
      '<use href="#nao-existe" x="1" y="1"/></svg>';
    const { elementos, usos, usosSemAlvo } = elementosDoSvg(svg);
    expect(usos).toBe(4);
    expect(usosSemAlvo).toBe(1);
    expect(elementos.filter((e) => e.tag === 'circle')).toHaveLength(3);
    const r = importarPontos(svg, 'SVG', SEM_LOTE);
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos).toContainEqual(expect.objectContaining({ x: 10000, y: 80000, cotaM: 101 }));
    expect(r.pontos).toContainEqual(expect.objectContaining({ x: 30000, y: 60000, cotaM: 102 }));
    expect(r.pontos).toContainEqual(expect.objectContaining({ x: 50000, y: 40000, cotaM: 103 }));
    expect(r.avisos.join(' ')).toMatch(/3 <use> resolvido\(s\).*1 sem alvo/);
  });

  it('use dentro de use respeita a profundidade; símbolo que se usa não trava', () => {
    const svg =
      '<svg viewBox="0 0 100 100"><defs><symbol id="a"><circle cx="0" cy="0" r="1"/><use href="#a" x="1" y="0"/></symbol></defs>' +
      '<use href="#a" x="10" y="10"/><text x="10.5" y="10">100</text></svg>';
    const { elementos } = elementosDoSvg(svg);
    // Profundidade 4: o símbolo se desenha 4 vezes e para.
    expect(elementos.filter((e) => e.tag === 'circle')).toHaveLength(4);
    expect(elementos.filter((e) => e.tag === 'circle').map((e) => e.ctm[4])).toEqual([10, 11, 12, 13]);
  });
});

const par = (c: number | string, v: number | string) => `${c}\n${v}\n`;
const secao = (nome: string, corpo: string) => par(0, 'SECTION') + par(2, nome) + corpo + par(0, 'ENDSEC');

describe('DXF: MINSERT e bulge (fase 16)', () => {
  it('MINSERT 3×2 com rotação: seis instâncias do bloco, espaçadas no sistema rodado', () => {
    const dxf =
      secao('BLOCKS', par(0, 'BLOCK') + par(2, 'PT') + par(10, 0) + par(20, 0) + par(0, 'POINT') + par(10, 0) + par(20, 0) + par(30, 7) + par(0, 'ENDBLK')) +
      secao('ENTITIES', par(0, 'INSERT') + par(2, 'PT') + par(10, 100) + par(20, 100) + par(70, 3) + par(71, 2) + par(44, 10) + par(45, 5) + par(50, 90));
    const lido = lerDxfTopografia(dxf);
    const pts = lido.entidades.filter((e) => e.tipo === 'POINT').map((e) => [Math.round(e.x * 1000) / 1000, Math.round(e.y * 1000) / 1000]);
    expect(pts).toHaveLength(6);
    // Rotação de 90°: o passo das colunas (10 em x do bloco) vira +10 em y; o das linhas (5 em y) vira −5 em x.
    expect(pts).toContainEqual([100, 100]);
    expect(pts).toContainEqual([100, 110]);
    expect(pts).toContainEqual([100, 120]);
    expect(pts).toContainEqual([95, 100]);
    expect(pts).toContainEqual([95, 120]);
    expect(lido.avisos.some((a) => /só a primeira instância/.test(a))).toBe(false);
  });

  it('LWPOLYLINE com bulge: o arco entra tesselado, com os pontos no raio; sem bulge nada muda', () => {
    // De (0,0) a (10,0) com bulge 1 = semicírculo (θ = 180°), anti-horário: de 180° a 360° passa por 270°, ou seja, y NEGATIVO.
    const dxf = secao('ENTITIES', par(0, 'LWPOLYLINE') + par(38, 101) + par(70, 0) + par(10, 0) + par(20, 0) + par(42, 1) + par(10, 10) + par(20, 0) + par(10, 20) + par(20, 0));
    const lido = lerDxfTopografia(dxf);
    const pol = lido.entidades.find((e) => e.tipo === 'POLILINHA')!;
    const vs = pol.vertices!;
    expect(vs.length).toBeGreaterThan(5);
    expect(vs[0]).toEqual({ x: 0, y: 0, z: 101 });
    expect(vs[vs.length - 1]).toEqual({ x: 20, y: 0, z: 101 });
    const arco = vs.slice(1, vs.length - 2);
    for (const v of arco) {
      expect(Math.hypot(v.x - 5, v.y)).toBeCloseTo(5, 6);
      expect(v.y).toBeLessThan(0);
      expect(v.z).toBe(101);
    }
    // Bulge negativo: horário, passa por y positivo.
    const dxf2 = secao('ENTITIES', par(0, 'LWPOLYLINE') + par(38, 1) + par(10, 0) + par(20, 0) + par(42, -0.5) + par(10, 10) + par(20, 0));
    const v2 = lerDxfTopografia(dxf2).entidades[0].vertices!;
    expect(v2.slice(1, -1).every((v) => v.y > 0)).toBe(true);
    // POLYLINE + VERTEX com bulge no vértice de partida.
    const dxf3 = secao('ENTITIES', par(0, 'POLYLINE') + par(70, 0) + par(30, 2) + par(0, 'VERTEX') + par(10, 0) + par(20, 0) + par(42, 1) + par(0, 'VERTEX') + par(10, 10) + par(20, 0) + par(0, 'SEQEND'));
    const v3 = lerDxfTopografia(dxf3).entidades[0].vertices!;
    expect(v3.length).toBeGreaterThan(5);
    expect(v3.slice(1, -1).every((v) => Math.abs(Math.hypot(v.x - 5, v.y) - 5) < 1e-6)).toBe(true);
    // A linha de quebra que sai do importador leva o arco.
    const r = importarPontos(secao('HEADER', par(9, '$INSUNITS') + par(70, 6)) + dxf, 'DXF', { anel: LOTE, georreferencia: null });
    expect(r.linhasDeQuebra[0].pontos.length).toBe(vs.length);
  });
});

describe('cruzamento de linhas de quebra (fase 16)', () => {
  it('resolverCruzamentos insere o vértice nas duas, com a cota da primeira; vértice comum já existente não conta', () => {
    const a = { pontos: [{ x: 0, y: 0, cotaM: 100 }, { x: 10000, y: 10000, cotaM: 110 }] };
    const b = { pontos: [{ x: 0, y: 10000, cotaM: 50 }, { x: 10000, y: 0, cotaM: 50 }] };
    const r = resolverCruzamentos([a, b]);
    expect(r.cruzamentos).toBe(1);
    expect(r.linhas[0].pontos).toEqual([{ x: 0, y: 0, cotaM: 100 }, { x: 5000, y: 5000, cotaM: 105 }, { x: 10000, y: 10000, cotaM: 110 }]);
    expect(r.linhas[1].pontos[1]).toEqual({ x: 5000, y: 5000, cotaM: 105 });
    // Duas linhas que se tocam num vértice existente: nada a inserir.
    const c = { pontos: [{ x: 0, y: 0, cotaM: 1 }, { x: 5000, y: 5000, cotaM: 2 }] };
    const d = { pontos: [{ x: 5000, y: 5000, cotaM: 9 }, { x: 0, y: 9000, cotaM: 9 }] };
    expect(resolverCruzamentos([c, d]).cruzamentos).toBe(0);
    // Paralelas: nada.
    const e: { pontos: PontoCotado[] } = { pontos: [{ x: 0, y: 1000, cotaM: 1 }, { x: 10000, y: 11000, cotaM: 1 }] };
    expect(resolverCruzamentos([a, e]).cruzamentos).toBe(0);
  });

  it('uma linha cruzada por duas: os dois cruzamentos entram em ordem ao longo dela', () => {
    const tronco = { pontos: [{ x: 0, y: 5000, cotaM: 100 }, { x: 12000, y: 5000, cotaM: 112 }] };
    const g1 = { pontos: [{ x: 3000, y: 0, cotaM: 90 }, { x: 3000, y: 10000, cotaM: 90 }] };
    const g2 = { pontos: [{ x: 9000, y: 0, cotaM: 90 }, { x: 9000, y: 10000, cotaM: 90 }] };
    const r = resolverCruzamentos([tronco, g2, g1]);
    expect(r.cruzamentos).toBe(2);
    expect(r.linhas[0].pontos.map((p) => p.x)).toEqual([0, 3000, 9000, 12000]);
    expect(r.linhas[0].pontos.map((p) => p.cotaM)).toEqual([100, 103, 109, 112]);
    expect(r.linhas[1].pontos[1]).toEqual({ x: 9000, y: 5000, cotaM: 109 });
    expect(r.linhas[2].pontos[1]).toEqual({ x: 3000, y: 5000, cotaM: 103 });
  });
});
