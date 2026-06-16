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
    Edit,
    Trash2,
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
import { useStore } from '../store/useStore';
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
    const color = form.type === 'in' ? 'text-green-400' : form.type === 'out' ? 'text-red-400' : 'text-yellow-400';

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className={`font-semibold text-lg ${color}`}>{label} Manual</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Almoxarifado</label>
                        <select
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.warehouseId}
                            onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                        >
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">Insumo / Descrição *</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.inputDescription}
                                onChange={e => setForm(f => ({ ...f, inputDescription: e.target.value }))}
                                placeholder="Ex: Cimento CP-II 50kg"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Código</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.inputCode ?? ''}
                                onChange={e => setForm(f => ({ ...f, inputCode: e.target.value || undefined }))}
                                placeholder="SINAPI ou próprio"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Unidade *</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.inputUnit}
                                onChange={e => setForm(f => ({ ...f, inputUnit: e.target.value }))}
                                placeholder="sc, m³, un"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Quantidade *</label>
                            <input
                                type="number" min="0.0001" step="0.01"
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.quantity || ''}
                                onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                        {form.type === 'in' && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Custo unitário</label>
                                <input
                                    type="number" min="0" step="0.01"
                                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                    value={form.unitCost ?? ''}
                                    onChange={e => setForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || undefined }))}
                                    placeholder="R$"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Data</label>
                            <input
                                type="date"
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.movedAt ?? ''}
                                onChange={e => setForm(f => ({ ...f, movedAt: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Observações</label>
                        <input
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                        />
                    </div>
                </div>

                {err && <p className="text-red-400 text-xs">{err}</p>}

                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">
                        Cancelar
                    </button>
                    <button
                        onClick={save} disabled={saving}
                        className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Registrar
                    </button>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">{existing ? 'Editar' : 'Novo'} Almoxarifado</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Nome *</label>
                        <input
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                        <select
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.type}
                            onChange={e => setForm(f => ({ ...f, type: e.target.value as CreateWarehouseInput['type'] }))}
                        >
                            <option value="site">Obra</option>
                            <option value="central">Central / Depósito</option>
                            <option value="virtual">Virtual</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Obra (opcional)</label>
                        <select
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.projectId ?? ''}
                            onChange={e => setForm(f => ({ ...f, projectId: e.target.value || null }))}
                        >
                            <option value="">— Central da organização —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Observações</label>
                        <input
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        />
                    </div>
                </div>

                {err && <p className="text-red-400 text-xs">{err}</p>}

                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
                    <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

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

    const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>('');
    const [searchTerm, setSearchTerm] = React.useState('');

    const [movementModal, setMovementModal] = React.useState<'in' | 'out' | 'adjust' | null>(null);
    const [warehouseModal, setWarehouseModal] = React.useState<WarehouseType | true | null>(null);
    const [transferModal, setTransferModal] = React.useState(false);

    // Requisições
    const [requests, setRequests] = React.useState<MaterialRequest[]>([]);
    const [reqFilter, setReqFilter] = React.useState('');
    const [showRequestModal, setShowRequestModal] = React.useState(false);
    const [approvingRequest, setApprovingRequest] = React.useState<MaterialRequest | null>(null);

    const load = React.useCallback(async () => {
        if (!activeOrganizationId) return;
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
        if (!activeOrganizationId || tab !== 'requisicoes') return;
        inventoryService.listMaterialRequests(activeOrganizationId).then(setRequests).catch(console.error);
    }, [tab, activeOrganizationId]);

    const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

    if (!activeOrganizationId) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <p>Selecione uma organização para acessar o Almoxarifado.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Warehouse className="w-6 h-6 text-blue-400" />
                        Almoxarifado
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Controle de estoque, movimentos e posição de materiais</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMovementModal('in')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
                    >
                        <ArrowDownCircle className="w-4 h-4" /> Entrada
                    </button>
                    <button
                        onClick={() => setMovementModal('out')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium"
                    >
                        <ArrowUpCircle className="w-4 h-4" /> Saída
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Almoxarifados', value: warehouses.length, icon: Warehouse, color: 'text-blue-400' },
                    { label: 'Itens em Estoque', value: balances.filter(b => b.quantity > 0).length, icon: Package, color: 'text-green-400' },
                    { label: 'Sem Saldo', value: lowStock, icon: AlertTriangle, color: 'text-yellow-400' },
                    { label: 'Valor Total', value: fmtBrl(totalValue), icon: BarChart3, color: 'text-purple-400' },
                ].map(kpi => (
                    <div key={kpi.label} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                            <span className="text-xs text-gray-400">{kpi.label}</span>
                        </div>
                        <p className="text-xl font-bold text-white">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Filtro de almoxarifado */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                    <select
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                        value={selectedWarehouseId}
                        onChange={e => setSelectedWarehouseId(e.target.value)}
                    >
                        <option value="">Todos os almoxarifados</option>
                        {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</option>
                        ))}
                    </select>
                </div>
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500"
                        placeholder="Buscar insumo..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 bg-gray-800/50 rounded-xl p-1 w-fit">
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
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
                        <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                            {filteredBalances.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <Package className="w-10 h-10 mb-3 opacity-40" />
                                    <p>Nenhum item em estoque.</p>
                                    <p className="text-xs mt-1">Registre uma entrada para iniciar o controle.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                            <th className="text-left px-4 py-3">Insumo</th>
                                            <th className="text-left px-4 py-3 hidden md:table-cell">Almoxarifado</th>
                                            <th className="text-right px-4 py-3">Qtd</th>
                                            <th className="text-left px-4 py-3 hidden sm:table-cell">Un</th>
                                            <th className="text-right px-4 py-3 hidden lg:table-cell">Custo Médio</th>
                                            <th className="text-right px-4 py-3">Valor Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBalances.map((b, i) => (
                                            <tr
                                                key={`${b.warehouseId}-${b.inputCode}`}
                                                className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <p className="text-white font-medium">{b.inputDescription}</p>
                                                    {b.inputCode && <p className="text-xs text-gray-500">{b.inputCode}</p>}
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{b.warehouseName ?? '—'}</td>
                                                <td className={`px-4 py-3 text-right font-mono font-bold ${b.quantity <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {fmt(b.quantity)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{b.inputUnit}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 hidden lg:table-cell">{fmtBrl(b.avgUnitCost)}</td>
                                                <td className="px-4 py-3 text-right text-white font-medium">{fmtBrl(b.totalValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-gray-600 bg-gray-800/50">
                                            <td colSpan={5} className="px-4 py-3 text-right text-gray-400 text-xs uppercase font-medium">Total em Estoque</td>
                                            <td className="px-4 py-3 text-right text-white font-bold">{fmtBrl(filteredBalances.reduce((s, b) => s + b.totalValue, 0))}</td>
                                        </tr>
                                    </tfoot>
                                </table>
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
                                            <div className="flex items-center gap-3 bg-red-900/20 border border-red-800 rounded-xl p-4">
                                                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-red-300">Ruptura de estoque</p>
                                                    <p className="text-lg font-bold text-red-400">{ruptures} {ruptures === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                        {belowMin > 0 && (
                                            <div className="flex items-center gap-3 bg-yellow-900/20 border border-yellow-800 rounded-xl p-4">
                                                <TrendingDown className="w-5 h-5 text-yellow-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-yellow-300">Abaixo do mínimo</p>
                                                    <p className="text-lg font-bold text-yellow-400">{belowMin} {belowMin === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                        {excess > 0 && (
                                            <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-800 rounded-xl p-4">
                                                <TrendingUp className="w-5 h-5 text-blue-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs text-blue-300">Possível excesso</p>
                                                    <p className="text-lg font-bold text-blue-400">{excess} {excess === 1 ? 'item' : 'itens'}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : null;
                            })()}

                            {/* Tabela de posição líquida */}
                            <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-700">
                                    <p className="text-sm text-white font-medium">Posição Líquida por Insumo</p>
                                    <p className="text-xs text-gray-400">Saldo + Em Trânsito (POs ativos) − Reservado</p>
                                </div>
                                {netPositions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                        <Activity className="w-10 h-10 mb-3 opacity-40" />
                                        <p>Nenhum dado de posição líquida disponível.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                                <th className="text-left px-4 py-3">Insumo</th>
                                                <th className="text-left px-4 py-3 hidden md:table-cell">Almoxarifado</th>
                                                <th className="text-right px-4 py-3">Saldo</th>
                                                <th className="text-right px-4 py-3 hidden lg:table-cell">Em Trânsito</th>
                                                <th className="text-right px-4 py-3 hidden lg:table-cell">Reservado</th>
                                                <th className="text-right px-4 py-3 font-bold">Líquido</th>
                                                <th className="text-right px-4 py-3 hidden xl:table-cell">Valor</th>
                                                <th className="text-center px-4 py-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {netPositions.map((p, i) => {
                                                const smr = summary.find(s => s.warehouseId === p.warehouseId && s.inputCode === p.inputCode);
                                                const isRupture  = smr?.isRupture  ?? p.netQty <= 0;
                                                const isExcess   = smr?.isExcess   ?? false;
                                                const isBelowMin = p.isBelowMin;
                                                return (
                                                    <tr key={`${p.warehouseId}-${p.inputCode}`} className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}>
                                                        <td className="px-4 py-3">
                                                            <p className="text-white font-medium">{p.inputDescription}</p>
                                                            {p.inputCode && <p className="text-xs text-gray-500">{p.inputCode}</p>}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{p.warehouseName ?? '—'}</td>
                                                        <td className="px-4 py-3 text-right text-gray-300 font-mono">{fmt(p.balanceQty)}</td>
                                                        <td className="px-4 py-3 text-right text-green-400 font-mono hidden lg:table-cell">
                                                            {p.inTransitQty > 0 ? `+${fmt(p.inTransitQty)}` : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-yellow-400 font-mono hidden lg:table-cell">
                                                            {p.reservedQty > 0 ? `−${fmt(p.reservedQty)}` : '—'}
                                                        </td>
                                                        <td className={`px-4 py-3 text-right font-mono font-bold ${isRupture ? 'text-red-400' : isBelowMin ? 'text-yellow-400' : 'text-green-400'}`}>
                                                            {fmt(p.netQty)} {p.inputUnit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-300 hidden xl:table-cell">{fmtBrl(p.totalValue)}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            {isRupture ? (
                                                                <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/40 text-red-400">Ruptura</span>
                                                            ) : isBelowMin ? (
                                                                <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900/40 text-yellow-400">Baixo</span>
                                                            ) : isExcess ? (
                                                                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-900/40 text-blue-400">Excesso</span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded-full text-xs bg-green-900/40 text-green-400">OK</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Giro de estoque (30 dias) */}
                            {summary.filter(s => s.outflow30d > 0).length > 0 && (
                                <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-700">
                                        <p className="text-sm text-white font-medium">Giro de Estoque — últimos 30 dias</p>
                                        <p className="text-xs text-gray-400">Saídas ÷ saldo atual. Quanto maior, maior a rotatividade.</p>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                                <th className="text-left px-4 py-3">Insumo</th>
                                                <th className="text-right px-4 py-3">Saídas 30d</th>
                                                <th className="text-right px-4 py-3">Entradas 30d</th>
                                                <th className="text-right px-4 py-3">Giro</th>
                                                <th className="text-right px-4 py-3 hidden md:table-cell">Último mov.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {summary
                                                .filter(s => s.outflow30d > 0 || s.inflow30d > 0)
                                                .sort((a, b) => b.turnoverRate - a.turnoverRate)
                                                .map(s => (
                                                <tr key={`${s.warehouseId}-${s.inputCode}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                    <td className="px-4 py-3">
                                                        <p className="text-white">{s.inputDescription}</p>
                                                        <p className="text-xs text-gray-500">{s.warehouseName}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-red-400 font-mono">{fmt(s.outflow30d)} {s.inputUnit}</td>
                                                    <td className="px-4 py-3 text-right text-green-400 font-mono">{fmt(s.inflow30d)} {s.inputUnit}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`font-bold ${s.turnoverRate > 0.5 ? 'text-green-400' : s.turnoverRate > 0.1 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                            {(s.turnoverRate * 100).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-400 hidden md:table-cell">
                                                        {s.lastMovementDate ? new Date(s.lastMovementDate).toLocaleDateString('pt-BR') : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: MOVIMENTOS ── */}
                    {tab === 'movimentos' && (
                        <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                                <span className="text-sm text-gray-400">{filteredMovements.length} movimentos</span>
                                <button
                                    onClick={() => setMovementModal('adjust')}
                                    className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300"
                                >
                                    <Plus className="w-3 h-3" /> Ajuste
                                </button>
                            </div>
                            {filteredMovements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <History className="w-10 h-10 mb-3 opacity-40" />
                                    <p>Nenhum movimento registrado.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                            <th className="text-left px-4 py-3">Data</th>
                                            <th className="text-left px-4 py-3">Tipo</th>
                                            <th className="text-left px-4 py-3">Insumo</th>
                                            <th className="text-left px-4 py-3 hidden md:table-cell">Almoxarifado</th>
                                            <th className="text-right px-4 py-3">Qtd</th>
                                            <th className="text-right px-4 py-3 hidden lg:table-cell">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMovements.map(m => {
                                            const isIn = m.type === 'in' || m.type === 'transfer_in';
                                            const typeLabel: Record<string, string> = {
                                                in: 'Entrada', out: 'Saída', adjust: 'Ajuste',
                                                transfer_in: 'Transf. In', transfer_out: 'Transf. Out',
                                            };
                                            return (
                                                <tr key={m.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                                        {new Date(m.movedAt).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                            isIn ? 'bg-green-900/40 text-green-400' :
                                                            m.type === 'adjust' ? 'bg-yellow-900/40 text-yellow-400' :
                                                            'bg-red-900/40 text-red-400'
                                                        }`}>
                                                            {typeLabel[m.type]}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-white">{m.inputDescription}</p>
                                                        {m.notes && <p className="text-xs text-gray-500">{m.notes}</p>}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{m.warehouseName ?? '—'}</td>
                                                    <td className={`px-4 py-3 text-right font-mono font-bold ${isIn ? 'text-green-400' : 'text-red-400'}`}>
                                                        {isIn ? '+' : '−'}{fmt(m.quantity)} {m.inputUnit}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-300 hidden lg:table-cell">
                                                        {m.totalCost != null ? fmtBrl(m.totalCost) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ── TAB: TRANSFERÊNCIAS ── */}
                    {tab === 'transferencias' && (
                        <div className="space-y-3">
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setTransferModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" /> Nova Transferência
                                </button>
                            </div>
                            <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                                {transfers.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                        <ArrowLeftRight className="w-10 h-10 mb-3 opacity-40" />
                                        <p>Nenhuma transferência registrada.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-700">
                                        {transfers.map(t => {
                                            const statusColor: Record<string, string> = {
                                                in_transit: 'bg-yellow-900/40 text-yellow-400',
                                                received: 'bg-green-900/40 text-green-400',
                                                cancelled: 'bg-gray-700 text-gray-500',
                                            };
                                            const statusLabel: Record<string, string> = {
                                                in_transit: 'Em trânsito',
                                                received: 'Recebida',
                                                cancelled: 'Cancelada',
                                            };
                                            return (
                                                <div key={t.id} className="p-4 hover:bg-gray-700/20">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-white font-medium">{t.fromWarehouseName ?? '—'}</span>
                                                                <ArrowLeftRight className="w-4 h-4 text-gray-500 shrink-0" />
                                                                <span className="text-white font-medium">{t.toWarehouseName ?? '—'}</span>
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[t.status]}`}>
                                                                    {statusLabel[t.status]}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mt-1">
                                                                {new Date(t.created_at).toLocaleDateString('pt-BR')}
                                                                {t.notes && ` — ${t.notes}`}
                                                            </p>
                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                {t.items.map((item, idx) => (
                                                                    <span key={idx} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                                                                        {item.inputDescription}: {fmt(item.quantity)} {item.inputUnit}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {t.status === 'in_transit' && (
                                                            <div className="flex gap-2 shrink-0">
                                                                <button
                                                                    onClick={async () => {
                                                                        await inventoryService.receiveTransfer(t.id);
                                                                        load();
                                                                    }}
                                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-medium"
                                                                >
                                                                    <CheckCircle2 className="w-3 h-3" /> Receber
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm('Cancelar transferência?')) return;
                                                                        await inventoryService.cancelTransfer(t.id);
                                                                        load();
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:text-red-400 text-xs"
                                                                >
                                                                    Cancelar
                                                                </button>
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
                        <div className="space-y-3">
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setWarehouseModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" /> Novo Almoxarifado
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {warehouses.length === 0 && (
                                    <div className="col-span-3 flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-800/30 border border-gray-700 rounded-xl">
                                        <Warehouse className="w-10 h-10 mb-3 opacity-40" />
                                        <p>Nenhum almoxarifado cadastrado.</p>
                                    </div>
                                )}
                                {warehouses.map(w => {
                                    const typeLabel: Record<string, string> = { site: 'Obra', central: 'Central', virtual: 'Virtual' };
                                    const wBalance = balances.filter(b => b.warehouseId === w.id);
                                    const wValue = wBalance.reduce((s, b) => s + b.totalValue, 0);
                                    return (
                                        <div key={w.id} className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 space-y-3">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-semibold text-white">{w.name}</p>
                                                    <p className="text-xs text-gray-400">{typeLabel[w.type]}{w.projectName ? ` — ${w.projectName}` : ' — Central'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setWarehouseModal(w)} className="text-gray-500 hover:text-blue-400">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm(`Desativar "${w.name}"?`)) return;
                                                            await inventoryService.updateWarehouse(w.id, { isActive: false });
                                                            load();
                                                        }}
                                                        className="text-gray-500 hover:text-red-400"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-center">
                                                <div className="bg-gray-900/50 rounded-lg py-2">
                                                    <p className="text-xs text-gray-500">Itens</p>
                                                    <p className="font-bold text-white">{wBalance.filter(b => b.quantity > 0).length}</p>
                                                </div>
                                                <div className="bg-gray-900/50 rounded-lg py-2">
                                                    <p className="text-xs text-gray-500">Valor</p>
                                                    <p className="font-bold text-blue-300 text-sm">{fmtBrl(wValue)}</p>
                                                </div>
                                            </div>
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${w.isActive ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                                                {w.isActive ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: LEAD TIMES ── */}
                    {tab === 'lead_times' && (
                        <div className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-white font-medium">Lead Time por Fornecedor</p>
                                    <p className="text-xs text-gray-400">Usado pelo Plano de Aquisições para calcular a data de compra sugerida.</p>
                                </div>
                            </div>
                            {leadTimes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <Clock className="w-10 h-10 mb-3 opacity-40" />
                                    <p>Nenhum lead time cadastrado.</p>
                                    <p className="text-xs mt-1">Cadastre os prazos de entrega no módulo de Fornecedores.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                            <th className="text-left px-4 py-3">Fornecedor</th>
                                            <th className="text-left px-4 py-3">Insumo / Categoria</th>
                                            <th className="text-center px-4 py-3">Prazo (dias)</th>
                                            <th className="text-left px-4 py-3 hidden md:table-cell">Obs.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leadTimes.map(lt => (
                                            <tr key={lt.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                <td className="px-4 py-3 text-white">{lt.supplierName ?? lt.supplierId}</td>
                                                <td className="px-4 py-3 text-gray-300">
                                                    {lt.inputCode ? <code className="text-xs bg-gray-700 px-1 rounded">{lt.inputCode}</code> : <span className="text-gray-500 italic text-xs">Geral</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="px-3 py-1 rounded-full bg-blue-900/40 text-blue-300 font-bold text-sm">{lt.leadTimeDays}d</span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 hidden md:table-cell text-xs">{lt.notes ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ── TAB: REQUISIÇÕES ── */}
                    {tab === 'requisicoes' && (
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
                </>
            )}

            {movementModal && (
                <MovementModal
                    orgId={activeOrganizationId}
                    warehouses={warehouses.filter(w => w.isActive)}
                    defaultType={movementModal}
                    onClose={() => setMovementModal(null)}
                    onCreated={() => { setMovementModal(null); load(); }}
                />
            )}
            {warehouseModal && (
                <WarehouseModal
                    orgId={activeOrganizationId}
                    projects={projects.filter(p => p.id).map(p => ({ id: p.id as string, name: p.name }))}
                    existing={warehouseModal !== true ? warehouseModal : undefined}
                    onClose={() => setWarehouseModal(null)}
                    onSaved={() => { setWarehouseModal(null); load(); }}
                />
            )}
            {transferModal && (
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-2">
                        <Send className="w-5 h-5 text-blue-400" />
                        <h3 className="font-semibold text-white">Nova Transferência</h3>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Origem *</label>
                            <select
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.fromWarehouseId}
                                onChange={e => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))}
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Destino *</label>
                            <select
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.toWarehouseId}
                                onChange={e => setForm(f => ({ ...f, toWarehouseId: e.target.value }))}
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Observações</label>
                        <input className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-gray-400 uppercase font-medium">Itens</label>
                            <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                                <Plus className="w-3 h-3" /> Adicionar
                            </button>
                        </div>
                        {form.items.length === 0 && (
                            <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">Adicione os materiais a transferir.</div>
                        )}
                        <div className="space-y-2">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                                    <div className="col-span-5">
                                        <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                                        <input className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white" value={item.inputDescription} onChange={e => updateItem(idx, { inputDescription: e.target.value })} placeholder="Insumo" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Cód.</label>
                                        <input className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white" value={item.inputCode ?? ''} onChange={e => updateItem(idx, { inputCode: e.target.value || undefined })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Un</label>
                                        <input className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white" value={item.inputUnit} onChange={e => updateItem(idx, { inputUnit: e.target.value })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Qtd</label>
                                        <input type="number" min="0.001" step="0.01" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white" value={item.quantity || ''} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-700 shrink-0">
                    {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
                        <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Enviar Transferência
                        </button>
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
    pending: 'bg-yellow-500/20 text-yellow-300',
    approved: 'bg-green-500/20 text-green-300',
    rejected: 'bg-red-500/20 text-red-300',
    separated: 'bg-blue-500/20 text-blue-300',
    delivered: 'bg-gray-500/20 text-gray-300',
    cancelled: 'bg-gray-700/50 text-gray-500',
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

    const filters = ['', 'pending', 'approved', 'separated', 'delivered', 'rejected', 'cancelled'];
    const filterLabels: Record<string, string> = { '': 'Todos', ...STATUS_LABELS };
    const visible = reqFilter ? requests.filter(r => r.status === reqFilter) : requests;

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
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reqFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowRequestModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Nova Requisição
                </button>
            </div>

            {err && <p className="text-red-400 text-xs">{err}</p>}

            {visible.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
                    Nenhuma requisição{reqFilter ? ` com status "${STATUS_LABELS[reqFilter]}"` : ''}.
                </div>
            )}

            <div className="space-y-4">
                {visible.map(req => (
                    <div key={req.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <ClipboardList className="w-4 h-4 text-blue-400 shrink-0" />
                                <span className="font-semibold text-white">{req.number}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                                    {STATUS_LABELS[req.status]}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {req.status === 'pending' && (
                                    <button
                                        onClick={() => setApprovingRequest(req)}
                                        className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-medium flex items-center gap-1"
                                    >
                                        <Check className="w-3 h-3" /> Avaliar
                                    </button>
                                )}
                                {(req.status === 'approved' || req.status === 'separated') && (
                                    <button
                                        onClick={() => handleDeliver(req.id)}
                                        disabled={delivering === req.id}
                                        className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {delivering === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                        Entregar
                                    </button>
                                )}
                                {(req.status === 'pending' || req.status === 'approved' || req.status === 'separated') && (
                                    <button
                                        onClick={() => handleCancel(req.id)}
                                        disabled={cancelling === req.id}
                                        className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {cancelling === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-gray-400">
                            <div><span className="text-gray-500">Solicitante:</span> <span className="text-gray-200">{req.requestedBy}</span></div>
                            {req.warehouseName && <div><span className="text-gray-500">Almoxarifado:</span> <span className="text-gray-200">{req.warehouseName}</span></div>}
                            {req.projectName && <div><span className="text-gray-500">Obra:</span> <span className="text-gray-200">{req.projectName}</span></div>}
                            <div><span className="text-gray-500">Data:</span> <span className="text-gray-200">{new Date(req.requestedAt).toLocaleDateString('pt-BR')}</span></div>
                            {req.approvedBy && <div><span className="text-gray-500">Aprovado por:</span> <span className="text-gray-200">{req.approvedBy}</span></div>}
                        </div>
                        {req.notes && <p className="text-xs text-gray-500 italic">{req.notes}</p>}
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-700">
                                        <th className="text-left pb-1 font-medium">Insumo</th>
                                        <th className="text-left pb-1 font-medium">Cód.</th>
                                        <th className="text-right pb-1 font-medium">Solicitado</th>
                                        <th className="text-right pb-1 font-medium">Aprovado</th>
                                        <th className="text-right pb-1 font-medium">Entregue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {req.items.map(item => (
                                        <tr key={item.id} className="border-b border-gray-800">
                                            <td className="py-1.5 text-gray-200">{item.inputDescription}</td>
                                            <td className="py-1.5 text-gray-500">{item.inputCode ?? '—'}</td>
                                            <td className="py-1.5 text-right text-gray-300">{item.quantityRequested} {item.inputUnit}</td>
                                            <td className="py-1.5 text-right text-gray-300">{item.quantityApproved != null ? `${item.quantityApproved} ${item.inputUnit}` : '—'}</td>
                                            <td className="py-1.5 text-right text-gray-300">{item.quantityDelivered != null ? `${item.quantityDelivered} ${item.inputUnit}` : '—'}</td>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-blue-400" />
                        <h3 className="font-semibold text-white">Nova Requisição de Material</h3>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Solicitante *</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.requestedBy}
                                onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))}
                                placeholder="Nome do solicitante"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Almoxarifado</label>
                            <select
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={form.warehouseId ?? ''}
                                onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value || undefined }))}
                            >
                                <option value="">— Sem almoxarifado —</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Observações</label>
                        <input
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-gray-400 uppercase font-medium">Itens *</label>
                            <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                                <Plus className="w-3 h-3" /> Adicionar
                            </button>
                        </div>
                        {form.items.length === 0 && (
                            <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
                                Adicione os materiais necessários.
                            </div>
                        )}
                        <div className="space-y-2">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                                    <div className="col-span-5">
                                        <label className="block text-xs text-gray-500 mb-1">Descrição *</label>
                                        <input
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                            value={item.inputDescription}
                                            onChange={e => updateItem(idx, { inputDescription: e.target.value })}
                                            placeholder="Insumo"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Cód.</label>
                                        <input
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                            value={item.inputCode ?? ''}
                                            onChange={e => updateItem(idx, { inputCode: e.target.value || undefined })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Un</label>
                                        <input
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                            value={item.inputUnit}
                                            onChange={e => updateItem(idx, { inputUnit: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Qtd *</label>
                                        <input
                                            type="number" min="0.001" step="0.01"
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                            value={item.quantityRequested || ''}
                                            onChange={e => updateItem(idx, { quantityRequested: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-700 shrink-0">
                    {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
                        <button
                            onClick={save} disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Enviar Requisição
                        </button>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
                    <div>
                        <h3 className="font-semibold text-white">Avaliar Requisição {request.number}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Solicitante: {request.requestedBy}</p>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Aprovado / Rejeitado por *</label>
                        <input
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            value={approvedBy}
                            onChange={e => setApprovedBy(e.target.value)}
                            placeholder="Seu nome"
                        />
                    </div>

                    <div>
                        <p className="text-xs text-gray-400 uppercase font-medium mb-2">Itens — ajuste as quantidades aprovadas</p>
                        <div className="space-y-2">
                            {request.items.map(item => (
                                <div key={item.id} className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{item.inputDescription}</p>
                                        <p className="text-xs text-gray-500">{item.inputCode ?? ''} · solicitado: {item.quantityRequested} {item.inputUnit}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <input
                                            type="number" min="0" step="0.01"
                                            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white text-right"
                                            value={quantities[item.id] ?? item.quantityRequested}
                                            onChange={e => setQuantities(q => ({ ...q, [item.id]: parseFloat(e.target.value) || 0 }))}
                                        />
                                        <span className="text-xs text-gray-500">{item.inputUnit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-700 shrink-0">
                    {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
                    <div className="flex gap-3">
                        <button
                            onClick={() => handle('reject')} disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                            Rejeitar
                        </button>
                        <button
                            onClick={() => handle('approve')} disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Aprovar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
