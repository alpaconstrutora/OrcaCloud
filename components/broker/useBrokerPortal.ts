import React, { useState, useMemo } from 'react';
import { Building2, FileText, LayoutGrid, DollarSign, Users, FolderOpen, Trophy, BookOpen, Calendar, MessageSquare, BarChart3, Activity } from 'lucide-react';
import { useConfirm } from '../ui/confirm';
import { avisarAcaoDoPortal } from '../../utils/portalEventos';
import { BROKER_PORTAL_TAB_IDS, abasHabilitadas, ehAbaDeDemonstracao } from '../../utils/brokerPortalTabs';
import { downloadProposalPdf } from '../../services/proposalPdfService';
import { useStore } from '../../store/useStore';
import { commercialService } from '../../services/commercialService';
import { brokerService } from '../../services/brokerService';
import { brokerPortalService } from '../../services/brokerPortalService';
import { PropertyStatus, UserProfile, ProfileGroup } from '../../types';
import type { BrokerUnit, BrokerProposal, BrokerProfile } from '../../types';
import type { PropertyDeal } from '../../types/imovib';

/**
 * Comportamento do Portal do Corretor — uma fonte só para as duas cascas
 * (desktop em `BrokerPortal.tsx`, celular em `BrokerPortalMobile.tsx`).
 * Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (F1, item 1).
 *
 * Tudo o que não é desenho mora aqui: carga de unidades/propostas/negócios
 * (token × autenticado), habilitação por empreendimento, abas visíveis, cesta,
 * simulador, reservar, enviar, PDF e link público. A casca só desenha.
 */

export type PortalTab = typeof BROKER_PORTAL_TAB_IDS[number];

export interface UseBrokerPortalArgs {
    profile: { group: string; role: string; email?: string };
    activeTab?: PortalTab;
    organizationId?: string;
    isPreview?: boolean;
    portalToken?: string;
    initialBroker?: BrokerProfile;
}

// Analytics é a PRIMEIRA aba (e a default ao abrir o portal no desktop) — os
// KPIs de topo pertencem a ela.
export const ALL_TABS: { id: PortalTab; label: string; icon: React.ElementType }[] = [
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
];

export const TAB_BY_ID: Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }> =
    Object.fromEntries(ALL_TABS.map(t => [t.id, t])) as Record<PortalTab, { id: PortalTab; label: string; icon: React.ElementType }>;

export const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

