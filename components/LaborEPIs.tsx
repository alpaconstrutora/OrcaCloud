import React, { useState } from 'react';
import {
    HardHat, Plus, Package, User, AlertTriangle, CheckCircle2, X,
    ChevronDown, Loader2, Search, RotateCcw, Eye, ShieldCheck
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laborService, EpiCatalogItem, EpiDelivery, EpiCategoria, Employee } from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';

// Colunas das tabelas padrão (§6.10)
const CATALOG_COLUMNS: StandardTableColumn[] = [
    { key: 'epi', label: 'EPI', sortable: true, width: 240 },
    { key: 'categoria', label: 'Categoria', sortable: true, width: 200 },
    { key: 'ca', label: 'CA', sortable: true, width: 120 },
    { key: 'estoque', label: 'Estoque', sortable: true, width: 110, align: 'right' },
    { key: 'minimo', label: 'Mínimo', sortable: true, width: 100, align: 'right' },
    { key: 'custo', label: 'Custo unit.', sortable: true, width: 120, align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 100 },
];
const DELIVERY_COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 220 },
    { key: 'epi', label: 'EPI', sortable: true, width: 200 },
    { key: 'qtd', label: 'Qtd', sortable: true, width: 80, align: 'right' },
    { key: 'entregue_em', label: 'Entregue em', sortable: true, width: 120 },
    { key: 'motivo', label: 'Motivo', sortable: true, width: 180 },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
];

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
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Formulário de EPI (catálogo) ─────────────────────────────────────────────

interface EpiFormProps {
    orgId: string | null;
    item?: EpiCatalogItem | null;
    onClose: () => void;
    onSaved: () => void;
}

