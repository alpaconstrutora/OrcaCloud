import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown,
    Clock, ExternalLink, FileText, Landmark, Loader2, RefreshCw,
    Search, X, DollarSign, AlertTriangle, MoveHorizontal,
} from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { Invoice } from '../types/financial';
import type { Organization } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { Money, formatMoney, formatDateBR } from './ui/Format';
import PagarBoletoAsaasModal from './PagarBoletoAsaasModal';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';

type InvoiceRow = Invoice & { supplierName?: string; supplierOrganizationId?: string };

/** Extrai o boleto_id da marcação `[boleto:{id}]` gravada em invoices.notes (ver boletoService.aprovarECriarInvoice). */
function extractBoletoId(notes: string | undefined): string | null {
    const m = (notes ?? '').match(/\[boleto:([0-9a-f-]{36})\]/i);
    return m ? m[1] : null;
}
type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected' | 'overdue';

const STATUS_PT: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    paid: 'Pago',
};

const CONTAS_COLUMNS: ColumnConfig[] = [
    { key: 'supplier', label: 'Fornecedor / Documento', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    supplier: 260, origem: 120, valor: 140, vencimento: 150, status: 140, actions: 220,
};

// F6.2 (piloto do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa os
// chips rápidos/campos de período já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'supplier', label: 'Fornecedor', type: 'text' },
    { key: 'origem', label: 'Origem', type: 'select', options: [{ value: 'Boleto', label: 'Boleto' }, { value: 'Manual', label: 'Manual' }] },
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pendente' }, { value: 'approved', label: 'Aprovado' },
        { value: 'paid', label: 'Pago' }, { value: 'rejected', label: 'Rejeitado' },
    ] },
    { key: 'valor', label: 'Valor', type: 'number' },
    { key: 'vencimento', label: 'Vencimento', type: 'date' },
];

function getAdvancedFilterValue(inv: InvoiceRow, key: string): unknown {
    switch (key) {
        case 'supplier': return inv.supplierName ?? '';
        case 'origem': return (inv.notes ?? '').includes('[boleto:') ? 'Boleto' : 'Manual';
        case 'status': return inv.status;
        case 'valor': return inv.amount ?? null;
        case 'vencimento': return inv.dueDate ?? null;
        default: return null;
    }
}

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function isOverdue(inv: InvoiceRow) {
    if (!inv.dueDate) return false;
    if (['paid', 'rejected'].includes(inv.status)) return false;
    return new Date(inv.dueDate + 'T00:00:00') < today();
}

// Padrão guia seção 8 — texto simples, sem pílula
function StatusBadge({ inv }: { inv: InvoiceRow }) {
    if (isOverdue(inv)) {
        return <span className="text-sm font-normal text-red-600">Atrasado</span>;
    }
    const colors: Record<string, string> = {
        paid: 'text-green-700',
        approved: 'text-blue-700',
        pending: 'text-yellow-700',
        rejected: 'text-gray-500',
    };
    return (
        <span className={`text-sm font-normal ${colors[inv.status] ?? 'text-gray-500'}`}>
            {STATUS_PT[inv.status] ?? inv.status}
        </span>
    );
}

interface Props {
    organizationId?: string;
    organizations?: Organization[];
    onOrgChange?: (id: string) => void;
    /**
     * Barra de abas do módulo pai (§3). Vem por prop porque a anatomia do §1 exige
     * título → KPIs → ABAS → botões → tabela: as abas são do pai, mas título e KPIs
     * são desta tela, então quem posiciona a barra no lugar certo é o filho.
     * Ausente = a tela é usada fora do Financeiro e simplesmente não tem abas.
     */
    tabsSlot?: React.ReactNode;
}

