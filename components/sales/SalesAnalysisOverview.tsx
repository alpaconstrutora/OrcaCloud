import React from 'react';
import {
    Percent, Handshake, TrendingUp, Tag, Wallet, Clock, AlertCircle, Target, Receipt, Ruler,
    XCircle, ChevronDown, Building2, Check, CalendarClock, DollarSign, FileText, Repeat,
} from 'lucide-react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import { KpiCard } from '../ui/KpiCard';
import SalesUnitMirror, { type SalesMirrorDestaque } from './SalesUnitMirror';
import type { SalesAnalysisScope, SaleMirrorCell, MonthBucket } from '../../lib/salesAnalysis';
import {
    moneyBRL, compactAxis, niceTicks, percent1, decimalBR, orDash, plural,
    GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, END_LABEL,
    SERIE_PRINCIPAL, SERIE_CONTEXTO, AGING_COLORS,
    ChartCard, ChartEmpty, ChartSourceState, Legend, GroupLabel,
    type AnalysisSourceState,
} from '../analysis/chartKit';

/**
 * Painel da aba Análise de Venda de Ativos — KPIs, espelho, gráficos e
 * detalhamento de UM recorte (`scope`): um empreendimento, ou a carteira
 * inteira. Espelho do `RentalAnalysisOverview`; plano
 * docs/planos/2026-10-27-vendas-aba-analise.md.
 *
 * Tudo aqui lê o `SalesAnalysisScope` que `groupSalesAnalysis` montou: o
 * componente não faz conta que possa divergir da tabela abaixo dele.
 *
 * ⚠️ "Vendida" = negociação em Contrato, Assinatura ou Concluído, ou unidade
 * `SOLD` (decisão do usuário, 27/10/2026). Proposta, Aprovação e Reserva são
 * "em negociação".
 */

/**
 * As duas leituras (decisão do usuário, 27/10/2026). Os DADOS são os mesmos;
 * muda o que sobe para a primeira dobra:
 * - `comercial`: o time de vendas — quanto vendeu, o que está em negociação,
 *   a velocidade e o desconto;
 * - `financeiro`: a diretoria — VGV vendido, o que falta receber, o atraso e
 *   o VGV que ainda está na prateleira.
 */
export type SalesAnalysisLeitura = 'comercial' | 'financeiro';

export type SalesAnalysisDestino = 'imoveis' | 'contas-a-receber';

/** Insumo da aba que vem de consulta própria: contratos de venda + parcelas. */
export interface SalesAnalysisSources {
    contracts: AnalysisSourceState;
}

/**
 * Limiares de cor (guia §4.5) — hipóteses de gestão, num lugar só e com nome.
 * - vencido > 90 dias: qualquer valor acima de zero é alerta — a mesma regra
 *   que o usuário decidiu para Locações (26/10/2026).
 * Desconto e velocidade NÃO têm limiar: sem uma meta escrita, ficam neutros
 * ("não pintar tom por gosto", §4.5).
 */
const LIMIAR = {
    vencido90Alerta: 0,
} as const;

/** Até quantos meses com venda a série vira lista (guia §28.5). */
const POUCOS_MESES = 2;

/** Status da unidade — paleta validada em 27/10/2026 (trio cromático PASS,
 *  ΔE 7,9 protan como em Locações: a legenda com números é a codificação
 *  secundária). Vendida em azul, não no vermelho do texto "Vendido" da tabela:
 *  num gráfico o vermelho lê como alarme. */
const STATUS_COLORS = {
    sold: '#2563eb',
    reserved: '#d97706',
    available: '#059669',
    exchanged: '#94a3b8',
    other: '#cbd5e1',
} as const;

