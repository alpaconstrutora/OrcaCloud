import { ImovibStudy, ImovibCapexItem, ImovibCapexBase, ImovibCapexTiming } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { curvaDeVendas, TipoCurvaDeVendas, curvaDeDesembolso, TipoCurvaDeDesembolso } from './imovibCurvas';
import { nomeDoMes } from './imovibCronograma';
import { impostoPorMes, hipotesesDoEstudo, HipotesesTributarias, RegimeTributarioDoEstudo } from './imovibTributos';
import { recebimentoPorSafra, SerieDeRecebimento } from './imovibRecebimento';
import { fluxoDaDivida, PremissasDoFinanciamento } from './imovibFinanciamento';
import { aportesEDistribuicoes, LinhaDeAporte } from './imovibAportes';
import { fluxoDasFontes, partilhaDasDistribuicoes } from './imovibFontes';

/**
 * Motor dos Estudos de Viabilidade (Imovib) — cálculo puro, sem React.
 *
 * Saiu de hooks/useImovibMath.ts na Fase 0 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, dividido em quatro
 * etapas que as fases seguintes estendem sem mexer nas outras:
 *
 *   montarPremissas     → lê o estudo, aplica padrões, soma áreas/VGV/custos, avisa;
 *   montarSeries        → uma série por linha do fluxo (receita, deduções, custos);
 *   aplicarFinanciamento→ dívida à produção, outras fontes, aportes e distribuições;
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
    /** Imposto sobre a receita: categoria 7 das rubricas, o imposto da Dinâmica, ou o regime tributário (item 6.2). */
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
    /**
     * Não calcula as TIRs (ficam NaN, sem o aviso `tir_multipla`). Para as buscas que
     * rodam o motor dezenas de vezes e só olham VPL, lucro ou margem (pontos de
     * equilíbrio): a varredura da TIR é o grosso do tempo de cada chamada.
     */
    semTir?: boolean;
}

/** Aba do detalhe do estudo onde a premissa de um aviso é corrigida. */
export type ImovibAba = 'premises' | 'capex' | 'receitas' | 'capital' | 'viability_dynamic';
/** Sub-aba de Premissas (ImovibPremisesForm). */
export type ImovibSubAbaDePremissas = 'identificacao' | 'mercado' | 'cronograma' | 'terreno' | 'memorial';

/**
 * Premissa que o motor não consegue usar como está. O motor calcula assim mesmo
 * (com o padrão, ou com o valor como veio) e AVISA — nunca troca em silêncio.
 */
export interface ImovibAviso {
    codigo: 'recebimento_nao_soma_100' | 'cronograma_invalido' | 'sem_area' | 'sem_preco' | 'bloco_sem_preco' | 'estrutura_do_estudo' | 'blocos_fora_do_calculo' | 'divida_quitada_no_fim' | 'permuta_em_dobro' | 'tir_multipla' | 'receita_liquida_negativa' | 'estoque_nao_vendido' | 'pos_chaves_sem_prazo' | 'distrato_parcial' | 'financiamento_nao_liberado' | 'fontes_de_capital'
        | 'lancamento_antes_do_registro' | 'obra_antes_da_aprovacao' | 'terreno_nao_soma_100' | 'curva_de_desembolso_nao_soma_100'
        | 'impostos_pelo_regime' | 'ret_sem_afetacao' | 'premissa_ajustada' | 'premissa_ajustada_capital' | 'distrato_sem_revenda' | 'custo_de_obra_negativo' | 'pre_obra_sem_meses';
    mensagem: string;
    aba: ImovibAba;
    /** Em Premissas, a sub-aba que corrige (pendência da Fase 5: antes abria sempre em Identificação). */
    subAba?: ImovibSubAbaDePremissas;
}

export interface IndicadoresDeProduto {
    /**
     * Área privativa das tipologias vendáveis ÷ área construída do custo (0 a 1).
     * null sem área comum cadastrada (daria ~100%, que nenhum prédio tem), salvo
     * no CAPEX simplificado com área digitada.
     */
    eficiencia: number | null;
    /** A área do custo de obra não tem área comum: custo por m² equivalente fica subestimado. */
    custoSemAreaComum: boolean;
    unidadesVendaveis: number;
    /** VGV ÷ unidades à venda. */
    ticketMedio: number | null;
    /** VGV ÷ área privativa à venda, sem as unidades do espelho com preço e sem área. */
    vgvPorM2Privativo: number | null;
    /** Unidades do espelho com preço e sem área privativa: fora do VGV por m² (inflariam a razão). */
    unidadesSemArea: number;
    /** Custo de obra ÷ área privativa das tipologias vendáveis. */
    custoObraPorM2Privativo: number | null;
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
    /** Área privativa à venda — sem tipologias não vendáveis nem unidades PERMUTADO do espelho: a do VGV (item 7.1). */
    areaPrivativaVendavel: number;
    totalCommonArea: number;
    /**
     * Indicadores de produto (item 8.1). Razão sem base (sem área, sem unidade)
     * fica null, nunca 0. A eficiência e o custo por m² usam a área privativa das
     * tipologias vendáveis, com as permutadas (são construídas e vendáveis; a
     * permuta é negócio, não produto); VGV por m² e tíquete, a área e as unidades à venda.
     */
    produto: IndicadoresDeProduto;
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
     * De onde vem o dinheiro do empreendimento (item 4.2, decisão D2), em R$:
     * capital próprio necessário (módulo da exposição máxima), dívida liberada,
     * permuta (VGV entregue ao terrenista) e outras fontes; e (item 4B.1) o que
     * os compradores pagam até as chaves, sem o repasse, depois das deduções e
     * da devolução de distrato. Fatias: composicaoDoCapital em utils/imovibFinanciamento.ts.
     */
    capital: { proprio: number; divida: number; vendasNaObra: number; permuta: number; terceiros: number };
    /** Aportes e distribuições mês a mês (item 4.3), sobre o caixa antes da participação das fontes. */
    aportes: LinhaDeAporte[];
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
    /**
     * Com regime tributário (item 6.2): as rubricas de imposto (e o imposto da
     * Dinâmica) que ficaram fora do cálculo, "Nome (x%)" — o cartão do regime mostra.
     */
    impostosForaDoCalculo: string[];
    avisos: ImovibAviso[];
}

const calculateNPV = (rate: number, cashFlows: number[]): number => {
    return cashFlows.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
};

/**
 * O mesmo VPL com o fator de desconto acumulado mês a mês, sem potência por
 * termo — usado só na BUSCA da TIR, que avalia ~940 taxas por fluxo. A busca
 * fica ~5× mais rápida (a simulação de Monte Carlo roda o motor milhares de
 * vezes); a raiz achada é a mesma até a 12ª casa.
 */
