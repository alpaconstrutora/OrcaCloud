// components/InventoryModule.tsx — Módulo Almoxarifado Fases 1, 2 e 3

import React from 'react';
import {
    Warehouse,
    Package,
    ArrowDownCircle,
    ArrowUpCircle,
    BarChart3,
    Plus,
    Search,
    Loader2,
    X,
    ChevronDown,
    AlertTriangle,
    History,
    Clock,
    Check,
    ArrowLeftRight,
    Send,
    CheckCircle2,
    Activity,
    TrendingDown,
    TrendingUp,
    ShieldAlert,
    ClipboardList,
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';
import { useStore } from '../store/useStore';
import { formatMoney, formatDateBR, formatPercent } from './ui/Format';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import type {
    Warehouse as WarehouseType,
    StockBalance,
    StockMovement,
    SupplierLeadTime,
    StockTransfer,
    StockNetPosition,
    StockSummary,
    MaterialRequest,
    MaterialRequestItem,
    CreateWarehouseInput,
    CreateStockMovementInput,
    CreateSupplierLeadTimeInput,
    CreateTransferInput,
    CreateMaterialRequestInput,
} from '../types/inventory';

const StatusBadge = ({ status, label }: { status: 'success'|'danger'|'warning'|'info', label: string }) => {
    const colors = {
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        danger: 'bg-rose-50 text-rose-700 border-rose-200',
        warning: 'bg-amber-50 text-amber-700 border-amber-200',
        info: 'bg-blue-50 text-blue-700 border-blue-200'
    };
    return <span className={`px-2 py-1 rounded-md text-xs font-medium border ${colors[status]}`}>{label}</span>;
};

interface Props {
    activeOrganizationId: string | null;
    onChangeView: (view: string) => void;
}

type Tab = 'saldos' | 'movimentos' | 'almoxarifados' | 'lead_times' | 'transferencias' | 'posicao' | 'requisicoes';

// ─── Modal de movimento manual ────────────────────────────────────────────────
interface MovementModalProps {
    orgId: string;
    warehouses: WarehouseType[];
    defaultType: 'in' | 'out' | 'adjust';
    onClose: () => void;
    onCreated: () => void;
}

const MovementModal: React.FC<MovementModalProps> = ({ orgId, warehouses, defaultType, onClose, onCreated }) => {
    const [form, setForm] = React.useState<CreateStockMovementInput>({
        warehouseId: warehouses[0]?.id ?? '',
        inputDescription: '',
        inputUnit: 'un',
        inputCode: '',
        type: defaultType,
        quantity: 0,
        unitCost: undefined,
        notes: '',
        movedAt: new Date().toISOString().slice(0, 10),
    });
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');

    const save = async () => {
        if (!form.warehouseId || !form.inputDescription || form.quantity <= 0) {
            setErr('Preencha almoxarifado, insumo e quantidade.');
            return;
        }
        setSaving(true);
        try {
            await inventoryService.createMovement(orgId, form);
            onCreated();
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const label = form.type === 'in' ? 'Entrada' : form.type === 'out' ? 'Saída' : 'Ajuste';
    const headerColor = form.type === 'in' ? 'text-green-700 bg-green-50' : form.type === 'out' ? 'text-red-700 bg-red-50' : 'text-yellow-700 bg-yellow-50';

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-100 ${headerColor}`}>
                    <h3 className="font-semibold text-lg">{label} Manual</h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Almoxarifado</label>
                        <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.warehouseId}
                            onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                        >
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Insumo / Descrição *</label>
                            <input
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.inputDescription}
                                onChange={e => setForm(f => ({ ...f, inputDescription: e.target.value }))}
                                placeholder="Ex: Cimento CP-II 50kg"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label text-gray-700 mb-1">Código</label>
                            <input
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.inputCode ?? ''}
                                onChange={e => setForm(f => ({ ...f, inputCode: e.target.value || undefined }))}
                                placeholder="SINAPI ou próprio"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label text-gray-700 mb-1">Unidade *</label>
                            <input
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.inputUnit}
                                onChange={e => setForm(f => ({ ...f, inputUnit: e.target.value }))}
                                placeholder="sc, m³, un"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label text-gray-700 mb-1">Quantidade *</label>
                            <input
                                type="number" min="0.0001" step="0.01"
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.quantity || ''}
                                onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                        {form.type === 'in' && (
                            <div>
                                <label className="block text-form-label text-gray-700 mb-1">Custo unitário</label>
                                <input
                                    type="number" min="0" step="0.01"
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={form.unitCost ?? ''}
                                    onChange={e => setForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || undefined }))}
                                    placeholder="R$"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-form-label text-gray-700 mb-1">Data</label>
                            <input
                                type="date"
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.movedAt ?? ''}
                                onChange={e => setForm(f => ({ ...f, movedAt: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-form-label text-gray-700 mb-1">Observações</label>
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                        />
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                    {err && <p className="text-red-500 text-sm font-medium">{err}</p>}
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="flex-1 justify-center border-gray-200 text-gray-700 hover:bg-gray-100 !py-2.5">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={save} disabled={saving}
                            className="flex-1 justify-center bg-blue-600 hover:bg-blue-700 !py-2.5"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Registrar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Modal de almoxarifado ─────────────────────────────────────────────────────
interface WarehouseModalProps {
    orgId: string;
    projects: Array<{ id: string; name: string }>;
    existing?: WarehouseType;
    onClose: () => void;
    onSaved: () => void;
}

const WarehouseModal: React.FC<WarehouseModalProps> = ({ orgId, projects, existing, onClose, onSaved }) => {
    const [form, setForm] = React.useState<CreateWarehouseInput>({
        name: existing?.name ?? '',
        type: existing?.type ?? 'site',
        projectId: existing?.projectId ?? null,
        notes: existing?.notes ?? '',
    });
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');

    const save = async () => {
        if (!form.name.trim()) { setErr('Informe o nome.'); return; }
        setSaving(true);
        try {
            if (existing) {
                await inventoryService.updateWarehouse(existing.id, form);
            } else {
                await inventoryService.createWarehouse(orgId, form);
            }
            onSaved();
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-lg text-gray-900">{existing ? 'Editar' : 'Novo'} Almoxarifado</h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                        <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.type}
                            onChange={e => setForm(f => ({ ...f, type: e.target.value as CreateWarehouseInput['type'] }))}
                        >
                            <option value="site">Obra</option>
                            <option value="central">Central / Depósito</option>
                            <option value="virtual">Virtual</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Obra (opcional)</label>
                        <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.projectId ?? ''}
                            onChange={e => setForm(f => ({ ...f, projectId: e.target.value || null }))}
                        >
                            <option value="">— Central da organização —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                    {err && <p className="text-red-500 text-sm font-medium">{err}</p>}
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="flex-1 justify-center border-gray-200 text-gray-700 hover:bg-gray-100 !py-2.5">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={save} disabled={saving}
                            className="flex-1 justify-center bg-blue-600 hover:bg-blue-700 !py-2.5"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Salvar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Configuração de Colunas ─────────────────────────────────────────────────────

const COLUMNS_SALDOS: ColumnConfig[] = [
    { key: 'insumo', label: 'Insumo', sortable: true },
    { key: 'almoxarifado', label: 'Almoxarifado', sortable: true },
    { key: 'quantidade', label: 'Qtd', sortable: true },
    { key: 'unidade', label: 'Un', sortable: false },
    { key: 'custo', label: 'Custo Médio', sortable: true },
    { key: 'valor', label: 'Valor Total', sortable: true },
];

const COLUMNS_MOVIMENTOS: ColumnConfig[] = [
    { key: 'data', label: 'Data', sortable: true },
    { key: 'tipo', label: 'Tipo', sortable: true },
    { key: 'insumo', label: 'Insumo', sortable: true },
    { key: 'almoxarifado', label: 'Almoxarifado', sortable: true },
    { key: 'quantidade', label: 'Qtd', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
];

// ─── Módulo principal ──────────────────────────────────────────────────────────
export const InventoryModule: React.FC<Props> = ({ activeOrganizationId }) => {
    const { projects } = useStore();

    const [tab, setTab] = React.useState<Tab>('saldos');
    const [loading, setLoading] = React.useState(false);

    const [warehouses, setWarehouses] = React.useState<WarehouseType[]>([]);
    const [balances, setBalances] = React.useState<StockBalance[]>([]);
    const [movements, setMovements] = React.useState<StockMovement[]>([]);
    const [leadTimes, setLeadTimes] = React.useState<SupplierLeadTime[]>([]);
    const [transfers, setTransfers] = React.useState<StockTransfer[]>([]);
    const [netPositions, setNetPositions] = React.useState<StockNetPosition[]>([]);
    const [summary, setSummary] = React.useState<StockSummary[]>([]);

    const [selectedWarehouseId, setSelectedWarehouseId] = usePersistedState<string>('inventory-warehouse-filter', '');
    const [searchTerm, setSearchTerm] = usePersistedState('inventory-search', '');
    
    // Configurações de Tabelas
    const tableSaldos = useTableColumns(COLUMNS_SALDOS, 'inventory-saldos-cols');
    const tableMovimentos = useTableColumns(COLUMNS_MOVIMENTOS, 'inventory-movimentos-cols');
    
    // View modes
    const [viewMode, setViewMode] = usePersistedState<'list'|'grid'>('inventory-view-mode', 'list');

    const [movementModal, setMovementModal] = React.useState<'in' | 'out' | 'adjust' | null>(null);
    const [warehouseModal, setWarehouseModal] = React.useState<WarehouseType | true | null>(null);
    const [transferModal, setTransferModal] = React.useState(false);

    // Requisições
    const [requests, setRequests] = React.useState<MaterialRequest[]>([]);
    const [reqFilter, setReqFilter] = React.useState('');
    const [showRequestModal, setShowRequestModal] = React.useState(false);
    const [approvingRequest, setApprovingRequest] = React.useState<MaterialRequest | null>(null);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const whs = await inventoryService.listWarehouses(activeOrganizationId, false);
            setWarehouses(whs);
            if (!selectedWarehouseId && whs.length > 0) setSelectedWarehouseId(whs[0].id);

            const [bal, mov, lts, trfs, net, smry] = await Promise.all([
                inventoryService.listBalances(activeOrganizationId, { warehouseId: selectedWarehouseId || undefined }),
                inventoryService.listMovements(activeOrganizationId, { warehouseId: selectedWarehouseId || undefined }),
                inventoryService.listLeadTimes(activeOrganizationId),
                inventoryService.listTransfers(activeOrganizationId),
                inventoryService.getNetPositions(activeOrganizationId, { warehouseId: selectedWarehouseId || undefined }),
                inventoryService.getStockSummary(activeOrganizationId, selectedWarehouseId || undefined),
            ]);
            setBalances(bal);
            setMovements(mov);
            setLeadTimes(lts);
            setTransfers(trfs);
            setNetPositions(net);
            setSummary(smry);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, selectedWarehouseId]);

    React.useEffect(() => { load(); }, [load]);

    React.useEffect(() => {
        if (tab !== 'requisicoes') return;
        inventoryService.listMaterialRequests(activeOrganizationId).then(setRequests).catch(console.error);
    }, [tab, activeOrganizationId]);

    const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const fmtBrl = formatMoney;

    const filteredBalances = balances.filter(b =>
        !searchTerm || b.inputDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.inputCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredMovements = movements.filter(b =>
        !searchTerm || b.inputDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.inputCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalValue = balances.reduce((s, b) => s + b.totalValue, 0);
    const lowStock = balances.filter(b => b.quantity <= 0).length;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gestão de Almoxarifado</h1>
                    <p className="text-sm text-gray-500 mt-1">Controle de estoque, movimentos e posição de materiais</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMovementModal('in')}
                        disabled={!activeOrganizationId}
                        title={!activeOrganizationId ? 'Selecione uma organização específica para registrar movimentações' : undefined}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowDownCircle className="w-4 h-4" /> Entrada
                    </button>
                    <Button
                        variant="danger"
                        onClick={() => setMovementModal('out')}
                        disabled={!activeOrganizationId}
                        title={!activeOrganizationId ? 'Selecione uma organização específica para registrar movimentações' : undefined}
                    >
                        <ArrowUpCircle className="w-4 h-4" /> Saída
                    </Button>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Almoxarifados', value: warehouses.length, icon: Warehouse, color: 'blue' as const },
                    { label: 'Itens em Estoque', value: balances.filter(b => b.quantity > 0).length, icon: Package, color: 'green' as const },
                    { label: 'Sem Saldo', value: lowStock, icon: AlertTriangle, color: 'amber' as const },
                    { label: 'Valor Total', value: fmtBrl(totalValue), icon: BarChart3, color: 'purple' as const },
                ].map((kpi, idx) => (
                    <div key={idx} className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-${kpi.color}-100 transition-all`}>
                        <div className={`p-3.5 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform`}>
                            <kpi.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{kpi.label}</p>
                            <p className="text-2xl font-bold text-gray-900 truncate">{kpi.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-200">
                {([
                    { key: 'saldos', label: 'Saldos', icon: Package },
                    { key: 'posicao', label: 'Posição Líquida', icon: Activity },
                    { key: 'movimentos', label: 'Movimentos', icon: History },
                    { key: 'transferencias', label: 'Transferências', icon: ArrowLeftRight },
                    { key: 'almoxarifados', label: 'Almoxarifados', icon: Warehouse },
                    { key: 'lead_times', label: 'Lead Time', icon: Clock },
                    { key: 'requisicoes', label: 'Requisições', icon: ClipboardList },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            tab === t.key 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar insumo..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>
                    <div className="h-8 w-[1px] bg-gray-200 hidden sm:block"></div>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all cursor-pointer">
                        <Warehouse className="w-4 h-4 text-gray-500" />
                        <select
                            className="bg-transparent border-none text-gray-600 text-sm font-medium focus:ring-0 cursor-pointer outline-none min-w-[160px]"
                            value={selectedWarehouseId}
                            onChange={e => setSelectedWarehouseId(e.target.value)}
                        >
                            <option value="">Todos os almoxarifados</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {tab === 'saldos' && <ColumnConfigButton columns={COLUMNS_SALDOS} visibleColumns={tableSaldos.visibleColumns} showColumnConfig={tableSaldos.showColumnConfig} onToggleShow={() => tableSaldos.setShowColumnConfig(!tableSaldos.showColumnConfig)} onToggleColumn={tableSaldos.toggleColumn} onReset={tableSaldos.resetColumns} />}
                    {tab === 'movimentos' && <ColumnConfigButton columns={COLUMNS_MOVIMENTOS} visibleColumns={tableMovimentos.visibleColumns} showColumnConfig={tableMovimentos.showColumnConfig} onToggleShow={() => tableMovimentos.setShowColumnConfig(!tableMovimentos.showColumnConfig)} onToggleColumn={tableMovimentos.toggleColumn} onReset={tableMovimentos.resetColumns} />}
                </div>
            </div>

            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                </div>
            )}

            {!loading && (
                <>
                    {/* ── TAB: SALDOS ── */}
                    {tab === 'saldos' && (
                        <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                            {filteredBalances.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                                    <Package className="w-12 h-12 mb-4 text-gray-300" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum item em estoque</h3>
                                    <p className="text-sm text-gray-500 max-w-sm text-center mb-6">Registre uma entrada para iniciar o controle de saldos.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                                {tableSaldos.visibleColumns.includes('insumo') && <SortableHeader colKey="insumo" label="Insumo" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} />}
                                                {tableSaldos.visibleColumns.includes('almoxarifado') && <SortableHeader colKey="almoxarifado" label="Almoxarifado" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} />}
                                                {tableSaldos.visibleColumns.includes('quantidade') && <SortableHeader colKey="quantidade" label="Qtd" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} className="text-right" />}
                                                {tableSaldos.visibleColumns.includes('unidade') && <SortableHeader colKey="unidade" label="Un" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} />}
                                                {tableSaldos.visibleColumns.includes('custo') && <SortableHeader colKey="custo" label="Custo Médio" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} className="text-right" />}
                                                {tableSaldos.visibleColumns.includes('valor') && <SortableHeader colKey="valor" label="Valor Total" sortColumn={tableSaldos.sortColumn} sortDirection={tableSaldos.sortDirection} onSort={tableSaldos.handleColumnSort} className="text-right" />}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredBalances.map((b, i) => (
                                                <tr
                                                    key={`${b.warehouseId}-${b.inputCode}`}
                                                    className="group hover:bg-gray-50/50 transition-colors"
                                                >
                                                    {tableSaldos.visibleColumns.includes('insumo') && (
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{b.inputDescription}</p>
                                                            {b.inputCode && <p className="text-xs text-gray-500 mt-0.5">{b.inputCode}</p>}
                                                        </td>
                                                    )}
                                                    {tableSaldos.visibleColumns.includes('almoxarifado') && (
                                                        <td className="px-4 py-3 text-sm text-gray-600">{b.warehouseName ?? '—'}</td>
                                                    )}
                                                    {tableSaldos.visibleColumns.includes('quantidade') && (
                                                        <td className={`px-4 py-3 text-right font-medium ${b.quantity <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                            {fmt(b.quantity)}
                                                        </td>
                                                    )}
                                                    {tableSaldos.visibleColumns.includes('unidade') && (
                                                        <td className="px-4 py-3 text-sm text-gray-500">{b.inputUnit}</td>
                                                    )}
                                                    {tableSaldos.visibleColumns.includes('custo') && (
                                                        <td className="px-4 py-3 text-right text-sm text-gray-600">{fmtBrl(b.avgUnitCost)}</td>
                                                    )}
                                                    {tableSaldos.visibleColumns.includes('valor') && (
                                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtBrl(b.totalValue)}</td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-gray-100 bg-gray-50/80">
                                                <td colSpan={tableSaldos.visibleColumns.length - 1} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total em Estoque</td>
                                                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtBrl(filteredBalances.reduce((s, b) => s + b.totalValue, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: POSIÇÃO LÍQUIDA ── */}
                    {tab === 'posicao' && (
                        <div className="space-y-4">
                            {/* KPIs de alerta */}
                            {(() => {
                                const ruptures = summary.filter(s => s.isRupture).length;
                                const belowMin  = summary.filter(s => s.isBelowMin && !s.isRupture).length;
                                const excess    = summary.filter(s => s.isExcess).length;
                                return (ruptures > 0 || belowMin > 0 || excess > 0) ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {ruptures > 0 && (
                                            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                                                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-red-600 font-medium">Ruptura de estoque</p>
                                                    <p className="text-lg font-bold text-red-700">{ruptures} {ruptures === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                        {belowMin > 0 && (
                                            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                                                <TrendingDown className="w-5 h-5 text-yellow-500 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-yellow-600 font-medium">Abaixo do mínimo</p>
                                                    <p className="text-lg font-bold text-yellow-700">{belowMin} {belowMin === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                        {excess > 0 && (
                                            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
                                                <TrendingUp className="w-5 h-5 text-blue-500 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-blue-600 font-medium">Possível excesso</p>
                                                    <p className="text-lg font-bold text-blue-700">{excess} {excess === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : null;
                            })()}

                            {/* Tabela de posição líquida */}
                            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <p className="text-sm text-gray-900 font-medium">Posição Líquida por Insumo</p>
                                    <p className="text-xs text-gray-500 mt-1">Saldo + Em Trânsito (POs ativos) − Reservado</p>
                                </div>
                                {netPositions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                                        <Activity className="w-12 h-12 mb-4 text-gray-300" />
                                        <p className="text-lg font-medium text-gray-900 mb-1">Nenhum dado de posição líquida disponível.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 text-xs uppercase font-medium">
                                                    <th className="px-4 py-3">Insumo</th>
                                                    <th className="px-4 py-3 hidden md:table-cell">Almoxarifado</th>
                                                    <th className="px-4 py-3 text-right">Saldo</th>
                                                    <th className="px-4 py-3 text-right hidden lg:table-cell">Em Trânsito</th>
                                                    <th className="px-4 py-3 text-right hidden lg:table-cell">Reservado</th>
                                                    <th className="px-4 py-3 text-right font-bold text-gray-700">Líquido</th>
                                                    <th className="px-4 py-3 text-right hidden xl:table-cell">Valor</th>
                                                    <th className="px-4 py-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                            {netPositions.map((p, i) => {
                                                const smr = summary.find(s => s.warehouseId === p.warehouseId && s.inputCode === p.inputCode);
                                                const isRupture  = smr?.isRupture  ?? p.netQty <= 0;
                                                const isExcess   = smr?.isExcess   ?? false;
                                                const isBelowMin = p.isBelowMin;
                                                return (
                                                    <tr key={`${p.warehouseId}-${p.inputCode}`} className="group hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm font-medium text-gray-900">{p.inputDescription}</p>
                                                            {p.inputCode && <p className="text-xs text-gray-500 mt-0.5">{p.inputCode}</p>}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.warehouseName ?? '—'}</td>
                                                        <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmt(p.balanceQty)}</td>
                                                        <td className="px-4 py-3 text-right text-green-600 font-medium hidden lg:table-cell">
                                                            {p.inTransitQty > 0 ? `+${fmt(p.inTransitQty)}` : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-yellow-600 font-medium hidden lg:table-cell">
                                                            {p.reservedQty > 0 ? `−${fmt(p.reservedQty)}` : '—'}
                                                        </td>
                                                        <td className={`px-4 py-3 text-right font-medium ${isRupture ? 'text-red-600' : isBelowMin ? 'text-yellow-600' : 'text-green-600'}`}>
                                                            {fmt(p.netQty)} {p.inputUnit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-600 hidden xl:table-cell">{fmtBrl(p.totalValue)}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            {isRupture ? (
                                                                <StatusBadge status="danger" label="Ruptura" />
                                                            ) : isBelowMin ? (
                                                                <StatusBadge status="warning" label="Baixo" />
                                                            ) : isExcess ? (
                                                                <StatusBadge status="info" label="Excesso" />
                                                            ) : (
                                                                <StatusBadge status="success" label="OK" />
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    </div>
                                )}
                            </div>

                            {/* Giro de estoque (30 dias) */}
                            {summary.filter(s => s.outflow30d > 0).length > 0 && (
                                <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                        <p className="text-sm text-gray-900 font-medium">Giro de Estoque — últimos 30 dias</p>
                                        <p className="text-xs text-gray-500 mt-1">Saídas ÷ saldo atual. Quanto maior, maior a rotatividade.</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 text-xs uppercase font-medium">
                                                <th className="px-4 py-3">Insumo</th>
                                                <th className="text-right px-4 py-3">Saídas 30d</th>
                                                <th className="text-right px-4 py-3">Entradas 30d</th>
                                                <th className="text-right px-4 py-3">Giro</th>
                                                <th className="text-right px-4 py-3 hidden md:table-cell">Último mov.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {summary
                                                .filter(s => s.outflow30d > 0 || s.inflow30d > 0)
                                                .sort((a, b) => b.turnoverRate - a.turnoverRate)
                                                .map(s => (
                                                <tr key={`${s.warehouseId}-${s.inputCode}`} className="group hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium text-gray-900">{s.inputDescription}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">{s.warehouseName}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-red-600 font-medium">{fmt(s.outflow30d)} {s.inputUnit}</td>
                                                    <td className="px-4 py-3 text-right text-green-600 font-medium">{fmt(s.inflow30d)} {s.inputUnit}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`font-semibold ${s.turnoverRate > 0.5 ? 'text-green-600' : s.turnoverRate > 0.1 ? 'text-yellow-600' : 'text-gray-500'}`}>
                                                            {formatPercent(s.turnoverRate, { decimals: 1 })}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm text-gray-500 hidden md:table-cell">
                                                        {formatDateBR(s.lastMovementDate)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: MOVIMENTOS ── */}
                    {tab === 'movimentos' && (
                        <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                <span className="text-sm font-medium text-gray-500">{filteredMovements.length} movimentos</span>
                                <Button
                                    variant="secondary"
                                    onClick={() => setMovementModal('adjust')}
                                    disabled={!activeOrganizationId}
                                    title={!activeOrganizationId ? 'Selecione uma organização específica para registrar ajuste' : undefined}
                                    className="!py-1.5 !px-3 text-sm text-yellow-600 border-yellow-200 bg-yellow-50 hover:bg-yellow-100 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Ajuste
                                </Button>
                            </div>
                            {filteredMovements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                                    <History className="w-12 h-12 mb-4 text-gray-300" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum movimento registrado</h3>
                                    <p className="text-sm text-gray-500 max-w-sm text-center mb-6">Realize entradas, saídas ou transferências para ver o histórico aqui.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                                {tableMovimentos.visibleColumns.includes('data') && <SortableHeader colKey="data" label="Data" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} />}
                                                {tableMovimentos.visibleColumns.includes('tipo') && <SortableHeader colKey="tipo" label="Tipo" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} />}
                                                {tableMovimentos.visibleColumns.includes('insumo') && <SortableHeader colKey="insumo" label="Insumo" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} />}
                                                {tableMovimentos.visibleColumns.includes('almoxarifado') && <SortableHeader colKey="almoxarifado" label="Almoxarifado" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} />}
                                                {tableMovimentos.visibleColumns.includes('quantidade') && <SortableHeader colKey="quantidade" label="Qtd" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} className="text-right" />}
                                                {tableMovimentos.visibleColumns.includes('valor') && <SortableHeader colKey="valor" label="Valor" sortColumn={tableMovimentos.sortColumn} sortDirection={tableMovimentos.sortDirection} onSort={tableMovimentos.handleColumnSort} className="text-right" />}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredMovements.map(m => {
                                                const isIn = m.type === 'in' || m.type === 'transfer_in';
                                                const typeLabel: Record<string, string> = {
                                                    in: 'Entrada', out: 'Saída', adjust: 'Ajuste',
                                                    transfer_in: 'Transf. In', transfer_out: 'Transf. Out',
                                                };
                                                const badgeStatus = isIn ? 'success' : m.type === 'adjust' ? 'warning' : 'danger';
                                                
                                                return (
                                                    <tr key={m.id} className="group hover:bg-gray-50/50 transition-colors">
                                                        {tableMovimentos.visibleColumns.includes('data') && (
                                                            <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                                                {formatDateBR(m.movedAt)}
                                                            </td>
                                                        )}
                                                        {tableMovimentos.visibleColumns.includes('tipo') && (
                                                            <td className="px-4 py-3">
                                                                <StatusBadge status={badgeStatus} label={typeLabel[m.type]} />
                                                            </td>
                                                        )}
                                                        {tableMovimentos.visibleColumns.includes('insumo') && (
                                                            <td className="px-4 py-3">
                                                                <p className="text-sm font-medium text-gray-900">{m.inputDescription}</p>
                                                                {m.notes && <p className="text-xs text-gray-500 mt-0.5">{m.notes}</p>}
                                                            </td>
                                                        )}
                                                        {tableMovimentos.visibleColumns.includes('almoxarifado') && (
                                                            <td className="px-4 py-3 text-sm text-gray-600">{m.warehouseName ?? '—'}</td>
                                                        )}
                                                        {tableMovimentos.visibleColumns.includes('quantidade') && (
                                                            <td className={`px-4 py-3 text-right font-medium ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                                                                {isIn ? '+' : '−'}{fmt(m.quantity)} {m.inputUnit}
                                                            </td>
                                                        )}
                                                        {tableMovimentos.visibleColumns.includes('valor') && (
                                                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                                                                {m.totalCost != null ? fmtBrl(m.totalCost) : '—'}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: TRANSFERÊNCIAS ── */}
                    {tab === 'transferencias' && (
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <Button
                                    onClick={() => setTransferModal(true)}
                                    disabled={!activeOrganizationId}
                                    title={!activeOrganizationId ? 'Selecione uma organização específica para criar transferência' : undefined}
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Nova Transferência
                                </Button>
                            </div>
                            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                                {transfers.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                                        <ArrowLeftRight className="w-12 h-12 mb-4 text-gray-300" />
                                        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhuma transferência</h3>
                                        <p className="text-sm text-gray-500 max-w-sm text-center mb-6">Nenhuma transferência de materiais registrada.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {transfers.map(t => {
                                            const statusLabel: Record<string, string> = {
                                                in_transit: 'Em trânsito',
                                                received: 'Recebida',
                                                cancelled: 'Cancelada',
                                            };
                                            const badgeStatus: Record<string, string> = {
                                                in_transit: 'warning',
                                                received: 'success',
                                                cancelled: 'default',
                                            };
                                            return (
                                                <div key={t.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-3 flex-wrap">
                                                                <span className="text-gray-900 font-medium">{t.fromWarehouseName ?? '—'}</span>
                                                                <ArrowLeftRight className="w-4 h-4 text-gray-400 shrink-0" />
                                                                <span className="text-gray-900 font-medium">{t.toWarehouseName ?? '—'}</span>
                                                                <StatusBadge status={badgeStatus[t.status] as any} label={statusLabel[t.status]} />
                                                            </div>
                                                            <p className="text-sm text-gray-500 mt-1">
                                                                {new Date(t.created_at).toLocaleDateString('pt-BR')}
                                                                {t.notes && ` — ${t.notes}`}
                                                            </p>
                                                            <div className="flex flex-wrap gap-2 mt-3">
                                                                {t.items.map((item, idx) => (
                                                                    <span key={idx} className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-medium text-gray-600">
                                                                        {item.inputDescription}: {fmt(item.quantity)} {item.inputUnit}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {t.status === 'in_transit' && (
                                                            <div className="flex gap-2 shrink-0">
                                                                <Button
                                                                    variant="primary"
                                                                    className="bg-green-600 hover:bg-green-700 !py-2"
                                                                    onClick={async () => {
                                                                        await inventoryService.receiveTransfer(t.id);
                                                                        load();
                                                                    }}
                                                                >
                                                                    <CheckCircle2 className="w-4 h-4 mr-1" /> Receber
                                                                </Button>
                                                                <Button
                                                                    variant="secondary"
                                                                    className="!py-2 text-gray-600 hover:text-red-600 border-gray-200"
                                                                    onClick={async () => {
                                                                        if (!confirm('Cancelar transferência?')) return;
                                                                        await inventoryService.cancelTransfer(t.id);
                                                                        load();
                                                                    }}
                                                                >
                                                                    Cancelar
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: ALMOXARIFADOS ── */}
                    {tab === 'almoxarifados' && (
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <Button
                                    onClick={() => setWarehouseModal(true)}
                                    disabled={!activeOrganizationId}
                                    title={!activeOrganizationId ? 'Selecione uma organização específica para criar almoxarifado' : undefined}
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Novo Almoxarifado
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {warehouses.length === 0 && (
                                    <div className="col-span-3 flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-[1.5rem] shadow-sm border border-gray-100">
                                        <Warehouse className="w-12 h-12 mb-4 text-gray-300" />
                                        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum almoxarifado</h3>
                                        <p className="text-sm text-gray-500 max-w-sm text-center mb-6">Nenhum almoxarifado cadastrado.</p>
                                    </div>
                                )}
                                {warehouses.map(w => {
                                    const typeLabel: Record<string, string> = { site: 'Obra', central: 'Central', virtual: 'Virtual' };
                                    const wBalance = balances.filter(b => b.warehouseId === w.id);
                                    const wValue = wBalance.reduce((s, b) => s + b.totalValue, 0);
                                    return (
                                        <div key={w.id} className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 space-y-4 hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-semibold text-gray-900">{w.name}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{typeLabel[w.type]}{w.projectName ? ` — ${w.projectName}` : ' — Central'}</p>
                                                </div>
                                                <div className="flex gap-1.5 -mr-2">
                                                    <ActionIconButton kind="edit" onClick={() => setWarehouseModal(w)} />
                                                    <ActionIconButton
                                                        kind="delete"
                                                        title="Desativar"
                                                        onClick={async () => {
                                                            if (!confirm(`Desativar "${w.name}"?`)) return;
                                                            await inventoryService.updateWarehouse(w.id, { isActive: false });
                                                            load();
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 text-center">
                                                <div className="bg-gray-50 rounded-xl py-3 border border-gray-100">
                                                    <p className="text-xs font-medium text-gray-500 mb-1">Itens</p>
                                                    <p className="font-bold text-gray-900">{wBalance.filter(b => b.quantity > 0).length}</p>
                                                </div>
                                                <div className="bg-blue-50/50 rounded-xl py-3 border border-blue-100">
                                                    <p className="text-xs font-medium text-blue-600 mb-1">Valor Total</p>
                                                    <p className="font-bold text-blue-700">{fmtBrl(wValue)}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <StatusBadge status={w.isActive ? 'success' : 'info'} label={w.isActive ? 'Ativo' : 'Inativo'} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: LEAD TIMES ── */}
                    {tab === 'lead_times' && (
                        <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-900 font-medium">Lead Time por Fornecedor</p>
                                    <p className="text-xs text-gray-500 mt-1">Usado pelo Plano de Aquisições para calcular a data de compra sugerida.</p>
                                </div>
                            </div>
                            {leadTimes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                                    <Clock className="w-12 h-12 mb-4 text-gray-300" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum lead time</h3>
                                    <p className="text-sm text-gray-500 max-w-sm text-center mb-6">Cadastre os prazos de entrega no módulo de Fornecedores.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 text-xs uppercase font-medium">
                                                <th className="px-4 py-3">Fornecedor</th>
                                                <th className="px-4 py-3">Insumo / Categoria</th>
                                                <th className="px-4 py-3 text-center">Prazo (dias)</th>
                                                <th className="px-4 py-3 hidden md:table-cell">Obs.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {leadTimes.map(lt => (
                                                <tr key={lt.id} className="group hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 text-gray-900 font-medium">{lt.supplierName ?? lt.supplierId}</td>
                                                    <td className="px-4 py-3 text-gray-600">
                                                        {lt.inputCode ? <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{lt.inputCode}</code> : <span className="text-gray-400 italic text-sm">Geral</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-sm">{lt.leadTimeDays}d</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-sm">{lt.notes ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: REQUISIÇÕES ── */}
                    {tab === 'requisicoes' && activeOrganizationId && (
                        <RequisitionsTab
                            orgId={activeOrganizationId}
                            warehouses={warehouses.filter(w => w.isActive)}
                            requests={requests}
                            reqFilter={reqFilter}
                            setReqFilter={setReqFilter}
                            showRequestModal={showRequestModal}
                            setShowRequestModal={setShowRequestModal}
                            approvingRequest={approvingRequest}
                            setApprovingRequest={setApprovingRequest}
                            reload={() => inventoryService.listMaterialRequests(activeOrganizationId).then(setRequests)}
                        />
                    )}
                    {tab === 'requisicoes' && !activeOrganizationId && (
                        <p className="text-sm text-gray-400 text-center py-12">
                            Requisições de materiais exigem uma organização específica — selecione uma (não "Todas") para criar ou ver requisições.
                        </p>
                    )}
                </>
            )}

            {movementModal && activeOrganizationId && (
                <MovementModal
                    orgId={activeOrganizationId}
                    warehouses={warehouses.filter(w => w.isActive)}
                    defaultType={movementModal}
                    onClose={() => setMovementModal(null)}
                    onCreated={() => { setMovementModal(null); load(); }}
                />
            )}
            {warehouseModal && activeOrganizationId && (
                <WarehouseModal
                    orgId={activeOrganizationId}
                    projects={projects.filter(p => p.id).map(p => ({ id: p.id as string, name: p.name }))}
                    existing={warehouseModal !== true ? warehouseModal : undefined}
                    onClose={() => setWarehouseModal(null)}
                    onSaved={() => { setWarehouseModal(null); load(); }}
                />
            )}
            {transferModal && activeOrganizationId && (
                <TransferModal
                    orgId={activeOrganizationId}
                    warehouses={warehouses.filter(w => w.isActive)}
                    onClose={() => setTransferModal(false)}
                    onCreated={() => { setTransferModal(false); load(); }}
                />
            )}
        </div>
    );
};

// ─── Modal de transferência ────────────────────────────────────────────────────
interface TransferModalProps {
    orgId: string;
    warehouses: WarehouseType[];
    onClose: () => void;
    onCreated: () => void;
}

const TransferModal: React.FC<TransferModalProps> = ({ orgId, warehouses, onClose, onCreated }) => {
    const keyRef = React.useRef(0);
    const [form, setForm] = React.useState<CreateTransferInput>({
        fromWarehouseId: warehouses[0]?.id ?? '',
        toWarehouseId: warehouses[1]?.id ?? '',
        notes: '',
        items: [],
    });
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');

    const addItem = () => {
        keyRef.current += 1;
        setForm(f => ({
            ...f,
            items: [...f.items, { inputCode: '', inputDescription: '', inputUnit: 'un', quantity: 0, _key: keyRef.current } as CreateTransferInput['items'][0] & { _key: number }],
        }));
    };

    const updateItem = (idx: number, patch: Partial<CreateTransferInput['items'][0]>) => {
        setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
    };

    const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

    const save = async () => {
        if (form.fromWarehouseId === form.toWarehouseId) { setErr('Origem e destino não podem ser iguais.'); return; }
        const validItems = form.items.filter(i => i.inputDescription && i.quantity > 0);
        if (validItems.length === 0) { setErr('Adicione ao menos um item com quantidade.'); return; }
        setSaving(true);
        try {
            await inventoryService.createTransfer(orgId, { ...form, items: validItems });
            onCreated();
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <Send className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-lg text-gray-900">Nova Transferência</h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Origem *</label>
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.fromWarehouseId}
                                onChange={e => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))}
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Destino *</label>
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.toWarehouseId}
                                onChange={e => setForm(f => ({ ...f, toWarehouseId: e.target.value }))}
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-gray-900">Itens a Transferir</label>
                            <Button variant="ghost" onClick={addItem} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 !py-1 !px-2 text-xs">
                                <Plus className="w-3 h-3 mr-1" /> Adicionar
                            </Button>
                        </div>
                        {form.items.length === 0 && (
                            <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                Nenhum item adicionado à transferência.
                            </div>
                        )}
                        <div className="space-y-3">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-3 items-end bg-gray-50/50 border border-gray-200 rounded-xl p-4">
                                    <div className="col-span-5">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                                        <input className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={item.inputDescription} onChange={e => updateItem(idx, { inputDescription: e.target.value })} placeholder="Insumo" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Cód.</label>
                                        <input className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={item.inputCode ?? ''} onChange={e => updateItem(idx, { inputCode: e.target.value || undefined })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Un</label>
                                        <input className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={item.inputUnit} onChange={e => updateItem(idx, { inputUnit: e.target.value })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Qtd</label>
                                        <input type="number" min="0.001" step="0.01" className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={item.quantity || ''} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div className="col-span-1 flex justify-center pb-1.5">
                                        <ActionIconButton kind="delete" onClick={() => removeItem(idx)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3 shrink-0">
                    {err && <p className="text-red-500 text-sm font-medium">{err}</p>}
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="flex-1 justify-center border-gray-200 text-gray-700 hover:bg-gray-100 !py-2.5">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={save} disabled={saving}
                            className="flex-1 justify-center bg-blue-600 hover:bg-blue-700 !py-2.5"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                            Enviar Transferência
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Tab de Requisições ────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Rejeitada',
    separated: 'Separada',
    delivered: 'Entregue',
    cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    approved: 'bg-green-50 text-green-700 border border-green-200',
    rejected: 'bg-red-50 text-red-700 border border-red-200',
    separated: 'bg-blue-50 text-blue-700 border border-blue-200',
    delivered: 'bg-gray-100 text-gray-700 border border-gray-200',
    cancelled: 'bg-gray-50 text-gray-500 border border-gray-200',
};

interface RequisitionsTabProps {
    orgId: string;
    warehouses: WarehouseType[];
    requests: MaterialRequest[];
    reqFilter: string;
    setReqFilter: (f: string) => void;
    showRequestModal: boolean;
    setShowRequestModal: (v: boolean) => void;
    approvingRequest: MaterialRequest | null;
    setApprovingRequest: (r: MaterialRequest | null) => void;
    reload: () => void;
}

const RequisitionsTab: React.FC<RequisitionsTabProps> = ({
    orgId, warehouses, requests, reqFilter, setReqFilter,
    showRequestModal, setShowRequestModal, approvingRequest, setApprovingRequest, reload,
}) => {
    const [delivering, setDelivering] = React.useState<string | null>(null);
    const [cancelling, setCancelling] = React.useState<string | null>(null);
    const [err, setErr] = React.useState('');
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [bulkCancelling, setBulkCancelling] = React.useState(false);

    const filters = ['', 'pending', 'approved', 'separated', 'delivered', 'rejected', 'cancelled'];
    const filterLabels: Record<string, string> = { '': 'Todos', ...STATUS_LABELS };
    const visible = reqFilter ? requests.filter(r => r.status === reqFilter) : requests;

    const isCancellable = (r: MaterialRequest) => ['pending', 'approved', 'separated'].includes(r.status);
    const selectableVisible = visible.filter(isCancellable);
    const selectedVisible = selectableVisible.filter(r => selectedIds.has(r.id));
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;

    const toggleRow = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleAllVisible = () => setSelectedIds(prev => {
        if (allVisibleSelected) {
            const next = new Set(prev);
            selectableVisible.forEach(r => next.delete(r.id));
            return next;
        }
        const next = new Set(prev);
        selectableVisible.forEach(r => next.add(r.id));
        return next;
    });
    const clearSelection = () => setSelectedIds(new Set());

    const handleBulkCancel = async () => {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        setBulkCancelling(true);
        setErr('');
        const falhas: string[] = [];
        let okCount = 0;
        for (const r of alvos) {
            try {
                await inventoryService.cancelMaterialRequest(r.id);
                okCount++;
            } catch {
                falhas.push(r.number);
            }
        }
        setSelectedIds(new Set());
        setBulkCancelling(false);
        reload();
        if (falhas.length) setErr(`${okCount} cancelada(s). Falha em ${falhas.length}: ${falhas.join(', ')}`);
    };

    const handleDeliver = async (id: string) => {
        setDelivering(id); setErr('');
        try { await inventoryService.deliverMaterialRequest(id); reload(); }
        catch (e: unknown) { setErr((e as Error).message); }
        finally { setDelivering(null); }
    };

    const handleCancel = async (id: string) => {
        setCancelling(id); setErr('');
        try { await inventoryService.cancelMaterialRequest(id); reload(); }
        catch (e: unknown) { setErr((e as Error).message); }
        finally { setCancelling(null); }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {filters.map(f => (
                        <button
                            key={f}
                            onClick={() => setReqFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reqFilter === f ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:text-blue-600 hover:border-blue-200 shadow-sm'}`}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>
                <Button variant="primary" onClick={() => setShowRequestModal(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Requisição
                </Button>
            </div>

            {err && <p className="text-red-400 text-xs">{err}</p>}

            {selectableVisible.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                    />
                    Selecionar todas (canceláveis)
                </label>
            )}

            {selectedVisible.length > 0 && (
                <div className="flex items-center gap-4 bg-blue-50/50 border border-blue-100 text-gray-900 px-4 py-2.5 rounded-xl shadow-sm">
                    <span className="text-sm font-semibold">{selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}</span>
                    <div className="flex-1" />
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={handleBulkCancel}
                        disabled={bulkCancelling}
                    >
                        {bulkCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
                        Cancelar selecionadas
                    </Button>
                    <button onClick={clearSelection} className="px-2 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                        Limpar
                    </button>
                </div>
            )}

            {visible.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-200 bg-gray-50/50 rounded-2xl shadow-sm">
                    Nenhuma requisição{reqFilter ? ` com status "${STATUS_LABELS[reqFilter]}"` : ''}.
                </div>
            )}

            <div className="space-y-4">
                {visible.map(req => (
                    <div key={req.id} className={`bg-white border rounded-2xl p-5 space-y-4 shadow-sm transition-all hover:shadow-md ${selectedIds.has(req.id) ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-gray-100'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                {isCancellable(req) && (
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer shrink-0"
                                        checked={selectedIds.has(req.id)}
                                        onChange={() => toggleRow(req.id)}
                                    />
                                )}
                                <ClipboardList className="w-5 h-5 text-blue-600 shrink-0" />
                                <span className="font-semibold text-lg text-gray-900">{req.number}</span>
                                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${STATUS_COLORS[req.status]}`}>
                                    {STATUS_LABELS[req.status]}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {req.status === 'pending' && (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => setApprovingRequest(req)}
                                    >
                                        <Check className="w-4 h-4 mr-1.5" /> Avaliar
                                    </Button>
                                )}
                                {(req.status === 'approved' || req.status === 'separated') && (
                                    <Button
                                        size="sm"
                                        onClick={() => handleDeliver(req.id)}
                                        disabled={delivering === req.id}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        {delivering === req.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                        Entregar
                                    </Button>
                                )}
                                {(req.status === 'pending' || req.status === 'approved' || req.status === 'separated') && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleCancel(req.id)}
                                        disabled={cancelling === req.id}
                                    >
                                        {cancelling === req.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                                        Cancelar
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm text-gray-600">
                            <div><span className="text-gray-400">Solicitante:</span> <span className="font-medium text-gray-900">{req.requestedBy}</span></div>
                            {req.warehouseName && <div><span className="text-gray-400">Almoxarifado:</span> <span className="font-medium text-gray-900">{req.warehouseName}</span></div>}
                            {req.projectName && <div><span className="text-gray-400">Obra:</span> <span className="font-medium text-gray-900">{req.projectName}</span></div>}
                            <div><span className="text-gray-400">Data:</span> <span className="font-medium text-gray-900">{formatDateBR(req.requestedAt)}</span></div>
                            {req.approvedBy && <div><span className="text-gray-400">Aprovado por:</span> <span className="font-medium text-gray-900">{req.approvedBy}</span></div>}
                        </div>
                        {req.notes && <p className="text-sm text-gray-500 italic px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">{req.notes}</p>}
                        <div className="overflow-x-auto rounded-xl border border-gray-100 mt-2">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/50">
                                    <tr className="text-gray-500 border-b border-gray-100">
                                        <th className="px-4 py-2 font-medium">Insumo</th>
                                        <th className="px-4 py-2 font-medium">Cód.</th>
                                        <th className="px-4 py-2 text-right font-medium">Solicitado</th>
                                        <th className="px-4 py-2 text-right font-medium">Aprovado</th>
                                        <th className="px-4 py-2 text-right font-medium">Entregue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {req.items.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-2 text-gray-900 font-medium">{item.inputDescription}</td>
                                            <td className="px-4 py-2 text-gray-500 text-xs">{item.inputCode ?? '—'}</td>
                                            <td className="px-4 py-2 text-right text-gray-700">{item.quantityRequested} {item.inputUnit}</td>
                                            <td className="px-4 py-2 text-right text-gray-700 font-medium">{item.quantityApproved != null ? `${item.quantityApproved} ${item.inputUnit}` : '—'}</td>
                                            <td className="px-4 py-2 text-right text-gray-700 font-medium">{item.quantityDelivered != null ? `${item.quantityDelivered} ${item.inputUnit}` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {showRequestModal && (
                <RequestModal
                    orgId={orgId}
                    warehouses={warehouses}
                    onClose={() => setShowRequestModal(false)}
                    onCreated={() => { setShowRequestModal(false); reload(); }}
                />
            )}
            {approvingRequest && (
                <ApproveModal
                    request={approvingRequest}
                    onClose={() => setApprovingRequest(null)}
                    onDone={() => { setApprovingRequest(null); reload(); }}
                />
            )}
        </div>
    );
};

// ─── Modal: Nova Requisição ────────────────────────────────────────────────────
interface RequestModalProps {
    orgId: string;
    warehouses: WarehouseType[];
    onClose: () => void;
    onCreated: () => void;
}

const RequestModal: React.FC<RequestModalProps> = ({ orgId, warehouses, onClose, onCreated }) => {
    const keyRef = React.useRef(0);
    const [form, setForm] = React.useState<CreateMaterialRequestInput>({
        requestedBy: '',
        warehouseId: warehouses[0]?.id ?? '',
        items: [],
    });
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');

    const addItem = () => {
        keyRef.current += 1;
        setForm(f => ({
            ...f,
            items: [...f.items, { inputCode: '', inputDescription: '', inputUnit: 'un', quantityRequested: 0 }],
        }));
    };

    const updateItem = (idx: number, patch: Partial<CreateMaterialRequestInput['items'][0]>) => {
        setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
    };

    const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

    const save = async () => {
        if (!form.requestedBy.trim()) { setErr('Informe o solicitante.'); return; }
        const validItems = form.items.filter(i => i.inputDescription && i.quantityRequested > 0);
        if (validItems.length === 0) { setErr('Adicione ao menos um item com quantidade.'); return; }
        setSaving(true);
        try {
            await inventoryService.createMaterialRequest(orgId, { ...form, items: validItems });
            onCreated();
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-lg text-gray-900">Nova Requisição de Material</h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante *</label>
                            <input
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.requestedBy}
                                onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))}
                                placeholder="Nome do solicitante"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Almoxarifado</label>
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.warehouseId ?? ''}
                                onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value || undefined }))}
                            >
                                <option value="">— Sem almoxarifado —</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-gray-900">Itens *</label>
                            <Button variant="ghost" onClick={addItem} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 !py-1 !px-2 text-xs">
                                <Plus className="w-3 h-3 mr-1" /> Adicionar
                            </Button>
                        </div>
                        {form.items.length === 0 && (
                            <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-200 bg-gray-50/50 rounded-xl">
                                Adicione os materiais necessários.
                            </div>
                        )}
                        <div className="space-y-3">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-3 items-end bg-gray-50/50 border border-gray-200 rounded-xl p-4">
                                    <div className="col-span-5">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Descrição *</label>
                                        <input
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={item.inputDescription}
                                            onChange={e => updateItem(idx, { inputDescription: e.target.value })}
                                            placeholder="Insumo"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Cód.</label>
                                        <input
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={item.inputCode ?? ''}
                                            onChange={e => updateItem(idx, { inputCode: e.target.value || undefined })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Un</label>
                                        <input
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={item.inputUnit}
                                            onChange={e => updateItem(idx, { inputUnit: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Qtd *</label>
                                        <input
                                            type="number" min="0.001" step="0.01"
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={item.quantityRequested || ''}
                                            onChange={e => updateItem(idx, { quantityRequested: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="col-span-1 flex justify-center pb-1.5">
                                        <ActionIconButton kind="delete" onClick={() => removeItem(idx)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 shrink-0">
                    {err && <p className="text-red-500 text-sm font-medium mb-3">{err}</p>}
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="flex-1 justify-center border-gray-200 text-gray-700 hover:bg-gray-100 !py-2.5">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={save} disabled={saving}
                            className="flex-1 justify-center bg-blue-600 hover:bg-blue-700 !py-2.5"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Enviar Requisição
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Modal: Avaliar Requisição ─────────────────────────────────────────────────
interface ApproveModalProps {
    request: MaterialRequest;
    onClose: () => void;
    onDone: () => void;
}

const ApproveModal: React.FC<ApproveModalProps> = ({ request, onClose, onDone }) => {
    const [approvedBy, setApprovedBy] = React.useState('');
    const [quantities, setQuantities] = React.useState<Record<string, number>>(
        Object.fromEntries(request.items.map(i => [i.id, i.quantityApproved ?? i.quantityRequested]))
    );
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');

    const handle = async (action: 'approve' | 'reject') => {
        if (!approvedBy.trim()) { setErr('Informe o nome do aprovador.'); return; }
        setSaving(true);
        try {
            if (action === 'approve') {
                await inventoryService.approveMaterialRequest(request.id, approvedBy, quantities);
            } else {
                await inventoryService.rejectMaterialRequest(request.id, approvedBy);
            }
            onDone();
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div>
                        <h3 className="font-semibold text-lg text-gray-900">Avaliar Requisição {request.number}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">Solicitante: {request.requestedBy}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Aprovado / Rejeitado por *</label>
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={approvedBy}
                            onChange={e => setApprovedBy(e.target.value)}
                            placeholder="Seu nome"
                        />
                    </div>

                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-3">Itens — ajuste as quantidades aprovadas</p>
                        <div className="space-y-3">
                            {request.items.map(item => (
                                <div key={item.id} className="flex items-center gap-3 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{item.inputDescription}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{item.inputCode ?? ''} · solicitado: {item.quantityRequested} {item.inputUnit}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <input
                                            type="number" min="0" step="0.01"
                                            className="w-24 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            value={quantities[item.id] ?? item.quantityRequested}
                                            onChange={e => setQuantities(q => ({ ...q, [item.id]: parseFloat(e.target.value) || 0 }))}
                                        />
                                        <span className="text-sm font-medium text-gray-600">{item.inputUnit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 shrink-0">
                    {err && <p className="text-red-500 text-sm font-medium mb-3">{err}</p>}
                    <div className="flex gap-3">
                        <Button
                            variant="danger"
                            onClick={() => handle('reject')} disabled={saving}
                            className="flex-1 justify-center !py-2.5 bg-red-600 hover:bg-red-700"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                            Rejeitar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => handle('approve')} disabled={saving}
                            className="flex-1 justify-center !py-2.5 bg-green-600 hover:bg-green-700 border-none"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Aprovar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
