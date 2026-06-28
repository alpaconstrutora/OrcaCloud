import React, { useState, useEffect, useCallback } from 'react';
import {
    ShoppingCart,
    RefreshCw,
    AlertTriangle,
    Clock,
    CheckCircle2,
    Package,
    TrendingUp,
    ChevronRight,
    Loader2,
    Calendar,
    ExternalLink,
} from 'lucide-react';
import { ProcurementPlanItem } from '../../types/procurement';
import { procurementService, computeRiskItems } from '../../services/procurementService';

// ─── Helpers ──────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function addDays(iso: string, n: number): string {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
}

type Bucket = 'overdue' | 'week' | 'month' | 'future' | 'no_date';

function bucket(item: ProcurementPlanItem): Bucket {
    if (!item.suggestedBuyDate) return 'no_date';
    const t = today();
    const w = addDays(t, 7);
    const m = addDays(t, 30);
    if (item.suggestedBuyDate < t) return 'overdue';
    if (item.suggestedBuyDate <= w) return 'week';
    if (item.suggestedBuyDate <= m) return 'month';
    return 'future';
}

const BUCKET_LABEL: Record<Bucket, string> = {
    overdue: '🔴 Atrasados',
    week:    '🟠 Próximos 7 dias',
    month:   '🟡 Próximos 30 dias',
    future:  '🟢 Futuro',
    no_date: '⚪ Sem data',
};

const STATUS_LABEL: Record<string, string> = {
    pending:   'Pendente',
    quoted:    'Cotado',
    ordered:   'Pedido',
    received:  'Recebido',
    cancelled: 'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
    pending:   'bg-gray-100 text-gray-600',
    quoted:    'bg-blue-100 text-blue-700',
    ordered:   'bg-indigo-100 text-indigo-700',
    received:  'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-500',
};

// ─── Props ────────────────────────────────────────────────────

interface Props {
    organizationId: string;
    projectId: string;
    onNavigateToProcurement?: () => void;
}

// ─── Component ────────────────────────────────────────────────

