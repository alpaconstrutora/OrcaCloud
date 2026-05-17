import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Users, Building2, Shield, Loader2, TrendingUp } from 'lucide-react';
import { laborService, LaborCostSummary, Employee, LaborTeam } from '../services/laborService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface LaborCostsProps {
    employees: Employee[];
    teams: LaborTeam[];
    projects: any[];
    orgId: string;
    legacyCount?: number;
    onMigrate?: () => Promise<void>;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

const LaborCosts: React.FC<LaborCostsProps> = ({ employees, orgId, legacyCount, onMigrate }) => {
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

    const chartData = view === 'employees'
        ? (summary?.byEmployee || []).slice(0, 10).map(e => ({ name: e.name.split(' ')[0], value: e.cost, hours: e.hours }))
        : view === 'projects'
        ? (summary?.byProject || []).slice(0, 10).map(p => ({ name: p.project_name.substr(0, 15), value: p.cost, hours: p.hours }))
        : (summary?.byTeam || []).slice(0, 10).map(t => ({ name: t.name.substr(0, 15), value: t.cost, hours: t.hours }));

    const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2" />
                    <span className="text-slate-300 font-bold text-xs">até</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2" />
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                    {([
                        { id: 'employees', label: 'Por Colaborador', icon: Users },
                        { id: 'projects', label: 'Por Obra', icon: Building2 },
                        { id: 'teams', label: 'Por Equipe', icon: Shield },
                    ] as const).map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setView(id as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Custo Total Aprovado', value: formatCurrency(summary?.totalCost || 0), icon: DollarSign, color: 'indigo' },
                    { label: 'Horas Normais', value: `${(summary?.totalHours || 0).toFixed(0)}h`, icon: TrendingUp, color: 'emerald' },
                    { label: 'Horas Extras', value: `${(summary?.totalOvertimeHours || 0).toFixed(0)}h`, icon: TrendingUp, color: 'amber' },
                    { label: 'Custo Médio/Hora', value: summary && summary.totalHours > 0 ? formatCurrency(summary.totalCost / summary.totalHours) : '—', icon: DollarSign, color: 'rose' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm`}>
                        <div className={`p-2.5 bg-${color}-50 rounded-xl w-fit mb-3`}>
                            <Icon className={`w-5 h-5 text-${color}-600`} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className="text-xl font-black text-slate-900">{value}</p>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 ? (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-5">
                        Custo de Mão de Obra {view === 'employees' ? 'por Colaborador' : view === 'projects' ? 'por Obra' : 'por Equipe'}
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} width={70} />
                                <Tooltip
                                    formatter={(val: any) => [formatCurrency(Number(val)), 'Custo']}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 800 }}
                                />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
                                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                    <div className="max-w-md mx-auto">
                        <DollarSign className="w-16 h-16 mx-auto mb-6 text-slate-200" />
                        
                        {employees.length === 0 ? (
                            <>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum colaborador ativo</h3>
                                <p className="text-sm text-slate-500 mt-2 mb-8">
                                    Cadastre seus colaboradores para começar a acompanhar os custos de mão de obra em tempo real.
                                </p>
                                <button 
                                    onClick={() => onMigrate?.()}
                                    className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                                >
                                    Adicionar Colaborador
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Custo aprovado: R$ 0</h3>
                                <p className="text-sm text-slate-500 mt-2 mb-8">
                                    Você tem {employees.length} colaborador(es) cadastrado(s), mas nenhum registro de ponto foi aprovado para este período ainda.
                                </p>
                                <div className="flex flex-col gap-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Próximos passos:</p>
                                    <div className="grid grid-cols-1 gap-2 text-left">
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">1</div>
                                            <p className="text-xs font-bold text-slate-700">Registre as horas na aba "PONTO"</p>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">2</div>
                                            <p className="text-xs font-bold text-slate-700">Aprove os registros para consolidar os custos</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {Number(legacyCount) > 0 && onMigrate && (
                            <div className="mt-12 p-6 bg-indigo-50 rounded-3xl border border-indigo-100 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <Users className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
                                <h4 className="text-sm font-black text-slate-900 uppercase">Colaboradores Legados</h4>
                                <p className="text-[11px] text-slate-500 mt-2 mb-4">
                                    Encontramos {legacyCount} colaboradores no sistema antigo. 
                                    Importe-os agora para agilizar seu controle!
                                </p>
                                <button 
                                    onClick={onMigrate}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                                >
                                    Importar {legacyCount} Colaboradores
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Detail Table */}
            {(summary?.byEmployee || []).length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Detalhamento por Colaborador</h3>
                    </div>
                    <table className="w-full">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-6 py-3 text-left">Colaborador</th>
                                <th className="px-4 py-3 text-right">Horas</th>
                                <th className="px-4 py-3 text-right">Custo Total</th>
                                <th className="px-4 py-3 text-right">% do Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {(summary?.byEmployee || []).sort((a, b) => b.cost - a.cost).map((emp, i) => {
                                const pct = summary && summary.totalCost > 0 ? (emp.cost / summary.totalCost * 100) : 0;
                                return (
                                    <tr key={emp.employee_id} className="hover:bg-slate-50/50 transition-all">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ background: COLORS[i % COLORS.length] }}>
                                                    {emp.name.charAt(0)}
                                                </div>
                                                <span className="text-xs font-bold text-slate-800">{emp.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">{emp.hours.toFixed(1)}h</td>
                                        <td className="px-4 py-3 text-right text-xs font-black text-slate-900">{formatCurrency(emp.cost)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default LaborCosts;
