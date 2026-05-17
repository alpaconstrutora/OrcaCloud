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
    FileDown
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { ProjectSettings, BudgetEntry, DiaryEntry, UserProfile, Client } from '../types';
import { calculateProjectProgress, calculateUpcomingPhases, getPhaseSchedule, calculateRealizedFinancialProgress, calculatePlannedFinancialProgress } from '../utils/projectUtils';
import ProjectGallery from './ProjectGallery';
import { ClientAIInsight } from '../services/clientAiService';
import AIInsightCard from './AIInsightCard';
import FinishSelection from './FinishSelection';
import ClientList from './ClientList';
import { clientService } from '../services/clientService';
import { exportService } from '../services/exportService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { projectService } from '../services/projectService';
import { orderService } from '../services/orderService';
import { storageService } from '../services/storageService';
import { PurchaseOrder } from '../types';

interface ClientAreaProps {
    settings: ProjectSettings;
    budget: BudgetEntry[];
    profile?: { group: string; role: string };
    clientProfile?: Client | null;
    clients?: Client[]; // For admin selection
    activeTab?: 'dashboard' | 'clientes' | 'jornada' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'financeiro' | 'suporte';
    onUpdateSettings?: (settings: ProjectSettings) => void;
    onClientSelect?: (client: Client) => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export const ClientArea: React.FC<ClientAreaProps> = ({ settings, budget, profile, clientProfile, activeTab: initialTab, onUpdateSettings, onClientSelect }) => {
    const [activeTab, setActiveTab] = React.useState<'dashboard' | 'clientes' | 'jornada' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'financeiro' | 'suporte'>(initialTab || 'dashboard');
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
    const isAdmin = profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER || profile?.group === 'DESENVOLVEDOR';

    const [globalClientInstallments, setGlobalClientInstallments] = React.useState<any[]>([]);
    
    React.useEffect(() => {
        if (clientProfile && activeTab === 'financeiro') {
            commercialFinanceService.listAllClientInstallments(clientProfile.id).then(installments => {
                setGlobalClientInstallments(installments);
            }).catch(console.error);
        }
    }, [clientProfile, activeTab]);

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
                                                    formatter={(value: any) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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

                    {/* Previsão do Tempo */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-gray-900 font-bold flex items-center gap-2 mb-4">
                            <CloudSun className="w-5 h-5 text-indigo-400" />
                            Previsão do Tempo
                        </h3>

                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
                                        <Sun className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agora</div>
                                        <div className="flex items-end gap-1">
                                            <span className="text-2xl font-black text-gray-900">28°</span>
                                            <span className="text-sm font-bold text-gray-400">/18°</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold">Praticável</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { day: 'QUA', temp: '30°', icon: <Sun className="w-4 h-4 text-amber-500" /> },
                                    { day: 'QUI', temp: '28°', icon: <CloudSun className="w-4 h-4 text-amber-400" /> },
                                    { day: 'SEX', temp: '26°', icon: <CloudRain className="w-4 h-4 text-blue-400" /> },
                                    { day: 'SÁB', temp: '24°', icon: <CloudRain className="w-4 h-4 text-blue-500" /> },
                                ].map((d, i) => (
                                    <div key={i} className="bg-gray-50/50 p-2 rounded-xl flex flex-col items-center gap-1 border border-transparent hover:border-gray-100 transition-all">
                                        <span className="text-[9px] font-bold text-gray-500">{d.day}</span>
                                        {d.icon}
                                        <span className="text-[9px] font-black text-gray-900">{d.temp}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
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
            consolidatedInsts = consolidatedInsts.filter((i: any) => i.clientId === clientProfile.id);
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

        const handleUpdateFinancial = async (newInsts: any[]) => {
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
                                            onClick={() => setGenConfig({ ...genConfig, type: t as any })}
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

                                            const newInsts: any[] = [];
                                            const baseDate = new Date(startDate + 'T12:00:00');

                                            if (sinal > 0) newInsts.push({ id: 's' + Math.random().toString(36).substr(2, 5), description: 'SINAL / ENTRADA', value: sinal, dueDate: new Date().toISOString().split('T')[0], status: 'PENDING' });

                                            for (let i = 0; i < numMensais; i++) {
                                                const d = new Date(baseDate);
                                                d.setMonth(d.getMonth() + i);
                                                newInsts.push({
                                                    id: 'm' + i + Math.random().toString(36).substr(2, 5),
                                                    description: `PARCELA MENSAL ${i + 1}/${numMensais}`,
                                                    value: monthlyVal,
                                                    dueDate: d.toISOString().split('T')[0],
                                                    status: 'PENDING'
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
                                                    status: 'PENDING'
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
                                                    status: 'PENDING'
                                                });
                                            }

                                            if (chaves > 0) {
                                                const lastDate = new Date(baseDate);
                                                lastDate.setMonth(lastDate.getMonth() + Math.max(numMensais, numSeme * 6, numAnual * 12));
                                                newInsts.push({ id: 'c' + Math.random().toString(36).substr(2, 5), description: 'ENTREGA DAS CHAVES', value: chaves, dueDate: lastDate.toISOString().split('T')[0], status: 'PENDING' });
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
                                                            exportService.generateReceiptPDF(inst, settings, { name: clientProfile?.name || 'ORÇACLOUD' });
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
                                                    onClick={() => {
                                                        if (confirm('Remover esta parcela?')) {
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
                                                                        exportService.generateReceiptPDF(inst, settings, { name: clientProfile?.name || 'ORÇACLOUD' });
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
                                                                        onClick={() => {
                                                                            if (confirm('Remover esta parcela?')) {
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
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">Visualização do Cliente • OrçaCloud Platinum</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderDocumentos = () => {
        const displayDocs = currentClientDocs;

        const handleDownload = (doc: any) => {
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
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
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
                                displayDocs.map((doc: any, i) => (
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
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Remover este documento?')) {
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
                                        displayDocs.map((doc: any, i) => (
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
                                                                    onClick={() => {
                                                                        if (confirm('Remover este documento?')) {
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

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'jornada', label: 'Minha Jornada', icon: <Calendar className="w-4 h-4" /> },
        { id: 'visual', label: 'Visual', icon: <Camera className="w-4 h-4" /> },
        { id: 'personalizacao', label: 'Personalização', icon: <Palette className="w-4 h-4" /> },
        { id: 'diario', label: 'Diário de Obra', icon: <BookOpen className="w-4 h-4" /> },
        { id: 'documentos', label: 'Documentos', icon: <FileText className="w-4 h-4" /> },
        { id: 'financeiro', label: 'Financeiro e Contratos', icon: <DollarSign className="w-4 h-4" /> },
        { id: 'suporte', label: 'Suporte', icon: <ShieldCheck className="w-4 h-4" /> },
    ];

    if (isAdmin && !clientProfile) {
        return (
            <div className="min-h-screen bg-gray-50/30 lg:p-8 p-4">
                <ClientList onSelectClient={onClientSelect} />
            </div>
        );
    }

    return (
        <div className="space-y-8 min-h-screen bg-gray-50/30">
            {/* Main Header */}
            <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-gray-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-indigo-100/50 transition-colors duration-1000" />

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-100">
                                {settings.name.charAt(0)}
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                        {clientProfile?.name ? `Olá, ${clientProfile.name.split(' ')[0]}` : (
                                            profile?.role === UserProfile.RENTAL ? 'Área do Locatário' :
                                                profile?.role === UserProfile.ADMINISTRATION ? 'Gestão de Contrato' :
                                                    'Área do Cliente'
                                        )}
                                    </h1>
                                    {isAdmin && clientProfile && (
                                        <button
                                            onClick={() => onClientSelect?.(null as any)}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-indigo-100 text-gray-500 hover:text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-transparent hover:border-indigo-200"
                                        >
                                            <Users className="w-3 h-3" />
                                            Trocar Cliente
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-gray-400">
                                    {profile?.role === UserProfile.RENTAL ? 'Acompanhe seus aluguéis e solicitações' :
                                        profile?.role === UserProfile.ADMINISTRATION ? 'Status da construção e pagamentos' :
                                            'Bem-vindo à sua área exclusiva'}
                                    <span style={{ fontSize: '10px', color: 'red', marginLeft: '10px' }}>
                                        {/* Profile info removed from UI */}
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Delivery Countdown */}
                        {settings.schedule?.endDate && (
                            <div className="flex items-center gap-4 bg-indigo-50/50 px-6 py-3 rounded-2xl border border-indigo-100/50">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Previsão de Entrega</span>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-indigo-500" />
                                        <span className="text-sm font-black text-gray-900">
                                            {Math.max(0, Math.ceil((new Date(settings.schedule.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} dias
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">para a entrega das chaves</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-gray-400 tracking-wide uppercase mt-2">
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-100">
                                <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                                <span>{clientProfile?.city ? `${clientProfile.city}${clientProfile.neighborhood ? ' - ' + clientProfile.neighborhood : ''}` : settings.location || 'Localização'}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-100">
                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                                <span>{clientProfile?.email || 'Sem E-mail'}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-100">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <span>{clientProfile?.phone || '(--) ---------'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 md:gap-4 p-1.5 bg-white border border-gray-100 rounded-2xl w-fit shadow-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300
                            ${activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px]">
                {activeTab === 'dashboard' && (
                    <div className="space-y-10">
                        {/* AI Client Concierge Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                            <div className="lg:col-span-3">
                                {renderDashboard()}
                            </div>
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
                                            onAction={() => setActiveTab(aiInsight.actionable?.target as any)}
                                        />

                                        {/* Smart Shortcuts */}
                                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4">Acesso Rápido</h4>
                                            <div className="space-y-2">
                                                {[
                                                    { label: 'Manual do Proprietário', tab: 'documentos' },
                                                    { label: 'Assistência Técnica', tab: 'suporte' },
                                                    { label: 'Escolha de Acabamentos', tab: 'jornada' }
                                                ].map((link, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setActiveTab(link.tab as any)}
                                                        className="w-full text-left px-4 py-3 rounded-xl bg-gray-50 hover:bg-indigo-50 text-[11px] font-bold text-gray-600 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                                                    >
                                                        {link.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'jornada' && renderJornada()}
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
                {activeTab === 'financeiro' && renderFinanceiro()}
                {activeTab === 'suporte' && (
                    <div className="bg-white p-12 rounded-[2.5rem] border border-gray-100 flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6">
                            <ShieldCheck className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Assistência e Pós-Obra</h3>
                        <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">Este módulo estará disponível após a entrega das chaves para abertura de chamados técnicos e garantia.</p>
                        <button className="px-8 py-4 bg-gray-100 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
                            Abrir Chamado (Em breve)
                        </button>
                    </div>
                )}
            </div>

            {/* Decorative footer message */}
            <div className="text-center pt-10 pb-6 opacity-30 select-none pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Poderoso e intuitivo • OrçaCloud Platinum © 2026</p>
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
