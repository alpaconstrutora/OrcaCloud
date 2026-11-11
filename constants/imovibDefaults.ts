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

    // Estrutura de capital e permutas. O capital próprio é calculado desde a
    // Fase 4 (D2); a coluna funding_equity_percent fica no banco, sem uso.
    funding_debt_percent: 0,
    swap_financial_percent: 0,
    swap_physical_percent: 0,

    // ── Plano 2026-11-11 (viabilidade de excelência), uma seção por fase ──
    // Fase 1 — Receitas: curva de vendas, recebimento por safra, distrato, índices
    sales_curve_type: 'linear',
    sales_launch_percent: 30, // % do VGV vendido no lançamento
    sales_launch_months: 3,
    sales_vso_percent: 5, // % do estoque vendido por mês (curva VSO)
    revenue_intermediate_percent: 0,
    revenue_intermediate_interval_months: 6,
    revenue_post_handover_percent: 0,
    post_handover_months: 0,
    post_handover_rate_monthly: 0, // % ao mês
    handover_delay_months: 0,
    cancellation_lag_months: 12, // meses entre a venda e o distrato
    cancellation_refund_percent: 75, // % do pago devolvido (Lei 13.786/2018: retenção até 25%, ou 50% com afetação)
    cancellation_resale: true,
    cancellation_resale_discount_percent: 10, // deságio da revenda da unidade distratada (decisão de 11/11)
    // Índices das vendas e da obra: vazio = inflation_rate (não têm padrão próprio).
    // Fase 2 — Indicadores e pontos de equilíbrio
    margem_alvo_terreno_percent: 15, // margem líquida sobre o VGV usada no 'terreno máximo' do Resumo (editável na tela)
    // Fase 3 — Sensibilidade, cenários e risco
    monte_carlo_iteracoes: 2000, // sorteios por simulação (botão Simular)
    // Fase 4 — Capital e financiamento (os quatro primeiros reproduzem o cálculo de antes)
    financing_release_lag_months: 0, // meses entre a medição e a liberação
    financing_min_sales_percent: 0, // % do VGV vendável vendido antes da 1ª liberação
    financing_interest_mode: 'capitaliza', // ou 'paga_mensal'
    financing_amortization: 'receitas', // toda a receita líquida amortiza; ou 'repasse'
    min_cash_balance: 0, // caixa mínimo da SPE, R$
    // Fase 5 — Marcos, terreno, desembolso, rubricas
    // Fase 6 — Tributos
    // Fase 10 — Critérios do parecer
} as const;

export type ImovibDefaultKey = keyof typeof IMOVIB_DEFAULTS;

/**
 * Fase 3 — choques padrão do tornado e dos testes de sensibilidade (editáveis na
 * tela). Unidades: preço, custo de obra e terreno em %; prazos em meses; juros em
 * pontos percentuais ao ano; índice da obra em pontos percentuais ao mês; distrato
 * em pontos percentuais.
 */
export const IMOVIB_CHOQUES_PADRAO = {
    preco: 10,
    custo_obra: 10,
    terreno: 10,
    velocidade_vendas: 6,
    prazo_obra: 3,
    juros_financiamento: 2,
    indice_obra: 0.2,
    distrato: 5,
} as const;

/**
 * Fase 3 — cenários padrão criados pelo botão "Criar cenários padrão" (mesmas
 * unidades de IMOVIB_CHOQUES_PADRAO). O cenário Base é o próprio estudo.
 */
export const IMOVIB_CENARIOS_PADRAO = [
    { name: 'Pessimista', kind: 'pessimista', choques: { preco: -10, custo_obra: 10, velocidade_vendas: 12, prazo_obra: 6 } },
    { name: 'Otimista', kind: 'otimista', choques: { preco: 5, custo_obra: -5, velocidade_vendas: -6 } },
] as const;
