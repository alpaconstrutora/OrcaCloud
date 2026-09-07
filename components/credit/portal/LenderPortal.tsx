import React from 'react';
import { ChevronDown, ClipboardList, Download, FileText, History, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { creditRoomService } from '../../../services/creditRoomService';
import {
    CREDIT_ROOM_STATUS_PT,
    type CreditRoom,
    type CreditRoomDocument,
    type CreditRoomVersion,
    type MyCreditRoomMembership,
} from '../../../types/creditRoom';
import { CardHeader, fmtDate, GhostButton, PortalCard, PortalEmpty, PortalLoading, StatusPill, Td, Th, type PillTone } from '../../portal/PortalKit';
import CreditRoomIndicators from '../CreditRoomIndicators';
import CreditRoomRequests, { CreditRoomCommentsThread } from '../CreditRoomRequests';
import LenderMfaGate from './LenderMfaGate';

/**
 * Portal de Crédito — o que a INSTITUIÇÃO FINANCEIRA vê.
 *
 * Casca própria, fora do <Layout> (App.tsx devolve este componente antes de
 * montar o app interno), no vocabulário dos portais externos (§24, PortalKit).
 * Repete o gutter `p-4 md:p-6` à mão (§20.2.1).
 *
 * Tudo aqui é leitura de SNAPSHOT (versão ativa) — nunca do dado vivo. O que
 * o credor escreve: solicitações, comentários compartilhados e a própria trilha
 * de acesso. A RLS de cada tabela é quem garante; a UI só reflete.
 */

type Aba = 'visao' | 'dataroom' | 'solicitacoes' | 'comentarios' | 'versoes';

const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'visao', label: 'Visão geral', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'dataroom', label: 'Data Room', icon: <FileText className="w-4 h-4" /> },
    { id: 'solicitacoes', label: 'Solicitações', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'comentarios', label: 'Comentários', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'versoes', label: 'Versões', icon: <History className="w-4 h-4" /> },
];

const STATUS_TONE: Record<string, PillTone> = {
    PREPARACAO: 'muted', ENVIADA: 'info', EM_ANALISE: 'info', PENDENCIAS: 'neutral', COMITE: 'info',
    APROVADA: 'good', RECUSADA: 'accent', CONTRATACAO: 'info', ATIVA: 'good', QUITADA: 'muted', CANCELADA: 'muted',
};

interface Props {
    userEmail: string;
    onLogout: () => void;
}

const LenderPortal: React.FC<Props> = ({ userEmail, onLogout }) => (
    <LenderMfaGate onLogout={onLogout}>
        <LenderPortalInner userEmail={userEmail} onLogout={onLogout} />
    </LenderMfaGate>
);

