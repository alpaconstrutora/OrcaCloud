/**
 * Memorial de premissas (item 10.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): toda premissa que o
 * motor lê (`CAMPOS_DO_MOTOR`), com valor, unidade, se é o padrão do sistema, e a
 * fonte e a data gravadas em `premise_notes`. É a aba "Premissas" do Excel e a
 * sub-aba Memorial. Testes: __tests__/imovibMemorial.test.ts — premissa nova no
 * motor sem linha aqui derruba o teste.
 *
 * O valor é o que o motor usa: campo vazio vale o padrão (`val` do motor), com as
 * mesmas exceções dele (financiamento legado, devolução com afetação, índices que
 * seguem a inflação).
 */
import type { ImovibStudy } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { devolucaoPadraoDoDistrato } from './imovibMotor';
import { ROTULO_DOS_JUROS_NA_OBRA, ROTULO_DA_AMORTIZACAO } from './imovibFinanciamento';
import { ROTULO_DO_REGIME, type RegimeTributarioDoEstudo, hipotesesDoEstudo } from './imovibTributos';

export interface LinhaDoMemorial {
    grupo: string;
    premissa: string;
    campo: keyof ImovibStudy;
    valor: number | string | null;
    unidade: string;
    ehPadrao: boolean;
    fonte: string | null;
    data: string | null;
    /** Quando a premissa vale, ou de onde veio o valor (sai na coluna Observação do Excel). */
    observacao: string | null;
}

const D = IMOVIB_DEFAULTS;
const vazio = (x: unknown) => x == null || (typeof x === 'number' && Number.isNaN(x)) || (Array.isArray(x) && x.length === 0);
const num = (x: number | null | undefined, padrao: number) => (vazio(x) ? padrao : (x as number));
/** Mês/duração como o motor lê (`mes` em montarPremissas): vazio ou abaixo do mínimo = padrão; fração arredonda. */
const mesDoMotor = (x: number | null | undefined, padrao: number, minimo = 1) =>
    vazio(x) || (x as number) < minimo ? padrao : Math.round(x as number);
const invalido = (x: number | null | undefined, minimo = 1) =>
    !vazio(x) && (x as number) < minimo ? `Inválido (${x}): o cálculo usa o padrão` : null;
const simplificadoAtivo = (s: ImovibStudy) => s.capex_mode === 'simplified' && !!s.capex_simplified_cost_sqm;
const pctBR = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

const ROTULO_CURVA_VENDAS: Record<string, string> = { linear: 'Linear', lancamento: 'Lançamento forte', vso: 'VSO (sobre o estoque)', custom: 'Personalizada' };
const ROTULO_CURVA_OBRA: Record<string, string> = { linear: 'Linear', curva_s: 'Curva S', custom: 'Personalizada' };

type Descritor = {
    grupo: string;
    premissa: string;
    campo: keyof ImovibStudy;
    unidade?: string;
    /** O valor que o motor usa (já com o padrão). */
    valor: (s: ImovibStudy) => number | string | null;
    /** Vazio = padrão; quando a regra não é só "o campo está vazio". */
    ehPadrao?: (s: ImovibStudy) => boolean;
    observacao?: (s: ImovibStudy, o: OpcoesDoMemorial) => string | null;
};

export interface OpcoesDoMemorial {
    /** Rubricas do CAPEX no cálculo (modo Completo): o imposto e a corretagem da Dinâmica ficam fora. */
    rubricasAtivas?: boolean;
}

const naoEntraPelasRubricas = (o: OpcoesDoMemorial) => (o.rubricasAtivas ? 'Não entra no cálculo: vem das rubricas do CAPEX (modo Completo)' : null);
const regimeDe = (s: ImovibStudy) => (s.tax_regime ?? D.tax_regime) as RegimeTributarioDoEstudo;
const aliquotasDoRegime = (s: ImovibStudy): string => {
    const r = regimeDe(s);
    const h = hipotesesDoEstudo(s);
    return r === 'ret' ? `${pctBR(h.retPct)} da receita`
        : r === 'ret_his' ? `${pctBR(h.retHisPct)} da receita`
            : r === 'presumido' ? `${pctBR(h.presumidoPct)} da receita`
                : r === 'real' ? `PIS/Cofins ${pctBR(h.realPisCofinsPct)} da receita, crédito de ${pctBR(h.realCreditoSobreCustoPct)} do custo, IRPJ/CSLL ${pctBR(h.realIrCsPct)} do lucro do ano (estimativa)`
                    : 'Não usadas: regime manual';
};
const inflacao = (s: ImovibStudy) => num(s.inflation_rate, D.inflation_rate);
const soNaCurva = (tipo: string, rotulo: string) => (s: ImovibStudy) => ((s.sales_curve_type ?? D.sales_curve_type) === tipo ? null : `Só na curva ${rotulo}`);

