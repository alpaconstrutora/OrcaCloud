import React, { useEffect, useState } from 'react';
import { projectService } from '../services/projectService';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import {
    Building2,
    FolderOpen,
    Users,
    TrendingUp,
    Clock,
    ChevronRight,
    DollarSign
} from 'lucide-react';

import { Organization, BudgetEntry } from '../types';
import { calculateProjectProgress } from '../utils/projectUtils';

interface GeneralDashboardProps {
    onNavigate: (view: string) => void;
    onLoadProject?: (id: string, targetView?: string) => void;
    organizations?: Organization[];
}

const GeneralDashboard: React.FC<GeneralDashboardProps> = ({ onNavigate, onLoadProject, organizations }) => {
    const [stats, setStats] = useState({
        totalProjects: 0,
        totalObras: 0,
        totalOrcamentos: 0,
        totalValue: 0,
        averageBdi: 0,
        averageProgress: 0,
        projectsByLocation: [] as { name: string, value: number }[],
        projectStatus: [] as { name: string, value: number, color: string }[]
    });
    const [recentProjects, setRecentProjects] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const projects = await projectService.listProjects();
                setRecentProjects(projects.slice(0, 5));

                // Calculate aggregate stats
                let totalValue = 0;
                let totalBdi = 0;
                let totalPhysicalProgress = 0;
                let totalObras = 0;
                let totalOrcamentos = 0;
                const locationMap = new Map<string, number>();
                const statusMap = {
                    'Em Andamento': { count: 0, color: '#3b82f6' },
                    'Finalizado': { count: 0, color: '#10b981' },
                    'Aprovado': { count: 0, color: '#8b5cf6' },
                    'Proposta': { count: 0, color: '#f59e0b' },
                };

                projects.forEach((p: any) => {
                    const isObra = p.settings?.classification === 'OBRA';
                    if (isObra) totalObras++;
                    else totalOrcamentos++;

                    const area = p.settings?.area || 0;
                    const cub = p.settings?.cubRate || 0;
                    const bdi = p.settings?.bdi || 0;
                    const estimatedValue = area * cub * (1 + bdi / 100);

                    totalValue += estimatedValue;
                    totalBdi += bdi;

                    // Calculate average physical progress
                    totalPhysicalProgress += calculateProjectProgress(p.budget || [], p.settings?.diaryEntries || []);

                    const loc = p.settings?.location || 'Não Definido';
                    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);

                    const status = p.settings?.status || 'Em Andamento';
                    if (statusMap[status as keyof typeof statusMap]) {
                        statusMap[status as keyof typeof statusMap].count++;
                    }
                });

                const locationData = Array.from(locationMap.entries()).map(([name, value]) => ({ name, value }));
                const statusData = Object.entries(statusMap)
                    .filter(([_, data]) => data.count > 0)
                    .map(([name, data]) => ({ name, value: data.count, color: data.color }));

                setStats({
                    totalProjects: projects.length,
                    totalObras,
                    totalOrcamentos,
                    totalValue,
                    averageBdi: projects.length > 0 ? totalBdi / projects.length : 0,
                    averageProgress: projects.length > 0 ? totalPhysicalProgress / projects.length : 0,
                    projectsByLocation: locationData,
                    projectStatus: statusData
                });
            } catch (error) {
                console.error("Error loading dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    const StatCard = ({ title, value, icon: Icon, color, trend, subtitle }: any) => (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 group hover:shadow-md transition-all duration-300">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
                    {subtitle && <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{subtitle}</p>}
                    {trend && (
                        <div className="flex items-center gap-1 mt-2 text-emerald-600 text-xs font-bold">
                            <TrendingUp className="w-3 h-3" />
                            <span>{trend}</span>
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-xl ${color} transition-transform group-hover:scale-110`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Painel de Controle</h1>
                    <p className="text-gray-500 mt-1">Bem-vindo de volta! Aqui está um resumo geral da sua conta.</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Engenharia"
                    value={stats.totalProjects}
                    subtitle={`${stats.totalObras} Obras | ${stats.totalOrcamentos} Orçamentos`}
                    icon={FolderOpen}
                    color="bg-blue-50 text-blue-600"
                    trend={`+ ${Math.round(stats.totalProjects * 0.1)} este mês`}
                />
                <StatCard
                    title="VGV Total (Est.)"
                    value={`R$ ${(stats.totalValue / 1000000).toFixed(1)}M`}
                    icon={DollarSign}
                    color="bg-emerald-50 text-emerald-600"
                    trend={`Ticket médio: R$ ${(stats.totalValue / (stats.totalProjects || 1) / 1000).toFixed(0)}k`}
                />
                <StatCard
                    title="Média de Avanço"
                    value={`${(stats as any).averageProgress?.toFixed(1) || 0}%`}
                    icon={TrendingUp}
                    color="bg-amber-50 text-amber-600"
                    trend="Avanço físico real"
                />
                <StatCard
                    title="Usuários Ativos"
                    value={organizations && organizations.length > 0
                        ? organizations.reduce((acc, org) => acc + (org.members?.length || 0), 0)
                        : 1}
                    icon={Users}
                    color="bg-purple-50 text-purple-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart Column */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                            Distribuição por Localização
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.projectsByLocation}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        cursor={{ fill: '#f8fafc' }}
                                    />
                                    <Bar dataKey="value" name="Obras" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-blue-600" />
                                Atividades Recentes
                            </h3>
                            <button
                                onClick={() => onNavigate('projects')}
                                className="text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
                            >
                                Ver todos
                            </button>
                        </div>
                        <div className="space-y-4">
                            {recentProjects.map((project) => (
                                <div
                                    key={project.id}
                                    onClick={() => onLoadProject?.(project.id, 'analytic')}
                                    className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 cursor-pointer group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <Building2 className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{project.name}</p>
                                            <p className="text-sm text-gray-500">{project.settings?.client || 'Cliente não definido'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center gap-6">
                                        <div className="hidden md:block">
                                            <p className="text-sm font-bold text-gray-900">
                                                R$ {((project.settings?.area || 0) * (project.settings?.cubRate || 0) * (1 + (project.settings?.bdi || 0) / 100) / 1000).toFixed(0)}k
                                            </p>
                                            <p className="text-xs text-gray-500">Valor Est.</p>
                                        </div>
                                        <div className="p-2 text-gray-400 group-hover:text-blue-600 group-hover:bg-white rounded-lg transition-all">
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-8">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl shadow-xl shadow-blue-200 text-white relative overflow-hidden">
                        {/* Decorative patterns */}
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>

                        <h4 className="text-xl font-bold mb-2">Plano Corporate</h4>
                        <p className="text-sm text-blue-100 mb-6">
                            Você está usando {organizations && organizations.length > 0
                                ? organizations.reduce((acc, org) => acc + (org.members?.length || 0), 0)
                                : 1} de 50 licenças disponíveis. Expanda sua operação com mais agilidade.
                        </p>
                        <button className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-all active:scale-95 shadow-lg">
                            Upgrade de Plano
                        </button>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-6">Status dos Orçamentos</h3>
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.projectStatus.length > 0 ? stats.projectStatus : [{ name: 'Sem Dados', value: 1, color: '#e2e8f0' }]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {(stats.projectStatus.length > 0 ? stats.projectStatus : [{ name: 'Sem Dados', value: 1, color: '#e2e8f0' }]).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-6 space-y-3">
                            {stats.projectStatus.length > 0 ? (
                                stats.projectStatus.map((status, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2 font-medium text-gray-600">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }}></span>
                                            {status.name}
                                        </span>
                                        <span className="font-bold text-gray-900">
                                            {Math.round((status.value / stats.totalProjects) * 100)}%
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-400 text-sm py-4">Nenhum orçamento para exibir.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GeneralDashboard;
