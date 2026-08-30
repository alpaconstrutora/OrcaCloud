/**
 * Gestão de Dívidas e Financiamentos.
 * Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
 *
 * O motor de cálculo (SAC/Price/SACRE/…) vive em `utils/debtAmortization.ts` e
 * é puro — estes tipos são só a forma persistida.
 */

import type { AmortizationSystem, InstallmentPeriod, RatePeriod } from '../utils/debtAmortization';
import type { DayCountConvention } from '../utils/debtAccrual';

export type { AmortizationSystem, InstallmentPeriod, RatePeriod, DayCountConvention };

/**
 * A separação que afeta contabilidade, governança, tributação e consolidação
 * do grupo. Investidores ficam FORA do módulo (decisão do usuário 2026-08-29):
 * continuam no Portal do Investidor.
 */
export type DebtCounterpartyKind = 'INSTITUICAO_FINANCEIRA' | 'PARTE_RELACIONADA' | 'TERCEIRO';

export type DebtModality =
    | 'CAPITAL_GIRO' | 'CONTA_GARANTIDA' | 'CREDITO_ROTATIVO'
    | 'ANTECIPACAO_RECEBIVEIS' | 'EMPRESTIMO_COM_GARANTIA'
    | 'FINANCIAMENTO_IMOBILIARIO' | 'FINANCIAMENTO_PRODUCAO' | 'PLANO_EMPRESARIO'
    | 'FINANCIAMENTO_MAQUINAS_EQUIPAMENTOS' | 'FINAME_BNDES'
    | 'FINANCIAMENTO_VEICULOS' | 'CREDITO_ENERGIA_SOLAR' | 'CCB'
    | 'LEASING' | 'CONSORCIO' | 'MUTUO_GRUPO' | 'MUTUO_SOCIOS' | 'OUTRO';

export type DebtStatus =
    | 'EM_NEGOCIACAO' | 'CONTRATADO' | 'LIBERADO' | 'EM_CARENCIA' | 'ADIMPLENTE'
    | 'INADIMPLENTE' | 'RENEGOCIADO' | 'LIQUIDADO' | 'CANCELADO';

/** As 10 situações do PRD item 6. */
export type DebtInstallmentStatus =
    | 'PREVISTA' | 'PROVISIONADA' | 'A_VENCER' | 'EM_APROVACAO' | 'PAGA'
    | 'PARCIALMENTE_PAGA' | 'VENCIDA' | 'RENEGOCIADA' | 'ANTECIPADA' | 'CANCELADA';

/** CONTRATUAL é imutável; VIGENTE ganha versão a cada renegociação. */
export type DebtScheduleKind = 'CONTRATUAL' | 'VIGENTE';

/**
 * Qual perna do mútuo intercompany este contrato é.
 *
 * Investigado em 2026-08-29: nenhuma view do sistema elimina intercompany
 * (`vw_intercompany_transactions` só lista pedidos de compra;
 * `vw_company_consolidated` é roll-up de contagens). Na posição consolidada do
 * grupo, some a perna DEVEDORA e descarte a CREDORA — senão o mútuo entra duas
 * vezes. `null` em contrato normal.
 */
export type DebtMirrorRole = 'DEVEDORA' | 'CREDORA';

/** Como o saldo devedor se ajusta depois de uma amortização extraordinária. */
export type AmortizationEffect = 'REDUZIR_PRAZO' | 'REDUZIR_PARCELA';

export type DebtAllocationTarget =
    | 'COMPANY' | 'PROJECT' | 'EMPREENDIMENTO' | 'COST_CENTER'
    | 'ASSET' | 'PROPERTY' | 'UNIT' | 'BANK_ACCOUNT';

export interface DebtContract {
    id: string;
    organizationId: string;

    companyId?: string;
    companyName?: string;
    counterpartyKind: DebtCounterpartyKind;
    institutionSupplierId?: string;
    institutionName?: string;
    institutionBranch?: string;
    relatedCompanyId?: string;
    /** O espelho passivo↔ativo do mútuo intercompany. */
    mirrorDebtContractId?: string;
    mirrorRole?: DebtMirrorRole;
    /** Agrupa propostas concorrentes para a MESMA necessidade de crédito. */
    proposalGroup?: string;
    decidedAt?: string;
    decisionNotes?: string;

    contractNumber?: string;
    modality: DebtModality;
    purpose?: string;
    signedAt?: string;
    releasedAt?: string;
    firstDueDate?: string;
    finalDueDate?: string;
    ownerUserId?: string;
    status: DebtStatus;

    principalContracted: number;
    /** Base do cronograma — não o contratado. */
    principalReleased: number;
    retainedAmount: number;
    fees: number;
    iof: number;
    insurance: number;
    notaryCosts: number;
    otherCosts: number;
    netReceived: number;

