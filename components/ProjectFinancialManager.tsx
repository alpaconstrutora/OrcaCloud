import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
    Clock, Plus, Trash2, Pencil, Save, X, FileText, ShieldCheck, 
    ArrowUpRight, ArrowDownRight, Filter, CheckCircle2,
    DollarSign, Wallet, BarChart3, Receipt, FileDown,
    TrendingUp
} from 'lucide-react';
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
    BarChart, Bar, Cell, Legend, PieChart, Pie
} from 'recharts';
import {
    ProjectSettings, FinancialInfo, PaymentInstallment, FinancialTransaction,
    PurchaseOrder, BudgetEntry, Organization, PropertyDeal, Client
} from '../types';

// Tipos locais estendidos para dados que ganham campos extras em runtime
type RichInstallment = PaymentInstallment & {
    isCommercial?: boolean;
    sourceProjectId?: string;
};

type RichTransaction = FinancialTransaction & {
    dealType?: 'SALE' | 'RENTAL';
    propertyId?: string;
    propertyName?: string;
    measurementId?: string;
    isLinked?: boolean;
    sourceProjectId?: string;
    isOrder?: boolean;
    financialStatus?: string;
    orderNumber?: string;
    fullOrderId?: string;
};

type RichPropertyDeal = PropertyDeal & { client_name?: string; property_name?: string };

type CommercialProject = {
    id: string;
    name?: string;
    isVirtual?: boolean;
    settings: ProjectSettings;
    budget?: BudgetEntry[];
};

type SatelliteProject = {
    id: string;
    settings: { financialInfo?: FinancialInfo };
};

type ConciliacaoEntry = {
    date: string;
    description: string;
    value: number;
    match?: PaymentInstallment | null;
};

type MonthFlow = { inc: number; exp: number; projInc?: number };

interface KPICardProps {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    subtitle?: string;
    trend?: 'over' | 'under';
}
import { projectService } from '../services/projectService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { orderService } from '../services/orderService';
import { organizationService } from '../services/organizationService';
import { commercialService } from '../services/commercialService';
import { clientService } from '../services/clientService';
import { exportService } from '../services/exportService';
import { supabase } from '../lib/supabase';
import FinancialOrderDetails from './FinancialOrderDetails';
import BankReconciliation from './BankReconciliation';
import { financialSyncService } from '../services/financialSyncService';

interface ProjectFinancialManagerProps {
    settings: ProjectSettings;
    projectId?: string;
    organizationId?: string;
    onUpdateSettings: (settings: ProjectSettings) => void;
    budget?: BudgetEntry[];
    dealTypeFilter?: 'SALE' | 'RENTAL';
    onViewOrder?: (id: string) => void;
}

const EXPENSE_CATEGORIES = [
    { value: 'Material', label: 'Material', color: '#3b82f6' },
    { value: 'Mão de Obra', label: 'Mão de Obra', color: '#10b981' },
    { value: 'Equipamentos', label: 'Equipamentos', color: '#f59e0b' },
    { value: 'Serviços', label: 'Serviços', color: '#8b5cf6' },
    { value: 'Administrativo', label: 'Administrativo', color: '#ec4899' },
    { value: 'Folha de Pagamento', label: 'Folha de Pagamento', color: '#0ea5e9' },
    { value: 'Encargos Patronais', label: 'Encargos Patronais', color: '#f97316' },
    { value: 'Contribuições de Terceiros', label: 'Contribuições de Terceiros', color: '#8b5cf6' },
    { value: 'Outros', label: 'Outros', color: '#6b7280' },
];

const getCategoryColor = (cat: string) => EXPENSE_CATEGORIES.find(c => c.value === cat)?.color || '#6b7280';
const fmt = (v: unknown): string => typeof v === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : String(v ?? '');
const fmtShort = (v: unknown): string => {
    if (typeof v !== 'number') return String(v ?? '');
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
    return fmt(v);
};

type TabKey = 'resumo' | 'receitas' | 'despesas' | 'fluxo' | 'rentabilidade' | 'extrato' | 'conciliacao';

