// utils/opuraMarketVocacao.ts
//
// Vocação de um terreno no ÒPURA Market: padrão construtivo, mix de tipologias,
// VGV, velocidade de vendas e risco, a partir das estatísticas do raio.
// Plano: docs/planos/2026-10-07-opura-market-intelligence.md, Fase 5.
//
// Toda folga do cálculo é HIPÓTESE editável na tela (regra do projeto: "toda
// folga vira hipótese, nunca constante escondida"). Até a Fase 5 estas eram
// constantes no meio de OpuraMarketModule.tsx: coeficiente de aproveitamento 4,
// eficiência de venda 0,82, custo de obra R$ 2.500/m², taxa de ocupação 60 %,
// velocidade 6,5/8,2 % ao mês com limiar de R$ 4.500/m², e uma fórmula de risco
// com 100, 4 por concorrente, preço ÷ 120, piso 15 e teto 95. Os PADRÕES abaixo
// são exatamente esses números — o resultado só muda se alguém mexer.
//
// As regras padrão de padrão construtivo também moram aqui: antes eram duas
// cópias (uma no módulo, outra em CityRulesModal).

import type { OpuraMarketRule, OpuraMarketRadiusStats } from '../types';

export type PadraoConstrutivo = OpuraMarketRule['standard'];

export interface HipotesesVocacao {
  /** CA: área construída ÷ área do terreno. */
  coeficienteAproveitamento: number;
  /** Área vendável ÷ área construída (0 a 1). */
  eficienciaVenda: number;
  /** Taxa de ocupação, em %. Vai para o estudo e para o IMOVIB. */
  taxaOcupacao: number;
  /** Custo de obra, R$/m². Vai para o bloco do IMOVIB. */
  custoObraM2: number;
  /** Preço por m² que separa as duas velocidades de venda. */
  limiarPrecoVelocidade: number;
  /** Velocidade de venda (% do estoque ao mês) acima do limiar de preço. */
  velocidadeAcimaDoLimiar: number;
  /** Velocidade de venda (% ao mês) até o limiar de preço. */
  velocidadeAbaixoDoLimiar: number;
  /** Risco de partida, antes dos descontos. */
  riscoBase: number;
  /** Pontos de risco descontados por anúncio concorrente no raio. */
  riscoPorConcorrente: number;
  /** O preço por m² dividido por este número também desconta risco. */
  riscoDivisorPreco: number;
  riscoMinimo: number;
  riscoMaximo: number;
  /** Área comum ÷ área privativa de cada unidade criada no IMOVIB. */
  areaComumFator: number;
}

export const HIPOTESES_PADRAO: HipotesesVocacao = {
  coeficienteAproveitamento: 4,
  eficienciaVenda: 0.82,
  taxaOcupacao: 60,
  custoObraM2: 2500,
  limiarPrecoVelocidade: 4500,
  velocidadeAcimaDoLimiar: 6.5,
  velocidadeAbaixoDoLimiar: 8.2,
  riscoBase: 100,
  riscoPorConcorrente: 4,
  riscoDivisorPreco: 120,
  riscoMinimo: 15,
  riscoMaximo: 95,
  areaComumFator: 0.25,
};

export interface DescricaoHipotese {
  chave: keyof HipotesesVocacao;
  rotulo: string;
  unidade: string;
  min: number;
  max: number;
  passo: number;
  explicacao: string;
}

