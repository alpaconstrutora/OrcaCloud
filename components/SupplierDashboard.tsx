import React from 'react';
import {
    Package,
    Truck,
    Clock,
    CheckCircle2,
    DollarSign,
    FileText,
    Pencil,
    Plus,
    X,
    Building2,
    Eye,
    User,
    Shield,
    ChevronRight,
    ArrowUpRight,
    TrendingUp,
    LayoutDashboard,
    Table2,
    Sparkles,
    ArrowRight,
    Search,
    Filter,
    History,
    FileCheck,
    RefreshCw,
    Gavel,
    AlertCircle,
    ChevronDown,
    Bell,
    Settings2,
    HelpCircle,
    EyeOff,
    Smartphone,
    MoreHorizontal
} from 'lucide-react';
import { Supplier, UserProfile, PurchaseOrder, Invoice, QuotationRequest } from '../types';
import { supplierAiService, SupplierAIInsight } from '../services/supplierAiService';
import { orderService } from '../services/orderService';
import { quotationService } from '../services/quotationService';
import QuotationResponseForm from './QuotationResponseForm';
import AIInsightCard from './AIInsightCard';
import OrderLifeline from './OrderLifeline';
import RepuScore from './RepuScore';
import NegotiationHub from './NegotiationHub';
import InvoiceManager from './InvoiceManager';
import SupplyChainOrderDetails from './SupplyChainOrderDetails';
import { invoiceService } from '../services/invoiceService';
import { supplierPortalTokenService } from '../services/supplierPortalTokenService';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import { useToast } from '../hooks/useToast';
import { KpiCard } from './ui/KpiCard';
import { usePersistedState } from './ui/TableUtils';
import MobilePreviewFrame from './MobilePreviewFrame';
// Vocabulário próprio dos portais externos — exceção §24 do guia de UI
import PortalOverview from './supplier/portal/PortalOverview';
import PortalOrders from './supplier/portal/PortalOrders';
import PortalQuotations from './supplier/portal/PortalQuotations';
import PortalNegotiations from './supplier/portal/PortalNegotiations';
import PortalInvoices from './supplier/portal/PortalInvoices';

interface SupplierDashboardProps {
    supplierProfile?: Supplier | null;
    profile?: { group: string; role: string };
    activeTab?: 'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents';
    initialOrderId?: string | null;
    initialOrderViewMode?: 'details' | 'logistics';
    onNavigate?: (link: string) => void;
    /** Acesso via link público (sem login), mesmo padrão do Portal do Parceiro/Cliente/Investidor. */
    portalToken?: string;
    /** Oculta o cromo de admin (impersonação, configurar abas) — usado pela prévia mobile. */
    isPreview?: boolean;
    /** Sobrescreve as abas habilitadas (usado pela prévia mobile). */
    overrideEnabledTabIds?: string[];
}

