import React from 'react';
import {
    TrendingUp,
    PieChart as PieChartIcon,
    Building2,
    DollarSign,
    ArrowUpRight,
    Calendar,
    ChevronRight,
    Wallet,
    Calculator, // Icon for Simulator
    FileText,
    Pencil,
    Plus,
    X,
    LayoutDashboard,
    Table2,
    Download
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { ProjectSettings, UserProfile, BudgetEntry } from '../types';
import { Investor, investorService } from '../services/investorService';
import { calculateProjectProgress } from '../utils/projectUtils';
import InvestmentSimulator from './InvestmentSimulator';
import AssetDetailModal from './AssetDetailModal';
import { storageService } from '../services/storageService';
import { supabase } from '../lib/supabase';
import { aiService, AIInsight } from '../services/aiService';
import AIInsightCard from './AIInsightCard';
import PaymentsPanel from './PaymentsPanel';
import TaxReport from './TaxReport';
import { marketDataService } from '../services/marketDataService';
import CUBMarketPanel from './CUBMarketPanel';
import { Line } from 'recharts';

// Helper to calculate progress up to a specific date
const calculateProgressUntilDate = (budget: any[], diaryEntries: any[], date: Date) => {
    if (!budget || !diaryEntries) return 0;

    // Filter entries before or equal to date
    const validEntries = diaryEntries.filter(e => new Date(e.date) <= date);

    // Reuse the logic from calculateProjectProgress but with filtered entries
    const itemQty: Record<string, number> = {};
    validEntries.forEach(entry => {
        if (entry.status !== 'Recusado') {
            entry.activities?.forEach((activity: any) => {
                if (!itemQty[activity.itemId]) itemQty[activity.itemId] = 0;
                itemQty[activity.itemId] += activity.realizedQty || 0;
            });
        }
    });

    let totalPlanned = 0;
    let totalRealized = 0;

    budget.forEach(item => {
        const price = item.sinapiItem?.price || 0;
        const planned = item.quantity * price;
        const realizedQty = itemQty[item.id] || 0;
        const factor = item.quantity > 0 ? Math.min(realizedQty / item.quantity, 1) : 0;

        totalPlanned += planned;
        totalRealized += (planned * factor);
    });

    return totalPlanned === 0 ? 0 : (totalRealized / totalPlanned); // Fraction 0-1
};

interface InvestorDashboardProps {
    activeTab?: 'dashboard' | 'holdings' | 'opportunities' | 'reports';
    settings: ProjectSettings;
    budget?: BudgetEntry[];
    profile?: { group: string; role: string };
    investorProfile?: Investor | null;
    onUpdateSettings?: (settings: ProjectSettings) => void;
}

const InvestorDashboard: React.FC<InvestorDashboardProps> = ({ activeTab: initialTab, settings, budget, profile, investorProfile, onUpdateSettings }) => {
    const [activeTab, setActiveTab] = React.useState<'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro'>(initialTab || 'dashboard');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [cubValue, setCubValue] = React.useState<number>(0);
    const [realProjects, setRealProjects] = React.useState<any[]>([]);
    const [loadingProjects, setLoadingProjects] = React.useState(true);
    const [selectedAsset, setSelectedAsset] = React.useState<any | null>(null);
    const [filterStatus, setFilterStatus] = React.useState('Todos');
    const [aiInsight, setAiInsight] = React.useState<AIInsight | null>(null);
    const [loadingAI, setLoadingAI] = React.useState(false);
    const [benchmarkSeries, setBenchmarkSeries] = React.useState<any[]>([]);
    const [showSelic, setShowSelic] = React.useState(false);
    const [showIpca, setShowIpca] = React.useState(false);
    const [showIgpm, setShowIgpm] = React.useState(false);

    const isAdmin = profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER || profile?.group === 'DESENVOLVEDOR';

    // Derived Real Data
    const activeProjects = React.useMemo(() => {
        if (!realProjects.length) return [];
        // If Investor, filter by their ID
        if (investorProfile?.id) {
            return realProjects.filter(p => p.settings?.investorId === investorProfile.id && p.settings?.classification === 'OBRA');
        }
        // If Admin, show all OBRAS
        if (isAdmin) {
            return realProjects.filter(p => p.settings?.classification === 'OBRA');
        }
        return [];
    }, [realProjects, investorProfile, isAdmin]);

    const stats = React.useMemo(() => {
        let totalEquity = 0;
        let totalWorks = activeProjects.length;

        const holdingsList = activeProjects.map(p => {
            // Calculate Equity: Financial Info > Calculated (Area * CUB)
            const financialValue = p.settings?.financialInfo?.totalValue;
            const calculatedValue = (p.settings?.area || 0) * (p.settings?.cubRate || 0);
            const equityVal = financialValue || calculatedValue || 0;

            totalEquity += equityVal;

            const initialInvestment = equityVal * 0.8; // Simulated: 80% of current as initial for demo
            const yoc = 0.125; // Simulated 12.5% YoC

            return {
                id: p.id,
                name: p.name,
                location: p.settings?.location || 'Localização não informada',
                cota: '1x',
                invested: initialInvestment,
                equity: equityVal,
                currentValue: equityVal,
                status: p.settings?.obraStatus || 'Em Andamento',
                yield: '12.5%',
                progress: p.settings?.obraProgress || 0,
                yoc: yoc
            };
        });

        // Use manual overrides from settings if available (Hybrid approach), or just use real
        // For now, let's use REAL calculated values for the cards
        return {
            equity: totalEquity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            activeWorks: totalWorks,
            monthlyYield: 'R$ 0,00', // Still manual/placeholder
            holdings: holdingsList
        };
    }, [activeProjects]);

    // Use stats for existing investorData variable to minimize refactoring impact
    const calculatedInvestorData = {
        ...settings.investorData,
        summary: {
            ...settings.investorData?.summary,
            equity: stats.equity,
            activeWorks: stats.activeWorks
        },
        holdings: stats.holdings.length > 0 ? stats.holdings : (settings.investorData?.holdings || [])
    };

    // Alias it back to investorData so the rest of the component uses it
    const investorData = calculatedInvestorData;

    const filteredHoldings = React.useMemo(() => {
        const all = investorData.holdings || [];
        if (filterStatus === 'Todos') return all;
        return all.filter(h => h.status === filterStatus);
    }, [investorData.holdings, filterStatus]);

    const calculatedProgress = React.useMemo(() => calculateProjectProgress(budget || [], settings.diaryEntries), [budget, settings.diaryEntries]);

    React.useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    React.useEffect(() => {
        async function loadData() {
            try {
                // Parallel fetch CUB, Projects and Benchmarks
                const [cub, projectsList] = await Promise.all([
                    investorService.calculateCUB(),
                    import('../services/projectService').then(m => m.projectService.listProjects())
                ]);

                // Benchmarks can be fetched after or in parallel, but let's fix the call
                const benchmarks = marketDataService.getBenchmarkSeries(12);

                setCubValue(cub);
                setRealProjects(projectsList || []);
                setBenchmarkSeries(benchmarks);
            } catch (err) {
                console.error("Error loading dashboard data", err);
            } finally {
                setLoadingProjects(false);
            }
        }
        loadData();
    }, []);

    React.useEffect(() => {
        if (activeTab === 'dashboard' && !aiInsight) {
            const fetchAI = async () => {
                setLoadingAI(true);
                try {
                    const insight = await aiService.analyzePortfolio(investorData);
                    setAiInsight(insight);
                } catch (e) {
                    console.error("AI Error", e);
                } finally {
                    setLoadingAI(false);
                }
            };
            fetchAI();
        }
    }, [activeTab, investorData, aiInsight]);

    // Calculate Historical Evolution
    const historicalData = React.useMemo(() => {
        if (!activeProjects.length) return [];

        // Find earliest date
        let minDate = new Date();
        let hasDiary = false;

        activeProjects.forEach(p => {
            if (p.settings?.diaryEntries?.length) {
                hasDiary = true;
                p.settings.diaryEntries.forEach((e: any) => {
                    const d = new Date(e.date);
                    if (d < minDate) minDate = d;
                });
            }
        });

        // If no diary, return empty or single point
        if (!hasDiary) return [];

        // Generate months from minDate to Now
        const result = [];
        const now = new Date();
        let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

        while (current <= now) {
            // Set end of month
            const endOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0);
            const label = current.toLocaleDateString('pt-BR', { month: 'short' });

            let totalEquity = 0;

            activeProjects.forEach(p => {
                const projectValue = p.settings?.financialInfo?.totalValue ||
                    ((p.settings?.area || 0) * (p.settings?.cubRate || 0)) || 0;

                const progress = calculateProgressUntilDate(p.budget || [], p.settings?.diaryEntries || [], endOfMonth);
                totalEquity += (projectValue * progress);
            });

            // Find corresponding benchmark data for the current month
            const monthLabel = current.toLocaleString('en-US', { month: 'short' }).toLowerCase();
            const yearLabel = current.getFullYear().toString().slice(-2); // e.g., "23" for 2023
            const benchmark = benchmarkSeries.find(b =>
                b.date.toLowerCase().includes(monthLabel) && b.date.includes(yearLabel)
            ) || { selic: 0, ipca: 0, igpm: 0 };

            result.push({
                month: label,
                yield: totalEquity, // Using 'yield' key for chart compatibility
                percent: 0, // Satisfy type requirement
                selic: benchmark.selic,
                ipca: benchmark.ipca,
                igpm: benchmark.igpm,
                formatted: totalEquity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            });

            // Next month
            current.setMonth(current.getMonth() + 1);
        }

        return result;
    }, [activeProjects, benchmarkSeries]);

    // Merge historical into investorData
    if (historicalData.length > 0) {
        calculatedInvestorData.performance = historicalData;
    }

    const handleUploadReport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];
        const fileName = `${Date.now()}_${file.name}`;

        try {
            // Check global admin/dev permission
            if (!isAdmin) {
                alert('Apenas administradores podem enviar relatórios.');
                return;
            }

            const path = `reports/${fileName}`;
            await storageService.uploadFile('documents', path, file);
            const publicUrl = storageService.getPublicUrl('documents', path);

            // Add to report list
            const newReport = {
                name: file.name.replace('.pdf', ''),
                date: new Date().toLocaleDateString('pt-BR'),
                type: 'PDF',
                url: publicUrl
            };

            const currentReports = investorData.reports || [];
            handleUpdate('reports', [...currentReports, newReport]);

            alert('Relatório enviado com sucesso!');
        } catch (err) {
            console.error("Error uploading report:", err);
            alert("Erro ao enviar relatório.");
        }
    };

    const handleUpdate = (path: string, val: any) => {
        if (!onUpdateSettings) return;
        const newData = { ...investorData };
        const keys = path.split('.');
        let current = newData as any;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = val;
        onUpdateSettings({ ...settings, investorData: newData });
    };

    const renderDashboard = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* AI Advisor Insight */}
            {(loadingAI || aiInsight) && (
                <div className="max-w-4xl">
                    <AIInsightCard
                        loading={loadingAI}
                        title={aiInsight?.title || 'IA Advisor'}
                        content={aiInsight?.content || ''}
                        type={aiInsight?.type || 'info'}
                        onAction={() => alert('Em breve: Chat completo com o consultor de investimentos.')}
                    />
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                    { key: 'equity', label: 'Patrimônio em Cotas', icon: <Wallet className="w-6 h-6" />, color: 'blue', val: investorData.summary?.equity || 'R$ 0,00' },
                    { key: 'monthlyYield', label: 'Rendimento Mensal', icon: <TrendingUp className="w-6 h-6" />, color: 'emerald', val: investorData.summary?.monthlyYield || 'R$ 0,00' },
                    {
                        key: 'cub',
                        label: 'CUB Referência (R8N)',
                        icon: <DollarSign className="w-6 h-6" />,
                        color: 'indigo',
                        val: cubValue ? cubValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Calculando...'
                    },
                    { key: 'activeWorks', label: 'Obras Ativas', icon: <Building2 className="w-6 h-6" />, color: 'purple', val: investorData.summary?.activeWorks || 0 },
                ].map((stat) => (
                    <div key={stat.key} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group/stat">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-2 bg-${stat.color}-50 text-${stat.color}-600 rounded-lg`}>
                                {stat.icon}
                            </div>
                            {isAdmin && stat.key !== 'cub' && (
                                <button
                                    onClick={() => {
                                        const res = prompt(`${stat.label}:`, String(stat.val));
                                        if (res !== null) handleUpdate(`summary.${stat.key}`, stat.key === 'activeWorks' || stat.key === 'totalCotas' ? parseInt(res) : res);
                                    }}
                                    className="p-1 bg-gray-50 text-gray-400 rounded-lg hover:text-indigo-600 opacity-0 group-hover/stat:opacity-100 transition-opacity"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                        <h3 className="text-2xl font-bold text-gray-900">{stat.val}</h3>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Yield Chart (2/3) */}
                <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm relative group/chart">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex flex-wrap items-center gap-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                                Evolução de Patrimônio
                            </h3>
                            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                <button
                                    onClick={() => setShowSelic(!showSelic)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showSelic ? 'bg-[#CDA434] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-200'}`}
                                >
                                    Selic
                                </button>
                                <button
                                    onClick={() => setShowIpca(!showIpca)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showIpca ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-200'}`}
                                >
                                    IPCA
                                </button>
                                <button
                                    onClick={() => setShowIgpm(!showIgpm)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showIgpm ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-200'}`}
                                >
                                    IGP-M
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={investorData.performance || []}>
                                <defs>
                                    <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="yield" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
                                {showSelic && <Line type="monotone" dataKey="selic" stroke="#CDA434" strokeWidth={2} dot={false} />}
                                {showIpca && <Line type="monotone" dataKey="ipca" stroke="#6366f1" strokeWidth={2} dot={false} />}
                                {showIgpm && <Line type="monotone" dataKey="igpm" stroke="#10b981" strokeWidth={2} dot={false} />}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* My Holdings Brief (1/3) */}
                <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 font-black uppercase tracking-wider text-[10px] text-gray-400">Minhas Participações</h3>
                    <div className="space-y-6">
                        {(investorData.holdings || []).slice(0, 3).map((proj, i) => (
                            <div key={i} className="flex flex-col gap-2 p-4 border border-gray-50 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-gray-900">{proj.name}</span>
                                    <span className="text-[10px] bg-blue-100 text-blue-700 font-black px-2 py-0.5 rounded-lg uppercase">{proj.cota} Cotas</span>
                                </div>
                                <div className="flex justify-between items-end text-xs">
                                    <span className="text-gray-500 font-medium">{proj.status}</span>
                                    <span className="font-bold text-blue-600">{calculatedProgress}%</span>
                                </div>
                            </div>
                        ))}
                        <button
                            onClick={() => setActiveTab('holdings')}
                            className="w-full py-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors border-t border-gray-50 pt-4"
                        >
                            Ver todos os empreendimentos
                        </button>
                    </div>
                    {/* Market Data & Benchmarks */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Benchmarks e Mercado</h3>
                        </div>
                        <CUBMarketPanel />
                    </section>
                </div>
            </div >
        </div >
    );

    const renderHoldings = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-4 h-4" />
                    </button>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => {
                            const name = prompt('Nome do Imóvel:');
                            if (name) {
                                const newHoldings = [...(investorData.holdings || []), { name, cota: '1x', equity: 'R$ 0,00', status: 'Lançamento', yield: '0%', progress: 0 }];
                                handleUpdate('holdings', newHoldings);
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Empreendimento
                    </button>
                )}
            </div>

            {/* Status Filters */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
                {['Todos', 'Em Execução', 'Lançamento', 'Concluída'].map((status) => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filterStatus === status
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
                            }`}
                    >
                        {status}
                    </button>
                ))}
            </div>

            {viewMode === 'list' ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Empreendimento</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-center">Cotas</th>
                                <th className="px-6 py-4 text-center">Progresso</th>
                                <th className="px-6 py-4 text-right">Patrimônio</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredHoldings.map((proj, i) => (
                                <tr
                                    key={i}
                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedAsset(proj)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Building2 className="w-5 h-5" />
                                            </div>
                                            <span className="font-bold text-gray-900">{proj.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider">
                                            {proj.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-blue-600 text-sm">{proj.cota}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-blue-600 h-full" style={{ width: `${calculatedProgress}%` }} />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-400">{calculatedProgress}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-black text-gray-900">
                                        {typeof proj.equity === 'number' ? proj.equity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : proj.equity}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm('Remover este item?')) {
                                                            const newHoldings = (investorData.holdings || []).filter((_, index) => index !== i);
                                                            handleUpdate('holdings', newHoldings);
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {filteredHoldings.map((proj, i) => (
                        <div
                            key={i}
                            className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group relative"
                            onClick={() => setSelectedAsset(proj)}
                        >
                            {isAdmin && (
                                <button
                                    onClick={() => {
                                        if (confirm('Remover este item?')) {
                                            const newHoldings = (investorData.holdings || []).filter((_, index) => index !== i);
                                            handleUpdate('holdings', newHoldings);
                                        }
                                    }}
                                    className="absolute top-2 right-2 p-1 bg-red-50 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="h-40 bg-slate-100 relative">
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-blue-600 uppercase tracking-widest">{proj.status}</div>
                            </div>
                            <div className="p-6">
                                <h4 className="text-xl font-bold text-gray-900 mb-4">{proj.name}</h4>
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cotas</p>
                                        <p className="font-bold text-gray-900 text-lg">{proj.cota}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Rendimento</p>
                                        <p className="font-bold text-emerald-600 text-lg">{proj.yield}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-4">
                                    <div className="text-xs font-bold text-gray-500">Patrimônio Atual</div>
                                    <div className="text-lg font-black text-blue-600">
                                        {typeof proj.equity === 'number' ? proj.equity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : proj.equity}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso da Obra</span>
                                        <span className="text-sm font-bold text-blue-600">{calculatedProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="bg-blue-600 h-full transition-all duration-1000"
                                            style={{ width: `${calculatedProgress}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderOpportunities = () => (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <h3 className="text-xl font-bold text-gray-900">Oportunidades de Mercado</h3>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Grade"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Lista"
                        >
                            <Table2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => {
                            const title = prompt('Título da Oportunidade:');
                            if (title) {
                                const newOps = [...(investorData.opportunities || []), { title, subtitle: 'Novo empreendimento', yield: '15%', link: '#' }];
                                handleUpdate('opportunities', newOps);
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Oportunidade
                    </button>
                )}
            </div>
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-6">
                    {(investorData.opportunities || []).map((op, i) => (
                        <div key={i} className="bg-[#0B1727] p-12 rounded-[2rem] text-white relative overflow-hidden flex flex-col justify-center min-h-[300px] group">
                            {isAdmin && (
                                <button
                                    onClick={() => {
                                        if (confirm('Remover esta oportunidade?')) {
                                            const newOps = (investorData.opportunities || []).filter((_, index) => index !== i);
                                            handleUpdate('opportunities', newOps);
                                        }
                                    }}
                                    className="absolute top-6 right-6 p-2 bg-red-500/20 text-red-300 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] -mr-40 -mt-40"></div>
                            <div className="relative z-10 max-w-2xl">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/30 rounded-full text-xs font-black text-blue-200 uppercase tracking-widest mb-8">
                                    <Calendar className="w-4 h-4" />
                                    Reservas Abertas {op.openDate ? `• ${op.openDate}` : ''}
                                </div>
                                <h2 className="text-5xl font-black mb-6 leading-tight">{op.title}</h2>
                                <p className="text-xl text-blue-100/70 mb-10 leading-relaxed font-medium">{op.subtitle}. Retorno projetado de {op.yield} a.a.</p>
                                <div className="flex flex-wrap gap-4">
                                    <button className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-900/40">Garantir Cota</button>
                                    <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/10 backdrop-blur">Ver Memorial Descritivo</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Oportunidade</th>
                                <th className="px-6 py-4">Retorno Projetado</th>
                                <th className="px-6 py-4">Data de Reserva</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(investorData.opportunities || []).map((op, i) => (
                                <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900">{op.title}</span>
                                            <span className="text-xs text-gray-500">{op.subtitle}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-emerald-600">{op.yield} a.a.</td>
                                    <td className="px-6 py-4 text-gray-500 text-sm">{op.openDate || 'Em breve'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button className="text-xs font-bold text-blue-600 hover:text-blue-700">Ver Detalhes</button>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm('Remover esta oportunidade?')) {
                                                            const newOps = (investorData.opportunities || []).filter((_, index) => index !== i);
                                                            handleUpdate('opportunities', newOps);
                                                        }
                                                    }}
                                                    className="p-1 text-red-400 hover:text-red-600"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
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
    );

    const renderReports = () => (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Relatórios Disponíveis</h3>
                    <div className="flex items-center gap-4 mt-1">
                        <p className="text-sm text-gray-500">Extratos de rendimentos, informes e demonstrativos mensais.</p>
                        <div className="flex bg-gray-100 p-1 rounded-lg ml-2">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Grade"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
                {isAdmin && (
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer hover:bg-blue-700 transition-colors">
                        <Plus className="w-4 h-4" />
                        Adicionar Relatório
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleUploadReport}
                        />
                    </label>
                )}
            </div>
            {viewMode === 'list' ? (
                <div className="divide-y divide-gray-50">
                    {(investorData.reports || []).map((doc, i) => (
                        <div key={i} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer relative">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 rounded-xl transition-colors">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 block">{doc.name}</span>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{doc.date}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isAdmin && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Remover este relatório?')) {
                                                const newReports = (investorData.reports || []).filter((_, index) => index !== i);
                                                handleUpdate('reports', newReports);
                                            }
                                        }}
                                        className="p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if ((doc as any).url) {
                                            window.open((doc as any).url, '_blank');
                                        } else {
                                            alert('URL não disponível para este relatório');
                                        }
                                    }}
                                >
                                    <ArrowUpRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(investorData.reports || []).map((doc, i) => (
                        <div key={i} className="group flex flex-col items-center p-6 rounded-3xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer relative">
                            {isAdmin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Remover este relatório?')) {
                                            const newReports = (investorData.reports || []).filter((_, index) => index !== i);
                                            handleUpdate('reports', newReports);
                                        }
                                    }}
                                    className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                                <FileText className="w-8 h-8" />
                            </div>
                            <div className="text-center">
                                <span className="font-bold text-gray-900 block mb-1 uppercase tracking-tight text-sm">{doc.name}</span>
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{doc.date}</span>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button
                                    className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                                    onClick={() => (doc as any).url ? window.open((doc as any).url, '_blank') : alert('URL não disponível')}
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button className="p-2 bg-gray-100 text-gray-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                    <ArrowUpRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderFinanceiro = () => (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Fluxo de Caixa e Aportes</h3>
                </div>
                <PaymentsPanel />
            </section>

            <section>
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Fiscal e Tributário</h3>
                </div>
                <TaxReport />
            </section>
        </div>
    );

    const tabs = [
        { id: 'dashboard', label: 'Evolução', icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'simulator', label: 'Simulador', icon: <Calculator className="w-4 h-4" /> },
        { id: 'holdings', label: 'Minhas Cotas', icon: <PieChartIcon className="w-4 h-4" /> },
        { id: 'financeiro', label: 'Financeiro', icon: <Wallet className="w-4 h-4" /> },
        { id: 'opportunities', label: 'Oportunidades', icon: <Building2 className="w-4 h-4" /> },
        { id: 'reports', label: 'Relatórios', icon: <FileText className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-8 pb-12">
            {/* Dynamic Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest mb-3">
                        <div className="w-5 h-1 bg-blue-600 rounded-full"></div>
                        {isAdmin ? 'Modo de Edição (Gestor)' : 'Exclusivo para Investidores'}
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                        {investorProfile?.name ? `Olá, ${investorProfile.name.split(' ')[0]}` : (
                            <>
                                {activeTab === 'dashboard' && 'Meu Patrimônio'}
                                {activeTab === 'holdings' && 'Minhas Cotas'}
                                {activeTab === 'financeiro' && 'Gestão Financeira'}
                                {activeTab === 'opportunities' && 'Oportunidades'}
                                {activeTab === 'reports' && 'Meus Documentos'}
                                {activeTab === 'simulator' && 'Inteligência de Investimento'}
                            </>
                        )}
                    </h1>
                </div>

                <div className="flex p-1.5 bg-gray-100 rounded-2xl w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-300 uppercase tracking-widest ${activeTab === tab.id
                                ? 'bg-white text-blue-600 shadow-md scale-105'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Switcher */}
            <main className="min-h-[500px]">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'simulator' && <InvestmentSimulator />}
                {activeTab === 'holdings' && renderHoldings()}
                {activeTab === 'financeiro' && renderFinanceiro()}
                {activeTab === 'opportunities' && renderOpportunities()}
                {activeTab === 'reports' && renderReports()}
            </main>

            {/* Decorative Footer */}
            <div className="pt-12 text-center opacity-30 select-none pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Gestão de Ativos Premium • OrçaCloud Platinum</p>
            </div>
            {/* Asset Detail Modal */}
            {selectedAsset && (
                <AssetDetailModal
                    project={selectedAsset}
                    onClose={() => setSelectedAsset(null)}
                />
            )}
        </div>
    );
};

export default InvestorDashboard;
