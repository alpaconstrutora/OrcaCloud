import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Landmark, FileWarning, Scale, RefreshCw, Search, MoveHorizontal, ChevronDown,
    Plus, CheckCircle2, Undo2, RotateCcw, ArrowDownLeft, ArrowUpRight, Link2, AlertCircle,
} from 'lucide-react';
import { divergenceService } from '../services/divergenceService';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { useConfirm } from './ui/confirm';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import Button from './ui/Button';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { SYSTEM_PROJECT_NAMES_SQL } from '../utils/systemProjects';
import type {
    ReconciliationDivergences, BankWithoutInternal, InternalWithoutBank, ValueMismatch,
} from '../types/financial';

interface CreateForm {
    category: string;
    projectId: string;
    costCenterId: string;
    partyKey: string;   // `${type}:${id}` ou '' para sem contraparte
    description: string;
}

interface Party { id: string; name: string; type: 'CLIENT' | 'SUPPLIER' }

function sortValue<T>(row: T, key: string): unknown {
    return (row as unknown as Record<string, unknown>)[key];
}

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDate(d?: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
}
function DirIcon({ dir }: { dir: 'CREDIT' | 'DEBIT' }) {
    return dir === 'CREDIT'
        ? <ArrowDownLeft className="w-4 h-4 text-emerald-500 shrink-0" />
        : <ArrowUpRight className="w-4 h-4 text-red-500 shrink-0" />;
}

