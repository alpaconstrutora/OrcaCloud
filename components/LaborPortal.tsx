import React, { useState, useEffect, useMemo } from 'react';
import {
    User, Clock, Umbrella, BookOpen, FileText, DollarSign,
    LogOut, Loader2, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight,
    Calendar, Shield, QrCode, Copy, X, Plus, RefreshCw,
    Smartphone, Key, ChevronDown, Eye, Receipt, Download
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { atsService, PortalToken, PortalEmployeeSummary } from '../services/atsService';
import { laborService, Employee } from '../services/laborService';
import { PayrollRun } from '../services/payrollService';
import { supabase } from '../lib/supabase';
import PaystubModal from './PaystubModal';
import MobilePreviewFrame from './MobilePreviewFrame';
import {
    MARCA, CabecalhoDoPortal, CartaoUltimoHolerite, LinhaDeHolerite, RodapeDoPortal,
    useValorVisivel, rotuloDaSecao, type SecaoDoPortal,
} from './portalColaborador/PortalMarca';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import { chavePorNome, chavePorRotulo } from '../utils/agruparLinhas';
import { logoDoPortal } from '../utils/portalColaboradorLogo';
import TabsBar from './ui/TabsBar';
import AcademyPlayerView from './academy/AcademyPlayerView';
import { createPortalChannel } from './academy/academyChannel';
import { academyPortalService } from '../services/academyPortalService';
import { academyKeys } from '../lib/queryKeys';
import type { AcademyPortalEnrollment } from '../types/academy';
import { mensagemDoPortalColaborador } from '../utils/portalColaboradorErro';
import {
    dataBR, diasTexto, jornadaTexto, periodoTexto, competenciaPorExtenso, situacaoDaValidade,
    validadeTexto, statusDoPonto, statusDaAusencia, tipoDaAusencia, tipoDaFolha, type TomDoStatus,
} from '../utils/portalColaboradorTextos';

/**
 * Leitura do portal — SEMPRE pelo token (`fn_colab_portal_*(p_token)`), também
 * na prévia do RH.
 *
 * Até 26/10/2026 havia um segundo caminho, por `portal_get_*(p_employee_id)`,
 * usado pela aba "Prévia do Portal". A prévia rodava com a sessão do admin e
 * por isso escondia os defeitos do link real: o holerite que não abria pelo
 * link, a Academia que sumia sem token. Prévia que não percorre o caminho do
 * colaborador não prova nada. (Antes de 02/09/2026 o caminho por employee_id
 * era também o do link, e bastava o UUID para ler a folha de qualquer um —
 * achado C3-02 da auditoria.)
 */
type PortalLeitura = 'time_entries' | 'absences' | 'trainings' | 'ged_documents' | 'payroll_runs';

async function portalRpc<T>(leitura: PortalLeitura, portalToken: string): Promise<T[]> {
    const { data, error } = await supabase.rpc(`fn_colab_portal_${leitura}`, { p_token: portalToken });
    if (error) throw error;
    return (data as T[]) ?? [];
}

/**
 * Carregando / falhou / vazio de uma leitura do portal — o trio que a Academia
 * já fazia, agora em toda aba. Antes cada aba lia só `data` (default `[]`), e
 * carregando ou falhando a tela dizia "Nenhum holerite disponível": mentira
 * justamente na aba de dinheiro, sem como o colaborador saber que era erro.
 */
interface LeituraDoPortalProps {
    carregando: boolean;
    erro: unknown;
    vazio: boolean;
    onTentarDeNovo: () => void;
    /** "seus registros de ponto" — completa "Carregando …" e "Não foi possível carregar …". */
    oQue: string;
    vazioIcone: React.ElementType;
    vazioTitulo: string;
    vazioDica?: string;
    children: React.ReactNode;
}

const LeituraDoPortal: React.FC<LeituraDoPortalProps> = ({
    carregando, erro, vazio, onTentarDeNovo, oQue, vazioIcone: VazioIcone, vazioTitulo, vazioDica, children,
}) => {
    if (carregando) {
        return (
            <div role="status" className="flex items-center justify-center gap-2 py-10">
                <Loader2 className="w-5 h-5 text-portal-laranja animate-spin motion-reduce:animate-none" />
                <span className="text-sm text-portal-secundario">Carregando {oQue}...</span>
            </div>
        );
    }
    if (erro) {
        return (
            <div role="alert" className="p-4 rounded-2xl bg-white shadow-portal-traco space-y-3">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-portal-laranja-texto shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-portal-grafite">Não foi possível carregar {oQue}</p>
                        <p className="text-sm text-portal-secundario mt-0.5">{mensagemDoPortalColaborador(erro)}</p>
                    </div>
                </div>
                <button type="button" onClick={onTentarDeNovo} className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-portal-grafite/20 text-sm font-semibold text-portal-grafite hover:bg-portal-chao disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-portal-laranja-texto focus-visible:ring-offset-2">
                    <RefreshCw className="w-4 h-4" /> Tentar de novo
                </button>
            </div>
        );
    }
    if (vazio) {
        return (
            <div className="text-center py-10 px-4">
                <VazioIcone className="w-8 h-8 text-portal-azul mx-auto mb-2" />
                <p className="text-sm font-semibold text-portal-grafite">{vazioTitulo}</p>
                {vazioDica && <p className="text-sm text-portal-secundario mt-1">{vazioDica}</p>}
            </div>
        );
    }
    return <>{children}</>;
};

/** Status de ponto/ausência: o texto diz tudo, a cor só reforça. */
// Tons da paleta Alpa (não os do Tailwind: rosa/âmbar/verde brigavam com o
// laranja quente), cada estado com matiz próprio — tingir de leve deixava
// "em análise", "aprovado" e "vencendo" três cinzas iguais. Contraste medido:
// ok grafite sólido 8,7:1 · espera cinza-azulado 40% 5,7:1 · alerta laranja
// claro 4,8:1 · recusado laranja escuro sólido 5,7:1.
const COR_DO_TOM: Record<TomDoStatus, string> = {
    ok: 'bg-portal-grafite text-white',
    espera: 'bg-portal-espera text-portal-grafite',
    alerta: 'bg-portal-alerta text-portal-laranja-texto',
    recusado: 'bg-portal-laranja-texto text-white',
    neutro: 'bg-portal-chao text-portal-secundario',
};
const SeloDeStatus: React.FC<{ rotulo: string; tom: TomDoStatus }> = ({ rotulo, tom }) => (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${COR_DO_TOM[tom]}`}>{rotulo}</span>
);

// ── View: Portal do Colaborador (tela que o funcionário vê no celular) ────────

interface PortalViewProps {
    employeeId: string;
    orgId: string | null;
    /** Só no acesso real. Na prévia não há "sair": quem fecha é a moldura. */
    onLogout?: () => void;
    /**
     * Token do link do portal. Obrigatório também na prévia do RH: é o mesmo
     * caminho do colaborador, então a prévia mostra o que ele vê de verdade.
     */
    portalToken: string;
    /**
     * Prévia aberta pelo RH. Mostra a faixa "vendo como", esconde o "sair" e
     * trava o que GRAVARIA em nome do colaborador (abrir curso da Academia
     * registra tentativa e progresso).
     */
    previa?: { nome: string; onSair: () => void };
}

/**
 * Faixa fixa no topo da prévia: quem está vendo sabe, a todo momento, que não é
 * o próprio portal, e tem a saída ali mesmo. `pt-8`: a prévia só existe dentro do
 * MobilePreviewFrame, cujo notch cobre os 24px de cima da tela.
 */
const FaixaDePrevia: React.FC<{ nome: string; onSair: () => void }> = ({ nome, onSair }) => (
    <div role="note" aria-label="Prévia" className="sticky top-0 z-30 flex items-center gap-2 pl-4 pr-2 pt-8 pb-1.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
        <Eye className="w-4 h-4 shrink-0 text-amber-700" />
        {/* Sem truncate: o nome é a informação da faixa; nome longo quebra linha. */}
        <p className="flex-1 min-w-0 leading-snug">Prévia · vendo como <strong className="font-semibold">{nome}</strong></p>
        <button type="button" onClick={onSair}
            className="shrink-0 h-9 px-3 rounded-lg text-sm font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            Sair da prévia
        </button>
    </div>
);

export const PortalView: React.FC<PortalViewProps> = ({ employeeId, orgId, onLogout, portalToken, previa }) => {
    const [activeSection, setActiveSection] = useState<SecaoDoPortal>('folha');
    const [paystubOpen, setPaystubOpen] = useState<{ runId: string } | null>(null);
    const [valorVisivel, alternarValor] = useValorVisivel();
    // Matrícula aberta na Academia — troca o conteúdo do portal pela sala de aula.
    const [academiaAberta, setAcademiaAberta] = useState<AcademyPortalEnrollment | null>(null);

    const portalChannel = React.useMemo(() => createPortalChannel(portalToken), [portalToken]);

    const {
        data: academia = [], isLoading: academiaCarregando, error: academiaErro, refetch: recarregarAcademia,
    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    } = useQuery({
        queryKey: academyKeys.portalEnrollments(portalToken),
        queryFn: () => academyPortalService.listEnrollments(portalToken),
        staleTime: STALE.fast,
        enabled: activeSection === 'treino',
    });

    const summaryKey = ['portal', 'summary', portalToken];
    const { data: summary, isLoading, error: summaryErro, refetch: recarregarSummary, isFetching: summaryRecarregando } = useQuery<PortalEmployeeSummary>({
        queryKey: summaryKey,
        queryFn: () => atsService.getPortalSummary(employeeId, portalToken),
        staleTime: STALE.fast,
    });

    // Logo fora do resumo: o resumo traz a versão, o logo vem uma vez e fica no
    // aparelho (utils/portalColaboradorLogo.ts). `logo_url` no resumo é o
    // formato anterior à migration 20271027200000, aceito na transição.
    const empresaDoResumo = summary?.organization;
    const logoVersao = empresaDoResumo?.logo_url ? null : (empresaDoResumo?.logo_versao ?? null);
    const { data: logoBaixado, isPending: logoPendente } = useQuery({
        queryKey: ['portal', 'logo', logoVersao],
        queryFn: () => logoDoPortal(logoVersao!, () => atsService.getPortalLogo(portalToken)),
        enabled: !!logoVersao,
        staleTime: Infinity,
        retry: 1,
    });
    const empresa = empresaDoResumo
        ? { name: empresaDoResumo.name, logo_url: empresaDoResumo.logo_url ?? logoBaixado ?? null }
        : empresaDoResumo;

    // Na prévia, todo estado (carregando, erro, sala de aula, portal) leva a faixa.
    const comFaixa = (tela: React.ReactElement) => previa
        ? <div className="min-h-full flex flex-col"><FaixaDePrevia nome={previa.nome} onSair={previa.onSair} />{tela}</div>
        : tela;

    const { data: recentEntries = [], isLoading: pontoCarregando, error: pontoErro, refetch: recarregarPonto } = useQuery({
        queryKey: ['portal', 'timeEntries', portalToken],
        queryFn: () => portalRpc<any>('time_entries', portalToken),
        staleTime: STALE.fast,
        enabled: activeSection === 'ponto',
    });

    const { data: absences = [], isLoading: feriasCarregando, error: feriasErro, refetch: recarregarFerias } = useQuery({
        queryKey: ['portal', 'absences', portalToken],
        queryFn: () => portalRpc<any>('absences', portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'ferias',
    });

    const { data: trainings = [], isLoading: treinosCarregando, error: treinosErro, refetch: recarregarTreinos } = useQuery({
        queryKey: ['portal', 'trainings', portalToken],
        queryFn: () => portalRpc<any>('trainings', portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'treino',
    });

    // GED (opura_documents) é a fonte única da aba Documentos — substitui o antigo
    // employee_documents; só aparece aqui o que foi compartilhado via botão
    // "Compartilhar" do módulo Gestão de Documentos (ver migration 20270821000010).
    const { data: documents = [], isLoading: docsCarregando, error: docsErro, refetch: recarregarDocs } = useQuery({
        queryKey: ['portal', 'docs', portalToken],
        queryFn: () => portalRpc<any>('ged_documents', portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'docs',
    });

    // Download: erro aparece na própria aba (era `alert()`), o botão trava
    // enquanto o link é gerado (evita toque duplo) e a janela abre ANTES do
    // `await` — o Safari do iPhone bloqueia `window.open` que não vem direto do
    // toque, e o "baixar" simplesmente não fazia nada.
    const [baixando, setBaixando] = useState<string | null>(null);
    const [erroDownload, setErroDownload] = useState<{ nome: string; mensagem: string } | null>(null);

    const handleDownloadDoc = async (storagePath: string, nome: string) => {
        if (baixando) return;
        setBaixando(storagePath);
        setErroDownload(null);
        const janela = window.open('', '_blank');
        try {
            const { data, error } = await supabase.functions.invoke('labor-portal-ged-download', {
                body: { token: portalToken, storagePath },
            });
            if (error) throw error;
            if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de download.');
            if (janela) janela.location.href = data.signedUrl;
            else window.location.assign(data.signedUrl);
        } catch (err: unknown) {
            console.error('[LaborPortal] Erro ao baixar documento:', err);
            janela?.close();
            setErroDownload({ nome, mensagem: mensagemDoPortalColaborador(err) });
        } finally {
            setBaixando(null);
        }
    };

    const { data: folhaRuns = [], isLoading: folhaCarregando, error: folhaErro, refetch: recarregarFolha } = useQuery<Array<PayrollRun & { net: number }>>({
        queryKey: ['portal', 'folha', portalToken],
        queryFn: () => portalRpc<PayrollRun & { net: number }>('payroll_runs', portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'folha',
    });

    if (isLoading) {
        return comFaixa(
            <div className={`flex flex-col items-center justify-center min-h-[60vh] gap-3 py-16 ${MARCA.chao}`}>
                <Loader2 className="w-8 h-8 text-portal-laranja animate-spin motion-reduce:animate-none" />
                <p className={`text-sm font-medium ${MARCA.secundario}`}>Carregando...</p>
            </div>
        );
    }

    // Resumo que falha não pode virar "—", "?" e quatro zeros com o alerta de
    // férias aceso: a pessoa lê "a empresa não sabe quem eu sou".
    if (summaryErro && !summary) {
        return comFaixa(
            <div className="max-w-md mx-auto h-full flex flex-col items-center justify-center bg-white p-6 text-center gap-3">
                <AlertTriangle className="w-8 h-8 text-portal-laranja-texto" />
                <p className="text-base font-semibold text-portal-grafite">Não foi possível abrir o seu portal</p>
                <p role="alert" className="text-sm text-portal-secundario">{mensagemDoPortalColaborador(summaryErro)}</p>
                <button type="button" onClick={() => recarregarSummary()} disabled={summaryRecarregando} className="w-full mt-2 h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-portal-grafite/20 text-sm font-semibold text-portal-grafite hover:bg-portal-chao disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-portal-laranja-texto focus-visible:ring-offset-2">
                    {summaryRecarregando ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="w-4 h-4" />}
                    Tentar de novo
                </button>
            </div>
        );
    }

    const emp = summary?.employee;

    // Sala de aula da Academia — troca o conteúdo do portal (não é overlay).
    // Mesmo componente do app logado; só o canal muda.
    if (academiaAberta) {
        return comFaixa(
            <div className="max-w-md mx-auto h-full overflow-y-auto bg-white p-4">
                <AcademyPlayerView
                    enrollmentId={academiaAberta.id}
                    titulo={academiaAberta.curso}
                    subtitulo={academiaAberta.nr_referencia}
                    channel={portalChannel}
                    compacto
                    onVoltar={() => setAcademiaAberta(null)}
                />
            </div>
        );
    }

    // Os quatro indicadores que ficavam no topo agora moram na aba a que dizem
    // respeito; o rodapé acende um ponto onde há o que olhar.
    const pontosEmAnalise = summary?.pontos_pendentes ?? 0;
    const treinamentosVencendo = summary?.treinamentos_vencendo ?? 0;
    const [ultimoHolerite, ...holeritesAnteriores] = folhaRuns;

    return comFaixa(
        // Chão da marca na tela inteira (no computador sobra borda dos lados); a coluna é a do celular.
        <div className={`w-full min-h-[100dvh] ${MARCA.chao}`}>
        <div className="max-w-md mx-auto w-full min-h-[100dvh] flex flex-col">
            <CabecalhoDoPortal
                empresa={empresa}
                logoPendente={!!logoVersao && logoPendente}
                nome={emp?.name}
                cargo={emp?.role}
                desde={emp?.hire_date ? dataBR(emp.hire_date) : undefined}
                onSair={onLogout && !previa ? onLogout : undefined}
            />

            {/* Holerite Modal */}
            {paystubOpen && (
                <PaystubModal
                    orgId={orgId}
                    runId={paystubOpen.runId}
                    employeeId={employeeId}
                    portalToken={portalToken}
                    onClose={() => setPaystubOpen(null)}
                />
            )}

            {/* Content */}
            <main className="flex-1 p-4">
                <h1 className="sr-only">{rotuloDaSecao(activeSection)}</h1>

                {/* Holerites — a tela inicial: o último é o cartão grande, os anteriores abaixo */}
                {activeSection === 'folha' && (
                    <div className="space-y-5">
                        <LeituraDoPortal
                            carregando={folhaCarregando} erro={folhaErro} vazio={folhaRuns.length === 0}
                            onTentarDeNovo={() => recarregarFolha()} oQue="seus holerites"
                            vazioIcone={Receipt} vazioTitulo="Nenhum holerite ainda"
                            vazioDica="Seu primeiro holerite aparece aqui quando o RH fechar a folha."
                        >
                            {ultimoHolerite && (
                                <CartaoUltimoHolerite
                                    competencia={competenciaPorExtenso(ultimoHolerite.start_date)}
                                    tipo={tipoDaFolha(ultimoHolerite.type)}
                                    liquido={ultimoHolerite.net ?? 0}
                                    visivel={valorVisivel}
                                    onAlternarValor={alternarValor}
                                    onAbrir={() => setPaystubOpen({ runId: ultimoHolerite.id })}
                                />
                            )}
                            {holeritesAnteriores.length > 0 && (
                                <section aria-labelledby="holerites-anteriores" className="space-y-2">
                                    <h2 id="holerites-anteriores" className={`px-1 text-sm font-semibold ${MARCA.secundario}`}>Anteriores</h2>
                                    {holeritesAnteriores.map(run => (
                                        <LinhaDeHolerite key={run.id}
                                            competencia={competenciaPorExtenso(run.start_date)}
                                            tipo={tipoDaFolha(run.type)}
                                            liquido={run.net ?? 0}
                                            visivel={valorVisivel}
                                            onAbrir={() => setPaystubOpen({ runId: run.id })}
                                        />
                                    ))}
                                </section>
                            )}
                        </LeituraDoPortal>
                    </div>
                )}

                {/* Ponto */}
                {activeSection === 'ponto' && (
                    <div className="space-y-3">
                        {pontosEmAnalise > 0 && (
                            <p className="text-base text-portal-grafite [text-wrap:pretty] bg-white rounded-2xl px-4 py-3 shadow-portal-traco">
                                <strong className="font-semibold">{pontosEmAnalise === 1 ? '1 registro' : `${pontosEmAnalise} registros`} em análise</strong> — o RH ainda vai aprovar.
                            </p>
                        )}
                        <h2 className="px-1 text-sm font-semibold text-portal-secundario">Últimos registros</h2>
                        <LeituraDoPortal
                            carregando={pontoCarregando} erro={pontoErro} vazio={recentEntries.length === 0}
                            onTentarDeNovo={() => recarregarPonto()} oQue="seus registros de ponto"
                            vazioIcone={Clock} vazioTitulo="Nenhum registro de ponto"
                        >
                            {recentEntries.slice(0, 10).map(e => (
                                <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 bg-white rounded-2xl shadow-portal-traco">
                                    <div>
                                        <p className="text-base font-semibold tabular-nums text-portal-grafite">{dataBR(e.date)}</p>
                                        <p className="text-sm text-portal-secundario">{e.project_name || 'Sem obra'}</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <p className="text-base font-semibold tabular-nums whitespace-nowrap text-portal-grafite">{jornadaTexto(e.hours_worked, e.overtime_hours)}</p>
                                        <SeloDeStatus {...statusDoPonto(e.status)} />
                                    </div>
                                </div>
                            ))}
                        </LeituraDoPortal>
                    </div>
                )}

                {/* Férias */}
                {activeSection === 'ferias' && (
                    <div className="space-y-3">
                        <div className="px-4 py-3 bg-white rounded-2xl shadow-portal-traco">
                            <p className="text-base text-portal-grafite [text-wrap:pretty]">
                                {(summary?.ferias_saldo ?? 0) > 0
                                    ? <>Você tem <strong className="font-semibold">{diasTexto(summary?.ferias_saldo)}</strong> de férias para tirar.</>
                                    : 'Você não tem dias de férias disponíveis agora.'}
                            </p>
                            {(summary?.ausencias_mes ?? 0) > 0 && (
                                <p className="text-sm text-portal-secundario mt-0.5">
                                    {summary!.ausencias_mes === 1 ? '1 ausência aprovada' : `${summary!.ausencias_mes} ausências aprovadas`} neste mês.
                                </p>
                            )}
                        </div>
                        <h2 className="px-1 text-sm font-semibold text-portal-secundario">Histórico</h2>
                        <LeituraDoPortal
                            carregando={feriasCarregando} erro={feriasErro} vazio={absences.length === 0}
                            onTentarDeNovo={() => recarregarFerias()} oQue="seu histórico de férias e ausências"
                            vazioIcone={Calendar} vazioTitulo="Nenhuma ausência registrada"
                        >
                            {absences.slice(0, 8).map(a => (
                                <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 bg-white rounded-2xl shadow-portal-traco">
                                    <div>
                                        <p className="text-base font-semibold text-portal-grafite">{tipoDaAusencia(a.tipo)}</p>
                                        <p className="text-sm text-portal-secundario">{periodoTexto(a.data_inicio, a.data_fim)}</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <p className="text-base font-semibold tabular-nums whitespace-nowrap text-portal-grafite">{diasTexto(a.dias)}</p>
                                        <SeloDeStatus {...statusDaAusencia(a.status)} />
                                    </div>
                                </div>
                            ))}
                        </LeituraDoPortal>
                    </div>
                )}

                {/* Documentos */}
                {activeSection === 'docs' && (
                    <div className="space-y-3">
                        <h2 className="px-1 text-sm font-semibold text-portal-secundario">Meus documentos</h2>
                        {erroDownload && (
                            <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-white shadow-portal-traco">
                                <AlertTriangle className="w-4 h-4 text-portal-laranja-texto shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-portal-grafite truncate">Não foi possível baixar "{erroDownload.nome}"</p>
                                    <p className="text-sm text-portal-secundario mt-0.5">{erroDownload.mensagem}</p>
                                </div>
                                <button type="button" aria-label="Fechar aviso" onClick={() => setErroDownload(null)}
                                    className={`w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-portal-grafite hover:bg-portal-chao shrink-0 ${MARCA.foco}`}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <LeituraDoPortal
                            carregando={docsCarregando} erro={docsErro} vazio={documents.length === 0}
                            onTentarDeNovo={() => recarregarDocs()} oQue="seus documentos"
                            vazioIcone={FileText} vazioTitulo="Nenhum documento disponível"
                            vazioDica="Os documentos aparecem aqui quando o RH os compartilha com você."
                        >
                            {documents.map(d => {
                                const expired = situacaoDaValidade(d.data_validade) === 'vencido';
                                return (
                                    <div key={d.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white shadow-portal-traco">
                                        <FileText className="w-4 h-4 shrink-0 text-portal-secundario" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-semibold text-portal-grafite truncate">{d.nome}</p>
                                            <p className="text-sm text-portal-secundario">
                                                {d.categoria}{d.data_validade ? ' · ' : ''}
                                                {d.data_validade && <span className={expired ? 'font-semibold text-portal-laranja-texto' : ''}>{validadeTexto(d.data_validade)}</span>}
                                            </p>
                                        </div>
                                        {expired && <AlertTriangle className="w-4 h-4 text-portal-laranja-texto shrink-0" aria-hidden="true" />}
                                        {d.storage_path && (
                                            // 44px: o botão do app tinha 24×24, pequeno para dedo de obra.
                                            <button type="button" title={`Baixar ${d.nome}`} aria-label={`Baixar ${d.nome}`}
                                                disabled={!!baixando}
                                                onClick={() => handleDownloadDoc(d.storage_path, d.nome)}
                                                className={`w-11 h-11 -my-1 shrink-0 flex items-center justify-center rounded-xl ${MARCA.texto} hover:bg-portal-chao disabled:opacity-50 disabled:cursor-not-allowed ${MARCA.foco}`}>
                                                {baixando === d.storage_path ? <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" /> : <Download className="w-5 h-5" />}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </LeituraDoPortal>
                    </div>
                )}

                {/* Treinamentos */}
                {activeSection === 'treino' && (
                    <div className="space-y-3">
                        {treinamentosVencendo > 0 && (
                            <p className="text-base text-portal-grafite [text-wrap:pretty] bg-white rounded-2xl px-4 py-3 shadow-portal-traco">
                                <strong className="font-semibold">{treinamentosVencendo === 1 ? '1 treinamento vence' : `${treinamentosVencendo} treinamentos vencem`} em até 30 dias.</strong> Fale com o RH para renovar.
                            </p>
                        )}
                        {/* Academia — treinamentos A FAZER (conteúdo EAD). Fica antes
                            da evidência porque é o que exige ação do colaborador. */}
                            <div className="space-y-3 pb-2">
                                <h2 className="px-1 text-sm font-semibold text-portal-secundario">Academia ÒPURA</h2>

                                {/* Estes três estados existiam e eram invisíveis: a seção
                                    inteira sumia quando a lista vinha vazia OU quando a
                                    chamada falhava, e o colaborador só via "nenhum
                                    treinamento registrado" logo abaixo. */}
                                {academiaCarregando && (
                                    <div className="flex items-center gap-2 py-4">
                                        <Loader2 className="w-4 h-4 text-portal-laranja animate-spin motion-reduce:animate-none" />
                                        <span className="text-sm text-portal-secundario">Carregando treinamentos...</span>
                                    </div>
                                )}

                                {!academiaCarregando && academiaErro && (
                                    <LeituraDoPortal
                                        carregando={false} erro={academiaErro} vazio={false}
                                        onTentarDeNovo={() => recarregarAcademia()} oQue="seus cursos da Academia"
                                        vazioIcone={BookOpen} vazioTitulo=""
                                    >{null}</LeituraDoPortal>
                                )}

                                {!academiaCarregando && !academiaErro && academia.length === 0 && (
                                    <div className="p-3 rounded-2xl bg-white shadow-portal-traco">
                                        <p className="text-sm text-portal-grafite">
                                            Nenhum treinamento atribuído a você no momento.
                                        </p>
                                        <p className="text-sm text-portal-secundario mt-1">
                                            Se você esperava algum, confirme com o RH se a atribuição
                                            foi feita para o seu cadastro.
                                        </p>
                                    </div>
                                )}

                                {/* Abrir curso registra tentativa e progresso pelo token —
                                    na prévia isso seria gravado em nome do colaborador. */}
                                {previa && academia.length > 0 && (
                                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                        Na prévia os cursos não abrem: abrir um curso registraria progresso em nome de {previa.nome}.
                                    </p>
                                )}

                                {academia.map(m => {
                                    const concluido = m.status === 'CONCLUIDO';
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => setAcademiaAberta(m)}
                                            disabled={!!previa}
                                            title={previa ? 'Na prévia os cursos não abrem' : undefined}
                                            className={`w-full text-left p-3 rounded-2xl transition-colors disabled:cursor-not-allowed ${MARCA.foco} ${
                                                'bg-white shadow-portal-traco hover:bg-portal-linha-hover disabled:hover:bg-white'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                                                <div className="flex-1 basis-0 min-w-[min(100%,12rem)]">
                                                    <p className="text-base font-semibold text-portal-grafite truncate">{m.curso}</p>
                                                    {/* "NR-35 Trabalho em Altura" já diz a NR; não repetir embaixo. */}
                                                    {m.nr_referencia && !m.curso.startsWith(m.nr_referencia) && (
                                                        <p className="text-xs font-semibold tracking-wide text-portal-laranja-texto">{m.nr_referencia}</p>
                                                    )}
                                                    {/* "v1" era jargão do RH (versão do curso); o colaborador precisa do prazo. */}
                                                    {m.data_limite && (
                                                        <p className="text-sm text-portal-secundario mt-0.5">Prazo: {dataBR(m.data_limite)}</p>
                                                    )}
                                                </div>
                                                <span className="text-xs font-semibold tabular-nums text-portal-secundario shrink-0">
                                                    {Math.round(m.percentual)}%
                                                </span>
                                            </div>
                                            <div role="progressbar" aria-label={`Progresso em ${m.curso}`}
                                                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, m.percentual))}
                                                className="h-1.5 bg-portal-chao rounded-full overflow-hidden mt-2">
                                                <div
                                                    className={`h-full ${'bg-portal-laranja'}`}
                                                    style={{ width: `${Math.min(100, m.percentual)}%` }}
                                                />
                                            </div>
                                            <p className={`text-sm font-semibold mt-2 ${previa ? 'text-portal-secundario' : 'text-portal-laranja-texto'}`}>
                                                {previa ? 'Não abre na prévia' : concluido ? 'Ver certificado' : m.status === 'NAO_INICIADO' ? 'Começar' : 'Continuar'}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                        <h2 className="px-1 text-sm font-semibold text-portal-secundario">Meus treinamentos</h2>
                        <LeituraDoPortal
                            carregando={treinosCarregando} erro={treinosErro} vazio={trainings.length === 0}
                            onTentarDeNovo={() => recarregarTreinos()} oQue="seus treinamentos"
                            vazioIcone={BookOpen} vazioTitulo="Nenhum treinamento registrado"
                        >
                            {trainings.map(t => {
                                // "Hoje" do aparelho: toISOString() é UTC e, depois das 21h, já era amanhã.
                                const situacao = situacaoDaValidade(t.data_validade);
                                const expired = situacao === 'vencido';
                                const expiring = situacao === 'vencendo';
                                return (
                                    <div key={t.id} className="p-3 rounded-2xl bg-white shadow-portal-traco">
                                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                                            <div className="flex-1 basis-0 min-w-[min(100%,12rem)]">
                                                <p className="text-base font-semibold text-portal-grafite">{t.course_nome}</p>
                                                {t.nr_referencia && <p className="text-xs font-semibold tracking-wide text-portal-laranja-texto">{t.nr_referencia}</p>}
                                                <p className="text-sm text-portal-secundario mt-0.5">
                                                    {t.data_realizacao ? `Realizado em ${dataBR(t.data_realizacao)}` : ''}
                                                    {t.data_realizacao && t.data_validade ? ' · ' : ''}
                                                    {t.data_validade ? validadeTexto(t.data_validade) : ''}
                                                </p>
                                            </div>
                                            <SeloDeStatus rotulo={expired ? 'Vencido' : expiring ? 'Vencendo' : 'Válido'} tom={expired ? 'recusado' : expiring ? 'alerta' : 'ok'} />
                                        </div>
                                    </div>
                                );
                            })}
                        </LeituraDoPortal>
                    </div>
                )}
            </main>

            <RodapeDoPortal
                ativa={activeSection}
                onIr={setActiveSection}
                avisos={{
                    ponto: pontosEmAnalise > 0 ? `${pontosEmAnalise} em análise` : undefined,
                    treino: treinamentosVencendo > 0 ? `${treinamentosVencendo} vencendo` : undefined,
                }}
            />
        </div>
        </div>
    );
};

