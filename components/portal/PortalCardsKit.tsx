import React from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Clock, XCircle } from 'lucide-react';

/**
 * Vocabulário "cartões" dos PORTAIS EXTERNOS — o desenho da aba Comissões do
 * Portal do Corretor (`components/broker/BrokerCommissions.tsx`), extraído para
 * cá em 2026-10-17 quando o usuário pediu o mesmo desenho na aba Financeiro do
 * Portal do Parceiro ("Compare com o portal do corretor … Aplique o mesmo
 * Design"). As classes são as que as Comissões já usavam, copiadas literalmente
 * — o corretor não muda nada na tela.
 *
 * ⚠️ Exceção ao `docs/ui_ux_guia_unificado.md`, registrada no §24: cards KPI com
 * barra contínua (não `KpiCard`/`SegmentedProgress`), badge com fundo e caixa
 * alta (não o §8), `font-black` e escala `rounded-2xl`/`rounded-xl` (não a §16).
 * Vale SÓ para Corretor › Comissões e Parceiro › Financeiro. Nenhuma tela
 * interna do app usa este arquivo — e tela de portal não reescreve estas
 * classes à mão: se precisar de um elemento novo, ele nasce aqui.
 *
 * Cada tom está escrito por extenso: o JIT do Tailwind não enxerga classe
 * montada em runtime (`bg-${tom}-500` não gera CSS).
 */

// ── Formatação ────────────────────────────────────────────────────────────────
export const moedaBR = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' sem passar por Date (new Date lê como UTC e volta um dia). */
export const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

// ── KPI com barra de progresso ────────────────────────────────────────────────
export type TomCartao = 'gray' | 'blue' | 'emerald' | 'red';

const TONS_KPI: Record<TomCartao, { borda: string; rotulo: string; valor: string; bolha: string; icone: string; trilho: string; barra: string }> = {
    gray:    { borda: 'border-gray-100',    rotulo: 'text-gray-400',    valor: 'text-gray-900',    bolha: 'bg-gray-50',    icone: 'text-gray-400',    trilho: 'bg-gray-100',    barra: 'bg-gray-400' },
    blue:    { borda: 'border-blue-100',    rotulo: 'text-blue-400',    valor: 'text-blue-700',    bolha: 'bg-blue-50',    icone: 'text-blue-500',    trilho: 'bg-blue-100',    barra: 'bg-blue-500' },
    emerald: { borda: 'border-emerald-100', rotulo: 'text-emerald-400', valor: 'text-emerald-700', bolha: 'bg-emerald-50', icone: 'text-emerald-500', trilho: 'bg-emerald-100', barra: 'bg-emerald-500' },
    red:     { borda: 'border-red-100',     rotulo: 'text-red-400',     valor: 'text-red-700',     bolha: 'bg-red-50',     icone: 'text-red-500',     trilho: 'bg-red-100',     barra: 'bg-red-500' },
};

/** Percentual da barra a partir de parte/total, preso entre 0 e 100. */
export const percentual = (parte: number, total: number) =>
    total > 0 ? Math.max(0, Math.min(100, (parte / total) * 100)) : 0;

