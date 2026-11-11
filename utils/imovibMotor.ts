import { ImovibStudy, ImovibCapexItem, ImovibCapexBase } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { curvaDeVendas, TipoCurvaDeVendas } from './imovibCurvas';
import { recebimentoPorSafra, SerieDeRecebimento } from './imovibRecebimento';

/**
 * Motor dos Estudos de Viabilidade (Imovib) — cálculo puro, sem React.
 *
 * Saiu de hooks/useImovibMath.ts na Fase 0 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, dividido em quatro
 * etapas que as fases seguintes estendem sem mexer nas outras:
 *
 *   montarPremissas     → lê o estudo, aplica padrões, soma áreas/VGV/custos, avisa;
 *   montarSeries        → uma série por linha do fluxo (receita, deduções, custos);
 *   aplicarFinanciamento→ dívida à produção sobre as séries;
 *   calcularResultado   → VPL, TIR, valor de cada rubrica.
 *
 * O hook (hooks/useImovibMath.ts) é só o useMemo desta função e reexporta tudo.
 * Testes: __tests__/imovibMath.test.ts e __tests__/imovibMotorRegressao.test.ts.
 */

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

/**
 * O caixa do mês aberto por linha. Entradas positivas, saídas negativas; a soma
 * das linhas é `MonthlyFlow.net`. Linha que o motor ainda não modela vale 0.
 */
export interface LinhasDoMes {
    receitaSinal: number;
    receitaParcelasObra: number;
    receitaIntermediarias: number;
    receitaRepasse: number;
    receitaPosChaves: number;
    devolucaoDistrato: number;
    /** Deduções sobre a receita: categoria 7 das rubricas, ou o imposto da Dinâmica. */
    impostos: number;
    /** Categoria 5 das rubricas, ou a corretagem da Dinâmica. */
    comercial: number;
    /** Demais rubricas em % do VGV (categoria 8…). */
    outrasDeducoes: number;
    terreno: number;
    rubricasTerreno: number;
    obra: number;
    rubricasObra: number;
    /** Rubricas em R$ de base vgv, ao longo das vendas. */
    rubricasVendas: number;
    carregamentoDoEstoque: number;
    liberacaoDivida: number;
    /** Principal + juros pagos, inclusive a quitação do saldo no último mês. */
    pagamentoDaDivida: number;
    aporteDeTerceiros: number;
    remuneracaoDeTerceiros: number;
}

export interface MonthlyFlow {
    month: number;
    name: string;
    rev: number;
    cost: number;
    /** Caixa do acionista (do incorporador): depois da dívida. */
    net: number;
    acc: number;
    /** Caixa do projeto: sem dívida nem terceiros. */
    netProjeto: number;
    accProjeto: number;
    /** Juros que o saldo devedor rendeu no mês — informativo, fora da soma das linhas. */
    jurosDoMes: number;
    linhas: LinhasDoMes;
}

export interface ImovibMathOptions {
    vgvDelta?: number; // percentage (-10 to 10)
    costDelta?: number; // percentage (-10 to 10)
}

/** Aba do detalhe do estudo onde a premissa de um aviso é corrigida. */
export type ImovibAba = 'premises' | 'capex' | 'receitas' | 'capital' | 'viability_dynamic';

/**
 * Premissa que o motor não consegue usar como está. O motor calcula assim mesmo
 * (com o padrão, ou com o valor como veio) e AVISA — nunca troca em silêncio.
 */
export interface ImovibAviso {
    codigo: 'recebimento_nao_soma_100' | 'cronograma_invalido' | 'sem_area' | 'sem_preco' | 'bloco_sem_preco' | 'estrutura_do_estudo' | 'blocos_fora_do_calculo' | 'divida_quitada_no_fim' | 'permuta_em_dobro' | 'tir_multipla' | 'receita_liquida_negativa' | 'estoque_nao_vendido' | 'pos_chaves_sem_prazo' | 'distrato_parcial';
    mensagem: string;
    aba: ImovibAba;
}

