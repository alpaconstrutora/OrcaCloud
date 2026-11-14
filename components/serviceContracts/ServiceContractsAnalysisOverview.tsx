import React from 'react';
import {
    Briefcase, Handshake, CalendarClock, TrendingUp, Ruler, Clock, AlertCircle, FileText, Receipt,
    Check, XCircle, ChevronDown, CalendarX, PlayCircle, Hourglass, DollarSign, Wallet,
} from 'lucide-react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import { KpiCard } from '../ui/KpiCard';
import ServiceContractTimeline, { type ServiceTimelineDestaque } from './ServiceContractTimeline';
import type { ServiceContractsScope, MonthBucket, ServiceContractSituation } from '../../lib/serviceContractAnalysis';
import { SERVICE_SITUATION_COLORS, SERVICE_SITUATION_LABELS } from '../../lib/serviceContractAnalysis';
import {
    moneyBRL, compactAxis, niceTicks, percent1, decimalBR, orDash, plural,
    GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, END_LABEL,
    SERIE_PRINCIPAL, SERIE_CONTEXTO, AGING_COLORS,
    ChartCard, ChartEmpty, Legend, GroupLabel,
} from '../analysis/chartKit';

/**
 * Painel da aba Análise de Contratos de Serviço — KPIs, linha do tempo,
 * gráficos e detalhamento de UM recorte (`scope`): um cliente, ou a carteira
 * inteira. Aos moldes de `components/sales/SalesAnalysisOverview.tsx`; plano
 * docs/planos/2026-11-13-contratos-servico-aba-analise.md.
 *
 * Tudo aqui lê o `ServiceContractsScope` que `groupServiceContractsAnalysis`
 * montou: o componente não faz conta que possa divergir da tabela abaixo dele.
 *
 * ⚠️ "Contratado" = Aprovado, Assinado, Ativo, Suspenso, Concluído ou Encerrado
 * (decisão do usuário, 13/11/2026). Rascunho, Minuta, Revisão e Enviado são
 * "em negociação".
 */

/**
 * As duas leituras — os DADOS são os mesmos; muda o que sobe à primeira dobra:
 * - `comercial`: a carteira — quanto está contratado, o que está em
 *   negociação, o que vence e quanto os aditivos mexeram;
 * - `financeiro`: o dinheiro — quanto foi medido, o que falta receber, o
 *   atraso e o que ainda nem virou parcela.
 */
export type ServiceAnalysisLeitura = 'comercial' | 'financeiro';

export type ServiceAnalysisDestino = 'contratos' | 'contas-a-receber';

/**
 * Limiares de cor (guia §4.5) — hipóteses de gestão, num lugar só e com nome.
 * - vencido > 90 dias: qualquer valor acima de zero é alerta — a mesma regra de
 *   Locações e Venda de Ativos.
 * Vencimento de vigência e variação NÃO têm limiar: sem meta escrita, neutros.
 */
const LIMIAR = {
    vencido90Alerta: 0,
} as const;

/** Até quantos meses preenchidos a série vira lista (guia §28.5). */
const POUCOS_MESES = 2;

/** Variação com sinal e vírgula: "+20,0%" / "−3,1%". */
const variacaoPct = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${decimalBR(Math.abs(v) * 100, 1)}%`;
const variacaoBRL = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${moneyBRL(Math.abs(v))}`;

// ─────────────────────────────────────────────────────────────────────────────
// Gráficos
// ─────────────────────────────────────────────────────────────────────────────

