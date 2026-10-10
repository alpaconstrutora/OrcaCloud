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

