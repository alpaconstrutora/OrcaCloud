/**
 * As colunas ligáveis da Tabela e do Gantt do Planejamento — uma lista só,
 * lida pelo ribbon (menu "Colunas", aba Vista) e pelas grades.
 *
 * Até 21/09/2026 cada grade tinha o próprio `COL_LABELS` dentro do componente,
 * e o menu de colunas morava no cabeçalho de cada uma. Com o menu no ribbon,
 * quem monta a lista é o header — e não pode existir uma segunda cópia para
 * as duas divergirem em silêncio.
 *
 * As chaves são as MESMAS que `collapsedCols` / `ganttCollapsedCols` guardam
 * no `localStorage` (`schedule-collapsed-cols`, `gantt-collapsed-cols`) —
 * renomear uma aqui perde a preferência do usuário.
 */

export const COLUNAS_DA_TABELA: Record<string, string> = {
    uid: 'ID',
    pred: 'Predecessora',
    duration: 'Duração',
    start: 'Início',
    end: 'Término',
    esef: 'ES/EF',
    lslf: 'LS/LF',
    float: 'Folga',
    budgeted: 'Orçado (B)',
    budgetedWithBdi: 'Orçado c/ BDI',
    planned: 'Planejado (C)',
    realized: 'Realizado',
    variation: 'Variação',
    resources: 'Recursos',
    realPct: '% Físico',
    finPct: '% Financeiro',
};

export const COLUNAS_DO_GANTT: Record<string, string> = {
    gWbs: 'ITEM',
    gId: 'ID',
    gPred: 'Predecessora',
    gDur: 'Duração',
    gStart: 'Início',
    gEnd: 'Término',
    gEsEf: 'ES/EF',
    gLsLf: 'LS/LF',
    gFloat: 'Folga',
    gBudgeted: 'Orçado (B)',
    gBudgetedWithBdi: 'Orçado c/ BDI',
    gPlanned: 'Planejado (C)',
    gRealized: 'Realizado $',
    gVariation: 'Variação $',
    gResources: 'Recursos',
    gRealPct: '% Físico',
    gFinPct: '% Financeiro',
};

/** Os níveis do resumo (Grupos › Etapas › Subetapas › Itens) — chaves de `visibleSummaryLevels`. */
export const NIVEIS_DO_RESUMO = [
    { id: 'group', rotulo: 'Grupos' },
    { id: 'phase', rotulo: 'Etapas' },
    { id: 'subphase', rotulo: 'Subetapas' },
    { id: 'item', rotulo: 'Itens' },
] as const;
