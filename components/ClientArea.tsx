import React from 'react';
import {
    LayoutDashboard,
    Calendar,
    BookOpen,
    FileText,
    Sun,
    Cloud,
    CloudRain,
    TrendingUp,
    HardHat,
    DollarSign,
    MapPin,
    Clock,
    CheckCircle2,
    AlertCircle,
    Download,
    Info,
    CloudSun,
    ChevronRight,
    Pencil,
    Plus,
    X,
    Camera,
    Video,
    Table2,
    ShieldCheck,
    Sparkles,
    Palette,
    Users,
    FileDown,
    Settings2,
    Eye,
    EyeOff,
    UserCircle,
    Phone,
    Mail,
    Hash,
    Home,
    Save,
    Smartphone,
    Bell,
    ArrowRight,
    Wallet,
    Wrench,
    ClipboardList,
    MoreHorizontal
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, Line, ComposedChart } from 'recharts';
import { buildPlanningView, type PlanningView } from '../utils/portalPlanningUtils';
import { ProjectSettings, BudgetEntry, DiaryEntry, UserProfile, Client, PaymentInstallment, Contract } from '../types';
import { calculateProjectProgress, calculateUpcomingPhases, getPhaseSchedule, calculateRealizedFinancialProgress, calculatePlannedFinancialProgress } from '../utils/projectUtils';
import ProjectGallery from './ProjectGallery';
import { ClientAIInsight } from '../services/clientAiService';
import AIInsightCard from './AIInsightCard';
import FinishSelection from './FinishSelection';
import ClientList from './ClientList';
import { clientService } from '../services/clientService';
import { clientRequestsService, ClientRequest } from '../services/clientRequestsService';
import { clientMessagesService, ClientPortalMessage } from '../services/clientMessagesService';
import { exportService } from '../services/exportService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { contractService } from '../services/contractService';
import { clientPortalService } from '../services/clientPortalService';
import { projectService } from '../services/projectService';
import { orderService } from '../services/orderService';
import { storageService } from '../services/storageService';
import { PurchaseOrder } from '../types';
import MobilePreviewFrame from './MobilePreviewFrame';
import { useConfirm } from './ui/confirm';

