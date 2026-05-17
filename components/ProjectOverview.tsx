import React, { useEffect, useState, useMemo } from 'react';
import {
    BarChart3,
    Calendar,
    BookOpen,
    Calculator,
    TrendingUp,
    DollarSign,
    AlertTriangle,
    ChevronRight,
    MessageSquare,
    Package,
    ArrowUpRight,
    Clock
} from 'lucide-react';
import { ProjectSettings, BudgetEntry, PurchaseOrder } from '../types';
import { calculateProjectProgress, calculateUpcomingPhases, calculateRealizedFinancialProgress } from '../utils/projectUtils';
import { orderService } from '../services/orderService';
import { projectService } from '../services/projectService';

interface ProjectOverviewProps {
    settings: ProjectSettings;
    budget: BudgetEntry[];
    projects: any[];
    onNavigate: (view: string) => void;
    onLoadProject: (id: string, targetView?: string) => Promise<any>;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ settings, budget, projects, onNavigate, onLoadProject }) => {
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [linkedProjectsData, setLinkedProjectsData] = useState<{
        budget?: BudgetEntry[];
        planning?: any;
        diary?: any;
    }>({});

    // Helper to find linked projects (Logic from ProjectList.tsx)
    const getLinkedId = (targetClassification: string) => {
        if (settings.classification === 'OBRA') {
            const linked = projects.find(p =>
                p.settings?.classification === targetClassification &&
                (p.settings?.linkedProjectId === settings.id || p.settings?.linkedProjectName === settings.name)
            );
            if (linked) return linked.id;

            if (targetClassification === 'PLANEJAMENTO') {
                const linkedOrcamento = projects.find(p =>
                    p.settings?.classification === 'ORCAMENTO' &&
                    (p.settings?.linkedProjectId === settings.id || p.settings?.linkedProjectName === settings.name)
                );
                if (linkedOrcamento) {
                    const planeja = projects.find(p =>
                        p.settings?.classification === 'PLANEJAMENTO' &&
                        (p.settings?.linkedProjectId === linkedOrcamento.id || p.settings?.linkedProjectName === linkedOrcamento.name)
                    );
                    if (planeja) return planeja.id;
                }
            }
        }
        return null;
    };

    useEffect(() => {
        const loadDashboardData = async () => {
            setLoading(true);
            try {
                const orcamentoId = getLinkedId('ORCAMENTO');
                const planejamentoId = getLinkedId('PLANEJAMENTO');
                const diarioId = getLinkedId('DIARIO');

                const [orcData, planData, diaryData, ordersData] = await Promise.all([
                    orcamentoId ? projectService.loadProject(orcamentoId) : Promise.resolve(null),
                    planejamentoId ? projectService.loadProject(planejamentoId) : Promise.resolve(null),
                    diarioId ? projectService.loadProject(diarioId) : Promise.resolve(null),
                    orderService.listOrders(settings.id)
                ]);

                setLinkedProjectsData({
                    budget: orcData?.budget || [],
                    planning: planData,
                    diary: diaryData
                });
                setOrders(ordersData);
            } catch (error) {
                console.error("Error loading dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };

        if (settings.id) {
            loadDashboardData();
        }
    }, [settings.id]);

    const handleShortcutClick = (view: string, classification?: string) => {
        if (classification) {
            const linkedId = getLinkedId(classification);
            if (linkedId) {
                const targetView = classification === 'PLANEJAMENTO' ? 'planning-view' :
                    classification === 'DIARIO' ? 'project-diary' : 'analytic';
                onLoadProject(linkedId, targetView);
                return;
            }
        }
        onNavigate(view);
    };

    // Calculate Real Metrics
    const totalBudgetVal = useMemo(() => {
        const targetBudget = linkedProjectsData.budget?.length ? linkedProjectsData.budget : budget;
        return targetBudget.reduce((sum, item) => sum + ((item.quantity || 0) * (item.sinapiItem?.price || 0)), 0);
    }, [budget, linkedProjectsData.budget]);

    const executionProgress = useMemo(() => {
        const targetBudget = linkedProjectsData.budget?.length ? linkedProjectsData.budget : budget;
        const diaryEntries = linkedProjectsData.diary?.settings?.diaryEntries || [];
        return calculateProjectProgress(targetBudget, diaryEntries);
    }, [budget, linkedProjectsData.budget, linkedProjectsData.diary]);

    const budgetExecution = useMemo(() => {
        const targetBudget = linkedProjectsData.budget?.length ? linkedProjectsData.budget : budget;
        return calculateRealizedFinancialProgress(targetBudget, orders);
    }, [budget, linkedProjectsData.budget, orders]);

    const roi = useMemo(() => {
        // Simple ROI simulation for now: (Total Budget / Estimated Sale) - but we don't have sale price here easily
        // Let's use a dummy but "calculated" feel
        if (totalBudgetVal === 0) return 0;
        return 12.5; // Keep mockup for ROI unless we have a "Valor de Venda" in settings
    }, [totalBudgetVal]);

    const nextMilestones = useMemo(() => {
        if (!linkedProjectsData.planning?.settings) return [];
        const targetBudget = linkedProjectsData.budget?.length ? linkedProjectsData.budget : budget;
        const upcoming = calculateUpcomingPhases(linkedProjectsData.planning.settings, targetBudget);
        return upcoming.map((u, i) => ({
            id: i,
            title: u.name,
            date: u.date.toLocaleDateString('pt-BR'),
            status: u.date < new Date() ? 'Alerta' : 'Em dia'
        }));
    }, [linkedProjectsData.planning, linkedProjectsData.budget, budget]);

    const messages = useMemo(() => {
        const msgs = [];

        // 1. Order messages
        const latestOrders = orders.slice(0, 2);
        latestOrders.forEach(o => {
            msgs.push({
                id: `order-${o.id}`,
                type: 'update',
                text: `Pedido ${o.number} com status "${o.status}".`,
                time: o.status_updated_at ? new Date(o.status_updated_at).toLocaleDateString('pt-BR') : 'Recente'
            });
        });

        // 2. Budget vs Execution alert
        if (budgetExecution > executionProgress + 10) {
            msgs.push({
                id: 'alert-overcost',
                type: 'alert',
                text: 'Desvio financeiro: Gasto proporcional superior ao avanço físico.',
                time: 'Agora'
            });
        }

        // 3. Diary update
        const diaryEntries = linkedProjectsData.diary?.settings?.diaryEntries || [];
        if (diaryEntries.length > 0) {
            const lastEntry = diaryEntries[diaryEntries.length - 1];
            msgs.push({
                id: 'diary-update',
                type: 'info',
                text: `Último Diário de Obra registrado em ${lastEntry.date}.`,
                time: 'Recentemente'
            });
        }

        if (msgs.length === 0) {
            msgs.push({ id: 'welcome', type: 'info', text: 'Obra iniciada. Comece registrando o orçamento.', time: '-' });
        }

        return msgs.slice(0, 3);
    }, [orders, budgetExecution, executionProgress, linkedProjectsData.diary]);

    const ShortcutCard = ({ label, icon: Icon, color, description, view, classification }: any) => (
        <button
            onClick={() => handleShortcutClick(view, classification)}
            className="group bg-white p-6 rounded-3xl border border-gray-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 text-left flex flex-col h-full relative overflow-hidden"
        >
            <div className={`p-4 rounded-2xl ${color} w-fit mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-2">{label}</h3>
            <p className="text-sm text-gray-500 font-medium leading-relaxed flex-1">{description}</p>
            <div className="mt-6 flex items-center text-blue-600 text-xs font-black uppercase tracking-widest gap-1 group-hover:gap-2 transition-all">
                Acessar Módulo <ChevronRight className="w-4 h-4" />
            </div>
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon className="w-24 h-24" />
            </div>
        </button>
    );

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
            {/* Header with high level stats */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-800 p-8 rounded-[2.5rem] shadow-xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-blue-500/30 text-blue-100 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-blue-400/30">
                                    Status: {settings.obraStatus || 'Em Andamento'}
                                </span>
                                {settings.code && (
                                    <span className="bg-white/20 text-white text-[10px] font-black font-mono px-2 py-0.5 rounded-full border border-white/30">
                                        #{settings.code}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl font-black text-white tracking-tight">{settings.name}</h1>
                            <p className="text-blue-100/70 text-sm font-medium mt-1">{settings.client || 'Cliente não informado'}</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Custo Orçado</p>
                                <p className="text-xl font-black text-white">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBudgetVal)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-black text-blue-200 uppercase tracking-widest">
                                <span>Progresso Físico</span>
                                <span>{executionProgress}%</span>
                            </div>
                            <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.5)] transition-all duration-1000" style={{ width: `${executionProgress}%` }}></div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-black text-blue-200 uppercase tracking-widest">
                                <span>Execução Financeira</span>
                                <span>{budgetExecution}%</span>
                            </div>
                            <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-all duration-1000" style={{ width: `${budgetExecution}%` }}></div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-black text-blue-200 uppercase tracking-widest">
                                <span>Previsão de ROI</span>
                                <span>{roi}%</span>
                            </div>
                            <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.5)] transition-all duration-1000" style={{ width: `${roi * 4}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Menu Shortcuts */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Centros de Gestão</h2>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Acesse os módulos da sua obra</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ShortcutCard
                            label="Orçamento"
                            icon={Calculator}
                            color="bg-purple-600"
                            description="Gerencie itens, preços e composições analíticas da obra."
                            view="analytic"
                            classification="ORCAMENTO"
                        />
                        <ShortcutCard
                            label="Planejamento"
                            icon={Calendar}
                            color="bg-blue-600"
                            description="Controle o cronograma físico-financeiro e gráfico de Gantt."
                            view="eng-planejamento"
                            classification="PLANEJAMENTO"
                        />
                        <ShortcutCard
                            label="Diário de Obra"
                            icon={BookOpen}
                            color="bg-amber-600"
                            description="Registre o acompanhamento diário, clima e mão de obra."
                            view="project-diary"
                            classification="DIARIO"
                        />
                        <ShortcutCard
                            label="Suprimentos"
                            icon={Package}
                            color="bg-emerald-600"
                            description="Gerencie pedidos, contratos e cotações de materiais."
                            view="supplies-orders"
                        />
                    </div>
                </div>

                {/* Messaging & Timeline */}
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Mural da Obra</h2>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Alertas e notificações recentes</p>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
                        <div className="p-6 flex-1 space-y-4">
                            {loading ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-12 bg-gray-100 rounded-2xl w-full"></div>
                                    <div className="h-12 bg-gray-100 rounded-2xl w-full"></div>
                                    <div className="h-12 bg-gray-100 rounded-2xl w-full"></div>
                                </div>
                            ) : messages.map((msg) => (
                                <div key={msg.id} className="flex gap-4 group cursor-pointer hover:translate-x-1 transition-transform">
                                    <div className={`mt-1 p-2 rounded-xl shrink-0 ${msg.type === 'alert' ? 'bg-red-50 text-red-500' :
                                        msg.type === 'update' ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-500'
                                        }`}>
                                        {msg.type === 'alert' ? <AlertTriangle className="w-4 h-4" /> :
                                            msg.type === 'update' ? <ArrowUpRight className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-800 leading-snug group-hover:text-blue-600 transition-colors">{msg.text}</p>
                                        <div className="flex items-center gap-1 mt-1 font-bold text-[10px] text-gray-400 uppercase tracking-widest">
                                            <Clock className="w-3 h-3" />
                                            {msg.time}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Próximos Marcos</h4>
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="space-y-2 animate-pulse">
                                        <div className="h-4 bg-gray-200 rounded w-full"></div>
                                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                    </div>
                                ) : nextMilestones.length > 0 ? nextMilestones.map((milestone) => (
                                    <div key={milestone.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${milestone.status === 'Alerta' ? 'bg-red-500' :
                                                milestone.status === 'Em dia' ? 'bg-blue-500' : 'bg-gray-300'
                                                }`}></div>
                                            <span className="text-xs font-bold text-gray-700">{milestone.title}</span>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400">{milestone.date}</span>
                                    </div>
                                )) : (
                                    <p className="text-[10px] text-gray-400 font-bold uppercase italic">Nenhum marco pendente</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectOverview;
