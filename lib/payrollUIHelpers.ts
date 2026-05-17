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
