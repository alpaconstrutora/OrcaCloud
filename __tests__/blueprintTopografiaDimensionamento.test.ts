/**
 * Fase 7: pré-dimensionamento hidráulico (Racional + Manning) e estrutural
 * (muro de arrimo por Rankine) — `utils/blueprintTopografiaDimensionamento.ts`.
 */
import { describe, expect, it } from 'vitest';
import { estruturaDaColuna, hidraulicaDaColuna } from '../hooks/useBlueprintTerraplenagem';
import type { Point } from '../utils/blueprintKernel';
import { nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  analisarDrenagem,
  cotaDeProjeto,
  PARAMETROS_PADRAO,
  type LinhaDeDrenagem,
  type MuroDeArrimo,
} from '../utils/blueprintTopografiaAnalises';
import {
  areasDeContribuicao,
  capacidadeDaSecao,
  dimensionarDrenagem,
  dimensionarMuro,
  ESTRUTURA_PADRAO,
  HIDRAULICA_PADRAO,
  intensidadeDeChuva,
  vazaoRacional,
} from '../utils/blueprintTopografiaDimensionamento';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

describe('chuva e vazão', () => {
  it('IDF de São Paulo: T = 10 anos, t = 10 min → ≈ 147 mm/h; a informada vence', () => {
    expect(intensidadeDeChuva(HIDRAULICA_PADRAO)).toBeCloseTo(147, 0);
    expect(intensidadeDeChuva({ ...HIDRAULICA_PADRAO, intensidadeMmH: 100 })).toBe(100);
    expect(intensidadeDeChuva({ ...HIDRAULICA_PADRAO, tempoDeRetornoAnos: 25 })).toBeGreaterThan(147);
  });

  it('Método Racional: C 0,9 · 147 mm/h · 1000 m² ≈ 36,8 L/s', () => {
    expect(vazaoRacional(0.9, 147, 1000) * 1000).toBeCloseTo(36.75, 1);
    expect(vazaoRacional(0.9, 147, 0)).toBe(0);
  });

  it('Manning: canaleta 30 × 30 a 0,5 % com lâmina 80 % leva ≈ 80 L/s a ≈ 1,1 m/s; tubo DN 300 cheio a 75 %', () => {
    const c = capacidadeDaSecao({ forma: 'RETANGULAR', larguraM: 0.3, alturaM: 0.3, rotulo: '' }, 0.5, 0.013, 0.8);
    expect(c.vazaoM3s * 1000).toBeCloseTo(79.8, 0);
    expect(c.velocidadeMs).toBeCloseTo(1.11, 1);
    const t = capacidadeDaSecao({ forma: 'CIRCULAR', diametroMm: 300, rotulo: '' }, 1, 0.013, 0.75);
    expect(t.vazaoM3s).toBeGreaterThan(0.05);
    expect(t.vazaoM3s).toBeLessThan(0.12);
  });
});

describe('dimensionar a linha', () => {
  const g = gradeDe(() => 100, 500);
  const cota = cotaDeProjeto(g, null, null, PARAMETROS_PADRAO);
  const linha: LinhaDeDrenagem = { id: 'a', nome: 'A', tipo: 'CANALETA', pontos: [{ x: 5000, y: 20000 }, { x: 35000, y: 20000 }] };
  const analise = analisarDrenagem(linha, cota, 0.5);

  it('1000 m² a 0,5 %: 20 × 20 não leva (27 L/s), 30 × 30 leva (80 L/s) — escolhe 30 × 30', () => {
    // t informado (10 min) para a conta bater com a IDF de referência; Kirpich é testado na fase 8.
    const d = dimensionarDrenagem(linha, analise, 1000, { ...HIDRAULICA_PADRAO, tempoDeConcentracao: 'INFORMADO' });
    expect(d.vazaoM3s * 1000).toBeCloseTo(36.8, 0);
    expect(d.declividadeP).toBeCloseTo(0.5, 6);
    expect(d.secao?.rotulo).toBe('30 × 30 cm');
    expect(d.ocupacao).toBeGreaterThan(0.4);
    expect(d.ocupacao).toBeLessThan(0.5);
    expect(d.atende).toBe(true);
  });

  it('tubo usa o catálogo de diâmetros; área enorme estoura o catálogo com aviso', () => {
    const tubo = dimensionarDrenagem({ ...linha, tipo: 'TUBO' }, analise, 1000, HIDRAULICA_PADRAO);
    expect(tubo.secao?.forma).toBe('CIRCULAR');
    expect(tubo.secao?.rotulo).toMatch(/^DN /);
    const gigante = dimensionarDrenagem(linha, analise, 500_000, HIDRAULICA_PADRAO);
    expect(gigante.secao).toBeNull();
    expect(gigante.atende).toBe(false);
    expect(gigante.avisos.some((a) => /maior seção do catálogo/.test(a))).toBe(true);
  });

  it('sem área contribuinte não atende e avisa', () => {
    const d = dimensionarDrenagem(linha, analise, 0, HIDRAULICA_PADRAO);
    expect(d.atende).toBe(false);
    expect(d.avisos.some((a) => /Sem área contribuinte/.test(a))).toBe(true);
  });

  it('a área sugerida reparte o lote pela linha mais próxima', () => {
    const oeste: LinhaDeDrenagem = { id: 'o', nome: 'O', tipo: 'CANALETA', pontos: [{ x: 5000, y: 0 }, { x: 5000, y: 40000 }] };
    const leste: LinhaDeDrenagem = { id: 'l', nome: 'L', tipo: 'CANALETA', pontos: [{ x: 35000, y: 0 }, { x: 35000, y: 40000 }] };
    const areas = areasDeContribuicao(g, LOTE, [oeste, leste]);
    expect(areas.o).toBeCloseTo(800, 0);
    expect(areas.l).toBeCloseTo(800, 0);
    expect(areas.o + areas.l).toBeCloseTo(1600, 0);
    expect(areasDeContribuicao(g, LOTE, [])).toEqual({});
  });
});

