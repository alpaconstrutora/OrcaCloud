import React from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Lock, MessageSquare, Plus, Send } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { formatDateBR, formatDateTimeBR } from '../ui/Format';
import { usePersistedState } from '../ui/TableUtils';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import {
    CREDIT_ROOM_PRIORITY_PT,
    CREDIT_ROOM_REQUEST_STATUS_PT,
    type CreditRoom,
    type CreditRoomComment,
    type CreditRoomCommentVisibility,
    type CreditRoomPriority,
    type CreditRoomRequest,
    type CreditRoomRequestStatus,
    type CreditRoomSide,
} from '../../types/creditRoom';

/**
 * Request list (PRD §59) + comentários (§60–61), compartilhados entre o módulo
 * interno e o portal do credor (§24: prop `accent`, nunca duplicar).
 *
 * O que muda por lado é POUCO e está no banco, não aqui: o credor só enxerga
 * comentário COMPARTILHADO (policy de SELECT) e só escreve COMPARTILHADO
 * (policy de INSERT). A UI apenas esconde o seletor de visibilidade do lado
 * dele — a trava é a RLS.
 */

type Accent = 'indigo' | 'portal';

// Escrito por extenso: o JIT do Tailwind não enxerga classe montada em runtime.
const ACCENTS: Record<Accent, { btn: string; ring: string; link: string; chip: string }> = {
    indigo: {
        btn: 'bg-blue-600 text-white hover:bg-blue-700',
        ring: 'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
        link: 'text-blue-600 hover:text-blue-800',
        chip: 'bg-blue-50 text-blue-700',
    },
    portal: {
        btn: 'bg-[#E1553C] text-white hover:bg-[#C8452E]',
        ring: 'focus:ring-2 focus:ring-[#E1553C]/25 focus:border-[#E1553C]',
        link: 'text-[#C24428] hover:text-[#A63A22]',
        chip: 'bg-[#FDEDE8] text-[#C24428]',
    },
};

const STATUS_COR: Record<CreditRoomRequestStatus, string> = {
    ABERTA: 'text-amber-700',
    EM_PREPARACAO: 'text-blue-700',
    RESPONDIDA: 'text-indigo-700',
    EM_ANALISE: 'text-violet-700',
    ACEITA: 'text-green-700',
    REJEITADA: 'text-red-600',
};

const PRIORIDADE_COR: Record<CreditRoomPriority, string> = {
    BAIXA: 'text-gray-500',
    MEDIA: 'text-gray-700',
    ALTA: 'text-red-600',
};

const SIDE_PT: Record<CreditRoomSide, string> = { TOMADOR: 'Empresa', CREDOR: 'Instituição' };

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

interface Props {
    room: CreditRoom;
    /** De que lado da mesa o usuário logado está. */
    side: CreditRoomSide;
    accent?: Accent;
    /** Permissão de abrir solicitação (members.permissions.request). */
    canRequest?: boolean;
    canComment?: boolean;
}

