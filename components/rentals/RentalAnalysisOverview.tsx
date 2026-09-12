import React from 'react';
import {
    Key, DollarSign, Clock, AlertCircle, TrendingUp, Calendar, RefreshCw, Building2, Home,
    Check, Briefcase, BarChart3, ChevronDown, FileText, Wallet, CalendarClock, Percent, Receipt,
} from 'lucide-react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import { KpiCard } from '../ui/KpiCard';
import type { RentalAnalysisScope } from '../../lib/rentalByEmpreendimento';

/**
 * Painel da aba Análise de Locações — KPIs, gráficos e detalhamento de UM
 * recorte (`scope`): um empreendimento, ou a carteira inteira.
 *
 * Tudo aqui lê o `RentalAnalysisScope` que `groupRentalAnalysis` já montou:
 * o componente não faz conta nenhuma que possa divergir da tabela abaixo dele.
 * As séries dos gráficos (`unitStatus`, `leaseExpiry`, `aging`) são partições
 * do mesmo balde dos KPIs — ver lib/rentalAnalysisCharts.ts.
 *
 * Regra transversal: `—` onde a conta não tem base. "Não medido" nunca vira zero.
 *
 * Gráficos (docs/ui_ux_guia_unificado.md §28): série única sem legenda, marcas
 * finas com ponta arredondada, grade em hairline sólida, rótulo direto só na
 * ponta da barra e em cor de texto — o valor não veste a cor da série.
 */

interface Props {
    scope: RentalAnalysisScope;
    /** Todas as linhas por empreendimento — só o comparativo usa. */
    rows: RentalAnalysisScope[];
    isAll: boolean;
    onSelectEmpreendimento: (id: string) => void;
    showDetail: boolean;
    onToggleDetail: () => void;
}

const moneyBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

/** Tick de eixo: "12 mil" / "1,2 mi" — o eixo é régua, não valor; a moeda
 *  está no subtítulo e no tooltip, e "R$ 10 mil" quebrava em duas linhas. */
const compactAxis = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1_000) return `${Math.round(v / 1_000).toLocaleString('pt-BR')} mil`;
    return String(Math.round(v));
};

/** Ticks "redondos" para o eixo de valor (0 · 1 mil · 2 mil …). O automático
 *  do Recharts devolve 0/950/1900/2850, e o formatador compacto arredondaria
 *  2850 para "3 mil" — rótulo mentindo sobre a linha em que está. */
const niceTicks = (max: number, count = 4): number[] => {
    if (!(max > 0)) return [0];
    const bruto = max / count;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const frac = bruto / pot;
    const passo = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pot;
    const ticks: number[] = [];
    for (let t = 0; t <= max + passo * 0.999; t += passo) ticks.push(Math.round(t * 1000) / 1000);
    return ticks;
};

const percent1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** `—` para "não medido". */
const orDash = (v: number | null | undefined, formata: (n: number) => string) =>
    v == null ? '—' : formata(v);

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

// Cromo dos gráficos — os mesmos valores em todos, para os quatro lerem como
// um sistema só. Grade e eixos em hairline sólida, um passo acima do fundo.
const GRID = '#f1f5f9';
const TICK = { fontSize: 11, fill: '#64748b' };
const CATEGORY_TICK = { fontSize: 12, fill: '#475569' };
const TOOLTIP_STYLE = {
    backgroundColor: '#fff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    fontSize: 12,
};
const TOOLTIP_CURSOR = { fill: '#f8fafc' };
/** Medida do PRIMEIRO render, antes de o container ser medido — sem isto o
 *  Recharts avisa "width(-1)" no console a cada gráfico montado. */
const INITIAL_DIMENSION = { width: 520, height: 200 };
/** Rótulo direto na ponta da barra — em cor de TEXTO, nunca da série. */
const END_LABEL = { position: 'right' as const, fontSize: 11, fill: '#64748b' };

/** Série principal (azul do sistema) e a série de contexto em cinza —
 *  forma "ênfase": um matiz + cinza, para a comparação não virar dois azuis. */
const SERIE_PRINCIPAL = '#3b82f6';
const SERIE_CONTEXTO = '#94a3b8';

/** Cores de STATUS da unidade — as mesmas do texto de status na tabela de
 *  Unidades (roxo alugado, verde disponível, âmbar reservado), para a
 *  legenda do gráfico e a coluna Status dizerem a mesma coisa. Validadas
 *  para daltonismo (ΔE adjacente ≥ 7,9 com a legenda como codificação
 *  secundária) e contraste ≥ 3:1 sobre branco. */