function muroDe(alturaCorte: number, alturaAterro = 0, comprimento = 10): MuroDeArrimo {
  return {
    aresta: 1,
    a: { x: 0, y: 0 },
    b: { x: 0, y: comprimento * 1000 },
    normal: { x: 1, y: 0 },
    comprimentoM: comprimento,
    alturaMaxCorteM: alturaCorte,
    alturaMaxAterroM: alturaAterro,
    alturaMediaM: Math.max(alturaCorte, alturaAterro) / 2,
    areaDeFaceM2: Math.max(alturaCorte, alturaAterro) * comprimento * 0.5,
    lado: alturaCorte > 0 ? 'CORTE' : alturaAterro > 0 ? 'ATERRO' : 'NENHUM',
  };
}

describe('muro de arrimo', () => {
  it('2,5 m vistos + 0,5 de embutimento: gravidade, base entre 0,5·H e 1,2·H, as três verificações fecham', () => {
    const d = dimensionarMuro(muroDe(2.5), ESTRUTURA_PADRAO);
    expect(d.tipo).toBe('GRAVIDADE');
    expect(d.alturaM).toBeCloseTo(3, 9);
    expect(d.baseM).toBeGreaterThanOrEqual(1.5);
    expect(d.baseM).toBeLessThanOrEqual(3.6);
    expect(d.fsTombamento).toBeGreaterThanOrEqual(2);
    expect(d.fsDeslizamento).toBeGreaterThanOrEqual(1.5);
    expect(d.tensaoMaxKPa).toBeLessThanOrEqual(200);
    expect(d.atende).toBe(true);
    // Empuxo: Ka = 1/3 → 0,5·(1/3)·18·9 + (1/3)·10·3 = 27 + 10 = 37 kN/m.
    expect(d.empuxoKNm).toBeCloseTo(37, 1);
    expect(d.volumeDeConcretoM3).toBeCloseTo(d.areaDaSecaoM2 * 10, 9);
    expect(d.armaduraKg).toBe(0);
    expect(d.barbacas).toBeGreaterThan(0);
    expect(d.drenoDePeM).toBe(10);
  });

  it('5 m: flexão em L, com sapata, aço e verificações fechando', () => {
    const d = dimensionarMuro(muroDe(4.5), ESTRUTURA_PADRAO);
    expect(d.tipo).toBe('FLEXAO');
    expect(d.sapataM).not.toBeNull();
    expect(d.topoM).toBeGreaterThanOrEqual(0.2);
    expect(d.atende).toBe(true);
    expect(d.armaduraKg).toBeCloseTo(d.volumeDeConcretoM3 * 80, 6);
    // Forçar gravidade em 5 m: ainda fecha, mas avisa que sai pesado.
    const g = dimensionarMuro(muroDe(4.5), { ...ESTRUTURA_PADRAO, tipo: 'GRAVIDADE' });
    expect(g.tipo).toBe('GRAVIDADE');
    expect(g.avisos.some((a) => /pesado/.test(a))).toBe(true);
  });

  it('solo ruim: a base cresce; solo mole demais não fecha e avisa; muro sem altura avisa', () => {
    const bom = dimensionarMuro(muroDe(2.5), ESTRUTURA_PADRAO);
    const ruim = dimensionarMuro(muroDe(2.5), { ...ESTRUTURA_PADRAO, anguloDeAtritoGraus: 20 });
    expect(ruim.baseM).toBeGreaterThan(bom.baseM);
    // Sobrecarga absurda (300 kN/m²): nem a base de 1,2·H segura — não fecha e avisa.
    const esmagado = dimensionarMuro(muroDe(2.5), { ...ESTRUTURA_PADRAO, sobrecargaKNm2: 300 });
    expect(esmagado.atende).toBe(false);
    expect(esmagado.avisos.some((a) => /não fecham/.test(a))).toBe(true);
    const nada = dimensionarMuro(muroDe(0), ESTRUTURA_PADRAO);
    expect(nada.avisos.some((a) => /não contém nada/.test(a))).toBe(true);
    expect(nada.barbacas).toBe(0);
    const alto = dimensionarMuro(muroDe(9), ESTRUTURA_PADRAO);
    expect(alto.atende).toBe(false);
    expect(alto.avisos.some((a) => /contenção especial/.test(a))).toBe(true);
  });
});

describe('hipóteses gravadas', () => {
  it('JSON parcial completa com o padrão e ignora lixo', () => {
    expect(hidraulicaDaColuna(null)).toEqual(HIDRAULICA_PADRAO);
    const h = hidraulicaDaColuna({ coeficienteDeEscoamento: 0.7, idf: { k: 1000 }, intensidadeMmH: 'x' });
    expect(h.coeficienteDeEscoamento).toBe(0.7);
    expect(h.idf).toEqual({ ...HIDRAULICA_PADRAO.idf, k: 1000 });
    expect(h.intensidadeMmH).toBeNull();
    expect(estruturaDaColuna({ tipo: 'FLEXAO', sobrecargaKNm2: 20 })).toEqual({ ...ESTRUTURA_PADRAO, tipo: 'FLEXAO', sobrecargaKNm2: 20 });
    expect(estruturaDaColuna({ tipo: 'X' }).tipo).toBe('AUTO');
  });
});