export interface ImovibMathResult {
    monthlyFlows: MonthlyFlow[];
    maxExposure: number;
    /** VPL e TIR do ACIONISTA (fluxo `net`, depois da dívida). */
    vpl: number;
    annualIrr: number;
    /** VPL e TIR do PROJETO (fluxo `netProjeto`, sem dívida). Sem dívida, iguais aos do acionista. */
    vplProjeto: number;
    annualIrrProjeto: number;
    vgvTotal: number;
    /**
     * Receita que os compradores pagam, a valores de hoje (sem índice): VGV
     * vendável (depois das permutas) × fração vendida pela curva, menos a
     * inadimplência, mais os juros do pós-chaves, menos a devolução do distrato.
     */
    netVgvTotal: number;
    /** Fração do VGV vendável que a curva de vendas não vende no prazo (0 a 1). Fica fora da receita. */
    estoqueNaoVendidoPct: number;
    /** VGV vendido em cada mês, sem índice (índice 0 = mês 1). Antes do início das vendas, 0. */
    vendasPorMes: number[];
    constCostTotal: number;
    duration: number;
    landCost: number;
    /** Área construída (privativa + comum) × quantidade × pavimentos — a MESMA que a aba CAPEX exibe. */
    totalBlockArea: number;
    /** Parcelas de totalBlockArea (todas as tipologias, vendáveis ou não). */
    totalPrivateArea: number;
    totalCommonArea: number;
    /**
     * VGV bruto dos blocos, antes de sensibilidade, permuta e
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

/**
 * Colunas de `imovib_studies` que o motor lê. A listagem (imovibService,
 * COLUNAS_DA_LISTAGEM) seleciona a partir daqui: coluna nova lida pelo motor
 * entra AQUI, e a migration que a cria vai ao banco antes do código (senão a
 * listagem quebra com 42703). Blocos, rubricas, espelho e estrutura vêm
 * montados em memória e não estão na lista.
 * Guarda: __tests__/imovibCamposDoMotor.test.ts.
 */
export const CAMPOS_DO_MOTOR = [
    'land_cost',
    'capex_mode', 'capex_simplified_cost_sqm', 'capex_simplified_area_sqm',
    'construction_duration_months', 'sales_duration_months', 'construction_start_month', 'sales_start_month',
    'inflation_rate', 'discount_rate', 'tax_rate', 'brokerage_fee',
    'financing_percent', 'financing_rate_annual', 'funding_debt_percent',
    'swap_physical_percent', 'swap_financial_percent', 'default_rate_percent', 'cancellation_rate_percent',
    'revenue_downpayment_percent', 'revenue_construction_percent', 'revenue_handover_percent',
    // Fase 1 (migration aplicar_20271111800000)
    'sales_curve_type', 'sales_launch_percent', 'sales_launch_months', 'sales_vso_percent', 'sales_curve_custom',
    'revenue_intermediate_percent', 'revenue_intermediate_interval_months',
    'revenue_post_handover_percent', 'post_handover_months', 'post_handover_rate_monthly', 'handover_delay_months',
    'cancellation_lag_months', 'cancellation_refund_percent', 'cancellation_resale', 'cancellation_resale_discount_percent',
    'sales_index_rate_monthly', 'cost_index_rate_monthly',
] as const satisfies readonly (keyof ImovibStudy)[];

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
    vplProjeto: 0,
    annualIrrProjeto: NaN,
    vgvTotal: 0,
    netVgvTotal: 0,
    estoqueNaoVendidoPct: 0,
    vendasPorMes: [],
    constCostTotal: 0,
    duration: 0,
    landCost: 0,
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

// ── 1. Premissas ────────────────────────────────────────────────────────────

/** Tudo o que as etapas seguintes leem do estudo, já com padrões aplicados. */
interface Premissas {
    study: ImovibStudy;
    avisos: ImovibAviso[];
    constDur: number;
    salesDur: number;
    constStart: number;
    salesStart: number;
    duration: number;
    /** Índices das vendas e da obra, fração ao mês. */
    indiceVendas: number;
    indiceObra: number;
    monthlyDiscount: number;
    monthlyFinancingRate: number;
    actualFinPct: number;
    landCost: number;
    rubricas: ImovibCapexItem[];
    capexRubricasAtivas: boolean;
    rubricaTerreno: number;
    rubricaObra: number;
    rubricaVgvFixo: number;
    deducaoReceitaPct: number;
    /** `deducaoReceitaPct` aberto nas três linhas de dedução (a soma é ele). */
    deducaoPct: { impostos: number; comercial: number; outras: number };
    costDeltaMultiplier: number;
    vgvTotal: number;
    netVgvTotal: number;
    estoqueNaoVendidoPct: number;
    vendasPorMes: number[];
    constCostTotal: number;
    baseVgvTotal: number;
    vgvPorBloco: ImovibMathResult['vgvPorBloco'];
    totalBlockArea: number;
    totalPrivateArea: number;
    totalCommonArea: number;
    /** Recebimento de todas as safras, sem índice e já sem a inadimplência. */
    recebimento: SerieDeRecebimento;
}

function montarPremissas(study: ImovibStudy, options?: ImovibMathOptions): Premissas {
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

    // Último mês da obra ou das vendas. O fluxo vai além quando ainda há
    // recebimento (repasse atrasado, pós-chaves, revenda de distrato).
    const duracaoBase = Math.max(constStart + constDur - 1, salesStart + salesDur - 1, 1);

    const inflationPct = val(study.inflation_rate, D.inflation_rate); // % ao mês
    // Índices das vendas e da obra: vazios, seguem a inflação geral.
    const indiceVendas = val(study.sales_index_rate_monthly, inflationPct) / 100;
    const indiceObra = val(study.cost_index_rate_monthly, inflationPct) / 100;
    const discount = val(study.discount_rate, D.discount_rate) / 100; // Expected Annual
    const monthlyDiscount = Math.pow(1 + discount, 1 / 12) - 1; // Convert annual to monthly

    // Advanced Finance
    const taxRate = val(study.tax_rate, D.tax_rate) / 100;
    const brokerageFee = val(study.brokerage_fee, D.brokerage_fee) / 100;
    const financingPercent = val(study.financing_percent, D.financing_percent) / 100;
    const financingRateAnnual = val(study.financing_rate_annual, D.financing_rate_annual) / 100;

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
    const blocosSemPreco: string[] = [];

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

        if (blockVendavelArea > 0 && blockVgv <= 0) blocosSemPreco.push(block.name);
        baseVgvTotal += blockVgv;
        baseConstCostTotal += (blockPrivateArea + blockCommonArea) * (block.construction_cost_sqm || 0);
        totalBlockArea += blockPrivateArea + blockCommonArea;
        totalPrivateArea += blockPrivateArea;
        totalCommonArea += blockCommonArea;
    });

    // A estrutura vem do empreendimento vinculado (Planta Inteligente) ou, sem
    // vínculo, das tabelas antigas do estudo — ver utils/imovibEstrutura.ts.
    const estrutura = study.estrutura;
    if (totalBlockArea <= 0) {
        avisos.push({
            codigo: 'sem_area',
            mensagem: estrutura?.origem === 'empreendimento'
                ? `O empreendimento "${estrutura.empreendimento_nome}" ainda não tem unidades com área: publique o estudo na Planta Inteligente e envie ao empreendimento. VGV e custo de obra ficam zerados.`
                : 'Nenhuma tipologia com área: vincule um empreendimento em Premissas › Identificação — blocos e tipologias vêm da Planta Inteligente. VGV e custo de obra ficam zerados.',
            aba: 'premises',
        });
    } else if (baseVgvTotal <= 0) {
        avisos.push({
            codigo: 'sem_preco',
            mensagem: 'Nenhum bloco tem preço de venda por m²: o VGV fica zerado. Informe em Orçamento › Por torre.',
            aba: 'capex',
        });
    } else if (blocosSemPreco.length > 0) {
        avisos.push({
            codigo: 'bloco_sem_preco',
            mensagem: `Sem preço de venda por m², fora do VGV: ${blocosSemPreco.join(', ')}. Informe em Orçamento › Por torre.`,
            aba: 'capex',
        });
    }
    if (estrutura?.origem === 'estudo' && totalBlockArea > 0) {
        avisos.push({
            codigo: 'estrutura_do_estudo',
            mensagem: 'Blocos e tipologias deste estudo são a estrutura antiga, só leitura. Vincule um empreendimento em Premissas › Identificação para editá-los na Planta Inteligente.',
            aba: 'premises',
        });
    }
    if (estrutura?.origem === 'empreendimento' && estrutura.blocos_fora_do_calculo.length > 0) {
        avisos.push({
            codigo: 'blocos_fora_do_calculo',
            mensagem: `Bloco(s) antigo(s) do estudo sem torre no empreendimento, fora do cálculo: ${estrutura.blocos_fora_do_calculo.join(', ')}.`,
            aba: 'premises',
        });
    }

    // Apply Sensitivity Deltas
    const vgvDeltaMultiplier = 1 + (options?.vgvDelta || 0) / 100;
    const costDeltaMultiplier = 1 + (options?.costDelta || 0) / 100;

    const vgvTotal = baseVgvTotal * vgvDeltaMultiplier;

    // CAPEX simplificado: área única × custo/m² substitui o custo dos blocos
    // E as rubricas do detalhado.
    const simplificadoAtivo = study.capex_mode === 'simplified' && !!study.capex_simplified_cost_sqm;
    let constCostTotal: number;
    if (simplificadoAtivo) {
        const effectiveArea = study.capex_simplified_area_sqm || totalBlockArea;
        constCostTotal = effectiveArea * (study.capex_simplified_cost_sqm || 0) * costDeltaMultiplier;
    } else {
        constCostTotal = baseConstCostTotal * costDeltaMultiplier;
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
    const rubricaPct = { impostos: 0, comercial: 0, outras: 0 };
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
                if (pct) {
                    rubricaVgvPct += v / 100;
                    const cat = item.category || '';
                    const linha = cat.startsWith('7.') ? 'impostos' : cat.startsWith('5.') ? 'comercial' : 'outras';
                    rubricaPct[linha] += v / 100;
                } else rubricaVgvFixo += v;
                break;
        }
    });
    // Com rubricas, as deduções sobre a receita vêm delas.
    const deducaoReceitaPct = capexRubricasAtivas ? rubricaVgvPct : taxRate + brokerageFee;
    const deducaoPct = capexRubricasAtivas
        ? rubricaPct
        : { impostos: taxRate, comercial: brokerageFee, outras: 0 };

    // Apply Swap Physical (reduces marketed VGV)
    const swapPhysical = val(study.swap_physical_percent, D.swap_physical_percent) / 100;
    if (espelhoTemPermutada && swapPhysical > 0) {
        avisos.push({
            codigo: 'permuta_em_dobro',
            mensagem: `O espelho de vendas já tem unidades permutadas (fora do VGV) e a Permuta Física de ${Number((swapPhysical * 100).toFixed(2)).toLocaleString('pt-BR')}% também está preenchida: a permuta pode estar sendo descontada duas vezes.`,
            aba: 'capital',
        });
    }
    const marketedVgv = vgvTotal * (1 - swapPhysical);

    // Permuta financeira: parte do VGV fica com o terrenista. O que sobra é o
    // VGV vendável. Inadimplência e distrato NÃO descontam mais o VGV: entram no
    // calendário de cada safra (item 1.4 do plano 2026-11-11).
    const swapFinancial = val(study.swap_financial_percent, D.swap_financial_percent) / 100;
    const vgvVendavel = marketedVgv * (1 - swapFinancial);
    const defaultRate = val(study.default_rate_percent, D.default_rate_percent) / 100;

    // Curva de vendas: fração do VGV vendável vendida em cada mês de venda.
    const curva = curvaDeVendas({
        tipo: (study.sales_curve_type ?? D.sales_curve_type) as TipoCurvaDeVendas,
        duracao: salesDur,
        lancamentoPct: val(study.sales_launch_percent, D.sales_launch_percent),
        lancamentoMeses: val(study.sales_launch_months, D.sales_launch_months),
        vsoPct: val(study.sales_vso_percent, D.sales_vso_percent),
        pesos: study.sales_curve_custom ?? [],
    });
    const fracaoVendida = curva.reduce((a, b) => a + b, 0);
    // Abaixo de 1e-9 é resto de ponto flutuante (a linear soma 1 − 4e-16), não estoque.
    const estoqueNaoVendidoPct = curva.length > 0 && 1 - fracaoVendida > 1e-9 ? 1 - fracaoVendida : 0;
    const pctBR = (x: number) => Number((x * 100).toFixed(2)).toLocaleString('pt-BR');
    if (estoqueNaoVendidoPct > 0) {
        avisos.push({
            codigo: 'estoque_nao_vendido',
            mensagem: `A curva de vendas não vende tudo no prazo: ${pctBR(estoqueNaoVendidoPct)}% do VGV vendável (${fmtBRL(vgvVendavel * estoqueNaoVendidoPct)}) fica em estoque, fora da receita.`,
            aba: 'receitas',
        });
    }
    const vendasPorMes: number[] = [];
    for (let m = 1; m < salesStart; m++) vendasPorMes.push(0);
    curva.forEach(f => vendasPorMes.push(f * vgvVendavel));

    // Perfil de recebimento de cada safra (percentuais do valor vendido).
    const sinalPct = val(study.revenue_downpayment_percent, D.revenue_downpayment_percent);
    const parcelasObraPct = val(study.revenue_construction_percent, D.revenue_construction_percent);
    const intermediariasPct = val(study.revenue_intermediate_percent, D.revenue_intermediate_percent);
    const repassePct = val(study.revenue_handover_percent, D.revenue_handover_percent);
    const posChavesPct = val(study.revenue_post_handover_percent, D.revenue_post_handover_percent);
    const posChavesMeses = val(study.post_handover_months, D.post_handover_months);
    const revenueSum = sinalPct + parcelasObraPct + intermediariasPct + repassePct + posChavesPct;
    if (Math.abs(revenueSum - 100) > 0.01) {
        avisos.push({
            codigo: 'recebimento_nao_soma_100',
            mensagem: `O perfil de recebimento soma ${Number(revenueSum.toFixed(2)).toLocaleString('pt-BR')}% (sinal + parcelas de obra + intermediárias + repasse + pós-chaves deveria ser 100%). O cálculo usa os valores como estão.`,
            aba: 'receitas',
        });
    }
    if (posChavesPct > 0 && !(posChavesMeses > 0)) {
        avisos.push({
            codigo: 'pos_chaves_sem_prazo',
            mensagem: `O pós-chaves tem ${pctBR(posChavesPct / 100)}% do valor, mas prazo de 0 meses: o valor foi recebido inteiro nas chaves.`,
            aba: 'receitas',
        });
    }

    const handoverMonth = constStart + constDur - 1; // chaves = último mês da obra
    const recebimento = recebimentoPorSafra(vendasPorMes, {
        sinalPct,
        parcelasObraPct,
        intermediariasPct,
        intermediariasIntervalo: val(study.revenue_intermediate_interval_months, D.revenue_intermediate_interval_months),
        repassePct,
        atrasoDoRepasse: val(study.handover_delay_months, D.handover_delay_months),
        posChavesPct,
        posChavesMeses,
        posChavesJurosMensal: val(study.post_handover_rate_monthly, D.post_handover_rate_monthly),
    }, handoverMonth, {
        taxaPct: val(study.cancellation_rate_percent, D.cancellation_rate_percent),
        defasagemMeses: val(study.cancellation_lag_months, D.cancellation_lag_months),
        devolucaoPct: val(study.cancellation_refund_percent, D.cancellation_refund_percent),
        revende: study.cancellation_resale ?? D.cancellation_resale,
        desagioRevendaPct: val(study.cancellation_resale_discount_percent, D.cancellation_resale_discount_percent),
    }, duracaoBase);

    // Distrato só vale para venda feita antes das chaves (utils/imovibRecebimento.ts).
    const taxaDistrato = val(study.cancellation_rate_percent, D.cancellation_rate_percent);
    const vendidoTotal = vendasPorMes.reduce((a, b) => a + b, 0);
    const vendidoNasChavesOuDepois = vendasPorMes.slice(handoverMonth - 1).reduce((a, b) => a + b, 0);
    if (taxaDistrato > 0 && vendidoTotal > 0 && vendidoNasChavesOuDepois > 0) {
        avisos.push({
            codigo: 'distrato_parcial',
            mensagem: `${pctBR(vendidoNasChavesOuDepois / vendidoTotal)}% do VGV é vendido nas chaves (mês ${handoverMonth}) ou depois e não distrata: o distrato de ${pctBR(taxaDistrato / 100)}% vale só para as vendas anteriores.`,
            aba: 'receitas',
        });
    }

    // Inadimplência: só sobre o que o comprador paga direto à incorporadora.
    // Sinal é pago na assinatura e o repasse vem do banco.
    for (const linha of ['parcelasObra', 'intermediarias', 'posChaves'] as const) {
        recebimento[linha] = recebimento[linha].map(v => v * (1 - defaultRate));
    }
    const duration = Math.max(duracaoBase, recebimento.sinal.length);
    const netVgvTotal = (Object.values(recebimento) as number[][])
        .reduce((acc, serie) => acc + serie.reduce((a, b) => a + b, 0), 0);

    // Percentuais que passam de 100% deixam a receita líquida negativa, e ela sai
    // do caixa (antes era descartada em silêncio). O cálculo segue como veio; avisa.
    if (vgvVendavel < 0 || defaultRate > 1) {
        avisos.push({
            codigo: 'receita_liquida_negativa',
            mensagem: `Permutas ou inadimplência passam de 100%: a receita líquida fica negativa (${fmtBRL(netVgvTotal)}) e sai do caixa.`,
            aba: vgvVendavel < 0 ? 'capital' : 'receitas',
        });
    } else if (deducaoReceitaPct > 1) {
        avisos.push({
            codigo: 'receita_liquida_negativa',
            mensagem: `As deduções sobre a receita somam ${pctBR(deducaoReceitaPct)}%: passam da receita e a diferença sai do caixa.`,
            aba: capexRubricasAtivas ? 'capex' : 'viability_dynamic',
        });
    }

    // Fallback to old financingPercent if Sprint 8 fields not used, but prefer debt
    // "Financ. à Produção" (Receitas e Capital) é o campo único desde a Fase 5:
    // preenchido — inclusive com 0 — ele vale. O "% Financiado" antigo da
    // Dinâmica só entra quando ele está VAZIO (estudo anterior ao campo novo).
    // Antes, 0 caía no legado e o financiamento não chegava a zero.
    const actualFinPct = study.funding_debt_percent != null && !Number.isNaN(study.funding_debt_percent)
        ? study.funding_debt_percent / 100
        : financingPercent;

    return {
        study,
        avisos,
        constDur,
        salesDur,
        constStart,
        salesStart,
        duration,
        indiceVendas,
        indiceObra,
        monthlyDiscount,
        monthlyFinancingRate,
        actualFinPct,
        landCost,
        rubricas,
        capexRubricasAtivas,
        rubricaTerreno,
        rubricaObra,
        rubricaVgvFixo,
        deducaoReceitaPct,
        deducaoPct,
        costDeltaMultiplier,
        vgvTotal,
        netVgvTotal,
        estoqueNaoVendidoPct,
        vendasPorMes,
        constCostTotal,
        baseVgvTotal,
        vgvPorBloco,
        totalBlockArea,
        totalPrivateArea,
        totalCommonArea,
        recebimento,
    };
}