const KPICard = ({ title, value, icon: Icon, color, subtitle, trend }: KPICardProps) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md group">
        <div className="flex justify-between items-start mb-3">
            <div className={`p-2.5 rounded-xl transition-colors ${color} group-hover:bg-opacity-80`}>
                <Icon className="w-5 h-5" />
            </div>
            {trend && (
                <span className={`text-sm font-normal px-2 py-0.5 rounded-full uppercase tracking-tighter ${trend === 'over' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {trend === 'over' ? 'Acima' : 'Abaixo'}
                </span>
            )}
        </div>
        <h3 className="text-sm font-normal text-gray-400 uppercase tracking-widest mb-1">{title}</h3>
        <p className="text-sm font-normal text-gray-900 tracking-tight">{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-2 font-normal uppercase truncate">{subtitle}</p>}
    </div>
);

const ProjectFinancialManager: React.FC<ProjectFinancialManagerProps> = ({ settings, projectId, organizationId, onUpdateSettings, budget = [], dealTypeFilter }) => {
    const [activeTab, setActiveTab] = useState<TabKey>(
        (localStorage.getItem('financial_active_tab') as TabKey) || 'resumo'
    );
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAddingTransaction, setIsAddingTransaction] = useState(false);
    const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [linkedTransactions, setLinkedTransactions] = useState<FinancialTransaction[]>([]);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [originFilter, setOriginFilter] = useState<string>('all');
    const [expenseSearchTerm, setExpenseSearchTerm] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const handler = async () => {
            setRefreshTrigger(t => t + 1);
            if (settings?.id) {
                try {
                    const fresh = await projectService.loadProject(settings.id);
                    if (fresh?.settings?.financialInfo) {
                        onUpdateSettings({ ...settings, financialInfo: fresh.settings.financialInfo });
                    }
                } catch (_) {}
            }
        };
        window.addEventListener('payroll-synced', handler);
        return () => window.removeEventListener('payroll-synced', handler);
    }, [settings?.id]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [commercialProject, setCommercialProject] = useState<CommercialProject | null>(null);
    const [commercialDeals, setCommercialDeals] = useState<PropertyDeal[]>([]);
    const [localDealTypeFilter, setLocalDealTypeFilter] = useState<'ALL' | 'SALE' | 'RENTAL'>(dealTypeFilter || 'ALL');
    const [payingInstallment, setPayingInstallment] = useState<{ id: string; date: string } | null>(null);
    const [conciliacaoData, setConciliacaoData] = useState<ConciliacaoEntry[] | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [linkedInstallments, setLinkedInstallments] = useState<PaymentInstallment[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string | 'ALL'>('ALL');
    const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
    const [satelliteProjects, setSatelliteProjects] = useState<SatelliteProject[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

        const handleGlobalSync = async (orgId: string, deals: PropertyDeal[]) => {
            if (isSyncing) return;
            setIsSyncing(true);
            console.log('[FINANCIAL] Forced/Auto Global Sync Triggered for Org:', orgId);
            try {
                // Carregar o estado atual do Vault comercial uma única vez no início
                let targetProject = await commercialFinanceService.getOrCreateCommercialProject(orgId);
                if (!targetProject) throw new Error('Cofre comercial não localizado');
                
                let currentSettings = { ...targetProject.settings } as ProjectSettings;

                // Sincronia Sequencial (Acúmulo em Memória) - EVITA CORRIDA DE DADOS
                for (const deal of deals) {
                    const syncResult = await commercialFinanceService.syncDealToFinance(deal, orgId, currentSettings, true);
                    if (syncResult) {
                        // Atualizar o snapshot de memória para a próxima iteração do loop
                        currentSettings = {
                            ...currentSettings,
                            financialInfo: {
                                ...currentSettings.financialInfo,
                                totalValue: currentSettings.financialInfo?.totalValue ?? 0,
                                paymentMethod: currentSettings.financialInfo?.paymentMethod ?? 'Parcelamento Próprio',
                                installments: syncResult.installments,
                                transactions: syncResult.transactions
                            }
                        };
                    }
                }
                
                // O GRANDE SAVE ATÔMICO: Gravar tudo de uma só vez no banco de dados
                console.log(`[FINANCIAL] PERFORMING ATOMIC SAVE: Total items to persist: ${currentSettings.financialInfo?.installments?.length}`);
                await projectService.saveProject({
                    ...targetProject,
                    settings: currentSettings
                });

                const updatedProj = { ...targetProject, settings: currentSettings };
                setCommercialProject(updatedProj);
                
                // CARREGAR SATÉLITES: Trazer parcelas das obras vinculadas para o dashboard
                const linkedProjectIds = Array.from(new Set(deals.filter(d => d.linked_project_id).map(d => d.linked_project_id)));
                if (linkedProjectIds.length > 0) {
                    const otherProjects = await Promise.all(linkedProjectIds.map(id => projectService.loadProject(id as string)));
                    setSatelliteProjects(otherProjects.filter(Boolean));
                }

                // Notificar o pai sobre a atualização do cesto financeiro
                if (updatedProj.settings?.financialInfo) {
                    onUpdateSettings({ ...settings, financialInfo: updatedProj.settings.financialInfo });
                }
                
                console.log(`[FINANCIAL] Global Sync SUCCESS. Total items in Vault: ${updatedProj.settings?.financialInfo?.installments?.length || 0}`);
                // LOOP INFINITO CORRIGIDO: Remover setRefreshTrigger(p => p + 1) daqui!
                // Como já foi feito setCommercialProject e onUpdateSettings, o React já gerencia o state local
                // sem precisar re-engatilhar o useEffect fetchInitialData.
        } catch (e) {
            console.error('[Financial] Sync failed:', e);
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            if (isSaving) {
                console.log('[FINANCIAL] Sync blocked: saving in progress...');
                return;
            }
            try {
                // Sincronização Flexível: Removidas as travas de memória para garantir que o Waldir termine o resgate.
                // Carregar todas as organizações para o filtro se estivermos no modo Gestão Comercial
                if (settings.name === 'Gestão Comercial' && allOrgs.length === 0) {
                    const orgList = await organizationService.listOrganizations();
                    setAllOrgs(orgList || []);
                }

                // Determinar a organização atual baseada no filtro ou na prop fixa
                let currentOrgId = selectedOrgId === 'ALL' ? undefined : (selectedOrgId || organizationId || settings.organizationId);

                // Se não há org especificada e estamos no Gestão Comercial, permitimos null para visão Global
                if (!currentOrgId && settings.name === 'Gestão Comercial') {
                    console.log('[FINANCIAL] Global Mode detected (no organization filter)');
                    setOrganization(null);
                } else if (currentOrgId) {
                    // Se temos o ID mas não o objeto da organização (ou o objeto atual é diferente), buscamos
                    if (!organization || organization.id !== currentOrgId) {
                        const orgs = allOrgs.length > 0 ? allOrgs : await organizationService.listOrganizations();
                        const currentOrg = orgs.find(o => o.id === currentOrgId);
                        if (currentOrg) setOrganization(currentOrg);
                    }
                }

                // Sempre carrega o projeto de Gestão Comercial, negociações e clientes
                const [proj, deals, clientsData] = await Promise.all([
                    commercialFinanceService.getOrCreateCommercialProject(currentOrgId),
                    commercialService.listDeals(),
                    clientService.listClients()
                ]);

                setCommercialProject(proj);
                setCommercialDeals(deals);
                setClients(clientsData);

                // REGENERAÇÃO E CARREGAMENTO CONSOLIDADO
                if (settings.name === 'Gestão Comercial' && proj.settings?.financialInfo) {
                    console.log('[FINANCIAL] Global Sync Starting...');
                    const currentOrgId = organizationId || settings.organizationId;
                    if (currentOrgId && !isSyncing) {
                        handleGlobalSync(currentOrgId, deals);
                    }
                }
            } catch (err) {
                console.error('[Financial] Error loading initial data:', err);
            }
        };
        fetchInitialData();
    }, [projectId, settings.id, organizationId, settings.organizationId, refreshTrigger, selectedOrgId]); // Recarrega se o projeto, org ou filtro mudar

    // Persistência da aba ativa
    useEffect(() => {
        if (activeTab) localStorage.setItem('financial_active_tab', activeTab);
    }, [activeTab]);

    // Priorizar o financialInfo vindo do commercialProject se estamos no modo Gestão Comercial
    const [localFinancialInfo, setLocalFinancialInfo] = useState<FinancialInfo>(
        (settings.name === 'Gestão Comercial' && commercialProject?.settings?.financialInfo)
            ? commercialProject.settings.financialInfo
            : (settings.financialInfo || {
                totalValue: 0,
                paymentMethod: 'Parcelamento Próprio',
                installments: [],
                transactions: []
            })
    );

    // Sincronizar estado local quando os dados principais mudam (Refresh Trigger ou Sync)
    useEffect(() => {
        const fresh = (settings.name === 'Gestão Comercial' && commercialProject?.settings?.financialInfo)
            ? commercialProject.settings.financialInfo
            : settings.financialInfo;
        if (fresh) setLocalFinancialInfo(fresh);
    }, [settings.financialInfo, commercialProject?.settings?.financialInfo]);

    const financialInfo = localFinancialInfo;

    const effectiveDealTypeFilter = dealTypeFilter || localDealTypeFilter;

    const displayInstallments = useMemo(() => {
        let list = [
            ...(financialInfo.installments || []),
            ...linkedInstallments
        ];

        // Se estamos em modo Gestão Comercial, buscar parcelas de todos os "Projetos Satélites"
        if (settings.name === 'Gestão Comercial') {
            satelliteProjects.forEach((sat: SatelliteProject) => {
                const satInstallments = (sat.settings?.financialInfo?.installments || [])
                    .map((i: PaymentInstallment) => ({ ...i, isCommercial: true, sourceProjectId: sat.id }));
                list.push(...satInstallments);
            });
            
            console.log(`[FINANCIAL-UI] List before deduplication: ${list.length} items. Searching for Waldir #972a9afa...`);
            const waldirCheck = list.filter(i => (i.id || '').includes('972a9afa') || (i.description || '').includes('Waldir'));
            console.log(`[FINANCIAL-UI] Waldir items found: ${waldirCheck.length}`);

            // Deduplicação por ID para evitar mostrar a mesma parcela se ela estiver em dois lugares
            const seenIds = new Set();
            list = list.filter(i => {
                const id = i.id || `${i.description}-${i.value}-${i.dueDate}`;
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            });
            
            console.log(`[FINANCIAL-UI] List after deduplication: ${list.length} items.`);
        }

        // Se estamos em um projeto comum, incluir também parcelas da Gestão Comercial 
        // que referenciam este imóvel/projeto
        if (commercialProject && settings.name !== 'Gestão Comercial' && settings.name !== 'Acompanhamento de Obras') {
            const comm = commercialProject.settings?.financialInfo?.installments || [];
            const sName = (settings.name || '').toLowerCase().trim();
            const workingId = projectId || settings.id;

            const linkedFromComm = comm.filter((i: RichInstallment) => {
                const isIdMatch = workingId && (i.linkedProjectId === workingId || i.propertyId === workingId);
                const pName = (i.propertyName || '').toLowerCase().trim();
                const isNameMatch = sName !== '' && (pName === sName || pName.includes(sName) || sName.includes(pName));
                return isIdMatch || isNameMatch;
            }).map((i: RichInstallment) => ({ ...i, isCommercial: true, sourceProjectId: commercialProject.id }));
            
            if (linkedFromComm.length > 0) {
                console.log(`[FINANCE-DEBUG] Linked ${linkedFromComm.length} installments from Commercial Vault for project ${settings.name}`);
            }
            
            list.push(...linkedFromComm);
        }

        if (effectiveDealTypeFilter !== 'ALL') {
            list = list.filter(i => {
                if (i.dealType) return i.dealType === effectiveDealTypeFilter;
                const desc = (i.description || '').toLowerCase();
                if (effectiveDealTypeFilter === 'SALE') return desc.includes('venda') || desc.includes('entrada') || desc.includes('balão') || desc.includes('intermediária') || desc.includes('parcela');
                if (effectiveDealTypeFilter === 'RENTAL') return desc.includes('aluguel') || desc.includes('locação') || desc.includes('condomínio') || desc.includes('iptu');
                return true;
            });
        }
        return list;
    }, [financialInfo.installments, linkedInstallments, commercialProject, satelliteProjects, projectId, settings.id, settings.name, effectiveDealTypeFilter]);

    /* debugMessage removido */
    // Removed console.error causing user concern

    const localTransactions = financialInfo.transactions || [];

    const orderExpenses = useMemo(() => orders.filter(o => o.status !== 'Cancelado').map(o => ({
        id: o.id ?? o.number ?? '', date: o.created_at || o.deliveryDate || '', description: `[Pedido #${o.number}]`.trim(), category: 'Material' as FinancialTransaction['category'],
        value: o.items.reduce((s, i) => s + (i.total || 0), 0), supplier: o.supplierName || '', isOrder: true,
        financialStatus: o.isFinancialApproved ? 'PAGO' : 'PENDENTE', status: o.status as FinancialTransaction['status'], statusUpdatedAt: o.status_updated_at ?? o.created_at ?? '',
        orderNumber: o.number ?? '', fullOrderId: o.id ?? '', type: 'EXPENSE' as FinancialTransaction['type']
    } as RichTransaction)), [orders]);

    const transactions = useMemo(() => [
        ...(budget || []).flatMap(_b => ([] as RichTransaction[])),
        ...orderExpenses,
        ...localTransactions.map(t => ({ ...t, isLinked: false })),
        ...linkedTransactions.map(t => ({ ...t, isLinked: true }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [budget, orderExpenses, localTransactions, linkedTransactions]);


    useEffect(() => {
        const fetchData = async () => {
            // Avoid returning early if we are Gestão Comercial and we have the organization
            if (!settings.id && !settings.linkedProjectId && !settings.organizationId && settings.name !== 'Gestão Comercial') return;
            try {
                let allOrders: PurchaseOrder[] = [];
                let allLinkedTransactions: FinancialTransaction[] = [];

                if (settings.name === 'Gestão Comercial') {
                    // MODO CONSOLIDADO: Busca dados de toda a organização ou filtro selecionado
                    const orgId = selectedOrgId === 'ALL' ? undefined : (selectedOrgId || organizationId || settings.organizationId || organization?.id);
                    const allProjects = await projectService.listProjects(undefined, orgId, true);
                    const projectIds = (allProjects || []).map(p => p.id).filter(Boolean) as string[];

                    if (projectIds.length > 0) {
                        // Busca pedidos de todos os projetos (incluindo o próprio, se houver)
                        const ordersResults = await Promise.all(
                            projectIds.map(id => orderService.listOrders(id))
                        );
                        allOrders = Array.from(new Map(ordersResults.flat().map(o => [o.id, o])).values());

                        // Agrega transações e parcelas de todos os projetos (exceto do local se já for o comercial)
                        const aggLinkedTransactions: FinancialTransaction[] = [];
                        const aggLinkedInstallments: PaymentInstallment[] = [];

                        (allProjects || []).filter(p => p.id !== settings.id && p.name !== 'Gestão Comercial').forEach(p => {
                            const info = (p.settings as ProjectSettings)?.financialInfo;
                            if (info?.transactions) aggLinkedTransactions.push(...info.transactions.map(t => ({ ...t, sourceProjectId: p.id })));
                            if (info?.installments) aggLinkedInstallments.push(...info.installments.map(i => ({ ...i, sourceProjectId: p.id })));
                        });

                        allLinkedTransactions = aggLinkedTransactions;
                        setLinkedInstallments(aggLinkedInstallments);
                    }
                } else {
                    // MODO OBRA: Busca dados do projeto e seu vinculado
                    const orderPromises = [];
                    if (settings.id) orderPromises.push(orderService.listOrders(settings.id));
                    if (settings.linkedProjectId) orderPromises.push(orderService.listOrders(settings.linkedProjectId));
                    const [orderResults, ownProject] = await Promise.all([
                        Promise.all(orderPromises),
                        settings.id ? projectService.loadProject(settings.id) : Promise.resolve(null)
                    ]);
                    allOrders = Array.from(new Map(orderResults.flat().map(o => [o.id, o])).values());

                    // Sync own project's financialInfo from DB to ensure localTransactions is fresh
                    if (ownProject?.settings?.financialInfo) {
                        onUpdateSettings({ ...settings, financialInfo: ownProject.settings.financialInfo });
                    }

                    if (settings.linkedProjectId) {
                        const linkedProject = await projectService.loadProject(settings.linkedProjectId);
                        allLinkedTransactions = linkedProject?.settings?.financialInfo?.transactions || [];
                    }
                }

                setOrders(allOrders);
                setLinkedTransactions(allLinkedTransactions);
            } catch (error) {
                console.error('[Financial] Error fetching data:', error);
            }
        };
        fetchData();
    }, [settings.id, settings.linkedProjectId, organizationId, settings.organizationId, settings.name, refreshTrigger, organization?.id]);

    const [installmentForm, setInstallmentForm] = useState<Partial<PaymentInstallment>>({
        dueDate: new Date().toISOString().split('T')[0],
        value: 0, status: 'PENDING', description: ''
    });

    const [txForm, setTxForm] = useState<Partial<FinancialTransaction>>({
        date: new Date().toISOString().split('T')[0],
        type: 'EXPENSE', category: 'Material', description: '', value: 0, status: 'PENDING'
    });

    const [incomeGroupBy, setIncomeGroupBy] = useState<'none' | 'client' | 'property' | 'deal' | 'type'>('none');

    const handleSaveMultiple = async (updates: Partial<FinancialInfo>) => {
        // 1. Iniciar modo de dominância (bloqueia regravação por background/sync)
        setIsSaving(true);
        console.log("[FINANCIAL] ATOMIC INDEPENDENCE SAVE: Starting...", Object.keys(updates));
        const updatedInfo = { ...financialInfo, ...updates };
        
        // 1. ATUALIZAÇÃO INSTANTÂNEA LOCAL (Sem depender de ninguém)
        setLocalFinancialInfo(updatedInfo);
        
        // 2. Comunicar ao pai (opcional, para sync global)
        onUpdateSettings({ ...settings, financialInfo: updatedInfo });
        
        // 3. Se for Gestão Comercial, salvar no projeto centralizador com prioridade
        if (settings.name === 'Gestão Comercial' && commercialProject) {
            try {
                // SE FOR VIRTUAL (GLOBAL): Salvar nos sub-projetos reais
                if (commercialProject.isVirtual) {
                    console.log("[FINANCIAL] Virtual project detected. Performing 'Save-Through' to real projects...");

                    // Agrupar parcelas alteradas por projeto de origem
                    const installmentsByProject: Record<string, RichInstallment[]> = {};
                    updatedInfo.installments.forEach((i: RichInstallment) => {
                        const pid = i.sourceProjectId;
                        if (pid) {
                            if (!installmentsByProject[pid]) installmentsByProject[pid] = [];
                            installmentsByProject[pid].push(i);
                        }
                    });

                    // Salvar cada projeto individualmente e aguardar confirmação total
                    const projectIds = Object.keys(installmentsByProject);
                    await Promise.all(projectIds.map(async (pid) => {
                        const { data: realProject } = await supabase
                            .from('projects')
                            .select('*')
                            .eq('id', pid)
                            .single();

                        if (realProject) {
                            const existingRealInst = realProject.settings.financialInfo?.installments || [];
                            const updatesToApply = installmentsByProject[pid];
                            
                            // MESCLAGEM CIRÚRGICA: Atualiza apenas o que mudou, mantendo o restante
                            const mergedInst = existingRealInst.map((oldI: RichInstallment) => {
                                const freshI = updatesToApply.find((newI: RichInstallment) => newI.id === oldI.id);
                                return freshI ? { ...oldI, ...freshI } : oldI;
                            });

                            // Adicionar novas parcelas que por ventura foram criadas no modo virtual
                            const newFromVirtual = updatesToApply.filter((newI: RichInstallment) => !existingRealInst.some((oldI: RichInstallment) => oldI.id === newI.id));
                            if (newFromVirtual.length > 0) mergedInst.push(...newFromVirtual);

                            const updatedRealProject = {
                                ...realProject,
                                settings: {
                                    ...realProject.settings,
                                    financialInfo: {
                                        ...(realProject.settings.financialInfo || {}),
                                        installments: mergedInst
                                    }
                                }
                            };
                            await projectService.saveProject(updatedRealProject);
                            console.log(`[FINANCIAL] Virtual -> Real: Project ${pid} merged and confirmed.`);
                        }
                    }));
                } else {
                    // MODO NORMAL: Salva o projeto único
                    const updatedProject = {
                        ...commercialProject,
                        name: commercialProject.name ?? '',
                        budget: commercialProject.budget ?? [],
                        settings: {
                            ...(commercialProject.settings || {}),
                            financialInfo: updatedInfo
                        }
                    };
                    const saved = await projectService.saveProject(updatedProject);
                    console.log(`[FINANCIAL] DB CONFIRMED: ${settings.name} status updated.`);
                    
                    const currentOrgId = organizationId || settings.organizationId;
                    if (currentOrgId) {
                        await financialSyncService.syncFinancialData(saved, currentOrgId);
                    }
                }

                // Feedback visual e sincronização de background
                setTimeout(() => {
                    setIsSaving(false);
                    setRefreshTrigger(p => p + 1);
                }, 800);
            } catch (e) {
                console.error("[FINANCIAL] CRITICAL SAVE ERROR:", e);
                alert("Falha crítica ao gravar no banco de dados.");
                setIsSaving(false);
            }
        } else if (projectId || settings.id) {
            // FALLBACK DE SEGURANÇA: Salva diretamente no projeto pelo ID se o objeto comercial falhar
            try {
                const targetId = projectId || settings.id;
                console.log(`[FINANCIAL] Fallback save starting for ID: ${targetId}`);
                const { data: proj } = await supabase.from('projects').select('*').eq('id', targetId).single();
                if (proj) {
                    proj.settings.financialInfo = updatedInfo;
                    await projectService.saveProject(proj);
                    console.log(`[FINANCIAL] Fallback save successful.`);
                    setRefreshTrigger(p => p + 1);
                }
                setIsSaving(false);
            } catch (err) {
                console.error("[FINANCIAL] Fallback save failed:", err);
                setIsSaving(false);
            }
        } else {
            setIsSaving(false);
        }
    };

    const handleSaveInstallment = () => {
        if (!installmentForm.description || !installmentForm.value || installmentForm.value <= 0) return alert('Obrigatório.');
        let newList = [...financialInfo.installments];
        if (editingId) newList = newList.map(i => i.id === editingId ? { ...i, ...installmentForm } as PaymentInstallment : i);
        else newList.push({ ...installmentForm, id: crypto.randomUUID() } as PaymentInstallment);
        newList.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        handleSaveMultiple({ installments: newList });
        setIsAdding(false); setEditingId(null);
        setInstallmentForm({ dueDate: new Date().toISOString().split('T')[0], value: 0, status: 'PENDING', description: '' });
    };

    const handleEditInstallment = (inst: PaymentInstallment) => { setInstallmentForm(inst); setEditingId(inst.id); setIsAdding(true); };
    const handleDeleteInstallment = (id: string) => { if (confirm('Excluir?')) handleSaveMultiple({ installments: financialInfo.installments.filter(i => i.id !== id) }); };

    const handleWhatsAppCharge = (inst: PaymentInstallment) => {
        const deal = commercialDeals.find(d => d.id === inst.dealId);
        const client = clients.find(c => c.id === (inst.clientId || deal?.client_id));
        const phone = client?.phone || "55";

        const message = encodeURIComponent(
            `Olá ${inst.clientName || client?.name || 'Cliente'},\n\n` +
            `Gostaríamos de lembrar sobre o vencimento da sua parcela de *${fmt(inst.value)}* referente a *${inst.description}* (${inst.propertyName || 'Imóvel'}).\n\n` +
            `Vencimento: *${new Date(inst.dueDate).toLocaleDateString('pt-BR')}*\n\n` +
            `Caso já tenha realizado o pagamento, por favor desconsidere esta mensagem.`
        );
        window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`, '_blank');
    };

    const handleGenerateContract = (dealId: string) => {
        const deal = commercialDeals.find(d => d.id === dealId);
        if (deal) exportService.generatePropertyContractPDF(deal, settings, organization ?? undefined);
    };

    const handleImportStatement = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const lines = content.split('\n');
            const detectedTransactions: ConciliacaoEntry[] = [];

            lines.forEach(line => {
                const valueMatch = line.match(/(\d+[,.]\d{2})/);
                if (valueMatch) {
                    const val = parseFloat(valueMatch[0].replace(',', '.'));
                    if (val > 0) {
                        detectedTransactions.push({
                            date: new Date().toISOString().substring(0, 10),
                            description: line.substring(0, 30).trim() || 'Transação Importada',
                            value: val,
                            match: null
                        });
                    }
                }
            });

            const processed = detectedTransactions.slice(0, 10).map(line => {
                const match = (financialInfo.installments || []).find(i => i.status === 'PENDING' && Math.abs(i.value - line.value) < 0.01);
                return { ...line, match };
            });

            setConciliacaoData(processed);
        };
        reader.readAsText(file);
    };

    const confirmConciliacao = (matches: ConciliacaoEntry[]) => {
        const updated = (financialInfo.installments || []).map(inst => {
            const m = matches.find(x => x.match?.id === inst.id);
            if (m) return { ...inst, status: 'PAID' as PaymentInstallment['status'], paymentDate: m.date };
            return inst;
        });
        handleSaveMultiple({ installments: updated });
        setConciliacaoData(null);
    };

    const toggleInstallmentStatus = async (inst: PaymentInstallment) => {
        const newStatus = inst.status === 'PAID' ? 'PENDING' : 'PAID';
        const payDate = newStatus === 'PAID' ? new Date().toISOString().substring(0, 10) : undefined;
        console.log(`[FINANCIAL] Toggling ${inst.id} -> ${newStatus}. SOBERANA.`);
        
        let shouldReconcile = false;

        const isLocal = (financialInfo.installments || []).some(i => i.id === inst.id);
        if (isLocal) {
            const updated = (financialInfo.installments || []).map(i => i.id === inst.id ? { ...i, status: newStatus as PaymentInstallment['status'], paymentDate: payDate } : i);
            await handleSaveMultiple({ installments: updated });
            shouldReconcile = true;
        } else if ((inst as RichInstallment).sourceProjectId) {
            console.log(`[FINANCIAL] Remote Installment detected (${(inst as RichInstallment).sourceProjectId}). Targeting remote project.`);
            const { data: satProj } = await supabase.from('projects').select('*').eq('id', (inst as RichInstallment).sourceProjectId).single();
            if (satProj) {
                const satInsts: RichInstallment[] = satProj.settings?.financialInfo?.installments || [];
                const updatedSatInsts = satInsts.map(i => i.id === inst.id ? { ...i, status: newStatus as PaymentInstallment['status'], paymentDate: payDate } : i);
                satProj.settings.financialInfo = { ...(satProj.settings.financialInfo || {}), installments: updatedSatInsts };
                await projectService.saveProject(satProj);
                setRefreshTrigger(p => p + 1);
                shouldReconcile = true;
            }
        }
        
        // NOVO: Notificar o motor comercial sobre a mudança de status da parcela para acionar Liquidação Automática
        if (shouldReconcile && inst.dealId) {
             commercialFinanceService.reconcileDealStatusWithFinance(inst.dealId).catch(console.error);
        }
    };

    const confirmPayment = async (id: string, date: string) => {
        console.log(`[FINANCIAL] Confirming payment for ${id} (Global).`);
        const item = displayInstallments.find(i => i.id === id);
        const isLocal = (financialInfo.installments || []).some(i => i.id === id);
        
        let shouldReconcile = false;

        if (isLocal) {
            const updated = (financialInfo.installments || []).map(i => i.id === id ? { ...i, status: 'PAID' as PaymentInstallment['status'], paymentDate: date } : i);
            await handleSaveMultiple({ installments: updated });
            shouldReconcile = true;
        } else if (item && (item as RichInstallment).sourceProjectId) {
            const { data: satProj } = await supabase.from('projects').select('*').eq('id', (item as RichInstallment).sourceProjectId).single();
            if (satProj) {
                const satInsts: RichInstallment[] = satProj.settings?.financialInfo?.installments || [];
                const updatedSatInsts = satInsts.map(i => i.id === id ? { ...i, status: 'PAID' as PaymentInstallment['status'], paymentDate: date } : i);
                satProj.settings.financialInfo = { ...(satProj.settings.financialInfo || {}), installments: updatedSatInsts };
                await projectService.saveProject(satProj);
                setRefreshTrigger(p => p + 1);
                shouldReconcile = true;
            }
        }
        
        // NOVO: Notificar o motor comercial sobre a mudança de status da parcela
        if (shouldReconcile && item && item.dealId) {
             commercialFinanceService.reconcileDealStatusWithFinance(item.dealId).catch(console.error);
        }
    };

    const toggleExpenseStatus = async (exp: RichTransaction) => {
        if (isSaving) return;
        if (exp.isOrder) {
            setIsSaving(true);
            const orderStatus = exp.financialStatus === 'PAGO' ? false : true;
            await orderService.updateOrder(exp.fullOrderId!, { isFinancialApproved: orderStatus });
            setRefreshTrigger(p => p + 1);
            setIsSaving(false);
            return;
        }
        
        const newStatus = exp.status === 'PAID' ? 'PENDING' : 'PAID';
        const payDate = newStatus === 'PAID' ? new Date().toISOString().substring(0, 10) : undefined;
        console.log(`[FINANCIAL] Toggling expense ${exp.id} -> ${newStatus}. SOBERANA.`);
        
        const isLocal = (financialInfo.transactions || []).some(t => t.id === exp.id);
        if (isLocal) {
            const updated = (financialInfo.transactions || []).map(t => t.id === exp.id ? { ...t, status: newStatus as FinancialTransaction['status'], paymentDate: payDate } : t);
            await handleSaveMultiple({ transactions: updated });
        } else if (exp.sourceProjectId) {
            console.log(`[FINANCIAL] Remote Expense detected (${exp.sourceProjectId}).`);
            const { data: satProj } = await supabase.from('projects').select('*').eq('id', exp.sourceProjectId).single();
            if (satProj) {
                const satTx: RichTransaction[] = satProj.settings?.financialInfo?.transactions || [];
                const updatedSatTx = satTx.map(t => t.id === exp.id ? { ...t, status: newStatus as FinancialTransaction['status'], paymentDate: payDate } : t);
                satProj.settings.financialInfo = { ...(satProj.settings.financialInfo || {}), transactions: updatedSatTx };
                await projectService.saveProject(satProj);
                setRefreshTrigger(p => p + 1);
            }
        }
    };

    const handleSaveTransaction = () => {
        if (!txForm.description || !txForm.value || txForm.value <= 0) return alert('Obrigatório.');
        let newList = [...localTransactions];
        if (editingTransactionId) newList = newList.map(t => t.id === editingTransactionId ? { ...t, ...txForm } as FinancialTransaction : t);
        else newList.push({ ...txForm, id: crypto.randomUUID(), status_updated_at: new Date().toISOString() } as FinancialTransaction);
        newList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        handleSaveMultiple({ transactions: newList });
        setIsAddingTransaction(false); setEditingTransactionId(null);
        setTxForm({ date: new Date().toISOString().split('T')[0], type: 'EXPENSE', category: 'Material', description: '', value: 0, status: 'PENDING' });
    };

    const handleDeleteTransaction = (id: string) => { if (confirm('Excluir?')) handleSaveMultiple({ transactions: localTransactions.filter(t => t.id !== id) }); };



    const totalPaid = useMemo(() => displayInstallments.filter(i => i.status === 'PAID').reduce((s, i) => s + i.value, 0), [displayInstallments]);
    const totalInstallments = useMemo(() => displayInstallments.reduce((s, i) => s + i.value, 0), [displayInstallments]);
    const overdue = useMemo(() => displayInstallments.filter(i => i.status === 'PENDING' && new Date(i.dueDate) < new Date()), [displayInstallments]);



    const groupedIncomes = useMemo(() => {
        if (incomeGroupBy === 'none') return null;
        type IncomeGroup = { title: string; subtitle?: string; items: RichInstallment[]; total: number; paid: number; netTotal?: number };
        const groups: Record<string, IncomeGroup> = {};
        const list = [...displayInstallments];
        if (commercialProject && settings.name !== 'Gestão Comercial') {
            const comm = commercialProject.settings?.financialInfo?.installments || [];
            list.push(...comm.filter((i: RichInstallment) => (i.propertyId === settings.id || i.propertyName === settings.name) && (!dealTypeFilter || i.dealType === dealTypeFilter)));
        }
        list.forEach(inst => {
            let key = 'others', title = 'Outros', subtitle = undefined;
            if (incomeGroupBy === 'client') { key = inst.clientId || '?', title = inst.clientName || 'Cliente Indef.'; }
            else if (incomeGroupBy === 'property') { key = inst.propertyId || '?', title = inst.propertyName || 'Imóvel Indef.'; }
            else if (incomeGroupBy === 'deal') {
                key = inst.dealId || '?', title = `${inst.dealType === 'SALE' ? 'Venda' : 'Aluguel'} - #${(inst.dealId || '').substring(0, 8)}`;
                subtitle = `${inst.propertyName || ''} | ${inst.clientName || ''}`;
            }
            else if (incomeGroupBy === 'type') {
                key = inst.dealType || 'SALE';
                title = key === 'SALE' ? 'Vendas' : 'Locações';
            }
            if (!groups[key]) groups[key] = { title, subtitle, items: [], total: 0, paid: 0 };
            groups[key].items.push(inst); groups[key].total += inst.value; if (inst.status === 'PAID') groups[key].paid += inst.value;
            // Calcular valor líquido se houver comissão
            const commValue = (inst.value * (inst.commissionRate || 0)) / 100;
            groups[key].netTotal = (groups[key].netTotal || 0) + (inst.status === 'PAID' ? (inst.value - commValue) : 0);
        });
        return Object.values(groups).sort((a, b) => b.total - a.total);
    }, [displayInstallments, incomeGroupBy, commercialProject, settings.id, settings.name, dealTypeFilter]);



    const totalOrderExpenses = orderExpenses.reduce((s, e) => s + (e.value || 0), 0);
    const totalManualExpenses = transactions.filter(t => t.type === 'EXPENSE' && t.status !== 'CANCELLED').reduce((s, t) => s + (t.value || 0), 0);

    // Aplicar filtro de tipo nas despesas se estivermos no projeto Gestão Comercial
    const filteredTotalExpenses = useMemo(() => {
        if (effectiveDealTypeFilter === 'ALL' || settings.name !== 'Gestão Comercial') return totalOrderExpenses + totalManualExpenses;

        // No futuro, se pedidos tiverem dealType, filtramos aqui. 
        // Por ora, despesas "Gerais" (sem dealType) aparecem em ALL, mas não em filtros específicos 
        // a menos que desejado. Vamos manter apenas o que é explicitamente do tipo ou inferido.
        const manualFiltered = transactions.filter(t => {
            if (t.type !== 'EXPENSE' || t.status === 'CANCELLED') return false;
            const dealType = (t as RichTransaction).dealType;
            if (dealType) return dealType === effectiveDealTypeFilter;

            // Despesas gerais (sem dealType) aparecem em todos os filtros por enquanto
            return true;
        }).reduce((s, t) => s + t.value, 0);

        return totalOrderExpenses + manualFiltered; // Pedidos sempre aparecem
    }, [totalOrderExpenses, totalManualExpenses, transactions, effectiveDealTypeFilter, settings.name]);

    const totalExpenses = filteredTotalExpenses;

    const cashFlowData = useMemo(() => {
        const months: Record<string, MonthFlow> = {};
        // Receitas filtradas (displayInstallments já está filtrado)
        displayInstallments.filter(i => i.status === 'PAID' && i.paymentDate).forEach(i => {
            const m = i.paymentDate!.substring(0, 7);
            months[m] = months[m] || { inc: 0, exp: 0 };
            months[m].inc += i.value;
        });

        // Despesas filtradas
        const expenseList = transactions.filter(t => {
            if (t.type !== 'EXPENSE' || t.status === 'CANCELLED') return false;
            if (effectiveDealTypeFilter === 'ALL' || settings.name !== 'Gestão Comercial') return true;
            const desc = (t.description || '').toLowerCase();
            const dealType = (t as RichTransaction).dealType;
            if (dealType) return dealType === effectiveDealTypeFilter;
            if (effectiveDealTypeFilter === 'SALE') return desc.includes('venda');
            if (effectiveDealTypeFilter === 'RENTAL') return desc.includes('aluguel') || desc.includes('locação');
            return false;
        });

        expenseList.forEach(t => {
            const m = t.date.substring(0, 7);
            months[m] = months[m] || { inc: 0, exp: 0 };
            months[m].exp += t.value;
        });

        // Pedidos (considerados gerais)
        if (effectiveDealTypeFilter === 'ALL' || settings.name !== 'Gestão Comercial') {
            orderExpenses.forEach(o => {
                if (o.date) {
                    const m = o.date.substring(0, 7);
                    months[m] = months[m] || { inc: 0, exp: 0 };
                    months[m].exp += o.value;
                }
            });
        }

        let bal = 0;
        let projBal = 0;

        // Calcular saldo atual (realizado)
        const result = Object.entries(months).sort().map(([m, d]) => {
            bal += d.inc - d.exp;
            projBal = bal + (d.projInc || 0);
            return { name: m, receita: d.inc, despesa: d.exp, saldo: bal, projecao: projBal };
        });

        return result;
    }, [displayInstallments, transactions, orderExpenses, effectiveDealTypeFilter, settings.name]);

    const profitabilityByProperty = useMemo(() => {
        const properties: Record<string, { id: string; name: string; revenue: number; expense: number }> = {};

        displayInstallments.forEach(i => {
            const key = i.propertyId || i.propertyName || 'Indefinido';
            if (!properties[key]) properties[key] = { id: i.propertyId || '', name: i.propertyName || 'Indefinido', revenue: 0, expense: 0 };
            if (i.status === 'PAID') properties[key].revenue += i.value;
        });

        transactions.forEach(t => {
            if (t.type !== 'EXPENSE' || t.status === 'CANCELLED') return;
            const rt = t as RichTransaction;
            const key = rt.propertyId || rt.propertyName || 'Geral';
            if (!properties[key]) properties[key] = { id: rt.propertyId || '', name: rt.propertyName || 'Geral', revenue: 0, expense: 0 };
            properties[key].expense += t.value;
        });

        return Object.values(properties).map(p => {
            const netRevenue = displayInstallments
                .filter(i => (i.propertyId === p.id || i.propertyName === p.name) && i.status === 'PAID')
                .reduce((s, i) => {
                    const comm = (i.value * (i.commissionRate || 0)) / 100;
                    return s + (i.value - comm);
                }, 0);

            return {
                ...p,
                netRevenue,
                margin: netRevenue > 0 ? ((netRevenue - p.expense) / netRevenue) * 100 : 0
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }, [displayInstallments, transactions]);

    const filteredExpenses = useMemo(() => {
        let manual = transactions.filter(t => t.type === 'EXPENSE').map(t => ({
            ...t,
            isOrder: false,
            financialStatus: t.status === 'PAID' ? 'PAGO' : 'PENDENTE',
            orderNumber: '-',
            supplier: t.supplier || '-',
            dealType: (t as RichTransaction).dealType
        }));
        let oexp = [...orderExpenses];

        if (effectiveDealTypeFilter !== 'ALL' && settings.name === 'Gestão Comercial') {
            manual = manual.filter(t => {
                const dealType = (t as RichTransaction).dealType;
                if (dealType) return dealType === effectiveDealTypeFilter;
                return true; // Despesas sem tipo aparecem em todos os filtros
            });
            // Pedidos aparecem em todos os filtros (material da obra)
        }

        let list = [...manual, ...oexp];
        if (originFilter !== 'all') {
            list = list.filter(exp => {
                const re = exp as RichTransaction;
                const isContract = !!(re.measurementId || (exp.description || '').toLowerCase().includes('medição') || (exp.description || '').toLowerCase().includes('contrato:'));
                if (originFilter === 'Pedidos') return exp.isOrder;
                if (originFilter === 'Contrato') return isContract;
                if (originFilter === 'Venda') return re.dealType === 'SALE' && !isContract;
                if (originFilter === 'Aluguel') return re.dealType === 'RENTAL' && !isContract;
                if (originFilter === 'Geral') return !exp.isOrder && !isContract && !re.dealType && exp.category !== 'Folha de Pagamento' && exp.category !== 'Encargos Patronais' && exp.category !== 'Contribuições de Terceiros';
                if (originFilter === 'Folha de Pagamento') return exp.category === 'Folha de Pagamento' || exp.category === 'Encargos Patronais' || exp.category === 'Contribuições de Terceiros';
                return true;
            });
        }
        if (categoryFilter !== 'all') list = list.filter(e => e.category === categoryFilter);
        if (expenseSearchTerm) list = list.filter(e => e.description.toLowerCase().includes(expenseSearchTerm.toLowerCase()) || (e.supplier || '').toLowerCase().includes(expenseSearchTerm.toLowerCase()));
        if (filterDateFrom) list = list.filter(e => e.date >= filterDateFrom);
        if (filterDateTo)   list = list.filter(e => e.date <= filterDateTo);

        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, orderExpenses, originFilter, categoryFilter, expenseSearchTerm, filterDateFrom, filterDateTo, effectiveDealTypeFilter, settings.name]);

    const unifiedStatement = useMemo(() => {
        type StatementEntry = { id: string; date: string; description: string; value: number; type: string; status: string; supplier_client: string; category: string };
        const entries: StatementEntry[] = [];

        // Add Incomes (Installments)
        displayInstallments.forEach(inst => {
            entries.push({
                id: inst.id,
                date: inst.paymentDate || inst.dueDate,
                description: `Recebimento: ${inst.description || 'Parcela'}`,
                value: inst.value,
                type: 'INCOME',
                status: inst.status === 'PAID' ? 'PAGO' : 'PENDENTE',
                supplier_client: inst.clientName || '-',
                category: 'Receita'
            });
        });

        // Add Expenses (Transactions & Orders)
        filteredExpenses.forEach(exp => {
            entries.push({
                id: exp.id ?? '',
                date: exp.date,
                description: exp.description,
                value: exp.value,
                type: 'EXPENSE',
                status: exp.financialStatus || (exp.status === 'PAID' ? 'PAGO' : 'PENDENTE'),
                supplier_client: exp.supplier || '-',
                category: exp.category
            });
        });

        return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [displayInstallments, filteredExpenses]);



    const receitasCount = displayInstallments.length;
    const totalRevenue = totalInstallments;
    const pendingCount = displayInstallments.filter(i => i.status === 'PENDING').length;
    const pendingTotal = totalInstallments - totalPaid;
    const despesasCount = filteredExpenses.length;
    const profitability = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;

    const pieData = useMemo(() => [
        { name: 'Recebido', value: totalPaid, color: '#10b981' },
        { name: 'Pendente', value: pendingTotal, color: '#f59e0b' },
        { name: 'Atrasado', value: overdue.reduce((s, i) => s + i.value, 0), color: '#ef4444' }
    ], [totalPaid, pendingTotal, overdue]);


    const handleExport = (type: 'PDF' | 'EXCEL', tab: 'EXTRATO' | 'FLUXO') => {
        const data = tab === 'EXTRATO' ? filteredExpenses : cashFlowData;
        if (type === 'PDF') exportService.generateFinancialPDF(data, settings, { organization: organization ?? undefined, title: tab, fileName: `Relatorio_${tab}` }, tab);
        else exportService.generateFinancialExcel(data, settings, { organization: organization ?? undefined, fileName: `Relatorio_${tab}` }, tab);
    };

    const renderResumo = () => (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard title="Receita Total" value={fmt(totalRevenue)} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" subtitle={`${receitasCount} Parcelas Registradas`} />
                <KPICard title="Custo Direto" value={fmt(totalExpenses)} icon={DollarSign} color="bg-red-50 text-red-600" subtitle={`${despesasCount} Itens de Custo`} trend={totalExpenses > totalRevenue ? 'over' : undefined} />
                <KPICard title="Saldo em Aberto" value={fmt(pendingTotal)} icon={Wallet} color="bg-blue-50 text-blue-600" subtitle={`${pendingCount} Receitas Pendentes`} />
                <KPICard title="Rentabilidade" value={`${profitability.toFixed(1)}%`} icon={BarChart3} color="bg-indigo-50 text-indigo-600" subtitle={`ROI do Projeto`} trend={profitability < 15 ? 'over' : undefined} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm h-96 flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-sm font-normal text-gray-400 uppercase tracking-[0.2em]">Fluxo de Caixa</h3>
                            <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-normal">Entradas vs Saídas Mensais</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-[10px] font-normal uppercase tracking-widest text-gray-400">Receita</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400" /><span className="text-[10px] font-normal uppercase tracking-widest text-gray-400">Despesa</span></div>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer><AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient><linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.1} /><stop offset="95%" stopColor="#f87171" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'normal', fill: '#94a3b8' }} dy={10} /><YAxis axisLine={false} tickLine={false} tickFormatter={fmtShort} tick={{ fontSize: 10, fontWeight: 'normal', fill: '#94a3b8' }} /><Tooltip contentStyle={{ borderRadius: '1.25rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={fmt} /><Area type="monotone" dataKey="receita" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRec)" /><Area type="monotone" dataKey="despesa" stroke="#f87171" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" /></AreaChart></ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center relative overflow-hidden h-96">
                    <div className="absolute top-0 left-0 w-full p-8">
                        <h3 className="text-sm font-normal text-gray-400 uppercase tracking-[0.2em] mb-1">Status de Recebimento</h3>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-normal">Composição da Carteira</p>
                    </div>
                    <div className="w-full h-full pt-12">
                        <ResponsiveContainer><PieChart><Pie data={pieData} innerRadius={70} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none">{pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}</Pie><Tooltip formatter={fmt} /><Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: '20px' }} /></PieChart></ResponsiveContainer>
                    </div>
                    <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                        <p className="text-[10px] text-gray-400 font-normal uppercase tracking-widest mb-1">Em Aberto</p>
                        <p className="text-2xl font-normal text-gray-900 tracking-tighter">{fmt(pendingTotal)}</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderReceitas = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold">{commercialProject ? 'Consolidado da Carteira' : 'Resumo do Contrato'}</h3>
                        <div className="flex gap-2">
                            <label className="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-tighter bg-blue-50 px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer">
                                <FileDown className="w-3 h-3" />
                                Conciliação Bancária
                                <input type="file" className="hidden" accept=".csv,.ofx,.txt" onChange={handleImportStatement} />
                            </label>

                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-normal text-gray-400 uppercase tracking-widest ml-1">{commercialProject ? 'Total em Contratos' : 'Valor Total da Negociação'}</label>
                            <input type="number" value={financialInfo.totalValue} onChange={e => handleSaveMultiple({ totalValue: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-sm font-normal text-indigo-900 focus:bg-white focus:border-indigo-500 outline-none transition-all" placeholder="Valor Total" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-normal text-gray-400 uppercase tracking-widest ml-1">Modalidade de Pagamento</label>
                            <select value={financialInfo.paymentMethod} onChange={e => handleSaveMultiple({ paymentMethod: e.target.value })} className="w-full bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-sm font-normal text-gray-700 focus:bg-white focus:border-indigo-500 outline-none transition-all">
                                <option value="Parcelamento Próprio">Parcelamento Próprio</option><option value="Permuta">Permuta</option><option value="À Vista">À Vista</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-center space-y-2">
                    <div className="flex justify-between text-sm font-normal text-gray-400"><span>RECEBIDO</span><span className="text-emerald-600">{fmt(totalPaid)}</span></div>
                    <div className="flex justify-between text-sm font-normal text-gray-400"><span>PENDENTE</span><span className="text-amber-600">{fmt(financialInfo.totalValue - totalPaid)}</span></div>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-sm font-normal flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-500" /> Cronograma de Recebimentos</h3>
                    <div className="flex gap-2">
                        {settings.name === 'Gestão Comercial' && (
                            <>
                                <select value={incomeGroupBy} onChange={e => setIncomeGroupBy(e.target.value as 'none' | 'client' | 'property' | 'deal' | 'type')} className="text-[10px] font-black uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                                    <option value="none">Sem Grupo</option>
                                    <option value="client">Cliente</option>
                                    <option value="property">Imóvel</option>
                                    <option value="deal">Contrato</option>
                                    <option value="type">Tipo</option>
                                </select>
                            </>
                        )}
                        <select
                            value={localDealTypeFilter}
                            onChange={e => setLocalDealTypeFilter(e.target.value as 'ALL' | 'SALE' | 'RENTAL')}
                            className="text-[10px] font-black uppercase tracking-widest bg-white px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 outline-none hover:bg-gray-50 transition-colors"
                        >
                            <option value="ALL">Todas as Receitas</option>
                            <option value="SALE">Apenas Vendas (SALE)</option>
                            <option value="RENTAL">Apenas Locações (RENTAL)</option>
                        </select>
                        <button 
                            onClick={() => handleGlobalSync((organizationId || settings.organizationId || ''), commercialDeals)} 
                            disabled={isSyncing}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border transition-all ${isSyncing ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 shadow-sm'}`}
                        >
                            <Clock className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} /> 
                            {isSyncing ? 'Sincronizando...' : 'Sincronizar Vendas'}
                        </button>
                        <button onClick={() => setIsAdding(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> NOVO</button>
                    </div>
                </div>
                {isAdding && (
                    <div className="p-4 bg-indigo-50/30 grid grid-cols-1 md:grid-cols-5 gap-3 border-b border-indigo-100 items-end">
                        <input type="text" value={installmentForm.description} onChange={e => setInstallmentForm({ ...installmentForm, description: e.target.value })} placeholder="Desc." className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                        <input type="number" value={installmentForm.value} onChange={e => setInstallmentForm({ ...installmentForm, value: parseFloat(e.target.value) || 0 })} placeholder="Valor" className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                        <input type="date" value={installmentForm.dueDate} onChange={e => setInstallmentForm({ ...installmentForm, dueDate: e.target.value })} className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                        <div className="flex gap-2">
                            <input type="number" value={installmentForm.commissionRate || ''} onChange={e => setInstallmentForm({ ...installmentForm, commissionRate: parseFloat(e.target.value) || 0 })} placeholder="Comissão %" className="w-1/2 p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                            <input type="text" value={installmentForm.brokerName || ''} onChange={e => setInstallmentForm({ ...installmentForm, brokerName: e.target.value })} placeholder="Corretor" className="w-1/2 p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                        </div>
                        <select value={installmentForm.dealId || ''} onChange={e => { const d = commercialDeals.find(x => x.id === e.target.value) as RichPropertyDeal | undefined; setInstallmentForm({ ...installmentForm, dealId: e.target.value, dealType: d?.type, clientName: d?.client_name, propertyName: d?.property_name }); }} className="p-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="">Vínculo?</option>{commercialDeals.map(d => <option key={d.id} value={d.id}>{(d as RichPropertyDeal).property_name || 'Contrato'}</option>)}</select>
                        <div className="flex gap-1"><button onClick={handleSaveInstallment} className="p-2 bg-indigo-600 text-white rounded-lg"><Save className="w-4 h-4" /></button><button onClick={() => setIsAdding(false)} className="p-2 bg-white border border-gray-200 text-gray-400 rounded-lg"><X className="w-4 h-4" /></button></div>
                    </div>
                )}
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-normal uppercase text-sm tracking-widest border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">DESCRIÇÃO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">VENCIMENTO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">CLIENTE</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Nº CONTRATO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">TIPO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">VALOR</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">STATUS</th>
                            <th className="px-6 py-2 text-right">AÇÕES</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {groupedIncomes ? groupedIncomes.map((g, gi) => (
                            <React.Fragment key={gi}>
                                <tr className="bg-gray-50/50"><td colSpan={5} className="px-6 py-2 font-normal text-indigo-900 text-sm uppercase tracking-wider border-r border-gray-100 last:border-r-0">{g.title} {g.subtitle && <span className="text-sm text-gray-400 ml-2 font-normal">{g.subtitle}</span>}</td></tr>
                                {g.items.map((i: RichInstallment, idx: number) => (
                                    <tr key={`${i.id || 'new'}-${gi}-${idx}`} className="hover:bg-blue-50/50 group transition-colors">
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-sm flex items-center gap-2 text-gray-700">
                                            {i.description
                                                .replace(/\s*(-?\s*Deal\s*)?#\w+/gi, '')
                                                .split(' ').map((word: string) => word + ' ')}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{new Date(i.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 uppercase tracking-tight">{i.clientName || '-'}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-mono font-normal text-gray-400 uppercase tracking-tighter">{(i.dealId || '').substring(0, 8)}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-normal uppercase ${i.dealType === 'SALE' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                                {i.dealType === 'SALE' ? 'Venda' : 'Aluguel'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-indigo-600 text-sm">{fmt(i.value)}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 self-center"><button onClick={() => toggleInstallmentStatus(i)} className={`px-2 py-0.5 rounded text-sm font-normal uppercase ${i.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{i.status === 'PAID' ? 'Pago' : 'Pendente'}</button></td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                {i.status === 'PENDING' && new Date(i.dueDate) < new Date() && (
                                                    <button onClick={() => handleWhatsAppCharge(i)} className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-sm font-normal uppercase flex items-center gap-1 shadow-sm border border-emerald-100 hover:bg-emerald-100 transition-all" title="Cobrar WhatsApp">
                                                        Cobrar
                                                    </button>
                                                )}
                                                {i.dealId && (
                                                    <button onClick={() => handleGenerateContract(i.dealId!)} className="text-gray-400 hover:text-blue-600" title="Gerar Contrato">
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {i.status === 'PAID' && (
                                                    <button onClick={() => exportService.generateReceiptPDF(i, settings, organization ?? undefined)} className="text-gray-400 hover:text-emerald-600" title="Gerar Recibo">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button onClick={() => alert('Anexar comprovante em breve...')} className="text-gray-400 hover:text-blue-600" title="Anexar Comprovante">
                                                    <Plus className="w-3.5 h-3.5 scale-75 border rounded-full" />
                                                </button>
                                                <button onClick={() => handleEditInstallment(i)} className="text-gray-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDeleteInstallment(i.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        )) : displayInstallments.map((i, idx) => (
                            <tr key={`${i.id || 'new'}-${idx}`} className="hover:bg-blue-50/50 group transition-colors">
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-sm flex items-center gap-2 text-gray-700">
                                    {i.description
                                        .replace(/\s*(-?\s*Deal\s*)?#\w+/gi, '')
                                        .split(' ').map((word: string) => word + ' ')}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{new Date(i.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 uppercase tracking-tight">{i.clientName || '-'}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-mono font-normal text-gray-400 uppercase tracking-tighter">{(i.dealId || '').substring(0, 8)}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-normal uppercase ${i.dealType === 'SALE' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                        {i.dealType === 'SALE' ? 'Venda' : 'Aluguel'}
                                    </span>
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-indigo-600 text-sm">{fmt(i.value)}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 self-center"><button onClick={() => toggleInstallmentStatus(i)} className={`px-2 py-0.5 rounded text-sm font-normal uppercase ${i.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{i.status === 'PAID' ? 'Pago' : 'Pendente'}</button></td>
                                <td className="px-6 py-2.5 text-right">
                                    <div className="flex justify-end gap-1 transition-all">
                                        {i.status === 'PENDING' && new Date(i.dueDate) < new Date() && (
                                            <button onClick={() => handleWhatsAppCharge(i)} className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-sm font-normal uppercase flex items-center gap-1 shadow-sm border border-emerald-100 hover:bg-emerald-100 transition-all" title="Cobrar WhatsApp">
                                                Cobrar
                                            </button>
                                        )}
                                        {i.dealId && (
                                            <button onClick={() => handleGenerateContract(i.dealId!)} className="text-gray-400 hover:text-blue-600" title="Gerar Contrato">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {i.status === 'PAID' && (
                                            <button onClick={() => exportService.generateReceiptPDF(i, settings, organization ?? undefined)} className="text-gray-400 hover:text-emerald-600" title="Gerar Recibo">
                                                <FileText className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button onClick={() => alert('Anexar comprovante em breve...')} className="text-gray-400 hover:text-blue-600" title="Anexar Comprovante">
                                            <Plus className="w-3.5 h-3.5 scale-75 border rounded-full" />
                                        </button>
                                        <button onClick={() => handleEditInstallment(i)} className="text-gray-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => handleDeleteInstallment(i.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderDespesas = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <input type="text" placeholder="Buscar despesas..." value={expenseSearchTerm} onChange={e => setExpenseSearchTerm(e.target.value)} className="bg-white border border-gray-200 p-2 rounded-xl text-sm w-full max-w-xs" />
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-400 whitespace-nowrap">De</label>
                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="bg-white border border-gray-200 p-2 rounded-xl text-sm" />
                    </div>
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-400 whitespace-nowrap">Até</label>
                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="bg-white border border-gray-200 p-2 rounded-xl text-sm" />
                    </div>
                    {(filterDateFrom || filterDateTo) && (
                        <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 bg-white">✕ Limpar datas</button>
                    )}
                    <select value={originFilter} onChange={e => setOriginFilter(e.target.value)} className="bg-white border border-gray-200 p-2 rounded-xl text-sm">
                        <option value="all">Todas as Origens</option>
                        <option value="Pedidos">Pedidos</option>
                        <option value="Contrato">Contrato</option>
                        <option value="Venda">Venda</option>
                        <option value="Aluguel">Aluguel</option>
                        <option value="Geral">Geral</option>
                        <option value="Folha de Pagamento">Folha de Pagamento</option>
                    </select>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-white border border-gray-200 p-2 rounded-xl text-sm"><option value="all">Todas as Categorias</option>{EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                    <button onClick={() => setIsAddingTransaction(true)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-normal flex items-center gap-1 shadow-md hover:bg-red-700 transition-all uppercase"><Plus className="w-4 h-4" /> NOVA DESPESA</button>
                </div>
            </div>
            {isAddingTransaction && (
                <div className="p-4 bg-red-50/30 grid grid-cols-1 md:grid-cols-5 gap-3 border border-red-100 rounded-2xl items-end">
                    <input type="text" value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} placeholder="Descrição" className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                    <input type="number" value={txForm.value} onChange={e => setTxForm({ ...txForm, value: parseFloat(e.target.value) || 0 })} placeholder="Valor" className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                    <select value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} className="p-2 rounded-lg border border-gray-200 text-sm bg-white">{EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                    <input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} className="p-2 rounded-lg border border-gray-200 text-sm bg-white" />
                    <div className="flex gap-1"><button onClick={handleSaveTransaction} className="p-2 bg-red-600 text-white rounded-lg"><Save className="w-4 h-4" /></button><button onClick={() => setIsAddingTransaction(false)} className="p-2 bg-white border border-gray-200 text-gray-400 rounded-lg"><X className="w-4 h-4" /></button></div>
                </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-normal uppercase text-sm tracking-widest border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">DESCRIÇÃO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">FORNECEDOR</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Nº PEDIDO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">ORIGEM</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">TIPO</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">DATA</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">CATEGORIA</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">VALOR</th>
                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">STATUS</th>
                            <th className="px-6 py-2 text-right">AÇÕES</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredExpenses.map((exp: RichTransaction, idx: number) => (
                            <tr key={`${exp.id || 'new'}-${idx}`} className="hover:bg-blue-50/50 group transition-colors">
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-sm tracking-tight text-gray-700">
                                    {exp.description.split(' ').map((word: string) => word.startsWith('#') ? <span className="text-blue-600 font-mono text-sm font-normal">{word} </span> : word + ' ')}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 uppercase tracking-tight">{exp.supplier}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-mono font-normal text-gray-400">{exp.orderNumber || '-'}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-normal uppercase ${exp.isOrder ? 'bg-blue-50 text-blue-600' :
                                        (exp.measurementId || exp.description.toLowerCase().includes('medição') || exp.description.toLowerCase().includes('contrato:')) ? 'bg-purple-50 text-purple-600' :
                                            exp.dealType === 'SALE' ? 'bg-indigo-50 text-indigo-600' :
                                                exp.dealType === 'RENTAL' ? 'bg-orange-50 text-orange-600' :
                                                    'bg-gray-50 text-gray-500'
                                        }`}>
                                        {exp.isOrder ? 'Pedidos' :
                                            (exp.measurementId || exp.description.toLowerCase().includes('medição') || exp.description.toLowerCase().includes('contrato:')) ? 'Contrato' :
                                                exp.dealType === 'SALE' ? 'Venda' :
                                                    exp.dealType === 'RENTAL' ? 'Aluguel' :
                                                        'Geral'}
                                    </span>
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-normal uppercase ${exp.isOrder ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>
                                        {exp.isOrder ? 'Pedido' : 'Geral'}
                                    </span>
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{new Date(exp.date + (exp.date.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0"><span className="px-2 py-0.5 rounded text-sm font-normal uppercase" style={{ backgroundColor: getCategoryColor(exp.category) + '18', color: getCategoryColor(exp.category) }}>{exp.category}</span></td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-normal text-red-600 text-sm">{fmt(exp.value)}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 self-center">
                                    <button onClick={() => toggleExpenseStatus(exp)} className={`px-2 py-0.5 rounded text-[10px] font-normal uppercase ${exp.financialStatus === 'PAGO' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {exp.financialStatus === 'PAGO' ? 'Pago' : 'Pendente'}
                                    </button>
                                </td>
                                <td className="px-6 py-2.5 text-right">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={() => alert('Anexar nota fiscal em breve...')} className="text-gray-400 hover:text-blue-600" title="Anexar Nota/Comprovante">
                                            <Plus className="w-3.5 h-3.5 scale-75 border rounded-full" />
                                        </button>
                                        {!exp.isOrder && (
                                            <>
                                                <button onClick={() => { setTxForm(exp); setEditingTransactionId(exp.id); setIsAddingTransaction(true); }} className="text-gray-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDeleteTransaction(exp.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderFluxo = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 h-80">
                <h3 className="text-sm font-normal mb-4">Evolução Mensal do Saldo</h3>
                <ResponsiveContainer><AreaChart data={cashFlowData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis tickFormatter={fmtShort} /><Tooltip formatter={fmt} /><Area type="monotone" dataKey="saldo" stroke="#10b981" fill="#10b981" fillOpacity={0.1} /></AreaChart></ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-400 font-normal uppercase border-b border-gray-100"><tr><th className="px-4 py-2">MÊS</th><th className="px-4 py-2 text-right">RECEITA</th><th className="px-4 py-2 text-right">DESPESA</th><th className="px-4 py-2 text-right">SALDO ACUM.</th></tr></thead><tbody className="divide-y divide-gray-50">{cashFlowData.map((r, i: number) => <tr key={i} className="hover:bg-gray-50"><td className="px-4 py-2 font-normal">{r.name}</td><td className="px-4 py-2 text-right text-emerald-600 font-normal">{fmt(r.receita)}</td><td className="px-4 py-2 text-right text-red-500 font-normal">{fmt(r.despesa)}</td><td className={`px-4 py-2 text-right font-normal ${r.saldo >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmt(r.saldo)}</td></tr>)}</tbody></table>
            </div>
        </div>
    );


    const renderRentabilidade = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <h3 className="text-sm font-normal text-gray-400 uppercase tracking-widest">Performance por Imóvel</h3>
                        <div className="p-1 px-3 bg-indigo-50 text-indigo-600 rounded-full text-sm font-normal uppercase">KPIs Consolidados</div>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/50 text-gray-400 font-normal uppercase tracking-tighter border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4">Imóvel</th>
                                <th className="px-6 py-4 text-right">Receita Acum.</th>
                                <th className="px-6 py-4 text-right">Custo Direto</th>
                                <th className="px-6 py-4 text-right">Margem Bruta</th>
                                <th className="px-6 py-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {profitabilityByProperty.map((p, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 font-normal text-gray-900">{p.name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="font-mono font-normal text-emerald-600">{fmt(p.revenue)}</span>
                                            <span className="text-sm text-gray-400 font-normal uppercase tracking-tighter">Líq: {fmt(p.netRevenue)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-normal text-red-500">{fmt(p.expense)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`font-normal ${p.margin >= 30 ? 'text-blue-600' : p.margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {p.margin.toFixed(1)}%
                                            </span>
                                            <span className="text-sm text-gray-400 font-normal uppercase tracking-tighter">ROI Baseado em Líq.</span>
                                            <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full transition-all duration-1000 ${p.margin >= 30 ? 'bg-blue-500' : p.margin >= 15 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.max(p.margin, 0), 100)}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-2 py-1 rounded-lg text-sm font-normal uppercase ${p.revenue > p.expense ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                            {p.revenue > p.expense ? 'Lucro' : 'Déficit'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[500px] flex flex-col">
                    <h3 className="text-sm font-normal text-gray-400 uppercase tracking-widest mb-6">Comparativo de Receitas</h3>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                            <BarChart data={profitabilityByProperty} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 14, fontWeight: 'normal' }} width={80} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={fmt} />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                                    {profitabilityByProperty.map((_, index) => (
                                        <Cell key={index} fill={index === 0 ? '#3b82f6' : '#94a3b8'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-sm font-normal text-gray-500 uppercase leading-relaxed text-center italic">
                            "A rentabilidade é calculada com base nos pagamentos efetivados e custos diretos manuais lançados."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderExtrato = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Movimentação Unificada</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Todas as entradas e saídas do projeto</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-[0.2em]">
                            <tr>
                                <th className="px-8 py-5">Item</th>
                                <th className="px-8 py-5">Data</th>
                                <th className="px-8 py-5 text-right">Valor</th>
                                <th className="px-8 py-5">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {unifiedStatement.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-xl ${item.type === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                {item.type === 'INCOME' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">{item.description}</p>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">{item.supplier_client}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-xs font-bold text-gray-500">
                                        {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'}
                                    </td>
                                    <td className={`px-8 py-5 text-sm font-black text-right ${item.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {item.type === 'INCOME' ? '+' : '-'} {fmt(item.value)}
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.status === 'PAGO' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                                            }`}>
                                            {item.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'resumo', label: 'Resumo' },
        { key: 'receitas', label: 'Receitas' },
        { key: 'despesas', label: 'Despesas' },
        { key: 'fluxo', label: 'Fluxo' },
        { key: 'rentabilidade', label: 'Rentabilidade' },
        { key: 'extrato', label: 'Extrato' },
        { key: 'conciliacao', label: 'Conciliação' }
    ];

    return (
        <div className="p-2 space-y-8 animate-in fade-in duration-500">
            {/* Header & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
                    <TabsList>
                        {tabs.map((tab) => (
                            <TabsTrigger key={tab.key} value={tab.key}>
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleExport('PDF', activeTab === 'fluxo' ? 'FLUXO' : 'EXTRATO')}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-2xl font-normal text-sm uppercase border border-gray-200 shadow-sm hover:shadow-md transition-all active:scale-95"
                    >
                        <FileText className="w-4 h-4 text-red-500" />
                        PDF
                    </button>
                    <button
                        onClick={() => handleExport('EXCEL', activeTab === 'fluxo' ? 'FLUXO' : 'EXTRATO')}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-normal text-sm uppercase shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95"
                    >
                        <FileDown className="w-4 h-4" />
                        Excel
                    </button>
                </div>
            </div>

            {settings.name === 'Gestão Comercial' && (
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex bg-blue-50/50 p-1.5 rounded-[1.5rem] border border-blue-100/50 w-fit">
                        {(['ALL', 'SALE', 'RENTAL'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setLocalDealTypeFilter(type)}
                                className={`px-4 py-2 text-sm font-normal uppercase tracking-tighter transition-all ${localDealTypeFilter === type
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    : 'text-blue-400 hover:text-blue-600 hover:bg-white/50'
                                    }`}
                            >
                                {type === 'ALL' ? 'Geral' : type === 'SALE' ? 'Vendas' : 'Locações'}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-[1.5rem] border border-gray-200/50">
                        <Filter className="w-4 h-4 text-gray-400 ml-2" />
                        <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            className="bg-transparent text-xs font-normal uppercase tracking-widest text-gray-600 outline-none pr-4 cursor-pointer"
                        >
                            <option value="ALL">Todas as Organizações</option>
                            {allOrgs.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {activeTab === 'resumo' && renderResumo()}
            {activeTab === 'receitas' && renderReceitas()}
            {activeTab === 'despesas' && renderDespesas()}
            {activeTab === 'fluxo' && renderFluxo()}
            {activeTab === 'rentabilidade' && renderRentabilidade()}
            { activeTab === 'extrato' && renderExtrato() }
            { activeTab === 'conciliacao' && <BankReconciliation organizationId={selectedOrgId !== 'ALL' ? selectedOrgId : (organizationId || settings.organizationId || organization?.id || '')} /> }

            {selectedOrderId && <FinancialOrderDetails orderId={selectedOrderId} onUpdate={() => setRefreshTrigger(p => p + 1)} onClose={() => setSelectedOrderId(null)} />}

            {payingInstallment && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 shadow-sm">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <button onClick={() => setPayingInstallment(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <h3 className="text-xl font-normal text-gray-900 mb-2 tracking-tight">Confirmar Recebimento</h3>
                        <p className="text-sm text-gray-500 font-normal uppercase tracking-widest mb-8 opacity-60">Escolha a data efetiva do pagamento</p>

                        <div className="space-y-6">
                            <div className="group">
                                <label className="text-sm font-normal text-gray-400 uppercase tracking-widest mb-2 block group-focus-within:text-blue-600 transition-colors">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={payingInstallment?.date || ''}
                                    onChange={e => payingInstallment && setPayingInstallment({ ...payingInstallment, date: e.target.value })}
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl text-sm font-normal transition-all outline-none shadow-sm"
                                />
                            </div>

                            <div className="flex flex-col gap-3 pt-4">
                                <button
                                    onClick={() => payingInstallment && confirmPayment(payingInstallment.id, payingInstallment.date)}
                                    className="w-full bg-blue-600 text-white p-4 rounded-[1.25rem] font-normal text-sm uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Confirmar Baixa
                                </button>
                                <button
                                    onClick={() => setPayingInstallment(null)}
                                    className="w-full bg-white text-gray-400 p-4 rounded-[1.25rem] font-normal text-sm uppercase tracking-widest border border-transparent hover:text-gray-600 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {conciliacaoData && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-2xl border border-gray-100 animate-in slide-in-from-bottom-8 duration-500">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-2xl font-normal text-gray-900 tracking-tight">Conciliação Bancária</h3>
                                <p className="text-sm text-gray-500 font-normal uppercase tracking-widest opacity-60">Processando extrato bancário (OFX/CSV)</p>
                            </div>
                            <button onClick={() => setConciliacaoData(null)} className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {conciliacaoData && conciliacaoData.map((item, idx) => (
                                <div key={idx} className={`p-5 rounded-3xl border transition-all flex items-center justify-between ${item.match ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-2xl ${item.match ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-200 text-gray-500'}`}>
                                            <Receipt className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-normal text-gray-900">{item.description}</p>
                                            <p className="text-sm font-normal text-gray-500">{new Date(item.date).toLocaleDateString('pt-BR')} • {fmt(item.value)}</p>
                                        </div>
                                    </div>
                                    {item.match ? (
                                        <div className="text-right">
                                            <span className="text-sm font-normal text-emerald-600 uppercase tracking-tighter bg-white px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">Correspondência Encontrada</span>
                                            <p className="text-sm font-normal text-gray-400 mt-1">{item.match.description}</p>
                                        </div>
                                    ) : (
                                        <span className="text-sm font-normal text-gray-400 uppercase tracking-tighter">Sem correspondência</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-4 mt-10">
                            <button
                                onClick={() => conciliacaoData && confirmConciliacao(conciliacaoData.filter(d => d.match))}
                                className="flex-1 bg-blue-600 text-white p-5 rounded-3xl font-normal text-sm uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Confirmar {conciliacaoData ? conciliacaoData.filter(d => d.match).length : 0} Baixas Automáticas
                            </button>
                            <button onClick={() => setConciliacaoData(null)} className="bg-gray-50 text-gray-400 px-8 rounded-3xl font-normal text-sm uppercase tracking-widest hover:bg-gray-100 transition-all">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectFinancialManager;

