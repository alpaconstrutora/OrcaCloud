import React, { useState } from 'react';
import { Building2, FileText, Send, CheckCircle2, DollarSign, User, Briefcase, Info, Smartphone, Settings2, Eye, EyeOff, X, ChevronDown, ArrowLeft, Bell, HelpCircle, LogOut } from 'lucide-react';
import { PortalHelp } from './portal/PortalHelp';
import BrokerMyData from './broker/BrokerMyData';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
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
import BrokerHealthPanel from './broker/BrokerHealthPanel';
import BrokerPortalMobile from './broker/BrokerPortalMobile';
import MobilePreviewFrame from './MobilePreviewFrame';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { useBrokerPortal, ALL_TABS, TAB_BY_ID, formatCurrency, type PortalTab } from './broker/useBrokerPortal';
import { ehAbaDeDemonstracao } from '../utils/brokerPortalTabs';
import type { BrokerProfile } from '../types';

interface BrokerPortalProps {
    profile: { group: string; role: string; email?: string };
    activeTab?: PortalTab;
    organizationId?: string;
    /** Oculta chrome de admin (impersonação, seletor de org, botão de prévia). Usado na rota pública por token. */
    isPreview?: boolean;
    /** Token de acesso público. Quando presente, dados são buscados via RPCs anon (SECURITY DEFINER). */
    portalToken?: string;
    /** Corretor pré-selecionado na impersonação (usado quando admin clica em "Acessar Portal" na BrokerList). */
    initialBroker?: BrokerProfile;
    /** Volta para a lista "Meus Corretores" (botão de voltar §5.3). Ausente = sem botão (ex: link público). */
    onBack?: () => void;
    /** Login por e-mail (16/10/2026): "Sair" no menu de conta. Pelo link não há sessão. */
    onLogout?: () => void;
    /** Pré-visualização do tour pelo editor da ajuda: abre este tour ao montar. */
    forcarTour?: string | null;
}

// Agrupamento das abas para a navegação em sidebar do portal público (Fase 1+2 do redesign UI/UX).
const NAV_GROUPS: { label: string; tabs: PortalTab[] }[] = [
    { label: 'Desempenho', tabs: ['analytics'] },
    { label: 'Comercial', tabs: ['estoque', 'empreendimentos', 'propostas', 'leads'] },
    { label: 'Financeiro', tabs: ['comissoes'] },
    { label: 'Conteúdo', tabs: ['materiais', 'treinamento'] },
    { label: 'Engajamento', tabs: ['ranking', 'agenda', 'chat'] },
    { label: 'Gestão', tabs: ['saude'] },
];

/**
 * Seletor de casca (plano docs/planos/2026-10-16-portal-corretor-mobile.md, F1).
 * O corretor no celular (link ou login por e-mail) recebe a casca de app
 * `BrokerPortalMobile`; o resto — desktop, app interno, admin — a de sempre.
 * `innerWidth < 768` é lido UMA vez na montagem, como Treinamentos/Diário:
 * girar o aparelho não troca de casca no meio de uma proposta.
 */
const BrokerPortal: React.FC<BrokerPortalProps> = (props) => {
    const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    if (props.portalToken && isMobile) {
        return (
            <BrokerPortalMobile
                profile={props.profile}
                organizationId={props.organizationId}
                portalToken={props.portalToken}
                initialBroker={props.initialBroker}
                onLogout={props.onLogout}
                forcarTour={props.forcarTour}
            />
        );
    }
    return <BrokerPortalDesktop {...props} />;
};