// ── 2. Séries ───────────────────────────────────────────────────────────────

/** Um valor por mês (índice 0 = mês 1), já corrigido pela inflação. */
interface Series {
    receitaBruta: number[];
    deducaoReceita: number[];
    /** Devolução do distrato ao comprador (≤ 0), corrigida pelo índice das vendas. */
    devolucao: number[];
    /** Saídas pagas com capital próprio: terreno e rubricas de terreno (mês 1), rubricas em R$ de base vgv. */
    custoProprio: number[];
    /** Custo de obra do mês — a parte financiável. */
    custoObra: number[];
    /** As mesmas entradas e saídas, abertas nas linhas de `LinhasDoMes` (sem dívida). */
    linhas: LinhasDoMes[];
    totalGrossRev: number;
    somaInflacaoVendas: number;
    rubricaVgvTotal: number;
}

function montarSeries(P: Premissas): Series {
    const { duration, salesStart, salesDur, constStart, constDur, recebimento: R } = P;

    const constMonths = Math.max(1, constDur);
    const monthlyConstCost = (P.constCostTotal + P.rubricaObra) / constMonths;
    const monthlyVgvFixo = salesDur > 0 ? P.rubricaVgvFixo / salesDur : 0;

    const S: Series = {
        receitaBruta: [], deducaoReceita: [], devolucao: [], custoProprio: [], custoObra: [], linhas: [],
        totalGrossRev: 0, somaInflacaoVendas: 0, rubricaVgvTotal: 0,
    };

    for (let m = 1; m <= duration; m++) {
        const i = m - 1;
        const multVendas = Math.pow(1 + P.indiceVendas, m - 1);
        const multObra = Math.pow(1 + P.indiceObra, m - 1);
        const emVendas = m >= salesStart && m < salesStart + salesDur;
        const emObra = m >= constStart && m < constStart + constDur;
        const linhas = linhasZeradas();

        // Recebimento das safras (item 1.2), corrigido pelo índice das vendas.
        linhas.receitaSinal = (R.sinal[i] ?? 0) * multVendas;
        linhas.receitaParcelasObra = (R.parcelasObra[i] ?? 0) * multVendas;
        linhas.receitaIntermediarias = (R.intermediarias[i] ?? 0) * multVendas;
        linhas.receitaRepasse = (R.repasse[i] ?? 0) * multVendas;
        linhas.receitaPosChaves = (R.posChaves[i] ?? 0) * multVendas;
        linhas.devolucaoDistrato = (R.devolucaoDistrato[i] ?? 0) * multVendas;
        const grossRev = linhas.receitaSinal + linhas.receitaParcelasObra + linhas.receitaIntermediarias
            + linhas.receitaRepasse + linhas.receitaPosChaves;
        linhas.impostos = -grossRev * P.deducaoPct.impostos;
        linhas.comercial = -grossRev * P.deducaoPct.comercial;
        linhas.outrasDeducoes = -grossRev * P.deducaoPct.outras;

        // Deduções sobre a receita: rubricas de base vgv (modo Completo) ou
        // imposto + corretagem da Dinâmica — nunca os dois.
        S.totalGrossRev += grossRev;
        if (emVendas) S.somaInflacaoVendas += multVendas;
        const revenueDeduction = grossRev * P.deducaoReceitaPct;
        if (P.capexRubricasAtivas) S.rubricaVgvTotal += revenueDeduction;

        let proprio = 0;
        if (m === 1) {
            proprio += P.landCost + P.rubricaTerreno;
            linhas.terreno = -P.landCost;
            linhas.rubricasTerreno = -P.rubricaTerreno;
        }
        if (monthlyVgvFixo > 0 && emVendas) {
            const fixo = monthlyVgvFixo * multVendas;
            proprio += fixo;
            S.rubricaVgvTotal += fixo;
            linhas.rubricasVendas = -fixo;
        }
        if (emObra) {
            linhas.obra = -(P.constCostTotal / constMonths) * multObra;
            linhas.rubricasObra = -(P.rubricaObra / constMonths) * multObra;
        }

        S.receitaBruta.push(grossRev);
        S.deducaoReceita.push(revenueDeduction);
        S.devolucao.push(linhas.devolucaoDistrato);
        S.custoProprio.push(proprio);
        S.custoObra.push(emObra ? monthlyConstCost * multObra : 0);
        S.linhas.push(linhas);
    }
    return S;
}