export const KpiProgressCard: React.FC<{
    label: string;
    value: React.ReactNode;
    icon: React.ElementType;
    tone: TomCartao;
    /** 0–100. */
    percent: number;
}> = ({ label, value, icon: Icon, tone, percent }) => {
    const t = TONS_KPI[tone];
    return (
        <div className={`bg-white rounded-2xl border ${t.borda} p-6 shadow-sm`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className={`text-xs font-black ${t.rotulo} uppercase tracking-[0.2em]`}>{label}</p>
                    <p className={`text-2xl font-black ${t.valor} mt-1`}>{value}</p>
                </div>
                <div className={`p-4 ${t.bolha} rounded-2xl`}><Icon className={`w-6 h-6 ${t.icone}`} /></div>
            </div>
            <div className={`mt-3 ${t.trilho} rounded-full h-2`}>
                <div className={`${t.barra} rounded-full h-2 transition-all`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
            </div>
        </div>
    );
};

// ── Situação: badge e chip ────────────────────────────────────────────────────
export interface SituacaoVisual {
    label: string;
    /** Classe de cor do texto, por extenso (ex.: `text-blue-600`). */
    color: string;
    /** Classe de fundo, por extenso (ex.: `bg-blue-50`). */
    bg: string;
    icon: React.ElementType;
}

export const StatusBadge: React.FC<{ situacao: SituacaoVisual }> = ({ situacao: { label, color, bg, icon: Icon } }) => (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${bg} ${color}`}>
        <Icon className="w-3 h-3" />{label}
    </span>
);

export interface ChipDeFiltro<T extends string> extends SituacaoVisual {
    id: T;
    count: number;
}

const CHIP_INATIVO = 'bg-white text-gray-500 border-gray-200 hover:border-gray-400';

/** "Todas (n)" escuro + um chip por situação, com ícone e contagem. */
export function FilterChips<T extends string>({ total, chips, active, onChange, compacto = false }: {
    total: number;
    chips: ChipDeFiltro<T>[];
    active: T | 'all';
    onChange: (id: T | 'all') => void;
    /** Celular: faixa rolável, chips sem quebra. */
    compacto?: boolean;
}) {
    const prefixo = compacto ? 'shrink-0 whitespace-nowrap ' : '';
    return (
        <div className={compacto ? 'flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide' : 'flex flex-wrap gap-2'}>
            <button type="button" onClick={() => onChange('all')} aria-pressed={active === 'all'}
                className={`${prefixo}px-4 py-2 rounded-xl text-button font-bold border transition-all ${active === 'all' ? 'bg-gray-900 text-white border-gray-900' : CHIP_INATIVO}`}>
                Todas ({total})
            </button>
            {chips.map(c => {
                const Icon = c.icon;
                return (
                    <button key={c.id} type="button" onClick={() => onChange(c.id)} aria-pressed={active === c.id}
                        className={`${prefixo}flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${active === c.id ? `${c.bg} ${c.color} ring-2 ring-offset-1` : CHIP_INATIVO}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {c.label} ({c.count})
                    </button>
                );
            })}
        </div>
    );
}

// ── Lista de cartões ──────────────────────────────────────────────────────────
type DivProps = React.HTMLAttributes<HTMLDivElement> & { 'data-tour'?: string };

/** O card branco que agrupa as linhas, com cabeçalho opcional e estado vazio. */
export const ExpandableList: React.FC<DivProps & {
    /** Mensagem quando não há linha nenhuma (o `children` vazio). */
    vazio?: string | null;
    titulo?: string;
    subtitulo?: React.ReactNode;
    /** Lado direito do cabeçalho (ex.: um resumo em números). */
    direita?: React.ReactNode;
}> = ({ vazio, titulo, subtitulo, direita, children, className = '', ...rest }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`} {...rest}>
        {titulo && (
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
                    {subtitulo && <p className="text-xs text-gray-400 mt-0.5">{subtitulo}</p>}
                </div>
                {direita}
            </div>
        )}
        {vazio && <p className="text-center text-sm text-gray-500 px-6 py-10">{vazio}</p>}
        <div className="divide-y divide-gray-100">{children}</div>
    </div>
);

const CabecalhoDoItem: React.FC<{
    icon: React.ElementType;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    compacto: boolean;
}> = ({ icon: Icon, title, subtitle, compacto }) => (
    <div className="flex items-center gap-4 min-w-0">
        <div className={`${compacto ? 'hidden' : 'flex'} w-10 h-10 bg-indigo-100 rounded-xl items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
    </div>
);

/** Cartão que abre: cabeçalho clicável (ícone, título, valor, badge, chevron) e o corpo cinza. */
export const ExpandableItem: React.FC<{
    icon: React.ElementType;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    value: React.ReactNode;
    badge?: React.ReactNode;
    expanded: boolean;
    onToggle: () => void;
    compacto?: boolean;
    /** Corpo do cartão aberto; `null` = nada para mostrar (o cartão só gira o chevron). */
    children?: React.ReactNode;
}> = ({ icon, title, subtitle, value, badge, expanded, onToggle, compacto = false, children }) => (
    <div>
        <button type="button" onClick={onToggle} aria-expanded={expanded}
            className={`w-full ${compacto ? 'p-4 gap-3' : 'p-5'} flex items-center justify-between hover:bg-gray-50 transition-colors text-left`}>
            <CabecalhoDoItem icon={icon} title={title} subtitle={subtitle} compacto={compacto} />
            <div className={`flex items-center shrink-0 ${compacto ? 'gap-2' : 'gap-4'}`}>
                <div className="text-right">
                    <p className="text-sm font-black text-gray-900">{value}</p>
                    {badge}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </div>
        </button>

        {expanded && children != null && (
            <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-200">
                <div className="bg-gray-50 rounded-xl p-4">{children}</div>
            </div>
        )}
    </div>
);

