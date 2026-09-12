import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Users, Building2, Shield, Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { laborService, LaborCostSummary, Employee, LaborTeam } from '../services/laborService';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

// Colunas da tabela padrão (§6.10)
interface CostRow { employee_id: string; name: string; estimatedCost: number; realCost?: number; hours?: number; pct: number; colorIdx: number }
const COST_COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 260 },
    { key: 'estimado', label: 'Custo estimado', sortable: true, width: 150, align: 'right' },
    { key: 'real', label: 'Custo real', sortable: true, width: 150, align: 'right' },
    { key: 'pct', label: '% realizado', sortable: true, width: 160, align: 'right' },
    { key: 'horas', label: 'Horas aprov.', sortable: true, width: 120, align: 'right' },
];

interface LaborCostsProps {
    employees: Employee[];
    teams: LaborTeam[];
    projects: any[];
    orgId: string | null;
    legacyCount?: number;
    onMigrate?: () => Promise<void>;
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

const getWorkingDays = (start: string, end: string): number => {
    let count = 0;
    const cur = new Date(start + 'T12:00:00');
    const endDate = new Date(end + 'T12:00:00');
    while (cur <= endDate) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(count, 1);
};

const LaborCosts: React.FC<LaborCostsProps> = ({ employees, orgId, legacyCount, onMigrate, organizations, onRefresh }) => {
    const [summary, setSummary] = useState<LaborCostSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'employees' | 'projects' | 'teams'>('employees');
    const [dateStart, setDateStart] = useState(() => {
        const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
    });
    const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split('T')[0]);

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        try {
            const data = await laborService.getCostSummary(orgId, { dateStart, dateEnd });
            setSummary(data);
        } catch (err) {
            console.error(err);
        } finally { setLoading(false); }
    }, [orgId, dateStart, dateEnd]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    const workingDays = useMemo(() => getWorkingDays(dateStart, dateEnd), [dateStart, dateEnd]);

    const activeEmployees = useMemo(() => employees.filter(e => e.status === 'ATIVO'), [employees]);

    const estimatedByEmployee = useMemo(() =>
        activeEmployees.map(e => {
            const dailyRate = e.daily_cost > 0 ? e.daily_cost : (e.base_salary > 0 ? e.base_salary / 22 : 0);
            return { employee_id: e.id, name: e.name, estimatedCost: dailyRate * workingDays };
        }).filter(e => e.estimatedCost > 0),
        [activeEmployees, workingDays]);

    // Linhas da tabela padrão — estimado × real por colaborador, já ordenadas pelo estimado.
    const costRows = useMemo<CostRow[]>(() =>
        [...estimatedByEmployee].sort((a, b) => b.estimatedCost - a.estimatedCost).map((est, i) => {
            const real = (summary?.byEmployee || []).find(r => r.employee_id === est.employee_id);
            const pct = est.estimatedCost > 0 ? ((real?.cost || 0) / est.estimatedCost * 100) : 0;
            return { employee_id: est.employee_id, name: est.name, estimatedCost: est.estimatedCost, realCost: real?.cost, hours: real?.hours, pct, colorIdx: i };
        }),
        [estimatedByEmployee, summary]);

    const totalEstimated = useMemo(() =>
        estimatedByEmployee.reduce((s, e) => s + e.estimatedCost, 0),
        [estimatedByEmployee]);

    const totalReal = summary?.totalCost || 0;
    const realizationPct = totalEstimated > 0 ? (totalReal / totalEstimated * 100) : 0;

    const chartData = useMemo(() => {
        if (view === 'employees') {
            const allNames = new Set([
                ...estimatedByEmployee.map(e => e.employee_id),
                ...(summary?.byEmployee || []).map(e => e.employee_id),
            ]);
            return Array.from(allNames).slice(0, 10).map(id => {
                const est = estimatedByEmployee.find(e => e.employee_id === id);
                const real = (summary?.byEmployee || []).find(e => e.employee_id === id);
                return {
                    name: (est?.name || real?.name || '').split(' ')[0],
                    estimado: est?.estimatedCost || 0,
                    real: real?.cost || 0,
                };
            }).sort((a, b) => b.estimado - a.estimado);
        }
        if (view === 'projects') {
            return (summary?.byProject || []).slice(0, 10).map(p => ({
                name: p.project_name.substr(0, 15),
                estimado: 0,
                real: p.cost,
            }));
        }
        return (summary?.byTeam || []).slice(0, 10).map(t => ({
            name: t.name.substr(0, 15),
            estimado: 0,
            real: t.cost,
        }));
    }, [view, estimatedByEmployee, summary]);

    const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
    const formatCurrencyFull = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const hasAnyData = estimatedByEmployee.length > 0 || (summary?.byEmployee || []).length > 0;

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Custos de Mão de Obra</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Custo por colaborador, obra e equipe, com base nas horas apontadas.</p>
            </div>

            {/* Summary KPIs — KpiCard (guia §4) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Custo Estimado (Folha)" value={formatCurrency(totalEstimated)} sub={`${activeEmployees.length} colaborador(es) ativo(s)`} icon={<DollarSign />} color="gray" />
                <KpiCard label="Custo Real Aprovado" value={formatCurrency(totalReal)} sub={`${(summary?.totalHours || 0).toFixed(0)}h registradas`} icon={<DollarSign />} color="indigo" />
                <KpiCard
                    label="% Realizado"
                    value={totalEstimated > 0 ? `${realizationPct.toFixed(1)}%` : '—'}
                    sub="do custo estimado"
                    icon={<TrendingUp />}
                    color={realizationPct > 100 ? 'rose' : 'emerald'}
                />
                <KpiCard
                    label="Horas Extras Aprovadas"
                    value={`${(summary?.totalOvertimeHours || 0).toFixed(0)}h`}
                    sub={summary && summary.totalHours > 0 ? `Custo médio: ${formatCurrency(totalReal / summary.totalHours)}/h` : 'sem registros aprovados'}
                    icon={<TrendingUp />}
                    color="amber"
                />
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                        className="bg-transparent text-form-input font-bold text-slate-600 outline-none px-2" />
                    <span className="text-slate-300 font-bold text-xs">até</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                        className="bg-transparent text-form-input font-bold text-slate-600 outline-none px-2" />
                </div>
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{workingDays} dias úteis</span>
                <div className="flex items-center gap-1.5 ml-auto">
                    {([
                        { id: 'employees', label: 'Por Colaborador', icon: Users },
                        { id: 'projects', label: 'Por Obra', icon: Building2 },
                        { id: 'teams', label: 'Por Equipe', icon: Shield },
                    ] as const).map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setView(id as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-form-input font-bold transition-all ${view === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Alert: ponto não aprovado */}
            {totalEstimated > 0 && totalReal === 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs font-black text-amber-800">Nenhum registro de ponto aprovado para este período</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                            O custo estimado (R$ {formatCurrency(totalEstimated)}) é baseado no custo/salário dos colaboradores.
                            Para registrar o custo real, registre as horas na aba PONTO e aprove os lançamentos.
                        </p>
                    </div>
                </div>
            )}

            {/* Chart */}
            {hasAnyData ? (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                            Custo de Mão de Obra {view === 'employees' ? 'por Colaborador' : view === 'projects' ? 'por Obra' : 'por Equipe'}
                        </h3>
                        <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-slate-400">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> Estimado</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Real</span>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`}
                                    axisLine={false} tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} width={70} />
                                <Tooltip
                                    formatter={(val: any, name: any) => [
                                        formatCurrencyFull(Number(val)),
                                        name === 'estimado' ? 'Estimado (Folha)' : 'Real (Aprovado)',
                                    ]}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 800 }}
                                />
                                <Bar dataKey="estimado" radius={[0, 4, 4, 0]} barSize={10} fill="#cbd5e1" />
                                <Bar dataKey="real" radius={[0, 8, 8, 0]} barSize={10} fill="#6366f1" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                    <div className="max-w-md mx-auto">
                        <DollarSign className="w-16 h-16 mx-auto mb-6 text-slate-200" />
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum colaborador ativo</h3>
                        <p className="text-sm text-slate-500 mt-2 mb-8">
                            Cadastre seus colaboradores com custo diário ou salário para começar a acompanhar os custos de mão de obra.
                        </p>
                        <button onClick={() => onMigrate?.()}
                            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
                            Adicionar Colaborador
                        </button>
                        {Number(legacyCount) > 0 && onMigrate && (
                            <div className="mt-8 p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                                <Users className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
                                <h4 className="text-sm font-black text-slate-900 uppercase">Colaboradores Legados</h4>
                                <p className="text-xs text-slate-500 mt-2 mb-4">
                                    Encontramos {legacyCount} colaboradores no sistema antigo. Importe-os agora!
                                </p>
                                <button onClick={onMigrate}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-button uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                                    Importar {legacyCount} Colaboradores
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Detalhamento por colaborador — tabela padrão (§6.10), totais no rodapé */}
            {estimatedByEmployee.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-900 mb-3">Detalhamento por colaborador</h3>
                    <StandardTable<CostRow>
                        storageKey="labor:costs:colaboradores"
                        columns={COST_COLUMNS}
                        rows={costRows}
                        rowKey={r => r.employee_id}
                        searchText={r => r.name}
                        searchPlaceholder="Buscar colaborador..."
                        sortValue={(key, r) => {
                            switch (key) {
                                case 'colaborador': return r.name;
                                case 'estimado': return r.estimatedCost;
                                case 'real': return r.realCost ?? null;
                                case 'pct': return r.realCost != null ? r.pct : null;
                                case 'horas': return r.hours ?? null;
                                default: return null;
                            }
                        }}
                        renderCell={(key, r) => {
                            const isOver = r.pct > 100;
                            switch (key) {
                                case 'colaborador': return (
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-normal shrink-0" style={{ background: COLORS[r.colorIdx % COLORS.length] }}>
                                            {r.name.charAt(0)}
                                        </div>
                                        <span className="text-sm font-normal text-gray-700">{r.name}</span>
                                    </div>
                                );
                                case 'estimado': return <span className="text-sm font-medium text-gray-800">{formatCurrencyFull(r.estimatedCost)}</span>;
                                case 'real': return <span className="text-sm font-medium text-gray-800">{r.realCost != null ? formatCurrencyFull(r.realCost) : '—'}</span>;
                                case 'pct': return (
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: isOver ? '#f43f5e' : COLORS[r.colorIdx % COLORS.length] }} />
                                        </div>
                                        <span className={`text-sm font-normal w-10 text-right ${isOver ? 'text-rose-600' : 'text-gray-600'}`}>{r.realCost != null ? `${r.pct.toFixed(0)}%` : '—'}</span>
                                    </div>
                                );
                                case 'horas': return <span className="text-sm font-normal text-gray-600">{r.hours != null ? `${r.hours.toFixed(1)}h` : '—'}</span>;
                                default: return null;
                            }
                        }}
                        renderTotals={visibleCount => (
                            <tr className="bg-gray-50 border-t-2 border-gray-200">
                                <td colSpan={visibleCount} className="px-6 py-2.5 text-right text-sm">
                                    <span className="text-xs font-semibold text-gray-500 mr-3">Total</span>
                                    <span className="font-medium text-gray-800">Estimado {formatCurrencyFull(totalEstimated)}</span>
                                    <span className="text-gray-400 mx-2">·</span>
                                    <span className="font-medium text-indigo-700">Real {formatCurrencyFull(totalReal)}</span>
                                    <span className="text-gray-400 mx-2">·</span>
                                    <span className="font-normal text-gray-700">{totalEstimated > 0 ? `${realizationPct.toFixed(1)}%` : '—'}</span>
                                    <span className="text-gray-400 mx-2">·</span>
                                    <span className="font-normal text-gray-700">{(summary?.totalHours || 0).toFixed(0)}h</span>
                                </td>
                            </tr>
                        )}
                        empty={{ title: 'Nenhum colaborador com custo estimado' }}
                    />
                </div>
            )}
        </div>
    );
};

export default LaborCosts;
