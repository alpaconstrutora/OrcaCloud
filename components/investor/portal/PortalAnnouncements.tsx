import React from 'react';
import { Bell, CheckCircle2, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
    investorPortalTokenService,
    RespostaRecusadaError,
    type RespostaDoComunicado,
} from '../../../services/investorPortalTokenService';
import { ANNOUNCEMENT_TYPE_LABELS, VOTE_LABELS, type AnnouncementType } from '../../../services/announcementsService';
import { CardHeader, GhostButton, parseDate, PortalCard, PortalEmpty, PrimaryButton, SoftButton, StatusPill } from '../../portal/PortalKit';

/**
 * Comunicados no portal do investidor (pelo link). Aviso/assembleia com pedido de confirmação →
 * "Confirmar"; votação → Sim / Não / Abstenção, com um 2º clique de confirmação porque o voto é
 * definitivo (a RPC não troca a 1ª resposta — migration 20271117970000).
 */
interface Props {
    announcements: any[];
    portalToken?: string;
    onAcknowledged: (announcementId: string, resposta: RespostaDoComunicado) => void;
}

const VOTOS = ['sim', 'nao', 'abstencao'] as const;
type Voto = typeof VOTOS[number];

const ICONE_DO_VOTO: Record<Voto, React.ReactNode> = {
    sim: <ThumbsUp className="w-4 h-4" />,
    nao: <ThumbsDown className="w-4 h-4" />,
    abstencao: <Minus className="w-4 h-4" />,
};

const dataLonga = (valor?: string | null) =>
    parseDate(valor)?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) ?? null;

const PortalAnnouncements: React.FC<Props> = ({ announcements, portalToken, onAcknowledged }) => {
    const [enviando, setEnviando] = React.useState<string | null>(null);
    const [escolha, setEscolha] = React.useState<{ id: string; voto: Voto } | null>(null);
    // Erro POR comunicado: responder um não apaga o aviso de outro (17/11, visto na conferência).
    const [erros, setErros] = React.useState<Record<string, string>>({});

    const limparErro = (id: string) => setErros(prev => {
        if (!(id in prev)) return prev;
        const resto = { ...prev };
        delete resto[id];
        return resto;
    });

    const pendentes = announcements.filter(a => !a.acknowledged && (a.requires_acknowledgment || a.type === 'votacao')).length;

    const responder = async (id: string, voto?: Voto) => {
        if (!portalToken) return;
        setEnviando(id);
        limparErro(id);
        try {
            const resposta = await investorPortalTokenService.acknowledgeByToken(portalToken, id, voto);
            setEscolha(e => (e && e.id === id ? null : e));
            onAcknowledged(id, resposta);
        } catch (e) {
            console.error('Erro ao responder comunicado', e);
            const texto = e instanceof RespostaRecusadaError
                ? e.message
                : 'Não foi possível enviar agora. Tente novamente em instantes.';
            setErros(prev => ({ ...prev, [id]: texto }));
        } finally {
            setEnviando(atual => (atual === id ? null : atual));
        }
    };

    return (
        <PortalCard className="overflow-hidden">
            <CardHeader
                title="Comunicados"
                subtitle={announcements.length > 0 ? `${announcements.length} publicado${announcements.length === 1 ? '' : 's'}` : undefined}
                right={pendentes > 0 ? <StatusPill tone="accent">{pendentes} aguardando sua resposta</StatusPill> : undefined}
            />

            {announcements.length === 0 ? (
                <PortalEmpty
                    icon={<Bell className="w-9 h-9" />}
                    title="Nenhum comunicado publicado"
                    subtitle="Avisos de assembleia, distribuição e andamento aparecem aqui."
                />
            ) : (
                <div className="divide-y divide-[#F4F4F6] border-t border-[#ECECEF]">
                    {announcements.map((a: any) => {
                        const ehVotacao = a.type === 'votacao';
                        const ocupado = enviando === a.id;
                        const escolhido = escolha && escolha.id === a.id ? escolha.voto : null;
                        const respondidoEm = dataLonga(a.acknowledged_at);
                        return (
                            <div key={a.id} className="px-5 py-4">
                                {/* Celular: situação/botão ABAIXO do texto — ao lado, espremiam título e data (17/11). */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {a.type && (
                                                <StatusPill tone="info">
                                                    {ANNOUNCEMENT_TYPE_LABELS[a.type as AnnouncementType] ?? a.type}
                                                </StatusPill>
                                            )}
                                            {/* parseDate: data pura (YYYY-MM-DD) é lida como UTC pelo
                                                `new Date` e volta um dia no fuso -03. */}
                                            {dataLonga(a.published_at) && (
                                                <span className="text-[12px] text-gray-400">{dataLonga(a.published_at)}</span>
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold text-[#1F2430]">{a.title}</p>
                                        <p className="text-[13px] text-[#8A8F9A] mt-1 leading-relaxed whitespace-pre-line">{a.body}</p>
                                    </div>
                                    {a.acknowledged ? (
                                        <div className="shrink-0 sm:text-right">
                                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1F7A3D]">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {a.vote_option ? `Seu voto: ${VOTE_LABELS[a.vote_option] ?? a.vote_option}` : 'Confirmado'}
                                            </span>
                                            {respondidoEm && <p className="text-[12px] text-gray-400 mt-0.5">em {respondidoEm}</p>}
                                        </div>
                                    ) : !ehVotacao && a.requires_acknowledgment && portalToken ? (
                                        <PrimaryButton className="shrink-0 self-start" disabled={ocupado} onClick={() => responder(a.id)}>
                                            <CheckCircle2 className="w-4 h-4" />
                                            {ocupado ? 'Confirmando...' : 'Confirmar'}
                                        </PrimaryButton>
                                    ) : null}
                                </div>

                                {ehVotacao && !a.acknowledged && portalToken && (
                                    escolhido ? (
                                        <div className="mt-3 rounded-[8px] bg-[#F7F7F9] px-3 py-3">
                                            <p className="text-[13px] text-[#1F2430]">
                                                Confirmar o voto <span className="font-semibold">{VOTE_LABELS[escolhido]}</span>?
                                                {' '}Depois de enviado, o voto não pode ser mudado.
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <PrimaryButton disabled={ocupado} onClick={() => responder(a.id, escolhido)}>
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    {ocupado ? 'Enviando...' : 'Confirmar voto'}
                                                </PrimaryButton>
                                                <GhostButton disabled={ocupado} onClick={() => setEscolha(null)}>Voltar</GhostButton>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="text-[13px] text-[#8A8F9A] mr-1">Seu voto:</span>
                                            {VOTOS.map(v => (
                                                <SoftButton key={v} onClick={() => { limparErro(a.id); setEscolha({ id: a.id, voto: v }); }}>
                                                    {ICONE_DO_VOTO[v]}
                                                    {VOTE_LABELS[v]}
                                                </SoftButton>
                                            ))}
                                        </div>
                                    )
                                )}

                                {erros[a.id] && (
                                    <div role="alert" className="mt-3 px-3 py-2 rounded-[8px] bg-[#FDEDE8] text-[13px] text-[#C24428]">
                                        {erros[a.id]}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </PortalCard>
    );
};

export default PortalAnnouncements;