const STATUS_COLORS = {
    rented: '#9333ea',
    available: '#059669',
    reserved: '#d97706',
    maintenance: '#94a3b8',
    other: '#cbd5e1',
} as const;

/** Faixas de atraso: rampa de UM matiz (vermelho), clara → escura conforme o
 *  atraso cresce. "A vencer" fica fora da rampa, em cinza neutro: não é atraso. */
const AGING_COLORS = ['#94a3b8', '#f87171', '#ef4444', '#b91c1c', '#7f1d1d'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────────

const ChartCard: React.FC<{
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    className?: string;
}> = ({ title, subtitle, children, className = '' }) => (
    <div className={`bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-col ${className}`}>
        <div>
            <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="mt-3 flex-1 min-h-0">{children}</div>
    </div>
);

/** Estado vazio de um card de gráfico — texto só, sem ícone grande: o card já
 *  é pequeno e um ícone de 48px competiria com o título. */
const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-center min-h-[160px] text-sm text-gray-400 text-center px-4">
        {children}
    </div>
);

/** Legenda HTML — um retângulo por série, no vocabulário de texto da tela.
 *  Legenda sempre presente com 2+ séries (a identidade nunca fica só na cor). */
const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
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
const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-xs font-semibold text-slate-500 mb-2">{children}</p>
);

/** Tooltip do cronograma: o valor lidera, a contagem contextualiza. */
const ExpiryTooltip: React.FC<{ active?: boolean; payload?: { payload: { label: string; value: number; count: number } }[] }> = ({ active, payload }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return (
        <div style={TOOLTIP_STYLE} className="px-3 py-2">
            <p className="text-gray-500">{p.label}</p>
            <p className="font-medium text-gray-800">{moneyBRL(p.value)}/mês</p>
            <p className="text-gray-500">{plural(p.count, 'contrato vence', 'contratos vencem')}</p>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Gráficos
// ─────────────────────────────────────────────────────────────────────────────

/** Receita contratada × valor base, por empreendimento. Só em "Todos" e com
 *  2+ baldes — com um só, o KPI do topo já é o gráfico. */
const RevenueByEmpreendimentoChart: React.FC<{ rows: RentalAnalysisScope[]; onSelect: (id: string) => void }> = ({ rows, onSelect }) => {
    const data = rows.map(r => ({
        id: r.empreendimentoId,
        name: r.name,
        contratada: r.monthlyRevenue,
        referencia: r.referenceMonthlyRevenue,
    }));
    const selecionar = (d: { payload?: { id?: string } }) => d?.payload?.id && onSelect(d.payload.id);
    return (
        <ChartCard
            title="Receita mensal por empreendimento"
            subtitle="Contratada (parcelas dos contratos fechados) contra o valor base de todas as unidades. Clique na barra para recortar a aba."
        >
            <Legend items={[{ label: 'Contratada', color: SERIE_PRINCIPAL }, { label: 'Valor base (potencial)', color: SERIE_CONTEXTO }]} />
            {/* Altura por linha, não fixa: barras engordariam com poucos itens.
                O rótulo é o nome do empreendimento — texto longo, por isso
                barras horizontais. */}
            <div style={{ height: Math.max(150, rows.length * 44 + 16) }}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }} barGap={2} barCategoryGap={12}>
                        <CartesianGrid horizontal={false} stroke={GRID} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={170} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                        <RechartsTooltip
                            cursor={TOOLTIP_CURSOR}
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(val, name) => [moneyBRL(Number(val)), name === 'contratada' ? 'Contratada' : 'Valor base']}
                        />
                        <Bar
                            dataKey="contratada"
                            fill={SERIE_PRINCIPAL}
                            radius={[0, 4, 4, 0]}
                            barSize={9}
                            cursor="pointer"
                            onClick={selecionar}
                            label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }}
                        />
                        <Bar
                            dataKey="referencia"
                            fill={SERIE_CONTEXTO}
                            radius={[0, 4, 4, 0]}
                            barSize={9}
                            cursor="pointer"
                            onClick={selecionar}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    );
};

/** Quanto da receita mensal vence em cada um dos próximos 12 meses. É a
 *  pergunta que o WALE (uma média) não responde: quando o risco chega. */
