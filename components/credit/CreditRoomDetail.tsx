import React from 'react';
import { moverEntreAbas } from '../ui/abasPeloTeclado';
import { ArrowLeft, Download, FileText, History, RefreshCw, Send, Sparkles, UserPlus, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { formatDateBR, formatDateTimeBR, formatMoney } from '../ui/Format';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService, type VersaoPreparada } from '../../services/creditRoomService';
import { creditRoomBookService } from '../../services/creditRoomBookService';
import { ALERTA_PT, resumoDaCapacidade } from '../../utils/creditCapacity';
import { hojeLocalISO } from '../../utils/periodoControladoria';
import { ID_DA_PREVIA, compararComLiberada, horaDaPrevia, versaoDaPrevia } from '../../utils/creditRoomPrevia';
import { MUDANCA_PT, mudancasDesdeAVersao } from '../../utils/creditRoomVersaoDesatualizada';
import {
    CREDIT_ROOM_ACTION_PT,
    CREDIT_ROOM_STATUS_PT,
    PERMISSOES_PADRAO,
    type CreditRoom,
    type CreditRoomAccessLog,
    type CreditRoomDocument,
    type CreditRoomMember,
    type CreditRoomMemberInput,
    type CreditRoomPermissions,
    type CreditRoomSide,
    type CreditRoomStatus,
    type CreditRoomVersion,
} from '../../types/creditRoom';
import CreditRoomIndicators from './CreditRoomIndicators';
import CreditRoomCapacity from './CreditRoomCapacity';
import CreditRoomEmpreendimentos from './CreditRoomEmpreendimentos';
import CreditRoomSugerirDocumentos from './CreditRoomSugerirDocumentos';
import CreditRoomRequests, { CreditRoomCommentsThread } from './CreditRoomRequests';
import CreditRoomCovenants from './CreditRoomCovenants';
import CreditRoomFunding from './CreditRoomFunding';
import CreditRoomDisbursements from './CreditRoomDisbursements';
import { CreditRoomStatusBadge } from './CreditRoomModule';

/**
 * Detalhe de um Credit Room — lado interno (tomador).
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 6)
 */

type Aba = 'visao' | 'capacidade' | 'empreendimentos' | 'fontesusos' | 'versoes' | 'dataroom' | 'participantes' | 'solicitacoes' | 'covenants' | 'desembolsos' | 'comentarios' | 'auditoria';

const ABAS: { id: Aba; label: string }[] = [
    { id: 'visao', label: 'Visão' },
    { id: 'capacidade', label: 'Capacidade de pagamento' },
    { id: 'empreendimentos', label: 'Empreendimentos e contratos' },
    { id: 'fontesusos', label: 'Fontes e Usos' },
    { id: 'versoes', label: 'Versões' },
    { id: 'dataroom', label: 'Data Room' },
    { id: 'participantes', label: 'Participantes' },
    { id: 'solicitacoes', label: 'Solicitações' },
    { id: 'covenants', label: 'Covenants' },
    { id: 'desembolsos', label: 'Desembolsos' },
    { id: 'comentarios', label: 'Comentários' },
    { id: 'auditoria', label: 'Auditoria' },
];

// §19.1: o h1 muda junto com a aba.
const ABA_SUBTITULO: Record<Aba, string> = {
    visao: 'Os indicadores de hoje (prévia) ou de uma versão já liberada. A instituição financeira vê só o que foi liberado.',
    capacidade: 'Quanto a carteira consegue pagar por mês, o DSCR e o valor máximo financiável — prévia de hoje ou versão liberada.',
    empreendimentos: 'Os empreendimentos e contratos que sustentam a renda (prévia de hoje ou versão liberada), sem nome de cliente.',
    fontesusos: 'De onde vem o dinheiro e para onde vai. O banco checa se as duas somas fecham.',
    versoes: 'Versões liberadas à instituição. Cada uma preserva a posição da data em que foi liberada.',
    dataroom: 'Documentos do GED compartilhados com este Credit Room. Use Sugerir documentos para trazer os da carteira, ou compartilhe pelo botão do próprio GED.',
    participantes: 'Quem acessa: analistas da instituição (login + MFA) e o time interno.',
    solicitacoes: 'Request list da due diligence — o que a instituição pediu e onde está.',
    covenants: 'Cláusulas com meta, folga e situação. O DSCR aqui é apurado sobre o fluxo elegível DESTA operação, não sobre o EBITDA da empresa.',
    desembolsos: 'Liberações do contrato: solicitação, medição, aprovação e o que de fato saiu.',
    comentarios: 'Conversa da operação. Comentário interno nunca chega à instituição.',
    auditoria: 'Quem viu, baixou, comentou, convidou e liberou versão — com data e hora.',
};

const SIDE_PT: Record<CreditRoomSide, string> = { TOMADOR: 'Empresa', CREDOR: 'Instituição' };

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const rotulo = 'text-xs font-semibold text-slate-500';

interface Props {
    room: CreditRoom;
    onBack: () => void;
    onEdit: () => void;
    onChanged: (room: CreditRoom) => void;
}

