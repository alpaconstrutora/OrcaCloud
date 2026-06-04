import React from 'react';
import { TrendingUp, PieChart as PieChartIcon, Building2, Wallet, Calculator, FileText } from 'lucide-react';
import { ProjectSettings, UserProfile, BudgetEntry, DiaryEntry } from '../types';
import { Investor, investorService } from '../services/investorService';
import { ProjectData } from '../services/projectService';
import { investorPortalService, InvestorReport, InvestorOpportunity } from '../services/investorPortalService';
import { marketDataService } from '../services/marketDataService';
import { aiService, AIInsight } from '../services/aiService';
import { storageService } from '../services/storageService';
import InvestmentSimulator from './InvestmentSimulator';
import AssetDetailModal from './AssetDetailModal';
import PaymentsPanel from './PaymentsPanel';
import TaxReport from './TaxReport';
import InvestorSummaryDashboard from './investor/InvestorSummaryDashboard';
import HoldingsList from './investor/HoldingsList';
import OpportunitiesTab from './investor/OpportunitiesTab';
import ReportsTab from './investor/ReportsTab';
import { HoldingItem, HistoricalPoint } from './investor/types';

interface InvestorDashboardProps {
    activeTab?: 'dashboard' | 'holdings' | 'opportunities' | 'reports';
    settings: ProjectSettings;
    budget?: BudgetEntry[];
    profile?: { group: string; role: string };
    investorProfile?: Investor | null;
    onUpdateSettings?: (settings: ProjectSettings) => void;
}

type TabId = 'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro';

const TABS = [
    { id: 'dashboard', label: 'Evolução', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'simulator', label: 'Simulador', icon: <Calculator className="w-4 h-4" /> },
    { id: 'holdings', label: 'Minhas Cotas', icon: <PieChartIcon className="w-4 h-4" /> },
    { id: 'financeiro', label: 'Financeiro', icon: <Wallet className="w-4 h-4" /> },
    { id: 'opportunities', label: 'Oportunidades', icon: <Building2 className="w-4 h-4" /> },
    { id: 'reports', label: 'Relatórios', icon: <FileText className="w-4 h-4" /> },
] as const;

const TAB_TITLES: Record<TabId, string> = {
    dashboard: 'Meu Patrimônio',
    holdings: 'Minhas Cotas',
    financeiro: 'Gestão Financeira',
    opportunities: 'Oportunidades',
    reports: 'Meus Documentos',
    simulator: 'Inteligência de Investimento',
};

