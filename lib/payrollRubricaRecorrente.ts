/**
 * Rubrica RECORRENTE do colaborador (Colaborador › Folha de Pagamento): qual
 * rubrica pode entrar todo mês, quando ela precisa de valor, e quanto vale.
 *
 * Até 23/10/2026 só rubrica marcada "Automática" podia ser recorrente, e o
 * vínculo não tinha valor: 19 das 33 rubricas (Gratificação, Hora Extra,
 * prêmios…) são de cálculo manual e nunca entravam. Agora o vínculo leva o
 * valor do colaborador — R$/mês ou % do salário da competência (decisão do
 * usuário). Plano: `docs/planos/2026-10-22-rh-folha-adicionar-rubricas.md`.
 *
 * Usado pela tela (o que travar, o que exigir) E pelo motor (o que lançar),
 * para as duas pontas nunca divergirem.
 */

export type ValorTipoRecorrente = 'fixo' | 'percentual';

export interface ValorRecorrente {
    valor_tipo: ValorTipoRecorrente | null;
    /** R$ (fixo) ou pontos percentuais (percentual: 10 = 10%). */
    valor: number | null;
}

/** O pedaço da rubrica que a regra lê (evita importar o service no motor). */
export interface RubricaParaRecorrente {
    code: string;
    calculation_type?: string | null;
    calculation_config?: { amount?: number; percentage?: number } | null;
    category?: string | null;
    is_clt_mandatory?: boolean | null;
}

/**
 * Por que esta rubrica NÃO pode ser recorrente por colaborador — ou `null` se pode.
 * INSS/IRRF/FGTS (`category = 'tax'`) o motor calcula sozinho; vínculo deles
 * duplicaria ou seria ignorado. Salário e Padrão CLT já entram para todo CLT.
 * 13º e férias têm folha própria: recorrente com valor entraria em TODA folha
 * mensal (achado na conferência em produção, 24/10/2026).
 * Textos curtos: cabem na célula da aba (~230px); o `title` diz o resto.
 */
export function motivoBloqueioRecorrente(r: RubricaParaRecorrente): string | null {
    if (r.category === 'tax') return 'Calculada pela folha';
    if (r.is_clt_mandatory || r.category === 'base') return 'Já entra para todo CLT';
    if (r.category === 'termination') return 'Só na rescisão';
    if (r.category === 'thirteenth') return 'Só na folha de 13º';
    if (r.category === 'vacation') return 'Só na folha de férias';
    return null;
}

/**
 * Manual sem valor fica EM ABERTO: é recorrente no cadastro, mas o valor varia e
 * é lançado no mês (Eventos de Folha); sem lançamento, o motor não gera nada.
 * Decisão do usuário (23/10/2026): "rubrica com R$ pode ser variável, então
 * permita que deixe sem ser preenchido (em aberto)" — a tela não exige mais o valor.
 */
export function ficaEmAbertoSemValor(r: RubricaParaRecorrente): boolean {
    if (motivoBloqueioRecorrente(r)) return false;
    return !r.calculation_type || r.calculation_type === 'manual';
}

const pct = (fracao: number) =>
    `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/**
 * O cálculo próprio da rubrica, em texto curto (placeholder do campo) — o que vale
 * quando o colaborador não tem valor. A tela põe "Cálculo da rubrica: …" no `title`.
 */
export function valorDaRubrica(r: RubricaParaRecorrente): string {
    const cfg = r.calculation_config ?? {};
    switch (r.calculation_type) {
        case 'percentage': return `${pct(cfg.percentage ?? 0)} do salário`;
        case 'fixed': return brl(cfg.amount ?? 0);
        case 'formula': return 'Fórmula';
        default: return '';
    }
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor do colaborador para a folha, no formato do motor; `null` = sem valor
 * próprio (vale o cálculo da rubrica). Percentual é sobre o salário da
 * competência (`baseValues.SALARIO` do motor).
 */
export function valorRecorrente(
    v: ValorRecorrente | undefined,
    salario: number,
): { amount: number; base_amount: number; reference: number } | null {
    if (!v || v.valor_tipo == null || v.valor == null) return null;
    if (v.valor_tipo === 'fixo') return { amount: centavos(v.valor), base_amount: centavos(v.valor), reference: 1 };
    // salário × pontos já é o valor em centavos: evita `1621 × 0,075 = 121,57499…`.
    return { amount: Math.round(salario * v.valor) / 100, base_amount: salario, reference: v.valor / 100 };
}
