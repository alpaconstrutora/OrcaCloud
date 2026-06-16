import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShoppingCart, RefreshCw, Calendar, AlertTriangle,
    PackageSearch, ChevronDown, ChevronUp, CheckCircle2,
    BarChart2, ListFilter, Zap, FileText, Truck,
    Square, CheckSquare, Users, X, ChevronRight,
} from 'lucide-react';
import { procurementService } from '../services/procurementService';
import { projectService, ProjectData } from '../services/projectService';
import { supplierService } from '../services/supplierService';
import {
    ProcurementPlanItem,
    ProcurementKPIs,
    ProcurementMonthlySpend,
    ProcurementStatus,
} from '../types/procurement';

interface Props {
    activeOrganizationId: string | null;
    onChangeView: (view: string) => void;
}

type Tab = 'plano' | 'backlog' | 'financeiro';

const STATUS_LABELS: Record<ProcurementStatus, string> = {
    pending:   'Pendente',
    quoted:    'Cotado',
    ordered:   'Pedido',
    received:  'Recebido',
    cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<ProcurementStatus, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    quoted:    'bg-blue-100 text-blue-800',
    ordered:   'bg-purple-100 text-purple-800',
    received:  'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-500',
};

const fmtBrl  = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtQty  = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

interface Supplier { id: string; name: string; }

