import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Target, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { laborService, ProductivityLog, Employee, LaborTeam } from '../services/laborService';

interface LaborProductivityProps {
    employees: Employee[];
    teams: LaborTeam[];
    projects: any[];
    orgId: string;
    onRefresh: () => void;
}

const UNITS = ['m²', 'm³', 'm', 'un', 'kg', 'h', 'pc', 'vb', 'lata', 'saco'];

const LaborProductivity: React.FC<LaborProductivityProps> = ({ employees, teams, projects, orgId, onRefresh }) => {
    const [logs, setLogs] = useState<ProductivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dateStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
    const [dateEnd] = useState(() => new Date().toISOString().split('T')[0]);

    const [form, setForm] = useState({
        employee_id: '',
        team_id: '',
        project_id: '',
        project_name: '',
        phase: '',
        activity_description: '',
        unit: 'm²',
        planned_qty: 0,
        actual_qty: 0,
        hours_spent: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
    });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await laborService.listProductivityLogs({ orgId, dateStart, dateEnd });
            setLogs(data);
        } catch { } finally { setLoading(false); }
    }, [orgId, dateStart, dateEnd]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const handleSave = async () => {
        if (!form.activity_description.trim()) { alert('Descrição da atividade é obrigatória.'); return; }
        setSaving(true);
        try {
            const proj = projects.find(p => p.id === form.project_id);
            await laborService.createProductivityLog({ ...form, project_name: proj?.name || proj?.settings?.name || '' });
            setShowForm(false);
            fetchLogs(); onRefresh();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este registro de produtividade?')) return;
        await laborService.deleteProductivityLog(id);
        fetchLogs();
    };

    // Calcular ranking de equipes
    const teamRanking = teams.map(team => {
        const teamLogs = logs.filter(l => l.team_id === team.id);
        const avgPct = teamLogs.length > 0
            ? teamLogs.reduce((s, l) => s + (l.productivity_pct || 0), 0) / teamLogs.length
            : null;
        return { team, avgPct, logCount: teamLogs.length };
    }).filter(r => r.logCount > 0).sort((a, b) => (b.avgPct || 0) - (a.avgPct || 0));

    const ProductivityBadge: React.FC<{ pct?: number | null }> = ({ pct }) => {
        if (pct == null) return <span className="text-xs text-slate-400">—</span>;
        const color = pct >= 90 ? 'text-emerald-600 bg-emerald-50' : pct >= 70 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
        const Icon = pct >= 90 ? TrendingUp : pct >= 70 ? Minus : TrendingDown;
        return (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black ${color}`}>
                <Icon className="w-3 h-3" />{pct.toFixed(0)}%
            </span>
        );
    };

    const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all";

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex justify-end">
                <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20">
                    <Plus className="w-4 h-4" /> Registrar Produção
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-black text-emerald-900 uppercase tracking-widest flex items-center gap-2">
                        <Target className="w-4 h-4" /> Novo Registro de Produtividade
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="col-span-2 md:col-span-3">
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Atividade / Serviço *</label>
                            <input value={form.activity_description} onChange={e => setForm(p => ({ ...p, activity_description: e.target.value }))} className={inputCls} placeholder="Ex: Alvenaria de vedação, Concretagem de laje..." />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Equipe</label>
                            <div className="relative">
                                <select value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Nenhuma</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Colaborador</label>
                            <div className="relative">
                                <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Nenhum</option>
                                    {employees.filter(e => e.status === 'ATIVO').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Obra</label>
                            <div className="relative">
                                <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Sem obra</option>
                                    {projects.filter(p => p.settings?.classification === 'OBRA').map(p => <option key={p.id} value={p.id}>{p.name || p.settings?.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Etapa</label>
                            <input value={form.phase} onChange={e => setForm(p => ({ ...p, phase: e.target.value }))} className={inputCls} placeholder="Fundação, Estrutura..." />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Unidade</label>
                            <div className="relative">
                                <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Qtd Planejada</label>
                            <input type="number" min="0" step="0.01" value={form.planned_qty} onChange={e => setForm(p => ({ ...p, planned_qty: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Qtd Realizada</label>
                            <input type="number" min="0" step="0.01" value={form.actual_qty} onChange={e => setForm(p => ({ ...p, actual_qty: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Horas Gastas</label>
                            <input type="number" min="0" step="0.5" value={form.hours_spent} onChange={e => setForm(p => ({ ...p, hours_spent: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block mb-1">Data</label>
                            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                        </div>
                    </div>
                    {/* Preview */}
                    {form.planned_qty > 0 && form.actual_qty > 0 && (
                        <div className="flex items-center gap-4 p-3 bg-white rounded-xl border border-emerald-100">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-slate-600">
                                Produtividade estimada: <span className={`font-black ${(form.actual_qty / form.planned_qty) >= 0.9 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {(form.actual_qty / form.planned_qty * 100).toFixed(0)}%
                                </span>
                                {form.hours_spent > 0 && form.actual_qty > 0 && ` • Homem-hora: ${(form.hours_spent / form.actual_qty).toFixed(3)} h/${form.unit}`}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            {/* Team Ranking */}
            {teamRanking.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-600" /> Ranking de Equipes por Produtividade
                    </h3>
                    <div className="space-y-3">
                        {teamRanking.map((r, i) => (
                            <div key={r.team.id} className="flex items-center gap-4">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold text-slate-800 truncate">{r.team.name}</span>
                                        <ProductivityBadge pct={r.avgPct} />
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${(r.avgPct || 0) >= 90 ? 'bg-emerald-500' : (r.avgPct || 0) >= 70 ? 'bg-amber-500' : 'bg-red-400'}`}
                                            style={{ width: `${Math.min(r.avgPct || 0, 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <span className="text-[10px] text-slate-400">{r.logCount} registros</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Logs Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-5 py-3 text-left">Data</th>
                                <th className="px-4 py-3 text-left">Atividade</th>
                                <th className="px-4 py-3 text-left">Equipe / Colaborador</th>
                                <th className="px-4 py-3 text-right">Plan.</th>
                                <th className="px-4 py-3 text-right">Real.</th>
                                <th className="px-4 py-3 text-left">H/unid</th>
                                <th className="px-4 py-3 text-left">Produtividade</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.length === 0 && (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-400">
                                    <Target className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                    Nenhum registro de produtividade. Registre o primeiro acima.
                                </td></tr>
                            )}
                            {logs.map(log => (
                                <tr key={log.id} className="group hover:bg-slate-50/50 transition-all">
                                    <td className="px-5 py-3 text-[10px] font-bold text-slate-500">
                                        {new Date(log.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-xs font-bold text-slate-900">{log.activity_description}</p>
                                        {log.phase && <p className="text-[10px] text-slate-400">{log.phase}</p>}
                                        {log.project_name && <span className="text-[9px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold">{log.project_name}</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-xs font-bold text-slate-700">{log.team_name || log.employee_name || '—'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-500">
                                        {log.planned_qty.toLocaleString('pt-BR')}<span className="text-[9px] text-slate-400 ml-0.5">{log.unit}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-slate-900">
                                        {log.actual_qty.toLocaleString('pt-BR')}<span className="text-[9px] text-slate-400 ml-0.5">{log.unit}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {log.man_hour_per_unit ? `${log.man_hour_per_unit.toFixed(3)} h/${log.unit}` : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ProductivityBadge pct={log.productivity_pct} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => handleDelete(log.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default LaborProductivity;
