import React, { useState } from 'react';
import {
    BookOpen, Plus, X, ChevronDown, Loader2, Search,
    CheckCircle2, Clock, Users, CloudRain, Sun, Cloud,
    Zap, Trash2, Eye, ChevronRight
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee, LaborTeam,
    LaborDiaryEntry, LaborDiaryWorker
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

const WEATHER_CONFIG = {
    BOM:         { label: 'Bom',          icon: Sun,       color: 'text-yellow-500' },
    NUBLADO:     { label: 'Nublado',      icon: Cloud,     color: 'text-slate-500' },
    CHUVA:       { label: 'Chuva',        icon: CloudRain, color: 'text-blue-500' },
    CHUVA_FORTE: { label: 'Chuva Forte',  icon: Zap,       color: 'text-indigo-600' },
};

const TURNO_LABELS = {
    MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite', INTEGRAL: 'Integral',
};

// ── Modal de Diário ───────────────────────────────────────────────────────────

interface DiaryFormProps {
    orgId: string;
    employees: Employee[];
    teams: LaborTeam[];
    projects: { id: string; name: string }[];
    diary?: LaborDiaryEntry | null;
    onClose: () => void;
    onSaved: () => void;
}

const DiaryForm: React.FC<DiaryFormProps> = ({ orgId, employees, teams, projects, diary, onClose, onSaved }) => {
    const isEditing = !!diary;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<LaborDiaryEntry>>({
        org_id: orgId,
        project_id: diary?.project_id || '',
        project_name: diary?.project_name || '',
        team_id: diary?.team_id || '',
        encarregado_id: diary?.encarregado_id || '',
        data: diary?.data || new Date().toISOString().split('T')[0],
        turno: diary?.turno || 'MANHA',
        condicao_tempo: diary?.condicao_tempo || 'BOM',
        efetivo: diary?.efetivo || 0,
        atividades: diary?.atividades || '',
        ocorrencias: diary?.ocorrencias || '',
        status: diary?.status || 'ABERTO',
    });

    // Workers list
    const [workers, setWorkers] = useState<{ employee_id: string; horas_trabalhadas: number; horas_extras: number; presente: boolean }[]>(
        (diary?.workers || []).map(w => ({ employee_id: w.employee_id, horas_trabalhadas: w.horas_trabalhadas, horas_extras: w.horas_extras, presente: w.presente }))
    );

    const teamMembers = teams.find(t => t.id === form.team_id)?.members || [];

    const addTeamWorkers = () => {
        const existing = new Set(workers.map(w => w.employee_id));
        const toAdd = teamMembers.filter(m => !existing.has(m.id)).map(m => ({
            employee_id: m.id, horas_trabalhadas: 8, horas_extras: 0, presente: true,
        }));
        setWorkers(p => [...p, ...toAdd]);
    };

    const updateWorker = (idx: number, field: string, value: any) =>
        setWorkers(p => p.map((w, i) => i === idx ? { ...w, [field]: value } : w));

    const removeWorker = (idx: number) => setWorkers(p => p.filter((_, i) => i !== idx));

    const addWorker = (employeeId: string) => {
        if (!employeeId || workers.find(w => w.employee_id === employeeId)) return;
        setWorkers(p => [...p, { employee_id: employeeId, horas_trabalhadas: 8, horas_extras: 0, presente: true }]);
    };

    const handleSave = async () => {
        if (!form.data) { alert('Data é obrigatória.'); return; }
        setSaving(true);
        try {
            const project = projects.find(p => p.id === form.project_id);
            const payload = { ...form, project_name: project?.name || form.project_name, efetivo: workers.filter(w => w.presente).length } as any;
            let entry: LaborDiaryEntry;
            if (isEditing && diary?.id) {
                entry = await laborService.updateLaborDiaryEntry(diary.id, payload);
            } else {
                entry = await laborService.createLaborDiaryEntry(payload);
            }
            await laborService.setDiaryWorkers(entry.id, workers);
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setSaving(false); }
    };

    const availableEmployees = employees.filter(e => e.status === 'ATIVO' && !workers.find(w => w.employee_id === e.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-emerald-700 to-emerald-800">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar' : 'Novo'} Diário de Obra</h2>
                        <p className="text-emerald-100 text-xs mt-0.5">Apontamento de mão de obra e atividades</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Obra">
                            <div className="relative">
                                <select value={form.project_id || ''} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Selecione uma obra...</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Equipe">
                            <div className="relative">
                                <select value={form.team_id || ''} onChange={e => setForm(p => ({ ...p, team_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem equipe específica</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Data *">
                            <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Turno">
                            <div className="relative">
                                <select value={form.turno} onChange={e => setForm(p => ({ ...p, turno: e.target.value as LaborDiaryEntry['turno'] }))} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(TURNO_LABELS) as [LaborDiaryEntry['turno'], string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                    </div>

                    {/* Condição do tempo */}
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Condição do Tempo</p>
                        <div className="grid grid-cols-4 gap-2">
                            {(Object.entries(WEATHER_CONFIG) as [LaborDiaryEntry['condicao_tempo'], typeof WEATHER_CONFIG['BOM']][]).map(([k, v]) => {
                                const Icon = v.icon;
                                return (
                                    <button key={k} type="button" onClick={() => setForm(p => ({ ...p, condicao_tempo: k }))}
                                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${form.condicao_tempo === k ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <Icon className={`w-5 h-5 ${v.color}`} />
                                        <span className="text-[10px] font-black text-slate-600">{v.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Atividades */}
                    <InputGroup label="Atividades Realizadas">
                        <textarea value={form.atividades || ''} onChange={e => setForm(p => ({ ...p, atividades: e.target.value }))} className={inputCls + ' resize-none h-20'} placeholder="Descreva as atividades do dia..." />
                    </InputGroup>
                    <InputGroup label="Ocorrências / Observações">
                        <textarea value={form.ocorrencias || ''} onChange={e => setForm(p => ({ ...p, ocorrencias: e.target.value }))} className={inputCls + ' resize-none h-16'} placeholder="Problemas, atrasos, visitas, etc." />
                    </InputGroup>

                    {/* Trabalhadores */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Colaboradores Presentes ({workers.filter(w => w.presente).length})
                            </p>
                            <div className="flex items-center gap-2">
                                {form.team_id && teamMembers.length > 0 && (
                                    <button type="button" onClick={addTeamWorkers}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black hover:bg-emerald-200 transition-all">
                                        <Users className="w-3 h-3" /> Adicionar Equipe
                                    </button>
                                )}
                                <div className="relative">
                                    <select onChange={e => { addWorker(e.target.value); e.target.value = ''; }} className="pl-3 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none appearance-none">
                                        <option value="">+ Adicionar colaborador</option>
                                        {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {workers.length === 0 ? (
                            <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <Users className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                                <p className="text-xs text-slate-400 font-medium">Adicione os colaboradores presentes</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {workers.map((w, idx) => {
                                    const emp = employees.find(e => e.id === w.employee_id);
                                    return (
                                        <div key={w.employee_id} className={`flex items-center gap-3 p-3 rounded-xl border ${w.presente ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                                            <button type="button" onClick={() => updateWorker(idx, 'presente', !w.presente)}
                                                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${w.presente ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                                                {w.presente && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                            </button>
                                            <p className="text-sm font-bold text-slate-800 w-40 truncate shrink-0">{emp?.name || w.employee_id}</p>
                                            <div className="flex items-center gap-2 flex-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-400 font-bold">HN</span>
                                                    <input type="number" min="0" max="24" step="0.5" value={w.horas_trabalhadas}
                                                        onChange={e => updateWorker(idx, 'horas_trabalhadas', parseFloat(e.target.value) || 0)}
                                                        className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-indigo-100" />
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-400 font-bold">HE</span>
                                                    <input type="number" min="0" max="8" step="0.5" value={w.horas_extras}
                                                        onChange={e => updateWorker(idx, 'horas_extras', parseFloat(e.target.value) || 0)}
                                                        className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-indigo-100" />
                                                </div>
                                            </div>
                                            <button onClick={() => removeWorker(idx)} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-rose-500 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                                <div className="flex items-center justify-between text-xs font-black text-slate-600 px-3 py-2 bg-slate-50 rounded-xl">
                                    <span>Total HH</span>
                                    <span className="text-indigo-700">
                                        {workers.filter(w => w.presente).reduce((s, w) => s + w.horas_trabalhadas + w.horas_extras, 0).toFixed(1)}h
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 text-white rounded-xl font-bold text-sm hover:bg-emerald-800 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar Diário')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborDiaryProps {
    orgId: string;
    employees: Employee[];
    teams: LaborTeam[];
    projects?: { id: string; name: string }[];
    onRefresh?: () => void;
}

const LaborDiary: React.FC<LaborDiaryProps> = ({ orgId, employees, teams, projects = [] }) => {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [filterProject, setFilterProject] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingDiary, setEditingDiary] = useState<LaborDiaryEntry | null>(null);
    const [closingId, setClosingId] = useState<string | null>(null);

    const diaryKey = [...laborKeys.all, 'laborDiary', orgId, filterProject];

    const { data: diaries = [], isLoading } = useQuery({
        queryKey: diaryKey,
        queryFn: () => laborService.listLaborDiaryEntries(orgId, { projectId: filterProject || undefined }),
        staleTime: STALE.fast, enabled: !!orgId,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: diaryKey });

    const deleteDiary = useMutation({ mutationFn: (id: string) => laborService.deleteLaborDiaryEntry(id), onSuccess: invalidate });

    const handleClose = async (id: string) => {
        if (!confirm('Fechar este diário e gerar os registros de ponto automaticamente?')) return;
        setClosingId(id);
        try {
            const result = await laborService.closeLaborDiary(id);
            invalidate();
            if (result.success) {
                alert(`Diário fechado! ${result.inserted} registro(s) de ponto gerados. ${result.skipped} já existiam. Total: ${result.total_hh}h`);
            }
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setClosingId(null); }
    };

    const open  = diaries.filter(d => d.status === 'ABERTO').length;
    const totalHH = diaries.filter(d => d.status === 'FECHADO').reduce((s, d) => s + (d.total_hh || 0), 0);

    const filtered = diaries.filter(d => !search || (d.project_name || '').toLowerCase().includes(search.toLowerCase()) || (d.team_name || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Diários em Aberto',    value: open,                           bg: 'bg-amber-50',   text: 'text-amber-700' },
                    { label: 'Diários Fechados',      value: diaries.filter(d => d.status === 'FECHADO').length, bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Total HH Apontadas',    value: `${totalHH.toFixed(1)}h`,       bg: 'bg-indigo-50',  text: 'text-indigo-700' },
                    { label: 'Total Colaboradores/dia', value: diaries.reduce((s, d) => s + d.efetivo, 0), bg: 'bg-slate-50', text: 'text-slate-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div>
                    <p className="text-sm font-black text-slate-800">Diário de Mão de Obra</p>
                    <p className="text-xs text-slate-400 mt-0.5">Ao fechar um diário, os registros de ponto são gerados automaticamente para todos os colaboradores presentes.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>
                    <div className="relative">
                        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                            <option value="">Todas as obras</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                    <button
                        onClick={() => { setEditingDiary(null); setShowForm(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 font-bold text-xs shadow-md">
                        <Plus className="w-3.5 h-3.5" /> Novo Diário
                    </button>
                </div>
            </div>

            {/* Lista */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {isLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-black text-slate-400">Nenhum diário de obra</p>
                        <p className="text-xs text-slate-400 mt-1">Crie um diário para registrar as atividades e apontar horas da equipe.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {filtered.map(d => {
                            const weather = WEATHER_CONFIG[d.condicao_tempo];
                            const WeatherIcon = weather.icon;
                            return (
                                <div key={d.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2.5 rounded-xl bg-emerald-100 shrink-0">
                                            <WeatherIcon className={`w-4 h-4 ${weather.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-sm font-black text-slate-900">{d.data}</span>
                                                <span className="text-[10px] font-bold text-slate-500">{TURNO_LABELS[d.turno]}</span>
                                                {d.project_name && <span className="text-xs font-bold text-indigo-700">{d.project_name}</span>}
                                                {d.team_name && <span className="text-xs text-slate-400">{d.team_name}</span>}
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${d.status === 'FECHADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {d.status === 'FECHADO' ? 'Fechado' : 'Em Aberto'}
                                                </span>
                                                {d.batch_generated && (
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-indigo-600">
                                                        <CheckCircle2 className="w-3 h-3" /> Ponto gerado
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                                                <span className="flex items-center gap-1 text-xs text-slate-500"><Users className="w-3 h-3" /> {d.efetivo} colaboradores</span>
                                                <span className="flex items-center gap-1 text-xs font-bold text-slate-700"><Clock className="w-3 h-3" /> {d.total_hh.toFixed(1)}h</span>
                                                {d.atividades && <span className="text-xs text-slate-400 truncate max-w-[200px]">{d.atividades}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => { setEditingDiary(d); setShowForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            {d.status === 'ABERTO' && !d.batch_generated && (
                                                <button
                                                    onClick={() => handleClose(d.id)}
                                                    disabled={closingId === d.id}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-[10px] font-black transition-all disabled:opacity-50"
                                                >
                                                    {closingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                                    Fechar + Gerar Ponto
                                                </button>
                                            )}
                                            <button onClick={() => { if (confirm('Excluir este diário?')) deleteDiary.mutate(d.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showForm && (
                <DiaryForm
                    orgId={orgId} employees={employees} teams={teams} projects={projects} diary={editingDiary}
                    onClose={() => { setShowForm(false); setEditingDiary(null); }}
                    onSaved={() => { setShowForm(false); setEditingDiary(null); invalidate(); }}
                />
            )}
        </div>
    );
};

export default LaborDiary;
