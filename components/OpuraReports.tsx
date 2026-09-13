import React from 'react';
import { RefreshCw, AlertTriangle, Download, BarChart3, ChevronRight, ChevronDown, ArrowLeftRight, TrendingUp, TrendingDown, ArrowDownUp, Activity } from 'lucide-react';
import {
    opuraAnalyticsService,
    type OpuraDimension,
    type OpuraDateField,
    type OpuraFilters,
    type OpuraEntryFilters,
    type OpuraPivotRow,
    type OpuraEntry,
    type OpuraCompareRow,
} from '../services/opuraAnalyticsService';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import Button from './ui/Button';
import { TabsBar } from './ui/TabsBar';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import { FilterPopover } from './ui/FilterPopover';
import { usePersistedState } from './ui/TableUtils';
import { SegmentedProgress } from './ui/SegmentedProgress';
import { costCenterService } from '../services/costCenterService';
import type { CostCenterV2 } from '../types/financial';
import { buildCostCenterTree, flattenCostCenterTree, type CostCenterTreeNode } from '../utils/opuraCostCenterTree';

// ── Formatadores ──────────────────────────────────────────────────────────────

function fBRL(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
// Valores sempre por extenso ("R$ 1.000,00"), nunca abreviados ("R$ 1k") —
// pedido do usuário em 2026-09-13; é relatório, o número exato é o dado.

// ── Dimensões disponíveis (espelha a whitelist de fn_opura_pivot) ──────────────
// São as abas da tela (§19.1): cada uma troca a visão inteira, então o subtítulo
// muda junto (§20).

const DIMENSIONS: { value: OpuraDimension; label: string }[] = [
    { value: 'supplier',        label: 'Fornecedor' },
    { value: 'project',         label: 'Obra' },
    { value: 'client',          label: 'Cliente' },
    { value: 'contract',        label: 'Contrato' },
    { value: 'purchase_order',  label: 'Pedido de Compra' },
    { value: 'cost_center',     label: 'Centro de Custo' },
    { value: 'category',        label: 'Categoria' },
    { value: 'category_parent', label: 'Subcategoria (pai)' },
    { value: 'account',         label: 'Conta Bancária' },
    { value: 'contraparte',     label: 'Contraparte' },
    { value: 'dre_group',       label: 'Grupo DRE' },
    { value: 'user',            label: 'Usuário' },
    { value: 'tx_month',        label: 'Mês (lançamento)' },
    { value: 'due_month',       label: 'Mês (vencimento)' },
    { value: 'pay_month',       label: 'Mês (pagamento)' },
    { value: 'comp_month',      label: 'Mês (competência)' },
];

const DATE_FIELDS: { value: OpuraDateField; label: string }[] = [
    { value: 'transaction', label: 'Lançamento' },
    { value: 'due',         label: 'Vencimento' },
    { value: 'payment',     label: 'Pagamento' },
    { value: 'competencia', label: 'Competência' },
];

type Direction = '' | 'CREDIT' | 'DEBIT';
type Status = '' | 'CONCILIATED' | 'PENDING';

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
    { value: '',       label: 'Tudo' },
    { value: 'CREDIT', label: 'Entradas' },
    { value: 'DEBIT',  label: 'Saídas' },
];
const STATUS_OPTIONS: { value: Status; label: string }[] = [
    { value: '',            label: 'Tudo' },
    { value: 'CONCILIATED', label: 'Realizado' },
    { value: 'PENDING',     label: 'Previsto' },
];

// ── Linhas da tabela ───────────────────────────────────────────────────────────

/**
 * Uma linha do pivot pronta para a tabela. Nas dimensões planas é a linha da
 * RPC; em Centro de Custo é um nó da árvore (grupo → centros), com `depth`,
 * `isGroup` e `collapsed` para o chevron.
 */