interface ClientAreaProps {
    settings: ProjectSettings;
    budget: BudgetEntry[];
    profile?: { group: string; role: string };
    clientProfile?: Client | null;
    clients?: Client[]; // For admin selection
    organizationId?: string | null; // Fallback quando settings não traz organizationId (ex.: portal sem projeto aberto)
    activeTab?: 'dashboard' | 'clientes' | 'jornada' | 'obra' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'contratos' | 'financeiro' | 'suporte' | 'manutencao';
    portalToken?: string;
    onUpdateSettings?: (settings: ProjectSettings) => void;
    onClientSelect?: (client: Client) => void;
    /** Renderiza a área como o cliente a vê (sem chrome de admin), usado na prévia mobile. */
    isPreview?: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

// Selo de status de contrato no dashboard do portal (minuta = "Em elaboração").
const contractDashBadge = (status?: string): { label: string; cls: string } =>
    status === 'Assinado' ? { label: 'Assinado', cls: 'bg-emerald-100 text-emerald-700' }
    : status === 'Minuta' ? { label: 'Em elaboração', cls: 'bg-amber-100 text-amber-700' }
    : { label: status || 'Ativo', cls: 'bg-blue-100 text-blue-700' };

export const ClientArea: React.FC<ClientAreaProps> = ({ settings, budget, profile, clientProfile, organizationId, activeTab: initialTab, portalToken, onUpdateSettings, onClientSelect, isPreview = false }) => {
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = React.useState<'dashboard' | 'clientes' | 'jornada' | 'obra' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'contratos' | 'financeiro' | 'suporte' | 'manutencao'>(initialTab || 'dashboard');
    const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
    const [aiInsight] = React.useState<ClientAIInsight | null>(null);
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [selectedEntry, setSelectedEntry] = React.useState<DiaryEntry | null>(null);
    const [showGenerator, setShowGenerator] = React.useState(false);
    const [genConfig, setGenConfig] = React.useState({
        type: 'PARCELADO' as 'VISTA' | 'PARCELADO',
        sinal: 0,
        chaves: 0,
        numMensais: 12,
        numSeme: 0,
        valSeme: 0,
        numAnual: 0,
        valAnual: 0,
        startDate: new Date().toISOString().split('T')[0]
    });
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    // Na prévia mobile, renderiza exatamente o que o cliente vê (sem permissões de admin).
    const isAdmin = !isPreview && (profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER || profile?.group === 'DESENVOLVEDOR');

    const [showTabConfig, setShowTabConfig] = React.useState(false);
    const [showMobilePreview, setShowMobilePreview] = React.useState(false);
    const [showMeusDados, setShowMeusDados] = React.useState(false);
    const [meusDadosForm, setMeusDadosForm] = React.useState<Partial<Client>>({});
    const [savingDados, setSavingDados] = React.useState(false);
    const [globalClientInstallments, setGlobalClientInstallments] = React.useState<PaymentInstallment[]>([]);
    const [clientContracts, setClientContracts] = React.useState<Contract[]>([]);
    const [viewingContract, setViewingContract] = React.useState<Contract | null>(null);
    const [planningView, setPlanningView] = React.useState<PlanningView | null>(null);
    const [planningLoadedKey, setPlanningLoadedKey] = React.useState<string | null>(null);
    const [clientRequests, setClientRequests] = React.useState<ClientRequest[]>([]);
    const [requestsLoading, setRequestsLoading] = React.useState(false);
    const [showNewRequestForm, setShowNewRequestForm] = React.useState(false);
    const [newRequestForm, setNewRequestForm] = React.useState({ title: '', description: '', category: 'Geral', priority: 'Média' });
    const [portalMessages, setPortalMessages] = React.useState<ClientPortalMessage[]>([]);
    const [unreadCount, setUnreadCount] = React.useState(0);
    const [showNotifications, setShowNotifications] = React.useState(false);
    const [showMoreSheet, setShowMoreSheet] = React.useState(false);
    React.useEffect(() => {
        if (!showNotifications) return;
        const close = () => setShowNotifications(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [showNotifications]);

    React.useEffect(() => {
        const orgId = settings.organizationId || (settings as any).organization_id || organizationId;
        if (clientProfile && (activeTab === 'financeiro' || activeTab === 'contratos')) {
            if (orgId) {
                commercialFinanceService.listAllClientInstallments(clientProfile.id, orgId).then(installments => {
                    setGlobalClientInstallments(installments);
                }).catch(console.error);
            }
            const loadContracts = portalToken
                ? clientPortalService.getContractsByToken(portalToken)
                : contractService.listContractsByClientId(clientProfile.id, orgId || undefined);
            loadContracts.then(contracts => {
                setClientContracts(contracts as any);
            }).catch(console.error);
        }
        if (activeTab === 'manutencao' || (activeTab === 'dashboard' && clientCategory === 'Locação')) {
            setRequestsLoading(true);
            const load = portalToken
                ? clientRequestsService.getRequestsByToken(portalToken)
                : (clientProfile && orgId ? clientRequestsService.listRequests(orgId, clientProfile.id) : Promise.resolve([]));
            load.then(setClientRequests).catch(console.error).finally(() => setRequestsLoading(false));
        }
        // Dashboard de Locação/Serviços precisa dos contratos
        if (activeTab === 'dashboard' && (clientCategory === 'Locação' || clientCategory === 'Serviços') && clientProfile) {
            (portalToken
                ? clientPortalService.getContractsByToken(portalToken)
                : contractService.listContractsByClientId(clientProfile.id, orgId || undefined))
                .then(c => setClientContracts(c as any)).catch(console.error);
            if (orgId) {
                commercialFinanceService.listAllClientInstallments(clientProfile.id, orgId)
                    .then(setGlobalClientInstallments).catch(console.error);
            }
        }
        // Mensagens do portal (carrega na montagem quando há token)
        if (portalToken) {
            clientMessagesService.getMessagesByToken(portalToken)
                .then(({ messages, unread }) => { setPortalMessages(messages); setUnreadCount(unread); })
                .catch(console.error);
        }
        // Planejamento/Obra: carrega quando a aba é aberta (1x por cliente/token).
        // Portal (anon) → via token; prévia do admin (autenticado) → via client_id.
        const planningKey = portalToken || clientProfile?.id || '';
        if (activeTab === 'obra' && planningKey && planningLoadedKey !== planningKey) {
            setPlanningLoadedKey(planningKey);
            setPlanningView(null);
            const loadPlanning = portalToken
                ? clientPortalService.getPlanningByToken(portalToken)
                : clientPortalService.getPlanningForClient(clientProfile!.id);
            loadPlanning
                .then(p => setPlanningView(p ? buildPlanningView(p) : null))
                .catch(console.error);
        }
    }, [clientProfile, activeTab, settings, organizationId]);

    React.useEffect(() => {
        const fetchOrders = async () => {
            if (!settings.id && !settings.linkedProjectId) return;
            try {
                const results = await Promise.all([
                    settings.id ? orderService.listOrders(settings.id) : Promise.resolve([]),
                    settings.linkedProjectId ? orderService.listOrders(settings.linkedProjectId) : Promise.resolve([])
                ]);
                setOrders(results.flat());
            } catch (error) {
                console.error("Error fetching orders for progress:", error);
            }
        };
        fetchOrders();
    }, [settings.id, settings.linkedProjectId]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && (clientProfile || settings.id)) {
            try {
                // Upload real para o Supabase Storage
                const bucket = 'documents';
                const folder = clientProfile ? `client-docs/${clientProfile.id}` : `project-docs/${settings.id}`;
                const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
                const path = `${folder}/${fileName}`;

                await storageService.uploadFile(bucket, path, file);
                const publicUrl = storageService.getPublicUrl(bucket, path);

                const newDoc = {
                    name: file.name,
                    category: 'PDF ORIGINAL',
                    url: publicUrl,
                    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                };

                if (clientProfile && onClientSelect) {
                    const newDocs = [...(clientProfile.clientDocuments || []), newDoc];
                    updateClientData({ clientDocuments: newDocs });
                } else if (onUpdateSettings) {
                    const newDocs = [...(settings.clientDocuments || []), newDoc];
                    onUpdateSettings({ ...settings, clientDocuments: newDocs });
                }
            } catch (error) {
                console.error("Error uploading file:", error);
                alert("Falha ao subir arquivo. Verifique se o bucket 'documents' existe no Supabase.");
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    React.useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const currentClientDocs = clientProfile?.clientDocuments || settings.clientDocuments || [];
    const currentFinancialInfo = clientProfile?.financialInfo || settings.financialInfo;
    const currentDiaryEntries = clientProfile?.diaryEntries || settings.diaryEntries || [];

    const updateClientData = async (updates: Partial<Client>) => {
        if (!clientProfile || !onClientSelect) return false;
        try {
            await clientService.saveClient({ id: clientProfile.id, ...updates });
            onClientSelect({ ...clientProfile, ...updates });
            return true;
        } catch (error) {
            console.error("Error updating client:", error);
            return false;
        }
    };

    // Calculate some dashboard metrics
    const totalBudget = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);

    // Choose progress calculation method (now preferring Financial Planning/Orders)
    const calculatedProgress = React.useMemo(() => {
        const financialProgress = calculateRealizedFinancialProgress(budget, orders);
        // If it's 0 but we have diary entries, we could fall back, but user asked for "fed by planning"
        return financialProgress || calculateProjectProgress(budget, settings.diaryEntries);
    }, [budget, orders, settings.diaryEntries]);

    const plannedProgress = React.useMemo(() => {
        if (!settings.schedule) return 0;
        return calculatePlannedFinancialProgress(settings.schedule, budget);
    }, [settings.schedule, budget]);

    // Group costs by phase for the donut chart
    const costDistribution = settings.wbs.flatMap(group =>
        group.phases.map(phase => {
            const phaseTotal = budget
                .filter(item => item.group === group.name && item.phase === phase.name)
                .reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);

            return {
                name: phase.name.replace(/^[\d\.]+\s+/, ''),
                value: phaseTotal
            };
        })
    ).filter(d => d.value > 0);

    const finalDistribution = costDistribution;

    // ─── Dashboard: Locação ────────────────────────────────────────────────────
    const renderDashboardLocacao = () => {
        const allInsts = Array.from(new Map(
            [...(currentFinancialInfo?.installments || []), ...globalClientInstallments]
                .filter(i => i.id).map(i => [i.id, i])
        ).values());
        const nextDue = allInsts.filter(i => i.status !== 'PAID').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        const totalPaid = allInsts.filter(i => i.status === 'PAID').reduce((s, i) => s + i.value, 0);
        const totalValue = allInsts.reduce((s, i) => s + i.value, 0) || currentFinancialInfo?.totalValue || 0;
        const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

        const activeContracts = clientContracts.filter(c => c.status === 'Ativo' || c.status === 'Assinado');
        // Mostra também minutas no dashboard (selo "Em elaboração"), sem contar como ativo.
        const shownContracts = clientContracts.filter(c => ['Ativo', 'Assinado', 'Minuta'].includes(c.status));
        const openRequests = clientRequests.filter(r => r.status !== 'Resolvido' && r.status !== 'Cancelado');
        const recentRequests = [...clientRequests].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

        // Contrato com reajuste próximo (≤ 30 dias)
        const reajusteAlert = activeContracts.find(c => {
            if (!c.reajuste_proximo) return false;
            return (new Date(c.reajuste_proximo + 'T12:00:00').getTime() - Date.now()) / 86400000 <= 30;
        });

        const STATUS_COLOR: Record<string, string> = { Aberto: 'bg-amber-100 text-amber-700', 'Em Andamento': 'bg-blue-100 text-blue-700', Aguardando: 'bg-purple-100 text-purple-700', Resolvido: 'bg-emerald-100 text-emerald-700', Cancelado: 'bg-gray-100 text-gray-400' };
        const quickTabs = tabs.filter(t => t.id !== 'dashboard').slice(0, 4);

        return (
            <div className="animate-in fade-in duration-500">
                {/* ══ MOBILE ══ */}
                <div className="md:hidden space-y-0">
                    {/* Hero */}
                    <div className="-mx-4 bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5">
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Locação</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setActiveTab('manutencao')} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white"><Wrench className="w-3.5 h-3.5" /></button>
                                {portalToken && (
                                    <button onClick={() => setShowNotifications(n => !n)} className="relative w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">
                                        <Bell className="w-3.5 h-3.5" />
                                        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-400 text-white text-[7px] font-black rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                                    </button>
                                )}
                                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-blue-600 font-black text-sm shadow">{(clientProfile?.name || '?').charAt(0)}</div>
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-white leading-tight">Olá, {clientProfile?.name?.split(' ')[0] || 'bem-vindo'}</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">Acompanhe seu imóvel e pagamentos</p>
                        {/* Ações rápidas (topo) */}
                        {quickTabs.length > 0 && (
                            <div className="mt-5 grid grid-cols-4 gap-2">
                                {quickTabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                                        <span className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white">{tab.icon}</span>
                                        <span className="text-[9px] font-bold text-white/90 uppercase tracking-wide text-center leading-tight">{tab.label.split(' ')[0]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Próximo Vencimento</p>
                                    {nextDue ? (<><p className="text-lg font-black text-white">R$ {nextDue.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p><p className="text-[9px] text-blue-200 font-bold mt-0.5">{new Date(nextDue.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p></>) : <p className="text-sm font-black text-white">Em dia</p>}
                                </div>
                                <div className="border-l border-white/20 pl-3">
                                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Total Pago</p>
                                    <p className="text-lg font-black text-white">{paidPct}%</p>
                                    <p className="text-[9px] text-blue-200 font-bold mt-0.5">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                                </div>
                            </div>
                            {enabledTabIds.includes('financeiro') && <button onClick={() => setActiveTab('financeiro')} className="w-full py-2.5 bg-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Wallet className="w-3.5 h-3.5" /> Ver Financeiro <ArrowRight className="w-3 h-3" /></button>}
                        </div>
                    </div>
                    {/* KPIs flutuantes */}
                    <div className="px-4 -mt-4 grid grid-cols-3 gap-3">
                        {[
                            { label: 'Contratos', value: activeContracts.length, icon: <FileText className="w-4 h-4" />, color: 'blue', tab: 'contratos' as const },
                            { label: 'Chamados', value: openRequests.length, icon: <Wrench className="w-4 h-4" />, color: openRequests.length > 0 ? 'amber' : 'emerald', tab: 'manutencao' as const },
                            { label: 'Pago', value: `${paidPct}%`, icon: <CheckCircle2 className="w-4 h-4" />, color: 'emerald', tab: 'financeiro' as const },
                        ].map(card => (
                            <button key={card.label} onClick={() => enabledTabIds.includes(card.tab) && setActiveTab(card.tab)} className="bg-white rounded-2xl p-4 shadow-lg shadow-gray-900/5 border border-gray-100 flex flex-col items-center text-center gap-1.5 active:scale-95 transition-transform">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-${card.color}-50 text-${card.color}-500`}>{card.icon}</div>
                                <p className="text-xl font-black text-gray-900">{card.value}</p>
                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-wide leading-tight">{card.label}</p>
                            </button>
                        ))}
                    </div>
                    {/* Alerta reajuste */}
                    {reajusteAlert && <div className="mx-4 mt-3 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl"><AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" /><div><p className="text-sm font-black text-amber-800">Reajuste em {new Date(reajusteAlert.reajuste_proximo! + 'T12:00:00').toLocaleDateString('pt-BR')}</p><p className="text-xs text-amber-600 mt-0.5">{reajusteAlert.title}</p></div></div>}
                    {/* Chamados recentes */}
                    {recentRequests.length > 0 && <div className="px-4 mt-4 pb-6 space-y-2">
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Últimos Chamados</p>{enabledTabIds.includes('manutencao') && <button onClick={() => setActiveTab('manutencao')} className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Ver todos</button>}</div>
                        {recentRequests.map(req => (<div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black text-gray-900 truncate">{req.title}</p><p className="text-[10px] font-bold text-gray-400 mt-0.5">{req.category}</p></div><span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase shrink-0 ${STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-400'}`}>{req.status}</span></div>))}
                    </div>}
                    {/* Empty state + atalhos */}
                    {recentRequests.length === 0 && (
                        <div className="px-4 mt-6 pb-6">
                            <div className="flex flex-col items-center text-center py-4">
                                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><Wrench className="w-7 h-7" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Tudo em dia por aqui</p>
                                <p className="text-xs text-gray-400 font-medium mt-1 max-w-[240px]">Seus chamados e atualizações do imóvel aparecerão aqui.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block space-y-6">
                    {/* Faixa de boas-vindas compacta */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-500 rounded-3xl px-8 py-6 flex items-center justify-between">
                        <div>
                            <p className="text-blue-200 text-xs font-black uppercase tracking-widest mb-1">Locação</p>
                            <h2 className="text-2xl font-black text-white">Olá, {clientProfile?.name?.split(' ')[0] || 'bem-vindo'}</h2>
                            <p className="text-blue-200 text-sm mt-1">Acompanhe seu imóvel e pagamentos</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Próximo Vencimento</p>
                                <p className="text-xl font-black text-white mt-0.5">{nextDue ? `R$ ${nextDue.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'Em dia'}</p>
                                {nextDue && <p className="text-[10px] text-blue-200 font-bold">{new Date(nextDue.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
                            </div>
                            {enabledTabIds.includes('financeiro') && <button onClick={() => setActiveTab('financeiro')} className="flex items-center gap-2 px-5 py-3 bg-white text-blue-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-all shadow"><Wallet className="w-4 h-4" /> Financeiro</button>}
                        </div>
                    </div>
                    {/* Grid principal */}
                    <div className="grid grid-cols-3 gap-6">
                        {/* KPIs */}
                        {[
                            { label: 'Contratos Ativos', value: activeContracts.length, icon: <FileText className="w-5 h-5" />, color: 'indigo', tab: 'contratos' as const },
                            { label: 'Chamados Abertos', value: openRequests.length, icon: <Wrench className="w-5 h-5" />, color: openRequests.length > 0 ? 'amber' : 'emerald', tab: 'manutencao' as const },
                            { label: 'Cobranças Pagas', value: `${paidPct}%`, icon: <CheckCircle2 className="w-5 h-5" />, color: 'emerald', tab: 'financeiro' as const },
                        ].map(card => (
                            <button key={card.label} onClick={() => enabledTabIds.includes(card.tab) && setActiveTab(card.tab)} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all text-left">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-${card.color}-50 text-${card.color}-500 shrink-0`}>{card.icon}</div>
                                <div><p className="text-2xl font-black text-gray-900">{card.value}</p><p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-0.5">{card.label}</p></div>
                            </button>
                        ))}
                    </div>
                    {/* Alerta reajuste */}
                    {reajusteAlert && <div className="flex items-start gap-3 p-5 bg-amber-50 border border-amber-200 rounded-2xl"><AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" /><div><p className="text-sm font-black text-amber-800 uppercase tracking-tight">Reajuste contratual próximo</p><p className="text-xs text-amber-600 mt-0.5">{reajusteAlert.title} — índice {reajusteAlert.reajuste_index || '—'} em {new Date(reajusteAlert.reajuste_proximo! + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div></div>}
                    {/* Duas colunas: chamados + contratos */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Últimos Chamados</h3>{enabledTabIds.includes('manutencao') && <button onClick={() => setActiveTab('manutencao')} className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline">Ver todos</button>}</div>
                            {recentRequests.length === 0 ? <p className="text-sm text-gray-400 font-medium text-center py-4">Nenhum chamado</p> : <div className="space-y-3">{recentRequests.map(req => (<div key={req.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0"><div className="min-w-0"><p className="text-sm font-bold text-gray-900 truncate">{req.title}</p><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{req.category}</p></div><span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase shrink-0 ${STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-400'}`}>{req.status}</span></div>))}</div>}
                        </div>
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Contratos</h3>{enabledTabIds.includes('contratos') && <button onClick={() => setActiveTab('contratos')} className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline">Ver todos</button>}</div>
                            {shownContracts.length === 0 ? <p className="text-sm text-gray-400 font-medium text-center py-4">Nenhum contrato</p> : <div className="space-y-3">{shownContracts.slice(0, 3).map(c => { const badge = contractDashBadge(c.status); return (<div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0"><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-bold text-gray-900 truncate">{c.title}</p><span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${badge.cls}`}>{badge.label}</span></div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{c.billing_cycle ?? c.contract_type}{c.end_date ? ` · até ${new Date(c.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}</p></div><span className="text-sm font-black text-gray-900 tabular-nums shrink-0">R$ {(c.current_value || c.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></div>); })}</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ─── Dashboard: Serviços ───────────────────────────────────────────────────
    const renderDashboardServicos = () => {
        const activeContracts = clientContracts.filter(c => c.status === 'Ativo' || c.status === 'Assinado');
        // Mostra também minutas no dashboard (selo "Em elaboração"), sem contar como ativo.
        const shownContracts = clientContracts.filter(c => ['Ativo', 'Assinado', 'Minuta'].includes(c.status));
        const totalContratado = activeContracts.reduce((s, c) => s + (c.current_value || c.original_value || 0), 0);
        const quickTabs = tabs.filter(t => t.id !== 'dashboard').slice(0, 4);

        return (
            <div className="animate-in fade-in duration-500">
                {/* ══ MOBILE ══ */}
                <div className="md:hidden space-y-0">
                    {/* Hero */}
                    <div className="-mx-4 bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5"><span className="text-[10px] font-black text-white uppercase tracking-widest">Serviços</span></div>
                            <div className="flex items-center gap-2">
                                {portalToken && (<button onClick={() => setShowNotifications(n => !n)} className="relative w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white"><Bell className="w-3.5 h-3.5" />{unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-400 text-white text-[7px] font-black rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>)}
                                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-blue-600 font-black text-sm shadow">{(clientProfile?.name || '?').charAt(0)}</div>
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-white leading-tight">Olá, {clientProfile?.name?.split(' ')[0] || 'bem-vindo'}</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">Acompanhe seus contratos e serviços</p>
                        {quickTabs.length > 0 && (
                            <div className="mt-5 grid grid-cols-4 gap-2">
                                {quickTabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                                        <span className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white">{tab.icon}</span>
                                        <span className="text-[9px] font-bold text-white/90 uppercase tracking-wide text-center leading-tight">{tab.label.split(' ')[0]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Contratos Ativos</p>
                                    <p className="text-lg font-black text-white">{activeContracts.length}</p>
                                </div>
                                <div className="border-l border-white/20 pl-3">
                                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Total Contratado</p>
                                    <p className="text-lg font-black text-white">R$ {totalContratado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Contratos recentes */}
                    {shownContracts.length > 0 ? (
                        <div className="px-4 mt-4 pb-6 space-y-2">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contratos</p>
                                {enabledTabIds.includes('contratos') && <button onClick={() => setActiveTab('contratos')} className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Ver todos</button>}
                            </div>
                            {shownContracts.slice(0, 3).map(c => {
                                const badge = contractDashBadge(c.status);
                                return (
                                <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-gray-900 truncate">{c.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{c.contract_type}</span>
                                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${badge.cls}`}>{badge.label}</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-gray-900 tabular-nums shrink-0">R$ {(c.current_value || c.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="px-4 mt-6 pb-6">
                            <div className="flex flex-col items-center text-center py-4">
                                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><FileText className="w-7 h-7" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhum contrato</p>
                                <p className="text-xs text-gray-400 font-medium mt-1 max-w-[240px]">Seus contratos aparecerão aqui.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block space-y-6">
                    {/* Faixa de boas-vindas */}
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-500 rounded-3xl px-8 py-6 flex items-center justify-between">
                        <div>
                            <p className="text-indigo-200 text-xs font-black uppercase tracking-widest mb-1">Serviços</p>
                            <h2 className="text-2xl font-black text-white">Olá, {clientProfile?.name?.split(' ')[0] || 'bem-vindo'}</h2>
                            <p className="text-indigo-200 text-sm mt-1">Acompanhe seus contratos e serviços</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Total Contratado</p>
                            <p className="text-2xl font-black text-white mt-0.5">R$ {totalContratado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                            <p className="text-[10px] text-indigo-200 font-bold mt-0.5">{activeContracts.length} contrato{activeContracts.length !== 1 ? 's' : ''} ativo{activeContracts.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    {/* Contratos */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Contratos</h3>
                            {enabledTabIds.includes('contratos') && <button onClick={() => setActiveTab('contratos')} className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline">Ver todos</button>}
                        </div>
                        {shownContracts.length === 0 ? (
                            <p className="text-sm text-gray-400 font-medium text-center py-4">Nenhum contrato</p>
                        ) : (
                            <div className="space-y-3">
                                {shownContracts.slice(0, 5).map(c => {
                                    const badge = contractDashBadge(c.status);
                                    return (
                                    <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-gray-900 truncate">{c.title}</p>
                                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${badge.cls}`}>{badge.label}</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">{c.contract_type}{c.sla_days != null ? ` · SLA ${c.sla_days}d` : ''}</p>
                                        </div>
                                        <span className="text-sm font-black text-gray-900 tabular-nums shrink-0">R$ {(c.current_value || c.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderDashboard = () => {
        const upcomingEvents = calculateUpcomingPhases(settings, budget);

        if (!settings.id || budget.length === 0) {
            return (
                <div className="lg:col-span-3 flex flex-col items-center justify-center p-20 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm text-center animate-in fade-in zoom-in-95 duration-700">
                    <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-8 border-4 border-white shadow-xl shadow-indigo-100/50">
                        <TrendingUp className="w-10 h-10" />
                    </div>
                    <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight mb-4">Acompanhamento de Obra</h3>
                    <p className="text-gray-500 max-w-xl mx-auto font-medium leading-relaxed">
                        Sua área exclusiva está pronta para acompanhamento. Assim que os dados da sua obra forem processados, você poderá visualizar o progresso real, fotos e o fluxo financeiro aqui.
                    </p>
                    <div className="mt-10 flex gap-4">
                        <div className="px-6 py-3 bg-gray-50 rounded-2xl border border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">Aguardando Processamento</div>
                    </div>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Main Metrics (2/3) */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Status da Obra */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-gray-900 font-bold flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                                    Status da Obra
                                </h3>
                                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <Info className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="text-center py-8">
                                <div className="flex items-center justify-center gap-2 mb-2 group/edit relative">
                                    <div className="text-5xl font-extrabold text-indigo-600 tracking-tight">
                                        {calculatedProgress}%
                                    </div>
                                </div>

                                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden mb-6 relative">
                                    <div
                                        className="bg-gradient-to-r from-indigo-500 to-blue-500 h-full rounded-full shadow-lg shadow-indigo-200 transition-all duration-1000"
                                        style={{ width: `${calculatedProgress}%` }}
                                    />
                                </div>

                                <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-gray-500 px-1">
                                    <div className="text-left">
                                        <div className="mb-0.5 flex items-center gap-1">
                                            Etapa Atual
                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        const val = prompt('Etapa Atual', settings.obraPhase || '');
                                                        if (val !== null && onUpdateSettings) {
                                                            onUpdateSettings({ ...settings, obraPhase: val });
                                                        }
                                                    }}
                                                    className="text-gray-300 hover:text-indigo-600 transition-colors"
                                                >
                                                    <Pencil className="w-2.5 h-2.5" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-gray-900 font-bold">{settings.obraPhase || 'Não informada'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="mb-0.5">Total Orçado</div>
                                        <div className="text-gray-900 font-bold">R$ {totalBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-50 pt-4 mt-4 grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Avanço Planejado</div>
                                    <div className="text-lg font-black text-gray-400">{plannedProgress}%</div>
                                </div>
                                <div className="border-l border-gray-100">
                                    <div className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-1">Desvio de Prazo</div>
                                    <div className="text-lg font-black text-gray-900">0 dia(s)</div>
                                </div>
                            </div>
                        </div>

                        {/* Distribuição de Custos */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-gray-900 font-bold flex items-center gap-2 mb-6">
                                <DollarSign className="w-5 h-5 text-emerald-500" />
                                Distribuição de Custos
                            </h3>

                            <div className="flex flex-col items-center gap-6">
                                <div className="w-full h-48">
                                    {finalDistribution.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={finalDistribution}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius={70}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {finalDistribution.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    formatter={(value: unknown) => `R$ ${(Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center w-full h-full text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                            <DollarSign className="w-8 h-8 mb-2 opacity-20" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-center">Nenhum custo registrado</span>
                                        </div>
                                    )}
                                </div>

                                {finalDistribution.length > 0 && (
                                    <div className="w-full space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                        {finalDistribution.map((item, index) => (
                                            <div key={`legend-${index}`} className="flex justify-between items-center text-[11px] group">
                                                <div className="flex items-center gap-2 truncate">
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                    <span className="font-medium text-gray-600 truncate group-hover:text-gray-900 transition-colors uppercase">{item.name}</span>
                                                </div>
                                                <span className="font-bold text-gray-900 shrink-0 tabular-nums">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Secondary Content (1/3) */}
                <div className="space-y-8">
                    {/* Próximos Eventos */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-gray-900 font-bold flex items-center gap-2 mb-6">
                            <Calendar className="w-5 h-5 text-blue-500" />
                            Próximos Eventos
                        </h3>

                        <div className="space-y-4">
                            {upcomingEvents.length > 0 ? (
                                upcomingEvents.map((event) => (
                                    <div key={event.name} className="flex gap-4 p-4 rounded-3xl border border-gray-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all group">
                                        <div className="flex flex-col items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl shrink-0">
                                            <span className="text-xl font-black text-blue-700 leading-none">
                                                {event.date.getDate().toString().padStart(2, '0')}
                                            </span>
                                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider mt-1">
                                                {event.date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center min-w-0">
                                            <h4 className="font-black text-gray-900 tracking-tight text-sm uppercase truncate mb-1">{event.name}</h4>
                                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded-full text-[9px] font-black text-gray-400 uppercase tracking-wider w-fit">
                                                Início
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 px-6 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                                    <Calendar className="w-10 h-10 text-gray-300 mb-3" />
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Nenhum evento programado</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        );
    };

    const renderContratos = () => {
        const isLocacao  = clientCategory === 'Locação';
        const isServicos = clientCategory === 'Serviços';

        return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ══ MOBILE ══ */}
            <div className="md:hidden -mx-4">
                {/* Mini hero */}
                <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                    <h2 className="text-2xl font-black text-white leading-tight">Contratos</h2>
                    <p className="text-blue-200 text-sm font-medium mt-1">{clientContracts.length} contrato{clientContracts.length !== 1 ? 's' : ''} disponíve{clientContracts.length !== 1 ? 'is' : 'l'}</p>
                </div>
                <div className="px-4 -mt-3 pb-6 space-y-2">
                    {clientContracts.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-10">
                            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><FileText className="w-7 h-7" /></div>
                            <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhum contrato ainda</p>
                            <p className="text-xs text-gray-400 font-medium mt-1">Seus contratos aparecerão aqui quando disponíveis.</p>
                        </div>
                    ) : (
                        clientContracts.map(contract => {
                            const isSigned = contract.signature_status === 'SIGNED' || contract.status === 'Assinado';
                            const reajusteAlerta = contract.reajuste_proximo
                                ? (new Date(contract.reajuste_proximo + 'T12:00:00').getTime() - Date.now()) / 86400000 <= 30
                                : false;
                            return (
                                <div key={contract.id} onClick={() => setViewingContract(contract)}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
                                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-gray-900 truncate">{contract.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-gray-400 tabular-nums">R$ {(contract.current_value || contract.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                            {reajusteAlerta && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Reajuste próximo</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${isSigned ? 'bg-emerald-100 text-emerald-700' : contract.status === 'Ativo' ? 'bg-blue-100 text-blue-700' : contract.status === 'Minuta' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {isSigned ? 'Assinado' : contract.status === 'Minuta' ? 'Minuta' : (contract.status || 'Ativo')}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ══ DESKTOP ══ */}
            {clientContracts.length === 0 ? (
                <div className="hidden md:flex bg-white p-20 rounded-[2rem] shadow-sm border border-gray-100 flex-col items-center text-center">
                    <FileText className="w-16 h-16 text-gray-200 mb-6" />
                    <p className="text-lg font-black text-gray-400 uppercase tracking-widest">Nenhum contrato disponível</p>
                </div>
            ) : (
                <div className="hidden md:block bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3 mb-6">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        Meus Contratos
                    </h3>
                    <div className="space-y-3">
                        {clientContracts.map(contract => {
                            const isSigned = contract.signature_status === 'SIGNED' || contract.status === 'Assinado';
                            // Locação: alerta se reajuste em ≤ 30 dias
                            const reajusteProximo = contract.reajuste_proximo ? new Date(contract.reajuste_proximo + 'T12:00:00') : null;
                            const reajusteAlerta  = reajusteProximo && (reajusteProximo.getTime() - Date.now()) / 86400000 <= 30;
                            return (
                                <div
                                    key={contract.id}
                                    onClick={() => setViewingContract(contract)}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group cursor-pointer"
                                >
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <span className="text-sm font-black text-gray-900 uppercase truncate group-hover:text-indigo-700 transition-colors">{contract.title}</span>
                                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            {contract.number && <span>Nº {contract.number}</span>}
                                            {contract.contract_type && <span>· {contract.contract_type}</span>}
                                            {contract.start_date && (
                                                <span>· Início: {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            )}
                                            {contract.end_date && (
                                                <span>· Término: {new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            )}
                                        </div>
                                        {/* Chips extras por categoria */}
                                        <div className="flex flex-wrap gap-2 mt-0.5">
                                            {isLocacao && contract.billing_cycle && (
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100">
                                                    {contract.billing_cycle}{contract.due_day ? ` · dia ${contract.due_day}` : ''}
                                                </span>
                                            )}
                                            {isLocacao && contract.reajuste_index && (
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${reajusteAlerta ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                                    {contract.reajuste_index}{reajusteAlerta ? ' · Reajuste próximo!' : ''}
                                                </span>
                                            )}
                                            {isServicos && contract.sla_days != null && (
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                                                    SLA {contract.sla_days}d
                                                </span>
                                            )}
                                            {isServicos && contract.warranty_months != null && (
                                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                                                    Garantia {contract.warranty_months}m
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-base font-black text-gray-900 tabular-nums">
                                            R$ {(contract.current_value || contract.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            isSigned ? 'bg-emerald-100 text-emerald-700' :
                                            contract.status === 'Ativo' ? 'bg-indigo-100 text-indigo-700' :
                                            contract.status === 'Minuta' ? 'bg-purple-100 text-purple-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>
                                            {isSigned ? 'Assinado' : contract.status === 'Minuta' ? 'Minuta' : (contract.status || 'Em andamento')}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modal de visualização do contrato */}
            {viewingContract && (() => {
                const c = viewingContract;
                const isSigned = c.signature_status === 'SIGNED' || c.status === 'Assinado';
                const docUrl = c.signature_url || c.signed_contract_url;
                const isMinuta = c.status === 'Minuta';
                const reajusteProximo = c.reajuste_proximo ? new Date(c.reajuste_proximo + 'T12:00:00') : null;
                const diasParaReajuste = reajusteProximo ? Math.ceil((reajusteProximo.getTime() - Date.now()) / 86400000) : null;
                return (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setViewingContract(null)}>
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                        <div
                            className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between p-8 border-b border-gray-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{c.title}</h2>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Nº {c.number} · {c.contract_type}</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingContract(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-8 space-y-6">
                                {isMinuta && (
                                    <div className="flex items-start gap-4 p-5 bg-purple-50 border border-purple-100 rounded-2xl">
                                        <AlertCircle className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-black text-purple-800 uppercase tracking-tight">Minuta — Aguardando suas considerações</p>
                                            <p className="text-xs text-purple-600 mt-1">Este é um rascunho do contrato enviado para sua análise. Entre em contato conosco com suas observações antes da assinatura.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Alerta de reajuste próximo — Locação */}
                                {isLocacao && diasParaReajuste !== null && diasParaReajuste <= 30 && (
                                    <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-black text-amber-800 uppercase tracking-tight">Reajuste em {diasParaReajuste} dia{diasParaReajuste !== 1 ? 's' : ''}</p>
                                            <p className="text-xs text-amber-600 mt-1">O contrato será reajustado pelo índice {c.reajuste_index || '—'} em {reajusteProximo!.toLocaleDateString('pt-BR')}.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Dados base */}
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: 'Valor do Contrato', value: `R$ ${(c.current_value || c.original_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                                        { label: 'Status', value: isSigned ? 'Assinado' : (c.status || '—') },
                                        { label: 'Data de Início', value: c.start_date ? new Date(c.start_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—' },
                                        { label: 'Data de Término', value: c.end_date ? new Date(c.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado' },
                                    ].map(item => (
                                        <div key={item.label} className="p-4 bg-gray-50 rounded-2xl">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                                            <p className="text-sm font-black text-gray-900">{item.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Seção extra: Reajuste e Vigência — Locação */}
                                {isLocacao && (c.reajuste_index || c.billing_cycle || c.due_day != null) && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                            <TrendingUp className="w-3.5 h-3.5" /> Reajuste e Vigência
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {c.billing_cycle && (
                                                <div className="p-4 bg-blue-50 rounded-2xl">
                                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Periodicidade</p>
                                                    <p className="text-sm font-black text-blue-800">{c.billing_cycle}{c.due_day != null ? ` · Dia ${c.due_day}` : ''}</p>
                                                </div>
                                            )}
                                            {c.reajuste_index && (
                                                <div className="p-4 bg-blue-50 rounded-2xl">
                                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Índice de Reajuste</p>
                                                    <p className="text-sm font-black text-blue-800">{c.reajuste_index}</p>
                                                </div>
                                            )}
                                            {c.reajuste_data_base && (
                                                <div className="p-4 bg-blue-50 rounded-2xl">
                                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Data-Base</p>
                                                    <p className="text-sm font-black text-blue-800">{new Date(c.reajuste_data_base + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                                </div>
                                            )}
                                            {c.reajuste_proximo && (
                                                <div className={`p-4 rounded-2xl ${diasParaReajuste !== null && diasParaReajuste <= 30 ? 'bg-amber-50' : 'bg-blue-50'}`}>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${diasParaReajuste !== null && diasParaReajuste <= 30 ? 'text-amber-400' : 'text-blue-400'}`}>Próximo Reajuste</p>
                                                    <p className={`text-sm font-black ${diasParaReajuste !== null && diasParaReajuste <= 30 ? 'text-amber-700' : 'text-blue-800'}`}>
                                                        {new Date(c.reajuste_proximo + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                        {diasParaReajuste !== null && <span className="text-[10px] ml-1">({diasParaReajuste}d)</span>}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Seção extra: Condições de Serviço — Serviços */}
                                {isServicos && (c.sla_days != null || c.warranty_months != null || c.services_included || c.services_excluded) && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                            <ClipboardList className="w-3.5 h-3.5" /> Condições de Serviço
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {c.sla_days != null && (
                                                <div className="p-4 bg-indigo-50 rounded-2xl">
                                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">SLA de Atendimento</p>
                                                    <p className="text-sm font-black text-indigo-800">{c.sla_days} dia{c.sla_days !== 1 ? 's' : ''}</p>
                                                </div>
                                            )}
                                            {c.warranty_months != null && (
                                                <div className="p-4 bg-emerald-50 rounded-2xl">
                                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Garantia</p>
                                                    <p className="text-sm font-black text-emerald-800">{c.warranty_months} mês{c.warranty_months !== 1 ? 'es' : ''}</p>
                                                </div>
                                            )}
                                        </div>
                                        {c.services_included && (
                                            <div className="p-4 bg-emerald-50 rounded-2xl">
                                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Serviços Incluídos</p>
                                                <p className="text-sm text-emerald-800 font-medium whitespace-pre-line">{c.services_included}</p>
                                            </div>
                                        )}
                                        {c.services_excluded && (
                                            <div className="p-4 bg-red-50 rounded-2xl">
                                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Serviços Excluídos</p>
                                                <p className="text-sm text-red-700 font-medium whitespace-pre-line">{c.services_excluded}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isMinuta && c.minuta_versions && c.minuta_versions.some(v => v.emitted !== false) && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Versões da Minuta</p>
                                        <div className="space-y-2">
                                            {(() => {
                                                const emitted = c.minuta_versions!.filter(v => v.emitted !== false);
                                                const latestV = Math.max(...emitted.map(x => x.v));
                                                return [...emitted].sort((a, b) => b.v - a.v).map(ver => (
                                                <a
                                                    key={ver.v}
                                                    href={ver.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-4 p-4 bg-purple-50 border border-purple-100 rounded-2xl hover:bg-purple-100 transition-all group"
                                                >
                                                    <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-[11px]">
                                                        v{ver.v}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-black text-purple-800">
                                                            {ver.name?.trim() || `Versão ${ver.v}`}
                                                            {ver.v === latestV && (
                                                                <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-700 rounded-full text-[9px] font-black uppercase">Atual</span>
                                                            )}
                                                        </p>
                                                        <p className="text-[10px] text-purple-400 mt-0.5">
                                                            {new Date(ver.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            {ver.notes && ` · ${ver.notes}`}
                                                        </p>
                                                    </div>
                                                    <Download className="w-4 h-4 text-purple-400 group-hover:text-purple-700 transition-colors" />
                                                </a>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                                {!isMinuta && (docUrl ? (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Documento do Contrato</p>
                                        <a
                                            href={docUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-4 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl hover:bg-indigo-100 transition-all group"
                                        >
                                            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                                                <Download className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-indigo-700">Visualizar / Baixar Contrato</p>
                                                <p className="text-[10px] text-indigo-400 mt-0.5">Clique para abrir o documento</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-indigo-400 ml-auto group-hover:translate-x-1 transition-transform" />
                                        </a>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 p-5 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                                        <FileText className="w-5 h-5 text-gray-300" />
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Documento ainda não disponível</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
        );
    };

    const renderFinanceiro = () => {
        let baseFinInfo = currentFinancialInfo || {
            totalValue: 0,
            paymentMethod: 'Não Definido',
            installments: [],
            transactions: []
        };

        // Consolidar parcelas de múltiplas fontes:
        // 1. Obra Atual (settings.financialInfo)
        // 2. Global (Busca por clientId em todos os projetos de Gestão Comercial)
        let consolidatedInsts = [...(baseFinInfo.installments || [])];

        // Se for um perfil de cliente, garantimos que ele veja apenas as suas parcelas da obra atual
        if (clientProfile) {
            consolidatedInsts = consolidatedInsts.filter((i) => i.clientId === clientProfile.id);
        }

        // Adicionar parcelas globais (carregadas no useEffect via listAllClientInstallments)
        if (clientProfile && globalClientInstallments.length > 0) {
            consolidatedInsts = [...consolidatedInsts, ...globalClientInstallments];
        }

        // Remover duplicatas caso a mesma parcela esteja em ambos os lugares (ex: sync duplicado)
        const uniqueInstsMap = new Map();
        consolidatedInsts.forEach(i => {
            if (i.id) uniqueInstsMap.set(i.id, i);
        });
        
        baseFinInfo = { ...baseFinInfo, installments: Array.from(uniqueInstsMap.values()) };

        const financialInfo = baseFinInfo;

        const totalPaid = (financialInfo.installments || [])
            .filter(i => i.status === 'PAID')
            .reduce((acc, i) => acc + i.value, 0);

        const calculatedTotalValue = financialInfo.installments.reduce((sum, i) => sum + i.value, 0);
        const displayTotalValue = calculatedTotalValue > 0 ? calculatedTotalValue : financialInfo.totalValue;

        const balanceRemaining = displayTotalValue - totalPaid;
        const paidPercentage = displayTotalValue > 0 ? (totalPaid / displayTotalValue) * 100 : 0;

        const handleUpdateFinancial = async (newInsts: PaymentInstallment[]) => {
            if (onUpdateSettings) {
                const newFinInfo = { ...financialInfo, installments: newInsts, transactions: financialInfo.transactions || [] };
                onUpdateSettings({ ...settings, financialInfo: newFinInfo });
            }
        };

        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Financial Summary Cards */}
                    {[
                        { label: 'Valor Total do Contrato', value: displayTotalValue, sub: financialInfo.paymentMethod, color: 'text-gray-900', icon: <DollarSign className="w-5 h-5 text-indigo-500" />, editable: true },
                        { label: 'Total Pago até o momento', value: totalPaid, sub: `${paidPercentage.toFixed(1)}% concluído`, color: 'text-emerald-600', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, progress: paidPercentage },
                        { label: 'Saldo Remanescente', value: balanceRemaining, sub: 'Incluindo parcelas futuras', color: 'text-amber-600', icon: <Clock className="w-5 h-5 text-amber-500" /> }
                    ].map((card, i) => (
                        <div key={i} className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-xl hover:shadow-gray-200/40 transition-all">
                            {isAdmin && card.editable && (
                                <button
                                    onClick={() => {
                                        const newVal = prompt('Novo Valor Total:', financialInfo.totalValue.toString());
                                        const newMethod = prompt('Nova Forma de Pagamento:', financialInfo.paymentMethod);
                                        const newFinInfo = {
                                            ...financialInfo,
                                            totalValue: newVal ? parseFloat(newVal) : financialInfo.totalValue,
                                            paymentMethod: newMethod || financialInfo.paymentMethod,
                                            transactions: financialInfo.transactions || []
                                        };
                                        if (clientProfile) {
                                            updateClientData({ financialInfo: newFinInfo });
                                        } else if (onUpdateSettings) {
                                            onUpdateSettings({ ...settings, financialInfo: newFinInfo });
                                        }
                                    }}
                                    className="absolute top-4 right-4 p-2 bg-indigo-50 text-indigo-600 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-indigo-600 hover:text-white transition-all z-20"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-gray-50 rounded-xl group-hover:bg-white transition-colors">
                                        {card.icon}
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{card.label}</span>
                                </div>
                                <div className={`text-3xl font-black ${card.color} tracking-tight mb-2`}>
                                    R$ {card.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.sub}</div>
                                {card.progress !== undefined && (
                                    <div className="mt-4 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${card.progress}%` }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-8">
                    {/* Financial Planning Card */}
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-indigo-50 rounded-[1.5rem] flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                                        <Clock className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Planejamento de Pagamentos</h3>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Gestão de parcelas e fluxo de caixa</p>
                                    </div>
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        title="Visualização em Grade"
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        title="Visualização em Lista"
                                    >
                                        <Table2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {isAdmin && (
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setShowGenerator(!showGenerator)}
                                        className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all border shadow-sm
                                                        ${showGenerator ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'}
                                                    `}
                                    >
                                        <TrendingUp className="w-4 h-4" />
                                        {showGenerator ? 'Cancelar Geração' : 'Gerar Automático'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const desc = prompt('Descrição da parcela:');
                                            const val = prompt('Valor (R$):');
                                            const date = prompt('Data de vencimento (AAAA-MM-DD):');
                                            if (desc && val && date) {
                                                const newInst = {
                                                    id: Math.random().toString(36).substr(2, 9),
                                                    description: desc,
                                                    value: parseFloat(val),
                                                    dueDate: date,
                                                    status: 'PENDING' as const
                                                };
                                                const newFinInfo = { ...financialInfo, installments: [...(financialInfo.installments || []), newInst], transactions: financialInfo.transactions || [] };
                                                if (clientProfile) {
                                                    updateClientData({ financialInfo: newFinInfo });
                                                } else if (onUpdateSettings) {
                                                    onUpdateSettings({ ...settings, financialInfo: newFinInfo });
                                                }
                                            }
                                        }}
                                        className="p-3.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                        {showGenerator && (
                            <div className="mb-10 p-8 bg-indigo-50/30 rounded-[2rem] border border-indigo-100 animate-in zoom-in-95 duration-300">
                                <div className="flex gap-4 mb-8">
                                    {['VISTA', 'PARCELADO'].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setGenConfig({ ...genConfig, type: t as 'VISTA' | 'PARCELADO' })}
                                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                                ${genConfig.type === t ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100 hover:border-indigo-200'}
                                            `}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {genConfig.type === 'VISTA' ? (
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Data do Pagamento</label>
                                            <input
                                                type="date"
                                                value={genConfig.startDate}
                                                onChange={(e) => setGenConfig({ ...genConfig, startDate: e.target.value })}
                                                className="w-full p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Sinal (Entrada)</label>
                                                <input
                                                    type="number"
                                                    value={genConfig.sinal}
                                                    onChange={(e) => setGenConfig({ ...genConfig, sinal: parseFloat(e.target.value) || 0 })}
                                                    className="w-full p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Entrega (Chaves)</label>
                                                <input
                                                    type="number"
                                                    value={genConfig.chaves}
                                                    onChange={(e) => setGenConfig({ ...genConfig, chaves: parseFloat(e.target.value) || 0 })}
                                                    className="w-full p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Parcelas Mensais</label>
                                                <input
                                                    type="number"
                                                    value={genConfig.numMensais}
                                                    onChange={(e) => setGenConfig({ ...genConfig, numMensais: parseInt(e.target.value) || 0 })}
                                                    className="w-full p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Data da 1ª Parcela</label>
                                                <input
                                                    type="date"
                                                    value={genConfig.startDate}
                                                    onChange={(e) => setGenConfig({ ...genConfig, startDate: e.target.value })}
                                                    className="w-full p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Balão Semestral (Qtd • Valor)</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        placeholder="Qtd"
                                                        value={genConfig.numSeme}
                                                        onChange={(e) => setGenConfig({ ...genConfig, numSeme: parseInt(e.target.value) || 0 })}
                                                        className="w-16 p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="Valor"
                                                        value={genConfig.valSeme}
                                                        onChange={(e) => setGenConfig({ ...genConfig, valSeme: parseFloat(e.target.value) || 0 })}
                                                        className="flex-1 p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Balão Anual (Qtd • Valor)</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        placeholder="Qtd"
                                                        value={genConfig.numAnual}
                                                        onChange={(e) => setGenConfig({ ...genConfig, numAnual: parseInt(e.target.value) || 0 })}
                                                        className="w-16 p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="Valor"
                                                        value={genConfig.valAnual}
                                                        onChange={(e) => setGenConfig({ ...genConfig, valAnual: parseFloat(e.target.value) || 0 })}
                                                        className="flex-1 p-4 bg-white border border-gray-100 rounded-xl font-bold text-gray-900"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {genConfig.type === 'PARCELADO' && genConfig.numMensais > 0 && (
                                    <div className="mt-6 p-4 bg-white rounded-xl border border-indigo-100">
                                        <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                            <span>Mensalidade Estimada:</span>
                                            <span className="text-sm">
                                                R$ {((financialInfo.totalValue - genConfig.sinal - genConfig.chaves - (genConfig.numSeme * genConfig.valSeme) - (genConfig.numAnual * genConfig.valAnual)) / genConfig.numMensais).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => {
                                        const total = financialInfo.totalValue;
                                        if (genConfig.type === 'VISTA') {
                                            const newInst = [{
                                                id: 'u' + Math.random().toString(36).substr(2, 5),
                                                description: 'PAGAMENTO ÚNICO À VISTA',
                                                value: total,
                                                dueDate: genConfig.startDate,
                                                status: 'PENDING' as const
                                            }];
                                            const newFinInfo = { ...financialInfo, paymentMethod: 'À VISTA', installments: newInst, transactions: financialInfo.transactions || [] };
                                            if (clientProfile) {
                                                updateClientData({ financialInfo: newFinInfo });
                                            } else {
                                                onUpdateSettings?.({ ...settings, financialInfo: newFinInfo });
                                            }
                                        } else {
                                            const { sinal, chaves, numMensais, numSeme, valSeme, numAnual, valAnual, startDate } = genConfig;
                                            const totalBalloons = (numSeme * valSeme) + (numAnual * valAnual);
                                            const remaining = total - sinal - chaves - totalBalloons;
                                            const monthlyVal = numMensais > 0 ? remaining / numMensais : 0;

                                            const newInsts: PaymentInstallment[] = [];
                                            const baseDate = new Date(startDate + 'T12:00:00');

                                            if (sinal > 0) newInsts.push({ id: 's' + Math.random().toString(36).substr(2, 5), description: 'SINAL / ENTRADA', value: sinal, dueDate: new Date().toISOString().split('T')[0], status: 'PENDING' as const });

                                            for (let i = 0; i < numMensais; i++) {
                                                const d = new Date(baseDate);
                                                d.setMonth(d.getMonth() + i);
                                                newInsts.push({
                                                    id: 'm' + i + Math.random().toString(36).substr(2, 5),
                                                    description: `PARCELA MENSAL ${i + 1}/${numMensais}`,
                                                    value: monthlyVal,
                                                    dueDate: d.toISOString().split('T')[0],
                                                    status: 'PENDING' as const
                                                });
                                            }

                                            for (let i = 0; i < numSeme; i++) {
                                                const d = new Date(baseDate);
                                                d.setMonth(d.getMonth() + ((i + 1) * 6));
                                                newInsts.push({
                                                    id: 'bs' + i + Math.random().toString(36).substr(2, 5),
                                                    description: `BALÃO SEMESTRAL ${i + 1}/${numSeme}`,
                                                    value: valSeme,
                                                    dueDate: d.toISOString().split('T')[0],
                                                    status: 'PENDING' as const
                                                });
                                            }

                                            for (let i = 0; i < numAnual; i++) {
                                                const d = new Date(baseDate);
                                                d.setFullYear(d.getFullYear() + (i + 1));
                                                newInsts.push({
                                                    id: 'ba' + i + Math.random().toString(36).substr(2, 5),
                                                    description: `BALÃO ANUAL ${i + 1}/${numAnual}`,
                                                    value: valAnual,
                                                    dueDate: d.toISOString().split('T')[0],
                                                    status: 'PENDING' as const
                                                });
                                            }

                                            if (chaves > 0) {
                                                const lastDate = new Date(baseDate);
                                                lastDate.setMonth(lastDate.getMonth() + Math.max(numMensais, numSeme * 6, numAnual * 12));
                                                newInsts.push({ id: 'c' + Math.random().toString(36).substr(2, 5), description: 'ENTREGA DAS CHAVES', value: chaves, dueDate: lastDate.toISOString().split('T')[0], status: 'PENDING' as const });
                                            }

                                            const newFinInfo = { ...financialInfo, paymentMethod: 'PARCELADO', installments: newInsts, transactions: financialInfo.transactions || [] };
                                            if (clientProfile) {
                                                updateClientData({ financialInfo: newFinInfo });
                                            } else {
                                                onUpdateSettings?.({ ...settings, financialInfo: newFinInfo });
                                            }
                                        }
                                        setShowGenerator(false);
                                    }}
                                    className="w-full mt-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-1 transition-all active:scale-95"
                                >
                                    Confirmar e Gerar Parcelas
                                </button>
                            </div>
                        )}
                        <div className="space-y-6">
                            {(!financialInfo.installments || financialInfo.installments.length === 0) ? (
                                <div className="text-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-100">
                                    <DollarSign className="w-16 h-16 text-gray-200 mx-auto mb-6" />
                                    <p className="text-lg font-black text-gray-400 uppercase tracking-widest">Nenhum plano cadastrado</p>
                                </div>
                            ) : viewMode === 'grid' ? (
                                financialInfo.installments.map((inst, idx) => (
                                    <div key={inst.id} className="group bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/30 hover:border-indigo-100 transition-all duration-500 relative overflow-hidden">
                                        {/* Background Decor */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex flex-col gap-2">
                                                <h4 className="text-lg font-black text-gray-900 tracking-tight uppercase underline decoration-indigo-200/50 underline-offset-4">{inst.description}</h4>
                                                <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                    <Calendar className="w-4 h-4 text-indigo-500" />
                                                    VENCIMENTO: {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </div>
                                            </div>

                                            <div className="flex flex-col md:items-end gap-3">
                                                <div className="text-3xl font-black text-gray-900 tracking-tighter">
                                                    R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <button
                                                    disabled={!isAdmin}
                                                    onClick={() => {
                                                        if (isAdmin) {
                                                            const newStatus = inst.status === 'PAID' ? 'PENDING' : 'PAID';
                                                            const newInsts = financialInfo.installments.map(i =>
                                                                i.id === inst.id ? { ...i, status: newStatus as 'PAID' | 'PENDING' } : i
                                                            );
                                                            handleUpdateFinancial(newInsts);
                                                        }
                                                    }}
                                                    className={`px-8 py-2 rounded-full text-[10px] font-black uppercase tracking-widest w-fit transition-all border shadow-sm
                                                                ${inst.status === 'PAID'
                                                            ? 'bg-indigo-600 text-white border-indigo-700'
                                                            : 'bg-amber-50 text-amber-600 border-amber-200 shadow-amber-100/20'}
                                                                ${isAdmin ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
                                                            `}>
                                                    {inst.status === 'PAID' ? 'LIQUIDADO' : 'AGUARDANDO'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Action Bar */}
                                        {isAdmin && (
                                            <div className="absolute top-8 right-8 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                {inst.receiptUrl ? (
                                                    <a
                                                        href={inst.receiptUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-3 bg-white text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-md border border-gray-100"
                                                        title="Ver Comprovante Anexado"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </a>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            const url = prompt('URL do Comprovante Externo (Opcional):', inst.receiptUrl || '');
                                                            if (url !== null) {
                                                                const newInsts = financialInfo.installments.map(i =>
                                                                    i.id === inst.id ? { ...i, receiptUrl: url } : i
                                                                );
                                                                handleUpdateFinancial(newInsts);
                                                            }
                                                        }}
                                                        className="p-3 bg-white text-gray-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-md border border-gray-100"
                                                        title="Vincular Comprovante Externo"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {inst.status === 'PAID' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            exportService.generateReceiptPDF(inst, settings, { name: clientProfile?.name || 'OPURA' });
                                                        }}
                                                        className="p-3 bg-white text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-md border border-emerald-100"
                                                        title="Gerar Recibo PDF"
                                                    >
                                                        <FileDown className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        const desc = prompt('Nova descrição:', inst.description);
                                                        const val = prompt('Novo valor:', inst.value.toString());
                                                        const newInsts = financialInfo.installments.map(i =>
                                                            i.id === inst.id ? { ...i, description: desc || i.description, value: val ? parseFloat(val) : i.value } : i
                                                        );
                                                        handleUpdateFinancial(newInsts);
                                                    }}
                                                    className="p-3 bg-white text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-md border border-gray-100"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (await confirm({ title: 'Remover esta parcela?', variant: 'danger', confirmLabel: 'Remover' })) {
                                                            const newInsts = financialInfo.installments.filter(i => i.id !== inst.id);
                                                            handleUpdateFinancial(newInsts);
                                                        }
                                                    }}
                                                    className="p-3 bg-white text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-md border border-gray-100"
                                                    title="Excluir"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50/50 border-b border-gray-100">
                                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                <th className="px-8 py-5">Descrição</th>
                                                <th className="px-8 py-5">Vencimento</th>
                                                <th className="px-8 py-5">Valor</th>
                                                <th className="px-8 py-5 text-center">Status</th>
                                                <th className="px-8 py-5 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {financialInfo.installments.map((inst, idx) => (
                                                <tr key={inst.id} className="hover:bg-indigo-50/30 transition-colors group">
                                                    <td className="px-8 py-4">
                                                        <span className="text-sm font-bold text-gray-900 uppercase tracking-tight">{inst.description}</span>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tabular-nums">
                                                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                                            {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <span className="text-base font-black text-gray-900 tabular-nums">
                                                            R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-4 text-center">
                                                        <button
                                                            disabled={!isAdmin}
                                                            onClick={() => {
                                                                if (isAdmin) {
                                                                    const newStatus = inst.status === 'PAID' ? 'PENDING' : 'PAID';
                                                                    const newInsts = financialInfo.installments.map(i =>
                                                                        i.id === inst.id ? { ...i, status: newStatus as 'PAID' | 'PENDING' } : i
                                                                    );
                                                                    handleUpdateFinancial(newInsts);
                                                                }
                                                            }}
                                                            className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all
                                                                        ${inst.status === 'PAID' ? 'bg-indigo-600 text-white' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                                        >
                                                            {inst.status === 'PAID' ? 'LIQUIDADO' : 'AGUARDANDO'}
                                                        </button>
                                                    </td>
                                                    <td className="px-8 py-4 text-right">
                                                        <div className="flex justify-end gap-1">
                                                            {inst.receiptUrl && (
                                                                <button
                                                                    onClick={() => window.open(inst.receiptUrl, '_blank')}
                                                                    className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all"
                                                                    title="Acessar Comprovante Anexado"
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {inst.status === 'PAID' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        exportService.generateReceiptPDF(inst, settings, { name: clientProfile?.name || 'OPURA' });
                                                                    }}
                                                                    className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all"
                                                                    title={isAdmin ? "Gerar Recibo PDF" : "Baixar Recibo PDF"}
                                                                >
                                                                    <FileDown className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={() => {
                                                                            const desc = prompt('Nova descrição:', inst.description);
                                                                            const val = prompt('Novo valor:', inst.value.toString());
                                                                            const newInsts = financialInfo.installments.map(i =>
                                                                                i.id === inst.id ? { ...i, description: desc || i.description, value: val ? parseFloat(val) : i.value } : i
                                                                            );
                                                                            handleUpdateFinancial(newInsts);
                                                                        }}
                                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (await confirm({ title: 'Remover esta parcela?', variant: 'danger', confirmLabel: 'Remover' })) {
                                                                                const newInsts = financialInfo.installments.filter(i => i.id !== inst.id);
                                                                                handleUpdateFinancial(newInsts);
                                                                            }
                                                                        }}
                                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ─── Financeiro: Locação ───────────────────────────────────────────────────
    const renderFinanceiroLocacao = () => {
        const finInfo = currentFinancialInfo || { totalValue: 0, paymentMethod: 'Não Definido', installments: [], transactions: [] };
        const installments = [...(finInfo.installments || []), ...(clientProfile ? globalClientInstallments : [])];
        const uniqueMap = new Map<string, PaymentInstallment>();
        installments.forEach(i => { if (i.id) uniqueMap.set(i.id, i); });
        const charges = Array.from(uniqueMap.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const totalPaid    = charges.filter(i => i.status === 'PAID').reduce((s, i) => s + i.value, 0);
        const totalPending = charges.filter(i => i.status !== 'PAID').reduce((s, i) => s + i.value, 0);
        const nextDue      = charges.find(i => i.status !== 'PAID');

        const handleUpdateCharges = async (next: PaymentInstallment[]) => {
            const newFinInfo = { ...finInfo, installments: next, transactions: finInfo.transactions || [] };
            if (clientProfile) updateClientData({ financialInfo: newFinInfo });
            else onUpdateSettings?.({ ...settings, financialInfo: newFinInfo });
        };

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* ══ MOBILE ══ */}
                <div className="md:hidden -mx-4">
                    <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                        <h2 className="text-2xl font-black text-white leading-tight">Financeiro</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">Cobranças e pagamentos do imóvel</p>
                    </div>
                    <div className="px-4 -mt-3 pb-2 grid grid-cols-3 gap-2 mb-2">
                        {[
                            { label: 'Vencimento', value: nextDue ? `R$ ${nextDue.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'Em dia', color: 'text-amber-600' },
                            { label: 'Pago', value: `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-emerald-600' },
                            { label: 'Pendente', value: `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-gray-900' },
                        ].map((k, i) => (
                            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                                <p className={`text-xs font-black ${k.color} tabular-nums`}>{k.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 pb-6 space-y-2">
                        {charges.length === 0 ? (
                            <div className="flex flex-col items-center text-center py-8">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><DollarSign className="w-6 h-6" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhuma cobrança</p>
                            </div>
                        ) : (
                            charges.map(charge => {
                                const overdue = charge.status !== 'PAID' && new Date(charge.dueDate + 'T12:00:00') < new Date();
                                return (
                                    <div key={charge.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${charge.status === 'PAID' ? 'bg-emerald-50 text-emerald-500' : overdue ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                            <DollarSign className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-gray-900 truncate">{charge.description}</p>
                                            <p className="text-[10px] font-bold text-gray-400 mt-0.5">{new Date(charge.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0 gap-1">
                                            <span className="text-sm font-black text-gray-900 tabular-nums">R$ {charge.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${charge.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : overdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                                                {charge.status === 'PAID' ? 'Pago' : overdue ? 'Vencido' : 'Pendente'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { label: 'Próximo Vencimento', value: nextDue ? `R$ ${nextDue.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—', sub: nextDue ? new Date(nextDue.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Em dia', color: 'text-amber-600', icon: <Bell className="w-5 h-5 text-amber-500" /> },
                        { label: 'Total Pago', value: `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, sub: `${charges.filter(i => i.status === 'PAID').length} cobranças`, color: 'text-emerald-600', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
                        { label: 'Pendente', value: `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, sub: `${charges.filter(i => i.status !== 'PAID').length} cobranças`, color: 'text-gray-900', icon: <Clock className="w-5 h-5 text-indigo-500" /> },
                    ].map((card, i) => (
                        <div key={i} className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl shrink-0">{card.icon}</div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{card.label}</p>
                                <p className={`text-2xl font-black ${card.color} tracking-tight`}>{card.value}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{card.sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-8 py-6 border-b border-gray-50">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Cobranças do Imóvel</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Aluguel, condomínio, IPTU e demais encargos</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => {
                                    const desc = prompt('Descrição (ex: Aluguel Jan/2026):');
                                    const val = prompt('Valor (R$):');
                                    const date = prompt('Vencimento (AAAA-MM-DD):');
                                    if (desc && val && date) {
                                        const newCharge: PaymentInstallment = { id: Math.random().toString(36).substr(2, 9), description: desc, value: parseFloat(val), dueDate: date, status: 'PENDING' };
                                        handleUpdateCharges([...charges, newCharge]);
                                    }
                                }}
                                className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    {charges.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <DollarSign className="w-12 h-12 text-gray-200 mb-4" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Nenhuma cobrança cadastrada</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    <th className="px-8 py-4">Descrição</th>
                                    <th className="px-8 py-4">Vencimento</th>
                                    <th className="px-8 py-4">Valor</th>
                                    <th className="px-8 py-4 text-center">Status</th>
                                    {isAdmin && <th className="px-8 py-4 text-right">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {charges.map(charge => {
                                    const overdue = charge.status !== 'PAID' && new Date(charge.dueDate + 'T12:00:00') < new Date();
                                    return (
                                        <tr key={charge.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-8 py-4">
                                                <span className="text-sm font-bold text-gray-900 uppercase tracking-tight">{charge.description}</span>
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className={`flex items-center gap-2 text-xs font-bold tabular-nums ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(charge.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                    {overdue && <span className="text-[9px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-black uppercase">Vencido</span>}
                                                </div>
                                            </td>
                                            <td className="px-8 py-4">
                                                <span className="text-base font-black text-gray-900 tabular-nums">R$ {charge.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </td>
                                            <td className="px-8 py-4 text-center">
                                                <button
                                                    disabled={!isAdmin}
                                                    onClick={() => {
                                                        if (!isAdmin) return;
                                                        const next = charges.map(c => c.id === charge.id ? { ...c, status: (c.status === 'PAID' ? 'PENDING' : 'PAID') as 'PAID' | 'PENDING' } : c);
                                                        handleUpdateCharges(next);
                                                    }}
                                                    className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${charge.status === 'PAID' ? 'bg-emerald-600 text-white' : overdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'} ${isAdmin ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                                                >
                                                    {charge.status === 'PAID' ? 'PAGO' : overdue ? 'VENCIDO' : 'PENDENTE'}
                                                </button>
                                            </td>
                                            {isAdmin && (
                                                <td className="px-8 py-4 text-right">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        {charge.status === 'PAID' && (
                                                            <button onClick={() => exportService.generateReceiptPDF(charge, settings, { name: clientProfile?.name || 'OPURA' })} className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all" title="Recibo PDF">
                                                                <FileDown className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => { const d = prompt('Descrição:', charge.description); const v = prompt('Valor:', charge.value.toString()); if (d !== null || v !== null) handleUpdateCharges(charges.map(c => c.id === charge.id ? { ...c, description: d ?? c.description, value: v ? parseFloat(v) : c.value } : c)); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Pencil className="w-4 h-4" /></button>
                                                        <button onClick={async () => { if (await confirm({ title: 'Remover cobrança?', variant: 'danger', confirmLabel: 'Remover' })) handleUpdateCharges(charges.filter(c => c.id !== charge.id)); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><X className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                </div>{/* end hidden md:block */}
            </div>
        );
    };

    // ─── Financeiro: Serviços ──────────────────────────────────────────────────
    const renderFinanceiroServicos = () => {
        const finInfo = currentFinancialInfo || { totalValue: 0, paymentMethod: 'Não Definido', installments: [], transactions: [] };
        const installments = [...(finInfo.installments || []), ...(clientProfile ? globalClientInstallments : [])];
        const uniqueMap = new Map<string, PaymentInstallment>();
        installments.forEach(i => { if (i.id) uniqueMap.set(i.id, i); });
        const medicoes = Array.from(uniqueMap.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const totalContrato  = medicoes.reduce((s, m) => s + m.value, 0);
        const totalMedido    = medicoes.filter(m => m.status === 'PAID').reduce((s, m) => s + m.value, 0);
        const pctMedido      = totalContrato > 0 ? (totalMedido / totalContrato) * 100 : 0;
        const totalAMedir    = totalContrato - totalMedido;

        const handleUpdateMedicoes = async (next: PaymentInstallment[]) => {
            const newFinInfo = { ...finInfo, installments: next, transactions: finInfo.transactions || [] };
            if (clientProfile) updateClientData({ financialInfo: newFinInfo });
            else onUpdateSettings?.({ ...settings, financialInfo: newFinInfo });
        };

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* ══ MOBILE ══ */}
                <div className="md:hidden -mx-4">
                    <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                        <h2 className="text-2xl font-black text-white leading-tight">Financeiro</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">Medições e faturamento</p>
                    </div>
                    <div className="px-4 -mt-3 pb-2 grid grid-cols-3 gap-2 mb-2">
                        {[
                            { label: 'Contratado', value: `R$ ${totalContrato.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-gray-900' },
                            { label: 'Medido', value: `R$ ${totalMedido.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-emerald-600' },
                            { label: 'A Medir', value: `R$ ${totalAMedir.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-amber-600' },
                        ].map((k, i) => (
                            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                                <p className={`text-xs font-black ${k.color} tabular-nums`}>{k.value}</p>
                            </div>
                        ))}
                    </div>
                    {pctMedido > 0 && (
                        <div className="px-4 mb-3">
                            <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
                                <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase mb-1.5">
                                    <span>Progresso medido</span><span>{pctMedido.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${pctMedido}%` }} />
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="px-4 pb-6 space-y-2">
                        {medicoes.length === 0 ? (
                            <div className="flex flex-col items-center text-center py-8">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><ClipboardList className="w-6 h-6" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhuma medição</p>
                            </div>
                        ) : (
                            medicoes.map((med, idx) => (
                                <div key={med.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${med.status === 'PAID' ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                                        <span className="text-[11px] font-black">{idx + 1}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-gray-900 truncate">{med.description}</p>
                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5">{new Date(med.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 gap-1">
                                        <span className="text-sm font-black text-gray-900 tabular-nums">R$ {med.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${med.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {med.status === 'PAID' ? 'Aprovada' : 'Pendente'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { label: 'Total Contratado', value: totalContrato, sub: finInfo.paymentMethod || '—', color: 'text-gray-900', icon: <DollarSign className="w-5 h-5 text-indigo-500" /> },
                        { label: 'Medido / Faturado', value: totalMedido, sub: `${pctMedido.toFixed(1)}% do contrato`, color: 'text-emerald-600', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, progress: pctMedido },
                        { label: 'A Medir', value: totalAMedir, sub: `${medicoes.filter(m => m.status !== 'PAID').length} medições pendentes`, color: 'text-amber-600', icon: <Clock className="w-5 h-5 text-amber-500" /> },
                    ].map((card, i) => (
                        <div key={i} className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl shrink-0">{card.icon}</div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{card.label}</p>
                                <p className={`text-2xl font-black ${card.color} tracking-tight`}>R$ {card.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{card.sub}</p>
                                {'progress' in card && (
                                    <div className="mt-2 w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${card.progress}%` }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-8 py-6 border-b border-gray-50">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Medições e Faturas</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Etapas medidas, aprovadas e faturadas</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => {
                                    const desc = prompt('Etapa / descrição da medição:');
                                    const val = prompt('Valor (R$):');
                                    const date = prompt('Data da medição (AAAA-MM-DD):');
                                    if (desc && val && date) {
                                        const newMed: PaymentInstallment = { id: Math.random().toString(36).substr(2, 9), description: desc, value: parseFloat(val), dueDate: date, status: 'PENDING' };
                                        handleUpdateMedicoes([...medicoes, newMed]);
                                    }
                                }}
                                className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    {medicoes.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <ClipboardList className="w-12 h-12 text-gray-200 mb-4" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Nenhuma medição cadastrada</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    <th className="px-8 py-4">Etapa / Medição</th>
                                    <th className="px-8 py-4">Data</th>
                                    <th className="px-8 py-4">Valor</th>
                                    <th className="px-8 py-4 text-center">Status</th>
                                    {isAdmin && <th className="px-8 py-4 text-right">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {medicoes.map((med, idx) => (
                                    <tr key={med.id} className="hover:bg-indigo-50/30 transition-colors group">
                                        <td className="px-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black shrink-0">{idx + 1}</span>
                                                <span className="text-sm font-bold text-gray-900 uppercase tracking-tight">{med.description}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-4">
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tabular-nums">
                                                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                                {new Date(med.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            </div>
                                        </td>
                                        <td className="px-8 py-4">
                                            <span className="text-base font-black text-gray-900 tabular-nums">R$ {med.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </td>
                                        <td className="px-8 py-4 text-center">
                                            <button
                                                disabled={!isAdmin}
                                                onClick={() => {
                                                    if (!isAdmin) return;
                                                    const next = medicoes.map(m => m.id === med.id ? { ...m, status: (m.status === 'PAID' ? 'PENDING' : 'PAID') as 'PAID' | 'PENDING' } : m);
                                                    handleUpdateMedicoes(next);
                                                }}
                                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${med.status === 'PAID' ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-600'} ${isAdmin ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                                            >
                                                {med.status === 'PAID' ? 'APROVADA' : 'PENDENTE'}
                                            </button>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-8 py-4 text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    {med.status === 'PAID' && (
                                                        <button onClick={() => exportService.generateReceiptPDF(med, settings, { name: clientProfile?.name || 'OPURA' })} className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all" title="Recibo PDF"><FileDown className="w-4 h-4" /></button>
                                                    )}
                                                    <button onClick={() => { const d = prompt('Descrição:', med.description); const v = prompt('Valor:', med.value.toString()); if (d !== null || v !== null) handleUpdateMedicoes(medicoes.map(m => m.id === med.id ? { ...m, description: d ?? m.description, value: v ? parseFloat(v) : m.value } : m)); }} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={async () => { if (await confirm({ title: 'Remover medição?', variant: 'danger', confirmLabel: 'Remover' })) handleUpdateMedicoes(medicoes.filter(m => m.id !== med.id)); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><X className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                </div>{/* end hidden md:block */}
            </div>
        );
    };

    const renderObra = () => {
        const pv = planningView;
        const fmt = (d: Date | null) => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
            concluida: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
            andamento: { label: 'Em andamento', cls: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
            futura: { label: 'A iniciar', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' },
        };

        if (planningLoadedKey && !pv) {
            return (
                <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                    <HardHat className="w-16 h-16 text-gray-200 mb-6" />
                    <p className="text-lg font-black text-gray-400 uppercase tracking-widest text-center">Cronograma ainda não disponível</p>
                    <p className="text-sm font-bold text-gray-300 uppercase tracking-wider mt-2 text-center">O acompanhamento da obra aparecerá aqui assim que o planejamento for publicado.</p>
                </div>
            );
        }
        if (!pv) {
            return (
                <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            );
        }

        const atraso = pv.daysRemaining !== null && pv.daysRemaining < 0;
        const onTrack = pv.onSchedule !== false;

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Cabeçalho + progresso geral */}
                <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-indigo-600 rounded-3xl p-8 text-white">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-2xl font-black tracking-tight uppercase">Acompanhe sua Obra</h3>
                            <p className="text-blue-200 text-sm font-medium mt-1">Avanço físico e cronograma em tempo real.</p>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${onTrack ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-100'}`}>
                            <div className={`w-2 h-2 rounded-full ${onTrack ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                            {onTrack ? 'No prazo' : 'Atenção ao ritmo'}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Avanço Geral</p>
                            <p className="text-2xl font-black">{pv.progress}%</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Previsto p/ hoje</p>
                            <p className="text-2xl font-black">{pv.plannedToday}%</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Início</p>
                            <p className="text-sm font-black mt-1.5">{fmt(pv.start)}</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">{atraso ? 'Atraso' : 'Entrega prevista'}</p>
                            <p className="text-sm font-black mt-1.5">{atraso ? `${Math.abs(pv.daysRemaining!)} dias` : fmt(pv.end)}</p>
                        </div>
                    </div>
                    {/* Barra de progresso geral */}
                    <div className="mt-6">
                        <div className="h-3 bg-white/15 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${pv.progress}%` }} />
                        </div>
                    </div>
                </div>

                {/* Curva S */}
                {pv.sCurve.length > 0 && (
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                            <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Curva de Avanço</h3>
                        </div>
                        <ResponsiveContainer width="100%" height={260}>
                            <ComposedChart data={pv.sCurve} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                                <RechartsTooltip formatter={(v, n) => [`${v ?? 0}%`, n as string]} />
                                <Area type="monotone" dataKey="planned" name="Planejado" stroke="#6366f1" strokeWidth={2} fill="#eef2ff" />
                                <Line type="monotone" dataKey="realized" name="Realizado" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} connectNulls={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                        <div className="flex items-center justify-center gap-6 mt-2">
                            <span className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest"><span className="w-3 h-3 rounded-sm bg-indigo-200 border border-indigo-400" /> Planejado</span>
                            <span className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Realizado (hoje)</span>
                        </div>
                    </div>
                )}

                {/* Timeline de fases */}
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                        <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Etapas da Obra</h3>
                    </div>
                    {pv.phases.length === 0 ? (
                        <p className="text-sm text-gray-400 font-medium text-center py-8">As etapas aparecerão aqui quando o cronograma for detalhado.</p>
                    ) : (
                        <div className="space-y-3">
                            {pv.phases.map(ph => {
                                const st = statusMap[ph.status];
                                return (
                                    <div key={ph.id} className="p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 transition-all">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <div className="min-w-0">
                                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">{ph.groupName}</span>
                                                <p className="text-sm font-black text-gray-900 truncate">{ph.name}</p>
                                            </div>
                                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${st.cls}`}>{st.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${st.dot}`} style={{ width: `${ph.progress}%` }} />
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 tabular-nums w-9 text-right">{ph.progress}%</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 mt-2">
                                            <Calendar className="w-3 h-3" />
                                            {fmt(ph.start)} <span className="text-gray-300">→</span> {fmt(ph.end)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderJornada = () => {
        const schedule = getPhaseSchedule(settings, budget);

        return (
            <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-12">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Sua Casa, Sua História</h3>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Cada marco é um passo mais próximo da sua nova vida.</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100/50">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        No Prazo
                    </div>
                </div>

                <div className="relative pl-12 space-y-10 before:absolute before:left-[11px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-100 before:rounded-full">
                    {schedule.length > 0 ? (
                        schedule.map((event, idx) => {
                            const isPast = event.endDate < new Date();
                            const isCurrent = event.startDate <= new Date() && event.endDate >= new Date();

                            return (
                                <div key={event.id} className="relative group">
                                    {/* Timeline Node */}
                                    <div className={`
                                        absolute -left-[3.05rem] top-6 w-6 h-6 rounded-full border-4 border-white shadow-md z-10 
                                        transition-all duration-500 group-hover:scale-125
                                        ${isCurrent ? 'bg-indigo-600 ring-4 ring-indigo-50' : isPast ? 'bg-emerald-500' : 'bg-blue-400'}
                                    `} />

                                    <div className={`
                                        p-8 rounded-[2rem] border transition-all duration-500 w-full
                                        ${isCurrent
                                            ? 'bg-indigo-50/40 border-indigo-100 shadow-xl shadow-indigo-100/10'
                                            : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/50'}
                                    `}>
                                        <div className="flex flex-col gap-1 mb-4">
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{event.groupName}</span>
                                            <h4 className="text-2xl font-black text-gray-900 tracking-tight leading-tight uppercase group-hover:text-indigo-600 transition-colors">
                                                {event.name}
                                            </h4>
                                        </div>

                                        <div className="flex items-center gap-2 text-gray-500 mb-6 bg-gray-50 w-fit px-4 py-2 rounded-2xl border border-gray-100">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            <span className="text-sm font-bold tracking-tight">
                                                {event.startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                <span className="mx-2 text-gray-300"> - </span>
                                                {event.endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </span>
                                        </div>

                                        {/* Lifestyle Insight for the phase */}
                                        <div className="mb-6 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/30">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 p-1 bg-white rounded-lg text-indigo-500 shadow-sm">
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                </div>
                                                <p className="text-[11px] font-bold text-indigo-700 leading-relaxed italic">
                                                    {event.groupName.includes('Estrutura') ? "Nesta fase, a solidez do seu futuro lar está sendo esculpida. É o corpo ganhando força!" :
                                                        event.groupName.includes('Acabamento') ? "O toque final! É hora de imaginar as cores, texturas e a sensação de cada ambiente." :
                                                            "Um marco importante para garantir que tudo saia exatamente como você sonhou."}
                                                </p>
                                            </div>
                                        </div>

                                        {(event.subPhases.length > 0 || (budget.filter(i => i.group === event.groupName && i.phase === event.name).length > 0)) && (
                                            <div className="space-y-3 pt-6 border-t border-gray-100">
                                                {budget
                                                    .filter(item => item.group === event.groupName && item.phase.includes(event.name))
                                                    .slice(0, 5) // Limit to 5 items to keep card tidy
                                                    .map((item) => (
                                                        <div key={item.id} className="flex items-center gap-3 text-[12px] font-bold text-gray-500 group/item">
                                                            <div className="w-2 h-2 rounded-full bg-blue-400/30 group-hover/item:bg-blue-500 transition-colors" />
                                                            <span className="tracking-tight uppercase">{item.sinapiItem.description}</span>
                                                        </div>
                                                    ))}
                                                {budget.filter(i => i.group === event.groupName && i.phase.includes(event.name)).length > 5 && (
                                                    <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-5">
                                                        + {budget.filter(i => i.group === event.groupName && i.phase.includes(event.name)).length - 5} itens adicionais
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-6 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
                            <Calendar className="w-16 h-16 text-gray-200 mb-6" />
                            <p className="text-lg font-black text-gray-400 uppercase tracking-widest text-center">Nenhum planejamento carregado</p>
                            <p className="text-sm font-bold text-gray-300 uppercase tracking-wider mt-2">Defina o cronograma na área de gestão</p>
                        </div>
                    )}
                </div>
            </div >
        );
    };

    const renderDiario = () => {
        const entries = currentDiaryEntries;
        const WeatherIcon = ({ type }: { type: string }) => {
            switch (type) {
                case 'Ensolarado': return <Sun className="w-4 h-4 text-amber-500" />;
                case 'Nublado': return <CloudSun className="w-4 h-4 text-gray-400" />;
                case 'Chuvoso': return <CloudRain className="w-4 h-4 text-blue-500" />;
                default: return <Cloud className="w-4 h-4 text-gray-400" />;
            }
        };

        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* ══ MOBILE ══ */}
                <div className="md:hidden -mx-4">
                    <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                        <h2 className="text-2xl font-black text-white leading-tight">Diário de Obra</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">{entries.length} registro{entries.length !== 1 ? 's' : ''} do gestor</p>
                    </div>
                    <div className="px-4 -mt-3 pb-6 space-y-2">
                        {entries.length === 0 ? (
                            <div className="flex flex-col items-center text-center py-10">
                                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><BookOpen className="w-7 h-7" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhum registro ainda</p>
                                <p className="text-xs text-gray-400 font-medium mt-1">As atualizações da obra aparecerão aqui.</p>
                            </div>
                        ) : (
                            entries.map(item => (
                                <div key={item.id} onClick={() => setSelectedEntry(item)}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
                                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                        <WeatherIcon type={item.weather} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-gray-900">{new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        <p className="text-xs text-gray-400 font-medium truncate mt-0.5">{item.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {(item.images?.length ?? 0) > 0 && (
                                            <span className="text-[9px] font-black bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">{item.images!.length} foto{item.images!.length !== 1 ? 's' : ''}</span>
                                        )}
                                        {item.impediments && <span className="text-[9px] font-black bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Impedimento</span>}
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-6">
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            Histórico do Diário de Obra
                        </h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Grade"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {isAdmin && (
                        <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md">
                            Nova Entrada
                        </button>
                    )}
                </div>

                {entries.length === 0 ? (
                    <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center text-center">
                        <BookOpen className="w-10 h-10 text-gray-200 mb-4" />
                        <h4 className="text-gray-400 font-bold">Nenhum registro no diário</h4>
                        <p className="text-gray-300 text-xs mt-1">O gestor da obra ainda não realizou postagens.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {entries.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedEntry(item)}
                                className="group relative bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-100/20 cursor-pointer overflow-hidden"
                            >
                                {/* Status Indicator Bar */}
                                <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${item.impediments ? 'bg-red-500' : 'bg-indigo-600'}`} />

                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col">
                                        <span className="text-lg font-black text-gray-900 tracking-tight">
                                            {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </span>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <WeatherIcon type={item.weather} />
                                            <span className="text-[10px] font-bold text-gray-400">{item.temperature || 'N/A'}</span>
                                        </div>
                                    </div>
                                    {item.impediments && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[9px] font-bold border border-red-100">
                                            <AlertCircle className="w-2.5 h-2.5" />
                                            Impedimento
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs text-gray-600 leading-relaxed mb-6 font-medium line-clamp-3">"{item.description}"</p>

                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {(item.images || []).map((img, idx) => (
                                            <div key={idx} className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 overflow-hidden border border-gray-50">
                                                <img src={img} alt="Obra" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                        {(item.videos || []).map((vid, idx) => (
                                            <div key={idx} className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-indigo-700 transition-colors">
                                                <Video className="w-5 h-5" />
                                            </div>
                                        ))}
                                    </div>

                                    {(item.documents || []).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {item.documents!.slice(0, 2).map((doc, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider border border-emerald-100"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    {doc.name.split('.').pop()}
                                                </div>
                                            ))}
                                            {item.documents!.length > 2 && (
                                                <span className="text-[9px] font-bold text-gray-400">+{item.documents!.length - 2}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] font-bold text-indigo-600 uppercase pt-4 border-t border-gray-50 mt-4">
                                    <span>Ver detalhes completos</span>
                                    <ChevronRight className="w-3 h-3" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <th className="px-8 py-5">Data</th>
                                    <th className="px-8 py-5">Clima</th>
                                    <th className="px-8 py-5">Descrição</th>
                                    <th className="px-8 py-5 text-center">Mídia</th>
                                    <th className="px-8 py-5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {entries.map((item) => (
                                    <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onClick={() => setSelectedEntry(item)}>
                                        <td className="px-8 py-4 whitespace-nowrap">
                                            <span className="text-sm font-bold text-gray-900">{new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        </td>
                                        <td className="px-8 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <WeatherIcon type={item.weather} />
                                                <span className="text-xs font-medium text-gray-500">{item.weather}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-4">
                                            <p className="text-xs text-gray-600 font-medium line-clamp-1 max-w-md">{item.description}</p>
                                        </td>
                                        <td className="px-8 py-4 text-center">
                                            <div className="flex justify-center -space-x-2">
                                                {(item.images || []).slice(0, 3).map((img, idx) => (
                                                    <div key={idx} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 overflow-hidden">
                                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                                {(item.images || []).length > 3 && (
                                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
                                                        +{(item.images || []).length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                            <button className="p-2 transition-transform group-hover:translate-x-1 text-indigo-600">
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                </div>{/* end hidden md:block */}

                {/* Entry Details Modal */}
                {selectedEntry && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-200">
                            {/* Modal Header */}
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div className="flex flex-col">
                                    <h2 className="text-2xl font-black text-gray-900">Diário de Obra</h2>
                                    <div className="flex items-center gap-3 mt-1 text-sm font-bold text-gray-500">
                                        <Calendar className="w-4 h-4 text-indigo-500" />
                                        {new Date(selectedEntry.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        <WeatherIcon type={selectedEntry.weather} />
                                        <span>{selectedEntry.temperature || 'N/A'}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedEntry(null)}
                                    className="p-2 bg-white text-gray-400 hover:text-gray-900 rounded-xl border border-gray-100 shadow-sm transition-all hover:rotate-90"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    {/* Left Column: Description & Info */}
                                    <div className="space-y-8">
                                        <section>
                                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-3">Relato do Dia</h4>
                                            <div className="p-6 bg-indigo-50/30 border border-indigo-100 rounded-2xl">
                                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                                                    {selectedEntry.description}
                                                </p>
                                            </div>
                                        </section>

                                        {selectedEntry.impediments && (
                                            <section className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-4">
                                                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                                    <AlertCircle className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-red-800 text-sm mb-1 uppercase tracking-tight">Impedimento Detectado</h5>
                                                    <p className="text-xs text-red-600/80 font-medium">Existem fatores impedindo o curso normal das atividades programadas para este dia.</p>
                                                </div>
                                            </section>
                                        )}

                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 uppercase">
                                                <div className="text-[9px] font-black text-gray-400 uppercase mb-2">Mão de Obra</div>
                                                <div className="text-lg font-black text-gray-900">
                                                    {selectedEntry.labor?.reduce((acc, l) => acc + l.quantity, 0) || 0}
                                                    <span className="text-[10px] font-bold text-gray-400 ml-1 uppercase">Trabalhadores</span>
                                                </div>
                                            </div>
                                        </div>

                                        {selectedEntry.activities && selectedEntry.activities.length > 0 && (
                                            <section>
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Atividades Realizadas</h4>
                                                <div className="space-y-2">
                                                    {selectedEntry.activities.map((act, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                                <span className="text-xs font-bold text-gray-700">{act.description}</span>
                                                            </div>
                                                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{act.evolution}%</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}
                                    </div>

                                    {/* Right Column: Media & Documents */}
                                    <div className="space-y-8">
                                        <section>
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Galeria de Mídia</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                {(selectedEntry.images || []).map((img, idx) => (
                                                    <div key={idx} className="aspect-square rounded-2xl overflow-hidden border border-gray-100 group/img relative cursor-zoom-in">
                                                        <img src={img} alt="Obra" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                            <Camera className="w-6 h-6 text-white" />
                                                        </div>
                                                    </div>
                                                ))}
                                                {(selectedEntry.videos || []).map((vid, idx) => (
                                                    <div key={idx} className="aspect-square rounded-2xl bg-indigo-600 flex flex-col items-center justify-center gap-2 text-white cursor-pointer hover:bg-slate-900 transition-all group/vid">
                                                        <div className="p-3 bg-white/20 rounded-full group-hover/vid:scale-110 transition-transform">
                                                            <Video className="w-6 h-6" />
                                                        </div>
                                                        <span className="text-[9px] font-black tracking-widest">VER VÍDEO</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {(selectedEntry.images?.length === 0 && selectedEntry.videos?.length === 0) && (
                                                <div className="p-10 border-2 border-dashed border-gray-50 rounded-3xl flex flex-col items-center text-center">
                                                    <CameraIcon className="w-8 h-8 text-gray-100 mb-2" />
                                                    <span className="text-[10px] font-bold text-gray-300">NENHUMA MÍDIA ANEXADA</span>
                                                </div>
                                            )}
                                        </section>

                                        {selectedEntry.documents && selectedEntry.documents.length > 0 && (
                                            <section>
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Documentos Anexos</h4>
                                                <div className="space-y-3">
                                                    {selectedEntry.documents.map((doc, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={doc.url}
                                                            download={doc.name}
                                                            className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-white hover:border-indigo-200 transition-all group/doc"
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-2 bg-white text-indigo-600 rounded-xl shadow-sm group-hover/doc:bg-indigo-600 group-hover/doc:text-white transition-colors">
                                                                    <FileText className="w-5 h-5" />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-gray-800">{doc.name}</span>
                                                                    <span className="text-[9px] text-gray-400 font-extrabold uppercase">Documento • {doc.name.split('.').pop()?.toUpperCase()}</span>
                                                                </div>
                                                            </div>
                                                            <Download className="w-4 h-4 text-gray-300 group-hover/doc:text-indigo-600 transition-colors" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </section>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center">
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">Visualização do Cliente • Opura Platinum</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderDocumentos = () => {
        type ClientDoc = { name: string; category: string; url?: string; disabled?: boolean; isDummy?: boolean; date?: string };
        const displayDocs = currentClientDocs as ClientDoc[];
        const handleDownload = (doc: ClientDoc) => {
            if (!doc.url) {
                alert('Arquivo físico não encontrado no servidor. Verifique se o documento foi enviado corretamente.');
                return;
            }
            
            // Força o download criando um link temporário
            const link = document.createElement('a');
            link.href = doc.url;
            link.setAttribute('download', doc.name);
            link.setAttribute('target', '_blank');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                />

                {/* ══ MOBILE ══ */}
                <div className="md:hidden -mx-4">
                    {/* Mini hero */}
                    <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                        <h2 className="text-2xl font-black text-white leading-tight">Documentos</h2>
                        <p className="text-blue-200 text-sm font-medium mt-1">Arquivos compartilhados pelo gestor</p>
                    </div>
                    {/* Lista */}
                    <div className="px-4 -mt-3 pb-6 space-y-2">
                        {isAdmin && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest mb-3 active:scale-95 transition-transform"
                            >
                                <Plus className="w-4 h-4" /> Adicionar Documento
                            </button>
                        )}
                        {displayDocs.length === 0 ? (
                            <div className="flex flex-col items-center text-center py-10">
                                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-400 mb-3"><FileText className="w-7 h-7" /></div>
                                <p className="text-sm font-black text-gray-700 uppercase tracking-tight">Nenhum documento ainda</p>
                                <p className="text-xs text-gray-400 font-medium mt-1">Os arquivos compartilhados pelo gestor aparecerão aqui.</p>
                            </div>
                        ) : (
                            displayDocs.map((doc, i) => (
                                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-gray-900 truncate">{doc.name}</p>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{doc.category || 'Documento'}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDownload(doc)}
                                        className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0 active:scale-95 transition-transform"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ══ DESKTOP ══ */}
                <div className="hidden md:block bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Documentos do Projeto</h3>
                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        title="Visualização em Grade"
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        title="Visualização em Lista"
                                    >
                                        <Table2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Abaixo estão os documentos e propostas compartilhados pelo gestor.</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Documento
                            </button>
                        )}
                    </div>

                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                            {displayDocs.length > 0 ? (
                                displayDocs.map((doc, i) => (
                                    <div key={i}
                                        onClick={() => handleDownload(doc)}
                                        className={`group flex flex-col items-center p-8 rounded-[2rem] border border-gray-50 bg-gray-50/30 hover:bg-white hover:border-indigo-100 hover:shadow-2xl hover:shadow-indigo-100/30 transition-all cursor-pointer relative ${doc.disabled ? 'opacity-50' : ''}`}
                                    >
                                        {isAdmin && !doc.isDummy && (
                                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newName = prompt('Novo nome:', doc.name);
                                                        const newCat = prompt('Nova categoria:', doc.category);
                                                        if ((newName || newCat) && onUpdateSettings) {
                                                            const newDocs = currentClientDocs.map((d) =>
                                                                d === doc ? {
                                                                    ...d,
                                                                    name: newName || d.name,
                                                                    category: newCat || d.category,
                                                                    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                                } : d
                                                            );
                                                            if (clientProfile) {
                                                                updateClientData({ clientDocuments: newDocs });
                                                            } else {
                                                                onUpdateSettings({ ...settings, clientDocuments: newDocs });
                                                            }
                                                        }
                                                    }}
                                                    className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (await confirm({ title: 'Remover este documento?', variant: 'danger', confirmLabel: 'Remover' })) {
                                                            const newDocs = currentClientDocs.filter((d) => d !== doc);
                                                            if (clientProfile) {
                                                                updateClientData({ clientDocuments: newDocs });
                                                            } else {
                                                                onUpdateSettings?.({ ...settings, clientDocuments: newDocs });
                                                            }
                                                        }
                                                    }}
                                                    className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}

                                        {/* File Icon Block */}
                                        <div className="w-24 h-24 bg-blue-50/50 rounded-3xl flex items-center justify-center relative mb-6 group-hover:scale-110 transition-transform duration-500">
                                            <div className="p-5 bg-white rounded-2xl shadow-sm text-blue-500">
                                                <FileText className="w-10 h-10" />
                                            </div>
                                            {!doc.disabled && (
                                                <div className="absolute -bottom-2 -right-2 bg-indigo-600 p-2.5 rounded-2xl shadow-lg border-4 border-white text-white group-hover:rotate-12 transition-transform">
                                                    <Download className="w-3.5 h-3.5" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-center w-full px-2">
                                            <div className="text-sm font-black text-gray-900 tracking-tight mb-1 truncate uppercase">{doc.name}</div>
                                            <div className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full inline-block mb-2 ${doc.disabled ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors'}`}>
                                                {doc.category || 'DOCUMENTO'}
                                            </div>
                                            {doc.date && (
                                                <div className="text-[8px] font-bold text-gray-300 uppercase tracking-widest">Atualizado: {doc.date}</div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-100">
                                    <FileText className="w-16 h-16 text-gray-200 mb-6" />
                                    <p className="text-lg font-black text-gray-400 uppercase tracking-widest text-center">Nenhum documento compartilhado</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                        <th className="px-8 py-5">Nome do Arquivo</th>
                                        <th className="px-8 py-5">Categoria</th>
                                        <th className="px-8 py-5">Data de Atualização</th>
                                        <th className="px-8 py-5 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {displayDocs.length > 0 ? (
                                        displayDocs.map((doc, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                                                <td className="px-8 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-900 uppercase tracking-tight">{doc.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-4">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                                                        {doc.category || 'DOCUMENTO'}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4 text-xs font-bold text-gray-400 tabular-nums">
                                                    {doc.date || '--'}
                                                </td>
                                                <td className="px-8 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleDownload(doc)}
                                                            className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all"
                                                            title="Download"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                        {isAdmin && !doc.isDummy && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        const newName = prompt('Novo nome:', doc.name);
                                                                        const newCat = prompt('Nova categoria:', doc.category);
                                                                        if ((newName || newCat)) {
                                                                            const newDocs = currentClientDocs.map((d) =>
                                                                                d === doc ? {
                                                                                    ...d,
                                                                                    name: newName || d.name,
                                                                                    category: newCat || d.category,
                                                                                    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                                                } : d
                                                                            );
                                                                            if (clientProfile) {
                                                                                updateClientData({ clientDocuments: newDocs });
                                                                            } else if (onUpdateSettings) {
                                                                                onUpdateSettings({ ...settings, clientDocuments: newDocs });
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        if (await confirm({ title: 'Remover este documento?', variant: 'danger', confirmLabel: 'Remover' })) {
                                                                            const newDocs = currentClientDocs.filter((d) => d !== doc);
                                                                            if (clientProfile) {
                                                                                updateClientData({ clientDocuments: newDocs });
                                                                            } else if (onUpdateSettings) {
                                                                                onUpdateSettings({ ...settings, clientDocuments: newDocs });
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="py-10 text-center">
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nenhum documento compartilhado</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ─── Mobile Home (Tela 1) ────────────────────────────────────────────────────
    const renderMobileHome = () => {
        const finInfo = currentFinancialInfo;
        const allInsts = [
            ...(finInfo?.installments || []),
            ...globalClientInstallments,
        ];
        const uniqueInsts = Array.from(new Map(allInsts.filter(i => i.id).map(i => [i.id, i])).values());
        const totalPaid = uniqueInsts.filter(i => i.status === 'PAID').reduce((s, i) => s + i.value, 0);
        const totalValue = uniqueInsts.reduce((s, i) => s + i.value, 0) || finInfo?.totalValue || 0;
        const balanceRemaining = Math.max(0, totalValue - totalPaid);
        const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

        const daysLeft = settings.schedule?.endDate
            ? Math.max(0, Math.ceil((new Date(settings.schedule.endDate).getTime() - Date.now()) / 86400000))
            : null;
        const totalDays = settings.schedule?.startDate && settings.schedule?.endDate
            ? Math.max(1, Math.ceil((new Date(settings.schedule.endDate).getTime() - new Date(settings.schedule.startDate).getTime()) / 86400000))
            : null;
        const daysPct = (daysLeft !== null && totalDays !== null)
            ? Math.round(((totalDays - daysLeft) / totalDays) * 100)
            : null;

        const recentInsts = [...uniqueInsts]
            .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
            .slice(0, 4);

        // quick action tabs — usa `tabs` (já filtrado por enabledTabIds) excluindo dashboard
        const quickTabs = tabs.filter(t => t.id !== 'dashboard').slice(0, 4);

        return (
            <div className="space-y-0 -mx-4">
                {/* ── Gradient Hero ── */}
                <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-400 px-5 pt-3 pb-10">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5 max-w-[180px]">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest truncate">{settings.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">
                                <Bell className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-indigo-600 font-black text-sm shadow">
                                {(clientProfile?.name || settings.name).charAt(0)}
                            </div>
                        </div>
                    </div>

                    <h2 className="text-2xl font-black text-white leading-tight">
                        Olá, {clientProfile?.name?.split(' ')[0] || 'bem-vindo'}
                    </h2>
                    <p className="text-indigo-200 text-sm font-medium mt-1">Acompanhe sua obra em tempo real</p>

                    {/* Balance card flutuante */}
                    <div className="mt-5 bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1">Total Pago</p>
                                <p className="text-lg font-black text-white">
                                    R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                </p>
                            </div>
                            <div className="border-l border-white/20 pl-3">
                                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1">Saldo Restante</p>
                                <p className="text-lg font-black text-white">
                                    R$ {balanceRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                        {enabledTabIds.includes('financeiro') && (
                        <button
                            onClick={() => setActiveTab('financeiro')}
                            className="w-full py-2.5 bg-white text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            <Wallet className="w-3.5 h-3.5" />
                            Ver Financeiro
                            <ArrowRight className="w-3 h-3" />
                        </button>
                        )}
                    </div>
                </div>

                {/* ── Cards sobrepostos ao gradiente ── */}
                <div className="px-4 -mt-4 space-y-4">
                    {/* Card de progresso da obra */}
                    <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso da Obra</p>
                                <p className="text-sm font-black text-gray-900 mt-0.5 max-w-[160px] truncate">
                                    {settings.obraPhase || 'Em andamento'}
                                </p>
                            </div>
                            {daysLeft !== null && (
                                <div className="text-right bg-indigo-50 rounded-xl px-3 py-1.5 border border-indigo-100">
                                    <p className="text-base font-black text-indigo-600">{daysLeft}</p>
                                    <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">dias</p>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Donut */}
                            <div className="relative shrink-0" style={{ width: 110, height: 110 }}>
                                <ResponsiveContainer width={110} height={110}>
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { value: calculatedProgress },
                                                { value: Math.max(0, 100 - calculatedProgress) },
                                            ]}
                                            cx={50} cy={50}
                                            innerRadius={35} outerRadius={50}
                                            startAngle={90} endAngle={-270}
                                            dataKey="value"
                                            strokeWidth={0}
                                        >
                                            <Cell fill="#6366f1" />
                                            <Cell fill="#e0e7ff" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-black text-indigo-600 leading-none">{calculatedProgress}%</span>
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wide mt-0.5">obra</span>
                                </div>
                            </div>

                            {/* Barras de sub-métricas */}
                            <div className="flex-1 space-y-3">
                                {daysPct !== null && (
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Prazo</span>
                                            <span className="text-[9px] font-black text-indigo-500">{daysPct}%</span>
                                        </div>
                                        <div className="w-full bg-indigo-50 rounded-full h-1.5">
                                            <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${daysPct}%` }} />
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Financeiro</span>
                                        <span className="text-[9px] font-black text-emerald-500">{paidPct}%</span>
                                    </div>
                                    <div className="w-full bg-emerald-50 rounded-full h-1.5">
                                        <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${paidPct}%` }} />
                                    </div>
                                </div>
                                {plannedProgress > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Planejado</span>
                                            <span className="text-[9px] font-black text-blue-400">{plannedProgress}%</span>
                                        </div>
                                        <div className="w-full bg-blue-50 rounded-full h-1.5">
                                            <div className="bg-blue-300 h-1.5 rounded-full" style={{ width: `${plannedProgress}%` }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Quick Actions ── */}
                    <div className="grid grid-cols-4 gap-2">
                        {quickTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className="flex flex-col items-center gap-2 py-3 px-2 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition-all"
                            >
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    {tab.icon}
                                </div>
                                <span className="text-[8px] font-black text-gray-500 uppercase tracking-wide text-center leading-tight line-clamp-1">
                                    {tab.label.split(' ')[0]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* ── Atividade Recente ── */}
                    {recentInsts.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                                <p className="text-sm font-black text-gray-900">Atividade Recente</p>
                                <button
                                    onClick={() => setActiveTab('financeiro')}
                                    className="flex items-center gap-1 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
                                >
                                    Ver tudo <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {recentInsts.map(inst => {
                                    const isPaid = inst.status === 'PAID';
                                    const isOverdue = !isPaid && new Date(inst.dueDate + 'T12:00:00') < new Date();
                                    return (
                                        <div key={inst.id} className="flex items-center gap-3 px-5 py-3.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPaid ? 'bg-emerald-50' : isOverdue ? 'bg-red-50' : 'bg-amber-50'}`}>
                                                <DollarSign className={`w-4 h-4 ${isPaid ? 'text-emerald-500' : isOverdue ? 'text-red-400' : 'text-amber-400'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-gray-900 truncate">{inst.description}</p>
                                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                                                    {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-black text-gray-900">
                                                    R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                                </p>
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isPaid ? 'bg-emerald-50 text-emerald-600' : isOverdue ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                                    {isPaid ? 'Pago' : isOverdue ? 'Vencido' : 'Pendente'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ─── Mobile Financeiro (Tela 2 + 3) ─────────────────────────────────────────
    const renderMobileFinanceiro = () => {
        const finInfo = currentFinancialInfo;
        const allInsts = Array.from(
            new Map([...(finInfo?.installments || []), ...globalClientInstallments]
                .filter(i => i.id).map(i => [i.id, i])).values()
        );
        const totalPaid = allInsts.filter(i => i.status === 'PAID').reduce((s, i) => s + i.value, 0);
        const totalValue = allInsts.reduce((s, i) => s + i.value, 0) || finInfo?.totalValue || 0;
        const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;
        const pendingInsts = allInsts.filter(i => i.status !== 'PAID');
        const paidInsts = allInsts.filter(i => i.status === 'PAID');

        // Monta série mensal para o gráfico de área
        const monthlyMap: Record<string, { mes: string; pago: number; total: number }> = {};
        allInsts.forEach(inst => {
            const d = new Date(inst.dueDate + 'T12:00:00');
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
            if (!monthlyMap[key]) monthlyMap[key] = { mes: label, pago: 0, total: 0 };
            monthlyMap[key].total += inst.value;
            if (inst.status === 'PAID') monthlyMap[key].pago += inst.value;
        });
        const chartData = Object.entries(monthlyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6)
            .map(([, v]) => v);

        const [mobileFinTab, setMobileFinTab] = React.useState<'detalhe' | 'historico'>('detalhe');

        return (
            <div className="-mx-4 space-y-0">
                {/* ── Header com donut grande ── */}
                <div className="bg-gradient-to-br from-indigo-600 to-blue-500 px-5 pt-4 pb-8">
                    <div className="flex items-center gap-3 mb-5">
                        <button onClick={() => setActiveTab('dashboard')} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">
                            <ChevronRight className="w-4 h-4 rotate-180" />
                        </button>
                        <p className="text-white font-black text-base uppercase tracking-widest">Financeiro</p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Valor Total</p>
                            <p className="text-3xl font-black text-white mt-1">
                                R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                            </p>
                            {finInfo?.paymentMethod && (
                                <p className="text-[10px] text-indigo-200 font-bold mt-1 uppercase">{finInfo.paymentMethod}</p>
                            )}
                        </div>
                        {/* Donut grande */}
                        <div className="relative" style={{ width: 110, height: 110 }}>
                            <ResponsiveContainer width={110} height={110}>
                                <PieChart>
                                    <Pie
                                        data={[
                                            { value: paidPct },
                                            { value: Math.max(0, 100 - paidPct) },
                                        ]}
                                        cx={50} cy={50}
                                        innerRadius={36} outerRadius={52}
                                        startAngle={90} endAngle={-270}
                                        dataKey="value"
                                        strokeWidth={0}
                                    >
                                        <Cell fill="#ffffff" />
                                        <Cell fill="rgba(255,255,255,0.2)" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-black text-white leading-none">{paidPct}%</span>
                                <span className="text-[8px] font-black text-indigo-200 uppercase tracking-wide mt-0.5">pago</span>
                            </div>
                        </div>
                    </div>

                    {/* Sub-métricas */}
                    <div className="grid grid-cols-2 gap-3 mt-5">
                        <div className="bg-white/15 rounded-2xl p-3 border border-white/20">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Parcelas Pagas</p>
                            </div>
                            <p className="text-lg font-black text-white">{paidInsts.length}</p>
                            <div className="mt-2 w-full bg-white/20 rounded-full h-1.5">
                                <div className="bg-emerald-300 h-1.5 rounded-full" style={{ width: `${allInsts.length > 0 ? (paidInsts.length / allInsts.length) * 100 : 0}%` }} />
                            </div>
                            <p className="text-[8px] text-indigo-200 font-bold mt-1">{paidInsts.length}/{allInsts.length} total</p>
                        </div>
                        <div className="bg-white/15 rounded-2xl p-3 border border-white/20">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-3.5 h-3.5 text-amber-300" />
                                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Pendentes</p>
                            </div>
                            <p className="text-lg font-black text-white">{pendingInsts.length}</p>
                            <div className="mt-2 w-full bg-white/20 rounded-full h-1.5">
                                <div className="bg-amber-300 h-1.5 rounded-full" style={{ width: `${allInsts.length > 0 ? (pendingInsts.length / allInsts.length) * 100 : 0}%` }} />
                            </div>
                            <p className="text-[8px] text-indigo-200 font-bold mt-1">
                                R$ {(totalValue - totalPaid).toLocaleString('pt-BR', { minimumFractionDigits: 0 })} restante
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Tabs Detalhe / Histórico ── */}
                <div className="-mt-3 mx-4">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                        <div className="flex border-b border-gray-100">
                            {(['detalhe', 'historico'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setMobileFinTab(t)}
                                    className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all
                                        ${mobileFinTab === t ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                                >
                                    {t === 'detalhe' ? 'Parcelas' : 'Histórico'}
                                </button>
                            ))}
                        </div>

                        {mobileFinTab === 'detalhe' && (
                            <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                                {allInsts.length === 0 ? (
                                    <div className="flex flex-col items-center py-12 text-gray-300">
                                        <DollarSign className="w-10 h-10 mb-3" />
                                        <p className="text-xs font-black uppercase tracking-widest">Nenhuma parcela</p>
                                    </div>
                                ) : [...allInsts].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(inst => {
                                    const isPaid = inst.status === 'PAID';
                                    const isOverdue = !isPaid && new Date(inst.dueDate + 'T12:00:00') < new Date();
                                    return (
                                        <div key={inst.id} className="flex items-center gap-3 px-5 py-4">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPaid ? 'bg-emerald-50' : isOverdue ? 'bg-red-50' : 'bg-amber-50'}`}>
                                                <DollarSign className={`w-4 h-4 ${isPaid ? 'text-emerald-500' : isOverdue ? 'text-red-400' : 'text-amber-400'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-gray-900 truncate">{inst.description}</p>
                                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                                                    Venc. {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-black text-gray-900">
                                                    R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                                </p>
                                                <span className={`inline-block mt-0.5 text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${isPaid ? 'bg-emerald-50 text-emerald-600' : isOverdue ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                                    {isPaid ? 'Pago' : isOverdue ? 'Vencido' : 'Pendente'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {mobileFinTab === 'historico' && (
                            <div className="p-5">
                                {chartData.length < 2 ? (
                                    <div className="flex flex-col items-center py-12 text-gray-300">
                                        <TrendingUp className="w-10 h-10 mb-3" />
                                        <p className="text-xs font-black uppercase tracking-widest">Histórico insuficiente</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-xs font-black text-gray-900">Pagamentos por Mês</p>
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Últimos 6 meses</span>
                                        </div>
                                        <ResponsiveContainer width="100%" height={160}>
                                            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="gradPago" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="mes" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                                <YAxis hide />
                                                <RechartsTooltip
                                                    formatter={(v: unknown) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, 'Pago']}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 700 }}
                                                />
                                                <Area type="monotone" dataKey="pago" stroke="#6366f1" strokeWidth={2} fill="url(#gradPago)" dot={{ fill: '#6366f1', strokeWidth: 0, r: 3 }} activeDot={{ r: 5 }} />
                                            </AreaChart>
                                        </ResponsiveContainer>

                                        {/* Legenda / sumário */}
                                        <div className="grid grid-cols-3 gap-3 mt-5">
                                            {[
                                                { label: 'Total Pago', value: `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: 'text-indigo-600' },
                                                { label: 'Pagas', value: `${paidInsts.length} parcelas`, color: 'text-emerald-600' },
                                                { label: 'Pendentes', value: `${pendingInsts.length} parcelas`, color: 'text-amber-500' },
                                            ].map(item => (
                                                <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <p className={`text-sm font-black ${item.color}`}>{item.value}</p>
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{item.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ALL_TABS = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'jornada', label: 'Minha Jornada', icon: <Calendar className="w-4 h-4" /> },
        { id: 'obra', label: 'Obra', icon: <HardHat className="w-4 h-4" /> },
        { id: 'visual', label: 'Visual', icon: <Camera className="w-4 h-4" /> },
        { id: 'personalizacao', label: 'Personalização', icon: <Palette className="w-4 h-4" /> },
        { id: 'diario', label: 'Diário de Obra', icon: <BookOpen className="w-4 h-4" /> },
        { id: 'documentos', label: 'Documentos', icon: <FileText className="w-4 h-4" /> },
        { id: 'contratos', label: 'Contratos', icon: <FileText className="w-4 h-4" /> },
        { id: 'financeiro', label: 'Financeiro', icon: <DollarSign className="w-4 h-4" /> },
        { id: 'suporte', label: 'Suporte', icon: <ShieldCheck className="w-4 h-4" /> },
        { id: 'manutencao', label: 'Manutenção', icon: <Wrench className="w-4 h-4" /> },
    ];

    const CATEGORY_TAB_PRESETS: Record<string, string[]> = {
        'Vendas':   ['dashboard', 'jornada', 'obra', 'visual', 'personalizacao', 'diario', 'documentos', 'contratos', 'financeiro', 'suporte'],
        'Locação':  ['dashboard', 'obra', 'financeiro', 'contratos', 'documentos', 'manutencao'],
        'Serviços': ['dashboard', 'obra', 'financeiro', 'contratos', 'documentos'],
    };

    const clientCategory = clientProfile?.category ?? '';
    const categoryPreset = CATEGORY_TAB_PRESETS[clientCategory];

    const enabledTabIds = settings.clientPortalTabs && settings.clientPortalTabs.length > 0
        ? settings.clientPortalTabs
        : (categoryPreset ?? ALL_TABS.map(t => t.id));

    // tabs visíveis para o cliente (mobile + client desktop)
    const tabs = ALL_TABS.filter(t => enabledTabIds.includes(t.id));
    // admin vê todas no desktop para poder configurar; cliente vê só as habilitadas
    const desktopNavTabs = isAdmin ? ALL_TABS : tabs;

    const toggleTabVisibility = (tabId: string) => {
        if (!onUpdateSettings) return;
        const current = settings.clientPortalTabs && settings.clientPortalTabs.length > 0
            ? settings.clientPortalTabs
            : ALL_TABS.map(t => t.id);
        const next = current.includes(tabId)
            ? current.filter(id => id !== tabId)
            : [...current, tabId];
        onUpdateSettings({ ...settings, clientPortalTabs: next });
    };

    if (isAdmin && !clientProfile) {
        return (
            <div className="min-h-screen bg-gray-50/30 lg:p-8 p-4">
                <ClientList onSelectClient={onClientSelect} organizationId={organizationId ?? undefined} />
            </div>
        );
    }

    return (
        <div className="portal-mobile-font min-h-screen bg-gray-50/30 pb-24 md:pb-0 space-y-4 md:space-y-8">
            {/* Prévia Mobile — renderiza o portal como o cliente vê, dentro de um iframe estreito */}
            {showMobilePreview && !isPreview && (
                <MobilePreviewFrame onClose={() => setShowMobilePreview(false)} title="Prévia — Portal do Cliente">
                    <ClientArea
                        settings={settings}
                        budget={budget}
                        profile={profile}
                        clientProfile={clientProfile}
                        organizationId={organizationId}
                        onClientSelect={onClientSelect}
                        isPreview
                    />
                </MobilePreviewFrame>
            )}

            {/* Main Header — escondido no mobile quando dashboard tem hero próprio (Locação/Serviços) */}
            <div className={`bg-white md:rounded-3xl p-4 md:p-10 shadow-sm border-b md:border border-gray-100 relative overflow-hidden ${activeTab === 'dashboard' && (clientCategory === 'Locação' || clientCategory === 'Serviços') ? 'hidden md:block' : ''}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                <div className="relative flex items-center justify-between gap-4">
                    {/* Avatar + greeting */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 md:w-14 md:h-14 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-lg md:text-2xl shadow-lg shadow-indigo-100 shrink-0">
                            {(clientProfile?.name || settings.name).charAt(0)}
                        </div>
                        <div>
                            <h1 className="text-lg md:text-3xl font-black text-gray-900 tracking-tight leading-tight">
                                {clientProfile?.name
                                    ? (clientCategory === 'Locação' || clientCategory === 'Serviços')
                                        ? clientProfile.name.split(' ')[0]
                                        : `Olá, ${clientProfile.name.split(' ')[0]}`
                                    : 'Área do Cliente'}
                            </h1>
                            <p className="text-xs md:text-sm font-medium text-gray-400">
                                {clientCategory === 'Locação' ? 'Locação' : clientCategory === 'Serviços' ? 'Serviços' : 'Bem-vindo à sua área exclusiva'}
                            </p>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Notification bell — portal real only */}
                        {portalToken && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowNotifications(n => !n)}
                                    className="relative p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 transition-all shadow-sm"
                                    title="Notificações"
                                >
                                    <Bell className="w-4 h-4" />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>
                                {/* Notification dropdown */}
                                {showNotifications && (
                                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                            <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Notificações</span>
                                            {unreadCount > 0 && portalToken && (
                                                <button
                                                    onClick={async () => {
                                                        await clientMessagesService.markAllReadByToken(portalToken).catch(console.error);
                                                        setPortalMessages(prev => prev.map(m => ({ ...m, is_read: true })));
                                                        setUnreadCount(0);
                                                    }}
                                                    className="text-[9px] font-black text-orange-500 uppercase tracking-widest hover:underline"
                                                >
                                                    Marcar todas lidas
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                                            {portalMessages.length === 0 ? (
                                                <div className="py-10 text-center">
                                                    <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                                    <p className="text-xs font-bold text-gray-400">Nenhuma notificação</p>
                                                </div>
                                            ) : portalMessages.map(msg => (
                                                <button
                                                    key={msg.id}
                                                    onClick={async () => {
                                                        if (!msg.is_read && portalToken) {
                                                            await clientMessagesService.markReadByToken(portalToken, msg.id).catch(console.error);
                                                            setPortalMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
                                                            setUnreadCount(n => Math.max(0, n - 1));
                                                        }
                                                    }}
                                                    className={`w-full text-left px-5 py-4 transition-colors hover:bg-gray-50 ${!msg.is_read ? 'bg-orange-50/40' : ''}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${!msg.is_read ? 'bg-orange-400' : 'bg-gray-200'}`} />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-black text-gray-900 leading-tight truncate">{msg.title}</p>
                                                            {msg.body && <p className="text-[10px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{msg.body}</p>}
                                                            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1">{new Date(msg.created_at).toLocaleDateString('pt-BR')} · {msg.sender_name}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {clientProfile && (
                            <button
                                onClick={() => { setMeusDadosForm({ ...clientProfile }); setShowMeusDados(true); }}
                                className="flex items-center gap-2 px-3 py-2 md:px-5 md:py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95"
                            >
                                <UserCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">Meus Dados</span>
                            </button>
                        )}
                        {isAdmin && clientProfile && (
                            <button
                                onClick={() => setShowMobilePreview(true)}
                                title="Visualizar como o cliente vê no celular"
                                className="hidden md:flex p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                            >
                                <Smartphone className="w-4 h-4" />
                            </button>
                        )}
                        {isAdmin && onUpdateSettings && (
                            <button
                                onClick={() => setShowTabConfig(true)}
                                title="Configurar abas"
                                className="p-2 md:p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                            >
                                <Settings2 className="w-4 h-4" />
                            </button>
                        )}
                        {isAdmin && clientProfile && (
                            <button
                                onClick={() => onClientSelect?.(null!)}
                                className="hidden md:flex items-center gap-2 px-4 py-3 bg-gray-100 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-transparent hover:border-indigo-200"
                            >
                                <Users className="w-4 h-4" />
                                Trocar Cliente
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Meus Dados */}
            {showMeusDados && clientProfile && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowMeusDados(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <UserCircle className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Meus Dados</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Informações cadastrais</p>
                                </div>
                            </div>
                            <button onClick={() => setShowMeusDados(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-8 space-y-5">
                            {/* Nome */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nome completo</label>
                                <div className="relative">
                                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input
                                        type="text"
                                        value={meusDadosForm.name || ''}
                                        onChange={e => setMeusDadosForm(f => ({ ...f, name: e.target.value }))}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* E-mail */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">E-mail</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="email"
                                            value={meusDadosForm.email || ''}
                                            onChange={e => setMeusDadosForm(f => ({ ...f, email: e.target.value }))}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>
                                {/* Telefone */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Telefone</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="tel"
                                            value={meusDadosForm.phone || ''}
                                            onChange={e => setMeusDadosForm(f => ({ ...f, phone: e.target.value }))}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* CPF/CNPJ */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                    {meusDadosForm.type === 'PJ' ? 'CNPJ' : 'CPF'}
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input
                                        type="text"
                                        value={meusDadosForm.document || ''}
                                        onChange={e => setMeusDadosForm(f => ({ ...f, document: e.target.value }))}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-5">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Home className="w-3.5 h-3.5" /> Endereço
                                </p>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Logradouro</label>
                                            <input
                                                type="text"
                                                placeholder="Rua / Av."
                                                value={meusDadosForm.address || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, address: e.target.value }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Número</label>
                                            <input
                                                type="text"
                                                value={meusDadosForm.address_number || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, address_number: e.target.value }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Bairro</label>
                                            <input
                                                type="text"
                                                value={meusDadosForm.neighborhood || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, neighborhood: e.target.value }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">CEP</label>
                                            <input
                                                type="text"
                                                value={meusDadosForm.zip_code || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, zip_code: e.target.value }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cidade</label>
                                            <input
                                                type="text"
                                                value={meusDadosForm.city || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, city: e.target.value }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Estado</label>
                                            <input
                                                type="text"
                                                maxLength={2}
                                                placeholder="UF"
                                                value={meusDadosForm.state || ''}
                                                onChange={e => setMeusDadosForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-8 pb-8">
                            <button
                                disabled={savingDados}
                                onClick={async () => {
                                    if (!clientProfile) return;
                                    setSavingDados(true);
                                    try {
                                        await clientService.saveClient({ id: clientProfile.id, ...meusDadosForm });
                                        onClientSelect?.({ ...clientProfile, ...meusDadosForm } as Client);
                                        setShowMeusDados(false);
                                    } catch (err) {
                                        console.error(err);
                                        alert('Erro ao salvar dados. Tente novamente.');
                                    } finally {
                                        setSavingDados(false);
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95"
                            >
                                <Save className="w-4 h-4" />
                                {savingDados ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Navigation Tabs */}
            <div className="hidden md:flex items-center gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2 md:gap-4 p-1.5 bg-white border border-gray-100 rounded-2xl shadow-sm">
                    {desktopNavTabs.map(tab => {
                        const isVisible = enabledTabIds.includes(tab.id);
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`
                                    flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300
                                    ${activeTab === tab.id
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105'
                                        : isAdmin && !isVisible
                                            ? 'text-gray-300 hover:bg-gray-50 hover:text-gray-400 opacity-50'
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                    }
                                `}
                            >
                                {tab.icon}
                                {tab.label}
                                {isAdmin && !isVisible && <EyeOff className="w-3 h-3 ml-1 text-gray-300" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Bottom Navigation — máx. 5 slots; excedente vai pro sheet "Mais" */}
            {(() => {
                const MAX_BAR = 5;
                const hasMore = tabs.length > MAX_BAR;
                const barTabs = hasMore ? tabs.slice(0, MAX_BAR - 1) : tabs;
                const moreTabs = hasMore ? tabs.slice(MAX_BAR - 1) : [];
                const moreActive = moreTabs.some(t => t.id === activeTab);
                return (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                        <div className="flex">
                            {barTabs.map(tab => {
                                const isActive = activeTab === tab.id;
                                const isVisible = enabledTabIds.includes(tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                        className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                            ${isActive ? 'text-blue-600' : isAdmin && !isVisible ? 'text-gray-200' : 'text-gray-400'}
                                        `}
                                    >
                                        {isActive && (
                                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
                                        )}
                                        <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                                            {tab.icon}
                                        </span>
                                        <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                            {tab.label.split(' ')[0]}
                                        </span>
                                        {isAdmin && !isVisible && <EyeOff className="w-2 h-2 absolute top-2 right-2 text-gray-200" />}
                                    </button>
                                );
                            })}
                            {hasMore && (
                                <button
                                    onClick={() => setShowMoreSheet(true)}
                                    className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                        ${moreActive ? 'text-blue-600' : 'text-gray-400'}
                                    `}
                                >
                                    {moreActive && (
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
                                    )}
                                    <span className={`transition-transform duration-200 ${moreActive ? 'scale-110' : ''}`}>
                                        <MoreHorizontal className="w-4 h-4" />
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                        Mais
                                    </span>
                                </button>
                            )}
                        </div>
                        {/* Safe area for iOS home indicator */}
                        <div className="h-safe-area-inset-bottom bg-white" style={{ height: 'env(safe-area-inset-bottom)' }} />
                    </div>
                );
            })()}

            {/* Bottom-sheet "Mais" — abas excedentes (somente mobile) */}
            {showMoreSheet && (() => {
                const MAX_BAR = 5;
                const moreTabs = tabs.length > MAX_BAR ? tabs.slice(MAX_BAR - 1) : [];
                return (
                    <div className="md:hidden fixed inset-0 z-[200]" onClick={() => setShowMoreSheet(false)}>
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
                        <div
                            className="absolute bottom-0 inset-x-0 bg-white rounded-t-[2rem] shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center mb-4">Mais opções</p>
                            <div className="space-y-2">
                                {moreTabs.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    const isVisible = enabledTabIds.includes(tab.id);
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => { setActiveTab(tab.id as typeof activeTab); setShowMoreSheet(false); }}
                                            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                                                isActive
                                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                            }`}
                                        >
                                            <span className={isActive ? 'text-blue-500' : 'text-gray-400'}>{tab.icon}</span>
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                            {isAdmin && !isVisible && <EyeOff className="w-3.5 h-3.5 ml-auto text-gray-300" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tab Visibility Config Modal */}
            {showTabConfig && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowTabConfig(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <Settings2 className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Portal do Cliente</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Abas visíveis para o cliente</p>
                                </div>
                            </div>
                            <button onClick={() => setShowTabConfig(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-3">
                            {ALL_TABS.map(tab => {
                                const isVisible = enabledTabIds.includes(tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => toggleTabVisibility(tab.id)}
                                        className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                                            isVisible
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                : 'bg-gray-50 border-gray-100 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={isVisible ? 'text-indigo-500' : 'text-gray-300'}>{tab.icon}</span>
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                        </div>
                                        <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isVisible ? 'text-indigo-500' : 'text-gray-300'}`}>
                                            {isVisible ? <><Eye className="w-3.5 h-3.5" /> Visível</> : <><EyeOff className="w-3.5 h-3.5" /> Oculta</>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-8 pb-8">
                            <p className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-widest">
                                Clique em cada aba para alternar visibilidade do cliente
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Content */}
            <div className="min-h-[500px] px-4 md:px-0">
                {activeTab === 'dashboard' && clientCategory === 'Locação' && renderDashboardLocacao()}
                {activeTab === 'dashboard' && clientCategory === 'Serviços' && renderDashboardServicos()}
                {activeTab === 'dashboard' && clientCategory !== 'Locação' && clientCategory !== 'Serviços' && (
                    <>
                        {/* Mobile: nova home estilo telecom */}
                        <div className="md:hidden">
                            {renderMobileHome()}
                        </div>
                        {/* Desktop: dashboard original */}
                        <div className="hidden md:block">
                            <div className="space-y-10">
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                    <div className="lg:col-span-3">{renderDashboard()}</div>
                                    <div className="lg:col-span-1">
                                        {aiInsight && (
                                            <div className="sticky top-8 space-y-6">
                                                <div className="flex items-center gap-2 mb-4 px-2">
                                                    <Sparkles className="w-4 h-4 text-indigo-500" />
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Concierge Digital</span>
                                                </div>
                                                <AIInsightCard
                                                    title={aiInsight.title}
                                                    content={aiInsight.message}
                                                    type={aiInsight.type === 'alert' ? 'warning' : aiInsight.type === 'emotional' ? 'success' : 'info'}
                                                    onAction={() => setActiveTab(aiInsight.actionable?.target as typeof activeTab)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                {activeTab === 'jornada' && renderJornada()}
                {activeTab === 'obra' && renderObra()}
                {activeTab === 'personalizacao' && <FinishSelection />}
                {activeTab === 'visual' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Visão Real da Obra</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Acompanhe fotos em alta resolução e câmeras ao vivo do canteiro.</p>
                            </div>
                        </div>
                        <ProjectGallery
                            images={clientProfile?.visualGallery || []}
                            isAdmin={isAdmin}
                            onPhotosUpdate={async (newPhotos) => {
                                return await updateClientData({ visualGallery: newPhotos });
                            }}
                        />

                        {/* Render vs Reality Comparison */}
                        <div className="mt-16 space-y-8">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                                <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">O Sonho vs A Realidade</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="relative group overflow-hidden rounded-[2.5rem] border border-gray-100 shadow-sm bg-white">
                                    <div className="absolute top-6 left-6 z-20 px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl text-[10px] font-black text-white uppercase tracking-widest">Projeto 3D</div>
                                    <img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=800" alt="Render" className="w-full aspect-video object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700" />
                                </div>
                                <div className="relative group overflow-hidden rounded-[2.5rem] border border-gray-100 shadow-sm bg-white border-dashed">
                                    <div className="absolute top-6 left-6 z-20 px-4 py-2 bg-indigo-600 rounded-xl text-[10px] font-black text-white uppercase tracking-widest">Obra Real</div>
                                    <img src="https://images.unsplash.com/photo-1541888946425-d81bb19480c5?auto=format&fit=crop&q=80&w=800" alt="Real" className="w-full aspect-video object-cover" />
                                    <div className="absolute inset-0 bg-white/10" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'diario' && renderDiario()}
                {activeTab === 'documentos' && renderDocumentos()}
                {activeTab === 'contratos' && renderContratos()}
                {activeTab === 'financeiro' && (
                    <>
                        {clientCategory === 'Locação' && renderFinanceiroLocacao()}
                        {clientCategory === 'Serviços' && renderFinanceiroServicos()}
                        {clientCategory !== 'Locação' && clientCategory !== 'Serviços' && (
                            <>
                                <div className="md:hidden">{renderMobileFinanceiro()}</div>
                                <div className="hidden md:block">{renderFinanceiro()}</div>
                            </>
                        )}
                    </>
                )}
                {activeTab === 'suporte' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* ══ MOBILE ══ */}
                        <div className="md:hidden -mx-4">
                            <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-5 pt-4 pb-8">
                                <h2 className="text-2xl font-black text-white leading-tight">Suporte</h2>
                                <p className="text-blue-200 text-sm font-medium mt-1">Assistência e pós-obra</p>
                            </div>
                            <div className="px-4 -mt-3 pb-6">
                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center">
                                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-4">
                                        <ShieldCheck className="w-7 h-7" />
                                    </div>
                                    <p className="text-sm font-black text-gray-700 uppercase tracking-tight mb-2">Assistência e Pós-Obra</p>
                                    <p className="text-xs text-gray-400 font-medium max-w-[260px]">Disponível após a entrega das chaves para abertura de chamados técnicos e garantia.</p>
                                    <span className="mt-4 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Em breve</span>
                                </div>
                            </div>
                        </div>
                        {/* ══ DESKTOP ══ */}
                        <div className="hidden md:flex bg-white p-12 rounded-[2.5rem] border border-gray-100 flex-col items-center text-center">
                            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6">
                                <ShieldCheck className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Assistência e Pós-Obra</h3>
                            <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">Este módulo estará disponível após a entrega das chaves para abertura de chamados técnicos e garantia.</p>
                            <button className="px-8 py-4 bg-gray-100 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
                                Abrir Chamado (Em breve)
                            </button>
                        </div>
                    </div>
                )}
                {activeTab === 'manutencao' && (() => {
                    const abertos    = clientRequests.filter(r => r.status === 'Aberto').length;
                    const emAndamento = clientRequests.filter(r => r.status === 'Em Andamento').length;
                    const resolvidos  = clientRequests.filter(r => r.status === 'Resolvido').length;
                    const PRIORITY_COLOR: Record<string, string> = { Urgente: 'bg-red-100 text-red-600', Alta: 'bg-orange-100 text-orange-600', Média: 'bg-amber-100 text-amber-700', Baixa: 'bg-gray-100 text-gray-500' };
                    const STATUS_COLOR: Record<string, string> = { Aberto: 'bg-amber-100 text-amber-700', 'Em Andamento': 'bg-blue-100 text-blue-700', Aguardando: 'bg-purple-100 text-purple-700', Resolvido: 'bg-emerald-100 text-emerald-700', Cancelado: 'bg-gray-100 text-gray-400' };
                    return (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                                    <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Manutenção do Imóvel</h3>
                                </div>
                                <button
                                    onClick={() => setShowNewRequestForm(true)}
                                    className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-100 active:scale-95"
                                >
                                    <Plus className="w-4 h-4" /> Abrir Chamado
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'Abertos', value: abertos, icon: <Wrench className="w-5 h-5" />, cls: 'bg-amber-50 text-amber-500' },
                                    { label: 'Em Andamento', value: emAndamento, icon: <Clock className="w-5 h-5" />, cls: 'bg-blue-50 text-blue-500' },
                                    { label: 'Resolvidos', value: resolvidos, icon: <CheckCircle2 className="w-5 h-5" />, cls: 'bg-emerald-50 text-emerald-500' },
                                ].map(card => (
                                    <div key={card.label} className="bg-white border border-gray-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.cls}`}>{card.icon}</div>
                                        <div>
                                            <p className="text-3xl font-black text-gray-900">{card.value}</p>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {requestsLoading ? (
                                <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
                            ) : clientRequests.length === 0 ? (
                                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-12 flex flex-col items-center text-center shadow-sm">
                                    <Wrench className="w-12 h-12 text-gray-200 mb-4" />
                                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Nenhum chamado aberto</p>
                                    <p className="text-xs text-gray-400 mt-1">Clique em "Abrir Chamado" para solicitar manutenção</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {clientRequests.map(req => (
                                        <div key={req.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-amber-200 transition-all">
                                            <div className="flex flex-col gap-1.5 min-w-0">
                                                <span className="text-sm font-black text-gray-900 uppercase tracking-tight">{req.title}</span>
                                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>{req.category}</span>
                                                    <span>·</span>
                                                    <span>{new Date(req.opened_at + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                    {req.assigned_to && <><span>·</span><span>{req.assigned_to}</span></>}
                                                </div>
                                                {req.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{req.description}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${PRIORITY_COLOR[req.priority] ?? 'bg-gray-100 text-gray-500'}`}>{req.priority}</span>
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-400'}`}>{req.status}</span>
                                                {isAdmin && (
                                                    <select
                                                        value={req.status}
                                                        onChange={async e => {
                                                            const newStatus = e.target.value as ClientRequest['status'];
                                                            await clientRequestsService.updateRequest(req.id, { status: newStatus, resolved_at: newStatus === 'Resolvido' ? new Date().toISOString().split('T')[0] : undefined });
                                                            setClientRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: newStatus } : r));
                                                        }}
                                                        className="text-[9px] font-black uppercase bg-gray-50 border border-gray-200 rounded-xl px-2 py-1 cursor-pointer"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        {['Aberto','Em Andamento','Aguardando','Resolvido','Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Modal: novo chamado */}
                            {showNewRequestForm && (
                                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowNewRequestForm(false)}>
                                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                                    <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg animate-in zoom-in-95 fade-in duration-200" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between p-7 border-b border-gray-100">
                                            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Novo Chamado de Manutenção</h2>
                                            <button onClick={() => setShowNewRequestForm(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"><X className="w-5 h-5" /></button>
                                        </div>
                                        <div className="p-7 space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Título *</label>
                                                <input type="text" value={newRequestForm.title} onChange={e => setNewRequestForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Torneira com vazamento" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-amber-400" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Categoria</label>
                                                    <select value={newRequestForm.category} onChange={e => setNewRequestForm(f => ({ ...f, category: e.target.value }))} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-amber-400">
                                                        {['Elétrica','Hidráulica','Estrutural','Pintura','Serralheria','Geral','Outro'].map(c => <option key={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Prioridade</label>
                                                    <select value={newRequestForm.priority} onChange={e => setNewRequestForm(f => ({ ...f, priority: e.target.value }))} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-amber-400">
                                                        {['Baixa','Média','Alta','Urgente'].map(p => <option key={p}>{p}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Descrição</label>
                                                <textarea value={newRequestForm.description} onChange={e => setNewRequestForm(f => ({ ...f, description: e.target.value }))} placeholder="Descreva o problema com detalhes..." rows={3} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:border-amber-400 resize-none" />
                                            </div>
                                            <button
                                                disabled={!newRequestForm.title.trim()}
                                                onClick={async () => {
                                                    if (!newRequestForm.title.trim()) return;
                                                    const orgId = settings.organizationId || (settings as any).organization_id || organizationId || '';
                                                    if (portalToken) {
                                                        await clientRequestsService.createRequestByToken(portalToken, { title: newRequestForm.title, description: newRequestForm.description, category: newRequestForm.category, priority: newRequestForm.priority });
                                                        const updated = await clientRequestsService.getRequestsByToken(portalToken);
                                                        setClientRequests(updated);
                                                    } else if (clientProfile && orgId) {
                                                        const created = await clientRequestsService.createRequest(orgId, clientProfile.id, { title: newRequestForm.title, description: newRequestForm.description, category: newRequestForm.category, priority: newRequestForm.priority as ClientRequest['priority'], status: 'Aberto', opened_at: new Date().toISOString().split('T')[0] });
                                                        setClientRequests(prev => [created, ...prev]);
                                                    }
                                                    setShowNewRequestForm(false);
                                                    setNewRequestForm({ title: '', description: '', category: 'Geral', priority: 'Média' });
                                                }}
                                                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95"
                                            >
                                                Enviar Chamado
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Decorative footer message */}
            <div className="hidden md:block text-center pt-10 pb-6 opacity-30 select-none pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Poderoso e intuitivo • Opura Platinum © 2026</p>
            </div>
        </div>
    );
};

// Helper components that don't need dedicated files for the prototype
const CameraIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
    </svg>
);
