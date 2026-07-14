import React from 'react';

/**
 * Primitivas de formatação BR para tabelas (F1 do PLANO_MODULO_TABELAS.md).
 *
 * Extraídas dos formatadores duplicados por arquivo (ex.: ContasPagarManager
 * `fmt`/`fmtDate`). Sempre padrão brasileiro. `formatDateBR` NUNCA usa
 * `new Date('YYYY-MM-DD')` cru — ver [[project_cronograma_timezone_bug]]:
 * em UTC-3 isso retrocede 1 dia. Datas "YYYY-MM-DD" são tratadas por split.
 */

const EMPTY = '—';

/** R$ 1.234,56. Retorna '—' para null/undefined/NaN. */
export function formatMoney(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return EMPTY;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * 02/07/2026. Aceita 'YYYY-MM-DD' (tratado por split, sem bug de fuso),
 * ISO com hora, ou Date. Retorna '—' para vazio/ inválido.
 */
export function formatDateBR(value: string | Date | null | undefined): string {
    if (!value) return EMPTY;
    if (typeof value === 'string') {
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleDateString('pt-BR');
    }
    return Number.isNaN(value.getTime()) ? EMPTY : value.toLocaleDateString('pt-BR');
}

/** 02/07/2026 14:32 — timestamp completo (created_at etc.), sempre com hora. */
export function formatDateTimeBR(value: string | Date | null | undefined): string {
    if (!value) return EMPTY;
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return EMPTY;
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** 12,5% — recebe fração (0.125) OU já em pontos percentuais quando asPoints. */
export function formatPercent(value: number | null | undefined, opts?: { asPoints?: boolean; decimals?: number }): string {
    if (value == null || Number.isNaN(value)) return EMPTY;
    const pct = opts?.asPoints ? value : value * 100;
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: opts?.decimals ?? 2 })}%`;
}

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/**
 * Rótulo de mês/ano tipo "julho de 2026" ou "jul. de 26", a partir de uma string
 * "YYYY-MM" ou "YYYY-MM-DD". Extrai ano/mês por split, NUNCA via `new Date(...)`
 * — o mesmo bug de fuso do `formatDateBR` (dia 1º vira UTC meia-noite e retrocede
 * pro mês anterior em UTC-3). Ver [[project_cronograma_timezone_bug]].
 */
export function formatMonthLabel(
    value: string | null | undefined,
    opts?: { month?: 'long' | 'short'; year?: 'numeric' | '2-digit' },
): string {
    if (!value) return EMPTY;
    const m = value.match(/^(\d{4})-(\d{2})/);
    if (!m) return value;
    const monthIdx = parseInt(m[2], 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) return value;
    const monthName = opts?.month === 'short' ? MONTHS_SHORT[monthIdx] : MONTHS_LONG[monthIdx];
    if (!opts?.year) return monthName;
    const year = opts.year === '2-digit' ? m[1].slice(2) : m[1];
    return `${monthName} de ${year}`;
}

interface MoneyProps {
    value: number | null | undefined;
    className?: string;
    /** Realça negativos em vermelho (útil em saldos/DRE). */
    signColor?: boolean;
}

/** Valor monetário. Alinhamento fica no `<td className="text-right">` (regra #6). */
export const Money: React.FC<MoneyProps> = ({ value, className = '', signColor = false }) => {
    const negative = signColor && typeof value === 'number' && value < 0;
    return (
        <span className={`tabular-nums ${negative ? 'text-red-600' : ''} ${className}`}>
            {formatMoney(value)}
        </span>
    );
};

interface DateBRProps {
    value: string | Date | null | undefined;
    className?: string;
}

/** Data no padrão BR, sem bug de fuso. */
export const DateBR: React.FC<DateBRProps> = ({ value, className = '' }) => (
    <span className={className}>{formatDateBR(value)}</span>
);
