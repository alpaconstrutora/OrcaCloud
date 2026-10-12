import { useMemo } from 'react';
import { ImovibStudy, ImovibCapexItem, ImovibCapexBase } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Base de uma rubrica do CAPEX detalhado. Usa a coluna `base` quando existe; para
 * linha anterior a ela, deduz pela categoria do template — o MESMO mapeamento do
 * backfill da migration aplicar_20271012100000_imovib_capex_base.sql.
 */
export const baseDaRubrica = (item: Pick<ImovibCapexItem, 'category' | 'base'>): ImovibCapexBase => {
    if (item.base === 'vgv' || item.base === 'obra' || item.base === 'terreno') return item.base;
    const cat = item.category || '';
    if (cat.startsWith('1.')) return 'terreno';
    if (cat.startsWith('5.') || cat.startsWith('7.') || cat.startsWith('8.')) return 'vgv';
    return 'obra';
};

export interface MonthlyFlow {
    month: number;
    name: string;
    rev: number;
    cost: number;
    net: number;
    acc: number;
}

export interface ImovibMathOptions {
    vgvDelta?: number; // percentage (-10 to 10)
    costDelta?: number; // percentage (-10 to 10)
}

/** Aba do detalhe do estudo onde a premissa de um aviso é corrigida. */
export type ImovibAba = 'premises' | 'capex' | 'funding' | 'viability_dynamic';

/**
 * Premissa que o motor não consegue usar como está. O motor calcula assim mesmo
 * (com o padrão, ou com o valor como veio) e AVISA — nunca troca em silêncio.
 */
export interface ImovibAviso {
    codigo: 'recebimento_nao_soma_100' | 'cronograma_invalido' | 'sem_area' | 'sem_preco' | 'divida_quitada_no_fim' | 'permuta_em_dobro' | 'tir_multipla';
    mensagem: string;
    aba: ImovibAba;
}

export interface ImovibMathResult {
    monthlyFlows: MonthlyFlow[];
    maxExposure: number;
    vpl: number;
    annualIrr: number;
    vgvTotal: number;
    netVgvTotal: number;
    constCostTotal: number;
    duration: number;
    landCost: number;
    esgCostTotal: number;
    esgVgvPremiumValue: number;
    esgFundingDiscount: number;
    /** Área construída (privativa + comum) × quantidade × pavimentos — a MESMA que a aba CAPEX exibe. */
    totalBlockArea: number;
    /** Parcelas de totalBlockArea (todas as tipologias, vendáveis ou não). */
    totalPrivateArea: number;
    totalCommonArea: number;
    /**
     * VGV bruto dos blocos, antes de sensibilidade, prêmio ESG, permuta e
     * contingências — o número que Estática, Espelho e listagem exibem como "VGV".
     */
    vgvBase: number;
    /**
     * VGV de cada bloco e de onde veio: 'espelho' (preço de cada unidade do espelho
     * de vendas; unidade ainda sem preço vale área × preço/m²) ou 'preco_m2'
     * (área privativa VENDÁVEL × preço/m² do bloco).
     */
    vgvPorBloco: Record<string, { vgv: number; fonte: 'espelho' | 'preco_m2' }>;
    /** Saldo devedor que as receitas não amortizaram e o investidor quita no último mês. */
    debtPayoffAtEnd: number;
    /**
     * Rubricas do CAPEX detalhado entraram no cálculo? Só no modo Completo e com
     * rubricas cadastradas. Quando sim, imposto e corretagem da Dinâmica NÃO
     * entram (viriam em dobro com as rubricas 5 e 7).
     */
    capexRubricasAtivas: boolean;
    /** Valor em R$ de cada grupo de rubricas no cálculo (0 quando inativas). */
    capexRubricas: { terreno: number; obra: number; vgv: number; total: number };
    /**
     * Valor em R$ de cada rubrica no cálculo, por id — a tela de CAPEX e o PDF
     * exibem ESTE número em vez de recalcular (com inflação, rubrica de base
     * vgv é corrigida mês a mês). A soma é `capexRubricas.total`.
     */
    capexValorPorRubrica: Record<string, number>;
    avisos: ImovibAviso[];
}

