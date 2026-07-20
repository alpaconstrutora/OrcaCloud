// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { Building2, FileText, LayoutGrid, Send, CheckCircle2, DollarSign, Users, User, Briefcase, FolderOpen, Trophy, BookOpen, Calendar, MessageSquare, BarChart3, Activity, Link2, Smartphone, Settings2, Eye, EyeOff, X, Download, Share2 } from 'lucide-react';
import { downloadProposalPdf } from '../services/proposalPdfService';
import PropertyUnitMap from './common/PropertyUnitMap';
import BrokerProposalSimulator from './broker/BrokerProposalSimulator';
import BrokerLeadManager from './broker/BrokerLeadManager';
import BrokerDevelopments from './broker/BrokerDevelopments';
import BrokerCommissions from './broker/BrokerCommissions';
import BrokerMaterials from './broker/BrokerMaterials';
import BrokerRanking from './broker/BrokerRanking';
import BrokerTraining from './broker/BrokerTraining';
import BrokerEvents from './broker/BrokerEvents';
import BrokerChat from './broker/BrokerChat';
import BrokerAnalytics from './broker/BrokerAnalytics';
import BrokerHealthPanel from './broker/BrokerHealthPanel';
import BrokerIntegrations from './broker/BrokerIntegrations';
import MobilePreviewFrame from './MobilePreviewFrame';
import { useStore } from '../store/useStore';
import { commercialService } from '../services/commercialService';
import { brokerService } from '../services/brokerService';
import { brokerPortalService } from '../services/brokerPortalService';
import { PropertyStatus, UserProfile, ProfileGroup } from '../types';
import type { BrokerUnit, BrokerProposal, BrokerProfile } from '../types';
import type { PropertyDeal } from '../types/imovib';

type PortalTab = 'estoque' | 'empreendimentos' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes';

interface BrokerPortalProps {
    profile: { group: string; role: string; email?: string };
    activeTab?: PortalTab;
    organizationId?: string;
    /** Oculta chrome de admin (impersonação, seletor de org, botão de prévia). Usado na prévia mobile e na rota pública por token. */
    isPreview?: boolean;
    /** Token de acesso público. Quando presente, dados são buscados via RPCs anon (SECURITY DEFINER). */
    portalToken?: string;
    /** Corretor pré-selecionado na impersonação (usado quando admin clica em "Acessar Portal" na BrokerList). */
    initialBroker?: import('../types').BrokerProfile;
}

interface StatCardProps { title: string; value: string | number; subtext?: string; icon: React.ElementType; color: string }
const StatCard = ({ title, value, subtext, icon: Icon, color }: StatCardProps) => (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-all">
        <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900">{value}</h3>
            {subtext && <p className="text-xs mt-1.5 text-gray-500 font-medium">{subtext}</p>}
        </div>
        <div className={`p-4 rounded-2xl ${color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
            color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                color === 'amber' ? 'bg-amber-50 text-amber-600' :
                    color === 'blue' ? 'bg-blue-50 text-blue-600' :
                        color === 'purple' ? 'bg-purple-50 text-purple-600' :
                            'bg-gray-50 text-gray-600'
            }`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

const ALL_TABS: { id: PortalTab; label: string; icon: React.ElementType }[] = [
    { id: 'estoque', label: 'Estoque', icon: LayoutGrid },
    { id: 'empreendimentos', label: 'Empreendimentos', icon: Building2 },
    { id: 'propostas', label: 'Propostas', icon: FileText },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'comissoes', label: 'Comissões', icon: DollarSign },
    { id: 'materiais', label: 'Materiais', icon: FolderOpen },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'treinamento', label: 'Treinamento', icon: BookOpen },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'saude', label: 'Saúde', icon: Activity },
    { id: 'integracoes', label: 'Integrações', icon: Link2 },
];

// Agrupamento das abas para a navegação em sidebar do portal público (Fase 1+2 do redesign UI/UX).
const NAV_GROUPS: { label: string; tabs: PortalTab[] }[] = [
    { label: 'Comercial', tabs: ['estoque', 'empreendimentos', 'propostas', 'leads'] },
    { label: 'Financeiro', tabs: ['comissoes'] },
    { label: 'Conteúdo', tabs: ['materiais', 'treinamento'] },
    { label: 'Engajamento', tabs: ['ranking', 'agenda', 'chat'] },
    { label: 'Gestão', tabs: ['analytics', 'saude', 'integracoes'] },
];
const TAB_BY_ID: Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }> =
    Object.fromEntries(ALL_TABS.map(t => [t.id, t])) as Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }>;

