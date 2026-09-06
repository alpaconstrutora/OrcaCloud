import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Upload, Search, CheckCircle2, AlertCircle,
    ArrowRightLeft, FileText, Download, Trash2, Check,
    Plus, Calendar, DollarSign, Briefcase, RefreshCw,
    Zap, ShieldCheck, Settings2, Info, ArrowUpDown, X, Tag,
    LayoutGrid, List, Users, UserPlus, ExternalLink, Rows3, Pencil, MoveHorizontal, EyeOff, Brain
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import RulesTab, { RuleFormModal } from './reconciliation/RulesTab';
import CategoriesTab from './reconciliation/CategoriesTab';
import { LazySelect, type LazyOption } from './reconciliation/LazySelect';
import ConciliatedTab from './reconciliation/ConciliatedTab';
import {
    BankTransaction,
    InternalTransaction,
    PaymentAccount,
    BankTransactionStatus,
    Supplier
} from '../types';
import { bankReconciliationService } from '../services/bankReconciliationService';
import { reconciliationMemoryService, type ClassificationInput } from '../services/reconciliationMemoryService';
import { clientService } from '../services/clientService';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import { supabase } from '../lib/supabase';
import { financialSyncService } from '../services/financialSyncService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { financialRegistryService } from '../services/financialRegistryService';
import { useStore } from '../store/useStore';
import { useConfirm } from './ui/confirm';
import { formatMoney, formatDateBR } from './ui/Format';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { KpiCard } from './ui/KpiCard';
import ReconciliationDashboardView from './ReconciliationDashboard';
import DivergencesPanel from './DivergencesPanel';
import FinancialClosePanel from './FinancialClosePanel';
import AnomaliesPanel from './AnomaliesPanel';
import SmartReconciliationCenter from './SmartReconciliationCenter';
import ProlaboreReconciliationPanel from './ProlaboreReconciliationPanel';
import BankTxEdicaoEmLoteModal from './BankTxEdicaoEmLoteModal';
import BankStatementImportDrawer, { type CompletudeDaConta } from './BankStatementImportDrawer';
import { SYSTEM_PROJECT_NAMES_SQL } from '../utils/systemProjects';
import { originIdFromRef } from '../lib/receivableRef';
// O PostgREST devolve no máximo 1000 linhas por requisição; `.limit(N)` fixo vira teto
// silencioso (a tela sumia com janeiro–junho de uma conta movimentada). Paginamos até esgotar.
import { fetchAllPages } from '../lib/supabasePaginate';

type ReconciliationView = 'dashboard' | 'center' | 'divergences' | 'anomalies' | 'statement' | 'pending' | 'conciliated' | 'rules' | 'categories' | 'close' | 'prolabore';

// Título/subtítulo de tela por aba — guia §20 (toda tela com título tem que TER um título).
const VIEW_HEADERS: Record<ReconciliationView, { title: string; subtitle: string }> = {
    dashboard: { title: 'Conciliação Bancária', subtitle: 'Visão geral da automação e saúde da conciliação.' },
    statement: { title: 'Extrato Bancário', subtitle: 'Lançamentos importados do banco, prontos para categorizar e conciliar.' },
    center: { title: 'Central de Conciliação', subtitle: 'Vincule manualmente extrato bancário e lançamentos internos.' },
    divergences: { title: 'Divergências', subtitle: 'Diferenças entre extrato bancário e lançamentos internos.' },
    anomalies: { title: 'Anomalias', subtitle: 'Padrões incomuns identificados na conciliação.' },
    pending: { title: 'Pendentes', subtitle: 'Extrato bancário e lançamentos internos aguardando conciliação.' },
    conciliated: { title: 'Conciliados', subtitle: 'Vínculos já confirmados entre extrato e lançamentos internos.' },
    rules: { title: 'Regras de Automação', subtitle: 'Critérios que conciliam lançamentos automaticamente.' },
    categories: { title: 'Categorias', subtitle: 'Categorias usadas para classificar lançamentos.' },
    close: { title: 'Fechamento Financeiro', subtitle: 'Feche o período após a conciliação estar completa.' },
    prolabore: { title: 'Pró-labore', subtitle: 'Lançamentos categorizados como Pró-labore no extrato — aprove, feche o mês e envie o total ao RH.' },
};

interface BankReconciliationProps {
    organizationId: string;
    /** Aba a exibir ao entrar pela rota (ex.: 'statement' via menu "Extrato Bancário",
     *  'dashboard' via menu "Conciliação Bancária"). Sem isso, os dois itens do menu
     *  caem sempre na última aba visitada (persistida em localStorage) e parecem a
     *  mesma tela. */
    defaultView?: ReconciliationView;
}

import {
    BankSortField,
    DEFAULT_PENDING_BANK_COL_WIDTHS,
    DEFAULT_PENDING_INTERNAL_COL_WIDTHS,
    DEFAULT_STATEMENT_COL_WIDTHS,
    InternalSortField,
    PENDING_BANK_COLUMNS,
    PENDING_BANK_COLUMN_HEADERS,
    PENDING_BANK_TD_META,
    PENDING_INTERNAL_COLUMNS,
    PENDING_INTERNAL_COLUMN_HEADERS,
    PENDING_INTERNAL_TD_CLASS,
    PendingBankRowCtx,
    PendingInternalRowCtx,
    STATEMENT_COLUMNS,
    STATEMENT_COLUMN_HEADERS,
    STATEMENT_FILTER_FIELDS,
    STATEMENT_STATUS_COLORS,
    STATEMENT_STATUS_LABELS,
    STATEMENT_TD_CLASS,
    StatementRowCtx,
    getBankTxFilterValue,
    isStatementColumnVisibleForFlow,
    renderPendingBankCell,
    renderPendingInternalCell,
    renderStatementCell,
} from './reconciliation/tabelasDaConciliacao';