/** Mesma linha do `ExpandableItem`, mas fixa — para o registro que não tem o que abrir e precisa de uma ação sempre à vista. */
export const StaticItem: React.FC<{
    icon: React.ElementType;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    value: React.ReactNode;
    badge?: React.ReactNode;
    /** Ação à direita (botão/link) — fora de qualquer `<button>`. */
    acao?: React.ReactNode;
    compacto?: boolean;
}> = ({ icon, title, subtitle, value, badge, acao, compacto = false }) => (
    <div className={`w-full ${compacto ? 'p-4 gap-3' : 'p-5 gap-4'} flex flex-wrap items-center justify-between`}>
        <CabecalhoDoItem icon={icon} title={title} subtitle={subtitle} compacto={compacto} />
        <div className={`flex items-center shrink-0 ${compacto ? 'gap-2' : 'gap-4'}`}>
            <div className="text-right">
                <p className="text-sm font-black text-gray-900">{value}</p>
                {badge}
            </div>
            {acao}
        </div>
    </div>
);

// ── Corpo do cartão aberto ────────────────────────────────────────────────────
export const SecaoDoItem: React.FC<{ titulo: React.ReactNode; children: React.ReactNode }> = ({ titulo, children }) => (
    <>
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">{titulo}</h4>
        <div className="space-y-3">{children}</div>
    </>
);

export type TomMarco = 'feito' | 'atrasado' | 'pendente' | 'cancelado';

const TONS_MARCO: Record<TomMarco, { bolinha: string; icone: React.ElementType; valor: string }> = {
    feito:     { bolinha: 'bg-emerald-500', icone: CheckCircle2, valor: 'text-emerald-600' },
    atrasado:  { bolinha: 'bg-red-500',     icone: AlertCircle,  valor: 'text-red-600' },
    pendente:  { bolinha: 'bg-gray-300',    icone: Clock,        valor: 'text-gray-400' },
    cancelado: { bolinha: 'bg-gray-200',    icone: XCircle,      valor: 'text-gray-300 line-through' },
};

/** Uma linha do corpo: bolinha com ícone, nome, data e valor (+ um extra antes do valor, ex.: link do recibo). */
export const MarcoLinha: React.FC<{
    tone: TomMarco;
    name: React.ReactNode;
    date?: string | null;
    value: React.ReactNode;
    extra?: React.ReactNode;
}> = ({ tone, name, date, value, extra }) => {
    const t = TONS_MARCO[tone];
    const Icone = t.icone;
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${t.bolinha}`}>
                    <Icone className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{name}</p>
                    {date && <p className="text-xs text-gray-400">{dataBR(date)}</p>}
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {extra}
                <span className={`text-sm font-black ${t.valor}`}>{value}</span>
            </div>
        </div>
    );
};

/** Rodapé do corpo (ex.: "Total previsto"), uma linha por par rótulo/valor. */
export const RodapeDoItem: React.FC<{ linhas: { label: string; value: React.ReactNode }[] }> = ({ linhas }) => (
    <div className="mt-4 pt-3 border-t border-gray-200 space-y-1.5">
        {linhas.map(l => (
            <div key={l.label} className="flex justify-between">
                <span className="text-xs font-black text-gray-500 uppercase">{l.label}</span>
                <span className="text-sm font-black text-gray-900">{l.value}</span>
            </div>
        ))}
    </div>
);

// ── Ações ─────────────────────────────────────────────────────────────────────
/** Link de ação dentro de uma linha (ex.: "Nº 000001", "Ver nota"). */
export const LINK_DE_ACAO = 'text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50';
/** Botão secundário no formato do chip inativo (ex.: "Anexar NF"). */
export const BOTAO_SECUNDARIO = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border bg-white text-gray-600 border-gray-200 hover:border-gray-400 transition-all';

// ── Faixas de aviso ───────────────────────────────────────────────────────────
/** Faixa de uma linha (ex.: "Próximo vencimento: …"). `erro` = vermelho. */
export const FaixaAviso: React.FC<{ icon: React.ElementType; erro?: boolean; children: React.ReactNode }> = ({ icon: Icon, erro = false, children }) => (
    <div className={`rounded-2xl border shadow-sm px-5 py-3.5 flex items-start gap-3 ${erro ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${erro ? 'text-red-500' : 'text-gray-400'}`} />
        <p className={`text-sm ${erro ? 'text-red-600' : 'text-gray-600'}`}>{children}</p>
    </div>
);

/** §11 — carregando, dentro do card da lista. */
export const CarregandoLista: React.FC<{ label?: string }> = ({ label = 'Carregando...' }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto" />
        <p className="mt-2 text-sm text-gray-500">{label}</p>
    </div>
);
