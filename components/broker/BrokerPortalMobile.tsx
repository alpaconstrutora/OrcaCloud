import React, { useMemo, useState } from 'react';
import {
    ArrowLeft, Briefcase, Building2, CheckCircle2, ChevronUp, DollarSign, FileText, HelpCircle,
    Info, LogOut, MoreHorizontal, Send, X,
} from 'lucide-react';
import { PortalHelp } from '../portal/PortalHelp';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import PropertyUnitMap from '../common/PropertyUnitMap';
import BrokerMyData from './BrokerMyData';
import BrokerDevelopments from './BrokerDevelopments';
import BrokerProposalSimulator from './BrokerProposalSimulator';
import BrokerLeadManager from './BrokerLeadManager';
import BrokerCommissions from './BrokerCommissions';
import BrokerMaterials from './BrokerMaterials';
import BrokerRanking from './BrokerRanking';
import BrokerTraining from './BrokerTraining';
import BrokerEvents from './BrokerEvents';
import BrokerChat from './BrokerChat';
import { useBrokerPortal, TAB_BY_ID, formatCurrency, type PortalTab } from './useBrokerPortal';
import { abasDoCelular, abasHabilitadas } from '../../utils/brokerPortalTabs';
import type { BrokerProfile } from '../../types';

/**
 * Portal do Corretor no celular — app de tela cheia.
 * Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (F1).
 *
 * Mesmo arranjo de Treinamentos / Diário / Minhas Tarefas
 * (`TrainingPortalMobile`, `DiaryMobileApp`, `TasksMobileApp`):
 *  - celular de verdade → `BrokerPortal` troca a casca de desktop por esta
 *    quando o corretor entra (link ou e-mail) com `innerWidth < 768`; tela
 *    cheia em `h-dvh` (`100vh` no celular é a altura COM a barra do navegador,
 *    e a barra inferior sumiria atrás dela); rodapés somam a safe-area;
 *  - desktop → dentro de `MobilePreviewFrame` (botão de prévia do gestor),
 *    com `previa`: o iframe é o telefone, `h-screen` é a altura dele e a barra
 *    de status falsa fica, porque a moldura desenha o entalhe por cima do topo.
 *
 * Navegação (D2, D8): barra inferior com as abas HABILITADAS para o corretor
 * pela engrenagem "Configurar abas visíveis" — até 5 cabem todas; acima disso,
 * 4 + "Mais". Saúde não entra (D6, é painel de gestão). A ordem e o corte vêm
 * de `abasDoCelular` (utils/brokerPortalTabs.ts), testada.
 *
 * Toast, folha de conta e "Mais" são PRÓPRIOS e `absolute` dentro do telefone:
 * no iframe da prévia, qualquer `createPortal(document.body)` cai no documento
 * pai. A central de ajuda é a exceção assumida (como nos outros portais), por
 * isso o tour automático fica desligado na prévia.
 */

interface Props {
    profile: { group: string; role: string; email?: string };
    organizationId?: string;
    portalToken?: string;
    initialBroker?: BrokerProfile;
    onLogout?: () => void;
    forcarTour?: string | null;
    /** dentro do MobilePreviewFrame: barra de status falsa + altura do iframe */
    previa?: boolean;
}

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

/** Rótulo curto na barra inferior (o espaço é de ~70 px por aba). */
const ROTULO_CURTO: Partial<Record<PortalTab, string>> = {
    empreendimentos: 'Empreend.',
    treinamento: 'Treinos',
};

// §8 — status em texto colorido, sem pílula.
const STATUS_PROPOSTA: Record<string, { label: string; cor: string }> = {
    ENVIADA: { label: 'Enviada', cor: 'text-blue-600' },
    APROVADA: { label: 'Aprovada', cor: 'text-emerald-600' },
    REJEITADA: { label: 'Rejeitada', cor: 'text-red-600' },
};

