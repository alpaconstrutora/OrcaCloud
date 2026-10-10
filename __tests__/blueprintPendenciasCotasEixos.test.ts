/**
 * AS PENDÊNCIAS 1, 2 E 8 do plano de cotas e eixos (10/10/2026, plano `docs/planos/2026-10-10-pendencias-cotas-eixos.md`):
 * o recuo da zona nas cotas do lote do PDF e do DXF (o envelope refeito na exportação), as sub-regiões repartindo a cota
 * do lote quando pedido, e a bolha do eixo sempre fora do desenho inteiro.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';
import { anelDoLoteFechado, cadeiasDoContorno, detalhesDoLote } from '../utils/blueprintCotas';
import { envelopesParaExportacao, type ZonaParaExportacao } from '../utils/blueprintZonaUrbanistica';
import { CONFIGURACAO_PADRAO, configuracaoDaColuna } from '../utils/blueprintTemplatesDeVista';

/** Lote 10 × 30 com os papéis (a frente embaixo). */
function lote(extra: (t: string) => Command[] = () => []): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: string): Command =>
    ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel }) as Command;
  return applyBatch(m, [
    d(0, 0, 10000, 0, 'FRENTE'),
    d(10000, 0, 10000, 30000, 'LATERAL_DIREITA'),
    d(10000, 30000, 0, 30000, 'FUNDOS'),
    d(0, 30000, 0, 0, 'LATERAL_ESQUERDA'),
    ...extra(t),
  ]).model;
}
const ZONA_1_5: ZonaParaExportacao = {
  recuos: { FRENTE: 1500, FUNDOS: 1500, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 },
  afastamentoProgressivo: null,
  recuoFrenteEscalonado: null,
};
const op = (extra: Record<string, unknown> = {}) =>
  ({ denominador: 500, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'abc', data: new Date('2026-10-10T12:00:00Z'), cotas: true, ...extra }) as Parameters<typeof desenharPlanta>[2];

describe('pendência 1 — o recuo da zona no PDF e no DXF', () => {
  it('envelopesParaExportacao: a peça recuada 1,5 m na frente e nos fundos; sem zona ou sem recuo, nada', () => {
    const m = lote();
    const env = envelopesParaExportacao(m, ZONA_1_5);
    const pecas = env.get(m.levels[0].id)!;
    expect(pecas).toHaveLength(1);
    const ys = pecas[0].map((p) => p.y);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([1500, 28500]);
    expect(envelopesParaExportacao(m, null).size).toBe(0);
    expect(envelopesParaExportacao(m, { ...ZONA_1_5, recuos: { FRENTE: 0, FUNDOS: 0, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 } }).size).toBe(0);
  });

  it('PDF: com a zona, a lateral sai 1,50 | 27,00 | 1,50 e o envelope é desenhado (laranja); sem zona, nada disso', () => {
    const m = lote();
    const com = new DesenhistaDeProva();
    desenharPlanta(com, m, op({ zona: ZONA_1_5 }), enquadrar(m, 500, PAPEIS[0], true));
    expect(com.textos()).toContain('27,00');
    expect(com.textos().filter((x) => x === '1,50').length).toBeGreaterThanOrEqual(4);
    expect(com.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === '#f59e0b').length).toBeGreaterThan(0);
    const sem = new DesenhistaDeProva();
    desenharPlanta(sem, m, op(), enquadrar(m, 500, PAPEIS[0], true));
    expect(sem.textos()).not.toContain('27,00');
    expect(sem.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === '#f59e0b')).toHaveLength(0);
  });

  it('DXF: o envelope na camada PLANTA-ENVELOPE e o 27,00 na cota da lateral', () => {
    const m = lote();
    const dxf = gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h', cotas: true, envelopes: envelopesParaExportacao(m, ZONA_1_5) });
    expect(dxf).toMatch(/POLYLINE\r?\n\s*8\r?\nPLANTA-ENVELOPE/);
    expect(dxf).toContain('\n27,00\n');
    const sem = gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h', cotas: true });
    expect(sem).not.toContain('\n27,00\n');
  });
});

