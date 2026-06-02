import React from 'react';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    TrendingUp, TrendingDown, Building2, Package, Shield,
    Users, AlertTriangle, CheckCircle, Star, Target, RefreshCw,
} from 'lucide-react';
import { biService } from '../services/biService';
import { useToast } from '../hooks/useToast';
import type { BIExecutiveSummary, KPIvsTarget } from '../types/bi';
import MyTasksWidget from './MyTasksWidget';

// ── Formatadores ──────────────────────────────────────────────────────────────

function fBRL(v: number | null): string {
    if (v === null) return '—';
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)    return `R$ ${(v / 1_000).toFixed(0)}k`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fPct(v: number | null): string {
    if (v === null) return '—';
    return `${v.toFixed(1)}%`;
}

function fNum(v: number | null, unit = ''): string {
    if (v === null) return '—';
    return `${v.toLocaleString('pt-BR')}${unit ? ' ' + unit : ''}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color, accent }: {
    label: string; value: string; sub?: string;
    icon: React.ElementType; color: string; accent?: string;
}) {
    return (
        <div className={`bg-white rounded-2xl border p-5 flex items-start gap-4 shadow-sm ${accent || 'border-gray-100'}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-none">{label}</p>
                <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ── Semáforo vs Meta ──────────────────────────────────────────────────────────

function TargetRow({ item }: { item: KPIvsTarget }) {
    const formatVal = (v: number | null) => {
        if (v === null) return '—';
        if (item.unidade === 'BRL') return fBRL(v);
        if (item.unidade === '%')   return fPct(v);
        return fNum(v, item.unidade === 'un' ? '' : item.unidade);
    };

    const statusConfig = {
        acima:    { dot: 'bg-green-400',  text: 'text-green-600',  label: 'Acima da meta'  },
        dentro:   { dot: 'bg-yellow-400', text: 'text-yellow-600', label: 'Dentro da faixa' },
        abaixo:   { dot: 'bg-red-400',    text: 'text-red-600',    label: 'Abaixo da meta' },
        sem_meta: { dot: 'bg-gray-300',   text: 'text-gray-400',   label: 'Sem meta'        },
    }[item.status];

    return (
        <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusConfig.dot}`} />
                <span className="text-sm text-gray-700 font-medium truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                <span className="text-sm font-black text-gray-900 tabular-nums w-24 text-right">
                    {formatVal(item.realizado)}
                </span>
                {item.meta !== null && (
                    <span className="text-xs text-gray-400 tabular-nums w-20 text-right">
                        meta: {formatVal(item.meta)}
                    </span>
                )}
                {item.variacao_pct !== null && (
                    <span className={`text-xs font-bold tabular-nums w-14 text-right ${statusConfig.text}`}>
                        {item.variacao_pct > 0 ? '+' : ''}{item.variacao_pct}%
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Tooltip customizado ───────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1 min-w-[160px]">
            <p className="font-black text-gray-700 mb-2">{label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-3">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{fBRL(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

interface BIDashboardProps {
    organizationId: string;
    onNavigate?: (view: string) => void;
}

const BIDashboard: React.FC<BIDashboardProps> = ({ organizationId, onNavigate }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo,   setDateTo]   = React.useState(`${now.getFullYear()}-12-31`);
    const [summary, setSummary]   = React.useState<BIExecutiveSummary | null>(null);
    const [loading, setLoading]   = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'visao_geral' | 'tendencia' | 'metas'>('visao_geral');

    const load = React.useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const s = await biService.getSummary(organizationId, dateFrom, dateTo);
            setSummary(s);
        } catch (e: unknown) {
            showToast('Erro ao carregar BI executivo', 'error');
            console.error('[BIDashboard]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const kpis = summary?.kpis;
    const trend = summary?.trend ?? [];
    const targets = summary?.vsTargets ?? [];

    const dreVal = (linha: string) =>
        kpis?.dre?.find(d => d.linha === linha)?.realizado ?? null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">BI Executivo</h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">
                        Painel consolidado — Comercial · Operacional · Suprimentos · Financeiro · RH
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <button onClick={load} disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2 transition-all disabled:opacity-60">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                    Carregando painel executivo...
                </div>
            ) : !kpis ? null : (
                <>
                    {/* ── Headline KPIs ── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KPICard
                            label="Faturamento"
                            value={fBRL(dreVal('Receita Bruta'))}
                            sub={`EBITDA: ${fBRL(dreVal('= EBITDA'))}`}
                            icon={TrendingUp} color="bg-green-50 text-green-600"
                        />
                        <KPICard
                            label="VGV Fechado"
                            value={fBRL(kpis.comercial?.vgv_fechado ?? null)}
                            sub={`Conversão: ${fPct(kpis.comercial?.taxa_conversao_pct ?? null)}`}
                            icon={Target} color="bg-blue-50 text-blue-600"
                        />
                        <KPICard
                            label="Obras Ativas"
                            value={fNum(kpis.operacional?.obras_ativas ?? null)}
                            sub={`NCs abertas: ${fNum(kpis.operacional?.ncs_abertas ?? null)}`}
                            icon={Building2} color="bg-orange-50 text-orange-600"
                        />
                        <KPICard
                            label="Headcount"
                            value={fNum(kpis.rh?.headcount?.ativos ?? null)}
                            sub={`Turnover: ${fPct(kpis.rh?.periodo?.turnover_pct ?? null)}`}
                            icon={Users} color="bg-purple-50 text-purple-600"
                        />
                    </div>

                    {/* ── Tabs ── */}
                    <div className="flex gap-1 border-b border-gray-100">
                        {(['visao_geral', 'tendencia', 'metas'] as const).map(t => (
                            <button key={t} onClick={() => setActiveTab(t)}
                                className={`px-4 py-2 text-xs font-bold capitalize transition-colors ${
                                    activeTab === t
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                {t === 'visao_geral' ? 'Visão Geral' : t === 'tendencia' ? 'Tendência 12 Meses' : 'vs. Metas'}
                            </button>
                        ))}
                    </div>

                    {/* ── Visão Geral ── */}
                    {activeTab === 'visao_geral' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {/* Comercial */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Target className="w-3.5 h-3.5" /> Comercial
                                </p>
                                {[
                                    ['Negociações ativas', fNum(kpis.comercial?.deals_fechados ?? null)],
                                    ['Ticket médio', fBRL(kpis.comercial?.ticket_medio ?? null)],
                                    ['Taxa conversão', fPct(kpis.comercial?.taxa_conversao_pct ?? null)],
                                ].map(([l, v]) => (
                                    <div key={l} className="flex justify-between text-sm">
                                        <span className="text-gray-500">{l}</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{v}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Suprimentos */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Package className="w-3.5 h-3.5" /> Suprimentos
                                </p>
                                {[
                                    ['Pedidos no período', fNum(kpis.supply?.total_pedidos ?? null)],
                                    ['Recebidos',          fNum(kpis.supply?.recebidos ?? null)],
                                    ['Taxa divergência',   fPct(kpis.supply?.taxa_divergencia_pct ?? null)],
                                    ['Lead time médio',    kpis.supply?.lead_time_medio_dias != null ? `${kpis.supply.lead_time_medio_dias} dias` : '—'],
                                ].map(([l, v]) => (
                                    <div key={l} className="flex justify-between text-sm">
                                        <span className="text-gray-500">{l}</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{v}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Operacional */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Building2 className="w-3.5 h-3.5" /> Operacional
                                </p>
                                {[
                                    ['Obras ativas',       fNum(kpis.operacional?.obras_ativas ?? null)],
                                    ['NCs abertas',        fNum(kpis.operacional?.ncs_abertas ?? null)],
                                    ['Chamados garantia',  fNum(kpis.operacional?.garantia_abertos ?? null)],
                                    ['NPS pós-obra',       fPct(kpis.operacional?.nps_medio ?? null)],
                                ].map(([l, v]) => (
                                    <div key={l} className="flex justify-between text-sm">
                                        <span className="text-gray-500">{l}</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{v}</span>
                                    </div>
                                ))}
                            </div>

                            {/* RH */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5" /> Mão de Obra
                                </p>
                                {[
                                    ['Colaboradores ativos', fNum(kpis.rh?.headcount?.ativos ?? null)],
                                    ['Admissões no mês',     fNum(kpis.rh?.periodo?.admitidos ?? null)],
                                    ['Desligamentos',        fNum(kpis.rh?.periodo?.desligados ?? null)],
                                    ['Absenteísmo',          fPct(kpis.rh?.qualidade?.absenteismo_pct ?? null)],
                                ].map(([l, v]) => (
                                    <div key={l} className="flex justify-between text-sm">
                                        <span className="text-gray-500">{l}</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{v}</span>
                                    </div>
                                ))}
                            </div>

                            {/* DRE resumo */}
                            {kpis.dre && kpis.dre.length > 0 && (
                                <div className="md:col-span-2 xl:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-3.5 h-3.5" /> DRE — Resumo do Período
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                                        {['Receita Bruta', '= Receita Líquida', '= Lucro Bruto', '= EBITDA', '= Resultado Líquido'].map(linha => {
                                            const row = kpis.dre.find(d => d.linha === linha);
                                            const v = row?.realizado ?? null;
                                            const isNeg = v !== null && v < 0;
                                            return (
                                                <div key={linha} className="text-center">
                                                    <p className="text-xs text-gray-400 font-medium">{linha.replace('= ', '')}</p>
                                                    <p className={`text-lg font-black mt-1 ${isNeg ? 'text-red-600' : 'text-gray-900'}`}>
                                                        {fBRL(v)}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Alertas */}
                            {kpis.rh?.alertas && (
                                <div className="md:col-span-2 xl:col-span-4 bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
                                    <p className="text-xs font-black text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Alertas
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Treinamentos vencendo', value: kpis.rh.alertas.treinamentos_vencendo },
                                            { label: 'Docs vencendo',         value: kpis.rh.alertas.docs_vencendo },
                                            { label: 'EPIs estoque baixo',    value: kpis.rh.alertas.epis_estoque_baixo },
                                            { label: 'Férias vencendo',       value: kpis.rh.alertas.ferias_vencendo },
                                        ].map(a => (
                                            <div key={a.label} className={`rounded-xl px-3 py-2.5 flex items-center gap-3 ${a.value > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                                                {a.value > 0
                                                    ? <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                                    : <CheckCircle  className="w-4 h-4 text-green-400 flex-shrink-0" />
                                                }
                                                <div>
                                                    <p className={`text-lg font-black ${a.value > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{a.value}</p>
                                                    <p className="text-xs text-gray-500">{a.label}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tendência 12 meses ── */}
                    {activeTab === 'tendencia' && trend.length > 0 && (
                        <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Receita, Custo e EBITDA (12 meses)</p>
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                        <defs>
                                            <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gCusto" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.10} />
                                                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                        <YAxis tickFormatter={v => fBRL(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={80} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Area type="monotone" dataKey="receita" name="Receita"  stroke="#16a34a" fill="url(#gRec)"   strokeWidth={2} dot={false} />
                                        <Area type="monotone" dataKey="custo"   name="Custo"    stroke="#dc2626" fill="url(#gCusto)" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="ebitda"  name="EBITDA"   stroke="#2563eb" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Deals Fechados e Obras Ativas</p>
                                <ResponsiveContainer width="100%" height={180}>
                                    <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={30} />
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="deals_fechados" name="Deals fechados" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="obras_ativas"   name="Obras ativas"   stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* ── vs Metas ── */}
                    {activeTab === 'metas' && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Star className="w-3.5 h-3.5" /> Realizado vs. Metas do Ano
                                </p>
                                <div className="flex gap-3 text-xs">
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />Acima</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" />Dentro</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Abaixo</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" />Sem meta</span>
                                </div>
                            </div>
                            <div className="px-5 py-2 divide-y divide-gray-50">
                                <div className="flex justify-between py-2 text-xs font-black text-gray-400 uppercase tracking-wider">
                                    <span>Indicador</span>
                                    <div className="flex gap-4">
                                        <span className="w-24 text-right">Realizado</span>
                                        <span className="w-20 text-right">Meta</span>
                                        <span className="w-14 text-right">Var. %</span>
                                    </div>
                                </div>
                                {targets.map(t => <TargetRow key={t.label} item={t} />)}
                            </div>
                            {targets.every(t => t.status === 'sem_meta') && (
                                <p className="text-xs text-gray-400 text-center pb-4">
                                    Configure metas em <strong>Minha Organização → Empresas → Metas</strong>.
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Widget de tarefas — sempre visível, não depende de kpis */}
            <MyTasksWidget orgId={organizationId} onNavigate={onNavigate} />
        </div>
    );
};

export default BIDashboard;
