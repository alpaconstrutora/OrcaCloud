import React from 'react';
import { ArrowLeft, Camera, FileText, History, Snowflake, UserPlus, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { formatDateBR, formatDateTimeBR } from '../ui/Format';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
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
import CreditRoomRequests, { CreditRoomCommentsThread } from './CreditRoomRequests';
import CreditRoomCovenants from './CreditRoomCovenants';
import CreditRoomFunding from './CreditRoomFunding';
import CreditRoomDisbursements from './CreditRoomDisbursements';
import { CreditRoomStatusBadge } from './CreditRoomModule';

/**
 * Detalhe de um Credit Room — lado interno (tomador).
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 6)
 */

type Aba = 'visao' | 'fontesusos' | 'versoes' | 'dataroom' | 'participantes' | 'solicitacoes' | 'covenants' | 'desembolsos' | 'comentarios' | 'auditoria';

const ABAS: { id: Aba; label: string }[] = [
    { id: 'visao', label: 'Visão' },
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
    visao: 'Os indicadores da versão ativa — o que a instituição financeira vê.',
    fontesusos: 'De onde vem o dinheiro e para onde vai. O banco checa se as duas somas fecham.',
    versoes: 'Snapshots congelados da operação. Cada um preserva a posição da data em que foi apresentado (R2).',
    dataroom: 'Documentos do GED compartilhados com este Credit Room. Compartilhe pelo botão do próprio GED.',
    participantes: 'Quem acessa: analistas da instituição (login + MFA) e o time interno.',
    solicitacoes: 'Request list da due diligence — o que a instituição pediu e onde está.',
    covenants: 'Cláusulas com meta, folga e situação. O DSCR aqui é apurado sobre o fluxo elegível DESTA operação, não sobre o EBITDA da empresa.',
    desembolsos: 'Liberações do contrato: solicitação, medição, aprovação e o que de fato saiu.',
    comentarios: 'Conversa da operação. Comentário interno nunca chega à instituição.',
    auditoria: 'Quem viu, baixou, comentou, convidou e congelou — com data e hora.',
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
    const [versaoVista, setVersaoVista] = React.useState<CreditRoomVersion | null>(null);
    const [congelarAberto, setCongelarAberto] = React.useState(false);

    const [documentos, setDocumentos] = React.useState<CreditRoomDocument[]>([]);
    const [membros, setMembros] = React.useState<CreditRoomMember[]>([]);
    const [convidarAberto, setConvidarAberto] = React.useState(false);
    const [log, setLog] = React.useState<CreditRoomAccessLog[]>([]);
    const [carregandoAba, setCarregandoAba] = React.useState(false);

    // Versões carregam sempre: a aba Visão precisa da ativa.
    React.useEffect(() => {
        let vivo = true;
        creditRoomService.listVersions(room.id)
            .then(v => { if (vivo) setVersoes(v); })
            .catch(e => { if (vivo) setErro(errorMessage(e, 'Não foi possível carregar as versões.')); });
        return () => { vivo = false; };
    }, [room.id]);

    React.useEffect(() => {
        let vivo = true;
        const carregar = async () => {
            setCarregandoAba(true);
            try {
                if (aba === 'dataroom') setDocumentos(await creditRoomService.listDocuments(room.id));
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
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-2 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{room.code} · {room.name}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{ABA_SUBTITULO[aba]}</p>
            </div>

            {/* §19.1 — abas antes dos KPIs */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {ABAS.map(a => (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
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
                        {ativa ? ` · versão ativa V${ativa.versionNo} (${formatDateBR(ativa.dataBase)})` : ' · sem versão congelada'}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={onEdit} className="h-9 px-3.5 text-sm font-medium text-slate-600 border border-gray-200 hover:bg-slate-50 rounded-[6px] transition-all">
                        Editar
                    </button>
                    <button
                        onClick={() => setCongelarAberto(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Snowflake className="w-[15px] h-[15px]" />
                        Congelar versão
                    </button>
                </div>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            {/* ── Visão ── */}
            {aba === 'visao' && (
                ativa ? (
                    <CreditRoomIndicators version={ativa} accent="indigo" />
                ) : (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                        <Camera className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma versão congelada</h3>
                        <p className="text-sm text-gray-500">Congele a primeira versão para gerar os indicadores e liberar a visão para a instituição.</p>
                    </div>
                )
            )}

            {/* ── Versões ── */}
            {aba === 'versoes' && (
                <div className="space-y-3">
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        {versoes.length === 0 ? (
                            <div className="text-center py-12">
                                <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma versão</h3>
                                <p className="text-sm text-gray-500">Cada congelamento preserva a posição daquela data. Alterar o ÒPURA depois não muda o que já foi apresentado.</p>
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[50vh]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className={th}>Versão</th>
                                            <th className={th}>Rótulo</th>
                                            <th className={`${th} text-center`}>Data-base</th>
                                            <th className={th}>Congelada por</th>
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
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className={th}>Documento</th>
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
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
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
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
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

            <CongelarSheet
                open={congelarAberto}
                onClose={() => setCongelarAberto(false)}
                room={room}
                proximo={(versoes[0]?.versionNo ?? 0) + 1}
                onFrozen={v => {
                    setVersoes(prev => [v, ...prev]);
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

// ── Congelar versão ──────────────────────────────────────────────────────────

const CongelarSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    proximo: number;
    onFrozen: (v: CreditRoomVersion) => void;
}> = ({ open, onClose, room, proximo, onFrozen }) => {
    const [label, setLabel] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [dataBase, setDataBase] = React.useState(new Date().toISOString().slice(0, 10));
    const [congelando, setCongelando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) { setLabel(''); setNotes(''); setDataBase(new Date().toISOString().slice(0, 10)); setErro(null); }
    }, [open]);

    const congelar = async () => {
        setCongelando(true);
        setErro(null);
        try {
            const v = await creditRoomService.freezeVersion(room, { label: label.trim() || undefined, notes: notes.trim() || undefined, dataBase });
            onFrozen(v);
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível congelar a versão.'));
        } finally {
            setCongelando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Congelar versão V{proximo}</SheetTitle>
                <SheetDescription>
                    Lê a posição da dívida, os KPIs da obra, as vendas, o NOI e os documentos compartilhados AGORA e guarda tudo. Depois disso, o que mudar no ÒPURA não altera esta versão.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className={rotulo}>Rótulo</label>
                    <input autoFocus value={label} onChange={e => setLabel(e.target.value)} className={campo} placeholder="Proposta inicial, Ajustes do banco, Comitê, Contratação..." />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Data-base</label>
                    <input type="date" value={dataBase} onChange={e => setDataBase(e.target.value)} className={campo} />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Notas</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button onClick={() => void congelar()} disabled={congelando} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    <Snowflake className="w-[15px] h-[15px]" />
                    {congelando ? 'Congelando...' : 'Congelar'}
                </button>
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
