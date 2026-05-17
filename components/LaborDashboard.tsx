import React, { useMemo, useState } from 'react';
import { 
    Users, 
    Building2, 
    Clock, 
    TrendingUp, 
    ArrowLeft,
    Download,
    Search,
    Activity
} from 'lucide-react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Cell, 
    PieChart, 
    Pie,
    LineChart,
    Line
} from 'recharts';
import { DiaryEntry, LaborEntry } from '../types';
import { laborService, Employee, LaborCostSummary } from '../services/laborService';

interface LaborDashboardProps {
    projects: any[];
    onBack?: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

const LaborDashboard: React.FC<LaborDashboardProps> = ({ projects, onBack }) => {
    const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject] = useState<string>('all');
    const [dbEmployees, setDbEmployees] = useState<Employee[]>([]);
    const [dbSummary, setDbSummary] = useState<LaborCostSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const activeOrganizationId = projects[0]?.organization_id;

    // Buscar dados do novo módulo
    const fetchDbData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [emps, summary] = await Promise.all([
                laborService.listEmployees(activeOrganizationId),
                laborService.getCostSummary(activeOrganizationId, { 
                    dateStart: dateFilter.start, 
                    dateEnd: dateFilter.end 
                })
            ]);
            setDbEmployees(emps);
            setDbSummary(summary);
            setError(null);
        } catch (err: any) {
            console.error('Erro ao buscar dados do banco:', err);
            // Não bloqueia o dashboard se as tabelas novas ainda não existirem
            if (err.code !== 'PGRST205' && err.code !== '42P01') {
                setError('Alguns dados do novo módulo não puderam ser carregados.');
            }
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, dateFilter]);

    React.useEffect(() => {
        fetchDbData();
    }, [fetchDbData]);

    // 1. Processamento e Consolidação dos Dados
    const rawData = useMemo(() => {
        const diaryProjects = projects.filter(p => p.settings?.classification === 'DIARIO');
        const allEntries: { worker: string; project: string; date: string; hours: number; subLabel?: string; activities?: string }[] = [];

        diaryProjects.forEach(proj => {
            const entries = (proj.settings?.diaryEntries || []) as DiaryEntry[];
            entries.forEach(entry => {
                const dayActivities = (entry.activities || []).map(a => a.description).join(' • ');
                const labor = (entry.labor || []) as LaborEntry[];
                labor.forEach(lab => {
                    allEntries.push({
                        worker: lab.category,
                        project: proj.name,
                        date: entry.date,
                        hours: lab.hours || 0,
                        subLabel: lab.observations,
                        activities: dayActivities
                    });
                });
            });
        });

        // 1.1 Adicionar dados das novas tabelas (time_entries via summary)
        if (dbSummary && dbSummary.byEmployee) {
            dbSummary.byEmployee.forEach(empCost => {
                allEntries.push({
                    worker: empCost.name + ' (Novo Módulo)',
                    project: 'Obras Diversas',
                    date: dateFilter.end, 
                    hours: empCost.hours,
                    subLabel: 'Registro de Ponto Digital',
                    activities: 'Atividades registradas no módulo de mão de obra'
                });
            });
        }

        return allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [projects, dbSummary, dateFilter.end]);

    // 2. Filtros Aplicados
    const filteredData = useMemo(() => {
        return rawData.filter(item => {
            const dateMatch = item.date >= dateFilter.start && item.date <= dateFilter.end;
            const searchMatch = item.worker.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              item.project.toLowerCase().includes(searchTerm.toLowerCase());
            const projectMatch = selectedProject === 'all' || item.project === selectedProject;
            return dateMatch && searchMatch && projectMatch;
        });
    }, [rawData, dateFilter, searchTerm, selectedProject]);

    // 3. Agregações para Gráficos
    const statsByWorker = useMemo(() => {
        const map = new Map<string, number>();
        filteredData.forEach(item => {
            map.set(item.worker, (map.get(item.worker) || 0) + item.hours);
        });
        return Array.from(map.entries())
            .map(([name, hours]) => ({ name, hours }))
            .sort((a, b) => b.hours - a.hours);
    }, [filteredData]);

    const statsByProject = useMemo(() => {
        const map = new Map<string, number>();
        filteredData.forEach(item => {
            map.set(item.project, (map.get(item.project) || 0) + item.hours);
        });
        return Array.from(map.entries())
            .map(([name, hours]) => ({ name, hours }))
            .sort((a, b) => b.hours - a.hours);
    }, [filteredData]);

    const statsByDate = useMemo(() => {
        const map = new Map<string, number>();
        filteredData.forEach(item => {
            map.set(item.date, (map.get(item.date) || 0) + item.hours);
        });
        return Array.from(map.entries())
            .map(([date, hours]) => ({ date, hours }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(item => ({
                name: new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                hours: item.hours
            }));
    }, [filteredData]);

    const totals = useMemo(() => {
        const hours = filteredData.reduce((acc, item) => acc + item.hours, 0);
        const workers = new Set(filteredData.map(i => i.worker)).size;
        const projectsCount = new Set(filteredData.map(i => i.project)).size;
        return { hours, workers, projectsCount };
    }, [filteredData]);


    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6 space-y-6 overflow-y-auto">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button onClick={onBack} className="p-2.5 hover:bg-slate-50 rounded-2xl transition-all">
                            <ArrowLeft className="w-5 h-5 text-slate-500" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <TrendingUp className="w-6 h-6 text-indigo-600" />
                            </div>
                            Análise de Mão de Obra
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Insights consolidados de todos os diários de obra
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                        <input 
                            type="date" 
                            value={dateFilter.start}
                            onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 py-1.5 focus:bg-white rounded-xl transition-all"
                        />
                        <div className="flex items-center px-1 text-slate-300 font-bold"> até </div>
                        <input 
                            type="date" 
                            value={dateFilter.end}
                            onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 py-1.5 focus:bg-white rounded-xl transition-all"
                        />
                    </div>
                    
                    <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10">
                        <Download className="w-4 h-4" />
                        Exportar Relatório
                    </button>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 -mr-16 -mt-16 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total de Horas</p>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{totals.hours.toLocaleString('pt-BR')}h</h3>
                            <p className="text-[10px] font-bold text-indigo-600 mt-2 bg-indigo-50 px-2 py-1 rounded-lg inline-block">PERÍODO SELECIONADO</p>
                        </div>
                        <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100">
                            <Clock className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 -mr-16 -mt-16 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Mão de Obra Ativa</p>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{totals.workers} Colaboradores</h3>
                            <p className="text-[10px] font-bold text-emerald-600 mt-2 bg-emerald-50 px-2 py-1 rounded-lg inline-block">TALENTOS ENGAJADOS</p>
                        </div>
                        <div className="p-4 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-100">
                            <Users className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 -mr-16 -mt-16 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Obras Cobertas</p>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{totals.projectsCount} Projetos</h3>
                            <p className="text-[10px] font-bold text-rose-600 mt-2 bg-rose-50 px-2 py-1 rounded-lg inline-block">COM REGISTROS DIÁRIOS</p>
                        </div>
                        <div className="p-4 bg-rose-600 rounded-2xl shadow-lg shadow-rose-100">
                            <Building2 className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Evolution Line Chart */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Evolução de Horas no Período</h3>
                        <Activity className="w-5 h-5 text-slate-300" />
                    </div>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={statsByDate}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 800 }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="hours" 
                                    stroke="#6366f1" 
                                    strokeWidth={4} 
                                    dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }} 
                                    activeDot={{ r: 8, strokeWidth: 0 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Worker Effort Bar Chart */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Esforço por Colaborador (Horas)</h3>
                        <Link2 className="w-5 h-5 text-slate-300" />
                    </div>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statsByWorker} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} width={80} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800 }} />
                                <Bar dataKey="hours" radius={[0, 10, 10, 0]} barSize={20}>
                                    {statsByWorker.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Project Distribution Pie Chart */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-[400px]">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Distribuição por Obra</h3>
                    <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8">
                        <div className="flex-1 h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statsByProject}
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="hours"
                                    >
                                        {statsByProject.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', fontWeight: 800 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="w-full md:w-48 space-y-2">
                            {statsByProject.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        <span className="font-bold text-slate-600 uppercase truncate max-w-[100px]">{item.name}</span>
                                    </div>
                                    <span className="font-black text-slate-900">{item.hours}h</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Recent Logs Table */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Registros de Mão de Obra</h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                                placeholder="Filtrar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all w-48"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left border-b border-slate-50">
                                    <th className="pb-3 pr-4">Data</th>
                                    <th className="pb-3 pr-4">Trabalhador</th>
                                    <th className="pb-3 pr-4">Obra</th>
                                    <th className="pb-3 text-right">Horas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredData.slice(0, 50).map((item, i) => (
                                    <tr key={i} className="group hover:bg-slate-50/50 transition-all">
                                        <td className="py-3 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                            {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 pr-4 min-w-[200px]">
                                            <div className="text-[10px] font-black text-slate-900 uppercase">{item.worker}</div>
                                            {item.subLabel && <div className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-0.5">{item.subLabel}</div>}
                                            {item.activities && (
                                                <div className="text-[8px] text-slate-400 italic mt-1.5 truncate max-w-[250px]">
                                                    { item.activities }
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block whitespace-nowrap">{item.project}</div>
                                        </td>
                                        <td className="py-3 text-right">
                                             <span className="text-[11px] font-black text-slate-900">{item.hours}h</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LaborDashboard;

function Link2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