// ── Modal: Gerar Cotação ───────────────────────────────────────────────────────
function QuotationModal({
    count, projectId, organizationId, selectedIds,
    onClose, onSuccess,
}: {
    count: number; projectId: string; organizationId: string;
    selectedIds: string[];
    onClose: () => void;
    onSuccess: (num: string) => void;
}) {
    const [title, setTitle] = useState(`Cotação Plano de Aquisições — ${new Date().toLocaleDateString('pt-BR')}`);
    const [deadline, setDeadline] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        setLoading(true);
        setError('');
        try {
            const { quotationNumber } = await procurementService.generateQuotationFromItems(
                selectedIds, projectId, organizationId, { title, deadline }
            );
            onSuccess(quotationNumber);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h2 className="font-semibold text-gray-900">Gerar Solicitação de Cotação</h2>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
                </div>
                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Será criada uma cotação com <strong>{count} {count === 1 ? 'item' : 'itens'}</strong> do plano,
                        com status <em>Aberta</em>.
                    </p>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Título da cotação</label>
                        <input
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Prazo de resposta</label>
                        <input
                            type="date"
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                </div>
                <div className="flex gap-2 justify-end p-4 border-t">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cancelar</button>
                    <button
                        onClick={submit} disabled={loading || !title}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
                    >
                        {loading ? 'Gerando…' : 'Gerar Cotação'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal: Gerar Pedido Direto ─────────────────────────────────────────────────
function OrderModal({
    count, projectId, organizationId, selectedIds, suppliers,
    onClose, onSuccess,
}: {
    count: number; projectId: string; organizationId: string;
    selectedIds: string[]; suppliers: Supplier[];
    onClose: () => void;
    onSuccess: (num: string) => void;
}) {
    const [supplierId, setSupplierId] = useState('');
    const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!supplierId) { setError('Selecione o fornecedor.'); return; }
        setLoading(true);
        setError('');
        try {
            const { orderNumber } = await procurementService.generateOrderFromItems(
                selectedIds, projectId, supplierId, organizationId, { deliveryDate, notes }
            );
            onSuccess(orderNumber);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Truck className="w-5 h-5 text-purple-600" />
                        <h2 className="font-semibold text-gray-900">Gerar Pedido Direto</h2>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
                </div>
                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Será criado um pedido em <em>Rascunho</em> com <strong>{count} {count === 1 ? 'item' : 'itens'}</strong>.
                    </p>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Fornecedor *</label>
                        <select
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            value={supplierId}
                            onChange={e => setSupplierId(e.target.value)}
                        >
                            <option value="">Selecione…</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Data de entrega</label>
                        <input
                            type="date"
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            value={deliveryDate}
                            onChange={e => setDeliveryDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
                        <textarea
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            rows={2}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                </div>
                <div className="flex gap-2 justify-end p-4 border-t">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cancelar</button>
                    <button
                        onClick={submit} disabled={loading || !supplierId}
                        className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50 hover:bg-purple-700"
                    >
                        {loading ? 'Gerando…' : 'Gerar Pedido'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Módulo principal ───────────────────────────────────────────────────────────
export const ProcurementModule: React.FC<Props> = ({ activeOrganizationId }) => {
    const [tab, setTab] = useState<Tab>('plano');
    const [projects, setProjects] = useState<Pick<ProjectData, 'id' | 'name'>[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [items, setItems] = useState<ProcurementPlanItem[]>([]);
    const [monthly, setMonthly] = useState<ProcurementMonthlySpend[]>([]);
    const [kpis, setKpis] = useState<ProcurementKPIs | null>(null);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [statusFilter, setStatusFilter] = useState<ProcurementStatus | ''>('');
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [modal, setModal] = useState<'quotation' | 'order' | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // load projects
    useEffect(() => {
        if (!activeOrganizationId) return;
        projectService.listProjects(undefined, activeOrganizationId).then(list => {
            const filtered = (list ?? []).filter(p =>
                (p.settings as any)?.classification === 'PLANEJAMENTO' ||
                (p.settings as any)?.classification === 'OBRA'
            );
            setProjects(filtered.map(p => ({ id: p.id!, name: p.name })));
            if (filtered.length > 0 && !selectedProjectId) setSelectedProjectId(filtered[0].id!);
        });
    }, [activeOrganizationId]);

    // load suppliers
    useEffect(() => {
        if (!activeOrganizationId) return;
        supplierService.listSuppliers(activeOrganizationId).then(list =>
            setSuppliers((list ?? []).map(s => ({ id: s.id, name: s.name })))
        );
    }, [activeOrganizationId]);

    const loadData = useCallback(async () => {
        if (!activeOrganizationId || !selectedProjectId) return;
        setLoading(true);
        setError(null);
        try {
            const [itemsData, monthlyData, kpisData] = await Promise.all([
                procurementService.listPlanItems(activeOrganizationId, selectedProjectId),
                procurementService.getMonthlySpend(activeOrganizationId, selectedProjectId),
                procurementService.getKPIs(activeOrganizationId, selectedProjectId),
            ]);
            setItems(itemsData);
            setMonthly(monthlyData);
            setKpis(kpisData);
            setSelected(new Set());
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [activeOrganizationId, selectedProjectId]);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    };

    const handleGenerate = async () => {
        if (!activeOrganizationId || !selectedProjectId) return;
        setGenerating(true); setError(null);
        try {
            const { inserted } = await procurementService.generatePlan(selectedProjectId, activeOrganizationId);
            await loadData();
            if (inserted === 0)
                setError('Nenhuma necessidade encontrada. Verifique se o projeto tem composições com materiais e distribuição de cronograma.');
            else showToast(`Plano gerado com ${inserted} itens.`);
        } catch (e: any) { setError(e.message); }
        finally { setGenerating(false); }
    };

    const handleRefreshNet = async () => {
        if (!activeOrganizationId || !selectedProjectId) return;
        setLoading(true);
        try {
            await procurementService.refreshNetPositions(activeOrganizationId, selectedProjectId);
            await loadData();
            showToast('Posição líquida atualizada.');
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const handleStatusChange = async (itemId: string, newStatus: ProcurementStatus) => {
        try {
            await procurementService.updateItem(itemId, { status: newStatus });
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
        } catch (e: any) { setError(e.message); }
    };

    // ── selection helpers ──────────────────────────────────────────────────────
    const toggleItem = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = (ids: string[]) => {
        setSelected(prev => {
            const allIn = ids.every(id => prev.has(id));
            const next = new Set(prev);
            if (allIn) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const clearSelection = () => setSelected(new Set());

    // ── derived data ───────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    const filteredItems = useMemo(() =>
        items.filter(i => !statusFilter || i.status === statusFilter),
        [items, statusFilter]
    );

    const planItems    = useMemo(() => filteredItems.filter(i => i.suggestedBuyDate), [filteredItems]);
    const backlogItems = useMemo(() => items.filter(i => !i.suggestedBuyDate && i.status !== 'cancelled'), [items]);
    const overdueItems = useMemo(() =>
        items.filter(i => i.suggestedBuyDate && i.suggestedBuyDate < today && i.status === 'pending'),
        [items, today]
    );

    const byMonth = useMemo(() => {
        const map: Record<string, ProcurementPlanItem[]> = {};
        for (const item of planItems) {
            const m = item.suggestedBuyDate!.slice(0, 7);
            if (!map[m]) map[m] = [];
            map[m].push(item);
        }
        return map;
    }, [planItems]);

    const sortedMonths = useMemo(() => Object.keys(byMonth).sort(), [byMonth]);

    // Curva S: planned = todos os meses; realized = status ordered/received
    const realizadaByMonth = useMemo(() => {
        const map: Record<string, number> = {};
        for (const item of items) {
            if ((item.status === 'ordered' || item.status === 'received') && item.suggestedBuyDate) {
                const m = item.suggestedBuyDate.slice(0, 7);
                map[m] = (map[m] ?? 0) + item.estimatedTotal;
            }
        }
        return map;
    }, [items]);

    function urgencyColor(buyDate?: string): string {
        if (!buyDate) return '';
        const in7  = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10);
        const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        if (buyDate < today)   return 'border-l-4 border-red-500 bg-red-50';
        if (buyDate <= in7)    return 'border-l-4 border-orange-400';
        if (buyDate <= in30)   return 'border-l-4 border-yellow-400';
        return '';
    }

    // group by consolidation for detail view inside a month
    function groupByConsolidation(monthItems: ProcurementPlanItem[]) {
        const map: Record<string, ProcurementPlanItem[]> = {};
        for (const i of monthItems) {
            const key = i.consolidationGroupId ?? i.id;
            if (!map[key]) map[key] = [];
            map[key].push(i);
        }
        return map;
    }

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded shadow-lg">
                    {toast}
                </div>
            )}

            {/* Modals */}
            {modal === 'quotation' && activeOrganizationId && selectedProjectId && (
                <QuotationModal
                    count={selected.size}
                    projectId={selectedProjectId}
                    organizationId={activeOrganizationId}
                    selectedIds={[...selected]}
                    onClose={() => setModal(null)}
                    onSuccess={num => { setModal(null); loadData(); showToast(`Cotação ${num} criada com sucesso!`); }}
                />
            )}
            {modal === 'order' && activeOrganizationId && selectedProjectId && (
                <OrderModal
                    count={selected.size}
                    projectId={selectedProjectId}
                    organizationId={activeOrganizationId}
                    selectedIds={[...selected]}
                    suppliers={suppliers}
                    onClose={() => setModal(null)}
                    onSuccess={num => { setModal(null); loadData(); showToast(`Pedido ${num} criado com sucesso!`); }}
                />
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="w-6 h-6 text-indigo-600" />
                    <h1 className="text-xl font-bold text-gray-900">Plano de Aquisições</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        className="border rounded px-2 py-1.5 text-sm"
                        value={selectedProjectId}
                        onChange={e => { setSelectedProjectId(e.target.value); setSelected(new Set()); }}
                    >
                        <option value="">Selecione o projeto…</option>
                        {projects.map(p => <option key={p.id} value={p.id!}>{p.name}</option>)}
                    </select>
                    <button
                        onClick={handleGenerate}
                        disabled={generating || !selectedProjectId}
                        className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-indigo-700"
                    >
                        {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        {generating ? 'Gerando…' : 'Gerar Plano'}
                    </button>
                    <button
                        onClick={handleRefreshNet}
                        disabled={loading || !selectedProjectId}
                        className="flex items-center gap-1.5 border px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        title="Atualiza posição líquida sem regenerar o plano"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar Estoque
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm flex gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                </div>
            )}

            {/* Risco de atraso */}
            {overdueItems.length > 0 && (
                <div className="bg-red-50 border border-red-300 rounded p-3 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-red-800">
                            {overdueItems.length} compra(s) com data de compra vencida
                        </p>
                        <p className="text-xs text-red-600">
                            Esses itens precisam ser cotados ou pedidos imediatamente para não atrasar a obra.
                        </p>
                    </div>
                    <button
                        className="ml-auto text-xs text-red-700 underline whitespace-nowrap"
                        onClick={() => {
                            setStatusFilter('pending');
                            setTab('plano');
                            setExpandedMonths(new Set(overdueItems.map(i => i.suggestedBuyDate!.slice(0, 7))));
                        }}
                    >
                        Ver itens
                    </button>
                </div>
            )}

            {/* KPIs */}
            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-gray-500 mb-1">Total estimado</p>
                        <p className="text-lg font-bold text-indigo-600">{fmtBrl(kpis.totalEstimated)}</p>
                        <p className="text-xs text-gray-400">{kpis.totalItems} itens</p>
                    </div>
                    <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-gray-500 mb-1">Próximos 30 dias</p>
                        <p className="text-lg font-bold text-orange-500">{fmtBrl(kpis.next30dEstimated)}</p>
                        <p className="text-xs text-gray-400">{kpis.next30dItems} compras</p>
                    </div>
                    <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-gray-500 mb-1">Backlog (sem data)</p>
                        <p className="text-lg font-bold text-yellow-600">{kpis.backlogItems}</p>
                        <p className="text-xs text-gray-400">itens sem programação</p>
                    </div>
                    <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-gray-500 mb-1">Plano obsoleto</p>
                        <p className={`text-lg font-bold ${kpis.staleItems > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {kpis.staleItems}
                        </p>
                        <p className="text-xs text-gray-400">itens desatualizados</p>
                    </div>
                </div>
            )}

            {/* Barra de seleção */}
            {selected.size > 0 && (
                <div className="sticky top-0 z-10 bg-indigo-600 text-white rounded-lg px-4 py-2 flex items-center gap-3 shadow-md">
                    <CheckSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">{selected.size} item(s) selecionado(s)</span>
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={() => setModal('quotation')}
                            className="flex items-center gap-1.5 bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-blue-50"
                        >
                            <FileText className="w-3.5 h-3.5" /> Gerar Cotação
                        </button>
                        <button
                            onClick={() => setModal('order')}
                            className="flex items-center gap-1.5 bg-white text-purple-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-purple-50"
                        >
                            <Truck className="w-3.5 h-3.5" /> Gerar Pedido
                        </button>
                        <button onClick={clearSelection} className="text-white/70 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b">
                <div className="flex gap-1">
                    {([
                        { id: 'plano',      label: 'Calendário de Compras', icon: Calendar      },
                        { id: 'backlog',    label: `Backlog (${backlogItems.length})`, icon: PackageSearch },
                        { id: 'financeiro', label: 'Curva de Desembolso',   icon: BarChart2     },
                    ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tab Plano ── */}
            {tab === 'plano' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <ListFilter className="w-4 h-4 text-gray-400" />
                        <select
                            className="border rounded px-2 py-1 text-sm"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as ProcurementStatus | '')}
                        >
                            <option value="">Todos os status</option>
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                            ))}
                        </select>
                        {kpis?.staleItems ? (
                            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                                <AlertTriangle className="w-3 h-3" />
                                {kpis.staleItems} obsoleto(s) — regenere o plano
                            </span>
                        ) : null}
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-gray-400">Carregando…</div>
                    ) : sortedMonths.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Nenhum item programado.</p>
                            <p className="text-xs mt-1">Clique em <strong>Gerar Plano</strong> para iniciar o motor.</p>
                        </div>
                    ) : (
                        sortedMonths.map(month => {
                            const monthItems = byMonth[month];
                            const monthTotal = monthItems.reduce((s, i) => s + i.estimatedTotal, 0);
                            const isOpen = expandedMonths.has(month);
                            const [y, m] = month.split('-');
                            const monthLabel = new Date(`${y}-${m}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                            const monthIds = monthItems.map(i => i.id);
                            const allMonthSelected = monthIds.every(id => selected.has(id));
                            const consolidGroups = groupByConsolidation(monthItems);

                            return (
                                <div key={month} className="bg-white rounded-lg border overflow-hidden">
                                    <div className="flex items-center px-3 py-3 hover:bg-gray-50 gap-2">
                                        {/* select-all do mês */}
                                        <button onClick={() => toggleAll(monthIds)} className="shrink-0">
                                            {allMonthSelected
                                                ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                : <Square className="w-4 h-4 text-gray-400" />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setExpandedMonths(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(month)) next.delete(month); else next.add(month);
                                                    return next;
                                                });
                                            }}
                                            className="flex-1 flex items-center justify-between gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Calendar className="w-4 h-4 text-indigo-500" />
                                                <span className="font-medium text-gray-800 capitalize">{monthLabel}</span>
                                                <span className="text-xs text-gray-500">{monthItems.length} itens</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-semibold text-indigo-600">{fmtBrl(monthTotal)}</span>
                                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </div>
                                        </button>
                                    </div>

                                    {isOpen && (
                                        <div className="border-t">
                                            {Object.entries(consolidGroups).map(([groupId, groupItems]) => {
                                                const isMulti = groupItems.length > 1;
                                                const groupExpanded = expandedGroups.has(groupId);
                                                const representative = groupItems[0];
                                                const groupTotal = groupItems.reduce((s, i) => s + i.estimatedTotal, 0);

                                                if (!isMulti) {
                                                    // item único — linha direta
                                                    return (
                                                        <ItemRow
                                                            key={representative.id}
                                                            item={representative}
                                                            isSelected={selected.has(representative.id)}
                                                            onToggle={() => toggleItem(representative.id)}
                                                            onStatusChange={handleStatusChange}
                                                            today={today}
                                                        />
                                                    );
                                                }

                                                // grupo consolidado
                                                return (
                                                    <div key={groupId} className="border-b last:border-0">
                                                        <div
                                                            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 cursor-pointer hover:bg-indigo-100"
                                                            onClick={() => setExpandedGroups(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
                                                                return next;
                                                            })}
                                                        >
                                                            <button
                                                                onClick={e => { e.stopPropagation(); toggleAll(groupItems.map(i => i.id)); }}
                                                                className="shrink-0"
                                                            >
                                                                {groupItems.every(i => selected.has(i.id))
                                                                    ? <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                                                                    : <Square className="w-3.5 h-3.5 text-gray-400" />}
                                                            </button>
                                                            <Users className="w-3.5 h-3.5 text-indigo-500" />
                                                            <span className="text-xs font-semibold text-indigo-800 flex-1">
                                                                {representative.inputDescription}
                                                                <span className="ml-1 font-normal text-indigo-500">({groupItems.length} itens consolidados)</span>
                                                            </span>
                                                            <span className="text-xs font-semibold text-indigo-700">{fmtBrl(groupTotal)}</span>
                                                            {groupExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />}
                                                        </div>
                                                        {groupExpanded && groupItems.map(item => (
                                                            <ItemRow
                                                                key={item.id}
                                                                item={item}
                                                                isSelected={selected.has(item.id)}
                                                                onToggle={() => toggleItem(item.id)}
                                                                onStatusChange={handleStatusChange}
                                                                today={today}
                                                                indent
                                                            />
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── Tab Backlog ── */}
            {tab === 'backlog' && (
                <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                        Insumos identificados nas composições sem <strong>período de cronograma</strong> definido.
                        Defina a distribuição no planejamento e regenere o plano.
                    </p>
                    {backlogItems.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Backlog vazio — todos os insumos estão programados.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Insumo</th>
                                        <th className="px-3 py-2 text-right">Qtd</th>
                                        <th className="px-3 py-2 text-left">Un</th>
                                        <th className="px-3 py-2 text-left">Item de Orçamento</th>
                                        <th className="px-3 py-2 text-right">Custo Est.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backlogItems.map(item => (
                                        <tr key={item.id} className="border-t hover:bg-gray-50">
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-gray-800">{item.inputDescription}</p>
                                                {item.inputCode && <p className="text-xs text-gray-400">{item.inputCode}</p>}
                                            </td>
                                            <td className="px-3 py-2 text-right">{fmtQty(item.requiredQty)}</td>
                                            <td className="px-3 py-2 text-gray-500">{item.inputUnit}</td>
                                            <td className="px-3 py-2 text-gray-600 text-xs">{item.sourceBudgetItemDesc}</td>
                                            <td className="px-3 py-2 text-right">{fmtBrl(item.estimatedTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab Financeiro / Curva S ── */}
            {tab === 'financeiro' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                        <strong>Planejado</strong> = desembolso estimado total por mês.{' '}
                        <strong>Realizado</strong> = itens já cotados/pedidos naquele mês.
                    </p>
                    {monthly.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Sem dados. Gere o plano primeiro.</p>
                        </div>
                    ) : (
                        <>
                            <CurvaSChart monthly={monthly} realizadaByMonth={realizadaByMonth} />
                            <div className="bg-white rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Mês</th>
                                            <th className="px-3 py-2 text-right">Planejado</th>
                                            <th className="px-3 py-2 text-right">Realizado</th>
                                            <th className="px-3 py-2 text-right">Pendente</th>
                                            <th className="px-3 py-2 text-right">Cotado</th>
                                            <th className="px-3 py-2 text-right">Pedido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthly.map(row => {
                                            const realizado = realizadaByMonth[row.monthDate?.slice(0, 7) ?? ''] ?? 0;
                                            return (
                                                <tr key={row.monthDate} className="border-t hover:bg-gray-50">
                                                    <td className="px-3 py-2 font-medium capitalize">{row.monthLabel}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-indigo-600">{fmtBrl(row.estimatedSpend)}</td>
                                                    <td className={`px-3 py-2 text-right font-semibold ${realizado > 0 ? 'text-green-600' : 'text-gray-400'}`}>{fmtBrl(realizado)}</td>
                                                    <td className="px-3 py-2 text-right text-yellow-700">{row.pendingCount}</td>
                                                    <td className="px-3 py-2 text-right text-blue-700">{row.quotedCount}</td>
                                                    <td className="px-3 py-2 text-right text-purple-700">{row.orderedCount}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 font-semibold">
                                        <tr>
                                            <td className="px-3 py-2">Total</td>
                                            <td className="px-3 py-2 text-right text-indigo-700">{fmtBrl(monthly.reduce((s, r) => s + r.estimatedSpend, 0))}</td>
                                            <td className="px-3 py-2 text-right text-green-700">{fmtBrl(Object.values(realizadaByMonth).reduce((s, v) => s + v, 0))}</td>
                                            <td className="px-3 py-2 text-right text-yellow-700">{monthly.reduce((s, r) => s + r.pendingCount, 0)}</td>
                                            <td className="px-3 py-2 text-right text-blue-700">{monthly.reduce((s, r) => s + r.quotedCount, 0)}</td>
                                            <td className="px-3 py-2 text-right text-purple-700">{monthly.reduce((s, r) => s + r.orderedCount, 0)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ── ItemRow subcomponent ───────────────────────────────────────────────────────
function ItemRow({
    item, isSelected, onToggle, onStatusChange, today, indent = false,
}: {
    item: ProcurementPlanItem;
    isSelected: boolean;
    onToggle: () => void;
    onStatusChange: (id: string, status: ProcurementStatus) => void;
    today: string;
    indent?: boolean;
}) {
    const isOverdue = item.suggestedBuyDate && item.suggestedBuyDate < today && item.status === 'pending';

    return (
        <div className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-gray-50 text-sm
            ${indent ? 'pl-8 bg-white' : ''}
            ${isOverdue ? 'bg-red-50' : ''}
            ${item.isStale ? 'opacity-50' : ''}
        `}>
            <button onClick={onToggle} className="shrink-0">
                {isSelected
                    ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                    : <Square className="w-4 h-4 text-gray-300" />}
            </button>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{item.inputDescription}</p>
                {item.inputCode && <p className="text-xs text-gray-400">{item.inputCode}</p>}
                {item.sourceBudgetItemDesc && (
                    <p className="text-xs text-gray-400 truncate">← {item.sourceBudgetItemDesc}</p>
                )}
            </div>
            <div className="text-right shrink-0 w-24">
                <p className="font-medium">{fmtQty(item.netRequiredQty)}</p>
                <p className="text-xs text-gray-400">{item.inputUnit}</p>
            </div>
            <div className="text-right shrink-0 w-28 hidden md:block">
                <p className="font-semibold text-indigo-700">{fmtBrl(item.estimatedTotal)}</p>
                <p className="text-xs text-gray-400">{fmtBrl(item.estimatedUnitCost)}/un</p>
            </div>
            <div className="shrink-0 w-24 text-right hidden md:block">
                {isOverdue ? (
                    <span className="text-xs text-red-600 font-medium">{fmtDate(item.suggestedBuyDate)} ⚠</span>
                ) : (
                    <span className="text-xs text-gray-600">{fmtDate(item.suggestedBuyDate)}</span>
                )}
                {item.leadTimeDays > 0 && (
                    <p className="text-xs text-gray-400">LT {item.leadTimeDays}d</p>
                )}
            </div>
            <div className="shrink-0">
                <select
                    className={`text-xs px-1.5 py-0.5 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[item.status]}`}
                    value={item.status}
                    onChange={e => onStatusChange(item.id, e.target.value as ProcurementStatus)}
                >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

// ── Curva S SVG ────────────────────────────────────────────────────────────────
function CurvaSChart({
    monthly, realizadaByMonth,
}: {
    monthly: ProcurementMonthlySpend[];
    realizadaByMonth: Record<string, number>;
}) {
    if (monthly.length === 0) return null;

    const maxVal = Math.max(...monthly.map(d => d.estimatedSpend), 1);
    const BAR_H  = 120;

    return (
        <div className="bg-white rounded-lg border p-4 overflow-x-auto">
            <div className="flex items-end gap-2 mb-2" style={{ minWidth: monthly.length * 70 }}>
                {monthly.map(row => {
                    const monthKey  = row.monthDate?.slice(0, 7) ?? '';
                    const realizado = realizadaByMonth[monthKey] ?? 0;
                    const hPlan     = Math.max(4, Math.round((row.estimatedSpend / maxVal) * BAR_H));
                    const hReal     = Math.max(0, Math.round((realizado / maxVal) * BAR_H));

                    return (
                        <div key={row.monthDate} className="flex flex-col items-center gap-1 flex-1 min-w-[60px]">
                            <div className="relative w-full" style={{ height: BAR_H }}>
                                {/* barra planejado */}
                                <div
                                    className="absolute bottom-0 left-0 right-0 rounded-t bg-indigo-200"
                                    style={{ height: hPlan }}
                                    title={`Planejado: ${fmtBrl(row.estimatedSpend)}`}
                                />
                                {/* barra realizado sobreposta */}
                                {hReal > 0 && (
                                    <div
                                        className="absolute bottom-0 left-0 right-0 rounded-t bg-green-500"
                                        style={{ height: hReal }}
                                        title={`Realizado: ${fmtBrl(realizado)}`}
                                    />
                                )}
                            </div>
                            <span className="text-gray-400 text-center" style={{ fontSize: 10 }}>{row.monthLabel}</span>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-4 text-xs text-gray-500 justify-end mt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-indigo-200 rounded-sm" /> Planejado</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-green-500 rounded-sm" /> Realizado</span>
            </div>
        </div>
    );
}