export const SupplyPanel: React.FC<Props> = ({ organizationId, projectId, onNavigateToProcurement }) => {
    const [items, setItems] = useState<ProcurementPlanItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<Bucket, boolean>>({
        overdue: true, week: true, month: false, future: false, no_date: false,
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await procurementService.listPlanItems(organizationId, projectId);
            setItems(data.filter(i => i.status !== 'cancelled'));
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao carregar plano de suprimentos');
        } finally {
            setLoading(false);
        }
    }, [organizationId, projectId]);

    useEffect(() => { load(); }, [load]);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const result = await procurementService.generatePlan(projectId, organizationId);
            await load();
            if (result.inserted === 0) {
                setError(
                    'Nenhuma necessidade gerada. Verifique se as atividades têm composições com materiais e distribuição nos períodos do cronograma.'
                );
            }
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao gerar plano');
        } finally {
            setGenerating(false);
        }
    };

    // ── KPIs ──
    const todayStr = today();
    const active = items.filter(i => i.status !== 'received' && i.status !== 'cancelled');
    const overdue = active.filter(i => i.suggestedBuyDate && i.suggestedBuyDate < todayStr && i.status === 'pending');
    const next30 = active.filter(i => i.suggestedBuyDate && i.suggestedBuyDate >= todayStr && i.suggestedBuyDate <= addDays(todayStr, 30));
    const totalEstimated = active.reduce((s, i) => s + i.estimatedTotal, 0);
    const next30Total = next30.reduce((s, i) => s + i.estimatedTotal, 0);

    // ── Grupo por bucket ──
    const grouped = items.reduce<Record<Bucket, ProcurementPlanItem[]>>(
        (acc, item) => { const b = bucket(item); acc[b].push(item); return acc; },
        { overdue: [], week: [], month: [], future: [], no_date: [] }
    );

    const toggleBucket = (b: Bucket) => setExpanded(e => ({ ...e, [b]: !e[b] }));

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Carregando plano de suprimentos…</span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-gray-800">Plano de Suprimentos</h2>
                    {items.length > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            {items.length} insumos
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {onNavigateToProcurement && (
                        <button
                            onClick={onNavigateToProcurement}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-button font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Módulo Aquisições
                        </button>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-button font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {generating
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />}
                        {generating ? 'Gerando…' : items.length === 0 ? 'Gerar Plano de Compras' : 'Atualizar Plano'}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    {error}
                </div>
            )}

            {/* Empty state */}
            {items.length === 0 && !error && (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-14 text-center space-y-3">
                    <Package className="w-10 h-10 text-gray-300 mx-auto" />
                    <div>
                        <p className="text-sm font-bold text-gray-500">Nenhum plano de suprimentos gerado</p>
                        <p className="text-[11px] text-gray-400 mt-1 max-w-xs mx-auto">
                            Clique em <strong>Gerar Plano de Compras</strong> para calcular as datas ideais de compra a partir do cronograma.
                        </p>
                    </div>
                    <div className="text-[10px] text-gray-400 space-y-0.5">
                        <p>Pré-requisitos: atividades com <strong>composições SINAPI</strong> + <strong>datas no cronograma</strong></p>
                    </div>
                </div>
            )}

            {/* KPI cards */}
            {items.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <KpiCard
                        label="Total estimado"
                        value={fmtBRL(totalEstimated)}
                        sub={`${active.length} itens ativos`}
                        color="blue"
                        icon={<TrendingUp className="w-4 h-4" />}
                    />
                    <KpiCard
                        label="Próximos 30 dias"
                        value={fmtBRL(next30Total)}
                        sub={`${next30.length} itens`}
                        color={next30.length > 0 ? 'amber' : 'gray'}
                        icon={<Calendar className="w-4 h-4" />}
                    />
                    <KpiCard
                        label="Atrasados"
                        value={String(overdue.length)}
                        sub="data de compra vencida"
                        color={overdue.length === 0 ? 'emerald' : 'red'}
                        icon={<AlertTriangle className="w-4 h-4" />}
                    />
                    <KpiCard
                        label="Pendentes"
                        value={String(active.filter(i => i.status === 'pending').length)}
                        sub={`de ${active.length} ativos`}
                        color="gray"
                        icon={<Clock className="w-4 h-4" />}
                    />
                </div>
            )}

            {/* Buckets */}
            {items.length > 0 && (
                <div className="space-y-3">
                    {(Object.keys(grouped) as Bucket[]).map(b => {
                        const list = grouped[b];
                        if (list.length === 0) return null;
                        const isOpen = expanded[b];
                        const bucketTotal = list.reduce((s, i) => s + i.estimatedTotal, 0);
                        return (
                            <div key={b} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                <button
                                    onClick={() => toggleBucket(b)}
                                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-gray-700">{BUCKET_LABEL[b]}</span>
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">
                                            {list.length} {list.length === 1 ? 'item' : 'itens'}
                                        </span>
                                        <span className="text-[10px] text-gray-400">{fmtBRL(bucketTotal)}</span>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                </button>

                                {isOpen && (
                                    <div className="border-t border-gray-50">
                                        {/* Table header */}
                                        <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                                            <div className="col-span-4">Insumo</div>
                                            <div className="col-span-2">Atividade</div>
                                            <div className="col-span-1 text-right">Qtd</div>
                                            <div className="col-span-1 text-center">Un</div>
                                            <div className="col-span-1 text-center">Lead</div>
                                            <div className="col-span-1 text-center">Comprar até</div>
                                            <div className="col-span-1 text-right">Estimado</div>
                                            <div className="col-span-1 text-center">Status</div>
                                        </div>

                                        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                                            {list.map(item => (
                                                <ItemRow key={item.id} item={item} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── ItemRow ─────────────────────────────────────────────────

const ItemRow: React.FC<{ item: ProcurementPlanItem }> = ({ item }) => {
    const todayStr = today();
    const isOverdue = item.suggestedBuyDate && item.suggestedBuyDate < todayStr && item.status === 'pending';

    return (
        <div className={`grid grid-cols-12 gap-2 px-5 py-2.5 hover:bg-gray-50/50 items-center text-xs ${isOverdue ? 'bg-red-50/30' : ''}`}>
            <div className="col-span-4">
                <div className="font-medium text-gray-800 truncate" title={item.inputDescription}>
                    {item.inputCode && <span className="text-[9px] text-gray-400 mr-1">{item.inputCode}</span>}
                    {item.inputDescription}
                </div>
            </div>
            <div className="col-span-2 text-[10px] text-gray-400 truncate" title={item.sourceBudgetItemDesc}>
                {item.sourceBudgetItemDesc || '—'}
            </div>
            <div className="col-span-1 text-right font-mono text-[11px] text-gray-700">
                {item.netRequiredQty > 0
                    ? item.netRequiredQty.toFixed(2)
                    : item.requiredQty.toFixed(2)}
            </div>
            <div className="col-span-1 text-center text-[10px] text-gray-500">{item.inputUnit}</div>
            <div className="col-span-1 text-center text-[10px] text-gray-400">
                {item.leadTimeDays > 0 ? `${item.leadTimeDays}d` : '—'}
            </div>
            <div className={`col-span-1 text-center text-[11px] font-bold ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                {fmtDate(item.suggestedBuyDate)}
            </div>
            <div className="col-span-1 text-right text-[11px] font-bold text-gray-700">
                {item.estimatedTotal > 0 ? fmtBRL(item.estimatedTotal) : '—'}
            </div>
            <div className="col-span-1 text-center">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                </span>
            </div>
        </div>
    );
};

// ─── KpiCard ─────────────────────────────────────────────────

const COLOR_MAP = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-700',    icon: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   icon: 'text-amber-400' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-700',      icon: 'text-red-400' },
    gray:    { bg: 'bg-gray-50',    border: 'border-gray-100',    text: 'text-gray-700',    icon: 'text-gray-400' },
};

const KpiCard: React.FC<{
    label: string; value: string; sub?: string;
    color: keyof typeof COLOR_MAP; icon?: React.ReactNode;
}> = ({ label, value, sub, color, icon }) => {
    const c = COLOR_MAP[color];
    return (
        <div className={`${c.bg} border ${c.border} rounded-xl px-4 py-3`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</span>
                {icon && <span className={c.icon}>{icon}</span>}
            </div>
            <div className={`text-lg font-black ${c.text} truncate`}>{value}</div>
            {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
        </div>
    );
};
