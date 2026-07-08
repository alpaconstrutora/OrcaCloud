import React from 'react';

/**
 * KpiCard — Padrão Global OrçaCloud
 * Fonte: docs/ui_ux_standard_guide.md § 4. KPI CARDS
 *
 * Uso:
 *   <KpiCard
 *     label="Total Emitido"
 *     value="R$ 120.000"
 *     sub="12 cobranças"
 *     icon={<Landmark className="w-5 h-5" />}
 *     color="blue"
 *   />
 *
 * Cores disponíveis: blue | emerald | amber | red | purple | gray | violet | orange
 */

type KpiColor = 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'gray' | 'violet' | 'orange' | 'indigo' | 'rose' | 'teal' | 'cyan';

const COLOR_MAP: Record<KpiColor, { bg: string; text: string; dot: string; hover: string }> = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    dot: 'bg-blue-500',    hover: 'hover:border-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500', hover: 'hover:border-emerald-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   dot: 'bg-amber-500',   hover: 'hover:border-amber-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     hover: 'hover:border-red-100' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  dot: 'bg-purple-500',  hover: 'hover:border-purple-100' },
    gray:    { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-500',    hover: 'hover:border-gray-200' },
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  dot: 'bg-violet-500',  hover: 'hover:border-violet-100' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  dot: 'bg-orange-500',  hover: 'hover:border-orange-100' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  dot: 'bg-indigo-500',  hover: 'hover:border-indigo-100' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    dot: 'bg-rose-500',    hover: 'hover:border-rose-100' },
    teal:    { bg: 'bg-teal-50',    text: 'text-teal-600',    dot: 'bg-teal-500',    hover: 'hover:border-teal-100' },
    cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    dot: 'bg-cyan-500',    hover: 'hover:border-cyan-100' },
};

interface KpiCardProps {
    /** Rótulo do indicador */
    label: string;
    /** Valor principal (string ou número formatado) */
    value: string | number;
    /** Legenda de apoio abaixo do valor (opcional) */
    sub?: string;
    /** Ícone Lucide (ex: <Landmark className="w-5 h-5" />) */
    icon?: React.ReactNode;
    /** Paleta de cor do ícone e destaque */
    color?: KpiColor;
    /** Classe CSS extra no card raiz */
    className?: string;
    /** Ao clicar no card (opcional) */
    onClick?: () => void;
    /** Sombra de base + hover:shadow-lg. Default true (padrão histórico). Desligue em telas que preferem borda-só, sem elevação. */
    shadow?: boolean;
}

/**
 * Componente canônico de KPI Card.
 * Layout: ícone esquerda + label/valor/legenda direita.
 * Segue exatamente o snippet de docs/ui_ux_standard_guide.md § 4.
 */
export function KpiCard({
    label,
    value,
    sub,
    icon,
    color = 'blue',
    className = '',
    onClick,
    shadow = true,
}: KpiCardProps) {
    const c = COLOR_MAP[color];
    const isClickable = !!onClick;

    return (
        <div
            onClick={onClick}
            className={[
                'bg-white p-5 rounded-[1.5rem] border border-gray-100',
                shadow ? 'shadow-sm' : '',
                'flex items-center gap-5 group transition-all',
                c.hover,
                shadow ? 'hover:shadow-lg' : '',
                isClickable ? 'cursor-pointer active:scale-[0.98]' : '',
                className,
            ].join(' ')}
        >
            {/* Ícone */}
            {icon && (
                <div className={[
                    'p-3.5 rounded-[1.25rem] shrink-0',
                    'group-hover:scale-110 transition-transform',
                    c.bg, c.text,
                ].join(' ')}>
                    {icon}
                </div>
            )}

            {/* Textos */}
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                    {label}
                </p>
                <p className="text-2xl font-bold text-gray-900 truncate">
                    {value}
                </p>
                {sub && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                        <p className="text-xs text-gray-400 font-medium truncate">{sub}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default KpiCard;
