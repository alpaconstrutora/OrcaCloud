import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Clock, CheckCircle2, XCircle, Loader2, ChevronDown, Calendar, Filter } from 'lucide-react';
import { laborService, TimeEntry, Employee } from '../services/laborService';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';

// Colunas da tabela padrão (§6.10)
const ENTRY_COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 220 },
    { key: 'obra', label: 'Obra', sortable: true, width: 180 },
    { key: 'data', label: 'Data', sortable: true, width: 110 },
    { key: 'normal', label: 'Normal', sortable: true, width: 90, align: 'right' },
    { key: 'extra', label: 'Extra', sortable: true, width: 90, align: 'right' },
    { key: 'custo', label: 'Custo', sortable: true, width: 130, align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 120 },
];

interface LaborTimeTrackingProps {
    employees: Employee[];
    projects: any[];
    orgId: string | null;
    onRefresh: () => void;
    organizations: Array<{ id: string; name: string }>;
}

const LaborTimeTracking: React.FC<LaborTimeTrackingProps> = ({ employees, projects, orgId, onRefresh, organizations }) => {
    const confirm = useConfirm();
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
        const ok = await confirm({ title: 'Remover registro de ponto?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Remover' });
        if (!ok) return;
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


    const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all";

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Registro de Ponto</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Apontamento de horas trabalhadas, aprovação e controle de horas extras.</p>
            </div>

            {/* Toolbar de botões (§5.3): período (escopo) à esquerda, ação primária (§17) à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    <span className="text-gray-400 text-xs font-medium">até</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                </div>
                <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                    <Plus className="w-[15px] h-[15px]" /> Registrar ponto
                </button>
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
                                    {projects.map(p => (
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
                        <Button variant="ghost" onClick={() => setShowForm(false)} className="text-slate-600 hover:bg-white">Cancelar</Button>
                        <button onClick={handleSaveEntry} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Salvar Registro
                        </button>
                    </div>
                </div>
            )}

            {/* Tabela padrão (§6.10) — filtro rápido de status na toolbar acoplada; seleção em lote §10 */}
            <StandardTable<TimeEntry>
                storageKey="labor:timetracking:registros"
                columns={ENTRY_COLUMNS}
                rows={filtered}
                rowKey={e => e.id}
                loading={loading}
                searchText={e => `${e.employee_name ?? ''} ${e.project_name ?? ''} ${e.status}`}
                searchPlaceholder="Buscar colaborador ou obra..."
                filters={
                    <div className="flex items-center gap-1.5">
                        {(['ALL', 'PENDENTE', 'APROVADO', 'REJEITADO'] as const).map(st => (
                            <button key={st} onClick={() => setFilterStatus(st)}
                                className={`h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${filterStatus === st ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {st === 'ALL' ? 'Todos' : st === 'PENDENTE' ? 'Pendente' : st === 'APROVADO' ? 'Aprovado' : 'Rejeitado'}{st === 'PENDENTE' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                            </button>
                        ))}
                    </div>
                }
                selection={{ selected: selectedIds, onChange: setSelectedIds, canSelect: e => e.status === 'PENDENTE' }}
                sortValue={(key, e) => {
                    switch (key) {
                        case 'colaborador': return e.employee_name ?? '';
                        case 'obra': return e.project_name ?? '';
                        case 'data': return e.date;
                        case 'normal': return e.hours_worked;
                        case 'extra': return e.overtime_hours;
                        case 'custo': return e.total_cost ?? 0;
                        case 'status': return e.status;
                        default: return null;
                    }
                }}
                renderCell={(key, entry) => {
                    switch (key) {
                        case 'colaborador': return <span className="text-sm font-normal text-gray-700">{entry.employee_name || '—'}</span>;
                        case 'obra': return <span className="text-sm font-normal text-blue-600">{entry.project_name || 'Sem obra'}</span>;
                        case 'data': return <span className="text-sm font-normal text-gray-600">{new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>;
                        case 'normal': return <span className="text-sm font-normal text-gray-700">{entry.hours_worked}h</span>;
                        case 'extra': return <span className="text-sm font-normal text-amber-600">{entry.overtime_hours > 0 ? `+${entry.overtime_hours}h` : '—'}</span>;
                        case 'custo': return <span className="text-sm font-medium text-gray-800">{entry.total_cost ? `R$ ${entry.total_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</span>;
                        case 'status': return (
                            <span className={`text-sm font-normal ${entry.status === 'APROVADO' ? 'text-emerald-700' : entry.status === 'REJEITADO' ? 'text-red-700' : 'text-amber-700'}`}>
                                {entry.status}
                            </span>
                        );
                        default: return null;
                    }
                }}
                actions={{
                    width: 130,
                    render: entry => (
                        <>
                            {entry.status === 'PENDENTE' && (
                                <>
                                    <ActionIconButton kind="view" title="Aprovar" icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => handleApprove(entry.id)} />
                                    <ActionIconButton kind="delete" title="Rejeitar" icon={<XCircle className="w-4 h-4" />} onClick={() => handleReject(entry.id)} />
                                </>
                            )}
                            <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(entry.id)} />
                        </>
                    ),
                }}
                renderTotals={visibleCount => (
                    <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={visibleCount} className="px-6 py-2.5 text-right text-sm">
                            <span className="text-xs font-semibold text-gray-500 mr-3">{filtered.length} registros</span>
                            <span className="font-normal text-gray-700">{filtered.reduce((sum, e) => sum + e.hours_worked, 0).toFixed(0)}h</span>
                            <span className="text-gray-400 mx-2">·</span>
                            <span className="font-normal text-amber-600">+{filtered.reduce((sum, e) => sum + e.overtime_hours, 0).toFixed(0)}h</span>
                            <span className="text-gray-400 mx-2">·</span>
                            <span className="font-medium text-emerald-700">R$ {filtered.reduce((sum, e) => sum + (e.total_cost || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </td>
                    </tr>
                )}
                empty={{ icon: <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum registro de ponto', subtitle: 'Nenhum registro encontrado para o período.' }}
            />

            {/* Barra de ações em lote (§10) — fixa no rodapé */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button onClick={handleBulkApprove} className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar selecionados
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl text-sm font-medium hover:bg-blue-400 transition-colors">
                        <XCircle className="w-3.5 h-3.5" /> Desmarcar
                    </button>
                </div>
            )}
        </div>
    );
};

export default LaborTimeTracking;
