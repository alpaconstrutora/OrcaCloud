import React from 'react';
import { moverEntreAbas } from './ui/abasPeloTeclado';
import { TrendingUp, PieChart as PieChartIcon, Building2, Boxes, Wallet, Calculator, FileText, Bell, LayoutGrid, RefreshCw, Smartphone, Settings2, Eye, EyeOff, X, XCircle, ChevronDown, HelpCircle, MoreHorizontal, LogOut } from 'lucide-react';
import { ProjectSettings, UserProfile, BudgetEntry, DiaryEntry } from '../types';
import { useOrgContext } from '../hooks/useOrgContext';
import { Investor, investorService } from '../services/investorService';
import { projectService, ProjectData } from '../services/projectService';
import { investorPortalService, InvestorReport, InvestorOpportunity, ReportCategory } from '../services/investorPortalService';
import CommunicationCenter from './investor/CommunicationCenter';
import AnnouncementsManager from './investor/AnnouncementsManager';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import MobilePreviewFrame from './MobilePreviewFrame';
import { investorPortalTokenService } from '../services/investorPortalTokenService';
import SpeManager from './investor/SpeManager';
import MonthlyReportTrigger from './investor/MonthlyReportTrigger';
import { investorContributionsService } from '../services/investorContributionsService';
import { marketDataService } from '../services/marketDataService';
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
import { isObra } from '../utils/projectClassification';
// Vocabulário próprio do portal do investidor — exceção §24 do guia de UI
import PortalOverview from './investor/portal/PortalOverview';
import PortalHoldings from './investor/portal/PortalHoldings';
import PortalOpportunities from './investor/portal/PortalOpportunities';
import PortalDocuments from './investor/portal/PortalDocuments';
import PortalFinance from './investor/portal/PortalFinance';
import PortalFiscal from './investor/portal/PortalFiscal';
import PortalAnnouncements from './investor/portal/PortalAnnouncements';
import PortalSpes, { PortalSpe } from './investor/portal/PortalSpes';
import PortalEspelho from './investor/portal/PortalEspelho';
import { carteiraDoInvestidor, resumoDaCarteira } from '../utils/investidorCarteira';
import { useRealceDaAbaAtiva } from '../hooks/useRealceDaAbaAtiva';

interface InvestorDashboardProps {
    activeTab?: 'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro' | 'fiscal' | 'comunicados' | 'spe' | 'relatorios' | 'espelho';
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
    /**
     * Só no login por e-mail (16/11/2026, como Cliente/Fornecedor/Corretor): a mesma casca do link, com
     * "Sair". Sem ele é o acesso pelo link (faixa "Acesso via link público", sem sair).
     */
    onLogout?: () => void;
}

type TabId = 'dashboard' | 'holdings' | 'opportunities' | 'reports' | 'simulator' | 'financeiro' | 'fiscal' | 'comunicados' | 'spe' | 'relatorios' | 'espelho';

// ⚠️ Um nome por aba, para o gestor e para o investidor. Havia dois vocabulários
// ("Evolução"/"Cotas" no app, "Resumo"/"Carteira" no portal) e o gestor não
// achava no app a aba que o investidor citava.
const TABS = [
    { id: 'dashboard', label: 'Resumo', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'simulator', label: 'Simulador', icon: <Calculator className="w-4 h-4" /> },
    { id: 'holdings', label: 'Carteira', icon: <PieChartIcon className="w-4 h-4" /> },
    { id: 'financeiro', label: 'Financeiro', icon: <Wallet className="w-4 h-4" /> },
    { id: 'fiscal', label: 'Fiscal e Tributário', icon: <FileText className="w-4 h-4" /> },
    { id: 'opportunities', label: 'Oportunidades', icon: <Building2 className="w-4 h-4" /> },
    { id: 'reports', label: 'Documentos', icon: <FileText className="w-4 h-4" /> },
    { id: 'comunicados', label: 'Comunicados', icon: <Bell className="w-4 h-4" /> },
    { id: 'spe', label: 'SPE', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'espelho', label: 'Espelho de Vendas', icon: <Boxes className="w-4 h-4" /> },
    { id: 'relatorios', label: 'Relatórios', icon: <RefreshCw className="w-4 h-4" /> },
] as const;

