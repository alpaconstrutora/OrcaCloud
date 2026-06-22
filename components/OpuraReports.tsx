import React from 'react';
import { RefreshCw, AlertTriangle, Download, BarChart3, ArrowDownUp, ChevronRight } from 'lucide-react';
import {
    opuraAnalyticsService,
    type OpuraDimension,
    type OpuraDateField,
    type OpuraFilters,
    type OpuraEntryFilters,
    type OpuraPivotRow,
    type OpuraEntry,
} from '../services/opuraAnalyticsService';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

// ── Formatadores ──────────────────────────────────────────────────────────────

function fBRL(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fBRLshort(v: number): string {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`;
    return fBRL(v);
}

// ── Dimensões disponíveis (espelha a whitelist de fn_opura_pivot) ──────────────

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

// ── Linha derivada para exibição ───────────────────────────────────────────────

interface DisplayRow extends OpuraPivotRow {
    realizado: number; // credit − debit conciliado
    previsto: number;  // credit − debit pendente
}

function toDisplay(rows: OpuraPivotRow[]): DisplayRow[] {
    return rows.map(r => ({
        ...r,
        realizado: r.net_realizado,
        previsto: r.credit_previsto - r.debit_previsto,
    }));
}

// ── Componente principal ───────────────────────────────────────────────────────

interface OpuraReportsProps {
    organizationId: string;
}

const OpuraReports: React.FC<OpuraReportsProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [dimension, setDimension] = React.useState<OpuraDimension>('supplier');
    const [dateField, setDateField] = React.useState<OpuraDateField>('transaction');
    const [dateFrom, setDateFrom]   = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]       = React.useState(`${now.getFullYear()}-12-31`);
    const [direction, setDirection] = React.useState<'' | 'CREDIT' | 'DEBIT'>('');
    const [status, setStatus]       = React.useState<'' | 'CONCILIATED' | 'PENDING'>('');

    const [rows, setRows]       = React.useState<DisplayRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

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
        if (!organizationId) {
            setRows([]);
            setError('Nenhuma organização ativa selecionada.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await opuraAnalyticsService.pivot(organizationId, dimension, baseFilters);
            setRows(toDisplay(data));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setRows([]);
            setError(msg);
            showToast(`Erro ao carregar relatório: ${msg}`, 'error');
            console.error('[OpuraReports]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dimension, baseFilters, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const dimLabel = DIMENSIONS.find(d => d.value === dimension)?.label ?? 'Dimensão';

    const openDrill = React.useCallback(async (row: DisplayRow) => {
        const patch = opuraAnalyticsService.drillFilter(dimension, row.dimension_key);
        if (!patch) return; // dimensão sem detalhamento (não ocorre nas dimensões atuais)
        setDrill({ label: row.dimension_label });
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

    const totals = React.useMemo(() => rows.reduce((acc, r) => ({
        qtd:       acc.qtd + r.qtd,
        realizado: acc.realizado + r.realizado,
        previsto:  acc.previsto + r.previsto,
        vencido:   acc.vencido + r.vencido,
    }), { qtd: 0, realizado: 0, previsto: 0, vencido: 0 }), [rows]);

    const maxAbs = React.useMemo(
        () => Math.max(1, ...rows.map(r => Math.abs(r.realizado))),
        [rows],
    );

    const exportCsv = () => {
        const header = [dimLabel, 'Qtd', 'Realizado', 'Previsto', 'Vencido'];
        const lines = rows.map(r => [
            `"${(r.dimension_label ?? '').replace(/"/g, '""')}"`,
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <BarChart3 className="w-7 h-7 text-blue-600" /> ÒPURA · Relatórios
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">
                        Analise por qualquer dimensão sem trocar de tela.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={exportCsv} disabled={loading || rows.length === 0}
                        className="px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                        <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button onClick={load} disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2 transition-all disabled:opacity-60">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Seletor de dimensão principal */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ArrowDownUp className="w-3.5 h-3.5" /> Agrupar por
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {DIMENSIONS.map(d => (
                        <button key={d.value} onClick={() => setDimension(d.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                dimension === d.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Período por</label>
                    <select value={dateField} onChange={e => setDateField(e.target.value as OpuraDateField)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                        {DATE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">De</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Até</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Direção</label>
                    <select value={direction} onChange={e => setDirection(e.target.value as typeof direction)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                        <option value="">Tudo</option>
                        <option value="CREDIT">Entradas</option>
                        <option value="DEBIT">Saídas</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                        <option value="">Tudo</option>
                        <option value="CONCILIATED">Realizado</option>
                        <option value="PENDING">Previsto</option>
                    </select>
                </div>
            </div>

            {/* Resultado */}
            {loading ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                    Carregando relatório...
                </div>
            ) : error ? (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar o relatório</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <button onClick={load}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                </div>
            ) : rows.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                    Sem lançamentos para os filtros selecionados.
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                <th className="text-left px-5 py-3">{dimLabel}</th>
                                <th className="text-right px-3 py-3 w-20">Qtd</th>
                                <th className="text-right px-3 py-3 w-40">Realizado</th>
                                <th className="text-right px-3 py-3 w-32">Previsto</th>
                                <th className="text-right px-5 py-3 w-32">Vencido</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.dimension_key ?? `row-${i}`} onClick={() => openDrill(r)}
                                    className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 cursor-pointer group">
                                    <td className="px-5 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden flex-shrink-0" style={{ width: 60 }}>
                                                <div className="h-full bg-blue-500"
                                                    style={{ width: `${Math.abs(r.realizado) / maxAbs * 100}%` }} />
                                            </div>
                                            <span className="text-gray-700 font-medium truncate group-hover:text-blue-700">{r.dimension_label}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 flex-shrink-0 ml-auto" />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{r.qtd}</td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${r.realizado < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {fBRLshort(r.realizado)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fBRLshort(r.previsto)}</td>
                                    <td className={`px-5 py-2.5 text-right tabular-nums ${r.vencido > 0 ? 'text-amber-600 font-bold' : 'text-gray-300'}`}>
                                        {r.vencido > 0 ? fBRLshort(r.vencido) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-100 font-black text-gray-900">
                                <td className="px-5 py-3">Total ({rows.length})</td>
                                <td className="px-3 py-3 text-right tabular-nums">{totals.qtd}</td>
                                <td className={`px-3 py-3 text-right tabular-nums ${totals.realizado < 0 ? 'text-red-600' : ''}`}>{fBRL(totals.realizado)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-gray-500">{fBRL(totals.previsto)}</td>
                                <td className={`px-5 py-3 text-right tabular-nums ${totals.vencido > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                                    {totals.vencido > 0 ? fBRL(totals.vencido) : '—'}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* Drill-down: extrato da linha clicada */}
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
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">Carregando extrato...</div>
                    ) : entries.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">Sem lançamentos.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-[11px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                    <th className="text-left px-4 py-2.5">Data</th>
                                    <th className="text-left px-2 py-2.5">Descrição</th>
                                    <th className="text-right px-4 py-2.5 w-32">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(e => (
                                    <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 tabular-nums">
                                            {e.transaction_date.split('-').reverse().join('/')}
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <p className="text-gray-700 font-medium truncate max-w-[260px]">
                                                {e.description || e.category_name || '—'}
                                            </p>
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {[e.category_name, e.supplier_name || e.client_name, e.project_name]
                                                    .filter(Boolean).join(' · ')}
                                                {e.status === 'PENDING' ? ' · previsto' : ''}
                                            </p>
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${e.direction === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                            {e.direction === 'DEBIT' ? '−' : '+'}{fBRL(e.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default OpuraReports;
