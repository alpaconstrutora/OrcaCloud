import React from 'react';

/**
 * Vocabulário visual dos PORTAIS EXTERNOS (o que o investidor / o fornecedor vê
 * no acesso por link público).
 *
 * ⚠️ Exceção deliberada ao `docs/ui_ux_guia_unificado.md` §24 — autorizada pelo
 * usuário em 2026-08-15 ("vamos abrir exceção neste caso") e estendida ao Portal
 * do Fornecedor em 2026-08-19 ("aplicar UI UX igual ao portal do investidor"),
 * e à aba Financeiro do Portal do Parceiro em 2026-09-30 ("aplicar o mesmo design
 * usado no portal do fornecedor > financeiro").
 * Vale SÓ para `components/investor/portal/*` e `components/supplier/portal/*`,
 * mais os trechos recortados por `isPublicExperience` nos dois dashboards, mais
 * `components/partner/PartnerPortalFinanceiro.tsx`, e à aba Comissões do Portal do
 * Corretor em 2026-10-17 ("aplicar o design do portal do parceiro no portal do
 * corretor") — `components/broker/BrokerCommissions.tsx`. E ao Portal do
 * Síndico inteiro em 2026-10-20 (decisão do usuário: "Sim, mesmo visual") —
 * `components/sindico/*`.
 * Nenhuma tela interna do app usa este arquivo.
 *
 * O que diverge do guia (e só aqui): pílula de status com fundo (§8), `<thead>`
 * em caixa alta (§6.2), acento coral em vez do azul (§17) e faixa de KPIs com
 * divisores/tendência em vez do `KpiCard` (§4/§4.4).
 *
 * Morava em `components/investor/portal/PortalKit.tsx`; subiu para cá quando
 * passou a servir dois portais — o kit é a fonte única de cor/medida do
 * vocabulário. Tela de portal não escreve `bg-[#E1553C]` à mão.
 */

// ── Tokens ────────────────────────────────────────────────────────────────────
export const P = {
    accent: '#E1553C',
    accentHover: '#C8452E',
    accentSoftBg: '#FDEDE8',
    accentSoftText: '#C24428',
    line: '#ECECEF',
    pageBg: '#F2F2F4',
    ink: '#1F2430',
    muted: '#8A8F9A',
    /** Texto secundário legível (5,9:1 sobre branco); `muted` (3,3:1) fica para ícone e traço. */
    mutedText: '#5F6573',
    chart: {
        primary: '#E1553C',
        secondary: '#6D9BD1',
        tertiary: '#C6CAD1',
    },
    /**
     * Rosca "De onde vem o dinheiro" no painel do investidor (16/11/2026 — no lugar do índigo/roxo do
     * app). Validada pelo skill dataviz em TODAS as combinações de fatias presentes (fatia 0% some),
     * na ordem fixa e com a volta da última para a primeira: pior par para daltônico ΔE 10,7 (meta 8),
     * pior par em visão normal ΔE 15,3 (piso 15). O azul-claro do portal (#6D9BD1) e o cinza não
     * passam no piso de croma — lidos como fatia, viram cinza. Azul, verde e amarelo ficam abaixo de
     * 3:1 no branco: a legenda leva o percentual (rótulo visível). Cor segue a fonte, nunca a posição.
     */
    capital: {
        proprio: '#E1553C',
        divida: '#2F5F98',
        vendasNaObra: '#4C93DB',
        permuta: '#16A085',
        terceiros: '#EDA100',
    },
} as const;

export const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const fmtBRLCents = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * "02 ago 26" — o `toLocaleDateString` pt-BR devolve "02 de ago. de 26", longo
 * demais para célula de tabela. Tira os " de " e o ponto da abreviação.
 */
const compact = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('pt-BR', opts).replace(/ de /g, ' ').replace(/\./g, '');