/** O que a tela mostra para cada hipótese: rótulo, unidade, faixa válida e o efeito. */
export const DESCRICAO_HIPOTESES: DescricaoHipotese[] = [
  { chave: 'coeficienteAproveitamento', rotulo: 'Coeficiente de aproveitamento', unidade: '×', min: 0.1, max: 20, passo: 0.1,
    explicacao: 'Área construída ÷ área do terreno (zoneamento). Multiplica a área construível e, com ela, o VGV.' },
  { chave: 'eficienciaVenda', rotulo: 'Eficiência de venda', unidade: '0–1', min: 0.3, max: 1, passo: 0.01,
    explicacao: 'Fração da área construída que vira área vendável (o resto é circulação, garagem, áreas comuns).' },
  { chave: 'taxaOcupacao', rotulo: 'Taxa de ocupação', unidade: '%', min: 1, max: 100, passo: 1,
    explicacao: 'Projeção do prédio sobre o terreno. Não entra no VGV: vai para o estudo e para o IMOVIB.' },
  { chave: 'custoObraM2', rotulo: 'Custo de obra', unidade: 'R$/m²', min: 100, max: 50000, passo: 50,
    explicacao: 'Custo por m² construído usado no bloco criado no IMOVIB.' },
  { chave: 'limiarPrecoVelocidade', rotulo: 'Limiar de preço da velocidade', unidade: 'R$/m²', min: 0, max: 100000, passo: 100,
    explicacao: 'Acima deste preço por m² vale a velocidade "acima do limiar"; até ele, a outra.' },
  { chave: 'velocidadeAcimaDoLimiar', rotulo: 'Velocidade acima do limiar', unidade: '% ao mês', min: 0.1, max: 100, passo: 0.1,
    explicacao: 'Fração do estoque vendida por mês quando o preço do raio passa do limiar.' },
  { chave: 'velocidadeAbaixoDoLimiar', rotulo: 'Velocidade até o limiar', unidade: '% ao mês', min: 0.1, max: 100, passo: 0.1,
    explicacao: 'Fração do estoque vendida por mês quando o preço do raio não passa do limiar.' },
  { chave: 'riscoBase', rotulo: 'Risco de partida', unidade: 'pontos', min: 0, max: 200, passo: 1,
    explicacao: 'Risco antes dos descontos por concorrência e preço.' },
  { chave: 'riscoPorConcorrente', rotulo: 'Risco por concorrente', unidade: 'pontos', min: 0, max: 50, passo: 0.5,
    explicacao: 'Pontos descontados do risco por anúncio concorrente no raio (mais oferta = mercado comprovado).' },
  { chave: 'riscoDivisorPreco', rotulo: 'Divisor do preço no risco', unidade: 'R$/m² por ponto', min: 1, max: 100000, passo: 1,
    explicacao: 'O preço por m² do raio dividido por este número é descontado do risco.' },
  { chave: 'riscoMinimo', rotulo: 'Risco mínimo', unidade: 'pontos', min: 0, max: 100, passo: 1,
    explicacao: 'Piso do score de risco.' },
  { chave: 'riscoMaximo', rotulo: 'Risco máximo', unidade: 'pontos', min: 0, max: 100, passo: 1,
    explicacao: 'Teto do score de risco.' },
  { chave: 'areaComumFator', rotulo: 'Área comum por unidade', unidade: '× privativa', min: 0, max: 2, passo: 0.01,
    explicacao: 'Área comum de cada unidade criada no IMOVIB, como fração da área privativa.' },
];

/** Mensagens de hipótese fora da faixa (vazio = todas válidas). */
export function validarHipoteses(h: HipotesesVocacao): string[] {
  const erros: string[] = [];
  for (const d of DESCRICAO_HIPOTESES) {
    const v = h[d.chave];
    if (!Number.isFinite(v)) erros.push(`${d.rotulo}: informe um número.`);
    else if (v < d.min || v > d.max) erros.push(`${d.rotulo}: entre ${d.min} e ${d.max}.`);
  }
  if (Number.isFinite(h.riscoMinimo) && Number.isFinite(h.riscoMaximo) && h.riscoMinimo > h.riscoMaximo) {
    erros.push('Risco mínimo maior que o máximo.');
  }
  return erros;
}

/**
 * Hipóteses a partir do que foi gravado no estudo (coefficients_zone.hipoteses).
 * Campo ausente ou inválido cai no padrão. Estudo antigo só tinha `ca` e `to`.
 */
export function hipotesesDoEstudo(zona: Record<string, any> | null | undefined): HipotesesVocacao {
  const gravadas = (zona?.hipoteses ?? {}) as Partial<Record<keyof HipotesesVocacao, unknown>>;
  const h: HipotesesVocacao = { ...HIPOTESES_PADRAO };
  if (zona?.hipoteses == null) {
    if (Number.isFinite(Number(zona?.ca))) h.coeficienteAproveitamento = Number(zona?.ca);
    if (Number.isFinite(Number(zona?.to))) h.taxaOcupacao = Number(zona?.to) * 100;
  }
  for (const d of DESCRICAO_HIPOTESES) {
    const v = Number(gravadas[d.chave]);
    if (gravadas[d.chave] != null && Number.isFinite(v)) h[d.chave] = v;
  }
  return h;
}

