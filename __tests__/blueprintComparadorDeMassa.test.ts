/**
 * ESTUDO DE MASSA, fase M4 (02/10/2026): o comparador de cenários (§17 do
 * pedido) — todas as alternativas com a mesma régua, destaques por linha, sem
 * vencedor geral; nome sugerido "EM-00N — X pav / Y un" (§22).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { produtoSemente } from '../utils/blueprintProduto';
import { cenarioDeMassa, destaquesDoComparador, formatarDoComparador, LINHAS_DO_COMPARADOR, nomeSugeridoDoCenario, type ReguaDoComparador } from '../utils/blueprintComparadorDeMassa';

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

function lote(blocos: Command[]): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return applyBatch(m, blocos.map((c) => ({ ...c, levelId: t }) as Command)).model;
}

const REGUA: ReguaDoComparador = {
  zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 12 },
  recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
  produto: produtoSemente('RESIDENCIAL_MEDIO'),
  cub: { valorM2: 2000, fonte: 'TABELA', referencia: 'teste' },
  vagasPorUnidadeDaZona: null,
};

const A = lote([{ type: 'AddBloco', levelId: '', nome: 'Torre única', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 } as Command]);
const B = lote([
  { type: 'AddBloco', levelId: '', nome: 'Torre 1', pontos: ret(2000, 6000, 14000, 30000), pavimentos: 6 } as Command,
  { type: 'AddBloco', levelId: '', nome: 'Torre 2', pontos: ret(16000, 6000, 28000, 30000), pavimentos: 6 } as Command,
]);
const SEM = lote([]);

describe('comparador de cenários de massa', () => {
  it('mede cada cenário com a mesma régua; alternativa sem bloco não é cenário', () => {
    const a = cenarioDeMassa(A, REGUA)!;
    const b = cenarioDeMassa(B, REGUA)!;
    expect(cenarioDeMassa(SEM, REGUA)).toBeNull();
    expect(a).toMatchObject({ blocos: 1, pavimentosMax: 10, unidades: 80, areaConstruidaM2: 7200, complexidade: 1 });
    expect(b).toMatchObject({ blocos: 2, pavimentosMax: 6, complexidade: 2 });
    expect(b.areaConstruidaM2).toBe(2 * 288 * 6);
    expect(a.vgv).toBe(46_120_000);
    expect(a.custoTotal).not.toBeNull();
    expect(b.unidades).toBeGreaterThan(0);
    // Sem produto, o cenário ainda existe (massa), mas sem unidades nem dinheiro.
    const semProduto = cenarioDeMassa(A, { ...REGUA, produto: { ...REGUA.produto, tipologias: [] } })!;
    expect(semProduto).toMatchObject({ unidades: 0, vgv: null, custoTotal: null });
  });

  it('destaca quem ganha CADA linha com critério; empate total e linha sem concorrente não destacam', () => {
    const a = cenarioDeMassa(A, REGUA)!;
    const b = cenarioDeMassa(B, REGUA)!;
    const d = destaquesDoComparador([a, b, null]);
    expect(d.unidades).toEqual([a.unidades >= b.unidades ? 0 : 1]);
    expect(d.vgv).toEqual([a.vgv! >= b.vgv! ? 0 : 1]);
    expect(d.custoTotal).toEqual([a.custoTotal! <= b.custoTotal! ? 0 : 1]);
    expect(d.complexidade).toEqual([0]); // 1 bloco < 2 blocos
    // Linhas informativas nunca destacam.
    expect(d.blocos).toBeUndefined();
    expect(d.pavimentosMax).toBeUndefined();
    // Empate total: nada a destacar.
    expect(destaquesDoComparador([a, a]).vgv).toBeUndefined();
    // Um cenário só: sem concorrente, sem destaque.
    expect(destaquesDoComparador([a, null])).toEqual({});
    // Toda linha com critério diz o nome do destaque, como o pedido lista.
    for (const l of LINHAS_DO_COMPARADOR) if (l.melhor) expect(l.destaque).toBeTruthy();
  });

  it('nome sugerido e formatação', () => {
    expect(nomeSugeridoDoCenario(2, { pavimentosMax: 10, unidades: 80 })).toBe('EM-002 — 10 pav / 80 un');
    expect(nomeSugeridoDoCenario(12, { pavimentosMax: 6, unidades: 0 })).toBe('EM-012 — 6 pav');
    expect(nomeSugeridoDoCenario(1, null)).toBe('EM-001');
    expect(formatarDoComparador(46_120_000, 'brl')).toBe('R$ 46,1 mi');
    expect(formatarDoComparador(73.94, 'pct')).toBe('73,9 %');
    expect(formatarDoComparador(null, 'm2')).toBe('—');
  });
});
