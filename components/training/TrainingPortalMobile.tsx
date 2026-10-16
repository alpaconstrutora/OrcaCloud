import React, { useMemo, useState } from 'react';
import {
    AlertTriangle, Award, BookOpen, CheckCircle2, GraduationCap, HelpCircle, History, Library,
    Loader2, LogOut, User, X,
} from 'lucide-react';
import { PortalHelp } from '../portal/PortalHelp';
import {
    TRAINING_PORTAL_TAB_IDS, TRAINING_PORTAL_TAB_LABELS, resolverAbaDoPortalDeTreinamentos,
    type TrainingPortalTabId,
} from '../../utils/trainingPortalTabs';
import AcademyPlayerView from '../academy/AcademyPlayerView';
import TraineeEnrollmentsTab from './portal/TraineeEnrollmentsTab';
import TraineeCatalogTab from './portal/TraineeCatalogTab';
import TraineeCertificatesTab from './portal/TraineeCertificatesTab';
import TraineeHistoryTab from './portal/TraineeHistoryTab';
import TraineeMyDataSheet from './portal/TraineeMyDataSheet';
import { useTrainingPortal } from './useTrainingPortal';
import { VerComoContext } from './portal/verComo';

/**
 * Portal de Treinamentos no celular — app de tela cheia.
 * Plano: docs/planos/2026-10-16-portal-treinamentos-mobile.md
 *
 * Mesmo arranjo de Minhas Tarefas / Diário de Obras (TasksMobileApp, DiaryMobileApp):
 *  - celular de verdade  → `TrainingPortal` troca a casca de desktop por esta quando
 *    `innerWidth < 768`; tela cheia (`h-dvh` onde houver: `100vh` no celular é a
 *    altura COM a barra do navegador, e a barra inferior sumiria atrás dela); os
 *    rodapés somam `env(safe-area-inset-bottom)` (barra de gestos do iPhone);
 *  - desktop             → dentro de `MobilePreviewFrame` ("Ver no celular"), com
 *    `previa`: o iframe é o telefone, `h-screen` é a altura dele e a barra de
 *    status falsa fica, porque a moldura desenha o notch por cima do topo.
 *
 * Toast e folha de conta são PRÓPRIOS e `absolute` dentro do telefone: no iframe
 * da prévia, qualquer `createPortal(document.body)` vai parar no documento pai.
 * A central de ajuda (PortalHelp) é a exceção assumida — abre sobre o documento
 * pai na prévia, como nos outros portais; por isso o tour automático fica
 * desligado na prévia (ele procuraria os `[data-tour]` fora do iframe).
 *
 * As quatro abas são as MESMAS do desktop (mesmas RPCs, mesmos `data-tour`);
 * Certificados, Histórico e Catálogo recebem `compacto` para virar cartões.
 *
 * `verComo` (16/10, docs/planos/2026-10-16-portal-treinamentos-previa-ver-como.md):
 * prévia do GESTOR como a pessoa (aba Portal da gestão). Implica `previa`;
 * as abas leem o alvo pelo VerComoContext; faixa "nada é gravado"; ajuda em
 * `modoPrevia` sem tourKey (tour disponível, nada gravado).
 */

interface Props {
    userEmail: string;
    onLogout?: () => void;
    /** dentro do MobilePreviewFrame: barra de status falsa + altura do iframe */
    previa?: boolean;
    /** prévia do gestor "ver como" esta pessoa (id de academy_portal_users); implica `previa` */
    verComo?: string | null;
    forcarTour?: string | null;
}

const TAB_ICONS: Record<TrainingPortalTabId, React.ComponentType<{ className?: string }>> = {
    treinamentos: BookOpen,
    catalogo: Library,
    certificados: Award,
    historico: History,
};

/** Barra de status falsa — só na prévia (o telefone de verdade tem a dele). */
const StatusBar: React.FC = () => {
    const hora = useMemo(
        () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        [],
    );
    return (
        <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-white shrink-0">
            <span className="text-xs font-black text-slate-700">{hora}</span>
            <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5 items-end h-3">
                    {[3, 5, 7, 9].map((h, i) => (
                        <div key={i} className="w-1 bg-slate-700 rounded-sm" style={{ height: h }} />
                    ))}
                </div>
                <div className="w-6 h-3 border border-slate-700 rounded-sm relative">
                    <div className="absolute inset-0.5 bg-slate-700 rounded-[1px]" style={{ width: '70%' }} />
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-700 rounded-r" />
                </div>
            </div>
        </div>
    );
};