const calculateNPV = (rate: number, cashFlows: number[]): number => {
    return cashFlows.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
};

// Limites da busca da TIR MENSAL. −90% a.m. já é perda total em qualquer
// horizonte; abaixo disso (1 + r)^i perde precisão em fluxos longos.
const IRR_LOW = -0.9;
const IRR_HIGH = 10.0;

/** Bissecção num intervalo [a, b] onde o VPL troca de sinal. */
const bissectar = (cashFlows: number[], a: number, b: number): number => {
    let low = a;
    let high = b;
    let npvLow = calculateNPV(low, cashFlows);
    for (let i = 0; i < 200 && high - low > 1e-12; i++) {
        const mid = (low + high) / 2;
        const npvMid = calculateNPV(mid, cashFlows);
        if (npvMid === 0) return mid;
        if (Math.sign(npvMid) === Math.sign(npvLow)) {
            low = mid;
            npvLow = npvMid;
        } else {
            high = mid;
        }
    }
    return (low + high) / 2;
};

// Grade da varredura: fina onde ficam as taxas de projeto (até 100% a.m.),
// grossa daí até o limite superior.
const GRADE_TIR: number[] = (() => {
    const g: number[] = [];
    for (let r = IRR_LOW; r < 1; r += 0.0025) g.push(r);
    for (let r = 1; r <= IRR_HIGH + 1e-9; r += 0.05) g.push(r);
    return g;
})();

/**
 * TIR mensal. Varre o VPL em [−90%, 1000%] a.m., acha CADA troca de sinal e
 * refina por bissecção.
 *
 * - Sem raiz no intervalo: NaN (a tela mostra "N/A"), nunca um dos limites. O
 *   motor antigo assumia VPL sempre decrescente e, sem raiz, convergia para o
 *   limite — exibia −100% a.a. como taxa calculada.
 * - Mais de uma raiz (fluxo com sinal + → − → +, como sinal de venda ANTES da
 *   obra): devolve a de menor módulo e `raizes` > 1, para o motor avisar. A 1ª
 *   versão da correção só comparava os extremos (positivos nos dois) e dava NaN
 *   para o Garden Cambuhy, que tem TIR perto de 10% a.m.
 */
export const calcularTirMensal = (cashFlows: number[]): { taxa: number; raizes: number } => {
    if (!cashFlows || cashFlows.length === 0) return { taxa: NaN, raizes: 0 };
    const hasPositive = cashFlows.some(f => f > 0);
    const hasNegative = cashFlows.some(f => f < 0);
    if (!hasPositive || !hasNegative) return { taxa: NaN, raizes: 0 };

    const raizes: number[] = [];
    let rAnt = GRADE_TIR[0];
    let vAnt = calculateNPV(rAnt, cashFlows);
    for (let k = 1; k < GRADE_TIR.length; k++) {
        const r = GRADE_TIR[k];
        const v = calculateNPV(r, cashFlows);
        if (!Number.isFinite(v) || !Number.isFinite(vAnt)) { rAnt = r; vAnt = v; continue; }
        if (vAnt === 0) raizes.push(rAnt);
        else if (Math.sign(v) !== Math.sign(vAnt) && v !== 0) raizes.push(bissectar(cashFlows, rAnt, r));
        rAnt = r;
        vAnt = v;
    }
    if (vAnt === 0) raizes.push(rAnt);
    if (raizes.length === 0) return { taxa: NaN, raizes: 0 };
    const taxa = raizes.reduce((best, r) => (Math.abs(r) < Math.abs(best) ? r : best), raizes[0]);
    return { taxa, raizes: raizes.length };
};

