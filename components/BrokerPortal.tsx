// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { Building2, FileText, LayoutGrid, Send, CheckCircle2, DollarSign, Users, User, Briefcase, FolderOpen, Trophy, BookOpen, Calendar, MessageSquare, BarChart3, Activity, Link2, Smartphone, Settings2, Eye, EyeOff, X, Download, Share2, ChevronDown, Bell, HelpCircle } from 'lucide-react';
import { downloadProposalPdf } from '../services/proposalPdfService';
import PropertyUnitMap from './common/PropertyUnitMap';
import BrokerProposalSimulator from './broker/BrokerProposalSimulator';
import BrokerLeadManager from './broker/BrokerLeadManager';
import BrokerDevelopments from './broker/BrokerDevelopments';
import { useConfirm } from './ui/confirm';
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
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
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
    /** Volta para a lista "Meus Corretores" (botão de voltar §5.3). Ausente = sem botão (ex: link público). */
    onBack?: () => void;
}

// Analytics é a PRIMEIRA aba (e a default ao abrir o portal) — os KPIs de topo
// pertencem a ela.
const ALL_TABS: { id: PortalTab; label: string; icon: React.ElementType }[] = [
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
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
    { id: 'saude', label: 'Saúde', icon: Activity },
    { id: 'integracoes', label: 'Integrações', icon: Link2 },
];

// Agrupamento das abas para a navegação em sidebar do portal público (Fase 1+2 do redesign UI/UX).
const NAV_GROUPS: { label: string; tabs: PortalTab[] }[] = [
    { label: 'Desempenho', tabs: ['analytics'] },
    { label: 'Comercial', tabs: ['estoque', 'empreendimentos', 'propostas', 'leads'] },
    { label: 'Financeiro', tabs: ['comissoes'] },
    { label: 'Conteúdo', tabs: ['materiais', 'treinamento'] },
    { label: 'Engajamento', tabs: ['ranking', 'agenda', 'chat'] },
    { label: 'Gestão', tabs: ['saude', 'integracoes'] },
];
const TAB_BY_ID: Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }> =
    Object.fromEntries(ALL_TABS.map(t => [t.id, t])) as Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }>;