/** Aceita data pura (YYYY-MM-DD) ou timestamp. */
export const parseDate = (value?: string | null): Date | null => {
    if (!value) return null;
    // `new Date('2026-08-15')` é lido como UTC e volta um dia no fuso -03;
    // a âncora de meio-dia evita isso.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (iso?: string | null) => {
    const d = parseDate(iso);
    return d ? compact(d, { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
};

/** "jan/26" — rótulo do eixo do gráfico. */
export const fmtMonthShort = (d: Date) =>
    `${compact(d, { month: 'short' })}/${String(d.getFullYear()).slice(-2)}`;

// ── Card ──────────────────────────────────────────────────────────────────────
export const PortalCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...rest }) => (
    <div {...rest} className={`bg-white rounded-2xl border border-[#ECECEF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
        {children}
    </div>
);

// ── Vidro — painel de viabilidade do investidor ───────────────────────────────
// Plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 4: referência
// pedida pelo usuário (painel de vidro fosco, acentos luminosos, hover animado) na paleta do
// portal. O vidro só é vidro com algo atrás: `FundoDeVidro` põe os brilhos coral e azul, e o
// pai precisa de `relative isolate`.
// `translate`, não `transform`: no Tailwind v4 o `-translate-y-0.5` usa a propriedade `translate`;
// com `transition-[transform,…]` o cartão subia num salto (conferido em 16/11).
export const VIDRO = {
    card: 'relative rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_1px_2px_rgba(31,36,48,0.06),0_10px_28px_-14px_rgba(31,36,48,0.22)]',
    interativo: 'transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(31,36,48,0.06),0_22px_44px_-18px_rgba(225,85,60,0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
} as const;

export const PortalVidro: React.FC<React.HTMLAttributes<HTMLDivElement> & { interativo?: boolean }> = ({ interativo = false, className = '', children, ...rest }) => (
    <div {...rest} className={`${VIDRO.card} ${interativo ? VIDRO.interativo : ''} ${className}`}>
        {children}
    </div>
);

/** `portal-luz` (index.css): ao abrir o painel, os brilhos acendem atrás do vidro, uma vez. */
export const FundoDeVidro: React.FC = () => (
    <div aria-hidden="true" className="portal-luz pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-[#E1553C]/25 blur-3xl" />
        <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-[#6D9BD1]/25 blur-3xl" />
        <div className="absolute top-2/3 -left-20 w-80 h-80 rounded-full bg-[#6D9BD1]/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-[#E1553C]/15 blur-3xl" />
    </div>
);

// ── Faixa de KPIs — card único, divisores verticais (§24, substitui o §4) ─────
export interface KpiItem {
    label: string;
    value: string;
    /** Variação já formatada ("+5%", "-0,2%"). Omitir quando não houver base de comparação. */
    delta?: string;
    /** Direção do delta — decide a cor. 'flat' fica cinza. */
    direction?: 'up' | 'down' | 'flat';
    hint?: string;
    /**
     * Quando presente, o KPI vira botão. Aditivo: os portais que não passam
     * `onClick` continuam renderizando exatamente o mesmo <div> de antes.
     */
    onClick?: () => void;
}

export const KpiStrip: React.FC<{ items: KpiItem[] } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>> = ({ items, ...rest }) => (
    <PortalCard {...rest} className="overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-[#ECECEF]">
            {items.map(item => (
                <div
                    key={item.label}
                    onClick={item.onClick}
                    role={item.onClick ? 'button' : undefined}
                    tabIndex={item.onClick ? 0 : undefined}
                    onKeyDown={item.onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onClick!(); } } : undefined}
                    className={`px-5 py-4 min-w-0 ${item.onClick ? 'cursor-pointer hover:bg-[#FAFAFB] transition-colors' : ''}`}
                >
                    <p className="text-[13px] text-[#8A8F9A] truncate">{item.label}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl md:text-2xl font-bold text-[#1F2430] tracking-tight truncate">{item.value}</span>
                        {item.delta && (
                            <span
                                className={`text-[13px] font-medium shrink-0 ${
                                    item.direction === 'down' ? 'text-red-500'
                                        : item.direction === 'flat' ? 'text-gray-400'
                                            : 'text-emerald-600'
                                }`}
                            >
                                {item.delta}
                            </span>
                        )}
                    </div>
                    {item.hint && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.hint}</p>}
                </div>
            ))}
        </div>
    </PortalCard>
);

// ── Pílula de status (§24, exceção ao §8) ────────────────────────────────────
export type PillTone = 'accent' | 'good' | 'neutral' | 'info' | 'muted';

const PILL_TONES: Record<PillTone, string> = {
    accent: 'bg-[#FDEDE8] text-[#C24428]',
    good: 'bg-[#E7F6EC] text-[#1F7A3D]',
    neutral: 'bg-[#FDF3DC] text-[#8A6A16]',
    info: 'bg-[#EAF1FA] text-[#2F5F98]',
    muted: 'bg-gray-100 text-gray-500',
};

export const StatusPill: React.FC<{ tone?: PillTone; children: React.ReactNode }> = ({ tone = 'muted', children }) => (
    <span className={`inline-block px-2 py-0.5 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${PILL_TONES[tone]}`}>
        {children}
    </span>
);

/** Etiqueta discreta (serviços, tags) — contorno, sem preenchimento forte. */
export const TagChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-block px-2 py-0.5 rounded-[6px] text-[11px] font-medium text-[#2F5F98] border border-[#CBDCEF] bg-white whitespace-nowrap">
        {children}
    </span>
);

// ── Abas do card (aba ativa = "aba de pasta" branca sobre o topo) ─────────────
export interface PortalTabItem { id: string; label: string; count?: number }

export const PortalTabs: React.FC<{
    tabs: PortalTabItem[];
    active: string;
    onChange: (id: string) => void;
    /** `data-tour="<prefixo><id>"` em cada aba — âncora do tour guiado dos portais */
    dataTourPrefix?: string;
}> = ({ tabs, active, onChange, dataTourPrefix }) => (
    <div className="flex items-end gap-1 px-2 pt-2 overflow-x-auto scrollbar-hide border-b border-[#ECECEF]">
        {tabs.map(t => {
            const isActive = t.id === active;
            return (
                <button
                    key={t.id}
                    type="button"
                    data-tour={dataTourPrefix ? `${dataTourPrefix}${t.id}` : undefined}
                    onClick={() => onChange(t.id)}
                    className={`relative px-3.5 py-2 text-[13px] whitespace-nowrap rounded-t-lg transition-colors ${
                        isActive
                            ? 'bg-white text-[#1F2430] font-semibold shadow-[0_-1px_2px_rgba(16,24,40,0.04)]'
                            : 'text-[#8A8F9A] hover:text-[#1F2430]'
                    }`}
                >
                    {t.label}
                    {typeof t.count === 'number' && (
                        <span className={`ml-1.5 text-[11px] ${isActive ? 'text-[#C24428]' : 'text-gray-400'}`}>{t.count}</span>
                    )}
                    {isActive && <span className="absolute left-0 right-0 -bottom-px h-px bg-white" />}
                </button>
            );
        })}
    </div>
);

// ── Botões ────────────────────────────────────────────────────────────────────
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode };

export const PrimaryButton: React.FC<BtnProps> = ({ children, className = '', ...rest }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#E1553C] text-white text-[13px] font-semibold hover:bg-[#C8452E] active:scale-95 transition-all disabled:opacity-50 ${className}`}
    >
        {children}
    </button>
);