describe('pendência 2 — sub-regiões nas cotas do lote (quando pedido)', () => {
  it('detalhesDoLote com as sub-regiões reparte a cota; sem elas, não', () => {
    const m = lote();
    const jardim = [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)];
    const anel = anelDoLoteFechado(m.boundaries);
    const lateralCom = cadeiasDoContorno(anel, [], [], detalhesDoLote(m.boundaries, [], [jardim])).filter((c) => c.total.rotulo === '30,00');
    for (const c of lateralCom) expect(c.parcial.map((s) => s.rotulo).sort()).toEqual(['26,00', '4,00']);
    const lateralSem = cadeiasDoContorno(anel, [], [], detalhesDoLote(m.boundaries)).filter((c) => c.total.rotulo === '30,00');
    for (const c of lateralSem) expect(c.parcial).toEqual([]);
  });

  it('template de vista: "Cotas das sub-regiões" nasce desligado; template antigo também', () => {
    expect(CONFIGURACAO_PADRAO.planta.cotasSubRegioes).toBe(false);
    expect(configuracaoDaColuna({ planta: { medidas: true } }).planta.cotasSubRegioes).toBe(false);
    expect(configuracaoDaColuna({ planta: { cotasSubRegioes: true } }).planta.cotasSubRegioes).toBe(true);
  });
});

describe('pendência 8 — a bolha do eixo fora do desenho inteiro', () => {
  // Um eixo CURTO, dentro do lote (5 → 25 m): sem a regra, a bolha cairia dentro do lote, sobre um nome de ambiente.
  const comEixoCurto = () => lote(() => [{ type: 'AddEixo', a: point(5000, 5000), b: point(5000, 25000) } as Command]);

  it('PDF (sem cotas): as duas bolhas ficam além das pontas do lote', () => {
    const m = comEixoCurto();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, op({ cotas: false }), enquadrar(m, 500, PAPEIS[0], false));
    const circulos = d.chamadas.filter((c) => c.tipo === 'circulo').map((c) => ({ y: c.args[1] as number, r: c.args[2] as number }));
    expect(circulos).toHaveLength(2);
    // O lote tem 60 mm de papel em 1:500; o eixo, 40 mm. As bolhas: além dos 60 mm do lote, cada uma no seu lado.
    const [topo, base] = [...circulos].sort((p, q) => p.y - q.y);
    expect(base.y - topo.y).toBeGreaterThan(60 + 2 * topo.r - 1e-6);
  });

  it('DXF (sem cotas): os centros das bolhas ficam além do lote (y < 0 e y > 30 000)', () => {
    const dxf = gerarDxf(comEixoCurto(), { titulo: 't', revisao: 1, hash: 'h' });
    const v = dxf.split(/\r?\n/).map((s) => s.trim());
    const ys: number[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (v[i] !== '0' || v[i + 1] !== 'CIRCLE') continue;
      const campos: Record<string, string> = {};
      for (let k = i + 2; k + 1 < v.length && v[k] !== '0'; k += 2) campos[v[k]] = v[k + 1];
      if (campos['8'] === 'PLANTA-MALHA-EIXOS') ys.push(Number(campos['20']));
    }
    expect(ys).toHaveLength(2);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(30000);
  });
});

describe('pendência 7 — eixos na convenção antiga', () => {
  it('vertical com número e horizontal com letra são da convenção antiga; nome à mão não', async () => {
    const { eixosNaConvencaoAntiga, eixoNaConvencaoAntiga } = await import('../utils/blueprintEixosAutomaticos');
    const v = (nome: string) => ({ a: point(0, 0), b: point(0, 10000), nome });
    const h = (nome: string) => ({ a: point(0, 0), b: point(10000, 0), nome });
    expect(eixoNaConvencaoAntiga(v('1'))).toBe(true);
    expect(eixoNaConvencaoAntiga(v('A'))).toBe(false);
    expect(eixoNaConvencaoAntiga(h('A'))).toBe(true);
    expect(eixoNaConvencaoAntiga(h('3'))).toBe(false);
    expect(eixoNaConvencaoAntiga(v('P-1'))).toBe(false);
    expect(eixoNaConvencaoAntiga(v(''))).toBe(false);
    const m = lote((t) => {
      void t;
      return [
        { type: 'AddEixo', a: point(0, -1000), b: point(0, 31000), nome: '1' } as Command,
        { type: 'AddEixo', a: point(-1000, 0), b: point(11000, 0), nome: '2' } as Command,
      ];
    });
    expect(eixosNaConvencaoAntiga(m).map((e) => e.nome)).toEqual(['1']);
  });
});

/**
 * 10/10/2026 — *"corrigir: … no PDF, quando a casa fica perto da divisa (2 m no teste), as cotas da casa e as do lote
 * se sobrepõem na lateral e os números se misturam"*. A cadeia do lote começa além do que as da casa ocupam.
 */