export default function ContasPagarManager({ organizationId, organizations, onOrgChange, tabsSlot }: Props) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [marcandoPago, setMarcandoPago] = useState<string | null>(null);
    const [pagandoAsaas, setPagandoAsaas] = useState<InvoiceRow | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
    // F2: filtros sobrevivem a navegação/reload (mesmo padrão de useTableColumns).
    const [search, setSearch] = usePersistedState('contasPagarManagerFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('contasPagarManagerFilters:status', 'all');
    const [vencDe, setVencDe] = usePersistedState('contasPagarManagerFilters:vencDe', '');
    const [vencAte, setVencAte] = usePersistedState('contasPagarManagerFilters:vencAte', '');
    const tableColumns = useTableColumns(CONTAS_COLUMNS, 'contasPagarManagerColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'contasPagarManagerColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1).
    const tableTotalWidth = 40
        + (['supplier', 'origem', 'valor', 'vencimento', 'status'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'contasPagarManagerFilters:advanced');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const effectiveOrgId = selectedOrgId === 'ALL' ? undefined : selectedOrgId;

    async function carregar(orgId?: string) {
        setLoading(true);
        setError(null);
        try {
            const data = await invoiceService.listAll(orgId);
            setInvoices(data);
            setSelectedIds(new Set());
        } catch (e: any) {
            setError(e.message ?? 'Erro ao carregar contas a pagar');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { carregar(effectiveOrgId); }, [effectiveOrgId]);

    function handleOrgChange(id: string) {
        setSelectedOrgId(id);
        if (id !== 'ALL') onOrgChange?.(id);
    }

    async function handleMarcarPago(inv: InvoiceRow) {
        setMarcandoPago(inv.id);
        try {
            await invoiceService.marcarPago(inv.id);
            setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid' } : i));
            notify('Conta marcada como paga.');
        } catch (e: any) {
            notify('Erro: ' + (e.message ?? 'Falha ao marcar como pago'), 'error');
        } finally {
            setMarcandoPago(null);
        }
    }

    const filtered = useMemo(() => {
        let result = invoices.filter(inv => {
            if (statusFilter === 'overdue') { if (!isOverdue(inv)) return false; }
            else if (statusFilter !== 'all') { if (inv.status !== statusFilter) return false; }
            if (vencDe && inv.dueDate && inv.dueDate < vencDe) return false;
            if (vencAte && inv.dueDate && inv.dueDate > vencAte) return false;
            if (search) {
                const q = search.toLowerCase();
                const hit = (inv.supplierName ?? '').toLowerCase().includes(q)
                    || (inv.fileName ?? '').toLowerCase().includes(q)
                    || (inv.notes ?? '').toLowerCase().includes(q);
                if (!hit) return false;
            }
            return true;
        });

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        // Ordenação
        if (tableColumns.sortColumn) {
            result.sort((a, b) => {
                let va: any, vb: any;
                switch (tableColumns.sortColumn) {
                    case 'supplier':
                        va = (a.supplierName ?? '').toLowerCase();
                        vb = (b.supplierName ?? '').toLowerCase();
                        break;
                    case 'origem':
                        va = ((a.notes ?? '').includes('[boleto:') ? 'Boleto' : 'Manual');
                        vb = ((b.notes ?? '').includes('[boleto:') ? 'Boleto' : 'Manual');
                        break;
                    case 'valor':
                        va = a.amount ?? 0;
                        vb = b.amount ?? 0;
                        break;
                    case 'vencimento':
                        va = a.dueDate ?? '';
                        vb = b.dueDate ?? '';
                        break;
                    case 'status':
                        va = a.status;
                        vb = b.status;
                        break;
                    default:
                        return 0;
                }
                if (va < vb) return tableColumns.sortDirection === 'asc' ? -1 : 1;
                if (va > vb) return tableColumns.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [invoices, statusFilter, vencDe, vencAte, search, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Só linhas ainda pagáveis (não pagas/rejeitadas) podem entrar em ação em massa. */
    const isSelectable = (inv: InvoiceRow) => !['paid', 'rejected'].includes(inv.status);
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);
    // Interseção da seleção com o que está visível+pagável (poda filtros que mudaram).
    const selectedVisible = useMemo(
        () => selectableVisible.filter(inv => selectedIds.has(inv.id)),
        [selectableVisible, selectedIds],
    );
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;
    const selectedTotal = selectedVisible.reduce((s, i) => s + (i.amount ?? 0), 0);

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    // Seleção de intervalo com Shift+clique (ui_ux_guia_unificado.md §10.1)
    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = filtered.slice(start, end + 1).filter(isSelectable).map(inv => inv.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleRow(id);
            setLastCheckedIndex(index);
        }
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableVisible.forEach(inv => next.delete(inv.id));
                return next;
            }
            const next = new Set(prev);
            selectableVisible.forEach(inv => next.add(inv.id));
            return next;
        });
    }
    const clearSelection = () => setSelectedIds(new Set());

    async function handleBulkPago() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        setBulkLoading(true);
        const okIds: string[] = [];
        const falhas: string[] = [];
        for (const inv of alvos) {
            try {
                await invoiceService.marcarPago(inv.id);
                okIds.push(inv.id);
            } catch {
                falhas.push(inv.supplierName ?? inv.id);
            }
        }
        if (okIds.length) {
            const okSet = new Set(okIds);
            setInvoices(prev => prev.map(i => okSet.has(i.id) ? { ...i, status: 'paid' } : i));
        }
        setSelectedIds(prev => {
            const next = new Set(prev);
            okIds.forEach(id => next.delete(id));
            return next;
        });
        setBulkLoading(false);
        if (falhas.length) {
            notify(`${okIds.length} marcada(s) como paga(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else if (okIds.length) {
            notify(`${okIds.length} conta${okIds.length !== 1 ? 's' : ''} marcada${okIds.length !== 1 ? 's' : ''} como paga${okIds.length !== 1 ? 's' : ''}.`);
        }
    }

    const summary = useMemo(() => {
        const now = today();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const em7 = new Date(now); em7.setDate(em7.getDate() + 7);

        let aPagar = 0, venc7 = 0, atrasado = 0, pagoMes = 0;
        let qtdAPagar = 0, qtdVenc7 = 0, qtdAtrasado = 0, qtdPagoMes = 0;
        invoices.forEach(inv => {
            const due = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
            if (inv.status === 'paid') {
                const criado = new Date(inv.createdAt);
                if (criado >= inicioMes && criado <= fimMes) { pagoMes += inv.amount ?? 0; qtdPagoMes++; }
            } else if (inv.status !== 'rejected') {
                aPagar += inv.amount ?? 0;
                qtdAPagar++;
                if (due) {
                    if (due < now) { atrasado += inv.amount ?? 0; qtdAtrasado++; }
                    else if (due <= em7) { venc7 += inv.amount ?? 0; qtdVenc7++; }
                }
            }
        });
        return { aPagar, venc7, atrasado, pagoMes, qtdAPagar, qtdVenc7, qtdAtrasado, qtdPagoMes };
    }, [invoices]);

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela — ui_ux_guia_unificado.md §20 */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Contas a Pagar</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Invoices e boletos aprovados para pagamento.</p>
            </div>

            {/* KPI Cards — mb-3 (ritmo §20.1): próximo bloco é a toolbar acoplada (§5.2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                        <KpiCard
                            label="A Pagar"
                            value={formatMoney(summary.aPagar)}
                            sub={`${summary.qtdAPagar} conta${summary.qtdAPagar !== 1 ? 's' : ''} em aberto`}
                            icon={<DollarSign className="w-5 h-5" />}
                            color="blue"
                            onClick={() => setStatusFilter('all')}
                        />
                        <KpiCard
                            label="Vence em 7 dias"
                            value={formatMoney(summary.venc7)}
                            sub={`${summary.qtdVenc7} conta${summary.qtdVenc7 !== 1 ? 's' : ''} próximas`}
                            icon={<Clock className="w-5 h-5" />}
                            color="amber"
                            onClick={() => { setStatusFilter('all'); const d = new Date(); d.setDate(d.getDate() + 7); setVencAte(d.toISOString().slice(0, 10)); setVencDe(new Date().toISOString().slice(0, 10)); }}
                        />
                        <KpiCard
                            label="Em Atraso"
                            value={formatMoney(summary.atrasado)}
                            sub={`${summary.qtdAtrasado} conta${summary.qtdAtrasado !== 1 ? 's' : ''} vencidas`}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            color="red"
                            onClick={() => setStatusFilter('overdue')}
                        />
                        <KpiCard
                            label="Pago no Mês"
                            value={formatMoney(summary.pagoMes)}
                            sub={`${summary.qtdPagoMes} conta${summary.qtdPagoMes !== 1 ? 's' : ''} quitadas`}
                            icon={<Check className="w-5 h-5" />}
                            color="emerald"
                            onClick={() => setStatusFilter('paid')}
                        />
                    </div>

                    {/* Toolbar de abas (§3) — entre os KPIs e a toolbar de botões, na
                        ordem da anatomia do §1. Renderizada pelo módulo pai e posicionada
                        aqui (ver prop `tabsSlot`). */}
                    {tabsSlot}

                    {/* Toolbar de botões (§4) — controles de ESCOPO: sobre qual recorte de
                        dados a tela está olhando (organização, período de vencimento). Barra
                        própria acima da busca, porque muda o escopo, não o filtro — a §4 é
                        explícita em não fundir escopo com busca ("qual organização/mês?" é
                        pergunta diferente de "qual linha?"). Esta tela não tem ação primária
                        (invoice nasce da aprovação de boleto), então o lado direito fica só
                        com o resumo do recorte. */}
                    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {organizations && organizations.length > 1 && (
                                <div className="relative flex items-center">
                                    <Building2 className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                    <select
                                        value={selectedOrgId}
                                        onChange={e => handleOrgChange(e.target.value)}
                                        className="h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
                                    >
                                        <option value="ALL">Todas as Organizações</option>
                                        {organizations.map(o => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5" />
                                </div>
                            )}

                            <span className="text-sm font-medium text-gray-400 pl-1">Vencimento</span>
                            <input
                                type="date"
                                value={vencDe}
                                onChange={e => setVencDe(e.target.value)}
                                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                            <span className="text-sm font-medium text-gray-400">até</span>
                            <input
                                type="date"
                                value={vencAte}
                                onChange={e => setVencAte(e.target.value)}
                                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                            {(vencDe || vencAte) && (
                                <button
                                    onClick={() => { setVencDe(''); setVencAte(''); }}
                                    className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-[6px] hover:bg-gray-50 transition-all"
                                    title="Limpar período"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <span className="text-sm font-normal text-gray-400 shrink-0">
                            {filtered.length} de {invoices.length} conta{invoices.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                        conteúdo dividem um único card (border/rounded/shadow só no container
                        pai); a costura visível entre os dois é o border-b da toolbar. */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar fornecedor, arquivo, observação..."
                                    className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status pills — filtro rápido em controle segmentado, não ordenação (§6.4).
                                Padrão "Tudo/Receitas/Despesas" de ui_ux_guia_unificado.md §5.2. */}
                            <div className="flex items-center h-9 bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                {(['all', 'pending', 'approved', 'overdue', 'paid'] as StatusFilter[]).map(s => {
                                    const activeColor = s === 'overdue' ? 'text-red-600' : s === 'paid' ? 'text-emerald-600' : s === 'pending' ? 'text-amber-600' : s === 'approved' ? 'text-blue-600' : 'text-gray-900';
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${statusFilter === s ? `bg-white shadow-sm ${activeColor}` : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {s === 'all' ? 'Todos' : s === 'overdue' ? 'Atrasado' : STATUS_PT[s]}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Escopo (organização, período) mora na barra da §4, acima —
                                aqui ficam só os controles de FILTRO da linha. */}
                            <div className="flex items-center h-9">
                                <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                            </div>

                            <button
                                onClick={() => carregar(effectiveOrgId)}
                                className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                                title="Recarregar"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            {/* Separador entre grupo "filtrar" e grupo "visualizar" (§5.1) */}
                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                            {/* Sem toggle grid/lista nesta tela — só ColumnConfigButton (ver §5, nota) */}
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={CONTAS_COLUMNS}
                                    visibleColumns={tableColumns.visibleColumns}
                                    showColumnConfig={tableColumns.showColumnConfig}
                                    onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                    onToggleColumn={tableColumns.toggleColumn}
                                    onReset={tableColumns.resetColumns}
                                />
                                {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                    Duplo clique no divisor segue "restaurar padrão". */}
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

                    {/* Tabela — sem bg/border/rounded/overflow-hidden próprios: já está
                        dentro do card acoplado toolbar+conteúdo (§5.2, ver abertura acima).
                        Redimensionamento de colunas (§6.1) aplicado — decisão revertida em
                        2026-07-27 a pedido do usuário; a nota antiga ("só 5 colunas, a mais
                        variável já usa truncate") documentava a justificativa da época. */}
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
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma conta encontrada</h3>
                                <p className="text-sm text-gray-500">Aprove um boleto para ele aparecer aqui.</p>
                            </div>
                        ) : (
                            /* §6.5 — lista pode crescer (todas as contas em aberto, multi-org):
                               container rola em altura própria e o thead fica fixo no topo. */
                            <div className="overflow-auto max-h-[70vh]">
                            <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                                <colgroup>
                                    <col style={{ width: '40px' }} /> {/* checkbox */}
                                    {tableColumns.visibleColumns.includes('supplier') && <col data-col-key="supplier" style={{ width: `${cols.getWidth('supplier')}px` }} />}
                                    {tableColumns.visibleColumns.includes('origem') && <col data-col-key="origem" style={{ width: `${cols.getWidth('origem')}px` }} />}
                                    {tableColumns.visibleColumns.includes('valor') && <col data-col-key="valor" style={{ width: `${cols.getWidth('valor')}px` }} />}
                                    {tableColumns.visibleColumns.includes('vencimento') && <col data-col-key="vencimento" style={{ width: `${cols.getWidth('vencimento')}px` }} />}
                                    {tableColumns.visibleColumns.includes('status') && <col data-col-key="status" style={{ width: `${cols.getWidth('status')}px` }} />}
                                    {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                        borda de "Ações" não andar a cada redimensionamento. */}
                                    <col />
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                </colgroup>
                                {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader
                                    força uppercase internamente por padrão. */}
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                                checked={allVisibleSelected}
                                                disabled={selectableVisible.length === 0}
                                                onChange={toggleAllVisible}
                                                title="Selecionar todos (pagáveis)"
                                            />
                                        </th>
                                        {tableColumns.visibleColumns.includes('supplier') && (
                                            <SortableHeader
                                                label="Fornecedor / Documento"
                                                colKey="supplier"
                                                sortable={true}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-left px-6 py-2 border-r border-gray-100 overflow-hidden"
                                            >
                                                <cols.ResizeHandle colKey="supplier" />
                                            </SortableHeader>
                                        )}
                                        {tableColumns.visibleColumns.includes('origem') && (
                                            <SortableHeader
                                                label="Origem"
                                                colKey="origem"
                                                sortable={true}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-left px-6 py-2 border-r border-gray-100 overflow-hidden"
                                            >
                                                <cols.ResizeHandle colKey="origem" />
                                            </SortableHeader>
                                        )}
                                        {tableColumns.visibleColumns.includes('valor') && (
                                            <SortableHeader
                                                label="Valor"
                                                colKey="valor"
                                                sortable={true}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-right px-6 py-2 border-r border-gray-100 overflow-hidden"
                                            >
                                                <cols.ResizeHandle colKey="valor" />
                                            </SortableHeader>
                                        )}
                                        {tableColumns.visibleColumns.includes('vencimento') && (
                                            <SortableHeader
                                                label="Vencimento"
                                                colKey="vencimento"
                                                sortable={true}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-center px-6 py-2 border-r border-gray-100 overflow-hidden"
                                            >
                                                <cols.ResizeHandle colKey="vencimento" />
                                            </SortableHeader>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <SortableHeader
                                                label="Status"
                                                colKey="status"
                                                sortable={true}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                className="text-center px-6 py-2 border-r border-gray-100 overflow-hidden"
                                            >
                                                <cols.ResizeHandle colKey="status" />
                                            </SortableHeader>
                                        )}
                                        {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                        <th aria-hidden="true" className="border-r border-gray-100" />
                                        <th className="text-right px-6 py-2 relative overflow-hidden text-sm font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filtered.map((inv, idx) => {
                                        const dueDate = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00') : null;
                                        const overdue = isOverdue(inv);
                                        const fromBoleto = (inv.notes ?? '').includes('[boleto:');

                                        return (
                                            <tr key={inv.id} className={`hover:bg-blue-50/50 transition-colors ${selectedIds.has(inv.id) ? 'bg-blue-50/60' : overdue ? 'bg-red-50/30' : ''}`}>
                                                <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                                                    {isSelectable(inv) ? (
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedIds.has(inv.id)}
                                                            title="Dica: segure Shift e clique para selecionar um intervalo"
                                                            onChange={(e) => handleRowCheck(inv.id, idx, (e.nativeEvent as MouseEvent).shiftKey)}
                                                        />
                                                    ) : null}
                                                </td>
                                                {tableColumns.visibleColumns.includes('supplier') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <p className="text-sm font-normal text-gray-700 truncate max-w-xs">{inv.supplierName ?? '—'}</p>
                                                        <p className="text-xs text-gray-400 truncate max-w-xs">{inv.fileName}</p>
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('origem') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <span className={`text-sm font-normal ${fromBoleto ? 'text-indigo-700' : 'text-gray-500'}`}>
                                                            {fromBoleto ? 'Boleto' : 'Manual'}
                                                        </span>
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('valor') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                        <Money value={inv.amount} />
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('vencimento') && (
                                                    <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal ${overdue ? 'text-red-600' : 'text-gray-600'}`}>
                                                        {formatDateBR(inv.dueDate)}
                                                        {overdue && dueDate && (
                                                            <div className="text-xs text-red-500">
                                                                {Math.floor((today().getTime() - dueDate.getTime()) / 86400000)}d atraso
                                                            </div>
                                                        )}
                                                    </td>
                                                )}
                                                {tableColumns.visibleColumns.includes('status') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                        <StatusBadge inv={inv} />
                                                    </td>
                                                )}
                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                <td className="px-6 py-2.5">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        {/* Ver documento — botão-ícone padrão §9.2 (<ActionIconButton>) */}
                                                        {inv.filePath && (
                                                            <ActionIconButton
                                                                kind="view"
                                                                title="Ver documento"
                                                                icon={<ExternalLink className="w-4 h-4" />}
                                                                onClick={() => invoiceService.openInvoice(inv.filePath)}
                                                            />
                                                        )}

                                                        {/* Pagar via Asaas — só para invoices originados de boleto com linha digitável.
                                                            Link de texto, padrão §9/ui_ux_guia_unificado.md (mesmo tratamento do "Baixar"/"Emitir" de ContasReceberManager.tsx). */}
                                                        {!['paid', 'rejected'].includes(inv.status) && fromBoleto && inv.supplierOrganizationId && (
                                                            <button
                                                                onClick={() => setPagandoAsaas(inv)}
                                                                className="text-emerald-700 hover:text-emerald-800 text-sm font-medium p-1.5 hover:bg-emerald-50 rounded-[6px] transition-all flex items-center gap-1"
                                                                title="Pagar via Asaas"
                                                            >
                                                                <Landmark className="w-3.5 h-3.5" /> Pagar via Asaas
                                                            </button>
                                                        )}

                                                        {/* Marcar como pago — ação primária/frequente da linha (§8) */}
                                                        {!['paid', 'rejected'].includes(inv.status) && (
                                                            <button
                                                                onClick={() => handleMarcarPago(inv)}
                                                                disabled={marcandoPago === inv.id}
                                                                className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all disabled:opacity-50 flex items-center gap-1"
                                                                title="Marcar como pago"
                                                            >
                                                                {marcandoPago === inv.id ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <Check className="w-3.5 h-3.5" />
                                                                )}
                                                                Pago
                                                            </button>
                                                        )}
                                                        {inv.status === 'paid' && (
                                                            <span className="flex items-center gap-1 text-sm font-normal text-green-700">
                                                                <Check className="w-4 h-4" /> Quitado
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td colSpan={3} className="px-6 py-2 text-sm text-gray-500">
                                            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                                        </td>
                                        <td className="px-6 py-2 text-right text-sm font-medium text-gray-900">
                                            {formatMoney(filtered.filter(i => !['paid', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0))}
                                        </td>
                                        {/* colSpan 4: vencimento + status + espaçador + ações */}
                                        <td colSpan={4} className="px-6 py-2 text-sm text-gray-400 text-right">total a pagar (filtrado)</td>
                                    </tr>
                                </tfoot>
                            </table>
                            </div>
                        )}
                    </div>
                    </div>

            {/* Barra de ações em lote — fixa no rodapé, paleta azul (ui_ux_guia_unificado.md §10) */}
            {selectedVisible.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">· {formatMoney(selectedTotal)}</span>
                    </span>
                    <button
                        onClick={handleBulkPago}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] text-[13px] font-medium hover:bg-blue-50 disabled:opacity-60 transition-all active:scale-95"
                    >
                        {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Marcar como pago
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {pagandoAsaas && (() => {
                const boletoId = extractBoletoId(pagandoAsaas.notes);
                if (!boletoId || !pagandoAsaas.supplierOrganizationId) return null;
                return (
                    <PagarBoletoAsaasModal
                        organizationId={pagandoAsaas.supplierOrganizationId}
                        boletoId={boletoId}
                        supplierName={pagandoAsaas.supplierName}
                        amount={pagandoAsaas.amount}
                        dueDate={pagandoAsaas.dueDate}
                        onClose={() => setPagandoAsaas(null)}
                        onPaid={() => {
                            setPagandoAsaas(null);
                            notify('Pagamento enviado à Asaas. O status será atualizado automaticamente assim que o banco confirmar.');
                            carregar(effectiveOrgId);
                        }}
                    />
                );
            })()}

            {/* Toast de Notificação — padrão guia seção 13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
}
