import React from 'react';
import { TrendingUp, PieChart as PieChartIcon, Building2, Wallet, Calculator, FileText, Bell, LayoutGrid, RefreshCw, Smartphone, Settings2, Eye, EyeOff, X, CheckCircle2, XCircle } from 'lucide-react';
import { ProjectSettings, UserProfile, BudgetEntry, DiaryEntry } from '../types';
import { Investor, investorService } from '../services/investorService';
import { projectService, ProjectData } from '../services/projectService';
import { investorPortalService, InvestorReport, InvestorOpportunity, ReportCategory } from '../services/investorPortalService';
import { announcementsService } from '../services/announcementsService';
import CommunicationCenter from './investor/CommunicationCenter';
import MobilePreviewFrame from './MobilePreviewFrame';
import { investorPortalTokenService } from '../services/investorPortalTokenService';
import SpeManager from './investor/SpeManager';
import MonthlyReportTrigger from './investor/MonthlyReportTrigger';
import { investorContributionsService, InvestorFinancialSummary } from '../services/investorContributionsService';
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
    activeTab?: 'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro' | 'fiscal' | 'comunicados' | 'spe' | 'relatorios';
    settings: ProjectSettings;
    organizationId?: string;
    budget?: BudgetEntry[];
    profile?: { group: string; role: string };
    investorProfile?: Investor | null;
    onUpdateSettings?: (settings: ProjectSettings) => void;
    /** Oculta chrome de admin (prévia mobile e rota pública por token). */
    isPreview?: boolean;
    /** Token de acesso público. Quando presente, dados são buscados via RPCs anon. */
    portalToken?: string;
    /** Sobrescreve enabledTabIds derivado de investorProfile.settings (usado pela prévia mobile). */
    overrideEnabledTabIds?: string[];
}

type TabId = 'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro' | 'fiscal' | 'comunicados' | 'spe' | 'relatorios';

const TABS = [
    { id: 'dashboard', label: 'Evolução', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'simulator', label: 'Simulador', icon: <Calculator className="w-4 h-4" /> },
    { id: 'holdings', label: 'Cotas', icon: <PieChartIcon className="w-4 h-4" /> },
    { id: 'financeiro', label: 'Financeiro', icon: <Wallet className="w-4 h-4" /> },
    { id: 'fiscal', label: 'Fiscal e Tributário', icon: <FileText className="w-4 h-4" /> },
    { id: 'opportunities', label: 'Oportunidades', icon: <Building2 className="w-4 h-4" /> },
    { id: 'reports', label: 'Documentos', icon: <FileText className="w-4 h-4" /> },
    { id: 'comunicados', label: 'Comunicados', icon: <Bell className="w-4 h-4" /> },
    { id: 'spe', label: 'SPE', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'relatorios', label: 'Relatórios', icon: <RefreshCw className="w-4 h-4" /> },
] as const;

const PUBLIC_RENDERABLE_TAB_IDS: TabId[] = [
    'dashboard',
    'holdings',
    'opportunities',
    'reports',
];

const PUBLIC_TAB_LABELS: Partial<Record<TabId, string>> = {
    dashboard: 'Resumo',
    holdings: 'Carteira',
    opportunities: 'Oportunidades',
    reports: 'Documentos',
};

const TAB_TITLES: Record<TabId, string> = {
    dashboard: 'Meu Patrimônio',
    holdings: 'Minhas Cotas',
    financeiro: 'Gestão Financeira',
    fiscal: 'Fiscal e Tributário',
    opportunities: 'Oportunidades',
    reports: 'Documentos',
    simulator: 'Inteligência de Investimento',
    comunicados: 'Comunicados',
    spe: 'Gestão de SPEs',
    relatorios: 'Relatórios Mensais',
};