describe('cotas do lote além das cotas da edificação', () => {
  // Lote 10 × 30 e uma casa 6 × 4 a 2 m das laterais (a mesma da prova no app).
  const casaPertoDaDivisa = () =>
    lote((t) => {
      const w = (ax: number, ay: number, bx: number, by: number) =>
        ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
      return [w(2000, 8000, 8000, 8000), w(8000, 8000, 8000, 12000), w(8000, 12000, 2000, 12000), w(2000, 12000, 2000, 8000)];
    });

  it('alcanceAlemDoLado e deslocamentoDaCadeiaDoLote', async () => {
    const { alcanceAlemDoLado, deslocamentoDaCadeiaDoLote } = await import('../utils/blueprintCotas');
    const lado = { a: { x: 0, y: 0 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, comprimento: 100 };
    expect(alcanceAlemDoLado([{ x: -7, y: 50 }, { x: -12, y: 150 }, { x: 3, y: 10 }], lado)).toBe(7); // o de y=150 está fora do lado
    expect(deslocamentoDaCadeiaDoLote(7, 1.5, 4)).toBeCloseTo(4.5, 9);
    expect(deslocamentoDaCadeiaDoLote(2, 1.5, 4)).toBe(0); // já cabe antes da folga
    expect(deslocamentoDaCadeiaDoLote(0, 1.5, 4)).toBe(0);
  });

  it('PDF 1:200: nenhum número de cota cai em cima de outro', () => {
    const m = casaPertoDaDivisa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, op({ denominador: 200, papel: PAPEIS[1], zona: ZONA_1_5 }), enquadrar(m, 200, PAPEIS[1], true));
    const caixas = d.chamadas
      .filter((c) => c.tipo === 'texto' && c.args[4] === '#333333')
      .map((c) => {
        const [x, y, texto, alt] = c.args as [number, number, string, number];
        const largura = (texto.length * 0.55 + 0.1) * alt;
        return { texto, x0: x, x1: x + largura, y0: y - alt, y1: y };
      });
    expect(caixas.length).toBeGreaterThan(10);
    for (let i = 0; i < caixas.length; i++)
      for (let j = i + 1; j < caixas.length; j++) {
        const a = caixas[i];
        const b = caixas[j];
        const sobrepoe = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(sobrepoe, `"${a.texto}" × "${b.texto}"`).toBe(false);
      }
  });

  it('DXF: a cadeia do lote na lateral fica além de tudo o que as cotas da casa ocupam', () => {
    const m = casaPertoDaDivisa();
    const dxf = gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h', cotas: true, envelopes: envelopesParaExportacao(m, ZONA_1_5) });
    const v = dxf.split(/\r?\n/).map((x) => x.trim());
    const linhas: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (v[i] !== '0' || v[i + 1] !== 'LINE') continue;
      const c: Record<string, string> = {};
      for (let k = i + 2; k + 1 < v.length && v[k] !== '0'; k += 2) c[v[k]] = v[k + 1];
      if (c['8'] === 'PLANTA-COTAS') linhas.push({ x1: Number(c['10']), y1: Number(c['20']), x2: Number(c['11']), y2: Number(c['21']) });
    }
    // As linhas verticais à esquerda da divisa, agrupadas pela posição x: as do LOTE cobrem os 30 m do lado; as da
    // CASA, ~4 m (o lado dela). Os tiques (diagonais) e as chamadas (horizontais) ficam de fora.
    const porX = new Map<number, { min: number; max: number }>();
    for (const l of linhas) {
      if (Math.abs(l.x1 - l.x2) > 1e-6 || l.x1 >= 0 || Math.abs(l.y2 - l.y1) < 1) continue;
      const x = Math.round(l.x1);
      const g = porX.get(x) ?? { min: Infinity, max: -Infinity };
      porX.set(x, { min: Math.min(g.min, l.y1, l.y2), max: Math.max(g.max, l.y1, l.y2) });
    }
    const xsDoLote = [...porX].filter(([, g]) => g.max - g.min > 29000).map(([x]) => x);
    const xsDaCasa = [...porX].filter(([, g]) => g.max - g.min < 4500).map(([x]) => x);
    expect(xsDoLote.length).toBeGreaterThan(0);
    expect(xsDaCasa.length).toBeGreaterThan(0);
    const xLote = Math.max(...xsDoLote); // a linha do lote mais perto da divisa
    const xCasa = Math.min(...xsDaCasa); // a linha da casa mais longe
    expect(xLote).toBeLessThan(xCasa);
  });
});