const BankReconciliation: React.FC<BankReconciliationProps> = ({ organizationId, defaultView }) => {
    const confirm = useConfirm();
    const navigateToFocus = useStore(s => s.navigateToFocus);
    const categoriesLoadedForOrg = useRef<string | null>(null);
    const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
    const [selectedBankTxIds, setSelectedBankTxIds] = useState<Set<string>>(new Set());
    // Âncora do Shift+clique no Extrato (guia §10.1) — só avança em clique sem Shift.
    const [lastCheckedStatementIndex, setLastCheckedStatementIndex] = useState<number | null>(null);
    const handleStatementRowCheck = (id: string, index: number, checked: boolean, shiftKey: boolean) => {
        if (shiftKey && lastCheckedStatementIndex !== null) {
            const [start, end] = lastCheckedStatementIndex < index ? [lastCheckedStatementIndex, index] : [index, lastCheckedStatementIndex];
            const rangeIds = sortedBankTransactions.slice(start, end + 1).map(tx => tx.id);
            setSelectedBankTxIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            setSelectedBankTxIds(prev => {
                const next = new Set(prev);
                if (checked) next.add(id); else next.delete(id);
                return next;
            });
            setLastCheckedStatementIndex(index);
        }
    };
    const [selectedInternalTxIds, setSelectedInternalTxIds] = useState<Set<string>>(new Set());
    const [isLoteEditOpen, setIsLoteEditOpen] = useState(false);
    const [showImportDrawer, setShowImportDrawer] = useState(false);
    const [completudeDaConta, setCompletudeDaConta] = useState<CompletudeDaConta | null>(null);
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
    const [internalTransactions, setInternalTransactions] = useState<InternalTransaction[]>([]);
    // Tipos locais para dados do Supabase
    type ReconciliationSuggestion = {
        id: string;
        bank_transaction_id: string;
        candidate_internal_transaction_id: string | null;
        confidence: number;
        candidate_internal_transaction?: InternalTransaction | null;
        [key: string]: unknown;
    };
    type ReconciliationMatch = {
        id: string;
        bank_transaction_id: string;
        internal_transaction_id: string;
        created_at: string;
        bank_transaction?: BankTransaction | null;
        internal_transaction?: InternalTransaction | null;
        [key: string]: unknown;
    };
    type ReconciliationRule = {
        id: string;
        name: string;
        priority: number;
        is_active: boolean;
        organization_id: string;
        conditions: { type: string; field: string; value: string };
        actions: { category: string; counterparty?: string };
        created_at?: string;
        [key: string]: unknown;
    };
    type AuditLogEntry = {
        id: string;
        organization_id: string;
        // A coluna chama `event_type`, não `action`. O select pedia `action`, a tabela
        // devolvia 42703 e o catch engolia: a "Trilha de Auditoria Recente" nunca apareceu,
        // porque `auditLogs` ficava vazio e o bloco só renderiza com `length > 0`.
        // Achado em 06/09/2026 varrendo as abas com a rede escutada.
        event_type: string;
        payload?: unknown;
        created_at: string;
        [key: string]: unknown;
    };
    type CommercialMatch = {
        id: string;
        description: string;
        amount: number;
        transaction_date: string;
        status: string;
        type: string;
        category: string;
        isCommercial: boolean;
        project_id: string;
        original_id: string;
        projectName: string;
        direction?: string;
        entity_name?: string;
        organization_id?: string;
        source_system?: string;
        [key: string]: unknown;
    };

    const [suggestions, setSuggestions] = useState<ReconciliationSuggestion[]>([]);
    const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [activeView, setActiveView] = useState<ReconciliationView>(
        defaultView || (localStorage.getItem('reconciliation_active_tab') as ReconciliationView) || 'dashboard'
    );

    // Ao navegar pelo menu (ex.: "Extrato Bancário" ↔ "Conciliação Bancária"), força a
    // aba correspondente — sem isso, os dois itens caem sempre na última aba visitada.
    useEffect(() => {
        if (defaultView) setActiveView(defaultView);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultView]);

    // Precisa vir antes de statementTableTotalWidth — ele usa flowFilter no cálculo
    // (colunas Cliente/Credor ficam de fora da soma quando ocultadas pelo filtro).
    const [flowFilter, setFlowFilter] = usePersistedState<'ALL' | 'INCOME' | 'EXPENSE'>('extratoBancario:flowFilter', 'ALL');
    const tableColumns = useTableColumns(STATEMENT_COLUMNS, 'extratoBancarioColumns');
    const statementAdvancedFilters = useAdvancedFilters(STATEMENT_FILTER_FIELDS, 'extratoBancario:advancedFilters');
    const pendingBankColumns = useTableColumns(PENDING_BANK_COLUMNS, 'conciliacaoPendentesBankColumns');
    const pendingInternalColumns = useTableColumns(PENDING_INTERNAL_COLUMNS, 'conciliacaoPendentesInternalColumns');
    const pendingBankResize = useResizableColumns(DEFAULT_PENDING_BANK_COL_WIDTHS, 'conciliacaoPendentesBankColWidths');
    const pendingInternalResize = useResizableColumns(DEFAULT_PENDING_INTERNAL_COL_WIDTHS, 'conciliacaoPendentesInternalColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1).
    const pendingBankTableTotalWidth = 40
        + PENDING_BANK_COLUMNS.filter(c => c.key !== 'actions')
            .reduce((sum, c) => sum + (pendingBankColumns.visibleColumns.includes(c.key) ? pendingBankResize.getWidth(c.key) : 0), 0)
        + pendingBankResize.getWidth('actions');
    const pendingInternalTableTotalWidth = 40
        + PENDING_INTERNAL_COLUMNS.filter(c => c.key !== 'actions')
            .reduce((sum, c) => sum + (pendingInternalColumns.visibleColumns.includes(c.key) ? pendingInternalResize.getWidth(c.key) : 0), 0)
        + pendingInternalResize.getWidth('actions');

    // Redimensionamento de colunas da tabela de Extrato — migrado para o hook
    // compartilhado em 2026-07-27 (mesma localStorage key 'extratoBancarioColWidths'
    // do mecanismo próprio anterior, formato idêntico Record<string,number>, então
    // larguras já salvas pelos usuários continuam válidas). Ganha de graça o que o
    // mecanismo próprio não tinha: minWidth 100%, "Ações" redimensionável, e o
    // espaçador ANTES de "Ações" (§6.1.1) — sem ele a borda de "Ações" andaria a
    // cada redimensionamento, como já corrigido em Clientes/Fornecedores/etc.
    const statementResize = useResizableColumns(DEFAULT_STATEMENT_COL_WIDTHS, 'extratoBancarioColWidths');
    // Largura explícita da tabela = soma das colunas visíveis. NUNCA w-full com
    // table-layout:fixed, senão o navegador redistribui espaço entre colunas ao
    // arrastar (bug real documentado em ui_ux_guia_unificado.md §6.1).
    const statementTableTotalWidth = 40 // checkbox
        + STATEMENT_COLUMNS.filter(c => c.key !== 'actions')
            .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) && isStatementColumnVisibleForFlow(c.key, flowFilter) ? statementResize.getWidth(c.key) : 0), 0)
        + statementResize.getWidth('actions');

    const [rulesViewMode, setRulesViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('reconciliation_rules_view_mode') as 'grid' | 'list') || 'list'
    );
    const [categoriesViewMode, setCategoriesViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('reconciliation_categories_view_mode') as 'grid' | 'list') || 'grid'
    );
    const [conciliatedViewMode, setConciliatedViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('reconciliation_conciliated_view_mode') as 'grid' | 'list') || 'list'
    );
    const [pendentesViewMode, setPendentesViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('reconciliation_pendentes_view_mode') as 'grid' | 'list') || 'list'
    );
    const [pendentesCompact, setPendentesCompact] = useState<boolean>(
        localStorage.getItem('reconciliation_pendentes_compact') === 'true'
    );
    const [isImporting, setIsImporting] = useState(false);
    const [rules, setRules] = useState<ReconciliationRule[]>([]);
    const [masterSuppliers, setMasterSuppliers] = useState<string[]>([]);
    const [supplierNameById, setSupplierNameById] = useState<Record<string, string>>({});
    // Rótulo de exibição (apelido/razão social) por nome cadastral — nome (masterSuppliers)
    // continua sendo a CHAVE de matching usada pelas regras de conciliação; só o label muda.
    const [supplierDisplayByName, setSupplierDisplayByName] = useState<Record<string, string>>({});
    const [masterClients, setMasterClients] = useState<string[]>([]);
    const [clientNameById, setClientNameById] = useState<Record<string, string>>({});
    const [masterEmployees, setMasterEmployees] = useState<string[]>([]);
    const [masterProjects, setMasterProjects] = useState<Array<{ id: string; name: string }>>([]);
    const [masterCostCenters, setMasterCostCenters] = useState<Array<{ id: string; name: string }>>([]);
    // Código de origem por lançamento (ex: nº do boleto 0188) — keyed por internal_transaction.id
    const [originCodes, setOriginCodes] = useState<Record<string, string>>({});
    // Nome da contraparte resolvido da origem (ex: fornecedor do boleto) — keyed por internal_transaction.id
    const [originPartyNames, setOriginPartyNames] = useState<Record<string, string>>({});
    const [managedCategories, setManagedCategories] = useState<string[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [stats, setStats] = useState({
        automationRate: 0,
        manualMatches: 0,
        ruleApplied: 0
    });
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [testeDaRegra, setTesteDaRegra] = useState<{ total: number; exemplos: string[] } | null>(null);
    const [newRule, setNewRule] = useState({
        name: '',
        conditionValue: '',
        category: '',
        clientName: '',
        supplierName: ''
    });

    // Filtros e Ordenação
    const [bankSearch, setBankSearch] = usePersistedState<string>('extratoBancario:search', '');
    const [internalSearch, setInternalSearch] = usePersistedState<string>('extratoBancario:internalSearch', '');
    const [bankCategoryFilter, setBankCategoryFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_bank_cat_filter') || '[]'); } catch { return []; }
    });
    const [internalCategoryFilter, setInternalCategoryFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_internal_cat_filter') || '[]'); } catch { return []; }
    });
    const [bankCounterpartyFilter, setBankCounterpartyFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_bank_cp_filter') || '[]'); } catch { return []; }
    });
    const [bankCatDropdownOpen, setBankCatDropdownOpen] = useState(false);
    const [internalCatDropdownOpen, setInternalCatDropdownOpen] = useState(false);
    const [bankCpDropdownOpen, setBankCpDropdownOpen] = useState(false);
    const [flowFilterDropdownOpen, setFlowFilterDropdownOpen] = useState(false);
    const [internalEntityFilter, setInternalEntityFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_internal_entity_filter') || '[]'); } catch { return []; }
    });
    const [internalEntityDropdownOpen, setInternalEntityDropdownOpen] = useState(false);
    const [bankSortOrder, setBankSortOrder] = useState<'desc' | 'asc'>('desc');
    const [bankSortField, setBankSortField] = useState<'date' | 'amount' | 'description' | 'category' | 'counterparty' | 'project' | 'costCenter'>('date');
    const [internalSortOrder, setInternalSortOrder] = useState<'desc' | 'asc'>('desc');
    const [internalSortField, setInternalSortField] = useState<'date' | 'amount' | 'description' | 'category' | 'entity'>('date');
    // Clique no header ordena pelo campo `field` (mesmo toggle asc/desc de sempre); usado
    // pelos <thead> das tabelas de Extrato e Pendentes › Extrato Bancário, que
    // compartilham bankSortField/bankSortOrder. Extraído para não repetir a mesma
    // expressão por coluna (era hardcoded 1:1 em cada SortableHeader antes do rollout
    // de reordenação por arraste).
    const sortBankBy = (field: BankSortField) => () =>
        bankSortField === field ? setBankSortOrder(o => o === 'asc' ? 'desc' : 'asc') : (setBankSortField(field), setBankSortOrder('asc'));
    // Idem para a tabela de Pendentes › Lançamentos Internos (internalSortField/internalSortOrder).
    const sortInternalBy = (field: InternalSortField) => () =>
        internalSortField === field ? setInternalSortOrder(o => o === 'asc' ? 'desc' : 'asc') : (setInternalSortField(field), setInternalSortOrder('asc'));
    const [matchSortOrder, setMatchSortOrder] = useState<'desc' | 'asc'>('desc');
    // Paginação do Extrato: a busca traz o período inteiro (sem teto), a tabela
    // renderiza uma página por vez. O tamanho da página fica persistido; a página
    // atual não — sempre começa na 1 quando o recorte muda.
    const [statementPageSize, setStatementPageSize] = usePersistedState<number>('extratoBancario:pageSize', 100);
    const [statementPage, setStatementPage] = useState(1);
    const [importingMessage, setImportingMessage] = useState<string | null>(null);

    const sortedBankTransactions = useMemo(() => {
        let filtered = [...bankTransactions];
        if (bankSearch) {
            const search = bankSearch.toLowerCase();
            filtered = filtered.filter(tx => 
                (tx.description_normalized || tx.description_raw || '').toLowerCase().includes(search) ||
                (tx.category || '').toLowerCase().includes(search) ||
                (tx.counterparty_name || '').toLowerCase().includes(search)
            );
        }
        if (bankCategoryFilter.includes('__none__') && bankCategoryFilter.length === 1) {
            filtered = filtered.filter(tx => !tx.category);
        } else if (bankCategoryFilter.includes('__none__')) {
            filtered = filtered.filter(tx => !tx.category || bankCategoryFilter.includes(tx.category));
        } else if (bankCategoryFilter.length > 0) {
            filtered = filtered.filter(tx => bankCategoryFilter.includes(tx.category ?? ''));
        }
        if (bankCounterpartyFilter.includes('__none__') && bankCounterpartyFilter.length === 1) {
            filtered = filtered.filter(tx => !tx.counterparty_name);
        } else if (bankCounterpartyFilter.includes('__none__')) {
            filtered = filtered.filter(tx => !tx.counterparty_name || bankCounterpartyFilter.includes(tx.counterparty_name));
        } else if (bankCounterpartyFilter.length > 0) {
            filtered = filtered.filter(tx => bankCounterpartyFilter.includes(tx.counterparty_name ?? ''));
        }
        if (flowFilter !== 'ALL') {
            filtered = filtered.filter(tx =>
                flowFilter === 'INCOME' ? tx.direction === 'CREDIT' : tx.direction === 'DEBIT'
            );
        }
        // Filtro avançado (regras compostas — descrição/valor/tipo etc.)
        filtered = applyFilterRules(filtered, statementAdvancedFilters.rules, STATEMENT_FILTER_FIELDS, getBankTxFilterValue);
        return filtered.sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';
            if (bankSortField === 'date') {
                valA = new Date(a.transaction_date).getTime();
                valB = new Date(b.transaction_date).getTime();
            } else if (bankSortField === 'amount') {
                valA = a.amount;
                valB = b.amount;
            } else if (bankSortField === 'description') {
                valA = (a.description_normalized || a.description_raw || '').toLowerCase();
                valB = (b.description_normalized || b.description_raw || '').toLowerCase();
            } else if (bankSortField === 'category') {
                valA = (a.category || '').toLowerCase();
                valB = (b.category || '').toLowerCase();
            } else if (bankSortField === 'counterparty') {
                valA = (a.counterparty_name || '').toLowerCase();
                valB = (b.counterparty_name || '').toLowerCase();
            } else if (bankSortField === 'project') {
                valA = (masterProjects.find(p => p.id === a.project_id)?.name || '').toLowerCase();
                valB = (masterProjects.find(p => p.id === b.project_id)?.name || '').toLowerCase();
            } else if (bankSortField === 'costCenter') {
                valA = (masterCostCenters.find(c => c.id === a.cost_center_id)?.name || '').toLowerCase();
                valB = (masterCostCenters.find(c => c.id === b.cost_center_id)?.name || '').toLowerCase();
            }
            if (valA < valB) return bankSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return bankSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [bankTransactions, bankSortOrder, bankSortField, bankSearch, bankCategoryFilter, bankCounterpartyFilter, flowFilter, masterProjects, masterCostCenters, statementAdvancedFilters.rules]);

    const statementTotalPages = Math.max(1, Math.ceil(sortedBankTransactions.length / statementPageSize));
    // Se o recorte encolheu e a página atual não existe mais, cai na última válida
    // (evita tabela vazia com "página 7 de 3").
    const statementCurrentPage = Math.min(statementPage, statementTotalPages);
    const statementPageStart = (statementCurrentPage - 1) * statementPageSize;
    const pagedBankTransactions = useMemo(
        () => sortedBankTransactions.slice(statementPageStart, statementPageStart + statementPageSize),
        [sortedBankTransactions, statementPageStart, statementPageSize]
    );

    const sortedInternalTransactions = useMemo(() => {
        let filtered = [...internalTransactions];
        if (internalSearch) {
            const search = internalSearch.toLowerCase();
            filtered = filtered.filter(tx => 
                (tx.description || '').toLowerCase().includes(search) ||
                (tx.category || '').toLowerCase().includes(search) ||
                (tx.entity_name || '').toLowerCase().includes(search)
            );
        }
        if (internalCategoryFilter.includes('__none__') && internalCategoryFilter.length === 1) {
            filtered = filtered.filter(tx => !tx.category);
        } else if (internalCategoryFilter.includes('__none__')) {
            filtered = filtered.filter(tx => !tx.category || internalCategoryFilter.includes(tx.category));
        } else if (internalCategoryFilter.length > 0) {
            filtered = filtered.filter(tx => internalCategoryFilter.includes(tx.category ?? ''));
        }
        if (internalEntityFilter.includes('__none__') && internalEntityFilter.length === 1) {
            filtered = filtered.filter(tx => !tx.entity_name);
        } else if (internalEntityFilter.includes('__none__')) {
            filtered = filtered.filter(tx => !tx.entity_name || internalEntityFilter.includes(tx.entity_name));
        } else if (internalEntityFilter.length > 0) {
            filtered = filtered.filter(tx => internalEntityFilter.includes(tx.entity_name ?? ''));
        }
        if (flowFilter !== 'ALL') {
            filtered = filtered.filter(tx =>
                flowFilter === 'INCOME' ? tx.direction === 'CREDIT' : tx.direction === 'DEBIT'
            );
        }
        return filtered.sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';
            if (internalSortField === 'date') {
                valA = new Date(a.transaction_date).getTime();
                valB = new Date(b.transaction_date).getTime();
            } else if (internalSortField === 'amount') {
                valA = a.amount;
                valB = b.amount;
            } else if (internalSortField === 'description') {
                valA = (a.description || '').toLowerCase();
                valB = (b.description || '').toLowerCase();
            } else if (internalSortField === 'category') {
                valA = (a.category || '').toLowerCase();
                valB = (b.category || '').toLowerCase();
            } else if (internalSortField === 'entity') {
                valA = (a.entity_name || '').toLowerCase();
                valB = (b.entity_name || '').toLowerCase();
            }
            if (valA < valB) return internalSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return internalSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [internalTransactions, internalSortOrder, internalSortField, internalSearch, internalCategoryFilter, internalEntityFilter, flowFilter]);

    const sortedMatches = useMemo(() => {
        let filtered = [...matches];
        if (flowFilter !== 'ALL') {
            filtered = filtered.filter(m => 
                flowFilter === 'INCOME' 
                    ? m.bank_transaction?.direction === 'CREDIT' 
                    : m.bank_transaction?.direction === 'DEBIT'
            );
        }
        return filtered.sort((a, b) => {
            const dateA = new Date(a.bank_transaction?.transaction_date || 0).getTime();
            const dateB = new Date(b.bank_transaction?.transaction_date || 0).getTime();
            return matchSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [matches, matchSortOrder, flowFilter]);

    // Mapa de sugestão-topo por transação bancária, para evitar filter() O(n) dentro do render de cada linha
    const topSuggestionByBankTxId = useMemo(() => {
        const map = new Map<string, ReconciliationSuggestion>();
        for (const s of suggestions) {
            if (!map.has(s.bank_transaction_id)) map.set(s.bank_transaction_id, s);
        }
        return map;
    }, [suggestions]);

    // Fonte de verdade: financial_categories. O useMemo abaixo é apenas um alias ordenado.
    const uniqueCategories = useMemo(() => [...managedCategories].sort(), [managedCategories]);

    const getLocalDateISO = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const sourceSystemMeta: Record<string, { label: string; color: string }> = {
        BOLETO:                { label: 'Boleto a Pagar',      color: 'bg-orange-50 text-orange-600' },
        CONTRACT_RECURRING:    { label: 'Contrato Recorrente', color: 'bg-violet-50 text-violet-600' },
        CONTRACT_PARCELADO:    { label: 'Contrato Parcelado',  color: 'bg-violet-50 text-violet-600' },
        CONTRACT_AVISTA:       { label: 'Contrato À Vista',    color: 'bg-violet-50 text-violet-600' },
        CONTRACT_MEASUREMENT:  { label: 'Medição de Contrato', color: 'bg-violet-50 text-violet-600' },
        PROJECT:               { label: 'Obra / Projeto',      color: 'bg-sky-50 text-sky-600'    },
        COMMERCIAL:            { label: 'Gestão Comercial',    color: 'bg-teal-50 text-teal-600'  },
        PAYROLL:               { label: 'Folha de Pagamento',  color: 'bg-pink-50 text-pink-600'  },
        PURCHASE:              { label: 'Suprimentos',         color: 'bg-amber-50 text-amber-600' },
        MANUAL:                { label: 'Lançamento Manual',   color: 'bg-gray-100 text-gray-500' },
    };
    const getSourceMeta = (ss?: string) =>
        ss ? (sourceSystemMeta[ss] ?? { label: ss, color: 'bg-gray-100 text-gray-500' }) : null;

    // Mapeia o lançamento ao módulo de origem para deep-link (clicar → abrir item lá).
    // Retorna { view, ref } ou null quando não há destino navegável (ex: MANUAL).
    const getOriginLink = (tx: InternalTransaction): { view: string; ref: string } | null => {
        const ss = tx.source_system;
        const refId = (tx as { reference_id?: string }).reference_id;
        if (!ss || !refId) return null;
        // contratos gravam reference_id como "<contractId>:pN" — extrai o id do contrato
        const contractId = refId.split(':')[0];
        switch (ss) {
            case 'BOLETO':               return { view: 'boletos-pagar', ref: refId };
            case 'CONTRACT_RECURRING':
            case 'CONTRACT_PARCELADO':
            case 'CONTRACT_AVISTA':
            case 'CONTRACT_MEASUREMENT': return { view: 'supplies-contracts', ref: contractId };
            case 'COMMERCIAL':           return { view: 'gestao-vendas', ref: refId };
            case 'PAYROLL':              return { view: 'labor-payroll', ref: refId };
            default:                     return null;
        }
    };

    const goToOrigin = (tx: InternalTransaction) => {
        const link = getOriginLink(tx);
        if (link) navigateToFocus(link.view, link.ref, tx.source_system);
    };

    // Código de origem do lançamento (nº do boleto, nº do contrato, etc.). null se não houver.
    const txCode = (tx: InternalTransaction): string | null => originCodes[tx.id] ?? null;

    // Nome da contraparte a exibir: para boletos, prioriza o fornecedor cadastrado resolvido
    // da origem (originPartyNames), depois via supplier_id do lançamento; fallback entity_name.
    const displayPartyName = (tx: InternalTransaction): string | null => {
        if (originPartyNames[tx.id]) return originPartyNames[tx.id];
        const supId = (tx as { supplier_id?: string | null }).supplier_id;
        if (tx.source_system === 'BOLETO' && supId && supplierNameById[supId]) {
            return supplierNameById[supId];
        }
        return tx.entity_name ?? null;
    };

    // Título principal do lançamento. Para boletos, usa o nome do fornecedor no lugar
    // da descrição (texto bruto do OCR). Fallback para a descrição original.
    const displayTitle = (tx: InternalTransaction): string => {
        if (tx.source_system === 'BOLETO') {
            const nome = displayPartyName(tx);
            if (nome) return nome;
        }
        return tx.description ?? '';
    };

    // Data a exibir = vencimento real (due_date) quando houver; senão a data do lançamento.
    // transaction_date é a data de entrada no pipeline (usada no filtro), não o vencimento.
    const displayDate = (tx: InternalTransaction): string => {
        const due = (tx as { due_date?: string | null }).due_date;
        return due || tx.transaction_date;
    };

    // Maps/Sets O(1) — evitam .find()/.some() lineares repetidos no render de cada card
    const projectNameById = useMemo(
        () => new Map(masterProjects.map(p => [p.id, p.name])),
        [masterProjects]
    );
    const costCenterNameById = useMemo(
        () => new Map(masterCostCenters.map(c => [c.id, c.name])),
        [masterCostCenters]
    );
    const masterSuppliersLower = useMemo(
        () => new Set(masterSuppliers.map(s => s.toLowerCase())),
        [masterSuppliers]
    );
    const masterClientsLower = useMemo(
        () => new Set(masterClients.map(c => c.toLowerCase())),
        [masterClients]
    );

    const projectName = (id?: string | null) =>
        id ? (projectNameById.get(id) ?? null) : null;

    const costCenterName = (id?: string | null) =>
        id ? (costCenterNameById.get(id) ?? null) : null;

    // Listas separadas de parceiros para sugestão nas regras
    const uniqueClients = useMemo(() => {
        const ents = new Set<string>();
        masterClients.forEach(c => ents.add(c));
        internalTransactions.filter(tx => tx.direction === 'CREDIT').forEach(tx => {
            // Prioriza o nome cadastral atual via party_id: entity_name é um snapshot de
            // texto gravado na criação do lançamento e pode ter ficado desatualizado
            // (renomeação/fusão de cadastro), gerando variantes soltas no dropdown.
            const resolved = (tx.party_id && clientNameById[tx.party_id]) || tx.entity_name;
            if (resolved) ents.add(resolved);
        });
        return Array.from(ents).sort();
    }, [internalTransactions, masterClients, clientNameById]);

    const uniqueSuppliers = useMemo(() => {
        const ents = new Set<string>();
        masterSuppliers.forEach(s => ents.add(s));
        internalTransactions.filter(tx => tx.direction === 'DEBIT').forEach(tx => {
            // Mesmo motivo do uniqueClients: prioriza o nome cadastral atual via
            // supplier_id em vez do entity_name gravado no momento da criação
            // (ex: boletos guardam o beneficiário bruto, que varia entre lançamentos
            // do mesmo fornecedor).
            const resolved = (tx.supplier_id && supplierNameById[tx.supplier_id]) || tx.entity_name;
            if (resolved) ents.add(resolved);
        });
        // counterparty_name do extrato bancário NÃO é incluído: nomes vêm sujos do banco
        // (ex: "-PIX_DEB EDSON...") e poluem a lista; o cadastro rápido resolve isso
        return Array.from(ents).sort();
    }, [internalTransactions, masterSuppliers, supplierNameById]);

    // Credores = fornecedores + colaboradores ativos (para extratos de débito)
    const uniqueCredores = useMemo(() => {
        const ents = new Set<string>();
        uniqueSuppliers.forEach(s => ents.add(s));
        masterEmployees.forEach(e => ents.add(e));
        return Array.from(ents).sort();
    }, [uniqueSuppliers, masterEmployees]);

    const uniqueBankClients = useMemo(() => {
        const ents = new Set<string>();
        masterClients.forEach(c => ents.add(c));
        // counterparty_name do extrato bancário NÃO é incluído: pode vir sujo do banco
        return Array.from(ents).sort();
    }, [masterClients]);

    // Cliente/Credor presentes no extrato bancário (para o filtro de contraparte)
    const uniqueBankCounterparties = useMemo(() => {
        const ents = new Set<string>();
        bankTransactions.forEach(tx => { if (tx.counterparty_name) ents.add(tx.counterparty_name); });
        return Array.from(ents).sort();
    }, [bankTransactions]);

    // Cliente/Credor presentes nos lançamentos (para o filtro de contraparte)
    const uniqueInternalEntities = useMemo(() => {
        const ents = new Set<string>();
        internalTransactions.forEach(tx => { if (tx.entity_name) ents.add(tx.entity_name); });
        return Array.from(ents).sort();
    }, [internalTransactions]);

    // Opções pré-computadas para os <select> dentro dos cards (evita recriar arrays por linha)
    const categoryOptions = useMemo<LazyOption[]>(
        () => uniqueCategories.map(c => ({ value: c, label: c })),
        [uniqueCategories]
    );
    const projectOptions = useMemo<LazyOption[]>(
        () => masterProjects.map(p => ({ value: p.id, label: p.name })),
        [masterProjects]
    );
    const costCenterOptions = useMemo<LazyOption[]>(
        () => masterCostCenters.map(c => ({ value: c.id, label: c.name })),
        [masterCostCenters]
    );
    const credorOptions = useMemo<LazyOption[]>(
        () => uniqueCredores.map(n => ({ value: n, label: supplierDisplayByName[n] || n })),
        [uniqueCredores, supplierDisplayByName]
    );
    const clienteOptions = useMemo<LazyOption[]>(
        () => [...new Set([...uniqueClients, ...uniqueBankClients])].sort().map(n => ({ value: n, label: n })),
        [uniqueClients, uniqueBankClients]
    );

    const [showInternalTxModal, setShowInternalTxModal] = useState(false);
    // Modal de cadastro rápido de Cliente/Credor a partir do extrato
    const [registerEntityModal, setRegisterEntityModal] = useState<{
        txId: string;
        kind: 'client' | 'supplier';
        name: string;
        document: string;
        type: 'PF' | 'PJ';
    } | null>(null);
    const [savingEntity, setSavingEntity] = useState(false);
    const [actionFeedback, setActionFeedback] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [editingInternalTxId, setEditingInternalTxId] = useState<string | null>(null);
    const [newInternalTx, setNewInternalTx] = useState({
        transaction_date: getLocalDateISO(),
        amount: '',
        direction: 'DEBIT',
        description: '',
        category: '',
        entity_name: ''
    });

    const [startDate, setStartDate] = useState<string>(() => localStorage.getItem('reconciliation_start_date') || '');
    const [endDate, setEndDate] = useState<string>(() => localStorage.getItem('reconciliation_end_date') || '');
    const [competencia, setCompetencia] = useState<string>(() => localStorage.getItem('reconciliation_competencia') || '');
    const [selectedBankTxId, setSelectedBankTxId] = useState<string | null>(null);

    // Determina a organização efetiva (da prop ou da conta selecionada)
    const effectiveOrgId = useMemo(() => {
        if (organizationId) return organizationId;
        if (!selectedAccountId) return null;
        const acc = accounts.find(a => a.id === selectedAccountId);
        return acc?.organization_id || null;
    }, [organizationId, selectedAccountId, accounts]);

    useEffect(() => {
        loadAccounts();
        loadRules();
    }, [organizationId]);

    useEffect(() => {
        if (effectiveOrgId) {
            loadSuppliers(effectiveOrgId);
            loadClients(effectiveOrgId);
            loadEmployees(effectiveOrgId);
            loadProjects(effectiveOrgId);
            loadCostCenters(effectiveOrgId);
            // Carrega categorias uma única vez por org (não re-carrega ao trocar de conta)
            if (categoriesLoadedForOrg.current !== effectiveOrgId) {
                categoriesLoadedForOrg.current = effectiveOrgId;
                loadManagedCategories(effectiveOrgId);
            }
        }
    }, [effectiveOrgId]);

    // Persistência da aba ativa
    useEffect(() => {
        localStorage.setItem('reconciliation_active_tab', activeView);
    }, [activeView]);

    // Qualquer mudança de recorte volta o Extrato para a primeira página.
    useEffect(() => {
        setStatementPage(1);
    }, [bankSearch, bankCategoryFilter, bankCounterpartyFilter, flowFilter, statementAdvancedFilters.rules, selectedAccountId, competencia, startDate, endDate]);

    useEffect(() => {
        localStorage.setItem('reconciliation_bank_cat_filter', JSON.stringify(bankCategoryFilter));
    }, [bankCategoryFilter]);

    useEffect(() => {
        localStorage.setItem('reconciliation_bank_cp_filter', JSON.stringify(bankCounterpartyFilter));
    }, [bankCounterpartyFilter]);

    useEffect(() => {
        localStorage.setItem('reconciliation_internal_cat_filter', JSON.stringify(internalCategoryFilter));
    }, [internalCategoryFilter]);

    useEffect(() => {
        localStorage.setItem('reconciliation_internal_entity_filter', JSON.stringify(internalEntityFilter));
    }, [internalEntityFilter]);

    useEffect(() => { localStorage.setItem('reconciliation_start_date', startDate); }, [startDate]);
    useEffect(() => { localStorage.setItem('reconciliation_end_date', endDate); }, [endDate]);
    useEffect(() => { localStorage.setItem('reconciliation_competencia', competencia); }, [competencia]);

    useEffect(() => {
        localStorage.setItem('reconciliation_rules_view_mode', rulesViewMode);
    }, [rulesViewMode]);

    useEffect(() => {
        localStorage.setItem('reconciliation_categories_view_mode', categoriesViewMode);
    }, [categoriesViewMode]);

    useEffect(() => {
        localStorage.setItem('reconciliation_conciliated_view_mode', conciliatedViewMode);
    }, [conciliatedViewMode]);

    useEffect(() => {
        localStorage.setItem('reconciliation_pendentes_view_mode', pendentesViewMode);
    }, [pendentesViewMode]);

    useEffect(() => {
        localStorage.setItem('reconciliation_pendentes_compact', String(pendentesCompact));
    }, [pendentesCompact]);

    useEffect(() => {
        const fetchData = async () => {
            if (selectedAccountId) {
                loadTransactions();
                if (activeView === 'rules') loadRules();
                loadStats();
                if (activeView === 'conciliated') {
                    const { data: matchedData, error: mError } = await supabase
                        .from('reconciliation_matches')
                        .select('*, bank_transaction:bank_transaction_id(*), internal_transaction:internal_transaction_id(*)')
                        .eq('bank_transaction.bank_account_id', selectedAccountId)
                        .order('created_at', { ascending: false });
                    
                    if (!mError && matchedData) {
                        const validMatches = matchedData.filter(m => m.bank_transaction);
                        setMatches(validMatches);
                    }
                    loadAuditLogs();
                }
            }
        };
        fetchData();
    }, [selectedAccountId, activeView, startDate, endDate, competencia]);

    useEffect(() => {
        const close = () => { setBankCatDropdownOpen(false); setInternalCatDropdownOpen(false); setBankCpDropdownOpen(false); setInternalEntityDropdownOpen(false); setFlowFilterDropdownOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    // Atalho para limpar seleção com Esc
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedBankTxIds(new Set());
                setSelectedInternalTxIds(new Set());
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadAccounts = async () => {
        setAccountsLoading(true);
        try {
            const { data, error } = await supabase
                .from('payment_accounts')
                .select('id, organization_id, empresa_id, bank, branch, account_number, name, description')
                .order('name');

            if (error) throw error;

            setAccounts(data || []);
            if (data && data.length > 0 && (!selectedAccountId || selectedAccountId === 'mock-acc-1')) {
                setSelectedAccountId(data[0].id);
            }
        } catch (error) {
            console.error('Error loading bank accounts:', error);
        } finally {
            setAccountsLoading(false);
        }
    };

    const loadRules = async () => {
        try {
            const orgToUse = effectiveOrgId || organizationId;
            if (!orgToUse) return;

            const { data, error } = await supabase
                .from('reconciliation_rules')
                .select('id, name, priority, is_active, organization_id, conditions, actions, created_at')
                .eq('organization_id', orgToUse)
                .order('priority', { ascending: false });
            if (error) throw error;
            setRules(data || []);
        } catch (error) {
            console.error('Error loading rules:', error);
        }
    };

    const loadClients = async (orgId: string) => {
        try {
            const { data } = await supabase
                .from('clients')
                .select('id, name')
                .or(`organization_id.eq.${orgId},organization_id.is.null`)
                .order('name', { ascending: true })
                .limit(10000);
            if (data) {
                setMasterClients(data.map(c => c.name));
                setClientNameById(Object.fromEntries(data.map(c => [c.id, c.name])));
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    const loadSuppliers = async (orgId: string) => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('id, name, nickname')
                .or(`organization_id.eq.${orgId},organization_id.is.null`)
                .order('name', { ascending: true })
                .limit(10000);

            if (error) throw error;
            if (data) {
                setMasterSuppliers(data.map(s => s.name));
                setSupplierNameById(Object.fromEntries(data.map(s => [s.id, s.name])));
                const mode = appSettingsService.get().supplierNameDisplay;
                setSupplierDisplayByName(Object.fromEntries(
                    data.map(s => [s.name, getSupplierDisplayName(s, mode)])
                ));
            }
        } catch (error) {
            console.error('Error loading master suppliers:', error);
        }
    };

    const syncCategoriesFromTransactions = async (orgId: string) => {
        const [{ data: ruleCats }, { data: intCats }, { data: bankCats }] = await Promise.all([
            supabase.from('reconciliation_rules').select('actions').eq('organization_id', orgId),
            supabase.from('internal_transactions').select('category').eq('organization_id', orgId).not('category', 'is', null),
            supabase.from('bank_transactions').select('category').eq('organization_id', orgId).not('category', 'is', null),
        ]);
        const cats = new Set<string>();
        ruleCats?.forEach((r: { actions?: { category?: string } }) => { if (r.actions?.category) cats.add(r.actions.category); });
        intCats?.forEach((t: { category?: string }) => { if (t.category) cats.add(t.category); });
        bankCats?.forEach((t: { category?: string }) => { if (t.category) cats.add(t.category); });
        if (cats.size > 0) {
            const rows = Array.from(cats).map(name => ({ name }));
            await supabase.from('financial_categories').upsert(rows, { onConflict: 'name' });
        }
        return cats;
    };

    const loadManagedCategories = async (orgId: string) => {
        try {
            const { data, error } = await supabase
                .from('financial_categories')
                .select('name')
                .order('name', { ascending: true });
            if (error) throw error;
            if (data && data.length > 0) {
                setManagedCategories(data.map(c => c.name));
            } else {
                // Seed inicial: todas as fontes da org atual
                const cats = await syncCategoriesFromTransactions(orgId);
                setManagedCategories(Array.from(cats).sort());
            }
        } catch (error) {
            console.error('Error loading financial categories:', error);
        }
    };

    const handleSyncCategories = async () => {
        const orgId = organizationId || effectiveOrgId;
        if (!orgId) return;
        setIsLoading(true);
        try {
            await syncCategoriesFromTransactions(orgId);
            await loadManagedCategories(orgId);
            setActionFeedback({ message: 'Categorias sincronizadas com sucesso!', type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
        } catch (err) {
            console.error('Error syncing categories:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadEmployees = async (orgId: string) => {
        try {
            const { data } = await supabase
                .from('employees')
                .select('name')
                .eq('org_id', orgId)
                .eq('status', 'ATIVO')
                .order('name', { ascending: true });
            if (data) setMasterEmployees(data.map(e => e.name));
        } catch (error) {
            console.error('Error loading employees:', error);
        }
    };

    const loadProjects = async (orgId: string) => {
        try {
            const { data } = await supabase
                .from('projects')
                .select('id, name')
                .filter('settings->>organizationId', 'eq', orgId)
                .not('name', 'in', SYSTEM_PROJECT_NAMES_SQL) // utils/systemProjects.ts
                .order('name', { ascending: true });
            if (data) {
                const uniqueProjects = Array.from(new Map(data.map(p => [p.name, p])).values());
                setMasterProjects(uniqueProjects);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    const loadCostCenters = async (orgId: string) => {
        try {
            // Tenta com org; se vier vazio, tenta sem filtro (RLS garante escopo)
            let data = await financialRegistryService.listCostCenters(orgId);
            if (!data.length) data = await financialRegistryService.listCostCenters();
            setMasterCostCenters(data.map(c => ({ id: c.id, name: c.name })));
        } catch (error) {
            console.error('Error loading cost centers:', error);
        }
    };

    // Busca o código de origem de cada lançamento (nº do boleto, nº do contrato, etc.)
    const loadOriginCodes = async (txs: InternalTransaction[]) => {
        try {
            const codes: Record<string, string> = {};
            const partyNames: Record<string, string> = {};

            // BOLETO — nome do fornecedor: resolve direto pelo supplier_id do PRÓPRIO lançamento
            // (que já vem populado), evitando depender de RLS na tabela boletos.
            const boletoTxs = txs.filter(t => t.source_system === 'BOLETO');
            const txSupIds = [...new Set(boletoTxs.map(t => (t as { supplier_id?: string | null }).supplier_id).filter(Boolean) as string[])];
            if (txSupIds.length) {
                const { data: sups } = await supabase
                    .from('suppliers')
                    .select('id, name')
                    .in('id', txSupIds);
                const supNameById = Object.fromEntries((sups || []).map(s => [s.id, s.name]));
                boletoTxs.forEach(t => {
                    const sid = (t as { supplier_id?: string | null }).supplier_id;
                    if (sid && supNameById[sid]) partyNames[t.id] = supNameById[sid];
                });
            }

            // BOLETO — código (nº): busca na tabela boletos via reference_id (best-effort)
            const boletoRefs = boletoTxs.filter(t => (t as { reference_id?: string }).reference_id);
            const boletoIds = [...new Set(boletoRefs.map(t => (t as { reference_id?: string }).reference_id!))];
            if (boletoIds.length) {
                const { data } = await supabase
                    .from('boletos')
                    .select('id, numero, supplier_id, beneficiario_nome')
                    .in('id', boletoIds);
                const byId = new Map((data || []).map(b => [b.id, b]));
                boletoRefs.forEach(t => {
                    const b = byId.get((t as { reference_id?: string }).reference_id!);
                    if (!b) return;
                    if (b.numero != null) codes[t.id] = String(b.numero).padStart(4, '0');
                    // fallback de nome caso o supplier_id do lançamento estivesse nulo
                    if (!partyNames[t.id] && b.beneficiario_nome) partyNames[t.id] = b.beneficiario_nome;
                });
            }

            // CONTRATOS: reference_id → busca contract_number.
            //
            // ⚠️ São TRÊS formatos, não um. Medido em 30/08/2026 sobre 351 linhas:
            //   CONTRACT_AVISTA     → uuid puro                    (11)
            //   CONTRACT_PARCELADO  → "<dealId>:pN"                (29)
            //   CONTRACT_RECURRING  → "<dealId>-pAAAA-MM-DD"      (311)
            // O código só tratava o do meio (`split(':')`), então em 89% das
            // linhas o id COMPOSTO ia inteiro para `.in('id', …)` e o Postgres
            // derrubava a query com 22P02. E como o erro mata a consulta INTEIRA,
            // nem os uuids puros do mesmo lote resolviam: a coluna de origem
            // ficava vazia para todos. Ver lib/receivableRef.ts.
            const contractSources = ['CONTRACT_RECURRING', 'CONTRACT_PARCELADO', 'CONTRACT_AVISTA', 'CONTRACT_MEASUREMENT'];
            const contractRefs = txs.filter(t => contractSources.includes(t.source_system || '') && (t as { reference_id?: string }).reference_id);
            // `split(':')` tira o sufixo do PARCELADO, `originIdFromRef` tira o
            // do RECURRING. Os dois são inócuos sobre uuid puro.
            const dealIdDaRef = (ref: string) => originIdFromRef(ref.split(':')[0]);
            const dealIds = [...new Set(contractRefs.map(t => dealIdDaRef((t as { reference_id?: string }).reference_id!)))];
            if (dealIds.length) {
                const { data } = await supabase
                    .from('commercial_deals')
                    .select('id, contract_number')
                    .in('id', dealIds);
                const byId = new Map((data || []).map(d => [d.id, d.contract_number]));
                contractRefs.forEach(t => {
                    const ref = (t as { reference_id?: string }).reference_id!;
                    const num = byId.get(dealIdDaRef(ref));
                    if (!num) return;
                    // O discriminador da parcela existe nos dois formatos com
                    // sufixo, e é o que distingue as 12 linhas do mesmo contrato:
                    // ":pN" traz o número, "-pAAAA-MM-DD" traz o vencimento.
                    const parcela = ref.includes(':p')
                        ? ref.split(':p')[1]
                        : (ref.match(/-p(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null);
                    codes[t.id] = parcela ? `${num} (${parcela})` : String(num);
                });
            }

            setOriginCodes(codes);
            setOriginPartyNames(partyNames);
        } catch (err) {
            console.error('Erro ao carregar códigos de origem:', err);
        }
    };

    const loadAuditLogs = async () => {
        if (!effectiveOrgId) return;
        try {
            const { data, error } = await supabase
                .from('reconciliation_audit_log')
                .select('id, organization_id, event_type, payload, created_at')
                .eq('organization_id', effectiveOrgId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            setAuditLogs(data || []);
        } catch (error) {
            console.error('Error loading audit logs:', error);
        }
    };

    const loadStats = async () => {
        if (!selectedAccountId) return;
        try {
            let matchedQuery = supabase
                .from('bank_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('bank_account_id', selectedAccountId)
                .in('status', ['MATCHED', 'RULE_APPLIED']);
            
            let totalQuery = supabase
                .from('bank_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('bank_account_id', selectedAccountId)
                .neq('status', 'IGNORED'); // ignorado não é movimento — não entra no total

            let autoQuery = supabase
                .from('bank_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('bank_account_id', selectedAccountId)
                .eq('status', 'RULE_APPLIED');

            if (startDate) {
                matchedQuery = matchedQuery.gte('transaction_date', startDate);
                totalQuery = totalQuery.gte('transaction_date', startDate);
                autoQuery = autoQuery.gte('transaction_date', startDate);
            }
            if (endDate) {
                matchedQuery = matchedQuery.lte('transaction_date', endDate);
                totalQuery = totalQuery.lte('transaction_date', endDate);
                autoQuery = autoQuery.lte('transaction_date', endDate);
            }

            const [{ count: matchedCount }, { count: totalCount }, { count: autoCount }] = await Promise.all([
                matchedQuery,
                totalQuery,
                autoQuery
            ]);

            const rate = totalCount ? (matchedCount || 0) / totalCount : 0;
            
            setStats({
                automationRate: Math.round(rate * 100),
                manualMatches: (matchedCount || 0) - (autoCount || 0),
                ruleApplied: autoCount || 0
            });
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadTransactions = async () => {
        if (!selectedAccountId) return;
        setIsLoading(true);
        try {
            // Datas efetivas: competência tem precedência sobre início/fim manual
            // (competência pode ser "AAAA" — ano todo — ou "AAAA-MM")
            const competenciaIsYearOnly = !!competencia && !competencia.includes('-');
            const effStart = competencia
                ? (competenciaIsYearOnly ? `${competencia}-01-01` : `${competencia}-01`)
                : startDate;
            const effEnd = competencia
                ? (competenciaIsYearOnly
                    ? `${competencia}-12-31`
                    : `${competencia}-${String(new Date(+competencia.split('-')[0], +competencia.split('-')[1], 0).getDate()).padStart(2, '0')}`)
                : endDate;

            const isPendingView = activeView === 'pending' || activeView === 'center' || activeView === 'statement';

            // Load Bank Transactions
            const buildBankQuery = () => {
                let q = supabase
                    .from('bank_transactions')
                    .select('*')
                    .eq('bank_account_id', selectedAccountId);

                // Extrato = espelho do que o banco mandou. NÃO filtra por status:
                // lançamento já conciliado (MATCHED) ou de período fechado (LOCKED)
                // continua sendo extrato. Filtrar aqui fazia meses inteiros já
                // conciliados sumirem da tela — parecia recorte de data.
                // As abas Pendentes/Central, sim, são recortes por status.
                if (activeView === 'statement') {
                    // sem filtro de status
                } else if (isPendingView) {
                    q = q.in('status', ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED', 'CONFIRMED']);
                } else {
                    q = q.in('status', ['MATCHED']);
                }

                if (effStart) q = q.gte('transaction_date', effStart);
                if (effEnd)   q = q.lte('transaction_date', effEnd);

                // A ordenação precisa ser determinística entre páginas: transaction_date
                // sozinho empata muito (vários lançamentos no mesmo dia) e o desempate do
                // Postgres não é estável, o que faria linhas repetirem ou sumirem no range.
                return q.order('transaction_date', { ascending: false }).order('id', { ascending: false });
            };

            // Load Internal Transactions based on view
            const buildITxQuery = () => {
                let q = supabase
                    .from('internal_transactions')
                    .select('*');

                if (organizationId) {
                    q = q.eq('organization_id', organizationId);
                }

                q = q.eq('status', isPendingView ? 'PENDING' : 'CONCILIATED');

                if (effStart) q = q.gte('transaction_date', effStart);
                if (effEnd)   q = q.lte('transaction_date', effEnd);

                return q.order('transaction_date', { ascending: false }).order('id', { ascending: false });
            };

            const orgForProj = effectiveOrgId || organizationId;

            // Dispara em paralelo tudo que não depende uma da outra (supabase-js resolve com
            // { error } em vez de rejeitar, então uma falha aqui não derruba o Promise.all).
            const [bankResult, iTxResult, projResult] = await Promise.all([
                fetchAllPages<BankTransaction>(buildBankQuery as never),
                fetchAllPages<InternalTransaction>(buildITxQuery as never),
                // --- PONTE COMERCIAL --- só relevante na aba Pendentes
                (isPendingView && orgForProj)
                    ? supabase.from('projects').select('id, name, settings').filter('settings->>organizationId', 'eq', orgForProj)
                        .then(r => r, (err: unknown) => {
                            console.error('Erro na varredura total de projetos:', err);
                            return { data: [] as Array<{ id: string; name: string; settings: any }> };
                        })
                    : Promise.resolve({ data: [] as Array<{ id: string; name: string; settings: any }> })
            ]);

            const { data: bTxs, error: bError } = bankResult;
            if (bError) throw bError;
            setBankTransactions(bTxs || []);

            const { data: iTxs, error: iError } = iTxResult;
            if (iError) throw iError;

            let finalITxs = iTxs || [];

            const allProjData = projResult.data;
            if (allProjData && allProjData.length > 0) {
                let commercialMatches: CommercialMatch[] = [];
                allProjData.forEach(proj => {
                    const txs: Array<Record<string, unknown>> = proj.settings?.financialInfo?.transactions || [];
                    const mappedCommercial = txs
                        .filter((t) => (t['status'] === 'PENDING' || t['status'] === 'PENDENTE' || t['status'] === 'OPEN'))
                        .filter((t) => {
                            const txDate = String(t['date'] || t['transaction_date'] || '');
                            if (!txDate) return true;
                            if (effStart && txDate < effStart) return false;
                            if (effEnd && txDate > effEnd) return false;
                            return true;
                        })
                        .map((t): CommercialMatch => ({
                            id: String(t['id'] || ''),
                            description: String(t['description'] || `Venda: ${String(t['category'] || '')} (${proj.name})`),
                            amount: parseFloat(String(t['value'] || t['amount'] || 0)),
                            transaction_date: String(t['date'] || t['transaction_date'] || ''),
                            status: 'PENDING',
                            type: 'INCOME',
                            category: String(t['category'] || ''),
                            isCommercial: true,
                            project_id: proj.id,
                            original_id: String(t['id'] || ''),
                            projectName: proj.name
                        }));

                    commercialMatches = [...commercialMatches, ...mappedCommercial];
                });

                if (commercialMatches.length > 0) {
                    const existingIds = new Set(finalITxs.map(t => t.id));
                    const uniqueNew = commercialMatches.filter(t => !existingIds.has(t.id));
                    finalITxs = [...finalITxs, ...(uniqueNew as unknown as InternalTransaction[])];
                }
            }

            setInternalTransactions(finalITxs);
            void loadOriginCodes(finalITxs);

            // Load Suggestions for pending transactions in batches to avoid URL length limits
            if (isPendingView && bTxs && bTxs.length > 0) {
                const bTxIds = bTxs.map(t => t.id);
                const batchSize = 100;
                const batches: string[][] = [];
                for (let i = 0; i < bTxIds.length; i += batchSize) {
                    batches.push(bTxIds.slice(i, i + batchSize));
                }

                const batchResults = await Promise.all(batches.map(batch =>
                    supabase
                        .from('reconciliation_suggestions')
                        .select('*, candidate_internal_transaction:candidate_internal_transaction_id(*)')
                        .in('bank_transaction_id', batch)
                        .order('confidence', { ascending: false })
                ));

                const allSuggestions = batchResults
                    .filter(r => !r.error && r.data)
                    .flatMap(r => r.data as ReconciliationSuggestion[]);
                setSuggestions(allSuggestions);
            }

            if (activeView === 'conciliated') {
                const { data: matchedData, error: mError } = await supabase
                    .from('reconciliation_matches')
                    .select('*, bank_transaction:bank_transaction_id(*), internal_transaction:internal_transaction_id(*)')
                    .eq('bank_transaction.bank_account_id', selectedAccountId)
                    .order('created_at', { ascending: false });
                
                if (!mError && matchedData) {
                    const validMatches = matchedData.filter(m => m.bank_transaction);
                    setMatches(validMatches);
                }
                loadAuditLogs();
            }

        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditRule = (rule: ReconciliationRule) => {
        setEditingRuleId(rule.id);
        const cp = rule.actions.counterparty || '';
        const isSupplier = uniqueSuppliers.includes(cp);
        
        setNewRule({
            name: rule.name,
            conditionValue: rule.conditions.value,
            category: rule.actions.category,
            clientName: !isSupplier ? cp : '',
            supplierName: isSupplier ? cp : ''
        });
        setShowRuleModal(true);
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!await confirm({ title: 'Excluir esta regra?', variant: 'danger', confirmLabel: 'Excluir' })) return;
        try {
            const { error } = await supabase
                .from('reconciliation_rules')
                .delete()
                .eq('id', ruleId);
            if (error) throw error;
            loadRules();
        } catch (error) {
            console.error('Error deleting rule:', error);
        }
    };

    const handleCreateRule = async () => {
        // Agora permite salvar se tiver categoria OU cliente definido
        if (!newRule.name || !newRule.conditionValue) {
            alert('Por favor, defina o nome da regra e o termo de busca.');
            return;
        }

        if (!newRule.category && !newRule.clientName && !newRule.supplierName) {
            alert('Por favor, defina pelo menos uma Categoria ou um Cliente/Credor.');
            return;
        }

        try {
            const rulePayload = {
                name: newRule.name,
                conditions: { type: 'contains', field: 'description_normalized', value: newRule.conditionValue },
                actions: { 
                    category: newRule.category, 
                    counterparty: newRule.clientName || newRule.supplierName 
                }
            };

            if (editingRuleId) {
                const { error } = await supabase
                    .from('reconciliation_rules')
                    .update(rulePayload)
                    .eq('id', editingRuleId);
                if (error) throw error;
            } else {
                const orgToUse = effectiveOrgId || organizationId;
                if (!orgToUse) throw new Error('Organização não identificada.');

                const { error } = await supabase
                    .from('reconciliation_rules')
                    .insert({
                        ...rulePayload,
                        organization_id: orgToUse,
                        priority: rules.length + 1,
                        is_active: true
                    });
                if (error) throw error;
            }
            setShowRuleModal(false);
            setEditingRuleId(null);
            setNewRule({ name: '', conditionValue: '', category: '', clientName: '', supplierName: '' });
            loadRules();
            loadStats();
            alert('Regra salva com sucesso!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error saving rule:', error);
            alert('Erro ao salvar regra: ' + (error.message || 'Erro de permissão ou conexão.'));
        }
    };

    const handleApplyRulesManually = async () => {
        if (!selectedAccountId) {
            alert('Por favor, selecione uma conta bancária primeiro.');
            return;
        }

        setIsLoading(true);
        try {
            // A organização pode vir nula em "Todas as organizações"; o serviço resolve
            // pela conta bancária. Bloquear aqui deixava o botão morto sem explicar.
            const orgToUse = effectiveOrgId || organizationId;
            const aplicadas = await bankReconciliationService.applyCustomRules(selectedAccountId, orgToUse, true);
            const r = await bankReconciliationService.runMatchingEngineTracked(selectedAccountId, orgToUse, 'MANUAL');
            await loadTransactions();
            await loadStats();
            alert([
                `${aplicadas} lançamento(s) identificado(s) por regra.`,
                r.autoApplied > 0 ? `${r.autoApplied} conciliado(s) automaticamente${r.exactUnique > 0 ? ` (${r.exactUnique} por valor exato e candidato único)` : ''}.` : 'Nenhuma conciliação automática nesta rodada.',
                r.transfersPaired > 0 ? `${r.transfersPaired} transferência(s) entre contas próprias pareada(s).` : null,
                `${r.suggestions} sugestão(ões) para revisar na Central.`,
            ].filter(Boolean).join('\n'));
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error applying rules manually:', error);
            alert('Erro ao aplicar regras: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplySelectedRules = async () => {
        if (!selectedAccountId) {
            alert('Por favor, selecione uma conta bancária primeiro.');
            return;
        }
        
        if (selectedRuleIds.size === 0) {
            alert('Por favor, selecione ao menos uma regra para aplicar.');
            return;
        }

        setIsLoading(true);
        try {
            const orgToUse = effectiveOrgId || organizationId;
            if (!orgToUse) throw new Error('Organização não identificada.');

            const ids = Array.from(selectedRuleIds) as string[];
            await bankReconciliationService.applyCustomRules(selectedAccountId, orgToUse, true, ids);
            await loadTransactions();
            
            setActionFeedback({ message: `${ids.length} regra(s) aplicada(s) com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
            setSelectedRuleIds(new Set());
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error applying selected rules:', error);
            alert('Erro ao aplicar regras selecionadas: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmMatch = async (bankTxId: string, internalTxId?: string) => {
        try {
            const orgToUse = effectiveOrgId || organizationId;
            await bankReconciliationService.confirmTransaction(bankTxId, internalTxId, orgToUse || undefined);
            setSelectedBankTxId(null);
            await loadTransactions();
            await loadStats();
        } catch (error) {
            console.error('Error confirming match:', error);
        }
    };

    const handleRejectSuggestion = async (bankTransactionId: string) => {
        // Dispensa todas as sugestões do movimento (some da Central até reprocessar)
        const { error } = await supabase
            .from('reconciliation_suggestions')
            .delete()
            .eq('bank_transaction_id', bankTransactionId);
        if (error) throw error;
        await loadTransactions();
        await loadStats();
    };

    const handleRejectRule = async (bankTxId: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({
                    category: null,
                    counterparty_name: null,
                    status: 'NORMALIZED'
                })
                .eq('id', bankTxId);
            
            if (error) throw error;
            
            // Atualizar estado local
            setBankTransactions(prev => prev.map(tx => 
                tx.id === bankTxId ? { ...tx, category: '', counterparty_name: undefined, status: 'NORMALIZED' as BankTransactionStatus } : tx
            ));
            
            setActionFeedback({ message: 'Sugestão rejeitada!', type: 'success' });
            setTimeout(() => setActionFeedback(null), 2000);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error rejecting rule:', error);
            alert('Erro ao rejeitar sugestão: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUndoMatch = async (matchId: string, bankTxId: string, internalTxId: string) => {
        if (!await confirm({ title: 'Desfazer este vínculo?', message: 'Ambas as transações voltarão para a lista de Pendentes.', variant: 'warning', confirmLabel: 'Desfazer' })) return;
        
        setIsLoading(true);
        try {
            // Uma RPC, uma transação: vínculo, extrato, título, boleto/fatura e auditoria
            // voltam juntos ou não voltam (fn_reconcile_unmatch). Os ids de extrato/título
            // ficam na assinatura só para o JSX de Conciliados não mudar.
            void bankTxId; void internalTxId;
            await bankReconciliationService.unmatch(matchId);

            await loadTransactions();
            await loadStats();
            alert('Vínculo desfeito com sucesso!');
        } catch (err: unknown) {
            const errMsg = err instanceof Error
                ? err.message
                : (err as Record<string, unknown>)?.message as string
                  || (err as Record<string, unknown>)?.details as string
                  || JSON.stringify(err);
            console.error('Error undoing match:', err);
            alert('Erro ao desfazer vínculo: ' + errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncAllData = async () => {
        setIsLoading(true);
        try {
            const orgToUse = effectiveOrgId || organizationId;

            // 1. Buscar todos os projetos relevantes
            let query = supabase.from('projects').select('id, name, settings');
            if (orgToUse) {
                // Se houver uma organização selecionada, filtra por ela
                query = query.filter('settings->>organizationId', 'eq', orgToUse);
            }
            
            const { data: projects, error: pError } = await query;
            if (pError) throw pError;

            if (projects && projects.length > 0) {
                // 2. Sincronizar cada projeto individualmente
                for (const project of projects) {
                    await financialSyncService.syncFinancialData(project, project.settings?.organizationId || organizationId);
                }
            }

            // 3. Sincronizar dados comerciais (Vendas/Aluguéis) — requer org isolada
            if (orgToUse) {
                await commercialFinanceService.syncAllOrganizationDeals(orgToUse);
            }

            // 4. Recarregar transações no componente
            await loadTransactions();
            alert('Nomes de Clientes e Fornecedores atualizados com sucesso através da sincronização de projetos!');
        } catch (err: unknown) {
            const errMsg = err instanceof Error
                ? err.message
                : (err as Record<string, unknown>)?.message as string
                  || (err as Record<string, unknown>)?.details as string
                  || JSON.stringify(err);
            console.error('Error in global sync:', err);
            alert('Erro ao sincronizar dados: ' + errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteInternalTx = async (id: string) => {
        setIsLoading(true);
        try {
            // Verificar se o lançamento está conciliado (pode ter N vínculos: N movimentos → 1 título)
            const { data: matches } = await supabase
                .from('reconciliation_matches')
                .select('id')
                .eq('internal_transaction_id', id);

            if (matches && matches.length > 0) {
                if (!await confirm({ title: 'Excluir lançamento conciliado?', message: 'Excluí-lo também desfará o vínculo bancário na aba Conciliados.', variant: 'warning', confirmLabel: 'Continuar' })) {
                    setIsLoading(false);
                    return;
                }

                // Cada vínculo é desfeito pela RPC transacional (restaura o extrato e audita)
                for (const m of matches) {
                    await bankReconciliationService.unmatch(m.id);
                }
            } else {
                if (!await confirm({ title: 'Excluir este lançamento manual?', variant: 'danger', confirmLabel: 'Excluir' })) {
                    setIsLoading(false);
                    return;
                }
            }

            // 3. Excluir o lançamento interno definitivamente
            const { error } = await supabase
                .from('internal_transactions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await loadTransactions();
            await loadStats();
            alert('Lançamento excluído com sucesso!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error deleting internal transaction:', error);
            alert(`Erro ao excluir lançamento: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditInternalTx = (tx: InternalTransaction) => {
        setEditingInternalTxId(tx.id);
        setNewInternalTx({
            transaction_date: tx.transaction_date,
            amount: tx.amount.toString().replace('.', ','),
            direction: tx.direction,
            description: tx.description || '',
            category: tx.category || '',
            entity_name: tx.entity_name || ''
        });
        setShowInternalTxModal(true);
    };

    const handleCreateInternalTx = async () => {
        if (!newInternalTx.amount || !newInternalTx.description) {
            alert('Por favor, preencha o valor e a descrição.');
            return;
        }
        
        if (!organizationId) {
            console.error('[FINANCIAL-DEBUG] Organization ID is missing');
            alert('Erro: ID da organização não encontrado.');
            return;
        }

        setIsLoading(true);
        try {
            const amountVal = parseFloat(newInternalTx.amount.toString().replace(',', '.'));
            if (isNaN(amountVal)) {
                alert('Valor inválido.');
                setIsLoading(false);
                return;
            }

            if (editingInternalTxId) {
                const { error } = await supabase
                    .from('internal_transactions')
                    .update({
                        transaction_date: newInternalTx.transaction_date,
                        amount: amountVal,
                        direction: newInternalTx.direction,
                        description: newInternalTx.description,
                        category: newInternalTx.category || 'Geral',
                        entity_name: newInternalTx.entity_name
                    })
                    .eq('id', editingInternalTxId);
                if (error) throw error;
            } else {
                const orgToUse = effectiveOrgId || organizationId;
                if (!orgToUse) throw new Error('ID da organização não identificado. Selecione uma organização ou conta bancária.');

                const { error } = await supabase
                    .from('internal_transactions')
                    .insert({
                        organization_id: orgToUse,
                        source_system: 'MANUAL',
                        transaction_date: newInternalTx.transaction_date,
                        amount: amountVal,
                        direction: newInternalTx.direction,
                        description: newInternalTx.description,
                        category: newInternalTx.category || 'Geral',
                        entity_name: newInternalTx.entity_name,
                        status: 'PENDING'
                    });

                if (error) throw error;
            }

            setShowInternalTxModal(false);
            setEditingInternalTxId(null);
            setNewInternalTx({
                transaction_date: getLocalDateISO(),
                amount: '',
                direction: 'DEBIT',
                description: '',
                category: '',
                entity_name: ''
            });

            await loadTransactions();
            await loadStats();
            alert('Lançamento realizado com sucesso!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error creating internal transaction:', error);
            alert(`Erro ao criar lançamento: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpdateCategory = async (type: 'bank' | 'internal', newCategory: string) => {
        const ids = Array.from(type === 'bank' ? selectedBankTxIds : selectedInternalTxIds);
        if (ids.length === 0) return;

        setIsLoading(true);
        try {
            const table = type === 'bank' ? 'bank_transactions' : 'internal_transactions';
            const updatePayload = type === 'bank' 
                ? { category: newCategory, status: (newCategory ? 'RULE_APPLIED' : 'NORMALIZED') as BankTransactionStatus }
                : { category: newCategory };

            const { error } = await supabase
                .from(table)
                .update(updatePayload)
                .in('id', ids);

            if (error) throw error;

            // Atualizar estado local
            if (type === 'bank') {
                setBankTransactions(prev => prev.map(tx => 
                    ids.includes(tx.id) ? { ...tx, ...updatePayload } : tx
                ));
                setSelectedBankTxIds(new Set());
            } else {
                setInternalTransactions(prev => prev.map(tx => 
                    ids.includes(tx.id) ? { ...tx, category: newCategory } : tx
                ));
                setSelectedInternalTxIds(new Set());
            }

            setActionFeedback({ message: `${ids.length} itens atualizados com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);

            // Sincronizar com matches
            setMatches(prev => prev.map(m => {
                const bId = m.bank_transaction?.id;
                const iId = m.internal_transaction?.id;
                
                let updatedM = { ...m };
                let changed = false;

                if (type === 'bank' && bId && ids.includes(bId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.bank_transaction = { ...m.bank_transaction, ...updatePayload } as any;
                    changed = true;
                }
                if (type === 'internal' && iId && ids.includes(iId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.internal_transaction = { ...m.internal_transaction, category: newCategory } as any;
                    changed = true;
                }

                return changed ? updatedM : m;
            }));

        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`Error bulk updating ${type} category:`, error);
            alert(`Erro ao atualizar categorias em lote: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpdateEntityName = async (type: 'bank' | 'internal', newEntityName: string) => {
        const ids = Array.from(type === 'bank' ? selectedBankTxIds : selectedInternalTxIds);
        if (ids.length === 0) return;

        setIsLoading(true);
        try {
            const table = type === 'bank' ? 'bank_transactions' : 'internal_transactions';
            // bank_transactions usa counterparty_name; internal_transactions usa entity_name
            const updatePayload = type === 'bank'
                ? { counterparty_name: newEntityName }
                : { entity_name: newEntityName };

            const { error } = await supabase
                .from(table)
                .update(updatePayload)
                .in('id', ids);

            if (error) throw error;

            if (type === 'bank') {
                setBankTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, counterparty_name: newEntityName } : tx
                ));
                setSelectedBankTxIds(new Set());
            } else {
                setInternalTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, entity_name: newEntityName } : tx
                ));
                setSelectedInternalTxIds(new Set());
            }

            setActionFeedback({ message: `${ids.length} itens atualizados com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);

            setMatches(prev => prev.map(m => {
                const bId = m.bank_transaction?.id;
                const iId = m.internal_transaction?.id;
                let updatedM = { ...m };
                let changed = false;
                if (type === 'bank' && bId && ids.includes(bId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.bank_transaction = { ...m.bank_transaction, counterparty_name: newEntityName } as any;
                    changed = true;
                }
                if (type === 'internal' && iId && ids.includes(iId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.internal_transaction = { ...m.internal_transaction, entity_name: newEntityName } as any;
                    changed = true;
                }
                return changed ? updatedM : m;
            }));

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
            console.error(`Error bulk updating ${type} entity_name:`, err);
            alert(`Erro ao atualizar fornecedor/cliente em lote: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpdateProject = async (type: 'bank' | 'internal', newProjectId: string) => {
        const ids = Array.from(type === 'bank' ? selectedBankTxIds : selectedInternalTxIds);
        if (ids.length === 0) return;

        setIsLoading(true);
        try {
            const table = type === 'bank' ? 'bank_transactions' : 'internal_transactions';
            const { error } = await supabase
                .from(table)
                .update({ project_id: newProjectId || null })
                .in('id', ids);

            if (error) throw error;

            if (type === 'bank') {
                setBankTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, project_id: newProjectId || undefined } : tx
                ));
                setSelectedBankTxIds(new Set());
            } else {
                setInternalTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, project_id: newProjectId || undefined } : tx
                ));
                setSelectedInternalTxIds(new Set());
            }

            setActionFeedback({ message: `${ids.length} itens atualizados com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);

            setMatches(prev => prev.map(m => {
                const bId = m.bank_transaction?.id;
                const iId = m.internal_transaction?.id;
                let updatedM = { ...m };
                let changed = false;
                if (type === 'bank' && bId && ids.includes(bId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.bank_transaction = { ...m.bank_transaction, project_id: newProjectId || undefined } as any;
                    changed = true;
                }
                if (type === 'internal' && iId && ids.includes(iId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.internal_transaction = { ...m.internal_transaction, project_id: newProjectId || undefined } as any;
                    changed = true;
                }
                return changed ? updatedM : m;
            }));

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
            console.error(`Error bulk updating ${type} project_id:`, err);
            alert(`Erro ao atualizar obra em lote: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpdateCostCenter = async (type: 'bank' | 'internal', newCostCenterId: string) => {
        const ids = Array.from(type === 'bank' ? selectedBankTxIds : selectedInternalTxIds);
        if (ids.length === 0) return;

        setIsLoading(true);
        try {
            const table = type === 'bank' ? 'bank_transactions' : 'internal_transactions';
            const { error } = await supabase
                .from(table)
                .update({ cost_center_id: newCostCenterId || null })
                .in('id', ids);

            if (error) throw error;

            if (type === 'bank') {
                setBankTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, cost_center_id: newCostCenterId || undefined } : tx
                ));
                setSelectedBankTxIds(new Set());
            } else {
                setInternalTransactions(prev => prev.map(tx =>
                    ids.includes(tx.id) ? { ...tx, cost_center_id: newCostCenterId || undefined } : tx
                ));
                setSelectedInternalTxIds(new Set());
            }

            setActionFeedback({ message: `${ids.length} itens atualizados com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);

            setMatches(prev => prev.map(m => {
                const bId = m.bank_transaction?.id;
                const iId = m.internal_transaction?.id;
                let updatedM = { ...m };
                let changed = false;
                if (type === 'bank' && bId && ids.includes(bId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.bank_transaction = { ...m.bank_transaction, cost_center_id: newCostCenterId || undefined } as any;
                    changed = true;
                }
                if (type === 'internal' && iId && ids.includes(iId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    updatedM.internal_transaction = { ...m.internal_transaction, cost_center_id: newCostCenterId || undefined } as any;
                    changed = true;
                }
                return changed ? updatedM : m;
            }));

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
            console.error(`Error bulk updating ${type} cost_center_id:`, err);
            alert(`Erro ao atualizar centro de custo em lote: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Salva vários campos do extrato bancário de uma vez (usado pelo modal "Editar em Lote")
    const handleBulkUpdateBankFields = async (
        fields: Partial<Pick<BankTransaction, 'category' | 'counterparty_name' | 'project_id' | 'cost_center_id'>>
    ) => {
        const ids = Array.from(selectedBankTxIds);
        if (ids.length === 0) return;

        const updatePayload: Record<string, unknown> = { ...fields };
        if (fields.category !== undefined) {
            updatePayload.status = (fields.category ? 'RULE_APPLIED' : 'NORMALIZED') as BankTransactionStatus;
        }

        const { error } = await supabase
            .from('bank_transactions')
            .update(updatePayload)
            .in('id', ids);

        if (error) throw error;

        setBankTransactions(prev => prev.map(tx =>
            ids.includes(tx.id) ? { ...tx, ...updatePayload } : tx
        ));
        setMatches(prev => prev.map(m => {
            const bId = m.bank_transaction?.id;
            if (bId && ids.includes(bId)) {
                return { ...m, bank_transaction: { ...m.bank_transaction, ...updatePayload } as never };
            }
            return m;
        }));
        // Cada linha do lote ensina a memória sobre a SUA contraparte — são
        // contrapartes diferentes recebendo a mesma decisão, não uma só repetida.
        for (const id of ids) {
            lembrarClassificacao(id, {
                category: fields.category ?? undefined,
                project_id: fields.project_id ?? undefined,
                cost_center_id: fields.cost_center_id ?? undefined,
                party_name: fields.counterparty_name ?? undefined,
            });
        }

        setSelectedBankTxIds(new Set());
        setActionFeedback({ message: `${ids.length} lançamento${ids.length !== 1 ? 's' : ''} atualizado${ids.length !== 1 ? 's' : ''} com sucesso!`, type: 'success' });
        setTimeout(() => setActionFeedback(null), 3000);
    };

    /**
     * "Aplicar memória": varre os movimentos ainda sem classificação da conta e
     * preenche o que a organização já decidiu para aquela contraparte. Só preenche
     * campo VAZIO — nunca sobrescreve quem classificou antes.
     */
    /**
     * Conferência da conta: saldo que o banco informou no último arquivo contra o
     * calculado, e buracos de período. Recarregada ao abrir o drawer e ao trocar de
     * conta — é o que dá sentido ao painel de completude do item 2.4.
     */
    useEffect(() => {
        if (!showImportDrawer || !selectedAccountId) { setCompletudeDaConta(null); return; }
        let cancelado = false;
        (async () => {
            try {
                const r = await bankReconciliationService.conferirCompletude(selectedAccountId);
                if (!cancelado) setCompletudeDaConta((r as unknown as CompletudeDaConta) ?? null);
            } catch (e) {
                console.warn('[Extrato] conferência da conta indisponível:', e);
                if (!cancelado) setCompletudeDaConta(null);
            }
        })();
        return () => { cancelado = true; };
    }, [showImportDrawer, selectedAccountId]);

    /**
     * Gera lançamentos internos a partir do extrato JÁ CLASSIFICADO (item 2.5).
     * É como o extrato histórico vira contabilidade: sem isso a classificação fica
     * presa no extrato e não aparece na DRE.
     */
    /**
     * "Testar": mostra quantos lançamentos a regra pegaria e alguns exemplos, SEM
     * gravar. Regra aplicada às cegas sobre milhares de linhas é difícil de desfazer,
     * e conferir cinco exemplos antes não custa nada.
     */
    /**
     * Transforma uma contraparte que já foi classificada muitas vezes numa regra
     * fixa (item 2.6). A memória sabe o que costuma ser feito; a regra faz sozinha
     * na próxima importação, antes mesmo de alguém abrir a tela.
     */
    const handleSugerirRegrasDaMemoria = async () => {
        const orgId = effectiveOrgId || organizationId;
        if (!orgId) { alert('Selecione uma organização.'); return; }
        setIsLoading(true);
        try {
            const candidatas = await reconciliationMemoryService.candidatasARegra(orgId, 5);
            const jaTemRegra = new Set(rules.map(r => JSON.stringify(r.conditions).toUpperCase()));
            const nova = candidatas.find(c => c.key_kind === 'TOKEN' && !jaTemRegra.has(JSON.stringify({ type: 'contains', field: 'description_normalized', value: c.counterparty_key }).toUpperCase()));
            if (!nova) {
                alert(candidatas.length === 0
                    ? 'Ainda não há contraparte classificada vezes suficientes (5) para virar regra. Continue classificando e volte aqui.'
                    : 'As contrapartes com evidência suficiente já têm regra.');
                return;
            }
            setNewRule(prev => ({
                ...prev,
                name: `Classificação de ${nova.party_name || nova.counterparty_key}`,
                conditionValue: nova.counterparty_key,
                category: nova.category || '',
                supplierName: nova.party_type === 'CLIENT' ? '' : (nova.party_name || ''),
                clientName: nova.party_type === 'CLIENT' ? (nova.party_name || '') : '',
            }));
            setTesteDaRegra(null);
            setActionFeedback({
                message: `Regra sugerida a partir de ${nova.hits} classificações de "${nova.party_name || nova.counterparty_key}". Confira e salve.`,
                type: 'success',
            });
            setTimeout(() => setActionFeedback(null), 6000);
        } catch (err: unknown) {
            alert('Não foi possível ler a memória: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsLoading(false);
        }
    };

    const handleTestarRegra = () => {
        if (!newRule.conditionValue?.trim()) { alert('Escreva o texto que a regra deve procurar.'); return; }
        const r = bankReconciliationService.simularRegra(
            bankTransactions,
            { type: 'contains', field: 'description_normalized', value: newRule.conditionValue },
        );
        setTesteDaRegra({
            total: r.total,
            exemplos: r.exemplos.map(tx =>
                `${formatDateBR(tx.transaction_date)} · ${formatMoney(tx.amount)} · ${(tx.counterparty_name || tx.description_raw || '').slice(0, 48)}`),
        });
    };

    const handleGerarLancamentos = async (ids: string[]) => {
        if (ids.length === 0) return;
        const semCategoria = bankTransactions.filter(t => ids.includes(t.id) && !t.category).length;
        if (!await confirm({
            title: `Gerar lançamento para ${ids.length} movimento(s)?`,
            message: semCategoria > 0
                ? `Cada movimento classificado vira um lançamento já conciliado, com a mesma categoria, obra e centro de custo. ${semCategoria} da seleção estão sem categoria e serão recusados — classifique antes.`
                : 'Cada movimento vira um lançamento já conciliado, com a mesma categoria, obra e centro de custo. É assim que o extrato histórico entra na DRE.',
            confirmLabel: 'Gerar',
        })) return;

        setIsLoading(true);
        try {
            const r = await bankReconciliationService.gerarLancamentosDoExtrato(ids);
            setSelectedBankTxIds(new Set());
            await loadTransactions();
            await loadStats();
            const partes = [`${r.gerados} lançamento(s) gerado(s)`];
            if (r.sem_categoria > 0) partes.push(`${r.sem_categoria} recusado(s) por falta de categoria`);
            if (r.ja_conciliados > 0) partes.push(`${r.ja_conciliados} já estava(m) conciliado(s)`);
            setActionFeedback({ message: partes.join(' · '), type: r.gerados > 0 ? 'success' : 'error' });
            setTimeout(() => setActionFeedback(null), 6000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert('Não foi possível gerar os lançamentos: ' + msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAplicarMemoria = async () => {
        const orgId = effectiveOrgId || organizationId;
        if (!selectedAccountId) { alert('Selecione uma conta bancária.'); return; }
        if (!await confirm({
            title: 'Aplicar a memória de classificação?',
            message: 'Os lançamentos sem categoria, obra ou centro de custo recebem o que já foi decidido antes para a mesma contraparte. Nada que já esteja preenchido é alterado.',
            confirmLabel: 'Aplicar',
        })) return;

        setIsLoading(true);
        try {
            const r = await reconciliationMemoryService.aplicar(selectedAccountId, orgId);
            await loadTransactions();
            await loadStats();
            setActionFeedback({
                message: r.aplicados === 0
                    ? 'Nenhum lançamento pendente correspondeu à memória.'
                    : `${r.aplicados} lançamento(s) classificado(s) pela memória, ${r.campos} campo(s) preenchido(s).`,
                type: 'success',
            });
            setTimeout(() => setActionFeedback(null), 5000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert('Não foi possível aplicar a memória: ' + msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateInternalCategory = async (txId: string, newCategory: string) => {
        try {
            const { error } = await supabase
                .from('internal_transactions')
                .update({ category: newCategory })
                .eq('id', txId);
                
            if (error) throw error;
            
            // 1. Atualizar estado de transações internas pendentes
            setInternalTransactions(prev => prev.map(tx => 
                tx.id === txId ? { ...tx, category: newCategory } : tx
            ));

            // 2. Atualizar estado de vínculos conciliados (se existir)
            setMatches(prev => prev.map(m => {
                if (m.internal_transaction?.id === txId) {
                    return {
                        ...m,
                        internal_transaction: { ...m.internal_transaction, category: newCategory }
                    };
                }
                return m;
            }));

        } catch (error) {
            console.error('Error updating internal category:', error);
            alert('Erro ao atualizar categoria.');
        }
    };

    /**
     * "Ignorar" substitui a exclusão do extrato (09/2026). Extrato é evidência bancária:
     * a linha continua visível no Extrato como "Ignorado", sai do saldo e das pendências,
     * e o motivo fica na auditoria (fn_reconcile_ignore). Reversível.
     */
    const handleDeleteBankTransactions = async (ids: string[]) => {
        if (ids.length === 0) return;
        const msg = ids.length === 1
            ? 'O lançamento sai do saldo e das pendências e fica marcado como "Ignorado" no Extrato. Use para duplicata ou linha que não é movimento real. Pode ser revertido.'
            : `${ids.length} lançamentos saem do saldo e das pendências e ficam marcados como "Ignorado" no Extrato. Use para duplicatas ou linhas que não são movimento real. Pode ser revertido.`;
        if (!await confirm({ title: ids.length === 1 ? 'Ignorar este lançamento do extrato?' : 'Ignorar lançamentos do extrato?', message: msg, variant: 'warning', confirmLabel: 'Ignorar' })) return;

        setIsLoading(true);
        try {
            const n = await bankReconciliationService.ignoreBankTransactions(ids, 'Ignorado pelo usuário na Conciliação Bancária');

            // §22: atualiza o estado local. No Extrato a linha fica (com status novo); nas
            // demais abas ela sai, porque são recortes por status.
            setBankTransactions(prev => activeView === 'statement'
                ? prev.map(tx => (ids.includes(tx.id) ? { ...tx, status: 'IGNORED' as BankTransactionStatus } : tx))
                : prev.filter(tx => !ids.includes(tx.id)));
            setSelectedBankTxIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
            setActionFeedback({ message: `${n} lançamento${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''} como ignorado${n > 1 ? 's' : ''}.`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
            await loadStats();
        } catch (err: unknown) {
            const msg2 = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Não foi possível ignorar: ' + msg2);
        } finally {
            setIsLoading(false);
        }
    };

    /** Reverte "Ignorar": a linha volta a pendente (RULE_APPLIED se tem categoria, senão NORMALIZED). */
    const handleUnignoreBankTransactions = async (ids: string[]) => {
        if (ids.length === 0) return;
        setIsLoading(true);
        try {
            await bankReconciliationService.unignoreBankTransactions(ids);
            await loadTransactions();
            await loadStats();
            setActionFeedback({ message: `${ids.length} lançamento${ids.length > 1 ? 's' : ''} restaurado${ids.length > 1 ? 's' : ''}.`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
        } catch (err: unknown) {
            const msg2 = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Não foi possível restaurar: ' + msg2);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Toda classificação feita à mão vira conhecimento da organização (item 2.3 do
     * plano): na próxima importação, um movimento da mesma contraparte já nasce
     * classificado. Nunca bloqueia nem atrasa a ação — o movimento já foi gravado
     * quando isto roda, e a memória é melhoria, não requisito.
     */
    const lembrarClassificacao = (txId: string, classificacao: ClassificationInput) => {
        const orgId = effectiveOrgId || organizationId;
        if (!orgId) return;
        const tx = bankTransactions.find(t => t.id === txId);
        if (!tx) return;
        void reconciliationMemoryService.registrar(orgId, {
            counterparty_name: tx.counterparty_name ?? null,
            description_raw: tx.description_raw ?? null,
            description_normalized: tx.description_normalized ?? null,
        }, classificacao);
    };

    const handleUpdateBankCounterparty = async (txId: string, name: string) => {
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({ counterparty_name: name || null })
                .eq('id', txId);
            if (error) throw error;
            setBankTransactions(prev => prev.map(tx =>
                tx.id === txId ? { ...tx, counterparty_name: name || undefined } : tx
            ));
            if (name) lembrarClassificacao(txId, { party_name: name });
        } catch (error) {
            console.error('Error updating counterparty:', error);
        }
    };

    // Formata um documento (CPF/CNPJ) apenas com dígitos para exibição
    const formatDocument = (digits: string): string => {
        const d = (digits || '').replace(/\D/g, '');
        if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        return digits;
    };

    // Extrai nome + documento (CPF/CNPJ) a partir do extrato bancário
    // Limpa jargão bancário de qualquer string (counterparty_name ou description_raw)
    const cleanBankName = (s: string): string => {
        let r = s.toUpperCase();
        // Remove prefixos compostos comuns de PIX/TED antes do nome
        r = r.replace(/^[-\s]*(PIX[_\s-]*DEB|PIX[_\s-]*CRED|PIX[_\s-]*REC|TED[_\s-]*OUT|TEV[_\s-]*OUT|DOC[_\s-]*OUT)\s*/i, '');
        // Corta a partir de marcadores de memo/referência
        r = r.split(/\bMEMO\b|\bREF\b|\bDOC\b\s|\bID\b/)[0];
        // Remove palavras-jargão isoladas
        r = r.replace(/\b(PAGAMENTO|RECEBIMENTO|PIX|DEB|CRED|CREDITO|DEBITO|TED|TEF|TRANSFERENCIA|TRANSF|ENVIADO|RECEBIDO|PAG|COMPRA|CARTAO|TARIFA|BOLETO|LIQUIDACAO)\b/g, ' ');
        // Remove sequências longas de dígitos (documentos, ids)
        r = r.replace(/\d{5,}/g, ' ');
        r = r.replace(/\s+/g, ' ').trim();
        return r;
    };

    const extractEntityFromTx = (tx: BankTransaction): { name: string; document: string; type: 'PF' | 'PJ' } => {
        const raw = (tx.description_raw || tx.description_normalized || '').toString();
        const digitsOnly = raw.replace(/\D/g, '');
        let doc = '';
        // Procura por CNPJ (14) e depois CPF (11) como sequência isolada de dígitos
        const m14 = raw.match(/(?<!\d)\d{14}(?!\d)/);
        const m11 = raw.match(/(?<!\d)\d{11}(?!\d)/);
        if (m14) doc = m14[0];
        else if (m11) doc = m11[0];
        else if (digitsOnly.length === 14 || digitsOnly.length === 11) doc = digitsOnly;

        // Sempre limpar jargão bancário — counterparty_name também pode vir sujo do extrato
        const rawName = tx.counterparty_name || raw;
        const name = cleanBankName(rawName);

        const type: 'PF' | 'PJ' = doc.replace(/\D/g, '').length === 14 ? 'PJ' : 'PF';
        return { name, document: doc ? formatDocument(doc) : '', type };
    };

    const openRegisterEntity = (tx: BankTransaction) => {
        const { name, document, type } = extractEntityFromTx(tx);
        setRegisterEntityModal({
            txId: tx.id,
            kind: tx.direction === 'DEBIT' ? 'supplier' : 'client',
            name,
            document,
            type,
        });
    };

    const handleSaveNewEntity = async () => {
        if (!registerEntityModal) return;
        const { txId, kind, name, document, type } = registerEntityModal;
        if (!name.trim()) { alert('Informe o nome do ' + (kind === 'supplier' ? 'fornecedor' : 'cliente') + '.'); return; }
        const orgId = effectiveOrgId || organizationId;
        if (!orgId) { alert('Organização não identificada.'); return; }
        setSavingEntity(true);
        try {
            if (kind === 'supplier') {
                await supplierService.addSupplier({
                    name: name.trim(),
                    document: document || undefined,
                    type,
                    organization_id: orgId,
                } as Omit<Supplier, 'id' | 'created_at'>);
                setMasterSuppliers(prev => [...new Set([...prev, name.trim()])].sort());
            } else {
                await clientService.saveClient({
                    name: name.trim(),
                    document: document || undefined,
                    type,
                    organization_id: orgId,
                });
                setMasterClients(prev => [...new Set([...prev, name.trim()])].sort());
            }
            // Vincula a contraparte recém-cadastrada ao extrato
            await handleUpdateBankCounterparty(txId, name.trim());
            setRegisterEntityModal(null);
            setActionFeedback({ message: `${kind === 'supplier' ? 'Credor' : 'Cliente'} cadastrado e vinculado!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Erro ao cadastrar: ' + msg);
        } finally {
            setSavingEntity(false);
        }
    };

    const handleUpdateBankProject = async (txId: string, projectId: string) => {
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({ project_id: projectId || null })
                .eq('id', txId);
            if (error) throw error;
            setBankTransactions(prev => prev.map(tx =>
                tx.id === txId ? { ...tx, project_id: projectId || undefined } : tx
            ));
            if (projectId) lembrarClassificacao(txId, { project_id: projectId });
        } catch (error) {
            console.error('Error updating project:', error);
        }
    };

    const handleUpdateBankCostCenter = async (txId: string, costCenterId: string) => {
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({ cost_center_id: costCenterId || null })
                .eq('id', txId);
            if (error) throw error;
            setBankTransactions(prev => prev.map(tx =>
                tx.id === txId ? { ...tx, cost_center_id: costCenterId || undefined } : tx
            ));
            if (costCenterId) lembrarClassificacao(txId, { cost_center_id: costCenterId });
        } catch (error) {
            console.error('Error updating cost center:', error);
        }
    };

    const handleUpdateBankCategory = async (txId: string, newCategory: string) => {
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({ 
                    category: newCategory,
                    status: newCategory ? 'RULE_APPLIED' : 'NORMALIZED' // Eleva o status se categorizado
                })
                .eq('id', txId);
                
            if (error) throw error;
            
            // 1. Atualizar estado de transações bancárias pendentes
            setBankTransactions(prev => prev.map(tx => 
                tx.id === txId ? { 
                    ...tx, 
                    category: newCategory,
                    status: newCategory ? 'RULE_APPLIED' : 'NORMALIZED'
                 } : tx
            ));

            // 2. Atualizar estado de vínculos conciliados (se existir)
            setMatches(prev => prev.map(m => {
                if (m.bank_transaction?.id === txId) {
                    return {
                        ...m,
                        bank_transaction: { 
                            ...m.bank_transaction, 
                            category: newCategory,
                            status: newCategory ? 'RULE_APPLIED' : 'NORMALIZED'
                        }
                    };
                }
                return m;
            }));

            if (newCategory) lembrarClassificacao(txId, { category: newCategory });
        } catch (error) {
            console.error('Error updating bank category:', error);
            alert('Erro ao atualizar categoria do extrato.');
        }
    };

    const importFiles = async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0 || !selectedAccountId) return;

        setIsImporting(true);
        if (files.length > 1) {
            setImportingMessage(`Importando ${files.length} arquivos...`);
        }

        try {
            const orgId = effectiveOrgId || organizationId;
            if (!orgId) throw new Error('ID da organização não identificado. Selecione uma conta bancária.');

            const result = await bankReconciliationService.ingestMultipleFiles(files, selectedAccountId, orgId);
            const run = await bankReconciliationService.runMatchingEngineTracked(selectedAccountId, orgId, 'IMPORT');

            await loadTransactions();
            await loadStats();

            // Arquivo recusado (conta errada, formato) e linhas de saldo descartadas não podem
            // sumir em silêncio — antes eram um console.error que ninguém via.
            const avisos: string[] = [];
            if (result.rejected.length > 0) {
                avisos.push(`Arquivo(s) não importado(s):\n${result.rejected.map(r => `• ${r.file}: ${r.reason}`).join('\n')}`);
            }
            if (result.skipped > 0) avisos.push(`${result.skipped} linha(s) de saldo/total do extrato ignorada(s) — não são movimentos.`);

            if (result.inserted === 0 && result.duplicates > 0) {
                alert([`Este extrato já foi importado anteriormente.\n${result.duplicates} transação(ões) duplicada(s) ignorada(s).`, ...avisos].join('\n\n'));
            } else if (result.inserted === 0) {
                alert(['Nenhuma transação encontrada no arquivo. Verifique se é um extrato válido (OFX, CSV, CNAB ou Excel).', ...avisos].join('\n\n'));
            } else {
                const dup = result.duplicates > 0 ? ` ${result.duplicates} já existia(m) e foi(ram) ignorada(s).` : '';
                const auto = run.autoApplied > 0 ? ` ${run.autoApplied} conciliada(s) automaticamente.` : '';
                setActionFeedback({ message: `${result.inserted} transação(ões) importada(s) com sucesso!${dup}${auto}`, type: 'success' });
                setTimeout(() => setActionFeedback(null), 5000);
                if (avisos.length > 0) alert(avisos.join('\n\n'));
            }
        } catch (err: unknown) {
            const message = err instanceof Error
                ? err.message
                : (err && typeof err === 'object' && 'message' in err
                    ? String((err as { message: unknown }).message)
                    : String(err));
            alert('Erro na importação: ' + message);
            throw err;
        } finally {
            setIsImporting(false);
            setImportingMessage(null);
        }
    };

    // Mocks for initial visual state if empty
    const handleAddCategory = async (name: string) => {
        if (!name.trim()) return;
        try {
            await financialRegistryService.getOrCreateChartOfAccountByName(name);
            setManagedCategories(prev => [...prev, name.trim()].sort());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Erro ao adicionar categoria: ' + msg);
        }
    };

    const handleRenameCategory = async (oldName: string, newName: string) => {
        if (!newName || oldName === newName) return;
        const orgId = organizationId || effectiveOrgId;
        setIsLoading(true);
        try {
            // 1. Atualizar tabela mestra
            const { error: catErr } = await supabase
                .from('financial_categories')
                .update({ name: newName })
                .eq('name', oldName);
            if (catErr) throw catErr;

            // 2. Propagar para regras
            const rulesToUpdate = rules.filter(r => r.actions?.category === oldName);
            for (const rule of rulesToUpdate) {
                await supabase
                    .from('reconciliation_rules')
                    .update({ actions: { ...rule.actions, category: newName } })
                    .eq('id', rule.id);
            }

            // 3. Propagar para transações internas
            await supabase
                .from('internal_transactions')
                .update({ category: newName })
                .eq('organization_id', orgId)
                .eq('category', oldName);

            setManagedCategories(prev => prev.map(c => c === oldName ? newName : c).sort());
            await loadRules();
            await loadTransactions();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Erro ao renomear categoria: ' + msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteCategory = async (catName: string) => {
        if (!await confirm({ title: `Excluir "${catName}"?`, message: 'As transações que usam essa categoria não serão alteradas.', variant: 'danger', confirmLabel: 'Excluir' })) return;
        const orgId = organizationId || effectiveOrgId;
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('financial_categories')
                .delete()
                .eq('name', catName);
            if (error) throw error;
            setManagedCategories(prev => prev.filter(c => c !== catName));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Erro ao excluir categoria: ' + msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDuplicateCategory = async (catName: string) => {
        const newName = prompt('Novo nome para a categoria duplicada:', `${catName} (Cópia)`);
        if (!newName) return;
        await handleAddCategory(newName);
    };

    const renderCategories = () => (
        <CategoriesTab
            uniqueCategories={uniqueCategories}
            rules={rules}
            categoriesViewMode={categoriesViewMode}
            setCategoriesViewMode={setCategoriesViewMode}
            isLoading={isLoading}
            onAddCategory={handleAddCategory}
            onRenameCategory={handleRenameCategory}
            onDuplicateCategory={handleDuplicateCategory}
            onDeleteCategory={handleDeleteCategory}
            onSyncCategories={handleSyncCategories}
        />
    );

    const renderRules = () => (
        <RulesTab
            rules={rules}
            rulesViewMode={rulesViewMode}
            setRulesViewMode={setRulesViewMode}
            selectedRuleIds={selectedRuleIds}
            setSelectedRuleIds={setSelectedRuleIds}
            isLoading={isLoading}
            selectedAccountId={selectedAccountId}
            setShowRuleModal={setShowRuleModal}
            onEditRule={handleEditRule}
            onDeleteRule={handleDeleteRule}
            onApplyRulesManually={handleApplyRulesManually}
            onApplySelectedRules={handleApplySelectedRules}
        />
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <RuleFormModal
                showRuleModal={showRuleModal}
                setShowRuleModal={setShowRuleModal}
                editingRuleId={editingRuleId}
                setEditingRuleId={setEditingRuleId}
                newRule={newRule}
                setNewRule={setNewRule}
                testeDaRegra={testeDaRegra}
                isLoading={isLoading}
                uniqueCategories={uniqueCategories}
                uniqueClients={uniqueClients}
                uniqueSuppliers={uniqueSuppliers}
                onCreateRule={handleCreateRule}
                onTestarRegra={handleTestarRegra}
                onSugerirRegrasDaMemoria={handleSugerirRegrasDaMemoria}
            />

            {registerEntityModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => !savingEntity && setRegisterEntityModal(null)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 uppercase">
                                    Cadastrar {registerEntityModal.kind === 'supplier' ? 'Credor' : 'Cliente'}
                                </h3>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    Em Organização · {registerEntityModal.kind === 'supplier' ? 'Credores' : 'Clientes'} — a partir do extrato
                                </p>
                            </div>
                            <button onClick={() => setRegisterEntityModal(null)} className="text-gray-300 hover:text-gray-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nome / Razão Social</label>
                                <input
                                    type="text"
                                    value={registerEntityModal.name}
                                    onChange={(e) => setRegisterEntityModal(m => m && { ...m, name: e.target.value })}
                                    placeholder="Nome do cliente/credor"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    autoFocus
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                                    <input
                                        type="text"
                                        value={registerEntityModal.document}
                                        onChange={(e) => {
                                            const formatted = formatDocument(e.target.value);
                                            setRegisterEntityModal(m => m && {
                                                ...m,
                                                document: formatted,
                                                type: e.target.value.replace(/\D/g, '').length === 14 ? 'PJ' : (e.target.value.replace(/\D/g, '').length === 11 ? 'PF' : m.type),
                                            });
                                        }}
                                        placeholder="Documento do extrato"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Tipo</label>
                                    <select
                                        value={registerEntityModal.type}
                                        onChange={(e) => setRegisterEntityModal(m => m && { ...m, type: e.target.value as 'PF' | 'PJ' })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                                    >
                                        <option value="PF">Pessoa Física</option>
                                        <option value="PJ">Pessoa Jurídica</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 pt-0 flex gap-3">
                            <button
                                onClick={() => setRegisterEntityModal(null)}
                                disabled={savingEntity}
                                className="flex-1 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 bg-gray-50 hover:bg-gray-100 transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveNewEntity}
                                disabled={savingEntity}
                                className="flex-1 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {savingEntity ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                {savingEntity ? 'Salvando...' : 'Cadastrar e vincular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInternalTxModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 uppercase">
                                    {editingInternalTxId ? 'Editar Lançamento' : 'Novo Lançamento'}
                                </h3>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    {editingInternalTxId ? 'Atualize os dados no sistema' : 'Entrada manual no sistema'}
                                </p>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowInternalTxModal(false);
                                    setEditingInternalTxId(null);
                                }} 
                                className="text-gray-300 hover:text-gray-900 transition-colors"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Data</label>
                                    <input 
                                        type="date" 
                                        value={newInternalTx.transaction_date}
                                        onChange={(e) => setNewInternalTx({...newInternalTx, transaction_date: e.target.value})}
                                        className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Tipo</label>
                                    <select 
                                        value={newInternalTx.direction}
                                        onChange={(e) => setNewInternalTx({...newInternalTx, direction: e.target.value as 'CREDIT' | 'DEBIT'})}
                                        className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                                    >
                                        <option value="DEBIT">Saída / Débito</option>
                                        <option value="CREDIT">Entrada / Crédito</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                                <input 
                                    type="text" 
                                    value={newInternalTx.amount}
                                    onChange={(e) => setNewInternalTx({...newInternalTx, amount: e.target.value})}
                                    placeholder="0,00"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Descrição</label>
                                <input 
                                    type="text" 
                                    value={newInternalTx.description}
                                    onChange={(e) => setNewInternalTx({...newInternalTx, description: e.target.value})}
                                    placeholder="Ex: Pagamento Credor X"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Cliente/Credor</label>
                                <input
                                    type="text"
                                    value={newInternalTx.entity_name}
                                    onChange={(e) => setNewInternalTx({...newInternalTx, entity_name: e.target.value})}
                                    placeholder="Ex: João da Silva / Loja de Ferragens"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                        </div>
                        <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={() => {
                                    setShowInternalTxModal(false);
                                    setEditingInternalTxId(null);
                                }}
                                className="flex-1 px-6 py-4 bg-white border border-gray-100 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleCreateInternalTx}
                                disabled={isLoading}
                                className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                        Processando...
                                    </>
                                ) : (
                                    editingInternalTxId ? 'Atualizar' : 'Lançar'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <BankStatementImportDrawer
                open={showImportDrawer}
                onClose={() => setShowImportDrawer(false)}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
                competencia={competencia}
                onSelectCompetencia={(year, month) => {
                    const val = `${year}-${month}`;
                    setCompetencia(val);
                    const [y, m] = [parseInt(year), parseInt(month)];
                    const lastDay = new Date(y, m, 0).getDate();
                    setStartDate(`${val}-01`);
                    setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                }}
                onClearCompetencia={() => { setCompetencia(''); setStartDate(''); setEndDate(''); }}
                completude={completudeDaConta}
                isImporting={isImporting}
                importingMessage={importingMessage}
                onImportFiles={importFiles}
            />

            {/* Toast de Notificação — padrão guia seção 13 */}
            {actionFeedback && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    actionFeedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {actionFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {actionFeedback.message}
                </div>
            )}

            {/* Cabeçalho de tela — guia §20 */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[activeView].title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[activeView].subtitle}</p>
            </div>

            {/* Toolbar de abas — guia §19/§20.1 (mb-3: ritmo de cromo, metade do space-y-6 raiz) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                {/* Barra de abas local — escala compacta (guia §19). flex-wrap em vez de
                    overflow-x-auto: com 9 abas, rolagem horizontal (mesmo sem scrollbar
                    visível) corta texto no meio sem nenhum indício de que há mais abas —
                    quebra de linha garante que todas ficam sempre visíveis. */}
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => setActiveView('statement')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'statement' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Extrato
                    </button>
                    <button
                        onClick={() => setActiveView('center')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'center' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Central
                    </button>
                    <button
                        onClick={() => setActiveView('divergences')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'divergences' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Divergências
                    </button>
                    <button
                        onClick={() => setActiveView('anomalies')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'anomalies' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Anomalias
                    </button>
                    <button
                        onClick={() => setActiveView('pending')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Pendentes
                    </button>
                    <button
                        onClick={() => setActiveView('conciliated')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'conciliated' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Conciliados
                    </button>
                    <button
                        onClick={() => setActiveView('rules')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'rules' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Regras
                    </button>
                    <button
                        onClick={() => setActiveView('categories')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'categories' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Categorias
                    </button>
                    <button
                        onClick={() => setActiveView('close')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'close' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Fechamento
                    </button>
                    <button
                        onClick={() => setActiveView('prolabore')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeView === 'prolabore' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Pró-labore
                    </button>
                </div>
            </div>

            {/* Header / Stats — variante flat (bare icon, sentence case, sem sombra),
                igual à tela de referência SupplierList.tsx. Grade simétrica: os 4 KPIs
                são métricas independentes, sem relação total→decomposição (guia §4.2).
                Só na aba Dashboard: os KPIs refletem a aba ativa (guia — ANATOMIA DA
                TELA), e "Pendentes"/"Automação"/"Regras ativas"/"Atenção" são uma visão
                geral do módulo, não dado específico de Extrato/Central/Regras/etc. */}
            {/* mb-3 — ritmo de cromo do guia §20.1: o bloco de controles (KPIs → botões →
                toolbar acoplada) respira 12px, metade do space-y-6 do container raiz. */}
            {activeView === 'dashboard' && (
                <div className="relative mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Pendentes"
                            value={bankTransactions.length}
                            sub="Transações no extrato"
                            icon={<ArrowRightLeft className="w-4 h-4" />}
                            color="blue"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Automação"
                            value={`${stats.automationRate}%`}
                            sub="Conciliadas por regra"
                            icon={<Zap className="w-4 h-4" />}
                            color="emerald"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Regras ativas"
                            value={rules.length}
                            sub="Regras de conciliação"
                            icon={<ShieldCheck className="w-4 h-4" />}
                            color="purple"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Atenção"
                            value={internalTransactions.length}
                            sub="Lançamentos internos pendentes"
                            icon={<AlertCircle className="w-4 h-4" />}
                            color="amber"
                        />
                    </div>
                </div>
            )}

            {/* Toolbar de botões — guia §5.3/§20.1 (mb-3: ritmo de cromo, metade do space-y-6 raiz) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={selectedAccountId || ''}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                        <option value="">Selecione uma conta...</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} - {acc.account_number}</option>
                        ))}
                    </select>

                    {/* Filtro de competência — ano isolado (ano todo) ou ano+mês */}
                    <div className="flex items-center gap-1.5 h-9 bg-indigo-50 px-2.5 rounded-[6px] border border-indigo-100">
                        <span className="text-xs font-medium text-indigo-400">Competência</span>
                        <select
                            value={competencia ? competencia.split('-')[0] : ''}
                            onChange={(e) => {
                                const year = e.target.value;
                                if (!year) {
                                    setCompetencia('');
                                    setStartDate('');
                                    setEndDate('');
                                    return;
                                }
                                const month = competencia.includes('-') ? competencia.split('-')[1] : '';
                                if (month) {
                                    const val = `${year}-${month}`;
                                    setCompetencia(val);
                                    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                                    setStartDate(`${val}-01`);
                                    setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                                } else {
                                    setCompetencia(year);
                                    setStartDate(`${year}-01-01`);
                                    setEndDate(`${year}-12-31`);
                                }
                            }}
                            className="bg-transparent border-none text-xs font-semibold text-indigo-700 focus:ring-0 p-0 w-14 cursor-pointer"
                        >
                            <option value="">Ano</option>
                            {/* Faixa alargada pra trás (era -5, cobria só até 2021) — extrato
                                bancário pode ter competências bem mais antigas que 5 anos. */}
                            {Array.from({length: 19}, (_, i) => new Date().getFullYear() - 15 + i).map(year => (
                                <option key={year} value={String(year)}>{year}</option>
                            ))}
                        </select>
                        <select
                            value={competencia.includes('-') ? competencia.split('-')[1] : ''}
                            disabled={!competencia}
                            onChange={(e) => {
                                const month = e.target.value;
                                const year = competencia.split('-')[0];
                                if (!year) return;
                                if (month) {
                                    const val = `${year}-${month}`;
                                    setCompetencia(val);
                                    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                                    setStartDate(`${val}-01`);
                                    setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                                } else {
                                    setCompetencia(year);
                                    setStartDate(`${year}-01-01`);
                                    setEndDate(`${year}-12-31`);
                                }
                            }}
                            className="bg-transparent border-none text-xs font-semibold text-indigo-700 focus:ring-0 p-0 w-16 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <option value="">Ano todo</option>
                            {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => (
                                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                            ))}
                        </select>
                        {competencia && (
                            <button
                                onClick={() => { setCompetencia(''); setStartDate(''); setEndDate(''); }}
                                className="text-indigo-300 hover:text-red-500 hover:bg-red-50 rounded-[4px] transition-all"
                                title="Limpar competência"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filtro de período livre */}
                    <div className="flex gap-1.5 items-center h-9 bg-gray-50 px-2.5 rounded-[6px] border border-gray-100">
                        <input
                            type="date"
                            title="Início"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setCompetencia(''); }}
                            className="bg-transparent border-none text-xs font-semibold text-gray-700 focus:ring-0 p-0 w-[92px]"
                        />
                        <div className="w-px h-5 bg-gray-200" />
                        <input
                            type="date"
                            title="Fim"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setCompetencia(''); }}
                            className="bg-transparent border-none text-xs font-semibold text-gray-700 focus:ring-0 p-0 w-[92px]"
                        />
                        {(startDate || endDate) && !competencia && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-[4px] transition-all"
                                title="Limpar Filtros"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {(activeView === 'pending' || activeView === 'statement') && (
                        <button
                            onClick={handleAplicarMemoria}
                            disabled={isLoading || !selectedAccountId}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-100 transition-all disabled:opacity-50 border border-blue-100/50"
                            title="Aplicar memória: classifica os lançamentos vazios com o que já foi decidido para a mesma contraparte"
                        >
                            <Brain className="w-4 h-4" />
                        </button>
                    )}

                    {activeView === 'pending' && (
                        <button
                            onClick={handleApplyRulesManually}
                            disabled={isLoading || !selectedAccountId}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-100 transition-all disabled:opacity-50 border border-blue-100/50"
                            title="Aplicar Regras Manualmente"
                        >
                            <Zap className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Ações — §17. "Sincronizar"/"Novo" só na aba Pendentes (Lançamentos);
                    saíram da toolbar acoplada da tabela para aqui, junto do resto das ações. */}
                <div className="flex items-center gap-2 shrink-0">
                    {activeView === 'pending' && (
                        <>
                            <button
                                onClick={handleSyncAllData}
                                disabled={isLoading}
                                className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium border transition-all ${
                                    isLoading
                                        ? 'bg-blue-50 text-blue-300 border-blue-100 animate-pulse'
                                        : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'
                                }`}
                                title="Sincronizar nomes de Clientes/Fornecedores dos Projetos"
                            >
                                <RefreshCw className={`w-[15px] h-[15px] ${isLoading ? 'animate-spin' : ''}`} />
                                {isLoading ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                            <button
                                onClick={() => setShowInternalTxModal(true)}
                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-emerald-600 bg-white border border-emerald-100 hover:bg-emerald-50 transition-all"
                            >
                                <Plus className="w-[15px] h-[15px]" />
                                Novo
                            </button>
                        </>
                    )}

                    {/* Botão primário — variante compacta (guia §17) */}
                    <button
                        onClick={() => setShowImportDrawer(true)}
                        disabled={isImporting}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {isImporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                <span>{importingMessage || 'Importando...'}</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-[15px] h-[15px]" />
                                <span>Importar extrato</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Bulk Action Bar — Extrato (padrão simples: contagem + Editar em Lote + Desmarcar,
                igual ao BoletoManager, com o modal cuidando dos campos) */}
            {activeView === 'statement' && selectedBankTxIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedBankTxIds.size} lançamento{selectedBankTxIds.size !== 1 ? 's' : ''} selecionado{selectedBankTxIds.size !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">
                            · {formatMoney(sortedBankTransactions.filter(tx => selectedBankTxIds.has(tx.id)).reduce((s, tx) => s + (tx.amount ?? 0), 0))}
                        </span>
                    </span>
                    <button
                        onClick={() => setIsLoteEditOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-50 transition-colors"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar em Lote
                    </button>
                    <button
                        onClick={() => setSelectedBankTxIds(new Set())}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {isLoteEditOpen && (
                <BankTxEdicaoEmLoteModal
                    transactions={sortedBankTransactions.filter(tx => selectedBankTxIds.has(tx.id))}
                    categories={uniqueCategories}
                    clientOptions={uniqueClients}
                    supplierOptions={uniqueCredores}
                    projects={masterProjects}
                    costCenters={masterCostCenters}
                    onClose={() => setIsLoteEditOpen(false)}
                    onSave={handleBulkUpdateBankFields}
                />
            )}

            {/* Bulk Action Bar - Refinada (demais visões: pendências/conciliação, bank + internal) */}
            {activeView !== 'statement' && (selectedBankTxIds.size > 0 || selectedInternalTxIds.size > 0) && (() => {
                const bankCount = selectedBankTxIds.size;
                const internalCount = selectedInternalTxIds.size;
                const totalCount = bankCount + internalCount;
                
                // Verificar se há itens selecionados que estão ocultos pelos filtros atuais
                const visibleBankIds = new Set(sortedBankTransactions.map(tx => tx.id));
                const visibleInternalIds = new Set(sortedInternalTransactions.map(tx => tx.id));
                
                let hiddenBankCount = 0;
                selectedBankTxIds.forEach(id => { if (!visibleBankIds.has(id)) hiddenBankCount++; });
                
                let hiddenInternalCount = 0;
                selectedInternalTxIds.forEach(id => { if (!visibleInternalIds.has(id)) hiddenInternalCount++; });
                
                const totalHidden = hiddenBankCount + hiddenInternalCount;

                return (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-gray-900 text-white px-6 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex -space-x-2">
                            {bankCount > 0 && (
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center ring-2 ring-gray-900 border border-white/20" title={`${bankCount} extratos`}>
                                    <FileText className="w-4 h-4 text-white" />
                                </div>
                            )}
                            {internalCount > 0 && (
                                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-gray-900 border border-white/20" title={`${internalCount} lançamentos`}>
                                    <Check className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col">
                            <span className="text-xs font-black tracking-tight leading-none">
                                {totalCount} item{totalCount > 1 ? 'ns' : ''} selecionado{totalCount > 1 ? 's' : ''}
                            </span>
                            {totalHidden > 0 && (
                                <span className="text-xs font-bold text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Info className="w-3 h-3 text-amber-500" />
                                    {totalHidden} oculto{totalHidden > 1 ? 's' : ''} por filtros
                                </span>
                            )}
                        </div>

                        <div className="w-px h-8 bg-white/20 mx-1" />

                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <Tag className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-blue-400 transition-colors" />
                                <select
                                    id="bulk-cat-select"
                                    defaultValue=""
                                    className="bg-white/10 border border-white/20 text-white text-xs font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none min-w-[180px] hover:bg-white/20"
                                >
                                    <option value="" disabled className="text-gray-900 bg-white">Categorizar em lote...</option>
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat} className="text-gray-900 bg-white font-bold">{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10">
                                {bankCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-cat-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione uma categoria.'); return; }
                                            handleBulkUpdateCategory('bank', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Extratos ({bankCount})
                                    </button>
                                )}
                                {bankCount > 0 && internalCount > 0 && <div className="w-px h-4 bg-white/10 mx-1" />}
                                {internalCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-cat-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione uma categoria.'); return; }
                                            handleBulkUpdateCategory('internal', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Internos ({internalCount})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-white/20 mx-1" />

                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <Users className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-purple-400 transition-colors" />
                                <select
                                    id="bulk-entity-select"
                                    defaultValue=""
                                    className="bg-white/10 border border-white/20 text-white text-xs font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none min-w-[200px] hover:bg-white/20"
                                >
                                    <option value="" disabled className="text-gray-900 bg-white">Credor/cliente em lote...</option>
                                    {uniqueClients.length > 0 && (
                                        <optgroup label="Clientes" className="text-gray-900 bg-white">
                                            {uniqueClients.map(c => (
                                                <option key={`c-${c}`} value={c} className="text-gray-900 bg-white font-bold">{c}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {uniqueCredores.length > 0 && (
                                        <optgroup label="Credores" className="text-gray-900 bg-white">
                                            {uniqueCredores.map(s => (
                                                <option key={`cr-${s}`} value={s} className="text-gray-900 bg-white font-bold">{s}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>

                            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10">
                                {bankCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-entity-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione um fornecedor ou cliente.'); return; }
                                            handleBulkUpdateEntityName('bank', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Extratos ({bankCount})
                                    </button>
                                )}
                                {bankCount > 0 && internalCount > 0 && <div className="w-px h-4 bg-white/10 mx-1" />}
                                {internalCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-entity-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione um fornecedor ou cliente.'); return; }
                                            handleBulkUpdateEntityName('internal', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Internos ({internalCount})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-white/20 mx-1" />

                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <Briefcase className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-sky-400 transition-colors" />
                                <select
                                    id="bulk-project-select"
                                    defaultValue=""
                                    className="bg-white/10 border border-white/20 text-white text-xs font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all appearance-none min-w-[180px] hover:bg-white/20"
                                >
                                    <option value="" disabled className="text-gray-900 bg-white">Obra em lote...</option>
                                    {masterProjects.map(p => (
                                        <option key={p.id} value={p.id} className="text-gray-900 bg-white font-bold">{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10">
                                {bankCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-project-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione uma obra.'); return; }
                                            handleBulkUpdateProject('bank', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Extratos ({bankCount})
                                    </button>
                                )}
                                {bankCount > 0 && internalCount > 0 && <div className="w-px h-4 bg-white/10 mx-1" />}
                                {internalCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-project-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione uma obra.'); return; }
                                            handleBulkUpdateProject('internal', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Internos ({internalCount})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-white/20 mx-1" />

                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <Briefcase className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-violet-400 transition-colors" />
                                <select
                                    id="bulk-costcenter-select"
                                    defaultValue=""
                                    className="bg-white/10 border border-white/20 text-white text-xs font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all appearance-none min-w-[200px] hover:bg-white/20"
                                >
                                    <option value="" disabled className="text-gray-900 bg-white">Centro de Custo em lote...</option>
                                    {masterCostCenters.map(c => (
                                        <option key={c.id} value={c.id} className="text-gray-900 bg-white font-bold">{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10">
                                {bankCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-costcenter-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione um centro de custo.'); return; }
                                            handleBulkUpdateCostCenter('bank', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Extratos ({bankCount})
                                    </button>
                                )}
                                {bankCount > 0 && internalCount > 0 && <div className="w-px h-4 bg-white/10 mx-1" />}
                                {internalCount > 0 && (
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('bulk-costcenter-select') as HTMLSelectElement;
                                            if (!sel?.value) { alert('Selecione um centro de custo.'); return; }
                                            handleBulkUpdateCostCenter('internal', sel.value);
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        Internos ({internalCount})
                                    </button>
                                )}
                            </div>
                        </div>

                        {bankCount > 0 && (
                            <>
                                <div className="w-px h-8 bg-white/20 mx-1" />
                                <button
                                    onClick={() => handleGerarLancamentos(Array.from(selectedBankTxIds))}
                                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 text-white"
                                    title="Gerar lançamento interno já conciliado para cada movimento classificado"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Gerar lançamentos ({bankCount})
                                </button>
                                <button
                                    onClick={() => handleDeleteBankTransactions(Array.from(selectedBankTxIds))}
                                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest bg-blue-500 hover:bg-blue-400 transition-all shadow-lg active:scale-95 text-white"
                                    title="Marcar os lançamentos selecionados como ignorados (não são movimento real)"
                                >
                                    <EyeOff className="w-3.5 h-3.5" />
                                    Ignorar ({bankCount})
                                </button>
                            </>
                        )}

                        <button
                            onClick={() => { setSelectedBankTxIds(new Set()); setSelectedInternalTxIds(new Set()); }}
                            className="w-10 h-10 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center group"
                            title="Limpar seleção (Esc)"
                        >
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                );
            })()}

            {/* Main Content Area */}
            {activeView === 'dashboard' ? (
                <ReconciliationDashboardView organizationId={organizationId} />
            ) : activeView === 'center' ? (
                <SmartReconciliationCenter
                    organizationId={organizationId}
                    selectedAccountId={selectedAccountId}
                    suggestions={suggestions as never}
                    bankTransactions={bankTransactions as never}
                    onConfirm={handleConfirmMatch}
                    onReject={handleRejectSuggestion}
                    onReload={async () => { await loadTransactions(); await loadStats(); }}
                />
            ) : activeView === 'divergences' ? (
                <DivergencesPanel organizationId={organizationId} onChanged={() => { loadTransactions(); loadStats(); }} />
            ) : activeView === 'anomalies' ? (
                <AnomaliesPanel organizationId={organizationId} />
            ) : activeView === 'close' ? (
                <FinancialClosePanel organizationId={organizationId} />
            ) : activeView === 'prolabore' ? (
                <ProlaboreReconciliationPanel organizationId={organizationId} />
            ) : activeView === 'rules' ? (
                renderRules()
            ) : activeView === 'categories' ? (
                renderCategories()
            ) : activeView === 'conciliated' ? (
                <ConciliatedTab
                    matches={matches}
                    sortedMatches={sortedMatches}
                    conciliatedViewMode={conciliatedViewMode}
                    setConciliatedViewMode={setConciliatedViewMode}
                    matchSortOrder={matchSortOrder}
                    setMatchSortOrder={setMatchSortOrder}
                    categoryOptions={categoryOptions}
                    onUndoMatch={handleUndoMatch}
                    onUpdateBankCategory={handleUpdateBankCategory}
                    onUpdateInternalCategory={handleUpdateInternalCategory}
                />
            ) : (activeView === 'pending' || activeView === 'statement') ? (
                <div className="space-y-6">
                    {activeView === 'pending' && (
                    <div className="flex justify-end px-4 -mb-4">
                        <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                            <button
                                onClick={() => setPendentesViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${pendentesViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em Linha"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPendentesCompact(c => !c)}
                                className={`p-2 rounded-lg transition-all ${pendentesCompact ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização Compacta"
                            >
                                <Rows3 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPendentesViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${pendentesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em Grade"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    )}

                    <div className={activeView === 'statement' ? "grid grid-cols-1 gap-8 min-h-[500px]" : "grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[500px]"}>
                    {/* Left: Bank Statement */}
                    <div className="space-y-4">
                        {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — só na
                            aba Extrato (activeView === 'statement'); a aba Pendentes (grid-cols-2,
                            estilo antigo rounded-[2.5rem]) não é tocada — o wrapper vira Fragment
                            nesse caso, sem alterar o layout existente. */}
                        {(() => {
                            // Acoplada (§5.2): Extrato (sempre) e Pendentes em modo lista (era o gap
                            // reportado pelo usuário — toolbar solta acima de um card de tabela à parte).
                            const useAcoplada = activeView === 'statement' || (activeView === 'pending' && pendentesViewMode === 'list');
                            const StatementCardWrapper: React.ElementType = useAcoplada ? 'div' : React.Fragment;
                            const wrapperProps = useAcoplada
                                ? { className: 'bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden' }
                                : {};
                            return (
                        <StatementCardWrapper {...wrapperProps}>
                        {/* Na aba Pendentes as duas tabelas ficam lado a lado; a da direita já se
                            identifica como "Lançamentos", então a da esquerda precisa do rótulo
                            equivalente ("Extrato") — sem ele o usuário não sabe qual é qual.
                            Na aba Extrato o título da tela já diz isso, então não se repete. */}
                        {useAcoplada && activeView === 'pending' && (
                            <div className="flex items-center px-2 pt-2">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Download className="w-4 h-4" />
                                    Extrato
                                </h4>
                            </div>
                        )}
                        <div className={useAcoplada
                            ? "flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white"
                            : "flex flex-wrap justify-between items-center gap-y-2 px-4"}>
                            {!useAcoplada && (
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Download className="w-4 h-4" />
                                Extrato Bancário
                            </h4>
                            )}
                            {useAcoplada && (
                            <div className="flex-1 relative w-full order-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por descrição, categoria ou cliente/fornecedor..."
                                    value={bankSearch}
                                    onChange={(e) => setBankSearch(e.target.value)}
                                    className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                                {bankSearch && (
                                    <button
                                        onClick={() => setBankSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Limpar busca"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            )}
                            <div className={useAcoplada ? "flex items-center gap-2 order-2 shrink-0" : "flex flex-wrap items-center gap-2 gap-y-2"}>
                                {/* Tudo/Receitas/Despesas agrupados num dropdown — antes eram 3 botões
                                    soltos no toolbar acoplado. */}
                                <div className="relative shrink-0">
                                    <button
                                        onClick={() => { setFlowFilterDropdownOpen(o => !o); setBankCatDropdownOpen(false); setBankCpDropdownOpen(false); }}
                                        className={`h-9 px-2.5 border rounded-[6px] text-xs font-medium focus:outline-none cursor-pointer flex items-center gap-1.5 ${
                                            flowFilter === 'INCOME' ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                            : flowFilter === 'EXPENSE' ? 'bg-red-50 border-red-200 text-red-600'
                                            : 'bg-gray-50 border-gray-100 text-gray-700'
                                        }`}
                                    >
                                        {flowFilter === 'INCOME' ? 'Receitas' : flowFilter === 'EXPENSE' ? 'Despesas' : 'Tudo'}
                                        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {flowFilterDropdownOpen && (
                                        <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-[10px] shadow-xl min-w-[130px] py-1">
                                            {([{ value: 'ALL', label: 'Tudo' }, { value: 'INCOME', label: 'Receitas' }, { value: 'EXPENSE', label: 'Despesas' }] as const).map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => { setFlowFilter(opt.value); setFlowFilterDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${flowFilter === opt.value ? 'font-semibold text-blue-600' : 'font-normal text-gray-700'}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => { setBankCatDropdownOpen(o => !o); setInternalCatDropdownOpen(false); setBankCpDropdownOpen(false); }}
                                        className={`h-9 px-2.5 border rounded-[6px] text-xs font-medium focus:outline-none cursor-pointer flex items-center gap-1.5 ${bankCategoryFilter.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                    >
                                        {bankCategoryFilter.length > 0 ? `${bankCategoryFilter.length} categoria${bankCategoryFilter.length > 1 ? 's' : ''}` : 'Todas categorias'}
                                        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {bankCatDropdownOpen && (
                                        <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-[10px] shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                            <div className="flex border-b border-gray-100 mb-1">
                                                <button onClick={() => setBankCategoryFilter(['__none__', ...uniqueCategories])} className="flex-1 px-3 py-1.5 text-xs font-semibold text-blue-500 hover:bg-blue-50 text-left">Selecionar todos</button>
                                                <button onClick={() => setBankCategoryFilter([])} className="flex-1 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 text-right">Limpar</button>
                                            </div>
                                            {[{ value: '__none__', label: '— Sem categoria' }, ...uniqueCategories.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={bankCategoryFilter.includes(value)}
                                                        onChange={() => setBankCategoryFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                        className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-0"
                                                    />
                                                    <span className="text-sm font-normal text-gray-700 truncate">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => { setBankCpDropdownOpen(o => !o); setBankCatDropdownOpen(false); setInternalCatDropdownOpen(false); }}
                                        className={`h-9 px-2.5 border rounded-[6px] text-xs font-medium focus:outline-none cursor-pointer flex items-center gap-1.5 ${bankCounterpartyFilter.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                    >
                                        {bankCounterpartyFilter.length > 0 ? `${bankCounterpartyFilter.length} contraparte${bankCounterpartyFilter.length > 1 ? 's' : ''}` : 'Cliente/credor'}
                                        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {bankCpDropdownOpen && (
                                        <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-[10px] shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                            <div className="flex border-b border-gray-100 mb-1">
                                                <button onClick={() => setBankCounterpartyFilter(['__none__', ...uniqueBankCounterparties])} className="flex-1 px-3 py-1.5 text-xs font-semibold text-blue-500 hover:bg-blue-50 text-left">Selecionar todos</button>
                                                <button onClick={() => setBankCounterpartyFilter([])} className="flex-1 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 text-right">Limpar</button>
                                            </div>
                                            {uniqueBankCounterparties.length === 0 && (
                                                <div className="px-3 py-2 text-xs font-medium text-gray-400">Nenhuma contraparte no extrato</div>
                                            )}
                                            {[{ value: '__none__', label: '— Sem cliente/fornecedor' }, ...uniqueBankCounterparties.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={bankCounterpartyFilter.includes(value)}
                                                        onChange={() => setBankCounterpartyFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                        className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-0"
                                                    />
                                                    <span className="text-sm font-normal text-gray-700 truncate">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {activeView === 'statement' && (
                                    <div className="flex items-center h-9">
                                        <AdvancedFilterPanel fields={STATEMENT_FILTER_FIELDS} state={statementAdvancedFilters} />
                                    </div>
                                )}
                                {activeView === 'statement' && (
                                    <button
                                        onClick={loadTransactions}
                                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                                        title="Atualizar"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                )}
                                {!useAcoplada && (
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
                                    <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
                                    <select
                                        value={bankSortField}
                                        onChange={(e) => setBankSortField(e.target.value as typeof bankSortField)}
                                        className="text-xs font-bold bg-transparent focus:outline-none cursor-pointer text-gray-400 appearance-none"
                                    >
                                        <option value="date">Data</option>
                                        <option value="amount">Valor</option>
                                        <option value="description">Descrição</option>
                                        <option value="category">Categoria</option>
                                        <option value="counterparty">Cliente/Credor</option>
                                    </select>
                                    <button
                                        onClick={() => setBankSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                                        className="ml-1 text-gray-400 hover:text-blue-600 transition-colors"
                                        title={bankSortOrder === 'desc' ? 'Decrescente' : 'Crescente'}
                                    >
                                        {bankSortOrder === 'desc' ? '↓' : '↑'}
                                    </button>
                                </div>
                                )}
                                {!useAcoplada && (
                                <div className="relative">
                                    <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtro..."
                                        value={bankSearch}
                                        onChange={(e) => setBankSearch(e.target.value)}
                                        className="pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 w-24 focus:w-32 transition-all"
                                    />
                                    {bankSearch && (
                                        <button
                                            onClick={() => setBankSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            title="Limpar filtro"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                )}
                                {activeView === 'statement' && (
                                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                        <ColumnConfigButton
                                            columns={STATEMENT_COLUMNS.filter(c => c.key !== 'actions')}
                                            visibleColumns={tableColumns.visibleColumns}
                                            showColumnConfig={tableColumns.showColumnConfig}
                                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                            onToggleColumn={tableColumns.toggleColumn}
                                            onReset={tableColumns.resetColumns}
                                        />
                                        {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                            Duplo clique no divisor segue "restaurar padrão". */}
                                        <button
                                            onClick={() => statementResize.autoFit()}
                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                            title="Ajustar largura das colunas ao conteúdo"
                                        >
                                            <MoveHorizontal className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                {activeView === 'pending' && pendentesViewMode === 'list' && (
                                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                        <ColumnConfigButton
                                            columns={PENDING_BANK_COLUMNS.filter(c => c.key !== 'actions')}
                                            visibleColumns={pendingBankColumns.visibleColumns}
                                            showColumnConfig={pendingBankColumns.showColumnConfig}
                                            onToggleShow={() => pendingBankColumns.setShowColumnConfig(!pendingBankColumns.showColumnConfig)}
                                            onToggleColumn={pendingBankColumns.toggleColumn}
                                            onReset={pendingBankColumns.resetColumns}
                                        />
                                        {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                            Duplo clique no divisor segue "restaurar padrão". */}
                                        <button
                                            onClick={() => pendingBankResize.autoFit()}
                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                            title="Ajustar largura das colunas ao conteúdo"
                                        >
                                            <MoveHorizontal className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={activeView === 'statement' ? '' : `min-h-[400px] ${pendentesViewMode === 'grid' ? 'bg-transparent border-none shadow-none' : 'bg-transparent'}`}>
                            {activeView === 'statement' ? (
                                isLoading && bankTransactions.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                        <p className="mt-2 text-gray-500">Carregando extrato...</p>
                                    </div>
                                ) : bankTransactions.length === 0 ? (
                                    <div className="text-center py-12">
                                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum extrato importado</h3>
                                        <p className="text-sm text-gray-500">Importe um arquivo OFX, CSV, CNAB ou Excel (XLSX) para começar.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="overflow-auto max-h-[70vh]">
                                        <table ref={statementResize.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: statementTableTotalWidth, minWidth: '100%' }}>
                                            <colgroup>
                                                <col style={{ width: '40px' }} />
                                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions' && isStatementColumnVisibleForFlow(key, flowFilter)).map(key => (
                                                    <col key={key} data-col-key={key} style={{ width: `${statementResize.getWidth(key)}px` }} />
                                                ))}
                                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                                    borda de "Ações" não andar a cada redimensionamento. */}
                                                <col />
                                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${statementResize.getWidth('actions')}px` }} />}
                                            </colgroup>
                                            <thead>
                                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={pagedBankTransactions.length > 0 && pagedBankTransactions.every(tx => selectedBankTxIds.has(tx.id))}
                                                            onChange={(e) => {
                                                                // Marca só o que está visível na página — marcar linha
                                                                // que o usuário não vê seria armadilha numa ação em lote.
                                                                if (e.target.checked) {
                                                                    setSelectedBankTxIds(new Set([...selectedBankTxIds, ...pagedBankTransactions.map(tx => tx.id)]));
                                                                } else {
                                                                    const next = new Set(selectedBankTxIds);
                                                                    pagedBankTransactions.forEach(tx => next.delete(tx.id));
                                                                    setSelectedBankTxIds(next);
                                                                }
                                                            }}
                                                        />
                                                    </th>
                                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions' && isStatementColumnVisibleForFlow(key, flowFilter)).map(key => {
                                                        const def = STATEMENT_COLUMN_HEADERS[key];
                                                        if (!def) return null;
                                                        // colKey precisa ser a chave REAL da coluna (bate com orderedVisibleColumns) —
                                                        // é o que moveColumn usa para identificar origem/destino do arraste. 'client'
                                                        // e 'creditor' ordenam pelo mesmo campo ('counterparty'), então o destaque de
                                                        // "coluna ativa" é simulado comparando bankSortField ao sortField da própria
                                                        // coluna e reaproveitando `key` como sortColumn quando bate (mesmo efeito
                                                        // visual do colKey="counterparty" compartilhado que existia antes do drag).
                                                        return (
                                                            <SortableHeader
                                                                key={key} colKey={key} label={def.label} sortable={!!def.sortField} uppercase={false}
                                                                sortColumn={def.sortField && bankSortField === def.sortField ? key : null}
                                                                sortDirection={bankSortOrder}
                                                                onSort={def.sortField ? sortBankBy(def.sortField) : undefined}
                                                                onMoveColumn={tableColumns.moveColumn}
                                                                className={def.className}
                                                            >
                                                                <statementResize.ResizeHandle colKey={key} />
                                                            </SortableHeader>
                                                        );
                                                    })}
                                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                                    {tableColumns.visibleColumns.includes('actions') && (
                                                        <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                            Ações
                                                            <statementResize.ResizeHandle colKey="actions" />
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {pagedBankTransactions.map((tx, pageRowIndex) => {
                                                    // Índice global — o Shift+clique (§10.1) recorta
                                                    // sobre a lista inteira, não sobre a página.
                                                    const rowIndex = statementPageStart + pageRowIndex;
                                                    const cpKey = (tx.counterparty_name || '').trim().toLowerCase();
                                                    const cpRegistered = tx.direction === 'DEBIT' ? masterSuppliersLower.has(cpKey) : masterClientsLower.has(cpKey);
                                                    const statementCtx: StatementRowCtx = {
                                                        cpRegistered,
                                                        clienteOptions, credorOptions, categoryOptions, projectOptions, costCenterOptions,
                                                        projectName, costCenterName,
                                                        onUpdateCounterparty: handleUpdateBankCounterparty,
                                                        onUpdateCategory: handleUpdateBankCategory,
                                                        onUpdateProject: handleUpdateBankProject,
                                                        onUpdateCostCenter: handleUpdateBankCostCenter,
                                                        onRegisterEntity: openRegisterEntity,
                                                        onRejectRule: handleRejectRule,
                                                        onConfirmMatch: handleConfirmMatch,
                                                    };
                                                    return (
                                                        <tr key={tx.id} className="hover:bg-blue-50/50 transition-colors">
                                                            <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                    checked={selectedBankTxIds.has(tx.id)}
                                                                    onChange={(e) => handleStatementRowCheck(tx.id, rowIndex, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                                                                />
                                                            </td>
                                                            {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions' && isStatementColumnVisibleForFlow(key, flowFilter)).map(key => (
                                                                <td key={key} className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 ${STATEMENT_TD_CLASS[key] || ''}`}>
                                                                    {renderStatementCell(key, tx, statementCtx)}
                                                                </td>
                                                            ))}
                                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                            {tableColumns.visibleColumns.includes('actions') && (
                                                                <td className="px-6 py-2.5 text-right">
                                                                    {tx.status === 'IGNORED' ? (
                                                                        <ActionIconButton kind="history" title="Restaurar lançamento ignorado" onClick={() => handleUnignoreBankTransactions([tx.id])} />
                                                                    ) : (
                                                                        <ActionIconButton kind="edit" title="Ignorar lançamento (não é movimento real)" icon={<EyeOff className="w-4 h-4" />} onClick={() => handleDeleteBankTransactions([tx.id])} />
                                                                    )}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        </div>
                                        {/* Rodapé de paginação (§6.7) — o carregamento traz o período
                                            inteiro; aqui só se navega sobre o que já está em memória. */}
                                        <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {sortedBankTransactions.length === 0
                                                        ? 'Nenhum lançamento'
                                                        : `${statementPageStart + 1}–${Math.min(statementPageStart + statementPageSize, sortedBankTransactions.length)} de ${sortedBankTransactions.length}`}
                                                </span>
                                                <select
                                                    value={statementPageSize}
                                                    onChange={(e) => { setStatementPageSize(Number(e.target.value)); setStatementPage(1); }}
                                                    className="h-8 px-2 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600"
                                                    title="Lançamentos por página"
                                                >
                                                    {[50, 100, 200, 500].map(n => (
                                                        <option key={n} value={n}>{n} por página</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setStatementPage(p => Math.max(1, p - 1))}
                                                    disabled={statementCurrentPage <= 1}
                                                    className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                >
                                                    Anterior
                                                </button>
                                                <span>Página {statementCurrentPage} de {statementTotalPages}</span>
                                                <button
                                                    onClick={() => setStatementPage(p => Math.min(statementTotalPages, p + 1))}
                                                    disabled={statementCurrentPage >= statementTotalPages}
                                                    className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                >
                                                    Próxima
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            ) : bankTransactions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center py-32 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
                                    <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-3xl flex items-center justify-center mb-6">
                                        <FileText className="w-10 h-10" />
                                    </div>
                                    <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Sem extrato importado</h5>
                                    <p className="text-xs text-gray-400 max-w-[200px]">Importe um arquivo OFX, CSV, CNAB ou Excel (XLSX) para iniciar a conciliação.</p>
                                </div>
                            ) : pendentesViewMode === 'grid' ? (
                                <div className="grid grid-cols-1 gap-4">
                                    {sortedBankTransactions.map(tx => (
                                        <div key={tx.id} className="group relative">
                                            <div
                                                onClick={() => setSelectedBankTxId(selectedBankTxId === tx.id ? null : tx.id)}
                                                className={`p-5 bg-white rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden group hover:shadow-lg ${selectedBankTxIds.has(tx.id) ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-xl scale-[1.02]' : 'border-gray-100 shadow-sm'} ${selectedBankTxId === tx.id ? 'bg-blue-50/30' : ''}`}
                                            >
                                                <div className="absolute top-4 left-4 z-20" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                                        checked={selectedBankTxIds.has(tx.id)}
                                                        onChange={(e) => {
                                                            const next = new Set(selectedBankTxIds);
                                                            if (e.target.checked) next.add(tx.id);
                                                            else next.delete(tx.id);
                                                            setSelectedBankTxIds(next);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex justify-between items-start mb-4 pl-8">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {tx.direction === 'DEBIT' ? <ArrowRightLeft className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-sm font-medium ${tx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {tx.direction === 'DEBIT' ? '-' : '+'} {formatMoney(tx.amount)}
                                                        </p>
                                                        <span className="text-xs font-normal text-gray-400">{formatDateBR(tx.transaction_date)}</span>
                                                    </div>
                                                </div>

                                                <h6 className="text-sm font-normal text-gray-900 mb-3 truncate" title={tx.description_normalized || tx.description_raw}>
                                                    {tx.description_normalized || tx.description_raw}
                                                </h6>

                                                <div className="flex flex-col gap-3 mt-auto pt-3 border-t border-gray-50">
                                                    <div className="flex gap-2">
                                                        <LazySelect
                                                            value={tx.category || ''}
                                                            currentLabel={tx.category || ''}
                                                            onChange={(v) => handleUpdateBankCategory(tx.id, v)}
                                                            options={categoryOptions}
                                                            placeholder="Categoria"
                                                            className={`flex-1 text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer text-center ${
                                                                tx.category
                                                                    ? 'text-gray-900 bg-gray-50 border-gray-100 hover:bg-gray-100'
                                                                    : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                            }`}
                                                        />
                                                        <LazySelect
                                                            value={tx.project_id || ''}
                                                            currentLabel={projectName(tx.project_id) || ''}
                                                            onChange={(v) => handleUpdateBankProject(tx.id, v)}
                                                            options={projectOptions}
                                                            placeholder="Obra"
                                                            className={`flex-1 text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer text-center ${
                                                                tx.project_id
                                                                    ? 'text-gray-900 bg-blue-50 border-blue-100 hover:bg-blue-100'
                                                                    : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                            }`}
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        {tx.status === 'RULE_APPLIED' ? (
                                                        <div className="flex gap-1.5 shrink-0">
                                                            <button
                                                                className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 px-2 py-1 rounded-lg uppercase tracking-widest transition-all"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRejectRule(tx.id);
                                                                }}
                                                                title="Rejeitar Automático"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                className="text-xs font-semibold text-white bg-purple-600 px-3 py-1 rounded-lg uppercase tracking-widest hover:bg-purple-700 transition-all shadow-sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleConfirmMatch(tx.id);
                                                                }}
                                                            >
                                                                Conciliar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm font-normal text-gray-400">{tx.status}</span>
                                                    )}
                                                    </div>
                                                </div>

                                                {tx.status === 'RULE_APPLIED' && (
                                                    <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden">
                                                        <div className="absolute top-0 right-0 bg-purple-600 text-xs font-semibold text-white px-8 py-1 rotate-45 translate-x-[35%] translate-y-[20%] uppercase tracking-widest">
                                                            Regra
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {/* AI Suggestions Panel */}
                                            {(() => {
                                                const suggestion = topSuggestionByBankTxId.get(tx.id);
                                                const cand = suggestion?.candidate_internal_transaction;
                                                if (!suggestion || !cand) return null;
                                                return (
                                                    <div key={suggestion.id} className="mx-4 mb-2 -mt-2 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-b-xl flex items-center justify-between shadow-inner">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-6 h-6 rounded-full bg-purple-100/50 flex items-center justify-center text-purple-600">
                                                                <Zap className="w-3 h-3" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-semibold text-purple-600 uppercase tracking-widest">Sugestão Inteligente</span>
                                                                    <span className="text-xs font-normal text-purple-500">{suggestion.confidence}% Match</span>
                                                                </div>
                                                                <p className="text-sm font-normal text-gray-700 mt-0.5 max-w-[220px] truncate" title={cand.description}>
                                                                    {cand.description}
                                                                </p>
                                                                {typeof suggestion.reason === 'string' && suggestion.reason && (
                                                                    <p className="text-xs text-gray-500 mt-0.5 max-w-[260px] leading-snug" title={suggestion.reason}>
                                                                        {suggestion.reason}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleConfirmMatch(tx.id, cand.id)}
                                                            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-sm"
                                                        >
                                                            Conciliar Agora
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={useAcoplada ? "overflow-x-auto" : "bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden overflow-x-auto"}>
                                    <div className="overflow-y-auto reconc-scroll" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                                        <table ref={pendingBankResize.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: pendingBankTableTotalWidth, minWidth: '100%' }}>
                                            <colgroup>
                                                <col style={{ width: '40px' }} />
                                                {pendingBankColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                    <col key={key} data-col-key={key} style={{ width: `${pendingBankResize.getWidth(key)}px` }} />
                                                ))}
                                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                                    borda de "Ações" não andar a cada redimensionamento. */}
                                                <col />
                                                {pendingBankColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${pendingBankResize.getWidth('actions')}px` }} />}
                                            </colgroup>
                                            <thead>
                                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={sortedBankTransactions.length > 0 && sortedBankTransactions.every(tx => selectedBankTxIds.has(tx.id))}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedBankTxIds(new Set([...selectedBankTxIds, ...sortedBankTransactions.map(tx => tx.id)]));
                                                                } else {
                                                                    const next = new Set(selectedBankTxIds);
                                                                    sortedBankTransactions.forEach(tx => next.delete(tx.id));
                                                                    setSelectedBankTxIds(next);
                                                                }
                                                            }}
                                                        />
                                                    </th>
                                                    {pendingBankColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                                        const def = PENDING_BANK_COLUMN_HEADERS[key];
                                                        if (!def) return null;
                                                        return (
                                                            <SortableHeader
                                                                key={key} colKey={key} label={def.label} sortable={!!def.sortField} uppercase={false}
                                                                sortColumn={def.sortField && bankSortField === def.sortField ? key : null}
                                                                sortDirection={bankSortOrder}
                                                                onSort={def.sortField ? sortBankBy(def.sortField) : undefined}
                                                                onMoveColumn={pendingBankColumns.moveColumn}
                                                                className={def.className}
                                                            >
                                                                <pendingBankResize.ResizeHandle colKey={key} />
                                                            </SortableHeader>
                                                        );
                                                    })}
                                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                                    {pendingBankColumns.visibleColumns.includes('actions') && (
                                                        <th className="px-6 py-2 text-right relative overflow-hidden whitespace-nowrap text-table-header font-semibold text-gray-500">
                                                            Ações
                                                            <pendingBankResize.ResizeHandle colKey="actions" />
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedBankTransactions.map(tx => {
                                                    const suggestion = topSuggestionByBankTxId.get(tx.id);
                                                    const cand = suggestion?.candidate_internal_transaction;
                                                    const cellPad = pendentesCompact ? 'py-1' : 'py-2.5';
                                                    // +2: checkbox + espaçador (não estão em visibleColumns)
                                                    const visibleColCount = 2 + PENDING_BANK_COLUMNS.filter(c => pendingBankColumns.visibleColumns.includes(c.key)).length;
                                                    const pendingBankCtx: PendingBankRowCtx = {
                                                        clienteOptions, credorOptions, categoryOptions, projectOptions, costCenterOptions,
                                                        projectName, costCenterName,
                                                        onUpdateCounterparty: handleUpdateBankCounterparty,
                                                        onUpdateCategory: handleUpdateBankCategory,
                                                        onUpdateProject: handleUpdateBankProject,
                                                        onUpdateCostCenter: handleUpdateBankCostCenter,
                                                    };
                                                    return (
                                                        <React.Fragment key={tx.id}>
                                                            <tr
                                                                onClick={() => setSelectedBankTxId(selectedBankTxId === tx.id ? null : tx.id)}
                                                                className={`cursor-pointer transition-colors ${selectedBankTxId === tx.id ? 'bg-blue-50/60' : selectedBankTxIds.has(tx.id) ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}
                                                            >
                                                                <td className={`px-4 ${cellPad} border-r border-gray-100 text-center`} onClick={(e) => e.stopPropagation()}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                        checked={selectedBankTxIds.has(tx.id)}
                                                                        onChange={(e) => {
                                                                            const next = new Set(selectedBankTxIds);
                                                                            if (e.target.checked) next.add(tx.id);
                                                                            else next.delete(tx.id);
                                                                            setSelectedBankTxIds(next);
                                                                        }}
                                                                    />
                                                                </td>
                                                                {pendingBankColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                                                    const meta = PENDING_BANK_TD_META[key];
                                                                    if (!meta) return null;
                                                                    return (
                                                                        <td
                                                                            key={key}
                                                                            className={`px-6 ${cellPad} border-r border-gray-100 ${meta.className}`}
                                                                            onClick={meta.stopPropagation ? (e) => e.stopPropagation() : undefined}
                                                                        >
                                                                            {renderPendingBankCell(key, tx, pendingBankCtx)}
                                                                        </td>
                                                                    );
                                                                })}
                                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                                {pendingBankColumns.visibleColumns.includes('actions') && (
                                                                <td className={`px-6 ${cellPad} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        {tx.status === 'RULE_APPLIED' ? (
                                                                            <>
                                                                                <span className="text-purple-600 mr-0.5" title="Automático">
                                                                                    <Zap className="w-3.5 h-3.5" />
                                                                                </span>
                                                                                <button
                                                                                    className="text-gray-500 bg-gray-50 border border-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 rounded-lg transition-all p-1"
                                                                                    onClick={() => handleRejectRule(tx.id)}
                                                                                    title="Rejeitar Automático"
                                                                                >
                                                                                    <X className="w-3.5 h-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    className="text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-all p-1"
                                                                                    onClick={() => handleConfirmMatch(tx.id)}
                                                                                    title="Aceitar"
                                                                                >
                                                                                    <Check className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <span className="text-sm font-normal text-gray-400">{tx.status}</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                )}
                                                            </tr>
                                                            {suggestion && cand && (
                                                                <tr className="bg-gradient-to-r from-purple-50 to-indigo-50">
                                                                    <td colSpan={visibleColCount} className="px-6 py-2">
                                                                        <div className="flex items-center justify-between gap-3">
                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                                                                <span className="text-xs font-semibold text-purple-600 uppercase tracking-widest shrink-0">Sugestão</span>
                                                                                <span className="text-xs font-normal text-purple-500 shrink-0">{suggestion.confidence}% Match</span>
                                                                                <p className="text-sm font-normal text-gray-700 truncate" title={cand.description}>
                                                                                    {cand.description}
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleConfirmMatch(tx.id, cand.id)}
                                                                                className="shrink-0 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-sm"
                                                                            >
                                                                                Conciliar Agora
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        </StatementCardWrapper>
                            );
                        })()}
                    </div>

                    {activeView === 'pending' && (() => {
                        // Acoplada (§5.2), espelhando o Extrato Bancário ao lado — mesmo gap
                        // reportado pelo usuário: toolbar solta acima de um card de tabela à parte.
                        const internalAcoplada = pendentesViewMode === 'list';
                        return (
                    <div className="space-y-4">
                        {/* Right: Internal Ledger */}
                        <div className={internalAcoplada ? "bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden" : ""}>
                        <div className={internalAcoplada
                            ? "flex flex-wrap gap-3 items-center justify-between p-2 border-b border-gray-100 bg-white"
                            : "flex flex-wrap justify-between items-center gap-y-2 px-4"}>
                            <div className="flex flex-wrap items-center gap-4 gap-y-2">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Check className="w-4 h-4" />
                                    Lançamentos
                                </h4>
                                <div className="flex items-center gap-2">
                                    {pendentesViewMode === 'grid' && (
                                        <button 
                                            onClick={() => {
                                                const allSelected = sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id));
                                                if (allSelected) {
                                                    const next = new Set(selectedInternalTxIds);
                                                    sortedInternalTransactions.forEach(tx => next.delete(tx.id));
                                                    setSelectedInternalTxIds(next);
                                                } else {
                                                    setSelectedInternalTxIds(new Set([...selectedInternalTxIds, ...sortedInternalTransactions.map(tx => tx.id)]));
                                                }
                                            }}
                                            className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-[13px] font-medium transition-all ${
                                                sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id))
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-white text-emerald-600 border border-emerald-100 hover:bg-emerald-50'
                                            }`}
                                        >
                                            <CheckCircle2 className="w-3 h-3" />
                                            {sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id)) ? 'Todos Selecionados' : 'Selecionar Tudo'}
                                        </button>
                                    )}
                                    <div className="relative">
                                        <button
                                            onClick={() => { setInternalCatDropdownOpen(o => !o); setBankCatDropdownOpen(false); setBankCpDropdownOpen(false); setInternalEntityDropdownOpen(false); }}
                                            className={`px-3 py-1.5 border rounded-full text-xs font-bold focus:outline-none cursor-pointer flex items-center gap-1.5 ${internalCategoryFilter.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                        >
                                            {internalCategoryFilter.length > 0 ? `${internalCategoryFilter.length} categoria${internalCategoryFilter.length > 1 ? 's' : ''}` : 'Todas Categorias'}
                                            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {internalCatDropdownOpen && (
                                            <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                                <div className="flex border-b border-gray-100 mb-1">
                                                    <button onClick={() => setInternalCategoryFilter(['__none__', ...uniqueCategories])} className="flex-1 px-3 py-1.5 text-xs font-black text-emerald-500 hover:bg-emerald-50 uppercase tracking-wider text-left">Selecionar todos</button>
                                                    <button onClick={() => setInternalCategoryFilter([])} className="flex-1 px-3 py-1.5 text-xs font-black text-red-500 hover:bg-red-50 uppercase tracking-wider text-right">Limpar</button>
                                                </div>
                                                {[{ value: '__none__', label: '— Sem categoria' }, ...uniqueCategories.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                    <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={internalCategoryFilter.includes(value)}
                                                            onChange={() => setInternalCategoryFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                            className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-0"
                                                        />
                                                        <span className="text-xs font-bold text-gray-700 uppercase truncate">{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => { setInternalEntityDropdownOpen(o => !o); setInternalCatDropdownOpen(false); setBankCatDropdownOpen(false); setBankCpDropdownOpen(false); }}
                                            className={`px-3 py-1.5 border rounded-full text-xs font-bold focus:outline-none cursor-pointer flex items-center gap-1.5 ${internalEntityFilter.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                        >
                                            {internalEntityFilter.length > 0 ? `${internalEntityFilter.length} contraparte${internalEntityFilter.length > 1 ? 's' : ''}` : 'Cliente/Credor'}
                                            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {internalEntityDropdownOpen && (
                                            <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                                <div className="flex border-b border-gray-100 mb-1">
                                                    <button onClick={() => setInternalEntityFilter(['__none__', ...uniqueInternalEntities])} className="flex-1 px-3 py-1.5 text-xs font-black text-emerald-500 hover:bg-emerald-50 uppercase tracking-wider text-left">Selecionar todos</button>
                                                    <button onClick={() => setInternalEntityFilter([])} className="flex-1 px-3 py-1.5 text-xs font-black text-red-500 hover:bg-red-50 uppercase tracking-wider text-right">Limpar</button>
                                                </div>
                                                {uniqueInternalEntities.length === 0 && (
                                                    <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Nenhuma contraparte nos lançamentos</div>
                                                )}
                                                {[{ value: '__none__', label: '— Sem cliente/credor' }, ...uniqueInternalEntities.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                    <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={internalEntityFilter.includes(value)}
                                                            onChange={() => setInternalEntityFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                            className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-0"
                                                        />
                                                        <span className="text-xs font-bold text-gray-700 uppercase truncate">{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {/* Só no modo Grade: sem thead, precisa de um seletor de ordenação
                                        próprio. No modo Lista a ordenação já é pelo cabeçalho da coluna
                                        (§6.4 — sem dropdown de ordenação fora do thead). */}
                                    {!internalAcoplada && (
                                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
                                        <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
                                        <select
                                            value={internalSortField}
                                            onChange={(e) => setInternalSortField(e.target.value as typeof internalSortField)}
                                            className="text-xs font-bold bg-transparent focus:outline-none cursor-pointer text-gray-400 appearance-none"
                                        >
                                            <option value="date">Data</option>
                                            <option value="amount">Valor</option>
                                            <option value="description">Descrição</option>
                                            <option value="category">Categoria</option>
                                            <option value="entity">Cliente/Credor</option>
                                        </select>
                                        <button
                                            onClick={() => setInternalSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                                            className="ml-1 text-gray-400 hover:text-emerald-600 transition-colors"
                                            title={internalSortOrder === 'desc' ? 'Decrescente' : 'Crescente'}
                                        >
                                            {internalSortOrder === 'desc' ? '↓' : '↑'}
                                        </button>
                                    </div>
                                    )}
                                    <div className={internalAcoplada ? "relative" : "relative"}>
                                        <Search className={internalAcoplada ? "w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" : "w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"} />
                                        <input
                                            type="text"
                                            placeholder={internalAcoplada ? "Buscar por descrição, categoria ou cliente/fornecedor..." : "Filtro..."}
                                            value={internalSearch}
                                            onChange={(e) => setInternalSearch(e.target.value)}
                                            className={internalAcoplada
                                                ? "h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all w-full md:w-64"
                                                : "pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 w-24 focus:w-32 transition-all"}
                                        />
                                        {internalSearch && (
                                            <button
                                                onClick={() => setInternalSearch('')}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                title="Limpar filtro"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    {pendentesViewMode === 'list' && (
                                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                            <ColumnConfigButton
                                                columns={PENDING_INTERNAL_COLUMNS.filter(c => c.key !== 'actions')}
                                                visibleColumns={pendingInternalColumns.visibleColumns}
                                                showColumnConfig={pendingInternalColumns.showColumnConfig}
                                                onToggleShow={() => pendingInternalColumns.setShowColumnConfig(!pendingInternalColumns.showColumnConfig)}
                                                onToggleColumn={pendingInternalColumns.toggleColumn}
                                                onReset={pendingInternalColumns.resetColumns}
                                            />
                                            {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                                Duplo clique no divisor segue "restaurar padrão". */}
                                            <button
                                                onClick={() => pendingInternalResize.autoFit()}
                                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                                title="Ajustar largura das colunas ao conteúdo"
                                            >
                                                <MoveHorizontal className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={`min-h-[400px] ${pendentesViewMode === 'grid' ? 'bg-transparent border-none shadow-none' : 'bg-transparent'}`}>
                            {internalTransactions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center py-32 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
                                    <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-3xl flex items-center justify-center mb-6">
                                        <Briefcase className="w-10 h-10" />
                                    </div>
                                    <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Sem lançamentos internos</h5>
                                    <p className="text-xs text-gray-400 max-w-[200px]">
                                        Tudo certo! Não há transações pendentes de conciliação no sistema.
                                    </p>
                                </div>
                            ) : pendentesViewMode === 'grid' ? (
                                <div className="grid grid-cols-1 gap-4">
                                    {sortedInternalTransactions.map(tx => (
                                        <div key={tx.id} className={`p-5 bg-white rounded-[2rem] border transition-all group hover:shadow-lg relative overflow-hidden ${selectedInternalTxIds.has(tx.id) ? 'border-emerald-500 ring-2 ring-emerald-500/10 shadow-xl scale-[1.02]' : 'border-gray-100 shadow-sm'}`}>
                                            <div className="absolute top-4 left-4 z-20">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                                    checked={selectedInternalTxIds.has(tx.id)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedInternalTxIds);
                                                        if (e.target.checked) next.add(tx.id);
                                                        else next.delete(tx.id);
                                                        setSelectedInternalTxIds(next);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-start mb-4 pl-8">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        <DollarSign className="w-5 h-5" />
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-gray-900 leading-none">
                                                            {formatMoney(tx.amount)}
                                                        </p>
                                                        {(() => {
                                                            const m = getSourceMeta(tx.source_system);
                                                            if (!m) return null;
                                                            const link = getOriginLink(tx);
                                                            const textColor = m.color.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';
                                                            return link ? (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); goToOrigin(tx); }}
                                                                    title={`Abrir em ${m.label}`}
                                                                    className={`inline-flex items-center gap-1 text-xs font-normal transition-all hover:underline cursor-pointer ${textColor}`}
                                                                >
                                                                    {m.label}
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </button>
                                                            ) : (
                                                                <span className={`text-xs font-normal ${textColor}`}>{m.label}</span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mb-1">
                                                    <h6 className="text-sm font-normal text-gray-900 truncate flex-1" title={displayTitle(tx)}>
                                                        {displayTitle(tx)}
                                                    </h6>
                                                    {txCode(tx) && (
                                                        <span
                                                            title="Código de origem"
                                                            className="shrink-0 text-xs font-normal text-gray-500"
                                                        >
                                                            Nº {txCode(tx)}
                                                        </span>
                                                    )}
                                                </div>

                                                {displayPartyName(tx) && (
                                                    <p className="text-sm font-normal text-gray-500 truncate mb-2" title={displayPartyName(tx) ?? ''}>
                                                        <span className="text-gray-300 mr-1">
                                                            {tx.party_type === 'CLIENT' || tx.direction === 'CREDIT' ? 'Cliente:' : 'Credor:'}
                                                        </span>
                                                        {displayPartyName(tx)}
                                                    </p>
                                                )}

                                                {(projectName(tx.project_id) || costCenterName(tx.cost_center_id)) && (
                                                    <div className="flex flex-wrap gap-3 mb-3">
                                                        {projectName(tx.project_id) && (
                                                            <span className="text-sm font-normal text-sky-700 truncate max-w-[45%]">
                                                                {projectName(tx.project_id)}
                                                            </span>
                                                        )}
                                                        {costCenterName(tx.cost_center_id) && (
                                                            <span className="text-sm font-normal text-violet-700 truncate max-w-[45%]">
                                                                {costCenterName(tx.cost_center_id)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-3 h-3 text-gray-300" />
                                                        <span className="text-xs font-normal text-gray-400">{formatDateBR(displayDate(tx))}</span>
                                                    </div>

                                                    <LazySelect
                                                        value={tx.category || ''}
                                                        currentLabel={tx.category || ''}
                                                        onChange={(v) => handleUpdateInternalCategory(tx.id, v)}
                                                        options={categoryOptions}
                                                        placeholder="Pendente"
                                                        className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer text-center min-w-[80px] ${
                                                            tx.category
                                                                ? 'text-gray-900 bg-gray-50 border-gray-100 hover:bg-gray-100'
                                                                : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={internalAcoplada ? "overflow-x-auto" : "bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden overflow-x-auto"}>
                                    <div className="overflow-y-auto reconc-scroll" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                                        <table ref={pendingInternalResize.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: pendingInternalTableTotalWidth, minWidth: '100%' }}>
                                            <colgroup>
                                                <col style={{ width: '40px' }} />
                                                {pendingInternalColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                    <col key={key} data-col-key={key} style={{ width: `${pendingInternalResize.getWidth(key)}px` }} />
                                                ))}
                                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                                    borda de "Ações" não andar a cada redimensionamento. */}
                                                <col />
                                                {pendingInternalColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${pendingInternalResize.getWidth('actions')}px` }} />}
                                            </colgroup>
                                            <thead>
                                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                            checked={sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id))}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedInternalTxIds(new Set([...selectedInternalTxIds, ...sortedInternalTransactions.map(tx => tx.id)]));
                                                                } else {
                                                                    const next = new Set(selectedInternalTxIds);
                                                                    sortedInternalTransactions.forEach(tx => next.delete(tx.id));
                                                                    setSelectedInternalTxIds(next);
                                                                }
                                                            }}
                                                        />
                                                    </th>
                                                    {pendingInternalColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                                        const def = PENDING_INTERNAL_COLUMN_HEADERS[key];
                                                        if (!def) return null;
                                                        // colKey precisa ser a chave REAL da coluna (bate com orderedVisibleColumns) —
                                                        // é o que moveColumn usa para identificar origem/destino do arraste.
                                                        // 'client'/'creditor' ordenam por um campo composto ('entity' → 'party');
                                                        // o destaque de "coluna ativa" é simulado comparando internalSortField a
                                                        // 'entity' e reaproveitando `key` como sortColumn quando bate (mesmo efeito
                                                        // visual do colKey="party" compartilhado que existia antes do drag).
                                                        if (key === 'client' || key === 'creditor') {
                                                            return (
                                                                <SortableHeader
                                                                    key={key} colKey={key} label={def.label} uppercase={false}
                                                                    sortColumn={internalSortField === 'entity' ? key : null} sortDirection={internalSortOrder}
                                                                    onSort={() => internalSortField === 'entity' ? setInternalSortOrder(o => o === 'asc' ? 'desc' : 'asc') : (setInternalSortField('entity'), setInternalSortOrder('asc'))}
                                                                    onMoveColumn={pendingInternalColumns.moveColumn}
                                                                    className={def.className}
                                                                >
                                                                    <pendingInternalResize.ResizeHandle colKey={key} />
                                                                </SortableHeader>
                                                            );
                                                        }
                                                        return (
                                                            <SortableHeader
                                                                key={key} colKey={key} label={def.label} sortable={!!def.sortField} uppercase={false}
                                                                sortColumn={def.sortField && internalSortField === def.sortField ? key : null}
                                                                sortDirection={internalSortOrder}
                                                                onSort={def.sortField ? sortInternalBy(def.sortField) : undefined}
                                                                onMoveColumn={pendingInternalColumns.moveColumn}
                                                                className={def.className}
                                                            >
                                                                <pendingInternalResize.ResizeHandle colKey={key} />
                                                            </SortableHeader>
                                                        );
                                                    })}
                                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                                    {pendingInternalColumns.visibleColumns.includes('actions') && (
                                                        <th className="px-6 py-2 text-right relative overflow-hidden whitespace-nowrap text-table-header font-semibold text-gray-500">
                                                            Ações
                                                            <pendingInternalResize.ResizeHandle colKey="actions" />
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedInternalTransactions.map(tx => {
                                                    const cellPad = pendentesCompact ? 'py-1' : 'py-2.5';
                                                    const pendingInternalCtx: PendingInternalRowCtx = {
                                                        getSourceMeta, getOriginLink, goToOrigin, txCode, displayTitle, displayPartyName, displayDate,
                                                        projectName, costCenterName, categoryOptions,
                                                        onUpdateCategory: handleUpdateInternalCategory,
                                                    };
                                                    return (
                                                        <tr key={tx.id} className={`transition-colors ${selectedInternalTxIds.has(tx.id) ? 'bg-emerald-50/40' : 'hover:bg-gray-50'}`}>
                                                            <td className={`px-4 ${cellPad} border-r border-gray-100 text-center`}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                                    checked={selectedInternalTxIds.has(tx.id)}
                                                                    onChange={(e) => {
                                                                        const next = new Set(selectedInternalTxIds);
                                                                        if (e.target.checked) next.add(tx.id);
                                                                        else next.delete(tx.id);
                                                                        setSelectedInternalTxIds(next);
                                                                    }}
                                                                />
                                                            </td>
                                                            {pendingInternalColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                                <td key={key} className={`px-6 ${cellPad} border-r border-gray-100 ${PENDING_INTERNAL_TD_CLASS[key] || ''}`}>
                                                                    {renderPendingInternalCell(key, tx, pendingInternalCtx)}
                                                                </td>
                                                            ))}
                                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                            {pendingInternalColumns.visibleColumns.includes('actions') && (
                                                            <td className={`px-6 ${cellPad} text-right whitespace-nowrap`}>
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {tx.source_system === 'MANUAL' && (
                                                                        <>
                                                                            <ActionIconButton kind="edit" size="sm" icon={<Settings2 className="w-3.5 h-3.5" />} onClick={() => handleEditInternalTx(tx)} />
                                                                            <ActionIconButton kind="delete" size="sm" onClick={() => handleDeleteInternalTx(tx.id)} />
                                                                        </>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!selectedBankTxId) {
                                                                                setActionFeedback({ message: 'Selecione primeiro uma transação no Extrato Bancário (lado esquerdo) para vincular.', type: 'error' });
                                                                                setTimeout(() => setActionFeedback(null), 3000);
                                                                                return;
                                                                            }
                                                                            handleConfirmMatch(selectedBankTxId, tx.id);
                                                                        }}
                                                                        className={`text-xs font-semibold uppercase tracking-widest rounded-lg transition-all px-3 py-1 ${selectedBankTxId ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95' : 'text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100'}`}
                                                                    >
                                                                        {selectedBankTxId ? 'Confirmar Vínculo' : 'Vincular'}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                        );
                    })()}
                </div>
            </div>
        ) : null}

            {/* Audit Logs Section */}
            {activeView === 'conciliated' && auditLogs.length > 0 && (
                <div className="mt-8 space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        Trilha de Auditoria Recente
                    </h4>
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="divide-y divide-gray-50">
                            {auditLogs.map(log => (
                                <div key={log.id} className="p-4 px-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="text-xs font-black text-gray-300 uppercase w-24">
                                            {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-700">
                                                {log.event_type === 'RULE_MATCH' ? 'Automação Aplicada' : 'Ação de Usuário'}
                                            </p>
                                            <p className="text-xs text-gray-400 font-medium">
                                                {(log.payload as { rule_name?: string })?.rule_name ? `Regra: ${(log.payload as { rule_name?: string }).rule_name}` : 'Conciliação manual efetuada'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase">
                                        Org ID: {log.organization_id.substring(0, 8)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BankReconciliation;
