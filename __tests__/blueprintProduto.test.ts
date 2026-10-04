/**
 * ESTUDO DE MASSA, fase M2 (02/10/2026): o produto — tipologias, núcleo
 * reservado antes da área vendável, unidades por pavimento, eficiências e
 * vagas que cabem na garagem pelo lançador real da E2.5.
 *
 * Contas da torre de prova (24 × 30 = 720 m², 10 pavimentos, mix 2 dorm. 58 m²
 * / 3 dorm. 75 m² meio a meio, hipóteses padrão):
 *   núcleo = 24 + 2 elevadores × 5 = 34 m² (10 pavimentos ≥ 9 → 2 elevadores)
 *   paredes = 6 % de 720 = 43,2 m²
 *   1º pav: útil 720 − 34 − 43,2 − 60 (portaria) = 582,8; corredor 8 % → 536,18 disponível
 *   tipo:   útil 642,8; corredor 8 % → 591,38 disponível
 *   média do mix = 66,5 m² → 8 unidades por pavimento (4 + 4 = 532 m²)
 *   → 80 unidades, 5.320 m² privativos, 73,9 % de eficiência.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import {
  comandosDoNucleoSugerido,
  distribuirProduto,
  elevadoresSugeridos,
  HIPOTESES_DO_PRODUTO_PADRAO,
  nucleoDoBloco,
  problemasDoProduto,
  produtoDaColuna,
  produtoSemente,
  unidadesNoPiso,
  vagasQueCabem,
} from '../utils/blueprintProduto';

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

function lote(): { m: BlueprintModel; nivel: string } {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const nivel = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: nivel, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return { m, nivel };
}

const massaDe = (m: BlueprintModel) =>
  medirMassa(m, {
    terreno: medirTerreno(divisasDoLote(m.boundaries)),
    limites: m.boundaries,
    recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
    zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 12 },
  });

describe('produto · unidades no pavimento', () => {
  it('reparte pelo mix com floor, maior resto e corte pela área', () => {
    const tipos = produtoSemente('RESIDENCIAL_MEDIO').tipologias;
    expect(unidadesNoPiso(591.38, tipos)).toEqual({ '2q': 4, '3q': 4 });
    expect(unidadesNoPiso(100, tipos)).toEqual({ '2q': 1, '3q': 0 });
    // Não cabe nem a menor: zero, nunca uma unidade de 58 m² em 50 m².
    expect(unidadesNoPiso(50, tipos)).toEqual({ '2q': 0, '3q': 0 });
    // Média 66,5 → 3 unidades em 200 m²; o maior resto daria 2 de 75 (208 m²), então corta.
    const r = unidadesNoPiso(200, tipos);
    expect(r['2q'] * 58 + r['3q'] * 75).toBeLessThanOrEqual(200);
    expect(r['2q'] + r['3q']).toBeGreaterThanOrEqual(2);
  });
});

describe('produto · núcleo', () => {
  it('elevadores pela hipótese; desenhado vence; lançar cria peças reais dentro do bloco', () => {
    const h = HIPOTESES_DO_PRODUTO_PADRAO;
    expect([4, 5, 8, 9].map((n) => elevadoresSugeridos(n, h))).toEqual([0, 1, 1, 2]);
    const { m: m0, nivel } = lote();
    let m = applyCommand(m0, { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 }).model;
    const b = m.blocos![0];
    expect(nucleoDoBloco(m, b, 10, h)).toMatchObject({ m2: 34, elevadores: 2, origem: 'SUGERIDO' });
    expect(nucleoDoBloco(m, b, 1, h)).toMatchObject({ m2: 0, origem: 'NENHUM' });
    const cmds = comandosDoNucleoSugerido(b, 2);
    expect(cmds.map((c) => (c as { tipo: string }).tipo)).toEqual(['ELEVADOR', 'ELEVADOR', 'SHAFT']);
    m = applyBatch(m, cmds).model;
    const n = nucleoDoBloco(m, m.blocos![0], 10, h);
    // 2 × (1,80 × 2,10) + 1,20 × 1,20 = 9,00 m², + escada/hall/shafts da hipótese (sem escada desenhada).
    expect(n.origem).toBe('DESENHADO');
    expect(n.elevadores).toBe(2);
    expect(n.m2).toBeCloseTo(9 + 24, 2);
  });
});

describe('produto · distribuição na massa', () => {
  it('torre de 10 pavimentos: 8 un/pav, 80 unidades, 73,9 %; vagas pedidas × cabem; meta', () => {
    const { m: m0, nivel } = lote();
    const m = applyBatch(m0, [
      { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 },
      { type: 'AddBloco', levelId: nivel, nome: 'Subsolo', pontos: ret(5000, 12500, 25000, 27500), cotaBaseMm: -6000, pavimentos: 2, uso: 'GARAGEM' },
    ]).model;
    const produto = { ...produtoSemente('RESIDENCIAL_MEDIO'), metaUnidades: 90 };
    const r = distribuirProduto(m, massaDe(m), produto, 1.5);
    const torre = r.blocos.find((b) => b.nome === 'Torre')!;
    expect(torre.nucleo).toMatchObject({ m2: 34, elevadores: 2, origem: 'SUGERIDO' });
    expect(torre.pisos[0]).toMatchObject({ comumM2: 60, unidades: 8 });
    expect(torre.pisos[0].privativaDisponivelM2).toBeCloseTo(536.18, 1);
    expect(torre.pisos[1].privativaDisponivelM2).toBeCloseTo(591.38, 1);
    expect(torre.unidadesPorPavimento).toBe(8);
    expect(r.unidades).toBe(80);
    expect(r.porTipologia.map((t) => [t.id, t.unidades])).toEqual([['2q', 40], ['3q', 40]]);
    expect(r.privativaTotalM2).toBe(5320);
    expect(r.privativaMediaM2).toBe(66.5);
    expect(torre.eficienciaDoPavimentoPct).toBe(73.9);
    // Construída = 7.200 da torre + 600 da garagem (2 × 300).
    expect(r.areaConstruidaM2).toBe(7800);
    expect(r.eficienciaGlobalPct).toBe(Math.round((5320 / 7800) * 1000) / 10);
    expect(r.areaComumPorUnidadeM2).toBe(Math.round(((7800 - 5320) / 80) * 100) / 100);
    // Vagas: produto 40 × 1 + 40 × 2 = 120; zona 1,5 × 80 = 120.
    expect(r.vagasDoProduto).toBe(120);
    expect(r.vagasDaZona).toBe(120);
    expect(r.vagasExigidas).toBe(120);
    const sub = r.blocos.find((b) => b.nome === 'Subsolo')!;
    expect(sub.vagasPorPavimento).toBe(vagasQueCabem(ret(5000, 12500, 25000, 27500), 'PERPENDICULAR'));
    expect(sub.vagas).toBe(sub.vagasPorPavimento * 2);
    expect(r.vagasQueCabem).toBe(sub.vagas);
    expect(r.vagasFaltando).toBe(120 - sub.vagas);
    expect(r.indiceDeGaragemM2).toBe(Math.round((600 / sub.vagas) * 100) / 100);
    expect(r.meta).toEqual({ unidades: 90, diferenca: -10 });
    expect(r.avisos.join(' ')).toMatch(/Meta de 90 unidades: a massa comporta 80/);
    expect(r.avisos.join(' ')).toMatch(/Faltam \d+ vagas/);
  });

  it('a garagem de 20 × 15 m comporta 7 vagas — o mesmo número do lançador da E2.5', () => {
    expect(vagasQueCabem(ret(0, 0, 20000, 15000), 'PERPENDICULAR')).toBe(7);
    expect(vagasQueCabem([], 'PERPENDICULAR')).toBe(0);
  });

  it('bloco comercial só recebe tipologia comercial; misto recebe as duas; sem tipologia do uso, avisa', () => {
    const { m: m0, nivel } = lote();
    const m = applyBatch(m0, [
      { type: 'AddBloco', levelId: nivel, nome: 'Loja', pontos: ret(3000, 6000, 27000, 16000), pavimentos: 1, uso: 'COMERCIAL' },
      { type: 'AddBloco', levelId: nivel, nome: 'Casa', pontos: ret(3000, 20000, 15000, 30000), pavimentos: 2, uso: 'RESIDENCIAL' },
    ]).model;
    const comercial = distribuirProduto(m, massaDe(m), produtoSemente('COMERCIAL'));
    expect(comercial.blocos.find((b) => b.nome === 'Loja')!.unidades).toBeGreaterThan(0);
    expect(comercial.blocos.find((b) => b.nome === 'Casa')!.unidades).toBe(0);
    expect(comercial.avisos.join(' ')).toMatch(/"Casa" \(residencial\) não tem tipologia/);
    const misto = distribuirProduto(m, massaDe(m), produtoSemente('MISTO'));
    expect(misto.blocos.every((b) => b.unidades > 0)).toBe(true);
    // Um pavimento só: sem núcleo vertical.
    expect(misto.blocos.find((b) => b.nome === 'Loja')!.nucleo.origem).toBe('NENHUM');
  });
});

describe('produto · coluna e problemas', () => {
  it('lê o JSONB com tolerância; acusa mix que não fecha', () => {
    const p = produtoDaColuna({ nome: '  ', padrao: 'XYZ', metaUnidades: '40', tipologias: [{ id: 'a', nome: 'A', uso: 'HOTEL', areaPrivativaM2: 'x', proporcaoPct: 70 }, { id: 'a', nome: 'B', proporcaoPct: 50 }, null], hipoteses: { paredesPct: 99 } });
    expect(p.nome).toBe('Produto');
    expect(p.padrao).toBe('R8-N');
    expect(p.metaUnidades).toBe(40);
    expect(p.tipologias.map((t) => [t.id, t.uso, t.areaPrivativaM2])).toEqual([['a', 'RESIDENCIAL', 60], ['a_', 'RESIDENCIAL', 60]]);
    expect(p.hipoteses.paredesPct).toBe(40);
    expect(p.hipoteses.circulacaoPct).toBe(HIPOTESES_DO_PRODUTO_PADRAO.circulacaoPct);
    expect(problemasDoProduto(p)).toEqual(['Residencial: o mix soma 120 % — as participações são normalizadas para 100 %.']);
    expect(produtoDaColuna(null).tipologias).toEqual([]);
    expect(problemasDoProduto(produtoSemente('MISTO'))).toEqual([]);
  });
});

/**
 * FOLGAS DA GARAGEM EM HIPÓTESES (04/10/2026): o afastamento das vagas ao contorno e a manobra entre vagas em fila
 * eram fixos no lançador (200 mm e 1.000 mm); agora são hipóteses do produto, que a contagem da massa usa.
 */