const linhasZeradas = (): LinhasDoMes => ({
    receitaSinal: 0, receitaParcelasObra: 0, receitaIntermediarias: 0, receitaRepasse: 0, receitaPosChaves: 0,
    devolucaoDistrato: 0, impostos: 0, comercial: 0, outrasDeducoes: 0,
    terreno: 0, rubricasTerreno: 0, obra: 0, rubricasObra: 0, rubricasVendas: 0, carregamentoDoEstoque: 0,
    liberacaoDivida: 0, pagamentoDaDivida: 0, aporteDeTerceiros: 0, remuneracaoDeTerceiros: 0,
});

// ── 3. Financiamento ────────────────────────────────────────────────────────

interface FluxoDoAcionista {
    monthlyFlows: MonthlyFlow[];
    net: number[];
    netProjeto: number[];
    maxExposure: number;
    debtPayoffAtEnd: number;
}

function aplicarFinanciamento(P: Premissas, S: Series): FluxoDoAcionista {
    let accumulatedFlow = 0;
    let accProjeto = 0;
    let maxExposure = 0;
    let debtBalance = 0;
    let debtPayoffAtEnd = 0;
    const monthlyFlows: MonthlyFlow[] = [];
    const net: number[] = [];
    const netProjetoDoMes: number[] = [];

    for (let m = 1; m <= P.duration; m++) {
        const i = m - 1;
        const grossRev = S.receitaBruta[i];
        const netRev = grossRev - S.deducaoReceita[i] + S.devolucao[i];
        const custoObra = S.custoObra[i];

        const totalCost = S.custoProprio[i] + custoObra;
        const financedCost = custoObra * P.actualFinPct;
        const equityCost = S.custoProprio[i] + (custoObra - financedCost);

        const jurosDoMes = debtBalance * P.monthlyFinancingRate;
        debtBalance = debtBalance * (1 + P.monthlyFinancingRate);
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
        } else {
            // Deduções acima da receita do mês (só com percentuais somando mais de
            // 100%): a diferença sai do caixa. Antes era descartada em silêncio.
            investorRev = netRev;
        }

        let netFlow = investorRev - equityCost;

        // Último mês: o saldo que as receitas não amortizaram é quitado pelo
        // investidor. O motor antigo terminava o fluxo com a dívida em
        // aberto e a descartava — com 100% de dívida, subir o custo de obra
        // não mudava o VPL.
        if (m === P.duration && debtBalance > 0.005) {
            debtPayoffAtEnd = debtBalance;
            debtPayment += debtBalance;
            netFlow -= debtBalance;
            debtBalance = 0;
        }

        accumulatedFlow += netFlow;
        if (accumulatedFlow < maxExposure) maxExposure = accumulatedFlow;

        const linhas: LinhasDoMes = { ...S.linhas[i], liberacaoDivida: financedCost, pagamentoDaDivida: -debtPayment };
        const netProjeto = netFlow - linhas.liberacaoDivida - linhas.pagamentoDaDivida;
        accProjeto += netProjeto;

        monthlyFlows.push({
            month: m, name: `Mês ${m}`, rev: grossRev, cost: totalCost, net: netFlow, acc: accumulatedFlow,
            netProjeto, accProjeto, jurosDoMes, linhas,
        });
        net.push(netFlow);
        netProjetoDoMes.push(netProjeto);
    }

    if (debtPayoffAtEnd > 0) {
        P.avisos.push({
            codigo: 'divida_quitada_no_fim',
            mensagem: `As receitas não amortizaram todo o financiamento: ${fmtBRL(debtPayoffAtEnd)} de saldo devedor são quitados com capital próprio no mês ${P.duration}.`,
            aba: 'capital',
        });
    }
    return { monthlyFlows, net, netProjeto: netProjetoDoMes, maxExposure, debtPayoffAtEnd };
}