const TrainingPortalMobile: React.FC<Props> = ({ userEmail, onLogout, previa: previaProp = false, verComo = null, forcarTour = null }) => {
    const previa = previaProp || !!verComo;
    const p = useTrainingPortal(userEmail, verComo);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [contaAberta, setContaAberta] = useState(false);
    const [meusDadosAberto, setMeusDadosAberto] = useState(false);
    const [slotChecklist, setSlotChecklist] = useState<HTMLDivElement | null>(null);

    const semAcesso = !!p.erroAcesso || p.identidades.length === 0;

    return (
        <VerComoContext.Provider value={verComo}>
        <div
            className={`flex flex-col bg-[#F2F2F4] font-sans overflow-hidden relative ${
                previa ? 'h-screen' : 'h-screen supports-[height:100dvh]:h-dvh'}`}
            data-modo={previa ? 'previa' : 'aparelho'}
            data-ver-como={verComo ?? undefined}
        >
            {previa && <StatusBar />}

            {/* Cabeçalho curto: selo + organização; ajuda e conta à direita. */}
            <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                        <GraduationCap className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-teal-700 leading-none">Treinamentos</p>
                        <h1 className="text-sm font-bold text-gray-900 truncate leading-tight mt-0.5">
                            {p.mostrarOrganizacao ? 'Suas organizações' : (p.principal?.org_nome ?? 'Portal de Treinamentos')}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsHelpOpen(true)}
                        title="Ajuda"
                        aria-label="Abrir a ajuda do portal"
                        data-tour="ajuda"
                        className="p-2 rounded-lg text-gray-500 active:bg-gray-100"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setContaAberta(true)}
                        title="Minha conta"
                        aria-label="Abrir minha conta"
                        data-tour="conta"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white active:scale-95"
                    >
                        {p.iniciais}
                    </button>
                </div>
            </header>

            {/* Conteúdo rolável. Sem aula aberta a barra inferior é irmã (não precisa de pb-24). */}
            <main className={`flex-1 overflow-y-auto px-4 pt-4 ${
                p.aulaAberta ? 'pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'pb-4'}`}
            >
                {p.carregandoAcesso ? (
                    <div className="min-h-[300px] flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : semAcesso ? (
                    <div className="min-h-[60vh] flex items-center justify-center">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
                            <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto mb-3" />
                            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Acesso não encontrado</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                {p.erroAcesso
                                    ? (p.erroAcesso as Error).message
                                    : 'Este e-mail não tem acesso ativo ao Portal de Treinamentos. Peça ao RH da empresa para liberar o acesso e reenviar o convite.'}
                            </p>
                        </div>
                    </div>
                ) : p.aulaAberta ? (
                    <div className="bg-white rounded-2xl border border-[#ECECEF] p-4">
                        <AcademyPlayerView
                            enrollmentId={p.aulaAberta.id}
                            titulo={p.aulaAberta.curso}
                            subtitulo={p.aulaAberta.nr_referencia}
                            channel={p.channel}
                            onVoltar={p.voltarDaAula}
                            compacto
                        />
                    </div>
                ) : (
                    <>
                        {verComo && (
                            <div role="note" className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                                Prévia — vendo como <strong>{p.principal?.name || userEmail}</strong>. Nada é gravado.
                            </div>
                        )}
                        {p.activeTab === TRAINING_PORTAL_TAB_IDS[0] && <div ref={setSlotChecklist} className="empty:hidden mb-4" />}
                        {p.activeTab === 'treinamentos' && (
                            <TraineeEnrollmentsTab mostrarOrganizacao={p.mostrarOrganizacao} onAbrir={p.abrirMatricula} />
                        )}
                        {p.activeTab === 'catalogo' && (
                            <TraineeCatalogTab mostrarOrganizacao={p.mostrarOrganizacao} notify={p.notify} onInscrito={p.abrirMatriculaPorId} compacto />
                        )}
                        {p.activeTab === 'certificados' && (
                            <TraineeCertificatesTab mostrarOrganizacao={p.mostrarOrganizacao} notify={p.notify} compacto />
                        )}
                        {p.activeTab === 'historico' && (
                            <TraineeHistoryTab mostrarOrganizacao={p.mostrarOrganizacao} compacto />
                        )}
                    </>
                )}
            </main>

            {/* Barra inferior — some na sala de aula (a seta do player é a saída). */}
            {!p.aulaAberta && (
                <nav
                    className="bg-white border-t border-gray-100 flex shrink-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
                    data-tour="menu"
                    aria-label="Seções do portal"
                >
                    {TRAINING_PORTAL_TAB_IDS.map(id => {
                        const Icon = TAB_ICONS[id];
                        const ativa = p.activeTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                data-tour={`aba-${id}`}
                                onClick={() => p.setActiveTab(id)}
                                aria-current={ativa ? 'page' : undefined}
                                className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2.5 px-1 relative ${ativa ? 'text-teal-700' : 'text-gray-400'}`}
                            >
                                {ativa && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-teal-600 rounded-full" />}
                                <Icon className="w-5 h-5" />
                                <span className="text-[10px] font-medium leading-none whitespace-nowrap">
                                    {TRAINING_PORTAL_TAB_LABELS[id].replace('Meus ', '')}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            )}

            {/* Folha de conta — própria, dentro do telefone. */}
            {contaAberta && (
                <div className="absolute inset-0 z-30 bg-black/40 flex items-end" onClick={() => setContaAberta(false)}>
                    <div
                        className="w-full bg-white rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-2"
                        role="dialog"
                        aria-label="Minha conta"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">{p.iniciais}</span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold text-gray-900">{p.principal?.name || '—'}</div>
                                <div className="truncate text-xs text-gray-500">{userEmail || p.principal?.email}</div>
                            </div>
                            <button type="button" onClick={() => setContaAberta(false)} aria-label="Fechar" className="p-2 rounded-lg text-gray-400 active:bg-gray-100">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setContaAberta(false); setMeusDadosAberto(true); }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-gray-700 active:bg-gray-50"
                        >
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="flex-1">Meus dados</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setContaAberta(false); setIsHelpOpen(true); }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-gray-700 active:bg-gray-50"
                        >
                            <HelpCircle className="h-4 w-4 text-gray-400" />
                            <span className="flex-1">Ajuda</span>
                        </button>
                        {onLogout && (
                            <button
                                type="button"
                                onClick={() => { setContaAberta(false); onLogout(); }}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-600 active:bg-red-50"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="flex-1">Sair</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Sheet é `fixed` sem portal: dentro do iframe da prévia fica no telefone. */}
            <TraineeMyDataSheet
                open={meusDadosAberto}
                onClose={() => setMeusDadosAberto(false)}
                userEmail={userEmail}
                identidades={p.identidades}
            />

            <PortalHelp
                open={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                portal="treinamentos"
                orgId={p.orgDaAjuda}
                visibleSections={TRAINING_PORTAL_TAB_IDS}
                currentSection={p.activeTab}
                onNavigate={s => p.setActiveTab(resolverAbaDoPortalDeTreinamentos(s))}
                forcarTour={previa ? null : forcarTour}
                modoPrevia={!!verComo}
                checklistSlot={slotChecklist}
                accent="teal"
                tourKey={verComo ? null : (userEmail || p.principal?.email || null)}
                autoTour={!previa && p.identidades.length > 0}
            />

            {/* Toast próprio: acima da barra inferior (ou do rodapé, na aula). */}
            {p.toast && (
                <div
                    className={`absolute left-4 right-4 z-20 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${
                        p.aulaAberta ? 'bottom-[calc(16px+env(safe-area-inset-bottom))]' : 'bottom-[calc(72px+env(safe-area-inset-bottom))]'} ${
                        p.toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
                    role="status"
                >
                    {p.toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span className="min-w-0">{p.toast.message}</span>
                </div>
            )}
        </div>
        </VerComoContext.Provider>
    );
};

export default TrainingPortalMobile;