/** Contratos por status, na ordem do ciclo de vida. Contratado em azul, o resto em cinza. */
const StatusChart: React.FC<{ scope: ServiceContractsScope }> = ({ scope }) => {
    const data = scope.byStatus;
    return (
        <ChartCard title="Contratos por status" subtitle="Valor dos contratos em cada status, do rascunho ao encerramento.">
            {data.length === 0 ? (
                <ChartEmpty>Nenhum contrato neste recorte.</ChartEmpty>
            ) : (
                <>
                    <Legend items={[{ label: 'Em negociação ou cancelado', color: SERIE_CONTEXTO }, { label: 'Contratado (Aprovado em diante)', color: SERIE_PRINCIPAL }]} />
                    <div
                        style={{ height: data.length * 32 + 8 }}
                        role="img"
                        aria-label={`Contratos por status: ${data.map(e => `${e.label}, ${plural(e.count, 'contrato', 'contratos')}, ${moneyBRL(e.value)}`).join('; ')}.`}
                    >
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }}>
                                <CartesianGrid horizontal={false} stroke={GRID} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="label" width={96} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                                <RechartsTooltip
                                    cursor={TOOLTIP_CURSOR}
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val, _n, item) => [`${moneyBRL(Number(val))} · ${plural((item as { payload: { count: number } }).payload.count, 'contrato', 'contratos')}`, 'Valor']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}
                                    label={{ ...END_LABEL, formatter: (v: unknown) => (Number(v) > 0 ? moneyBRL(Number(v)) : '') }}>
                                    {data.map(e => <Cell key={e.status} fill={e.stage === 'contracted' ? SERIE_PRINCIPAL : SERIE_CONTEXTO} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Contratados</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.contractedCount, 'contrato', 'contratos')}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Em negociação</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.negotiationCount, 'contrato', 'contratos')}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">Cancelados</p>
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

/** Colunas por mês, todos presentes; com 1–2 meses preenchidos vira lista (§28.5). */
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

/** Contratados por mês de início, últimos 12 meses. */
const StartedByMonthChart: React.FC<{ scope: ServiceContractsScope }> = ({ scope }) => (
    <ChartCard title="Contratos iniciados — últimos 12 meses" subtitle="Valor dos contratos de Aprovado em diante, pelo mês de início da vigência.">
        <MonthColumns months={scope.startedByMonth} um="contrato" muitos="contratos" ariaPrefixo="Contratos iniciados por mês"
            vazio="Nenhum contrato contratado com início nos últimos 12 meses neste recorte." />
        <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Em 90 dias</p>
                <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.started90.count, 'contrato', 'contratos')}</p>
                <p className="text-xs text-gray-500 truncate">{moneyBRL(scope.started90.value)}</p>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Em 12 meses</p>
                <p className="text-sm font-medium text-gray-800 truncate">{plural(scope.startedByMonth.reduce((a, m) => a + m.count, 0), 'contrato', 'contratos')}</p>
                <p className="text-xs text-gray-500 truncate">{moneyBRL(scope.startedByMonth.reduce((a, m) => a + m.value, 0))}</p>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">Ticket médio</p>
                <p className="text-sm font-medium text-gray-800 truncate">{orDash(scope.ticket, moneyBRL)}</p>
            </div>
        </div>
    </ChartCard>
);