/** Uma linha por campo do motor, na ordem do memorial. */
const DESCRITORES: Descritor[] = [
    // Cronograma
    { grupo: 'Cronograma', premissa: 'Data-base', campo: 'base_date', valor: s => s.base_date ?? null, observacao: s => (s.base_date ? null : 'Sem data-base: os meses saem numerados') },
    { grupo: 'Cronograma', premissa: 'Início das vendas', campo: 'sales_start_month', unidade: 'mês', valor: s => mesDoMotor(s.sales_start_month, D.sales_start_month), observacao: s => invalido(s.sales_start_month) },
    { grupo: 'Cronograma', premissa: 'Duração das vendas', campo: 'sales_duration_months', unidade: 'meses', valor: s => mesDoMotor(s.sales_duration_months, D.sales_duration_months), observacao: s => invalido(s.sales_duration_months) },
    { grupo: 'Cronograma', premissa: 'Início da obra', campo: 'construction_start_month', unidade: 'mês', valor: s => mesDoMotor(s.construction_start_month, D.construction_start_month), observacao: s => invalido(s.construction_start_month) },
    { grupo: 'Cronograma', premissa: 'Duração da obra', campo: 'construction_duration_months', unidade: 'meses', valor: s => mesDoMotor(s.construction_duration_months, D.construction_duration_months), observacao: s => invalido(s.construction_duration_months) },
    { grupo: 'Cronograma', premissa: 'Aquisição do terreno', campo: 'acquisition_month', unidade: 'mês', valor: s => Math.max(1, Math.round(num(s.acquisition_month, D.acquisition_month))) },
    { grupo: 'Cronograma', premissa: 'Aprovação do projeto', campo: 'approval_month', unidade: 'mês', valor: s => s.approval_month ?? null, observacao: () => 'Marco: não muda o cálculo' },
    { grupo: 'Cronograma', premissa: 'Registro da incorporação', campo: 'incorporation_registry_month', unidade: 'mês', valor: s => s.incorporation_registry_month ?? null, observacao: () => 'Marco: não muda o cálculo' },
    // Terreno
    { grupo: 'Terreno', premissa: 'Custo do terreno', campo: 'land_cost', unidade: 'R$', valor: s => num(s.land_cost, 0) },
    {
        grupo: 'Terreno', premissa: 'Pagamento do terreno', campo: 'land_payment_schedule',
        valor: s => (vazio(s.land_payment_schedule) ? 'À vista no mês da aquisição'
            : (s.land_payment_schedule as { month: number; percent: number }[]).map(x => `mês ${x.month}: ${pctBR(Number(x.percent) || 0)}`).join(' · ')),
    },
    // Custos
    { grupo: 'Custos', premissa: 'Modo do CAPEX', campo: 'capex_mode', valor: s => (simplificadoAtivo(s) ? 'Simplificado (área × custo/m²)' : 'Completo (por torre e rubricas)'), observacao: s => (s.capex_mode === 'simplified' && !simplificadoAtivo(s) ? 'Simplificado sem custo/m²: o cálculo usa o Completo' : null) },
    { grupo: 'Custos', premissa: 'Custo/m² do CAPEX simplificado', campo: 'capex_simplified_cost_sqm', unidade: 'R$/m²', valor: s => s.capex_simplified_cost_sqm ?? null, observacao: s => (simplificadoAtivo(s) ? null : 'Só no CAPEX simplificado') },
    { grupo: 'Custos', premissa: 'Área do CAPEX simplificado', campo: 'capex_simplified_area_sqm', unidade: 'm²', valor: s => s.capex_simplified_area_sqm ?? null, observacao: s => (!simplificadoAtivo(s) ? 'Só no CAPEX simplificado' : !s.capex_simplified_area_sqm ? 'Vazio ou zero: vale a área construída das torres' : null) },
    { grupo: 'Custos', premissa: 'Curva de desembolso da obra', campo: 'cost_curve_type', valor: s => ROTULO_CURVA_OBRA[s.cost_curve_type ?? D.cost_curve_type] ?? String(s.cost_curve_type) },
    { grupo: 'Custos', premissa: 'Pesos da curva de desembolso', campo: 'cost_curve_custom', valor: s => (vazio(s.cost_curve_custom) ? null : `${(s.cost_curve_custom as number[]).length} meses`), observacao: s => ((s.cost_curve_type ?? D.cost_curve_type) === 'custom' ? null : 'Só na curva personalizada') },
    { grupo: 'Custos', premissa: 'Custo do estoque', campo: 'stock_carrying_cost_unit_month', unidade: 'R$ por unidade/mês', valor: s => num(s.stock_carrying_cost_unit_month, D.stock_carrying_cost_unit_month), observacao: () => 'Depois do fim da obra' },
    // Taxas e tributos
    { grupo: 'Taxas', premissa: 'Inflação geral', campo: 'inflation_rate', unidade: '% a.m.', valor: inflacao },
    { grupo: 'Taxas', premissa: 'TMA', campo: 'discount_rate', unidade: '% a.a.', valor: s => num(s.discount_rate, D.discount_rate), observacao: s => s.discount_rate_basis?.trim() || null },
    { grupo: 'Taxas', premissa: 'Regime tributário', campo: 'tax_regime', valor: s => ROTULO_DO_REGIME[regimeDe(s)], observacao: s => (regimeDe(s) === 'manual' ? null : aliquotasDoRegime(s)) },
    { grupo: 'Taxas', premissa: 'Alíquotas do regime', campo: 'tax_hypotheses', valor: aliquotasDoRegime, ehPadrao: s => vazio(s.tax_hypotheses) || Object.keys(s.tax_hypotheses ?? {}).length === 0 },
    { grupo: 'Taxas', premissa: 'Impostos sobre a receita', campo: 'tax_rate', unidade: '%', valor: s => num(s.tax_rate, D.tax_rate), observacao: (s, o) => (regimeDe(s) !== 'manual' ? 'Não entra no cálculo: o imposto vem do regime tributário' : naoEntraPelasRubricas(o)) },
    { grupo: 'Taxas', premissa: 'Corretagem', campo: 'brokerage_fee', unidade: '%', valor: s => num(s.brokerage_fee, D.brokerage_fee), observacao: (_s, o) => naoEntraPelasRubricas(o) },
    { grupo: 'Taxas', premissa: 'Inadimplência', campo: 'default_rate_percent', unidade: '%', valor: s => num(s.default_rate_percent, D.default_rate_percent), observacao: () => 'Sobre parcelas de obra, intermediárias e pós-chaves' },
    // Curva de vendas
    { grupo: 'Curva de vendas', premissa: 'Tipo da curva', campo: 'sales_curve_type', valor: s => ROTULO_CURVA_VENDAS[s.sales_curve_type ?? D.sales_curve_type] ?? String(s.sales_curve_type) },
    { grupo: 'Curva de vendas', premissa: 'Vendido no lançamento', campo: 'sales_launch_percent', unidade: '%', valor: s => num(s.sales_launch_percent, D.sales_launch_percent), observacao: soNaCurva('lancamento', 'de lançamento') },
    { grupo: 'Curva de vendas', premissa: 'Meses do lançamento', campo: 'sales_launch_months', unidade: 'meses', valor: s => num(s.sales_launch_months, D.sales_launch_months), observacao: soNaCurva('lancamento', 'de lançamento') },
    { grupo: 'Curva de vendas', premissa: 'VSO mensal', campo: 'sales_vso_percent', unidade: '% do estoque', valor: s => num(s.sales_vso_percent, D.sales_vso_percent), observacao: soNaCurva('vso', 'VSO') },
    { grupo: 'Curva de vendas', premissa: 'Pesos da curva de vendas', campo: 'sales_curve_custom', valor: s => (vazio(s.sales_curve_custom) ? null : `${(s.sales_curve_custom as number[]).length} meses`), observacao: soNaCurva('custom', 'personalizada') },
    // Perfil de recebimento
    { grupo: 'Perfil de recebimento', premissa: 'Sinal / ato', campo: 'revenue_downpayment_percent', unidade: '%', valor: s => num(s.revenue_downpayment_percent, D.revenue_downpayment_percent) },
    { grupo: 'Perfil de recebimento', premissa: 'Mensais / obra', campo: 'revenue_construction_percent', unidade: '%', valor: s => num(s.revenue_construction_percent, D.revenue_construction_percent) },
    { grupo: 'Perfil de recebimento', premissa: 'Intermediárias', campo: 'revenue_intermediate_percent', unidade: '%', valor: s => num(s.revenue_intermediate_percent, D.revenue_intermediate_percent) },
    { grupo: 'Perfil de recebimento', premissa: 'Intervalo das intermediárias', campo: 'revenue_intermediate_interval_months', unidade: 'meses', valor: s => num(s.revenue_intermediate_interval_months, D.revenue_intermediate_interval_months) },
    { grupo: 'Perfil de recebimento', premissa: 'Repasse bancário / chaves', campo: 'revenue_handover_percent', unidade: '%', valor: s => num(s.revenue_handover_percent, D.revenue_handover_percent) },
    { grupo: 'Perfil de recebimento', premissa: 'Atraso do repasse', campo: 'handover_delay_months', unidade: 'meses', valor: s => num(s.handover_delay_months, D.handover_delay_months) },
    { grupo: 'Perfil de recebimento', premissa: 'Pós-chaves', campo: 'revenue_post_handover_percent', unidade: '%', valor: s => num(s.revenue_post_handover_percent, D.revenue_post_handover_percent) },
    { grupo: 'Perfil de recebimento', premissa: 'Prazo do pós-chaves', campo: 'post_handover_months', unidade: 'meses', valor: s => num(s.post_handover_months, D.post_handover_months) },
    { grupo: 'Perfil de recebimento', premissa: 'Juro do pós-chaves', campo: 'post_handover_rate_monthly', unidade: '% a.m.', valor: s => num(s.post_handover_rate_monthly, D.post_handover_rate_monthly), observacao: () => 'Price' },
    // Distrato
    { grupo: 'Distrato', premissa: 'Distrato', campo: 'cancellation_rate_percent', unidade: '% de cada safra', valor: s => num(s.cancellation_rate_percent, D.cancellation_rate_percent), observacao: () => 'Só vendas antes das chaves; acontece no máximo nas chaves' },
    { grupo: 'Distrato', premissa: 'Meses até o distrato', campo: 'cancellation_lag_months', unidade: 'meses', valor: s => num(s.cancellation_lag_months, D.cancellation_lag_months) },
    { grupo: 'Distrato', premissa: 'Devolução ao comprador', campo: 'cancellation_refund_percent', unidade: '% do pago', valor: s => num(s.cancellation_refund_percent, devolucaoPadraoDoDistrato(s)), observacao: s => (vazio(s.cancellation_refund_percent) && s.patrimonio_afetacao ? 'Padrão com patrimônio de afetação' : null) },
    { grupo: 'Distrato', premissa: 'Revender a unidade distratada', campo: 'cancellation_resale', valor: s => ((s.cancellation_resale ?? D.cancellation_resale) ? 'Sim' : 'Não') },
    { grupo: 'Distrato', premissa: 'Deságio da revenda', campo: 'cancellation_resale_discount_percent', unidade: '%', valor: s => num(s.cancellation_resale_discount_percent, D.cancellation_resale_discount_percent), observacao: s => ((s.cancellation_resale ?? D.cancellation_resale) ? null : 'Sem revenda') },
    // Índices
    { grupo: 'Índices', premissa: 'Índice da obra', campo: 'cost_index_rate_monthly', unidade: '% a.m.', valor: s => num(s.cost_index_rate_monthly, inflacao(s)), observacao: s => (vazio(s.cost_index_rate_monthly) ? 'Vazio: segue a inflação geral' : (s.inflation_index_obra ?? null)) },
    { grupo: 'Índices', premissa: 'Índice das vendas', campo: 'sales_index_rate_monthly', unidade: '% a.m.', valor: s => num(s.sales_index_rate_monthly, inflacao(s)), observacao: s => (vazio(s.sales_index_rate_monthly) ? 'Vazio: segue a inflação geral' : (s.inflation_index_vendas ?? null)) },
    // Financiamento — mesma regra do motor: o campo novo preenchido vale; vazio → "% Financiado" legado.
    {
        grupo: 'Financiamento', premissa: 'Financiamento à produção / dívida', campo: 'funding_debt_percent', unidade: '%',
        valor: s => (s.funding_debt_percent != null ? s.funding_debt_percent : num(s.financing_percent, D.financing_percent)),
        ehPadrao: s => s.funding_debt_percent == null && vazio(s.financing_percent),
        observacao: s => (s.funding_debt_percent == null && (s.financing_percent ?? 0) > 0 ? 'valor legado (% Financiado)' : null),
    },
    { grupo: 'Financiamento', premissa: '% Financiado (legado)', campo: 'financing_percent', unidade: '%', valor: s => num(s.financing_percent, D.financing_percent), observacao: () => 'Só vale com "Financiamento à produção / dívida" vazio' },
    { grupo: 'Financiamento', premissa: 'Taxa do financiamento', campo: 'financing_rate_annual', unidade: '% a.a.', valor: s => num(s.financing_rate_annual, D.financing_rate_annual) },
    { grupo: 'Financiamento', premissa: 'Defasagem da liberação', campo: 'financing_release_lag_months', unidade: 'meses', valor: s => num(s.financing_release_lag_months, D.financing_release_lag_months) },
    { grupo: 'Financiamento', premissa: 'Vendas mínimas para liberar', campo: 'financing_min_sales_percent', unidade: '% do VGV vendável', valor: s => num(s.financing_min_sales_percent, D.financing_min_sales_percent) },
    { grupo: 'Financiamento', premissa: 'Juros do financiamento na obra', campo: 'financing_interest_mode', valor: s => ROTULO_DOS_JUROS_NA_OBRA[s.financing_interest_mode ?? D.financing_interest_mode] },
    { grupo: 'Financiamento', premissa: 'Amortização do financiamento', campo: 'financing_amortization', valor: s => ROTULO_DA_AMORTIZACAO[s.financing_amortization ?? D.financing_amortization] },
    { grupo: 'Financiamento', premissa: 'Caixa mínimo', campo: 'min_cash_balance', unidade: 'R$', valor: s => num(s.min_cash_balance, D.min_cash_balance), observacao: () => 'Aportes e distribuições' },
    { grupo: 'Financiamento', premissa: 'Permuta financeira', campo: 'swap_financial_percent', unidade: '%', valor: s => num(s.swap_financial_percent, D.swap_financial_percent) },
    { grupo: 'Financiamento', premissa: 'Permuta física', campo: 'swap_physical_percent', unidade: '%', valor: s => num(s.swap_physical_percent, D.swap_physical_percent) },
    // Jurídico
    { grupo: 'Jurídico', premissa: 'Patrimônio de afetação', campo: 'patrimonio_afetacao', valor: s => (s.patrimonio_afetacao == null ? 'Não informado' : s.patrimonio_afetacao ? 'Sim' : 'Não'), observacao: () => 'RET exige; com afetação a devolução padrão no distrato é 50%' },
];

export function memorialDePremissas(study: ImovibStudy, opcoes: OpcoesDoMemorial = {}): LinhaDoMemorial[] {
    const notas = study.premise_notes ?? {};
    return DESCRITORES.map(d => {
        const nota = notas[d.campo as string] ?? {};
        return {
            grupo: d.grupo,
            premissa: d.premissa,
            campo: d.campo,
            valor: d.valor(study),
            unidade: d.unidade ?? '',
            ehPadrao: d.ehPadrao ? d.ehPadrao(study) : vazio(study[d.campo]),
            // Sem aparar: a tela edita este texto letra a letra (o espaço do fim é digitação).
            fonte: nota.fonte?.trim() ? nota.fonte : null,
            data: nota.data || null,
            observacao: d.observacao ? d.observacao(study, opcoes) : null,
        };
    });
}

/** O "x" de "x de y premissas sem fonte": conta todas, inclusive as que estão no padrão. */
export const premissasSemFonte = (linhas: readonly LinhaDoMemorial[]) => linhas.filter(l => !l.fonte).length;