/** Campo vazio (null/undefined/NaN) usa o padrão; 0 digitado continua 0. */
const val = (x: number | null | undefined, padrao: number): number =>
    x == null || Number.isNaN(x) ? padrao : x;

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const EMPTY_RESULT: ImovibMathResult = {
    monthlyFlows: [],
    maxExposure: 0,
    vpl: 0,
    annualIrr: NaN,
    vgvTotal: 0,
    netVgvTotal: 0,
    constCostTotal: 0,
    duration: 0,
    landCost: 0,
    esgCostTotal: 0,
    esgVgvPremiumValue: 0,
    esgFundingDiscount: 0,
    totalBlockArea: 0,
    totalPrivateArea: 0,
    totalCommonArea: 0,
    vgvBase: 0,
    vgvPorBloco: {},
    debtPayoffAtEnd: 0,
    capexRubricasAtivas: false,
    capexRubricas: { terreno: 0, obra: 0, vgv: 0, total: 0 },
    capexValorPorRubrica: {},
    avisos: [],
};

/**
 * Núcleo de cálculo puro — sem React. Extraído do corpo do useMemo abaixo para
 * poder rodar em lote (ex.: uma linha por estudo na listagem de Estudos de
 * Viabilidade), onde chamar o hook num loop violaria as regras dos Hooks.
 * O hook useImovibMath é um wrapper memoizado desta função.
 *
 * Testes: __tests__/imovibMath.test.ts.
 */
