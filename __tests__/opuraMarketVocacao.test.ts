import { describe, it, expect } from 'vitest';
import {
  calcularVocacao,
  HIPOTESES_PADRAO,
  DESCRICAO_HIPOTESES,
  REGRAS_PADRAO,
  validarHipoteses,
  hipotesesDoEstudo,
  regraDoPreco,
} from '../utils/opuraMarketVocacao';

/**
 * Fase 5 do plano docs/planos/2026-10-07-opura-market-intelligence.md: toda folga
 * do cálculo de vocação virou hipótese editável. Com os PADRÕES, o resultado tem
 * de ser o mesmo do cálculo antigo, que estava escrito no meio do componente.
 */

/** O cálculo antigo de OpuraMarketModule.tsx (até 07/10/2026), copiado para servir de gabarito. */
function calculoAntigo(stats: { totalListings: number; pricePerM2Avg: number }, areaTerreno: number) {
  const preco = stats.pricePerM2Avg;
  const areaConstruivel = areaTerreno * 4;
  const areaVenda = areaConstruivel * 0.82;
  return {
    areaConstruivel,
    areaVenda,
    vgv: areaVenda * preco,
    velocidade: preco > 4500 ? 6.5 : 8.2,
    risco: Math.min(Math.max(Math.round(100 - (stats.totalListings * 4) - (preco / 120)), 15), 95),
  };
}

const stats = (total: number, preco: number) => ({
  totalListings: total, pricePerM2Avg: preco, ticketAvg: 600000, areaAvg: 110, bedroomsAvg: 2.5, suitesAvg: 1,
});

describe('vocação · com as hipóteses padrão, o mesmo resultado do cálculo antigo', () => {
  // Raio real de 1 km no centro de Cambuí em 07/10/2026: 115 anúncios, R$ 4.638,79/m².
  it.each([
    ['raio real de Cambuí', 115, 4638.79, 1500],
    ['pouca concorrência, preço baixo', 3, 2900, 800],
    ['preço exatamente no limiar', 10, 4500, 1200],
    ['luxo', 2, 9800, 2500],
  ])('%s', (_rotulo, total, preco, area) => {
    const r = calcularVocacao(stats(total, preco), area, null, HIPOTESES_PADRAO);
    const g = calculoAntigo(stats(total, preco), area);
    expect(r.areaConstruivel).toBeCloseTo(g.areaConstruivel, 6);
    expect(r.areaVenda).toBeCloseTo(g.areaVenda, 6);
    expect(r.estimatedVgv).toBeCloseTo(g.vgv, 4);
    expect(r.estimatedAbsorptionVelocity).toBe(g.velocidade);
    expect(r.riskScore).toBe(g.risco);
  });

  it('o padrão construtivo e o mix vêm das mesmas faixas de antes', () => {
    expect(calcularVocacao(stats(5, 3100), 1000, null, HIPOTESES_PADRAO).recStandard).toBe('Econômico');
    expect(calcularVocacao(stats(5, 4000), 1000, null, HIPOTESES_PADRAO).recStandard).toBe('Médio');
    expect(calcularVocacao(stats(5, 4638.79), 1000, null, HIPOTESES_PADRAO).recStandard).toBe('Médio-Alto');
    expect(calcularVocacao(stats(5, 6000), 1000, null, HIPOTESES_PADRAO).recStandard).toBe('Alto Padrão');
    expect(calcularVocacao(stats(5, 9800), 1000, null, HIPOTESES_PADRAO).recStandard).toBe('Luxo');
  });

  it('ticket sugerido = preço × área ponderada pelo mix (as regras padrão também)', () => {
    // Médio-Alto: 70 m² × 50 % + 90 m² × 50 % = 80 m² — igual ao multiplicador antigo.
    expect(calcularVocacao(stats(5, 5000), 1000, null, HIPOTESES_PADRAO).productMix.ticketSugerido).toBeCloseTo(5000 * 80, 6);
    // Médio: 65 × 60 % + 80 × 40 % = 71 m² (o antigo usava 68, que não batia com as próprias tipologias).
    expect(calcularVocacao(stats(5, 4000), 1000, null, HIPOTESES_PADRAO).productMix.ticketSugerido).toBeCloseTo(4000 * 71, 6);
  });
});