describe('vagasQueCabem · folgas da garagem', () => {
  const garagem: Point[] = [point(0, 0), point(30000, 0), point(30000, 20000), point(0, 20000)];

  it('sem folgas explícitas, conta como antes (200 mm de afastamento, 1 m de manobra em fila)', () => {
    expect(vagasQueCabem(garagem, 'PARALELA')).toBe(vagasQueCabem(garagem, 'PARALELA', { recuoDasVagasMm: 200, folgaDaFilaMm: 1000 }));
    expect(vagasQueCabem(garagem, 'PERPENDICULAR')).toBe(vagasQueCabem(garagem, 'PERPENDICULAR', { recuoDasVagasMm: 200 }));
  });

  it('manobra maior em fila cabe menos vagas; a manobra não muda a vaga de ré', () => {
    const fila1 = vagasQueCabem(garagem, 'PARALELA', { folgaDaFilaMm: 1000 });
    const fila3 = vagasQueCabem(garagem, 'PARALELA', { folgaDaFilaMm: 3000 });
    expect(fila3).toBeLessThan(fila1);
    expect(vagasQueCabem(garagem, 'PERPENDICULAR', { folgaDaFilaMm: 3000 })).toBe(vagasQueCabem(garagem, 'PERPENDICULAR'));
  });

  it('afastar mais as vagas do contorno cabe menos; abaixo da meia parede virtual (100 mm) vale 100', () => {
    expect(vagasQueCabem(garagem, 'PERPENDICULAR', { recuoDasVagasMm: 2000 })).toBeLessThan(vagasQueCabem(garagem, 'PERPENDICULAR', { recuoDasVagasMm: 200 }));
    // 0 mm faria a primeira fileira bater na parede virtual de 200 mm (medido: 11 contra 22 vagas): vira 100 mm.
    expect(vagasQueCabem(garagem, 'PERPENDICULAR', { recuoDasVagasMm: 0 })).toBe(vagasQueCabem(garagem, 'PERPENDICULAR', { recuoDasVagasMm: 100 }));
  });

  it('o produto guarda as duas folgas (com faixa) e o padrão é o de antes', async () => {
    const { HIPOTESES_DO_PRODUTO_PADRAO, produtoSanitizado } = (await import('../utils/blueprintProduto')) as unknown as {
      HIPOTESES_DO_PRODUTO_PADRAO: { recuoDasVagasMm: number; folgaDaFilaMm: number };
      produtoSanitizado?: unknown;
    };
    expect(HIPOTESES_DO_PRODUTO_PADRAO.recuoDasVagasMm).toBe(200);
    expect(HIPOTESES_DO_PRODUTO_PADRAO.folgaDaFilaMm).toBe(1000);
    void produtoSanitizado;
  });
});