const LeaseExpiryChart: React.FC<{ scope: RentalAnalysisScope }> = ({ scope }) => {
    const exp = scope.leaseExpiry;
    const yTicks = niceTicks(exp ? Math.max(...exp.months.map(m => m.value)) : 0);
    return (
        <ChartCard
            title="Vencimento de contratos — próximos 12 meses"
            subtitle="Aluguel mensal dos contratos vigentes que terminam em cada mês."
        >
            {!exp ? (
                <ChartEmpty>Contratos indisponíveis para este recorte.</ChartEmpty>
            ) : exp.activeCount === 0 ? (
                <ChartEmpty>Nenhum contrato vigente neste recorte.</ChartEmpty>
            ) : (
                <>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <BarChart data={exp.months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} stroke={GRID} />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={TICK} interval={0} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={TICK}
                                    tickFormatter={compactAxis}
                                    width={48}
                                    ticks={yTicks}
                                    domain={[0, yTicks[yTicks.length - 1]]}
                                />
                                <RechartsTooltip cursor={TOOLTIP_CURSOR} content={<ExpiryTooltip />} />
                                <Bar dataKey="value" fill={SERIE_PRINCIPAL} radius={[4, 4, 0, 0]} maxBarSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* A leitura sem passar o mouse: os acumulados por prazo. */}
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        {[
                            { rotulo: 'Vencem em 30 dias', b: exp.within30 },
                            { rotulo: 'Vencem em 90 dias', b: exp.within90 },
                            { rotulo: 'Vencem em 12 meses', b: exp.within365 },
                        ].map(({ rotulo, b }) => (
                            <div key={rotulo} className="min-w-0">
                                <p className="text-xs text-gray-400 truncate">{rotulo}</p>
                                <p className="text-sm font-medium text-gray-800 truncate">{plural(b.count, 'contrato', 'contratos')}</p>
                                <p className="text-xs text-gray-500 truncate">{moneyBRL(b.value)}/mês</p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </ChartCard>
    );
};

/** Composição das unidades locáveis por status — o "onde está o resto" que a
 *  taxa de ocupação sozinha não mostra. Parte-do-todo com até 5 fatias. */
const UnitStatusChart: React.FC<{ scope: RentalAnalysisScope }> = ({ scope }) => {
    const us = scope.unitStatus;
    const fatias = [
        { key: 'rented', label: 'Alugadas', value: us.rented, color: STATUS_COLORS.rented },
        { key: 'available', label: 'Disponíveis', value: us.available, color: STATUS_COLORS.available },
        { key: 'reserved', label: 'Reservadas', value: us.reserved, color: STATUS_COLORS.reserved },
        { key: 'maintenance', label: 'Em manutenção', value: us.maintenance, color: STATUS_COLORS.maintenance },
        { key: 'other', label: 'Outros status', value: us.other, color: STATUS_COLORS.other },
    ].filter(f => f.value > 0);

    return (
        <ChartCard title="Composição das unidades" subtitle="Unidades locáveis do recorte, por status atual.">
            {us.total === 0 ? (
                <ChartEmpty>Nenhuma unidade locável neste recorte.</ChartEmpty>
            ) : (
                <div className="flex items-center gap-6">
                    <div className="relative w-44 h-44 shrink-0">
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <PieChart>
                                <Pie
                                    data={fatias}
                                    dataKey="value"
                                    nameKey="label"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={56}
                                    outerRadius={78}
                                    paddingAngle={2}
                                    stroke="#fff"
                                    strokeWidth={2}
                                    startAngle={90}
                                    endAngle={-270}
                                    isAnimationActive={false}
                                >
                                    {fatias.map(f => <Cell key={f.key} fill={f.color} />)}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val, name) => [plural(Number(val), 'unidade', 'unidades'), String(name)]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Figura-herói no centro: a ocupação física, o número que
                            o gráfico existe para explicar. */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-gray-900 leading-none">
                                {orDash(scope.occupancyRate, v => `${Math.round(v * 100)}%`)}
                            </span>
                            <span className="text-[11px] text-gray-400 mt-1">ocupação</span>
                        </div>
                    </div>
                    {/* Legenda com os números: é a "vista de tabela" do gráfico —
                        quem não distingue as cores lê aqui. */}
                    <ul className="flex-1 min-w-0 space-y-1.5">
                        {fatias.map(f => (
                            <li key={f.key} className="flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: f.color }} />
                                <span className="text-gray-600 truncate flex-1">{f.label}</span>
                                <span className="font-medium text-gray-800 tabular-nums">{f.value}</span>
                                <span className="text-gray-400 tabular-nums w-11 text-right">{Math.round((f.value / us.total) * 100)}%</span>
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

/** Aberto por faixa de atraso. "Vencido > 90 dias" é a ponta; a faixa de
 *  1–30 é onde a inadimplência nasce. */
const AgingChart: React.FC<{ scope: RentalAnalysisScope; className?: string }> = ({ scope, className }) => {
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
        <ChartCard
            title="Aluguéis em aberto por atraso"
            subtitle="Parcelas lançadas e ainda não baixadas, pela idade do vencimento."
            className={className}
        >
            {!ag ? (
                <ChartEmpty>Contratos indisponíveis para este recorte.</ChartEmpty>
            ) : ag.billed === 0 ? (
                <ChartEmpty>Nenhuma parcela de aluguel lançada neste recorte.</ChartEmpty>
            ) : (
                <>
                    <div style={{ height: data.length * 32 + 8 }}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }}>
                                <CartesianGrid horizontal={false} stroke={GRID} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="label" width={88} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                                <RechartsTooltip
                                    cursor={TOOLTIP_CURSOR}
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val) => [moneyBRL(Number(val)), 'Em aberto']}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[0, 4, 4, 0]}
                                    barSize={16}
                                    label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }}
                                >
                                    {data.map((d, i) => <Cell key={d.label} fill={AGING_COLORS[i]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                        <div className="min-w-0">
                            <p className="text-xs text-gray-400 truncate">Vencido</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.totalOverdue)}</p>
                            {overdueRate != null && <p className="text-xs text-gray-500 truncate">{percent1(overdueRate)} do lançado</p>}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-400 truncate">Em aberto</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.totalOpen)}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-400 truncate">Recebido</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{moneyBRL(ag.received)}</p>
                        </div>
                    </div>
                    {/* A mesma ressalva do KPI de cobrança: baixa no sistema ≠ saúde do inquilino. */}
                    {ag.withoutDueDate > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                            {plural(ag.withoutDueDate, 'parcela em aberto está', 'parcelas em aberto estão')} sem data de vencimento
                            e {ag.withoutDueDate === 1 ? 'conta' : 'contam'} como “a vencer”.
                        </p>
                    )}
                </>
            )}
        </ChartCard>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// O painel
// ─────────────────────────────────────────────────────────────────────────────

const RentalAnalysisOverview: React.FC<Props> = ({ scope, rows, isAll, onSelectEmpreendimento, showDetail, onToggleDetail }) => {
    const ex = scope.executive;
    const exp = scope.leaseExpiry;
    const temComparativo = isAll && rows.length > 1;
    const ticketMedio = scope.dealsCount > 0 ? scope.monthlyRevenue / scope.dealsCount : null;
    // Receita que a carteira deixa na mesa: potencial ao preço de tabela menos
    // o contratado. É o custo da vacância em R$, não em %.
    const receitaPerdida = scope.financial.potential - scope.financial.contracted;

    return (
        <>
            {/* ── PAINEL EXECUTIVO ─────────────────────────────────────────────
                Os 8 indicadores que respondem praticamente tudo. O catálogo
                original sugeria 20 no topo; 20 não é dashboard, é relatório —
                o resto está no detalhamento recolhível e nos gráficos. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <KpiCard shadow={false} size="sm" label="Ocupação física" value={orDash(scope.occupancyRate, percent1)} sub={`${scope.rentedCount} de ${scope.unitsCount} unidades`} icon={<Key className="w-4 h-4" />} color="purple" />
                {/* Ao lado da física de propósito: a diferença entre as duas é o
                    que denuncia carteira cheia de unidade barata. */}
                <KpiCard shadow={false} size="sm" label="Ocupação financeira" value={orDash(scope.financial.rate, percent1)} sub={`${moneyBRL(scope.financial.contracted)} de ${moneyBRL(scope.financial.potential)}`} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Vacância média" value={scope.vacancy ? `${scope.vacancy.averageDays} dias` : '—'} sub={scope.vacancy ? `${plural(scope.vacancy.vacantCount, 'unidade vaga', 'unidades vagas')} · mediana ${scope.vacancy.medianDays} d` : undefined} icon={<Clock className="w-4 h-4" />} color="amber" />
                <KpiCard shadow={false} size="sm" label="Receita mensal" value={moneyBRL(scope.monthlyRevenue)} sub={`${moneyBRL(scope.monthlyRevenue * 12)} ao ano`} icon={<Wallet className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Vencido há mais de 90 dias" value={orDash(ex?.collection.overdue90Rate, percent1)} sub={ex ? `${moneyBRL(ex.collection.overdue90)} do lançado` : undefined} icon={<AlertCircle className="w-4 h-4" />} color="red" />
                <KpiCard shadow={false} size="sm" label="NOI" value={scope.noi ? moneyBRL(scope.noi.noi) : '—'} sub={scope.noi ? `margem ${orDash(scope.noi.margin, percent1)}` : undefined} icon={<TrendingUp className="w-4 h-4" />} color={scope.noi && scope.noi.noi < 0 ? 'red' : 'teal'} />
                <KpiCard shadow={false} size="sm" label="WALE da carteira" value={orDash(ex?.wale.years, anos => `${anos.toFixed(1)} anos`)} sub={ex ? plural(ex.wale.counted, 'contrato na média', 'contratos na média') : undefined} icon={<Calendar className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Taxa de renovação" value={orDash(ex?.renewal.rate, v => `${(v * 100).toFixed(0)}%`)} sub={ex && ex.renewal.expired > 0 ? `${ex.renewal.renewed} de ${ex.renewal.expired} vencidos no ano` : undefined} icon={<RefreshCw className="w-4 h-4" />} color="violet" />
            </div>

            {/* Avisos que impedem leitura errada dos números acima. Cada um só
                aparece quando o caso existe — aviso permanente vira ruído. */}
            {(ex || scope.financial.withoutPrice > 0) && (
                <div className="space-y-1 -mt-1 mb-3">
                    {/* Sem isto, "98% de ocupação financeira" parece carteira
                        rentabilizada quando pode ser meia carteira sem preço. */}
                    {scope.financial.withoutPrice > 0 && (
                        <p className="text-xs text-gray-400">
                            {scope.financial.withoutPrice} de {scope.financial.leafCount} unidades não têm aluguel de
                            referência cadastrado e ficam fora da <strong>ocupação financeira</strong> — a taxa
                            fala apenas das {scope.financial.leafCount - scope.financial.withoutPrice} precificadas.
                        </p>
                    )}
                    {/* Sem este aviso, "0,8% recebido" é lido como inadimplência
                        de 99% — quando o que falta é baixa no sistema. */}
                    {ex && ex.collection.collectionRate != null && ex.collection.collectionRate < 0.5 && (
                        <p className="text-xs text-gray-400">
                            Apenas {percent1(ex.collection.collectionRate)} dos aluguéis lançados
                            estão baixados como recebidos. O indicador mede <strong>conciliação no sistema</strong>,
                            não necessariamente atraso do locatário.
                        </p>
                    )}
                    {ex && ex.wale.expiredStillActive > 0 && (
                        <p className="text-xs text-gray-400">
                            {ex.wale.expiredStillActive} contrato{ex.wale.expiredStillActive > 1 ? 's' : ''} com
                            data de término já vencida e ainda em vigor — fora do WALE e do cronograma de vencimentos, porque prazo negativo
                            distorceria a média. Renove ou encerre para o número refletir a carteira.
                        </p>
                    )}
                    {ex && ex.renewal.rate == null && ex.contractsConsidered > 0 && (
                        <p className="text-xs text-gray-400">
                            Taxa de renovação sem base: nenhum contrato terminou no período. Não é 0%.
                        </p>
                    )}
                </div>
            )}

            {/* ── GRÁFICOS ─────────────────────────────────────────────────────
                Quatro perguntas que o número sozinho não responde: quanto cada
                empreendimento pesa, quando os contratos vencem, como a carteira
                está composta e quão velho é o que está em aberto. Todos leem o
                MESMO `scope` dos KPIs. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
                {temComparativo && <RevenueByEmpreendimentoChart rows={rows} onSelect={onSelectEmpreendimento} />}
                <LeaseExpiryChart scope={scope} />
                <UnitStatusChart scope={scope} />
                {/* Sem o comparativo sobram 3 cards numa grade de 2: o aging
                    ocupa a linha inteira em vez de deixar um vão ao lado. */}
                <AgingChart scope={scope} className={temComparativo ? undefined : 'lg:col-span-2'} />
            </div>

            {/* Detalhamento — recolhido por padrão (decisão da Fase 3). */}
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
                        <GroupLabel>Carteira e patrimônio</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Ativos sob gestão" value={scope.activeAssets} icon={<Building2 className="w-4 h-4" />} color="blue" />
                            <KpiCard shadow={false} size="sm" label="Contratos vigentes" value={ex ? ex.activeContracts : '—'} sub={ex ? `${ex.contractsConsidered} no total` : undefined} icon={<FileText className="w-4 h-4" />} color="indigo" />
                            {/* Ticket médio = receita ÷ negócios fechados: a mesma
                                população do KPI "Receita mensal". */}
                            <KpiCard shadow={false} size="sm" label="Aluguel médio por contrato" value={orDash(ticketMedio, moneyBRL)} sub={scope.dealsCount > 0 ? plural(scope.dealsCount, 'contrato fechado', 'contratos fechados') : undefined} icon={<Receipt className="w-4 h-4" />} color="violet" />
                            <KpiCard shadow={false} size="sm" label="Valor patrimonial" value={moneyBRL(scope.portfolioValue)} icon={<Home className="w-4 h-4" />} color="amber" />
                            {/* Yield bruto anual = receita mensal × 12 ÷ patrimônio; o
                                mensal fica de legenda. Yield LÍQUIDO é o cap rate, no
                                bloco de rentabilidade. */}
                            <KpiCard shadow={false} size="sm" label="Yield bruto anual" value={orDash(scope.monthlyYield, v => `${(v * 12 * 100).toFixed(2)}%`)} sub={scope.monthlyYield != null ? `${(scope.monthlyYield * 100).toFixed(2)}% ao mês` : undefined} icon={<Percent className="w-4 h-4" />} color="emerald" />
                        </div>
                    </div>

                    <div className="mb-3">
                        <GroupLabel>Receita e cobrança</GroupLabel>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <KpiCard shadow={false} size="sm" label="Receita potencial" value={moneyBRL(scope.financial.potential)} sub="ao valor base, tudo alugado" icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                            <KpiCard shadow={false} size="sm" label="Receita perdida por vacância" value={moneyBRL(Math.max(0, receitaPerdida))} sub="potencial − contratada, por mês" icon={<AlertCircle className="w-4 h-4" />} color="rose" />
                            <KpiCard shadow={false} size="sm" label="Aluguéis lançados" value={ex ? moneyBRL(ex.collection.billed) : '—'} icon={<Receipt className="w-4 h-4" />} color="indigo" />
                            <KpiCard shadow={false} size="sm" label="Aluguéis recebidos" value={ex ? moneyBRL(ex.collection.received) : '—'} icon={<Check className="w-4 h-4" />} color="teal" />
                            <KpiCard shadow={false} size="sm" label="Taxa de arrecadação" value={orDash(ex?.collection.collectionRate, percent1)} sub="recebido ÷ lançado" icon={<Percent className="w-4 h-4" />} color="blue" />
                        </div>
                    </div>

                    {/* Vencimentos — o cronograma em números, para quem quer o
                        valor exato sem passar o mouse no gráfico. */}
                    {exp && exp.activeCount > 0 && (
                        <div className="mb-3">
                            <GroupLabel>Vencimento dos contratos vigentes</GroupLabel>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <KpiCard shadow={false} size="sm" label="Vencem em 30 dias" value={exp.within30.count} sub={`${moneyBRL(exp.within30.value)}/mês`} icon={<CalendarClock className="w-4 h-4" />} color="red" />
                                <KpiCard shadow={false} size="sm" label="Vencem em 90 dias" value={exp.within90.count} sub={`${moneyBRL(exp.within90.value)}/mês`} icon={<CalendarClock className="w-4 h-4" />} color="orange" />
                                <KpiCard shadow={false} size="sm" label="Vencem em 12 meses" value={exp.within365.count} sub={`${moneyBRL(exp.within365.value)}/mês`} icon={<Calendar className="w-4 h-4" />} color="amber" />
                                <KpiCard shadow={false} size="sm" label="Vencidos e em vigor" value={exp.expired.count} sub={exp.expired.count > 0 ? `${moneyBRL(exp.expired.value)}/mês` : undefined} icon={<AlertCircle className="w-4 h-4" />} color={exp.expired.count > 0 ? 'rose' : 'gray'} />
                                <KpiCard shadow={false} size="sm" label="Sem data de término" value={exp.noEndDate} icon={<FileText className="w-4 h-4" />} color={exp.noEndDate > 0 ? 'amber' : 'gray'} />
                            </div>
                        </div>
                    )}

                    {/* Vacância (Fase 1) — só aparece quando o log de status existe.
                        `null` significa "não medido" (migration ainda não aplicada), que
                        é diferente de zero; mostrar "0 dias" sem ter medido seria pior
                        que não mostrar nada. */}
                    {scope.vacancy && (
                        <div className="mb-3">
                            <GroupLabel>Vacância</GroupLabel>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <KpiCard shadow={false} size="sm" label="Unidades vagas" value={scope.vacancy.vacantCount} icon={<Home className="w-4 h-4" />} color="blue" />
                                <KpiCard shadow={false} size="sm" label="Vacância média" value={`${scope.vacancy.averageDays} dias`} icon={<Clock className="w-4 h-4" />} color="amber" />
                                {/* Mediana ao lado da média de propósito: uma unidade parada
                                    há anos distorce a média e esconde a carteira saudável. */}
                                <KpiCard shadow={false} size="sm" label="Vacância mediana" value={`${scope.vacancy.medianDays} dias`} icon={<Clock className="w-4 h-4" />} color="indigo" />
                                <KpiCard shadow={false} size="sm" label="Estoque envelhecido" value={scope.vacancy.over90} sub="vagas há mais de 90 dias" icon={<AlertCircle className="w-4 h-4" />} color="red" />
                                <KpiCard shadow={false} size="sm" label="Absorção líquida (30d)" value={scope.vacancy.netAbsorption30d.net} sub={`${scope.vacancy.netAbsorption30d.rented} alugadas · ${scope.vacancy.netAbsorption30d.vacated} desocupadas`} icon={<TrendingUp className="w-4 h-4" />} color="emerald" />
                            </div>
                            {/* Enquanto houver marco de backfill entre as vagas, os dias são
                                um PISO — o `changed_at` daquelas linhas é o `updated_at` do
                                imóvel, não a data real da mudança de status. */}
                            {scope.vacancy.approximateCount > 0 && (
                                <p className="text-xs text-gray-400 mt-2">
                                    {scope.vacancy.approximateCount === scope.vacancy.vacantCount
                                        ? 'Tempo de vacância ainda estimado: o histórico começou a ser medido agora.'
                                        : `${scope.vacancy.approximateCount} de ${scope.vacancy.vacantCount} unidades vagas ainda usam a data estimada do início da medição.`}
                                    {' '}O número tende a crescer até a medição real assumir.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Rentabilidade (Fase 2) — o bloco que responde "quanto RENDE", e
                        não "quanto fatura". Só existe com despesa apropriada por imóvel;
                        sem ela o NOI seria a receita com outro nome. */}
                    {scope.noi && (
                        <div className="mb-3">
                            <GroupLabel>Rentabilidade (ano corrente até o mês atual)</GroupLabel>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <KpiCard shadow={false} size="sm" label="Receita no período" value={moneyBRL(scope.noi.revenue)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                                <KpiCard shadow={false} size="sm" label="Despesa no período" value={moneyBRL(scope.noi.expense)} icon={<Briefcase className="w-4 h-4" />} color="orange" />
                                <KpiCard shadow={false} size="sm" label="NOI" value={moneyBRL(scope.noi.noi)} icon={<TrendingUp className="w-4 h-4" />} color={scope.noi.noi >= 0 ? 'teal' : 'red'} />
                                {/* Margem e cap rate são `null` quando indefinidos (sem
                                    receita / sem patrimônio) — mostrar "0%" afirmaria algo
                                    que a conta não sustenta. */}
                                <KpiCard shadow={false} size="sm" label="Margem NOI" value={orDash(scope.noi.margin, percent1)} icon={<BarChart3 className="w-4 h-4" />} color="violet" />
                                <KpiCard shadow={false} size="sm" label="Cap rate" value={orDash(scope.noi.capRate, v => `${(v * 100).toFixed(2)}%`)} sub="NOI anualizado ÷ patrimônio" icon={<Percent className="w-4 h-4" />} color="cyan" />
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default RentalAnalysisOverview;
