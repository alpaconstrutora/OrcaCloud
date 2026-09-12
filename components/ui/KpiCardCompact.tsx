import React from 'react';

/**
 * KpiCardCompact — KPI no desenho do Calendário Financeiro (FinancialCalendar.tsx).
 *
 * Card branco `rounded-xl border-gray-200 px-4 py-3`, ícone em bolha circular
 * colorida (`w-8 h-8 rounded-full bg-{cor}-100`), rótulo uppercase em cinza e o
 * valor em `text-sm font-bold` na cor do KPI. Grade recomendada: `gap-3`.
 *
 * Diferente do KpiCard (docs/ui_ux_guia_unificado.md § 4), aqui o valor é
 * colorido e não há legenda — é a variante compacta usada em Calendário,
 * Conciliação Bancária e Dívidas & Financiamentos.
 *
 * Uso:
 *   <KpiCardCompact label="A Receber" value={fmt(total)} icon={<TrendingUp className="w-4 h-4" />} color="green" />
 */

export type KpiCompactColor =
    | 'blue' | 'green' | 'emerald' | 'red' | 'orange' | 'amber' | 'purple' | 'violet' | 'indigo' | 'gray';

const COLOR_MAP: Record<KpiCompactColor, { bubble: string; icon: string; value: string }> = {
    blue:    { bubble: 'bg-blue-100',    icon: 'text-blue-600',    value: 'text-blue-700' },
    green:   { bubble: 'bg-green-100',   icon: 'text-green-600',   value: 'text-green-700' },
    emerald: { bubble: 'bg-emerald-100', icon: 'text-emerald-600', value: 'text-emerald-700' },
    red:     { bubble: 'bg-red-100',     icon: 'text-red-600',     value: 'text-red-700' },
    orange:  { bubble: 'bg-orange-100',  icon: 'text-orange-600',  value: 'text-orange-700' },
    amber:   { bubble: 'bg-amber-100',   icon: 'text-amber-600',   value: 'text-amber-700' },
    purple:  { bubble: 'bg-purple-100',  icon: 'text-purple-600',  value: 'text-purple-700' },
    violet:  { bubble: 'bg-violet-100',  icon: 'text-violet-600',  value: 'text-violet-700' },
    indigo:  { bubble: 'bg-indigo-100',  icon: 'text-indigo-600',  value: 'text-indigo-700' },
    gray:    { bubble: 'bg-gray-100',    icon: 'text-gray-500',    value: 'text-gray-700' },
};

interface KpiCardCompactProps {
    /** Rótulo do indicador (renderizado em uppercase) */
    label: string;
    /** Valor principal já formatado */
    value: string | number;
    /** Ícone Lucide — use `className="w-4 h-4"` */
    icon: React.ReactNode;
    /** Paleta do ícone/bolha/valor */
    color?: KpiCompactColor;
    /** Pulsa a bolha do ícone — para chamar atenção a um estado pendente. Default false. */
    pulse?: boolean;
    /** Classe CSS extra no card raiz */
    className?: string;
}

export function KpiCardCompact({ label, value, icon, color = 'blue', pulse = false, className = '' }: KpiCardCompactProps) {
    const c = COLOR_MAP[color];
    return (
        <div className={`bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 ${className}`}>
            <div className={`w-8 h-8 rounded-full ${c.bubble} flex items-center justify-center shrink-0 ${pulse ? 'animate-pulse' : ''}`}>
                <span className={c.icon}>{icon}</span>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                <p className={`text-sm font-bold ${c.value} truncate`}>{value}</p>
            </div>
        </div>
    );
}

export default KpiCardCompact;