// ── 4. Resultado ────────────────────────────────────────────────────────────

function calcularResultado(P: Premissas, S: Series, F: FluxoDoAcionista): ImovibMathResult {
    // Valor de cada rubrica no cálculo — mesma regra de montarPremissas, item a item.
    const capexValorPorRubrica: Record<string, number> = {};
    const fatorVendas = P.salesDur > 0 ? S.somaInflacaoVendas / P.salesDur : 1;
    P.rubricas.forEach(item => {
        const v = Number(item.value) || 0;
        const pct = item.value_type === 'percent';
        let valor = 0;
        switch (baseDaRubrica(item)) {
            case 'terreno': valor = pct ? P.landCost * v / 100 : v; break;
            case 'obra': valor = pct ? P.constCostTotal * v / 100 : v * P.costDeltaMultiplier; break;
            case 'vgv': valor = pct ? S.totalGrossRev * v / 100 : v * fatorVendas; break;
        }
        capexValorPorRubrica[item.id] = valor;
    });

    const vpl = calculateNPV(P.monthlyDiscount, F.net); // Using monthly discount rate

    // IRR is returned as a monthly rate. Convert to annual.
    const tir = calcularTirMensal(F.net);
    const monthlyIrr = tir.taxa;
    let annualIrr = NaN;
    if (!isNaN(monthlyIrr) && isFinite(monthlyIrr)) {
        annualIrr = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;
    }
    const vplProjeto = calculateNPV(P.monthlyDiscount, F.netProjeto);
    const tirProjeto = calcularTirMensal(F.netProjeto).taxa;
    const annualIrrProjeto = Number.isFinite(tirProjeto) ? (Math.pow(1 + tirProjeto, 12) - 1) * 100 : NaN;
    if (tir.raizes > 1) {
        P.avisos.push({
            codigo: 'tir_multipla',
            mensagem: `O fluxo troca de sinal mais de uma vez e tem ${tir.raizes} TIRs; a exibida (${annualIrr.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.) é a de menor valor. Para decidir, use o VPL.`,
            aba: 'viability_dynamic',
        });
    }

    return {
        monthlyFlows: F.monthlyFlows,
        maxExposure: F.maxExposure,
        vpl,
        annualIrr,
        vplProjeto,
        annualIrrProjeto,
        vgvTotal: P.vgvTotal,
        netVgvTotal: P.netVgvTotal,
        estoqueNaoVendidoPct: P.estoqueNaoVendidoPct,
        vendasPorMes: P.vendasPorMes,
        constCostTotal: P.constCostTotal,
        duration: P.duration,
        landCost: P.landCost,
        totalBlockArea: P.totalBlockArea,
        totalPrivateArea: P.totalPrivateArea,
        totalCommonArea: P.totalCommonArea,
        vgvBase: P.baseVgvTotal,
        vgvPorBloco: P.vgvPorBloco,
        debtPayoffAtEnd: F.debtPayoffAtEnd,
        capexRubricasAtivas: P.capexRubricasAtivas,
        capexRubricas: {
            terreno: P.rubricaTerreno,
            obra: P.rubricaObra,
            vgv: S.rubricaVgvTotal,
            total: P.rubricaTerreno + P.rubricaObra + S.rubricaVgvTotal,
        },
        capexValorPorRubrica,
        avisos: P.avisos,
    };
}

/**
 * Núcleo de cálculo puro — sem React. Roda em lote (uma linha por estudo na
 * listagem de Estudos de Viabilidade), onde chamar o hook num loop violaria as
 * regras dos Hooks. O hook useImovibMath é um wrapper memoizado desta função.
 */
export const computeImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
    if (!study) return { ...EMPTY_RESULT, avisos: [] };
    const P = montarPremissas(study, options);
    const S = montarSeries(P);
    const F = aplicarFinanciamento(P, S);
    return calcularResultado(P, S, F);
};
