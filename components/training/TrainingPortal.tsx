import React, { useEffect, useRef, useState } from 'react';
import {
    Award, BookOpen, ChevronDown, GraduationCap, HelpCircle, History, Loader2, LogOut,
    AlertTriangle, CheckCircle2, User, Library, Smartphone,
} from 'lucide-react';
import { PortalHelp } from '../portal/PortalHelp';
import {
    TRAINING_PORTAL_TAB_IDS, TRAINING_PORTAL_TAB_LABELS, resolverAbaDoPortalDeTreinamentos,
    type TrainingPortalTabId,
} from '../../utils/trainingPortalTabs';
import AcademyPlayerView from '../academy/AcademyPlayerView';
import MobilePreviewFrame from '../MobilePreviewFrame';
import TraineeEnrollmentsTab from './portal/TraineeEnrollmentsTab';
import TraineeCatalogTab from './portal/TraineeCatalogTab';
import TraineeCertificatesTab from './portal/TraineeCertificatesTab';
import TraineeHistoryTab from './portal/TraineeHistoryTab';
import TraineeMyDataSheet from './portal/TraineeMyDataSheet';
import TrainingPortalMobile from './TrainingPortalMobile';
import { useTrainingPortal } from './useTrainingPortal';

/**
 * Portal de Treinamentos — /portal-treinamentos.
 *
 * Pedido de 15/10/2026: "recursos humanos > treinamento: criar portal para
 * treinamentos". Decisões: colaboradores + terceirizados, entrada por e-mail
 * e senha com convite, portal dedicado com a casca dos portais externos.
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 *
 * Casca própria, FORA do <Layout> (como Parceiro e Crédito): o treinando não
 * é membro da organização, não tem seletor de org nem sidebar do ÒPURA. O
 * gutter §20.2 é reaplicado à mão no <main>. Identidade: teal (o mesmo cartão
 * do LoginGateway).
 *
 * Tudo que a tela lê vem de RPC `academy_portal_user_*` (academyTraineeService):
 * leitura direta de tabela devolveria [] pela RLS, sem erro.
 *
 * "Assistir aula" é TELA (troca o conteúdo in-flow, mantendo a casca) — nunca
 * overlay. O player é o mesmo do app e do Portal do Colaborador; só o canal
 * (createTraineeChannel) muda.
 *
 * Celular (16/10, docs/planos/2026-10-16-portal-treinamentos-mobile.md): com
 * `innerWidth < 768` na montagem entra a casca de app `TrainingPortalMobile`;
 * o estado e as ações são o hook `useTrainingPortal`, comum às duas. No desktop
 * o botão "Ver no celular" abre a mesma casca mobile dentro de MobilePreviewFrame.
 */

interface Props {
    userEmail: string;
    onLogout?: () => void;
    /** prévia do gestor (RH › Treinamentos › Portal): tour sem gravar nada */
    forcarTour?: string | null;
}

const TAB_ICONS: Record<TrainingPortalTabId, React.ComponentType<{ className?: string }>> = {
    treinamentos: BookOpen,
    catalogo: Library,
    certificados: Award,
    historico: History,
};

const TrainingPortal: React.FC<Props> = (props) => {
    // Lido uma vez na montagem, como Minhas Tarefas e o Diário (TasksModule).
    const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    return isMobile ? <TrainingPortalMobile {...props} /> : <TrainingPortalDesktop {...props} />;
};

