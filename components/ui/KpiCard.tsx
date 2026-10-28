import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';

/**
 * KpiCard — Padrão Global OrçaCloud
 * Fonte: docs/ui_ux_guia_unificado.md § 4. KPI CARDS
 *
 * Desenho (o do Calendário Financeiro, propagado para o app inteiro em
 * 12/09/2026): card branco `rounded-xl border-gray-200 px-4 py-3`, ícone em
 * bolha circular colorida (`w-8 h-8 rounded-full bg-{cor}-100`), rótulo
 * uppercase em cinza e valor `text-sm font-bold` na cor do KPI. Grade
 * recomendada: `gap-3`.
 *
 * Uso:
 *   <KpiCard
 *     label="Total Emitido"
 *     value="R$ 120.000"
 *     sub="12 cobranças"          // opcional — linha pequena em cinza
 *     icon={<Landmark className="w-4 h-4" />}
 *     color="blue"
 *   />
 *
 * Cores: blue | emerald | green | amber | red | purple | gray | violet | orange
 *        | indigo | rose | teal | cyan | sky
 */

export type KpiColor =
    | 'blue' | 'emerald' | 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'violet'
    | 'orange' | 'indigo' | 'rose' | 'teal' | 'cyan' | 'sky';

const COLOR_MAP: Record<KpiColor, { bubble: string; icon: string; value: string }> = {
    blue:    { bubble: 'bg-blue-100',    icon: 'text-blue-600',    value: 'text-blue-700' },
    emerald: { bubble: 'bg-emerald-100', icon: 'text-emerald-600', value: 'text-emerald-700' },
    green:   { bubble: 'bg-green-100',   icon: 'text-green-600',   value: 'text-green-700' },
    amber:   { bubble: 'bg-amber-100',   icon: 'text-amber-600',   value: 'text-amber-700' },
    red:     { bubble: 'bg-red-100',     icon: 'text-red-600',     value: 'text-red-700' },
    purple:  { bubble: 'bg-purple-100',  icon: 'text-purple-600',  value: 'text-purple-700' },
    gray:    { bubble: 'bg-gray-100',    icon: 'text-gray-500',    value: 'text-gray-700' },
    violet:  { bubble: 'bg-violet-100',  icon: 'text-violet-600',  value: 'text-violet-700' },
    orange:  { bubble: 'bg-orange-100',  icon: 'text-orange-600',  value: 'text-orange-700' },
    indigo:  { bubble: 'bg-indigo-100',  icon: 'text-indigo-600',  value: 'text-indigo-700' },
    rose:    { bubble: 'bg-rose-100',    icon: 'text-rose-600',    value: 'text-rose-700' },
    teal:    { bubble: 'bg-teal-100',    icon: 'text-teal-600',    value: 'text-teal-700' },
    cyan:    { bubble: 'bg-cyan-100',    icon: 'text-cyan-600',    value: 'text-cyan-700' },
    sky:     { bubble: 'bg-sky-100',     icon: 'text-sky-600',     value: 'text-sky-700' },
};

/**
 * Converte uma classe Tailwind de cor (`bg-rose-50`, `text-slate-700`) na
 * paleta do KpiCard — para telas antigas que guardavam a cor como classe.
 * `slate` vira `gray`; cor desconhecida cai em `blue`.
 */
export function kpiColorFromClass(cls: string): KpiColor {
    const m = /(?:bg|text|border)-([a-z]+)-\d+/.exec(cls);
    const nome = m ? m[1] : cls;
    const cor = nome === 'slate' ? 'gray' : nome;
    return (cor in COLOR_MAP ? cor : 'blue') as KpiColor;
}

