import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Upload, Search, CheckCircle2, AlertCircle, 
    ArrowRightLeft, FileText, Download, Trash2, Check,
    Plus, Calendar, DollarSign, Briefcase, RefreshCw,
    Zap, ShieldCheck, Settings2, Info, ArrowUpDown, X, Tag,
    LayoutGrid, List, Users
} from 'lucide-react';
import { 
    BankTransaction, 
    InternalTransaction, 
    PaymentAccount, 
    BankTransactionStatus
} from '../types';
import { bankReconciliationService } from '../services/bankReconciliationService';
import { supabase } from '../lib/supabase';
import { financialSyncService } from '../services/financialSyncService';
import { commercialFinanceService } from '../services/commercialFinanceService';

interface BankReconciliationProps {
    organizationId: string;
}

const BankReconciliation: React.FC<BankReconciliationProps> = ({ organizationId }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const categoriesLoadedForOrg = useRef<string | null>(null);
    const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
    const [selectedBankTxIds, setSelectedBankTxIds] = useState<Set<string>>(new Set());
    const [selectedInternalTxIds, setSelectedInternalTxIds] = useState<Set<string>>(new Set());
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
        action: string;
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
    const [activeView, setActiveView] = useState<'pending' | 'conciliated' | 'rules' | 'categories'>(
        (localStorage.getItem('reconciliation_active_tab') as 'pending' | 'conciliated' | 'rules' | 'categories') || 'rules'
    );
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
    const [isImporting, setIsImporting] = useState(false);
    const [rules, setRules] = useState<ReconciliationRule[]>([]);
    const [masterSuppliers, setMasterSuppliers] = useState<string[]>([]);
    const [masterClients, setMasterClients] = useState<string[]>([]);
    const [masterEmployees, setMasterEmployees] = useState<string[]>([]);
    const [masterProjects, setMasterProjects] = useState<Array<{ id: string; name: string }>>([]);
    const [managedCategories, setManagedCategories] = useState<string[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [stats, setStats] = useState({
        automationRate: 0,
        manualMatches: 0,
        ruleApplied: 0
    });
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [newRule, setNewRule] = useState({
        name: '',
        conditionValue: '',
        category: '',
        clientName: '',
        supplierName: ''
    });

    // Filtros e Ordenação
    const [bankSearch, setBankSearch] = useState('');
    const [internalSearch, setInternalSearch] = useState('');
    const [bankCategoryFilter, setBankCategoryFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_bank_cat_filter') || '[]'); } catch { return []; }
    });
    const [internalCategoryFilter, setInternalCategoryFilter] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('reconciliation_internal_cat_filter') || '[]'); } catch { return []; }
    });
    const [bankCatDropdownOpen, setBankCatDropdownOpen] = useState(false);
    const [internalCatDropdownOpen, setInternalCatDropdownOpen] = useState(false);
    const [bankSortOrder, setBankSortOrder] = useState<'desc' | 'asc'>('desc');
    const [bankSortField, setBankSortField] = useState<'date' | 'amount' | 'description' | 'category' | 'counterparty'>('date');
    const [internalSortOrder, setInternalSortOrder] = useState<'desc' | 'asc'>('desc');
    const [internalSortField, setInternalSortField] = useState<'date' | 'amount' | 'description' | 'category' | 'entity'>('date');
    const [matchSortOrder, setMatchSortOrder] = useState<'desc' | 'asc'>('desc');
    const [flowFilter, setFlowFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
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
        if (flowFilter !== 'ALL') {
            filtered = filtered.filter(tx => 
                flowFilter === 'INCOME' ? tx.direction === 'CREDIT' : tx.direction === 'DEBIT'
            );
        }
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
            }
            if (valA < valB) return bankSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return bankSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [bankTransactions, bankSortOrder, bankSortField, bankSearch, bankCategoryFilter, flowFilter]);

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
    }, [internalTransactions, internalSortOrder, internalSortField, internalSearch, internalCategoryFilter, flowFilter]);

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

    // Fonte de verdade: financial_categories. O useMemo abaixo é apenas um alias ordenado.
    const uniqueCategories = useMemo(() => [...managedCategories].sort(), [managedCategories]);

    const getLocalDateISO = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatDateBR = (dateStr: string) => {
        if (!dateStr) return '';
        // Se a data vier no formato ISO (YYYY-MM-DD)
        const parts = dateStr.split('T')[0].split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    };

    // Listas separadas de parceiros para sugestão nas regras
    const uniqueClients = useMemo(() => {
        const ents = new Set<string>();
        internalTransactions.filter(tx => tx.direction === 'CREDIT').forEach(tx => {
            if (tx.entity_name) ents.add(tx.entity_name);
        });
        return Array.from(ents).sort();
    }, [internalTransactions]);

    const uniqueSuppliers = useMemo(() => {
        const ents = new Set<string>();
        masterSuppliers.forEach(s => ents.add(s));
        internalTransactions.filter(tx => tx.direction === 'DEBIT').forEach(tx => {
            if (tx.entity_name) ents.add(tx.entity_name);
        });
        bankTransactions.filter(tx => tx.direction === 'DEBIT').forEach(tx => {
            if (tx.counterparty_name) ents.add(tx.counterparty_name);
        });
        return Array.from(ents).sort();
    }, [internalTransactions, bankTransactions, masterSuppliers]);

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
        // Incluir counterparty_names históricos de extratos CREDIT
        bankTransactions.filter(tx => tx.direction === 'CREDIT').forEach(tx => {
            if (tx.counterparty_name) ents.add(tx.counterparty_name);
        });
        return Array.from(ents).sort();
    }, [bankTransactions, masterClients]);

    const [showInternalTxModal, setShowInternalTxModal] = useState(false);
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

    useEffect(() => {
        localStorage.setItem('reconciliation_bank_cat_filter', JSON.stringify(bankCategoryFilter));
    }, [bankCategoryFilter]);

    useEffect(() => {
        localStorage.setItem('reconciliation_internal_cat_filter', JSON.stringify(internalCategoryFilter));
    }, [internalCategoryFilter]);

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
    }, [selectedAccountId, activeView, startDate, endDate]);

    useEffect(() => {
        const close = () => { setBankCatDropdownOpen(false); setInternalCatDropdownOpen(false); };
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
        setIsLoading(true);
        try {
            let query = supabase
                .from('payment_accounts')
                .select('*')
                .not('bank', 'is', null)
                .not('account_number', 'is', null);
            
            if (organizationId) {
                query = query.eq('organization_id', organizationId);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            setAccounts(data || []);
            if (data && data.length > 0 && (!selectedAccountId || selectedAccountId === 'mock-acc-1')) {
                setSelectedAccountId(data[0].id);
            }
        } catch (error) {
            console.error('Error loading bank accounts:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadRules = async () => {
        try {
            const orgToUse = effectiveOrgId || organizationId;
            if (!orgToUse) return;

            const { data, error } = await supabase
                .from('reconciliation_rules')
                .select('*')
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
                .select('name')
                .or(`organization_id.eq.${orgId},organization_id.is.null`)
                .order('name', { ascending: true });
            if (data) setMasterClients(data.map(c => c.name));
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    const loadSuppliers = async (orgId: string) => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('name')
                .or(`organization_id.eq.${orgId},organization_id.is.null`)
                .order('name', { ascending: true });

            if (error) throw error;
            if (data) {
                setMasterSuppliers(data.map(s => s.name));
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
                .neq('name', 'Gestão Comercial')
                .order('name', { ascending: true });
            if (data) {
                const uniqueProjects = Array.from(new Map(data.map(p => [p.name, p])).values());
                setMasterProjects(uniqueProjects);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    const loadAuditLogs = async () => {
        if (!effectiveOrgId) return;
        try {
            const { data, error } = await supabase
                .from('reconciliation_audit_log')
                .select('*')
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
                .eq('bank_account_id', selectedAccountId);

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

            const { count: matchedCount } = await matchedQuery;
            const { count: totalCount } = await totalQuery;
            const { count: autoCount } = await autoQuery;

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
            // Load Bank Transactions
            let bankQuery = supabase
                .from('bank_transactions')
                .select('*')
                .eq('bank_account_id', selectedAccountId);
            
            if (activeView === 'pending') {
                bankQuery = bankQuery.in('status', ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED', 'CONFIRMED']);
            } else {
                bankQuery = bankQuery.in('status', ['MATCHED']);
            }

            if (startDate) bankQuery = bankQuery.gte('transaction_date', startDate);
            if (endDate) bankQuery = bankQuery.lte('transaction_date', endDate);

            const { data: bTxs, error: bError } = await bankQuery
                .order('transaction_date', { ascending: false })
                .limit(2000); 
            if (bError) throw bError;
            
            setBankTransactions(bTxs || []);

            // Load Internal Transactions based on view
            let iTxQuery = supabase
                .from('internal_transactions')
                .select('*')
                .order('transaction_date', { ascending: false });

            if (organizationId) {
                iTxQuery = iTxQuery.eq('organization_id', organizationId);
            }

            if (activeView === 'pending') {
                iTxQuery = iTxQuery.eq('status', 'PENDING');
            } else {
                iTxQuery = iTxQuery.eq('status', 'CONCILIATED');
            }

            if (startDate) iTxQuery = iTxQuery.gte('transaction_date', startDate);
            if (endDate) iTxQuery = iTxQuery.lte('transaction_date', endDate);

            const { data: iTxs, error: iError } = await iTxQuery.limit(2000);
            
            if (iError) throw iError;
            
            // --- BUSCA CIRÚRGICA LADO DIREITO (400k / WALDIR) ---
            // Como pode haver milhares de lançamentos, buscamos especificamente pelo Waldir ou Valor
            const { data: rescueITxs } = await supabase
                .from('internal_transactions')
                .select('*')
                .or(`description.ilike.%WALDIR%,amount.eq.400000`)
                .eq('status', 'PENDING');

            let finalITxs = iTxs || [];
            if (rescueITxs && rescueITxs.length > 0) {
                const existingIds = new Set(finalITxs.map(t => t.id));
                const missing = rescueITxs.filter(t => !existingIds.has(t.id));
                if (missing.length > 0) {
                    finalITxs = [...finalITxs, ...missing];
                }
            }

            // --- PONTE COMERCIAL (VARREDURA TOTAL DE PROJETOS) ---
            try {
                const orgForProj = effectiveOrgId || organizationId;
                if (!orgForProj) throw new Error('organization_id ausente');
                const { data: allProjData } = await supabase
                    .from('projects')
                    .select('id, name, settings')
                    .filter('settings->>organizationId', 'eq', orgForProj);

                if (allProjData && allProjData.length > 0) {
                    let commercialMatches: CommercialMatch[] = [];
                    allProjData.forEach(proj => {
                        const txs: Array<Record<string, unknown>> = proj.settings?.financialInfo?.transactions || [];
                        const mappedCommercial = txs
                            .filter((t) => (t['status'] === 'PENDING' || t['status'] === 'PENDENTE' || t['status'] === 'OPEN'))
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
                        // Mesclar sem duplicar IDs
                        const existingIds = new Set(finalITxs.map(t => t.id));
                        const uniqueNew = commercialMatches.filter(t => !existingIds.has(t.id));
                        finalITxs = [...finalITxs, ...uniqueNew];
                    }
                }
            } catch (err) {
                console.error('Erro na varredura total de projetos:', err);
            }

            setInternalTransactions(finalITxs);

            // Load Suggestions for pending transactions in batches to avoid URL length limits
            if (activeView === 'pending' && bTxs && bTxs.length > 0) {
                const bTxIds = bTxs.map(t => t.id);
                const batchSize = 100;
                let allSuggestions: ReconciliationSuggestion[] = [];
                
                for (let i = 0; i < bTxIds.length; i += batchSize) {
                    const batch = bTxIds.slice(i, i + batchSize);
                    const { data: sugs, error: sError } = await supabase
                        .from('reconciliation_suggestions')
                        .select('*, candidate_internal_transaction:candidate_internal_transaction_id(*)')
                        .in('bank_transaction_id', batch)
                        .order('confidence', { ascending: false });
                    
                    if (!sError && sugs) {
                        allSuggestions = [...allSuggestions, ...sugs];
                    }
                }
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
        if (!confirm('Tem certeza que deseja excluir esta regra?')) return;
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
            alert('Por favor, defina pelo menos uma Categoria ou um Cliente/Fornecedor.');
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
            const orgToUse = effectiveOrgId || organizationId;
            if (!orgToUse) throw new Error('Organização não identificada para esta conta.');

            await bankReconciliationService.applyCustomRules(selectedAccountId, orgToUse, true);
            await bankReconciliationService.runMatchingEngine(selectedAccountId, orgToUse);
            await loadTransactions();
            alert('Todas as regras e automação aplicadas com sucesso!');
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
        if (!confirm('Tem certeza que deseja desfazer este vínculo? Ambas as transações voltarão para a lista de Pendentes.')) return;
        
        setIsLoading(true);
        try {
            // 1. Remover o vínculo
            const { error: mError } = await supabase
                .from('reconciliation_matches')
                .delete()
                .eq('id', matchId);
            
            if (mError) throw mError;

            // 2. Restaurar transação bancária
            const { data: bTx } = await supabase
                .from('bank_transactions')
                .select('category')
                .eq('id', bankTxId)
                .single();

            const restoredBankStatus = bTx?.category ? 'RULE_APPLIED' : 'NORMALIZED';
            await supabase
                .from('bank_transactions')
                .update({ status: restoredBankStatus })
                .eq('id', bankTxId);

            // 3. Restaurar lançamento interno
            await supabase
                .from('internal_transactions')
                .update({ status: 'PENDING' })
                .eq('id', internalTxId);

            await loadTransactions();
            await loadStats();
            alert('Vínculo desfeito com sucesso!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error undoing match:', error);
            alert('Erro ao desfazer vínculo: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncAllData = async () => {
        setIsLoading(true);
        try {
            const orgToUse = effectiveOrgId || organizationId;

            // 1. Buscar todos os projetos relevantes
            let query = supabase.from('projects').select('*');
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

            // 3. Sincronizar dados comerciais (Vendas/Aluguéis)
            await commercialFinanceService.syncAllOrganizationDeals(orgToUse || undefined);

            // 4. Recarregar transações no componente
            await loadTransactions();
            alert('Nomes de Clientes e Fornecedores atualizados com sucesso através da sincronização de projetos!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Error in global sync:', error);
            alert('Erro ao sincronizar dados: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteInternalTx = async (id: string) => {
        setIsLoading(true);
        try {
            // Verificar se o lançamento está conciliado
            const { data: match } = await supabase
                .from('reconciliation_matches')
                .select('bank_transaction_id')
                .eq('internal_transaction_id', id)
                .single();

            if (match) {
                if (!confirm('Este lançamento está conciliado. Excluí-lo também desfará o vínculo bancário na aba Conciliados. Deseja continuar?')) {
                    setIsLoading(false);
                    return;
                }

                // 1. Remover o vínculo de conciliação
                await supabase.from('reconciliation_matches').delete().eq('internal_transaction_id', id);

                // 2. Restaurar o status da transação bancária
                const { data: bTx } = await supabase
                    .from('bank_transactions')
                    .select('category')
                    .eq('id', match.bank_transaction_id)
                    .single();

                const restoredStatus = bTx?.category ? 'RULE_APPLIED' : 'NORMALIZED';
                await supabase
                    .from('bank_transactions')
                    .update({ status: restoredStatus })
                    .eq('id', match.bank_transaction_id);
            } else {
                if (!confirm('Tem certeza que deseja excluir este lançamento manual?')) {
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

    const handleDeleteBankTransactions = async (ids: string[]) => {
        if (ids.length === 0) return;
        const msg = ids.length === 1
            ? 'Deseja realmente excluir este extrato bancário? Esta ação não pode ser desfeita.'
            : `Deseja realmente excluir ${ids.length} extratos bancários? Esta ação não pode ser desfeita.`;
        if (!confirm(msg)) return;

        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .delete()
                .in('id', ids);
            if (error) throw error;

            setBankTransactions(prev => prev.filter(tx => !ids.includes(tx.id)));
            setSelectedBankTxIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
            setMatches(prev => prev.filter(m => !ids.includes(m.bank_transaction?.id ?? '')));
            setActionFeedback({ message: `${ids.length} extrato${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''} com sucesso!`, type: 'success' });
            setTimeout(() => setActionFeedback(null), 3000);
        } catch (err: unknown) {
            const msg2 = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
            alert('Erro ao excluir: ' + msg2);
        } finally {
            setIsLoading(false);
        }
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
        } catch (error) {
            console.error('Error updating counterparty:', error);
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
        } catch (error) {
            console.error('Error updating project:', error);
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

        } catch (error) {
            console.error('Error updating bank category:', error);
            alert('Erro ao atualizar categoria do extrato.');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || !selectedAccountId) return;

        setIsImporting(true);
        if (files.length > 1) {
            setImportingMessage(`Importando ${files.length} arquivos...`);
        }

        try {
            const orgId = effectiveOrgId || organizationId;
            if (!orgId) throw new Error('ID da organização não identificado. Selecione uma conta bancária.');

            const fileArray = Array.from(files);
            const result = await bankReconciliationService.ingestMultipleFiles(fileArray, selectedAccountId, orgId);
            await bankReconciliationService.runMatchingEngine(selectedAccountId, orgId);

            await loadTransactions();
            await loadStats();

            if (result.inserted === 0 && result.duplicates > 0) {
                alert(`Este extrato já foi importado anteriormente.\n${result.duplicates} transação(ões) duplicada(s) ignorada(s).`);
            } else if (result.inserted === 0) {
                alert('Nenhuma transação encontrada no arquivo. Verifique se o formato é OFX válido.');
            } else {
                setActionFeedback({ message: `${result.inserted} transação(ões) importada(s) com sucesso!`, type: 'success' });
                setTimeout(() => setActionFeedback(null), 4000);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert('Erro na importação: ' + error.message);
        } finally {
            setIsImporting(false);
            setImportingMessage(null);
            if (event.target) event.target.value = '';
        }
    };

    // Mocks for initial visual state if empty
    const handleAddCategory = async (name: string) => {
        if (!name.trim()) return;
        try {
            const { error } = await supabase
                .from('financial_categories')
                .insert({ name: name.trim() });
            if (error) throw error;
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
        if (!confirm(`Deseja realmente excluir "${catName}" da lista de categorias? As transações que usam essa categoria não serão alteradas.`)) return;
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
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-4">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Gestão de Categorias
                </h4>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => setCategoriesViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${categoriesViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Linha"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setCategoriesViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${categoriesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">{uniqueCategories.length} Categorias</span>
                    <button
                        onClick={handleSyncCategories}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                        title="Importar categorias já usadas em transações e regras"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sincronizar
                    </button>
                    <button
                        onClick={() => {
                            const name = prompt('Nome da nova categoria:');
                            if (name) handleAddCategory(name);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nova categoria
                    </button>
                </div>
            </div>

            <div className={categoriesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                {uniqueCategories.map(cat => {
                    const ruleCount = rules.filter(r => r.actions?.category === cat).length;
                    
                    if (categoriesViewMode === 'list') {
                        return (
                            <div key={cat} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all">
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                                    {cat.charAt(0).toUpperCase()}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <h6 className="text-[11px] font-black text-gray-900 uppercase truncate mb-0.5">{cat}</h6>
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{ruleCount} {ruleCount === 1 ? 'Regra ativa' : 'Regras ativas'}</span>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => {
                                            const newName = prompt('Novo nome para a categoria:', cat);
                                            if (newName) handleRenameCategory(cat, newName);
                                        }}
                                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Renomear"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDuplicateCategory(cat)}
                                        className="p-2 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-all"
                                        title="Duplicar"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteCategory(cat)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={cat} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-lg">
                                    {cat.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h6 className="text-sm font-black text-gray-900 uppercase truncate">{cat}</h6>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{ruleCount} {ruleCount === 1 ? 'Regra ativa' : 'Regras ativas'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <button 
                                    onClick={() => {
                                        const newName = prompt('Novo nome para a categoria:', cat);
                                        if (newName) handleRenameCategory(cat, newName);
                                    }}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-blue-50/50 hover:bg-blue-50 text-blue-600 rounded-2xl transition-all"
                                >
                                    <Settings2 className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Renomear</span>
                                </button>
                                <button 
                                    onClick={() => handleDuplicateCategory(cat)}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-purple-50/50 hover:bg-purple-50 text-purple-600 rounded-2xl transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Duplicar</span>
                                </button>
                                <button 
                                    onClick={() => handleDeleteCategory(cat)}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-red-50/50 hover:bg-red-50 text-red-600 rounded-2xl transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Excluir</span>
                                </button>
                            </div>

                            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-emerald-50/20 rounded-full blur-2xl group-hover:bg-emerald-50/40 transition-all" />
                        </div>
                    );
                })}

                {uniqueCategories.length === 0 && (
                    <div className="md:col-span-2 lg:col-span-3 bg-white border-2 border-dashed border-gray-100 rounded-[2.5rem] p-16 text-center">
                        <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <Tag className="w-10 h-10" />
                        </div>
                        <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Nenhuma categoria ativa</h5>
                        <p className="text-xs text-gray-400">As categorias aparecem aqui automaticamente quando você as define nas regras de automação.</p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderRules = () => (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Regras de Automação
                </h4>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => setRulesViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${rulesViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Linha"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setRulesViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${rulesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={handleApplyRulesManually}
                        disabled={isLoading || !selectedAccountId}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all disabled:opacity-50"
                        title="Re-aplicar todas as regras e matching"
                    >
                        <Zap className="w-4 h-4" />
                        Aplicar Regras Agora
                    </button>
                    {selectedRuleIds.size > 0 && (
                        <button 
                            onClick={handleApplySelectedRules}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 animate-in slide-in-from-right"
                        >
                            <Zap className="w-4 h-4" />
                            Aplicar Selecionadas ({selectedRuleIds.size})
                        </button>
                    )}
                    <button 
                        onClick={() => setShowRuleModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Regra
                    </button>
                </div>
            </div>

            {rules.length > 0 && (
                <div className="flex items-center gap-2 px-4 mb-2">
                    <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        checked={rules.length > 0 && rules.every(r => selectedRuleIds.has(r.id))}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setSelectedRuleIds(new Set(rules.map(r => r.id)));
                            } else {
                                setSelectedRuleIds(new Set());
                            }
                        }}
                    />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selecionar Todas</span>
                </div>
            )}

            <div className={rulesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "space-y-3"}>

                {rules.length === 0 ? (
                    <div className="md:col-span-2 bg-white border-2 border-dashed border-gray-100 rounded-[2.5rem] p-12 text-center">
                        <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-4">
                            <Zap className="w-8 h-8" />
                        </div>
                        <h5 className="text-sm font-black text-gray-400 uppercase">Nenhuma regra ativa</h5>
                        <p className="text-xs text-gray-400 mt-2">Crie regras para automatizar a categorização e o matching de transações recorrentes.</p>
                    </div>
                ) : (
                    rules.map(rule => (
                        rulesViewMode === 'grid' ? (
                            <div key={rule.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden">
                                <div className="absolute top-0 left-0 p-4 z-10">
                                    <input 
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                        checked={selectedRuleIds.has(rule.id)}
                                        onChange={(e) => {
                                            const next = new Set(selectedRuleIds);
                                            if (e.target.checked) next.add(rule.id);
                                            else next.delete(rule.id);
                                            setSelectedRuleIds(next);
                                        }}
                                    />
                                </div>
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button 
                                        onClick={() => handleEditRule(rule)}
                                        className="text-gray-300 hover:text-blue-500 transition-colors"
                                        title="Editar Regra"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                        title="Excluir Regra"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h6 className="text-sm font-black text-gray-900 uppercase truncate">{rule.name}</h6>
                                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Prioridade {rule.priority}</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Se a descrição contiver:</p>
                                        <p className="text-xs font-bold text-gray-700">"{rule.conditions.value}"</p>
                                    </div>
                                    <div className="bg-emerald-50/30 p-3 rounded-xl border border-emerald-100/50">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Então categorizar como:</p>
                                        <p className="text-xs font-bold text-emerald-700">{rule.actions.category}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={rule.id} className={`bg-white p-4 rounded-2xl border transition-all flex items-center gap-4 group hover:shadow-md ${selectedRuleIds.has(rule.id) ? 'border-purple-200 bg-purple-50/20' : 'border-gray-100 shadow-sm'}`}>
                                <div className="flex items-center justify-center shrink-0">
                                    <input 
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                        checked={selectedRuleIds.has(rule.id)}
                                        onChange={(e) => {
                                            const next = new Set(selectedRuleIds);
                                            if (e.target.checked) next.add(rule.id);
                                            else next.delete(rule.id);
                                            setSelectedRuleIds(next);
                                        }}
                                    />
                                </div>
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0 ml-1">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                
                                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-8 items-center">
                                    <div className="min-w-0">
                                        <h6 className="text-[11px] font-black text-gray-900 uppercase truncate mb-0.5">{rule.name}</h6>
                                        <span className="text-[8px] font-black text-purple-400 uppercase tracking-[0.2em]">Prioridade {rule.priority}</span>
                                    </div>

                                    <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 min-w-0">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-0.5">Descrição contém</p>
                                        <p className="text-[10px] font-bold text-gray-700 truncate">"{rule.conditions.value}"</p>
                                    </div>

                                    <div className="bg-emerald-50/50 px-3 py-1.5 rounded-lg border border-emerald-100/50 min-w-0">
                                        <p className="text-[8px] font-black text-emerald-600 uppercase mb-0.5">Categorizar como</p>
                                        <p className="text-[10px] font-bold text-emerald-700 truncate">{rule.actions.category}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleEditRule(rule)}
                                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    ))
                )}
            </div>
            
            <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 flex items-start gap-4">
                <Info className="w-5 h-5 text-blue-500 mt-1 shrink-0" />
                <div className="space-y-1">
                    <p className="text-xs font-black text-blue-700 uppercase">Dica de Especialista</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                        Regras de automação são aplicadas assim que você importa o arquivo bancário. 
                        Elas aumentam drasticamente a velocidade de fechamento mensal ao pré-identificar tarifas, impostos e transferências recorrentes.
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {showRuleModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 uppercase">
                                    {editingRuleId ? 'Editar Regra' : 'Nova Regra'}
                                </h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {editingRuleId ? 'Atualize os critérios de automação' : 'Automatize seu financeiro'}
                                </p>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowRuleModal(false);
                                    setEditingRuleId(null);
                                    setNewRule({ name: '', conditionValue: '', category: '', clientName: '', supplierName: '' });
                                }} 
                                className="text-gray-300 hover:text-gray-900 transition-colors"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Regra</label>
                                <input 
                                    type="text" 
                                    value={newRule.name}
                                    onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                                    placeholder="Ex: Tarifas Bancárias"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Se a descrição contiver</label>
                                <input 
                                    type="text" 
                                    value={newRule.conditionValue}
                                    onChange={(e) => setNewRule({...newRule, conditionValue: e.target.value})}
                                    placeholder="Ex: IOF, TARIFA, PIX"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Atribuir Cliente (Receita)</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center group-focus-within:bg-blue-600 group-focus-within:text-white transition-all">
                                            <Briefcase className="w-4 h-4" />
                                        </div>
                                        <input 
                                            list="client-suggestions"
                                            type="text" 
                                            placeholder="Ex: Cliente Alpha..." 
                                            value={newRule.clientName || ''}
                                            onChange={(e) => setNewRule({ ...newRule, clientName: e.target.value, supplierName: '' })}
                                            className="w-full pl-14 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-xs font-bold transition-all outline-none"
                                        />
                                        <datalist id="client-suggestions">
                                            {uniqueClients.map(ent => (
                                                <option key={ent} value={ent} />
                                            ))}
                                        </datalist>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Atribuir Fornecedor (Despesa)</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center group-focus-within:bg-amber-600 group-focus-within:text-white transition-all">
                                            <DollarSign className="w-4 h-4" />
                                        </div>
                                        <input 
                                            list="supplier-suggestions"
                                            type="text" 
                                            placeholder="Ex: Posto Shell..." 
                                            value={newRule.supplierName || ''}
                                            onChange={(e) => setNewRule({ ...newRule, supplierName: e.target.value, clientName: '' })}
                                            className="w-full pl-14 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-amber-500 focus:bg-white rounded-2xl text-xs font-bold transition-all outline-none"
                                        />
                                        <datalist id="supplier-suggestions">
                                            {uniqueSuppliers.map(ent => (
                                                <option key={ent} value={ent} />
                                            ))}
                                        </datalist>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categorizar como</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        list="existing-categories"
                                        value={newRule.category}
                                        onChange={(e) => setNewRule({...newRule, category: e.target.value})}
                                        placeholder="Ex: Despesas Bancárias"
                                        className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
                                    <datalist id="existing-categories">
                                        {uniqueCategories.map(cat => (
                                            <option key={cat} value={cat} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={() => setShowRuleModal(false)}
                                className="flex-1 px-6 py-4 bg-white border border-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleCreateRule}
                                className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                            >
                                {editingRuleId ? 'Salvar Alterações' : 'Criar Regra'}
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
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
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
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data</label>
                                    <input 
                                        type="date" 
                                        value={newInternalTx.transaction_date}
                                        onChange={(e) => setNewInternalTx({...newInternalTx, transaction_date: e.target.value})}
                                        className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tipo</label>
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
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                                <input 
                                    type="text" 
                                    value={newInternalTx.amount}
                                    onChange={(e) => setNewInternalTx({...newInternalTx, amount: e.target.value})}
                                    placeholder="0,00"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição</label>
                                <input 
                                    type="text" 
                                    value={newInternalTx.description}
                                    onChange={(e) => setNewInternalTx({...newInternalTx, description: e.target.value})}
                                    placeholder="Ex: Pagamento Fornecedor X"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cliente/Fornecedor</label>
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
                                className="flex-1 px-6 py-4 bg-white border border-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleCreateInternalTx}
                                disabled={isLoading}
                                className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            {/* Hidden Input for Files */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".ofx,.csv,.txt,.ret,.cnab"
                onChange={handleFileUpload}
                multiple
            />

            {/* Header / Stats */}
            <div className="relative">
                {actionFeedback && (
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className={`px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border ${
                            actionFeedback.type === 'success' 
                                ? 'bg-emerald-500 border-emerald-400 text-white' 
                                : 'bg-red-500 border-red-400 text-white'
                        }`}>
                            {actionFeedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-100" /> : <AlertCircle className="w-5 h-5 text-red-100" />}
                            <span className="text-sm font-black uppercase tracking-widest">{actionFeedback.message}</span>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <ArrowRightLeft className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pendentes</p>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{bankTransactions.length}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Automação</p>
                        <h3 className="text-2xl font-black text-emerald-600 tracking-tight">{stats.automationRate}%</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Regras Ativas</p>
                        <h3 className="text-2xl font-black text-purple-600 tracking-tight">{rules.length}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Atenção</p>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{internalTransactions.length}</h3>
                    </div>
                </div>
            </div>
        </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <select 
                        value={selectedAccountId || ''}
                        className="pl-4 pr-10 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                        <option value="">Selecione uma conta...</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} - {acc.account_number}</option>
                        ))}
                    </select>
                    
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 h-fit">
                        <button 
                            onClick={() => setFlowFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${flowFilter === 'ALL' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Tudo
                        </button>
                        <button 
                            onClick={() => setFlowFilter('INCOME')}
                            className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${flowFilter === 'INCOME' ? 'bg-emerald-500 text-white shadow-sm' : 'text-emerald-600/60 hover:text-emerald-600'}`}
                        >
                            Receitas
                        </button>
                        <button 
                            onClick={() => setFlowFilter('EXPENSE')}
                            className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${flowFilter === 'EXPENSE' ? 'bg-red-500 text-white shadow-sm' : 'text-red-400 hover:text-red-500'}`}
                        >
                            Despesas
                        </button>
                    </div>

                    {/* Filtro de competência mensal */}
                    <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                        <div className="flex flex-col">
                            <label className="text-[8px] font-black text-indigo-400 uppercase ml-1 mb-0.5">Competência</label>
                            <div className="flex gap-1">
                                <select
                                    value={competencia ? competencia.split('-')[0] : ''}
                                    onChange={(e) => {
                                        const year = e.target.value;
                                        const month = competencia ? competencia.split('-')[1] : '01';
                                        if (year && month) {
                                            const val = `${year}-${month}`;
                                            setCompetencia(val);
                                            const [y, m] = [parseInt(year), parseInt(month)];
                                            const lastDay = new Date(y, m, 0).getDate();
                                            setStartDate(`${val}-01`);
                                            setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                                        }
                                    }}
                                    className="bg-transparent border-none text-[10px] font-black text-indigo-700 focus:ring-0 p-0 w-16"
                                >
                                    <option value="">Ano</option>
                                    {Array.from({length: 10}, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                <select
                                    value={competencia ? competencia.split('-')[1] : ''}
                                    onChange={(e) => {
                                        const month = e.target.value;
                                        const year = competencia ? competencia.split('-')[0] : new Date().getFullYear();
                                        if (year && month) {
                                            const val = `${year}-${month}`;
                                            setCompetencia(val);
                                            const [y, m] = [parseInt(year), parseInt(month)];
                                            const lastDay = new Date(y, m, 0).getDate();
                                            setStartDate(`${val}-01`);
                                            setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                                        }
                                    }}
                                    className="bg-transparent border-none text-[10px] font-black text-indigo-700 focus:ring-0 p-0 w-14"
                                >
                                    <option value="">Mês</option>
                                    {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => (
                                        <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {competencia && (
                            <button
                                onClick={() => { setCompetencia(''); setStartDate(''); setEndDate(''); }}
                                className="p-1.5 text-indigo-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Limpar competência"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filtro de período livre */}
                    <div className="flex gap-2 items-center bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
                        <div className="flex flex-col">
                            <label className="text-[8px] font-black text-gray-400 uppercase ml-1 mb-0.5">Início</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setCompetencia(''); }}
                                className="bg-transparent border-none text-[10px] font-black text-gray-900 focus:ring-0 p-0 uppercase"
                            />
                        </div>
                        <div className="w-[1px] h-6 bg-gray-200 mx-1" />
                        <div className="flex flex-col">
                            <label className="text-[8px] font-black text-gray-400 uppercase ml-1 mb-0.5">Fim</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setCompetencia(''); }}
                                className="bg-transparent border-none text-[10px] font-black text-gray-900 focus:ring-0 p-0 uppercase"
                            />
                        </div>
                        {(startDate || endDate) && !competencia && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="ml-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Limpar Filtros"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {activeView === 'pending' && (
                        <button 
                            onClick={handleApplyRulesManually}
                            disabled={isLoading || !selectedAccountId}
                            className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50 border border-blue-100/50"
                            title="Aplicar Regras Manualmente"
                        >
                            <Zap className="w-4 h-4" />
                        </button>
                    )}

                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!selectedAccountId || isImporting}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isImporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                <span>{importingMessage || 'Importando...'}</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                <span>Importar Extrato</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                    <button 
                        onClick={() => setActiveView('pending')}
                        className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Pendentes
                    </button>
                    <button 
                        onClick={() => setActiveView('conciliated')}
                        className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'conciliated' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Conciliados
                    </button>
                    <button 
                        onClick={() => setActiveView('rules')}
                        className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'rules' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Regras
                    </button>
                    <button 
                        onClick={() => setActiveView('categories')}
                        className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'categories' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Categorias
                    </button>
                </div>
            </div>

            {/* Bulk Action Bar - Refinada */}
            {(selectedBankTxIds.size > 0 || selectedInternalTxIds.size > 0) && (() => {
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
                                <span className="text-[10px] font-bold text-gray-400 mt-0.5 flex items-center gap-1">
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
                                    className="bg-white/10 border border-white/20 text-white text-[11px] font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none min-w-[180px] hover:bg-white/20"
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
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
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
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
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
                                    className="bg-white/10 border border-white/20 text-white text-[11px] font-black pl-9 pr-8 py-2.5 rounded-2xl uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none min-w-[200px] hover:bg-white/20"
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
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
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
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg active:scale-95 flex items-center gap-2"
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
                                    onClick={() => handleDeleteBankTransactions(Array.from(selectedBankTxIds))}
                                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600/80 hover:bg-red-500 transition-all shadow-lg active:scale-95 text-white"
                                    title="Excluir extratos selecionados"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir extratos ({bankCount})
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
            {activeView === 'rules' ? (
                renderRules()
            ) : activeView === 'categories' ? (
                renderCategories()
            ) : activeView === 'conciliated' ? (
                <div className="space-y-4 min-h-[500px]">
                    <div className="flex justify-between items-center px-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Transações Conciliadas
                        </h4>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                                <button 
                                    onClick={() => setConciliatedViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${conciliatedViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    title="Visualização em Linha"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => setConciliatedViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${conciliatedViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    title="Visualização em Grade"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">{matches.length} Vínculos</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                        {matches.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center p-12 text-center py-32">
                                <div className="w-20 h-20 bg-emerald-50 text-emerald-200 rounded-3xl flex items-center justify-center mb-6">
                                    <CheckCircle2 className="w-10 h-10" />
                                </div>
                                <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Nenhuma conciliação</h5>
                                <p className="text-xs text-gray-400 max-w-[200px]">Os vínculos efetuados aparecerão aqui.</p>
                            </div>
                        ) : (
                            <div className={`divide-y divide-gray-50 uppercase ${conciliatedViewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4 p-4 lg:p-6' : ''}`}>
                                {/* Column Headers only for list mode */}
                                {conciliatedViewMode === 'list' && (
                                    <div className="grid grid-cols-[1fr_120px_140px_60px_1fr_120px_140px_80px] gap-4 px-8 py-4 bg-gray-50/50 border-b border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest items-center">
                                        <div>Extrato: Descrição</div>
                                        <div 
                                            className="flex items-center justify-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm"
                                            onClick={() => setMatchSortOrder(matchSortOrder === 'desc' ? 'asc' : 'desc')}
                                        >
                                            Data <ArrowUpDown className="w-3 h-3" />
                                        </div>
                                        <div className="text-right">Valor</div>
                                        <div className="flex justify-center italic text-emerald-500/50 text-[8px]">Link</div>
                                        <div>Interno: Descrição</div>
                                        <div className="text-center">Data</div>
                                        <div className="text-right">Valor</div>
                                        <div className="text-center">Ações</div>
                                    </div>
                                )}

                                {sortedMatches.map(m => {
                                    const bTx = m.bank_transaction;
                                    const iTx = m.internal_transaction;
                                    if (!bTx || !iTx) return null;
                                    
                                    if (conciliatedViewMode === 'grid') {
                                        return (
                                            <div key={m.id} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bTx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            <FileText className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0 flex flex-col gap-1">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Extrato Bancário</p>
                                                            <p className="text-xs font-bold text-gray-900 truncate max-w-[150px] mb-1">{bTx.description_normalized || bTx.description_raw}</p>
                                                            <select 
                                                                value={bTx.category || ''}
                                                                onChange={(e) => handleUpdateBankCategory(bTx.id, e.target.value)}
                                                                className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer w-fit ${
                                                                    bTx.category 
                                                                        ? 'text-gray-900 bg-gray-50 border-gray-100' 
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                                }`}
                                                            >
                                                                <option value="">Pendente</option>
                                                                {uniqueCategories.map(cat => (
                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-xs font-black ${bTx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bTx.amount)}
                                                        </p>
                                                        <span className="text-[8px] font-black text-gray-400">{formatDateBR(bTx.transaction_date)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-center py-2 relative">
                                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-emerald-100" />
                                                    <div className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-sm relative z-10 border border-emerald-100">
                                                        <Check className="w-3 h-3" />
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-end mt-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iTx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                            <Briefcase className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0 flex flex-col gap-1">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Sistema Interno</p>
                                                            <p className="text-xs font-bold text-gray-900 truncate max-w-[150px] mb-1">{iTx.description}</p>
                                                            <select 
                                                                value={iTx.category || ''}
                                                                onChange={(e) => handleUpdateInternalCategory(iTx.id, e.target.value)}
                                                                className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer w-fit ${
                                                                    iTx.category 
                                                                        ? 'text-gray-900 bg-gray-50 border-gray-100' 
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                                }`}
                                                            >
                                                                <option value="">Pendente</option>
                                                                {uniqueCategories.map(cat => (
                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <div className="text-right">
                                                            <p className="text-xs font-black text-gray-900">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(iTx.amount)}
                                                            </p>
                                                            <span className="text-[8px] font-black text-emerald-600">{iTx.source_system}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleUndoMatch(m.id, bTx.id, iTx.id)}
                                                            className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Desfazer Vínculo"
                                                        >
                                                            <ArrowRightLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={m.id} className="relative grid grid-cols-[1fr_120px_140px_60px_1fr_120px_140px_80px] gap-4 p-6 hover:bg-gray-50 transition-all group items-center">
                                            {/* Bank Description */}
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bTx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                    <p className="text-sm font-bold text-gray-900 uppercase break-words" title={bTx.description_normalized || bTx.description_raw}>
                                                        {bTx.description_normalized || bTx.description_raw}
                                                    </p>
                                                    <select 
                                                        value={bTx.category || ''}
                                                        onChange={(e) => handleUpdateBankCategory(bTx.id, e.target.value)}
                                                        className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer w-fit ${
                                                            bTx.category 
                                                                ? 'text-gray-900 bg-gray-50 border-gray-100' 
                                                                : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                        }`}
                                                    >
                                                        <option value="">Pendente</option>
                                                        {uniqueCategories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Bank Date */}
                                            <div className="flex items-center justify-center gap-2">
                                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="text-[10px] font-black text-gray-400 uppercase leading-none">
                                                    {formatDateBR(bTx.transaction_date)}
                                                </span>
                                            </div>

                                            {/* Bank Amount */}
                                            <div className="text-right">
                                                <p className={`text-sm font-black ${bTx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bTx.amount)}
                                                </p>
                                            </div>

                                            {/* Central Interaction */}
                                            <div className="flex justify-center">
                                                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-sm">
                                                    <Check className="w-4 h-4" />
                                                </div>
                                            </div>

                                            {/* Internal Description */}
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iTx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    <Briefcase className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                    <p className="text-sm font-bold text-gray-900 uppercase break-words">
                                                        {iTx.description}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded shrink-0">
                                                            {iTx.source_system}
                                                        </span>
                                                        <select 
                                                            value={iTx.category || ''}
                                                            onChange={(e) => handleUpdateInternalCategory(iTx.id, e.target.value)}
                                                            className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer w-fit ${
                                                                iTx.category 
                                                                    ? 'text-gray-900 bg-gray-50 border-gray-100' 
                                                                    : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                            }`}
                                                        >
                                                            <option value="">Pendente</option>
                                                            {uniqueCategories.map(cat => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Internal Date */}
                                            <div className="flex items-center justify-center gap-2">
                                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="text-[10px] font-black text-gray-400 uppercase leading-none">
                                                    {formatDateBR(iTx.transaction_date)}
                                                </span>
                                            </div>

                                            {/* Internal Amount */}
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-900">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(iTx.amount)}
                                                </p>
                                                <span className="text-[9px] font-black text-emerald-600 uppercase">Vinculado</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex justify-center">
                                                <button 
                                                    onClick={() => handleUndoMatch(m.id, bTx.id, iTx.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                    title="Desfazer Vínculo"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
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
                                onClick={() => setPendentesViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${pendentesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em Grade"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[500px]">
                    {/* Left: Bank Statement */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-4">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Download className="w-4 h-4" />
                                Extrato Bancário
                            </h4>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <button
                                        onClick={() => { setBankCatDropdownOpen(o => !o); setInternalCatDropdownOpen(false); }}
                                        className={`px-3 py-1.5 border rounded-full text-[10px] font-bold focus:outline-none cursor-pointer flex items-center gap-1.5 ${bankCategoryFilter.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                    >
                                        {bankCategoryFilter.length > 0 ? `${bankCategoryFilter.length} categoria${bankCategoryFilter.length > 1 ? 's' : ''}` : 'Todas Categorias'}
                                        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {bankCatDropdownOpen && (
                                        <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                            <div className="flex border-b border-gray-100 mb-1">
                                                <button onClick={() => setBankCategoryFilter(['__none__', ...uniqueCategories])} className="flex-1 px-3 py-1.5 text-[10px] font-black text-blue-500 hover:bg-blue-50 uppercase tracking-wider text-left">Selecionar todos</button>
                                                <button onClick={() => setBankCategoryFilter([])} className="flex-1 px-3 py-1.5 text-[10px] font-black text-red-500 hover:bg-red-50 uppercase tracking-wider text-right">Limpar</button>
                                            </div>
                                            {[{ value: '__none__', label: '— Sem categoria' }, ...uniqueCategories.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={bankCategoryFilter.includes(value)}
                                                        onChange={() => setBankCategoryFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                        className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-0"
                                                    />
                                                    <span className="text-[10px] font-bold text-gray-700 uppercase truncate">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
                                    <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
                                    <select
                                        value={bankSortField}
                                        onChange={(e) => setBankSortField(e.target.value as typeof bankSortField)}
                                        className="text-[10px] font-bold bg-transparent focus:outline-none cursor-pointer text-gray-400 appearance-none"
                                    >
                                        <option value="date">Data</option>
                                        <option value="amount">Valor</option>
                                        <option value="description">Descrição</option>
                                        <option value="category">Categoria</option>
                                        <option value="counterparty">Cliente/Fornecedor</option>
                                    </select>
                                    <button
                                        onClick={() => setBankSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                                        className="ml-1 text-gray-400 hover:text-blue-600 transition-colors"
                                        title={bankSortOrder === 'desc' ? 'Decrescente' : 'Crescente'}
                                    >
                                        {bankSortOrder === 'desc' ? '↓' : '↑'}
                                    </button>
                                </div>
                                <div className="relative">
                                    <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtro..."
                                        value={bankSearch}
                                        onChange={(e) => setBankSearch(e.target.value)}
                                        className="pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 w-24 focus:w-32 transition-all"
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
                            </div>
                        </div>

                        <div className={`min-h-[400px] ${pendentesViewMode === 'grid' ? 'bg-transparent border-none shadow-none' : 'bg-transparent'}`}>
                            {bankTransactions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center py-32 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
                                    <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-3xl flex items-center justify-center mb-6">
                                        <FileText className="w-10 h-10" />
                                    </div>
                                    <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Sem extrato importado</h5>
                                    <p className="text-xs text-gray-400 max-w-[200px]">Importe um arquivo OFX, CSV ou CNAB para iniciar a conciliação.</p>
                                </div>
                            ) : (
                                <div className={pendentesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "flex flex-col gap-3 p-3"}>

                                    {pendentesViewMode === 'list' && sortedBankTransactions.length > 0 && (
                                        <div className="flex items-center gap-3 px-4 py-2">
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                checked={sortedBankTransactions.every(tx => selectedBankTxIds.has(tx.id))}
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
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                {sortedBankTransactions.every(tx => selectedBankTxIds.has(tx.id))
                                                    ? `${sortedBankTransactions.length} selecionados`
                                                    : `Selecionar todos visíveis (${sortedBankTransactions.length})`}
                                            </span>
                                        </div>
                                    )}

                                    {sortedBankTransactions.map(tx => (
                                        <div key={tx.id} className="group relative">
                                            {pendentesViewMode === 'grid' ? (
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
                                                            <p className={`text-sm font-black ${tx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {tx.direction === 'DEBIT' ? '-' : '+'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                                            </p>
                                                            <span className="text-[8px] font-black text-gray-400">{formatDateBR(tx.transaction_date)}</span>
                                                        </div>
                                                    </div>

                                                    <h6 className="text-xs font-bold text-gray-900 mb-3 truncate" title={tx.description_normalized || tx.description_raw}>
                                                        {tx.description_normalized || tx.description_raw}
                                                    </h6>

                                                    <div className="flex flex-col gap-3 mt-auto pt-3 border-t border-gray-50">
                                                        <div className="flex gap-2">
                                                            <select
                                                                value={tx.category || ''}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUpdateBankCategory(tx.id, e.target.value);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`flex-1 text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center ${
                                                                    tx.category
                                                                        ? 'text-gray-900 bg-gray-50 border-gray-100 hover:bg-gray-100'
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                                }`}
                                                            >
                                                                <option value="">Categoria</option>
                                                                {uniqueCategories.map(cat => (
                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                value={tx.project_id || ''}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUpdateBankProject(tx.id, e.target.value);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`flex-1 text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center ${
                                                                    tx.project_id
                                                                        ? 'text-gray-900 bg-blue-50 border-blue-100 hover:bg-blue-100'
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                                }`}
                                                            >
                                                                <option value="">Obra</option>
                                                                {masterProjects.map(proj => (
                                                                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            {tx.status === 'RULE_APPLIED' ? (
                                                            <div className="flex gap-1.5 shrink-0">
                                                                <button 
                                                                    className="text-[8px] font-black text-gray-500 bg-gray-50 border border-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 px-2 py-1 rounded-lg uppercase tracking-widest transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRejectRule(tx.id);
                                                                    }}
                                                                    title="Rejeitar Automático"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                                <button 
                                                                    className="text-[8px] font-black text-white bg-purple-600 px-3 py-1 rounded-lg uppercase tracking-widest hover:bg-purple-700 transition-all shadow-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleConfirmMatch(tx.id);
                                                                    }}
                                                                >
                                                                    Conciliar
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{tx.status}</span>
                                                        )}
                                                        </div>
                                                    </div>

                                                    {tx.status === 'RULE_APPLIED' && (
                                                        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden">
                                                            <div className="absolute top-0 right-0 bg-purple-600 text-[6px] font-black text-white px-8 py-1 rotate-45 translate-x-[35%] translate-y-[20%] uppercase tracking-widest">
                                                                Regra
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => setSelectedBankTxId(selectedBankTxId === tx.id ? null : tx.id)}
                                                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 z-10 relative hover:shadow-md ${selectedBankTxId === tx.id ? 'bg-blue-50 border-blue-400 shadow-lg ring-2 ring-blue-500/10 scale-[1.01]' : 'bg-white border-gray-100 shadow-sm'}`}
                                                >
                                                    {/* Linha 1: checkbox + ícone + descrição */}
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div onClick={(e) => e.stopPropagation()}>
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
                                                        </div>
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tx.direction === 'DEBIT' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                            {tx.direction === 'DEBIT' ? <ArrowRightLeft className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors uppercase truncate flex-1" title={tx.description_normalized || tx.description_raw}>
                                                            {tx.description_normalized || tx.description_raw}
                                                        </p>
                                                        {tx.status === 'RULE_APPLIED' && (
                                                            <span className="shrink-0 flex items-center gap-1 text-[8px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full uppercase">
                                                                <Zap className="w-2 h-2" /> Automático
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Linha 2: Fornecedor/Cliente / Categoria / Data / Valor */}
                                                    <div className="flex items-center gap-3 pl-10 flex-wrap">
                                                        {/* Seletor de Cliente / Fornecedor */}
                                                        <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                                                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-0.5">
                                                                {tx.direction === 'DEBIT' ? 'Credor' : 'Cliente'}
                                                            </span>
                                                            <select
                                                                value={tx.counterparty_name || ''}
                                                                onChange={(e) => { e.stopPropagation(); handleUpdateBankCounterparty(tx.id, e.target.value); }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`text-[10px] font-black uppercase border-b border-dashed bg-transparent focus:outline-none cursor-pointer transition-colors max-w-[130px] ${
                                                                    tx.counterparty_name
                                                                        ? 'text-gray-700 border-gray-300'
                                                                        : 'text-gray-400 border-gray-200'
                                                                }`}
                                                            >
                                                                <option value="" className="text-gray-900 bg-white">— selecionar</option>
                                                                {tx.counterparty_name && ![...uniqueCredores, ...uniqueClients, ...uniqueBankClients].includes(tx.counterparty_name) && (
                                                                    <option value={tx.counterparty_name} className="text-gray-900 bg-white">{tx.counterparty_name}</option>
                                                                )}
                                                                {(tx.direction === 'DEBIT' ? uniqueCredores : [...new Set([...uniqueClients, ...uniqueBankClients])].sort()).map(name => (
                                                                    <option key={name} value={name} className="text-gray-900 bg-white">{name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <select
                                                                value={tx.category || ''}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUpdateBankCategory(tx.id, e.target.value);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center ${
                                                                    tx.category
                                                                        ? 'text-gray-900 bg-gray-100 border-gray-200/50 hover:bg-gray-200'
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-400 hover:text-blue-500'
                                                                }`}
                                                            >
                                                                <option value="">Categoria</option>
                                                                {uniqueCategories.map(cat => (
                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <select
                                                                value={tx.project_id || ''}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUpdateBankProject(tx.id, e.target.value);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center ${
                                                                    tx.project_id
                                                                        ? 'text-gray-900 bg-blue-100 border-blue-200/50 hover:bg-blue-200'
                                                                        : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-400 hover:text-blue-500'
                                                                }`}
                                                            >
                                                                <option value="">Obra</option>
                                                                {masterProjects.map(proj => (
                                                                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center gap-1 ml-auto">
                                                            <Calendar className="w-3 h-3 text-gray-300 shrink-0" />
                                                            <span className="text-[10px] font-black text-gray-400 uppercase">
                                                                {formatDateBR(tx.transaction_date)}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-1">
                                                            <p className={`text-sm font-black ${tx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {tx.direction === 'DEBIT' ? '-' : '+'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                                            </p>
                                                            {tx.status === 'RULE_APPLIED' ? (
                                                                <div className="flex gap-1.5">
                                                                    <button
                                                                        className="text-[9px] font-black text-gray-500 bg-gray-50 border border-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 px-2 py-1 rounded-lg uppercase tracking-widest transition-all"
                                                                        onClick={(e) => { e.stopPropagation(); handleRejectRule(tx.id); }}
                                                                        title="Rejeitar Automático"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        className="text-[9px] font-black text-white bg-purple-600 px-3 py-1 rounded-lg uppercase tracking-widest hover:bg-purple-700 transition-all"
                                                                        onClick={(e) => { e.stopPropagation(); handleConfirmMatch(tx.id); }}
                                                                    >
                                                                        Aceitar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{tx.status}</span>
                                                            )}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteBankTransactions([tx.id]); }}
                                                                className="mt-1 p-1 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                title="Excluir extrato"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {/* AI Suggestions Panel */}
                                            {suggestions.filter(s => s.bank_transaction_id === tx.id).slice(0, 1).map(suggestion => {
                                                const cand = suggestion.candidate_internal_transaction;
                                                if (!cand) return null;
                                                return (
                                                    <div key={suggestion.id} className="mx-4 mb-2 -mt-2 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-b-xl flex items-center justify-between shadow-inner">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-6 h-6 rounded-full bg-purple-100/50 flex items-center justify-center text-purple-600">
                                                                <Zap className="w-3 h-3" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest">Sugestão Inteligente</span>
                                                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-white text-purple-500">{suggestion.confidence}% Match</span>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-gray-700 mt-0.5 max-w-[180px] truncate" title={cand.description}>
                                                                    {cand.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                            <button 
                                                                onClick={() => handleConfirmMatch(tx.id, cand.id)}
                                                                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-sm"
                                                            >
                                                                Conciliar Agora
                                                            </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Internal Ledger */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-4">
                            <div className="flex items-center gap-4">
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
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${
                                                sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id))
                                                    ? 'bg-emerald-600 text-white shadow-lg'
                                                    : 'bg-white text-emerald-600 border border-emerald-100 hover:bg-emerald-50'
                                            }`}
                                        >
                                            <CheckCircle2 className="w-3 h-3" />
                                            {sortedInternalTransactions.length > 0 && sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id)) ? 'Todos Selecionados' : 'Selecionar Tudo'}
                                        </button>
                                    )}
                                    <div className="relative">
                                        <button
                                            onClick={() => { setInternalCatDropdownOpen(o => !o); setBankCatDropdownOpen(false); }}
                                            className={`px-3 py-1.5 border rounded-full text-[10px] font-bold focus:outline-none cursor-pointer flex items-center gap-1.5 ${internalCategoryFilter.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                        >
                                            {internalCategoryFilter.length > 0 ? `${internalCategoryFilter.length} categoria${internalCategoryFilter.length > 1 ? 's' : ''}` : 'Todas Categorias'}
                                            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {internalCatDropdownOpen && (
                                            <div onMouseDown={(e) => e.stopPropagation()} className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[200px] py-1 max-h-64 overflow-y-auto">
                                                <div className="flex border-b border-gray-100 mb-1">
                                                    <button onClick={() => setInternalCategoryFilter(['__none__', ...uniqueCategories])} className="flex-1 px-3 py-1.5 text-[10px] font-black text-emerald-500 hover:bg-emerald-50 uppercase tracking-wider text-left">Selecionar todos</button>
                                                    <button onClick={() => setInternalCategoryFilter([])} className="flex-1 px-3 py-1.5 text-[10px] font-black text-red-500 hover:bg-red-50 uppercase tracking-wider text-right">Limpar</button>
                                                </div>
                                                {[{ value: '__none__', label: '— Sem categoria' }, ...uniqueCategories.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
                                                    <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={internalCategoryFilter.includes(value)}
                                                            onChange={() => setInternalCategoryFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                                                            className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-0"
                                                        />
                                                        <span className="text-[10px] font-bold text-gray-700 uppercase truncate">{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
                                        <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
                                        <select
                                            value={internalSortField}
                                            onChange={(e) => setInternalSortField(e.target.value as typeof internalSortField)}
                                            className="text-[10px] font-bold bg-transparent focus:outline-none cursor-pointer text-gray-400 appearance-none"
                                        >
                                            <option value="date">Data</option>
                                            <option value="amount">Valor</option>
                                            <option value="description">Descrição</option>
                                            <option value="category">Categoria</option>
                                            <option value="entity">Cliente/Fornecedor</option>
                                        </select>
                                        <button
                                            onClick={() => setInternalSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                                            className="ml-1 text-gray-400 hover:text-emerald-600 transition-colors"
                                            title={internalSortOrder === 'desc' ? 'Decrescente' : 'Crescente'}
                                        >
                                            {internalSortOrder === 'desc' ? '↓' : '↑'}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Filtro..."
                                            value={internalSearch}
                                            onChange={(e) => setInternalSearch(e.target.value)}
                                            className="pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 w-24 focus:w-32 transition-all"
                                        />
                                        {internalSearch && (
                                            <button
                                                onClick={() => setInternalSearch('')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                title="Limpar filtro"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleSyncAllData}
                                        disabled={isLoading}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${
                                            isLoading 
                                                ? 'bg-blue-50 text-blue-300 border-blue-100 animate-pulse' 
                                                : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'
                                        }`}
                                        title="Sincronizar nomes de Clientes/Fornecedores dos Projetos"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                                        {isLoading ? 'Sincronizando...' : 'Sincronizar'}
                                    </button>

                                    <button 
                                        onClick={() => setShowInternalTxModal(true)}
                                        className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 transition-colors uppercase flex items-center gap-1 bg-white border border-emerald-100 px-3 py-1.5 rounded-full hover:bg-emerald-50"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Novo
                                    </button>
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
                            ) : (
                                <div className={pendentesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "flex flex-col gap-3 p-3"}>

                                    {pendentesViewMode === 'list' && sortedInternalTransactions.length > 0 && (
                                        <div className="flex items-center gap-3 px-4 py-2">
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                checked={sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id))}
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
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                {sortedInternalTransactions.every(tx => selectedInternalTxIds.has(tx.id))
                                                    ? `${sortedInternalTransactions.length} selecionados`
                                                    : `Selecionar todos visíveis (${sortedInternalTransactions.length})`}
                                            </span>
                                        </div>
                                    )}

                                    {sortedInternalTransactions.map(tx => (
                                        pendentesViewMode === 'grid' ? (
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
                                                        <p className="text-sm font-black text-gray-900 leading-none">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                                        </p>
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{tx.source_system}</span>
                                                    </div>
                                                </div>

                                                <h6 className="text-xs font-bold text-gray-900 mb-3 truncate" title={tx.description}>
                                                    {tx.description}
                                                </h6>

                                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-3 h-3 text-gray-300" />
                                                        <span className="text-[8px] font-black text-gray-400 uppercase">{formatDateBR(tx.transaction_date)}</span>
                                                    </div>
                                                    
                                                    <select 
                                                        value={tx.category || ''}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            handleUpdateInternalCategory(tx.id, e.target.value);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={`text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center min-w-[80px] ${
                                                            tx.category 
                                                                ? 'text-gray-900 bg-gray-50 border-gray-100 hover:bg-gray-100' 
                                                                : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500'
                                                        }`}
                                                    >
                                                        <option value="">Pendente</option>
                                                        {uniqueCategories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={tx.id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-3 hover:shadow-md transition-all group">
                                                {/* Linha 1: checkbox + ícone + descrição */}
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                                        checked={selectedInternalTxIds.has(tx.id)}
                                                        onChange={(e) => {
                                                            const next = new Set(selectedInternalTxIds);
                                                            if (e.target.checked) next.add(tx.id);
                                                            else next.delete(tx.id);
                                                            setSelectedInternalTxIds(next);
                                                        }}
                                                    />
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tx.direction === 'DEBIT' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                        <Briefcase className="w-4 h-4" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-900 uppercase truncate flex-1" title={tx.description}>
                                                        {tx.description}
                                                    </p>
                                                    {tx.source_system !== 'MANUAL' && (
                                                        <span className="shrink-0 text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                                                            {tx.source_system}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Linha 2: Entidade / Categoria / Data / Valor / Ações */}
                                                <div className="flex items-center gap-3 pl-10 flex-wrap">
                                                    <div className="flex flex-col min-w-[80px]">
                                                        <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Cliente</span>
                                                        <p className="text-[10px] font-black text-gray-700 uppercase truncate max-w-[120px]">
                                                            {tx.entity_name || <span className="text-gray-300">—</span>}
                                                        </p>
                                                    </div>

                                                    <select
                                                        value={tx.category || ''}
                                                        onChange={(e) => { e.stopPropagation(); handleUpdateInternalCategory(tx.id, e.target.value); }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider border transition-all appearance-none cursor-pointer text-center ${
                                                            tx.category
                                                                ? 'text-gray-900 bg-gray-100 border-gray-200/50 hover:bg-gray-200'
                                                                : 'text-gray-400 bg-white border-dashed border-gray-200 hover:border-blue-400 hover:text-blue-500'
                                                        }`}
                                                    >
                                                        <option value="">Categoria</option>
                                                        {uniqueCategories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>

                                                    <div className="flex items-center gap-1 ml-auto">
                                                        <Calendar className="w-3 h-3 text-gray-300 shrink-0" />
                                                        <span className="text-[10px] font-black text-gray-400 uppercase">
                                                            {formatDateBR(tx.transaction_date)}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-1">
                                                        <p className="text-sm font-black text-gray-900 leading-none">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                                        </p>
                                                        <div className="flex items-center gap-1.5">
                                                            {tx.source_system === 'MANUAL' && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleEditInternalTx(tx); }}
                                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                        title="Editar"
                                                                    >
                                                                        <Settings2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteInternalTx(tx.id); }}
                                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                        title="Excluir"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!selectedBankTxId) {
                                                                        alert('Por favor, selecione primeiro uma transação no Extrato Bancário (lado esquerdo) para vincular.');
                                                                        return;
                                                                    }
                                                                    handleConfirmMatch(selectedBankTxId, tx.id);
                                                                }}
                                                                className={`text-[9px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg transition-all ${selectedBankTxId ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95' : 'text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100'}`}
                                                            >
                                                                {selectedBankTxId ? 'Confirmar Vínculo' : 'Vincular'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

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
                                        <div className="text-[10px] font-black text-gray-300 uppercase w-24">
                                            {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-700">
                                                {log.event_type === 'RULE_MATCH' ? 'Automação Aplicada' : 'Ação de Usuário'}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium">
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