const vplNaBusca = (rate: number, cashFlows: number[]): number => {
    const fator = 1 / (1 + rate);
    let desconto = 1;
    let acc = 0;
    for (const v of cashFlows) {
        acc += v * desconto;
        desconto *= fator;
    }
    return acc;
};

// Limites da busca da TIR MENSAL. −90% a.m. já é perda total em qualquer
// horizonte; abaixo disso (1 + r)^i perde precisão em fluxos longos.
const IRR_LOW = -0.9;
const IRR_HIGH = 10.0;

/** Bissecção num intervalo [a, b] onde o VPL troca de sinal. */
const bissectar = (cashFlows: number[], a: number, b: number): number => {
    let low = a;
    let high = b;
    let npvLow = vplNaBusca(low, cashFlows);
    for (let i = 0; i < 200 && high - low > 1e-12; i++) {
        const mid = (low + high) / 2;
        const npvMid = vplNaBusca(mid, cashFlows);
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
    let vAnt = vplNaBusca(rAnt, cashFlows);
    for (let k = 1; k < GRADE_TIR.length; k++) {
        const r = GRADE_TIR[k];
        const v = vplNaBusca(r, cashFlows);
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
    // Fase 4 (migration aplicar_20271111970000)
    'financing_release_lag_months', 'financing_min_sales_percent', 'financing_interest_mode', 'financing_amortization',
    'min_cash_balance',
    // Fase 5 (migration aplicar_20271112100000); base_date dá nome aos meses
    'base_date', 'acquisition_month', 'approval_month', 'incorporation_registry_month', 'land_payment_schedule',
    'cost_curve_type', 'cost_curve_custom', 'stock_carrying_cost_unit_month',
    // Fase 6 (migration aplicar_20271112200000)
    'tax_regime', 'tax_hypotheses',
    // Fase 9
    'patrimonio_afetacao',
] as const satisfies readonly (keyof ImovibStudy)[];

/** Devolução padrão no distrato: com patrimônio de afetação a retenção pode ir a 50% (item 9.1). */
export const devolucaoPadraoDoDistrato = (study: Pick<ImovibStudy, 'patrimonio_afetacao'>): number =>
    study.patrimonio_afetacao ? IMOVIB_DEFAULTS.cancellation_refund_percent_afetacao : IMOVIB_DEFAULTS.cancellation_refund_percent;

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
    areaPrivativaVendavel: 0,
    produto: { eficiencia: null, custoSemAreaComum: false, unidadesVendaveis: 0, ticketMedio: null, vgvPorM2Privativo: null, unidadesSemArea: 0, custoObraPorM2Privativo: null },
    totalCommonArea: 0,
    vgvBase: 0,
    vgvPorBloco: {},
    debtPayoffAtEnd: 0,
    capital: { proprio: 0, divida: 0, vendasNaObra: 0, permuta: 0, terceiros: 0 },
    aportes: [],
    capexRubricasAtivas: false,
    capexRubricas: { terreno: 0, obra: 0, vgv: 0, total: 0 },
    capexValorPorRubrica: {},
    impostosForaDoCalculo: [],
    avisos: [],
};

// ── 1. Premissas ────────────────────────────────────────────────────────────

/** Rubrica que sai no seu próprio momento (item 5.5), não pela base. */
interface RubricaComMomento {
    id: string;
    /** Nome da rubrica, para os avisos. */
    nome: string;
    base: ImovibCapexBase;
    /** Valor total, antes do índice. */
    valor: number;
    timing: ImovibCapexTiming;
    /** `pos_obra`: meses depois do fim da obra. */
    meses: number | null;
    /** Fração do valor em cada mês (índice 0 = mês 1), preenchida em montarPremissas. */
    pesos?: number[];
}

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
    financiamento: PremissasDoFinanciamento;
    caixaMinimo: number;
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
    /** VGV depois das permutas: a base das vendas e da exigência de vendas do financiamento. */
    vgvVendavel: number;
    /** Preço das unidades PERMUTADO do espelho (já fora do VGV). */
    permutaDoEspelho: number;
    netVgvTotal: number;
    estoqueNaoVendidoPct: number;
    vendasPorMes: number[];
    constCostTotal: number;
    baseVgvTotal: number;
    vgvPorBloco: ImovibMathResult['vgvPorBloco'];
    totalBlockArea: number;
    totalPrivateArea: number;
    totalCommonArea: number;
    areaPrivativaVendavel: number;
    /** Área privativa das tipologias vendáveis, com as permutadas (item 8.1). */
    areaPrivativaDasTipologiasVendaveis: number;
    /** Área construída sobre a qual o custo de obra é calculado: a do CAPEX simplificado quando digitada. */
    areaConstruidaDoCusto: number;
    /** VGV (sem sensibilidade) e número das unidades do espelho com preço e sem área privativa. */
    vgvSemArea: number;
    unidadesSemArea: number;
    /** Recebimento de todas as safras, sem índice e já sem a inadimplência. */
    recebimento: SerieDeRecebimento;
    // Fase 5
    /** Parcelas do terreno: mês e fração do custo (vazio = 100% na aquisição). */
    parcelasTerreno: { mes: number; fracao: number }[];
    /** Rubricas de terreno sem momento saem aqui. */
    mesDaPrimeiraParcela: number;
    /** Fração do custo de obra em cada mês da obra; null = linear (conta de antes). */
    curvaObra: number[] | null;
    rubricasComMomento: RubricaComMomento[];
    /** Último mês com receita: a dívida e as fontes são quitadas aqui, mesmo com pós-obra depois. */
    horizonteDasReceitas: number;
    handoverMonth: number;
    unidadesVendaveis: number;
    /** 'manual' = o imposto vem das rubricas 7. ou da Dinâmica; outro = impostoPorMes (item 6.2). */
    regimeTributario: RegimeTributarioDoEstudo;
    hipotesesTributarias: HipotesesTributarias;
    impostosForaDoCalculo: string[];
    /** Ids das rubricas de imposto fora do cálculo pelo regime (valem 0). */
    rubricasForaPeloRegime: Set<string>;
    /** Unidades que pagam condomínio e IPTU enquanto não vendidas (sem a permuta física). */
    unidadesEmEstoque: number;
    custoDoEstoqueUnidadeMes: number;
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
    let permutaDoEspelho = 0;
    /** Unidades à venda (item 5.6): do espelho quando o bloco tem, senão das tipologias vendáveis. */
    let unidadesDoEspelho = 0;
    let areaPrivativaVendavel = 0;
    let areaPrivativaDasTipologiasVendaveis = 0;
    let vgvSemArea = 0;
    let unidadesSemArea = 0;
    let unidadesSemEspelho = 0;
    const blocosSemPreco: string[] = [];

    study.blocks?.forEach(block => {
        let blockPrivateArea = 0;
        let blockCommonArea = 0;
        let blockVendavelArea = 0;
        let blockUnidadesVendaveis = 0;
        block.units?.forEach(u => {
            const pav = u.pavimentos || 1;
            const priv = (u.quantity || 0) * pav * (u.private_area || 0);
            blockPrivateArea += priv;
            blockCommonArea += (u.quantity || 0) * pav * (u.common_area || 0);
            // Tipologia não vendável é área comum (o espelho e o sync a tratam
            // assim): entra no custo de obra, NÃO no VGV. Antes entrava nos dois.
            if (u.is_vendavel !== false) {
                blockVendavelArea += priv;
                blockUnidadesVendaveis += (u.quantity || 0) * pav;
            }
        });

        // VGV do bloco: espelho de vendas quando existe (decisão de 2026-10-12),
        // senão área privativa vendável × preço/m².
        const precoM2 = block.sales_price_sqm || 0;
        const doBloco = instancias.filter(i => i.block_id === block.id);
        let blockVgv: number;
        if (doBloco.length > 0) {
            if (doBloco.some(i => i.status === 'PERMUTADO')) espelhoTemPermutada = true;
            const precoDa = (i: typeof doBloco[number]) => ((i.price || 0) > 0 ? i.price : (i.private_area || 0) * precoM2);
            blockVgv = doBloco
                .filter(i => i.status !== 'PERMUTADO')
                .reduce((acc, i) => acc + precoDa(i), 0);
            // Fora do VGV, mas é capital do terrenista: entra na fatia da permuta (item 4.2).
            permutaDoEspelho += doBloco.filter(i => i.status === 'PERMUTADO').reduce((acc, i) => acc + precoDa(i), 0);
            vgvPorBloco[block.id] = { vgv: blockVgv, fonte: 'espelho' };
            unidadesDoEspelho += doBloco.filter(i => i.status !== 'PERMUTADO').length;
            areaPrivativaVendavel += doBloco.filter(i => i.status !== 'PERMUTADO').reduce((acc, i) => acc + (i.private_area || 0), 0);
            for (const i of doBloco) {
                if (i.status === 'PERMUTADO' || (i.private_area || 0) > 0 || precoDa(i) <= 0) continue;
                vgvSemArea += precoDa(i);
                unidadesSemArea++;
            }
        } else {
            blockVgv = blockVendavelArea * precoM2;
            vgvPorBloco[block.id] = { vgv: blockVgv, fonte: 'preco_m2' };
            unidadesSemEspelho += blockUnidadesVendaveis;
            areaPrivativaVendavel += blockVendavelArea;
        }

        if (blockVendavelArea > 0 && blockVgv <= 0) blocosSemPreco.push(block.name);
        baseVgvTotal += blockVgv;
        baseConstCostTotal += (blockPrivateArea + blockCommonArea) * (block.construction_cost_sqm || 0);
        totalBlockArea += blockPrivateArea + blockCommonArea;
        totalPrivateArea += blockPrivateArea;
        totalCommonArea += blockCommonArea;
        areaPrivativaDasTipologiasVendaveis += blockVendavelArea;
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
            subAba: 'identificacao',
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
            subAba: 'identificacao',
        });
    }
    if (estrutura?.origem === 'empreendimento' && estrutura.blocos_fora_do_calculo.length > 0) {
        avisos.push({
            codigo: 'blocos_fora_do_calculo',
            mensagem: `Bloco(s) antigo(s) do estudo sem torre no empreendimento, fora do cálculo: ${estrutura.blocos_fora_do_calculo.join(', ')}.`,
            aba: 'premises',
            subAba: 'identificacao',
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
    let areaConstruidaDoCusto = totalBlockArea;
    if (simplificadoAtivo) {
        const effectiveArea = study.capex_simplified_area_sqm || totalBlockArea;
        areaConstruidaDoCusto = effectiveArea;
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
    // Regime tributário (item 6.2): fora do manual, o imposto é calculado pelo
    // regime e as rubricas da categoria 7 (e o imposto da Dinâmica) ficam fora.
    const regimeTributario = (study.tax_regime ?? D.tax_regime) as RegimeTributarioDoEstudo;
    const pePeloRegime = regimeTributario !== 'manual';
    if ((regimeTributario === 'ret' || regimeTributario === 'ret_his') && !study.patrimonio_afetacao) {
        avisos.push({
            codigo: 'ret_sem_afetacao',
            mensagem: `O RET só vale para incorporação submetida ao patrimônio de afetação, e ${study.patrimonio_afetacao == null ? 'o patrimônio de afetação do estudo não foi informado' : 'o estudo está sem patrimônio de afetação'}. Marque-o em Premissas › Identificação ou troque o regime tributário.`,
            aba: 'premises',
            subAba: 'identificacao',
        });
    }
    const impostosForaDoCalculo: string[] = [];
    const rubricasForaPeloRegime = new Set<string>();
    // Rubricas com momento próprio (item 5.5): valor total aqui, calendário em montarSeries.
    const rubricasComMomento: RubricaComMomento[] = [];
    rubricas.forEach(item => {
        const v = Number(item.value) || 0;
        const pct = item.value_type === 'percent';
        const base = baseDaRubrica(item);
        // % do VGV é dedução sobre a receita de cada mês: o momento não se aplica.
        if (item.timing && !(base === 'vgv' && pct)) {
            const valor = base === 'terreno' ? (pct ? landCost * v / 100 : v)
                : base === 'obra' ? (pct ? constCostTotal * v / 100 : v * costDeltaMultiplier)
                    : v;
            // Valor 0 (o botão de pós-obra cria assim) não entra no calendário nem estende o fluxo.
            if (valor !== 0) rubricasComMomento.push({ id: item.id, nome: item.name, base, valor, timing: item.timing, meses: item.timing_months ?? null });
            return;
        }
        switch (base) {
            case 'terreno':
                rubricaTerreno += pct ? landCost * v / 100 : v;
                break;
            case 'obra':
                rubricaObra += pct ? constCostTotal * v / 100 : v * costDeltaMultiplier;
                break;
            case 'vgv':
                if (pct) {
                    const cat = item.category || '';
                    if (pePeloRegime && cat.startsWith('7.')) {
                        rubricasForaPeloRegime.add(item.id);
                        if (v !== 0) impostosForaDoCalculo.push(`${item.name} (${v.toLocaleString('pt-BR')}%)`);
                        break;
                    }
                    rubricaVgvPct += v / 100;
                    const linha = cat.startsWith('7.') ? 'impostos' : cat.startsWith('5.') ? 'comercial' : 'outras';
                    rubricaPct[linha] += v / 100;
                } else rubricaVgvFixo += v;
                break;
        }
    });
    // Com rubricas, as deduções sobre a receita vêm delas.
    if (pePeloRegime && !capexRubricasAtivas && taxRate !== 0) impostosForaDoCalculo.push(`imposto da Dinâmica (${(taxRate * 100).toLocaleString('pt-BR')}%)`);
    const impostoManual = pePeloRegime ? 0 : taxRate;
    const deducaoReceitaPct = capexRubricasAtivas ? rubricaVgvPct : impostoManual + brokerageFee;
    const deducaoPct = capexRubricasAtivas
        ? rubricaPct
        : { impostos: impostoManual, comercial: brokerageFee, outras: 0 };
    // Sem ImovibAviso: os campos ficam desligados pelo regime e o aviso não teria como
    // ser resolvido (revisão da Fase 6). O cartão do regime mostra `impostosForaDoCalculo`.

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
    // Premissas fora da faixa: o cálculo segue como dá, e o aviso diz o que ajustou
    // (regra 5 do plano; antes os ajustes eram silenciosos — pendência da Fase 1).
    // Só entra aqui o que o cálculo de fato LIMITA: permuta acima de 100% é usada como
    // está (a receita fica negativa) e quem avisa é `receita_liquida_negativa`.
    const ajustes: string[] = [];
    const ajustesDoCapital: string[] = [];
    const pctTxt = (x: number) => `${Number(x.toFixed(2)).toLocaleString('pt-BR')}%`;
    const foraDaFaixa = (x: number | null | undefined, rotulo: string) => {
        if (x == null || Number.isNaN(x)) return;
        if (x > 100) ajustes.push(`${rotulo} de ${pctTxt(x)} vale como 100%`);
        else if (x < 0) ajustes.push(`${rotulo} de ${pctTxt(x)} vale como 0%`);
    };
    const tipoDaCurva = study.sales_curve_type ?? D.sales_curve_type;
    if (tipoDaCurva === 'lancamento') {
        const mesesDoLancamento = Math.round(val(study.sales_launch_months, D.sales_launch_months));
        // curvaDeVendas: 0 mês ou o prazo inteiro de lançamento = linear (o % não é usado).
        if (mesesDoLancamento >= salesDur || mesesDoLancamento <= 0) {
            ajustes.push(`os meses do lançamento (${mesesDoLancamento}) ${mesesDoLancamento <= 0 ? 'estão zerados' : `cobrem o prazo de vendas (${salesDur})`}: vende igual em todos os meses, sem o % do lançamento`);
        } else {
            foraDaFaixa(study.sales_launch_percent, 'Vendido no lançamento');
        }
    }
    if (tipoDaCurva === 'vso') foraDaFaixa(study.sales_vso_percent, 'VSO');
    if (tipoDaCurva === 'custom') {
        const pesos = study.sales_curve_custom ?? [];
        // Peso positivo além do prazo é o que se perde (zeros no fim não mudam nada).
        const alemDoPrazo = pesos.slice(salesDur).filter(x => Number(x) > 0).length;
        if (alemDoPrazo > 0) ajustes.push(`${alemDoPrazo} pesos da curva personalizada ficam além do prazo de vendas e fora do cálculo`);
        if (pesos.slice(0, salesDur).some(x => Number(x) < 0)) ajustes.push('pesos negativos da curva personalizada valem 0');
    }
    // imovibRecebimento limita distrato e deságio a 0–100%; a devolução não tem limite.
    foraDaFaixa(study.cancellation_rate_percent, 'Distrato');
    foraDaFaixa(study.cancellation_resale_discount_percent, 'Deságio da revenda');
    const devolucaoInformada = study.cancellation_refund_percent;
    if (devolucaoInformada != null && devolucaoInformada > 100) ajustes.push(`Devolução ao comprador de ${pctTxt(devolucaoInformada)} devolve mais do que ele pagou (usada como está)`);
    if ((study.cancellation_lag_months ?? 0) < 0) ajustes.push(`os meses até o distrato (${study.cancellation_lag_months}) valem 0`);
    if ((study.financing_release_lag_months ?? 0) < 0) ajustesDoCapital.push(`a defasagem da liberação (${study.financing_release_lag_months}) vale 0`);
    if (ajustes.length) {
        avisos.push({
            codigo: 'premissa_ajustada',
            mensagem: `O cálculo ajustou premissas fora da faixa: ${ajustes.join('; ')}. Corrija os campos para o número ser o que você quer.`,
            aba: 'receitas',
        });
    }
    if (ajustesDoCapital.length) {
        avisos.push({
            codigo: 'premissa_ajustada_capital',
            mensagem: `O cálculo ajustou premissas do financiamento fora da faixa: ${ajustesDoCapital.join('; ')}. Corrija o campo na aba Capital.`,
            aba: 'capital',
        });
    }
    if (constCostTotal < 0) {
        avisos.push({
            codigo: 'custo_de_obra_negativo',
            mensagem: `O custo de obra está negativo (${fmtBRL(constCostTotal)}): confira o custo/m² das torres. O financiamento não libera nada sobre custo negativo.`,
            aba: 'capex',
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
        devolucaoPct: val(study.cancellation_refund_percent, devolucaoPadraoDoDistrato(study)),
        revende: study.cancellation_resale ?? D.cancellation_resale,
        desagioRevendaPct: val(study.cancellation_resale_discount_percent, D.cancellation_resale_discount_percent),
        // A devolução é sobre o que o comprador pagou: sem a parte inadimplente das parcelas.
        inadimplenciaPct: val(study.default_rate_percent, D.default_rate_percent),
    }, duracaoBase);

    // Distrato só vale para venda feita antes das chaves (utils/imovibRecebimento.ts).
    const taxaDistrato = val(study.cancellation_rate_percent, D.cancellation_rate_percent);
    const vendidoTotal = vendasPorMes.reduce((a, b) => a + b, 0);
    const vendidoNasChavesOuDepois = vendasPorMes.slice(handoverMonth - 1).reduce((a, b) => a + b, 0);
    // Sem revenda, a unidade distratada não volta a ser vendida — só importa se alguém
    // distrata (venda antes das chaves).
    if (taxaDistrato > 0 && vendidoTotal - vendidoNasChavesOuDepois > 0 && !(study.cancellation_resale ?? D.cancellation_resale)) {
        avisos.push({
            codigo: 'distrato_sem_revenda',
            mensagem: `Sem revenda, a unidade distratada (${pctBR(taxaDistrato / 100)}% das vendas antes das chaves) sai do estoque e não é vendida de novo: o VGV dela fica fora da receita.`,
            aba: 'receitas',
        });
    }
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

    // ── Fase 5: tempo e custos ──
    // Marcos (item 5.1): só avisam; o cálculo segue o cronograma como está.
    const registro = study.incorporation_registry_month;
    if (registro != null && salesStart < registro) {
        avisos.push({
            codigo: 'lancamento_antes_do_registro',
            mensagem: `O lançamento (mês ${salesStart}) vem antes do registro da incorporação (mês ${registro}): pela Lei 4.591/64, art. 32, só se negociam unidades depois do registro.`,
            aba: 'premises',
            subAba: 'cronograma',
        });
    }
    const aprovacao = study.approval_month;
    if (aprovacao != null && constStart < aprovacao) {
        avisos.push({
            codigo: 'obra_antes_da_aprovacao',
            mensagem: `A obra começa (mês ${constStart}) antes da aprovação do projeto (mês ${aprovacao}).`,
            aba: 'premises',
            subAba: 'cronograma',
        });
    }

    // Terreno parcelado (item 5.2): vazio = 100% no mês da aquisição.
    const acquisitionMonth = Math.max(1, Math.round(val(study.acquisition_month, D.acquisition_month)));
    // Lista informada vale como veio (inclusive 0%); só a lista vazia cai no à vista.
    const parcelasInformadas = (study.land_payment_schedule ?? []).filter(p => p != null);
    const parcelasTerreno = parcelasInformadas.length
        ? parcelasInformadas.map(p => ({ mes: Math.max(1, Math.round(Number(p.month) || 1)), fracao: (Number(p.percent) || 0) / 100 }))
        : [{ mes: acquisitionMonth, fracao: 1 }];
    const somaDoTerreno = parcelasInformadas.reduce((a, p) => a + (Number(p.percent) || 0), 0);
    if (parcelasInformadas.length && Math.abs(somaDoTerreno - 100) > 0.01) {
        avisos.push({
            codigo: 'terreno_nao_soma_100',
            mensagem: `As parcelas do terreno somam ${Number(somaDoTerreno.toFixed(2)).toLocaleString('pt-BR')}% do custo: o cálculo usa os valores como estão (${fmtBRL(landCost * somaDoTerreno / 100)}).`,
            aba: 'premises',
            subAba: 'terreno',
        });
    }
    const mesDaPrimeiraParcela = Math.min(...parcelasTerreno.map(p => p.mes));

    // Curva de desembolso da obra (item 5.3). Linear fica null: o motor usa a
    // conta de antes (custo ÷ meses), para o padrão dar o mesmo centavo.
    const tipoCurvaObra = (study.cost_curve_type ?? D.cost_curve_type) as TipoCurvaDeDesembolso;
    let curvaObra: number[] | null = null;
    if (tipoCurvaObra !== 'linear') {
        const c = curvaDeDesembolso(tipoCurvaObra, constDur, study.cost_curve_custom);
        curvaObra = c.pesos;
        if (c.somaInformada != null) {
            avisos.push({
                codigo: 'curva_de_desembolso_nao_soma_100',
                mensagem: c.somaInformada === 0
                    ? 'A curva de desembolso personalizada está vazia: o custo de obra foi distribuído em partes iguais.'
                    : `A curva de desembolso personalizada soma ${Number(c.somaInformada.toFixed(2)).toLocaleString('pt-BR')}%: o custo de obra foi distribuído na proporção dos pesos.`,
                aba: 'capex',
            });
        }
    }

    // Calendário de cada rubrica com momento (item 5.5): peso por mês (índice 0 = mês 1).
    const pesosDaObra = curvaObra ?? Array.from({ length: Math.max(1, constDur) }, () => 1 / Math.max(1, constDur));
    const totalVendido = vendasPorMes.reduce((a, b) => a + b, 0);
    const calendario = (t: RubricaComMomento): number[] => {
        const em = (meses: number[], pesos?: number[]) => {
            const out: number[] = [];
            meses.forEach((m, k) => { out[m - 1] = (out[m - 1] ?? 0) + (pesos ? pesos[k] : 1 / meses.length); });
            return Array.from(out, x => x ?? 0);
        };
        const intervalo = (de: number, ate: number) => Array.from({ length: Math.max(0, ate - de + 1) }, (_, k) => de + k);
        switch (t.timing) {
            case 'aquisicao': return em([acquisitionMonth]);
            case 'pre_obra': {
                const meses = intervalo(acquisitionMonth, constStart - 1);
                return em(meses.length ? meses : [acquisitionMonth]);
            }
            case 'lancamento': return em(intervalo(Math.max(1, salesStart - 2), salesStart));
            case 'obra': return em(intervalo(constStart, constStart + pesosDaObra.length - 1), pesosDaObra);
            case 'vendas': return totalVendido > 0 ? vendasPorMes.map(v => v / totalVendido) : em([salesStart]);
            case 'pos_obra': return em(intervalo(handoverMonth + 1, handoverMonth + Math.max(1, Math.round(t.meses ?? D.pos_obra_meses))));
        }
    };
    rubricasComMomento.forEach(t => { t.pesos = calendario(t); });
    // Pré-obra sem mês antes da obra: cai no mês da aquisição, já dentro da obra
    // (pendência da Fase 5 do plano 2026-11-11 — antes, sem aviso).
    const preObraSemMeses = acquisitionMonth >= constStart ? rubricasComMomento.filter(t => t.timing === 'pre_obra') : [];
    if (preObraSemMeses.length) {
        avisos.push({
            codigo: 'pre_obra_sem_meses',
            mensagem: `Não há mês entre a aquisição (mês ${acquisitionMonth}) e o início da obra (mês ${constStart}): ${preObraSemMeses.map(t => t.nome).join(', ')} (pré-obra) sai no mês ${acquisitionMonth}. Ajuste o cronograma ou o momento da rubrica no Orçamento.`,
            aba: 'premises',
            subAba: 'cronograma',
        });
    }

    // Dívida e fontes acabam com as receitas; o fluxo vai até a última saída
    // (parcela do terreno ou rubrica de pós-obra).
    const horizonteDasReceitas = Math.max(duracaoBase, recebimento.sinal.length);
    const duration = Math.max(
        duracaoBase,
        recebimento.sinal.length,
        ...parcelasTerreno.map(p => p.mes),
        ...rubricasComMomento.map(t => t.pesos!.length),
    );
    const netVgvTotal = (Object.values(recebimento) as number[][])
        .reduce((acc, serie) => acc + serie.reduce((a, b) => a + b, 0), 0);

    // Percentuais que passam de 100% deixam a receita líquida negativa, e ela sai
    // do caixa (antes era descartada em silêncio). O cálculo segue como veio; avisa.
    // Cada causa com o seu valor: com inadimplência acima de 100% só as parcelas pagas
    // direto ficam negativas e o total pode seguir positivo (revisão das pendências).
    if (vgvVendavel < 0 || defaultRate > 1) {
        const pagoDireto = (['parcelasObra', 'intermediarias', 'posChaves'] as const)
            .reduce((acc, l) => acc + recebimento[l].reduce((a, b) => a + b, 0), 0);
        const causas: string[] = [];
        if (vgvVendavel < 0) causas.push(`Permutas passam de 100%: a receita líquida fica negativa (${fmtBRL(netVgvTotal)})`);
        if (defaultRate > 1) causas.push(`Inadimplência de ${pctBR(defaultRate)}% passa de 100%: as parcelas pagas direto à incorporadora ficam negativas (${fmtBRL(pagoDireto)})`);
        avisos.push({
            codigo: 'receita_liquida_negativa',
            mensagem: `${causas.join('; ')} e sai do caixa.`,
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
    // Regras de liberação e pagamento (item 4.1). Os padrões reproduzem o cálculo de antes.
    const financiamento: PremissasDoFinanciamento = {
        fracaoDaObra: actualFinPct,
        jurosMensal: monthlyFinancingRate,
        defasagemDaLiberacao: val(study.financing_release_lag_months, D.financing_release_lag_months),
        vendasMinimasPct: val(study.financing_min_sales_percent, D.financing_min_sales_percent),
        jurosNaObra: study.financing_interest_mode ?? D.financing_interest_mode,
        amortizaCom: study.financing_amortization ?? D.financing_amortization,
    };

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
        financiamento,
        caixaMinimo: val(study.min_cash_balance, D.min_cash_balance),
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
        vgvVendavel,
        permutaDoEspelho,
        netVgvTotal,
        estoqueNaoVendidoPct,
        vendasPorMes,
        constCostTotal,
        baseVgvTotal,
        vgvPorBloco,
        totalBlockArea,
        totalPrivateArea,
        totalCommonArea,
        areaPrivativaVendavel,
        areaPrivativaDasTipologiasVendaveis,
        areaConstruidaDoCusto,
        vgvSemArea,
        unidadesSemArea,
        recebimento,
        parcelasTerreno,
        mesDaPrimeiraParcela,
        curvaObra,
        rubricasComMomento,
        horizonteDasReceitas,
        handoverMonth,
        unidadesVendaveis: unidadesDoEspelho + unidadesSemEspelho,
        custoDoEstoqueUnidadeMes: val(study.stock_carrying_cost_unit_month, D.stock_carrying_cost_unit_month),
        regimeTributario,
        hipotesesTributarias: hipotesesDoEstudo(study),
        impostosForaDoCalculo,
        rubricasForaPeloRegime,
        // Unidades da permuta física não ficam em estoque (as PERMUTADO do espelho já saíram da contagem).
        unidadesEmEstoque: unidadesDoEspelho + unidadesSemEspelho * (1 - swapPhysical),
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
    /** Valor de cada rubrica com momento no cálculo, já com índice (item 5.5). */
    valorComMomento: Record<string, number>;
}

function montarSeries(P: Premissas): Series {
    const { duration, salesStart, salesDur, constStart, constDur, recebimento: R } = P;

    const constMonths = Math.max(1, constDur);
    const monthlyConstCost = (P.constCostTotal + P.rubricaObra) / constMonths;
    const monthlyVgvFixo = salesDur > 0 ? P.rubricaVgvFixo / salesDur : 0;

    const S: Series = {
        receitaBruta: [], deducaoReceita: [], devolucao: [], custoProprio: [], custoObra: [], linhas: [],
        totalGrossRev: 0, somaInflacaoVendas: 0, rubricaVgvTotal: 0, valorComMomento: {},
    };
    // Estoque depois da obra (item 5.6): fração do VGV vendável ainda não vendida no fim de cada mês.
    let vendidoAcumulado = 0;
    const LINHA_DA_BASE = { terreno: 'rubricasTerreno', obra: 'rubricasObra', vgv: 'rubricasVendas' } as const;

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
        // Terreno nas parcelas (item 5.2); as rubricas de terreno sem momento, na 1ª.
        // Sem parcelas: 100% no mês da aquisição (1), a mesma conta de antes.
        let terrenoDoMes = 0;
        for (const p of P.parcelasTerreno) if (p.mes === m) terrenoDoMes += P.landCost * p.fracao;
        const rubricaTerrenoDoMes = m === P.mesDaPrimeiraParcela ? P.rubricaTerreno : 0;
        if (terrenoDoMes !== 0 || m === P.mesDaPrimeiraParcela) {
            proprio += terrenoDoMes + rubricaTerrenoDoMes;
            linhas.terreno = -terrenoDoMes;
            linhas.rubricasTerreno = -rubricaTerrenoDoMes;
        }
        if (monthlyVgvFixo > 0 && emVendas) {
            const fixo = monthlyVgvFixo * multVendas;
            proprio += fixo;
            S.rubricaVgvTotal += fixo;
            linhas.rubricasVendas = -fixo;
        }
        let custoObraDoMes = 0;
        if (emObra) {
            if (P.curvaObra) {
                // Curva S ou personalizada (item 5.3).
                const w = P.curvaObra[m - constStart] ?? 0;
                linhas.obra = -(P.constCostTotal * w) * multObra;
                linhas.rubricasObra = -(P.rubricaObra * w) * multObra;
                custoObraDoMes = (P.constCostTotal + P.rubricaObra) * w * multObra;
            } else {
                linhas.obra = -(P.constCostTotal / constMonths) * multObra;
                linhas.rubricasObra = -(P.rubricaObra / constMonths) * multObra;
                custoObraDoMes = monthlyConstCost * multObra;
            }
        }

        // Rubricas com momento (item 5.5). Aquisição sem índice; lançamento e
        // vendas pelo índice das vendas; o resto pelo da obra. Só as de momento
        // 'obra' são financiáveis.
        for (const t of P.rubricasComMomento) {
            const peso = t.pesos?.[i] ?? 0;
            if (!peso) continue;
            const mult = t.timing === 'aquisicao' ? 1 : t.timing === 'lancamento' || t.timing === 'vendas' ? multVendas : multObra;
            const valor = t.valor * peso * mult;
            linhas[LINHA_DA_BASE[t.base]] -= valor;
            S.valorComMomento[t.id] = (S.valorComMomento[t.id] ?? 0) + valor;
            if (t.timing === 'obra') custoObraDoMes += valor;
            else proprio += valor;
        }

        // Condomínio e IPTU das unidades em estoque, depois da obra (item 5.6).
        vendidoAcumulado += P.vendasPorMes[i] ?? 0;
        if (P.custoDoEstoqueUnidadeMes > 0 && m > P.handoverMonth && P.vgvVendavel > 0) {
            const emEstoque = Math.max(0, 1 - vendidoAcumulado / P.vgvVendavel) * P.unidadesEmEstoque;
            const carregamento = emEstoque * P.custoDoEstoqueUnidadeMes * multObra;
            linhas.carregamentoDoEstoque = -carregamento;
            proprio += carregamento;
        }

        S.receitaBruta.push(grossRev);
        S.deducaoReceita.push(revenueDeduction);
        S.devolucao.push(linhas.devolucaoDistrato);
        S.custoProprio.push(proprio);
        S.custoObra.push(custoObraDoMes);
        S.linhas.push(linhas);
    }

    // Imposto pelo regime (item 6.2): sobre a receita bruta do mês; no lucro real,
    // o crédito e o lucro usam o custo do mês (próprio + obra).
    if (P.regimeTributario !== 'manual') {
        const custo = S.custoProprio.map((c, i) => c + S.custoObra[i]);
        const deducoes = S.linhas.map(l => -(l.comercial + l.outrasDeducoes + l.devolucaoDistrato));
        impostoPorMes(P.regimeTributario, S.receitaBruta, custo, P.hipotesesTributarias, deducoes).forEach((imposto, i) => {
            S.linhas[i].impostos = -imposto;
            S.deducaoReceita[i] += imposto;
        });
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
    aportes: LinhaDeAporte[];
    dividaLiberada: number;
    aporteDeTerceiros: number;
}

/**
 * Ordem: dívida à produção (utils/imovibFinanciamento.ts) → fontes a juros
 * (utils/imovibFontes.ts) → aportes e distribuições sobre esse caixa
 * (utils/imovibAportes.ts) → a parte das fontes por participação em cada
 * distribuição: capital de volta e a fatia delas no LUCRO
 * (partilhaDasDistribuicoes). `net` é o caixa do incorporador depois de tudo isso;
 * `netProjeto`, o caixa sem dívida nem terceiros.
 */
function aplicarFinanciamento(P: Premissas, S: Series): FluxoDoAcionista {
    const n = P.duration;
    const netRevDoMes: number[] = [];
    const vendasAcumuladasPct: number[] = [];
    let vendido = 0;
    for (let i = 0; i < n; i++) {
        netRevDoMes.push(S.receitaBruta[i] - S.deducaoReceita[i] + S.devolucao[i]);
        vendido += P.vendasPorMes[i] ?? 0;
        vendasAcumuladasPct.push(P.vgvVendavel > 0 ? (vendido / P.vgvVendavel) * 100 : 0);
    }
    const mesDaQuitacao = Math.min(n, P.horizonteDasReceitas) - 1;
    const D = fluxoDaDivida(S.custoObra, netRevDoMes, S.linhas.map(l => l.receitaRepasse), vendasAcumuladasPct, P.financiamento, mesDaQuitacao);
    const fontes = P.study.funding_sources ?? [];
    const T = fontes.length ? fluxoDasFontes(fontes, mesDaQuitacao + 1, n) : null;

    // 1ª passada: o caixa antes da participação das fontes.
    const antes: { netFlow: number; debtPayment: number }[] = [];
    for (let i = 0; i < n; i++) {
        const netRev = netRevDoMes[i];
        const custoObra = S.custoObra[i];
        const financedCost = D.liberacao[i];
        const equityCost = S.custoProprio[i] + (custoObra - financedCost);
        // Receita do mês menos o que foi ao banco (amortização e, se pagos, juros).
        // Receita líquida negativa (deduções acima de 100%) sai do caixa.
        const investorRev = netRev - D.pagamento[i];
        let debtPayment = D.pagamento[i];
        let netFlow = investorRev - equityCost;

        // Último mês: o saldo que as receitas não amortizaram é quitado pelo
        // investidor. O motor antigo terminava o fluxo com a dívida em
        // aberto e a descartava — com 100% de dívida, subir o custo de obra
        // não mudava o VPL.
        if (i === mesDaQuitacao && D.quitacaoNoFim > 0) {
            debtPayment += D.quitacaoNoFim;
            netFlow -= D.quitacaoNoFim;
        }
        if (T) netFlow += T.aporte[i] + T.remuneracao[i];
        antes.push({ netFlow, debtPayment });
    }

    const aportes = aportesEDistribuicoes(antes.map(a => a.netFlow), P.caixaMinimo);
    if (T && T.participacao > 0) {
        partilhaDasDistribuicoes(aportes, T.aporteParticipacao, T.participacao)
            .forEach((v, i) => { aportes[i].paraTerceiros = v; });
    }

    // 2ª passada: participação das fontes em cada distribuição e o fluxo final.
    let accumulatedFlow = 0;
    let accProjeto = 0;
    let maxExposure = 0;
    let mesDaExposicao = 0;
    const monthlyFlows: MonthlyFlow[] = [];
    const net: number[] = [];
    const netProjetoDoMes: number[] = [];
    for (let m = 1; m <= n; m++) {
        const i = m - 1;
        const { debtPayment } = antes[i];
        let netFlow = antes[i].netFlow;
        let remuneracaoDeTerceiros = T ? T.remuneracao[i] : 0;
        if (aportes[i].paraTerceiros > 0) {
            netFlow -= aportes[i].paraTerceiros;
            remuneracaoDeTerceiros -= aportes[i].paraTerceiros;
        }

        accumulatedFlow += netFlow;
        if (accumulatedFlow < maxExposure) {
            maxExposure = accumulatedFlow;
            mesDaExposicao = m;
        }

        const linhas: LinhasDoMes = {
            ...S.linhas[i],
            liberacaoDivida: D.liberacao[i],
            pagamentoDaDivida: -debtPayment,
            aporteDeTerceiros: T ? T.aporte[i] : 0,
            remuneracaoDeTerceiros,
        };
        const netProjeto = netFlow - linhas.liberacaoDivida - linhas.pagamentoDaDivida
            - linhas.aporteDeTerceiros - linhas.remuneracaoDeTerceiros;
        accProjeto += netProjeto;

        monthlyFlows.push({
            month: m, name: nomeDoMes(P.study.base_date, m), rev: S.receitaBruta[i], cost: S.custoProprio[i] + S.custoObra[i],
            net: netFlow, acc: accumulatedFlow, netProjeto, accProjeto, jurosDoMes: D.juros[i], linhas,
        });
        net.push(netFlow);
        netProjetoDoMes.push(netProjeto);
    }

    if (D.quitacaoNoFim > 0) {
        P.avisos.push({
            codigo: 'divida_quitada_no_fim',
            mensagem: `As receitas não amortizaram todo o financiamento: ${fmtBRL(D.quitacaoNoFim)} de saldo devedor são quitados com capital próprio no mês ${mesDaQuitacao + 1}.`,
            aba: 'capital',
        });
    }
    if (D.naoLiberado > 0.005) {
        const { vendasMinimasPct, defasagemDaLiberacao } = P.financiamento;
        const porVendas = D.naoLiberado - D.naoLiberadoPelaDefasagem;
        const motivos: string[] = [];
        if (porVendas > 0.005) motivos.push(`${fmtBRL(porVendas)} porque a venda acumulada não chega a ${Number(vendasMinimasPct.toFixed(2)).toLocaleString('pt-BR')}% do VGV vendável até o fim da obra${defasagemDaLiberacao > 0 ? ' e da defasagem' : ''}`);
        if (D.naoLiberadoPelaDefasagem > 0.005) motivos.push(`${fmtBRL(D.naoLiberadoPelaDefasagem)} porque a defasagem de ${defasagemDaLiberacao} meses joga a liberação para depois do fim do estudo`);
        P.avisos.push({
            codigo: 'financiamento_nao_liberado',
            mensagem: `${fmtBRL(D.naoLiberado)} do financiamento à produção não são liberados: ${motivos.join('; ')}. Esse custo sai do capital próprio.`,
            aba: 'capital',
        });
    }
    T?.avisos.forEach(mensagem => P.avisos.push({ codigo: 'fontes_de_capital', mensagem, aba: 'capital' }));
    // Item 4B.2: fonte que entra depois do pico de exposição não financia a obra.
    if (mesDaExposicao > 0) {
        for (const f of fontes) {
            const entrada = Math.round(f.entry_month || 1);
            if (!((Number(f.amount) || 0) > 0) || entrada <= mesDaExposicao || entrada > n) continue;
            const custo = f.remuneration === 'participacao'
                ? `vira caixa para distribuir, e a fonte leva ${(Number(f.profit_share_percent) || 0).toLocaleString('pt-BR')}% do lucro`
                : 'e a fonte rende juros mesmo assim';
            P.avisos.push({
                codigo: 'fontes_de_capital',
                mensagem: `"${f.name}" entra no mês ${entrada}, depois do pico de exposição do incorporador (mês ${mesDaExposicao}): o dinheiro não financia a obra ${custo}.`,
                aba: 'capital',
            });
        }
    }

    return {
        monthlyFlows, net, netProjeto: netProjetoDoMes, maxExposure, debtPayoffAtEnd: D.quitacaoNoFim, aportes,
        dividaLiberada: D.liberacao.reduce((a, b) => a + b, 0),
        aporteDeTerceiros: T ? T.aporte.reduce((a, b) => a + b, 0) : 0,
    };
}

// ── 4. Resultado ────────────────────────────────────────────────────────────

/** a ÷ b, ou null quando não há base. */
const razao = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function indicadoresDeProduto(P: Premissas): IndicadoresDeProduto {
    // A área do custo vem das tipologias quando não há área digitada no CAPEX simplificado.
    const areaDasTipologias = P.areaConstruidaDoCusto === P.totalBlockArea;
    const custoSemAreaComum = areaDasTipologias && P.totalBlockArea > 0 && P.totalCommonArea <= 0;
    return {
        eficiencia: custoSemAreaComum ? null : razao(P.areaPrivativaDasTipologiasVendaveis, P.areaConstruidaDoCusto),
        custoSemAreaComum,
        unidadesVendaveis: P.unidadesVendaveis,
        // VGV com a sensibilidade, como o custo de obra (o Portal do Investidor roda os dois).
        ticketMedio: razao(P.vgvTotal, P.unidadesVendaveis),
        vgvPorM2Privativo: razao(P.baseVgvTotal > 0 ? P.vgvTotal * (1 - P.vgvSemArea / P.baseVgvTotal) : 0, P.areaPrivativaVendavel),
        unidadesSemArea: P.unidadesSemArea,
        custoObraPorM2Privativo: P.constCostTotal > 0 ? razao(P.constCostTotal, P.areaPrivativaDasTipologiasVendaveis) : null,
    };
}

function calcularResultado(P: Premissas, S: Series, F: FluxoDoAcionista, semTir = false): ImovibMathResult {
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
        // Com momento próprio (item 5.5): o que saiu de fato, com o índice do mês.
        capexValorPorRubrica[item.id] = P.rubricasForaPeloRegime.has(item.id) ? 0 : S.valorComMomento[item.id] ?? valor;
    });
    // Totais por base, somando as rubricas com momento.
    const comMomento = { terreno: 0, obra: 0, vgv: 0 };
    P.rubricasComMomento.forEach(t => { comMomento[t.base] += S.valorComMomento[t.id] ?? 0; });

    const vpl = calculateNPV(P.monthlyDiscount, F.net); // Using monthly discount rate

    // IRR is returned as a monthly rate. Convert to annual.
    const tir = semTir ? { taxa: NaN, raizes: 0 } : calcularTirMensal(F.net);
    const monthlyIrr = tir.taxa;
    let annualIrr = NaN;
    if (!isNaN(monthlyIrr) && isFinite(monthlyIrr)) {
        annualIrr = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;
    }
    const vplProjeto = calculateNPV(P.monthlyDiscount, F.netProjeto);
    const tirProjeto = semTir ? NaN : calcularTirMensal(F.netProjeto).taxa;
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
        areaPrivativaVendavel: P.areaPrivativaVendavel,
        totalCommonArea: P.totalCommonArea,
        produto: indicadoresDeProduto(P),
        vgvBase: P.baseVgvTotal,
        vgvPorBloco: P.vgvPorBloco,
        debtPayoffAtEnd: F.debtPayoffAtEnd,
        capital: {
            proprio: Math.max(0, -F.maxExposure),
            divida: F.dividaLiberada,
            // Deduções do mês (inclusive o imposto do regime, item 6.2) na proporção da receita.
            vendasNaObra: S.linhas.slice(0, P.constStart + P.constDur - 1).reduce((acc, l, i) =>
                acc + (l.receitaSinal + l.receitaParcelasObra + l.receitaIntermediarias)
                    * (S.receitaBruta[i] > 0 ? 1 - S.deducaoReceita[i] / S.receitaBruta[i] : 1 - P.deducaoReceitaPct) + l.devolucaoDistrato, 0),
            permuta: Math.max(0, P.vgvTotal - P.vgvVendavel) + P.permutaDoEspelho,
            terceiros: F.aporteDeTerceiros,
        },
        aportes: F.aportes,
        capexRubricasAtivas: P.capexRubricasAtivas,
        capexRubricas: {
            terreno: P.rubricaTerreno + comMomento.terreno,
            obra: P.rubricaObra + comMomento.obra,
            vgv: S.rubricaVgvTotal + comMomento.vgv,
            total: (P.rubricaTerreno + comMomento.terreno) + (P.rubricaObra + comMomento.obra) + (S.rubricaVgvTotal + comMomento.vgv),
        },
        capexValorPorRubrica,
        impostosForaDoCalculo: P.impostosForaDoCalculo,
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
    return calcularResultado(P, S, F, options?.semTir === true);
};