    rateType: 'FIXA' | 'VARIAVEL';
    /** PERCENTUAL (5.5 = 5,5%), na periodicidade de `ratePeriod`. */
    nominalRate: number;
    ratePeriod: RatePeriod;
    indexName?: string;
    indexPct?: number;
    spread?: number;
    cetAnnual?: number;
    gracePrincipalMonths: number;
    graceInterestMonths: number;
    capitalizeInterest: boolean;
    installmentPeriod: InstallmentPeriod;
    installmentCount?: number;
    lateFinePct: number;
    lateInterestMonthPct: number;
    amortizationSystem: AmortizationSystem;
    /**
     * Como contar dias na apropriação por competência. `undefined` = ainda não
     * definida — a tela pede antes de apropriar, em vez de assumir uma.
     */
    dayCountConvention?: DayCountConvention;

    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export type DebtContractInput = Omit<
    DebtContract,
    'id' | 'organizationId' | 'companyName' | 'institutionName' | 'created_at' | 'updated_at'
> & Partial<Pick<DebtContract, 'id'>>;

export interface DebtSchedule {
    id: string;
    organizationId: string;
    debtContractId: string;
    kind: DebtScheduleKind;
    version: number;
    supersedesId?: string;
    reason?: string;
    isActive: boolean;
    /** Parâmetros usados no cálculo — torna o cronograma reproduzível. */
    paramsSnapshot?: Record<string, unknown>;
    generatedAt?: string;
    createdBy?: string;
    created_at?: string;
}

export interface DebtInstallment {
    id: string;
    organizationId: string;
    debtScheduleId: string;
    seq: number;
    dueDate: string;
    competenciaDate?: string;

    openingBalance: number;
    amortization: number;
    interest: number;
    monetaryCorrection: number;
    iof: number;
    insurance: number;
    fees: number;
    lateFine: number;
    lateInterest: number;
    total: number;
    closingBalance: number;