const InvestorDashboard: React.FC<InvestorDashboardProps> = ({
    activeTab: initialTab, settings, profile, investorProfile, onUpdateSettings,
}) => {
    const [activeTab, setActiveTab] = React.useState<TabId>(initialTab || 'dashboard');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [filterStatus, setFilterStatus] = React.useState('Todos');
    const [cubValue, setCubValue] = React.useState(0);
    const [realProjects, setRealProjects] = React.useState<ProjectData[]>([]);
    const [benchmarkSeries, setBenchmarkSeries] = React.useState<any[]>([]);
    const [reports, setReports] = React.useState<InvestorReport[]>([]);
    const [opportunities, setOpportunities] = React.useState<InvestorOpportunity[]>([]);
    const [selectedAsset, setSelectedAsset] = React.useState<HoldingItem | null>(null);
    const [aiInsight, setAiInsight] = React.useState<AIInsight | null>(null);
    const [loadingAI, setLoadingAI] = React.useState(false);
    const [showSelic, setShowSelic] = React.useState(false);
    const [showIpca, setShowIpca] = React.useState(false);
    const [showIgpm, setShowIgpm] = React.useState(false);
    const [confirmModal, setConfirmModal] = React.useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [inputModal, setInputModal] = React.useState<{ label: string; onConfirm: (val: string) => void } | null>(null);
    const [inputValue, setInputValue] = React.useState('');

    const isAdmin = profile?.role === UserProfile.ADMIN
        || profile?.role === UserProfile.DEVELOPER
        || profile?.group === 'DESENVOLVEDOR';

    const openConfirm = (msg: string, onConfirm: () => void) => setConfirmModal({ msg, onConfirm });
    const openInput = (label: string, defaultValue: string, onConfirm: (val: string) => void) => {
        setInputValue(defaultValue);
        setInputModal({ label, onConfirm });
    };

    // ── Derived data ──────────────────────────────────────────────────────────

    const activeProjects = React.useMemo(() => {
        if (!realProjects.length) return [];
        if (investorProfile?.id) {
            return realProjects.filter(p =>
                (p.investor_id ?? p.settings?.investorId) === investorProfile.id &&
                p.settings?.classification === 'OBRA'
            );
        }
        if (isAdmin) return realProjects.filter(p => p.settings?.classification === 'OBRA');
        return [];
    }, [realProjects, investorProfile, isAdmin]);

    const stats = React.useMemo(() => {
        let totalEquity = 0;
        const holdings: HoldingItem[] = activeProjects.map(p => {
            const financialValue = p.settings?.financialInfo?.totalValue;
            const calculatedValue = (p.settings?.area || 0) * (p.settings?.cubRate || 0);
            const equityVal = financialValue || calculatedValue || 0;
            totalEquity += equityVal;
            return {
                id: p.id,
                name: p.name,
                location: p.settings?.location || 'Localização não informada',
                cota: '1x',
                equity: equityVal,
                currentValue: equityVal,
                status: p.settings?.obraStatus || 'Em Andamento',
                progress: p.settings?.obraProgress || 0,
            };
        });
        return {
            equity: totalEquity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            activeWorks: activeProjects.length,
            holdings,
        };
    }, [activeProjects]);

    const historicalData = React.useMemo((): HistoricalPoint[] => {
        if (!activeProjects.length) return [];
        let minDate = new Date();
        let hasDiary = false;
        activeProjects.forEach(p => {
            p.settings?.diaryEntries?.forEach((e: any) => {
                hasDiary = true;
                const d = new Date(e.date);
                if (d < minDate) minDate = d;
            });
        });
        if (!hasDiary) return [];
        const result: HistoricalPoint[] = [];
        const now = new Date();
        let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        while (current <= now) {
            const endOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0);
            const label = current.toLocaleDateString('pt-BR', { month: 'short' });
            let totalEquity = 0;
            activeProjects.forEach(p => {
                const projectValue = p.settings?.financialInfo?.totalValue ||
                    ((p.settings?.area || 0) * (p.settings?.cubRate || 0)) || 0;
                const entries = p.settings?.diaryEntries || [];
                const until = entries.filter((e: any) => new Date(e.date) <= endOfMonth).length;
                const progress = entries.length > 0 ? Math.min(100, (until / entries.length) * 100) : 0;
                totalEquity += projectValue * (progress / 100);
            });
            const monthLabel = current.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
            const yearLabel = String(current.getFullYear());
            const bm = benchmarkSeries.find((b: any) =>
                b.date.toLowerCase().includes(monthLabel) && b.date.includes(yearLabel)
            ) || { selic: 0, ipca: 0, igpm: 0 };
            result.push({ month: label, yield: totalEquity, percent: 0, ...bm });
            current.setMonth(current.getMonth() + 1);
        }
        return result;
    }, [activeProjects, benchmarkSeries]);

    const filteredHoldings = React.useMemo(() => {
        if (filterStatus === 'Todos') return stats.holdings;
        return stats.holdings.filter(h => h.status === filterStatus);
    }, [stats.holdings, filterStatus]);

    // ── Effects ───────────────────────────────────────────────────────────────

    React.useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab]);

    React.useEffect(() => {
        const orgId = settings?.organizationId;
        async function loadData() {
            try {
                const [cub, projectsList] = await Promise.all([
                    investorService.calculateCUB(),
                    import('../services/projectService').then(m => m.projectService.listProjects()),
                ]);
                setCubValue(cub);
                setRealProjects((projectsList || []) as unknown as ProjectData[]);
                setBenchmarkSeries(marketDataService.getBenchmarkSeries(12));
                if (orgId) {
                    const [r, o] = await Promise.all([
                        investorPortalService.listReports(orgId, investorProfile?.id ?? undefined),
                        investorPortalService.listOpportunities(orgId),
                    ]);
                    setReports(r);
                    setOpportunities(o);
                }
            } catch (err) {
                console.error('Error loading dashboard data', err);
            }
        }
        loadData();
    }, []);

    React.useEffect(() => {
        if (activeTab === 'dashboard' && !aiInsight) {
            setLoadingAI(true);
            aiService.analyzePortfolio({ summary: { equity: 0 }, holdings: stats.holdings } as any)
                .then(setAiInsight)
                .catch(e => console.error('AI Error', e))
                .finally(() => setLoadingAI(false));
        }
    }, [activeTab]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleUploadReport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const orgId = settings?.organizationId;
        if (!e.target.files?.length || !orgId) return;
        const file = e.target.files[0];
        try {
            const path = `reports/${Date.now()}_${file.name}`;
            await storageService.uploadFile('documents', path, file);
            const url = storageService.getPublicUrl('documents', path);
            const saved = await investorPortalService.addReport({
                organization_id: orgId,
                investor_id: investorProfile?.id ?? null,
                name: file.name.replace(/\.pdf$/i, ''),
                type: 'PDF',
                url,
                report_date: new Date().toLocaleDateString('pt-BR'),
            });
            setReports(prev => [saved, ...prev]);
        } catch (err) {
            console.error('Error uploading report:', err);
            alert('Erro ao enviar relatório.');
        }
    };

    const handleDeleteReport = (id: string) => {
        investorPortalService.deleteReport(id)
            .then(() => setReports(prev => prev.filter(r => r.id !== id)))
            .catch(err => console.error('Error deleting report', err));
    };

    const handleAddOpportunity = (title: string) => {
        const orgId = settings?.organizationId;
        if (!orgId) return;
        investorPortalService.addOpportunity({ organization_id: orgId, title, subtitle: 'Novo empreendimento' })
            .then(saved => setOpportunities(prev => [saved, ...prev]))
            .catch(err => console.error('Error adding opportunity', err));
    };

    const handleDeleteOpportunity = (id: string) => {
        investorPortalService.deleteOpportunity(id)
            .then(() => setOpportunities(prev => prev.filter(o => o.id !== id)))
            .catch(err => console.error('Error deleting opportunity', err));
    };

    const handleUpdateSummary = (key: 'monthlyYield' | 'totalCotas', val: string | number) => {
        if (!onUpdateSettings) return;
        onUpdateSettings({
            ...settings,
            investorData: {
                ...settings.investorData,
                summary: { ...settings.investorData?.summary, [key]: val },
            },
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const title = investorProfile?.name
        ? `Olá, ${investorProfile.name.split(' ')[0]}`
        : TAB_TITLES[activeTab];

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest mb-3">
                        <div className="w-5 h-1 bg-blue-600 rounded-full" />
                        {isAdmin ? 'Modo de Edição (Gestor)' : 'Exclusivo para Investidores'}
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">{title}</h1>
                </div>
                <div className="flex p-1.5 bg-gray-100 rounded-2xl w-fit">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabId)}
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

            {/* Content */}
            <main className="min-h-[500px]">
                {activeTab === 'dashboard' && (
                    <InvestorSummaryDashboard
                        cubValue={cubValue}
                        equity={stats.equity}
                        activeWorks={stats.activeWorks}
                        monthlyYield={settings.investorData?.summary?.monthlyYield}
                        historicalData={historicalData}
                        holdings={stats.holdings}
                        isAdmin={isAdmin}
                        showSelic={showSelic} showIpca={showIpca} showIgpm={showIgpm}
                        onToggleSelic={() => setShowSelic(v => !v)}
                        onToggleIpca={() => setShowIpca(v => !v)}
                        onToggleIgpm={() => setShowIgpm(v => !v)}
                        loadingAI={loadingAI}
                        aiInsight={aiInsight}
                        onEditField={handleUpdateSummary}
                        onNavigateToHoldings={() => setActiveTab('holdings')}
                        openInput={openInput}
                    />
                )}
                {activeTab === 'simulator' && <InvestmentSimulator />}
                {activeTab === 'holdings' && (
                    <HoldingsList
                        holdings={filteredHoldings}
                        filterStatus={filterStatus}
                        viewMode={viewMode}
                        onFilterChange={setFilterStatus}
                        onViewModeChange={setViewMode}
                        onSelectAsset={setSelectedAsset}
                    />
                )}
                {activeTab === 'financeiro' && (
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
                )}
                {activeTab === 'opportunities' && (
                    <OpportunitiesTab
                        opportunities={opportunities}
                        isAdmin={isAdmin}
                        viewMode={viewMode}
                        organizationId={settings?.organizationId}
                        onViewModeChange={setViewMode}
                        onAdd={handleAddOpportunity}
                        onDelete={handleDeleteOpportunity}
                        openConfirm={openConfirm}
                        openInput={openInput}
                    />
                )}
                {activeTab === 'reports' && (
                    <ReportsTab
                        reports={reports}
                        isAdmin={isAdmin}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        onUpload={handleUploadReport}
                        onDelete={handleDeleteReport}
                        openConfirm={openConfirm}
                    />
                )}
            </main>

            <div className="pt-12 text-center opacity-30 select-none pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Gestão de Ativos Premium • OrçaCloud Platinum</p>
            </div>

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                        <p className="text-base font-bold text-gray-900 mb-6">{confirmModal.msg}</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setConfirmModal(null)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                            <button
                                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                                className="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700"
                            >
                                Remover
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Input Modal */}
            {inputModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                        <label className="block text-sm font-bold text-gray-700 mb-3">{inputModal.label}</label>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { inputModal.onConfirm(inputValue); setInputModal(null); }
                                if (e.key === 'Escape') setInputModal(null);
                            }}
                            autoFocus
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setInputModal(null)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                            <button
                                onClick={() => { inputModal.onConfirm(inputValue); setInputModal(null); }}
                                className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAsset && (
                <AssetDetailModal project={selectedAsset} onClose={() => setSelectedAsset(null)} />
            )}
        </div>
    );
};

export default InvestorDashboard;
