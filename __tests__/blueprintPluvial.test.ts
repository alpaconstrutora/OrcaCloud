/**
 * E6.1 — ÁGUAS PLUVIAIS: A DISCIPLINA E A CONTRIBUIÇÃO (29/09/2026, NBR 10844):
 * a rede PLUVIAL no kernel (trecho, ralo, caixa de areia, saída), a área de
 * contribuição de cada água do telhado e de cada laje descoberta, a
 * intensidade (informada > tabela > 150 mm/h até 100 m²) e Q = I·A/60.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, conexoesDerivadas, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  HIPOTESES_PLUVIAIS_PADRAO,
  INTENSIDADE_ATE_100M2_MMH,
  areaDeContribuicaoM2,
  contribuicaoPluvial,
  intensidadeDeProjeto,
  lajesDescobertas,
  vazaoDeProjetoLMin,
} from '../utils/blueprintPluvial';
import { resumoDasMedidas } from '../utils/blueprintBudget';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { DISCIPLINAS_DA_REDE } from '../utils/blueprintPranchaHidro';
import { COR_DA_DISCIPLINA } from '../utils/blueprintRede';

const casa = (larguraMm: number, fundoMm: number, inclinacaoPct = 30): BlueprintModel => {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  // Duas águas: a divisória ao meio do fundo, beirais nas duas testadas.
  const meio = fundoMm / 2;
  m = applyBatch(m, [
    { type: 'AddAgua', levelId: l, pontos: [point(0, 0), point(larguraMm, 0), point(larguraMm, meio), point(0, meio)], beiralIndex: 0, inclinacaoPct, baseMm: 2800, espessuraMm: 100 },
    { type: 'AddAgua', levelId: l, pontos: [point(0, meio), point(larguraMm, meio), point(larguraMm, fundoMm), point(0, fundoMm)], beiralIndex: 2, inclinacaoPct, baseMm: 2800, espessuraMm: 100 },
  ] as never).model;
  return m;
};

describe('E6.1 — as contas', () => {
  it('área de contribuição da água inclinada: Ap·(1 + i/2); a plana é a projeção', () => {
    expect(areaDeContribuicaoM2(50, 30)).toBeCloseTo(57.5, 9);
    expect(areaDeContribuicaoM2(50, 0)).toBe(50);
    expect(vazaoDeProjetoLMin(150, 60)).toBe(150);
  });

  it('intensidade: a informada vale sobre tudo; depois a tabela; depois 150 mm/h até 100 m²; senão nada', () => {
    expect(intensidadeDeProjeto({ cidade: 'São Paulo', periodoDeRetornoAnos: 5, intensidadeMmH: 200 }, 500)).toEqual({ mmH: 200, origem: 'INFORMADA' });
    expect(intensidadeDeProjeto({ cidade: 'São Paulo', periodoDeRetornoAnos: 25, intensidadeMmH: null }, 500)).toEqual({ mmH: 191, origem: 'TABELA' });
    expect(intensidadeDeProjeto(HIPOTESES_PLUVIAIS_PADRAO, 100)).toEqual({ mmH: INTENSIDADE_ATE_100M2_MMH, origem: 'ATE_100M2' });
    expect(intensidadeDeProjeto(HIPOTESES_PLUVIAIS_PADRAO, 100.01)).toBeNull();
    expect(intensidadeDeProjeto({ ...HIPOTESES_PLUVIAIS_PADRAO, cidade: 'Atlântida' }, 500)).toBeNull();
  });
});

describe('E6.1 — a contribuição do desenho', () => {
  it('casa 10 × 8 m em duas águas de 30 %: 40 m² de projeção cada, 46 m² de contribuição, 150 mm/h (até 100 m²)', () => {
    const c = contribuicaoPluvial(casa(10000, 8000), HIPOTESES_PLUVIAIS_PADRAO);
    expect(c.superficies).toHaveLength(2);
    expect(c.superficies.every((s) => s.tipo === 'AGUA' && Math.abs(s.areaProjecaoM2 - 40) < 1e-9 && Math.abs(s.areaContribuicaoM2 - 46) < 1e-9)).toBe(true);
    expect(c).toMatchObject({ intensidadeMmH: 150, origem: 'ATE_100M2', pendencias: [] });
    expect(c.vazaoTotalLMin).toBeCloseTo((150 * 92) / 60, 9);
    // O beiral é a aresta de `beiralIndex`: a testada da frente e a do fundo.
    expect(c.superficies.map((s) => s.beiral!.a.y)).toEqual([0, 8000]);
  });

  it('acima de 100 m² sem cidade nem intensidade: pendência, sem vazão; com a cidade, a tabela', () => {
    const m = casa(12000, 10000);
    const sem = contribuicaoPluvial(m, HIPOTESES_PLUVIAIS_PADRAO);
    expect(sem.intensidadeMmH).toBeNull();
    expect(sem.vazaoTotalLMin).toBeNull();
    expect(sem.pendencias[0]).toMatch(/acima de 100 m²\): escolha a cidade ou informe a intensidade/);
    const com = contribuicaoPluvial(m, { ...HIPOTESES_PLUVIAIS_PADRAO, cidade: 'Curitiba' });
    expect(com).toMatchObject({ intensidadeMmH: 204, origem: 'TABELA', pendencias: [] });
  });

  it('a laje do último pavimento fora do telhado entra (terraço); a coberta pelo telhado não', () => {
    let m = casa(10000, 8000);
    const l = m.levels[0].id;
    const laje = (x0: number): Command => ({ type: 'AddStructural', levelId: l, kind: 'LAJE', pontos: [point(x0, 0), point(x0 + 4000, 0), point(x0 + 4000, 3000), point(x0, 3000)], larguraMm: 0, alturaMm: 100, baseMm: 2700 }) as Command;
    m = applyBatch(m, [laje(1000), laje(12000)]).model;
    const lajes = contribuicaoPluvial(m, HIPOTESES_PLUVIAIS_PADRAO).superficies.filter((s) => s.tipo === 'LAJE');
    expect(lajes).toHaveLength(1);
    expect(lajes[0]).toMatchObject({ inclinacaoPct: 0, beiral: null });
    expect(lajes[0].areaContribuicaoM2).toBeCloseTo(12, 9);
  });

  it('sem telhado nem laje: diz que não há chuva a captar', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(contribuicaoPluvial(m, HIPOTESES_PLUVIAIS_PADRAO).pendencias[0]).toMatch(/Nenhuma água de telhado/);
  });
});

describe('F27-D5 — o terraço: a laje de pavimento intermediário fora do de cima é descoberta', () => {
  // Térreo com a laje (o teto dele = o piso do 1º) de 10 × 8 m; o 1º só na metade da esquerda (5 × 8 m) — o resto é terraço.
  const casaComTerraco = (comPrimeiro: boolean) => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 2900, defaultHeightMm: 2800 }).model;
    const [t, s] = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.id);
    const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    m = applyBatch(m, [{ type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(10000, 0), point(10000, 8000), point(0, 8000)], larguraMm: 0, alturaMm: 100, baseMm: 2700 } as Command]).model;
    if (comPrimeiro) m = applyBatch(m, [w(s, 0, 0, 5000, 0), w(s, 5000, 0, 5000, 8000), w(s, 5000, 8000, 0, 8000), w(s, 0, 8000, 0, 0)]).model;
    return m;
  };

  it('a metade sob o 1º fica coberta; a outra é o terraço (por amostragem); entra na contribuição como laje', () => {
    const l = lajesDescobertas(casaComTerraco(true));
    expect(l).toHaveLength(1);
    expect(l[0].areaM2).toBeGreaterThan(38);
    expect(l[0].areaM2).toBeLessThan(42);
    const c = contribuicaoPluvial(casaComTerraco(true), { ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 150 });
    expect(c.superficies.find((x) => x.tipo === 'LAJE')?.areaProjecaoM2).toBe(l[0].areaM2);
    // Sem nada em cima: a laje inteira é descoberta.
    expect(lajesDescobertas(casaComTerraco(false))[0].areaM2).toBeCloseTo(80, 0);
    // O 1º inteiro em cima, em dois cômodos (o cômodo do kernel cobre a parede — a do meio não vira terraço): nada descoberto.
    let inteiro = casaComTerraco(false);
    const s = [...inteiro.levels].sort((a, b) => a.elevationMm - b.elevationMm)[1].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: s, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    inteiro = applyBatch(inteiro, [w(0, 0, 10000, 0), w(10000, 0, 10000, 8000), w(10000, 8000, 0, 8000), w(0, 8000, 0, 0), w(5100, 0, 5100, 8000)]).model;
    expect(lajesDescobertas(inteiro)).toEqual([]);
  });

  it('o orçamento mede a área a impermeabilizar pelo extra das lajes descobertas', () => {
    const r = resumoDasMedidas(computeQuantities(casaComTerraco(true)), { lajesDescobertas: lajesDescobertas(casaComTerraco(true)) });
    const d = r.find((x) => x.medidaId === 'AREA_LAJE_DESCOBERTA')!;
    expect(d).toMatchObject({ dimensao: 'M2', elementos: 1 });
    expect(d.quantidade).toBeGreaterThan(38);
  });
});

describe('E6.1 — a rede PLUVIAL no kernel', () => {
  it('trecho pluvial até a caixa de areia e à saída: aceito, sem ponta aberta dentro da caixa', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'Ralo', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'RALO_PLUVIAL' },
      { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'CA', at: point(3000, 0), cotaMm: -600, tipoHidraulico: 'CAIXA_AREIA' },
      { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'Saída', at: point(3000, -4000), cotaMm: -700, tipoHidraulico: 'LIGACAO_PLUVIAL' },
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(0, 0), b: point(0, 0), cotaAMm: 0, cotaBMm: -300, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(0, 0), b: point(3000, 0), cotaAMm: -300, cotaBMm: -400, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(3000, 0), b: point(3000, -4000), cotaAMm: -600, cotaBMm: -700, bitolaMm: 100 },
    ] as never).model;
    expect(m.trechos!.every((t) => t.disciplina === 'PLUVIAL')).toBe(true);
    expect(conexoesDerivadas(m).pontasAbertas).toEqual([]);
  });

  it('o ponto pluvial não aceita outra disciplina; a espera aceita a pluvial', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'CA', at: point(0, 0), cotaMm: -600, tipoHidraulico: 'CAIXA_AREIA' })).toThrow();
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'Espera', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'PONTO_ESPERA' })).not.toThrow();
  });

  it('cor própria e a prancha sanitária leva as pluviais', () => {
    expect(new Set(Object.values(COR_DA_DISCIPLINA)).size).toBe(Object.keys(COR_DA_DISCIPLINA).length);
    expect(DISCIPLINAS_DA_REDE.ESGOTO).toContain('PLUVIAL');
  });
});

describe('E6.1 — premissas do estudo', () => {
  it('a coluna gravada: cidade e intensidade nulas por padrão; texto e número voltam; período fora da norma cai para 5', () => {
    expect(hipotesesHidroDaColuna({}).pluvial).toEqual(HIPOTESES_PLUVIAIS_PADRAO);
    expect(hipotesesHidroDaColuna({ pluvial: { cidade: 'Salvador', periodoDeRetornoAnos: 25, intensidadeMmH: 180 } }).pluvial).toEqual({ ...HIPOTESES_PLUVIAIS_PADRAO, cidade: 'Salvador', periodoDeRetornoAnos: 25, intensidadeMmH: 180 });
    expect(hipotesesHidroDaColuna({ pluvial: { cidade: 3, periodoDeRetornoAnos: 10, intensidadeMmH: 'x' } }).pluvial).toEqual(HIPOTESES_PLUVIAIS_PADRAO);
    // E6.2: a seção e o material da calha só valem se o sistema os conhece.
    expect(hipotesesHidroDaColuna({ pluvial: { secaoDaCalha: 'RETANGULAR', materialDaCalha: 'CERAMICA', declividadeDaCalhaPct: 1 } }).pluvial).toMatchObject({ secaoDaCalha: 'RETANGULAR', materialDaCalha: 'CERAMICA', declividadeDaCalhaPct: 1 });
    expect(hipotesesHidroDaColuna({ pluvial: { secaoDaCalha: 'TRIANGULAR', materialDaCalha: 'OURO' } }).pluvial).toEqual(HIPOTESES_PLUVIAIS_PADRAO);
  });
});