// Todas as abas do módulo existem no portal do investidor. O que muda entre a
// visão do gestor e a do investidor é o CONTEÚDO (leitura x administração), não
// a lista de abas — quem decide o que o investidor vê é `investorPortalTabs`.
const PUBLIC_RENDERABLE_TAB_IDS: TabId[] = TABS.map(t => t.id as TabId);

/**
 * Abas que NASCEM DESLIGADAS para o investidor (decisão de 09/11/2026, Espelho de
 * Vendas 3D): o gestor liga por investidor em "Configurar abas". Investidor nunca
 * configurado vê todas MENOS estas; quem já tem a lista gravada não a tem lá.
 */
const ABAS_QUE_NASCEM_DESLIGADAS: TabId[] = ['espelho'];

const TAB_TITLES: Record<TabId, string> = {
    dashboard: 'Meu Patrimônio',
    holdings: 'Minha Carteira',
    financeiro: 'Gestão Financeira',
    fiscal: 'Fiscal e Tributário',
    opportunities: 'Oportunidades',
    reports: 'Documentos',
    simulator: 'Inteligência de Investimento',
    comunicados: 'Comunicados',
    spe: 'Gestão de SPEs',
    espelho: 'Espelho de Vendas',
    relatorios: 'Relatórios Mensais',
};

