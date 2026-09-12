import React, { useState } from 'react';
import {
    Clock, Plus, X, ChevronDown, Loader2, Search,
    TrendingUp, TrendingDown, Minus, QrCode,
    AlertTriangle, CheckCircle2, RefreshCw
} from 'lucide-react';
import { KpiCard, kpiColorFromClass } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laborService, Employee, TimeBankBalance, TimeBankEntry, QrCodeObra } from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { usePersistedState } from './ui/TableUtils';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// Colunas da tabela padrão (§6.10)
const BALANCE_COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 260 },
    { key: 'saldo', label: 'Saldo atual', sortable: true, width: 130, align: 'right' },
    { key: 'limite_max', label: 'Limite máx.', sortable: true, width: 130, align: 'right' },
    { key: 'limite_neg', label: 'Limite negativo', sortable: true, width: 150, align: 'right' },
    { key: 'situacao', label: 'Situação', sortable: true, width: 180 },
];

// ── Modal de lançamento manual ────────────────────────────────────────────────

interface EntryFormProps {
    orgId: string | null;
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
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para gravar.'); return; }
        setSaving(true);
        try {
            await laborService.addTimeBankEntry({ ...form, org_id: orgId });
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
                    <Button variant="ghost" onClick={onClose} className="text-slate-600">Cancelar</Button>
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
    orgId: string | null;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const QrCodeForm: React.FC<QrFormProps> = ({ orgId, projects, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ org_id: orgId, project_id: '', project_name: '', label: '', is_active: true, expires_at: undefined as string | undefined });

    const handleSave = async () => {
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para gravar.'); return; }
        setSaving(true);
        try {
            const selectedProject = projects.find(p => p.id === form.project_id);
            await laborService.createQrCode({ ...form, org_id: orgId, project_name: selectedProject?.name || form.project_name });
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
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-form-input font-bold text-emerald-800">
                        O token único será gerado automaticamente pelo banco de dados.
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose} className="text-slate-600">Cancelar</Button>
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
    orgId: string | null;
    employees: Employee[];
    projects?: { id: string; name: string }[];
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

type TBView = 'balances' | 'entries' | 'qrcodes';

const LaborTimeBank: React.FC<LaborTimeBankProps> = ({ orgId, employees, projects = [], organizations, onRefresh }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [view, setView] = useState<TBView>('balances');
    const [search, setSearch] = usePersistedState<string>('laborTimeBank:search', '');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [showQrForm, setShowQrForm] = useState(false);

    const balancesKey = [...laborKeys.all, 'timeBankBalances', orgId];
    const entriesKey  = [...laborKeys.all, 'timeBankEntries', orgId, filterEmployee];
    const qrKey       = [...laborKeys.all, 'qrCodes', orgId];

    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    const { data: balances = [], isLoading: loadingBal } = useQuery({
        queryKey: balancesKey,
        queryFn: () => laborService.listTimeBankBalances(orgId),
        staleTime: STALE.normal,
    });

    const { data: entries = [], isLoading: loadingEnt } = useQuery({
        queryKey: entriesKey,
        queryFn: () => laborService.listTimeBankEntries(orgId, filterEmployee || undefined),
        staleTime: STALE.fast, enabled: view === 'entries',
    });

    const { data: qrCodes = [], isLoading: loadingQr } = useQuery({
        queryKey: qrKey,
        queryFn: () => laborService.listQrCodes(orgId),
        staleTime: STALE.normal, enabled: view === 'qrcodes',
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

    const filteredEntries  = entries.filter(e => !search || (e.employee_name || '').toLowerCase().includes(search.toLowerCase()));

    const TIPO_COLORS = {
        CREDITO:     { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: TrendingUp },
        DEBITO:      { bg: 'bg-rose-100',    text: 'text-rose-700',    icon: TrendingDown },
        AJUSTE:      { bg: 'bg-blue-100',    text: 'text-blue-700',    icon: Minus },
        COMPENSACAO: { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: RefreshCw },
    };

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Banco de Horas</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Saldos de horas, lançamentos manuais e check-in por QR Code.</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Colaboradores com Saldo', value: balances.filter(b => b.saldo_horas > 0).length, bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Total Horas em Banco',    value: `${totalCredito.toFixed(1)}h`,   bg: 'bg-indigo-50',   text: 'text-indigo-700' },
                    { label: 'Horas a Compensar',       value: `${totalDebito.toFixed(1)}h`,    bg: 'bg-rose-50',     text: 'text-rose-700' },
                    { label: 'QR Codes Ativos',         value: qrCodes.filter(q => q.is_active).length, bg: 'bg-amber-50', text: 'text-amber-700' },
                ].map(({ label, value, bg }) => (
                    <KpiCard key={label} label={label} value={value} color={kpiColorFromClass(bg)} />
                ))}
            </div>

            {/* Toolbar de abas (§19.1) — busca/filtro das listas e ação primária (§17) à direita */}
            <TabsBar
                tabs={[
                    { id: 'balances', label: 'Saldos', icon: <Clock className="w-4 h-4" /> },
                    { id: 'entries', label: 'Movimentações', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'qrcodes', label: 'QR Codes', icon: <QrCode className="w-4 h-4" /> },
                ]}
                value={view}
                onChange={setView}
            >
                {view !== 'balances' && (
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                            className="h-9 pl-9 pr-4 w-48 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                    </div>
                )}
                {view === 'entries' && (
                    <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
                        <option value="">Todos</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                )}
                <button
                    onClick={() => view === 'qrcodes' ? setShowQrForm(true) : setShowEntryForm(true)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    {view === 'qrcodes' ? 'Novo QR Code' : 'Lançar horas'}
                </button>
            </TabsBar>

            {/* Saldos — tabela padrão (§6.10) */}
            {view === 'balances' && (
                <StandardTable<TimeBankBalance>
                    storageKey="labor:timebank:saldos"
                    columns={BALANCE_COLUMNS}
                    rows={balances}
                    rowKey={b => b.id}
                    loading={loadingBal}
                    searchText={b => b.employee_name ?? ''}
                    searchPlaceholder="Buscar colaborador..."
                    sortValue={(key, b) => {
                        switch (key) {
                            case 'colaborador': return b.employee_name ?? '';
                            case 'saldo': return b.saldo_horas;
                            case 'limite_max': return b.limite_maximo;
                            case 'limite_neg': return b.limite_negativo;
                            case 'situacao': return b.saldo_horas < 0 ? 0 : b.saldo_horas >= b.limite_maximo * 0.8 ? 1 : 2;
                            default: return null;
                        }
                    }}
                    renderCell={(key, b) => {
                        const isNeg = b.saldo_horas < 0;
                        const isHigh = b.saldo_horas >= b.limite_maximo * 0.8;
                        switch (key) {
                            case 'colaborador': return <span className="text-sm font-normal text-gray-700">{b.employee_name}</span>;
                            case 'saldo': return (
                                <span className={`text-sm font-normal ${isNeg ? 'text-rose-700' : isHigh ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {b.saldo_horas > 0 ? '+' : ''}{b.saldo_horas.toFixed(1)}h
                                </span>
                            );
                            case 'limite_max': return <span className="text-sm font-normal text-gray-600">{b.limite_maximo}h</span>;
                            case 'limite_neg': return <span className="text-sm font-normal text-gray-600">{b.limite_negativo}h</span>;
                            case 'situacao': return isNeg ? <span className="inline-flex items-center gap-1 text-sm font-normal text-rose-600"><AlertTriangle className="w-3 h-3" /> Negativo</span>
                                : isHigh ? <span className="inline-flex items-center gap-1 text-sm font-normal text-amber-600"><AlertTriangle className="w-3 h-3" /> Próximo do limite</span>
                                : <span className="inline-flex items-center gap-1 text-sm font-normal text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Normal</span>;
                            default: return null;
                        }
                    }}
                    empty={{ icon: <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum saldo de banco de horas', subtitle: 'Saldos são criados automaticamente ao lançar horas.' }}
                />
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
                                        <p className="text-xs text-slate-400 font-mono truncate max-w-[260px]">{qr.token}</p>
                                        <p className="text-xs text-slate-400">{qr.scan_count} scans{qr.expires_at ? ` · Expira ${qr.expires_at.split('T')[0]}` : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => toggleQr.mutate({ id: qr.id, v: !qr.is_active })}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${qr.is_active ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                            {qr.is_active ? 'Desativar' : 'Ativar'}
                                        </button>
                                        <ActionIconButton kind="delete" size="sm" onClick={async () => { const ok = await confirm({ title: 'Excluir QR Code?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' }); if (ok) deleteQr.mutate(qr.id); }} />
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