export function useBrokerPortal({ profile, activeTab = 'analytics', organizationId: initialOrgId, isPreview = false, portalToken, initialBroker }: UseBrokerPortalArgs) {
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
    // De onde o simulador foi aberto: "Cancelar" volta para lá (antes ia sempre
    // para o Estoque, mesmo vindo de Empreendimentos).
    const [abaDeOrigem, setAbaDeOrigem] = useState<PortalTab | null>(null);

    // Impersonação — apenas para admins
    const [allBrokers, setAllBrokers] = useState<BrokerProfile[]>([]);
    const [selectedAdminBroker, setSelectedAdminBroker] = useState<BrokerProfile | null>(initialBroker ?? null);
    // A prévia mobile recebe o corretor por prop; se a casca de fora troca o
    // corretor (ex.: salvou abas visíveis), a prévia acompanha.
    React.useEffect(() => {
        if (initialBroker) setSelectedAdminBroker(initialBroker);
    }, [initialBroker]);

    // Habilitação por empreendimento (broker_property_access). null = sem corretor
    // efetivo no contexto (admin navegando livre) -> sem filtro. Modo token já vem
    // filtrado pela RPC fn_broker_portal_get_units, não precisa repetir aqui.
    const [enabledPropertyIds, setEnabledPropertyIds] = useState<string[] | null>(null);

    const effectiveBrokerEmail = (selectedAdminBroker ? selectedAdminBroker.email : profile?.email)?.toLowerCase();

    // Tab visibility: config salva em broker_profiles.settings.brokerPortalTabs
    // ("Configurar abas visíveis do corretor"). Vale nas duas cascas (D8).
    const effectiveBroker = selectedAdminBroker ?? initialBroker ?? null;
    const effectiveBrokerSettings = effectiveBroker?.settings ?? {};
    const enabledTabIds: string[] = abasHabilitadas(effectiveBrokerSettings);
    const visibleTabs = ALL_TABS.filter(t => enabledTabIds.includes(t.id));
    // admin vê todas (para poder configurar); corretor vê só as habilitadas.
    // As de demonstração (D9) não aparecem para ninguém na navegação.
    const navTabs = isAdmin ? ALL_TABS.filter(t => !ehAbaDeDemonstracao(t.id)) : visibleTabs;

    const irParaAba = React.useCallback((tab: PortalTab) => {
        setCurrentTab(tab);
        setShowSimulator(false);
    }, []);

    const toggleTabVisibility = async (tabId: string) => {
        if (!effectiveBroker || ehAbaDeDemonstracao(tabId)) return;
        // Parte da lista GRAVADA (não de `enabledTabIds`, que já tirou as de
        // demonstração): senão ligar/desligar uma aba apagava do cadastro as de
        // demonstração que o gestor tinha deixado ligadas.
        const salvas: string[] = (effectiveBrokerSettings.brokerPortalTabs ?? []).length > 0
            ? [...effectiveBrokerSettings.brokerPortalTabs!]
            : ALL_TABS.map(t => t.id);
        const next = salvas.includes(tabId)
            ? salvas.filter(id => id !== tabId)
            : [...salvas, tabId];
        try {
            const updated = await brokerService.saveProfile({
                id: effectiveBroker.id,
                settings: { ...effectiveBrokerSettings, brokerPortalTabs: next },
            });
            setAllBrokers(prev => prev.map(b => b.id === updated.id ? updated : b));
            setSelectedAdminBroker(updated);
            // Se a aba que acabamos de ocultar é a que está aberta agora, sai dela — senão o
            // conteúdo continua na tela mesmo depois de "ocultada" (só o botão da nav mudava).
            if (currentTab === tabId && !next.includes(tabId)) {
                const effectiveNext: string[] = abasHabilitadas({ brokerPortalTabs: next });
                const fallback = (effectiveNext.includes('estoque') ? 'estoque' : effectiveNext[0]) as PortalTab;
                irParaAba(fallback);
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
    // DealModal, 2026-07-21).
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

    // O mapa casa negócio↔unidade por property_id. Uma proposta em cesta tem N
    // unidades, então vira N pseudo-negócios — sem isso só a unidade principal
    // ficaria pintada no espelho.
    const dealsDoMapa = useMemo(() => [
        ...commercialDeals,
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
    ] as unknown as PropertyDeal[], [commercialDeals, proposals]);

    // ── Aviso curto (antes eram `alert()` do navegador) ───────────────────────
    const [shareMsg, setShareMsg] = useState<string | null>(null);
    const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const toast = React.useCallback((m: string) => {
        setShareMsg(m);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setShareMsg(null), 4000);
    }, []);
    React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
            toast(`Unidade ${unit.number || unit.name} reservada por 48h.`);
        } catch (err) {
            console.error('[BrokerPortal] Erro ao reservar unidade:', err);
            toast('Erro ao reservar a unidade. Tente novamente.');
        }
    };

    // "Fazer proposta" direto numa unidade troca a cesta por uma cesta de 1. Se o
    // corretor desiste, a cesta que ele vinha montando volta — antes a unidade
    // avulsa ficava presa na barra da cesta depois do "voltar".
    const cestaAntesDoSimulador = React.useRef<BrokerUnit[] | null>(null);

    const abrirSimulador = () => {
        setCartWarning(null);
        setAbaDeOrigem(currentTab === 'propostas' ? null : currentTab);
        setShowSimulator(true);
        setCurrentTab('propostas');
    };

    // Clique direto na unidade: abre o simulador com uma cesta de 1, como sempre.
    const handleMakeProposal = (unit: BrokerUnit) => {
        cestaAntesDoSimulador.current = cart;
        setCart([unit]);
        abrirSimulador();
    };

    const abrirSimuladorDaCesta = () => {
        cestaAntesDoSimulador.current = null;
        abrirSimulador();
    };

    const cancelarSimulador = () => {
        if (cestaAntesDoSimulador.current) setCart(cestaAntesDoSimulador.current);
        cestaAntesDoSimulador.current = null;
        setShowSimulator(false);
        setCurrentTab(abaDeOrigem ?? 'estoque');
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

    const limparCesta = () => { setCart([]); setCartWarning(null); };

    const cartTotal = useMemo(
        // Pelo link a unidade não traz `current_price` (só `price`) — ver
        // BrokerDevelopments.comPrecoDaTabela; sem a queda o total era R$ 0.
        () => cart.reduce((s, u) => s + (Number(u.current_price ?? u.price) || 0), 0),
        [cart]
    );

    const handleSubmitProposal = async (proposal: Partial<BrokerProposal>) => {
        try {
            const savedProposal = await brokerService.saveProposal(proposal);
            setProposals(prev => [savedProposal, ...prev.filter(p => !p.id?.startsWith('prop-'))]);
            setShowSimulator(false);
            setCart([]);
            cestaAntesDoSimulador.current = null;
            avisarAcaoDoPortal('enviou-proposta');
            toast('Proposta enviada! A incorporadora vai analisar.');
        } catch (error) {
            console.error("Erro ao salvar proposta:", error);
            toast('Erro ao enviar a proposta. Tente novamente.');
        }
    };

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

    const brokerDisplayName = effectiveBroker?.name || (effectiveBrokerEmail ? effectiveBrokerEmail.split('@')[0] : 'Corretor');
    /** Organização para as abas que pedem uma (materiais, analytics, simulador...). */
    const orgIdEfetivo = initialOrgId || selectedOrgId;

    return {
        isAdmin, organizations,
        selectedOrgId, setSelectedOrgId, orgIdEfetivo,
        currentTab, setCurrentTab, irParaAba,
        selectedPurpose, setSelectedPurpose, selectedBuildingId, setSelectedBuildingId,
        units, loading, proposals, myProposals, visibleUnits, buildings, displayUnits, dealsDoMapa, stats,
        cart, cartTotal, cartWarning, setCartWarning, handleToggleCart, limparCesta,
        showSimulator, setShowSimulator, abrirSimulador: abrirSimuladorDaCesta, cancelarSimulador, handleMakeProposal, handleSubmitProposal, handleReserve,
        effectiveBroker, effectiveBrokerEmail, brokerDisplayName,
        enabledTabIds, visibleTabs, navTabs, toggleTabVisibility,
        proposalUnitLabel, handleProposalPdf, handleProposalShare,
        shareMsg, toast,
    };
}

export type BrokerPortalState = ReturnType<typeof useBrokerPortal>;
