import React from 'react';
import {
    AlertTriangle,
    Clock,
    DollarSign,
    Users,
    Package,
    TrendingDown,
    TrendingUp,
    ChevronDown,
    ShieldAlert,
    CheckCircle2
} from 'lucide-react';
import { HierarchyNode, ProjectSchedule, BudgetEntry, PurchaseOrder } from '../../types';

interface RiskItem {
    id: string;
    name: string;
    category: 'supply' | 'schedule' | 'cost' | 'resource';
    severity: 'high' | 'medium' | 'low';
    description: string;
    action: string;
    value?: number;
}

interface ScheduleRiskDashboardProps {
    hierarchy: HierarchyNode[];
    schedule: ProjectSchedule;
    budget: BudgetEntry[];
    orders: PurchaseOrder[];
    taskInsights: Record<string, { missingItems: number; missingCost: number; hasAlert: boolean; message: string }>;
    realizedState: { itemQty: Record<string, number>; realizedValues: Record<string, number> };
}

const SEVERITY_CONFIG = {
    high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'Alto' },
    medium: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', label: 'Médio' },
    low: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', label: 'Baixo' },
};

const CATEGORY_CONFIG = {
    supply: { icon: Package, color: 'text-red-600', bg: 'bg-red-100', label: 'Suprimentos', gradient: 'from-red-500 to-rose-600' },
    schedule: { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Prazo', gradient: 'from-orange-500 to-amber-600' },
    cost: { icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Custo', gradient: 'from-blue-500 to-indigo-600' },
    resource: { icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Recursos', gradient: 'from-emerald-500 to-teal-600' },
};

export const ScheduleRiskDashboard: React.FC<ScheduleRiskDashboardProps> = ({
    hierarchy,
    schedule,
    budget,
    orders,
    taskInsights,
    realizedState,
}) => {
    const [expandedCategory, setExpandedCategory] = React.useState<string | null>('supply');

    // ── Compute all risks ──
    const risks = React.useMemo(() => {
        const allRisks: RiskItem[] = [];
        const today = new Date();
        const itemSchedules = schedule.itemSchedules || [];

        // Helper to find node name
        const findNodeName = (id: string, nodes: HierarchyNode[]): string => {
            for (const n of nodes) {
                if (n.id === id) return n.name || n.data?.sinapiItem?.description || id;
                if (n.children) {
                    const found = findNodeName(id, n.children);
                    if (found) return found;
                }
            }
            return '';
        };

        // ━━━ 1. SUPPLY RISKS (from taskInsights) ━━━
        Object.entries(taskInsights).forEach(([id, insight]) => {
            const name = findNodeName(id, hierarchy);
            if (!name) return;
            allRisks.push({
                id: `supply-${id}`,
                name,
                category: 'supply',
                severity: insight.missingCost > 5000 ? 'high' : insight.missingCost > 1000 ? 'medium' : 'low',
                description: `${insight.missingItems} insumos sem pedido de compra aprovado (R$ ${insight.missingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
                action: 'Emitir pedido de compra urgente no módulo Suprimentos.',
                value: insight.missingCost,
            });
        });

        // ━━━ 2. SCHEDULE RISKS ━━━
        const traverseSchedule = (nodes: HierarchyNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'item') {
                    const sched = itemSchedules.find(s => s.id === node.id);
                    if (sched?.startDate && sched?.endDate) {
                        const endDate = new Date(sched.endDate);
                        const startDate = new Date(sched.startDate);
                        const daysUntilEnd = (endDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
                        const pct = node.total > 0 ? (node.realizedTotal / node.total * 100) : 0;
                        const totalDuration = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
                        const elapsed = (today.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
                        const expectedPct = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 0;

                        // Task is behind schedule
                        if (elapsed > 0 && expectedPct > 20 && pct < expectedPct * 0.5 && pct < 90) {
                            allRisks.push({
                                id: `schedule-${node.id}`,
                                name: node.data?.sinapiItem?.description || node.id,
                                category: 'schedule',
                                severity: pct < expectedPct * 0.25 ? 'high' : 'medium',
                                description: `Progresso ${pct.toFixed(0)}% — esperado ${expectedPct.toFixed(0)}%. Atraso de ${(expectedPct - pct).toFixed(0)}pp.`,
                                action: 'Revisar cronograma ou alocar mais recursos para acelerar.',
                            });
                        }

                        // Critical path task ending soon with low progress
                        if (sched.isCritical && daysUntilEnd <= 15 && daysUntilEnd > -5 && pct < 80) {
                            const existingScheduleRisk = allRisks.find(r => r.id === `schedule-${node.id}`);
                            if (!existingScheduleRisk) {
                                allRisks.push({
                                    id: `schedule-critical-${node.id}`,
                                    name: node.data?.sinapiItem?.description || node.id,
                                    category: 'schedule',
                                    severity: 'high',
                                    description: `Caminho crítico — termina em ${Math.ceil(daysUntilEnd)} dias com apenas ${pct.toFixed(0)}% concluído.`,
                                    action: 'Priorizar imediatamente: impacta o prazo final da obra.',
                                });
                            }
                        }
                    }
                }
                if (node.children) traverseSchedule(node.children);
            });
        };
        traverseSchedule(hierarchy);

        // ━━━ 3. COST RISKS ━━━
        const traverseCost = (nodes: HierarchyNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'item' && node.total > 500) {
                    const realized = node.realizedTotal || 0;
                    const pctRealized = node.total > 0 ? (realized / node.total) : 0;
                    // Over budget
                    if (realized > node.total * 1.15 && realized > 1000) {
                        const overrun = realized - node.total;
                        allRisks.push({
                            id: `cost-${node.id}`,
                            name: node.data?.sinapiItem?.description || node.id,
                            category: 'cost',
                            severity: pctRealized > 1.3 ? 'high' : 'medium',
                            description: `Custo realizado R$ ${realized.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} excede orçamento de R$ ${node.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${((pctRealized - 1) * 100).toFixed(0)}%.`,
                            action: 'Renegociar contratos ou revisar especificações técnicas.',
                            value: overrun,
                        });
                    }
                }
                if (node.children) traverseCost(node.children);
            });
        };
        traverseCost(hierarchy);

        // ━━━ 4. RESOURCE RISKS ━━━
        const tasksWithoutResources: string[] = [];
        const traverseResources = (nodes: HierarchyNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'item') {
                    const sched = itemSchedules.find(s => s.id === node.id);
                    if (sched?.startDate) {
                        const start = new Date(sched.startDate);
                        const daysUntil = (start.getTime() - today.getTime()) / (1000 * 3600 * 24);
                        if (daysUntil <= 30 && daysUntil >= -15) {
                            const hasResources = (sched as any).resourceAllocations && (sched as any).resourceAllocations.length > 0;
                            if (!hasResources) {
                                tasksWithoutResources.push(node.data?.sinapiItem?.description || node.id);
                            }
                        }
                    }
                }
                if (node.children) traverseResources(node.children);
            });
        };
        traverseResources(hierarchy);

        if (tasksWithoutResources.length > 3) {
            allRisks.push({
                id: 'resource-no-allocation',
                name: `${tasksWithoutResources.length} tarefas sem equipe`,
                category: 'resource',
                severity: tasksWithoutResources.length > 10 ? 'high' : 'medium',
                description: `${tasksWithoutResources.length} tarefas próximas (≤ 30 dias) não possuem equipe ou recurso alocado.`,
                action: 'Acessar aba "Recursos" e atribuir equipes às tarefas.',
            });
        } else if (tasksWithoutResources.length > 0) {
            tasksWithoutResources.forEach((name, i) => {
                allRisks.push({
                    id: `resource-${i}`,
                    name,
                    category: 'resource',
                    severity: 'low',
                    description: 'Tarefa próxima sem equipe ou recurso alocado.',
                    action: 'Alocar equipe antes do início da tarefa.',
                });
            });
        }

        return allRisks;
    }, [hierarchy, schedule, taskInsights, budget, orders, realizedState]);

    // ── KPI aggregations ──
    const kpis = React.useMemo(() => {
        const byCategory = {
            supply: risks.filter(r => r.category === 'supply'),
            schedule: risks.filter(r => r.category === 'schedule'),
            cost: risks.filter(r => r.category === 'cost'),
            resource: risks.filter(r => r.category === 'resource'),
        };
        const highCount = risks.filter(r => r.severity === 'high').length;
        const totalCostExposure = risks.reduce((sum, r) => sum + (r.value || 0), 0);
        return { byCategory, highCount, totalCostExposure, total: risks.length };
    }, [risks]);

    // ── Overall health score (0-100) ──
    const healthScore = React.useMemo(() => {
        if (risks.length === 0) return 100;
        const penalty = risks.reduce((sum, r) => {
            if (r.severity === 'high') return sum + 15;
            if (r.severity === 'medium') return sum + 7;
            return sum + 2;
        }, 0);
        return Math.max(0, Math.min(100, 100 - penalty));
    }, [risks]);

    const healthColor = healthScore >= 75 ? 'text-emerald-600' : healthScore >= 50 ? 'text-amber-600' : 'text-red-600';
    const healthBg = healthScore >= 75 ? 'from-emerald-500 to-green-600' : healthScore >= 50 ? 'from-amber-500 to-orange-600' : 'from-red-500 to-rose-600';

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[600px] animate-in fade-in duration-300">
            {/* ── Header ── */}
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${healthBg} text-white shadow-lg`}>
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900 tracking-tight">Dashboard de Riscos</h2>
                            <p className="text-xs text-gray-500 mt-0.5">Análise automatizada de riscos da obra em tempo real</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Saúde da Obra</p>
                            <p className={`text-2xl font-black ${healthColor}`}>{healthScore}<span className="text-sm font-bold text-gray-300">/100</span></p>
                        </div>
                        <div className={`w-12 h-12 rounded-full border-4 ${healthScore >= 75 ? 'border-emerald-200' : healthScore >= 50 ? 'border-amber-200' : 'border-red-200'} flex items-center justify-center`}>
                            {healthScore >= 75 ? (
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                            ) : healthScore >= 50 ? (
                                <AlertTriangle className="w-6 h-6 text-amber-500" />
                            ) : (
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6">
                {(Object.entries(CATEGORY_CONFIG) as [keyof typeof CATEGORY_CONFIG, typeof CATEGORY_CONFIG[keyof typeof CATEGORY_CONFIG]][]).map(([key, config]) => {
                    const categoryRisks = kpis.byCategory[key];
                    const highInCategory = categoryRisks.filter(r => r.severity === 'high').length;
                    const Icon = config.icon;
                    return (
                        <button
                            key={key}
                            onClick={() => setExpandedCategory(expandedCategory === key ? null : key)}
                            className={`relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 border-2 group cursor-pointer ${expandedCategory === key
                                ? 'border-gray-300 shadow-md bg-white scale-[1.02]'
                                : 'border-gray-100 shadow-sm bg-white hover:border-gray-200 hover:shadow-md'
                                }`}
                        >
                            <div className={`absolute top-0 right-0 w-20 h-20 rounded-full bg-gradient-to-br ${config.gradient} opacity-[0.07] -translate-y-6 translate-x-6`} />
                            <div className="flex items-start justify-between mb-3">
                                <div className={`p-2 rounded-xl ${config.bg} ${config.color}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                {highInCategory > 0 && (
                                    <span className="px-2 py-0.5 text-[10px] font-black bg-red-100 text-red-600 rounded-full animate-pulse">
                                        {highInCategory} crítico{highInCategory > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <p className="text-2xl font-black text-gray-900">{categoryRisks.length}</p>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">{config.label}</p>
                            <div className="flex items-center gap-1 mt-2">
                                <div className={`h-1.5 rounded-full flex-1 bg-gray-100 overflow-hidden`}>
                                    <div
                                        className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-500`}
                                        style={{ width: `${categoryRisks.length > 0 ? Math.min(100, categoryRisks.length * 20) : 0}%` }}
                                    />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Risk Details ── */}
            <div className="px-6 pb-6">
                {expandedCategory && (
                    <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-sm font-black text-gray-800">
                                Riscos de {CATEGORY_CONFIG[expandedCategory as keyof typeof CATEGORY_CONFIG]?.label}
                            </h3>
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                {kpis.byCategory[expandedCategory as keyof typeof kpis.byCategory]?.length || 0} encontrados
                            </span>
                        </div>

                        {kpis.byCategory[expandedCategory as keyof typeof kpis.byCategory]?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                <CheckCircle2 className="w-10 h-10 text-emerald-300 mb-3" />
                                <p className="text-sm font-bold text-gray-400">Nenhum risco identificado</p>
                                <p className="text-[10px] text-gray-300 mt-1">Tudo sob controle nesta categoria</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {kpis.byCategory[expandedCategory as keyof typeof kpis.byCategory]?.map((risk) => {
                                    const severityConf = SEVERITY_CONFIG[risk.severity];
                                    return (
                                        <div
                                            key={risk.id}
                                            className={`${severityConf.bg} ${severityConf.border} border rounded-xl p-4 transition-all hover:shadow-md`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <p className={`text-xs font-bold ${severityConf.text} truncate flex-1`} title={risk.name}>
                                                    {risk.name}
                                                </p>
                                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${severityConf.badge}`}>
                                                    {severityConf.label}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-600 leading-relaxed mb-2">{risk.description}</p>
                                            <div className="flex items-start gap-1.5 bg-white/60 rounded-lg px-2.5 py-1.5">
                                                <TrendingUp className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                                                <p className="text-[10px] font-medium text-blue-700">{risk.action}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {!expandedCategory && (
                    <div className="flex flex-col items-center justify-center py-12 bg-gray-50/30 rounded-2xl border border-dashed border-gray-200">
                        <ShieldAlert className="w-10 h-10 text-gray-200 mb-3" />
                        <p className="text-sm font-bold text-gray-400">Selecione uma categoria acima</p>
                        <p className="text-[10px] text-gray-300 mt-1">Clique em um dos cards para ver os riscos detalhados</p>
                    </div>
                )}

                {/* ── Summary Footer ── */}
                {risks.length > 0 && (
                    <div className="mt-6 flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3 border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-[10px] font-bold text-gray-500">{risks.filter(r => r.severity === 'high').length} Alto</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-bold text-gray-500">{risks.filter(r => r.severity === 'medium').length} Médio</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-[10px] font-bold text-gray-500">{risks.filter(r => r.severity === 'low').length} Baixo</span>
                            </div>
                        </div>
                        {kpis.totalCostExposure > 0 && (
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Exposição Total</p>
                                <p className="text-sm font-black text-red-600">R$ {kpis.totalCostExposure.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
