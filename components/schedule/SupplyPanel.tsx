import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    RefreshCw,
    AlertTriangle,
    Clock,
    Package,
    TrendingUp,
    Loader2,
    Calendar,
    ExternalLink,
} from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { TabsBar } from '../ui/TabsBar';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { usePersistedState } from '../ui/TableUtils';
import { formatMoney } from '../ui/Format';
import { ProcurementPlanItem } from '../../types/procurement';
import { procurementService } from '../../services/procurementService';

/**
 * Engenharia › Planejamento › vista Suprimentos — Plano de Suprimentos.
 *
 * 11/10/2026 (pedido: *"Transformar em tabela e aplicar o padrão
 * ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas"*):
 * - os "baldes" por prazo (Atrasados, Próximos 7 dias…) eram acordeões com emoji;
 *   viraram as abas da `TabsBar` (§19.1), com a contagem de cada uma e, à direita,
 *   as ações (Módulo Aquisições + a primária §17);
 * - o grid de 12 colunas dentro de cada acordeão (`text-[9px] uppercase`,
 *   `font-mono`, status em pílula) virou `StandardTable` (§6.10), com o
 *   auto-ajuste de largura (§6.1.2) embutido;
 * - ordem da anatomia: abas → KPIs → tabela. O título da vista saiu — o seletor de
 *   vista do ribbon já diz "Suprimentos" (§18), e a contagem de insumos está na aba
 *   "Todos".
 * Regras de carga, geração e KPIs não mudaram.
 */

// ─── Helpers ──────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function addDays(iso: string, n: number): string {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
}

type Bucket = 'overdue' | 'week' | 'month' | 'future' | 'no_date';
type Aba = 'all' | Bucket;

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

// Sem emoji: o prazo é a ABA; a cor que o emoji fazia mora na data em vermelho.
const ABAS: { id: Aba; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'overdue', label: 'Atrasados' },
    { id: 'week', label: 'Próximos 7 dias' },
    { id: 'month', label: 'Próximos 30 dias' },
    { id: 'future', label: 'Futuro' },
    { id: 'no_date', label: 'Sem data' },
];

const STATUS_LABEL: Record<string, string> = {
    pending:   'Pendente',
    quoted:    'Cotado',
    ordered:   'Pedido',
    received:  'Recebido',
    cancelled: 'Cancelado',
};

// §8: status é texto colorido, sem pílula.
const STATUS_COLOR: Record<string, string> = {
    pending:   'text-gray-600',
    quoted:    'text-blue-700',
    ordered:   'text-indigo-700',
    received:  'text-emerald-700',
    cancelled: 'text-red-600',
};
const ORDEM_STATUS: Record<string, number> = { pending: 0, quoted: 1, ordered: 2, received: 3, cancelled: 4 };

// Soma 1170 px — cabe na largura da vista sem rolagem lateral.
const COLUNAS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'insumo', label: 'Insumo', sortable: true, width: 280 },
    { key: 'atividade', label: 'Atividade', sortable: true, width: 210 },
    { key: 'qtd', label: 'Qtd', sortable: true, width: 100, align: 'right' },
    { key: 'un', label: 'Un', sortable: true, width: 70 },
    { key: 'lead', label: 'Lead', sortable: true, width: 80, align: 'right' },
    { key: 'comprarAte', label: 'Comprar até', sortable: true, width: 150 },
    { key: 'estimado', label: 'Estimado', sortable: true, width: 130, align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
];