const EpiCatalogForm: React.FC<EpiFormProps> = ({ orgId, item, onClose, onSaved }) => {
    const isEditing = !!item;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<EpiCatalogItem>>({
        org_id: orgId ?? undefined,
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
        // Escrita exige organização específica (REGRA #5, exceção 4):
        // em "Todas as organizações" não há org para gravar.
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para cadastrar.'); return; }
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
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
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
    orgId: string | null;
    employees: Employee[];
    catalog: EpiCatalogItem[];
    onClose: () => void;
    onSaved: () => void;
}

const EpiDeliveryForm: React.FC<DeliveryFormProps> = ({ orgId, employees, catalog, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: orgId ?? undefined,
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
        if (!orgId) { alert('Selecione uma organização específica no seletor do topo para gravar.'); return; }
        if (!form.epi_id) { alert('Selecione um EPI.'); return; }
        if (!form.employee_id) { alert('Selecione um colaborador.'); return; }
        if (selectedEpi && form.quantidade > selectedEpi.estoque_atual) {
            alert(`Estoque insuficiente. Disponível: ${selectedEpi.estoque_atual} ${selectedEpi.unidade}`);
            return;
        }
        setSaving(true);
        try {
            await laborService.createEpiDelivery({ ...form, org_id: orgId });
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
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
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
    orgId: string | null;
    employees: Employee[];
    onRefresh?: () => void;
    organizations: Array<{ id: string; name: string }>;
}

type EpiView = 'catalog' | 'deliveries';

const LaborEPIs: React.FC<LaborEPIsProps> = ({ orgId, employees, onRefresh, organizations }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [view, setView] = useState<EpiView>('catalog');
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<EpiCatalogItem | null>(null);
    const [showDeliveryForm, setShowDeliveryForm] = useState(false);
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterIncludeReturned, setFilterIncludeReturned] = useState(false);

    const catalogKey = [...laborKeys.all, 'epiCatalog', orgId];
    const deliveriesKey = [...laborKeys.all, 'epiDeliveries', orgId, filterEmployee, filterIncludeReturned];

    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
        queryKey: catalogKey,
        queryFn: () => laborService.listEpiCatalog(orgId),
        staleTime: STALE.normal,
    });

    const { data: deliveries = [], isLoading: loadingDeliveries } = useQuery({
        queryKey: deliveriesKey,
        queryFn: () => laborService.listEpiDeliveries({
            orgId,
            employeeId: filterEmployee || undefined,
            includeReturned: filterIncludeReturned,
        }),
        staleTime: STALE.fast,
    });

    const { data: alerts } = useQuery({
        queryKey: [...laborKeys.all, 'epiAlerts', orgId],
        queryFn: () => laborService.getEpiAlerts(orgId),
        staleTime: STALE.normal,
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

    const handleInactivate = async (id: string) => {
        const ok = await confirm({ title: 'Inativar EPI?', message: 'O item deixará de aparecer para novas entregas.', variant: 'warning', confirmLabel: 'Inativar' });
        if (ok) deleteMutation.mutate(id);
    };

    const handleReturn = async (id: string) => {
        const ok = await confirm({ title: 'Confirmar devolução?', message: 'O EPI voltará ao estoque disponível.', confirmLabel: 'Confirmar' });
        if (ok) returnMutation.mutate(id);
    };

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
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de EPIs</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Catálogo, entregas e controle de estoque de equipamentos de proteção.</p>
            </div>

            {/* Alertas */}
            {(alerts && (alerts.lowStock.length > 0 || alerts.expiredCa.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {alerts.lowStock.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Estoque Baixo</p>
                                <p className="text-xs text-amber-700 mt-1">{alerts.lowStock.map(i => i.nome).join(', ')}</p>
                            </div>
                        </div>
                    )}
                    {alerts.expiredCa.length > 0 && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-rose-900 uppercase tracking-tight">CA Vencendo</p>
                                <p className="text-xs text-rose-700 mt-1">{alerts.expiredCa.map(i => `${i.nome} (CA ${i.ca})`).join(', ')}</p>
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
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${color.split(' ')[1]} px-2 py-0.5 rounded-lg inline-block ${color.split(' ')[0]}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar de abas (§19.1) — ação primária (§17) à direita; busca e filtros vivem na toolbar acoplada da tabela */}
            <TabsBar
                tabs={[
                    { id: 'catalog', label: 'Catálogo de EPIs', icon: <Package className="w-4 h-4" />, badge: catalog.length },
                    { id: 'deliveries', label: 'Entregas', icon: <HardHat className="w-4 h-4" /> },
                ]}
                value={view}
                onChange={setView}
            >
                <button
                    onClick={() => view === 'catalog' ? (setEditingItem(null), setShowForm(true)) : setShowDeliveryForm(true)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    {view === 'catalog' ? 'Novo EPI' : 'Nova entrega'}
                </button>
            </TabsBar>

            {/* Catálogo — tabela padrão (§6.10) */}
            {view === 'catalog' && (
                <StandardTable<EpiCatalogItem>
                    storageKey="labor:epis:catalogo"
                    columns={CATALOG_COLUMNS}
                    rows={catalog}
                    rowKey={item => item.id}
                    loading={loadingCatalog}
                    searchText={item => `${item.nome} ${item.ca ?? ''} ${item.descricao ?? ''} ${EPI_CATEGORIA_LABELS[item.categoria]}`}
                    searchPlaceholder="Buscar EPI ou CA..."
                    sortValue={(key, item) => {
                        switch (key) {
                            case 'epi': return item.nome;
                            case 'categoria': return EPI_CATEGORIA_LABELS[item.categoria];
                            case 'ca': return item.ca ?? '';
                            case 'estoque': return item.estoque_atual;
                            case 'minimo': return item.estoque_minimo;
                            case 'custo': return item.custo_unitario;
                            case 'status': return item.status;
                            default: return null;
                        }
                    }}
                    renderCell={(key, item) => {
                        const isLow = item.estoque_atual <= item.estoque_minimo;
                        const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
                        const caExpiring = item.ca_validade && item.ca_validade <= nextMonth.toISOString().split('T')[0];
                        switch (key) {
                            case 'epi': return (
                                <div>
                                    <p className="text-sm font-normal text-gray-700">{item.nome}</p>
                                    {item.descricao && <p className="text-xs text-gray-400 truncate" title={item.descricao}>{item.descricao}</p>}
                                </div>
                            );
                            case 'categoria': return <span className={`text-sm font-normal ${categoriaColors[item.categoria].split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600'}`}>{EPI_CATEGORIA_LABELS[item.categoria]}</span>;
                            case 'ca': return (
                                <div>
                                    <p className="text-sm font-normal text-gray-700">{item.ca || '—'}</p>
                                    {item.ca_validade && (
                                        <p className={`text-xs font-normal ${caExpiring ? 'text-rose-600' : 'text-gray-400'}`}>{caExpiring ? '⚠ ' : ''}{item.ca_validade}</p>
                                    )}
                                </div>
                            );
                            case 'estoque': return <span className={`text-sm font-normal ${isLow ? 'text-red-700' : 'text-emerald-700'}`}>{item.estoque_atual} {item.unidade}</span>;
                            case 'minimo': return <span className="text-sm font-normal text-gray-600">{item.estoque_minimo} {item.unidade}</span>;
                            case 'custo': return <span className="text-sm font-medium text-gray-800">{item.custo_unitario > 0 ? `R$ ${item.custo_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</span>;
                            case 'status': return <span className={`text-sm font-normal ${item.status === 'ATIVO' ? 'text-emerald-700' : 'text-gray-500'}`}>{item.status}</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 110,
                        render: item => (
                            <>
                                <ActionIconButton kind="edit" size="sm" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => { setEditingItem(item); setShowForm(true); }} />
                                <ActionIconButton kind="delete" size="sm" title="Inativar" onClick={() => handleInactivate(item.id)} />
                            </>
                        ),
                    }}
                    empty={{ icon: <HardHat className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum EPI cadastrado', subtitle: 'Cadastre os EPIs utilizados na sua organização.' }}
                />
            )}

            {/* Entregas — tabela padrão (§6.10) com filtros de colaborador/devolvidos na toolbar acoplada */}
            {view === 'deliveries' && (
                <StandardTable<EpiDelivery>
                    storageKey="labor:epis:entregas"
                    columns={DELIVERY_COLUMNS}
                    rows={deliveries}
                    rowKey={d => d.id}
                    loading={loadingDeliveries}
                    searchText={d => `${d.employee_name ?? ''} ${d.epi_nome ?? ''} ${d.motivo ?? ''}`}
                    searchPlaceholder="Buscar colaborador ou EPI..."
                    filters={
                        <>
                            <select
                                value={filterEmployee}
                                onChange={e => setFilterEmployee(e.target.value)}
                                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                            >
                                <option value="">Todos os colaboradores</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => setFilterIncludeReturned(p => !p)}
                                className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium border transition-all ${filterIncludeReturned ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Incluir devolvidos
                            </button>
                        </>
                    }
                    rowClassName={d => (d.is_returned ? 'opacity-60' : '')}
                    sortValue={(key, d) => {
                        switch (key) {
                            case 'colaborador': return d.employee_name ?? '';
                            case 'epi': return d.epi_nome ?? '';
                            case 'qtd': return d.quantidade;
                            case 'entregue_em': return d.delivered_at;
                            case 'motivo': return d.motivo ?? '';
                            case 'status': return d.is_returned;
                            default: return null;
                        }
                    }}
                    renderCell={(key, d) => {
                        switch (key) {
                            case 'colaborador': return (
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-normal text-indigo-600 shrink-0">
                                        {(d.employee_name || 'U').charAt(0)}
                                    </div>
                                    <span className="text-sm font-normal text-gray-700">{d.employee_name || '—'}</span>
                                </div>
                            );
                            case 'epi': return <span className="text-sm font-normal text-gray-700">{d.epi_nome || '—'}</span>;
                            case 'qtd': return <span className="text-sm font-normal text-gray-700">{d.quantidade}</span>;
                            case 'entregue_em': return <span className="text-sm font-normal text-gray-600">{d.delivered_at}</span>;
                            case 'motivo': return <span className="block truncate text-sm font-normal text-gray-600" title={d.motivo || ''}>{d.motivo || '—'}</span>;
                            case 'status': return d.is_returned
                                ? <span className="text-sm font-normal text-gray-500">Devolvido</span>
                                : <span className="text-sm font-normal text-emerald-700">Em uso</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 120,
                        render: d => !d.is_returned ? (
                            <button onClick={() => handleReturn(d.id)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Devolver
                            </button>
                        ) : null,
                    }}
                    empty={{ icon: <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma entrega registrada' }}
                />
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