/** Regras padrão de padrão construtivo por faixa de preço por m² (fonte única). */
export const REGRAS_PADRAO: OpuraMarketRule[] = [
  { standard: 'Econômico', minPrice: 0, maxPrice: 3200,
    tipologias: [{ tipo: '2 Dorms (Minha Casa Minha Vida)', area: 52, mix: 75 }, { tipo: '1 Dorm / Studio', area: 38, mix: 25 }] },
  { standard: 'Médio', minPrice: 3200, maxPrice: 4300,
    tipologias: [{ tipo: '2 Dorms c/ Suíte', area: 65, mix: 60 }, { tipo: '3 Dorms c/ Suíte', area: 80, mix: 40 }] },
  { standard: 'Médio-Alto', minPrice: 4300, maxPrice: 5500,
    tipologias: [{ tipo: '2 Dorms c/ Varanda Gourmet', area: 70, mix: 50 }, { tipo: '3 Dorms c/ Varanda Gourmet', area: 90, mix: 50 }] },
  { standard: 'Alto Padrão', minPrice: 5500, maxPrice: 7500,
    tipologias: [{ tipo: '3 Suítes Premium', area: 120, mix: 70 }, { tipo: '4 Suítes Duplex', area: 180, mix: 30 }] },
  { standard: 'Luxo', minPrice: 7500, maxPrice: null,
    tipologias: [{ tipo: '4 Suítes Mansão Suspensa', area: 250, mix: 80 }, { tipo: 'Cobertura Linear', area: 380, mix: 20 }] },
];

/** A regra cuja faixa contém o preço: primeiro nas regras da praça, depois nas padrão. */
export function regraDoPreco(precoM2: number, regrasDaPraca: OpuraMarketRule[] | null | undefined): OpuraMarketRule {
  const naFaixa = (r: OpuraMarketRule) => precoM2 >= r.minPrice && precoM2 < (r.maxPrice ?? Infinity);
  return (regrasDaPraca && regrasDaPraca.length > 0 ? regrasDaPraca.find(naFaixa) : undefined)
    ?? REGRAS_PADRAO.find(naFaixa)
    ?? REGRAS_PADRAO[REGRAS_PADRAO.length - 1];
}

export interface Tipologia { tipo: string; area: number; mix: number }

export interface ResultadoVocacao {
  stats: OpuraMarketRadiusStats;
  recStandard: PadraoConstrutivo;
  productMix: { tipologias: Tipologia[]; ticketSugerido: number };
  estimatedVgv: number;
  estimatedAbsorptionVelocity: number;
  riskScore: number;
  areaConstruivel: number;
  areaVenda: number;
  hipoteses: HipotesesVocacao;
}

/**
 * O ticket sugerido é o preço por m² do raio vezes a área média ponderada pelo
 * mix das tipologias da regra. Até a Fase 5, as regras PADRÃO usavam
 * multiplicadores fixos que não batiam com as próprias tipologias (Econômico 52
 * contra 48,5 m² ponderados; Médio 68 contra 71 m²) — agora toda regra usa a
 * mesma conta que as regras da praça já usavam.
 */
export function calcularVocacao(
  stats: OpuraMarketRadiusStats,
  areaTerreno: number,
  regrasDaPraca: OpuraMarketRule[] | null | undefined,
  h: HipotesesVocacao,
): ResultadoVocacao {
  const preco = stats.pricePerM2Avg;
  const regra = regraDoPreco(preco, regrasDaPraca);
  const tipologias = regra.tipologias.map((t) => ({ tipo: t.tipo, area: t.area, mix: t.mix }));
  const somaMix = tipologias.reduce((s, t) => s + t.mix, 0);
  const areaPonderada = somaMix > 0 ? tipologias.reduce((s, t) => s + t.area * (t.mix / 100), 0) : 50;

  const areaConstruivel = areaTerreno * h.coeficienteAproveitamento;
  const areaVenda = areaConstruivel * h.eficienciaVenda;
  const risco = Math.round(h.riscoBase - stats.totalListings * h.riscoPorConcorrente - preco / h.riscoDivisorPreco);

  return {
    stats,
    recStandard: regra.standard,
    productMix: { tipologias, ticketSugerido: preco * areaPonderada },
    estimatedVgv: areaVenda * preco,
    estimatedAbsorptionVelocity: preco > h.limiarPrecoVelocidade ? h.velocidadeAcimaDoLimiar : h.velocidadeAbaixoDoLimiar,
    riskScore: Math.min(Math.max(risco, h.riscoMinimo), h.riscoMaximo),
    areaConstruivel,
    areaVenda,
    hipoteses: h,
  };
}