/** Quantidade que ainda precisa ser comprada: a líquida, quando já houve abatimento. */
const qtdDoItem = (i: ProcurementPlanItem) => (i.netRequiredQty > 0 ? i.netRequiredQty : i.requiredQty);

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
    const [aba, setAba] = usePersistedState<Aba>('planejamento:suprimentos:aba', 'all');

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

    // ── Abas (os antigos baldes por prazo) ──
    const porBalde = useMemo(() => {
        const acc: Record<Bucket, ProcurementPlanItem[]> = { overdue: [], week: [], month: [], future: [], no_date: [] };
        items.forEach(item => acc[bucket(item)].push(item));
        return acc;
    }, [items]);
    // Linhas estáveis por aba (o StandardTable detecta recorte pela identidade do array).
    const linhas = useMemo(() => (aba === 'all' ? items : porBalde[aba]), [aba, items, porBalde]);
    const abas = ABAS.map(a => ({ ...a, badge: a.id === 'all' ? items.length : porBalde[a.id].length }));

    const vencido = (i: ProcurementPlanItem) => !!i.suggestedBuyDate && i.suggestedBuyDate < todayStr && i.status === 'pending';

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Carregando plano de suprimentos…</span>
            </div>
        );
    }

    return (
        <div>
            {/* 1. Toolbar de abas §19.1 — prazos à esquerda, ações à direita (primária §17). */}
            <TabsBar<Aba> tabs={abas} value={aba} onChange={setAba}>
                <div className="flex items-center gap-2">
                    {onNavigateToProcurement && (
                        <button
                            type="button"
                            onClick={onNavigateToProcurement}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <ExternalLink className="w-[15px] h-[15px]" />
                            Módulo Aquisições
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={generating}
                        title={generating ? 'Gerando o plano a partir do cronograma…' : 'Calcula as datas ideais de compra a partir do cronograma'}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {generating
                            ? <Loader2 className="w-[15px] h-[15px] animate-spin" />
                            : <RefreshCw className="w-[15px] h-[15px]" />}
                        {generating ? 'Gerando…' : items.length === 0 ? 'Gerar plano de compras' : 'Atualizar plano'}
                    </button>
                </div>
            </TabsBar>

            {/* Erro: fora do card da tabela (§5.2). */}
            {error && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    {error}
                </div>
            )}

            {/* Nada gerado ainda: estado vazio §12 (a ação está na barra acima). */}
            {items.length === 0 && !error && (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum plano de suprimentos gerado</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        Use <strong>Gerar plano de compras</strong> para calcular as datas ideais de compra a partir do cronograma.
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                        Pré-requisitos: atividades com <strong>composições SINAPI</strong> e <strong>datas no cronograma</strong>.
                    </p>
                </div>
            )}

            {items.length > 0 && (
                <>
                    {/* 2. KPIs §4 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                        <KpiCard label="Total estimado" value={fmtBRL(totalEstimated)} sub={`${active.length} itens ativos`} color="blue" icon={<TrendingUp className="w-4 h-4" />} />
                        <KpiCard label="Próximos 30 dias" value={fmtBRL(next30Total)} sub={`${next30.length} itens`} color={next30.length > 0 ? 'amber' : 'gray'} icon={<Calendar className="w-4 h-4" />} />
                        <KpiCard label="Atrasados" value={String(overdue.length)} sub="data de compra vencida" color={overdue.length === 0 ? 'emerald' : 'red'} icon={<AlertTriangle className="w-4 h-4" />} />
                        <KpiCard label="Pendentes" value={String(active.filter(i => i.status === 'pending').length)} sub={`de ${active.length} ativos`} color="gray" icon={<Clock className="w-4 h-4" />} />
                    </div>

                    {/* 3. Tabela §6.10 — toolbar acoplada com busca, colunas e auto-ajuste. */}
                    <StandardTable<ProcurementPlanItem>
                        storageKey="planejamento:suprimentos:tabela"
                        columns={COLUNAS}
                        rows={linhas}
                        rowKey={i => i.id}
                        searchText={i => `${i.inputCode ?? ''} ${i.inputDescription} ${i.sourceBudgetItemDesc ?? ''} ${STATUS_LABEL[i.status] ?? i.status}`}
                        searchPlaceholder="Buscar por código, insumo ou atividade..."
                        rowClassName={i => (vencido(i) ? 'bg-red-50/30' : '')}
                        sortValue={(k, i) => {
                            switch (k) {
                                case 'codigo': return i.inputCode ?? '';
                                case 'atividade': return i.sourceBudgetItemDesc ?? '';
                                case 'qtd': return qtdDoItem(i);
                                case 'un': return i.inputUnit;
                                case 'lead': return i.leadTimeDays;
                                case 'comprarAte': return i.suggestedBuyDate ?? '9999-12-31';
                                case 'estimado': return i.estimatedTotal;
                                case 'status': return ORDEM_STATUS[i.status] ?? 9;
                                default: return i.inputDescription;
                            }
                        }}
                        renderCell={(k, i) => {
                            switch (k) {
                                case 'codigo': return i.inputCode ? <span className="text-sm font-normal text-gray-600">{i.inputCode}</span> : <span className="text-sm text-gray-400">—</span>;
                                case 'insumo': return <span className="block truncate text-sm font-normal text-gray-700" title={i.inputDescription}>{i.inputDescription}</span>;
                                case 'atividade': return i.sourceBudgetItemDesc
                                    ? <span className="block truncate text-sm font-normal text-gray-600" title={i.sourceBudgetItemDesc}>{i.sourceBudgetItemDesc}</span>
                                    : <span className="text-sm text-gray-400">—</span>;
                                case 'qtd': return <span className="text-sm font-normal text-gray-700 tabular-nums">{fmtQtd(qtdDoItem(i))}</span>;
                                case 'un': return <span className="text-sm font-normal text-gray-600">{i.inputUnit}</span>;
                                case 'lead': return i.leadTimeDays > 0
                                    ? <span className="text-sm font-normal text-gray-600" title={`Prazo de entrega: ${i.leadTimeDays} dias`}>{i.leadTimeDays}d</span>
                                    : <span className="text-sm text-gray-400">—</span>;
                                case 'comprarAte': return (
                                    <span className={`text-sm font-normal ${vencido(i) ? 'text-red-600' : 'text-gray-700'}`} title={vencido(i) ? 'Data de compra vencida' : undefined}>
                                        {fmtDate(i.suggestedBuyDate)}
                                    </span>
                                );
                                case 'estimado': return i.estimatedTotal > 0
                                    ? <span className="text-sm font-medium text-gray-800">{formatMoney(i.estimatedTotal)}</span>
                                    : <span className="text-sm text-gray-400">—</span>;
                                case 'status': return <span className={`text-sm font-normal ${STATUS_COLOR[i.status] ?? 'text-gray-600'}`}>{STATUS_LABEL[i.status] ?? i.status}</span>;
                                default: return null;
                            }
                        }}
                        empty={{
                            icon: <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: `Nenhum insumo em "${ABAS.find(a => a.id === aba)?.label}"`,
                            subtitle: 'Escolha outra aba de prazo.',
                        }}
                    />
                </>
            )}
        </div>
    );
};