interface ReportRow {
    rowId: string;
    key: string | null;
    label: string;
    code: string | null;
    depth: number;
    isGroup: boolean;
    synthetic: boolean;
    collapsed: boolean;
    /** Nome do grupo (só no nó sintético "(lançado no grupo)"), para o título do extrato. */
    groupLabel: string | null;
    /** Texto em que a busca procura — um grupo inclui os nomes dos filhos. */
    searchText: string;
    qtd: number;
    realizado: number; // credit − debit conciliado
    previsto: number;  // credit − debit pendente
    vencido: number;
}

function flatRowsToReport(rows: OpuraPivotRow[]): ReportRow[] {
    return rows.map((r, i) => ({
        rowId: r.dimension_key ?? `row-${i}`,
        key: r.dimension_key,
        label: r.dimension_label,
        code: null,
        depth: 0,
        isGroup: false,
        synthetic: false,
        collapsed: false,
        groupLabel: null,
        searchText: r.dimension_label,
        qtd: r.qtd,
        realizado: r.net_realizado,
        previsto: r.credit_previsto - r.debit_previsto,
        vencido: r.vencido,
    }));
}

function subtreeNames(n: CostCenterTreeNode): string {
    return [n.code, n.name, ...n.children.map(subtreeNames)].filter(Boolean).join(' ');
}

// Colunas de DADO (§2/§6.10). O rótulo da 1ª muda com a aba; em Centro de Custo
// nenhuma coluna ordena (§6.3 — exceção documentada): a ordem é a hierarquia do
// cadastro (grupo → centros por código), e ordenar por valor a desmontaria.
function pivotColumns(dimLabel: string, tree: boolean): StandardTableColumn[] {
    return [
        { key: 'label',     label: dimLabel,    sortable: !tree, width: 360 },
        { key: 'qtd',       label: 'Qtd',       sortable: !tree, width: 90,  align: 'right' },
        { key: 'realizado', label: 'Realizado', sortable: !tree, width: 170, align: 'right' },
        { key: 'previsto',  label: 'Previsto',  sortable: !tree, width: 170, align: 'right' },
        { key: 'vencido',   label: 'Vencido',   sortable: !tree, width: 170, align: 'right' },
        // Barra de proporção do realizado (|realizado| ÷ maior da lista) — última
        // coluna, depois de Vencido (pedido de 2026-09-13; antes vivia dentro do
        // rótulo). Ordena por |realizado|.
        { key: 'progresso', label: 'Progresso', sortable: !tree, width: 170 },
    ];
}

function compareColumns(dimLabel: string): StandardTableColumn[] {
    return [
        { key: 'label',    label: dimLabel,    sortable: true, width: 360 },
        { key: 'valorA',   label: 'Período A', sortable: true, width: 170, align: 'right' },
        { key: 'valorB',   label: 'Período B', sortable: true, width: 170, align: 'right' },
        { key: 'delta',    label: 'Δ',         sortable: true, width: 170, align: 'right' },
        { key: 'variacao', label: 'Var.',      sortable: true, width: 110, align: 'right' },
    ];
}

// ── Componente principal ───────────────────────────────────────────────────────

interface OpuraReportsProps {
    organizationId: string | null;
}