const LenderPortalInner: React.FC<Props> = ({ userEmail, onLogout }) => {
    const [rooms, setRooms] = React.useState<{ room: CreditRoom; membership: MyCreditRoomMembership }[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [roomId, setRoomId] = React.useState<string | null>(null);
    const [aba, setAba] = React.useState<Aba>('visao');
    const [menuAberto, setMenuAberto] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        let vivo = true;
        creditRoomService.myRooms()
            .then(list => {
                if (!vivo) return;
                setRooms(list);
                if (list.length && !roomId) setRoomId(list[0].room.id);
            })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar suas operações.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        const fora = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    const atual = rooms.find(r => r.room.id === roomId) ?? null;

    // Primeiro acesso liga user_id ao convite; cada troca de room registra LOGIN.
    React.useEffect(() => {
        if (!atual) return;
        creditRoomService.touch(atual.room).catch(() => undefined);
    }, [atual?.room.id]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (!atual) return;
        creditRoomService.log(atual.room, 'VIEW', 'tab', aba, {}, 'CREDOR').catch(() => undefined);
    }, [aba, atual?.room.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const sair = async () => {
        await supabase.auth.signOut();
        onLogout();
    };

    const nome = userEmail.split('@')[0] || 'Analista';

    return (
        <div className="portal-mobile-font min-h-screen bg-[#F2F2F4] pb-24 md:pb-0 md:h-screen md:flex md:flex-col md:overflow-hidden">
            <header className="flex h-16 border-b border-gray-100 bg-white items-center justify-between px-4 md:px-6 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="px-2.5 py-1 bg-[#E1553C] text-white rounded-lg text-xs font-black uppercase tracking-wider shrink-0">Portal de Crédito</div>
                    {rooms.length > 1 ? (
                        <select
                            value={roomId ?? ''}
                            onChange={e => { setRoomId(e.target.value); setAba('visao'); }}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[8px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#E1553C]/25 cursor-pointer max-w-[60vw] truncate"
                        >
                            {rooms.map(r => <option key={r.room.id} value={r.room.id}>{r.room.code} · {r.room.name}</option>)}
                        </select>
                    ) : atual ? (
                        <h1 className="text-md font-bold text-gray-900 tracking-tight truncate">{atual.room.code} · {atual.room.name}</h1>
                    ) : null}
                </div>
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setMenuAberto(o => !o)}
                        className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                        aria-haspopup="menu"
                        aria-expanded={menuAberto}
                    >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E1553C] text-[11px] font-bold text-white">
                            {nome.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-semibold text-gray-600 hidden sm:inline">{userEmail}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuAberto ? 'rotate-180' : ''}`} />
                    </button>
                    {menuAberto && (
                        <div className="absolute right-0 top-full z-[1000] mt-2 w-[260px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                            <div className="border-b border-gray-100 px-4 py-3">
                                <div className="truncate text-sm font-bold text-gray-900">{atual?.membership.side === 'CREDOR' ? 'Instituição financeira' : 'Participante'}</div>
                                <div className="truncate text-xs text-gray-500">{userEmail}</div>
                                {atual?.membership.expiresAt && (
                                    <div className="text-xs text-gray-400 mt-1">Acesso até {fmtDate(atual.membership.expiresAt)}</div>
                                )}
                            </div>
                            <div className="p-2">
                                <button onClick={() => void sair()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem">
                                    <LogOut className="w-4 h-4" /> Sair
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="md:flex md:flex-1 md:overflow-hidden md:min-h-0">
                <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex-col gap-1 shrink-0 overflow-y-auto hidden md:flex">
                    {ABAS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setAba(t.id)}
                            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                aba === t.id
                                    ? 'bg-[#FDEDE8] border border-[#F3D9D1] text-[#C24428] font-semibold'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-white'
                            }`}
                        >
                            {t.icon}
                            <span>{t.label}</span>
                        </button>
                    ))}
                </aside>

                {/* §20.2.1 — casca própria repete o gutter à mão */}
                <div className="md:flex-1 md:overflow-y-auto p-4 md:p-6 space-y-4">
                    {carregando ? (
                        <PortalLoading label="Carregando suas operações..." />
                    ) : erro ? (
                        <PortalCard className="p-8 max-w-md mx-auto text-center">
                            <p className="text-sm text-red-600">{erro}</p>
                            <GhostButton className="mt-4" onClick={() => void sair()}>Sair</GhostButton>
                        </PortalCard>
                    ) : !atual ? (
                        <PortalCard className="p-8 max-w-md mx-auto">
                            <PortalEmpty
                                icon={<FileText className="w-9 h-9" />}
                                title="Nenhuma operação liberada para você"
                                subtitle="O convite pode ter expirado ou sido revogado. Fale com a empresa tomadora."
                            />
                        </PortalCard>
                    ) : (
                        <RoomView atual={atual} aba={aba} />
                    )}
                </div>
            </div>

            {/* Barra inferior — mobile */}
            <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 flex">
                {ABAS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setAba(t.id)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${aba === t.id ? 'text-[#C24428]' : 'text-gray-400'}`}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
            </nav>
        </div>
    );
};

// ── Conteúdo de um room ──────────────────────────────────────────────────────

const RoomView: React.FC<{ atual: { room: CreditRoom; membership: MyCreditRoomMembership }; aba: Aba }> = ({ atual, aba }) => {
    const { room, membership } = atual;
    const [versoes, setVersoes] = React.useState<CreditRoomVersion[]>([]);
    const [versaoVista, setVersaoVista] = React.useState<CreditRoomVersion | null>(null);
    const [documentos, setDocumentos] = React.useState<CreditRoomDocument[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        setCarregando(true);
        Promise.all([creditRoomService.listVersions(room.id), creditRoomService.listDocuments(room.id)])
            .then(([v, d]) => { if (vivo) { setVersoes(v); setDocumentos(d); } })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar a operação.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [room.id]);

    const ativa = versoes.find(v => v.id === room.activeVersionId) ?? null;

    const baixar = async (d: CreditRoomDocument) => {
        if (!d.storagePath) return;
        try {
            const url = await creditRoomService.getDownloadUrl(room.id, d.storagePath);
            window.open(url, '_blank', 'noopener');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível baixar o documento.');
        }
    };

    if (carregando) return <PortalLoading />;

    return (
        <div className="space-y-4">
            {/* Cabeçalho da operação — sempre visível */}
            <PortalCard className="p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] text-[#8A8F9A]">{room.code}</span>
                            <StatusPill tone={STATUS_TONE[room.status] ?? 'muted'}>{CREDIT_ROOM_STATUS_PT[room.status]}</StatusPill>
                        </div>
                        <h2 className="text-lg font-semibold text-[#1F2430] tracking-tight truncate mt-0.5">{room.name}</h2>
                        {room.purpose && <p className="text-[13px] text-[#8A8F9A] mt-0.5">{room.purpose}</p>}
                    </div>
                    <div className="text-[13px] text-[#8A8F9A] md:text-right shrink-0">
                        {ativa ? (
                            <>
                                <div>Versão <span className="font-semibold text-[#1F2430]">V{ativa.versionNo}</span>{ativa.label ? ` · ${ativa.label}` : ''}</div>
                                <div>Posição de <span className="font-semibold text-[#1F2430]">{fmtDate(ativa.dataBase)}</span></div>
                            </>
                        ) : (
                            <div>A empresa ainda não liberou uma versão.</div>
                        )}
                    </div>
                </div>
            </PortalCard>

            {erro && <PortalCard className="p-4"><p className="text-sm text-red-600">{erro}</p></PortalCard>}

            {aba === 'visao' && (
                ativa ? <CreditRoomIndicators version={ativa} accent="portal" /> : (
                    <PortalCard><PortalEmpty icon={<LayoutDashboard className="w-9 h-9" />} title="Sem versão liberada" subtitle="Os indicadores aparecem quando a empresa congelar a primeira versão." /></PortalCard>
                )
            )}

            {aba === 'dataroom' && (
                <PortalCard className="overflow-hidden">
                    <CardHeader title="Data Room" subtitle={documentos.length ? `${documentos.length} documento${documentos.length === 1 ? '' : 's'} · links válidos por 15 minutos` : undefined} />
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[720px]">
                            <thead>
                                <tr className="border-b border-[#ECECEF]">
                                    <Th>Documento</Th>
                                    <Th>Categoria</Th>
                                    <Th>Tipo</Th>
                                    <Th>Validade</Th>
                                    <Th>Versão</Th>
                                    <Th className="text-right">Ação</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F4F4F6]">
                                {documentos.length === 0 ? (
                                    <tr><td colSpan={6}><PortalEmpty icon={<FileText className="w-9 h-9" />} title="Nenhum documento disponível" subtitle="A empresa ainda não compartilhou documentos com esta operação." /></td></tr>
                                ) : documentos.map(d => {
                                    const vencido = !!d.dataValidade && d.dataValidade < new Date().toISOString().slice(0, 10);
                                    return (
                                        <tr key={d.shareId} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#1F2430] font-medium">{d.nome}</Td>
                                            <Td className="text-[#8A8F9A] capitalize">{d.categoria}</Td>
                                            <Td className="text-[#8A8F9A]">{d.tipoDocumento}</Td>
                                            <Td className={vencido ? 'text-red-600' : 'text-[#8A8F9A]'}>{d.dataValidade ? fmtDate(d.dataValidade) : '—'}</Td>
                                            <Td className="text-[#8A8F9A]">{d.versionNumber ? `v${d.versionNumber}` : '—'}</Td>
                                            <Td className="text-right">
                                                {membership.permissions.download && d.storagePath ? (
                                                    <button onClick={() => void baixar(d)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#C24428] hover:text-[#A63A22]">
                                                        <Download className="w-4 h-4" /> Baixar
                                                    </button>
                                                ) : <span className="text-[13px] text-gray-400">somente visualização</span>}
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </PortalCard>
            )}

            {aba === 'solicitacoes' && (
                <CreditRoomRequests
                    room={room}
                    side="CREDOR"
                    accent="portal"
                    canRequest={membership.permissions.request}
                    canComment={membership.permissions.comment}
                />
            )}

            {aba === 'comentarios' && (
                <PortalCard className="p-5">
                    <CreditRoomCommentsThread room={room} side="CREDOR" accent="portal" canComment={membership.permissions.comment} />
                </PortalCard>
            )}

            {aba === 'versoes' && (
                <div className="space-y-4">
                    <PortalCard className="overflow-hidden">
                        <CardHeader title="Versões apresentadas" subtitle="Cada versão preserva a posição da data em que foi liberada." />
                        <div className="overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[560px]">
                                <thead>
                                    <tr className="border-b border-[#ECECEF]">
                                        <Th>Versão</Th>
                                        <Th>Rótulo</Th>
                                        <Th>Data-base</Th>
                                        <Th>Liberada em</Th>
                                        <Th className="text-right">Ação</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F4F4F6]">
                                    {versoes.length === 0 ? (
                                        <tr><td colSpan={5}><PortalEmpty icon={<History className="w-9 h-9" />} title="Nenhuma versão ainda" /></td></tr>
                                    ) : versoes.map(v => (
                                        <tr key={v.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#1F2430] font-medium">V{v.versionNo}{v.id === room.activeVersionId && <span className="ml-2 text-[11px] text-[#C24428]">ativa</span>}</Td>
                                            <Td>{v.label || '—'}</Td>
                                            <Td className="text-[#8A8F9A]">{fmtDate(v.dataBase)}</Td>
                                            <Td className="text-[#8A8F9A]">{fmtDate(v.frozenAt)}</Td>
                                            <Td className="text-right">
                                                <button onClick={() => setVersaoVista(v)} className="text-[13px] font-semibold text-[#C24428] hover:text-[#A63A22]">Ver indicadores</button>
                                            </Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </PortalCard>
                    {versaoVista && (
                        <div className="space-y-2">
                            <p className="text-[13px] text-[#8A8F9A] px-1">Indicadores da V{versaoVista.versionNo} · posição de {fmtDate(versaoVista.dataBase)}</p>
                            <CreditRoomIndicators version={versaoVista} accent="portal" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LenderPortal;
