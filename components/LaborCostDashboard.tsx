import React, { useState, useEffect } from 'react';
import { 
    BarChart3, DollarSign, Building2, 
    Calendar, Loader2, TrendingUp, 
    ArrowUpRight, UserCheck, Users
} from 'lucide-react';
import { payrollService, PayrollRun } from '../services/payrollService';

interface LaborCostDashboardProps {
    orgId: string;
    legacyCount?: number;
    onMigrate?: () => Promise<void>;
}

const LaborCostDashboard: React.FC<LaborCostDashboardProps> = ({ orgId, legacyCount, onMigrate }) => {
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadingSummary, setLoadingSummary] = useState(false);

    useEffect(() => {
        loadRuns();
    }, [orgId]);

    const loadRuns = async () => {
        try {
            setLoading(true);
            const data = await payrollService.listRuns(orgId);
            // Agora permitimos RASCUNHO para validação prévia de custos por obra
            const filtered = data.filter(r => ['FECHADO', 'RASCUNHO'].includes(r.status));
            setRuns(filtered);
            if (filtered.length > 0) {
                setSelectedRun(filtered[0]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadSummary = async (runId: string) => {
        try {
            setLoadingSummary(true);
            const data = await payrollService.getWorksiteCostSummary(runId);
            setSummary(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingSummary(false);
        }
    };

    useEffect(() => {
        if (selectedRun) loadSummary(selectedRun.id);
    }, [selectedRun]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Carregando Dashboard...</p>
        </div>
    );

    if (runs.length === 0) return (
        <div className="bg-white rounded-3xl p-20 text-center border border-slate-100 shadow-sm">
            <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900 uppercase">Sem dados consolidados</h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mt-2 mb-8">
                Feche o primeiro ciclo de folha para visualizar o dashboard de custos por obra.
            </p>

            {legacyCount && legacyCount > 0 && onMigrate && (
                <div className="max-w-md mx-auto p-6 bg-amber-50 rounded-2xl border border-amber-100">
                    <Users className="w-8 h-8 text-amber-600 mx-auto mb-3" />
                    <h4 className="text-sm font-black text-slate-900 uppercase">Migração Recomendada</h4>
                    <p className="text-[11px] text-slate-500 mt-2 mb-4">
                        Temos {legacyCount} colaboradores no sistema legado que ainda não foram importados para o novo módulo de folha de pagamento.
                    </p>
                    <button 
                        onClick={onMigrate}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
                    >
                        Importar Colaboradores
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header / Filter */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Analítico de Custos por Obra
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Baseado nos resultados da folha real</p>
                </div>
                <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <select 
                        value={selectedRun?.id || ''}
                        onChange={(e) => setSelectedRun(runs.find(r => r.id === e.target.value) || null)}
                        className="text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl outline-none"
                    >
                        {runs.map(r => (
                            <option key={r.id} value={r.id}>
                                {new Date(r.start_date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                {!orgId && ` - [${r.org_id?.substring(0, 8)}]`}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loadingSummary ? (
                <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
            ) : summary ? (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-900 p-8 rounded-3xl text-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 -mr-16 -mt-16 rounded-full group-hover:scale-125 transition-transform duration-700" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Custo Total (Obra + Encargos)</p>
                            <h2 className="text-4xl font-black tracking-tighter text-white">
                                R$ {summary.total.toLocaleString()}
                            </h2>
                            <p className="text-[11px] text-indigo-400 font-bold mt-4 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" /> Folha Consolidada
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Alocado em Obras</p>
                            <h2 className="text-4xl font-black tracking-tighter text-slate-900">
                                R$ {summary.byWorksite.reduce((s: number, w: any) => s + w.cost, 0).toLocaleString()}
                            </h2>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-4 overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 rounded-full" 
                                    style={{ width: `${(summary.byWorksite.reduce((s: number, w: any) => s + w.cost, 0) / summary.total * 100).toFixed(0)}%` }} 
                                />
                            </div>
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Administrativo / Não Alocado</p>
                            <h2 className="text-4xl font-black tracking-tighter text-slate-900">
                                R$ {summary.unallocated.toLocaleString()}
                            </h2>
                            <p className="text-[11px] text-amber-500 font-bold mt-4">
                                {((summary.unallocated / summary.total) * 100).toFixed(1)}% do total
                            </p>
                        </div>
                    </div>

                    {/* Worksite Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Charts Area (CSS Based) */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-600" /> Comparativo por Obra
                            </h3>
                            <div className="space-y-6">
                                {summary.byWorksite.map((w: any) => {
                                    const pct = (w.cost / summary.total) * 100;
                                    return (
                                        <div key={w.name} className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <span className="text-xs font-black text-slate-900 uppercase truncate block max-w-xs">{w.name}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{pct.toFixed(1)}% da folha</span>
                                                </div>
                                                <span className="text-sm font-black text-slate-900">R$ {w.cost.toLocaleString()}</span>
                                            </div>
                                            <div className="h-4 bg-slate-50 rounded-lg overflow-hidden flex border border-slate-100">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-1000" 
                                                    style={{ width: `${pct}%` }} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {summary.unallocated > 0 && (
                                    <div className="space-y-2 opacity-60">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-black text-slate-400 uppercase">Administrativo</span>
                                            <span className="text-sm font-black text-slate-400">R$ {summary.unallocated.toLocaleString()}</span>
                                        </div>
                                        <div className="h-4 bg-slate-50 rounded-lg overflow-hidden flex border border-slate-100">
                                            <div 
                                                className="h-full bg-slate-300 transition-all duration-1000" 
                                                style={{ width: `${(summary.unallocated / summary.total) * 100}%` }} 
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Trends / List */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-indigo-600" /> Detalhamento de Custos
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Obra</th>
                                            <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Real</th>
                                            <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {summary.byWorksite.sort((a: any, b: any) => b.cost - a.cost).map((w: any) => (
                                            <tr key={w.name} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className="py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-indigo-50 rounded-lg group-hover:scale-110 transition-transform">
                                                            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700">{w.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-right text-xs font-black text-slate-900">
                                                    R$ {w.cost.toLocaleString()}
                                                </td>
                                                <td className="py-4 text-right">
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[9px] font-black">
                                                        {((w.cost / summary.total) * 100).toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div className="mt-8 p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-center gap-4">
                                <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm">
                                    <UserCheck className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-xs font-black text-slate-900 uppercase">Eficiência de Rateio</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">
                                        A alocação cobre {((summary.total - summary.unallocated) / summary.total * 100).toFixed(0)}% do custo total da empresa hoje.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default LaborCostDashboard;