const TrainingPortalDesktop: React.FC<Props> = ({ userEmail, onLogout, forcarTour = null }) => {
    const {
        activeTab, setActiveTab, aulaAberta, abrirMatricula, abrirMatriculaPorId, voltarDaAula,
        toast, notify, channel, identidades, carregandoAcesso, erroAcesso, principal,
        mostrarOrganizacao, orgDaAjuda, iniciais,
    } = useTrainingPortal(userEmail);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [meusDadosAberto, setMeusDadosAberto] = useState(false);
    const [previaMobile, setPreviaMobile] = useState(false);
    const [slotChecklist, setSlotChecklist] = useState<HTMLDivElement | null>(null);
    const accountMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isAccountMenuOpen) return;
        const fechar = (e: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setIsAccountMenuOpen(false);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [isAccountMenuOpen]);

    return (
        <div className="flex flex-col h-screen bg-white overflow-hidden font-sans">
            {/* Header */}
            <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-teal-600 text-white rounded-lg text-xs font-black uppercase tracking-wider shrink-0">
                        <GraduationCap className="w-4 h-4" />
                        <span className="hidden sm:inline">Portal de Treinamentos</span>
                        <span className="sm:hidden">Treinamentos</span>
                    </div>
                    <h1 className="text-base font-bold text-gray-900 tracking-tight truncate">
                        {mostrarOrganizacao ? 'Suas organizações' : (principal?.org_nome ?? '')}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPreviaMobile(true)}
                        title="Ver como fica no celular"
                        aria-label="Ver o portal como fica no celular"
                        className="hidden md:inline-flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <Smartphone className="w-5 h-5" />
                    </button>
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
                            className="flex items-center gap-2 text-sm bg-gray-50 hover:bg-gray-100 px-2 md:px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                            data-tour="conta"
                            aria-haspopup="menu"
                            aria-expanded={isAccountMenuOpen}
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">{iniciais}</span>
                            <span className="hidden md:inline font-semibold text-gray-600 max-w-[200px] truncate">{principal?.name || userEmail}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isAccountMenuOpen && (
                            <div className="absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">{iniciais}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-bold text-gray-900">{principal?.name || '—'}</div>
                                            <div className="truncate text-xs text-gray-500">{userEmail || principal?.email}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); setMeusDadosAberto(true); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <User className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Meus dados</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setIsAccountMenuOpen(false); setIsHelpOpen(true); }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        role="menuitem"
                                    >
                                        <HelpCircle className="h-4 w-4 text-gray-400" />
                                        <span className="flex-1">Ajuda</span>
                                    </button>
                                </div>
                                {onLogout && (
                                    <div className="border-t border-gray-100 p-2">
                                        <button
                                            type="button"
                                            onClick={() => { setIsAccountMenuOpen(false); onLogout(); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                            role="menuitem"
                                        >
                                            <LogOut className="h-4 w-4" />
                                            <span className="flex-1">Sair</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Menu lateral (desktop) */}
                <aside className="hidden md:flex w-64 border-r border-gray-100 bg-gray-50 p-4 flex-col gap-1.5 shrink-0" data-tour="menu">
                    {TRAINING_PORTAL_TAB_IDS.map(id => {
                        const Icon = TAB_ICONS[id];
                        const ativa = activeTab === id && !aulaAberta;
                        return (
                            <button
                                key={id}
                                type="button"
                                data-tour={`aba-${id}`}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
                                    ${ativa ? 'bg-teal-50 border border-teal-100 text-teal-800 font-semibold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{TRAINING_PORTAL_TAB_LABELS[id]}</span>
                            </button>
                        );
                    })}
                </aside>

                {/* Conteúdo. Fora do <main> do <Layout>: gutter §20.2 reaplicado aqui. */}
                <main className="flex-1 bg-[#F2F2F4] overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative">
                    {carregandoAcesso ? (
                        <div className="min-h-[300px] flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : erroAcesso || identidades.length === 0 ? (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
                                <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto mb-4" />
                                <h3 className="text-base font-semibold text-gray-900 mb-1.5">Acesso não encontrado</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    {erroAcesso
                                        ? (erroAcesso as Error).message
                                        : 'Este e-mail não tem acesso ativo ao Portal de Treinamentos. Peça ao RH da empresa para liberar o acesso e reenviar o convite.'}
                                </p>
                            </div>
                        </div>
                    ) : aulaAberta ? (
                        <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-[#ECECEF] p-4 md:p-6">
                            <AcademyPlayerView
                                enrollmentId={aulaAberta.id}
                                titulo={aulaAberta.curso}
                                subtitulo={aulaAberta.nr_referencia}
                                channel={channel}
                                onVoltar={voltarDaAula}
                            />
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto">
                            {activeTab === TRAINING_PORTAL_TAB_IDS[0] && <div ref={setSlotChecklist} className="empty:hidden mb-6" />}
                            {activeTab === 'treinamentos' && (
                                <TraineeEnrollmentsTab mostrarOrganizacao={mostrarOrganizacao} onAbrir={abrirMatricula} />
                            )}
                            {activeTab === 'catalogo' && (
                                <TraineeCatalogTab mostrarOrganizacao={mostrarOrganizacao} notify={notify} onInscrito={abrirMatriculaPorId} />
                            )}
                            {activeTab === 'certificados' && (
                                <TraineeCertificatesTab mostrarOrganizacao={mostrarOrganizacao} notify={notify} />
                            )}
                            {activeTab === 'historico' && (
                                <TraineeHistoryTab mostrarOrganizacao={mostrarOrganizacao} />
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Barra inferior `md:hidden` — só rede de segurança para janela redimensionada abaixo de
                768px DEPOIS de montar; no celular de verdade entra TrainingPortalMobile. */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                <div className="flex">
                    {TRAINING_PORTAL_TAB_IDS.map(id => {
                        const Icon = TAB_ICONS[id];
                        const ativa = activeTab === id && !aulaAberta;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setActiveTab(id)}
                                className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-3 px-1 transition-all duration-200 relative ${ativa ? 'text-teal-700' : 'text-gray-400'}`}
                            >
                                {ativa && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-teal-600 rounded-full" />}
                                <Icon className="w-4 h-4" />
                                <span className="text-[10px] font-medium leading-none whitespace-nowrap">
                                    {TRAINING_PORTAL_TAB_LABELS[id].replace('Meus ', '')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <TraineeMyDataSheet
                open={meusDadosAberto}
                onClose={() => setMeusDadosAberto(false)}
                userEmail={userEmail}
                identidades={identidades}
            />

            <PortalHelp
                open={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                portal="treinamentos"
                orgId={orgDaAjuda}
                visibleSections={TRAINING_PORTAL_TAB_IDS}
                currentSection={activeTab}
                onNavigate={s => setActiveTab(resolverAbaDoPortalDeTreinamentos(s))}
                forcarTour={forcarTour}
                checklistSlot={slotChecklist}
                accent="teal"
                tourKey={userEmail || principal?.email || null}
                autoTour={identidades.length > 0}
            />

            {toast && (
                <div className={`fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Prévia no celular — a casca mobile dentro do iframe estreito, com os dados do próprio treinando. */}
            {previaMobile && (
                <MobilePreviewFrame onClose={() => setPreviaMobile(false)} title="Prévia — Portal de Treinamentos no celular">
                    <TrainingPortalMobile userEmail={userEmail} previa />
                </MobilePreviewFrame>
            )}
        </div>
    );
};

export default TrainingPortal;
