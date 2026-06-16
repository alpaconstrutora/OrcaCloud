import React, { useState, useEffect, useCallback } from 'react';
import {
    ShoppingCart, RefreshCw, Calendar, AlertTriangle, TrendingUp,
    PackageSearch, ChevronDown, ChevronUp, CheckCircle2, Clock,
    BarChart2, ListFilter, Zap, Download
} from 'lucide-react';
import { procurementService } from '../services/procurementService';
import { projectService, ProjectData } from '../services/projectService';
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

const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtQty = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

export const ProcurementModule: React.FC<Props> = ({ activeOrganizationId }) => {
    const [tab, setTab] = useState<Tab>('plano');
    const [projects, setProjects] = useState<Pick<ProjectData, 'id' | 'name'>[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [items, setItems] = useState<ProcurementPlanItem[]>([]);
    const [monthly, setMonthly] = useState<ProcurementMonthlySpend[]>([]);
    const [kpis, setKpis] = useState<ProcurementKPIs | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [statusFilter, setStatusFilter] = useState<ProcurementStatus | ''>('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    // load projects (PLANEJAMENTO + OBRA)
    useEffect(() => {
        if (!activeOrganizationId) return;
        projectService.listProjects(undefined, activeOrganizationId).then(list => {
            const filtered = (list ?? []).filter(p =>
                (p.settings as any)?.classification === 'PLANEJAMENTO' ||
                (p.settings as any)?.classification === 'OBRA'
            );
            setProjects(filtered.map(p => ({ id: p.id!, name: p.name })));
            if (filtered.length > 0 && !selectedProjectId) {
                setSelectedProjectId(filtered[0].id!);
            }
        });
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
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, selectedProjectId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleGenerate = async () => {
        if (!activeOrganizationId || !selectedProjectId) return;
        setGenerating(true);
        setError(null);
        try {
            const { inserted } = await procurementService.generatePlan(selectedProjectId, activeOrganizationId);
            await loadData();
            if (inserted === 0) {
                setError('Nenhuma necessidade encontrada. Verifique se o projeto possui composições de insumos e distribuição de cronograma.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleRefreshNet = async () => {
        if (!activeOrganizationId || !selectedProjectId) return;
        setLoading(true);
        try {
            await procurementService.refreshNetPositions(activeOrganizationId, selectedProjectId);
            await loadData();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (itemId: string, newStatus: ProcurementStatus) => {
        try {
            await procurementService.updateItem(itemId, { status: newStatus });
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
        } catch (e: any) {
            setError(e.message);
        }
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
            return next;
        });
    };

    // ── filtered items ────────────────────────────────────────────────────────
    const filteredItems = items.filter(i => {
        if (statusFilter && i.status !== statusFilter) return false;
        return true;
    });

    const planItems   = filteredItems.filter(i => i.suggestedBuyDate);
    const backlogItems = items.filter(i => !i.suggestedBuyDate && i.status !== 'cancelled');

    // group plano by month
    const byMonth: Record<string, ProcurementPlanItem[]> = {};
    for (const item of planItems) {
        const month = item.suggestedBuyDate!.slice(0, 7);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(item);
    }
    const sortedMonths = Object.keys(byMonth).sort();

    const today = new Date().toISOString().slice(0, 10);
    const in7   = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10);
    const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    function urgencyColor(buyDate?: string): string {
        if (!buyDate) return '';
        if (buyDate <= today) return 'border-l-4 border-red-500';
        if (buyDate <= in7)   return 'border-l-4 border-orange-400';
        if (buyDate <= in30)  return 'border-l-4 border-yellow-400';
        return '';
    }

    return (
        <div className="p-4 md:p-6 space-y-6">
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
                        onChange={e => setSelectedProjectId(e.target.value)}
                    >
                        <option value="">Selecione o projeto…</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id!}>{p.name}</option>
                        ))}
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
                        title="Atualiza a posição líquida do estoque sem regenerar o plano"
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
                        <p className="text-xs text-gray-500 mb-1">Plano desatualizado</p>
                        <p className={`text-lg font-bold ${kpis.staleItems > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {kpis.staleItems}
                        </p>
                        <p className="text-xs text-gray-400">itens obsoletos</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b">
                <div className="flex gap-1">
                    {([
                        { id: 'plano',      label: 'Calendário de Compras', icon: Calendar  },
                        { id: 'backlog',    label: `Backlog (${backlogItems.length})`, icon: PackageSearch },
                        { id: 'financeiro', label: 'Curva de Desembolso',   icon: BarChart2  },
                    ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === t.id
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    {/* Filter bar */}
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
                                {kpis.staleItems} item(s) obsoleto(s) — regenere o plano
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
                            const isOpen = expandedGroups.has(month);
                            const [y, m] = month.split('-');
                            const monthLabel = new Date(`${y}-${m}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

                            return (
                                <div key={month} className="bg-white rounded-lg border overflow-hidden">
                                    <button
                                        onClick={() => toggleGroup(month)}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Calendar className="w-4 h-4 text-indigo-500" />
                                            <span className="font-medium text-gray-800 capitalize">{monthLabel}</span>
                                            <span className="text-xs text-gray-500">{monthItems.length} itens</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-indigo-600">{fmtBrl(monthTotal)}</span>
                                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Insumo</th>
                                                        <th className="px-3 py-2 text-right">Qtd Líq.</th>
                                                        <th className="px-3 py-2 text-left">Un</th>
                                                        <th className="px-3 py-2 text-right">Custo Unit.</th>
                                                        <th className="px-3 py-2 text-right">Total</th>
                                                        <th className="px-3 py-2 text-left">Comprar até</th>
                                                        <th className="px-3 py-2 text-left">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {monthItems.map(item => (
                                                        <tr
                                                            key={item.id}
                                                            className={`border-t hover:bg-gray-50 ${urgencyColor(item.suggestedBuyDate)} ${item.isStale ? 'opacity-50' : ''}`}
                                                        >
                                                            <td className="px-3 py-2 max-w-xs">
                                                                <p className="font-medium text-gray-800 truncate">{item.inputDescription}</p>
                                                                {item.inputCode && <p className="text-xs text-gray-400">{item.inputCode}</p>}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-medium">{fmtQty(item.netRequiredQty)}</td>
                                                            <td className="px-3 py-2 text-gray-500">{item.inputUnit}</td>
                                                            <td className="px-3 py-2 text-right text-gray-600">{fmtBrl(item.estimatedUnitCost)}</td>
                                                            <td className="px-3 py-2 text-right font-semibold">{fmtBrl(item.estimatedTotal)}</td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                {item.suggestedBuyDate && item.suggestedBuyDate <= today ? (
                                                                    <span className="text-red-600 font-medium">
                                                                        {fmtDate(item.suggestedBuyDate)} ⚠
                                                                    </span>
                                                                ) : fmtDate(item.suggestedBuyDate)}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <select
                                                                    className={`text-xs px-1.5 py-0.5 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[item.status]}`}
                                                                    value={item.status}
                                                                    onChange={e => handleStatusChange(item.id, e.target.value as ProcurementStatus)}
                                                                >
                                                                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                                                        <option key={v} value={v}>{l}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
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
                        Insumos identificados nas composições do orçamento que <strong>não possuem período de cronograma</strong> definido.
                        Defina a distribuição no planejamento e regenere o plano para programá-los.
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
                                        <th className="px-3 py-2 text-right">Qtd Necessária</th>
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

            {/* ── Tab Financeiro ── */}
            {tab === 'financeiro' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                        Curva de desembolso estimado com base nas datas de compra sugeridas.
                    </p>
                    {monthly.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Sem dados financeiros. Gere o plano primeiro.</p>
                        </div>
                    ) : (
                        <>
                            {/* Bar chart */}
                            <MonthlyBarChart data={monthly} />

                            {/* Table */}
                            <div className="bg-white rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Mês</th>
                                            <th className="px-3 py-2 text-right">Desembolso Est.</th>
                                            <th className="px-3 py-2 text-right">Pendente</th>
                                            <th className="px-3 py-2 text-right">Cotado</th>
                                            <th className="px-3 py-2 text-right">Pedido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthly.map(row => (
                                            <tr key={row.monthDate} className="border-t hover:bg-gray-50">
                                                <td className="px-3 py-2 font-medium capitalize">{row.monthLabel}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-indigo-600">{fmtBrl(row.estimatedSpend)}</td>
                                                <td className="px-3 py-2 text-right text-yellow-700">{row.pendingCount}</td>
                                                <td className="px-3 py-2 text-right text-blue-700">{row.quotedCount}</td>
                                                <td className="px-3 py-2 text-right text-purple-700">{row.orderedCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 font-semibold">
                                        <tr>
                                            <td className="px-3 py-2">Total</td>
                                            <td className="px-3 py-2 text-right text-indigo-700">
                                                {fmtBrl(monthly.reduce((s, r) => s + r.estimatedSpend, 0))}
                                            </td>
                                            <td className="px-3 py-2 text-right text-yellow-700">
                                                {monthly.reduce((s, r) => s + r.pendingCount, 0)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-blue-700">
                                                {monthly.reduce((s, r) => s + r.quotedCount, 0)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-purple-700">
                                                {monthly.reduce((s, r) => s + r.orderedCount, 0)}
                                            </td>
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

// ── Simple SVG bar chart ───────────────────────────────────────────────────────
function MonthlyBarChart({ data }: { data: ProcurementMonthlySpend[] }) {
    if (data.length === 0) return null;
    const maxSpend = Math.max(...data.map(d => d.estimatedSpend), 1);
    const BAR_H = 120;

    return (
        <div className="bg-white rounded-lg border p-4 overflow-x-auto">
            <div className="flex items-end gap-2" style={{ minWidth: data.length * 60 }}>
                {data.map(row => {
                    const h = Math.round((row.estimatedSpend / maxSpend) * BAR_H);
                    return (
                        <div key={row.monthDate} className="flex flex-col items-center gap-1 flex-1 min-w-[50px]">
                            <span className="text-xs text-gray-500 font-medium" style={{ fontSize: 10 }}>
                                {fmtBrl(row.estimatedSpend).replace('R$ ', '')}
                            </span>
                            <div
                                className="w-full rounded-t bg-indigo-400 hover:bg-indigo-600 transition-colors"
                                style={{ height: h, minHeight: 4 }}
                                title={`${row.monthLabel}: ${fmtBrl(row.estimatedSpend)}`}
                            />
                            <span className="text-xs text-gray-400" style={{ fontSize: 10 }}>{row.monthLabel}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
