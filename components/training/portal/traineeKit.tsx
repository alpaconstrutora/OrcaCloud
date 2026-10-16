import React from 'react';

/**
 * Portal de Treinamentos — vocabulário visual compartilhado pelas abas.
 *
 * O kit de portal (components/portal/PortalKit.tsx, §24) é coral por
 * definição; este portal tem identidade própria (teal, o mesmo cartão do
 * LoginGateway). Aqui ficam só os tokens e os pedaços que mudam de cor —
 * card, estados e tabela continuam vindo do PortalKit.
 */

export const T = {
    accent: '#0d9488',        // teal-600
    accentHover: '#0f766e',   // teal-700
    accentSoftBg: '#ccfbf1',  // teal-100
    accentSoftText: '#115e59',// teal-800
} as const;

export const accentBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-white bg-teal-600 hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const softBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
export const ghostBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[6px] text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50';

/** Datas puras (YYYY-MM-DD) nunca passam por new Date(): viram o dia anterior no Brasil. */
export const fmtData = (iso?: string | null) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

export const fmtDataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const hojeIso = () => new Date().toISOString().split('T')[0];
export const em30DiasIso = () => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

/** Situação de uma validade: válido / vencendo (30 dias) / vencido / sem validade. */
export type Vigencia = 'valido' | 'vencendo' | 'vencido' | 'sem-validade';
export function vigenciaDe(dataValidade?: string | null): Vigencia {
    if (!dataValidade) return 'sem-validade';
    const v = dataValidade.split('T')[0];
    if (v < hojeIso()) return 'vencido';
    if (v <= em30DiasIso()) return 'vencendo';
    return 'valido';
}

export const VIGENCIA_LABEL: Record<Vigencia, { label: string; cor: string }> = {
    valido:        { label: 'Válido',        cor: 'text-emerald-700' },
    vencendo:      { label: 'Vencendo',      cor: 'text-amber-700' },
    vencido:       { label: 'Vencido',       cor: 'text-rose-700' },
    'sem-validade': { label: 'Sem validade', cor: 'text-gray-500' },
};

/** Título de seção dentro do conteúdo (fora do card). */
export const SectionTitle: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
    <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
            <h2 className="text-xl font-bold text-[#1F2430] tracking-tight">{title}</h2>
            {subtitle && <p className="text-[13px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
);

/** Barra de progresso fina. */
export const Progresso: React.FC<{ pct: number; concluido?: boolean }> = ({ pct, concluido }) => (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
            className={`h-full transition-all ${concluido ? 'bg-emerald-500' : 'bg-teal-500'}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
    </div>
);
