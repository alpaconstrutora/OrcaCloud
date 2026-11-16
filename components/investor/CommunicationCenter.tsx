/**
 * Comunicados — LEITURA no app interno (usuário sem papel de gestor, com um investidor em contexto).
 *
 * Desde 16/11/2026 a gestão (criar, editar, publicar, excluir) mora em `AnnouncementsManager.tsx`;
 * aqui ficou só o leitor: publicados da organização, com aceite e voto. O investidor pelo link lê em
 * `portal/PortalAnnouncements.tsx` (vocabulário §24); esta tela é interna e segue o guia (§8: situação
 * em texto colorido, sem pílula).
 */
import React from 'react';
import { Bell, CheckCircle2, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import {
    announcementsService,
    InvestorAnnouncement,
    ANNOUNCEMENT_TYPE_LABELS,
    VOTE_LABELS,
} from '../../services/announcementsService';
import { isTableMissing } from './MigrationBanner';
import Button from '../ui/Button';

interface Props {
    organizationId: string;
    investorId?: string;
}

const CommunicationCenter: React.FC<Props> = ({ organizationId, investorId }) => {
    const [items, setItems] = React.useState<InvestorAnnouncement[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [ackPending, setAckPending] = React.useState<string | null>(null);

    React.useEffect(() => {
        setLoading(true);
        announcementsService.list(organizationId, investorId)
            .then(setItems)
            .catch(err => { if (!isTableMissing(err)) console.error('Error loading announcements', err); })
            .finally(() => setLoading(false));
    }, [organizationId, investorId]);

    const handleAck = async (item: InvestorAnnouncement, vote?: string) => {
        if (!investorId) return;
        setAckPending(item.id!);
        try {
            await announcementsService.acknowledge(item.id!, investorId, vote);
            setItems(prev => prev.map(a => a.id === item.id
                ? { ...a, user_acknowledged: true, user_vote: vote ?? null } : a));
        } catch (err) {
            console.error('Error acknowledging', err);
        } finally {
            setAckPending(null);
        }
    };

    const pendingAcks = items.filter(a => a.requires_acknowledgment && !a.user_acknowledged).length;

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum comunicado publicado</h3>
                <p className="text-sm text-gray-500">Avisos, assembleias e votações aparecem aqui quando forem publicados.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {pendingAcks > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-amber-700">
                    <Bell className="w-4 h-4" />
                    {pendingAcks} aguardando sua confirmação
                </p>
            )}
            {items.map(item => {
                const isExpanded = expanded === item.id;
                const needsAck = item.requires_acknowledgment && !item.user_acknowledged;
                const isVoting = item.type === 'votacao' && !item.user_acknowledged;

                return (
                    <div
                        key={item.id}
                        className={`bg-white rounded-[10px] border shadow-sm overflow-hidden ${needsAck ? 'border-amber-200' : 'border-gray-100'}`}
                    >
                        <button
                            type="button"
                            className="w-full p-5 text-left flex items-start gap-4 hover:bg-gray-50/50 transition-colors"
                            onClick={() => setExpanded(isExpanded ? null : item.id!)}
                            aria-expanded={isExpanded}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1 flex-wrap text-sm">
                                    <span className="text-gray-600">{ANNOUNCEMENT_TYPE_LABELS[item.type] ?? item.type}</span>
                                    {needsAck && <span className="text-amber-700">Confirmação pendente</span>}
                                    {item.user_acknowledged && (
                                        <span className="flex items-center gap-1 text-green-700">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
                                        </span>
                                    )}
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                                {item.published_at && (
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {new Date(item.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                )}
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 mt-1" />}
                        </button>

                        {isExpanded && (
                            <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-4">
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{item.body}</p>

                                {isVoting && (
                                    <div className="flex items-center gap-3 pt-2 flex-wrap">
                                        <p className="text-sm text-gray-600">Seu voto:</p>
                                        {(['sim', 'nao', 'abstencao'] as const).map(v => (
                                            <button
                                                key={v}
                                                type="button"
                                                disabled={ackPending === item.id}
                                                onClick={() => handleAck(item, v)}
                                                className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium transition-all disabled:opacity-60 ${
                                                    v === 'sim' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                    : v === 'nao' ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {v === 'sim' && <ThumbsUp className="w-3.5 h-3.5" />}
                                                {v === 'nao' && <ThumbsDown className="w-3.5 h-3.5" />}
                                                {v === 'abstencao' && <Minus className="w-3.5 h-3.5" />}
                                                {VOTE_LABELS[v]}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {item.user_vote && (
                                    <p className="text-sm text-gray-600">
                                        Seu voto: <span className="font-medium text-gray-900">{VOTE_LABELS[item.user_vote] ?? item.user_vote}</span>
                                    </p>
                                )}

                                {item.requires_acknowledgment && item.type !== 'votacao' && !item.user_acknowledged && (
                                    <Button
                                        disabled={ackPending === item.id}
                                        onClick={() => handleAck(item)}
                                        className="flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        {ackPending === item.id ? 'Confirmando...' : 'Confirmar leitura'}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default CommunicationCenter;