// ── View: Gestão de Tokens (para o gestor de RH) ──────────────────────────────

type SituacaoAcesso = 'ativo' | 'expirado' | 'sem_acesso';
const SITUACAO_LABEL: Record<SituacaoAcesso, string> = { ativo: 'Ativo', expirado: 'Expirado', sem_acesso: 'Sem acesso' };
const SITUACAO_COR: Record<SituacaoAcesso, string> = { ativo: 'text-emerald-700', expirado: 'text-amber-700', sem_acesso: 'text-gray-500' };

/** Uma linha por colaborador ativo; `tok` é o link dele, se já gerou algum. */
interface LinhaAcesso { emp: Employee; tok?: PortalToken; situacao: SituacaoAcesso }

const ACESSOS_COLUMNS: StandardTableColumn[] = [
    { key: 'name',         label: 'Colaborador',   sortable: true, width: 240 },
    { key: 'role',         label: 'Cargo',         sortable: true, width: 200 },
    { key: 'situacao',     label: 'Situação',      sortable: true, width: 150 },
    { key: 'expires_at',   label: 'Expira em',     sortable: true, width: 160 },
    { key: 'last_used_at', label: 'Último acesso', sortable: true, width: 180 },
];

// "Agrupar" dos acessos (guia de UI §6.12). Chave = o MESMO texto que a célula mostra.
// Constante de módulo: o StandardTable memoiza os grupos pela identidade deste objeto.
const SEM_GRUPO_ACESSO: Record<string, string> = { situacao: 'Sem situação', role: 'Sem cargo' };
const AGRUPAR_ACESSOS = {
    opcoes: [
        { value: 'situacao', label: 'Situação' },
        { value: 'role', label: 'Cargo' },
    ],
    chave: (campo: string, l: LinhaAcesso) => {
        switch (campo) {
            case 'situacao': return chavePorRotulo(l.situacao, SITUACAO_LABEL);
            case 'role': return chavePorNome(l.emp.role);
            default: return null;
        }
    },
    semRotulo: (campo: string) => SEM_GRUPO_ACESSO[campo] ?? 'Sem valor',
    // Situação na ordem do fluxo (ativo → expirado → sem acesso); cargo, alfabética.
    ordem: (campo: string): 'rotulo' | string[] => (campo === 'situacao' ? Object.keys(SITUACAO_LABEL) : 'rotulo'),
    title: 'Agrupar os colaboradores',
};

const fmtDataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;

/**
 * Uma linha por colaborador ativo, com a situação do link. Mesma fonte para a
 * tabela de acessos e para o seletor da aba "Prévia do Portal" — os dois dizem
 * a mesma coisa sobre quem tem link.
 */
const useAcessosDoPortal = (orgId: string | null, employees: Employee[]) => {
    const tokensKey = ['portal', 'tokens', orgId];
    const { data: tokens = [], isLoading } = useQuery<PortalToken[]>({
        queryKey: tokensKey,
        queryFn: () => atsService.listPortalTokens(orgId),
        staleTime: STALE.normal,
    });
    // `useMemo`: o StandardTable zera a página/agrupamento pela identidade de `rows`.
    // Um token por colaborador (`portal_tokens.employee_id` é único; regenerar substitui).
    const linhas = useMemo<LinhaAcesso[]>(() => {
        const tokenByEmployee = new Map(tokens.map(t => [t.employee_id, t]));
        const agora = new Date().toISOString();
        return employees.filter(e => e.status === 'ATIVO').map(emp => {
            const tok = tokenByEmployee.get(emp.id);
            const expirado = !!tok && tok.expires_at < agora;
            const situacao: SituacaoAcesso = tok && tok.is_active && !expirado ? 'ativo' : expirado ? 'expirado' : 'sem_acesso';
            return { emp, tok, situacao };
        });
    }, [employees, tokens]);
    return { linhas, isLoading, tokensKey };
};