// Ação de linha em texto colorido — mesmo vocabulário do §9 ("Ver Detalhes"),
// aplicado a ações de domínio (Estornar/Reabrir/Conciliar…) sem ícone universal
// que caiba nos `kind` prontos de <ActionIconButton> (§9.2).
function RowActionText({ tone, icon: Icon, onClick, disabled, children }: {
    tone: 'blue' | 'gray' | 'red' | 'purple';
    icon: React.ElementType;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    const toneClasses: Record<string, string> = {
        blue: 'text-blue-600 hover:text-blue-800 hover:bg-blue-50',
        gray: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
        red: 'text-red-600 hover:text-red-800 hover:bg-red-50',
        purple: 'text-purple-600 hover:text-purple-800 hover:bg-purple-50',
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1 text-sm font-medium px-1.5 py-1 rounded-lg transition-all whitespace-nowrap disabled:opacity-50 ${toneClasses[tone]}`}
        >
            <Icon className="w-3.5 h-3.5" /> {children}
        </button>
    );
}

const BANK_COLUMNS: ColumnConfig[] = [
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'account_name', label: 'Conta', sortable: true },
    { key: 'transaction_date', label: 'Data', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
const BANK_COL_WIDTHS: Record<string, number> = { description: 280, account_name: 160, transaction_date: 110, amount: 130, actions: 220 };

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX (drag-and-drop estilo ClickUp, ver GUIA_TABLE_UTILS.md).
// 'actions' fica fora do mapa — continua fixa como última coluna (mesmo padrão de ClientList.tsx).
const BANK_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    description: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    account_name: { label: 'Conta', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    transaction_date: { label: 'Data', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    amount: { label: 'Valor', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

function renderBankCell(key: string, b: BankWithoutInternal): React.ReactNode {
    switch (key) {
        case 'description':
            return (
                <div className="flex items-center gap-2 min-w-0 text-gray-700">
                    <DirIcon dir={b.direction} />
                    <span className="truncate">{b.description}</span>
                </div>
            );
        case 'account_name':
            return b.account_name;
        case 'transaction_date':
            return formatDate(b.transaction_date);
        case 'amount':
            return <span className={`font-medium ${b.direction === 'CREDIT' ? 'text-emerald-700' : 'text-gray-800'}`}>{formatBRL(b.amount)}</span>;
        default:
            return null;
    }
}

const INTERNAL_COLUMNS: ColumnConfig[] = [
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'ref_date', label: 'Vencimento', sortable: true },
    { key: 'days_overdue', label: 'Atraso', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
const INTERNAL_COL_WIDTHS: Record<string, number> = { description: 280, ref_date: 120, days_overdue: 100, amount: 130, actions: 180 };

const INTERNAL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    description: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    ref_date: { label: 'Vencimento', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    days_overdue: { label: 'Atraso', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    amount: { label: 'Valor', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

function renderInternalCell(key: string, i: InternalWithoutBank): React.ReactNode {
    switch (key) {
        case 'description':
            return (
                <div className="flex items-center gap-2 min-w-0 text-gray-700">
                    <DirIcon dir={i.direction} />
                    <span className="truncate">{i.description || i.party_name || 'Lançamento'}</span>
                </div>
            );
        case 'ref_date':
            return formatDate(i.ref_date);
        case 'days_overdue':
            return <span className={i.days_overdue > 0 ? 'text-red-600' : 'text-gray-400'}>{i.days_overdue > 0 ? `${i.days_overdue}d` : '—'}</span>;
        case 'amount':
            return <span className={`font-medium ${i.direction === 'CREDIT' ? 'text-emerald-700' : 'text-gray-800'}`}>{formatBRL(i.amount)}</span>;
        default:
            return null;
    }
}

const MISMATCH_COLUMNS: ColumnConfig[] = [
    { key: 'bank_description', label: 'Descrição', sortable: true },
    { key: 'account_name', label: 'Conta', sortable: true },
    { key: 'internal_amount', label: 'Sistema', sortable: true },
    { key: 'bank_amount', label: 'Banco', sortable: true },
    { key: 'difference', label: 'Diferença', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
const MISMATCH_COL_WIDTHS: Record<string, number> = { bank_description: 260, account_name: 150, internal_amount: 120, bank_amount: 120, difference: 120, actions: 190 };

const MISMATCH_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    bank_description: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    account_name: { label: 'Conta', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    internal_amount: { label: 'Sistema', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    bank_amount: { label: 'Banco', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    difference: { label: 'Diferença', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

function renderMismatchCell(key: string, m: ValueMismatch): React.ReactNode {
    switch (key) {
        case 'bank_description':
            return (
                <div className="flex items-center gap-2 min-w-0 text-gray-700">
                    <DirIcon dir={m.direction} />
                    <span className="truncate">{m.bank_description}</span>
                </div>
            );
        case 'account_name':
            return m.account_name;
        case 'internal_amount':
            return <span className="font-medium text-gray-800">{formatBRL(m.internal_amount)}</span>;
        case 'bank_amount':
            return <span className="font-medium text-gray-800">{formatBRL(m.bank_amount)}</span>;
        case 'difference':
            return <span className="font-medium text-purple-600">Δ {formatBRL(Math.abs(m.difference))}</span>;
        default:
            return null;
    }
}

// Cromo compartilhado pelas 3 seções (cabeçalho colapsável + toolbar acoplada,
// §5.2). Cada chamador passa a própria <table> já filtrada/ordenada.
interface TableCardProps {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    accentBg: string;
    accentText: string;
    count: number;
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder: string;
    columns: ColumnConfig[];
    tableColumns: ReturnType<typeof useTableColumns>;
    cols: ReturnType<typeof useResizableColumns>;
    loading: boolean;
    emptyLabel: string;
    children: React.ReactNode;
}
function TableCard({
    title, subtitle, icon: Icon, accentBg, accentText, count,
    searchValue, onSearchChange, searchPlaceholder,
    columns, tableColumns, cols, loading, emptyLabel, children,
}: TableCardProps) {
    const [open, setOpen] = useState(true);
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                <div className={`w-9 h-9 rounded-[6px] flex items-center justify-center flex-shrink-0 ${accentBg} ${accentText}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
                </div>
                <span className={`text-sm font-semibold ${count > 0 ? accentText : 'text-gray-300'}`}>{count}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="border-t border-gray-100">
                    <div className="p-3 border-b border-gray-100 flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchValue}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={columns.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                        </div>
                    ) : count === 0 ? (
                        <div className="text-center py-10">
                            <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <h3 className="text-sm font-bold text-gray-900 mb-1">{emptyLabel}</h3>
                            <p className="text-xs text-gray-500">Nenhum item deste tipo no momento.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[420px]">{children}</div>
                    )}
                </div>
            )}
        </div>
    );
}