/** O PrimaryButton como LINK — navegação (ex.: ir para a entrada por e-mail e senha). */
export const PrimaryLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }> = ({ children, className = '', ...rest }) => (
    <a
        {...rest}
        className={`inline-flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#E1553C] text-white text-[13px] font-semibold hover:bg-[#C8452E] active:scale-95 transition-all ${className}`}
    >
        {children}
    </a>
);

export const SoftButton: React.FC<BtnProps> = ({ children, className = '', ...rest }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#FDEDE8] text-[#C24428] text-[13px] font-semibold hover:bg-[#FBE0D8] active:scale-95 transition-all disabled:opacity-50 ${className}`}
    >
        {children}
    </button>
);

export const GhostButton: React.FC<BtnProps> = ({ children, className = '', ...rest }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-2 h-9 px-3 rounded-[8px] text-[13px] font-medium text-[#8A8F9A] hover:text-[#1F2430] hover:bg-gray-50 transition-all ${className}`}
    >
        {children}
    </button>
);

/** Opção de escolha única que fica marcada (ex.: a cédula da assembleia — Sim,
 *  Não, Abstenção). Marcada = fundo suave + contorno no acento, com `aria-pressed`;
 *  desligada mantém o rótulo legível (o motivo vai em texto ao lado, não aqui). */
export const ChoiceButton: React.FC<BtnProps & { selected?: boolean }> = ({ children, selected = false, className = '', ...rest }) => (
    <button
        type="button"
        aria-pressed={selected}
        {...rest}
        className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] border text-[13px] transition-all disabled:cursor-not-allowed ${
            selected
                ? 'border-[#E1553C] bg-[#FDEDE8] text-[#C24428] font-semibold'
                : 'border-[#ECECEF] bg-white text-[#1F2430] font-medium enabled:hover:border-[#E1553C] enabled:hover:bg-[#FDEDE8]/40 disabled:bg-gray-50'
        } ${className}`}
    >
        {children}
    </button>
);

/** Ação em texto dentro de uma linha de tabela (ex.: "Recibo Nº 000001"). Não
 *  aumenta a altura da linha como os botões h-9; cor do acento do portal. */
export const TextLinkButton: React.FC<BtnProps> = ({ children, className = '', ...rest }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-[#C24428] hover:text-[#E1553C] transition-colors disabled:opacity-50 disabled:cursor-wait ${className}`}
    >
        {children}
    </button>
);

