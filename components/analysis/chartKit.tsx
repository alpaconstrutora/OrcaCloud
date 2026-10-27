import React from 'react';

/**
 * Cromo comum dos painéis analíticos do Comercial (guia §28) — Locações ›
 * Análise e Venda de Ativos › Análise. Saiu de
 * `components/rentals/RentalAnalysisOverview.tsx` em 27/10/2026, quando a
 * segunda aba nasceu: duas cópias do mesmo cromo são dois vocabulários
 * esperando para divergir (foi assim que o §28 surgiu).
 *
 * Regra transversal: `—` onde a conta não tem base. "Não medido" nunca vira zero.
 */

export const moneyBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

/** Tick de eixo: "12 mil" / "1,2 mi" — o eixo é régua, não valor; a moeda
 *  está no subtítulo e no tooltip, e "R$ 10 mil" quebrava em duas linhas. */
export const compactAxis = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1_000) return `${Math.round(v / 1_000).toLocaleString('pt-BR')} mil`;
    return String(Math.round(v));
};

/** Ticks "redondos" para o eixo de valor (0 · 1 mil · 2 mil …). O automático
 *  do Recharts devolve 0/950/1900/2850, e o formatador compacto arredondaria
 *  2850 para "3 mil" — rótulo mentindo sobre a linha em que está. */
export const niceTicks = (max: number, count = 4): number[] => {
    if (!(max > 0)) return [0];
    const bruto = max / count;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const frac = bruto / pot;
    const passo = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pot;
    const ticks: number[] = [];
    for (let t = 0; t <= max + passo * 0.999; t += passo) ticks.push(Math.round(t * 1000) / 1000);
    return ticks;
};

/** Números com vírgula decimal, como a moeda ao lado — `toFixed` dava "34.3%". */
export const decimalBR = (v: number, casas: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const percent1 = (v: number) => `${decimalBR(v * 100, 1)}%`;
export const percent2 = (v: number) => `${decimalBR(v * 100, 2)}%`;

/** `—` para "não medido". */
export const orDash = (v: number | null | undefined, formata: (n: number) => string) =>
    v == null ? '—' : formata(v);

export const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

// Cromo dos gráficos — os mesmos valores em todos, para lerem como um sistema
// só. Grade e eixos em hairline sólida, um passo acima do fundo.
export const GRID = '#f1f5f9';
export const TICK = { fontSize: 11, fill: '#64748b' };
export const CATEGORY_TICK = { fontSize: 12, fill: '#475569' };
export const TOOLTIP_STYLE = {
    backgroundColor: '#fff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    fontSize: 12,
};
export const TOOLTIP_CURSOR = { fill: '#f8fafc' };
/** Medida do PRIMEIRO render, antes de o container ser medido — sem isto o
 *  Recharts avisa "width(-1)" no console a cada gráfico montado. */
export const INITIAL_DIMENSION = { width: 520, height: 200 };
/** Rótulo direto na ponta da barra — em cor de TEXTO, nunca da série. */
export const END_LABEL = { position: 'right' as const, fontSize: 11, fill: '#64748b' };

/** Série principal (azul do sistema) e a série de contexto em cinza —
 *  forma "ênfase": um matiz + cinza, para a comparação não virar dois azuis. */
export const SERIE_PRINCIPAL = '#3b82f6';
export const SERIE_CONTEXTO = '#94a3b8';

/** Faixas de atraso: rampa de UM matiz (vermelho), clara → escura conforme o
 *  atraso cresce. "A vencer" fica fora da rampa, em cinza neutro: não é atraso. */
export const AGING_COLORS = ['#94a3b8', '#f87171', '#ef4444', '#b91c1c', '#7f1d1d'] as const;

export type AnalysisSourceState = 'loading' | 'ready' | 'error';

export const ChartCard: React.FC<{
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    className?: string;
}> = ({ title, subtitle, children, className = '' }) => (
    <div className={`bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-col ${className}`}>
        <div>
            <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="mt-3 flex-1 min-h-0">{children}</div>
    </div>
);

/** Estado vazio de um card de gráfico — texto só, sem ícone grande: o card já
 *  é pequeno e um ícone de 48px competiria com o título. */
export const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-center min-h-[160px] text-sm text-gray-500 text-center px-4">
        {children}
    </div>
);

/** Gráfico que depende de consulta própria: carregando e falhou têm cara
 *  própria — nunca a do "indisponível" (que é afirmação sobre o dado). */
export const ChartSourceState: React.FC<{ state: AnalysisSourceState; onRetry: () => void; what: string }> = ({ state, onRetry, what }) =>
    state === 'loading' ? (
        <div className="min-h-[160px] flex flex-col justify-center gap-2 px-2" aria-busy="true" aria-label={`Carregando ${what}`}>
            <div className="h-3 rounded bg-gray-100 animate-pulse w-3/4" />
            <div className="h-3 rounded bg-gray-100 animate-pulse w-1/2" />
            <div className="h-3 rounded bg-gray-100 animate-pulse w-2/3" />
        </div>
    ) : (
        <ChartEmpty>
            <span>
                Não foi possível carregar {what}.{' '}
                <button type="button" onClick={onRetry} className="text-blue-600 hover:text-blue-800 font-medium">Tentar de novo</button>
            </span>
        </ChartEmpty>
    );

/** Legenda HTML — um retângulo por série, no vocabulário de texto da tela.
 *  Legenda sempre presente com 2+ séries (a identidade nunca fica só na cor). */
export const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        {items.map(i => (
            <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: i.color }} />
                {i.label}
            </span>
        ))}
    </div>
);

/** Rótulo de grupo do detalhamento — mesmo vocabulário do rótulo de campo (§21). */
export const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-xs font-semibold text-slate-500 mb-2">{children}</p>
);