interface DivergencesPanelProps {
    organizationId: string | null;
    onChanged?: () => void;
}

const DivergencesPanel: React.FC<DivergencesPanelProps> = ({ organizationId, onChanged }) => {
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const [data, setData] = useState<ReconciliationDivergences | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    // Opções de classificação para o modal "Criar lançamento"
    const [categories, setCategories] = useState<string[]>([]);
    const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
    const [costCenters, setCostCenters] = useState<Array<{ id: string; name: string }>>([]);
    const [clients, setClients] = useState<Party[]>([]);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    const [formBank, setFormBank] = useState<BankWithoutInternal | null>(null);
    const [form, setForm] = useState<CreateForm>({ category: '', projectId: '', costCenterId: '', partyKey: '', description: '' });

    const [bankSearch, setBankSearch] = usePersistedState<string>('divergences:bankSearch', '');
    const [internalSearch, setInternalSearch] = usePersistedState<string>('divergences:internalSearch', '');
    const [mismatchSearch, setMismatchSearch] = usePersistedState<string>('divergences:mismatchSearch', '');

    const bankTableColumns = useTableColumns(BANK_COLUMNS, 'divergencesBankColumns');
    const internalTableColumns = useTableColumns(INTERNAL_COLUMNS, 'divergencesInternalColumns');
    const mismatchTableColumns = useTableColumns(MISMATCH_COLUMNS, 'divergencesMismatchColumns');

    const bankCols = useResizableColumns(BANK_COL_WIDTHS, 'divergencesBankColWidths');
    const internalCols = useResizableColumns(INTERNAL_COL_WIDTHS, 'divergencesInternalColWidths');
    const mismatchCols = useResizableColumns(MISMATCH_COL_WIDTHS, 'divergencesMismatchColWidths');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await divergenceService.getDivergences(organizationId));
        } catch (e) {
            console.error('[DivergencesPanel]', e);
            showToast('Erro ao carregar divergências', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, showToast]);

    const loadOptions = useCallback(async () => {
        try {
            const orgOrNull = organizationId
                ? `organization_id.eq.${organizationId},organization_id.is.null`
                : undefined;
            let projectsQuery = supabase.from('projects').select('id, name')
                .not('name', 'in', SYSTEM_PROJECT_NAMES_SQL) // utils/systemProjects.ts
                .order('name', { ascending: true });
            if (organizationId) projectsQuery = projectsQuery.filter('settings->>organizationId', 'eq', organizationId);

            let costCentersQuery = supabase.from('cost_centers_v2').select('id, name').order('code', { ascending: true });
            if (organizationId) costCentersQuery = costCentersQuery.eq('organization_id', organizationId);

            let clientsQuery = supabase.from('clients').select('id, name').order('name', { ascending: true });
            if (orgOrNull) clientsQuery = clientsQuery.or(orgOrNull);

            let suppliersQuery = supabase.from('suppliers').select('id, name').order('name', { ascending: true });
            if (orgOrNull) suppliersQuery = suppliersQuery.or(orgOrNull);

            const [cats, projs, ccs, cls, sups] = await Promise.all([
                supabase.from('financial_categories').select('name').order('name', { ascending: true }),
                projectsQuery,
                costCentersQuery,
                clientsQuery,
                suppliersQuery,
            ]);
            if (cats.data) setCategories(cats.data.map(c => c.name).filter(Boolean));
            if (projs.data) setProjects(Array.from(new Map(projs.data.map(p => [p.name, p])).values()));
            if (ccs.data) setCostCenters(ccs.data);
            if (cls.data) setClients(cls.data.map(c => ({ id: c.id, name: c.name, type: 'CLIENT' as const })));
            if (sups.data) setSuppliers(sups.data.map(s => ({ id: s.id, name: s.name, type: 'SUPPLIER' as const })));
        } catch (e) {
            console.error('[DivergencesPanel] loadOptions', e);
        }
    }, [organizationId]);

    useEffect(() => { load(); loadOptions(); }, [load, loadOptions]);

    const run = async (key: string, fn: () => Promise<void>, okMsg: string) => {
        setBusyId(key);
        try {
            await fn();
            showToast(okMsg, 'success');
            await load();
            onChanged?.();
        } catch (e) {
            console.error('[DivergencesPanel] action', e);
            showToast('Erro ao executar ação', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const openCreateModal = (b: BankWithoutInternal) => {
        setFormBank(b);
        setForm({
            category: b.category || '',
            projectId: '',
            costCenterId: '',
            partyKey: '',
            description: b.description || '',
        });
    };

    const submitCreate = async () => {
        if (!formBank) return;
        const bank = formBank;
        // Resolve contraparte a partir do partyKey `${type}:${id}`
        let party: Party | undefined;
        if (form.partyKey) {
            const [type, id] = form.partyKey.split(':');
            const pool = type === 'CLIENT' ? clients : suppliers;
            party = pool.find(p => p.id === id);
        }
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        setFormBank(null);
        await run(bank.id, () => divergenceService.createInternalAndMatch(organizationId, bank, {
            category: form.category || undefined,
            project_id: form.projectId || null,
            cost_center_id: form.costCenterId || null,
            party_id: party?.id || null,
            party_name: party?.name || null,
            party_type: party?.type || null,
            description: form.description || undefined,
        }), 'Lançamento criado e conciliado');
    };

    // Contrapartes priorizadas pela direção: CREDIT→clientes, DEBIT→fornecedores
    const partyPrimary = formBank?.direction === 'CREDIT' ? clients : suppliers;
    const partySecondary = formBank?.direction === 'CREDIT' ? suppliers : clients;
    const partyPrimaryLabel = formBank?.direction === 'CREDIT' ? 'Clientes' : 'Fornecedores';
    const partySecondaryLabel = formBank?.direction === 'CREDIT' ? 'Fornecedores' : 'Clientes';

    const onConfirmNoTitle = async (b: BankWithoutInternal) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Confirmar sem título?',
            message: 'O movimento será marcado como conciliado sem gerar lançamento (use para tarifas/impostos já contabilizados).',
            confirmLabel: 'Confirmar',
        })) return;
        run(b.id, () => divergenceService.confirmWithoutTitle(organizationId, b.id), 'Movimento confirmado');
    };

    const onReverse = async (i: InternalWithoutBank) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Estornar título?',
            message: 'O lançamento será cancelado. Esta ação fica registrada na auditoria.',
            variant: 'warning', confirmLabel: 'Estornar',
        })) return;
        run(i.id, () => divergenceService.reverseInternal(organizationId, i.id), 'Título estornado');
    };

    const onReopen = (i: InternalWithoutBank) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        run(i.id, () => divergenceService.reopenInternal(organizationId, i.id), 'Título reaberto');
    };

    const onReconcileDiff = async (m: ValueMismatch) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Conciliar com diferença?',
            message: `Será criado o vínculo e um lançamento de ajuste de ${formatBRL(Math.abs(m.difference))} (tarifa/juros/desconto).`,
            confirmLabel: 'Conciliar',
        })) return;
        run(m.bank_id, () => divergenceService.reconcileWithDifference(organizationId, m), 'Conciliado com ajuste');
    };

    const c = data?.counts ?? { bank_without_internal: 0, internal_without_bank: 0, value_mismatch: 0 };

    // Filtro (client-side, listas curtas) + ordenação pela coluna clicada.
    const bankRows = useMemo(() => {
        const term = bankSearch.trim().toLowerCase();
        const rows = (data?.bank_without_internal ?? []).filter(b =>
            !term || `${b.description} ${b.account_name}`.toLowerCase().includes(term));
        const key = bankTableColumns.sortColumn;
        if (!key) return rows;
        const dir = bankTableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = sortValue(a, key); const bv = sortValue(b, key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
    }, [data?.bank_without_internal, bankSearch, bankTableColumns.sortColumn, bankTableColumns.sortDirection]);

    const internalRows = useMemo(() => {
        const term = internalSearch.trim().toLowerCase();
        const rows = (data?.internal_without_bank ?? []).filter(i =>
            !term || `${i.description ?? ''} ${i.party_name ?? ''}`.toLowerCase().includes(term));
        const key = internalTableColumns.sortColumn;
        if (!key) return rows;
        const dir = internalTableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = sortValue(a, key); const bv = sortValue(b, key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
    }, [data?.internal_without_bank, internalSearch, internalTableColumns.sortColumn, internalTableColumns.sortDirection]);

    const mismatchRows = useMemo(() => {
        const term = mismatchSearch.trim().toLowerCase();
        const rows = (data?.value_mismatch ?? []).filter(m =>
            !term || `${m.bank_description} ${m.account_name}`.toLowerCase().includes(term));
        const key = mismatchTableColumns.sortColumn;
        if (!key) return rows;
        const dir = mismatchTableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = sortValue(a, key); const bv = sortValue(b, key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
    }, [data?.value_mismatch, mismatchSearch, mismatchTableColumns.sortColumn, mismatchTableColumns.sortDirection]);

    const bankVisible = bankTableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
    const bankTableWidth = bankVisible.reduce((s, key) => s + bankCols.getWidth(key), 0) + bankCols.getWidth('actions');

    const internalVisible = internalTableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
    const internalTableWidth = internalVisible.reduce((s, key) => s + internalCols.getWidth(key), 0) + internalCols.getWidth('actions');

    const mismatchVisible = mismatchTableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
    const mismatchTableWidth = mismatchVisible.reduce((s, key) => s + mismatchCols.getWidth(key), 0) + mismatchCols.getWidth('actions');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">Situações que exigem decisão manual — nada é alterado automaticamente.</p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label="Movimento sem lançamento" value={c.bank_without_internal} icon={<Landmark className="w-5 h-5" />} color="blue" />
                <KpiCard label="Título sem movimento" value={c.internal_without_bank} icon={<FileWarning className="w-5 h-5" />} color="amber" />
                <KpiCard label="Diferença de valor" value={c.value_mismatch} icon={<Scale className="w-5 h-5" />} color="purple" />
            </div>

            {/* Tipo 1 — Movimento bancário sem lançamento */}
            <TableCard
                title="Movimento bancário sem lançamento"
                subtitle="Aparece no extrato mas não existe no sistema"
                icon={Landmark}
                accentBg="bg-blue-50" accentText="text-blue-600"
                count={c.bank_without_internal}
                searchValue={bankSearch} onSearchChange={setBankSearch}
                searchPlaceholder="Buscar por descrição ou conta..."
                columns={BANK_COLUMNS} tableColumns={bankTableColumns} cols={bankCols}
                loading={loading} emptyLabel="Nenhuma divergência deste tipo"
            >
                <table ref={bankCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: bankTableWidth }}>
                    <colgroup>
                        {bankVisible.map(key => <col key={key} data-col-key={key} style={{ width: `${bankCols.getWidth(key)}px` }} />)}
                        <col />
                        <col data-col-key="actions" style={{ width: `${bankCols.getWidth('actions')}px` }} />
                    </colgroup>
                    <thead>
                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {bankVisible.map(key => {
                                const def = BANK_COLUMN_HEADERS[key];
                                if (!def) return null;
                                return (
                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                        sortColumn={bankTableColumns.sortColumn} sortDirection={bankTableColumns.sortDirection} onSort={bankTableColumns.handleColumnSort}
                                        onMoveColumn={bankTableColumns.moveColumn}
                                        className={def.className}>
                                        <bankCols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                );
                            })}
                            <th aria-hidden="true" className="border-r border-gray-100" />
                            {bankTableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {bankRows.map(b => (
                            <tr key={b.id} className="hover:bg-blue-50/50 transition-colors">
                                {bankVisible.map(key => (
                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                        {renderBankCell(key, b)}
                                    </td>
                                ))}
                                <td aria-hidden="true"></td>
                                {bankTableColumns.visibleColumns.includes('actions') && (
                                    <td className="px-6 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <RowActionText tone="blue" icon={Plus} onClick={() => openCreateModal(b)} disabled={busyId === b.id}>Criar lançamento</RowActionText>
                                            <RowActionText tone="gray" icon={CheckCircle2} onClick={() => onConfirmNoTitle(b)} disabled={busyId === b.id}>Sem título</RowActionText>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableCard>

            {/* Tipo 2 — Lançamento sem movimento bancário */}
            <TableCard
                title="Título sem movimento bancário"
                subtitle="Lançamento pendente/vencido que nunca apareceu no extrato"
                icon={FileWarning}
                accentBg="bg-amber-50" accentText="text-amber-600"
                count={c.internal_without_bank}
                searchValue={internalSearch} onSearchChange={setInternalSearch}
                searchPlaceholder="Buscar por descrição ou contraparte..."
                columns={INTERNAL_COLUMNS} tableColumns={internalTableColumns} cols={internalCols}
                loading={loading} emptyLabel="Nenhuma divergência deste tipo"
            >
                <table ref={internalCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: internalTableWidth }}>
                    <colgroup>
                        {internalVisible.map(key => <col key={key} data-col-key={key} style={{ width: `${internalCols.getWidth(key)}px` }} />)}
                        <col />
                        <col data-col-key="actions" style={{ width: `${internalCols.getWidth('actions')}px` }} />
                    </colgroup>
                    <thead>
                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {internalVisible.map(key => {
                                const def = INTERNAL_COLUMN_HEADERS[key];
                                if (!def) return null;
                                return (
                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                        sortColumn={internalTableColumns.sortColumn} sortDirection={internalTableColumns.sortDirection} onSort={internalTableColumns.handleColumnSort}
                                        onMoveColumn={internalTableColumns.moveColumn}
                                        className={def.className}>
                                        <internalCols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                );
                            })}
                            <th aria-hidden="true" className="border-r border-gray-100" />
                            {internalTableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {internalRows.map(i => (
                            <tr key={i.id} className="hover:bg-blue-50/50 transition-colors">
                                {internalVisible.map(key => (
                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                        {renderInternalCell(key, i)}
                                    </td>
                                ))}
                                <td aria-hidden="true"></td>
                                {internalTableColumns.visibleColumns.includes('actions') && (
                                    <td className="px-6 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <RowActionText tone="red" icon={Undo2} onClick={() => onReverse(i)} disabled={busyId === i.id}>Estornar</RowActionText>
                                            <RowActionText tone="gray" icon={RotateCcw} onClick={() => onReopen(i)} disabled={busyId === i.id}>Reabrir</RowActionText>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableCard>

            {/* Tipo 3 — Diferença de valor */}
            <TableCard
                title="Diferença de valor"
                subtitle="Mesmo título com valor divergente (tarifa, juros ou desconto)"
                icon={Scale}
                accentBg="bg-purple-50" accentText="text-purple-600"
                count={c.value_mismatch}
                searchValue={mismatchSearch} onSearchChange={setMismatchSearch}
                searchPlaceholder="Buscar por descrição ou conta..."
                columns={MISMATCH_COLUMNS} tableColumns={mismatchTableColumns} cols={mismatchCols}
                loading={loading} emptyLabel="Nenhuma divergência deste tipo"
            >
                <table ref={mismatchCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: mismatchTableWidth }}>
                    <colgroup>
                        {mismatchVisible.map(key => <col key={key} data-col-key={key} style={{ width: `${mismatchCols.getWidth(key)}px` }} />)}
                        <col />
                        <col data-col-key="actions" style={{ width: `${mismatchCols.getWidth('actions')}px` }} />
                    </colgroup>
                    <thead>
                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {mismatchVisible.map(key => {
                                const def = MISMATCH_COLUMN_HEADERS[key];
                                if (!def) return null;
                                return (
                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                        sortColumn={mismatchTableColumns.sortColumn} sortDirection={mismatchTableColumns.sortDirection} onSort={mismatchTableColumns.handleColumnSort}
                                        onMoveColumn={mismatchTableColumns.moveColumn}
                                        className={def.className}>
                                        <mismatchCols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                );
                            })}
                            <th aria-hidden="true" className="border-r border-gray-100" />
                            {mismatchTableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {mismatchRows.map(m => (
                            <tr key={m.bank_id} className="hover:bg-blue-50/50 transition-colors">
                                {mismatchVisible.map(key => (
                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                        {renderMismatchCell(key, m)}
                                    </td>
                                ))}
                                <td aria-hidden="true"></td>
                                {mismatchTableColumns.visibleColumns.includes('actions') && (
                                    <td className="px-6 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <RowActionText tone="purple" icon={Link2} onClick={() => onReconcileDiff(m)} disabled={busyId === m.bank_id}>Conciliar com diferença</RowActionText>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableCard>

            {/* Modal: classificar lançamento antes de criar */}
            <Modal open={!!formBank} onClose={() => setFormBank(null)} size="md" dismissable={false}>
                <ModalHeader
                    title="Criar lançamento"
                    description="Classifique o lançamento que será gerado e conciliado com o movimento bancário."
                    icon={<div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Plus className="w-5 h-5 text-blue-600" /></div>}
                    onClose={() => setFormBank(null)}
                />
                <ModalBody className="space-y-4">
                    {formBank && (
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{formBank.description}</p>
                                <p className="text-xs text-gray-400 font-medium">{formBank.account_name} · {formatDate(formBank.transaction_date)}</p>
                            </div>
                            <span className={`tabular-nums font-black text-sm ${formBank.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatBRL(formBank.amount)}
                            </span>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Categoria</label>
                        <input
                            list="divergence-categories"
                            value={form.category}
                            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                            placeholder="Geral"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="divergence-categories">
                            {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Obra / Projeto</label>
                        <select
                            value={form.projectId}
                            onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">— Sem obra —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Centro de Custo</label>
                            <select
                                value={form.costCenterId}
                                onChange={e => setForm(f => ({ ...f, costCenterId: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">— Sem CC —</option>
                                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Contraparte</label>
                            <select
                                value={form.partyKey}
                                onChange={e => setForm(f => ({ ...f, partyKey: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">— Sem contraparte —</option>
                                {partyPrimary.length > 0 && (
                                    <optgroup label={partyPrimaryLabel}>
                                        {partyPrimary.map(p => <option key={p.type + p.id} value={`${p.type}:${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                                {partySecondary.length > 0 && (
                                    <optgroup label={partySecondaryLabel}>
                                        {partySecondary.map(p => <option key={p.type + p.id} value={`${p.type}:${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição</label>
                        <input
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <button
                        onClick={() => setFormBank(null)}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100"
                    >
                        Cancelar
                    </button>
                    <Button onClick={submitCreate}>
                        <Plus className="w-4 h-4" /> Criar e conciliar
                    </Button>
                </ModalFooter>
            </Modal>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default DivergencesPanel;
