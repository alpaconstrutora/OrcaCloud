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

/** 12,5% — recebe fração (0.125) OU já em pontos percentuais quando asPoints. */
export function formatPercent(value: number | null | undefined, opts?: { asPoints?: boolean; decimals?: number }): string {
    if (value == null || Number.isNaN(value)) return EMPTY;
    const pct = opts?.asPoints ? value : value * 100;
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: opts?.decimals ?? 2 })}%`;
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