interface KpiCardProps {
    /** Rótulo do indicador (renderizado em uppercase) */
    label: string;
    /** Valor principal (string ou número formatado) */
    value: string | number;
    /** Dica curta abaixo do valor (opcional — omita quando for redundante, §4.1) */
    sub?: string;
    /** Ícone Lucide. O tamanho é normalizado para 16px (w-4 h-4) dentro da bolha. */
    icon?: React.ReactNode;
    /** Paleta da bolha, do ícone e do valor */
    color?: KpiColor;
    /** Classe CSS extra no card raiz */
    className?: string;
    /** Ao clicar no card (opcional) */
    onClick?: () => void;
    /** Tooltip nativo do card (opcional) */
    title?: string;
    /** Mantido por compatibilidade — o desenho atual não tem sombra. */
    shadow?: boolean;
    /** Mantido por compatibilidade — `lg` deixa o valor um degrau maior (text-base); `sm`/`md` são iguais. */
    size?: 'sm' | 'md' | 'lg';
    /** Pulsa a bolha do ícone — para chamar atenção a um estado pendente/aguardando ação. Default false. */
    pulse?: boolean;
    /**
     * Indicador PRINCIPAL de painel analítico (guia §4.5) — valor grande, cor
     * neutra, e a cor só aparece por `tom` (limiar). Não use em tela de
     * listagem: lá vale a §4 (cor semântica por KPI).
     */
    destaque?: boolean;
    /** Só com `destaque`: estado pelo limiar. `neutro` (padrão) não pinta nada. */
    tom?: KpiTom;
    /** Só com `destaque`: a ação que o número pede ("Cobrar", "Ver renovações"). */
    acao?: { label: string; onClick: () => void };
}

export type KpiTom = 'neutro' | 'atencao' | 'alerta';

/** Valor do indicador de destaque por estado. O ícone de alerta ao lado do
 *  valor é o sinal que não depende de cor (quem não distingue o vermelho). */
const TOM_VALOR: Record<KpiTom, string> = {
    neutro: 'text-gray-900',
    atencao: 'text-amber-700',
    alerta: 'text-red-700',
};

/** Normaliza o ícone recebido para 16px: as chamadas antigas passam `w-5 h-5`. */
function iconeNormalizado(icon: React.ReactNode): React.ReactNode {
    if (!React.isValidElement<{ className?: string }>(icon)) return icon;
    const atual = (icon.props.className ?? '').replace(/\b[wh]-\d+(\.\d+)?\b/g, '').trim();
    return React.cloneElement(icon, { className: `w-4 h-4 ${atual}`.trim() });
}

/**
 * Componente canônico de KPI Card.
 * Layout: bolha com ícone à esquerda + label/valor/dica à direita.
 */
export function KpiCard({
    label,
    value,
    sub,
    icon,
    color = 'blue',
    className = '',
    onClick,
    title,
    size = 'md',
    pulse = false,
    destaque = false,
    tom = 'neutro',
    acao,
}: KpiCardProps) {
    const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
    const isClickable = !!onClick;

    if (destaque) {
        return (
            <div
                title={title}
                className={`bg-white rounded-xl border border-gray-200 px-4 py-3.5 flex flex-col min-w-0 ${className}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {icon && <span className="text-gray-400 shrink-0">{iconeNormalizado(icon)}</span>}
                    <p className="text-sm font-medium text-gray-600 truncate">{label}</p>
                </div>
                <p className={`mt-1.5 flex items-center gap-1.5 text-2xl font-semibold leading-tight tabular-nums ${TOM_VALOR[tom]}`}>
                    {tom !== 'neutro' && <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{value}</span>
                    {tom !== 'neutro' && <span className="sr-only">{tom === 'alerta' ? '(alerta)' : '(atenção)'}</span>}
                </p>
                {sub && <p className="mt-1 text-xs text-gray-500 truncate">{sub}</p>}
                {acao && (
                    <button
                        type="button"
                        onClick={acao.onClick}
                        className="mt-2 self-start inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                        {acao.label}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            title={title}
            className={[
                'bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3',
                isClickable ? 'cursor-pointer transition-transform active:scale-[0.98]' : '',
                className,
            ].join(' ')}
        >
            {icon && (
                <div className={`w-8 h-8 rounded-full ${c.bubble} flex items-center justify-center shrink-0 ${pulse ? 'animate-pulse' : ''}`}>
                    <span className={c.icon}>{iconeNormalizado(icon)}</span>
                </div>
            )}
            <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                <p className={`${size === 'lg' ? 'text-base' : 'text-sm'} font-bold ${c.value} truncate`}>{value}</p>
                {/* gray-500 em 12px: o gray-400 em 11px dava 2,6:1 sobre branco
                    (abaixo dos 4,5:1), medido na aba Análise de Locações (26/10/2026). */}
                {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
            </div>
        </div>
    );
}

export default KpiCard;