const primeiroNome = (nome: string) => {
    const p = (nome || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
};

const BrokerPortalMobile: React.FC<Props> = ({ profile, organizationId, portalToken, initialBroker, onLogout, forcarTour = null, previa = false }) => {
    // Abre na primeira aba da barra (D3) — no desktop continua Analytics.
    const abaInicial = abasDoCelular(abasHabilitadas(initialBroker?.settings)).barra[0] ?? 'empreendimentos';
    const h = useBrokerPortal({ profile, activeTab: abaInicial, organizationId, isPreview: true, portalToken, initialBroker });

    const chaveAbas = h.enabledTabIds.join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const { barra, mais } = useMemo(() => abasDoCelular(h.enabledTabIds), [chaveAbas]);
    const noCelular = useMemo(() => [...barra, ...mais], [barra, mais]);

    const [maisAberto, setMaisAberto] = useState(false);
    const [contaAberta, setContaAberta] = useState(false);
    const [meusDadosAberto, setMeusDadosAberto] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [cestaAberta, setCestaAberta] = useState(false);
    const [slotChecklist, setSlotChecklist] = useState<HTMLDivElement | null>(null);

    // Aba fora do que o corretor pode ver no celular (ocultada pela engrenagem
    // com o portal aberto, ou Saúde): volta para a primeira da barra. O
    // simulador fica de fora — ele mora em "propostas" mesmo quando a aba
    // Propostas está oculta (vem de Empreendimentos/Estoque).
    React.useEffect(() => {
        if (h.showSimulator || noCelular.length === 0) return;
        if (!noCelular.includes(h.currentTab)) h.irParaAba(noCelular[0]);
    }, [noCelular, h.currentTab, h.showSimulator, h.irParaAba]);

    // Recusa da cesta com a cesta VAZIA (ex.: tocar numa unidade alugada no
    // espelho do Estoque): o aviso mora na barra da cesta, que vazia nem existe —
    // vira toast para o toque não morrer calado.
    React.useEffect(() => {
        if (h.cartWarning && h.cart.length === 0) {
            h.toast(h.cartWarning);
            h.setCartWarning(null);
        }
    }, [h.cartWarning, h.cart.length, h.toast, h.setCartWarning]);

    const irPara = (tab: PortalTab) => { h.irParaAba(tab); setMaisAberto(false); };
    const noSimulador = h.currentTab === 'propostas' && h.showSimulator && h.cart.length > 0;
    const maisAtivo = mais.includes(h.currentTab);
    const nome = primeiroNome(h.brokerDisplayName);
    const inicial = (h.brokerDisplayName || '?').charAt(0).toUpperCase();
    const comCesta = !h.showSimulator && h.cart.length > 0;

    const tituloDaAba = noSimulador ? 'Nova proposta' : (TAB_BY_ID[h.currentTab]?.label ?? '');

    return (
        <div
            className={`portal-mobile-font flex flex-col bg-gray-50 font-sans text-gray-800 overflow-hidden relative ${
                previa ? 'h-screen' : 'h-screen supports-[height:100dvh]:h-dvh'}`}
            data-modo={previa ? 'previa' : 'aparelho'}
        >
            {previa && <StatusBar />}

            {/* Cabeçalho curto: saudação + aba atual; ajuda e conta à direita.
                No simulador vira "voltar" — a barra inferior some (como a aula
                no Treinamentos) e a seta é a saída. */}
            <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between gap-2 px-4 shrink-0">
                {noSimulador ? (
                    <button
                        type="button"
                        onClick={h.cancelarSimulador}
                        className="flex items-center gap-2 min-w-0 -ml-2 px-2 py-1.5 rounded-lg text-gray-700 active:bg-gray-100"
                        aria-label="Voltar sem enviar a proposta"
                    >
                        <ArrowLeft className="w-5 h-5 shrink-0" />
                        <span className="text-base font-bold text-gray-900 truncate">{tituloDaAba}</span>
                    </button>
                ) : (
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 truncate leading-tight">
                            {nome ? `Olá, ${nome}` : 'Portal do Corretor'}
                        </h1>
                        <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{tituloDaAba}</p>
                    </div>
                )}
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
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white active:scale-95"
                    >
                        {inicial}
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
                {noCelular.length === 0 ? (
                    <div className="min-h-[60vh] flex items-center justify-center">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
                            <Info className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
                            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Nenhuma seção liberada</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                A incorporadora ainda não liberou seções do portal para você. Fale com ela.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {h.currentTab === barra[0] && !noSimulador && (
                            <div ref={setSlotChecklist} className="empty:hidden" />
                        )}

                        {h.currentTab === 'empreendimentos' && (
                            <div data-tour="empreendimentos-lista">
                                <BrokerDevelopments
                                    buildings={h.buildings}
                                    units={h.visibleUnits}
                                    portalToken={portalToken}
                                    organizationId={h.orgIdEfetivo}
                                    onMakeProposal={h.handleMakeProposal}
                                    selectedUnitIds={h.cart.map(u => u.id)}
                                    onToggleUnit={h.handleToggleCart}
                                    compacto
                                />
                            </div>
                        )}

                        {h.currentTab === 'estoque' && (
                            <div className="space-y-4">
                                <FiltrosDoEstoque h={h} />
                                <div data-tour="estoque-mapa">
                                    <PropertyUnitMap
                                        units={h.displayUnits}
                                        parentProperty={h.buildings.find(b => b.id === h.selectedBuildingId)}
                                        deals={h.dealsDoMapa}
                                        onSelectUnit={h.handleMakeProposal}
                                        onReserveUnit={h.handleReserve}
                                        selectedUnitIds={h.cart.map(u => u.id)}
                                        onToggleUnit={h.handleToggleCart}
                                        compacto
                                    />
                                </div>
                            </div>
                        )}

                        {noSimulador && (
                            <BrokerProposalSimulator
                                units={h.cart}
                                brokerEmail={h.effectiveBrokerEmail || ''}
                                organizationId={h.orgIdEfetivo || 'demo'}
                                onSubmitProposal={h.handleSubmitProposal}
                                onCancel={h.cancelarSimulador}
                                portalToken={portalToken}
                                compacto
                            />
                        )}

                        {h.currentTab === 'propostas' && !h.showSimulator && <PropostasEmCartoes h={h} />}

                        {h.currentTab === 'analytics' && (
                            <>
                                <div className="grid grid-cols-2 gap-3" data-tour="analytics-kpis">
                                    <KpiCard label="Disponíveis" value={h.loading ? '…' : h.stats.available} sub={h.loading ? undefined : `de ${h.visibleUnits.length}`} icon={<Building2 className="w-5 h-5" />} color="blue" />
                                    <KpiCard label="Enviadas" value={h.loading ? '…' : h.stats.sent} sub="Aguardando análise" icon={<Send className="w-5 h-5" />} color="amber" />
                                    <KpiCard label="Aprovadas" value={h.loading ? '…' : h.stats.approved} sub="Vendas confirmadas" icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                                    <KpiCard label="Comissão" value={h.loading ? '…' : formatCurrency(h.stats.totalCommission)} sub="5% sobre aprovadas" icon={<DollarSign className="w-5 h-5" />} color="violet" />
                                </div>
                            </>
                        )}

                        {h.currentTab === 'leads' && <BrokerLeadManager brokerEmail={h.effectiveBrokerEmail || ''} />}
                        {h.currentTab === 'comissoes' && <BrokerCommissions brokerEmail={h.effectiveBrokerEmail || ''} portalToken={portalToken} compacto />}
                        {h.currentTab === 'materiais' && (
                            <div data-tour="materiais-grade"><BrokerMaterials organizationId={h.orgIdEfetivo || 'demo'} portalToken={portalToken} compacto /></div>
                        )}
                        {h.currentTab === 'ranking' && <BrokerRanking brokerEmail={h.effectiveBrokerEmail || ''} />}
                        {h.currentTab === 'treinamento' && <BrokerTraining brokerEmail={h.effectiveBrokerEmail || ''} />}
                        {h.currentTab === 'agenda' && <BrokerEvents brokerEmail={h.effectiveBrokerEmail || ''} />}
                        {h.currentTab === 'chat' && <BrokerChat brokerEmail={h.effectiveBrokerEmail || ''} />}
                    </div>
                )}
            </main>

            {/* Cesta — irmã do conteúdo, logo acima da barra: nunca cobre a
                navegação nem o fim da lista. Toque no resumo abre as unidades. */}
            {comCesta && (
                <div className="bg-white border-t border-indigo-100 px-4 py-2.5 shrink-0 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]" data-tour="cesta-barra">
                    {h.cartWarning && (
                        <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                            {h.cartWarning}
                        </p>
                    )}
                    {cestaAberta && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {h.cart.map(u => (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => h.handleToggleCart(u)}
                                    aria-label={`Remover ${u.number || u.name} da proposta`}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700 active:bg-indigo-100"
                                >
                                    {u.number || u.name} <X className="w-3 h-3" />
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCestaAberta(a => !a)}
                            aria-expanded={cestaAberta}
                            className="flex-1 min-w-0 flex items-center gap-2 text-left"
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-indigo-600">
                                    {h.cart.length} {h.cart.length === 1 ? 'unidade' : 'unidades'}
                                </p>
                                <p className="text-sm font-bold text-gray-900 truncate">{h.cartTotal > 0 ? formatCurrency(h.cartTotal) : 'Sem preço'}</p>
                            </div>
                            <ChevronUp className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${cestaAberta ? '' : 'rotate-180'}`} />
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCestaAberta(false); h.abrirSimulador(); }}
                            className="shrink-0 h-10 px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold active:bg-indigo-700"
                        >
                            Fazer proposta
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCestaAberta(false); h.limparCesta(); }}
                            aria-label="Limpar seleção"
                            className="shrink-0 p-2 rounded-xl text-gray-400 active:bg-gray-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Barra inferior — só as abas habilitadas (D8); some no simulador. */}
            {!noSimulador && barra.length > 0 && (
                <nav
                    className="bg-white border-t border-gray-100 flex shrink-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
                    data-tour="menu"
                    aria-label="Seções do portal"
                >
                    {barra.map(id => {
                        const tab = TAB_BY_ID[id];
                        const Icon = tab.icon;
                        const ativa = h.currentTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                data-tour={`aba-${id}`}
                                onClick={() => irPara(id)}
                                aria-current={ativa ? 'page' : undefined}
                                className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2.5 px-1 relative ${ativa ? 'text-indigo-600' : 'text-gray-400'}`}
                            >
                                {ativa && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />}
                                <Icon className="w-5 h-5" />
                                <span className="text-[10px] font-medium leading-none whitespace-nowrap">{ROTULO_CURTO[id] ?? tab.label}</span>
                            </button>
                        );
                    })}
                    {mais.length > 0 && (
                        <button
                            type="button"
                            data-tour="mobile-mais"
                            onClick={() => setMaisAberto(true)}
                            aria-current={maisAtivo ? 'page' : undefined}
                            aria-haspopup="dialog"
                            className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2.5 px-1 relative ${maisAtivo ? 'text-indigo-600' : 'text-gray-400'}`}
                        >
                            {maisAtivo && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />}
                            <MoreHorizontal className="w-5 h-5" />
                            <span className="text-[10px] font-medium leading-none whitespace-nowrap">
                                {maisAtivo ? (ROTULO_CURTO[h.currentTab] ?? TAB_BY_ID[h.currentTab].label) : 'Mais'}
                            </span>
                        </button>
                    )}
                </nav>
            )}

            {/* Folha "Mais" — o resto das abas habilitadas. */}
            {maisAberto && (
                <div className="absolute inset-0 z-30 bg-black/40 flex items-end" onClick={() => setMaisAberto(false)}>
                    <div
                        className="w-full bg-white rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                        role="dialog"
                        aria-label="Mais seções"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3" />
                        <div className="grid grid-cols-3 gap-2">
                            {mais.map(id => {
                                const tab = TAB_BY_ID[id];
                                const Icon = tab.icon;
                                const ativa = h.currentTab === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        data-tour={`aba-${id}`}
                                        onClick={() => irPara(id)}
                                        aria-current={ativa ? 'page' : undefined}
                                        className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 ${
                                            ativa ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-600 active:bg-gray-100'}`}
                                    >
                                        <Icon className={`w-5 h-5 ${ativa ? 'text-indigo-600' : 'text-gray-400'}`} />
                                        <span className="text-xs font-medium">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Folha de conta (D5): Meus dados · Ajuda · Sair. */}
            {contaAberta && (
                <div className="absolute inset-0 z-30 bg-black/40 flex items-end" onClick={() => setContaAberta(false)}>
                    <div
                        className="w-full bg-white rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-2"
                        role="dialog"
                        aria-label="Minha conta"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{inicial}</span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold text-gray-900">{h.brokerDisplayName}</div>
                                <div className="truncate text-xs text-gray-500">{h.effectiveBrokerEmail}</div>
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
                            <Briefcase className="h-4 w-4 text-gray-400" />
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

            {/* Sheet é `fixed` sem portal e vira folha inferior abaixo de `sm`:
                dentro do iframe da prévia fica no telefone. */}
            <Sheet open={meusDadosAberto} onClose={() => setMeusDadosAberto(false)} size="xl">
                <SheetHeader onClose={() => setMeusDadosAberto(false)}>
                    <SheetTitle>Meus dados</SheetTitle>
                    <SheetDescription>
                        O cadastro que a incorporadora tem de você. Para alterar, fale com ela.
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-4 py-5">
                    <BrokerMyData broker={h.effectiveBroker} />
                </SheetPanel>
            </Sheet>

            <PortalHelp
                open={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                portal="corretor"
                token={portalToken}
                orgId={h.orgIdEfetivo || null}
                visibleSections={noCelular}
                currentSection={h.currentTab}
                onNavigate={(s) => h.irParaAba(s as PortalTab)}
                modoPrevia={previa}
                forcarTour={previa ? null : forcarTour}
                checklistSlot={slotChecklist}
                checklistCompacto
                accent="indigo"
                tourKey={portalToken || h.effectiveBrokerEmail || null}
                autoTour={!previa && !!portalToken}
            />

            {/* Toast próprio, acima da cesta/barra. */}
            {h.shareMsg && (
                <div
                    className={`absolute left-4 right-4 z-20 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium bg-gray-900 text-white ${
                        comCesta ? 'bottom-[calc(136px+env(safe-area-inset-bottom))]' : 'bottom-[calc(72px+env(safe-area-inset-bottom))]'}`}
                    role="status"
                >
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 break-words">{h.shareMsg}</span>
                </div>
            )}
        </div>
    );
};

/** Estoque no celular: finalidade em segmentado de largura cheia + empreendimento em lista. */
const FiltrosDoEstoque: React.FC<{ h: ReturnType<typeof useBrokerPortal> }> = ({ h }) => (
    <div className="space-y-2">
        <div className="grid grid-cols-3 bg-gray-100 p-1 rounded-xl gap-1" data-tour="estoque-finalidade">
            {[
                { id: 'SALE', label: 'Vendas' },
                { id: 'RENTAL', label: 'Locação' },
                { id: 'BOTH', label: 'Todos' },
            ].map(p => (
                <button
                    key={p.id}
                    type="button"
                    onClick={() => h.setSelectedPurpose(p.id as 'SALE' | 'RENTAL' | 'BOTH')}
                    aria-pressed={h.selectedPurpose === p.id}
                    className={`h-8 rounded-lg text-sm font-medium ${h.selectedPurpose === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                    {p.label}
                </button>
            ))}
        </div>
        {h.buildings.length > 0 && (
            <select
                value={h.selectedBuildingId}
                onChange={e => h.setSelectedBuildingId(e.target.value)}
                aria-label="Empreendimento"
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
                <option value="all">Todos os empreendimentos</option>
                {h.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
        )}
    </div>
);

/** Propostas no celular (F2, item 7): um cartão por proposta. */
const PropostasEmCartoes: React.FC<{ h: ReturnType<typeof useBrokerPortal> }> = ({ h }) => {
    if (h.myProposals.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center px-6 py-12" data-tour="propostas-lista">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-600">Nenhuma proposta enviada ainda.</p>
                <p className="text-xs text-gray-400 mt-1">Escolha uma unidade em Empreendimentos ou no Estoque para fazer uma.</p>
            </div>
        );
    }
    return (
        <div className="space-y-3" data-tour="propostas-lista">
            {h.myProposals.map((p, i) => {
                const label = h.proposalUnitLabel(p);
                const st = STATUS_PROPOSTA[p.status || ''] ?? { label: p.status ? p.status.charAt(0) + p.status.slice(1).toLowerCase() : '—', cor: 'text-gray-500' };
                return (
                    <div key={p.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-bold text-gray-900 min-w-0 truncate" title={label.all || undefined}>
                                Unidade {label.primary}
                                {label.extra > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">+{label.extra}</span>}
                            </p>
                            <span className={`text-sm shrink-0 ${st.cor}`}>{st.label}</span>
                        </div>
                        {p.buyer_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.buyer_name}</p>}
                        <div className="flex items-center justify-between gap-3 mt-3">
                            <p className="text-base font-bold text-gray-900">{formatCurrency(p.total_value || 0)}</p>
                            <div className="flex items-center gap-1.5">
                                <ActionIconButton kind="download" title="Baixar PDF" onClick={() => h.handleProposalPdf(p, `Unidade ${label.primary}`)} />
                                <ActionIconButton kind="share" title="Gerar link público" onClick={() => h.handleProposalShare(p.id)} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default BrokerPortalMobile;