// ── Tabela ────────────────────────────────────────────────────────────────────
/** Cabeçalho em caixa alta — §24 (exceção ao §6.2). */
export const Th: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className = '', children }) => (
    <th className={`px-5 py-3 text-left text-[11px] font-medium text-[#A0A4AD] uppercase tracking-[0.08em] whitespace-nowrap ${className}`}>
        {children}
    </th>
);

export const Td: React.FC<{ className?: string; colSpan?: number; children?: React.ReactNode }> = ({ className = '', colSpan, children }) => (
    <td colSpan={colSpan} className={`px-5 py-2.5 text-sm text-[#4A505C] align-middle ${className}`}>
        {children}
    </td>
);

/** Bloco rótulo/valor usado dentro da linha expandida. */
export const DetailField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
        <span className="text-[13px] text-[#8A8F9A] whitespace-nowrap">{label}</span>
        <span className="text-[13px] text-[#1F2430] text-right">{children}</span>
    </div>
);

// ── Estados ───────────────────────────────────────────────────────────────────
export const PortalEmpty: React.FC<{ icon?: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
    <div className="text-center py-12 px-6">
        {icon && <div className="flex justify-center text-gray-200 mb-3">{icon}</div>}
        <p className="text-sm font-semibold text-[#4A505C]">{title}</p>
        {subtitle && <p className="text-[13px] text-gray-400 mt-1">{subtitle}</p>}
    </div>
);

export const PortalLoading: React.FC<{ label?: string }> = ({ label = 'Carregando...' }) => (
    <div className="text-center py-12">
        <div className="w-6 h-6 border-2 border-[#E1553C] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[13px] text-gray-400 mt-3">{label}</p>
    </div>
);

/** Título de seção dentro de um card (linha de topo com ações à direita). */
export const CardHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1F2430] tracking-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
);