const InvestorDashboard: React.FC<InvestorDashboardProps> = ({
    activeTab: initialTab, settings, organizationId, profile, investorProfile, onUpdateSettings,
    isPreview = false, portalToken, overrideEnabledTabIds, onLogout,
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
    const [investorParticipations, setInvestorParticipations] = React.useState<import('../services/investorContributionsService').InvestorParticipation[]>([]);
    const [investorContributions, setInvestorContributions] = React.useState<import('../services/investorContributionsService').InvestorContribution[]>([]);
    const [selectedAsset, setSelectedAsset] = React.useState<HoldingItem | null>(null);
    const [showSelic, setShowSelic] = React.useState(false);
    const [showIpca, setShowIpca] = React.useState(false);
    const [showIgpm, setShowIgpm] = React.useState(false);
    const [inputModal, setInputModal] = React.useState<{ label: string; onConfirm: (val: string) => void } | null>(null);
    const [inputValue, setInputValue] = React.useState('');
    const [portalSpes, setPortalSpes] = React.useState<PortalSpe[]>([]);

    const isAdmin = !isPreview && (
        profile?.role === UserProfile.ADMIN
        || profile?.role === UserProfile.DEVELOPER
        || profile?.group === 'DESENVOLVEDOR'
    );
    // REGRA #5 (16/11/2026 — "Se no topo estava todas as organizações e não apareceu"): na visão do
    // gestor, oportunidades e relatórios seguem o seletor do topo; "Todas" = null = sem filtro (a RLS
    // recorta). Antes caíam na organização do INVESTOR selecionado e sumia o que era de outra org.
    const { orgId: orgDoTopo } = useOrgContext();
    const orgDaLista = isAdmin ? orgDoTopo : orgId;
    const isPublicExperience = isPreview || !!portalToken;

    const [showMobilePreview, setShowMobilePreview] = React.useState(false);
    const [showTabConfig, setShowTabConfig] = React.useState(false);
    const [showMoreSheet, setShowMoreSheet] = React.useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
    const accountMenuRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!isAccountMenuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setIsAccountMenuOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [isAccountMenuOpen]);
    const [portalAnnouncements, setPortalAnnouncements] = React.useState<any[]>([]);
    const [dataLoading, setDataLoading] = React.useState(true);
    const [dataError, setDataError] = React.useState<string | null>(null);

    // Tab visibility: estado local inicializado do investorProfile.settings
    const investorSettings = investorProfile?.settings ?? {};
    const deriveTabIds = () => {
        if (overrideEnabledTabIds) return overrideEnabledTabIds;
        const saved = investorProfile?.settings?.investorPortalTabs;
        // ⚠️ Lista VAZIA é configuração ("nenhuma aba"), não ausência de
        // configuração. Enquanto isto foi `saved.length > 0 ? saved : todas`, o
        // gestor que desligava todas as abas via o portal voltar com TODAS —
        // o oposto do que pediu. Só `undefined`/`null` significa "nunca configurado".
        return Array.isArray(saved) ? saved : TABS.map(t => t.id as string).filter(id => !ABAS_QUE_NASCEM_DESLIGADAS.includes(id as TabId));
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
    // Sem fallback: o segundo `length > 0 ? ... : dashboard` daqui reacendia a aba
    // Resumo mesmo com tudo desligado. Nenhuma aba habilitada = portal sem
    // conteudo, tratado com aviso proprio no lugar de reabrir uma aba sozinho.
    const navTabs = React.useMemo(
        () => (isAdmin ? [...TABS] : renderableTabs.filter(t => enabledTabIds.includes(t.id))),
        [enabledTabIds, isAdmin, renderableTabs],
    );
    const semAbasHabilitadas = isPublicExperience && navTabs.length === 0;

    React.useEffect(() => {
        if (navTabs.length === 0) return;   // nada habilitado: não force aba nenhuma
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

    // §14 — confirmação destrutiva usa o useConfirm() global. A assinatura
    // (msg, onConfirm) é mantida porque OpportunitiesTab/ReportsTab a recebem por prop.
    const confirm = useConfirm();
    const openConfirm = async (msg: string, onConfirm: () => void) => {
        if (await confirm({ title: msg, variant: 'danger', confirmLabel: 'Remover' })) onConfirm();
    };
    const openInput = (label: string, defaultValue: string, onConfirm: (val: string) => void) => {
        setInputValue(defaultValue);
        setInputModal({ label, onConfirm });
    };

    // ── Derived data ──────────────────────────────────────────────────────────

    const activeProjects = React.useMemo(() => {
        if (!realProjects.length) return [];
        if (investorProfile?.id) {
            // Projetos em que o investidor tem participação registrada (fonte primária)
            const partIds = new Set([
                ...investorParticipations.map(p => p.project_id),
                ...portalSpes.map(s => s.project_id).filter((id): id is string => !!id),
            ]);
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
        if (isAdmin) return realProjects.filter(p => isObra(p));
        return [];
    }, [realProjects, investorProfile, isAdmin, investorParticipations, portalSpes]);

    // Nome do empreendimento por id — as contribuições e SPEs só trazem project_id.
    const projectNames = React.useMemo(
        () => new Map(activeProjects.filter(p => p.id).map(p => [p.id as string, p.name])),
        [activeProjects],
    );

    const stats = React.useMemo(() => {
        // Uma regra para portal e gestor (Fase B, D2): o sócio da SPE é a participação; patrimônio = integralizado +
        // resultado da versão publicada × cotas; recebido = dividendo + distribuição (utils/investidorCarteira).
        const holdings: HoldingItem[] = carteiraDoInvestidor({
            obras: activeProjects as never,
            socios: portalSpes,
            participacoes: investorParticipations,
            lancamentos: investorContributions,
        });
        const r = resumoDaCarteira(holdings, investorContributions);
        return {
            equity: r.patrimonio != null ? r.patrimonio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—',
            activeWorks: holdings.length,
            holdings,
            monthlyYieldPct: r.rendimentoMensalPct,
            totalContributed: r.aportado,
            totalRecebido: r.recebido,
            retornoTotal: r.retornoTotal,
            retornoEmCaixa: r.retornoEmCaixa,
        };
    }, [activeProjects, portalSpes, investorParticipations, investorContributions]);

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
                const [summary, rpts, opps, anns, spes] = await Promise.all([
                    investorPortalTokenService.getSummaryByToken(portalToken),
                    investorPortalTokenService.getReportsByToken(portalToken),
                    investorPortalTokenService.getOpportunitiesByToken(portalToken),
                    investorPortalTokenService.getAnnouncementsByToken(portalToken),
                    investorPortalTokenService.getSpesByToken(portalToken),
                ]);
                const parts = summary.participations as import('../services/investorContributionsService').InvestorParticipation[];
                const contribs = summary.contributions as import('../services/investorContributionsService').InvestorContribution[];
                if (cancelled) return;
                setRealProjects(summary.projects as unknown as ProjectData[]);
                setInvestorParticipations(parts);
                setInvestorContributions(contribs);
                setReports(rpts);
                setOpportunities(opps);
                setPortalAnnouncements(anns);
                setPortalSpes(spes);
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
                    // 'ALL': a participação do investidor pode apontar qualquer projeto, e o
                    // ramo de admin logo abaixo já filtra com isObra() onde importa.
                    projectService.listProjects({ classifications: 'ALL' }),
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

                    // A carteira lê o sócio da SPE (Fase B1, plano 2026-11-21-portal-do-investidor-consolidacao).
                    setPortalSpes(await investorPortalService.sociosDoInvestidor(investorId) as unknown as PortalSpe[]);
                }

                if (isAdmin || orgId) {
                    const [r, o] = await Promise.all([
                        investorPortalService.listReports(orgDaLista, investorProfile?.id ?? undefined),
                        investorPortalService.listOpportunities(orgDaLista, !isAdmin),
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
    }, [orgId, orgDaLista, investorProfile?.id, portalToken]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleUploadReport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !orgId) return;
        const file = e.target.files[0];
        try {
            // A org no caminho é o que a policy do bucket confere (aplicar_20271116900800).
            const path = `reports/${orgId}/${Date.now()}_${file.name}`;
            await storageService.uploadFile('documents', path, file);
            // Bucket privado: `url` guarda o CAMINHO; quem abre assina (ReportsTab,
            // PortalDocuments → abrirDocumentoDoPortal).
            const url = path;
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

    // Modo link público (portalToken) — só nele renderizamos a casca própria do
    // portal (banner + header + sidebar), espelhando o Portal do Cliente
    // (isStandalone). No app autenticado a navegação já vem do Layout global.
    const isStandalone = !!portalToken;
    const investorDisplayName = investorProfile?.name || 'Investidor';
    // O realce da aba ativa desliza até a aba nova (barra lateral e barra do celular).
    const realceLateral = useRealceDaAbaAtiva<HTMLElement>(activeTab);
    const realceInferior = useRealceDaAbaAtiva<HTMLDivElement>(activeTab);

    return (
        <div className={isStandalone
            ? 'portal-mobile-font min-h-screen bg-[#F2F2F4] pb-24 md:pb-0 md:h-screen md:flex md:flex-col md:overflow-hidden'
            : 'portal-mobile-font space-y-6 pb-24 md:pb-12'}>{/* §20 — space-y-6 na raiz */}

            {/* ══ Casca do portal público — banner + header + sidebar (espelha o Portal do Cliente) ══ */}
            {isStandalone && !onLogout && (
                <div className="hidden md:flex h-9 bg-[#FDEDE8] border-b border-[#F3D9D1] items-center justify-center gap-3 shrink-0 text-xs font-bold text-[#C24428] uppercase tracking-wider">
                    <span>Acesso via link público</span>
                </div>
            )}
            {/* Celular, login por e-mail: "Sair" sempre à mão (o "Mais opções" só existe com mais de 5 abas). */}
            {isStandalone && onLogout && (
                <div className="md:hidden flex h-12 items-center justify-between border-b border-gray-100 bg-white px-4 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">Portal do Investidor</span>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <LogOut className="h-4 w-4" /> Sair
                    </button>
                </div>
            )}
            {isStandalone && (
                <header className="hidden md:flex h-16 border-b border-gray-100 bg-white items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1 bg-[#E1553C] text-white rounded-lg text-xs font-black uppercase tracking-wider">Portal do Investidor</div>
                        <h1 className="text-md font-bold text-gray-900 tracking-tight">Área do Investidor</h1>
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
                                {investorDisplayName.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-semibold text-gray-600">{investorDisplayName} (INVESTIDOR)</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isAccountMenuOpen && (
                            <div className="portal-menu absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E1553C] text-sm font-bold text-white">
                                            {investorDisplayName.charAt(0).toUpperCase()}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-bold text-gray-900">{investorDisplayName}</div>
                                            <div className="truncate text-xs text-gray-500">{investorProfile?.email || ''}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 p-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAccountMenuOpen(false)}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <HelpCircle className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Dúvidas? Fale com a incorporadora.</span>
                                    </button>
                                    {onLogout && (
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); onLogout(); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                            role="menuitem"
                                        >
                                            <LogOut className="h-4 w-4 text-gray-400" />
                                            <span className="flex-1">Sair</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </header>
            )}

            <div className={isStandalone ? 'md:flex md:flex-1 md:overflow-hidden md:min-h-0' : ''}>
                {isStandalone && (
                    <aside ref={realceLateral.ref} className="relative w-64 border-r border-gray-100 bg-gray-50 p-4 flex-col gap-1 shrink-0 overflow-y-auto hidden md:flex">
                        {realceLateral.pos && (
                            <span
                                aria-hidden="true"
                                className={`absolute left-0 top-0 rounded-xl bg-[#FDEDE8] border border-[#F3D9D1] ${realceLateral.transicao}`}
                                style={{ width: realceLateral.pos.largura, height: realceLateral.pos.altura, transform: `translate(${realceLateral.pos.x}px, ${realceLateral.pos.y}px)` }}
                            />
                        )}
                        {navTabs.map(tab => (
                            <button
                                key={tab.id}
                                data-ativo={activeTab === tab.id ? 'true' : undefined}
                                aria-current={activeTab === tab.id ? 'page' : undefined}
                                onClick={() => setActiveTab(tab.id as TabId)}
                                className={`relative flex items-center gap-3 w-full px-4 py-2.5 rounded-xl border border-transparent text-sm font-medium transition-colors duration-150 ${
                                    activeTab === tab.id
                                        ? 'text-[#C24428] font-semibold'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-white'
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </aside>
                )}
                <div className={isStandalone ? 'md:flex-1 md:overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-8' : 'space-y-8'}>
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
                            <Button variant="ghost" size="icon" onClick={() => setShowTabConfig(false)} className="text-gray-400 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        {/* Todas as 10 abas são configuráveis: o portal renderiza
                            todas, em versão de leitura. */}
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
                        <div className="px-8 pb-8 space-y-4">
                            <p className="text-xs font-bold text-gray-400 text-center uppercase tracking-widest">
                                Clique em cada aba para alternar a visibilidade do investidor
                            </p>
                            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                                {/* §21 — sentence case; o resto do modal ainda usa o
                                    estilo antigo em caixa alta (dívida pré-existente). */}
                                <p className="text-sm font-black text-gray-600 mb-2">O investidor vê em modo leitura</p>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    As mesmas abas do app, sem as ações de gestão: em <strong className="font-bold text-gray-500">SPE</strong> ele
                                    vê só a participação dele (nunca os outros sócios) e em <strong className="font-bold text-gray-500">Relatórios</strong> ele
                                    lê os relatórios publicados, sem o gatilho de emissão.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header — no portal do investidor a identidade já vem da casca
                (badge + menu de conta + sidebar), então o bloco de título some
                e o conteúdo começa pela faixa de KPIs, como no desenho de
                referência (§24). No app interno ele continua igual. */}
            <div className={`${isPublicExperience ? 'hidden' : 'flex'} flex-col md:flex-row md:items-end justify-between gap-6`}>
                {/* §20 — h1 text-3xl + subtítulo mt-1.5. A etiqueta em caixa alta
                    acima do título (e o text-4xl) eram anatomia própria desta tela. */}
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {isAdmin
                            ? `Modo de edição — configure o que ${investorProfile?.name?.split(' ')[0] ?? 'o investidor'} vê no portal.`
                            : 'Acompanhe seu patrimônio, aportes e documentos.'}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {/* Botão Prévia Mobile — somente admin */}
                    {isAdmin && (
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setShowMobilePreview(true)}
                            title="Visualizar como o investidor vê no celular"
                            className="hidden md:flex"
                        >
                            <Smartphone className="w-4 h-4" />
                        </Button>
                    )}
                    {/* Botão Configurar Abas — somente admin com investidor selecionado */}
                    {isAdmin && investorProfile && (
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setShowTabConfig(true)}
                            title="Configurar abas visíveis do investidor"
                            className="hidden md:flex"
                        >
                            <Settings2 className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* §19.1 — toolbar de abas canônica: card branco + trilho cinza, aba
                ativa branca com texto azul (não o azul sólido de botão primário),
                h-7, sentence case e flex-wrap (nunca overflow-x-auto, que corta
                aba sem avisar). No portal a navegação é a sidebar/barra inferior. */}
            <div className={`${isStandalone || isPublicExperience ? 'hidden' : 'hidden md:flex'} flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3`}>
                <div role="tablist" onKeyDown={moverEntreAbas} className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {navTabs.map(tab => {
                        const hidden = isAdmin && !enabledTabIds.includes(tab.id);
                        return (
                            <button type="button" role="tab" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1}
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabId)}
                                title={hidden ? 'Oculta para o investidor' : undefined}
                                className={`outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : hidden
                                            ? 'text-gray-300 hover:text-gray-400'
                                            : 'text-gray-700 hover:text-gray-900'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {hidden && <EyeOff className="w-3 h-3 ml-0.5 text-gray-300" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            {semAbasHabilitadas ? (
                <main className="min-h-[500px] flex items-center justify-center">
                    <div className="bg-white rounded-2xl border border-[#ECECEF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-8 max-w-md text-center">
                        <EyeOff className="w-9 h-9 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-[15px] font-semibold text-[#1F2430] mb-1.5">Portal em configuração</h3>
                        <p className="text-[13px] text-[#8A8F9A] leading-relaxed">
                            Nenhuma seção está liberada para você no momento. Fale com a incorporadora
                            para liberar o acesso.
                        </p>
                    </div>
                </main>
            ) : dataLoading ? (
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
            <main key={isPublicExperience ? activeTab : undefined} className={`min-h-[500px] ${isPublicExperience ? 'portal-troca' : ''}`}>
                {/* No portal, trocar de aba entra o conteúdo novo (portal-troca, index.css). As abas já
                    montam ao entrar (activeTab === …), então a key não muda o que é carregado. */}
                {activeTab === 'dashboard' && (
                    isPublicExperience ? (
                        <PortalOverview
                            equity={stats.equity}
                            activeWorks={stats.activeWorks}
                            monthlyYieldPct={stats.monthlyYieldPct}
                            totalContributed={stats.totalContributed}
                            totalRecebido={stats.totalRecebido}
                            retornoTotal={stats.retornoTotal}
                            retornoEmCaixa={stats.retornoEmCaixa}
                            holdings={stats.holdings}
                            contributions={investorContributions}
                            onSelectAsset={setSelectedAsset}
                            onNavigateToHoldings={() => setActiveTab('holdings')}
                        />
                    ) : (
                        <InvestorSummaryDashboard
                            equity={stats.equity}
                            activeWorks={stats.activeWorks}
                            monthlyYieldPct={stats.monthlyYieldPct}
                            totalContributed={stats.totalContributed}
                            totalRecebido={stats.totalRecebido}
                            retornoTotal={stats.retornoTotal}
                            retornoEmCaixa={stats.retornoEmCaixa}
                            historicalData={historicalData}
                            holdings={stats.holdings}
                            isAdmin={isAdmin}
                            onNavigateToHoldings={() => setActiveTab('holdings')}
                        />
                    )
                )}
                {activeTab === 'simulator' && (
                    isPublicExperience
                        ? <div className="bg-white rounded-2xl border border-[#ECECEF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5"><InvestmentSimulator /></div>
                        : <InvestmentSimulator />
                )}
                {activeTab === 'holdings' && (
                    isPublicExperience ? (
                        <PortalHoldings
                            holdings={filteredHoldings}
                            filterStatus={filterStatus}
                            onFilterChange={setFilterStatus}
                            onSelectAsset={setSelectedAsset}
                        />
                    ) : (
                        <HoldingsList
                            holdings={filteredHoldings}
                            filterStatus={filterStatus}
                            viewMode={viewMode}
                            onFilterChange={setFilterStatus}
                            onViewModeChange={setViewMode}
                            onSelectAsset={setSelectedAsset}
                        />
                    )
                )}
                {activeTab === 'financeiro' && (
                    isPublicExperience ? (
                        <PortalFinance contributions={investorContributions} projectNames={projectNames} />
                    ) : (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <section>
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Fluxo de Caixa e Aportes</h3>
                                </div>
                                <PaymentsPanel organizationId={orgId} investorId={investorProfile?.id} />
                            </section>
                        </div>
                    )
                )}
                {activeTab === 'fiscal' && (
                    isPublicExperience ? (
                        <PortalFiscal contributions={investorContributions} projectNames={projectNames} />
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <TaxReport
                                investorContributions={investorContributions}
                                activeProjects={activeProjects}
                            />
                        </div>
                    )
                )}
                {activeTab === 'opportunities' && (
                    isPublicExperience ? (
                        <PortalOpportunities
                            opportunities={opportunities}
                            investorProfile={investorProfile}
                            portalToken={portalToken}
                        />
                    ) : (
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
                    )
                )}
                {activeTab === 'reports' && isPublicExperience && (
                    <PortalDocuments reports={reports} portalToken={portalToken} />
                )}
                {activeTab === 'reports' && !isPublicExperience && (
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
                    </div>
                )}
                {activeTab === 'comunicados' && (
                    isPublicExperience ? (
                        <PortalAnnouncements
                            announcements={portalAnnouncements}
                            portalToken={portalToken}
                            onAcknowledged={(id, resposta) => setPortalAnnouncements(prev =>
                                prev.map(a => a.id === id ? { ...a, acknowledged: true, ...resposta } : a)
                            )}
                        />
                    ) : isAdmin ? (
                        // Gestor: CRUD dos comunicados, na organização do TOPO (REGRA #5) — lida
                        // dentro do componente, não daqui (16/11/2026).
                        <AnnouncementsManager />
                    ) : (
                        <CommunicationCenter
                            organizationId={orgId ?? ''}
                            investorId={investorProfile?.id}
                        />
                    )
                )}
                {activeTab === 'spe' && (
                    isPublicExperience ? (
                        // Somente leitura e só a participação DESTE investidor —
                        // o SpeManager do gestor lista todos os sócios da org.
                        <PortalSpes spes={portalSpes} />
                    ) : (
                        <SpeManager
                            organizationId={orgId ?? ''}
                            isAdmin={isAdmin}
                        />
                    )
                )}
                {activeTab === 'espelho' && (
                    // Uma tela só para o link e para o app: é leitura, e a função do
                    // banco decide quem pode ver as obras deste investidor.
                    <PortalEspelho portalToken={portalToken} investorId={investorProfile?.id} />
                )}
                {activeTab === 'relatorios' && (
                    isPublicExperience ? (
                        // Para o investidor, "Relatórios" é a leitura dos relatórios
                        // mensais publicados (investor_reports, category='relatorio');
                        // o gatilho de geração é do gestor.
                        <PortalDocuments
                            reports={reports}
                            portalToken={portalToken}
                            onlyCategory="relatorio"
                            title="Relatórios mensais"
                            subtitle="Evolução física, financeira e previsto × realizado"
                            emptyTitle="Nenhum relatório publicado"
                            emptySubtitle="Os relatórios mensais aparecem aqui assim que forem emitidos."
                        />
                    ) : (
                        isAdmin ? <MonthlyReportTrigger organizationId={orgId ?? ''} /> : null
                    )
                )}
            </main>
            )}

            <div className="hidden md:block pt-12 text-center opacity-30 select-none pointer-events-none">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.3em]">Gestão de Ativos Premium • Opura Platinum</p>
            </div>

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
                            className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setInputModal(null)}>Cancelar</Button>
                            <Button
                                onClick={() => { inputModal.onConfirm(inputValue); setInputModal(null); }}
                            >
                                Salvar
                            </Button>
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

            {/* Mobile Bottom Navigation — máx. 5 slots; excedente vai pro sheet "Mais" */}
            {(() => {
                const MAX_BAR = 5;
                const hasMore = navTabs.length > MAX_BAR;
                const barTabs = hasMore ? navTabs.slice(0, MAX_BAR - 1) : navTabs;
                const moreTabs = hasMore ? navTabs.slice(MAX_BAR - 1) : [];
                const moreActive = moreTabs.some(t => t.id === activeTab);
                return (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                        <div ref={realceInferior.ref} className="relative flex">
                            {realceInferior.pos && (
                                <span
                                    aria-hidden="true"
                                    className={`absolute top-0 left-0 w-8 h-0.5 bg-[#E1553C] rounded-full ${realceInferior.transicao}`}
                                    style={{ transform: `translateX(${realceInferior.pos.x + realceInferior.pos.largura / 2 - 16}px)` }}
                                />
                            )}
                            {barTabs.map(tab => {
                                const isActive = activeTab === tab.id;
                                const isVisible = enabledTabIds.includes(tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        data-ativo={isActive ? 'true' : undefined}
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={() => setActiveTab(tab.id as TabId)}
                                        className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                            ${isActive ? 'text-[#C24428]' : isAdmin && !isVisible ? 'text-gray-200' : 'text-gray-400'}
                                        `}
                                    >
                                        <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                                            {tab.icon}
                                        </span>
                                        <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                            {tab.label.split(' ')[0]}
                                        </span>
                                        {isAdmin && !isVisible && <EyeOff className="w-2 h-2 absolute top-2 right-2 text-gray-200" />}
                                    </button>
                                );
                            })}
                            {hasMore && (
                                <button
                                    data-ativo={moreActive ? 'true' : undefined}
                                    onClick={() => setShowMoreSheet(true)}
                                    className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative
                                        ${moreActive ? 'text-[#C24428]' : 'text-gray-400'}
                                    `}
                                >
                                    <span className={`transition-transform duration-200 ${moreActive ? 'scale-110' : ''}`}>
                                        <MoreHorizontal className="w-4 h-4" />
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                        Mais
                                    </span>
                                </button>
                            )}
                        </div>
                        {/* Safe area for iOS home indicator */}
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
                        <div className="portal-veu absolute inset-0 bg-black/40 backdrop-blur-sm" />
                        <div
                            className="portal-gaveta absolute bottom-0 inset-x-0 bg-white rounded-t-[2rem] shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center mb-4">Mais opções</p>
                            <div className="space-y-2">
                                {moreTabs.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    const isVisible = enabledTabIds.includes(tab.id);
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => { setActiveTab(tab.id as TabId); setShowMoreSheet(false); }}
                                            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                                                isActive
                                                    ? 'bg-[#FDEDE8] border-[#F3D9D1] text-[#C24428]'
                                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                            }`}
                                        >
                                            <span className={isActive ? 'text-[#C24428]' : 'text-gray-400'}>{tab.icon}</span>
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                            {isAdmin && !isVisible && <EyeOff className="w-3.5 h-3.5 ml-auto text-gray-300" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}
                </div>{/* /content column */}
            </div>{/* /body wrapper */}
        </div>
    );
};

export default InvestorDashboard;