const OpuraReports: React.FC<OpuraReportsProps> = ({ organizationId }) => {
    const { localToast, showToast } = useToast();
    const now = new Date();
    // Filtros de escopo persistem (§3): a dimensão é a aba, o período/direção/
    // status são o recorte — reabrir a tela devolve o mesmo relatório.
    const [dimension, setDimension] = usePersistedState<OpuraDimension>('opuraReports:dimension', 'supplier');
    const [dateField, setDateField] = usePersistedState<OpuraDateField>('opuraReports:dateField', 'transaction');
    const [dateFrom, setDateFrom]   = usePersistedState<string>('opuraReports:dateFrom', `${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]       = usePersistedState<string>('opuraReports:dateTo', `${now.getFullYear()}-12-31`);
    const [direction, setDirection] = usePersistedState<Direction>('opuraReports:direction', '');
    const [status, setStatus]       = usePersistedState<Status>('opuraReports:status', '');

    const [pivotRows, setPivotRows] = React.useState<OpuraPivotRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Comparativo temporal (Cat 5)
    const [compareMode, setCompareMode] = usePersistedState<boolean>('opuraReports:compareMode', false);
    const [dateFromB, setDateFromB] = usePersistedState<string>('opuraReports:dateFromB', `${now.getFullYear() - 1}-01-01`);
    const [dateToB, setDateToB]     = usePersistedState<string>('opuraReports:dateToB', `${now.getFullYear() - 1}-12-31`);
    const [compareRows, setCompareRows] = React.useState<OpuraCompareRow[]>([]);

    // Drill-down (extrato da linha clicada)
    const [drill, setDrill] = React.useState<{ label: string } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);

    const baseFilters = React.useMemo<OpuraFilters>(() => ({
        dateField,
        dateFrom,
        dateTo,
        direction: direction || undefined,
        status: status || undefined,
    }), [dateField, dateFrom, dateTo, direction, status]);

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (compareMode) {
                const filtersB: OpuraFilters = {
                    dateField, dateFrom: dateFromB, dateTo: dateToB,
                    direction: direction || undefined, status: status || undefined,
                };
                const cmp = await opuraAnalyticsService.compare(organizationId, dimension, baseFilters, filtersB);
                setCompareRows(cmp);
            } else {
                const data = await opuraAnalyticsService.pivot(organizationId, dimension, baseFilters);
                setPivotRows(data);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setPivotRows([]); setCompareRows([]);
            setError(msg);
            showToast(`Erro ao carregar relatório: ${msg}`, 'error');
            console.error('[OpuraReports]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dimension, baseFilters, compareMode, dateFromB, dateToB, dateField, direction, status, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const dimLabel = DIMENSIONS.find(d => d.value === dimension)?.label ?? 'Dimensão';
    const isTree = dimension === 'cost_center';

    // Centro de Custo: mesma hierarquia de Organização › Centro de Custo
    // (cost_centers_v2.parent_id). O catálogo vem da mesma fonte daquela tela;
    // REGRA #5 — organizationId vazio ("Todas") lista todas as orgs do usuário.
    const [costCenters, setCostCenters] = React.useState<CostCenterV2[]>([]);
    const [collapsedCc, setCollapsedCc] = React.useState<Set<string>>(new Set());
    React.useEffect(() => {
        if (!isTree) return;
        let alive = true;
        costCenterService.list(organizationId || null)
            .then(list => { if (alive) setCostCenters(list); })
            .catch(e => {
                console.error('[OpuraReports/cost_centers]', e);
                showToast(`Erro ao carregar centros de custo: ${e instanceof Error ? e.message : String(e)}`, 'error');
            });
        return () => { alive = false; };
    }, [isTree, organizationId, showToast]);

    const flatRows = React.useMemo(() => flatRowsToReport(pivotRows), [pivotRows]);

    // Grupos nascem expandidos (é relatório: o detalhe já estava visível na
    // lista plana); o chevron recolhe. `collapsedCc` guarda os recolhidos.
    const treeRows = React.useMemo<ReportRow[]>(() => {
        if (!isTree) return [];
        const tree = buildCostCenterTree(flatRows.map(r => ({
            dimension_key: r.key, dimension_label: r.label,
            qtd: r.qtd, realizado: r.realizado, previsto: r.previsto, vencido: r.vencido,
        })), costCenters);
        const expanded = new Set<string>();
        const collect = (list: CostCenterTreeNode[]) => list.forEach(n => {
            if (n.key && n.children.length > 0 && !collapsedCc.has(n.key)) expanded.add(n.key);
            collect(n.children);
        });
        collect(tree);
        const flat = flattenCostCenterTree(tree, expanded);
        return flat.map((n, i) => ({
            rowId: `${n.synthetic ? 'own-' : ''}${n.key ?? 'sem'}-${i}`,
            key: n.key,
            label: n.name,
            code: n.code,
            depth: n.depth,
            isGroup: n.children.length > 0,
            synthetic: !!n.synthetic,
            collapsed: !!(n.key && collapsedCc.has(n.key)),
            // O nó sintético é sempre o 1º filho: a linha anterior é o grupo dele.
            groupLabel: n.synthetic ? flat[i - 1]?.name ?? null : null,
            searchText: subtreeNames(n),
            qtd: n.totals.qtd,
            realizado: n.totals.realizado,
            previsto: n.totals.previsto,
            vencido: n.totals.vencido,
        }));
    }, [isTree, flatRows, costCenters, collapsedCc]);

    const rows = isTree ? treeRows : flatRows;

    const toggleCc = React.useCallback((key: string) => {
        setCollapsedCc(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    const openDrill = React.useCallback(async (key: string | null, label: string) => {
        const patch = opuraAnalyticsService.drillFilter(dimension, key);
        if (!patch) return; // dimensão sem detalhamento (não ocorre nas dimensões atuais)
        setDrill({ label });
        setEntries([]);
        setEntriesLoading(true);
        try {
            const f: OpuraEntryFilters = { ...baseFilters, ...patch };
            const data = await opuraAnalyticsService.entries(organizationId, f, 200, 0);
            setEntries(data);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`Erro ao carregar extrato: ${msg}`, 'error');
            console.error('[OpuraReports/drill]', e);
        } finally {
            setEntriesLoading(false);
        }
    }, [dimension, baseFilters, organizationId, showToast]);

    // §9.1 — a linha inteira é a ação: grupo recolhe/expande, folha abre o extrato.
    const onRowClick = React.useCallback((r: ReportRow) => {
        if (r.isGroup && r.key) toggleCc(r.key);
        else openDrill(r.key, r.synthetic ? `${r.groupLabel ?? ''} ${r.label}`.trim() : r.label);
    }, [toggleCc, openDrill]);

    // Totais sempre da lista plana — no modo árvore os grupos já somam os filhos.
    const totals = React.useMemo(() => flatRows.reduce((acc, r) => ({
        qtd:       acc.qtd + r.qtd,
        realizado: acc.realizado + r.realizado,
        previsto:  acc.previsto + r.previsto,
        vencido:   acc.vencido + r.vencido,
    }), { qtd: 0, realizado: 0, previsto: 0, vencido: 0 }), [flatRows]);

    const maxAbs = React.useMemo(
        () => Math.max(1, ...flatRows.map(r => Math.abs(r.realizado))),
        [flatRows],
    );

    // Presets de comparação (mês×anterior, ano×anterior)
    const applyComparePreset = React.useCallback((preset: 'mes' | 'ano') => {
        const d = new Date();
        const ym0 = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const ymEnd = (y: number, m: number) => {
            const last = new Date(y, m + 1, 0);
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
        };
        if (preset === 'mes') {
            const y = d.getFullYear(), m = d.getMonth();
            setDateFrom(ym0(y, m)); setDateTo(ymEnd(y, m));
            const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
            setDateFromB(ym0(py, pm)); setDateToB(ymEnd(py, pm));
        } else {
            const y = d.getFullYear();
            setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`);
            setDateFromB(`${y - 1}-01-01`); setDateToB(`${y - 1}-12-31`);
        }
    }, [setDateFrom, setDateTo, setDateFromB, setDateToB]);

    const compareTotals = React.useMemo(() => compareRows.reduce((a, r) => ({
        valorA: a.valorA + r.valorA, valorB: a.valorB + r.valorB,
    }), { valorA: 0, valorB: 0 }), [compareRows]);
    const compareTotalVar = compareTotals.valorB === 0 ? null
        : (compareTotals.valorA - compareTotals.valorB) / Math.abs(compareTotals.valorB) * 100;

    const exportCsv = () => {
        const header = [dimLabel, 'Qtd', 'Realizado', 'Previsto', 'Vencido'];
        const lines = flatRows.map(r => [
            `"${(r.label ?? '').replace(/"/g, '""')}"`,
            r.qtd,
            r.realizado.toFixed(2),
            r.previsto.toFixed(2),
            r.vencido.toFixed(2),
        ].join(','));
        const csv = [header.join(','), ...lines].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `opura_${dimension}_${dateFrom}_${dateTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const pivotCols = React.useMemo(() => pivotColumns(dimLabel, isTree), [dimLabel, isTree]);
    const compareCols = React.useMemo(() => compareColumns(dimLabel), [dimLabel]);

    const renderPivotCell = (key: string, r: ReportRow): React.ReactNode => {
        switch (key) {
            case 'label':
                return (
                    <div className="flex items-center gap-3 min-w-0" style={{ paddingLeft: r.depth * 24 }}>
                        {r.isGroup && (
                            r.collapsed
                                ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        {r.code && <span className="text-sm font-normal text-gray-400 tabular-nums flex-shrink-0">{r.code}</span>}
                        <span
                            className={`block truncate text-sm font-normal ${r.isGroup ? 'text-gray-900' : r.synthetic ? 'text-gray-500 italic' : 'text-gray-700'}`}
                            title={r.label}
                        >
                            {r.label}
                        </span>
                    </div>
                );
            case 'qtd':
                return <span className="text-sm font-normal text-gray-600 tabular-nums">{r.qtd}</span>;
            case 'realizado':
                return <span className={`text-sm font-medium tabular-nums ${r.realizado < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fBRL(r.realizado)}</span>;
            case 'previsto':
                return <span className="text-sm font-normal text-gray-600 tabular-nums">{fBRL(r.previsto)}</span>;
            case 'vencido':
                return <span className={`text-sm font-medium tabular-nums ${r.vencido > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{r.vencido > 0 ? fBRL(r.vencido) : '—'}</span>;
            case 'progresso':
                // §29 — barra segmentada: |realizado| ÷ maior realizado da lista
                return <SegmentedProgress percent={Math.abs(r.realizado) / maxAbs * 100} title="Realizado desta linha em relação ao maior da lista" />;
            default:
                return null;
        }
    };

    const renderCompareCell = (key: string, r: OpuraCompareRow): React.ReactNode => {
        switch (key) {
            case 'label':
                return <span className="block truncate text-sm font-normal text-gray-700" title={r.dimension_label}>{r.dimension_label}</span>;
            case 'valorA':
                return <span className="text-sm font-medium text-gray-800 tabular-nums">{fBRL(r.valorA)}</span>;
            case 'valorB':
                return <span className="text-sm font-normal text-gray-600 tabular-nums">{fBRL(r.valorB)}</span>;
            case 'delta':
                return (
                    <span className={`text-sm font-medium tabular-nums ${r.delta < 0 ? 'text-red-600' : r.delta > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                        {r.delta > 0 ? '+' : ''}{fBRL(r.delta)}
                    </span>
                );
            case 'variacao':
                return r.variacao === null ? (
                    <span className="text-sm font-normal text-indigo-500">novo</span>
                ) : (
                    <span className={`text-sm font-medium tabular-nums inline-flex items-center gap-0.5 ${r.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.variacao >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(r.variacao).toFixed(0)}%
                    </span>
                );
            default:
                return null;
        }
    };

    const scopeControl = 'h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

    return (
        <div className="space-y-6">
            {/* 1. Título (§20) — o subtítulo acompanha a aba ativa */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <BarChart3 className="w-7 h-7 text-blue-600" /> ÒPURA · Relatórios
                </h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Lançamentos agrupados por {dimLabel.toLowerCase()} — analise por qualquer dimensão sem trocar de tela.
                </p>
            </div>

            {/* 2. Abas (§19.1) — uma por dimensão do pivot */}
            <TabsBar<OpuraDimension>
                tabs={DIMENSIONS.map(d => ({ id: d.value, label: d.label }))}
                value={dimension}
                onChange={setDimension}
            />

            {/* 4. Toolbar de botões (§5.3) — escopo à esquerda, ações à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select value={dateField} onChange={e => setDateField(e.target.value as OpuraDateField)}
                        title="Período por" aria-label="Período por" className={`${scopeControl} pr-8 cursor-pointer`}>
                        {DATE_FIELDS.map(f => <option key={f.value} value={f.value}>Período por {f.label.toLowerCase()}</option>)}
                    </select>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="De" className={scopeControl} />
                    <span className="text-sm text-gray-400">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="Até" className={scopeControl} />
                    <FilterPopover<Direction> label="Direção" value={direction} onChange={setDirection} options={DIRECTION_OPTIONS} icon={<ArrowDownUp className="w-4 h-4" />} />
                    <FilterPopover<Status> label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} icon={<Activity className="w-4 h-4" />} />
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button variant="secondary" onClick={() => setCompareMode(m => !m)} aria-pressed={compareMode}
                        className={compareMode ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50' : ''}>
                        <ArrowLeftRight className="w-[15px] h-[15px]" /> Comparar
                    </Button>
                    <Button variant="secondary" onClick={exportCsv} disabled={loading || flatRows.length === 0 || compareMode}>
                        <Download className="w-[15px] h-[15px]" /> CSV
                    </Button>
                    <Button onClick={load} disabled={loading}>
                        <RefreshCw className={`w-[15px] h-[15px] ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                </div>
            </div>

            {/* Comparativo: período B (base) + presets — segunda barra de escopo, só no modo comparar */}
            {compareMode && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 px-1">Comparar com (período B)</span>
                        <input type="date" value={dateFromB} onChange={e => setDateFromB(e.target.value)} aria-label="De (B)" className={scopeControl} />
                        <span className="text-sm text-gray-400">até</span>
                        <input type="date" value={dateToB} onChange={e => setDateToB(e.target.value)} aria-label="Até (B)" className={scopeControl} />
                        <Button variant="secondary" onClick={() => applyComparePreset('mes')}>Mês × anterior</Button>
                        <Button variant="secondary" onClick={() => applyComparePreset('ano')}>Ano × anterior</Button>
                    </div>
                    <p className="text-xs text-gray-400 px-1">Período A = barra acima · Variação = (A − B) ÷ |B|.</p>
                </div>
            )}

            {/* Banner de erro fora do card acoplado (§5.2) */}
            {error && !loading && (
                <div className="bg-white rounded-[10px] border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-[10px] bg-red-50 text-red-500 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar o relatório</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <Button onClick={load} className="mt-2">
                        <RefreshCw className="w-[15px] h-[15px]" /> Tentar novamente
                    </Button>
                </div>
            )}

            {/* 5. Tabela com toolbar acoplada (§5.2/§6.10).
                `key` = storageKey: as duas tabelas ocupam a mesma posição na árvore e,
                sem a key, o React reaproveita a instância ao trocar de modo — o estado
                de colunas do pivot (qtd/realizado…) vazava para a tabela de comparação. */}
            {!error && (compareMode ? (
                <StandardTable<OpuraCompareRow>
                    key="opuraReports:compare"
                    storageKey="opuraReports:compare"
                    columns={compareCols}
                    rows={compareRows}
                    rowKey={(r) => r.dimension_key ?? `c-${r.dimension_label}`}
                    searchText={r => r.dimension_label}
                    searchPlaceholder={`Buscar por ${dimLabel.toLowerCase()}...`}
                    sortValue={(key, r) => key === 'label' ? r.dimension_label : key === 'variacao' ? r.variacao : (r as unknown as Record<string, number>)[key]}
                    renderCell={renderCompareCell}
                    loading={loading}
                    empty={{ icon: <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Sem dados para os períodos selecionados', subtitle: 'Ajuste os períodos A e B.' }}
                    footer={compareRows.length > 0 && !loading ? (
                        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                            <span>Total · {compareRows.length} {compareRows.length === 1 ? 'linha' : 'linhas'}</span>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
                                <span>A <span className="font-medium text-gray-800">{fBRL(compareTotals.valorA)}</span></span>
                                <span>B <span className="font-medium text-gray-800">{fBRL(compareTotals.valorB)}</span></span>
                                <span>Δ <span className={`font-medium ${compareTotals.valorA - compareTotals.valorB < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {compareTotals.valorA - compareTotals.valorB > 0 ? '+' : ''}{fBRL(compareTotals.valorA - compareTotals.valorB)}
                                </span></span>
                                <span>Var. <span className={`font-medium ${compareTotalVar === null ? 'text-gray-400' : compareTotalVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {compareTotalVar === null ? '—' : `${compareTotalVar >= 0 ? '+' : ''}${compareTotalVar.toFixed(0)}%`}
                                </span></span>
                            </div>
                        </div>
                    ) : null}
                />
            ) : (
                <StandardTable<ReportRow>
                    key={isTree ? 'opuraReports:pivotTree' : 'opuraReports:pivot'}
                    storageKey={isTree ? 'opuraReports:pivotTree' : 'opuraReports:pivot'}
                    columns={pivotCols}
                    rows={rows}
                    rowKey={r => r.rowId}
                    searchText={r => r.searchText}
                    searchPlaceholder={`Buscar por ${dimLabel.toLowerCase()}...`}
                    sortValue={(key, r) => key === 'label' ? r.label : key === 'progresso' ? Math.abs(r.realizado) : (r as unknown as Record<string, number>)[key]}
                    renderCell={renderPivotCell}
                    onRowClick={onRowClick}
                    rowClassName={r => r.isGroup ? 'bg-gray-50/60' : ''}
                    loading={loading}
                    empty={{ icon: <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum lançamento encontrado', subtitle: 'Ajuste os filtros ou o período selecionado.' }}
                    footer={flatRows.length > 0 && !loading ? (
                        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                            <span>Total · {flatRows.length} {flatRows.length === 1 ? 'linha' : 'linhas'} · {totals.qtd} lançamentos</span>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
                                <span>Realizado <span className={`font-medium ${totals.realizado < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fBRL(totals.realizado)}</span></span>
                                <span>Previsto <span className="font-medium text-gray-800">{fBRL(totals.previsto)}</span></span>
                                <span>Vencido <span className={`font-medium ${totals.vencido > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{totals.vencido > 0 ? fBRL(totals.vencido) : '—'}</span></span>
                            </div>
                        </div>
                    ) : null}
                />
            ))}

            {/* Drill-down: extrato da linha clicada (§6.9 — tabela dentro de Sheet: px-3/px-4) */}
            <Sheet open={drill !== null} onClose={() => setDrill(null)} size="2xl">
                <SheetHeader onClose={() => setDrill(null)}>
                    <SheetTitle>{drill?.label ?? 'Extrato'}</SheetTitle>
                    <SheetDescription>
                        {dimLabel} · {entries[0]?.total_count ?? entries.length} lançamento(s)
                        {entries[0]?.total_count && entries[0].total_count > entries.length
                            ? ` (exibindo ${entries.length})` : ''}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    {entriesLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando extrato...</p>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-12">
                            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Sem lançamentos</h3>
                            <p className="text-sm text-gray-500">Nada nesta linha para o período.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100 w-24">Data</th>
                                        <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                                        <th className="px-3 py-2 text-right w-32">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {entries.map(e => (
                                        <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-3 py-2.5 border-r border-gray-100 whitespace-nowrap text-sm font-normal text-gray-600 tabular-nums">
                                                {e.transaction_date.split('-').reverse().join('/')}
                                            </td>
                                            <td className="px-4 py-2.5 border-r border-gray-100 min-w-0">
                                                <p className="block truncate text-sm font-normal text-gray-700 max-w-[320px]" title={e.description || e.category_name || undefined}>
                                                    {e.description || e.category_name || '—'}
                                                </p>
                                                <p className="block truncate text-xs text-gray-400 max-w-[320px]">
                                                    {[e.category_name, e.supplier_name || e.client_name, e.project_name]
                                                        .filter(Boolean).join(' · ')}
                                                    {e.status === 'PENDING' ? ' · previsto' : ''}
                                                </p>
                                            </td>
                                            <td className={`px-3 py-2.5 text-right tabular-nums text-sm font-medium ${e.direction === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                                {e.direction === 'DEBIT' ? '−' : '+'}{fBRL(e.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SheetPanel>
            </Sheet>

            {/* Toast de Notificação — padrão guia seção 13 */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default OpuraReports;
