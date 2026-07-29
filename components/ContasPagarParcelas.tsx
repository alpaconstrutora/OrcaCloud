import React, { useMemo, useState } from 'react';
import {
    AlertCircle, Check, FileText, Loader2, MoveHorizontal, RefreshCw, Search, X,
} from 'lucide-react';
import type { Payable, PayableBusinessStatus } from '../types/financial';
import { payableService, payableParty } from '../services/payableService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { Money, formatMoney, formatDateBR } from './ui/Format';
import { useConfirm } from './ui/confirm';
import ActionIconButton from './ui/ActionIconButton';

/**
 * Rótulo de origem por `source_system`. É a coluna que responde "de onde essa
 * parcela veio", e por isso mostra Pedido/Contrato/Medição separadamente em vez
 * de agrupar tudo como "Suprimentos".
 */
const ORIGEM_PT: Record<string, string> = {
    PURCHASE_ORDER: 'Pedido de compra',
    CONTRACT_PARCELADO: 'Contrato',
    CONTRACT_MEASUREMENT: 'Medição',
    PROJECT: 'Obra',
    MANUAL: 'Manual',
};
const origemLabel = (sourceSystem: string) => ORIGEM_PT[sourceSystem] ?? sourceSystem;

const STATUS_PT: Record<string, string> = {
    PREVISTO: 'Previsto',
    APROVADO: 'Aprovado',
    VENCIDO: 'Vencido',
    PAGO: 'Pago',
    PARCIAL: 'Parcial',
    RENEGOCIADO: 'Renegociado',
    CANCELADO: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
    PAGO: 'text-green-700',
    APROVADO: 'text-blue-700',
    PREVISTO: 'text-yellow-700',
    VENCIDO: 'text-red-600',
    PARCIAL: 'text-amber-700',
    RENEGOCIADO: 'text-indigo-700',
    CANCELADO: 'text-gray-500',
};

// Padrão §8 — texto simples colorido, sem pílula/fundo/uppercase.
function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`text-sm font-normal ${STATUS_COLORS[status] ?? 'text-gray-600'}`}>
            {STATUS_PT[status] ?? status}
        </span>
    );
}

