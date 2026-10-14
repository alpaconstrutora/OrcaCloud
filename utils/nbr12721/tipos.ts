/**
 * ÁREAS NBR 12721 — tipos do motor puro (13/10/2026, Fase 1 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * ─── A ENTRADA NÃO CONHECE A PLANTA ─────────────────────────────────────────
 *
 * O motor recebe blocos, pavimentos, unidades e espaços já classificados — sem
 * geometria. Quem monta isso é um adaptador: `utils/blueprintNbr12721.ts` a
 * partir do desenho, ou o estudo sem desenho a partir de áreas declaradas. Os
 * dois caem no MESMO cálculo, que é o ponto de ter um motor só.
 *
 * Áreas em m², sem arredondar: quem arredonda é o motor, no mesmo lugar em que
 * o SQL antigo (`calculate_area_version`) arredondava — é contra ele que este
 * motor é conferido (`__tests__/fixtures/nbr12721/`).
 *
 * ─── A SAÍDA USA OS NOMES DAS COLUNAS DO SQL ────────────────────────────────
 *
 * `qi_02_private_covered_standard_raw` e companhia: são os números das linhas
 * dos Quadros I, II e IV-B da norma, e são os nomes que a exportação PDF/XLSX
 * e o memorial de incorporação já leem. Traduzir criaria uma tabela de-para
 * que só serviria para errar.
 */

/** Padrão = coberta de padrão; DIFERENTE = coberta de padrão diferente; DESCOBERTA. */
export type CoberturaNbr = 'PADRAO' | 'DIFERENTE' | 'DESCOBERTA';

export type UsoNbr = 'PRIVATIVO' | 'COMUM';

/** Só privativo: a área principal da unidade ou um acessório (vaga, depósito). */
export type NaturezaNbr = 'PRINCIPAL' | 'ACESSORIA';

/** Só comum. Ausente (`null`) num comum é pendência MOTOR_012. */
export type DivisaoNbr = 'PROPORCIONAL' | 'NAO_PROPORCIONAL';

/**
 * Como o espaço é contado:
 * - `UNIDADE` — pertence direto à unidade (`unidade` preenchida);
 * - `ACESSORIO_VINCULADO` — vaga/depósito sem unidade própria, ligado por
 *   `VinculoDeAcessorio` (não pode ter `unidade`, senão conta duas vezes);
 * - `COMUM` — área comum.
 */
export type ContabilizacaoNbr = 'UNIDADE' | 'ACESSORIO_VINCULADO' | 'COMUM';

export interface BlocoNbr {
  codigo: string;
  nome: string;
  ordem: number;
}

export interface PavimentoNbr {
  codigo: string;
  bloco: string;
  /** Rótulo que sai no Quadro I. */
  nome: string;
  ordem: number;
}

export interface UnidadeNbr {
  codigo: string;
  bloco: string;
  /** Unidade autônoma (entra nos Quadros II e IV-B). A zeladoria, por exemplo, não é. */
  autonoma: boolean;
  ativa: boolean;
}

export interface EspacoNbr {
  codigo: string;
  nome: string;
  bloco: string;
  pavimento: string;
  /** Código da unidade dona, quando `contabilizacao === 'UNIDADE'`. */
  unidade: string | null;
  uso: UsoNbr;
  natureza: NaturezaNbr | null;
  cobertura: CoberturaNbr;
  /** Comum sem divisão é pendência; privativo não tem divisão. */
  divisao: DivisaoNbr | null;
  contabilizacao: ContabilizacaoNbr;
  areaRealM2: number;
  /** Coeficiente de equivalência. Obrigatório fora do padrão (MOTOR_007); ausente = 1. */
  coeficiente: number | null;
}

export interface VinculoDeAcessorio {
  unidade: string;
  espaco: string;
  /** Soma na área privativa acessória do Quadro IV-B (coluna c). */
  afetaPrivativa: boolean;
  /** Entra no Quadro II e, portanto, no coeficiente de proporcionalidade. */
  afetaCoeficiente: boolean;
}

/** Rateio de um comum NÃO proporcional a uma unidade: área fixa ou percentual. */
export interface AlocacaoNaoProporcional {
  espaco: string;
  unidade: string;
  /** Área real alocada (método área fixa). */
  areaRealM2: number | null;
  /** Equivalente informado à mão — vence real × coeficiente (ver caso 15 da testemunha). */
  areaEquivalenteM2: number | null;
  /** Fração em (0, 1] (método percentual). */
  percentual: number | null;
}

/** Sobre quem um comum PROPORCIONAL é rateado: o prédio todo ou um bloco. */
export interface EscopoDeRateio {
  espaco: string;
  escopo: 'GLOBAL' | 'BLOCO';
  bloco: string | null;
}

