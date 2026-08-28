/**
 * Funções puras de suporte à UI de folha de pagamento.
 * Extraídas de LaborPayroll.tsx para torná-las testáveis de forma isolada.
 */

/** Converte "2026-04-01" ou "2026-04-01T..." para "01/04/2026" */
export function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

/**
 * Calcula o intervalo de datas a partir dos filtros de mês e ano.
 * monthFilter: 'all' | índice do mês 0-based (Jan=0, Dez=11)
 */
export function computeDateRange(
    yearFilter: string,
    monthFilter: string,
): { start?: string; end?: string } {
    if (yearFilter === 'all') return {};

    if (monthFilter === 'all') {
        return { start: `${yearFilter}-01-01`, end: `${yearFilter}-12-31` };
    }

    const monthIndex = parseInt(monthFilter, 10); // 0-based
    const daysInMonth = new Date(parseInt(yearFilter, 10), monthIndex + 1, 0).getDate();
    const m = (monthIndex + 1).toString().padStart(2, '0');
    return {
        start: `${yearFilter}-${m}-01`,
        end: `${yearFilter}-${m}-${daysInMonth}`,
    };
}

/**
 * Sugere a unidade de lançamento (fixed/days/hours) com base no nome/código da rubrica.
 */
export function suggestEventUnit(
    rubricName: string,
    rubricCode: string,
): 'fixed' | 'days' | 'hours' {
    const name = rubricName.toUpperCase();
    const code = rubricCode.toUpperCase();

    if (name.includes('FALTA') || name.includes('DSR')) return 'days';
    if (name.includes('HORA EXTRA') || code.includes('HE')) return 'hours';
    return 'fixed';
}

/**
 * Calcula o valor monetário de um evento a partir da unidade, quantidade e
 * salário base do colaborador. Retorna 0 para unidade 'fixed' (digitado pelo usuário).
 */
export function computeEventAmount(
    unit: 'fixed' | 'days' | 'hours',
    quantity: number,
    baseSalary: number,
    rubricCode: string,
    rubricName: string,
): number {
    if (unit === 'fixed' || quantity <= 0 || baseSalary <= 0) return 0;

    if (unit === 'days') {
        return Math.round((baseSalary / 30) * quantity * 100) / 100;
    }

    // hours
    const name = rubricName.toUpperCase();
    const code = rubricCode.toUpperCase();
    let factor = 1.0;
    if (name.includes('100') || code.includes('100')) factor = 2.0;
    else if (name.includes('50') || code.includes('50')) factor = 1.5;

    return Math.round((baseSalary / 220) * factor * quantity * 100) / 100;
}

/** Uma obra e o percentual do colaborador nela. */
export interface AlocacaoDerivada {
    project_id: string;
    allocation_percent: number;
}

/**
 * Alocação por obra DERIVADA do centro de custo (`cost_centers_v2.project_id`).
 *
 * Um centro de custo pode estar vinculado a uma obra (migration
 * `20270907000000_cost_centers_v2_project_link`). Quando está, a obra do custo
 * já está decidida no cadastro — repetir isso à mão em Alocações, colaborador
 * por colaborador, é digitação redundante que só produz divergência entre o
 * rateio contábil e a obra do lançamento.
 *
 * A escada é a MESMA do `resolvePayrollShares`/`dimensaoEfetiva`:
 *
 *   rateio contábil do mês → centro de custo do cadastro → nada
 *
 * — o rateio manda; sem rateio, vale o cadastro com 100%. Percentuais de dois
 * centros de custo que apontam para a MESMA obra somam numa linha só (o destino
 * é a obra, não o centro de custo).
 *
 * `obraDoCentroDeCusto` devolve `null` para centro de custo sem obra **e** para
 * obra que a tela não conhece — é lá que ficam as REGRAS #2/#3 (projeto de
 * sistema e orçamento/planejamento nunca são obra). Esta função não decide isso.
 */
export function derivarAlocacaoPorCentroDeCusto(
    splits: Array<{ cost_center_id?: string | null; percent: number }>,
    cadastroCostCenterId: string | null | undefined,
    obraDoCentroDeCusto: (costCenterId: string) => string | null | undefined,
): AlocacaoDerivada[] {
    const porObra = new Map<string, number>();

    for (const linha of splits) {
        if (!linha.cost_center_id) continue;
        const projectId = obraDoCentroDeCusto(linha.cost_center_id);
        if (!projectId) continue;
        const percent = Number(linha.percent) || 0;
        if (percent <= 0) continue;
        porObra.set(projectId, (porObra.get(projectId) || 0) + percent);
    }

    // Sem nada aproveitável no rateio, vale o centro de custo do cadastro — e aí
    // é o colaborador inteiro naquela obra.
    if (porObra.size === 0) {
        const projectId = cadastroCostCenterId ? obraDoCentroDeCusto(cadastroCostCenterId) : null;
        if (!projectId) return [];
        return [{ project_id: projectId, allocation_percent: 100 }];
    }

    // `saveAllocations` recusa acima de 100%. O rateio já é validado na gravação,
    // mas um dado antigo fora de faixa não pode travar a alocação automática:
    // corta no teto em vez de devolver algo que o service vai rejeitar.
    let restante = 100;
    const derivada: AlocacaoDerivada[] = [];
    for (const [projectId, percent] of porObra) {
        if (restante <= 0) break;
        const valor = Math.round(Math.min(percent, restante) * 100) / 100;
        derivada.push({ project_id: projectId, allocation_percent: valor });
        restante -= valor;
    }
    return derivada;
}

/**
 * Verifica se uma rubrica já foi lançada para o colaborador na lista de eventos atual.
 * Suporta os dois campos de identificação de rubrica usados no legado (rubric_code / code).
 */
export function isDuplicateRubric(
    events: Array<{ employee_id: string; rubric_code?: string; code?: string }>,
    employeeId: string,
    rubricCode: string,
): boolean {
    return events.some(
        e =>
            e.employee_id === employeeId &&
            (e.rubric_code === rubricCode || e.code === rubricCode),
    );
}
