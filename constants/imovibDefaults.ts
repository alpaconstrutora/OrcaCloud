/**
 * Valores padrão das premissas dos Estudos de Viabilidade (Imovib).
 *
 * Fonte ÚNICA: o motor (`utils/imovibMotor.ts`) e as telas que EXIBEM o
 * padrão (Dinâmica, Receitas e Capital) leem daqui. Antes cada um tinha o seu:
 * a Dinâmica mostrava inflação 0,4% e TMA 12% e Receitas mostrava inadimplência
 * 3% e distrato 5%, enquanto o motor calculava com 0 — o número exibido não era
 * o número calculado até o usuário sair de algum campo (o que gravava).
 *
 * Todas as taxas em PERCENTUAL (4 = 4%), na unidade do campo de banco.
 *
 * Padrão NOVO entra aqui, com a unidade no comentário e a fase do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md que o criou, na
 * seção da fase abaixo. Nenhum número de padrão fica no código do motor nem
 * da tela; a folga é hipótese editável. Guarda: __tests__/imovibPadroes.test.ts.
 */
export const IMOVIB_DEFAULTS = {
    // Cronograma (meses; mês 1 = primeiro mês do estudo)
    construction_duration_months: 24,
    sales_duration_months: 36,
    construction_start_month: 6,
    sales_start_month: 1,

    // Macro
    inflation_rate: 0.4, // % ao MÊS
    discount_rate: 12, // TMA, % ao ANO

    // Deduções diretas sobre a receita bruta
    tax_rate: 4,
    brokerage_fee: 6,

    // Financiamento à produção (legado da Dinâmica; Receitas usa funding_debt_percent)
    financing_percent: 0,
    financing_rate_annual: 10,

    // Perfil de recebimento (soma 100)
    revenue_downpayment_percent: 10,
    revenue_construction_percent: 20,
    revenue_handover_percent: 70,

    // Contingências de receita
    default_rate_percent: 3,
    cancellation_rate_percent: 5,

    // Estrutura de capital e permutas
    funding_equity_percent: 100,
    funding_debt_percent: 0,
    swap_financial_percent: 0,
    swap_physical_percent: 0,

    // ── Plano 2026-11-11 (viabilidade de excelência), uma seção por fase ──
    // Fase 1 — Receitas: curva de vendas, recebimento por safra, distrato, índices
    // Fase 2 — Indicadores e pontos de equilíbrio
    // Fase 3 — Sensibilidade, cenários e risco
    // Fase 4 — Capital e financiamento
    // Fase 5 — Marcos, terreno, desembolso, rubricas
    // Fase 6 — Tributos
    // Fase 10 — Critérios do parecer
} as const;

export type ImovibDefaultKey = keyof typeof IMOVIB_DEFAULTS;