const BrokerPortalDesktop: React.FC<BrokerPortalProps> = ({ profile, activeTab = 'analytics', organizationId: initialOrgId, isPreview = false, portalToken, initialBroker, onBack, forcarTour = null, onLogout }) => {
    const {
        isAdmin, selectedOrgId, currentTab, irParaAba,
        selectedPurpose, setSelectedPurpose, selectedBuildingId, setSelectedBuildingId,
        units, loading, myProposals, visibleUnits, buildings, displayUnits, dealsDoMapa, stats,
        cart, cartTotal, cartWarning, handleToggleCart, limparCesta,
        showSimulator, abrirSimulador, cancelarSimulador, handleMakeProposal, handleSubmitProposal, handleReserve,
        effectiveBroker, effectiveBrokerEmail, brokerDisplayName,
        enabledTabIds, visibleTabs, navTabs, toggleTabVisibility,
        proposalUnitLabel, handleProposalPdf, handleProposalShare, shareMsg, toast,
    } = useBrokerPortal({ profile, activeTab, organizationId: initialOrgId, isPreview, portalToken, initialBroker });

    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const [showTabConfig, setShowTabConfig] = useState(false);

    // Menu de conta do portal público (link do corretor) — espelha o dropdown de perfil do sistema
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [showMyAccount, setShowMyAccount] = useState(false);
    // "Meus dados": o cadastro que a incorporadora tem deste corretor — o mesmo de
    // Portais › Meus Corretores. Já está em mãos (`initialBroker` vem inteiro da RPC
    // do token), então o painel não carrega nada — ao contrário do Parceiro.
    const [showMyData, setShowMyData] = useState(false);
    // Central de ajuda (F2, 04/10/2026) — mesmo painel do Portal do Parceiro.
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    // Encaixe do cartão "Primeiros passos" (F8); não aparece para o gestor personificando.
    const [slotChecklist, setSlotChecklist] = useState<HTMLDivElement | null>(null);
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

    // currentTab nasce do default independente de essa aba estar habilitada para o
    // corretor — no link público (isAdmin=false), se a aba atual tiver sido ocultada,
    // o conteúdo antigo ficava preso na tela porque nada trocava currentTab.
    // Corrige assim que detecta o descompasso.
    React.useEffect(() => {
        if (navTabs.length > 0 && !navTabs.some(t => t.id === currentTab)) {
            irParaAba(navTabs[0].id);
        }
    }, [navTabs, currentTab, irParaAba]);

    // Modo standalone = link público do corretor (portalToken). Só nele renderizamos a
    // casca própria do portal (banner + header + sidebar), espelhando o Portal do Parceiro.
    // No app autenticado a navegação já vem da sidebar do Layout — não duplicar.
    const isStandalone = !!portalToken;
    const navGroups = NAV_GROUPS
        .map(g => ({ label: g.label, items: g.tabs.map(id => TAB_BY_ID[id]).filter(t => t && navTabs.some(nt => nt.id === t.id)) }))
        .filter(g => g.items.length > 0);

    return (
        <div className={isStandalone ? 'flex flex-col h-screen bg-white text-gray-800 overflow-hidden font-sans' : 'animate-in fade-in slide-in-from-top-4 duration-700'}>
            {/* Casca do portal público — banner + header + sidebar (Fase 1+2 do redesign) */}
            {/* Só no acesso pelo LINK. Quem entrou por e-mail e senha (`onLogout`
                presente, 16/10/2026) não está num link público. */}
            {isStandalone && !onLogout && (
                <div className="h-9 bg-indigo-50 border-b border-indigo-200 flex items-center justify-center gap-3 shrink-0 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    <span>Acesso via link público</span>
                </div>
            )}
            {isStandalone && (
                <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-wider">Broker Portal</div>
                        {/* Saudação: o nome do corretor, como o Portal do Parceiro mostra o
                            nome do parceiro ao lado do badge (14/10/2026). */}
                        <h1 className="text-base font-bold text-gray-900 tracking-tight">{brokerDisplayName}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsHelpOpen(true)}
                        title="Ajuda"
                        aria-label="Abrir a ajuda do portal"
                        data-tour="ajuda"
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <div className="relative" ref={accountMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsAccountMenuOpen(o => !o)}
                            className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                            data-tour="conta"
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
                                    {/* "Meus dados" vem ANTES de "Minha conta", como no Parceiro:
                                        é o cadastro que a incorporadora tem do corretor (CRECI,
                                        imobiliária, comissão); "Minha conta" é o resumo curto. */}
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); setShowMyData(true); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <Briefcase className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Meus dados</span>
                                    </button>
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
                                        onClick={() => { setIsAccountMenuOpen(false); setIsHelpOpen(true); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <HelpCircle className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Ajuda</span>
                                    </button>
                                    {onLogout && (
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); onLogout(); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                            role="menuitem"
                                        >
                                            <LogOut className="h-4 w-4" />
                                            <span className="flex-1">Sair</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    </div>
                </header>
            )}

            <PortalHelp
                open={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                portal="corretor"
                token={portalToken}
                orgId={initialOrgId || selectedOrgId || null}
                visibleSections={enabledTabIds}
                currentSection={currentTab}
                onNavigate={(s) => irParaAba(s as PortalTab)}
                // a rota pública do link TAMBÉM passa isPreview (só para esconder o cromo de admin):
                // prévia do gestor é isPreview SEM token
                modoPrevia={isPreview && !portalToken}
                forcarTour={forcarTour}
                checklistSlot={isAdmin ? null : slotChecklist}
                accent="indigo"
                tourKey={portalToken || effectiveBrokerEmail || null}
                autoTour={isStandalone}
            />

            {/* Meus dados — painel lateral (UI_PATTERNS / §26), igual ao Portal do
                Parceiro. NUNCA tela cheia: é consulta a um cadastro. O corpo é o
                BrokerMyData, alimentado pelo corretor que a casca já tem — sem RPC nova. */}
            <Sheet open={showMyData} onClose={() => setShowMyData(false)} size="xl">
                <SheetHeader onClose={() => setShowMyData(false)}>
                    <SheetTitle>Meus dados</SheetTitle>
                    <SheetDescription>
                        O cadastro que a incorporadora tem de você. Para alterar, fale com ela.
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-4 py-5 md:px-6">
                    <BrokerMyData broker={effectiveBroker} />
                </SheetPanel>
            </Sheet>

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
                    <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex flex-col gap-1 shrink-0 overflow-y-auto" data-tour="menu">
                        {navGroups.map(group => (
                            <React.Fragment key={group.label}>
                                {group.items.map(tab => (
                                    <button
                                        key={tab.id}
                                        data-tour={`aba-${tab.id}`}
                                        onClick={() => irParaAba(tab.id as PortalTab)}
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
                    {/* A MESMA casca que o corretor recebe no celular (antes era a visão
                        interna de desktop espremida na moldura), com as abas que a
                        engrenagem "Configurar abas visíveis" deixou ligadas. */}
                    <BrokerPortalMobile
                        profile={profile}
                        organizationId={initialOrgId || selectedOrgId}
                        initialBroker={effectiveBroker ?? undefined}
                        previa
                    />
                </MobilePreviewFrame>
            )}

            {/* Header — só no app autenticado; no portal público a casca acima já tem header próprio.
                "Voltar" acima do h1 (guia §23): só 1 salto (Meus Corretores → Portal do Corretor),
                abaixo do mínimo de 2 saltos que a migalha de pão exige — convenção de ~43 arquivos. */}
            {!isStandalone && (
            <div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
                    >
                        <ArrowLeft className="w-4 h-4" /> Voltar
                    </button>
                )}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            Portal do Corretor
                        </h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
                            {effectiveBrokerEmail ? `Olá, ${effectiveBrokerEmail.split('@')[0]}` : 'Bem-vindo'} • Estoque, propostas, leads e comissões em tempo real.
                        </p>
                    </div>
                    {/* Ações do admin (prévia mobile + configurar abas) na linha do título,
                        junto da Ajuda — eram uma toolbar própria abaixo dos KPIs (§5.3);
                        sem o seletor de organização (duplicava o do topo, guia REGRA #5)
                        e sem "Voltar" (subiu para cima do h1), a toolbar ficava vazia. */}
                    <div className="flex items-center gap-2 shrink-0">
                        {isAdmin && (
                            <button
                                onClick={() => setShowMobilePreview(true)}
                                title="Visualizar como o corretor vê no celular"
                                className="hidden md:flex items-center justify-center h-9 w-9 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                            >
                                <Smartphone className="w-4 h-4" />
                            </button>
                        )}
                        {isAdmin && effectiveBroker && (
                            <button
                                onClick={() => setShowTabConfig(true)}
                                title="Configurar abas visíveis do corretor"
                                className="hidden md:flex items-center justify-center h-9 w-9 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                            >
                                <Settings2 className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsHelpOpen(true)}
                            title="Ajuda"
                            aria-label="Abrir a ajuda do portal"
                            data-tour="ajuda"
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 shrink-0"
                        >
                            <HelpCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
            )}

            {!isAdmin && currentTab === navTabs[0]?.id && <div ref={setSlotChecklist} className="empty:hidden" />}

            {/* KPI Cards — §4 (componente canônico KpiCard, cor semântica por KPI).
                Visíveis SOMENTE na aba Analytics: são o resumo de desempenho do
                corretor, não um cromo global do portal. */}
            {currentTab === 'analytics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3" data-tour="analytics-kpis">
                <KpiCard label="Unidades Disponíveis" value={loading ? '…' : stats.available} sub={loading ? undefined : `de ${visibleUnits.length} unidades`} icon={<Building2 className="w-5 h-5" />} color="blue" />
                <KpiCard label="Propostas Enviadas" value={loading ? '…' : stats.sent} sub="Aguardando análise" icon={<Send className="w-5 h-5" />} color="amber" pulse={!loading && stats.sent > 0} />
                <KpiCard label="Propostas Aprovadas" value={loading ? '…' : stats.approved} sub="Vendas confirmadas" icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Comissão Acumulada" value={loading ? '…' : formatCurrency(stats.totalCommission)} sub="5% sobre aprovadas" icon={<DollarSign className="w-5 h-5" />} color="violet" />
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
                                // Demonstração (D9): desligada para todos e o botão diz por quê.
                                if (ehAbaDeDemonstracao(tab.id)) {
                                    return (
                                        <div
                                            key={tab.id}
                                            title="Esta aba só mostra dados de demonstração (fixos no sistema). Volta a poder ser ligada quando tiver dados reais."
                                            className="w-full flex items-center justify-between gap-4 p-4 rounded-[6px] border bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed"
                                        >
                                            <div className="flex items-center gap-3">
                                                <tab.icon className="w-4 h-4 text-gray-300" />
                                                <span className="text-sm font-medium">{tab.label}</span>
                                            </div>
                                            <span className="text-xs text-gray-400 text-right">Demonstração, sem dados reais</span>
                                        </div>
                                    );
                                }
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
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full" data-tour="menu">
                    {navTabs.map(tab => {
                        const hidden = isAdmin && !visibleTabs.some(v => v.id === tab.id);
                        return (
                            <button
                                key={tab.id}
                                data-tour={`aba-${tab.id}`}
                                onClick={() => irParaAba(tab.id as PortalTab)}
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
                        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit shrink-0" data-tour="estoque-finalidade">
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

                    <div data-tour="estoque-mapa">
                    <PropertyUnitMap
                        units={displayUnits}
                        parentProperty={buildings.find(b => b.id === selectedBuildingId)}
                        deals={dealsDoMapa}
                        onSelectUnit={handleMakeProposal}
                        onReserveUnit={handleReserve}
                        selectedUnitIds={cart.map(u => u.id)}
                        onToggleUnit={handleToggleCart}
                    />
                    </div>
                </div>
            )}

            {currentTab === 'empreendimentos' && (
                <div data-tour="empreendimentos-lista">
                <BrokerDevelopments
                    buildings={buildings}
                    units={visibleUnits}
                    portalToken={portalToken}
                    organizationId={initialOrgId || selectedOrgId}
                    onMakeProposal={handleMakeProposal}
                    selectedUnitIds={cart.map(u => u.id)}
                    onToggleUnit={handleToggleCart}
                    deals={dealsDoMapa}
                />
                </div>
            )}

            {currentTab === 'propostas' && showSimulator && cart.length > 0 && (
                <BrokerProposalSimulator
                    units={cart}
                    brokerEmail={effectiveBrokerEmail || ''}
                    organizationId={initialOrgId || selectedOrgId || 'demo'}
                    onSubmitProposal={handleSubmitProposal}
                    onCancel={cancelarSimulador}
                    portalToken={portalToken}
                />
            )}

            {currentTab === 'propostas' && !showSimulator && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden" data-tour="propostas-lista">
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
                    <Info className="w-4 h-4 shrink-0" /> {shareMsg}
                </div>
            )}

            {/* Barra da cesta — só aparece com seleção em andamento e fora do simulador.
                Permite montar apto + vaga + box e mandar UMA proposta. */}
            {!showSimulator && cart.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[290] w-[min(92vw,44rem)] bg-white rounded-2xl border border-indigo-200 shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-300" data-tour="cesta-barra">
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
                            onClick={abrirSimulador}
                            className="shrink-0 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-button uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                        >
                            Fazer proposta ({cart.length})
                        </button>
                        <button
                            type="button"
                            onClick={limparCesta}
                            title="Limpar seleção"
                            className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {currentTab === 'leads' && (
                <BrokerLeadManager brokerEmail={effectiveBrokerEmail || ''} portalToken={portalToken} organizationId={initialOrgId || selectedOrgId} visao={isAdmin ? 'gestor' : 'corretor'} />
            )}

            {currentTab === 'comissoes' && (
                <BrokerCommissions brokerEmail={effectiveBrokerEmail || ''} portalToken={portalToken} />
            )}

            {currentTab === 'materiais' && (
                <div data-tour="materiais-grade"><BrokerMaterials organizationId={initialOrgId || selectedOrgId || 'demo'} portalToken={portalToken} /></div>
            )}

            {currentTab === 'ranking' && (
                <BrokerRanking brokerEmail={effectiveBrokerEmail || ''} portalToken={portalToken} organizationId={initialOrgId || selectedOrgId} visao={isAdmin ? 'gestor' : 'corretor'} />
            )}

            {currentTab === 'treinamento' && (
                <BrokerTraining brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'agenda' && (
                <BrokerEvents brokerEmail={effectiveBrokerEmail || ''} portalToken={portalToken} organizationId={initialOrgId || selectedOrgId} visao={isAdmin ? 'gestor' : 'corretor'} />
            )}

            {currentTab === 'chat' && (
                <BrokerChat brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {/* O miolo do Analytics (BrokerAnalytics) é DEMONSTRAÇÃO — gerador fixo no
                componente. Saiu do portal (D9, 16/10/2026); a aba fica só com os 4
                KPIs reais do topo. */}

            {currentTab === 'saude' && (
                <BrokerHealthPanel organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrokerPortal;