    paidAmount: number;
    paidAt?: string;
    status: DebtInstallmentStatus;
    notes?: string;
}

export interface DebtDisbursement {
    id: string;
    organizationId: string;
    debtContractId: string;
    disbursedAt: string;
    grossAmount: number;
    retainedAmount: number;
    fees: number;
    iof: number;
    insurance: number;
    notaryCosts: number;
    otherCosts: number;
    netAmount: number;
    paymentAccountId?: string;
    documentUrl?: string;
    notes?: string;
}

export type DebtDisbursementInput = Omit<DebtDisbursement, 'id' | 'organizationId'> &
    Partial<Pick<DebtDisbursement, 'id'>>;

export interface DebtAllocation {
    id: string;
    organizationId: string;
    debtContractId: string;
    targetKind: DebtAllocationTarget;
    targetId: string;
    percent: number;
    notes?: string;
}

export type DebtAllocationInput = Omit<DebtAllocation, 'id' | 'organizationId'> &
    Partial<Pick<DebtAllocation, 'id'>>;

/** Rótulos em português — uma fonte só, para tela e relatório não divergirem. */
export const DEBT_MODALITY_PT: Record<DebtModality, string> = {
    CAPITAL_GIRO: 'Capital de giro',
    CONTA_GARANTIDA: 'Conta garantida',
    CREDITO_ROTATIVO: 'Crédito rotativo',
    ANTECIPACAO_RECEBIVEIS: 'Antecipação de recebíveis',
    EMPRESTIMO_COM_GARANTIA: 'Empréstimo com garantia',
    FINANCIAMENTO_IMOBILIARIO: 'Financiamento imobiliário',
    FINANCIAMENTO_PRODUCAO: 'Financiamento à produção',
    PLANO_EMPRESARIO: 'Plano Empresário',
    FINANCIAMENTO_MAQUINAS_EQUIPAMENTOS: 'Máquinas e equipamentos',
    FINAME_BNDES: 'FINAME / BNDES',
    FINANCIAMENTO_VEICULOS: 'Financiamento de veículos',
    CREDITO_ENERGIA_SOLAR: 'Crédito para energia solar',
    CCB: 'Cédula de Crédito Bancário (CCB)',
    LEASING: 'Leasing / arrendamento mercantil',
    CONSORCIO: 'Consórcio',
    MUTUO_GRUPO: 'Mútuo entre empresas do grupo',
    MUTUO_SOCIOS: 'Mútuo com sócios',
    OUTRO: 'Operação personalizada',
};

export const DEBT_STATUS_PT: Record<DebtStatus, string> = {
    EM_NEGOCIACAO: 'Em negociação',
    CONTRATADO: 'Contratado',
    LIBERADO: 'Liberado',
    EM_CARENCIA: 'Em carência',
    ADIMPLENTE: 'Adimplente',
    INADIMPLENTE: 'Inadimplente',
    RENEGOCIADO: 'Renegociado',
    LIQUIDADO: 'Liquidado',
    CANCELADO: 'Cancelado',
};

export const DEBT_INSTALLMENT_STATUS_PT: Record<DebtInstallmentStatus, string> = {
    PREVISTA: 'Prevista',
    PROVISIONADA: 'Provisionada',
    A_VENCER: 'A vencer',
    EM_APROVACAO: 'Em aprovação',
    PAGA: 'Paga',
    PARCIALMENTE_PAGA: 'Parcialmente paga',
    VENCIDA: 'Vencida',
    RENEGOCIADA: 'Renegociada',
    ANTECIPADA: 'Antecipada',
    CANCELADA: 'Cancelada',
};

export const DEBT_AMORTIZATION_PT: Record<AmortizationSystem, string> = {
    SAC: 'SAC',
    PRICE: 'Price',
    SACRE: 'SACRE',
    AMERICANO: 'Americano (juros no período, principal no fim)',
    BULLET: 'Bullet (tudo no vencimento)',
    MANUAL: 'Parcelas manuais',
    IRREGULAR: 'Fluxo irregular',
};

export const DEBT_ALLOCATION_TARGET_PT: Record<DebtAllocationTarget, string> = {
    COMPANY: 'Empresa / SPE',
    PROJECT: 'Obra',
    EMPREENDIMENTO: 'Empreendimento',
    COST_CENTER: 'Centro de custo',
    ASSET: 'Bem / equipamento',
    PROPERTY: 'Imóvel',
    UNIT: 'Unidade imobiliária',
    BANK_ACCOUNT: 'Conta bancária',
};

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (Fase 1c) — o que fn_debt_* e vw_debt_by_target devolvem
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha só: a posição consolidada do PRD item 10. */
export interface DebtPosition {
    nContratos: number;
    nInstituicoes: number;
    /** Saldo devedor = soma da amortização ainda em aberto. */
    dividaTotal: number;
    /** Amortiza em até 12 meses (circulante). */
    curtoPrazo: number;
    longoPrazo: number;
    encargosAPagar: number;
    servico30: number;
    servico90: number;
    servico365: number;
    vencido: number;
    nParcelasVencidas: number;
    /** % ao mês, PONDERADO pelo saldo — média simples esconde o contrato caro. */
    custoMedioMensal: number;
    prazoMedioMeses: number;
    pctTaxaVariavel: number;
    pctIndexada: number;
}

export type DebtConcentrationDimension =
    | 'INSTITUICAO' | 'INDEXADOR' | 'MODALIDADE' | 'EMPRESA' | 'TAXA';

export interface DebtConcentrationRow {
    chave: string;
    rotulo: string;
    saldo: number;
    encargos: number;
    pct: number;
    nContratos: number;
}

export interface DebtCurvePoint {
    mes: string;
    amortizacao: number;
    juros: number;
    encargos: number;
    parcela: number;
    saldoRemanescente: number;
}

export interface DebtByTargetRow {
    organizationId: string;
    targetKind: DebtAllocationTarget;
    targetId: string;
    debtContractId: string;
    percent: number;
    saldoRateado: number;
    encargosRateados: number;
    servicoRateado: number;
    proximoVencimento?: string;
    nParcelas: number;
}

export const DEBT_CONCENTRATION_PT: Record<DebtConcentrationDimension, string> = {
    INSTITUICAO: 'Instituição',
    INDEXADOR: 'Indexador',
    MODALIDADE: 'Modalidade',
    EMPRESA: 'Empresa / SPE',
    TAXA: 'Tipo de taxa',
};

/** Uma linha de `fn_debt_proposal_comparison` (PRD item 5). */
export interface DebtProposalComparison {
    debtContractId: string;
    contractNumber?: string;
    instituicao: string;
    status: DebtStatus;
    modality: DebtModality;
    amortizationSystem: AmortizationSystem;
    brutoLiberado: number;
    liquidoRecebido: number;
    custosNaLiberacao: number;
    taxaNominal: number;
    taxaMensalPct: number;
    indexName?: string;
    cetAnual?: number;
    carenciaMeses: number;
    nParcelas: number;
    primeiraParcela: number;
    maiorParcela: number;
    totalJuros: number;
    totalEncargos: number;
    totalPago: number;
    /** Total pago menos o LÍQUIDO que entrou — é o custo real da operação. */
    custoTotal: number;
    /** Média mensal dos 12 primeiros meses: o ano que aperta o caixa. */
    impactoMensal12m: number;
    primeiroVencimento?: string;
    ultimoVencimento?: string;
}
