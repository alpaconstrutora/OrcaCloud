import React, { useState } from 'react';
import {
    Clock, Plus, X, ChevronDown, Loader2, Search,
    TrendingUp, TrendingDown, Minus, QrCode,
    AlertTriangle, CheckCircle2, RefreshCw, Trash2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laborService, Employee, TimeBankBalance, TimeBankEntry, QrCodeObra } from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Modal de lançamento manual ────────────────────────────────────────────────

interface EntryFormProps {
    orgId: string;
    employees: Employee[];
    onClose: () => void;
    onSaved: () => void;
}

const BankEntryForm: React.FC<EntryFormProps> = ({ orgId, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: orgId,
        employee_id: '',
        tipo: 'CREDITO' as TimeBankEntry['tipo'],
        horas: 1,
        descricao: '',
        referencia_data: new Date().toISOString().split('T')[0],
        created_by: 'gestor',
    });

    const handleSave = async () => {
        if (!form.employee_id || form.horas <= 0) { alert('Colaborador e horas são obrigatórios.'); return; }
        setSaving(true);
        try {
            await laborService.addTimeBankEntry(form);
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <h2 className="text-base font-black text-white">Lançamento no Banco de Horas</h2>
                    <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <InputGroup label="Colaborador *">
                        <div className="relative">
                            <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Tipo">
                            <div className="relative">
                                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TimeBankEntry['tipo'] }))} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="CREDITO">Crédito (+)</option>
                                    <option value="DEBITO">Débito (−)</option>
                                    <option value="COMPENSACAO">Compensação</option>
                                    <option value="AJUSTE">Ajuste</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Horas *">
                            <input type="number" min="0.5" step="0.5" value={form.horas} onChange={e => setForm(p => ({ ...p, horas: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </InputGroup>
                    </div>
                    <InputGroup label="Data de Referência">
                        <input type="date" value={form.referencia_data} onChange={e => setForm(p => ({ ...p, referencia_data: e.target.value }))} className={inputCls} />
                    </InputGroup>
                    <InputGroup label="Descrição">
                        <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className={inputCls} placeholder="Ex: Hora extra 15/01, compensação folga..." />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Lançar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal de QR Code ──────────────────────────────────────────────────────────

interface QrFormProps {
    orgId: string;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const QrCodeForm: React.FC<QrFormProps> = ({ orgId, projects, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ org_id: orgId, project_id: '', project_name: '', label: '', is_active: true, expires_at: undefined as string | undefined });

    const handleSave = async () => {
        setSaving(true);
        try {
            const selectedProject = projects.find(p => p.id === form.project_id);
            await laborService.createQrCode({ ...form, project_name: selectedProject?.name || form.project_name });
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <h2 className="text-base font-black text-white">Novo QR Code de Obra</h2>
                    <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <InputGroup label="Obra">
                        <div className="relative">
                            <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione uma obra...</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <InputGroup label="Ponto de acesso (ex: Portão Principal)">
                        <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className={inputCls} placeholder="Ex: Portaria, Andar 5..." />
                    </InputGroup>
                    <InputGroup label="Expiração (opcional)">
                        <input type="datetime-local" value={form.expires_at || ''} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value || undefined }))} className={inputCls} />
                    </InputGroup>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs font-bold text-emerald-800">
                        O token único será gerado automaticamente pelo banco de dados.
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Criar QR Code
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborTimeBankProps {
    orgId: string;
    employees: Employee[];
    projects?: { id: string; name: string }[];
}

type TBView = 'balances' | 'entries' | 'qrcodes';

const LaborTimeBank: React.FC<LaborTimeBankProps> = ({ orgId, employees, projects = [] }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<TBView>('balances');
    const [search, setSearch] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [showQrForm, setShowQrForm] = useState(false);

    const balancesKey = [...laborKeys.all, 'timeBankBalances', orgId];
    const entriesKey  = [...laborKeys.all, 'timeBankEntries', orgId, filterEmployee];
    const qrKey       = [...laborKeys.all, 'qrCodes', orgId];

    const { data: balances = [], isLoading: loadingBal } = useQuery({
        queryKey: balancesKey,
        queryFn: () => laborService.listTimeBankBalances(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const { data: entries = [], isLoading: loadingEnt } = useQuery({
        queryKey: entriesKey,
        queryFn: () => laborService.listTimeBankEntries(orgId, filterEmployee || undefined),
        staleTime: STALE.fast, enabled: !!orgId && view === 'entries',
    });

    const { data: qrCodes = [], isLoading: loadingQr } = useQuery({
        queryKey: qrKey,
        queryFn: () => laborService.listQrCodes(orgId),
        staleTime: STALE.normal, enabled: !!orgId && view === 'qrcodes',
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: balancesKey });
        qc.invalidateQueries({ queryKey: entriesKey });
        qc.invalidateQueries({ queryKey: qrKey });
    };

    const toggleQr   = useMutation({ mutationFn: ({ id, v }: { id: string; v: boolean }) => laborService.toggleQrCode(id, v), onSuccess: invalidate });
    const deleteQr   = useMutation({ mutationFn: (id: string) => laborService.deleteQrCode(id), onSuccess: invalidate });

    const totalCredito = balances.filter(b => b.saldo_horas > 0).reduce((s, b) => s + b.saldo_horas, 0);
    const totalDebito  = balances.filter(b => b.saldo_horas < 0).reduce((s, b) => s + Math.abs(b.saldo_horas), 0);

    const filteredBalances = balances.filter(b => !search || (b.employee_name || '').toLowerCase().includes(search.toLowerCase()));
    const filteredEntries  = entries.filter(e => !search || (e.employee_name || '').toLowerCase().includes(search.toLowerCase()));

    const TIPO_COLORS = {
        CREDITO:     { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: TrendingUp },
        DEBITO:      { bg: 'bg-rose-100',    text: 'text-rose-700',    icon: TrendingDown },
        AJUSTE:      { bg: 'bg-blue-100',    text: 'text-blue-700',    icon: Minus },
        COMPENSACAO: { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: RefreshCw },
    };

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Colaboradores com Saldo', value: balances.filter(b => b.saldo_horas > 0).length, bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Total Horas em Banco',    value: `${totalCredito.toFixed(1)}h`,   bg: 'bg-indigo-50',   text: 'text-indigo-700' },
                    { label: 'Horas a Compensar',       value: `${totalDebito.toFixed(1)}h`,    bg: 'bg-rose-50',     text: 'text-rose-700' },
                    { label: 'QR Codes Ativos',         value: qrCodes.filter(q => q.is_active).length, bg: 'bg-amber-50', text: 'text-amber-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    {([['balances', 'Saldos', Clock], ['entries', 'Movimentações', TrendingUp], ['qrcodes', 'QR Codes', QrCode]] as const).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>
                    {view === 'entries' && (
                        <div className="relative">
                            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none">
                                <option value="">Todos</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    )}
                    <button
                        onClick={() => view === 'qrcodes' ? setShowQrForm(true) : setShowEntryForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-xs shadow-md"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'qrcodes' ? 'Novo QR Code' : 'Lançar Horas'}
                    </button>
                </div>
            </div>

            {/* Saldos */}
            {view === 'balances' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingBal ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : filteredBalances.length === 0 ? (
                        <div className="text-center py-16">
                            <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum saldo de banco de horas</p>
                            <p className="text-xs text-slate-400 mt-1">Saldos são criados automaticamente ao lançar horas.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Colaborador', 'Saldo Atual', 'Limite Máx.', 'Limite Negativo', 'Situação'].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBalances.map(b => {
                                    const isNeg = b.saldo_horas < 0;
                                    const isHigh = b.saldo_horas >= b.limite_maximo * 0.8;
                                    return (
                                        <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-4 py-3 text-sm font-bold text-slate-900">{b.employee_name}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${isNeg ? 'bg-rose-100 text-rose-700' : isHigh ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {b.saldo_horas > 0 ? '+' : ''}{b.saldo_horas.toFixed(1)}h
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{b.limite_maximo}h</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{b.limite_negativo}h</td>
                                            <td className="px-4 py-3">
                                                {isNeg ? <span className="flex items-center gap-1 text-xs font-black text-rose-600"><AlertTriangle className="w-3 h-3" /> Negativo</span>
                                                : isHigh ? <span className="flex items-center gap-1 text-xs font-black text-amber-600"><AlertTriangle className="w-3 h-3" /> Próximo do limite</span>
                                                : <span className="flex items-center gap-1 text-xs font-black text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Normal</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Movimentações */}
            {view === 'entries' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingEnt ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : filteredEntries.length === 0 ? (
                        <div className="text-center py-16">
                            <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhuma movimentação</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {filteredEntries.map(e => {
                                const cfg = TIPO_COLORS[e.tipo];
                                const EntryIcon = cfg.icon;
                                return (
                                    <div key={e.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50">
                                        <div className={`p-2 rounded-xl ${cfg.bg} shrink-0`}>
                                            <EntryIcon className={`w-4 h-4 ${cfg.text}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-900">{e.employee_name}</p>
                                            <p className="text-xs text-slate-400">{e.descricao || e.tipo} · {e.referencia_data}</p>
                                        </div>
                                        <span className={`text-sm font-black ${e.tipo === 'CREDITO' || e.tipo === 'AJUSTE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {e.tipo === 'CREDITO' || e.tipo === 'AJUSTE' ? '+' : '−'}{e.horas.toFixed(1)}h
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* QR Codes */}
            {view === 'qrcodes' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingQr ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : qrCodes.length === 0 ? (
                        <div className="text-center py-16">
                            <QrCode className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum QR Code gerado</p>
                            <p className="text-xs text-slate-400 mt-1">Crie QR Codes para check-in nas obras via PWA.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {qrCodes.map(qr => (
                                <div key={qr.id} className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50/50">
                                    <div className={`p-2.5 rounded-xl ${qr.is_active ? 'bg-emerald-100' : 'bg-slate-100'} shrink-0`}>
                                        <QrCode className={`w-5 h-5 ${qr.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900">{qr.project_name || 'Sem obra'}{qr.label ? ` — ${qr.label}` : ''}</p>
                                        <p className="text-[11px] text-slate-400 font-mono truncate max-w-[260px]">{qr.token}</p>
                                        <p className="text-[10px] text-slate-400">{qr.scan_count} scans{qr.expires_at ? ` · Expira ${qr.expires_at.split('T')[0]}` : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => toggleQr.mutate({ id: qr.id, v: !qr.is_active })}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${qr.is_active ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                            {qr.is_active ? 'Desativar' : 'Ativar'}
                                        </button>
                                        <button onClick={() => { if (confirm('Excluir este QR Code?')) deleteQr.mutate(qr.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {showEntryForm && <BankEntryForm orgId={orgId} employees={employees} onClose={() => setShowEntryForm(false)} onSaved={() => { setShowEntryForm(false); invalidate(); }} />}
            {showQrForm && <QrCodeForm orgId={orgId} projects={projects} onClose={() => setShowQrForm(false)} onSaved={() => { setShowQrForm(false); invalidate(); }} />}
        </div>
    );
};

export default LaborTimeBank;