/** Desconto com sinal e vírgula: "−4,1%" / "+2,0%". */
const variacaoPct = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${decimalBR(Math.abs(v) * 100, 1)}%`;

// ─────────────────────────────────────────────────────────────────────────────
// Gráficos
// ─────────────────────────────────────────────────────────────────────────────

/** VGV vendido × VGV total por empreendimento. Só em "Todos" e com 2+ baldes. */
const VgvByEmpreendimentoChart: React.FC<{ rows: SalesAnalysisScope[]; onSelect: (id: string) => void; className?: string }> = ({ rows, onSelect, className }) => {
    const data = rows.map(r => ({ id: r.empreendimentoId, name: r.name, vendido: r.vgvSold, total: r.vgvTotal }));
    const selecionar = (d: { payload?: { id?: string } }) => d?.payload?.id && onSelect(d.payload.id);
    return (
        <ChartCard
            className={className}
            title="VGV por empreendimento"
            subtitle="Vendido (negociações com contrato) contra o VGV total (vendido + estoque a preço de tabela). Clique na barra para recortar a aba."
        >
            <Legend items={[{ label: 'Vendido', color: SERIE_PRINCIPAL }, { label: 'VGV total', color: SERIE_CONTEXTO }]} />
            <div
                style={{ height: Math.max(150, rows.length * 44 + 16) }}
                role="img"
                aria-label={`VGV vendido e total de ${rows.length} empreendimentos. ${rows.map(r => `${r.name}: ${moneyBRL(r.vgvSold)} de ${moneyBRL(r.vgvTotal)}`).join('; ')}.`}
            >
                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                    <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }} barGap={2} barCategoryGap={12}>
                        <CartesianGrid horizontal={false} stroke={GRID} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={170} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                        <RechartsTooltip
                            cursor={TOOLTIP_CURSOR}
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(val, name) => [moneyBRL(Number(val)), name === 'vendido' ? 'Vendido' : 'VGV total']}
                        />
                        <Bar dataKey="vendido" fill={SERIE_PRINCIPAL} radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={selecionar}
                            label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }} />
                        <Bar dataKey="total" fill={SERIE_CONTEXTO} radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={selecionar} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    );
};

/** O funil real das negociações — etapas abertas em cinza (contexto), as que
 *  já são venda em azul. A cancelada fica fora (vai no detalhamento). */
const FunnelChart: React.FC<{ scope: SalesAnalysisScope }> = ({ scope }) => {
    const VENDIDAS = new Set(['CONTRATO', 'ASSINATURA', 'COMPLETED']);
    const data = scope.funnel.map(e => ({ ...e, vendida: VENDIDAS.has(e.status) }));
    const total = data.reduce((a, e) => a + e.count, 0);
    return (
        <ChartCard title="Negociações por etapa" subtitle="Valor das negociações ativas em cada etapa, de Proposta a Concluído.">
            {total === 0 ? (
                <ChartEmpty>Nenhuma negociação ativa neste recorte.</ChartEmpty>
            ) : (
                <>
                    <Legend items={[{ label: 'Em negociação', color: SERIE_CONTEXTO }, { label: 'Vendida (com contrato)', color: SERIE_PRINCIPAL }]} />
                    <div
                        style={{ height: data.length * 32 + 8 }}
                        role="img"
                        aria-label={`Negociações por etapa: ${data.map(e => `${e.label}, ${plural(e.count, 'negociação', 'negociações')}, ${moneyBRL(e.value)}`).join('; ')}.`}
                    >
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }}>
                                <CartesianGrid horizontal={false} stroke={GRID} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="label" width={88} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                                <RechartsTooltip
                                    cursor={TOOLTIP_CURSOR}
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val, _n, item) => [`${moneyBRL(Number(val))} · ${plural((item as { payload: { count: number } }).payload.count, 'negociação', 'negociações')}`, 'Valor']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}
                                    label={{ ...END_LABEL, formatter: (v: unknown) => (Number(v) > 0 ? moneyBRL(Number(v)) : '') }}>
                                    {data.map(e => <Cell key={e.status} fill={e.vendida ? SERIE_PRINCIPAL : SERIE_CONTEXTO} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Em negociação</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.openDealsCount, 'negociação', 'negociações')}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Vendidas</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.soldDealsCount, 'negociação', 'negociações')}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Distratos</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{scope.cancelledCount}</p>
                        </div>
                    </div>
                </>
            )}
        </ChartCard>
    );
};

/** Tooltip de série mensal: o valor lidera, a contagem contextualiza. */
const MonthTooltip: React.FC<{ active?: boolean; payload?: { payload: MonthBucket }[]; um: string; muitos: string }> = ({ active, payload, um, muitos }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return (
        <div style={TOOLTIP_STYLE} className="px-3 py-2">
            <p className="text-gray-500">{p.label}</p>
            <p className="font-medium text-gray-800">{moneyBRL(p.value)}</p>
            <p className="text-gray-500">{plural(p.count, um, muitos)}</p>
        </div>
    );
};

/** Colunas por mês, todos os meses presentes; com 1–2 meses preenchidos vira
 *  lista (§28.5). Serve às vendas (passado) e aos recebimentos (futuro). */
const MonthColumns: React.FC<{ months: MonthBucket[]; um: string; muitos: string; ariaPrefixo: string; vazio: string }> = ({ months, um, muitos, ariaPrefixo, vazio }) => {
    const comValor = months.filter(m => m.count > 0);
    if (comValor.length === 0) return <ChartEmpty>{vazio}</ChartEmpty>;
    if (comValor.length <= POUCOS_MESES) {
        return (
            <ul className="flex flex-col divide-y divide-gray-100">
                {comValor.map(m => (
                    <li key={m.month} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="text-gray-700">{m.label}</span>
                        <span className="text-gray-500">{plural(m.count, um, muitos)}</span>
                        <span className="font-medium text-gray-800 tabular-nums">{moneyBRL(m.value)}</span>
                    </li>
                ))}
            </ul>
        );
    }
    const yTicks = niceTicks(Math.max(...months.map(m => m.value)));
    return (
        <div
            style={{ height: 200 }}
            role="img"
            aria-label={`${ariaPrefixo}: ${comValor.map(m => `${m.label}, ${plural(m.count, um, muitos)}, ${moneyBRL(m.value)}`).join('; ')}.`}
        >
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                <BarChart accessibilityLayer={false} data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={TICK} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} tickFormatter={compactAxis} width={48}
                        ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
                    <RechartsTooltip cursor={TOOLTIP_CURSOR} content={<MonthTooltip um={um} muitos={muitos} />} />
                    <Bar dataKey="value" fill={SERIE_PRINCIPAL} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

/** Vendas por mês, últimos 12 meses — a velocidade que o "% vendido" não mostra. */
const SalesByMonthChart: React.FC<{ scope: SalesAnalysisScope }> = ({ scope }) => (
    <ChartCard title="Vendas por mês — últimos 12 meses" subtitle="Valor das negociações com contrato, pela data da negociação.">
        <MonthColumns months={scope.salesByMonth} um="venda" muitos="vendas" ariaPrefixo="Vendas por mês"
            vazio="Nenhuma venda com data nos últimos 12 meses neste recorte." />
        <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Em 90 dias</p>
                <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.sales90.count, 'venda', 'vendas')}</p>
                <p className="text-xs text-gray-500 truncate">{moneyBRL(scope.sales90.value)}</p>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Em 12 meses</p>
                <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.salesByMonth.reduce((a, m) => a + m.count, 0), 'venda', 'vendas')}</p>
                <p className="text-xs text-gray-500 truncate">{moneyBRL(scope.salesByMonth.reduce((a, m) => a + m.value, 0))}</p>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Ticket médio</p>
                <p className="text-sm font-medium text-gray-800 truncate">{orDash(scope.ticket, moneyBRL)}</p>
            </div>
        </div>
    </ChartCard>
);

/** Composição das unidades por status — o "onde está o resto" do % vendido. */
const UnitStatusChart: React.FC<{ scope: SalesAnalysisScope }> = ({ scope }) => {
    const us = scope.unitStatus;
    const fatias = [
        { key: 'sold', label: 'Vendidas', value: us.sold, color: STATUS_COLORS.sold },
        { key: 'reserved', label: 'Em negociação', value: us.reserved, color: STATUS_COLORS.reserved },
        { key: 'available', label: 'Disponíveis', value: us.available, color: STATUS_COLORS.available },
        { key: 'exchanged', label: 'Permutadas', value: us.exchanged, color: STATUS_COLORS.exchanged },
        { key: 'other', label: 'Outros status', value: us.other, color: STATUS_COLORS.other },
    ].filter(f => f.value > 0);
    return (
        <ChartCard title="Composição das unidades" subtitle="Unidades do recorte pelo status de venda; permutadas ficam fora do % vendido.">
            {us.total === 0 ? (
                <ChartEmpty>Nenhuma unidade neste recorte.</ChartEmpty>
            ) : (
                <div className="flex items-center gap-6">
                    <div className="relative w-44 h-44 shrink-0" role="img" aria-label={`Vendido ${orDash(scope.soldRate, percent1)} das unidades vendáveis`}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <PieChart accessibilityLayer={false}>
                                <Pie data={fatias} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={78}
                                    paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                                    {fatias.map(f => <Cell key={f.key} fill={f.color} />)}
                                </Pie>
                                <RechartsTooltip contentStyle={TOOLTIP_STYLE}
                                    formatter={(val, name) => [plural(Number(val), 'unidade', 'unidades'), String(name)]} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-gray-900 leading-none">
                                {orDash(scope.soldRate, v => `${Math.round(v * 100)}%`)}
                            </span>
                            <span className="text-xs text-gray-500 mt-1">vendido</span>
                        </div>
                    </div>
                    <ul className="flex-1 min-w-0 space-y-1.5">
                        {fatias.map(f => (
                            <li key={f.key} className="flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: f.color }} />
                                <span className="text-gray-600 truncate flex-1">{f.label}</span>
                                <span className="font-medium text-gray-800 tabular-nums">{f.value}</span>
                                <span className="text-gray-500 tabular-nums w-11 text-right">{Math.round((f.value / us.total) * 100)}%</span>
                            </li>
                        ))}
                        <li className="flex items-center gap-2 text-sm pt-1.5 border-t border-gray-100">
                            <span className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-gray-500 flex-1">Total</span>
                            <span className="font-medium text-gray-800 tabular-nums">{us.total}</span>
                            <span className="w-11" />
                        </li>
                    </ul>
                </div>
            )}
        </ChartCard>
    );
};

/** Parcelas das vendas em aberto, pela idade do vencimento. */
const AgingChart: React.FC<{ scope: SalesAnalysisScope; state: AnalysisSourceState; onRetry: () => void; onFaixa?: (i: number) => void }> = ({ scope, state, onRetry, onFaixa }) => {
    const ag = scope.aging;
    const data = ag
        ? [
            { label: 'A vencer', value: ag.notDue },
            { label: '1–30 dias', value: ag.late1_30 },
            { label: '31–60 dias', value: ag.late31_60 },
            { label: '61–90 dias', value: ag.late61_90 },
            { label: '> 90 dias', value: ag.over90 },
        ]
        : [];
    const overdueRate = ag && ag.billed > 0 ? ag.totalOverdue / ag.billed : null;
    return (
        <ChartCard title="Parcelas em aberto por atraso" subtitle="Parcelas dos contratos de venda lançadas e ainda não baixadas, pela idade do vencimento.">
            {state !== 'ready' && !ag ? (
                <ChartSourceState state={state} onRetry={onRetry} what="as parcelas" />
            ) : !ag ? (
                <ChartEmpty>Contratos de venda indisponíveis para este recorte.</ChartEmpty>
            ) : ag.billed === 0 ? (
                <ChartEmpty>Nenhuma parcela de venda lançada neste recorte.</ChartEmpty>
            ) : (
                <>
                    <div style={{ height: data.length * 32 + 8 }} role="img"
                        aria-label={`Parcelas em aberto por atraso: ${data.map(d => `${d.label}, ${moneyBRL(d.value)}`).join('; ')}.`}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }}>
                                <CartesianGrid horizontal={false} stroke={GRID} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="label" width={88} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                                <RechartsTooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(val) => [moneyBRL(Number(val)), 'Em aberto']} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}
                                    label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }}
                                    cursor={onFaixa ? 'pointer' : undefined}
                                    onClick={onFaixa ? (_: unknown, i: number) => onFaixa(i) : undefined}>
                                    {data.map((d, i) => <Cell key={d.label} fill={AGING_COLORS[i]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Vencido</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.totalOverdue)}</p>
                            {overdueRate != null && <p className="text-xs text-gray-500 truncate">{percent1(overdueRate)} do lançado</p>}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Em aberto</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.totalOpen)}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Recebido</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.received)}</p>
                        </div>
                    </div>
                    {ag.withoutDueDate > 0 && (
                        <p className="text-xs text-gray-600 mt-2">
                            {plural(ag.withoutDueDate, 'parcela em aberto está', 'parcelas em aberto estão')} sem data de vencimento
                            e {ag.withoutDueDate === 1 ? 'conta' : 'contam'} como “a vencer”.
                        </p>
                    )}
                </>
            )}
        </ChartCard>
    );
};

/** Quanto entra, mês a mês, nos próximos 12 meses — se as parcelas forem pagas. */
const ReceivableScheduleChart: React.FC<{ scope: SalesAnalysisScope; state: AnalysisSourceState; onRetry: () => void }> = ({ scope, state, onRetry }) => {
    const sc = scope.schedule;
    return (
        <ChartCard title="Recebimentos previstos — próximos 12 meses" subtitle="Parcelas de venda em aberto que vencem em cada mês. As já vencidas estão no gráfico de atraso.">
            {state !== 'ready' && !sc ? (
                <ChartSourceState state={state} onRetry={onRetry} what="as parcelas" />
            ) : !sc ? (
                <ChartEmpty>Contratos de venda indisponíveis para este recorte.</ChartEmpty>
            ) : (
                <>
                    <MonthColumns months={sc.months} um="parcela" muitos="parcelas" ariaPrefixo="Recebimentos previstos por mês"
                        vazio="Nenhuma parcela a vencer nos próximos 12 meses neste recorte." />
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        {[
                            { rotulo: 'Em 30 dias', b: sc.within30 },
                            { rotulo: 'Em 90 dias', b: sc.within90 },
                            { rotulo: 'Em 12 meses', b: sc.within365 },
                        ].map(({ rotulo, b }) => (
                            <div key={rotulo} className="min-w-0">
                                <p className="text-xs text-gray-500 truncate">{rotulo}</p>
                                <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(b.value)}</p>
                                <p className="text-xs text-gray-500 truncate">{plural(b.count, 'parcela', 'parcelas')}</p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </ChartCard>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// O painel
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    scope: SalesAnalysisScope;
    rows: SalesAnalysisScope[];
    isAll: boolean;
    onSelectEmpreendimento: (id: string) => void;
    showDetail: boolean;
    onToggleDetail: () => void;
    sources: SalesAnalysisSources;
    onRetry: () => void;
    leitura: SalesAnalysisLeitura;
    onNavigate: (destino: SalesAnalysisDestino) => void;
    onOpenUnit: (cell: SaleMirrorCell) => void;
}

const SalesAnalysisOverview: React.FC<Props> = ({ scope, rows, isAll, onSelectEmpreendimento, showDetail, onToggleDetail, sources, onRetry, leitura, onNavigate, onOpenUnit }) => {
    const [destaque, setDestaque] = React.useState<SalesMirrorDestaque>('nenhum');
    const col = scope.collection;
    const ag = scope.aging;
    // Só baldes com VGV: o "Sem empreendimento" de um contrato sem negociação
    // tem parcelas mas nenhum VGV — no gráfico seria uma linha vazia (ele
    // continua na tabela, para a soma fechar).
    const linhasComVgv = rows.filter(r => r.vgvTotal > 0);
    const temComparativo = isAll && linhasComVgv.length > 1;
    const unidadesEmEstoque = scope.unitStatus.reserved + scope.unitStatus.available + scope.unitStatus.other;
    // Valor e legenda enquanto os contratos não responderam, ou se falharam.
    // Num recarregamento, o número anterior fica na tela em vez de piscar.
    const pendente = sources.contracts === 'error'
        ? { value: '—', sub: 'não carregou' }
        : sources.contracts === 'loading' && !col
            ? { value: '…', sub: 'carregando' }
            : null;

    return (
        <>
            {/* ── INDICADORES PRINCIPAIS (guia §4.5) ─────────────────────────── */}
            {leitura === 'comercial' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                    <KpiCard destaque label="Unidades vendidas" icon={<Percent />}
                        value={orDash(scope.soldRate, percent1)}
                        sub={`${scope.soldCount} de ${plural(scope.sellableCount, 'unidade vendável', 'unidades vendáveis')}`} />
                    <KpiCard destaque label="Em negociação" icon={<Handshake />}
                        value={moneyBRL(scope.openDealsValue)}
                        sub={plural(scope.openDealsCount, 'negociação aberta (Proposta a Reserva)', 'negociações abertas (Proposta a Reserva)')} />
                    <KpiCard destaque label="Vendas nos últimos 90 dias" icon={<TrendingUp />}
                        value={scope.sales90.count}
                        sub={`${moneyBRL(scope.sales90.value)} · pela data da negociação`} />
                    <KpiCard destaque label="Desconto médio sobre a tabela" icon={<Tag />}
                        value={orDash(scope.discount.rate, variacaoPct)}
                        sub={scope.discount.count > 0 ? `em ${plural(scope.discount.count, 'venda', 'vendas')} com preço de tabela` : 'nenhuma venda com preço de tabela'} />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                    {/* Vendido contra o total no MESMO card: a distância entre os
                        dois é a pergunta da diretoria. */}
                    <KpiCard destaque label="VGV vendido" icon={<Wallet />}
                        value={moneyBRL(scope.vgvSold)}
                        sub={`${orDash(scope.vgvSoldRate, percent1)} de ${moneyBRL(scope.vgvTotal)} de VGV total`} />
                    <KpiCard destaque label="A receber" icon={<Clock />}
                        value={pendente?.value ?? (ag ? moneyBRL(ag.totalOpen) : '—')}
                        sub={pendente?.sub ?? (ag ? `${moneyBRL(ag.received)} já recebido` : 'contratos indisponíveis')} />
                    <KpiCard destaque label="Vencido há mais de 90 dias" icon={<AlertCircle />}
                        value={pendente?.value ?? (col ? moneyBRL(col.overdue90) : '—')}
                        sub={pendente?.sub ?? (col ? (col.overdue90Rate != null ? `${percent1(col.overdue90Rate)} do lançado` : 'nada lançado') : undefined)}
                        tom={col && col.overdue90 > LIMIAR.vencido90Alerta ? 'alerta' : 'neutro'}
                        acao={col && col.overdue90 > 0 ? { label: 'Cobrar em Contas a Receber', onClick: () => onNavigate('contas-a-receber') } : undefined} />
                    <KpiCard destaque label="VGV a vender" icon={<Target />}
                        value={moneyBRL(scope.vgvUnsold)}
                        sub={`${plural(unidadesEmEstoque, 'unidade', 'unidades')} a preço de tabela`}
                        acao={scope.unitStatus.available > 0 ? { label: 'Ver imóveis disponíveis', onClick: () => onNavigate('imoveis') } : undefined} />
                </div>
            )}

            {/* Faixa secundária — neutra (§4.5). */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {leitura === 'comercial' ? (
                    <>
                        <KpiCard size="sm" color="gray" label="VGV a vender" value={moneyBRL(scope.vgvUnsold)} sub={`${plural(unidadesEmEstoque, 'unidade', 'unidades')} em estoque`} icon={<Target />} />
                        <KpiCard size="sm" color="gray" label="Ticket médio" value={orDash(scope.ticket, moneyBRL)} sub={scope.soldDealsCount > 0 ? plural(scope.soldDealsCount, 'venda', 'vendas') : undefined} icon={<Receipt />} />
                        <KpiCard size="sm" color="gray" label="Valor médio vendido /m²" value={orDash(scope.valuePerSqm.avg, moneyBRL)} sub={scope.valuePerSqm.count > 0 ? `em ${plural(scope.valuePerSqm.count, 'venda', 'vendas')} com área` : undefined} icon={<Ruler />} />
                        <KpiCard size="sm" color="gray" label="Distratos" value={scope.cancelledCount} sub="negociações canceladas" icon={<XCircle />} />
                    </>
                ) : (
                    <>
                        <KpiCard size="sm" color="gray" label="Ticket médio" value={orDash(scope.ticket, moneyBRL)} sub={scope.soldDealsCount > 0 ? plural(scope.soldDealsCount, 'venda', 'vendas') : undefined} icon={<Receipt />} />
                        <KpiCard size="sm" color="gray" label="Recebido" value={pendente?.value ?? (ag ? moneyBRL(ag.received) : '—')} sub={pendente?.sub ?? (col?.collectionRate != null ? `${percent1(col.collectionRate)} do lançado` : undefined)} icon={<Check />} />
                        <KpiCard size="sm" color="gray" label="Recebimentos em 90 dias" value={pendente?.value ?? (scope.schedule ? moneyBRL(scope.schedule.within90.value) : '—')} sub={pendente?.sub ?? (scope.schedule ? plural(scope.schedule.within90.count, 'parcela a vencer', 'parcelas a vencer') : undefined)} icon={<CalendarClock />} />
                        <KpiCard size="sm" color="gray" label="Desconto médio" value={orDash(scope.discount.rate, variacaoPct)} sub="sobre a tabela" icon={<Tag />} />
                    </>
                )}
            </div>

            {sources.contracts === 'error' && (
                <p role="alert" className="text-sm text-red-700 -mt-1 mb-3">
                    Não foi possível carregar os contratos e as parcelas das vendas. Os indicadores
                    que dependem disso aparecem como “não carregou”.{' '}
                    <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:text-red-900">Tentar de novo</button>
                </p>
            )}

            {/* Avisos que impedem leitura errada dos números acima — cada um só
                aparece quando o caso existe. */}
            {(scope.soldWithoutDeal > 0 || scope.unsoldWithoutPrice > 0 || scope.soldWithoutDate > 0
                || (col && col.collectionRate != null && col.collectionRate < 0.5)) && (
                <div className="space-y-1 -mt-1 mb-3">
                    {scope.soldWithoutDeal > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.soldWithoutDeal, 'unidade está marcada', 'unidades estão marcadas')} como vendida sem negociação
                            cadastrada: {scope.soldWithoutDeal === 1 ? 'conta' : 'contam'} nas <strong>unidades vendidas</strong>, mas
                            {scope.soldWithoutDeal === 1 ? ' fica' : ' ficam'} fora do VGV vendido, do ticket e do desconto — não há valor de venda para somar.
                        </p>
                    )}
                    {scope.unsoldWithoutPrice > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.unsoldWithoutPrice, 'unidade em estoque não tem', 'unidades em estoque não têm')} preço de tabela
                            e {scope.unsoldWithoutPrice === 1 ? 'fica' : 'ficam'} fora do <strong>VGV a vender</strong>.
                        </p>
                    )}
                    {col && col.collectionRate != null && col.collectionRate < 0.5 && (
                        <p className="text-xs text-gray-600">
                            Apenas {percent1(col.collectionRate)} das parcelas lançadas estão baixadas como recebidas. O atraso mede
                            {' '}<strong>conciliação no sistema</strong>, não necessariamente inadimplência do comprador.
                        </p>
                    )}
                    {scope.soldWithoutDate > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.soldWithoutDate, 'venda não tem', 'vendas não têm')} data da negociação e
                            {scope.soldWithoutDate === 1 ? ' fica' : ' ficam'} fora da velocidade de vendas.
                        </p>
                    )}
                </div>
            )}

            {/* ── ESPELHO ── a carteira como prédio: QUAIS unidades, em que andar. */}
            <SalesUnitMirror
                scope={scope}
                rows={rows}
                isAll={isAll}
                leitura={leitura}
                destaque={destaque}
                onDestaque={setDestaque}
                onSelectEmpreendimento={onSelectEmpreendimento}
                onOpenUnit={onOpenUnit}
            />

            {/* ── GRÁFICOS ── por leitura, todos sobre o MESMO `scope`. */}
            {leitura === 'comercial' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                    <FunnelChart scope={scope} />
                    <SalesByMonthChart scope={scope} />
                    <UnitStatusChart scope={scope} />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                    {temComparativo && <VgvByEmpreendimentoChart rows={linhasComVgv}onSelect={onSelectEmpreendimento} className="lg:col-span-2" />}
                    <AgingChart scope={scope} state={sources.contracts} onRetry={onRetry}
                        onFaixa={i => setDestaque(i === 0 ? 'nenhum' : i === 4 ? 'atraso90' : 'atraso')} />
                    <ReceivableScheduleChart scope={scope} state={sources.contracts} onRetry={onRetry} />
                </div>
            )}

            {/* Detalhamento — recolhido por padrão, como em Locações. */}
            <button
                onClick={onToggleDetail}
                className="flex items-center gap-1.5 h-9 px-3.5 mb-3 bg-white border border-gray-100 rounded-[10px] shadow-sm text-sm font-medium text-gray-600 hover:text-gray-900 transition-all"
            >
                <ChevronDown className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-180' : ''}`} />
                {showDetail ? 'Ocultar detalhamento' : 'Ver detalhamento'}
            </button>

            {showDetail && (
                <>
                    <div className="mb-3">
                        <GroupLabel>Estoque e VGV</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="VGV total" value={moneyBRL(scope.vgvTotal)} sub="vendido + estoque a preço de tabela" icon={<Building2 className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="VGV vendido" value={moneyBRL(scope.vgvSold)} sub={orDash(scope.vgvSoldRate, v => `${percent1(v)} do total`)} icon={<Wallet className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="VGV a vender" value={moneyBRL(scope.vgvUnsold)} icon={<Target className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Unidades disponíveis" value={scope.unitStatus.available} sub={`${scope.unitStatus.reserved} em negociação`} icon={<Building2 className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Permutadas" value={scope.unitStatus.exchanged} sub="fora da base vendável" icon={<Repeat className="w-4 h-4" />} color="gray" />
                        </div>
                    </div>

                    <div className="mb-3">
                        <GroupLabel>Preço</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Ticket médio" value={orDash(scope.ticket, moneyBRL)} icon={<Receipt className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Desconto médio" value={orDash(scope.discount.rate, variacaoPct)} sub={scope.discount.count > 0 ? `${moneyBRL(scope.discount.sale)} sobre ${moneyBRL(scope.discount.base)} de tabela` : undefined} icon={<Tag className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Valor médio vendido /m²" value={orDash(scope.valuePerSqm.avg, moneyBRL)} icon={<Ruler className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Valor máx. vendido /m²" value={orDash(scope.valuePerSqm.max, moneyBRL)} icon={<Ruler className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Valor mín. vendido /m²" value={orDash(scope.valuePerSqm.min, moneyBRL)} icon={<Ruler className="w-4 h-4" />} color="gray" />
                        </div>
                    </div>

                    <div className="mb-3">
                        <GroupLabel>Recebimentos dos contratos de venda</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Contratos de venda" value={scope.contractsCount ?? '—'} icon={<FileText className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Parcelas lançadas" value={col ? moneyBRL(col.billed) : '—'} icon={<Receipt className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Recebido" value={col ? moneyBRL(col.received) : '—'} icon={<Check className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Vencido" value={ag ? moneyBRL(ag.totalOverdue) : '—'} icon={<AlertCircle className="w-4 h-4" />} color={ag && ag.totalOverdue > 0 ? 'red' : 'gray'} />
                            <KpiCard shadow={false} size="sm" label="Taxa de arrecadação" value={orDash(col?.collectionRate, percent1)} sub="recebido ÷ lançado" icon={<DollarSign className="w-4 h-4" />} color="gray" />
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default SalesAnalysisOverview;
