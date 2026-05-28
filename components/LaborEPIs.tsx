import React, { useState } from 'react';
import {
    HardHat, Plus, Package, User, AlertTriangle, CheckCircle2, X,
    ChevronDown, Loader2, Search, RotateCcw, Trash2, Eye, ShieldCheck
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laborService, EpiCatalogItem, EpiDelivery, EpiCategoria, Employee } from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

const EPI_CATEGORIA_LABELS: Record<EpiCategoria, string> = {
    PROTECAO_CABECA: 'Proteção da Cabeça',
    PROTECAO_OLHOS_FACE: 'Proteção dos Olhos e Face',
    PROTECAO_AUDITIVA: 'Proteção Auditiva',
    PROTECAO_RESPIRATORIA: 'Proteção Respiratória',
    PROTECAO_TRONCO: 'Proteção do Tronco',
    PROTECAO_MEMBROS_SUPERIORES: 'Proteção Membros Superiores',
    PROTECAO_MEMBROS_INFERIORES: 'Proteção Membros Inferiores',
    PROTECAO_QUEDAS: 'Proteção contra Quedas',
    OUTROS: 'Outros',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';

const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Formulário de EPI (catálogo) ─────────────────────────────────────────────

interface EpiFormProps {
    orgId: string;
    item?: EpiCatalogItem | null;
    onClose: () => void;
    onSaved: () => void;
}

const EpiCatalogForm: React.FC<EpiFormProps> = ({ orgId, item, onClose, onSaved }) => {
    const isEditing = !!item;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<EpiCatalogItem>>({
        org_id: orgId,
        nome: item?.nome || '',
        descricao: item?.descricao || '',
        ca: item?.ca || '',
        ca_validade: item?.ca_validade || '',
        unidade: item?.unidade || 'un',
        estoque_atual: item?.estoque_atual ?? 0,
        estoque_minimo: item?.estoque_minimo ?? 0,
        custo_unitario: item?.custo_unitario ?? 0,
        fornecedor: item?.fornecedor || '',
        categoria: item?.categoria || 'PROTECAO_CABECA',
        status: item?.status || 'ATIVO',
    });

    const set = <K extends keyof EpiCatalogItem>(k: K, v: EpiCatalogItem[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.nome?.trim()) { alert('Nome é obrigatório.'); return; }
        setSaving(true);
        try {
            if (isEditing && item?.id) {
                await laborService.updateEpiCatalogItem(item.id, form);
            } else {
                await laborService.createEpiCatalogItem(form as Omit<EpiCatalogItem, 'id' | 'created_at' | 'updated_at'>);
            }
            onSaved();
        } catch (err: any) {
            alert('Erro ao salvar EPI: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500 to-amber-600">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar EPI' : 'Novo EPI'}</h2>
                        <p className="text-amber-100 text-xs mt-0.5">Catálogo de Equipamentos de Proteção Individual</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <InputGroup label="Nome do EPI *">
                                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Ex: Capacete de Segurança" />
                            </InputGroup>
                        </div>
                        <div className="md:col-span-2">
                            <InputGroup label="Descrição">
                                <input value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} className={inputCls} placeholder="Modelo, especificações..." />
                            </InputGroup>
                        </div>
                        <InputGroup label="Categoria *">
                            <div className="relative">
                                <select value={form.categoria} onChange={e => set('categoria', e.target.value as EpiCategoria)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(EPI_CATEGORIA_LABELS) as [EpiCategoria, string][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Unidade">
                            <input value={form.unidade} onChange={e => set('unidade', e.target.value)} className={inputCls} placeholder="un, par, cx..." />
                        </InputGroup>
                        <InputGroup label="Nº CA (Certificado de Aprovação)">
                            <input value={form.ca || ''} onChange={e => set('ca', e.target.value)} className={inputCls} placeholder="Ex: 12345" />
                        </InputGroup>
                        <InputGroup label="Validade do CA">
                            <input type="date" value={form.ca_validade || ''} onChange={e => set('ca_validade', e.target.value || undefined)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Estoque Atual">
                            <input type="number" min="0" value={form.estoque_atual} onChange={e => set('estoque_atual', parseInt(e.target.value) || 0)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Estoque Mínimo (alerta)">
                            <input type="number" min="0" value={form.estoque_minimo} onChange={e => set('estoque_minimo', parseInt(e.target.value) || 0)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Custo Unitário (R$)">
                            <input type="number" min="0" step="0.01" value={form.custo_unitario} onChange={e => set('custo_unitario', parseFloat(e.target.value) || 0)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Fornecedor">
                            <input value={form.fornecedor || ''} onChange={e => set('fornecedor', e.target.value)} className={inputCls} placeholder="Nome do fornecedor" />
                        </InputGroup>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all font-bold text-sm shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Cadastrar EPI')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal de Entrega ─────────────────────────────────────────────────────────

interface DeliveryFormProps {
    orgId: string;
    employees: Employee[];
    catalog: EpiCatalogItem[];
    onClose: () => void;
    onSaved: () => void;
}

const EpiDeliveryForm: React.FC<DeliveryFormProps> = ({ orgId, employees, catalog, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: orgId,
        epi_id: '',
        employee_id: '',
        quantidade: 1,
        delivered_at: new Date().toISOString().split('T')[0],
        motivo: '',
        is_returned: false,
        notes: '',
    });

    const availableEpis = catalog.filter(e => e.status === 'ATIVO' && e.estoque_atual > 0);
    const selectedEpi = catalog.find(e => e.id === form.epi_id);

    const handleSave = async () => {
        if (!form.epi_id) { alert('Selecione um EPI.'); return; }
        if (!form.employee_id) { alert('Selecione um colaborador.'); return; }
        if (selectedEpi && form.quantidade > selectedEpi.estoque_atual) {
            alert(`Estoque insuficiente. Disponível: ${selectedEpi.estoque_atual} ${selectedEpi.unidade}`);
            return;
        }
        setSaving(true);
        try {
            await laborService.createEpiDelivery(form);
            onSaved();
        } catch (err: any) {
            alert('Erro ao registrar entrega: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">Registrar Entrega</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Entrega de EPI ao colaborador</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <InputGroup label="Colaborador *">
                        <div className="relative">
                            <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {employees.filter(emp => emp.status === 'ATIVO').map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} — {emp.role}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <InputGroup label="EPI *">
                        <div className="relative">
                            <select value={form.epi_id} onChange={e => setForm(p => ({ ...p, epi_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {availableEpis.map(epi => (
                                    <option key={epi.id} value={epi.id}>{epi.nome} (Estoque: {epi.estoque_atual} {epi.unidade})</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    {selectedEpi && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-3 text-xs">
                            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="font-bold text-amber-800">CA: {selectedEpi.ca || 'N/A'} · Estoque: {selectedEpi.estoque_atual} {selectedEpi.unidade}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Quantidade">
                            <input type="number" min="1" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: parseInt(e.target.value) || 1 }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Data de Entrega">
                            <input type="date" value={form.delivered_at} onChange={e => setForm(p => ({ ...p, delivered_at: e.target.value }))} className={inputCls} />
                        </InputGroup>
                    </div>
                    <InputGroup label="Motivo da Entrega">
                        <input value={form.motivo} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} className={inputCls} placeholder="Ex: Admissão, Desgaste, Perda, NR-18..." />
                    </InputGroup>
                    <InputGroup label="Observações">
                        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputCls + ' resize-none h-16'} />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Registrando...' : 'Registrar Entrega'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborEPIsProps {
    orgId: string;
    employees: Employee[];
    onRefresh?: () => void;
}

type EpiView = 'catalog' | 'deliveries';

const LaborEPIs: React.FC<LaborEPIsProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<EpiView>('catalog');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<EpiCatalogItem | null>(null);
    const [showDeliveryForm, setShowDeliveryForm] = useState(false);
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterIncludeReturned, setFilterIncludeReturned] = useState(false);

    const catalogKey = [...laborKeys.all, 'epiCatalog', orgId];
    const deliveriesKey = [...laborKeys.all, 'epiDeliveries', orgId, filterEmployee, filterIncludeReturned];

    const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
        queryKey: catalogKey,
        queryFn: () => laborService.listEpiCatalog(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const { data: deliveries = [], isLoading: loadingDeliveries } = useQuery({
        queryKey: deliveriesKey,
        queryFn: () => laborService.listEpiDeliveries({
            orgId,
            employeeId: filterEmployee || undefined,
            includeReturned: filterIncludeReturned,
        }),
        staleTime: STALE.fast,
        enabled: !!orgId,
    });

    const { data: alerts } = useQuery({
        queryKey: [...laborKeys.all, 'epiAlerts', orgId],
        queryFn: () => laborService.getEpiAlerts(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: catalogKey });
        qc.invalidateQueries({ queryKey: deliveriesKey });
        qc.invalidateQueries({ queryKey: [...laborKeys.all, 'epiAlerts', orgId] });
    };

    const deleteMutation = useMutation({
        mutationFn: laborService.deleteEpiCatalogItem.bind(laborService),
        onSuccess: invalidate,
    });

    const returnMutation = useMutation({
        mutationFn: (id: string) => laborService.returnEpi(id),
        onSuccess: invalidate,
    });

    const filteredCatalog = catalog.filter(item =>
        item.nome.toLowerCase().includes(search.toLowerCase()) ||
        (item.ca || '').toLowerCase().includes(search.toLowerCase())
    );

    const filteredDeliveries = deliveries.filter(d =>
        !search ||
        (d.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (d.epi_nome || '').toLowerCase().includes(search.toLowerCase())
    );

    const categoriaColors: Record<EpiCategoria, string> = {
        PROTECAO_CABECA: 'bg-yellow-100 text-yellow-700',
        PROTECAO_OLHOS_FACE: 'bg-blue-100 text-blue-700',
        PROTECAO_AUDITIVA: 'bg-purple-100 text-purple-700',
        PROTECAO_RESPIRATORIA: 'bg-teal-100 text-teal-700',
        PROTECAO_TRONCO: 'bg-orange-100 text-orange-700',
        PROTECAO_MEMBROS_SUPERIORES: 'bg-indigo-100 text-indigo-700',
        PROTECAO_MEMBROS_INFERIORES: 'bg-cyan-100 text-cyan-700',
        PROTECAO_QUEDAS: 'bg-red-100 text-red-700',
        OUTROS: 'bg-slate-100 text-slate-700',
    };

    return (
        <div className="space-y-6">
            {/* Alertas */}
            {(alerts && (alerts.lowStock.length > 0 || alerts.expiredCa.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {alerts.lowStock.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Estoque Baixo</p>
                                <p className="text-[11px] text-amber-700 mt-1">{alerts.lowStock.map(i => i.nome).join(', ')}</p>
                            </div>
                        </div>
                    )}
                    {alerts.expiredCa.length > 0 && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-rose-900 uppercase tracking-tight">CA Vencendo</p>
                                <p className="text-[11px] text-rose-700 mt-1">{alerts.expiredCa.map(i => `${i.nome} (CA ${i.ca})`).join(', ')}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Header + KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'EPIs Cadastrados', value: catalog.filter(e => e.status === 'ATIVO').length, color: 'bg-amber-50 text-amber-700' },
                    { label: 'Entregas Ativas', value: deliveries.filter(d => !d.is_returned).length, color: 'bg-indigo-50 text-indigo-700' },
                    { label: 'Estoque Baixo', value: alerts?.lowStock.length ?? 0, color: 'bg-orange-50 text-orange-700' },
                    { label: 'CA Vencendo', value: alerts?.expiredCa.length ?? 0, color: 'bg-rose-50 text-rose-700' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${color.split(' ')[1]} px-2 py-0.5 rounded-lg inline-block ${color.split(' ')[0]}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    {([['catalog', 'Catálogo de EPIs', Package], ['deliveries', 'Entregas', HardHat]] as const).map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-48"
                        />
                    </div>

                    {view === 'deliveries' && (
                        <>
                            <div className="relative">
                                <select
                                    value={filterEmployee}
                                    onChange={e => setFilterEmployee(e.target.value)}
                                    className="pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 appearance-none"
                                >
                                    <option value="">Todos os colaboradores</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                            <button
                                onClick={() => setFilterIncludeReturned(p => !p)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${filterIncludeReturned ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                            >
                                <RotateCcw className="w-3 h-3" />
                                Incluir devolvidos
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => view === 'catalog' ? (setEditingItem(null), setShowForm(true)) : setShowDeliveryForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-xs shadow-md"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'catalog' ? 'Novo EPI' : 'Nova Entrega'}
                    </button>
                </div>
            </div>

            {/* Catálogo */}
            {view === 'catalog' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingCatalog ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredCatalog.length === 0 ? (
                        <div className="text-center py-16">
                            <HardHat className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum EPI cadastrado</p>
                            <p className="text-xs text-slate-400 mt-1">Cadastre os EPIs utilizados na sua organização.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['EPI', 'Categoria', 'CA', 'Estoque', 'Mínimo', 'Custo Unit.', 'Status', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCatalog.map(item => {
                                    const isLow = item.estoque_atual <= item.estoque_minimo;
                                    const today = new Date().toISOString().split('T')[0];
                                    const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
                                    const caExpiring = item.ca_validade && item.ca_validade <= nextMonth.toISOString().split('T')[0];
                                    return (
                                        <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-bold text-slate-900">{item.nome}</p>
                                                {item.descricao && <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{item.descricao}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${categoriaColors[item.categoria]}`}>
                                                    {EPI_CATEGORIA_LABELS[item.categoria].split(' ').slice(0,2).join(' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-bold text-slate-700">{item.ca || '—'}</p>
                                                {item.ca_validade && (
                                                    <p className={`text-[10px] font-bold ${caExpiring ? 'text-rose-600' : 'text-slate-400'}`}>
                                                        {caExpiring ? '⚠ ' : ''}{item.ca_validade}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${isLow ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {item.estoque_atual} {item.unidade}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{item.estoque_minimo} {item.unidade}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">
                                                {item.custo_unitario > 0 ? `R$ ${item.custo_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${item.status === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => { setEditingItem(item); setShowForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => { if (confirm('Inativar este EPI?')) deleteMutation.mutate(item.id); }} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-slate-400 hover:text-red-600">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Entregas */}
            {view === 'deliveries' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingDeliveries ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    ) : filteredDeliveries.length === 0 ? (
                        <div className="text-center py-16">
                            <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhuma entrega registrada</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Colaborador', 'EPI', 'Qtd', 'Entregue em', 'Motivo', 'Status', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDeliveries.map(d => (
                                    <tr key={d.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${d.is_returned ? 'opacity-60' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-600">
                                                    {(d.employee_name || 'U').charAt(0)}
                                                </div>
                                                <span className="text-sm font-bold text-slate-800">{d.employee_name || '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-slate-700">{d.epi_nome || '—'}</td>
                                        <td className="px-4 py-3 text-sm font-black text-slate-900">{d.quantidade}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 font-medium">{d.delivered_at}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">{d.motivo || '—'}</td>
                                        <td className="px-4 py-3">
                                            {d.is_returned ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500">Devolvido</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">Em uso</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {!d.is_returned && (
                                                <button
                                                    onClick={() => { if (confirm('Confirmar devolução?')) returnMutation.mutate(d.id); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 rounded-lg text-[10px] font-black transition-all"
                                                >
                                                    <CheckCircle2 className="w-3 h-3" /> Devolver
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Modais */}
            {showForm && (
                <EpiCatalogForm
                    orgId={orgId}
                    item={editingItem}
                    onClose={() => { setShowForm(false); setEditingItem(null); }}
                    onSaved={() => { setShowForm(false); setEditingItem(null); invalidate(); }}
                />
            )}
            {showDeliveryForm && (
                <EpiDeliveryForm
                    orgId={orgId}
                    employees={employees}
                    catalog={catalog}
                    onClose={() => setShowDeliveryForm(false)}
                    onSaved={() => { setShowDeliveryForm(false); invalidate(); }}
                />
            )}
        </div>
    );
};

export default LaborEPIs;
