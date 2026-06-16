// components/InventoryModule.tsx — Módulo Almoxarifado Fase 1

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
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
import { useStore } from '../store/useStore';
import type {
    Warehouse as WarehouseType,
    StockBalance,
    StockMovement,
    SupplierLeadTime,
    CreateWarehouseInput,
    CreateStockMovementInput,
    CreateSupplierLeadTimeInput,
} from '../types/inventory';

interface Props {
    activeOrganizationId: string | null;
    onChangeView: (view: string) => void;
}

type Tab = 'saldos' | 'movimentos' | 'almoxarifados' | 'lead_times';

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

    const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>('');
    const [searchTerm, setSearchTerm] = React.useState('');

    const [movementModal, setMovementModal] = React.useState<'in' | 'out' | 'adjust' | null>(null);
    const [warehouseModal, setWarehouseModal] = React.useState<WarehouseType | true | null>(null);

    const load = React.useCallback(async () => {
        if (!activeOrganizationId) return;
        setLoading(true);
        try {
            const whs = await inventoryService.listWarehouses(activeOrganizationId, false);
            setWarehouses(whs);
            if (!selectedWarehouseId && whs.length > 0) setSelectedWarehouseId(whs[0].id);

            const [bal, mov, lts] = await Promise.all([
                inventoryService.listBalances(activeOrganizationId, { warehouseId: selectedWarehouseId || undefined }),
                inventoryService.listMovements(activeOrganizationId, { warehouseId: selectedWarehouseId || undefined }),
                inventoryService.listLeadTimes(activeOrganizationId),
            ]);
            setBalances(bal);
            setMovements(mov);
            setLeadTimes(lts);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, selectedWarehouseId]);

    React.useEffect(() => { load(); }, [load]);

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
            <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 w-fit">
                {([
                    { key: 'saldos', label: 'Saldos', icon: Package },
                    { key: 'movimentos', label: 'Movimentos', icon: History },
                    { key: 'almoxarifados', label: 'Almoxarifados', icon: Warehouse },
                    { key: 'lead_times', label: 'Lead Time', icon: Clock },
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
                </>
            )}

            {/* Modais */}
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
        </div>
    );
};
