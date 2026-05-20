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
    Gavel
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
import { supplierService } from '../services/supplierService';

interface SupplierDashboardProps {
    supplierProfile?: Supplier | null;
    profile?: { group: string; role: string };
    activeTab?: 'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents' | 'profile';
    initialOrderId?: string | null;
    initialOrderViewMode?: 'details' | 'logistics';
    onNavigate?: (link: string) => void;
}

const SupplierDashboard: React.FC<SupplierDashboardProps> = ({
    supplierProfile,
    profile,
    activeTab: initialTab,
    initialOrderId,
    initialOrderViewMode,
    onNavigate
}) => {
    const [activeTab, setActiveTab] = React.useState<'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents' | 'profile'>(initialTab || 'overview');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
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
    const [searchQueryQuotations, setSearchQueryQuotations] = React.useState('');

    const effectiveSupplier = supplierProfile || selectedAdminSupplier;

    React.useEffect(() => {
        if (profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER) {
            loadSuppliers();
        }
    }, [profile?.role]);

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
        try {
            const [orderData, invoiceData, quotationData] = await Promise.all([
                orderService.listOrders(undefined, effectiveSupplier.id, effectiveSupplier.email),
                invoiceService.listInvoices(effectiveSupplier.id),
                quotationService.listRequestsForSupplier(effectiveSupplier.id)
            ]);
            setOrders(orderData);
            setInvoices(invoiceData);
            setQuotations(quotationData);
        } catch (error) {
            console.error("Erro ao carregar pedidos, faturas ou cotações:", error);
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

    const isAdmin = profile?.group === 'DESENVOLVEDOR' || profile?.role === UserProfile.ADMIN;

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
            await orderService.updateOrder(activeOrderId, {
                status: editingStatus as PurchaseOrder['status'],
                deliveryDate: editingDeliveryDate,
                separationDate: editingSeparationDate,
                shippedDate: editingShippedDate,
                actualDeliveryDate: editingActualDeliveryDate
            });
            await loadOrders();
            setIsEditingLogistics(false);
            alert('Logística atualizada com sucesso!');
        } catch (error: unknown) {
            console.error('Error updating logistics:', error);
            const message = error instanceof Error ? error.message : '';
            if (message.includes('check constraint')) {
                alert('Erro: Staus não permitido. Por favor, certifique-se de que as migrações do banco de dados foram aplicadas.');
            } else if (message.includes('row-level security') || message.includes('RLS')) {
                alert('Erro de permissão. Por favor, aplique as migrações de RLS.');
            } else {
                alert(`Erro ao atualizar logística: ${message || 'Erro desconhecido'}`);
            }
        }
    };

    const renderOverview = () => (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Negociações Ativas', val: '12', icon: <Clock className="w-5 h-5" />, color: 'indigo' },
                    { label: 'Cotações Pendentes', val: quotations.length.toString(), icon: <History className="w-5 h-5" />, color: 'amber' },
                    { label: 'Pedidos Pendentes', val: orders.filter(o => ['Rascunho', 'Enviado'].includes(o.status)).length.toString(), icon: <Package className="w-5 h-5" />, color: 'amber' },
                    { label: 'Volume Faturado', val: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(orders.filter(o => o.status === 'Confirmado').reduce((sum, o) => sum + (o.items?.reduce((is: number, i: { total?: number }) => is + (i.total || 0), 0) || 0), 0) / 1000) + 'k', icon: <DollarSign className="w-5 h-5" />, color: 'indigo' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500 text-gray-900">
                            {stat.icon}
                        </div>
                        <div className={`p-2.5 rounded-xl bg-gray-50 text-gray-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white w-fit mb-4`}>
                            {stat.icon}
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                        <h3 className="text-2xl font-black text-gray-900 mt-1">{stat.val}</h3>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                {/* Recent Negotiations & Orders (3/4) */}
                <div className="lg:col-span-3 space-y-10">
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Lances Recentes</h3>
                                <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <Table2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setActiveTab('negotiations')} className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:translate-x-1 transition-transform">
                                Ver Painel de Lances
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
                                {[
                                    { project: 'Edifício Horizon', item: 'Cimento CP-II 50kg', price: 'R$ 32,50', status: 'Em Análise', date: 'Há 2h' },
                                    { project: 'Residencial Aurora', item: 'Aço CA-50 10mm', price: 'R$ 1.250,00/ton', status: 'Aguardando', date: 'Há 5h' },
                                ].map((neg, i) => (
                                    <div key={i} className="p-6 rounded-2xl bg-gray-50 hover:bg-white border border-transparent hover:border-gray-100 hover:shadow-lg transition-all group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">{neg.date}</span>
                                                <h4 className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{neg.item}</h4>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-lg bg-white text-gray-500 text-[10px] font-black uppercase tracking-widest border border-gray-100">
                                                {neg.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200/50">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{neg.project}</span>
                                            <span className="text-sm font-black text-gray-900">{neg.price}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50/50 border-b border-gray-100">
                                        <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                            <th className="px-8 py-5">Item de Suprimento</th>
                                            <th className="px-8 py-5">Projeto Destino</th>
                                            <th className="px-8 py-5 text-center">Status</th>
                                            <th className="px-8 py-5 text-right">Melhor Preço</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-sm">
                                        {[
                                            { project: 'Edifício Horizon', item: 'Cimento CP-II 50kg', price: 'R$ 32,50', status: 'Em Análise' },
                                            { project: 'Residencial Aurora', item: 'Aço CA-50 10mm', price: 'R$ 1.250,00/ton', status: 'Pendente' },
                                            { project: 'Condomínio Solar', item: 'Bloco de Concreto 14x19x39', price: 'R$ 2,85', status: 'Aprovado' },
                                        ].map((neg, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer">
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-gray-900 group-hover:text-indigo-600">{neg.item}</span>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Ref: {Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-indigo-200" />
                                                        <span className="text-xs font-bold text-gray-500 uppercase">{neg.project}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${neg.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                                                        }`}>
                                                        {neg.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-right font-black text-gray-900">{neg.price}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Concierge & Repu-Score (1/4) */}
                <div className="lg:col-span-1 space-y-6">
                    <RepuScore score={9.8} ontimeRate={95} priceStability={88} />

                    {/* AI Insights */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2 mb-2">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Supply AI Insights</span>
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
                        {loadingAI && <div className="h-32 bg-gray-50 rounded-3xl animate-pulse" />}
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
                        className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest transition-colors mb-4 group"
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
                        />
                    ) : (
                        <div className="p-8 bg-white rounded-3xl border border-dashed border-gray-200 text-center">
                            <p className="text-gray-400 font-bold uppercase text-xs">Pedido não encontrado para negociação.</p>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Oportunidades de Venda</h3>
                            <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <Table2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Negocie lances e acompanhe a concorrência em tempo real.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="text" placeholder="Buscar materiais..." className="pl-10 pr-4 py-3 rounded-xl border border-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64" />
                        </div>
                    </div>
                </div>

                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 gap-6">
                        {[
                            { id: 'bid-1', item: 'Cimento CP-II 50kg', project: 'Edifício Horizon', qty: '500 sacos', bestBid: 'R$ 31,80', yourBid: 'R$ 34,50', status: 'Losing' },
                            { id: 'bid-2', item: 'Aço CA-50 10mm', project: 'Residencial Aurora', qty: '2 ton', bestBid: 'R$ 1.250,00', yourBid: 'R$ 1.250,00', status: 'Winning' },
                        ].map((neg, i) => (
                            <div key={i} className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                                {bidAnalysis[neg.id] && (
                                    <div className="absolute top-0 left-0 w-1 bg-indigo-600 h-full"></div>
                                )}
                                <div className="flex flex-col gap-8">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-gray-600 transition-colors ${neg.status === 'Winning' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                <TrendingUp className="w-8 h-8" />
                                            </div>
                                            <div className="flex flex-col">
                                                <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight">{neg.item}</h4>
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{neg.project} • Quantidade: {neg.qty}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-12">
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Membro Líder</p>
                                                <span className="text-sm font-black text-gray-900">{neg.bestBid}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Seu Lance</p>
                                                <span className={`text-xl font-black ${neg.status === 'Winning' ? 'text-emerald-600' : 'text-gray-900'}`}>{neg.yourBid}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleAnalyzeBid(neg.id, neg.item, neg.yourBid)}
                                                    disabled={analyzingBidId === neg.id}
                                                    className={`px-6 py-3 bg-gray-100 text-gray-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50
                                                    ${analyzingBidId === neg.id ? 'animate-pulse' : ''}
                                                `}>
                                                    {analyzingBidId === neg.id ? 'Analisando...' : 'IA Review'}
                                                </button>
                                                <button
                                                    onClick={() => setActiveNegotiationId(neg.id)}
                                                    className="px-6 py-3 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-gray-200">
                                                    Negociar
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {bidAnalysis[neg.id] && (
                                        <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/50 animate-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-lg ${bidAnalysis[neg.id]?.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                                    bidAnalysis[neg.id]?.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                                        'bg-indigo-100 text-indigo-600'
                                                    }`}>
                                                    <Sparkles className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{bidAnalysis[neg.id]?.title}</p>
                                                    <p className="text-sm font-bold text-gray-700 leading-relaxed">{bidAnalysis[neg.id]?.message}</p>
                                                </div>
                                                {bidAnalysis[neg.id]?.actionable && (
                                                    <button
                                                        onClick={() => setActiveNegotiationId(neg.id)}
                                                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b-2 border-indigo-200 hover:border-indigo-600 transition-all"
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
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    <th className="px-8 py-5">Nº Pedido</th>
                                    <th className="px-8 py-5">Data</th>
                                    <th className="px-8 py-5">Itens</th>
                                    <th className="px-8 py-5">Pagamento</th>
                                    <th className="px-8 py-5 text-right">Valor Total</th>
                                    <th className="px-8 py-5 text-right">Seu Lance</th>
                                    <th className="px-8 py-5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {[
                                    { id: 'bid-1', item: 'Cimento CP-II 50kg', project: 'Edifício Horizon', qty: '500 sacos', bestBid: 'R$ 31,80', yourBid: 'R$ 34,50', status: 'Losing' },
                                    { id: 'bid-2', item: 'Aço CA-50 10mm', project: 'Residencial Aurora', qty: '2 ton', bestBid: 'R$ 1.250,00', yourBid: 'R$ 1.250,00', status: 'Winning' },
                                ].map((neg, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onClick={() => setActiveNegotiationId(neg.id)}>
                                        <td className="px-8 py-5 font-black text-gray-900 uppercase tracking-tight">{neg.item}</td>
                                        <td className="px-8 py-5 text-xs font-bold text-gray-500 uppercase">{neg.project}</td>
                                        <td className="px-8 py-5 text-xs font-bold text-gray-900">{neg.qty}</td>
                                        <td className="px-8 py-5 text-center font-black text-gray-900">{neg.bestBid}</td>
                                        <td className={`px-8 py-5 text-right font-black ${neg.status === 'Winning' ? 'text-emerald-600' : 'text-gray-900'}`}>{neg.yourBid}</td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleAnalyzeBid(neg.id, neg.item, neg.yourBid); }}
                                                    className="p-2 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                </button>
                                                <button className="p-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors">
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
        );
    };

    const renderOrders = () => {
        if (activeOrderId) {
            if (orderViewMode === 'details') {
                return (
                    <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <SupplyChainOrderDetails
                            orderId={activeOrderId}
                            onBack={() => {
                                setActiveOrderId(null);
                                setOrderViewMode('list');
                            }}
                            currentUser={effectiveSupplier ? { email: effectiveSupplier.email || '', name: effectiveSupplier.name } : undefined}
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
                    <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center justify-between mb-12">
                            <button
                                onClick={() => {
                                    setActiveOrderId(null);
                                    setOrderViewMode('list');
                                    setIsEditingLogistics(false);
                                }}
                                className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest transition-colors group"
                            >
                                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                Voltar para Pedidos
                            </button>
                            <div className="flex items-center gap-6">
                                {!isEditingLogistics ? (
                                    <button
                                        onClick={() => setIsEditingLogistics(true)}
                                        className="flex items-center gap-2 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100/50 hover:bg-indigo-100 transition-all"
                                    >
                                        <FileText className="w-3 h-3" />
                                        Editar Logística
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setIsEditingLogistics(false)}
                                            className="px-6 py-2 bg-gray-50 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-100 hover:bg-white transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveLogistics}
                                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:scale-105 transition-all"
                                        >
                                            Salvar Alterações
                                        </button>
                                    </div>
                                )}
                                <div className="text-right">
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Rastreamento Logístico</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Pedido: {order?.number || order?.id.slice(0, 8)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="py-12">
                            <OrderLifeline
                                status={getLifelineStatus(isEditingLogistics ? editingStatus : (order?.status || '')) as import('./OrderLifeline').OrderStatus}
                                estimatedDelivery={isEditingLogistics ? editingDeliveryDate : (order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'A definir')}
                                separationDate={isEditingLogistics ? editingSeparationDate : order?.separationDate}
                                shippedDate={isEditingLogistics ? editingShippedDate : order?.shippedDate}
                                deliveredDate={isEditingLogistics ? editingActualDeliveryDate : order?.actualDeliveryDate}
                                isEditable={isEditingLogistics}
                                onStatusChange={(newStatus) => setEditingStatus(getOrderStatusFromLifeline(newStatus))}
                                maxSelectableStatus="DELIVERED"
                            />
                        </div>

                        <div className="mt-12 p-8 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Previsão de Entrega</p>
                                {isEditingLogistics ? (
                                    <input
                                        type="date"
                                        value={editingDeliveryDate}
                                        onChange={(e) => setEditingDeliveryDate(e.target.value)}
                                        className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                ) : (
                                    <p className="text-sm font-bold text-gray-900">{order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'Não informada'}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Local de Entrega</p>
                                <p className="text-sm font-bold text-gray-900">{order?.deliveryLocation || 'Canteiro'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Forma de Entrega</p>
                                <p className="text-sm font-bold text-gray-900">{order?.deliveryMethod || 'CIF'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Status Atual</p>
                                {isEditingLogistics ? (
                                    <select
                                        value={editingStatus}
                                        onChange={(e) => setEditingStatus(e.target.value)}
                                        className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="Confirmado">Confirmado</option>
                                        <option value="Separação">Separação</option>
                                        <option value="Em Trânsito">Em Trânsito</option>
                                        <option value="Entregue">Entregue</option>
                                    </select>
                                ) : (
                                    <p className="text-sm font-bold text-gray-900">{order?.status}</p>
                                )}
                            </div>
                        </div>

                        {isEditingLogistics && (
                            <div className="mt-8 p-10 bg-indigo-50/30 rounded-3xl border border-indigo-100/30 animate-in fade-in slide-in-from-top-4 duration-500">
                                <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-8">Datas por Estágio</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Data de Separação</label>
                                        <input
                                            type="date"
                                            value={editingSeparationDate}
                                            onChange={(e) => setEditingSeparationDate(e.target.value)}
                                            className="w-full bg-white border border-indigo-100/50 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Data de Saída (Trânsito)</label>
                                        <input
                                            type="date"
                                            value={editingShippedDate}
                                            onChange={(e) => setEditingShippedDate(e.target.value)}
                                            className="w-full bg-white border border-indigo-100/50 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Data de Entrega Efetiva</label>
                                        <input
                                            type="date"
                                            value={editingActualDeliveryDate}
                                            onChange={(e) => setEditingActualDeliveryDate(e.target.value)}
                                            className="w-full bg-white border border-indigo-100/50 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
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
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Gestão de Pedidos</h3>
                            <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <Table2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Acompanhe o ciclo de vida e logística dos suprimentos.</p>
                    </div>
                </div>

                <div className="space-y-10">
                    {loadingOrders ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-gray-100 shadow-sm animate-pulse">
                            <Package className="w-12 h-12 text-gray-200 mb-4" />
                            <div className="h-4 w-48 bg-gray-50 rounded mb-2"></div>
                            <div className="h-3 w-32 bg-gray-50 rounded"></div>
                        </div>
                    ) : orders.length > 0 ? (
                        viewMode === 'grid' ? (
                            orders.map((order, i) => (
                                <div key={order.id} className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-8">
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor Total</p>
                                            <span className="text-xl font-black text-gray-900">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                    order.items?.reduce((sum: number, item: { total?: number }) => sum + (item.total || 0), 0) || 0
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mb-10">
                                        <div className="px-5 py-2 bg-gray-50 rounded-2xl border border-gray-100 text-[10px] font-black text-gray-900 uppercase tracking-wider">
                                            {order.number || order.id.slice(0, 8)}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            Data: {new Date(order.created_at || '').toLocaleDateString()} • {order.items?.length || 0} itens • {order.paymentMethod || 'Pagamento a definir'} ({order.paymentTermType || 'Vista'})
                                        </span>
                                        {invoices.some(inv => inv.orderId === order.id) && (
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                                                <FileCheck className="w-3 h-3" /> NFe Vinculada
                                            </div>
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

                                    <div className="mt-12 flex justify-end gap-4 border-t border-gray-50 pt-8">
                                        <button
                                            onClick={() => handleViewOrder(order.id, 'details')}
                                            className="flex items-center gap-2 px-6 py-3 bg-gray-50 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest border border-gray-100 hover:bg-white transition-all active:scale-95"
                                        >
                                            <FileText className="w-4 h-4" />
                                            Ver Detalhes
                                        </button>
                                        <button
                                            onClick={() => handleViewOrder(order.id, 'logistics')}
                                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all"
                                        >
                                            <Truck className="w-4 h-4" />
                                            Logística do Pedido
                                        </button>
                                        {(order.status === 'Enviado' || order.status === 'Em Negociação') && (
                                            <button
                                                onClick={() => {
                                                    setActiveNegotiationId(order.id);
                                                    setActiveTab('negotiations');
                                                }}
                                                className="flex items-center gap-2 px-6 py-3 bg-amber-50 text-amber-600 rounded-xl text-xs font-black uppercase tracking-widest border border-amber-100 hover:bg-amber-100 transition-all active:scale-95"
                                            >
                                                <Gavel className="w-4 h-4" />
                                                Negociar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50/50 border-b border-gray-100">
                                        <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                            <th className="px-8 py-5">Nº Pedido</th>
                                            <th className="px-8 py-5">Data</th>
                                            <th className="px-8 py-5">Itens</th>
                                            <th className="px-8 py-5">Pagamento</th>
                                            <th className="px-8 py-5 text-right">Valor Total</th>
                                            <th className="px-8 py-5 text-right">Status</th>
                                            <th className="px-8 py-5 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {orders.map((order) => (
                                            <tr key={order.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onClick={() => handleViewOrder(order.id, 'details')}>
                                                <td className="px-8 py-5">
                                                    <div className="px-4 py-1.5 bg-gray-50 rounded-xl border border-gray-100 text-[10px] font-black text-gray-900 w-fit">
                                                        {order.number || order.id.slice(0, 8)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-xs font-bold text-gray-500">
                                                    {new Date(order.created_at || '').toLocaleDateString()}
                                                </td>
                                                <td className="px-8 py-5 text-center text-xs font-bold text-gray-900">{order.items?.length || 0}</td>
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-gray-900 uppercase tracking-tight">{order.paymentMethod || 'Boleto'}</span>
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                                                            {order.paymentTermType === 'Parcelado' ? `${order.paymentInstallments || 1}x sem juros` : `Prazo: ${order.paymentDays || 0} dias`}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-right font-black text-gray-900 border-r border-gray-50">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                        order.items?.reduce((sum: number, item: { total?: number }) => sum + (item.total || 0), 0) || 0
                                                    )}
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${order.status === 'Confirmado' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewOrder(order.id, 'details'); }}
                                                            className="p-2 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-indigo-100 active:scale-95"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewOrder(order.id, 'logistics'); }}
                                                            className="p-2 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-indigo-100 active:scale-95"
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
                        <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6">
                                <Package className="w-10 h-10 text-gray-300" />
                            </div>
                            <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Nenhum Pedido Encontrado</h4>
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 max-w-xs">Você ainda não possui pedidos registrados no sistema.</p>
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
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Solicitações de Cotação</h3>
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Responda às solicitações de orçamento das construtoras.</p>
                    </div>

                    <div className="flex gap-4">
                        <div className="relative group">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar cotação..."
                                value={searchQueryQuotations}
                                onChange={(e) => setSearchQueryQuotations(e.target.value)}
                                className="pl-11 pr-6 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold w-64 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                            />
                        </div>
                        <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all shadow-sm active:scale-95">
                            <Filter className="w-4 h-4" />
                            Filtros
                        </button>
                    </div>
                </div>

                <div className="space-y-10">
                    {loadingQuotations ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-gray-100 shadow-sm animate-pulse">
                            <Clock className="w-12 h-12 text-gray-200 mb-4" />
                            <div className="h-4 w-48 bg-gray-50 rounded mb-2"></div>
                        </div>
                    ) : filteredQuotations.length > 0 ? (
                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                        <th className="px-8 py-5">Nº RFQ</th>
                                        <th className="px-8 py-5">Título</th>
                                        <th className="px-8 py-5">Projeto</th>
                                        <th className="px-8 py-5 text-center">Prazo</th>
                                        <th className="px-8 py-5 text-center">Itens</th>
                                        <th className="px-8 py-5 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredQuotations.map((q) => (
                                        <tr key={q.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onClick={() => setActiveQuotationId(q.id)}>
                                            <td className="px-8 py-5">
                                                <div className="px-4 py-1.5 bg-gray-50 rounded-xl border border-gray-100 text-[10px] font-black text-gray-900 w-fit">
                                                    {q.number}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-sm font-black text-gray-900">{q.title}</td>
                                            <td className="px-8 py-5 text-xs font-bold text-gray-500 uppercase">{q.projectName}</td>
                                            <td className="px-8 py-5 text-center text-xs font-bold text-rose-600">
                                                {new Date(q.deadline).toLocaleDateString()}
                                            </td>
                                            <td className="px-8 py-5 text-center text-xs font-bold text-gray-400">{q.items.length}</td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveQuotationId(q.id); }}
                                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:scale-105 transition-all"
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
                        <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6">
                                <Clock className="w-10 h-10 text-gray-300" />
                            </div>
                            <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Nenhuma Cotação Pendente</h4>
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 max-w-xs">Você não possui solicitações de cotação no momento.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderDocuments = () => (
        <div className="animate-in fade-in duration-500">
            <div className="mb-8">
                <h2 className="text-4xl font-black text-gray-900 tracking-tight">Central de Documentos</h2>
                <p className="text-gray-500 mt-2">Gerencie suas Notas Fiscais, XMLs e comprovantes de entrega.</p>
            </div>
            {effectiveSupplier ? (
                <InvoiceManager supplier={effectiveSupplier} />
            ) : (
                <div className="bg-white p-16 rounded-[3.5rem] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mb-6">
                        <Shield className="w-10 h-10 text-amber-600" />
                    </div>
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Perfil não identificado</h4>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-2 max-w-sm">
                        Como administrador, selecione um fornecedor para gerenciar seus documentos.
                    </p>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">
                        <div className="w-5 h-1 bg-indigo-600 rounded-full"></div>
                        Supply Intelligence Dashboard
                    </div>
                    <div className="flex items-baseline gap-4">
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            {effectiveSupplier?.name ? `Olá, ${effectiveSupplier.name.split(' ')[0]}` : 'Portal Prime'}
                        </h1>
                        {!supplierProfile && (profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER) && (
                            <select
                                onChange={(e) => {
                                    const supplier = allSuppliers.find(s => s.id === e.target.value);
                                    if (supplier) setSelectedAdminSupplier(supplier);
                                }}
                                className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-1.5 focus:ring-0 cursor-pointer shadow-sm hover:bg-amber-100 transition-colors"
                                value={selectedAdminSupplier?.id || ''}
                            >
                                <option value="">Impersonar Fornecedor</option>
                                {allSuppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="flex p-1.5 bg-gray-100 rounded-[2rem] w-fit border border-gray-200/50">
                    {[
                        { id: 'overview', label: 'Estatísticas', icon: <LayoutDashboard className="w-4 h-4" /> },
                        { id: 'negotiations', label: 'Lances', icon: <ArrowUpRight className="w-4 h-4" /> },
                        { id: 'quotations', label: 'Cotações', icon: <History className="w-4 h-4" /> },
                        { id: 'orders', label: 'Pedidos', icon: <Package className="w-4 h-4" /> },
                        { id: 'documents', label: 'Docs', icon: <FileCheck className="w-4 h-4" /> },
                        { id: 'profile', label: 'Perfil', icon: <User className="w-4 h-4" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black transition-all duration-300 uppercase tracking-widest ${activeTab === tab.id
                                ? 'bg-white text-indigo-600 shadow-xl scale-105'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <main className="min-h-[400px]">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'negotiations' && renderNegotiations()}
                {activeTab === 'quotations' && renderQuotations()}
                {activeTab === 'orders' && renderOrders()}
                {activeTab === 'documents' && renderDocuments()}
                {activeTab === 'profile' && (
                    <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-100 text-gray-400 uppercase tracking-widest text-[10px] font-black">
                        Módulo de Perfil em Manutenção
                    </div>
                )}
            </main>

            <div className="pt-12 text-center opacity-30 select-none pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Supply Chain Intelligence • OrçaCloud Ecosystem</p>
            </div>
        </div>
    );
};

export default SupplierDashboard;