const BrokerPortal: React.FC<BrokerPortalProps> = ({ profile, activeTab = 'estoque', organizationId: initialOrgId, isPreview = false, portalToken, initialBroker }) => {
    const { organizations } = useStore();

    // isAdmin controla visibilidade de todo o chrome administrativo
    const isAdmin = !isPreview && (
        profile?.role === UserProfile.ADMIN ||
        profile?.role === UserProfile.DEVELOPER ||
        profile?.group === ProfileGroup.DEVELOPER ||
        profile?.role === 'ADMINISTRADOR' ||
        profile?.group === 'DESENVOLVEDOR'
    );

    const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(initialOrgId || organizations[0]?.id);
    const [currentTab, setCurrentTab] = useState<PortalTab>(activeTab);
    const [selectedPurpose, setSelectedPurpose] = useState<'SALE' | 'RENTAL' | 'BOTH'>('BOTH');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [units, setUnits] = useState<BrokerUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [proposals, setProposals] = useState<Partial<BrokerProposal>[]>([]);
    const [commercialDeals, setCommercialDeals] = useState<PropertyDeal[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<BrokerUnit | null>(null);
    const [showSimulator, setShowSimulator] = useState(false);
    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const [showTabConfig, setShowTabConfig] = useState(false);

    // Impersonação — apenas para admins
    const [allBrokers, setAllBrokers] = useState<BrokerProfile[]>([]);
    const [selectedAdminBroker, setSelectedAdminBroker] = useState<BrokerProfile | null>(initialBroker ?? null);

    const effectiveBrokerEmail = (selectedAdminBroker ? selectedAdminBroker.email : profile?.email)?.toLowerCase();

    // Tab visibility: config salva em broker_profiles.settings.brokerPortalTabs
    const effectiveBroker = selectedAdminBroker ?? initialBroker ?? null;
    const effectiveBrokerSettings = effectiveBroker?.settings ?? {};
    const enabledTabIds: string[] = (effectiveBrokerSettings.brokerPortalTabs ?? []).length > 0
        ? effectiveBrokerSettings.brokerPortalTabs!
        : ALL_TABS.map(t => t.id);
    const visibleTabs = ALL_TABS.filter(t => enabledTabIds.includes(t.id));
    // admin vê todas (para poder configurar); corretor vê só as habilitadas
    const navTabs = isAdmin ? ALL_TABS : visibleTabs;

    const toggleTabVisibility = async (tabId: string) => {
        if (!effectiveBroker) return;
        const next = enabledTabIds.includes(tabId)
            ? enabledTabIds.filter(id => id !== tabId)
            : [...enabledTabIds, tabId];
        try {
            const updated = await brokerService.saveProfile({
                id: effectiveBroker.id,
                settings: { ...effectiveBrokerSettings, brokerPortalTabs: next },
            });
            setAllBrokers(prev => prev.map(b => b.id === updated.id ? updated : b));
            if (selectedAdminBroker?.id === updated.id) setSelectedAdminBroker(updated);
        } catch (err) {
            console.error('Erro ao salvar abas do corretor:', err);
        }
    };

    const myProposals = useMemo(() => {
        if (!proposals || !effectiveBrokerEmail) return [];
        return proposals.filter(p => p.broker_email?.toLowerCase() === effectiveBrokerEmail);
    }, [proposals, effectiveBrokerEmail]);

    // Carregar lista de corretores para impersonação (somente admin autenticado)
    React.useEffect(() => {
        if (!isAdmin || !selectedOrgId) return;
        brokerService.listProfiles(selectedOrgId)
            .then(setAllBrokers)
            .catch(err => console.error("Erro ao carregar lista de corretores:", err));
    }, [isAdmin, selectedOrgId]);

    // Carregar estoque: via token (anon) ou via serviço autenticado
    React.useEffect(() => {
        const fetchStock = async () => {
            setLoading(true);
            try {
                if (portalToken) {
                    // allSettled: uma RPC que falhe nao zera as demais (antes era
                    // Promise.all -> qualquer erro deixava o portal TODO zerado).
                    const [unitsRes, proposalsRes] = await Promise.allSettled([
                        brokerPortalService.getUnitsByToken(portalToken),
                        brokerPortalService.getProposalsByToken(portalToken),
                    ]);
                    if (unitsRes.status === 'fulfilled') setUnits(unitsRes.value as BrokerUnit[]);
                    else console.error('[BrokerPortal] getUnitsByToken error:', unitsRes.reason);
                    if (proposalsRes.status === 'fulfilled') setProposals(proposalsRes.value);
                    else console.error('[BrokerPortal] getProposalsByToken error:', proposalsRes.reason);
                    setCommercialDeals([]);
                } else {
                    const orgId = selectedOrgId;
                    if (!orgId) return;
                    const [propertiesRes, proposalsRes, dealsRes] = await Promise.allSettled([
                        commercialService.listProperties(orgId, undefined, selectedPurpose),
                        brokerService.listProposals(orgId),
                        commercialService.listDeals()
                    ]);
                    if (propertiesRes.status === 'fulfilled') setUnits(propertiesRes.value as BrokerUnit[]);
                    else console.error('[BrokerPortal] listProperties error:', propertiesRes.reason);
                    if (proposalsRes.status === 'fulfilled') setProposals(proposalsRes.value);
                    else console.error('[BrokerPortal] listProposals error:', proposalsRes.reason);
                    if (dealsRes.status === 'fulfilled') setCommercialDeals(dealsRes.value);
                    else console.error('[BrokerPortal] listDeals error:', dealsRes.reason);
                }
            } catch (error) {
                console.error("Erro ao carregar dados do portal:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStock();
    }, [selectedOrgId, selectedPurpose, portalToken]);

    React.useEffect(() => {
        if (!selectedOrgId && organizations.length > 0) {
            setSelectedOrgId(organizations[0]?.id);
        }
    }, [organizations, selectedOrgId]);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    const stats = useMemo(() => ({
        available: units.filter(u => u.status === PropertyStatus.AVAILABLE && u.type !== 'BUILDING').length,
        sent: myProposals.filter(p => p.status === 'ENVIADA').length,
        approved: myProposals.filter(p => p.status === 'APROVADA').length,
        totalCommission: myProposals.filter(p => p.status === 'APROVADA').reduce((acc, p) => acc + ((p.total_value || 0) * 0.05), 0),
    }), [units, myProposals]);

    const buildings = useMemo(() => units.filter(u => u.type === 'BUILDING'), [units]);
    const displayUnits = useMemo(() => {
        if (selectedBuildingId !== 'all') {
            return units.filter(u => u.parent_id === selectedBuildingId);
        }
        const childUnits = units.filter(u => u.type !== 'BUILDING');
        // Fallback: se não há unidades filhas, exibe os próprios empreendimentos
        return childUnits.length > 0 ? childUnits : units.filter(u => u.type === 'BUILDING');
    }, [units, selectedBuildingId]);

    const handleReserve = async (unit: BrokerUnit) => {
        if (!window.confirm(`Reservar a unidade ${unit.number || unit.name} por 48h?`)) return;
        try {
            await commercialService.saveProperty({ id: unit.id, status: PropertyStatus.RESERVED });
            setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, status: PropertyStatus.RESERVED } : u));
        } catch (err) {
            console.error('[BrokerPortal] Erro ao reservar unidade:', err);
            alert('Erro ao reservar a unidade. Tente novamente.');
        }
    };

    const handleMakeProposal = (unit: BrokerUnit) => {
        setSelectedUnit(unit);
        setShowSimulator(true);
        setCurrentTab('propostas');
    };

    const handleSubmitProposal = async (proposal: Partial<BrokerProposal>) => {
        try {
            const savedProposal = await brokerService.saveProposal(proposal);
            setProposals(prev => [savedProposal, ...prev.filter(p => !p.id?.startsWith('prop-'))]);
            setShowSimulator(false);
            setSelectedUnit(null);
            alert('Proposta enviada com sucesso! A incorporadora irá analisar.');
        } catch (error) {
            console.error("Erro ao salvar proposta:", error);
            alert('Erro ao enviar proposta. Por favor, tente novamente.');
        }
    };

    // ── Ações de proposta (F3): PDF + link público ─────────────────────────────
    const [shareMsg, setShareMsg] = useState<string | null>(null);
    const toast = (m: string) => { setShareMsg(m); setTimeout(() => setShareMsg(null), 4000); };

    const handleProposalPdf = (p: Partial<BrokerProposal>, unitLabel: string) => {
        downloadProposalPdf({
            id: p.id, property_name: unitLabel, buyer_name: p.buyer_name,
            unit_price: p.unit_price, discount_pct: p.discount_pct, total_value: p.total_value,
            down_payment: p.down_payment, monthly_installments: p.monthly_installments,
            monthly_value: p.monthly_value, balloon_value: p.balloon_value,
            financing_value: p.financing_value, notes: p.notes, created_at: p.created_at,
            version: (p as { version?: number }).version,
        });
    };

    const handleProposalShare = async (id?: string) => {
        if (!id || id.startsWith('prop-')) { toast('Salve a proposta antes de compartilhar.'); return; }
        try {
            const token = await brokerService.shareProposal(id);
            const url = `${window.location.origin}/proposta/${token}`;
            try { await navigator.clipboard.writeText(url); toast('Link copiado para a área de transferência.'); }
            catch { toast(url); }
        } catch {
            toast('Não foi possível gerar o link.');
        }
    };

    // Modo standalone = link público do corretor (portalToken). Só nele renderizamos a
    // casca própria do portal (banner + header + sidebar), espelhando o Portal do Parceiro.
    // No app autenticado a navegação já vem da sidebar do Layout — não duplicar.
    const isStandalone = !!portalToken;
    const brokerDisplayName = effectiveBroker?.name || (effectiveBrokerEmail ? effectiveBrokerEmail.split('@')[0] : 'Corretor');
    const navGroups = NAV_GROUPS
        .map(g => ({ label: g.label, items: g.tabs.map(id => TAB_BY_ID[id]).filter(t => t && navTabs.some(nt => nt.id === t.id)) }))
        .filter(g => g.items.length > 0);

    return (
        <div className={isStandalone ? 'flex flex-col h-screen bg-white text-gray-800 overflow-hidden font-sans' : 'animate-in fade-in slide-in-from-top-4 duration-700'}>
            {/* Casca do portal público — banner + header + sidebar (Fase 1+2 do redesign) */}
            {isStandalone && (
                <div className="h-9 bg-indigo-50 border-b border-indigo-200 flex items-center justify-center gap-3 shrink-0 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    <span>Acesso via link público</span>
                </div>
            )}
            {isStandalone && (
                <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-wider">Broker Portal</div>
                        <h1 className="text-md font-bold text-gray-900 tracking-tight">Portal do Corretor</h1>
                    </div>
                    <div className="flex items-center gap-3 text-xs bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-semibold text-gray-600">{brokerDisplayName} (CORRETOR)</span>
                    </div>
                </header>
            )}
            <div className={isStandalone ? 'flex flex-1 overflow-hidden' : ''}>
                {isStandalone && (
                    <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex flex-col shrink-0 overflow-y-auto">
                        {navGroups.map(group => (
                            <div key={group.label} className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-4 mt-4 mb-1 first:mt-0">{group.label}</span>
                                {group.items.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { setCurrentTab(tab.id as PortalTab); setShowSimulator(false); }}
                                        className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                            currentTab === tab.id
                                                ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 font-bold'
                                                : 'text-gray-500 hover:text-gray-900 hover:bg-white'
                                        }`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </aside>
                )}
                <div className={isStandalone ? 'flex-1 bg-white overflow-y-auto p-6' : ''}>
                    <div className="space-y-6">
            {/* Prévia Mobile — renderiza o portal como o corretor vê, dentro de um iframe estreito */}
            {showMobilePreview && !isPreview && (
                <MobilePreviewFrame onClose={() => setShowMobilePreview(false)} title="Prévia — Portal do Corretor">
                    <BrokerPortal
                        profile={profile}
                        organizationId={initialOrgId || selectedOrgId}
                        activeTab={currentTab}
                        isPreview
                        initialBroker={selectedAdminBroker ?? undefined}
                    />
                </MobilePreviewFrame>
            )}

            {/* Header — só no app autenticado; no portal público a casca acima já tem header próprio */}
            {!isStandalone && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            Portal do Corretor
                        </h1>
                        {/* Seletor de impersonação — somente admin */}
                        {isAdmin && (
                            <select
                                onChange={(e) => {
                                    const broker = allBrokers.find(b => b.id === e.target.value);
                                    setSelectedAdminBroker(broker || null);
                                }}
                                className="bg-amber-50 border-amber-200 text-amber-700 text-xs font-black uppercase tracking-widest rounded-xl px-4 py-1.5 focus:ring-0 cursor-pointer shadow-sm hover:bg-amber-100 transition-colors"
                                value={selectedAdminBroker?.id || ''}
                            >
                                <option value="">Impersonar Corretor</option>
                                {allBrokers.map(b => (
                                    <option key={b.id} value={b.id}>{b.name} ({b.email})</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {effectiveBrokerEmail ? `Olá, ${effectiveBrokerEmail.split('@')[0]}` : 'Bem-vindo'} • Estoque, propostas, leads e comissões em tempo real.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Botão Prévia Mobile — somente admin */}
                    {isAdmin && (
                        <button
                            onClick={() => setShowMobilePreview(true)}
                            title="Visualizar como o corretor vê no celular"
                            className="hidden md:flex p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    )}
                    {/* Botão Configurar Abas — somente admin, quando um corretor estiver selecionado */}
                    {isAdmin && effectiveBroker && (
                        <button
                            onClick={() => setShowTabConfig(true)}
                            title="Configurar abas visíveis do corretor"
                            className="hidden md:flex p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
                    )}

                    {/* Seletor de organização — somente admin com múltiplas orgs */}
                    {isAdmin && organizations.length > 1 && (
                        <div className="flex flex-col gap-1.5 min-w-[300px]">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Selecione a Organização</label>
                            <select
                                value={selectedOrgId}
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                className="bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-2xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 shadow-sm outline-none appearance-none cursor-pointer"
                            >
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Unidades Disponíveis" value={loading ? '…' : stats.available} subtext={loading ? '' : `de ${units.length} unidades`} icon={Building2} color="indigo" />
                <StatCard title="Propostas Enviadas" value={loading ? '…' : stats.sent} subtext="Aguardando análise" icon={Send} color="blue" />
                <StatCard title="Propostas Aprovadas" value={loading ? '…' : stats.approved} subtext="Vendas confirmadas" icon={CheckCircle2} color="emerald" />
                <StatCard title="Comissão Acumulada" value={loading ? '…' : formatCurrency(stats.totalCommission)} subtext="5% sobre aprovadas" icon={DollarSign} color="amber" />
            </div>

            {/* Modal de configuração de abas — somente admin */}
            {showTabConfig && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowTabConfig(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <Settings2 className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Portal do Corretor</h2>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Abas visíveis para o corretor</p>
                                </div>
                            </div>
                            <button onClick={() => setShowTabConfig(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-3">
                            {ALL_TABS.map(tab => {
                                const isVisible = enabledTabIds.includes(tab.id);
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => toggleTabVisibility(tab.id)}
                                        className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                                            isVisible
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                : 'bg-gray-50 border-gray-100 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <tab.icon className={`w-4 h-4 ${isVisible ? 'text-indigo-500' : 'text-gray-300'}`} />
                                            <span className="text-sm font-black uppercase tracking-tight">{tab.label}</span>
                                        </div>
                                        <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest ${isVisible ? 'text-indigo-500' : 'text-gray-300'}`}>
                                            {isVisible ? <><Eye className="w-3.5 h-3.5" /> Visível</> : <><EyeOff className="w-3.5 h-3.5" /> Oculta</>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-8 pb-8">
                            <p className="text-xs font-bold text-gray-400 text-center uppercase tracking-widest">
                                Clique em cada aba para alternar visibilidade do corretor
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Navigation — só no app autenticado; no portal público a navegação fica na sidebar da casca */}
            {!isStandalone && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {navTabs.map(tab => {
                    const hidden = isAdmin && !visibleTabs.some(v => v.id === tab.id);
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { setCurrentTab(tab.id as PortalTab); setShowSimulator(false); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-button font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                currentTab === tab.id
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                    : hidden
                                        ? 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                                        : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                            }`}
                            title={hidden ? 'Oculta para o corretor' : undefined}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {hidden && <EyeOff className="w-3 h-3 ml-0.5 opacity-60" />}
                        </button>
                    );
                })}
            </div>
            )}

            {/* Tab Content */}
            {currentTab === 'estoque' && !showSimulator && (
                <div className="space-y-6">
                    <div className="flex flex-col xl:flex-row gap-4 justify-between xl:items-center">
                        <div className="flex bg-gray-100 p-1 rounded-2xl w-fit shrink-0">
                            {[
                                { id: 'SALE', label: 'Vendas' },
                                { id: 'RENTAL', label: 'Locação' },
                                { id: 'BOTH', label: 'Todos' }
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPurpose(p.id as 'SALE' | 'RENTAL' | 'BOTH')}
                                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedPurpose === p.id
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {buildings.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest px-2 shrink-0">Empreendimento:</span>
                                <div className="flex bg-gray-100 p-1 rounded-2xl min-w-max">
                                    <button
                                        onClick={() => setSelectedBuildingId('all')}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedBuildingId === 'all'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                            }`}
                                    >
                                        Geral
                                    </button>
                                    {buildings.map((b) => (
                                        <button
                                            key={b.id}
                                            onClick={() => setSelectedBuildingId(b.id)}
                                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all max-w-[150px] truncate ${selectedBuildingId === b.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                                }`}
                                            title={b.name}
                                        >
                                            {b.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <PropertyUnitMap
                        units={displayUnits}
                        parentProperty={buildings.find(b => b.id === selectedBuildingId)}
                        deals={[
                            ...commercialDeals,
                            ...proposals.map(p => ({
                                ...p,
                                status: p.status === 'ENVIADA' ? 'PENDING' :
                                    p.status === 'APROVADA' ? 'COMPLETED' :
                                        p.status === 'REJEITADA' ? 'CANCELLED' :
                                            'IN_NEGOTIATION'
                            }))
                        ] as unknown as PropertyDeal[]}
                        onSelectUnit={handleMakeProposal}
                        onReserveUnit={handleReserve}
                    />
                </div>
            )}

            {currentTab === 'empreendimentos' && (
                <BrokerDevelopments
                    buildings={buildings}
                    units={units}
                    portalToken={portalToken}
                    organizationId={initialOrgId || selectedOrgId}
                    onMakeProposal={handleMakeProposal}
                />
            )}

            {currentTab === 'propostas' && showSimulator && selectedUnit && (
                <BrokerProposalSimulator
                    unit={selectedUnit}
                    brokerEmail={effectiveBrokerEmail || ''}
                    organizationId={initialOrgId || selectedOrgId || 'demo'}
                    onSubmitProposal={handleSubmitProposal}
                    onCancel={() => { setShowSimulator(false); setCurrentTab('estoque'); }}
                />
            )}

            {currentTab === 'propostas' && !showSimulator && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="text-lg font-black text-gray-900">Minhas Propostas</h3>
                        <p className="text-sm text-gray-400 mt-1">Histórico de propostas enviadas</p>
                    </div>

                    {myProposals.length === 0 ? (
                        <div className="text-center py-16">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">Nenhuma proposta enviada ainda.</p>
                            <p className="text-gray-300 text-sm mt-1">Selecione uma unidade no Estoque para criar uma proposta.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {myProposals.map((p, i) => {
                                const unit = units.find(u => u.id === p.property_id);
                                return (
                                    <div key={p.id || i} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                <Building2 className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">
                                                    Unidade {unit?.number || unit?.name || '-'} • {unit?.block || 'Geral'}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {p.buyer_name} • {p.buyer_cpf}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-900">{formatCurrency(p.total_value || 0)}</p>
                                                <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${p.status === 'ENVIADA' ? 'bg-blue-50 text-blue-600' :
                                                    p.status === 'APROVADA' ? 'bg-emerald-50 text-emerald-600' :
                                                        p.status === 'REJEITADA' ? 'bg-red-50 text-red-600' :
                                                            'bg-gray-100 text-gray-500'
                                                    }`}>
                                                    {p.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => handleProposalPdf(p, `Unidade ${unit?.number || unit?.name || '-'}`)}
                                                    title="Baixar PDF"
                                                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleProposalShare(p.id)}
                                                    title="Gerar link público"
                                                    className="p-2 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-all">
                                                    <Share2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {shareMsg && (
                <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium bg-gray-900 text-white animate-in slide-in-from-bottom-4 duration-300">
                    <Link2 className="w-4 h-4 shrink-0" /> {shareMsg}
                </div>
            )}

            {currentTab === 'leads' && (
                <BrokerLeadManager brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'comissoes' && (
                <BrokerCommissions brokerEmail={effectiveBrokerEmail || ''} portalToken={portalToken} />
            )}

            {currentTab === 'materiais' && (
                <BrokerMaterials organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'ranking' && (
                <BrokerRanking brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'treinamento' && (
                <BrokerTraining brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'agenda' && (
                <BrokerEvents brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'chat' && (
                <BrokerChat brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'analytics' && (
                <BrokerAnalytics organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'saude' && (
                <BrokerHealthPanel organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'integracoes' && (
                <BrokerIntegrations organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrokerPortal;