/** Composição da carteira pela situação — donut com a legenda em números (§28.3). */
const SituationChart: React.FC<{ scope: ServiceContractsScope }> = ({ scope }) => {
    const fatias = (Object.keys(SERVICE_SITUATION_LABELS) as ServiceContractSituation[])
        .map(s => ({ key: s, label: SERVICE_SITUATION_LABELS[s], value: scope.bySituation[s].count, valor: scope.bySituation[s].value, color: SERVICE_SITUATION_COLORS[s] }))
        .filter(f => f.value > 0);
    const total = scope.contractsCount;
    return (
        <ChartCard title="Composição da carteira" subtitle="Contratos do recorte pela situação: vigente, em negociação, encerrado ou cancelado.">
            {total === 0 ? (
                <ChartEmpty>Nenhum contrato neste recorte.</ChartEmpty>
            ) : (
                <div className="flex items-center gap-6">
                    <div className="relative w-44 h-44 shrink-0" role="img" aria-label={`${plural(scope.active.count, 'contrato vigente', 'contratos vigentes')} de ${plural(total, 'contrato', 'contratos')}`}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <PieChart accessibilityLayer={false}>
                                <Pie data={fatias} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={78}
                                    paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                                    {fatias.map(f => <Cell key={f.key} fill={f.color} />)}
                                </Pie>
                                <RechartsTooltip contentStyle={TOOLTIP_STYLE}
                                    formatter={(val, name) => [plural(Number(val), 'contrato', 'contratos'), String(name)]} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-gray-900 leading-none">{scope.active.count}</span>
                            <span className="text-xs text-gray-500 mt-1">{scope.active.count === 1 ? 'vigente' : 'vigentes'}</span>
                        </div>
                    </div>
                    <ul className="flex-1 min-w-0 space-y-1.5">
                        {fatias.map(f => (
                            <li key={f.key} className="flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: f.color }} />
                                <span className="text-gray-600 truncate flex-1" title={moneyBRL(f.valor)}>{f.label}</span>
                                <span className="font-medium text-gray-800 tabular-nums">{f.value}</span>
                                <span className="text-gray-500 tabular-nums w-11 text-right">{Math.round((f.value / total) * 100)}%</span>
                            </li>
                        ))}
                        <li className="flex items-center gap-2 text-sm pt-1.5 border-t border-gray-100">
                            <span className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-gray-500 flex-1">Total</span>
                            <span className="font-medium text-gray-800 tabular-nums">{total}</span>
                            <span className="w-11" />
                        </li>
                    </ul>
                </div>
            )}
        </ChartCard>
    );
};

/** Recebido × lançado por cliente. Só em "Todos" e com 2+ clientes com parcela. */
const CollectionByClientChart: React.FC<{ rows: ServiceContractsScope[]; onSelect: (id: string) => void; className?: string }> = ({ rows, onSelect, className }) => {
    const data = rows.map(r => ({ id: r.clientId, name: r.name, recebido: r.aging?.received ?? 0, lancado: r.aging?.billed ?? 0 }));
    const selecionar = (d: { payload?: { id?: string } }) => d?.payload?.id && onSelect(d.payload.id);
    return (
        <ChartCard
            className={className}
            title="Recebido por cliente"
            subtitle="Parcelas baixadas como recebidas contra o total lançado em parcelas. Clique na barra para recortar a aba."
        >
            <Legend items={[{ label: 'Recebido', color: SERIE_PRINCIPAL }, { label: 'Lançado', color: SERIE_CONTEXTO }]} />
            <div
                style={{ height: Math.max(150, rows.length * 44 + 16) }}
                role="img"
                aria-label={`Recebido e lançado de ${rows.length} clientes. ${rows.map(r => `${r.name}: ${moneyBRL(r.aging?.received ?? 0)} de ${moneyBRL(r.aging?.billed ?? 0)}`).join('; ')}.`}
            >
                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                    <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }} barGap={2} barCategoryGap={12}>
                        <CartesianGrid horizontal={false} stroke={GRID} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={170} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                        <RechartsTooltip
                            cursor={TOOLTIP_CURSOR}
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(val, name) => [moneyBRL(Number(val)), name === 'recebido' ? 'Recebido' : 'Lançado']}
                        />
                        <Bar dataKey="recebido" fill={SERIE_PRINCIPAL} radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={selecionar}
                            label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }} />
                        <Bar dataKey="lancado" fill={SERIE_CONTEXTO} radius={[0, 4, 4, 0]} barSize={9} cursor="pointer" onClick={selecionar} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    );
};

