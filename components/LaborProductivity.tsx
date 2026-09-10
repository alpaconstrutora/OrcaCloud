import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Target, TrendingUp, TrendingDown, Minus, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import LaborScopeBar from './LaborScopeBar';
import { useConfirm } from './ui/confirm';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { laborService, ProductivityLog, Employee, LaborTeam } from '../services/laborService';

// Colunas da tabela padrão (§6.10)
const LOG_COLUMNS: StandardTableColumn[] = [
    { key: 'data', label: 'Data', sortable: true, width: 110 },
    { key: 'atividade', label: 'Atividade', sortable: true, width: 260 },
    { key: 'quem', label: 'Equipe / colaborador', sortable: true, width: 200 },
    { key: 'plan', label: 'Plan.', sortable: true, width: 100, align: 'right' },
    { key: 'real', label: 'Real.', sortable: true, width: 100, align: 'right' },
    { key: 'hunid', label: 'H/unid', sortable: true, width: 120 },
    { key: 'produtividade', label: 'Produtividade', sortable: true, width: 150 },
];

interface LaborProductivityProps {
    employees: Employee[];
    teams: LaborTeam[];
    projects: any[];
    orgId: string | null;
    onRefresh: () => void;
    organizations: Array<{ id: string; name: string }>;
}

const UNITS = ['m²', 'm³', 'm', 'un', 'kg', 'h', 'pc', 'vb', 'lata', 'saco'];

const LaborProductivity: React.FC<LaborProductivityProps> = ({ employees, teams, projects, orgId, onRefresh, organizations }) => {
    const confirm = useConfirm();
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
        const ok = await confirm({ title: 'Excluir registro de produtividade?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
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
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Produtividade</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Registro de produção real por atividade, comparado ao planejado.</p>
            </div>

            <LaborScopeBar
                onRefresh={onRefresh}
            >
                <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                    <Plus className="w-[15px] h-[15px]" /> Registrar produção
                </button>
            </LaborScopeBar>

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
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.settings?.name}</option>)}
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
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-button font-black ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-600'}`}>
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
                                <span className="text-xs text-slate-400">{r.logCount} registros</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Logs Table */}
            {/* Tabela padrão (§6.10) */}
            <StandardTable<ProductivityLog>
                storageKey="labor:productivity:logs"
                columns={LOG_COLUMNS}
                rows={logs}
                rowKey={l => l.id}
                loading={loading}
                searchText={l => `${l.activity_description} ${l.phase ?? ''} ${l.project_name ?? ''} ${l.team_name ?? ''} ${l.employee_name ?? ''}`}
                searchPlaceholder="Buscar atividade, obra ou equipe..."
                sortValue={(key, l) => {
                    switch (key) {
                        case 'data': return l.date;
                        case 'atividade': return l.activity_description;
                        case 'quem': return l.team_name || l.employee_name || '';
                        case 'plan': return l.planned_qty;
                        case 'real': return l.actual_qty;
                        case 'hunid': return l.man_hour_per_unit ?? null;
                        case 'produtividade': return l.productivity_pct ?? null;
                        default: return null;
                    }
                }}
                renderCell={(key, log) => {
                    switch (key) {
                        case 'data': return <span className="text-sm font-normal text-gray-600">{new Date(log.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>;
                        case 'atividade': return (
                            <div>
                                <p className="text-sm font-normal text-gray-700">{log.activity_description}</p>
                                {log.phase && <p className="text-xs text-gray-400">{log.phase}</p>}
                                {log.project_name && <p className="text-xs text-blue-600">{log.project_name}</p>}
                            </div>
                        );
                        case 'quem': return <span className="text-sm font-normal text-gray-700">{log.team_name || log.employee_name || '—'}</span>;
                        case 'plan': return <span className="text-sm font-normal text-gray-600">{log.planned_qty.toLocaleString('pt-BR')}<span className="text-xs text-gray-400 ml-0.5">{log.unit}</span></span>;
                        case 'real': return <span className="text-sm font-normal text-gray-700">{log.actual_qty.toLocaleString('pt-BR')}<span className="text-xs text-gray-400 ml-0.5">{log.unit}</span></span>;
                        case 'hunid': return <span className="text-sm font-normal text-gray-600">{log.man_hour_per_unit ? `${log.man_hour_per_unit.toFixed(3)} h/${log.unit}` : '—'}</span>;
                        case 'produtividade': return <ProductivityBadge pct={log.productivity_pct} />;
                        default: return null;
                    }
                }}
                actions={{ width: 80, render: log => <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(log.id)} /> }}
                empty={{ icon: <Target className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum registro de produtividade', subtitle: 'Registre o primeiro acima.' }}
            />
        </div>
    );
};

export default LaborProductivity;