const PARCELAS_COLUMNS: ColumnConfig[] = [
    { key: 'fornecedor', label: 'Fornecedor / Descrição', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    fornecedor: 260, origem: 150, obra: 160, valor: 140, vencimento: 130, status: 120, actions: 200,
};

const STATUS_FILTROS = ['all', 'PREVISTO', 'VENCIDO', 'PAGO'] as const;
type StatusFiltro = typeof STATUS_FILTROS[number];

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Dias de atraso — a data vem 'YYYY-MM-DD', então parseia com hora fixa (bug de fuso). */
function diasAtraso(dueDate: string): number {
    return Math.floor((hoje().getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000);
}

interface Props {
    rows: Payable[];
    loading: boolean;
    error: string | null;
    onReload: () => void;
    /** Atualização de estado local em vez de recarga total (§22). */
    onRowChanged: (row: Payable) => void;
    onRowRemoved: (id: string) => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

export default function ContasPagarParcelas({ rows, loading, error, onReload, onRowChanged, onRowRemoved, notify }: Props) {
    const confirm = useConfirm();
    const [search, setSearch] = usePersistedState('contasPagarParcelas:search', '');
    const [statusFiltro, setStatusFiltro] = usePersistedState<StatusFiltro>('contasPagarParcelas:status', 'all');
    const [salvando, setSalvando] = useState<string | null>(null);

    const tableColumns = useTableColumns(PARCELAS_COLUMNS, 'contasPagarParcelasColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'contasPagarParcelasColWidths');
    // Largura = soma exata das colunas visíveis. NUNCA w-full com table-layout:fixed (§6.1).
    const tableTotalWidth = PARCELAS_COLUMNS
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

    const filtered = useMemo(() => {
        let result = rows.filter(r => {
            if (statusFiltro !== 'all' && r.effective_status !== statusFiltro) return false;
            if (search) {
                const termo = search.toLowerCase();
                const hit = payableParty(r).toLowerCase().includes(termo)
                    || (r.description ?? '').toLowerCase().includes(termo)
                    || (r.project_name ?? '').toLowerCase().includes(termo);
                if (!hit) return false;
            }
            return true;
        });

        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            const valor = (r: Payable): string | number => {
                switch (tableColumns.sortColumn) {
                    case 'fornecedor': return payableParty(r).toLowerCase();
                    case 'origem':     return origemLabel(r.source_system).toLowerCase();
                    case 'obra':       return (r.project_name ?? '').toLowerCase();
                    case 'valor':      return r.amount ?? 0;
                    case 'vencimento': return r.due_date ?? '';
                    case 'status':     return r.effective_status;
                    default:           return '';
                }
            };
            result = [...result].sort((a, b) => {
                const va = valor(a), vb = valor(b);
                if (va < vb) return -dir;
                if (va > vb) return dir;
                return 0;
            });
        }
        return result;
    }, [rows, search, statusFiltro, tableColumns.sortColumn, tableColumns.sortDirection]);

    // colunas visíveis + espaçador + ações
    const totalColunas = PARCELAS_COLUMNS.filter(c => tableColumns.visibleColumns.includes(c.key)).length + 2;

    const totalAberto = filtered
        .filter(r => !['PAGO', 'CANCELADO'].includes(r.effective_status))
        .reduce((s, r) => s + (r.amount ?? 0), 0);

    async function marcarStatus(row: Payable, novo: PayableBusinessStatus) {
        setSalvando(row.id);
        try {
            await payableService.updateStatus(row.id, novo);
            onRowChanged({
                ...row,
                business_status: novo,
                effective_status: novo,
                status: novo === 'PAGO' ? 'CONCILIATED' : row.status,
            });
            notify(novo === 'PAGO' ? 'Parcela marcada como paga.' : 'Status atualizado.');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao atualizar status'), 'error');
        } finally {
            setSalvando(null);
        }
    }

    async function excluir(row: Payable) {
        const ok = await confirm({
            title: 'Excluir título?',
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await payableService.remove(row.id);
            onRowRemoved(row.id);
            notify('Título excluído.');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao excluir'), 'error');
        }
    }

    return (
        /* Toolbar acoplada à tabela (§5.2) — toolbar e conteúdo dividem um único
           card; border/rounded/shadow só no container pai. */
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar fornecedor, descrição ou obra..."
                            className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filtro rápido de status em controle segmentado (§5.2) */}
                    <div className="flex items-center h-9 bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        {STATUS_FILTROS.map(s => {
                            const activeColor = s === 'VENCIDO' ? 'text-red-600' : s === 'PAGO' ? 'text-emerald-600' : s === 'PREVISTO' ? 'text-amber-600' : 'text-gray-900';
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFiltro(s)}
                                    className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${statusFiltro === s ? `bg-white shadow-sm ${activeColor}` : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    {s === 'all' ? 'Todos' : STATUS_PT[s]}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={onReload}
                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                        title="Recarregar"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    {/* Separador entre grupo "filtrar" e grupo "visualizar" (§5.1) */}
                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={PARCELAS_COLUMNS}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        {/* Autofit sob comando explícito, nunca automático (§6.1.2) */}
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div>
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-red-500">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm">{error}</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma parcela encontrada</h3>
                        <p className="text-sm text-gray-500">
                            Parcelas aparecem aqui quando um pedido é recebido ou um contrato de suprimentos é parcelado.
                        </p>
                    </div>
                ) : (
                    /* §6.5 — lista longa: container rola em altura própria, thead fixo */
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {PARCELAS_COLUMNS.map(c => (
                                    tableColumns.visibleColumns.includes(c.key)
                                        ? <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                                        : null
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio,
                                    para a borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead sentence case (§6.2) — uppercase={false} porque SortableHeader
                                força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {PARCELAS_COLUMNS.map(c => {
                                        if (!tableColumns.visibleColumns.includes(c.key)) return null;
                                        const align = c.key === 'valor' ? 'text-right' : (c.key === 'vencimento' || c.key === 'status') ? 'text-center' : 'text-left';
                                        return (
                                            <SortableHeader
                                                key={c.key}
                                                label={c.label}
                                                colKey={c.key}
                                                sortable
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className={`${align} px-6 py-2 border-r border-gray-100 overflow-hidden`}
                                            >
                                                <cols.ResizeHandle colKey={c.key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="text-right px-6 py-2 relative overflow-hidden text-sm font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(row => {
                                    const vencido = row.effective_status === 'VENCIDO';
                                    const quitado = ['PAGO', 'CANCELADO'].includes(row.effective_status);
                                    return (
                                        <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${vencido ? 'bg-red-50/30' : ''}`}>
                                            {tableColumns.visibleColumns.includes('fornecedor') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <p className="text-sm font-normal text-gray-700 truncate">{payableParty(row)}</p>
                                                    <p className="text-xs text-gray-400 truncate">{row.description}</p>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('origem') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {origemLabel(row.source_system)}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('obra') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 truncate">
                                                    {row.project_name ?? '—'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('valor') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                    <Money value={row.amount} />
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('vencimento') && (
                                                <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal ${vencido ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {formatDateBR(row.due_date)}
                                                    {vencido && row.due_date && (
                                                        <div className="text-xs text-red-500">{diasAtraso(row.due_date)}d atraso</div>
                                                    )}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                    <StatusBadge status={row.effective_status} />
                                                </td>
                                            )}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            <td className="px-6 py-2.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {!quitado && (
                                                        <button
                                                            onClick={() => marcarStatus(row, 'PAGO')}
                                                            disabled={salvando === row.id}
                                                            className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all disabled:opacity-50 flex items-center gap-1"
                                                            title="Marcar como pago"
                                                        >
                                                            {salvando === row.id
                                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                : <Check className="w-3.5 h-3.5" />}
                                                            Pago
                                                        </button>
                                                    )}
                                                    {row.effective_status === 'PAGO' && (
                                                        <span className="flex items-center gap-1 text-sm font-normal text-green-700">
                                                            <Check className="w-4 h-4" /> Quitado
                                                        </span>
                                                    )}
                                                    {/* Só título manual é excluível aqui: parcela de Pedido ou
                                                        Contrato é espelho da origem (payableService.remove). */}
                                                    {row.source_system === 'MANUAL' && (
                                                        <ActionIconButton kind="delete" onClick={() => excluir(row)} />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {/* Célula única: alinhar o total à coluna "Valor" com colSpan
                                    quebra assim que o usuário esconde uma coluna (§6 config). */}
                                <tr className="bg-gray-50 border-t border-gray-200">
                                    <td colSpan={totalColunas} className="px-6 py-2">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-sm text-gray-500">
                                                {filtered.length} parcela{filtered.length !== 1 ? 's' : ''}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                                total em aberto (filtrado){' '}
                                                <span className="text-sm font-medium text-gray-900">{formatMoney(totalAberto)}</span>
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