export interface EntradaNbr12721 {
  blocos: BlocoNbr[];
  pavimentos: PavimentoNbr[];
  unidades: UnidadeNbr[];
  espacos: EspacoNbr[];
  vinculos: VinculoDeAcessorio[];
  alocacoes: AlocacaoNaoProporcional[];
  escopos: EscopoDeRateio[];
}

// ── saída ───────────────────────────────────────────────────────────────────

export interface LinhaQuadroI {
  bloco: string;
  pavimento: string;
  row_order: number;
  floor_label: string;
  qi_02_private_covered_standard_raw: number;
  qi_03_private_nonstandard_or_uncovered_raw: number;
  qi_04_private_equivalent_raw: number;
  qi_05_private_real_total_raw: number;
  qi_06_private_equivalent_total_raw: number;
  qi_07_common_nonprop_covered_standard_raw: number;
  qi_08_common_nonprop_nonstandard_or_uncovered_raw: number;
  qi_09_common_nonprop_equivalent_raw: number;
  qi_10_common_nonprop_real_total_raw: number;
  qi_11_common_nonprop_equivalent_total_raw: number;
  qi_12_common_prop_covered_standard_raw: number;
  qi_13_common_prop_nonstandard_or_uncovered_raw: number;
  qi_14_common_prop_equivalent_raw: number;
  qi_15_common_prop_real_total_raw: number;
  qi_16_common_prop_equivalent_total_raw: number;
  qi_17_floor_real_total_raw: number;
  qi_18_floor_equivalent_total_raw: number;
}

export interface LinhaQuadroII {
  unidade: string;
  row_order: number;
  unit_label: string;
  qii_20_private_covered_standard_raw: number;
  qii_21_private_nonstandard_or_uncovered_raw: number;
  qii_22_private_equivalent_raw: number;
  qii_23_private_real_total_raw: number;
  qii_24_private_equivalent_total_raw: number;
  qii_25_common_nonprop_covered_standard_raw: number;
  qii_26_common_nonprop_nonstandard_or_uncovered_raw: number;
  qii_27_common_nonprop_equivalent_raw: number;
  qii_28_common_nonprop_real_total_raw: number;
  qii_29_common_nonprop_equivalent_total_raw: number;
  qii_30_nonprop_equivalent_total_raw: number;
  qii_31_proportionality_coefficient_raw: number;
  qii_32_common_prop_covered_standard_raw: number;
  qii_33_common_prop_nonstandard_or_uncovered_raw: number;
  qii_34_common_prop_equivalent_raw: number;
  qii_35_common_prop_real_total_raw: number;
  qii_36_common_prop_equivalent_total_raw: number;
  qii_37_unit_real_total_raw: number;
  qii_38_unit_equivalent_total_raw: number;
}

export interface FracaoIdeal {
  unidade: string;
  source_coefficient: number;
  fraction_decimal_raw: number;
  fraction_percent_raw: number;
  /** Milésimos como o SQL fazia: só arredondados — a soma pode não dar 1000. */
  fraction_thousandths_raw: number;
  /**
   * Milésimos FECHADOS em exatamente 1000 pelo maior resto, com
   * `CASAS_DOS_MILESIMOS` casas. É o número para o cartório.
   */
  milesimos: number;
}

export interface LinhaQuadroIVB {
  unidade: string;
  row_order: number;
  unit_label: string;
  qivb_b_private_main_area_raw: number;
  qivb_c_private_accessory_area_raw: number;
  qivb_d_private_total_area_raw: number;
  qivb_e_common_area_raw: number;
  qivb_f_real_total_area_raw: number;
  qivb_g_proportionality_coefficient_raw: number;
  fraction_decimal_raw: number;
  fraction_percent_raw: number;
  fraction_thousandths_raw: number;
}

/** Os códigos do `validate_area_version`, mais os de fechamento que o SQL não tinha. */
export type CodigoDePendencia =
  | 'MOTOR_006'
  | 'MOTOR_007'
  | 'MOTOR_011'
  | 'MOTOR_012'
  | 'ACC_VAL_001'
  | 'ACC_VAL_003'
  | 'COM_PROP_VAL_001'
  | 'COM_PROP_VAL_002'
  | 'QII_VAL_001'
  | 'QII_VAL_006'
  | 'FRAC_VAL_002'
  | 'FECH_001'
  | 'FECH_002'
  | 'FECH_003';

export interface Pendencia {
  codigo: CodigoDePendencia;
  mensagem: string;
  /** Bloqueante impede o cálculo (como no SQL); aviso acompanha um cálculo pronto. */
  bloqueante: boolean;
  /** Códigos de espaço/unidade envolvidos — para a tela levar ao item. */
  itens: string[];
}

export interface SaidaNbr12721 {
  status: 'success' | 'failed';
  pendencias: Pendencia[];
  quadroI: LinhaQuadroI[];
  quadroII: LinhaQuadroII[];
  quadroIVB: LinhaQuadroIVB[];
  fracoes: FracaoIdeal[];
}
