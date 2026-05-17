import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Clock, CheckCircle2, XCircle, Trash2, Loader2, ChevronDown, Calendar, Filter } from 'lucide-react';
import { laborService, TimeEntry, Employee } from '../services/laborService';

interface LaborTimeTrackingProps {
    employees: Employee[];
    projects: any[];
    orgId: string;
    onRefresh: () => void;
}

const LaborTimeTracking: React.FC<LaborTimeTrackingProps> = ({ employees, projects, orgId, onRefresh }) => {
    const [entries, setEntries] = useState<TimeEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDENTE' | 'APROVADO' | 'REJEITADO'>('ALL');
    const [dateStart, setDateStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    });
    const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // New entry form state
    const [newEntry, setNewEntry] = useState({
        employee_id: '',
        project_id: '',
        project_name: '',
        date: new Date().toISOString().split('T')[0],
        hours_worked: 8,
        overtime_hours: 0,
        hourly_rate: 0,
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    const activeEmployees = employees.filter(e => e.status === 'ATIVO');

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const data = await laborService.listTimeEntries({ orgId, dateStart, dateEnd });
            setEntries(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [orgId, dateStart, dateEnd]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    const filtered = entries.filter(e => filterStatus === 'ALL' || e.status === filterStatus);
    const pendingCount = entries.filter(e => e.status === 'PENDENTE').length;

    const handleApprove = async (id: string) => {
        await laborService.approveTimeEntry(id, 'admin');
        fetchEntries(); onRefresh();
    };

    const handleReject = async (id: string) => {
        await laborService.rejectTimeEntry(id, 'admin');
        fetchEntries(); onRefresh();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remover este registro?')) return;
        await laborService.deleteTimeEntry(id);
        fetchEntries();
    };

    const handleBulkApprove = async () => {
        for (const id of selectedIds) await laborService.approveTimeEntry(id, 'admin');
        setSelectedIds(new Set());
        fetchEntries(); onRefresh();
    };

    const handleSaveEntry = async () => {
        if (!newEntry.employee_id) { alert('Selecione um colaborador.'); return; }
        setSaving(true);
        try {
            const emp = employees.find(e => e.id === newEntry.employee_id);
            const proj = projects.find(p => p.id === newEntry.project_id);
            await laborService.createTimeEntry({
                ...newEntry,
                project_name: proj?.name || proj?.settings?.name || '',
                hourly_rate: emp?.hourly_cost || 0,
                overtime_50: 0,
                overtime_100: 0,
                total_hours: newEntry.hours_worked + newEntry.overtime_hours,
                night_hours: 0,
                status: 'PENDENTE',
            });
            setShowForm(false);
            setNewEntry({ employee_id: '', project_id: '', project_name: '', date: new Date().toISOString().split('T')[0], hours_worked: 8, overtime_hours: 0, hourly_rate: 0, notes: '' });
            fetchEntries();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente'));
        } finally {
            setSaving(false);
        }
    };

    const selectAll = () => {
        const pending = filtered.filter(e => e.status === 'PENDENTE').map(e => e.id);
        setSelectedIds(prev => prev.size === pending.length ? new Set() : new Set(pending));
    };

    const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all";

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2" />
                    <span className="text-slate-300 font-bold text-xs">até</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2" />
                </div>
                <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    {(['ALL', 'PENDENTE', 'APROVADO', 'REJEITADO'] as const).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                            {s === 'ALL' ? 'Todos' : s} {s === 'PENDENTE' && pendingCount > 0 ? `(${pendingCount})` : ''}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <button onClick={handleBulkApprove} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar {selectedIds.size} selecionados
                        </button>
                    )}
                    <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                        <Plus className="w-3.5 h-3.5" /> Registrar Ponto
                    </button>
                </div>
            </div>

            {/* New Entry Form */}
            {showForm && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Novo Registro de Ponto
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="col-span-2">
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Colaborador *</label>
                            <div className="relative">
                                <select value={newEntry.employee_id} onChange={e => setNewEntry(p => ({ ...p, employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Selecione...</option>
                                    {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Obra</label>
                            <div className="relative">
                                <select value={newEntry.project_id} onChange={e => setNewEntry(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Sem obra</option>
                                    {projects.filter(p => p.settings?.classification === 'OBRA').map(p => (
                                        <option key={p.id} value={p.id}>{p.name || p.settings?.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Data</label>
                            <input type="date" value={newEntry.date} onChange={e => setNewEntry(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Horas Normais</label>
                            <input type="number" min="0" max="24" step="0.5" value={newEntry.hours_worked} onChange={e => setNewEntry(p => ({ ...p, hours_worked: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Horas Extras</label>
                            <input type="number" min="0" max="12" step="0.5" value={newEntry.overtime_hours} onChange={e => setNewEntry(p => ({ ...p, overtime_hours: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div className="col-span-2 md:col-span-3">
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Observações</label>
                            <input value={newEntry.notes} onChange={e => setNewEntry(p => ({ ...p, notes: e.target.value }))} className={inputCls} placeholder="Nota opcional..." />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all">Cancelar</button>
                        <button onClick={handleSaveEntry} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Salvar Registro
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-4 py-3 text-left">
                                    <input type="checkbox"
                                        checked={selectedIds.size > 0 && selectedIds.size === filtered.filter(e => e.status === 'PENDENTE').length}
                                        onChange={selectAll} className="rounded" />
                                </th>
                                <th className="px-4 py-3 text-left">Colaborador</th>
                                <th className="px-4 py-3 text-left">Obra</th>
                                <th className="px-4 py-3 text-left"><Calendar className="w-3 h-3 inline mr-1" />Data</th>
                                <th className="px-4 py-3 text-right">Normal</th>
                                <th className="px-4 py-3 text-right">Extra</th>
                                <th className="px-4 py-3 text-right">Custo</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.length === 0 && (
                                <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-sm">
                                    Nenhum registro de ponto encontrado para o período.
                                </td></tr>
                            )}
                            {filtered.map(entry => (
                                <tr key={entry.id} className="group hover:bg-slate-50/50 transition-all">
                                    <td className="px-4 py-3">
                                        {entry.status === 'PENDENTE' && (
                                            <input type="checkbox"
                                                checked={selectedIds.has(entry.id)}
                                                onChange={e => setSelectedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(entry.id) : n.delete(entry.id); return n; })}
                                                className="rounded" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-xs font-bold text-slate-900">{entry.employee_name || '—'}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                                            {entry.project_name || 'Sem obra'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500">
                                        {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-slate-900">{entry.hours_worked}h</td>
                                    <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">{entry.overtime_hours > 0 ? `+${entry.overtime_hours}h` : '—'}</td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-slate-900">
                                        {entry.total_cost ? `R$ ${entry.total_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black
                                            ${entry.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' :
                                              entry.status === 'REJEITADO' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1.5">
                                            {entry.status === 'PENDENTE' && (
                                                <>
                                                    <button onClick={() => handleApprove(entry.id)} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors" title="Aprovar">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleReject(entry.id)} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Rejeitar">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => handleDelete(entry.id)} className="p-1.5 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Excluir">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {filtered.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50/80 border-t border-slate-100">
                                    <td colSpan={4} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {filtered.length} registros
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-slate-900">
                                        {filtered.reduce((s, e) => s + e.hours_worked, 0).toFixed(0)}h
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">
                                        {filtered.reduce((s, e) => s + e.overtime_hours, 0).toFixed(0)}h
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">
                                        R$ {filtered.reduce((s, e) => s + (e.total_cost || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                )}
            </div>
        </div>
    );
};

export default LaborTimeTracking;
