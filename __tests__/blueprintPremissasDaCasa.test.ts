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
    expect(h.estrutura).toMatchObject({ lancar: false });
    expect(h.eletrica).toEqual({ lancar: true, chuveiroEletricoVA: 5500, medidor: true });
    expect(h.telhado).toMatchObject({ lancar: true, tipo: 'DUAS_AGUAS', inclinacaoPct: 30, beiralMm: 600 });
  });
});

describe('F12d — o sobrado nas premissas', () => {
  it('pavimentos 1, 2 ou Automático (ausente ou outro valor = Automático, F22); a térrea gravada vale; o grupo do sobrado completa; vira hipótese do motor', () => {
    expect(premissasDaCasaDaColuna({}).pavimentos).toBe('AUTOMATICO');
    expect(premissasDaCasaDaColuna({ pavimentos: 3 }).pavimentos).toBe('AUTOMATICO');
    expect(premissasDaCasaDaColuna({ pavimentos: 1 }).pavimentos).toBe(1);
    expect(hipotesesDasPremissas(premissasDaCasaDaColuna({})).pavimentos).toBe('AUTOMATICO');
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

describe('F14b — o forro nas premissas', () => {
  it('o grupo do forro completa como os outros e vira a hipótese do motor (as faixas ficam com o padrão dele)', () => {
    expect(premissasDaCasaDaColuna({}).forro).toEqual({ lancar: true, peDireitoLivrePermanenciaMm: 2500, peDireitoLivreDemaisMm: 2300, pisoAcabadoMm: 50 });
    const p = premissasDaCasaDaColuna({ forro: { lancar: false, peDireitoLivrePermanenciaMm: 2600, pisoAcabadoMm: 'x' } });
    expect(p.forro).toEqual({ lancar: false, peDireitoLivrePermanenciaMm: 2600, peDireitoLivreDemaisMm: 2300, pisoAcabadoMm: 50 });
    expect(hipotesesDasPremissas(p).forro).toEqual({ lancar: false, peDireitoLivrePermanenciaMm: 2600, peDireitoLivreDemaisMm: 2300, pisoAcabadoMm: 50 });
  });
});

describe('F15 — a unidade do Empreendimento nas premissas', () => {
  it('padrão: nenhuma; texto não vazio fica; vazio, número ou lixo voltam a nenhuma; não vira hipótese do motor', () => {
    expect(PREMISSAS_DA_CASA_PADRAO.unidadeId).toBeNull();
    expect(premissasDaCasaDaColuna({ unidadeId: 'u-07' }).unidadeId).toBe('u-07');
    for (const lixo of ['', '   ', 7, {}, null]) expect(premissasDaCasaDaColuna({ unidadeId: lixo }).unidadeId).toBeNull();
    expect('unidadeId' in hipotesesDasPremissas({ ...PREMISSAS_DA_CASA_PADRAO, unidadeId: 'u-07' })).toBe(false);
  });
});

describe('F23 — a estrutura nas premissas', () => {
  it('montante entre folhas e deslize do pilar: completam como os outros e chegam inteiros ao motor', () => {
    expect(premissasDaCasaDaColuna({}).estrutura).toEqual({ montanteEntreJanelasMm: 400, deslizeSobreAberturaMm: 1200 });
    const p = premissasDaCasaDaColuna({ estrutura: { montanteEntreJanelasMm: 600, deslizeSobreAberturaMm: 'x' } });
    expect(p.estrutura).toEqual({ montanteEntreJanelasMm: 600, deslizeSobreAberturaMm: 1200 });
    const h = hipotesesDasPremissas({ ...p, estrutura: { montanteEntreJanelasMm: 600, deslizeSobreAberturaMm: 800 } });
    expect(h.gerador?.janela).toMatchObject({ montanteMm: 600, maxMm: 2000, alturaMm: 1200 });
    expect(h.estrutura?.pilares).toMatchObject({ deslizeSobreAberturaMm: 800, vaoMaximoMm: 5000 });
  });
});

describe('F25 — a terraplenagem nas premissas', () => {
  it('completa como os outros grupos e chega ao motor sobre o padrão dele (os parâmetros de talude do padrão)', () => {
    expect(premissasDaCasaDaColuna({}).terraplenagem).toEqual({ lancar: true, margemDoPlatoMm: 1000, pisoAcimaDoPlatoMm: 150, alturaMaximaDoTaludeM: 1.5, rampaDeVeiculosMaxPct: 20 });
    const p = premissasDaCasaDaColuna({ terraplenagem: { lancar: false, alturaMaximaDoTaludeM: 2.5, margemDoPlatoMm: 'x' } });
    expect(p.terraplenagem).toEqual({ lancar: false, margemDoPlatoMm: 1000, pisoAcimaDoPlatoMm: 150, alturaMaximaDoTaludeM: 2.5, rampaDeVeiculosMaxPct: 20 });
    const h = hipotesesDasPremissas(p);
    expect(h.terraplenagem).toMatchObject({ lancar: false, alturaMaximaDoTaludeM: 2.5, rampaMaximaPct: 8.33 });
    expect(h.terraplenagem?.parametros).toBeDefined();
  });
});

describe('F26 — o muro nas premissas', () => {
  it('completa com o padrão (mureta com grade, 1,80 m, calçadas); tipo desconhecido cai no padrão; chega ao motor inteiro', () => {
    expect(premissasDaCasaDaColuna({}).muro).toEqual({ lancar: true, tipoDaFrente: 'MURETA_COM_GRADE', alturaDaFrenteMm: 1800, alturaDasDivisasMm: 1800, calcadas: true });
    const p = premissasDaCasaDaColuna({ muro: { tipoDaFrente: 'PORTA', alturaDasDivisasMm: 2200, calcadas: false }, terraplenagem: { rampaDeVeiculosMaxPct: 25 } });
    expect(p.muro).toEqual({ lancar: true, tipoDaFrente: 'MURETA_COM_GRADE', alturaDaFrenteMm: 1800, alturaDasDivisasMm: 2200, calcadas: false });
    const h = hipotesesDasPremissas(p);
    expect(h.muro).toMatchObject({ lancar: true, alturaDasDivisasMm: 2200, calcadas: false, espessuraMm: 150, materialDoJardim: 'GRAMA' });
    expect(h.terraplenagem).toMatchObject({ rampaDeVeiculosMaxPct: 25 });
  });
});