const SupplierDashboard: React.FC<SupplierDashboardProps> = ({
    supplierProfile,
    profile,
    activeTab: initialTab,
    initialOrderId,
    initialOrderViewMode,
    onNavigate,
    portalToken,
    isPreview = false,
    overrideEnabledTabIds
}) => {
    const { localToast, showToast } = useToast();

    // Único critério de "é admin" do arquivo — antes havia 3 checagens divergentes
    // (uma delas, uma const isAdmin solta, nunca era lida). Consolidado aqui porque
    // controla tanto o seletor de impersonação quanto o botão "Configurar Abas".
    // !portalToken garante que o fornecedor no link público nunca vê nenhum dos dois;
    // !isPreview faz o mesmo dentro da prévia mobile do gestor.
    const isAdmin = !portalToken && !isPreview && (
        profile?.role === UserProfile.ADMIN ||
        profile?.role === UserProfile.DEVELOPER ||
        profile?.group === 'DESENVOLVEDOR'
    );

    // Vocabulário do portal (§24) — vale para o link público E para a prévia
    // mobile. Fora daqui a tela continua no padrão do app, como a visão do
    // gestor no Portal do Investidor.
    const isPublicExperience = isPreview || !!portalToken;

    // Moldura das telas de DETALHE (pedido, logística). O conteúdo delas continua
    // sendo o do app — só o card ao redor entra no vocabulário do portal (§24).
    const drillCard = isPublicExperience
        ? 'bg-white rounded-2xl border border-[#ECECEF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 md:p-8'
        : 'bg-white p-8 rounded-[10px] border border-gray-100 shadow-sm';
    // Acentos da tela de logística — coral no portal, indigo/azul no app.
    const drillSoftBtn = isPublicExperience
        ? 'bg-[#FDEDE8] text-[#C24428] hover:bg-[#FBE0D8]'
        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100';
    const drillPrimaryBtn = isPublicExperience
        ? 'bg-[#E1553C] text-white hover:bg-[#C8452E]'
        : 'bg-blue-600 text-white hover:bg-blue-700';
    const drillPanel = isPublicExperience
        ? 'bg-[#FDF8F6] border-[#F3D9D1]'
        : 'bg-indigo-50/50 border-indigo-100/50';
    const drillPanelLabel = isPublicExperience ? 'text-[#C24428]' : 'text-indigo-600';
    const drillInput = isPublicExperience
        ? 'border-[#F3D9D1] focus:ring-[#E1553C]'
        : 'border-indigo-100 focus:ring-indigo-500';

    const [activeTab, setActiveTab] = React.useState<'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents'>(initialTab || 'overview');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplierDashboard:viewMode', 'list');
    const [searchNegotiations, setSearchNegotiations] = usePersistedState<string>('supplierDashboard:searchNegotiations', '');
    const [insights, setInsights] = React.useState<SupplierAIInsight[]>([]);
    const [loadingAI, setLoadingAI] = React.useState(false);
    const [bidAnalysis, setBidAnalysis] = React.useState<Record<string, SupplierAIInsight | null>>({});
    const [analyzingBidId, setAnalyzingBidId] = React.useState<string | null>(null);
    const [activeNegotiationId, setActiveNegotiationId] = React.useState<string | null>(null);
    const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
    const [invoices, setInvoices] = React.useState<Invoice[]>([]);
    const [loadingOrders, setLoadingOrders] = React.useState(false);
    const [allSuppliers, setAllSuppliers] = React.useState<Supplier[]>([]);
    const [selectedAdminSupplier, setSelectedAdminSupplier] = React.useState<Supplier | null>(null);
    // supplierProfile chega como prop imutável (via SupplierPortalManager). Sem este
    // override, salvar as abas visíveis não refletiria na tela até um novo fetch —
    // reseta sempre que o fornecedor selecionado muda, para não vazar settings de um
    // fornecedor para o próximo.
    const [supplierSettingsOverride, setSupplierSettingsOverride] = React.useState<Supplier | null>(null);
    React.useEffect(() => {
        setSupplierSettingsOverride(null);
    }, [supplierProfile?.id]);
    const [activeOrderId, setActiveOrderId] = React.useState<string | null>(null);
    const [orderViewMode, setOrderViewMode] = React.useState<'list' | 'details' | 'logistics'>('list');
    const [isEditingLogistics, setIsEditingLogistics] = React.useState(false);
    const [editingStatus, setEditingStatus] = React.useState<string>('');
    const [editingDeliveryDate, setEditingDeliveryDate] = React.useState<string>('');
    const [editingSeparationDate, setEditingSeparationDate] = React.useState<string>('');
    const [editingShippedDate, setEditingShippedDate] = React.useState<string>('');
    const [editingActualDeliveryDate, setEditingActualDeliveryDate] = React.useState<string>('');
    const [quotations, setQuotations] = React.useState<QuotationRequest[]>([]);
    const [activeQuotationId, setActiveQuotationId] = React.useState<string | null>(null);
    const [loadingQuotations, setLoadingQuotations] = React.useState(false);
    const [searchQueryQuotations, setSearchQueryQuotations] = usePersistedState<string>('supplierDashboard:searchQuotations', '');

    const effectiveSupplier = supplierSettingsOverride || supplierProfile || selectedAdminSupplier;

    // Casca do portal público (link do fornecedor) — só aparece no acesso via token,
    // espelhando o header/dropdown de perfil do Portal do Parceiro/Corretor.
    const isStandalone = !!portalToken;
    const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
    const [showMyAccount, setShowMyAccount] = React.useState(false);
    const [showTabConfig, setShowTabConfig] = React.useState(false);
    const [showMobilePreview, setShowMobilePreview] = React.useState(false);
    const [showMoreSheet, setShowMoreSheet] = React.useState(false);
    const [dataError, setDataError] = React.useState<string | null>(null);
    const accountMenuRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!isAccountMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setIsAccountMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isAccountMenuOpen]);

    React.useEffect(() => {
        if (isAdmin) {
            loadSuppliers();
        }
    }, [isAdmin]);

    const loadSuppliers = async () => {
        try {
            const data = await supplierService.listSuppliers();
            setAllSuppliers(data);
        } catch (error) {
            console.error("Erro ao carregar lista de fornecedores:", error);
        }
    };

    const loadOrders = async () => {
        if (!effectiveSupplier?.id) return;
        setLoadingOrders(true);
        setLoadingQuotations(true);
        setDataError(null);
        try {
            const [orderData, invoiceData, quotationData] = portalToken
                ? await Promise.all([
                    supplierPortalTokenService.getOrders(portalToken),
                    supplierPortalTokenService.getInvoices(portalToken),
                    supplierPortalTokenService.getQuotations(portalToken)
                ])
                : await Promise.all([
                    orderService.listOrders(undefined, effectiveSupplier.id, effectiveSupplier.email),
                    invoiceService.listInvoices(effectiveSupplier.id),
                    quotationService.listRequestsForSupplier(effectiveSupplier.id)
                ]);
            setOrders(orderData);
            setInvoices(invoiceData);
            setQuotations(quotationData);
        } catch (error) {
            console.error("Erro ao carregar pedidos, faturas ou cotações:", error);
            setDataError('Não foi possível carregar os dados do portal. Tente novamente em alguns instantes.');
        } finally {
            setLoadingOrders(false);
            setLoadingQuotations(false);
        }
    };

    React.useEffect(() => {
        loadOrders();
    }, [effectiveSupplier?.id]);

    React.useEffect(() => {
        const loadInsights = async () => {
            setLoadingAI(true);
            const data = await supplierAiService.getSupplyForecast(supplierProfile?.id || 'mock');
            setInsights(data);
            setLoadingAI(false);
        };
        loadInsights();
        loadOrders();
    }, [supplierProfile?.id]);

    // Handle initial order from navigation
    React.useEffect(() => {
        if (initialOrderId) {
            setActiveOrderId(initialOrderId);
            setOrderViewMode(initialOrderViewMode || 'details');
            if (activeTab !== 'orders') {
                setActiveTab('orders');
            }
        }
    }, [initialOrderId, initialOrderViewMode]);

    const handleViewOrder = (id: string, mode: 'details' | 'logistics') => {
        setActiveOrderId(id);
        setOrderViewMode(mode);
        setIsEditingLogistics(false);
        if (mode === 'logistics') {
            const order = orders.find(o => o.id === id);
            if (order) {
                setEditingStatus(order.status);
                setEditingDeliveryDate(order.deliveryDate || '');
                setEditingSeparationDate(order.separationDate || '');
                setEditingShippedDate(order.shippedDate || '');
                setEditingActualDeliveryDate(order.actualDeliveryDate || '');
            }
        }
    };

    const handleSaveLogistics = async () => {
        if (!activeOrderId) return;
        try {
            if (portalToken) {
                await supplierPortalTokenService.updateOrderLogistics(portalToken, activeOrderId, {
                    status: editingStatus,
                    deliveryDate: editingDeliveryDate,
                    separationDate: editingSeparationDate,
                    shippedDate: editingShippedDate,
                    actualDeliveryDate: editingActualDeliveryDate
                });
            } else {
                await orderService.updateOrder(activeOrderId, {
                    status: editingStatus as PurchaseOrder['status'],
                    deliveryDate: editingDeliveryDate,
                    separationDate: editingSeparationDate,
                    shippedDate: editingShippedDate,
                    actualDeliveryDate: editingActualDeliveryDate
                });
            }
            await loadOrders();
            setIsEditingLogistics(false);
            showToast('Logística atualizada com sucesso!', 'success');
        } catch (error: unknown) {
            console.error('Error updating logistics:', error);
            const message = error instanceof Error ? error.message : '';
            if (message.includes('check constraint')) {
                showToast('Erro: status não permitido. Certifique-se de que as migrações do banco de dados foram aplicadas.', 'error');
            } else if (message.includes('row-level security') || message.includes('RLS')) {
                showToast('Erro de permissão. Aplique as migrações de RLS.', 'error');
            } else {
                showToast(`Erro ao atualizar logística: ${message || 'Erro desconhecido'}`, 'error');
            }
        }
    };

    const renderOverview = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Recent Negotiations & Orders (3/4) */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h3 className="text-sm font-bold text-gray-900">Lances Recentes</h3>
                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <Table2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setActiveTab('negotiations')} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                                Ver Painel de Lances
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
                                {[
                                    { project: 'Edifício Horizon', item: 'Cimento CP-II 50kg', price: 'R$ 32,50', status: 'Em Análise', date: 'Há 2h' },
                                    { project: 'Residencial Aurora', item: 'Aço CA-50 10mm', price: 'R$ 1.250,00/ton', status: 'Aguardando', date: 'Há 5h' },
                                ].map((neg, i) => (
                                    <div key={i} className="p-4 rounded-[10px] bg-gray-50 hover:bg-white border border-transparent hover:border-gray-100 hover:shadow-sm transition-all group">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium text-indigo-600 mb-1">{neg.date}</span>
                                                <h4 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{neg.item}</h4>
                                            </div>
                                            <span className="text-xs font-normal text-gray-500">{neg.status}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200/50">
                                            <span className="text-xs text-gray-400 font-normal">{neg.project}</span>
                                            <span className="text-sm font-medium text-gray-900">{neg.price}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-2 border-r border-gray-100">Item de suprimento</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Projeto destino</th>
                                            <th className="px-6 py-2 border-r border-gray-100 text-center">Status</th>
                                            <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Melhor preço</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {[
                                            { project: 'Edifício Horizon', item: 'Cimento CP-II 50kg', price: 'R$ 32,50', status: 'Em Análise' },
                                            { project: 'Residencial Aurora', item: 'Aço CA-50 10mm', price: 'R$ 1.250,00/ton', status: 'Pendente' },
                                            { project: 'Condomínio Solar', item: 'Bloco de Concreto 14x19x39', price: 'R$ 2,85', status: 'Aprovado' },
                                        ].map((neg, i) => (
                                            <tr key={i} className="hover:bg-blue-50/50 transition-colors group cursor-pointer">
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-normal text-gray-700 group-hover:text-blue-700">{neg.item}</span>
                                                        <span className="text-xs text-gray-400 mt-0.5">Ref: {Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <span className="text-sm font-normal text-gray-600">{neg.project}</span>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-center">
                                                    <span className={`text-sm font-normal ${neg.status === 'Aprovado' ? 'text-emerald-800' : 'text-indigo-800'}`}>
                                                        {neg.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-900">{neg.price}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Concierge & Repu-Score (1/4) */}
                <div className="lg:col-span-1 space-y-4">
                    <RepuScore score={9.8} ontimeRate={95} priceStability={88} />

                    {/* AI Insights */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Supply AI Insights</span>
                        </div>
                        {insights.map((insight, idx) => (
                            <AIInsightCard
                                key={idx}
                                title={insight.title}
                                content={insight.message}
                                type={insight.type === 'warning' ? 'warning' : insight.type === 'opportunity' ? 'success' : 'info'}
                                onAction={() => setActiveTab((insight.actionable?.target ?? 'overview') as typeof activeTab)}
                            />
                        ))}
                        {loadingAI && <div className="h-32 bg-gray-50 rounded-[10px] animate-pulse" />}
                    </div>
                </div>
            </div>
        </div>
    );

    const handleAnalyzeBid = async (id: string, item: string, priceStr: string) => {
        setAnalyzingBidId(id);
        const price = parseFloat(priceStr.replace('R$ ', '').replace('.', '').replace(',', '.'));
        const result = await supplierAiService.analyzeMarketPrice(item, price, 'Região Sul');
        setBidAnalysis(prev => ({ ...prev, [id]: result }));
        setAnalyzingBidId(null);
    };

    const renderNegotiations = () => {
        if (activeNegotiationId) {
            const activeOrder = orders.find(o => o.id === activeNegotiationId);

            return (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <button
                        onClick={() => setActiveNegotiationId(null)}
                        className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest transition-colors mb-4 group"
                    >
                        <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                        Voltar para Oportunidades
                    </button>
                    {activeOrder && effectiveSupplier ? (
                        <NegotiationHub
                            order={activeOrder}
                            currentUserEmail={effectiveSupplier.email || ''}
                            currentUserRole="supplier"
                            onClose={() => setActiveNegotiationId(null)}
                            onUpdate={() => loadOrders()}
                            portalToken={portalToken}
                            accent={isPublicExperience ? 'portal' : 'indigo'}
                        />
                    ) : (
                        <div className="text-center py-12 bg-white rounded-[10px] border border-dashed border-gray-200">
                            <p className="text-sm text-gray-400">Pedido não encontrado para negociação.</p>
                        </div>
                    )}
                </div>
            );
        }

        const mockNegotiations = [
            { id: 'bid-1', item: 'Cimento CP-II 50kg', project: 'Edifício Horizon', qty: '500 sacos', bestBid: 'R$ 31,80', yourBid: 'R$ 34,50', status: 'Losing', date: 'Há 2h' },
            { id: 'bid-2', item: 'Aço CA-50 10mm', project: 'Residencial Aurora', qty: '2 ton', bestBid: 'R$ 1.250,00', yourBid: 'R$ 1.250,00', status: 'Winning', date: 'Há 5h' },
        ].filter(n => n.item.toLowerCase().includes(searchNegotiations.toLowerCase()) || n.project.toLowerCase().includes(searchNegotiations.toLowerCase()));

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar materiais..."
                                    value={searchNegotiations}
                                    onChange={(e) => setSearchNegotiations(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <Table2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                {mockNegotiations.length === 0 ? (
                    <div className="text-center py-12">
                        <Gavel className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma oportunidade encontrada</h3>
                        <p className="text-sm text-gray-500">Tente ajustar sua busca.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 gap-4 p-6">
                        {mockNegotiations.map((neg, i) => (
                            <div key={i} className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                                {bidAnalysis[neg.id] && (
                                    <div className="absolute top-0 left-0 w-1 bg-indigo-600 h-full"></div>
                                )}
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-11 h-11 rounded-[6px] flex items-center justify-center text-gray-600 transition-colors ${neg.status === 'Winning' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                <TrendingUp className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <h4 className="text-base font-bold text-gray-900">{neg.item}</h4>
                                                <span className="text-xs text-gray-400 mt-0.5">{neg.project} • Quantidade: {neg.qty}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <div className="text-right">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Membro líder</p>
                                                <span className="text-sm font-medium text-gray-900">{neg.bestBid}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Seu lance</p>
                                                <span className={`text-lg font-bold ${neg.status === 'Winning' ? 'text-emerald-600' : 'text-gray-900'}`}>{neg.yourBid}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleAnalyzeBid(neg.id, neg.item, neg.yourBid)}
                                                    disabled={analyzingBidId === neg.id}
                                                    className={`h-9 px-3.5 bg-gray-100 text-gray-900 rounded-[6px] font-medium text-[13px] hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50
                                                    ${analyzingBidId === neg.id ? 'animate-pulse' : ''}
                                                `}>
                                                    {analyzingBidId === neg.id ? 'Analisando...' : 'IA Review'}
                                                </button>
                                                <button
                                                    onClick={() => setActiveNegotiationId(neg.id)}
                                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                                                    <Gavel className="w-[15px] h-[15px]" />
                                                    Negociar
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {bidAnalysis[neg.id] && (
                                        <div className="bg-indigo-50/50 p-4 rounded-[10px] border border-indigo-100/50 animate-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-start gap-3">
                                                <div className={`p-2 rounded-[6px] ${bidAnalysis[neg.id]?.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                                    bidAnalysis[neg.id]?.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                                        'bg-indigo-100 text-indigo-600'
                                                    }`}>
                                                    <Sparkles className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">{bidAnalysis[neg.id]?.title}</p>
                                                    <p className="text-sm text-gray-700 leading-relaxed">{bidAnalysis[neg.id]?.message}</p>
                                                </div>
                                                {bidAnalysis[neg.id]?.actionable && (
                                                    <button
                                                        onClick={() => setActiveNegotiationId(neg.id)}
                                                        className="text-xs font-semibold text-indigo-600 border-b-2 border-indigo-200 hover:border-indigo-600 transition-all"
                                                    >
                                                        {bidAnalysis[neg.id]?.actionable?.label}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Item</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Projeto</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Qtd.</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Membro líder</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Seu lance</th>
                                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {mockNegotiations.map((neg, i) => (
                                    <tr key={i} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => setActiveNegotiationId(neg.id)}>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{neg.item}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{neg.project}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{neg.qty}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">{neg.bestBid}</td>
                                        <td className={`px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium ${neg.status === 'Winning' ? 'text-emerald-600' : 'text-gray-900'}`}>{neg.yourBid}</td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleAnalyzeBid(neg.id, neg.item, neg.yourBid)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="IA Review"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setActiveNegotiationId(neg.id)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Negociar"
                                                >
                                                    <Gavel className="w-4 h-4" />
                                                </button>
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
        );
    };

    const renderOrders = () => {
        if (activeOrderId) {
            if (orderViewMode === 'details') {
                return (
                    <div className={`${drillCard} animate-in fade-in slide-in-from-right-4 duration-500`}>
                        <SupplyChainOrderDetails
                            orderId={activeOrderId}
                            onBack={() => {
                                setActiveOrderId(null);
                                setOrderViewMode('list');
                            }}
                            currentUser={effectiveSupplier ? { email: effectiveSupplier.email || '', name: effectiveSupplier.name } : undefined}
                            portalToken={portalToken}
                            accent={isPublicExperience ? 'portal' : 'indigo'}
                        />
                    </div>
                );
            }

            if (orderViewMode === 'logistics') {
                const order = orders.find(o => o.id === activeOrderId);

                // Helper to map order status to Lifeline status
                const getLifelineStatus = (status: string): string => {
                    switch (status) {
                        case 'Confirmado': return 'CONFIRMED';
                        case 'Separação': return 'PREPARING';
                        case 'Em Trânsito': return 'SHIPPED';
                        case 'Entregue': return 'DELIVERED';
                        case 'Recebido': return 'RECEIVED';
                        case 'Divergência': return 'DIVERTED';
                        default: return 'BIDDING';
                    }
                };

                // Helper to map Lifeline status back to order status
                const getOrderStatusFromLifeline = (lifelineStatus: string): string => {
                    switch (lifelineStatus) {
                        case 'CONFIRMED': return 'Confirmado';
                        case 'PREPARING': return 'Separação';
                        case 'SHIPPED': return 'Em Trânsito';
                        case 'DELIVERED': return 'Entregue';
                        case 'RECEIVED': return 'Recebido';
                        case 'DIVERTED': return 'Divergência';
                        default: return 'Confirmado';
                    }
                };

                return (
                    <div className={`${drillCard} animate-in fade-in slide-in-from-right-4 duration-500`}>
                        <div className="flex items-center justify-between mb-8">
                            <button
                                onClick={() => {
                                    setActiveOrderId(null);
                                    setOrderViewMode('list');
                                    setIsEditingLogistics(false);
                                }}
                                className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-indigo-600 uppercase tracking-wider transition-colors group"
                            >
                                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                Voltar para Pedidos
                            </button>
                            <div className="flex items-center gap-4">
                                {!isEditingLogistics ? (
                                    <button
                                        onClick={() => setIsEditingLogistics(true)}
                                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 ${drillSoftBtn}`}
                                    >
                                        <FileText className="w-[15px] h-[15px]" />
                                        Editar Logística
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsEditingLogistics(false)}
                                            className="h-9 px-3.5 bg-gray-50 text-gray-500 rounded-[6px] hover:bg-gray-100 font-medium text-[13px] transition-all active:scale-95"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveLogistics}
                                            className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 ${drillPrimaryBtn}`}
                                        >
                                            Salvar Alterações
                                        </button>
                                    </div>
                                )}
                                <div className="text-right">
                                    <h3 className="text-lg font-bold text-gray-900">Rastreamento Logístico</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Pedido: {order?.number || order?.id.slice(0, 8)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="py-8">
                            <OrderLifeline
                                status={getLifelineStatus(isEditingLogistics ? editingStatus : (order?.status || '')) as import('./OrderLifeline').OrderStatus}
                                estimatedDelivery={isEditingLogistics ? editingDeliveryDate : (order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'A definir')}
                                separationDate={isEditingLogistics ? editingSeparationDate : order?.separationDate}
                                shippedDate={isEditingLogistics ? editingShippedDate : order?.shippedDate}
                                deliveredDate={isEditingLogistics ? editingActualDeliveryDate : order?.actualDeliveryDate}
                                isEditable={isEditingLogistics}
                                onStatusChange={(newStatus) => setEditingStatus(getOrderStatusFromLifeline(newStatus))}
                                maxSelectableStatus="DELIVERED"
                                accent={isPublicExperience ? 'portal' : 'indigo'}
                            />
                        </div>

                        <div className={`mt-8 p-6 rounded-[10px] border grid grid-cols-1 md:grid-cols-3 gap-6 ${drillPanel}`}>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${drillPanelLabel}`}>Previsão de Entrega</p>
                                {isEditingLogistics ? (
                                    <input
                                        type="date"
                                        value={editingDeliveryDate}
                                        onChange={(e) => setEditingDeliveryDate(e.target.value)}
                                        className={`w-full h-9 bg-white border rounded-[6px] px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 ${drillInput}`}
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-gray-900">{order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'Não informada'}</p>
                                )}
                            </div>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${drillPanelLabel}`}>Local de Entrega</p>
                                <p className="text-sm font-medium text-gray-900">{order?.deliveryLocation || 'Canteiro'}</p>
                            </div>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${drillPanelLabel}`}>Forma de Entrega</p>
                                <p className="text-sm font-medium text-gray-900">{order?.deliveryMethod || 'CIF'}</p>
                            </div>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${drillPanelLabel}`}>Status Atual</p>
                                {isEditingLogistics ? (
                                    <select
                                        value={editingStatus}
                                        onChange={(e) => setEditingStatus(e.target.value)}
                                        className={`w-full h-9 bg-white border rounded-[6px] px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 ${drillInput}`}
                                    >
                                        <option value="Confirmado">Confirmado</option>
                                        <option value="Separação">Separação</option>
                                        <option value="Em Trânsito">Em Trânsito</option>
                                        <option value="Entregue">Entregue</option>
                                    </select>
                                ) : (
                                    <p className="text-sm font-medium text-gray-900">{order?.status}</p>
                                )}
                            </div>
                        </div>

                        {isEditingLogistics && (
                            <div className={`mt-6 p-6 rounded-[10px] border animate-in fade-in slide-in-from-top-4 duration-500 ${drillPanel}`}>
                                <h4 className={`text-sm font-semibold uppercase tracking-wider mb-6 ${drillPanelLabel}`}>Datas por Estágio</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className={`text-xs font-semibold uppercase tracking-wider block ${drillPanelLabel}`}>Data de Separação</label>
                                        <input
                                            type="date"
                                            value={editingSeparationDate}
                                            onChange={(e) => setEditingSeparationDate(e.target.value)}
                                            className={`w-full h-9 bg-white border rounded-[6px] px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 transition-all ${drillInput}`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-semibold uppercase tracking-wider block ${drillPanelLabel}`}>Data de Saída (Trânsito)</label>
                                        <input
                                            type="date"
                                            value={editingShippedDate}
                                            onChange={(e) => setEditingShippedDate(e.target.value)}
                                            className={`w-full h-9 bg-white border rounded-[6px] px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 transition-all ${drillInput}`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-semibold uppercase tracking-wider block ${drillPanelLabel}`}>Data de Entrega Efetiva</label>
                                        <input
                                            type="date"
                                            value={editingActualDeliveryDate}
                                            onChange={(e) => setEditingActualDeliveryDate(e.target.value)}
                                            className={`w-full h-9 bg-white border rounded-[6px] px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 transition-all ${drillInput}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
        }

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white flex items-center justify-end">
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {loadingOrders ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : orders.length > 0 ? (
                        viewMode === 'grid' ? (
                            <div className="space-y-4 p-6">
                                {orders.map((order) => (
                                <div key={order.id} className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-5">
                                        <div className="text-right">
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Valor Total</p>
                                            <span className="text-lg font-bold text-gray-900">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                    order.items?.reduce((sum: number, item: { total?: number }) => sum + (item.total || 0), 0) || 0
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="px-3 py-1.5 bg-gray-50 rounded-[6px] border border-gray-100 text-xs font-semibold text-gray-900">
                                            {order.number || order.id.slice(0, 8)}
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            Data: {new Date(order.created_at || '').toLocaleDateString()} • {order.items?.length || 0} itens • {order.paymentMethod || 'Pagamento a definir'} ({order.paymentTermType || 'Vista'})
                                        </span>
                                        {invoices.some(inv => inv.orderId === order.id) && (
                                            <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                                                <FileCheck className="w-3 h-3" /> NFe Vinculada
                                            </span>
                                        )}
                                    </div>

                                    <OrderLifeline
                                        status={
                                            order.status === 'Confirmado' ? 'DELIVERED' :
                                                order.status === 'Enviado' ? 'SHIPPED' :
                                                    'PREPARING'
                                        }
                                        estimatedDelivery={order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'A definir'}
                                    />

                                    <div className="mt-8 flex justify-end gap-2 border-t border-gray-50 pt-5">
                                        <button
                                            onClick={() => handleViewOrder(order.id, 'details')}
                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 text-gray-600 rounded-[6px] hover:bg-gray-100 font-medium text-[13px] transition-all active:scale-95"
                                        >
                                            <FileText className="w-[15px] h-[15px]" />
                                            Ver Detalhes
                                        </button>
                                        <button
                                            onClick={() => handleViewOrder(order.id, 'logistics')}
                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                                        >
                                            <Truck className="w-[15px] h-[15px]" />
                                            Logística do Pedido
                                        </button>
                                        {(order.status === 'Enviado' || order.status === 'Em Negociação') && (
                                            <button
                                                onClick={() => {
                                                    setActiveNegotiationId(order.id);
                                                    setActiveTab('negotiations');
                                                }}
                                                className="flex items-center gap-1.5 h-9 px-3.5 bg-amber-50 text-amber-600 rounded-[6px] hover:bg-amber-100 font-medium text-[13px] transition-all active:scale-95"
                                            >
                                                <Gavel className="w-[15px] h-[15px]" />
                                                Negociar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[70vh]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className="px-6 py-2 border-r border-gray-100">Nº pedido</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Data</th>
                                            <th className="px-6 py-2 border-r border-gray-100 text-center">Itens</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Pagamento</th>
                                            <th className="px-6 py-2 border-r border-gray-100 text-right">Valor total</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Status</th>
                                            <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {orders.map((order) => (
                                            <tr key={order.id} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => handleViewOrder(order.id, 'details')}>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                                    {order.number || order.id.slice(0, 8)}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                                    {new Date(order.created_at || '').toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-gray-600">{order.items?.length || 0}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-normal text-gray-900">{order.paymentMethod || 'Boleto'}</span>
                                                        <span className="text-xs text-gray-400 leading-none mt-1">
                                                            {order.paymentTermType === 'Parcelado' ? `${order.paymentInstallments || 1}x sem juros` : `Prazo: ${order.paymentDays || 0} dias`}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-900">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                        order.items?.reduce((sum: number, item: { total?: number }) => sum + (item.total || 0), 0) || 0
                                                    )}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <span className={`text-sm font-normal ${order.status === 'Confirmado' ? 'text-emerald-800' : 'text-amber-800'}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleViewOrder(order.id, 'details')}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Ver detalhes"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleViewOrder(order.id, 'logistics')}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Logística"
                                                        >
                                                            <Truck className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        <div className="text-center py-12">
                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum pedido encontrado</h3>
                            <p className="text-sm text-gray-500">Você ainda não possui pedidos registrados no sistema.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderQuotations = () => {
        if (activeQuotationId) {
            const quotation = quotations.find(q => q.id === activeQuotationId);
            if (quotation && effectiveSupplier) {
                return (
                    <QuotationResponseForm
                        request={quotation}
                        supplierId={effectiveSupplier.id}
                        portalToken={portalToken}
                        onBack={() => setActiveQuotationId(null)}
                        onSave={() => {
                            setActiveQuotationId(null);
                            loadOrders();
                        }}
                    />
                );
            }
        }

        const filteredQuotations = quotations.filter(q =>
            q.number.toLowerCase().includes(searchQueryQuotations.toLowerCase()) ||
            q.title.toLowerCase().includes(searchQueryQuotations.toLowerCase()) ||
            q.projectName?.toLowerCase().includes(searchQueryQuotations.toLowerCase())
        );

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar cotação..."
                                    value={searchQueryQuotations}
                                    onChange={(e) => setSearchQueryQuotations(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <button className="h-9 flex items-center gap-1.5 px-3.5 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-500 hover:text-blue-600 transition-all active:scale-95 shrink-0">
                                <Filter className="w-4 h-4" />
                                Filtros
                            </button>
                        </div>
                    </div>

                    {loadingQuotations ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredQuotations.length > 0 ? (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-6 py-2 border-r border-gray-100">Nº RFQ</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Título</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Projeto</th>
                                        <th className="px-6 py-2 border-r border-gray-100 text-center">Prazo</th>
                                        <th className="px-6 py-2 border-r border-gray-100 text-center">Itens</th>
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredQuotations.map((q) => (
                                        <tr key={q.id} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => setActiveQuotationId(q.id)}>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                                {q.number}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{q.title}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{q.projectName}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-rose-600">
                                                {new Date(q.deadline).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-gray-400">{q.items.length}</td>
                                            <td className="px-6 py-2.5 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveQuotationId(q.id); }}
                                                    className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 ${drillPrimaryBtn}`}
                                                >
                                                    Responder
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma cotação pendente</h3>
                            <p className="text-sm text-gray-500">Você não possui solicitações de cotação no momento.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderDocuments = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            {effectiveSupplier ? (
                <InvoiceManager supplier={effectiveSupplier} portalToken={portalToken} />
            ) : (
                <div className="text-center py-12 bg-white rounded-[10px] border border-dashed border-gray-200">
                    <Shield className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Perfil não identificado</h3>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto">
                        Como administrador, selecione um fornecedor para gerenciar seus documentos.
                    </p>
                </div>
            )}
        </div>
    );

    // Título único por aba (ui_ux_guia_unificado.md §20) — nada de h1 duplicado dentro de cada render*
    const TAB_META: Record<typeof activeTab, { title: string; subtitle: string }> = {
        overview: {
            title: effectiveSupplier?.name ? `Olá, ${effectiveSupplier.name.split(' ')[0]}` : 'Portal Prime',
            subtitle: 'Supply Intelligence Dashboard.',
        },
        negotiations: { title: 'Oportunidades de Venda', subtitle: 'Negocie lances e acompanhe a concorrência em tempo real.' },
        quotations: { title: 'Solicitações de Cotação', subtitle: 'Responda às solicitações de orçamento das construtoras.' },
        orders: { title: 'Gestão de Pedidos', subtitle: 'Acompanhe o ciclo de vida e logística dos suprimentos.' },
        documents: { title: 'Central de Documentos', subtitle: 'Gerencie suas Notas Fiscais, XMLs e comprovantes de entrega.' },
    };

    const TABS: { id: typeof activeTab; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Estatísticas', icon: LayoutDashboard },
        { id: 'negotiations', label: 'Lances', icon: ArrowUpRight },
        { id: 'quotations', label: 'Cotações', icon: History },
        { id: 'orders', label: 'Pedidos', icon: Package },
        { id: 'documents', label: 'Nota Fiscal', icon: FileCheck },
    ];

    // Abas visíveis por fornecedor (guia §3, mesmo padrão do Portal do Corretor) —
    // config salva em suppliers.settings.supplierPortalTabs. Sem config (fornecedor
    // recém-criado), todas as abas ficam visíveis por padrão.
    //
    // ⚠️ Lista VAZIA é configuração ("nenhuma aba"), não ausência de configuração.
    // Enquanto isto foi `length > 0 ? saved : todas`, o gestor que desligava todas
    // as abas via o portal voltar com TODAS — o oposto do que pediu. Só
    // `undefined`/`null` significa "nunca configurado". Mesma correção já feita no
    // Portal do Investidor (InvestorDashboard.deriveTabIds).
    const supplierSettings = effectiveSupplier?.settings ?? {};
    const enabledTabIds: string[] = React.useMemo(() => {
        if (overrideEnabledTabIds) return overrideEnabledTabIds;
        const saved = supplierSettings.supplierPortalTabs;
        return Array.isArray(saved) ? saved : TABS.map(t => t.id);
    }, [overrideEnabledTabIds?.join(','), supplierSettings.supplierPortalTabs?.join(','), effectiveSupplier?.id]);
    const visibleTabs = TABS.filter(t => enabledTabIds.includes(t.id));
    // admin vê todas (para poder configurar); fornecedor vê só as habilitadas
    const navTabs = isAdmin ? TABS : visibleTabs;
    // Nenhuma aba habilitada = portal sem conteúdo. Tratado com aviso próprio, em
    // vez de reabrir uma aba sozinho.
    const semAbasHabilitadas = isPublicExperience && navTabs.length === 0;

    // activeTab nasce 'overview' independente de essa aba estar habilitada para o
    // fornecedor — no link público (isAdmin=false), se a aba atual tiver sido
    // ocultada, corrige aqui em vez de deixar o conteúdo antigo preso na tela.
    React.useEffect(() => {
        if (navTabs.length > 0 && !navTabs.some(t => t.id === activeTab)) {
            setActiveTab(navTabs[0].id);
        }
    }, [navTabs, activeTab]);

    const toggleTabVisibility = async (tabId: string) => {
        if (!effectiveSupplier) return;
        const next = enabledTabIds.includes(tabId)
            ? enabledTabIds.filter(id => id !== tabId)
            : [...enabledTabIds, tabId];
        try {
            const updated = await supplierService.updateSupplierSettings(effectiveSupplier.id, {
                ...supplierSettings,
                supplierPortalTabs: next,
            });
            setAllSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
            if (selectedAdminSupplier?.id === updated.id) setSelectedAdminSupplier(updated);
            if (supplierProfile?.id === updated.id) setSupplierSettingsOverride(updated);
            // Se a aba que acabamos de ocultar é a que está aberta agora, sai dela —
            // senão o conteúdo continua na tela mesmo depois de "ocultada".
            if (activeTab === tabId && !next.includes(tabId)) {
                const effectiveNext = next.length > 0 ? next : TABS.map(t => t.id);
                const fallback = (effectiveNext.includes('overview') ? 'overview' : effectiveNext[0]) as typeof activeTab;
                setActiveTab(fallback);
            }
        } catch (err) {
            console.error('Erro ao salvar abas do fornecedor:', err);
            showToast('Erro ao salvar configuração de abas.', 'error');
        }
    };

    const supplierDisplayName = effectiveSupplier ? getSupplierDisplayName(effectiveSupplier, appSettingsService.get().supplierNameDisplay) : 'Fornecedor';

    return (
        <div className={isStandalone
            ? 'portal-mobile-font min-h-screen bg-[#F2F2F4] pb-24 md:pb-0 md:h-screen md:flex md:flex-col md:overflow-hidden'
            : isPublicExperience
                ? 'portal-mobile-font space-y-6 pb-24 md:pb-12'
                : 'space-y-6 pb-12 bg-[#F8FAFC]'}>

            {/* ══ Casca do portal público — banner + header + sidebar. Espelha o
                Portal do Investidor (§24/§20.2.1): a casca é dona do gutter
                `p-4 md:p-6`, então NÃO existe mais o full-bleed `-mx-4 -mt-4` —
                o guard de App.tsx não aplica padding próprio. ══ */}
            {isStandalone && (
                <div className="hidden md:flex h-9 bg-[#FDEDE8] border-b border-[#F3D9D1] items-center justify-center gap-3 shrink-0 text-xs font-bold text-[#C24428] uppercase tracking-wider">
                    <span>Acesso via link público</span>
                </div>
            )}
            {isStandalone && (
                    <header className="hidden md:flex h-16 border-b border-gray-100 bg-white items-center justify-between px-6 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="px-2.5 py-1 bg-[#E1553C] text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5" /> Portal do Fornecedor
                            </div>
                            <h1 className="text-md font-bold text-gray-900 tracking-tight">Área do Fornecedor</h1>
                        </div>
                        <div className="relative" ref={accountMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsAccountMenuOpen(o => !o)}
                                className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                                aria-haspopup="menu"
                                aria-expanded={isAccountMenuOpen}
                            >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E1553C] text-[11px] font-bold text-white">
                                    {supplierDisplayName.charAt(0).toUpperCase()}
                                </span>
                                <span className="font-semibold text-gray-600">{supplierDisplayName} (FORNECEDOR)</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isAccountMenuOpen && (
                                <div className="absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                                    <div className="border-b border-gray-100 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E1553C] text-sm font-bold text-white">
                                                {supplierDisplayName.charAt(0).toUpperCase()}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-bold text-gray-900">{supplierDisplayName}</div>
                                                <div className="truncate text-xs text-gray-500">{effectiveSupplier?.email}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-2">
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); setShowMyAccount(true); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            role="menuitem"
                                        >
                                            <User className="h-4 w-4 text-gray-400" />
                                            <span className="flex-1">Minha conta</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); showToast('Personalização de tema estará disponível em breve.'); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            role="menuitem"
                                        >
                                            <Settings2 className="h-4 w-4 text-gray-400" />
                                            <span className="flex-1">Preferências</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); showToast('Central de notificações do fornecedor estará disponível em breve.'); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            role="menuitem"
                                        >
                                            <Bell className="h-4 w-4 text-gray-400" />
                                            <span className="flex-1">Notificações</span>
                                        </button>
                                    </div>
                                    <div className="border-t border-gray-100 p-2">
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); showToast('Dúvidas? Fale com a construtora responsável por esta obra.'); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            role="menuitem"
                                        >
                                            <HelpCircle className="h-4 w-4 text-gray-400" />
                                            <span className="flex-1">Ajuda e comandos</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </header>
            )}

            <div className={isStandalone ? 'md:flex md:flex-1 md:overflow-hidden md:min-h-0' : ''}>
                {isStandalone && (
                    <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex-col gap-1 shrink-0 overflow-y-auto hidden md:flex">
                        {navTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                    activeTab === tab.id
                                        ? 'bg-[#FDEDE8] border border-[#F3D9D1] text-[#C24428] font-semibold'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-white'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </aside>
                )}
                <div className={isStandalone ? 'md:flex-1 md:overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-8' : 'space-y-6'}>

            {/* Prévia Mobile — renderiza o portal como o fornecedor vê */}
            {showMobilePreview && !isPreview && effectiveSupplier && (
                <MobilePreviewFrame onClose={() => setShowMobilePreview(false)} title="Prévia — Portal do Fornecedor">
                    <SupplierDashboard
                        supplierProfile={effectiveSupplier}
                        activeTab={activeTab}
                        isPreview
                        overrideEnabledTabIds={enabledTabIds}
                    />
                </MobilePreviewFrame>
            )}

            {/* 1. Título (guia §1) — muda por aba via TAB_META, nunca duplicado dentro do conteúdo.
                No portal a identidade já vem da casca (badge + menu de conta + sidebar),
                então o bloco de título some e o conteúdo começa pela faixa de KPIs (§24). */}
            <div className={`${isPublicExperience ? 'hidden' : 'flex'} flex-col md:flex-row md:items-center justify-between gap-4`}>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{TAB_META[activeTab].title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{TAB_META[activeTab].subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Botão Prévia Mobile — somente admin com fornecedor selecionado */}
                    {isAdmin && effectiveSupplier && (
                        <button
                            onClick={() => setShowMobilePreview(true)}
                            title="Visualizar como o fornecedor vê no celular"
                            className="hidden md:block p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    )}
                    {!supplierProfile && isAdmin && (
                        <select
                            onChange={(e) => {
                                const supplier = allSuppliers.find(s => s.id === e.target.value);
                                if (supplier) setSelectedAdminSupplier(supplier);
                            }}
                            className="h-9 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-[6px] px-3 focus:ring-0 cursor-pointer hover:bg-amber-100 transition-colors"
                            value={selectedAdminSupplier?.id || ''}
                        >
                            <option value="">Impersonar Fornecedor</option>
                            {allSuppliers.map(s => (
                                <option key={s.id} value={s.id}>{getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)} ({s.email})</option>
                            ))}
                        </select>
                    )}
                    {/* Botão Configurar Abas — somente admin, quando um fornecedor estiver selecionado */}
                    {isAdmin && effectiveSupplier && (
                        <button
                            onClick={() => setShowTabConfig(true)}
                            title="Configurar abas visíveis do fornecedor"
                            className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. KPI cards (guia §2) — só a aba Estatísticas tem; mb-3 = ritmo de cromo (§20.1).
                No portal quem carrega os números é o `KpiStrip` do PortalOverview (§24). */}
            {activeTab === 'overview' && !isPublicExperience && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard label="Negociações Ativas" value="12" icon={<Clock className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Cotações Pendentes" value={quotations.length} icon={<History className="w-5 h-5" />} color="amber" />
                    <KpiCard label="Pedidos Pendentes" value={orders.filter(o => ['Rascunho', 'Enviado'].includes(o.status)).length} icon={<Package className="w-5 h-5" />} color="violet" />
                    <KpiCard
                        label="Volume Faturado"
                        value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(orders.filter(o => o.status === 'Confirmado').reduce((sum, o) => sum + (o.items?.reduce((is: number, i: { total?: number }) => is + (i.total || 0), 0) || 0), 0) / 1000) + 'k'}
                        icon={<DollarSign className="w-5 h-5" />}
                        color="emerald"
                    />
                </div>
            )}

            {/* 3. Toolbar de abas (guia §3) — trilho bg-gray-50, aba ativa bg-white text-blue-600 shadow-sm
                (não é o azul sólido de botão/toggle — aquilo é ação, isto é navegação).
                No portal a navegação é a sidebar (desktop) e a barra inferior (mobile). */}
            <div className={`${isPublicExperience ? 'hidden' : 'flex'} flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3`}>
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {navTabs.map(tab => {
                        const hidden = isAdmin && !visibleTabs.some(v => v.id === tab.id);
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                title={hidden ? 'Oculta para o fornecedor' : undefined}
                                className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : hidden
                                        ? 'text-gray-300 border border-dashed border-gray-200'
                                        : 'text-gray-700 hover:text-gray-900'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {hidden && <EyeOff className="w-3 h-3 ml-0.5 opacity-60" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Conteúdo — no portal (§24) as telas de lista trocam para o vocabulário
                do PortalKit; as telas de detalhe (pedido, cotação, negociação)
                continuam vindo dos render* e são as mesmas do app. */}
            {semAbasHabilitadas ? (
                <main className="min-h-[400px] flex items-center justify-center">
                    <div className="bg-white rounded-2xl border border-[#ECECEF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-8 max-w-md text-center">
                        <EyeOff className="w-9 h-9 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-[15px] font-semibold text-[#1F2430] mb-1.5">Portal em configuração</h3>
                        <p className="text-[13px] text-[#8A8F9A] leading-relaxed">
                            Nenhuma seção está liberada para você no momento. Fale com a construtora
                            para liberar o acesso.
                        </p>
                    </div>
                </main>
            ) : isPublicExperience && dataError ? (
                <main className="min-h-[400px] flex items-center justify-center">
                    <div className="bg-white rounded-2xl border border-[#F3D9D1] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-8 max-w-md text-center">
                        <AlertCircle className="w-9 h-9 text-[#C24428] mx-auto mb-4" />
                        <h3 className="text-[15px] font-semibold text-[#1F2430] mb-1.5">Dados indisponíveis</h3>
                        <p className="text-[13px] text-[#8A8F9A] leading-relaxed">{dataError}</p>
                    </div>
                </main>
            ) : (
            <main className="min-h-[400px]">
                {activeTab === 'overview' && (
                    isPublicExperience ? (
                        <PortalOverview
                            orders={orders}
                            quotations={quotations}
                            invoices={invoices}
                            insights={insights}
                            loadingAI={loadingAI}
                            onOpenOrder={(id, mode) => { setActiveTab('orders'); handleViewOrder(id, mode); }}
                            onRespondQuotation={(id) => { setActiveTab('quotations'); setActiveQuotationId(id); }}
                            onNavigate={setActiveTab}
                        />
                    ) : renderOverview()
                )}
                {activeTab === 'negotiations' && (
                    isPublicExperience && !activeNegotiationId ? (
                        <PortalNegotiations
                            orders={orders}
                            loading={loadingOrders}
                            onNegotiate={setActiveNegotiationId}
                        />
                    ) : renderNegotiations()
                )}
                {activeTab === 'quotations' && (
                    isPublicExperience && !activeQuotationId ? (
                        <PortalQuotations
                            quotations={quotations}
                            loading={loadingQuotations}
                            onRespond={setActiveQuotationId}
                        />
                    ) : renderQuotations()
                )}
                {activeTab === 'orders' && (
                    isPublicExperience && !activeOrderId ? (
                        <PortalOrders
                            orders={orders}
                            invoices={invoices}
                            loading={loadingOrders}
                            onOpenOrder={handleViewOrder}
                        />
                    ) : renderOrders()
                )}
                {activeTab === 'documents' && (
                    isPublicExperience && effectiveSupplier ? (
                        <PortalInvoices
                            supplier={effectiveSupplier}
                            orders={orders}
                            portalToken={portalToken}
                            onChanged={loadOrders}
                        />
                    ) : renderDocuments()
                )}
            </main>
            )}

            {isPublicExperience && (
                <div className="hidden md:block pt-12 text-center opacity-30 select-none pointer-events-none">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.3em]">Cadeia de Suprimentos • Opura Platinum</p>
                </div>
            )}

            {/* Barra de navegação inferior (mobile) — máx. 5 slots; excedente vai
                pro sheet "Mais", igual ao Portal do Investidor. */}
            {isPublicExperience && !semAbasHabilitadas && (() => {
                const MAX_BAR = 5;
                const hasMore = navTabs.length > MAX_BAR;
                const barTabs = hasMore ? navTabs.slice(0, MAX_BAR - 1) : navTabs;
                const moreTabs = hasMore ? navTabs.slice(MAX_BAR - 1) : [];
                const moreActive = moreTabs.some(t => t.id === activeTab);
                return (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                        <div className="flex">
                            {barTabs.map(tab => {
                                const isActive = activeTab === tab.id;
                                const isVisible = visibleTabs.some(v => v.id === tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                            ${isActive ? 'text-[#C24428]' : isAdmin && !isVisible ? 'text-gray-200' : 'text-gray-400'}
                                        `}
                                    >
                                        {isActive && (
                                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#E1553C] rounded-full" />
                                        )}
                                        <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                                            <tab.icon className="w-4 h-4" />
                                        </span>
                                        <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                            {tab.label.split(' ')[0]}
                                        </span>
                                    </button>
                                );
                            })}
                            {hasMore && (
                                <button
                                    onClick={() => setShowMoreSheet(true)}
                                    className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                        ${moreActive ? 'text-[#C24428]' : 'text-gray-400'}
                                    `}
                                >
                                    {moreActive && (
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#E1553C] rounded-full" />
                                    )}
                                    <span className={`transition-transform duration-200 ${moreActive ? 'scale-110' : ''}`}>
                                        <MoreHorizontal className="w-4 h-4" />
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">Mais</span>
                                </button>
                            )}
                        </div>
                        {/* Safe area do indicador do iOS */}
                        <div className="bg-white" style={{ height: 'env(safe-area-inset-bottom)' }} />
                    </div>
                );
            })()}

            {/* Bottom-sheet "Mais" — abas excedentes (somente mobile) */}
            {showMoreSheet && (() => {
                const MAX_BAR = 5;
                const moreTabs = navTabs.length > MAX_BAR ? navTabs.slice(MAX_BAR - 1) : [];
                return (
                    <div className="md:hidden fixed inset-0 z-[200]" onClick={() => setShowMoreSheet(false)}>
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
                        <div
                            className="absolute bottom-0 inset-x-0 bg-white rounded-t-[2rem] shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center mb-4">Mais opções</p>
                            <div className="space-y-2">
                                {moreTabs.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => { setActiveTab(tab.id); setShowMoreSheet(false); }}
                                            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                                                isActive
                                                    ? 'bg-[#FDEDE8] border-[#F3D9D1] text-[#C24428]'
                                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                            }`}
                                        >
                                            <tab.icon className={`w-4 h-4 ${isActive ? 'text-[#E1553C]' : 'text-gray-400'}`} />
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

                </div>{/* /coluna de conteúdo */}
            </div>{/* /wrapper do corpo */}

            {/* Toast de notificação (§13) */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}

            {/* MODAL: MINHA CONTA — só existe no portal público (link do fornecedor) */}
            {showMyAccount && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowMyAccount(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <User className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Minha Conta</h2>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Dados cadastrais</p>
                                </div>
                            </div>
                            <button onClick={() => setShowMyAccount(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-4">
                            {[
                                ['Nome', supplierDisplayName],
                                ['E-mail', effectiveSupplier?.email || '—'],
                                ['Telefone', effectiveSupplier?.phone || '—'],
                                ['CNPJ/CPF', effectiveSupplier?.document || '—'],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{label}</div>
                                    <div className="text-sm font-semibold text-gray-800">{value}</div>
                                </div>
                            ))}
                            <p className="text-xs text-gray-400 pt-3 border-t border-gray-100">
                                Para alterar seus dados cadastrais, entre em contato com a construtora.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CONFIGURAR ABAS — somente admin, espelha o mesmo painel do Portal do Corretor */}
            {showTabConfig && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowTabConfig(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <Settings2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Portal do Fornecedor</h2>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Abas visíveis para o fornecedor</p>
                                </div>
                            </div>
                            <button onClick={() => setShowTabConfig(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-3">
                            {TABS.map(tab => {
                                const isVisible = enabledTabIds.includes(tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => toggleTabVisibility(tab.id)}
                                        className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                                            isVisible
                                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                : 'bg-gray-50 border-gray-100 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <tab.icon className={`w-4 h-4 ${isVisible ? 'text-blue-500' : 'text-gray-300'}`} />
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                        </div>
                                        <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest ${isVisible ? 'text-blue-500' : 'text-gray-300'}`}>
                                            {isVisible ? <><Eye className="w-3.5 h-3.5" /> Visível</> : <><EyeOff className="w-3.5 h-3.5" /> Oculta</>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-8 pb-8">
                            <p className="text-xs font-bold text-gray-400 text-center uppercase tracking-widest">
                                Clique em cada aba para alternar visibilidade do fornecedor
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierDashboard;