const BrokerPortal: React.FC<BrokerPortalProps> = ({ profile, activeTab = 'analytics', organizationId: initialOrgId, isPreview = false, portalToken, initialBroker, onBack }) => {
    const { organizations } = useStore();
    const confirm = useConfirm();

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
    // A CESTA da proposta. Uma proposta pode reunir apto + vaga + box do mesmo
    // empreendimento sob um comprador. Clicar numa unidade continua funcionando
    // como antes (cesta de 1) — a seleção múltipla é opt-in.
    const [cart, setCart] = useState<BrokerUnit[]>([]);
    const [showSimulator, setShowSimulator] = useState(false);
    const [cartWarning, setCartWarning] = useState<string | null>(null);
    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const [showTabConfig, setShowTabConfig] = useState(false);

    // Menu de conta do portal público (link do corretor) — espelha o dropdown de perfil do sistema
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [showMyAccount, setShowMyAccount] = useState(false);
    const accountMenuRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!isAccountMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setIsAccountMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isAccountMenuOpen]);

    // Impersonação — apenas para admins
    const [allBrokers, setAllBrokers] = useState<BrokerProfile[]>([]);
    const [selectedAdminBroker, setSelectedAdminBroker] = useState<BrokerProfile | null>(initialBroker ?? null);

    // Habilitação por empreendimento (broker_property_access). null = sem corretor
    // efetivo no contexto (admin navegando livre) -> sem filtro. Modo token já vem
    // filtrado pela RPC fn_broker_portal_get_units, não precisa repetir aqui.
    const [enabledPropertyIds, setEnabledPropertyIds] = useState<string[] | null>(null);

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

    // currentTab nasce 'estoque' (default do useState) independente de essa aba estar
    // habilitada para o corretor — no link público (isAdmin=false), se 'estoque' (ou
    // qualquer aba atual) tiver sido ocultada, o conteúdo antigo ficava preso na tela
    // porque nada trocava currentTab. Corrige assim que detecta o descompasso.
    React.useEffect(() => {
        if (navTabs.length > 0 && !navTabs.some(t => t.id === currentTab)) {
            setCurrentTab(navTabs[0].id);
            setShowSimulator(false);
        }
    }, [navTabs, currentTab]);

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
            // Se a aba que acabamos de ocultar é a que está aberta agora, sai dela — senão o
            // conteúdo continua na tela mesmo depois de "ocultada" (só o botão da nav mudava).
            if (currentTab === tabId && !next.includes(tabId)) {
                const effectiveNext = next.length > 0 ? next : ALL_TABS.map(t => t.id);
                const fallback = (effectiveNext.includes('estoque') ? 'estoque' : effectiveNext[0]) as PortalTab;
                setCurrentTab(fallback);
                setShowSimulator(false);
            }
        } catch (err) {
            console.error('Erro ao salvar abas do corretor:', err);
        }
    };

    const myProposals = useMemo(() => {
        if (!proposals || !effectiveBrokerEmail) return [];
        return proposals.filter(p => p.broker_email?.toLowerCase() === effectiveBrokerEmail);
    }, [proposals, effectiveBrokerEmail]);

    // Carrega quais empreendimentos o corretor efetivo (impersonado ou logado
    // direto) está habilitado a ver. Sem corretor efetivo (admin navegando sem
    // impersonar ninguém) = sem filtro, mantém o estoque completo da org.
    React.useEffect(() => {
        if (portalToken || !effectiveBroker?.id) {
            setEnabledPropertyIds(null);
            return;
        }
        brokerService.listEnabledPropertyIds(effectiveBroker.id)
            .then(setEnabledPropertyIds)
            .catch(err => {
                console.error('[BrokerPortal] Error loading enabled property ids:', err);
                setEnabledPropertyIds([]);
            });
    }, [portalToken, effectiveBroker?.id]);

    // Carregar lista de corretores para impersonação (somente admin autenticado).
    // Todas as orgs do admin, não só a selecionada — um corretor cadastrado na
    // organização "holding" (ex: Alpa) atua em negociações de SPEs de
    // empreendimento (mesma decisão já aplicada em brokerService.listProfiles/
    // DealModal, 2026-07-21). Restringir por selectedOrgId aqui escondia o
    // corretor do seletor de impersonação sempre que o admin estava navegando
    // dentro da SPE do empreendimento em vez da organização onde o corretor foi
    // cadastrado.
    React.useEffect(() => {
        if (!isAdmin || organizations.length === 0) return;
        brokerService.listProfiles(organizations.map(o => o.id))
            .then(setAllBrokers)
            .catch(err => console.error("Erro ao carregar lista de corretores:", err));
    }, [isAdmin, organizations]);

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
                    // Com corretor efetivo em contexto (impersonação ou login direto), o
                    // estoque não fica preso à org selecionada no portal: o empreendimento
                    // habilitado pode estar numa SPE diferente da org onde o corretor foi
                    // cadastrado (ex: corretor na org "holding", prédio na SPE do
                    // empreendimento). visibleUnits já filtra pelo que está habilitado —
                    // aqui só evita cortar cross-org antes desse filtro rodar.
                    const propertiesOrgId = effectiveBroker?.id ? undefined : orgId;
                    const [propertiesRes, proposalsRes, dealsRes] = await Promise.allSettled([
                        commercialService.listProperties(propertiesOrgId, undefined, selectedPurpose),
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
    }, [selectedOrgId, selectedPurpose, portalToken, effectiveBroker?.id]);

    React.useEffect(() => {
        if (!selectedOrgId && organizations.length > 0) {
            setSelectedOrgId(organizations[0]?.id);
        }
    }, [organizations, selectedOrgId]);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    // Empreendimentos (prédios) e unidades avulsas que o corretor efetivo está
    // habilitado a ver. enabledPropertyIds null = sem filtro (admin sem
    // impersonar). Unidade avulsa (sem parent_id, não é BUILDING) não pertence a
    // nenhum empreendimento — segue sempre visível, espelha a regra da RPC.
    const visibleUnits = useMemo(() => {
        // visible_to_broker === false esconde a unidade do portal (Estoque e
        // Empreendimentos, já que ambos derivam de visibleUnits) — mesmo corte
        // que a RPC fn_broker_portal_get_units já aplica no modo por token; aqui
        // cobre o modo autenticado (impersonação de admin via BrokerList).
        const byVisibility = units.filter(u => u.visible_to_broker !== false);
        if (!enabledPropertyIds) return byVisibility;
        const allowed = new Set(enabledPropertyIds);
        return byVisibility.filter(u => {
            if (u.type !== 'BUILDING' && !u.parent_id) return true;
            const buildingId = u.type === 'BUILDING' ? u.id : u.parent_id;
            return buildingId ? allowed.has(buildingId) : true;
        });
    }, [units, enabledPropertyIds]);

    const stats = useMemo(() => ({
        available: visibleUnits.filter(u => u.status === PropertyStatus.AVAILABLE && u.type !== 'BUILDING').length,
        sent: myProposals.filter(p => p.status === 'ENVIADA').length,
        approved: myProposals.filter(p => p.status === 'APROVADA').length,
        totalCommission: myProposals.filter(p => p.status === 'APROVADA').reduce((acc, p) => acc + ((p.total_value || 0) * 0.05), 0),
    }), [visibleUnits, myProposals]);

    const buildings = useMemo(() => visibleUnits.filter(u => u.type === 'BUILDING'), [visibleUnits]);
    const displayUnits = useMemo(() => {
        if (selectedBuildingId !== 'all') {
            return visibleUnits.filter(u => u.parent_id === selectedBuildingId);
        }
        const childUnits = visibleUnits.filter(u => u.type !== 'BUILDING');
        // Fallback: se não há unidades filhas, exibe os próprios empreendimentos
        return childUnits.length > 0 ? childUnits : visibleUnits.filter(u => u.type === 'BUILDING');
    }, [visibleUnits, selectedBuildingId]);

    const handleReserve = async (unit: BrokerUnit) => {
        const ok = await confirm({
            title: 'Reservar unidade?',
            message: `Reservar a unidade ${unit.number || unit.name} por 48h?`,
            variant: 'warning',
            confirmLabel: 'Reservar',
        });
        if (!ok) return;
        try {
            await commercialService.saveProperty({ id: unit.id, status: PropertyStatus.RESERVED });
            setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, status: PropertyStatus.RESERVED } : u));
        } catch (err) {
            console.error('[BrokerPortal] Erro ao reservar unidade:', err);
            alert('Erro ao reservar a unidade. Tente novamente.');
        }
    };

    // Clique direto na unidade: abre o simulador com uma cesta de 1, como sempre.
    const handleMakeProposal = (unit: BrokerUnit) => {
        setCart([unit]);
        setShowSimulator(true);
        setCurrentTab('propostas');
    };

    /**
     * Liga/desliga uma unidade na cesta.
     *
     * A cesta é restrita a UM empreendimento porque o Plano de Vendas é por
     * prédio (`sales_plans.building_id`): misturar prédios deixaria a proposta
     * sem política aplicável. Ao clicar em unidade de outro prédio, avisa e
     * troca a cesta em vez de recusar em silêncio.
     */
    const handleToggleCart = (unit: BrokerUnit) => {
        setCartWarning(null);
        setCart(prev => {
            if (prev.some(u => u.id === unit.id)) return prev.filter(u => u.id !== unit.id);
            if (unit.status && unit.status !== PropertyStatus.AVAILABLE) {
                setCartWarning(`A unidade ${unit.number || unit.name} não está disponível.`);
                return prev;
            }
            if (prev.length > 0 && prev[0].parent_id !== unit.parent_id) {
                setCartWarning('Uma proposta só pode reunir unidades do mesmo empreendimento — a seleção foi reiniciada.');
                return [unit];
            }
            return [...prev, unit];
        });
    };

    const cartTotal = useMemo(
        () => cart.reduce((s, u) => s + (Number(u.current_price) || 0), 0),
        [cart]
    );

    const handleSubmitProposal = async (proposal: Partial<BrokerProposal>) => {
        try {
            const savedProposal = await brokerService.saveProposal(proposal);
            setProposals(prev => [savedProposal, ...prev.filter(p => !p.id?.startsWith('prop-'))]);
            setShowSimulator(false);
            setCart([]);
            alert('Proposta enviada com sucesso! A incorporadora irá analisar.');
        } catch (error) {
            console.error("Erro ao salvar proposta:", error);
            alert('Erro ao enviar proposta. Por favor, tente novamente.');
        }
    };

    // ── Ações de proposta (F3): PDF + link público ─────────────────────────────
    const [shareMsg, setShareMsg] = useState<string | null>(null);
    const toast = (m: string) => { setShareMsg(m); setTimeout(() => setShareMsg(null), 4000); };

    /**
     * Rótulo da proposta: "Unidade 101 +2" com a lista completa no title.
     * `units` chega das RPCs/embed; propostas legadas caem no property_id.
     */
    const proposalUnitLabel = (p: Partial<BrokerProposal>) => {
        const list = (p.units && p.units.length > 0)
            ? p.units
            : (p.property_id ? [{ property_id: p.property_id }] : []);
        const names = list.map(u => {
            const named = (u as { unit_name?: string }).unit_name;
            if (named) return named;
            const found = units.find(x => x.id === u.property_id);
            return found?.number || found?.name || '';
        }).filter(Boolean);
        return { primary: names[0] || '-', extra: Math.max(0, list.length - 1), all: names.join(' + ') };
    };

    const handleProposalPdf = (p: Partial<BrokerProposal>, unitLabel: string) => {
        downloadProposalPdf({
            id: p.id, property_name: unitLabel, buyer_name: p.buyer_name,
            // Cesta: o PDF ganha a tabela de unidades quando há mais de uma.
            units: (p.units || []).map(u => ({
                unit_name: (u as { unit_name?: string }).unit_name
                    || units.find(x => x.id === u.property_id)?.number
                    || units.find(x => x.id === u.property_id)?.name,
                unit_price: u.unit_price,
                allocated_value: u.allocated_value,
                is_primary: u.is_primary,
            })),
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
                    <div className="relative" ref={accountMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsAccountMenuOpen(o => !o)}
                            className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                            aria-haspopup="menu"
                            aria-expanded={isAccountMenuOpen}
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                                {brokerDisplayName.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-semibold text-gray-600">{brokerDisplayName} (CORRETOR)</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isAccountMenuOpen && (
                            <div className="absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                                            {brokerDisplayName.charAt(0).toUpperCase()}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-bold text-gray-900">{brokerDisplayName}</div>
                                            <div className="truncate text-xs text-gray-500">{effectiveBrokerEmail}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); setShowMyAccount(true); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <User className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Minha conta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); toast('Personalização de tema estará disponível em breve.'); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <Settings2 className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Preferências</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); toast('Central de notificações do corretor estará disponível em breve.'); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <Bell className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Notificações</span>
                                    </button>
                                </div>
                                <div className="border-t border-gray-100 p-2">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); toast('Dúvidas? Fale com a incorporadora responsável por este empreendimento.'); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <HelpCircle className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Ajuda e comandos</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>
            )}

            {showMyAccount && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowMyAccount(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-[6px] flex items-center justify-center">
                                    <User className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Minha conta</h2>
                                    <p className="text-xs font-semibold text-gray-500 mt-0.5">Dados cadastrais</p>
                                </div>
                            </div>
                            <button onClick={() => setShowMyAccount(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-[6px] transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-8 space-y-4">
                            {[
                                ['Nome', brokerDisplayName],
                                ['E-mail', effectiveBrokerEmail || '—'],
                                ['Telefone', effectiveBroker?.phone || '—'],
                                ['CRECI', effectiveBroker?.creci || '—'],
                                ['Imobiliária', effectiveBroker?.agency_name || '—'],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
                                    <div className="text-sm font-semibold text-gray-800">{value}</div>
                                </div>
                            ))}
                            <p className="text-xs text-gray-400 pt-3 border-t border-gray-100">
                                Para alterar seus dados cadastrais, entre em contato com a incorporadora.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            <div className={isStandalone ? 'flex flex-1 overflow-hidden' : ''}>
                {isStandalone && (
                    <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex flex-col gap-1 shrink-0 overflow-y-auto">
                        {navGroups.map(group => (
                            <React.Fragment key={group.label}>
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
                            </React.Fragment>
                        ))}
                    </aside>
                )}
                {/* isStandalone = acesso via link público, fora do <Layout> — o gutter
                    §20.2 tem que ser reaplicado à mão (senão o modo interno, que já
                    recebe o padding do <main>, ficaria com o dobro). */}
                <div className={isStandalone ? 'flex-1 bg-white overflow-y-auto p-4 md:p-6' : ''}>
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
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                    Portal do Corretor
                </h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {effectiveBrokerEmail ? `Olá, ${effectiveBrokerEmail.split('@')[0]}` : 'Bem-vindo'} • Estoque, propostas, leads e comissões em tempo real.
                </p>
            </div>
            )}

            {/* KPI Cards — §4 (componente canônico KpiCard, cor semântica por KPI).
                Visíveis SOMENTE na aba Analytics: são o resumo de desempenho do
                corretor, não um cromo global do portal. */}
            {currentTab === 'analytics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Unidades Disponíveis" value={loading ? '…' : stats.available} sub={loading ? undefined : `de ${visibleUnits.length} unidades`} icon={<Building2 className="w-5 h-5" />} color="blue" />
                <KpiCard label="Propostas Enviadas" value={loading ? '…' : stats.sent} sub="Aguardando análise" icon={<Send className="w-5 h-5" />} color="amber" pulse={!loading && stats.sent > 0} />
                <KpiCard label="Propostas Aprovadas" value={loading ? '…' : stats.approved} sub="Vendas confirmadas" icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Comissão Acumulada" value={loading ? '…' : formatCurrency(stats.totalCommission)} sub="5% sobre aprovadas" icon={<DollarSign className="w-5 h-5" />} color="violet" />
            </div>
            )}

            {/* Toolbar de botões (§5.3) — controles de escopo do portal (voltar + org)
                à esquerda, ações do admin (prévia mobile + configurar abas) à direita.
                Fica no app autenticado; a casca pública tem navegação própria. */}
            {!isStandalone && (onBack || (isAdmin && (organizations.length > 1 || effectiveBroker))) && (
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Meus Corretores
                        </button>
                    )}
                    {/* Seletor de organização — somente admin com múltiplas orgs */}
                    {isAdmin && organizations.length > 1 && (
                        <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            title="Selecione a organização"
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-[6px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
                        >
                            {organizations.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Prévia Mobile — somente admin */}
                    {isAdmin && (
                        <button
                            onClick={() => setShowMobilePreview(true)}
                            title="Visualizar como o corretor vê no celular"
                            className="hidden md:flex items-center justify-center h-9 w-9 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    )}
                    {/* Configurar Abas — somente admin, com um corretor selecionado */}
                    {isAdmin && effectiveBroker && (
                        <button
                            onClick={() => setShowTabConfig(true)}
                            title="Configurar abas visíveis do corretor"
                            className="hidden md:flex items-center justify-center h-9 w-9 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            )}

            {/* Modal de configuração de abas — somente admin */}
            {showTabConfig && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowTabConfig(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-8 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-[6px] flex items-center justify-center">
                                    <Settings2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Portal do corretor</h2>
                                    <p className="text-xs font-semibold text-gray-500 mt-0.5">Abas visíveis para o corretor</p>
                                </div>
                            </div>
                            <button onClick={() => setShowTabConfig(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-[6px] transition-all">
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
                                        className={`w-full flex items-center justify-between gap-4 p-4 rounded-[6px] border transition-all ${
                                            isVisible
                                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                : 'bg-gray-50 border-gray-100 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <tab.icon className={`w-4 h-4 ${isVisible ? 'text-blue-500' : 'text-gray-300'}`} />
                                            <span className="text-sm font-medium">{tab.label}</span>
                                        </div>
                                        <div className={`flex items-center gap-2 text-sm font-normal ${isVisible ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {isVisible ? <><Eye className="w-3.5 h-3.5" /> Visível</> : <><EyeOff className="w-3.5 h-3.5" /> Oculta</>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-8 pb-8">
                            <p className="text-xs font-medium text-gray-400 text-center">
                                Clique em cada aba para alternar visibilidade do corretor
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Navigation — só no app autenticado; no portal público a navegação fica na sidebar da casca */}
            {!isStandalone && (
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {navTabs.map(tab => {
                        const hidden = isAdmin && !visibleTabs.some(v => v.id === tab.id);
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setCurrentTab(tab.id as PortalTab); setShowSimulator(false); }}
                                className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                    currentTab === tab.id
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : hidden
                                            ? 'text-gray-300'
                                            : 'text-gray-700 hover:text-gray-900'
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
            </div>
            )}

            {/* Tab Content */}
            {currentTab === 'estoque' && !showSimulator && (
                <div className="space-y-6">
                    <div className="flex flex-col xl:flex-row gap-4 justify-between xl:items-center">
                        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit shrink-0">
                            {[
                                { id: 'SALE', label: 'Vendas' },
                                { id: 'RENTAL', label: 'Locação' },
                                { id: 'BOTH', label: 'Todos' }
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPurpose(p.id as 'SALE' | 'RENTAL' | 'BOTH')}
                                    className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${selectedPurpose === p.id
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-700 hover:text-gray-900'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {buildings.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                                <span className="text-xs font-semibold text-gray-500 px-2 shrink-0">Empreendimento:</span>
                                <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 min-w-max">
                                    <button
                                        onClick={() => setSelectedBuildingId('all')}
                                        className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${selectedBuildingId === 'all'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-700 hover:text-gray-900'
                                            }`}
                                    >
                                        Geral
                                    </button>
                                    {buildings.map((b) => (
                                        <button
                                            key={b.id}
                                            onClick={() => setSelectedBuildingId(b.id)}
                                            className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all max-w-[150px] truncate ${selectedBuildingId === b.id
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-700 hover:text-gray-900'
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
                            // O mapa casa negócio↔unidade por property_id. Uma proposta em
                            // cesta tem N unidades, então vira N pseudo-negócios — sem isso
                            // só a unidade principal ficaria pintada no espelho.
                            ...proposals.flatMap(p => {
                                const status = p.status === 'ENVIADA' ? 'PENDING' :
                                    p.status === 'APROVADA' ? 'COMPLETED' :
                                        p.status === 'REJEITADA' ? 'CANCELLED' :
                                            'IN_NEGOTIATION';
                                const ids = (p.units && p.units.length > 0)
                                    ? p.units.map(u => u.property_id)
                                    : (p.property_id ? [p.property_id] : []);
                                return ids.map(pid => ({ ...p, property_id: pid, status }));
                            })
                        ] as unknown as PropertyDeal[]}
                        onSelectUnit={handleMakeProposal}
                        onReserveUnit={handleReserve}
                        selectedUnitIds={cart.map(u => u.id)}
                        onToggleUnit={handleToggleCart}
                    />
                </div>
            )}

            {currentTab === 'empreendimentos' && (
                <BrokerDevelopments
                    buildings={buildings}
                    units={visibleUnits}
                    portalToken={portalToken}
                    organizationId={initialOrgId || selectedOrgId}
                    onMakeProposal={handleMakeProposal}
                    selectedUnitIds={cart.map(u => u.id)}
                    onToggleUnit={handleToggleCart}
                />
            )}

            {currentTab === 'propostas' && showSimulator && cart.length > 0 && (
                <BrokerProposalSimulator
                    units={cart}
                    brokerEmail={effectiveBrokerEmail || ''}
                    organizationId={initialOrgId || selectedOrgId || 'demo'}
                    onSubmitProposal={handleSubmitProposal}
                    onCancel={() => { setShowSimulator(false); setCurrentTab('estoque'); }}
                    portalToken={portalToken}
                />
            )}

            {currentTab === 'propostas' && !showSimulator && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="text-lg font-black text-gray-900">Minhas propostas</h3>
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
                                const label = proposalUnitLabel(p);
                                return (
                                    <div key={p.id || i} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-50 rounded-[6px] flex items-center justify-center">
                                                <Building2 className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900" title={label.all || undefined}>
                                                    Unidade {label.primary}
                                                    {label.extra > 0
                                                        ? <span className="ml-1.5 text-xs font-normal text-gray-400">+{label.extra}</span>
                                                        : <> • {unit?.block || 'Geral'}</>}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {p.buyer_name} • {p.buyer_cpf}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-sm font-medium text-gray-800">{formatCurrency(p.total_value || 0)}</p>
                                                <span className={`text-sm font-normal ${p.status === 'ENVIADA' ? 'text-blue-600' :
                                                    p.status === 'APROVADA' ? 'text-emerald-600' :
                                                        p.status === 'REJEITADA' ? 'text-red-600' :
                                                            'text-gray-500'
                                                    }`}>
                                                    {p.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                <ActionIconButton kind="download" title="Baixar PDF" onClick={() => handleProposalPdf(p, `Unidade ${label.primary}`)} />
                                                <ActionIconButton kind="share" title="Gerar link público" onClick={() => handleProposalShare(p.id)} />
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

            {/* Barra da cesta — só aparece com seleção em andamento e fora do simulador.
                Permite montar apto + vaga + box e mandar UMA proposta. */}
            {!showSimulator && cart.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[290] w-[min(92vw,44rem)] bg-white rounded-2xl border border-indigo-200 shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-300">
                    {cartWarning && (
                        <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                            {cartWarning}
                        </p>
                    )}
                    <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-indigo-500 uppercase tracking-widest">
                                {cart.length} {cart.length === 1 ? 'unidade selecionada' : 'unidades selecionadas'}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {cart.map(u => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => handleToggleCart(u)}
                                        title="Remover da proposta"
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                                    >
                                        {u.number || u.name} <X className="w-3 h-3" />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400 uppercase tracking-widest">Total</p>
                            <p className="text-lg font-black text-gray-900">{formatCurrency(cartTotal)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setCartWarning(null); setShowSimulator(true); setCurrentTab('propostas'); }}
                            className="shrink-0 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-button uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                        >
                            Fazer proposta ({cart.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCart([]); setCartWarning(null); }}
                            title="Limpar seleção"
                            className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
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