/** Quem a prévia mostra. Sempre com o token: a prévia percorre o caminho do link real. */
interface AlvoDaPrevia { employeeId: string; token: string; nome: string }

interface PortalManagementProps {
    orgId: string | null;
    employees: Employee[];
    onPrevia: (alvo: AlvoDaPrevia) => void;
}

const PortalManagement: React.FC<PortalManagementProps> = ({ orgId, employees, onPrevia }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    // Toast §13
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const { linhas, isLoading, tokensKey } = useAcessosDoPortal(orgId, employees);

    const invalidate = () => qc.invalidateQueries({ queryKey: tokensKey });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => atsService.revokePortalToken(id),
        onSuccess: () => { invalidate(); notify('Acesso revogado.'); },
        onError: (e: Error) => notify(e.message || 'Não foi possível revogar o acesso.', 'error'),
    });

    const handleGenerate = async (emp: Employee) => {
        if (!orgId) {
            notify('Selecione uma organização no topo antes de gerar o acesso.', 'error');
            return;
        }
        setGeneratingId(emp.id);
        try {
            const token = await atsService.generatePortalToken(emp.id, orgId);
            await navigator.clipboard.writeText(`${window.location.origin}/portal?token=${token}`);
            setCopiedToken(emp.id);
            setTimeout(() => setCopiedToken(null), 3000);
            invalidate();
        } catch (err: any) {
            notify(err?.message || 'Não foi possível gerar o acesso.', 'error');
        } finally { setGeneratingId(null); }
    };

    const handleCopy = async (token: PortalToken) => {
        const url = `${window.location.origin}/portal?token=${token.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedToken(token.id);
        setTimeout(() => setCopiedToken(null), 3000);
    };

    const semOrg = !orgId;

    return (
        <>
            <StandardTable<LinhaAcesso>
                storageKey="rh:portal-colaborador:acessos"
                columns={ACESSOS_COLUMNS}
                rows={linhas}
                rowKey={l => l.emp.id}
                loading={isLoading}
                searchText={l => `${l.emp.name} ${l.emp.role ?? ''}`}
                searchPlaceholder="Buscar por colaborador ou cargo..."
                agrupamento={AGRUPAR_ACESSOS}
                sortValue={(k, l) => {
                    switch (k) {
                        case 'name': return l.emp.name;
                        case 'role': return l.emp.role ?? '';
                        case 'situacao': return SITUACAO_LABEL[l.situacao];
                        case 'expires_at': return l.tok?.expires_at ?? '';
                        case 'last_used_at': return l.tok?.last_used_at ?? '';
                        default: return '';
                    }
                }}
                renderCell={(k, l) => {
                    switch (k) {
                        case 'name': return <span className="block truncate text-sm font-normal text-gray-700" title={l.emp.name}>{l.emp.name}</span>;
                        case 'role': return <span className="block truncate text-sm font-normal text-gray-600" title={l.emp.role}>{l.emp.role || '—'}</span>;
                        case 'situacao': return <span className={`text-sm font-normal ${SITUACAO_COR[l.situacao]}`}>{SITUACAO_LABEL[l.situacao]}</span>;
                        case 'expires_at': return <span className="text-sm font-normal text-gray-600">{l.tok ? fmtDataHora(l.tok.expires_at) : '—'}</span>;
                        case 'last_used_at': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(l.tok?.last_used_at) ?? (l.tok ? <span className="text-gray-400">Nunca</span> : '—')}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 260,
                    render: ({ emp, tok, situacao }) => {
                        const generating = generatingId === emp.id;
                        if (tok && situacao === 'ativo') {
                            const copied = copiedToken === tok.id || copiedToken === emp.id;
                            return (
                                <div className="flex items-center justify-end gap-1.5">
                                    <ActionIconButton kind="view" icon={<Smartphone className="w-4 h-4" />} title="Prévia do portal — ver como este colaborador"
                                        onClick={() => onPrevia({ employeeId: emp.id, token: tok.token, nome: emp.name })} />
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(tok)}
                                        className="flex items-center gap-1 h-8 px-2 rounded-[6px] text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-all"
                                    >
                                        {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copiado!' : 'Copiar link'}
                                    </button>
                                    <ActionIconButton kind="edit" icon={generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        title={semOrg ? 'Selecione uma organização no topo para regenerar o link' : 'Regenerar link — o anterior deixa de valer'}
                                        disabled={generating || semOrg} onClick={() => handleGenerate(emp)} />
                                    <ActionIconButton kind="delete" title="Revogar acesso ao portal" onClick={async () => {
                                        const ok = await confirm({ title: 'Revogar acesso ao portal?', message: 'O colaborador perderá o acesso até que um novo link seja gerado.', variant: 'danger', confirmLabel: 'Revogar' });
                                        if (ok) revokeMutation.mutate(tok.id);
                                    }} />
                                </div>
                            );
                        }
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleGenerate(emp)}
                                    disabled={generating || semOrg}
                                    title={semOrg ? 'Selecione uma organização no topo para gerar o acesso' : undefined}
                                    className="flex items-center gap-1.5 h-8 px-2 rounded-[6px] text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                    {generating ? 'Gerando...' : (situacao === 'expirado' ? 'Renovar' : 'Gerar acesso')}
                                </button>
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum colaborador ativo',
                    subtitle: 'Cadastre colaboradores em Recursos Humanos para gerar o acesso ao portal.',
                }}
            />

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </>
    );
};

// ── Componente principal (seletor de view) ────────────────────────────────────

interface LaborPortalProps {
    orgId: string | null;
    employees: Employee[];
    organizations?: Array<{ id: string; name: string }>;
    onRefresh?: () => void;
}

// Título e subtítulo acompanham a aba ativa (§19.1/§20) — aba que troca o conteúdo
// inteiro sem trocar o <h1> deixa o título mentindo.
type LaborPortalView = 'management' | 'portal';
const VIEW_HEADERS: Record<LaborPortalView, { title: string; subtitle: string }> = {
    management: {
        title: 'Portal do Colaborador',
        subtitle: 'Link self-service para ponto, férias, documentos e holerite pelo celular. O link expira em 30 dias e não exige conta.',
    },
    portal: {
        title: 'Prévia do portal',
        subtitle: 'Abre o portal pelo link do colaborador, no tamanho do celular: o que aparece aqui é o que ele vê.',
    },
};

/**
 * Aba "Prévia do Portal": escolhe quem ver. Só quem tem link ativo pode ser
 * escolhido — a prévia usa o link; sem link não há o que o colaborador veja.
 */
const SeletorDaPrevia: React.FC<{
    orgId: string | null;
    employees: Employee[];
    onPrevia: (alvo: AlvoDaPrevia) => void;
    onIrParaAcessos: () => void;
}> = ({ orgId, employees, onPrevia, onIrParaAcessos }) => {
    const { linhas, isLoading } = useAcessosDoPortal(orgId, employees);
    const porNome = (a: LinhaAcesso, b: LinhaAcesso) => a.emp.name.localeCompare(b.emp.name, 'pt-BR');
    const comLink = linhas.filter(l => l.situacao === 'ativo' && l.tok).sort(porNome);
    const semLink = linhas.filter(l => l.situacao !== 'ativo').sort(porNome);

    return (
        <div className="flex flex-col items-center py-12">
            <div className="p-4 bg-white rounded-[10px] border border-gray-100 shadow-sm w-full max-w-sm space-y-1.5">
                <label htmlFor="previa-colaborador" className="text-xs font-semibold text-gray-500">Ver o portal como</label>
                <select
                    id="previa-colaborador"
                    value=""
                    disabled={isLoading || comLink.length === 0}
                    onChange={e => {
                        const l = comLink.find(x => x.emp.id === e.target.value);
                        if (l?.tok) onPrevia({ employeeId: l.emp.id, token: l.tok.token, nome: l.emp.name });
                    }}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed transition-all"
                >
                    <option value="">{isLoading ? 'Carregando colaboradores...' : 'Selecione um colaborador...'}</option>
                    {comLink.length > 0 && (
                        <optgroup label="Com link ativo">
                            {comLink.map(l => (
                                <option key={l.emp.id} value={l.emp.id}>{l.emp.name}{l.emp.role ? ` — ${l.emp.role}` : ''}</option>
                            ))}
                        </optgroup>
                    )}
                    {semLink.length > 0 && (
                        <optgroup label="Sem link ativo — gere em Gestão de Acessos">
                            {semLink.map(l => (
                                <option key={l.emp.id} value={l.emp.id} disabled>
                                    {l.emp.name} — {l.situacao === 'expirado' ? 'link expirado' : 'sem link'}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
                {!isLoading && comLink.length === 0 && (
                    <div className="pt-2 space-y-2">
                        <p className="text-sm text-gray-600">
                            {linhas.length === 0
                                ? 'Nenhum colaborador ativo nesta organização.'
                                : 'Nenhum colaborador tem link ativo. A prévia abre pelo link, então gere um primeiro.'}
                        </p>
                        {linhas.length > 0 && (
                            <Button variant="secondary" size="sm" onClick={onIrParaAcessos}>
                                <Key className="w-4 h-4" /> Ir para Gestão de Acessos
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const LaborPortal: React.FC<LaborPortalProps> = ({ orgId, employees }) => {
    const [view, setView] = useState<LaborPortalView>('management');
    // Uma prévia só, para o ícone da tabela e para o seletor da aba: mesma
    // moldura, mesmo token, mesma faixa. Antes eram duas — uma sem token, que
    // mostrava um portal que o colaborador nunca vê.
    const [previa, setPrevia] = useState<AlvoDaPrevia | null>(null);

    return (
        <div className="h-full">
            <div className="space-y-6">
                {/* 1. Título */}
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[view].title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[view].subtitle}</p>
                </div>

                {/* Toolbar de abas (§19.1) */}
                <TabsBar
                    tabs={[
                        { id: 'management', label: 'Gestão de Acessos', icon: <Key className="w-4 h-4" /> },
                        { id: 'portal', label: 'Prévia do Portal', icon: <Smartphone className="w-4 h-4" /> },
                    ]}
                    value={view}
                    onChange={setView}
                />

                {view === 'management' && (
                    <PortalManagement orgId={orgId} employees={employees} onPrevia={setPrevia} />
                )}

                {view === 'portal' && (
                    <SeletorDaPrevia orgId={orgId} employees={employees} onPrevia={setPrevia} onIrParaAcessos={() => setView('management')} />
                )}
            </div>

            {previa && (
                <MobilePreviewFrame onClose={() => setPrevia(null)} title={`Prévia do Portal do Colaborador — ${previa.nome}`}>
                    <PortalView employeeId={previa.employeeId} orgId={orgId} portalToken={previa.token} previa={{ nome: previa.nome, onSair: () => setPrevia(null) }} />
                </MobilePreviewFrame>
            )}
        </div>
    );
};

export default LaborPortal;