const CreditRoomRequests: React.FC<Props> = ({ room, side, accent = 'indigo', canRequest = true, canComment = true }) => {
    const a = ACCENTS[accent];
    const confirm = useConfirm();

    const [itens, setItens] = React.useState<CreditRoomRequest[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [filtroStatus, setFiltroStatus] = usePersistedState<'todas' | 'abertas' | 'encerradas'>(`creditRoom:${room.id}:requests:filtro`, 'abertas');
    const [expandido, setExpandido] = React.useState<string | null>(null);
    const [novoAberto, setNovoAberto] = React.useState(false);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            setItens(await creditRoomService.listRequests(room.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar as solicitações.'));
        } finally {
            setCarregando(false);
        }
    }, [room.id]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const visiveis = React.useMemo(() => {
        const encerrada = (r: CreditRoomRequest) => r.status === 'ACEITA' || r.status === 'REJEITADA';
        if (filtroStatus === 'abertas') return itens.filter(r => !encerrada(r));
        if (filtroStatus === 'encerradas') return itens.filter(encerrada);
        return itens;
    }, [itens, filtroStatus]);

    const mudarStatus = async (r: CreditRoomRequest, status: CreditRoomRequestStatus) => {
        try {
            const atualizado = await creditRoomService.updateRequest(r.id, { status });
            // §22 — atualiza o array local.
            setItens(prev => prev.map(x => (x.id === atualizado.id ? atualizado : x)));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível alterar o status.'));
        }
    };

    const excluir = async (r: CreditRoomRequest) => {
        const ok = await confirm({
            title: 'Excluir solicitação?',
            message: 'Os comentários desta solicitação também serão excluídos.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await creditRoomService.removeRequest(r.id);
            setItens(prev => prev.filter(x => x.id !== r.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível excluir a solicitação.'));
        }
    };

    return (
        <div className="space-y-3">
            {/* §5.3 — escopo à esquerda, ação primária à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={filtroStatus}
                        onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}
                        className={`h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none transition-all cursor-pointer ${a.ring}`}
                    >
                        <option value="abertas">Em aberto</option>
                        <option value="encerradas">Encerradas</option>
                        <option value="todas">Todas</option>
                    </select>
                    <p className="text-sm font-normal text-gray-500 px-1">
                        {visiveis.length} solicitaç{visiveis.length === 1 ? 'ão' : 'ões'}
                    </p>
                </div>
                {canRequest && (
                    <button
                        onClick={() => setNovoAberto(true)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 ${a.btn}`}
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Nova solicitação
                    </button>
                )}
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : visiveis.length === 0 ? (
                    <div className="text-center py-12">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma solicitação</h3>
                        <p className="text-sm text-gray-500">
                            {filtroStatus === 'abertas' ? 'Nada em aberto neste momento.' : 'Pedidos de documento e esclarecimento aparecem aqui.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} w-8`}></th>
                                    <th className={th}>Solicitação</th>
                                    <th className={th}>De</th>
                                    <th className={th}>Responsável</th>
                                    <th className={`${th} text-center`}>Prazo</th>
                                    <th className={`${th} text-center`}>Prioridade</th>
                                    <th className={`${th} text-center`}>Status</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {visiveis.map(r => {
                                    const aberto = expandido === r.id;
                                    const atrasada = !!r.dueAt && r.dueAt < new Date().toISOString().slice(0, 10) && r.status !== 'ACEITA' && r.status !== 'REJEITADA';
                                    return (
                                        <React.Fragment key={r.id}>
                                            <tr
                                                className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                                                onClick={() => setExpandido(aberto ? null : r.id)}
                                            >
                                                <td className={`${td} text-gray-400`}>
                                                    {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </td>
                                                <td className={`${td} text-gray-700`}>
                                                    <span className="block truncate" title={r.title}>{r.title}</span>
                                                </td>
                                                <td className={`${td} text-gray-600`}>{SIDE_PT[r.fromSide]}</td>
                                                <td className={`${td} text-gray-600`}>
                                                    <span className="block truncate" title={r.assigneeEmail ?? ''}>{r.assigneeEmail || '—'}</span>
                                                </td>
                                                <td className={`${td} text-center ${atrasada ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {r.dueAt ? formatDateBR(r.dueAt) : '—'}
                                                </td>
                                                <td className={`${td} text-center ${PRIORIDADE_COR[r.priority]}`}>{CREDIT_ROOM_PRIORITY_PT[r.priority]}</td>
                                                <td className={`${td} text-center`} onClick={e => e.stopPropagation()}>
                                                    {/* §7.1 — select inline com a MESMA tipografia da célula */}
                                                    <select
                                                        value={r.status}
                                                        onChange={e => void mudarStatus(r, e.target.value as CreditRoomRequestStatus)}
                                                        className={`text-sm font-normal px-2 py-1 rounded border bg-gray-50 border-gray-100 cursor-pointer appearance-none ${STATUS_COR[r.status]}`}
                                                    >
                                                        {(Object.keys(CREDIT_ROOM_REQUEST_STATUS_PT) as CreditRoomRequestStatus[]).map(s => (
                                                            <option key={s} value={s}>{CREDIT_ROOM_REQUEST_STATUS_PT[s]}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => setExpandido(aberto ? null : r.id)}
                                                            className={`text-sm font-medium p-1.5 rounded-lg transition-all ${a.link}`}
                                                        >
                                                            Comentários
                                                        </button>
                                                        {side === 'TOMADOR' && <ActionIconButton kind="delete" onClick={() => void excluir(r)} />}
                                                    </div>
                                                </td>
                                            </tr>
                                            {aberto && (
                                                <tr>
                                                    <td colSpan={8} className="px-6 py-4 bg-gray-50/60">
                                                        {r.description && (
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{r.description}</p>
                                                        )}
                                                        <p className="text-xs text-gray-400 mb-3">
                                                            Aberta por {r.createdBy} em {formatDateTimeBR(r.createdAt)}
                                                        </p>
                                                        <CreditRoomCommentsThread
                                                            room={room}
                                                            side={side}
                                                            accent={accent}
                                                            requestId={r.id}
                                                            canComment={canComment}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <NovaSolicitacaoSheet
                open={novoAberto}
                onClose={() => setNovoAberto(false)}
                room={room}
                side={side}
                accent={accent}
                onCreated={r => setItens(prev => [r, ...prev])}
            />
        </div>
    );
};

// ── Nova solicitação ─────────────────────────────────────────────────────────

const NovaSolicitacaoSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    side: CreditRoomSide;
    accent: Accent;
    onCreated: (r: CreditRoomRequest) => void;
}> = ({ open, onClose, room, side, accent, onCreated }) => {
    const a = ACCENTS[accent];
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [dueAt, setDueAt] = React.useState('');
    const [priority, setPriority] = React.useState<CreditRoomPriority>('MEDIA');
    const [assignee, setAssignee] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) { setTitle(''); setDescription(''); setDueAt(''); setPriority('MEDIA'); setAssignee(''); setErro(null); }
    }, [open]);

    const salvar = async () => {
        if (!title.trim()) { setErro('Informe o título da solicitação.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            const criada = await creditRoomService.createRequest(room, {
                title: title.trim(),
                description: description.trim() || undefined,
                fromSide: side,
                dueAt: dueAt || undefined,
                priority,
                assigneeEmail: assignee.trim() || undefined,
            });
            onCreated(criada);
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível abrir a solicitação.'));
        } finally {
            setSalvando(false);
        }
    };

    const campo = `w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none transition-all ${a.ring}`;

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!!title || !!description}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Nova solicitação</SheetTitle>
                <SheetDescription>Pedido de documento, esclarecimento ou posicionamento — fica registrado para os dois lados.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Título</label>
                    <input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={campo} placeholder="Ex.: Enviar matrícula atualizada do terreno" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Detalhes</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all ${a.ring}`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Prazo</label>
                        <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Prioridade</label>
                        <select value={priority} onChange={e => setPriority(e.target.value as CreditRoomPriority)} className={campo}>
                            {(Object.keys(CREDIT_ROOM_PRIORITY_PT) as CreditRoomPriority[]).map(p => (
                                <option key={p} value={p}>{CREDIT_ROOM_PRIORITY_PT[p]}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Responsável (e-mail)</label>
                    <input type="email" value={assignee} onChange={e => setAssignee(e.target.value)} className={campo} placeholder="quem responde" />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button onClick={() => void salvar()} disabled={salvando} className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}>
                    {salvando ? 'Abrindo...' : 'Abrir solicitação'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

// ── Comentários ──────────────────────────────────────────────────────────────

export const CreditRoomCommentsThread: React.FC<{
    room: CreditRoom;
    side: CreditRoomSide;
    accent?: Accent;
    /** `undefined` = comentários do room (sem solicitação). */
    requestId?: string;
    canComment?: boolean;
}> = ({ room, side, accent = 'indigo', requestId, canComment = true }) => {
    const a = ACCENTS[accent];
    const [comentarios, setComentarios] = React.useState<CreditRoomComment[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [texto, setTexto] = React.useState('');
    const [visibilidade, setVisibilidade] = React.useState<CreditRoomCommentVisibility>('COMPARTILHADO');
    const [enviando, setEnviando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        setCarregando(true);
        creditRoomService.listComments(room.id, requestId ?? null)
            .then(l => { if (vivo) setComentarios(l); })
            .catch(e => { if (vivo) setErro(errorMessage(e, 'Não foi possível carregar os comentários.')); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [room.id, requestId]);

    const enviar = async () => {
        if (!texto.trim()) return;
        setEnviando(true);
        setErro(null);
        try {
            const novo = await creditRoomService.addComment(room, {
                body: texto.trim(),
                visibility: side === 'CREDOR' ? 'COMPARTILHADO' : visibilidade,
                side,
                requestId,
            });
            setComentarios(prev => [...prev, novo]);
            setTexto('');
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível enviar o comentário.'));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="space-y-3">
            {carregando ? (
                <p className="text-sm text-gray-400">Carregando comentários...</p>
            ) : comentarios.length === 0 ? (
                <p className="text-sm text-gray-400 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Nenhum comentário ainda.</p>
            ) : (
                <ul className="space-y-2">
                    {comentarios.map(c => (
                        <li key={c.id} className={`rounded-[10px] border px-4 py-3 ${c.visibility === 'INTERNO' ? 'bg-amber-50/60 border-amber-100' : 'bg-white border-gray-100'}`}>
                            <div className="flex items-center justify-between gap-3 mb-1">
                                <span className="text-sm font-medium text-gray-800 truncate" title={c.authorEmail}>
                                    {c.authorEmail}
                                    <span className="text-gray-400 font-normal"> · {SIDE_PT[c.authorSide]}</span>
                                </span>
                                <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1.5">
                                    {c.visibility === 'INTERNO' && <span className="flex items-center gap-1 text-amber-700"><Lock className="w-3 h-3" /> interno</span>}
                                    {formatDateTimeBR(c.createdAt)}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                        </li>
                    ))}
                </ul>
            )}

            {canComment && (
                <div className="flex flex-col gap-2">
                    <textarea
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        rows={2}
                        placeholder="Escrever comentário..."
                        className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all ${a.ring}`}
                    />
                    <div className="flex items-center justify-between gap-3">
                        {side === 'TOMADOR' ? (
                            <select
                                value={visibilidade}
                                onChange={e => setVisibilidade(e.target.value as CreditRoomCommentVisibility)}
                                className={`h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium cursor-pointer outline-none ${a.ring}`}
                                title="Comentário interno nunca chega à instituição"
                            >
                                <option value="COMPARTILHADO">Visível para a instituição</option>
                                <option value="INTERNO">Interno — só a empresa vê</option>
                            </select>
                        ) : <span />}
                        <button
                            onClick={() => void enviar()}
                            disabled={enviando || !texto.trim()}
                            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}
                        >
                            <Send className="w-[15px] h-[15px]" />
                            {enviando ? 'Enviando...' : 'Enviar'}
                        </button>
                    </div>
                </div>
            )}
            {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
    );
};

export default CreditRoomRequests;