const InvestorDashboard: React.FC<InvestorDashboardProps> = ({
    activeTab: initialTab, settings, organizationId, profile, investorProfile, onUpdateSettings,
    isPreview = false, portalToken, overrideEnabledTabIds,
}) => {
    // Org canônica: prop activeOrganizationId tem precedência; settings.organizationId
    // só existe quando um projeto está carregado, então sem ele o portal não salvava.
    const orgId = organizationId ?? settings?.organizationId ?? investorProfile?.organization_id;
    const [activeTab, setActiveTab] = React.useState<TabId>(initialTab || 'dashboard');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [filterStatus, setFilterStatus] = React.useState('Todos');
    const [cubValue, setCubValue] = React.useState(0);
    const [realProjects, setRealProjects] = React.useState<ProjectData[]>([]);
    const [benchmarkSeries, setBenchmarkSeries] = React.useState<any[]>([]);
    const [reports, setReports] = React.useState<InvestorReport[]>([]);
    const [opportunities, setOpportunities] = React.useState<InvestorOpportunity[]>([]);
    const [uploadCategory, setUploadCategory] = React.useState<ReportCategory>('relatorio');
    const [summaries, setSummaries] = React.useState<Record<string, InvestorFinancialSummary>>({});
    const [investorParticipations, setInvestorParticipations] = React.useState<import('../services/investorContributionsService').InvestorParticipation[]>([]);
    const [investorContributions, setInvestorContributions] = React.useState<import('../services/investorContributionsService').InvestorContribution[]>([]);
    const [selectedAsset, setSelectedAsset] = React.useState<HoldingItem | null>(null);
    const [aiInsight, setAiInsight] = React.useState<AIInsight | null>(null);
    const [loadingAI, setLoadingAI] = React.useState(false);
    const [showSelic, setShowSelic] = React.useState(false);
    const [showIpca, setShowIpca] = React.useState(false);
    const [showIgpm, setShowIgpm] = React.useState(false);
    const [confirmModal, setConfirmModal] = React.useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [inputModal, setInputModal] = React.useState<{ label: string; onConfirm: (val: string) => void } | null>(null);
    const [inputValue, setInputValue] = React.useState('');

    const isAdmin = !isPreview && (
        profile?.role === UserProfile.ADMIN
        || profile?.role === UserProfile.DEVELOPER
        || profile?.group === 'DESENVOLVEDOR'
    );
    const isPublicExperience = isPreview || !!portalToken;

    const [showMobilePreview, setShowMobilePreview] = React.useState(false);
    const [showTabConfig, setShowTabConfig] = React.useState(false);
    const [portalAnnouncements, setPortalAnnouncements] = React.useState<any[]>([]);
    const [dataLoading, setDataLoading] = React.useState(true);
    const [dataError, setDataError] = React.useState<string | null>(null);

    // Tab visibility: estado local inicializado do investorProfile.settings
    const investorSettings = investorProfile?.settings ?? {};
    const deriveTabIds = () => {
        if (overrideEnabledTabIds) return overrideEnabledTabIds;
        const saved = investorProfile?.settings?.investorPortalTabs;
        return (saved ?? []).length > 0 ? saved! : TABS.map(t => t.id as string);
    };
    const [enabledTabIds, setEnabledTabIds] = React.useState<string[]>(deriveTabIds);

    // Sincroniza quando overrideEnabledTabIds muda (prévia mobile) ou investidor troca
    React.useEffect(() => {
        setEnabledTabIds(deriveTabIds());
    }, [investorProfile?.id, overrideEnabledTabIds?.join(',')]);

    const renderableTabs = React.useMemo(() => {
        if (!isPublicExperience) return TABS;
        return TABS.filter(t => PUBLIC_RENDERABLE_TAB_IDS.includes(t.id as TabId));
    }, [isPublicExperience]);

    // Admin ve todas para configurar; investidor ve so as habilitadas e renderizaveis.
    const navTabs = React.useMemo(() => {
        const visibleTabs = isAdmin ? TABS : renderableTabs.filter(t => enabledTabIds.includes(t.id));
        return visibleTabs.length > 0 ? visibleTabs : renderableTabs.filter(t => t.id === 'dashboard');
    }, [enabledTabIds, isAdmin, renderableTabs]);

    React.useEffect(() => {
        const canRenderActiveTab = navTabs.some(t => t.id === activeTab);
        if (!canRenderActiveTab) {
            setActiveTab((navTabs[0]?.id as TabId) ?? 'dashboard');
        }
    }, [activeTab, navTabs]);

    const toggleTabVisibility = async (tabId: string) => {
        if (!investorProfile?.id) return;
        const next = enabledTabIds.includes(tabId)
            ? enabledTabIds.filter(id => id !== tabId)
            : [...enabledTabIds, tabId];
        // Atualiza UI imediatamente
        setEnabledTabIds(next);
        try {
            const { investorService } = await import('../services/investorService');
            await investorService.saveInvestor({
                id: investorProfile.id,
                settings: { ...investorSettings, investorPortalTabs: next },
            });
        } catch (err) {
            console.error('Erro ao salvar abas do investidor:', err);
            // Reverte em caso de erro
            setEnabledTabIds(enabledTabIds);
        }
    };

    const openConfirm = (msg: string, onConfirm: () => void) => setConfirmModal({ msg, onConfirm });
    const openInput = (label: string, defaultValue: string, onConfirm: (val: string) => void) => {
        setInputValue(defaultValue);
        setInputModal({ label, onConfirm });
    };

    // ── Derived data ──────────────────────────────────────────────────────────

    const activeProjects = React.useMemo(() => {
        if (!realProjects.length) return [];
        if (investorProfile?.id) {
            // Projetos em que o investidor tem participação registrada (fonte primária)
            const partIds = new Set(investorParticipations.map(p => p.project_id));
            // Fallback: campo legacy investor_id / settings.investorId
            const legacyIds = new Set(
                realProjects
                    .filter(p => (p.investor_id ?? p.settings?.investorId) === investorProfile.id)
                    .map(p => p.id!)
            );
            const allIds = new Set([...partIds, ...legacyIds]);
            // Só retorna projetos explicitamente vinculados — nunca expõe dados de outros investidores
            return realProjects.filter(p => p.id && allIds.has(p.id));
        }
        if (isAdmin) return realProjects.filter(p => p.settings?.classification === 'OBRA');
        return [];
    }, [realProjects, investorProfile, isAdmin, investorParticipations]);

    const stats = React.useMemo(() => {
        let totalEquity = 0;
        const holdings: HoldingItem[] = activeProjects.map(p => {
            const financialValue = p.settings?.financialInfo?.totalValue;
            const calculatedValue = (p.settings?.area || 0) * (p.settings?.cubRate || 0);
            const projectValue = financialValue || calculatedValue || 0;

            const summary = p.id ? summaries[p.id] : undefined;
            const ownershipPct = summary?.ownershipPct ?? 0;
            // Patrimônio = participação do investidor no valor do empreendimento (ou valor total se sem participação registrada)
            const investorValue = ownershipPct > 0 ? projectValue * (ownershipPct / 100) : projectValue;
            const invested = summary?.totalContributed ?? 0;
            const roi = summary ? summary.roiRealized(investorValue) : undefined;

            totalEquity += investorValue;
            return {
                id: p.id,
                name: p.name,
                location: p.settings?.location || 'Localização não informada',
                cota: ownershipPct > 0 ? `${ownershipPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '1x',
                equity: investorValue,
                currentValue: investorValue,
                invested: invested || undefined,
                yoc: roi !== undefined ? roi / 100 : undefined,
                yield: roi !== undefined ? `${roi.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : undefined,
                status: p.settings?.obraStatus || 'Em Andamento',
                progress: p.settings?.obraProgress || 0,
            };
        });
        // Rendimento Mensal real: média mensal de dividendos/distribuições liquidados
        const totalDividends = Object.values(summaries).reduce((s, sm) => s + sm.totalDividends, 0);
        const totalContributed = Object.values(summaries).reduce((s, sm) => s + sm.totalContributed, 0);
        // Meses desde o primeiro aporte liquidado
        const firstPaid = investorContributions
            .filter(c => c.type === 'aporte' && c.status === 'liquidado' && c.paid_date)
            .map(c => new Date(c.paid_date!).getTime())
            .sort((a, b) => a - b)[0];
        const monthsElapsed = firstPaid
            ? Math.max(1, Math.round((Date.now() - firstPaid) / (1000 * 60 * 60 * 24 * 30)))
            : 0;
        const monthlyYieldPct = monthsElapsed > 0 && totalContributed > 0
            ? ((totalDividends / totalContributed) / monthsElapsed) * 100
            : null;

        return {
            equity: totalEquity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            activeWorks: activeProjects.length,
            holdings,
            monthlyYieldPct,
            totalContributed,
            totalDividends,
        };
    }, [activeProjects, summaries, investorContributions]);

    // Série histórica construída a partir de aportes reais (investor_contributions)
    const historicalData = React.useMemo((): HistoricalPoint[] => {
        // Usa contributions com paid_date como fonte primária
        const paid = investorContributions.filter(c => c.paid_date);
        if (paid.length === 0) {
            // Fallback: diaryEntries legadas
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
                const label = current.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
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
        }

        // Série real: acumulado de capital investido por mês (aportes liquidados)
        const dates = paid.map(c => new Date(c.paid_date!));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const result: HistoricalPoint[] = [];
        const now = new Date();
        let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        let cumAporte = 0;
        let cumDividendo = 0;

        while (current <= now) {
            const endOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0);
            investorContributions.forEach(c => {
                if (!c.paid_date || c.status !== 'liquidado') return;
                const d = new Date(c.paid_date);
                if (d > endOfMonth) return;
                // já contabilizado nos meses anteriores via acumulado — recalcula do zero abaixo
            });
            // Recalcula acumulados até o fim do mês corrente
            cumAporte = investorContributions
                .filter(c => c.type === 'aporte' && c.status === 'liquidado' && c.paid_date && new Date(c.paid_date) <= endOfMonth)
                .reduce((s, c) => s + Number(c.amount), 0);
            cumDividendo = investorContributions
                .filter(c => (c.type === 'dividendo' || c.type === 'distribuicao') && c.status === 'liquidado' && c.paid_date && new Date(c.paid_date) <= endOfMonth)
                .reduce((s, c) => s + Number(c.amount), 0);

            const label = current.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            const monthLabel = current.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
            const yearLabel = String(current.getFullYear());
            const bm = benchmarkSeries.find((b: any) =>
                b.date.toLowerCase().includes(monthLabel) && b.date.includes(yearLabel)
            ) || { selic: 0, ipca: 0, igpm: 0 };

            result.push({
                month: label,
                yield: cumAporte,           // capital investido acumulado
                percent: cumAporte > 0 ? (cumDividendo / cumAporte) * 100 : 0,
                ...bm,
            });
            current.setMonth(current.getMonth() + 1);
        }
        return result;
    }, [activeProjects, benchmarkSeries, investorContributions]);

    const filteredHoldings = React.useMemo(() => {
        if (filterStatus === 'Todos') return stats.holdings;
        return stats.holdings.filter(h => h.status === filterStatus);
    }, [stats.holdings, filterStatus]);

    // ── Effects ───────────────────────────────────────────────────────────────

    React.useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab]);

    // Carregamento via portalToken (anon) — substitui os effects autenticados
    React.useEffect(() => {
        if (!portalToken) return;
        let cancelled = false;
        setDataLoading(true);
        setDataError(null);
        (async () => {
            try {
                const [summary, rpts, opps, anns] = await Promise.all([
                    investorPortalTokenService.getSummaryByToken(portalToken),
                    investorPortalTokenService.getReportsByToken(portalToken),
                    investorPortalTokenService.getOpportunitiesByToken(portalToken),
                    investorPortalTokenService.getAnnouncementsByToken(portalToken),
                ]);
                const parts = summary.participations as import('../services/investorContributionsService').InvestorParticipation[];
                const contribs = summary.contributions as import('../services/investorContributionsService').InvestorContribution[];
                if (cancelled) return;
                setRealProjects(summary.projects as unknown as ProjectData[]);
                setInvestorParticipations(parts);
                setInvestorContributions(contribs);
                const projectIds = new Set([
                    ...parts.map(p => p.project_id),
                    ...contribs.map(c => c.project_id),
                ]);
                const computedSummaries: Record<string, InvestorFinancialSummary> = {};
                projectIds.forEach(pid => {
                    const cs = contribs.filter(c => c.project_id === pid);
                    const part = parts.find(p => p.project_id === pid);
                    const sum = (type: string, status?: string) =>
                        cs.filter(c => c.type === type && (!status || c.status === status))
                            .reduce((acc, c) => acc + Number(c.amount), 0);
                    const totalContributed = sum('aporte', 'liquidado');
                    const totalDividends = sum('dividendo', 'liquidado');
                    const totalWithdrawn = sum('retirada', 'liquidado') + sum('distribuicao', 'liquidado');
                    const pendingAmount = cs.filter(c => c.type === 'aporte' && (c.status === 'pendente' || c.status === 'atrasado')).reduce((acc, c) => acc + Number(c.amount), 0);
                    computedSummaries[pid] = {
                        totalContributed, totalWithdrawn, totalDividends, pendingAmount,
                        ownershipPct: part?.ownership_pct ?? 0,
                        committedAmount: part?.committed_amount ?? 0,
                        roiRealized: (currentValue: number) =>
                            totalContributed > 0 ? ((currentValue + totalDividends - totalContributed) / totalContributed) * 100 : 0,
                    };
                });
                setSummaries(computedSummaries);
                setReports(rpts);
                setOpportunities(opps);
                setPortalAnnouncements(anns);
            } catch (err) {
                console.error('Erro ao carregar portal do investidor:', err);
                if (!cancelled) setDataError('Não foi possível carregar os dados do portal. Tente novamente em alguns instantes.');
            } finally {
                if (!cancelled) setDataLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [portalToken]);

    React.useEffect(() => {
        if (portalToken) return; // modo anon: carregado acima
        let cancelled = false;
        async function loadData() {
            setDataLoading(true);
            setDataError(null);
            try {
                const [cub, projectsList] = await Promise.all([
                    investorService.calculateCUB(),
                    projectService.listProjects(),
                ]);
                if (cancelled) return;
                setCubValue(cub);
                setRealProjects((projectsList || []) as unknown as ProjectData[]);
                setBenchmarkSeries(marketDataService.getBenchmarkSeries(12));

                const investorId = investorProfile?.id;
                if (investorId) {
                    // Carrega participações e contribuições do investidor em uma única rodada
                    const [parts, contribs] = await Promise.all([
                        investorContributionsService.listParticipationsByInvestor(investorId),
                        investorContributionsService.listByInvestor(orgId ?? '', investorId),
                    ]);
                    setInvestorParticipations(parts);
                    setInvestorContributions(contribs);

                    // Deriva summaries localmente (sem N chamadas ao banco)
                    const projectIds = new Set([
                        ...parts.map(p => p.project_id),
                        ...contribs.map(c => c.project_id),
                    ]);
                    const computedSummaries: Record<string, InvestorFinancialSummary> = {};
                    projectIds.forEach(pid => {
                        const cs = contribs.filter(c => c.project_id === pid);
                        const part = parts.find(p => p.project_id === pid);
                        const sum = (type: string, status?: string) =>
                            cs.filter(c => c.type === type && (!status || c.status === status))
                              .reduce((acc, c) => acc + Number(c.amount), 0);
                        const totalContributed = sum('aporte', 'liquidado');
                        const totalDividends = sum('dividendo', 'liquidado');
                        const totalWithdrawn = sum('retirada', 'liquidado') + sum('distribuicao', 'liquidado');
                        const pendingAmount = cs.filter(c => c.type === 'aporte' && (c.status === 'pendente' || c.status === 'atrasado')).reduce((acc, c) => acc + Number(c.amount), 0);
                        computedSummaries[pid] = {
                            totalContributed, totalWithdrawn, totalDividends, pendingAmount,
                            ownershipPct: part?.ownership_pct ?? 0,
                            committedAmount: part?.committed_amount ?? 0,
                            roiRealized: (currentValue: number) =>
                                totalContributed > 0 ? ((currentValue + totalDividends - totalContributed) / totalContributed) * 100 : 0,
                        };
                    });
                    setSummaries(computedSummaries);
                }

                if (orgId) {
                    const [r, o] = await Promise.all([
                        investorPortalService.listReports(orgId, investorProfile?.id ?? undefined),
                        investorPortalService.listOpportunities(orgId, !isAdmin),
                    ]);
                    setReports(r);
                    setOpportunities(o);
                }
            } catch (err) {
                console.error('Error loading dashboard data', err);
                if (!cancelled) setDataError('Não foi possível carregar os dados do portal. Tente novamente em alguns instantes.');
            } finally {
                if (!cancelled) setDataLoading(false);
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, [orgId, investorProfile?.id, portalToken]);

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
        if (!e.target.files?.length || !orgId) return;
        const file = e.target.files[0];
        try {
            const path = `reports/${Date.now()}_${file.name}`;
            await storageService.uploadFile('documents', path, file);
            const url = storageService.getPublicUrl('documents', path);
            const saved = await investorPortalService.addReport({
                organization_id: orgId,
                investor_id: investorProfile?.id ?? null,
                name: file.name.replace(/\.(pdf|docx|xlsx)$/i, ''),
                type: 'PDF',
                category: uploadCategory,
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
            {/* Prévia Mobile — renderiza o portal como o investidor vê */}
            {showMobilePreview && !isPreview && (
                <MobilePreviewFrame onClose={() => setShowMobilePreview(false)} title="Prévia — Portal do Investidor">
                    <InvestorDashboard
                        settings={settings}
                        organizationId={organizationId}
                        investorProfile={investorProfile}
                        activeTab={activeTab}
                        isPreview
                        overrideEnabledTabIds={enabledTabIds}
                    />
                </MobilePreviewFrame>
            )}

            {/* Modal de configuração de abas */}
            {showTabConfig && investorProfile && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowTabConfig(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <Settings2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Portal do Investidor</h2>
                                    <p className="text-form-label font-bold text-gray-400 uppercase tracking-widest mt-0.5">Abas visíveis para {investorProfile.name.split(' ')[0]}</p>
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
                                            <span className={isVisible ? 'text-blue-500' : 'text-gray-300'}>{tab.icon}</span>
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
                                Clique em cada aba para alternar a visibilidade do investidor
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest mb-3">
                        <div className="w-5 h-1 bg-blue-600 rounded-full" />
                        {isAdmin ? 'Modo de Edição (Gestor)' : 'Exclusivo para Investidores'}
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">{title}</h1>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {/* Botão Prévia Mobile — somente admin */}
                    {isAdmin && (
                        <button
                            onClick={() => setShowMobilePreview(true)}
                            title="Visualizar como o investidor vê no celular"
                            className="hidden md:flex p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    )}
                    {/* Botão Configurar Abas — somente admin com investidor selecionado */}
                    {isAdmin && investorProfile && (
                        <button
                            onClick={() => setShowTabConfig(true)}
                            title="Configurar abas visíveis do investidor"
                            className="hidden md:flex p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
                    )}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {navTabs.map(tab => {
                            const hidden = isAdmin && !enabledTabIds.includes(tab.id);
                            const label = isPublicExperience ? (PUBLIC_TAB_LABELS[tab.id as TabId] ?? tab.label) : tab.label;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabId)}
                                    title={hidden ? 'Oculta para o investidor' : undefined}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-button font-black transition-all duration-200 uppercase tracking-widest whitespace-nowrap ${
                                        activeTab === tab.id
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : hidden
                                                ? 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                                                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                                    }`}
                                >
                                    {tab.icon}
                                    {label}
                                    {hidden && <EyeOff className="w-3 h-3 ml-0.5 opacity-60" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            {dataLoading ? (
                <main className="min-h-[500px] animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="h-full animate-pulse bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50" />
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                        <div className="h-4 w-40 bg-gray-100 rounded-full animate-pulse mb-6" />
                        <div className="h-64 bg-gray-50 rounded-2xl animate-pulse" />
                    </div>
                </main>
            ) : dataError ? (
                <main className="min-h-[500px] flex items-center justify-center">
                    <div className="bg-white rounded-3xl border border-red-100 shadow-sm p-8 max-w-md text-center">
                        <XCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-gray-900 mb-2">Dados indisponíveis</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{dataError}</p>
                    </div>
                </main>
            ) : (
            <main className="min-h-[500px]">
                {activeTab === 'dashboard' && (
                    <InvestorSummaryDashboard
                        equity={stats.equity}
                        activeWorks={stats.activeWorks}
                        monthlyYieldPct={stats.monthlyYieldPct}
                        totalContributed={stats.totalContributed}
                        totalDividends={stats.totalDividends}
                        historicalData={historicalData}
                        holdings={stats.holdings}
                        isAdmin={isAdmin}
                        loadingAI={loadingAI}
                        aiInsight={aiInsight}
                        onNavigateToHoldings={() => setActiveTab('holdings')}
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
                            <PaymentsPanel organizationId={orgId} investorId={investorProfile?.id} />
                        </section>
                    </div>
                )}
                {activeTab === 'fiscal' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <TaxReport
                            investorContributions={investorContributions}
                            activeProjects={activeProjects}
                        />
                    </div>
                )}
                {activeTab === 'opportunities' && (
                    <OpportunitiesTab
                        opportunities={opportunities}
                        isAdmin={isAdmin}
                        viewMode={viewMode}
                        organizationId={orgId}
                        investorProfile={investorProfile}
                        portalToken={portalToken}
                        onViewModeChange={setViewMode}
                        onDelete={handleDeleteOpportunity}
                        onUpdate={(updated) => setOpportunities(prev =>
                            prev.some(o => o.id === updated.id)
                                ? prev.map(o => o.id === updated.id ? updated : o)
                                : [updated, ...prev]
                        )}
                        openConfirm={openConfirm}
                    />
                )}
                {activeTab === 'reports' && (
                    <div className="space-y-6">
                        <ReportsTab
                            reports={reports}
                            isAdmin={isAdmin}
                            viewMode={viewMode}
                            uploadCategory={uploadCategory}
                            onViewModeChange={setViewMode}
                            onUploadCategoryChange={setUploadCategory}
                            onUpload={handleUploadReport}
                            onDelete={handleDeleteReport}
                            openConfirm={openConfirm}
                        />
                        {portalToken && (
                            <section className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Bell className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-lg font-black text-gray-900">Comunicados</h3>
                                </div>
                                {portalAnnouncements.length === 0 ? (
                                    <div className="text-center py-12 bg-white rounded-3xl border border-gray-100">
                                        <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                        <p className="font-bold text-gray-500">Nenhum comunicado publicado.</p>
                                    </div>
                                ) : portalAnnouncements.map((ann: any) => (
                                    <div key={ann.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{ann.type}</span>
                                                <h4 className="text-lg font-black text-gray-900 mt-0.5">{ann.title}</h4>
                                                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{ann.body}</p>
                                            </div>
                                            {ann.acknowledged
                                                ? <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-1" />
                                                : ann.requires_acknowledgment && (
                                                    <button
                                                        onClick={() => {
                                                            investorPortalTokenService.acknowledgeByToken(portalToken, ann.id)
                                                                .then(() => setPortalAnnouncements(prev =>
                                                                    prev.map(a => a.id === ann.id ? { ...a, acknowledged: true } : a)
                                                                ))
                                                                .catch(e => console.error(e));
                                                        }}
                                                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-button font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Confirmar
                                                    </button>
                                                )
                                            }
                                        </div>
                                        {ann.published_at && (
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                                                {new Date(ann.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </section>
                        )}
                    </div>
                )}
                {activeTab === 'comunicados' && (
                    portalToken ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {portalAnnouncements.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-100">
                                    <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                                    <p className="font-bold text-gray-500">Nenhum comunicado publicado.</p>
                                </div>
                            ) : portalAnnouncements.map((ann: any) => (
                                <div key={ann.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{ann.type}</span>
                                            <h3 className="text-lg font-black text-gray-900 mt-0.5">{ann.title}</h3>
                                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{ann.body}</p>
                                        </div>
                                        {ann.acknowledged
                                            ? <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-1" />
                                            : ann.requires_acknowledgment && (
                                                <button
                                                    onClick={() => {
                                                        investorPortalTokenService.acknowledgeByToken(portalToken, ann.id)
                                                            .then(() => setPortalAnnouncements(prev =>
                                                                prev.map(a => a.id === ann.id ? { ...a, acknowledged: true } : a)
                                                            ))
                                                            .catch(e => console.error(e));
                                                    }}
                                                    className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-button font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Confirmar
                                                </button>
                                            )
                                        }
                                    </div>
                                    {ann.published_at && (
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                                            {new Date(ann.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <CommunicationCenter
                            organizationId={orgId ?? ''}
                            investorId={investorProfile?.id}
                            isAdmin={isAdmin}
                        />
                    )
                )}
                {activeTab === 'spe' && !portalToken && (
                    <SpeManager
                        organizationId={orgId ?? ''}
                        isAdmin={isAdmin}
                    />
                )}
                {activeTab === 'relatorios' && isAdmin && !portalToken && (
                    <MonthlyReportTrigger
                        organizationId={orgId ?? ''}
                    />
                )}
            </main>
            )}

            <div className="pt-12 text-center opacity-30 select-none pointer-events-none">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.3em]">Gestão de Ativos Premium • Opura Platinum</p>
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

            {selectedAsset && (() => {
                const proj = activeProjects.find(p => p.id === selectedAsset.id);
                const diaryImages = (proj?.settings?.diaryEntries || [])
                    .flatMap((e: any) => e.images || []);
                return (
                    <AssetDetailModal
                        project={selectedAsset}
                        projectId={selectedAsset.id}
                        organizationId={orgId}
                        isAdmin={isAdmin}
                        diaryImages={diaryImages}
                        onClose={() => setSelectedAsset(null)}
                    />
                );
            })()}
        </div>
    );
};

export default InvestorDashboard;