describe('vocação · cada hipótese muda o que diz que muda', () => {
  const base = calcularVocacao(stats(20, 5000), 1500, null, HIPOTESES_PADRAO);

  it('coeficiente de aproveitamento 4 → 2 corta área construível e VGV pela metade', () => {
    const r = calcularVocacao(stats(20, 5000), 1500, null, { ...HIPOTESES_PADRAO, coeficienteAproveitamento: 2 });
    expect(r.areaConstruivel).toBeCloseTo(base.areaConstruivel / 2, 6);
    expect(r.estimatedVgv).toBeCloseTo(base.estimatedVgv / 2, 4);
  });

  it('eficiência de venda muda área vendável e VGV, não a área construível', () => {
    const r = calcularVocacao(stats(20, 5000), 1500, null, { ...HIPOTESES_PADRAO, eficienciaVenda: 0.7 });
    expect(r.areaConstruivel).toBeCloseTo(base.areaConstruivel, 6);
    expect(r.estimatedVgv).toBeCloseTo(1500 * 4 * 0.7 * 5000, 4);
  });

  it('velocidade segue o limiar e os dois valores', () => {
    const h = { ...HIPOTESES_PADRAO, limiarPrecoVelocidade: 6000, velocidadeAbaixoDoLimiar: 3 };
    expect(calcularVocacao(stats(20, 5000), 1500, null, h).estimatedAbsorptionVelocity).toBe(3);
  });

  it('risco respeita peso por concorrente, divisor do preço, piso e teto', () => {
    const h = { ...HIPOTESES_PADRAO, riscoPorConcorrente: 1, riscoDivisorPreco: 1000 };
    expect(calcularVocacao(stats(20, 5000), 1500, null, h).riskScore).toBe(Math.round(100 - 20 - 5));
    expect(calcularVocacao(stats(500, 5000), 1500, null, HIPOTESES_PADRAO).riskScore).toBe(15);
    expect(calcularVocacao(stats(0, 0.01), 1500, null, { ...HIPOTESES_PADRAO, riscoBase: 150 }).riskScore).toBe(95);
  });

  it('o resultado carrega as hipóteses usadas (vão para o estudo, o PDF e o IMOVIB)', () => {
    const h = { ...HIPOTESES_PADRAO, custoObraM2: 3100 };
    expect(calcularVocacao(stats(20, 5000), 1500, null, h).hipoteses).toEqual(h);
  });
});

describe('regras da praça × regras padrão', () => {
  const regraPropria = [{ standard: 'Luxo' as const, minPrice: 0, maxPrice: 3000, tipologias: [{ tipo: 'Casa', area: 100, mix: 100 }] }];

  it('regra da praça vence quando cobre o preço', () => {
    const r = calcularVocacao(stats(5, 2500), 1000, regraPropria, HIPOTESES_PADRAO);
    expect(r.recStandard).toBe('Luxo');
    expect(r.productMix.ticketSugerido).toBeCloseTo(2500 * 100, 6);
  });

  it('preço fora das regras da praça cai nas padrão', () => {
    expect(regraDoPreco(4000, regraPropria).standard).toBe('Médio');
  });

  it('as regras padrão cobrem de 0 ao infinito sem buraco', () => {
    for (let i = 1; i < REGRAS_PADRAO.length; i++) expect(REGRAS_PADRAO[i].minPrice).toBe(REGRAS_PADRAO[i - 1].maxPrice);
    expect(REGRAS_PADRAO[0].minPrice).toBe(0);
    expect(REGRAS_PADRAO[REGRAS_PADRAO.length - 1].maxPrice).toBeNull();
  });
});

describe('hipóteses · validação e leitura do estudo gravado', () => {
  it('os padrões são válidos e toda hipótese tem descrição', () => {
    expect(validarHipoteses(HIPOTESES_PADRAO)).toEqual([]);
    expect(DESCRICAO_HIPOTESES.map((d) => d.chave).sort()).toEqual(Object.keys(HIPOTESES_PADRAO).sort());
  });

  it('acusa fora da faixa, não número e piso acima do teto', () => {
    const erros = validarHipoteses({ ...HIPOTESES_PADRAO, eficienciaVenda: 1.4, custoObraM2: Number.NaN, riscoMinimo: 90, riscoMaximo: 20 });
    expect(erros.join(' | ')).toMatch(/Eficiência de venda/);
    expect(erros.join(' | ')).toMatch(/Custo de obra/);
    expect(erros.join(' | ')).toMatch(/mínimo maior que o máximo/);
  });

  it('estudo novo devolve as hipóteses gravadas; campo ausente cai no padrão', () => {
    const h = hipotesesDoEstudo({ zone: 'ZUM', hipoteses: { coeficienteAproveitamento: 2.5, custoObraM2: 'x' } });
    expect(h.coeficienteAproveitamento).toBe(2.5);
    expect(h.custoObraM2).toBe(HIPOTESES_PADRAO.custoObraM2);
  });

  it('estudo antigo (só ca e to) vira CA e taxa de ocupação', () => {
    const h = hipotesesDoEstudo({ zone: 'ZUM', ca: 3, to: 0.5 });
    expect(h.coeficienteAproveitamento).toBe(3);
    expect(h.taxaOcupacao).toBe(50);
    expect(hipotesesDoEstudo(null)).toEqual(HIPOTESES_PADRAO);
  });
});
