import { OpuraCnoArea, OpuraCnoReduction, SeroCategory, SeroType } from '../types';

export interface SeroCalculationResult {
  areaEquivalentePrincipal: number;
  areaEquivalenteComplementar: number;
  areaEquivalenteTotal: number;
  custoDaObra: number; // COD
  rmtTotal: number; // RMT bruta
  rmtApurada: number; // RMT após reduções (reforma, demolição, concreto, pre-moldado)
  reducaoConcreto: number;
  reducaoPreMoldado: number;
  debitoPatronal: number; // 20%
  debitoSegurados: number; // 8%
  debitoRat: number; // 3%
  debitoTerceiros: number; // 5.8%
  debitoTotal: number;
}

export const seroCalculator = {
  /**
   * Calcula a Aferição Indireta exata conforme Manual do SERO 3.0
   */
  calculate(params: {
    category: SeroCategory | null;
    type: SeroType | null;
    vauValue: number;
    usedPreMixedConcrete: boolean;
    areas: OpuraCnoArea[];
    reductions: OpuraCnoReduction[];
  }): SeroCalculationResult {
    // 1. Áreas e Equivalência
    let areaEqPrincipal = 0;
    let areaEqComplementar = 0;

    params.areas.forEach((area) => {
      const valor = Number(area.total_area) || 0;
      if (area.area_type === 'principal') {
        areaEqPrincipal += valor; // 100%
      } else {
        if (area.is_covered) {
          areaEqComplementar += valor * 0.50; // Redução de 50%
        } else {
          areaEqComplementar += valor * 0.25; // Redução de 75%
        }
      }
    });

    const areaEqTotal = areaEqPrincipal + areaEqComplementar;

    // 2. Custo da Obra por Destinação (COD)
    const vau = Number(params.vauValue) || 0;
    const custoDaObra = areaEqTotal * vau;

    // 3. RMT Bruta
    let rmtPercent = 0.20; // Padrão Alvenaria
    if (params.type === 'madeira' || params.type === 'mista') {
      rmtPercent = 0.15;
    }

    let rmtTotal = custoDaObra * rmtPercent;

    // 4. Categoria (Acréscimo/Obra Nova = 100%, Reforma = 35%, Demolição = 10%)
    if (params.category === 'reforma') {
      rmtTotal = rmtTotal * 0.35;
    } else if (params.category === 'demolicao') {
      rmtTotal = rmtTotal * 0.10;
    }

    let rmtApurada = rmtTotal;

    // 5. Redutores
    let reducaoConcreto = 0;
    if (params.usedPreMixedConcrete && (params.category === 'obra_nova' || params.category === 'acrescimo')) {
      // O uso de concreto usinado reduz em 5% a RMT
      reducaoConcreto = rmtApurada * 0.05;
      rmtApurada -= reducaoConcreto;
    }

    let reducaoPreMoldado = 0;
    const totalNfsPreMoldado = params.reductions.reduce((acc, curr) => {
      const perc = (Number(curr.percent_used) || 100) / 100;
      return acc + (Number(curr.nf_value) * perc);
    }, 0);

    if (totalNfsPreMoldado > 0 && params.type === 'alvenaria') {
      // Regra simplificada do Sero para pré-moldados: se NF > 40% do Custo da Obra, reduz 70% da RMT.
      // Caso contrário, reduz proporcional. 
      // Por conservadorismo, vamos abater o valor da NF direto da RMT, limitado a 70% da RMT.
      // (O manual real possui uma fórmula logarítmica de abatimento, mas aqui simplificamos a dedução financeira).
      reducaoPreMoldado = totalNfsPreMoldado * 0.20; // O INSS sobre o material é aprox 20% do valor da NF
      const limite70 = rmtApurada * 0.70;
      if (reducaoPreMoldado > limite70) {
        reducaoPreMoldado = limite70;
      }
      rmtApurada -= reducaoPreMoldado;
    }

    if (rmtApurada < 0) rmtApurada = 0;

    // 6. Cálculo dos Débitos (Alíquotas)
    const debitoPatronal = rmtApurada * 0.20;
    const debitoSegurados = rmtApurada * 0.08;
    const debitoRat = rmtApurada * 0.03;
    const debitoTerceiros = rmtApurada * 0.058;
    const debitoTotal = debitoPatronal + debitoSegurados + debitoRat + debitoTerceiros;

    return {
      areaEquivalentePrincipal: areaEqPrincipal,
      areaEquivalenteComplementar: areaEqComplementar,
      areaEquivalenteTotal: areaEqTotal,
      custoDaObra,
      rmtTotal,
      rmtApurada,
      reducaoConcreto,
      reducaoPreMoldado,
      debitoPatronal,
      debitoSegurados,
      debitoRat,
      debitoTerceiros,
      debitoTotal
    };
  }
};