/** Parcelas em aberto pela idade do vencimento. */
const AgingChart: React.FC<{ scope: ServiceContractsScope; onFaixa?: (i: number) => void }> = ({ scope, onFaixa }) => {
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
        <ChartCard title="Parcelas em aberto por atraso" subtitle="Parcelas dos contratos de serviço lançadas e ainda não baixadas, pela idade do vencimento.">
            {!ag ? (
                <ChartEmpty>As parcelas dos contratos não puderam ser lidas para este recorte.</ChartEmpty>
            ) : ag.billed === 0 ? (
                <ChartEmpty>Nenhuma parcela lançada neste recorte.</ChartEmpty>
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

/** O que entra, mês a mês, nos próximos 12 meses — se as parcelas forem pagas. */
const ReceivableScheduleChart: React.FC<{ scope: ServiceContractsScope }> = ({ scope }) => {
    const sc = scope.schedule;
    return (
        <ChartCard title="Recebimentos previstos — próximos 12 meses" subtitle="Parcelas em aberto que vencem em cada mês. As já vencidas estão no gráfico de atraso.">
            {!sc ? (
                <ChartEmpty>As parcelas dos contratos não puderam ser lidas para este recorte.</ChartEmpty>
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
    scope: ServiceContractsScope;
    rows: ServiceContractsScope[];
    isAll: boolean;
    onSelectClient: (id: string) => void;
    showDetail: boolean;
    onToggleDetail: () => void;
    leitura: ServiceAnalysisLeitura;
    onNavigate: (destino: ServiceAnalysisDestino) => void;
    onOpenContract: (id: string) => void;
}

const ServiceContractsAnalysisOverview: React.FC<Props> = ({ scope, rows, isAll, onSelectClient, showDetail, onToggleDetail, leitura, onNavigate, onOpenContract }) => {
    const [destaque, setDestaque] = React.useState<ServiceTimelineDestaque>('nenhum');
    const col = scope.collection;
    const ag = scope.aging;
    const med = scope.measurement;
    const linhasComParcela = rows.filter(r => (r.aging?.billed ?? 0) > 0);
    const temComparativo = isAll && linhasComParcela.length > 1;

    return (
        <>
            {/* ── INDICADORES PRINCIPAIS (guia §4.5) ─────────────────────────── */}
            {leitura === 'comercial' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                    <KpiCard destaque label="Carteira contratada" icon={<Briefcase />}
                        value={moneyBRL(scope.contractedValue)}
                        sub={`${plural(scope.contractedCount, 'contrato', 'contratos')} de Aprovado em diante`} />
                    <KpiCard destaque label="Em negociação" icon={<Handshake />}
                        value={moneyBRL(scope.negotiationValue)}
                        sub={plural(scope.negotiationCount, 'contrato de Rascunho a Enviado', 'contratos de Rascunho a Enviado')} />
                    <KpiCard destaque label="Vencem em 90 dias" icon={<CalendarClock />}
                        value={scope.expiring90.count}
                        sub={scope.expiring90.count > 0 ? `${moneyBRL(scope.expiring90.value)} em contratos vigentes` : 'nenhum contrato vigente vence até lá'}
                        acao={scope.expiring90.count > 0 ? { label: 'Ver na linha do tempo', onClick: () => setDestaque('vence90') } : undefined} />
                    <KpiCard destaque label="Variação por aditivos e reajustes" icon={<TrendingUp />}
                        value={orDash(scope.variationRate, variacaoPct)}
                        sub={scope.originalValue > 0 ? `${variacaoBRL(scope.variation)} sobre ${moneyBRL(scope.originalValue)} originais` : 'nenhum contrato contratado'} />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                    <KpiCard destaque label="Medido" icon={<Ruler />}
                        value={med ? moneyBRL(med.measured) : '—'}
                        sub={!med ? 'medições não carregaram' : med.measurableCount > 0
                            ? `${orDash(med.rate, percent1)} de ${moneyBRL(med.base)} contratados por medição`
                            : 'nenhum contrato contratado faturado por medição'} />
                    <KpiCard destaque label="A receber" icon={<Clock />}
                        value={ag ? moneyBRL(ag.totalOpen) : '—'}
                        sub={ag ? `${moneyBRL(ag.received)} já recebido` : 'parcelas não carregaram'} />
                    <KpiCard destaque label="Vencido há mais de 90 dias" icon={<AlertCircle />}
                        value={col ? moneyBRL(col.overdue90) : '—'}
                        sub={col ? (col.overdue90Rate != null ? `${percent1(col.overdue90Rate)} do lançado` : 'nada lançado') : 'parcelas não carregaram'}
                        tom={col && col.overdue90 > LIMIAR.vencido90Alerta ? 'alerta' : 'neutro'}
                        acao={col && col.overdue90 > 0 ? { label: 'Cobrar em Contas a Receber', onClick: () => onNavigate('contas-a-receber') } : undefined} />
                    <KpiCard destaque label="Saldo a faturar" icon={<FileText />}
                        value={orDash(scope.toBill, moneyBRL)}
                        sub={scope.toBill != null ? 'contratado que ainda não virou parcela' : 'parcelas não carregaram'} />
                </div>
            )}

            {/* Faixa secundária — neutra (§4.5). */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {leitura === 'comercial' ? (
                    <>
                        <KpiCard size="sm" color="gray" label="Contratos vigentes" value={scope.active.count} sub={moneyBRL(scope.active.value)} icon={<PlayCircle />} />
                        <KpiCard size="sm" color="gray" label="Ticket médio" value={orDash(scope.ticket, moneyBRL)} sub={scope.contractedCount > 0 ? plural(scope.contractedCount, 'contrato contratado', 'contratos contratados') : undefined} icon={<Receipt />} />
                        <KpiCard size="sm" color="gray" label="Iniciados em 90 dias" value={scope.started90.count} sub={moneyBRL(scope.started90.value)} icon={<CalendarClock />} />
                        <KpiCard size="sm" color="gray" label="Cancelados" value={scope.cancelledCount} sub={scope.cancelledCount > 0 ? moneyBRL(scope.cancelledValue) : undefined} icon={<XCircle />} />
                    </>
                ) : (
                    <>
                        <KpiCard size="sm" color="gray" label="Recebido" value={ag ? moneyBRL(ag.received) : '—'} sub={col?.collectionRate != null ? `${percent1(col.collectionRate)} do lançado` : undefined} icon={<Check />} />
                        <KpiCard size="sm" color="gray" label="Recebimentos em 90 dias" value={scope.schedule ? moneyBRL(scope.schedule.within90.value) : '—'} sub={scope.schedule ? plural(scope.schedule.within90.count, 'parcela a vencer', 'parcelas a vencer') : undefined} icon={<CalendarClock />} />
                        <KpiCard size="sm" color="gray" label="Medições em aprovação" value={med ? med.pending.count : '—'} sub={med && med.pending.count > 0 ? moneyBRL(med.pending.value) : undefined} icon={<Hourglass />} />
                        <KpiCard size="sm" color="gray" label="Carteira contratada" value={moneyBRL(scope.contractedValue)} sub={plural(scope.contractedCount, 'contrato', 'contratos')} icon={<Briefcase />} />
                    </>
                )}
            </div>

            {/* Avisos que impedem leitura errada dos números acima — cada um só
                aparece quando o caso existe. */}
            {(scope.expiredActive > 0 || scope.activeWithoutEnd > 0 || scope.negotiationWithReceivables > 0
                || scope.contractedWithoutStart > 0 || (col && col.collectionRate != null && col.collectionRate < 0.5)) && (
                <div className="space-y-1 -mt-1 mb-3">
                    {scope.expiredActive > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.expiredActive, 'contrato vigente está', 'contratos vigentes estão')} com a <strong>vigência vencida</strong> —
                            renove ou encerre {scope.expiredActive === 1 ? 'o contrato' : 'os contratos'} para a carteira refletir o que está valendo.
                        </p>
                    )}
                    {scope.activeWithoutEnd > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.activeWithoutEnd, 'contrato vigente não tem', 'contratos vigentes não têm')} data de fim
                            e {scope.activeWithoutEnd === 1 ? 'fica' : 'ficam'} fora de “vencem em 90 dias”.
                        </p>
                    )}
                    {scope.negotiationWithReceivables > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.negotiationWithReceivables, 'contrato ainda em negociação já tem', 'contratos ainda em negociação já têm')} parcelas
                            lançadas: elas contam no <strong>a receber</strong> e no atraso, mas o contrato fica fora da carteira contratada.
                        </p>
                    )}
                    {col && col.collectionRate != null && col.collectionRate < 0.5 && (
                        <p className="text-xs text-gray-600">
                            Apenas {percent1(col.collectionRate)} das parcelas lançadas estão baixadas como recebidas. O atraso mede
                            {' '}<strong>conciliação no sistema</strong>, não necessariamente inadimplência do cliente.
                        </p>
                    )}
                    {scope.contractedWithoutStart > 0 && (
                        <p className="text-xs text-gray-600">
                            {plural(scope.contractedWithoutStart, 'contrato contratado não tem', 'contratos contratados não têm')} data de início e
                            {scope.contractedWithoutStart === 1 ? ' fica' : ' ficam'} fora de “contratos iniciados”.
                        </p>
                    )}
                </div>
            )}

            {/* ── LINHA DO TEMPO ── o lugar do espelho de Venda de Ativos. */}
            <ServiceContractTimeline scope={scope} destaque={destaque} onDestaque={setDestaque} onOpenContract={onOpenContract} />

            {/* ── GRÁFICOS ── por leitura, todos sobre o MESMO `scope`. */}
            {leitura === 'comercial' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                    <StatusChart scope={scope} />
                    <StartedByMonthChart scope={scope} />
                    <SituationChart scope={scope} />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                    {temComparativo && <CollectionByClientChart rows={linhasComParcela} onSelect={onSelectClient} className="lg:col-span-2" />}
                    <AgingChart scope={scope} onFaixa={i => setDestaque(i === 0 ? 'nenhum' : 'atraso')} />
                    <ReceivableScheduleChart scope={scope} />
                </div>
            )}

            {/* Detalhamento — recolhido por padrão, como em Venda de Ativos. */}
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
                        <GroupLabel>Carteira</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Carteira contratada" value={moneyBRL(scope.contractedValue)} sub={plural(scope.contractedCount, 'contrato', 'contratos')} icon={<Briefcase className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Valor original" value={moneyBRL(scope.originalValue)} sub="dos contratados, na assinatura" icon={<Wallet className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Aditivos e reajustes" value={variacaoBRL(scope.variation)} sub={orDash(scope.variationRate, variacaoPct)} icon={<TrendingUp className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Em negociação" value={moneyBRL(scope.negotiationValue)} sub={plural(scope.negotiationCount, 'contrato', 'contratos')} icon={<Handshake className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Cancelados" value={scope.cancelledCount} sub={moneyBRL(scope.cancelledValue)} icon={<XCircle className="w-4 h-4" />} color="gray" />
                        </div>
                    </div>

                    <div className="mb-3">
                        <GroupLabel>Vigência</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Vigentes" value={scope.active.count} sub={moneyBRL(scope.active.value)} icon={<PlayCircle className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Encerrados" value={scope.bySituation.encerrado.count} sub={moneyBRL(scope.bySituation.encerrado.value)} icon={<Check className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Vencem em 90 dias" value={scope.expiring90.count} sub={moneyBRL(scope.expiring90.value)} icon={<CalendarClock className="w-4 h-4" />} color="gray" />
                            <KpiCard shadow={false} size="sm" label="Vigência vencida" value={scope.expiredActive} sub="vigentes com o fim no passado" icon={<CalendarX className="w-4 h-4" />} color={scope.expiredActive > 0 ? 'amber' : 'gray'} />
                            <KpiCard shadow={false} size="sm" label="Sem data de fim" value={scope.activeWithoutEnd} sub="vigentes" icon={<CalendarClock className="w-4 h-4" />} color="gray" />
                        </div>
                    </div>

                    <div className="mb-3">
                        <GroupLabel>Medição e recebimentos</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Medido" value={med ? moneyBRL(med.measured) : '—'} sub={med ? orDash(med.rate, v => `${percent1(v)} da base por medição`) : undefined} icon={<Ruler className="w-4 h-4" />} color="gray" />
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

export default ServiceContractsAnalysisOverview;