export default function CreditRoomDetail({ room, onBack, onEdit, onChanged }: Props) {
    const confirm = useConfirm();
    const [aba, setAba] = usePersistedState<Aba>(`creditRoom:${room.id}:aba`, 'visao');
    const [erro, setErro] = React.useState<string | null>(null);

    const [versoes, setVersoes] = React.useState<CreditRoomVersion[]>([]);
    // Sem a lista carregada não se sabe se há versão liberada: a faixa não pode dizer "ainda não liberada" nem o botão cravar "V1".
    const [versoesCarregadas, setVersoesCarregadas] = React.useState(false);
    const [versaoVista, setVersaoVista] = React.useState<CreditRoomVersion | null>(null);
    const [liberarAberto, setLiberarAberto] = React.useState(false);

    // Prévia de hoje: o que o sistema calcularia AGORA (prepararVersao lê tudo e não grava nada).
    // Só "Liberar para a instituição" grava. A geração descarta cálculo em voo quando o cadastro muda ou outro cálculo começa.
    const [previaEst, setPreviaEst] = React.useState<PreviaEstado>({ status: 'idle' });
    const geracaoPrevia = React.useRef(0);
    const [visao, setVisao] = React.useState<string>(ID_DA_PREVIA);

    const [documentos, setDocumentos] = React.useState<CreditRoomDocument[]>([]);
    const [sugerirAberto, setSugerirAberto] = React.useState(false);
    // A coluna "Documentos" da carteira só aparece depois que a lista chegou: antes disso "0" seria mentira.
    const [documentosCarregados, setDocumentosCarregados] = React.useState(false);
    const [membros, setMembros] = React.useState<CreditRoomMember[]>([]);
    const [convidarAberto, setConvidarAberto] = React.useState(false);
    const [log, setLog] = React.useState<CreditRoomAccessLog[]>([]);
    const [carregandoAba, setCarregandoAba] = React.useState(false);
    const [gerandoBook, setGerandoBook] = React.useState(false);

    // Versões carregam sempre: a aba Visão precisa da ativa.
    React.useEffect(() => {
        let vivo = true;
        setVersoesCarregadas(false);
        creditRoomService.listVersions(room.id)
            .then(v => { if (vivo) { setVersoes(v); setVersoesCarregadas(true); } })
            .catch(e => { if (vivo) setErro(errorMessage(e, 'Não foi possível carregar as versões.')); });
        return () => { vivo = false; };
    }, [room.id]);

    // Outra operação: a lista da anterior não pode aparecer (nem a coluna "Documentos" com contagem dela).
    React.useEffect(() => {
        setDocumentos([]);
        setDocumentosCarregados(false);
    }, [room.id]);

    React.useEffect(() => {
        let vivo = true;
        const carregar = async () => {
            setCarregandoAba(true);
            try {
                // A carteira (aba Empreendimentos) conta os documentos de cada contrato: usa a mesma lista.
                if (aba === 'dataroom' || aba === 'empreendimentos') {
                    const docs = await creditRoomService.listDocuments(room.id);
                    if (vivo) { setDocumentos(docs); setDocumentosCarregados(true); }
                }
                if (aba === 'participantes') setMembros(await creditRoomService.listMembers(room.id));
                if (aba === 'auditoria') setLog(await creditRoomService.listAccessLog(room.id));
            } catch (e) {
                if (vivo) setErro(errorMessage(e, 'Não foi possível carregar esta aba.'));
            } finally {
                if (vivo) setCarregandoAba(false);
            }
        };
        void carregar();
        return () => { vivo = false; };
    }, [aba, room.id]);

    const ativa = React.useMemo(
        () => versoes.find(v => v.id === room.activeVersionId) ?? versoes[0] ?? null,
        [versoes, room.activeVersionId],
    );

    const calcularPrevia = React.useCallback(async (dataBase?: string) => {
        const minha = ++geracaoPrevia.current;
        setPreviaEst({ status: 'carregando' });
        try {
            const p = await creditRoomService.prepararVersao(room, dataBase || hojeLocalISO());
            if (minha !== geracaoPrevia.current) return;
            setPreviaEst({ status: 'ok', previa: p, calculadaEm: new Date().toISOString() });
        } catch (e) {
            if (minha !== geracaoPrevia.current) return;
            setPreviaEst({ status: 'erro', erro: errorMessage(e, 'Não foi possível calcular a prévia.') });
        }
    }, [room]);

    // Outra operação: volta para a prévia. Cadastro salvo (room novo): a prévia velha é descartada e recalculada
    // quando alguém precisar dela — nunca se mostra nem se libera prévia de um cadastro que já mudou.
    React.useEffect(() => { setVisao(ID_DA_PREVIA); }, [room.id]);
    React.useEffect(() => {
        geracaoPrevia.current += 1;
        setPreviaEst(prev => (prev.status === 'idle' ? prev : { status: 'idle' }));
    }, [room]);

    const abaUsaPrevia = aba === 'visao' || aba === 'capacidade' || aba === 'empreendimentos';
    // Com o painel "Liberar" aberto, quem calcula é ele (para a data-base do painel).
    const precisaDaPrevia = abaUsaPrevia && visao === ID_DA_PREVIA && !liberarAberto;
    // A aba mostra a prévia de HOJE: uma pronta para outra data (calculada ontem, ou para a data-base de um painel
    // cancelado) vale tanto quanto nenhuma — recalcula, e enquanto isso mostra o esqueleto.
    const hoje = hojeLocalISO();
    const previaDeOutroDia = previaEst.status === 'ok' && previaEst.previa?.dataBase !== hoje;
    React.useEffect(() => {
        if (precisaDaPrevia && (previaEst.status === 'idle' || previaDeOutroDia)) void calcularPrevia();
    }, [precisaDaPrevia, previaEst.status, previaDeOutroDia, calcularPrevia]);

    const versaoPrevia = React.useMemo(
        () => (previaEst.status === 'ok' && previaEst.previa && previaEst.previa.dataBase === hoje && previaEst.calculadaEm
            ? versaoDaPrevia(previaEst.previa, previaEst.calculadaEm, room.organizationId)
            : null),
        [previaEst, room.organizationId, hoje],
    );
    const versaoEscolhida = visao === ID_DA_PREVIA ? null : versoes.find(v => v.id === visao) ?? null;
    const mostrandoPrevia = visao === ID_DA_PREVIA || !versaoEscolhida;

    // Room de Grupo: o Data Room mostra de qual empresa é cada documento (nome vem da versão ativa).
    const grupoEscopo = room.escopo === 'GRUPO';
    const nomeDaOrg = React.useMemo(() => {
        const m = new Map<string, string>();
        for (const o of ativa?.snapshot.escopo?.organizacoes ?? []) m.set(o.id, o.nome);
        return m;
    }, [ativa]);

    // Book em PDF da versão ATIVA (congelada, nunca o dado vivo). O índice do Data Room é lido na hora:
    // a aba pode não ter sido aberta, e um índice vazio por "não carregou" diria que não há documento.
    const baixarBook = async () => {
        if (!ativa || gerandoBook) return;
        setGerandoBook(true);
        setErro(null);
        try {
            const docs = await creditRoomService.listDocuments(room.id);
            await creditRoomBookService.baixar(room, ativa, { documentos: creditRoomBookService.documentosDoIndice(docs, ativa) });
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível gerar o book.'));
        } finally {
            setGerandoBook(false);
        }
    };

    const mudarStatus = async (status: CreditRoomStatus) => {
        try {
            onChanged(await creditRoomService.setStatus(room, status));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível alterar o status.'));
        }
    };

    const tornarAtiva = async (v: CreditRoomVersion) => {
        try {
            await creditRoomService.setActiveVersion(room, v.id);
            onChanged({ ...room, activeVersionId: v.id });
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível trocar a versão ativa.'));
        }
    };

    const baixar = async (d: CreditRoomDocument) => {
        if (!d.storagePath) return;
        try {
            const { url, marcado } = await creditRoomService.getDownloadUrl(room.id, d.storagePath);
            if (marcado) {
                // PDF com marca d'água (§84) volta como blob: precisa de
                // <a download>, senão o navegador salvaria "blob:...".
                const a = document.createElement('a');
                a.href = url;
                a.download = d.nome || 'documento.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } else {
                window.open(url, '_blank', 'noopener');
            }
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível gerar o link do documento.'));
        }
    };

    const removerCompartilhamento = async (d: CreditRoomDocument) => {
        const ok = await confirm({
            title: 'Remover do Data Room?',
            message: `"${d.nome}" deixa de aparecer para a instituição. O documento continua no GED.`,
            variant: 'warning',
            confirmLabel: 'Remover',
        });
        if (!ok) return;
        try {
            await creditRoomService.unshareDocument(room, d.shareId, d.documentId);
            setDocumentos(prev => prev.filter(x => x.shareId !== d.shareId));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível remover o compartilhamento.'));
        }
    };

    const revogar = async (m: CreditRoomMember) => {
        const ok = await confirm({
            title: 'Revogar acesso?',
            message: `${m.email} perde o acesso a esta operação imediatamente — inclusive o download que estiver aberto.`,
            variant: 'danger',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
        try {
            const atualizado = await creditRoomService.revoke(room, m);
            setMembros(prev => prev.map(x => (x.id === atualizado.id ? atualizado : x)));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível revogar o acesso.'));
        }
    };

    const reativar = async (m: CreditRoomMember) => {
        try {
            const atualizado = await creditRoomService.reinstate(room, m);
            setMembros(prev => prev.map(x => (x.id === atualizado.id ? atualizado : x)));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível reativar o acesso.'));
        }
    };

    const situacaoMembro = (m: CreditRoomMember): { texto: string; cor: string } => {
        if (m.revokedAt) return { texto: 'Revogado', cor: 'text-red-600' };
        if (m.expiresAt && m.expiresAt < new Date().toISOString()) return { texto: 'Expirado', cor: 'text-amber-700' };
        if (m.lastAccessAt) return { texto: 'Ativo', cor: 'text-green-700' };
        return { texto: 'Convidado', cor: 'text-blue-700' };
    };

    return (
        <div className="space-y-6 pb-20">
            <div>
                <div className="flex items-center gap-3">
                    <button onClick={onBack} title="Voltar" className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{room.code} · {room.name}</h1>
                </div>
                <p className="text-gray-400 text-sm mt-1.5 font-medium ml-12">{ABA_SUBTITULO[aba]}</p>
            </div>

            {/* §19.1 — abas antes dos KPIs */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div role="tablist" onKeyDown={moverEntreAbas} className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {ABAS.map(a => (
                        <button type="button" role="tab" aria-selected={aba === a.id} tabIndex={aba === a.id ? 0 : -1}
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                aba === a.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* §5.3 — escopo (status) à esquerda, ações à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-3 px-1">
                    <span className="text-sm text-gray-500">Status</span>
                    <select
                        value={room.status}
                        onChange={e => void mudarStatus(e.target.value as CreditRoomStatus)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        {(Object.keys(CREDIT_ROOM_STATUS_PT) as CreditRoomStatus[]).map(s => (
                            <option key={s} value={s}>{CREDIT_ROOM_STATUS_PT[s]}</option>
                        ))}
                    </select>
                    <span className="text-sm text-gray-400">
                        {room.institutionName ? `· ${room.institutionName}` : ''}
                        {ativa ? ` · versão ativa V${ativa.versionNo} (${formatDateBR(ativa.dataBase)})` : ' · sem versão liberada'}
                    </span>
                    {abaUsaPrevia && (
                        <>
                            <span className="text-sm text-gray-500">Mostrando</span>
                            <select
                                aria-label="Visão exibida"
                                value={mostrandoPrevia ? ID_DA_PREVIA : visao}
                                onChange={e => setVisao(e.target.value)}
                                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                            >
                                <option value={ID_DA_PREVIA}>Prévia (hoje)</option>
                                {versoes.map(v => (
                                    <option key={v.id} value={v.id}>
                                        V{v.versionNo} — liberada em {formatDateBR(new Date(v.frozenAt))}{v.id === ativa?.id ? ' · ativa' : ''}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={onEdit} className="h-9 px-3.5 text-sm font-medium text-slate-600 border border-gray-200 hover:bg-slate-50 rounded-[6px] transition-all">
                        Editar
                    </button>
                    {/* Desligado sempre diz o motivo: o wrapper carrega o title (botão disabled não dispara hover). */}
                    <span
                        className="inline-flex shrink-0"
                        title={!ativa ? 'Libere uma versão para baixar o book' : gerandoBook ? 'Gerando o book, aguarde' : 'PDF da versão ativa, com fotos'}
                    >
                        <button
                            onClick={() => void baixarBook()}
                            disabled={!ativa || gerandoBook}
                            className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-slate-600 border border-gray-200 hover:bg-slate-50 rounded-[6px] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Download className="w-[15px] h-[15px]" />
                            {gerandoBook ? 'Gerando book…' : 'Baixar book (PDF)'}
                        </button>
                    </span>
                    <button
                        onClick={() => setLiberarAberto(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Send className="w-[15px] h-[15px]" />
                        Liberar para a instituição
                    </button>
                </div>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            {/* ── Visão · Capacidade · Empreendimentos (mesma versão exibida: prévia de hoje ou uma liberada) ── */}
            {abaUsaPrevia && (() => {
                const exibida = mostrandoPrevia ? versaoPrevia : versaoEscolhida;
                const abaConteudo = !exibida ? null
                    : aba === 'visao' ? <CreditRoomIndicators version={exibida} accent="indigo" />
                        : aba === 'capacidade' ? <CreditRoomCapacity version={exibida} accent="indigo" />
                            : <CreditRoomEmpreendimentos version={exibida} accent="indigo" documentos={documentosCarregados ? documentos : undefined} />;
                if (!mostrandoPrevia) {
                    return (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 px-1">
                                V{versaoEscolhida!.versionNo} liberada em {formatDateTimeBR(versaoEscolhida!.frozenAt)} — é o que a instituição vê. Somente leitura.
                            </p>
                            {abaConteudo}
                        </div>
                    );
                }
                if (previaEst.status === 'erro') {
                    return (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3 flex flex-wrap items-center justify-between gap-3" role="alert">
                            <span>{previaEst.erro}</span>
                            <button onClick={() => void calcularPrevia()} className="h-9 px-3.5 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-100 rounded-[6px] transition-all">
                                Tentar de novo
                            </button>
                        </div>
                    );
                }
                if (!versaoPrevia) {
                    return (
                        <div role="status" aria-busy="true" aria-label="Calculando a prévia" className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse">
                            <div className="h-3 bg-gray-100 rounded w-1/3" />
                            <div className="h-3 bg-gray-100 rounded w-2/3" />
                            <div className="h-3 bg-gray-100 rounded w-1/2" />
                            <p className="text-sm text-gray-500">Calculando a prévia de hoje…</p>
                        </div>
                    );
                }
                return (
                    <div className="space-y-3">
                        <FaixaDaPrevia
                            room={room}
                            previa={versaoPrevia}
                            liberada={ativa}
                            versoesCarregadas={versoesCarregadas}
                            onAtualizar={() => void calcularPrevia()}
                        />
                        {abaConteudo}
                    </div>
                );
            })()}

            {/* ── Versões ── */}
            {aba === 'versoes' && (
                <div className="space-y-3">
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        {versoes.length === 0 ? (
                            <div className="text-center py-12">
                                <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma versão</h3>
                                <p className="text-sm text-gray-500">Cada liberação preserva a posição daquela data. Alterar o ÒPURA depois não muda o que já foi apresentado.</p>
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[50vh]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                            <th className={th}>Versão</th>
                                            <th className={th}>Rótulo</th>
                                            <th className={`${th} text-center`}>Data-base</th>
                                            <th className={th}>Liberada por</th>
                                            <th className={`${th} text-center`}>Em</th>
                                            <th className={`${th} text-center`}>Documentos</th>
                                            <th className={`${th} text-center`}>Ativa</th>
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {versoes.map(v => (
                                            <tr key={v.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setVersaoVista(v)}>
                                                <td className={`${td} text-gray-700`}>V{v.versionNo}</td>
                                                <td className={`${td} text-gray-700`}><span className="block truncate" title={v.label ?? ''}>{v.label || '—'}</span></td>
                                                <td className={`${td} text-center text-gray-600`}>{formatDateBR(v.dataBase)}</td>
                                                <td className={`${td} text-gray-600`}><span className="block truncate" title={v.frozenBy ?? ''}>{v.frozenBy || '—'}</span></td>
                                                <td className={`${td} text-center text-gray-600`}>{formatDateTimeBR(v.frozenAt)}</td>
                                                <td className={`${td} text-center text-gray-600`}>{v.documentVersionIds.length}</td>
                                                <td className={`${td} text-center`}>
                                                    <span className={`text-sm font-normal ${v.id === room.activeVersionId ? 'text-green-700' : 'text-gray-400'}`}>
                                                        {v.id === room.activeVersionId ? 'Sim' : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                        {v.id !== room.activeVersionId && (
                                                            <button onClick={() => void tornarAtiva(v)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                                                Tornar ativa
                                                            </button>
                                                        )}
                                                        <ActionIconButton kind="view" onClick={() => setVersaoVista(v)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {versaoVista && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 px-1">
                                Indicadores da <strong className="font-semibold text-gray-700">V{versaoVista.versionNo}</strong>
                                {versaoVista.label ? ` — ${versaoVista.label}` : ''} · data-base {formatDateBR(versaoVista.dataBase)}
                            </p>
                            <CreditRoomIndicators version={versaoVista} accent="indigo" />
                        </div>
                    )}
                </div>
            )}

            {/* ── Data Room ── */}
            {aba === 'dataroom' && (
                <div className="space-y-3">
                {/* §5.3 — contagem à esquerda, ação à direita */}
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                    <p className="text-sm font-normal text-gray-500 px-1">
                        {documentos.length} documento{documentos.length === 1 ? '' : 's'} no Data Room
                    </p>
                    <span className="inline-flex shrink-0" title={ativa ? undefined : 'Libere uma versão para sugerir os documentos da carteira'}>
                        <button
                            onClick={() => setSugerirAberto(true)}
                            disabled={!ativa}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Sparkles className="w-[15px] h-[15px]" />
                            Sugerir documentos
                        </button>
                    </span>
                </div>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {carregandoAba ? (
                        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-2 text-gray-500">Carregando...</p></div>
                    ) : documentos.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento compartilhado</h3>
                            <p className="text-sm text-gray-500">No GED (Corporativo › Documentos), selecione o documento → Compartilhar → aba "Credit Room".</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className={th}>Documento</th>
                                        {grupoEscopo && <th className={th}>Empresa</th>}
                                        <th className={th}>Categoria</th>
                                        <th className={th}>Tipo</th>
                                        <th className={`${th} text-center`}>Validade</th>
                                        <th className={`${th} text-center`}>Versão</th>
                                        <th className={`${th} text-center`}>Compartilhado em</th>
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {documentos.map(d => {
                                        const vencido = !!d.dataValidade && d.dataValidade < new Date().toISOString().slice(0, 10);
                                        return (
                                            <tr key={d.shareId} className="hover:bg-blue-50/50 transition-colors">
                                                <td className={`${td} text-gray-700`}><span className="block truncate" title={d.nome}>{d.nome}</span></td>
                                                {grupoEscopo && (() => {
                                                    const empresa = (d.organizationId && nomeDaOrg.get(d.organizationId)) || '—';
                                                    return <td className={`${td} text-gray-600`}><span className="block truncate" title={empresa}>{empresa}</span></td>;
                                                })()}
                                                <td className={`${td} text-gray-600`}>{d.categoria}</td>
                                                <td className={`${td} text-gray-600`}><span className="block truncate" title={d.tipoDocumento}>{d.tipoDocumento}</span></td>
                                                <td className={`${td} text-center ${vencido ? 'text-red-600' : 'text-gray-600'}`}>{d.dataValidade ? formatDateBR(d.dataValidade) : '—'}</td>
                                                <td className={`${td} text-center text-gray-600`}>{d.versionNumber ? `v${d.versionNumber}` : '—'}</td>
                                                <td className={`${td} text-center text-gray-600`}>{formatDateBR(d.sharedAt)}</td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <ActionIconButton kind="download" onClick={() => void baixar(d)} />
                                                        <ActionIconButton kind="delete" title="Remover do Data Room" onClick={() => void removerCompartilhamento(d)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                </div>
            )}

            {ativa && (
                <CreditRoomSugerirDocumentos
                    open={sugerirAberto}
                    onClose={() => setSugerirAberto(false)}
                    room={room}
                    versao={ativa}
                    onShared={setDocumentos}
                />
            )}

            {/* ── Participantes ── */}
            {aba === 'participantes' && (
                <div className="space-y-3">
                    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                        <p className="text-sm font-normal text-gray-500 px-1">
                            {membros.filter(m => !m.revokedAt).length} participante{membros.filter(m => !m.revokedAt).length === 1 ? '' : 's'} ativo{membros.filter(m => !m.revokedAt).length === 1 ? '' : 's'}
                        </p>
                        <button
                            onClick={() => setConvidarAberto(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <UserPlus className="w-[15px] h-[15px]" />
                            Convidar
                        </button>
                    </div>
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        {carregandoAba ? (
                            <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-2 text-gray-500">Carregando...</p></div>
                        ) : membros.length === 0 ? (
                            <div className="text-center py-12">
                                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Ninguém convidado ainda</h3>
                                <p className="text-sm text-gray-500">Convide o analista da instituição pelo e-mail. Ele entra pelo Portal de Crédito com login e verificação em duas etapas.</p>
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[70vh]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                            <th className={th}>E-mail</th>
                                            <th className={th}>Nome</th>
                                            <th className={th}>Instituição</th>
                                            <th className={`${th} text-center`}>Lado</th>
                                            <th className={`${th} text-center`}>Expira</th>
                                            <th className={`${th} text-center`}>Último acesso</th>
                                            <th className={`${th} text-center`}>Situação</th>
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {membros.map(m => {
                                            const sit = situacaoMembro(m);
                                            return (
                                                <tr key={m.id} className="hover:bg-blue-50/50 transition-colors">
                                                    <td className={`${td} text-gray-700`}><span className="block truncate" title={m.email}>{m.email}</span></td>
                                                    <td className={`${td} text-gray-700`}><span className="block truncate" title={m.name ?? ''}>{m.name || '—'}</span></td>
                                                    <td className={`${td} text-gray-600`}><span className="block truncate" title={m.institution ?? ''}>{m.institution || '—'}</span></td>
                                                    <td className={`${td} text-center text-gray-600`}>{SIDE_PT[m.side]}</td>
                                                    <td className={`${td} text-center text-gray-600`}>{m.expiresAt ? formatDateBR(m.expiresAt) : '—'}</td>
                                                    <td className={`${td} text-center text-gray-600`}>{m.lastAccessAt ? formatDateTimeBR(m.lastAccessAt) : '—'}</td>
                                                    <td className={`${td} text-center`}><span className={`text-sm font-normal ${sit.cor}`}>{sit.texto}</span></td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {m.revokedAt ? (
                                                                <button onClick={() => void reativar(m)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">Reativar</button>
                                                            ) : (
                                                                <button onClick={() => void revogar(m)} className="text-red-600 hover:text-red-800 text-sm font-medium p-1.5 hover:bg-red-50 rounded-lg transition-all">Revogar</button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Fontes e Usos ── */}
            {aba === 'fontesusos' && (
                <CreditRoomFunding room={room} side="TOMADOR" accent="indigo" onSaved={onChanged} />
            )}

            {/* ── Solicitações ── */}
            {aba === 'solicitacoes' && <CreditRoomRequests room={room} side="TOMADOR" accent="indigo" />}

            {/* ── Covenants ── */}
            {aba === 'covenants' && <CreditRoomCovenants room={room} versaoAtiva={ativa} accent="indigo" />}

            {/* ── Desembolsos ── */}
            {aba === 'desembolsos' && <CreditRoomDisbursements room={room} side="TOMADOR" accent="indigo" />}

            {/* ── Comentários ── */}
            {aba === 'comentarios' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                    <CreditRoomCommentsThread room={room} side="TOMADOR" accent="indigo" />
                </div>
            )}

            {/* ── Auditoria ── */}
            {aba === 'auditoria' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {carregandoAba ? (
                        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-2 text-gray-500">Carregando...</p></div>
                    ) : log.length === 0 ? (
                        <div className="text-center py-12">
                            <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Sem registros</h3>
                            <p className="text-sm text-gray-500">Acessos, downloads e alterações aparecem aqui.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className={`${th} text-center`}>Quando</th>
                                        <th className={th}>Quem</th>
                                        <th className={`${th} text-center`}>Lado</th>
                                        <th className={th}>Ação</th>
                                        <th className={th}>Recurso</th>
                                        <th className={th}>Detalhe</th>
                                        <th className="px-6 py-2 text-table-header font-semibold text-gray-500">IP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {log.map(l => (
                                        <tr key={l.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-center text-gray-600`}>{formatDateTimeBR(l.createdAt)}</td>
                                            <td className={`${td} text-gray-700`}><span className="block truncate" title={l.actorEmail}>{l.actorEmail}</span></td>
                                            <td className={`${td} text-center text-gray-600`}>{l.actorSide ? SIDE_PT[l.actorSide] : '—'}</td>
                                            <td className={`${td} text-gray-700`}>{CREDIT_ROOM_ACTION_PT[l.action] ?? l.action}</td>
                                            <td className={`${td} text-gray-600`}>{l.resourceType || '—'}</td>
                                            <td className={`${td} text-gray-600`}>
                                                <span className="block truncate" title={JSON.stringify(l.metadata)}>
                                                    {Object.entries(l.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') || '—'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-2.5 text-sm font-normal text-gray-600">{l.ip || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <LiberarSheet
                open={liberarAberto}
                onClose={() => {
                    setLiberarAberto(false);
                    // A data-base do painel pode ter trocado a prévia da tela por outra data, e um cálculo dela pode
                    // ainda estar em voo: descarta o que voltar e só mantém uma prévia pronta E de hoje.
                    geracaoPrevia.current += 1;
                    setPreviaEst(prev => (prev.status === 'ok' && prev.previa?.dataBase === hojeLocalISO() ? prev : { status: 'idle' }));
                }}
                room={room}
                proximo={versoesCarregadas ? Math.max(0, ...versoes.map(v => v.versionNo)) + 1 : null}
                liberada={ativa}
                versoesCarregadas={versoesCarregadas}
                previaEst={previaEst}
                onCalcular={d => void calcularPrevia(d)}
                onLiberada={v => {
                    setVersoes(prev => [v, ...prev]);
                    setVisao(ID_DA_PREVIA);
                    onChanged({ ...room, activeVersionId: v.id });
                    setAba('visao');
                }}
            />
            <ConvidarSheet
                open={convidarAberto}
                onClose={() => setConvidarAberto(false)}
                room={room}
                onInvited={m => setMembros(prev => [...prev, m])}
            />
        </div>
    );
}

// ── Prévia de hoje: comparação com a liberada e "Liberar para a instituição" ─────────────────

/** A prévia no detalhe interno: calculada com `prepararVersao` (lê tudo, não grava nada). */
export interface PreviaEstado {
    status: 'idle' | 'carregando' | 'ok' | 'erro';
    previa?: VersaoPreparada;
    calculadaEm?: string;
    erro?: string;
}

const BLOCOS_PT: { chave: string; nome: string }[] = [
    { chave: 'empreendimento', nome: 'Empreendimento' },
    { chave: 'obra', nome: 'Obra' },
    { chave: 'vendas', nome: 'Vendas' },
    { chave: 'portfolio', nome: 'Carteira de imóveis' },
    { chave: 'recebiveis', nome: 'Recebíveis' },
    { chave: 'eac', nome: 'Estimativa ao término (EAC)' },
    { chave: 'divida', nome: 'Dívida' },
    { chave: 'fontes_usos', nome: 'Fontes e usos' },
    { chave: 'escopo', nome: 'Escopo' },
    { chave: 'empreendimentos', nome: 'Empreendimentos' },
    { chave: 'contratos', nome: 'Contratos' },
    { chave: 'capacidade', nome: 'Capacidade de pagamento' },
    { chave: 'qualidade', nome: 'Qualidade da renda' },
];

const vezes = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

type CampoComparado = ReturnType<typeof compararComLiberada>[number]['campo'];

const ROTULO_COMPARADO: Record<CampoComparado, string> = {
    valor_maximo: 'valor máximo',
    dscr_minimo_12m: 'DSCR mínimo 12m',
    renda_liquida_media_12m: 'renda líquida média 12m',
    n_empreendimentos: 'empreendimentos',
    n_contratos: 'contratos',
};

const valorComparado = (campo: CampoComparado, v: number | null): string => {
    if (v == null) return '—';
    if (campo === 'valor_maximo' || campo === 'renda_liquida_media_12m') return formatMoney(v);
    if (campo === 'dscr_minimo_12m') return vezes(v);
    return v.toLocaleString('pt-BR');
};

/** O que mudou da última versão liberada para a prévia: números (da prévia) e cadastro (do room). */
function resumoDaComparacao(room: CreditRoom, previa: CreditRoomVersion, liberada: CreditRoomVersion | null) {
    if (!liberada) return { semLiberada: true as const };
    return {
        semLiberada: false as const,
        versionNo: liberada.versionNo,
        numeros: compararComLiberada(previa, liberada).map(d => `${ROTULO_COMPARADO[d.campo]} ${valorComparado(d.campo, d.antes)} → ${valorComparado(d.campo, d.depois)}`),
        cadastro: mudancasDesdeAVersao(room, liberada).map(m => MUDANCA_PT[m]),
    };
}

const ComparacaoComLiberada: React.FC<{
    room: CreditRoom; previa: CreditRoomVersion; liberada: CreditRoomVersion | null; className?: string;
}> = ({ room, previa, liberada, className }) => {
    const r = React.useMemo(() => resumoDaComparacao(room, previa, liberada), [room, previa, liberada]);
    if (r.semLiberada) {
        return <p className={className}>Ainda não liberada à instituição — o banco ainda não vê nada desta operação.</p>;
    }
    if (r.numeros.length === 0 && r.cadastro.length === 0) {
        return <p className={className}>Igual à V{r.versionNo} liberada: nada mudou nos números nem no cadastro.</p>;
    }
    const partes = [
        r.numeros.length ? `Desde a V${r.versionNo} liberada: ${r.numeros.join(' · ')}` : `Números iguais aos da V${r.versionNo} liberada`,
        r.cadastro.length ? `cadastro mudou: ${r.cadastro.join(', ')}` : null,
    ].filter(Boolean);
    return <p className={className}>{partes.join(' · ')}</p>;
};

/** Faixa no topo das abas quando se olha a prévia: de quando é, o que mudou desde a liberada e "Atualizar prévia". */
const FaixaDaPrevia: React.FC<{
    room: CreditRoom; previa: CreditRoomVersion; liberada: CreditRoomVersion | null; versoesCarregadas: boolean; onAtualizar: () => void;
}> = ({ room, previa, liberada, versoesCarregadas, onAtualizar }) => {
    const mudou = React.useMemo(() => {
        if (!versoesCarregadas) return false;
        const r = resumoDaComparacao(room, previa, liberada);
        return r.semLiberada || r.numeros.length > 0 || r.cadastro.length > 0;
    }, [room, previa, liberada, versoesCarregadas]);
    return (
        <div className={`flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between rounded-[10px] border px-4 py-3 ${mudou ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100 shadow-sm'}`}>
            <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                    Prévia de hoje — calculada às {horaDaPrevia(previa.frozenAt)}, ainda não liberada à instituição.
                </p>
                {versoesCarregadas && (
                    <ComparacaoComLiberada room={room} previa={previa} liberada={liberada} className={`text-sm ${mudou ? 'text-amber-800' : 'text-gray-600'}`} />
                )}
            </div>
            <button
                onClick={onAtualizar}
                title="Recalcula a prévia com os dados de agora"
                className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-slate-600 border border-gray-200 bg-white hover:bg-slate-50 rounded-[6px] transition-all shrink-0"
            >
                <RefreshCw className="w-[15px] h-[15px]" />
                Atualizar prévia
            </button>
        </div>
    );
};

export const LiberarSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    /** Número da próxima versão; `null` enquanto a lista de versões não chegou (não se crava "V1" no escuro). */
    proximo: number | null;
    /** Última versão liberada (a ativa): base da comparação. */
    liberada: CreditRoomVersion | null;
    versoesCarregadas: boolean;
    /** A prévia que está na tela — é EXATAMENTE ela que `freezeVersion` grava. */
    previaEst: PreviaEstado;
    /** Pede ao detalhe que (re)calcule a prévia para uma data-base. */
    onCalcular: (dataBase: string) => void;
    onLiberada: (v: CreditRoomVersion) => void;
}> = ({ open, onClose, room, proximo, liberada, versoesCarregadas, previaEst, onCalcular, onLiberada }) => {
    const [label, setLabel] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [dataBase, setDataBase] = React.useState(hojeLocalISO());
    const [liberando, setLiberando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    // A data-base volta para hoje ao FECHAR (não ao abrir): no primeiro render aberto o efeito abaixo já tem de ver a data certa.
    React.useEffect(() => {
        if (open) { setLabel(''); setNotes(''); setErro(null); }
        else { setDataBase(hojeLocalISO()); setLiberando(false); }
    }, [open]);

    // Com o painel aberto a prévia tem de ser a da data-base do painel: ausente (cadastro salvo em outro lugar) ou
    // pronta para outra data (cálculo cancelado que voltou, virada do dia) vale como nenhuma — recalcula.
    const previaDeOutraData = previaEst.status === 'ok' && previaEst.previa?.dataBase !== dataBase;
    React.useEffect(() => {
        if (open && dataBase && (previaEst.status === 'idle' || previaDeOutraData)) onCalcular(dataBase);
    }, [open, dataBase, previaEst.status, previaDeOutraData, onCalcular]);

    const mudarDataBase = (v: string) => {
        setDataBase(v);
        setErro(null);
        // A prévia vale só para a data-base em que foi lida: outra data recalcula antes de liberar.
        if (v && previaEst.previa?.dataBase !== v) onCalcular(v);
    };

    const previa = previaEst.status === 'ok' && previaEst.previa && previaEst.previa.dataBase === dataBase ? previaEst.previa : null;
    const calculando = !previa && previaEst.status !== 'erro' && !!dataBase;

    const liberar = async () => {
        if (!previa) return;
        setLiberando(true);
        setErro(null);
        try {
            // A MESMA prévia que está na tela: o serviço reaproveita o objeto (mesmo room e data-base) em vez de reler.
            const v = await creditRoomService.freezeVersion(room, { label: label.trim() || undefined, notes: notes.trim() || undefined, dataBase }, previa);
            onLiberada(v);
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível liberar a versão.'));
        } finally {
            setLiberando(false);
        }
    };

    const snap = previa?.snapshot ?? null;
    const cap = snap?.capacidade ?? null;
    const resumo = resumoDaCapacidade(cap);
    const semSerie = !!cap && cap.serie.length === 0;
    const comOperacao = !!cap && cap.serie.some(m => m.servico_novo > 0);
    const semDado = snap
        ? BLOCOS_PT.filter(b => (snap as unknown as Record<string, unknown>)[b.chave] == null).map(b => b.nome)
        : [];
    // Painel fechado não calcula nem compara nada (ele fica montado, escondido).
    const versaoPrevia = React.useMemo(
        () => (open && previa && previaEst.calculadaEm ? versaoDaPrevia(previa, previaEst.calculadaEm, room.organizationId) : null),
        [open, previa, previaEst.calculadaEm, room.organizationId],
    );

    const motivoLiberar = liberando ? 'Liberando a versão...'
        : !dataBase ? 'Informe a data-base para liberar'
            : previaEst.status === 'erro' ? 'A prévia não pôde ser calculada: veja o motivo acima'
                : !previa ? 'Calculando a prévia desta data-base...'
                    : proximo == null ? 'Carregando as versões liberadas: o número da nova versão é confirmado ao liberar'
                        : undefined;

    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{proximo == null ? 'Liberar para a instituição' : `Liberar V${proximo} para a instituição`}</SheetTitle>
                <SheetDescription>
                    Libera exatamente a prévia que está na tela: a posição da dívida, os KPIs da obra, as vendas, o NOI e a capacidade de pagamento daquela data-base. A instituição passa a ver esta versão; o que mudar no ÒPURA depois disso não a altera.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className={rotulo}>Rótulo</label>
                    <input autoFocus value={label} onChange={e => setLabel(e.target.value)} className={campo} placeholder="Proposta inicial, Ajustes do banco, Comitê, Contratação..." />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Data-base</label>
                    <input type="date" value={dataBase} onChange={e => mudarDataBase(e.target.value)} disabled={liberando} title={liberando ? 'Liberando a versão: a data-base não pode mudar agora' : undefined} className={campo} />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Notas</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                </div>

                {erro && <p className="text-sm text-red-600">{erro}</p>}

                {previaEst.status === 'erro' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3" role="alert">
                        <p className="text-sm text-red-700">{previaEst.erro}</p>
                        <button onClick={() => onCalcular(dataBase)} disabled={!dataBase} className="h-9 px-3.5 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-100 rounded-[6px] transition-all disabled:opacity-50">
                            Tentar de novo
                        </button>
                    </div>
                )}

                {calculando && (
                    <div role="status" aria-busy="true" aria-label="Calculando a prévia" className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 space-y-3 animate-pulse">
                        <div className="h-3 bg-gray-100 rounded w-1/3" />
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                        <p className="text-sm text-gray-500">Calculando a prévia desta data-base…</p>
                    </div>
                )}

                {previa && snap && (
                    <section aria-label="Resumo da prévia" className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">Prévia da data-base {formatDateBR(previa.dataBase)}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">É isto que será liberado. Nada foi gravado ainda.</p>
                        </div>

                        {versaoPrevia && versoesCarregadas && (
                            <ComparacaoComLiberada room={room} previa={versaoPrevia} liberada={liberada} className="text-sm text-gray-700" />
                        )}

                        {cap ? (
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <dt className={rotulo}>Valor máximo (sobre a dívida atual)</dt>
                                    <dd className="text-sm font-medium text-gray-900">{semSerie ? '—' : formatMoney(cap.capacidade_maxima?.valor_maximo)}</dd>
                                </div>
                                <div className="space-y-1.5">
                                    <dt className={rotulo}>{comOperacao ? 'DSCR mínimo 12m (pós-operação)' : 'DSCR mínimo 12m'}</dt>
                                    <dd className="text-sm font-medium text-gray-900">{vezes(resumo?.dscr_minimo_12m)}</dd>
                                </div>
                                <div className="space-y-1.5">
                                    <dt className={rotulo}>Renda líquida média 12m</dt>
                                    <dd className="text-sm font-medium text-gray-900">{formatMoney(resumo?.renda_liquida_media_12m)}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="text-sm text-amber-700">
                                A capacidade de pagamento não pôde ser calculada nesta data-base. A versão será liberada sem ela, e a aba Capacidade de pagamento ficará vazia.
                            </p>
                        )}

                        {cap && (
                            <div className="space-y-2">
                                <h4 className={rotulo}>Alertas da carteira</h4>
                                {cap.alertas.length === 0 ? (
                                    <p className="text-sm text-gray-700">Carteira sem pendências de cadastro</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {cap.alertas.map(a => (
                                            <li key={a.tipo}>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {ALERTA_PT[a.tipo]?.titulo ?? a.tipo}
                                                    <span className="font-normal text-gray-500"> · {a.qtd} {a.qtd === 1 ? 'item' : 'itens'} · {a.valor > 0 ? formatMoney(a.valor) : '—'}</span>
                                                </p>
                                                {ALERTA_PT[a.tipo] && <p className="text-xs text-gray-600 mt-0.5">{ALERTA_PT[a.tipo].comoResolver}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="space-y-1">
                            <p className="text-sm text-gray-700">
                                {semDado.length ? `Sem dado nesta versão: ${semDado.join(', ')}.` : 'Todos os blocos tiveram dado nesta versão.'}
                            </p>
                            {semDado.length > 0 && (
                                <p className="text-xs text-gray-500">Um bloco pode estar ausente porque a operação não o usa (por exemplo, sem obra vinculada).</p>
                            )}
                        </div>
                    </section>
                )}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                {/* Desligado sempre diz o motivo: o wrapper carrega o title (botão disabled não dispara hover). */}
                <span className="inline-flex shrink-0" title={motivoLiberar}>
                    <button
                        onClick={() => void liberar()}
                        disabled={!previa || liberando}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <Send className="w-[15px] h-[15px]" />
                        {liberando ? 'Liberando…' : proximo == null ? 'Liberar' : `Liberar V${proximo}`}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

// ── Convidar participante ────────────────────────────────────────────────────

const ConvidarSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    onInvited: (m: CreditRoomMember) => void;
}> = ({ open, onClose, room, onInvited }) => {
    const [form, setForm] = React.useState<CreditRoomMemberInput>({ email: '', side: 'CREDOR', permissions: { ...PERMISSOES_PADRAO } });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) { setForm({ email: '', side: 'CREDOR', institution: room.institutionName, permissions: { ...PERMISSOES_PADRAO } }); setErro(null); }
    }, [open, room.institutionName]);

    const set = <K extends keyof CreditRoomMemberInput>(k: K, v: CreditRoomMemberInput[K]) => setForm(prev => ({ ...prev, [k]: v }));
    const setPerm = (k: keyof CreditRoomPermissions, v: boolean) => set('permissions', { ...PERMISSOES_PADRAO, ...form.permissions, [k]: v });

    const convidar = async () => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setErro('Informe um e-mail válido.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            onInvited(await creditRoomService.invite(room, {
                ...form,
                email: form.email.trim().toLowerCase(),
                expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined,
            }));
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível convidar.'));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!!form.email}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Convidar participante</SheetTitle>
                <SheetDescription>
                    O convidado entra em "Portal de Crédito" na tela de login, com este e-mail, e cadastra a verificação em duas etapas no primeiro acesso.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className={rotulo}>E-mail</label>
                    <input autoFocus type="email" value={form.email} onChange={e => set('email', e.target.value)} className={campo} placeholder="analista@banco.com.br" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className={rotulo}>Nome</label>
                        <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Lado</label>
                        <select value={form.side} onChange={e => set('side', e.target.value as CreditRoomSide)} className={campo}>
                            <option value="CREDOR">Instituição financeira</option>
                            <option value="TOMADOR">Empresa (time interno)</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Instituição</label>
                        <input value={form.institution ?? ''} onChange={e => set('institution', e.target.value)} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Acesso expira em</label>
                        <input type="date" value={form.expiresAt ?? ''} onChange={e => set('expiresAt', e.target.value || undefined)} className={campo} />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Permissões</label>
                    <div className="flex flex-wrap gap-4">
                        {([['view', 'Visualizar'], ['download', 'Baixar documentos'], ['comment', 'Comentar'], ['request', 'Abrir solicitações']] as [keyof CreditRoomPermissions, string][]).map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={form.permissions?.[k] ?? true} onChange={e => setPerm(k, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                {l}
                            </label>
                        ))}
                    </div>
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button onClick={() => void convidar()} disabled={salvando} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    <UserPlus className="w-[15px] h-[15px]" />
                    {salvando ? 'Convidando...' : 'Convidar'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};
