/**
 * Feriados nacionais brasileiros — cálculo local, sem dependência externa.
 * Usado para popular `ProjectSchedule.holidays` (Config do cronograma).
 */

export interface HolidayEntry {
    date: string; // ISO 'YYYY-MM-DD'
    name: string;
}

/** Domingo de Páscoa do ano, via algoritmo de Gauss/Meeus. Retorna Date em UTC midnight. */
function easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function fmt(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Feriados nacionais fixos + móveis (baseados na Páscoa) para o ano informado.
 * Carnaval e Corpus Christi são ponto facultativo na maior parte do país, mas
 * incluídos por serem amplamente observados em obras.
 */
export function getBrazilianHolidays(year: number): HolidayEntry[] {
    const easter = easterSunday(year);

    const fixed: HolidayEntry[] = [
        { date: `${year}-01-01`, name: 'Confraternização Universal' },
        { date: `${year}-04-21`, name: 'Tiradentes' },
        { date: `${year}-05-01`, name: 'Dia do Trabalho' },
        { date: `${year}-09-07`, name: 'Independência do Brasil' },
        { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
        { date: `${year}-11-02`, name: 'Finados' },
        { date: `${year}-11-15`, name: 'Proclamação da República' },
        { date: `${year}-11-20`, name: 'Consciência Negra' },
        { date: `${year}-12-25`, name: 'Natal' },
    ];

    const mobile: HolidayEntry[] = [
        { date: fmt(addDays(easter, -48)), name: 'Carnaval (segunda)' },
        { date: fmt(addDays(easter, -47)), name: 'Carnaval (terça)' },
        { date: fmt(addDays(easter, -2)), name: 'Sexta-feira Santa' },
        { date: fmt(addDays(easter, 60)), name: 'Corpus Christi' },
    ];

    return [...fixed, ...mobile].sort((a, b) => a.date.localeCompare(b.date));
}