export const computeImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
        if (!study) return { ...EMPTY_RESULT, avisos: [] };

        const avisos: ImovibAviso[] = [];
        const D = IMOVIB_DEFAULTS;

        // Cronograma: vazio usa o padrão; valor impossível (duração ≤ 0, mês < 1)
        // também usa o padrão, mas AVISA — o motor antigo trocava em silêncio.
        const cronogramaInvalido: string[] = [];
        const mes = (x: number | null | undefined, padrao: number, minimo: number, rotulo: string) => {
            if (x == null || Number.isNaN(x)) return padrao;
            if (x < minimo) {
                cronogramaInvalido.push(`${rotulo} = ${x}`);
                return padrao;
            }
            return Math.round(x);
        };
        const constDur = mes(study.construction_duration_months, D.construction_duration_months, 1, 'duração da obra');
        const salesDur = mes(study.sales_duration_months, D.sales_duration_months, 1, 'duração das vendas');
        const constStart = mes(study.construction_start_month, D.construction_start_month, 1, 'mês de início da obra');
        const salesStart = mes(study.sales_start_month, D.sales_start_month, 1, 'mês de início das vendas');
        if (cronogramaInvalido.length) {
            avisos.push({
                codigo: 'cronograma_invalido',
                mensagem: `Cronograma inválido (${cronogramaInvalido.join('; ')}). Foi usado o padrão no cálculo.`,
                aba: 'viability_dynamic',
            });
        }

        // Total duration is dictated by whichever finishes last
        const duration = Math.max(constStart + constDur - 1, salesStart + salesDur - 1, 1);

        const inflation = val(study.inflation_rate, D.inflation_rate) / 100; // Monthly
        const discount = val(study.discount_rate, D.discount_rate) / 100; // Expected Annual
        const monthlyDiscount = Math.pow(1 + discount, 1 / 12) - 1; // Convert annual to monthly

        // Calculate ESG Impacts
        let esgCostTotal = 0;
        let esgVgvPremium = 0;
        let esgFundingDiscount = 0;

        study.esg_initiatives?.forEach(ini => {
            if (ini.active) {
                esgCostTotal += ini.cost || 0;
                esgVgvPremium += (ini.vgv_premium || 0) / 100;
                esgFundingDiscount += (ini.funding_discount || 0) / 100;
            }
        });

        // Advanced Finance
        const taxRate = val(study.tax_rate, D.tax_rate) / 100;
        const brokerageFee = val(study.brokerage_fee, D.brokerage_fee) / 100;
        const financingPercent = val(study.financing_percent, D.financing_percent) / 100;
        let financingRateAnnual = val(study.financing_rate_annual, D.financing_rate_annual) / 100;

        // Apply ESG Funding Discount
        financingRateAnnual = Math.max(0, financingRateAnnual - esgFundingDiscount);

        const monthlyFinancingRate = Math.pow(1 + financingRateAnnual, 1 / 12) - 1;

        const landCost = study.land_cost || 0;

        // 1. Calculate base totals from blocks
        let baseVgvTotal = 0;
        let baseConstCostTotal = 0;
        let totalBlockArea = 0;
        let totalPrivateArea = 0;
        let totalCommonArea = 0;
        const vgvPorBloco: ImovibMathResult['vgvPorBloco'] = {};
        const instancias = study.unit_instances || [];
        let espelhoTemPermutada = false;

        study.blocks?.forEach(block => {
            let blockPrivateArea = 0;
            let blockCommonArea = 0;
            let blockVendavelArea = 0;
            block.units?.forEach(u => {
                const pav = u.pavimentos || 1;
                const priv = (u.quantity || 0) * pav * (u.private_area || 0);
                blockPrivateArea += priv;
                blockCommonArea += (u.quantity || 0) * pav * (u.common_area || 0);
                // Tipologia não vendável é área comum (o espelho e o sync a tratam
                // assim): entra no custo de obra, NÃO no VGV. Antes entrava nos dois.
                if (u.is_vendavel !== false) blockVendavelArea += priv;
            });

            // VGV do bloco: espelho de vendas quando existe (decisão de 2026-10-12),
            // senão área privativa vendável × preço/m².
            const precoM2 = block.sales_price_sqm || 0;
            const doBloco = instancias.filter(i => i.block_id === block.id);
            let blockVgv: number;
            if (doBloco.length > 0) {
                if (doBloco.some(i => i.status === 'PERMUTADO')) espelhoTemPermutada = true;
                blockVgv = doBloco
                    .filter(i => i.status !== 'PERMUTADO')
                    .reduce((acc, i) => acc + ((i.price || 0) > 0 ? i.price : (i.private_area || 0) * precoM2), 0);
                vgvPorBloco[block.id] = { vgv: blockVgv, fonte: 'espelho' };
            } else {
                blockVgv = blockVendavelArea * precoM2;
                vgvPorBloco[block.id] = { vgv: blockVgv, fonte: 'preco_m2' };
            }

            baseVgvTotal += blockVgv;
            baseConstCostTotal += (blockPrivateArea + blockCommonArea) * (block.construction_cost_sqm || 0);
            totalBlockArea += blockPrivateArea + blockCommonArea;
            totalPrivateArea += blockPrivateArea;
            totalCommonArea += blockCommonArea;
        });

        if (totalBlockArea <= 0) {
            avisos.push({
                codigo: 'sem_area',
                mensagem: 'Nenhuma tipologia com área cadastrada: VGV e custo de obra ficam zerados.',
                aba: 'premises',
            });
        } else if (baseVgvTotal <= 0) {
            avisos.push({
                codigo: 'sem_preco',
                mensagem: 'Nenhum bloco tem preço de venda por m²: o VGV fica zerado.',
                aba: 'premises',
            });
        }

        // Apply Sensitivity Deltas & ESG Premiums
        const vgvDeltaMultiplier = 1 + (options?.vgvDelta || 0) / 100;
        const costDeltaMultiplier = 1 + (options?.costDelta || 0) / 100;

        const vgvTotal = baseVgvTotal * (vgvDeltaMultiplier + esgVgvPremium);
        const esgVgvPremiumValue = baseVgvTotal * esgVgvPremium;

        // CAPEX simplificado: área única × custo/m² substitui o custo dos blocos
        // E as rubricas do detalhado.
        // O custo ESG soma nos DOIS modos (antes sumia no simplificado).
        const simplificadoAtivo = study.capex_mode === 'simplified' && !!study.capex_simplified_cost_sqm;
        let constCostTotal: number;
        if (simplificadoAtivo) {
            const effectiveArea = study.capex_simplified_area_sqm || totalBlockArea;
            constCostTotal = (effectiveArea * (study.capex_simplified_cost_sqm || 0) + esgCostTotal) * costDeltaMultiplier;
        } else {
            constCostTotal = (baseConstCostTotal + esgCostTotal) * costDeltaMultiplier;
        }

        // CAPEX detalhado (decisão de 2026-10-12: entra no cálculo). Cada rubrica
        // em R$ entra direto; em % incide sobre a sua base:
        //   terreno → % do terreno, saída no mês 1;
        //   obra    → % do custo de obra, saída ao longo da obra (financiável);
        //   vgv     → % da receita bruta do mês, deduzida junto com a receita;
        //             valor em R$ com base vgv sai ao longo das vendas.
        // Ativas, substituem imposto e corretagem da Dinâmica.
        const rubricas = simplificadoAtivo ? [] : (study.capex_items || []);
        const capexRubricasAtivas = rubricas.length > 0;
        let rubricaTerreno = 0;
        let rubricaObra = 0;
        let rubricaVgvPct = 0;
        let rubricaVgvFixo = 0;
        rubricas.forEach(item => {
            const v = Number(item.value) || 0;
            const pct = item.value_type === 'percent';
            switch (baseDaRubrica(item)) {
                case 'terreno':
                    rubricaTerreno += pct ? landCost * v / 100 : v;
                    break;
                case 'obra':
                    rubricaObra += pct ? constCostTotal * v / 100 : v * costDeltaMultiplier;
                    break;
                case 'vgv':
                    if (pct) rubricaVgvPct += v / 100;
                    else rubricaVgvFixo += v;
                    break;
            }
        });
        // Com rubricas, as deduções sobre a receita vêm delas.
        const deducaoReceitaPct = capexRubricasAtivas ? rubricaVgvPct : taxRate + brokerageFee;

        // Apply Swap Physical (reduces marketed VGV)
        const swapPhysical = val(study.swap_physical_percent, D.swap_physical_percent) / 100;
        if (espelhoTemPermutada && swapPhysical > 0) {
            avisos.push({
                codigo: 'permuta_em_dobro',
                mensagem: `O espelho de vendas já tem unidades permutadas (fora do VGV) e a Permuta Física de ${Number((swapPhysical * 100).toFixed(2)).toLocaleString('pt-BR')}% também está preenchida: a permuta pode estar sendo descontada duas vezes.`,
                aba: 'funding',
            });
        }
        const marketedVgv = vgvTotal * (1 - swapPhysical);

        // Apply Contingencies (Default, Cancellation, Swap Financial)
        const swapFinancial = val(study.swap_financial_percent, D.swap_financial_percent) / 100;
        const defaultRate = val(study.default_rate_percent, D.default_rate_percent) / 100;
        const cancellationRate = val(study.cancellation_rate_percent, D.cancellation_rate_percent) / 100;

        const netVgvTotal = marketedVgv * (1 - (swapFinancial + defaultRate + cancellationRate));

        // Revenue Curve Distribution (J-Curve Profile)
        const downpaymentPctRaw = val(study.revenue_downpayment_percent, D.revenue_downpayment_percent);
        const constructionPctRaw = val(study.revenue_construction_percent, D.revenue_construction_percent);
        const handoverPctRaw = val(study.revenue_handover_percent, D.revenue_handover_percent);
        const revenueSum = downpaymentPctRaw + constructionPctRaw + handoverPctRaw;
        if (Math.abs(revenueSum - 100) > 0.01) {
            avisos.push({
                codigo: 'recebimento_nao_soma_100',
                mensagem: `O perfil de recebimento soma ${Number(revenueSum.toFixed(2)).toLocaleString('pt-BR')}% (sinal + obra + repasse deveria ser 100%). O cálculo usa os valores como estão.`,
                aba: 'funding',
            });
        }
        const downpaymentPct = downpaymentPctRaw / 100;
        const constructionPct = constructionPctRaw / 100;
        const handoverPct = handoverPctRaw / 100;

        const downpaymentVol = netVgvTotal * downpaymentPct;
        const constructionVol = netVgvTotal * constructionPct;
        const handoverVol = netVgvTotal * handoverPct;

        const monthlyDownpayment = salesDur > 0 ? downpaymentVol / salesDur : 0;
        const monthlyConstRev = constDur > 0 ? constructionVol / constDur : 0;
        const handoverMonth = constStart + constDur - 1; // Paid at the end of construction

        const constMonths = Math.max(1, constDur);
        const monthlyConstCost = (constCostTotal + rubricaObra) / constMonths;
        const monthlyVgvFixo = salesDur > 0 ? rubricaVgvFixo / salesDur : 0;
        let rubricaVgvTotal = 0;
        let totalGrossRev = 0;
        let somaInflacaoVendas = 0; // Σ fator de inflação nos meses de venda

        // Fallback to old financingPercent if Sprint 8 fields not used, but prefer debt
        const fundingDebtPct = val(study.funding_debt_percent, D.funding_debt_percent) / 100;
        const actualFinPct = fundingDebtPct > 0 ? fundingDebtPct : financingPercent;

        let accumulatedFlow = 0;
        let maxExposure = 0;
        let debtBalance = 0;
        let debtPayoffAtEnd = 0;

        const finalMonthlyFlows: MonthlyFlow[] = [];
        const finalRawNetFlows: number[] = [];

        for (let m = 1; m <= duration; m++) {
            const inflationMult = Math.pow(1 + inflation, m - 1);

            // J-Curve Revenue Aggregation
            let grossRev = 0;

            // 1. Downpayment (spread over sales period)
            if (m >= salesStart && m < salesStart + salesDur) {
                grossRev += monthlyDownpayment;
            }

            // 2. Construction Payments (spread over construction period)
            if (m >= constStart && m < constStart + constDur) {
                grossRev += monthlyConstRev;
            }

            // 3. Handover / Repasse (bullet payout)
            if (m === handoverMonth) {
                grossRev += handoverVol;
            }

            // Inflate Revenue if needed (optional based on models, we apply it here)
            grossRev = grossRev * inflationMult;

            // Deduções sobre a receita: rubricas de base vgv (modo Completo) ou
            // imposto + corretagem da Dinâmica — nunca os dois.
            totalGrossRev += grossRev;
            if (m >= salesStart && m < salesStart + salesDur) somaInflacaoVendas += inflationMult;
            const revenueDeduction = grossRev * deducaoReceitaPct;
            const netRev = grossRev - revenueDeduction;
            if (capexRubricasAtivas) rubricaVgvTotal += revenueDeduction;

            let totalCost = 0;
            let equityCost = 0;
            let financedCost = 0;

            if (m === 1) {
                totalCost += landCost + rubricaTerreno;
                equityCost += landCost + rubricaTerreno;
            }

            if (monthlyVgvFixo > 0 && m >= salesStart && m < salesStart + salesDur) {
                const fixo = monthlyVgvFixo * inflationMult;
                totalCost += fixo;
                equityCost += fixo;
                rubricaVgvTotal += fixo;
            }

            if (m >= constStart && m < constStart + constDur) {
                const currentConstCost = monthlyConstCost * inflationMult;
                totalCost += currentConstCost;
                financedCost = currentConstCost * actualFinPct;
                equityCost += currentConstCost - financedCost;
            }

            debtBalance = debtBalance * (1 + monthlyFinancingRate);
            debtBalance += financedCost;

            let debtPayment = 0;
            let investorRev = 0;

            if (netRev > 0) {
                if (debtBalance > 0) {
                    debtPayment = Math.min(debtBalance, netRev);
                    debtBalance -= debtPayment;
                    investorRev = netRev - debtPayment;
                } else {
                    investorRev = netRev;
                }
            }

            let netFlow = investorRev - equityCost;

            // Último mês: o saldo que as receitas não amortizaram é quitado pelo
            // investidor. O motor antigo terminava o fluxo com a dívida em
            // aberto e a descartava — com 100% de dívida, subir o custo de obra
            // não mudava o VPL.
            if (m === duration && debtBalance > 0.005) {
                debtPayoffAtEnd = debtBalance;
                netFlow -= debtBalance;
                debtBalance = 0;
            }

            accumulatedFlow += netFlow;

            if (accumulatedFlow < maxExposure) {
                maxExposure = accumulatedFlow;
            }

            finalMonthlyFlows.push({
                month: m,
                name: `Mês ${m}`,
                rev: grossRev,
                cost: totalCost,
                net: netFlow,
                acc: accumulatedFlow
            });
            finalRawNetFlows.push(netFlow);
        }

        if (debtPayoffAtEnd > 0) {
            avisos.push({
                codigo: 'divida_quitada_no_fim',
                mensagem: `As receitas não amortizaram todo o financiamento: ${fmtBRL(debtPayoffAtEnd)} de saldo devedor são quitados com capital próprio no mês ${duration}.`,
                aba: 'funding',
            });
        }

        // Valor de cada rubrica no cálculo — mesma regra do bloco acima, item a item.
        const capexValorPorRubrica: Record<string, number> = {};
        const fatorVendas = salesDur > 0 ? somaInflacaoVendas / salesDur : 1;
        rubricas.forEach(item => {
            const v = Number(item.value) || 0;
            const pct = item.value_type === 'percent';
            let valor = 0;
            switch (baseDaRubrica(item)) {
                case 'terreno': valor = pct ? landCost * v / 100 : v; break;
                case 'obra': valor = pct ? constCostTotal * v / 100 : v * costDeltaMultiplier; break;
                case 'vgv': valor = pct ? totalGrossRev * v / 100 : v * fatorVendas; break;
            }
            capexValorPorRubrica[item.id] = valor;
        });

        // 3. Calculate Advanced Indicators
        const vpl = calculateNPV(monthlyDiscount, finalRawNetFlows); // Using monthly discount rate

        // IRR is returned as a monthly rate. Convert to annual.
        const tir = calcularTirMensal(finalRawNetFlows);
        const monthlyIrr = tir.taxa;
        let annualIrr = NaN;
        if (!isNaN(monthlyIrr) && isFinite(monthlyIrr)) {
            annualIrr = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;
        }
        if (tir.raizes > 1) {
            avisos.push({
                codigo: 'tir_multipla',
                mensagem: `O fluxo troca de sinal mais de uma vez e tem ${tir.raizes} TIRs; a exibida (${annualIrr.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.) é a de menor valor. Para decidir, use o VPL.`,
                aba: 'viability_dynamic',
            });
        }

        return {
            monthlyFlows: finalMonthlyFlows,
            maxExposure,
            vpl,
            annualIrr,
            vgvTotal,
            netVgvTotal,
            constCostTotal,
            duration,
            landCost,
            esgCostTotal,
            esgVgvPremiumValue,
            esgFundingDiscount,
            totalBlockArea,
            totalPrivateArea,
            totalCommonArea,
            vgvBase: baseVgvTotal,
            vgvPorBloco,
            debtPayoffAtEnd,
            capexRubricasAtivas,
            capexRubricas: {
                terreno: rubricaTerreno,
                obra: rubricaObra,
                vgv: rubricaVgvTotal,
                total: rubricaTerreno + rubricaObra + rubricaVgvTotal,
            },
            capexValorPorRubrica,
            avisos,
        };
};

export const useImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
    return useMemo(() => computeImovibMath(study, options), [study, options?.vgvDelta, options?.costDelta]);
};
