import { imovibService } from './imovibService';
import type { ResultadoNaTela } from '../hooks/useMarketVocacao';

/**
 * Leva o estudo de vocação do ÒPURA Market para o IMOVIB: estudo + bloco +
 * unidades pelo mix recomendado. Saiu de OpuraMarketModule.tsx na Fase 6 do
 * plano docs/planos/2026-10-07-opura-market-intelligence.md; CA, taxa de
 * ocupação, custo de obra, eficiência e área comum vêm das hipóteses (Fase 5).
 */
export interface DadosViabilidadeMercado {
  organizationId: string;
  nomeEstudo: string;
  emailUsuario: string;
  nomeBairro: string | null;
  areaTerreno: number;
  /** Precisa de `stats.pricePerM2Avg` medido: é o preço de venda do bloco. */
  resultado: ResultadoNaTela;
}

const subClassificacao = (padrao: string): string =>
  padrao === 'Alto Padrão' ? 'Alto'
    : padrao === 'Luxo' ? 'Luxo'
    : padrao === 'Econômico' ? 'Econômico'
    : 'Médio';

export async function criarViabilidadeImovib(d: DadosViabilidadeMercado): Promise<void> {
  const precoM2 = d.resultado.stats?.pricePerM2Avg;
  if (!(precoM2 && precoM2 > 0)) {
    throw new Error('O estudo não tem o preço por m² medido no raio.');
  }
  const h = d.resultado.hipoteses;

  const estudo = await imovibService.createStudy({
    organization_id: d.organizationId,
    name: `${d.nomeEstudo} - Viabilidade`,
    cnpj: '',
    developer: 'Ópura Inteligência Territorial',
    manager: d.emailUsuario.split('@')[0],
    version: '1.0',
    segment: 'Residencial',
    sub_classification: subClassificacao(d.resultado.recStandard),
    phase: 'Greenfield',
    development_modality: 'Incorporação Própria',
    zoning: d.nomeBairro ? `ZM - Bairro ${d.nomeBairro}` : 'ZM',
    needs_eiv: false,
    ca_basic: 1.0,
    ca_max: h.coeficienteAproveitamento,
    occupancy_rate: h.taxaOcupacao,
    land_cost: 0,
  });

  const bloco = await imovibService.createBlock({
    study_id: estudo.id,
    name: 'Bloco Principal A',
    construction_cost_sqm: h.custoObraM2,
    sales_price_sqm: precoM2,
  });

  const areaVenda = d.areaTerreno * h.coeficienteAproveitamento * h.eficienciaVenda;
  for (const tip of d.resultado.productMix.tipologias) {
    await imovibService.createUnit({
      block_id: bloco.id,
      name: tip.tipo,
      quantity: Math.max(Math.round((areaVenda * (tip.mix / 100)) / tip.area), 1),
      private_area: tip.area,
      common_area: Math.round(tip.area * h.areaComumFator),
    });
  }
}
