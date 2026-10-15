/**
 * F10 da casa automática (15/10/2026): as premissas da casa guardadas no estudo — a coluna JSON parcial completada
 * com o padrão, sem deixar passar chave desconhecida, tipo errado ou enumerado inventado; e a ida para as hipóteses
 * do motor.
 */
import { describe, expect, it } from 'vitest';
import { PREMISSAS_DA_CASA_PADRAO, hipotesesDasPremissas, premissasDaCasaDaColuna } from '../utils/blueprintPremissasDaCasa';

describe('premissasDaCasaDaColuna', () => {
  it('vazio, nulo ou lixo → o padrão inteiro', () => {
    expect(premissasDaCasaDaColuna({})).toEqual(PREMISSAS_DA_CASA_PADRAO);
    expect(premissasDaCasaDaColuna(null)).toEqual(PREMISSAS_DA_CASA_PADRAO);
    expect(premissasDaCasaDaColuna('x')).toEqual(PREMISSAS_DA_CASA_PADRAO);
  });

  it('completa grupo a grupo; o que vier válido fica, o resto cai no padrão', () => {
    const p = premissasDaCasaDaColuna({
      curto: { dormitorios: 2, padrao: 'R1-A', areaAlvoM2: 90, inventado: 1 },
      disciplinas: { climatizacao: false, eletrica: 'sim' },
      telhado: { tipo: 'TRES_AGUAS', inclinacaoPct: 35 },
      ancoras: { aguaQuente: 'CHUVEIRO_ELETRICO' },
      sementes: 99,
    });
    expect(p.curto).toEqual({ ...PREMISSAS_DA_CASA_PADRAO.curto, dormitorios: 2, padrao: 'R1-A', areaAlvoM2: 90 });
    expect(p.disciplinas).toEqual({ ...PREMISSAS_DA_CASA_PADRAO.disciplinas, climatizacao: false }); // 'sim' não é booleano
    expect(p.telhado).toEqual({ ...PREMISSAS_DA_CASA_PADRAO.telhado, inclinacaoPct: 35 }); // TRES_AGUAS não existe
    expect(p.ancoras.aguaQuente).toBe('CHUVEIRO_ELETRICO');
    expect(p.sementes).toBe(8);
    expect('inventado' in p.curto).toBe(false);
  });

  it('a área alvo aceita null ("a do padrão"); os outros números, não', () => {
    expect(premissasDaCasaDaColuna({ curto: { areaAlvoM2: null, vagas: null } }).curto).toEqual({ ...PREMISSAS_DA_CASA_PADRAO.curto, areaAlvoM2: null });
  });
});

describe('hipotesesDasPremissas', () => {
  it('as disciplinas viram o "lançar" de cada grupo; as sementes, a lista', () => {
    const h = hipotesesDasPremissas({ ...PREMISSAS_DA_CASA_PADRAO, sementes: 3, disciplinas: { ...PREMISSAS_DA_CASA_PADRAO.disciplinas, climatizacao: false, estrutura: false } });
    expect(h.sementes).toEqual([1, 2, 3]);
    expect(h.climatizacao).toEqual({ lancar: false });
    expect(h.estrutura).toEqual({ lancar: false });
    expect(h.eletrica).toEqual({ lancar: true, chuveiroEletricoVA: 5500, medidor: true });
    expect(h.telhado).toMatchObject({ lancar: true, tipo: 'DUAS_AGUAS', inclinacaoPct: 30, beiralMm: 600 });
  });
});

describe('F12d — o sobrado nas premissas', () => {
  it('pavimentos só 1 ou 2 (o resto cai na térrea); o grupo do sobrado completa como os outros; vira hipótese do motor', () => {
    expect(premissasDaCasaDaColuna({}).pavimentos).toBe(1);
    expect(premissasDaCasaDaColuna({ pavimentos: 3 }).pavimentos).toBe(1);
    const p = premissasDaCasaDaColuna({ pavimentos: 2, sobrado: { lajeEntrePavimentosMm: 120, shaftMm: 'x' } });
    expect(p.pavimentos).toBe(2);
    expect(p.sobrado).toEqual({ lajeEntrePavimentosMm: 120, shaftMm: 400 });
    const h = hipotesesDasPremissas(p);
    expect(h.pavimentos).toBe(2);
    expect(h.sobrado).toMatchObject({ lajeEntrePavimentosMm: 120, shaftMm: 400 });
  });
});

describe('F13 — a pressão nas premissas', () => {
  it('o grupo da pressão completa como os outros e vira a hipótese do motor (sempre resolvendo)', () => {
    expect(premissasDaCasaDaColuna({}).pressao).toEqual({ caixaElevadaAteMm: 2000, potenciaDoPressurizadorW: 370 });
    const p = premissasDaCasaDaColuna({ pressao: { caixaElevadaAteMm: 5000, potenciaDoPressurizadorW: 'x' } });
    expect(p.pressao).toEqual({ caixaElevadaAteMm: 5000, potenciaDoPressurizadorW: 370 });
    expect(hipotesesDasPremissas(p).pressao).toEqual({ resolver: true, caixaElevadaAteMm: 5000, potenciaDoPressurizadorW: 370 });
  });
});
