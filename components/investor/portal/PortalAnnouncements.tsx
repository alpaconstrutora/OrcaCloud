import React from 'react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import { CardHeader, parseDate, PortalCard, PortalEmpty, PrimaryButton, StatusPill } from './PortalKit';

interface Props {
    announcements: any[];
    portalToken?: string;
    onAcknowledged: (announcementId: string) => void;
}

const PortalAnnouncements: React.FC<Props> = ({ announcements, portalToken, onAcknowledged }) => {
    const [enviando, setEnviando] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    const pendentes = announcements.filter(a => !a.acknowledged && a.requires_acknowledgment).length;

    const confirmar = async (id: string) => {
        if (!portalToken) return;
        setEnviando(id);
        setErro(null);
        try {
            await investorPortalTokenService.acknowledgeByToken(portalToken, id);
            onAcknowledged(id);
        } catch (e) {
            console.error('Erro ao confirmar leitura', e);
            setErro('Não foi possível confirmar agora. Tente novamente em instantes.');
        } finally {
            setEnviando(null);
        }
    };

    return (
        <PortalCard className="overflow-hidden">
            <CardHeader
                title="Comunicados"
                subtitle={announcements.length > 0 ? `${announcements.length} publicado${announcements.length === 1 ? '' : 's'}` : undefined}
                right={pendentes > 0 ? <StatusPill tone="accent">{pendentes} aguardando confirmação</StatusPill> : undefined}
            />

            {erro && (
                <div className="mx-5 mb-3 px-3 py-2 rounded-[8px] bg-[#FDEDE8] text-[13px] text-[#C24428]">{erro}</div>
            )}

            {announcements.length === 0 ? (
                <PortalEmpty
                    icon={<Bell className="w-9 h-9" />}
                    title="Nenhum comunicado publicado"
                    subtitle="Avisos de assembleia, distribuição e andamento aparecem aqui."
                />
            ) : (
                <div className="divide-y divide-[#F4F4F6] border-t border-[#ECECEF]">
                    {announcements.map((a: any) => (
                        <div key={a.id} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        {a.type && <StatusPill tone="info">{a.type}</StatusPill>}
                                        {/* parseDate: data pura (YYYY-MM-DD) é lida como UTC pelo
                                            `new Date` e volta um dia no fuso -03. */}
                                        {parseDate(a.published_at) && (
                                            <span className="text-[12px] text-gray-400">
                                                {parseDate(a.published_at)!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-[#1F2430]">{a.title}</p>
                                    <p className="text-[13px] text-[#8A8F9A] mt-1 leading-relaxed whitespace-pre-line">{a.body}</p>
                                </div>
                                {a.acknowledged ? (
                                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1F7A3D] shrink-0">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Confirmado
                                    </span>
                                ) : a.requires_acknowledgment && portalToken ? (
                                    <PrimaryButton className="shrink-0" disabled={enviando === a.id} onClick={() => confirmar(a.id)}>
                                        <CheckCircle2 className="w-4 h-4" />
                                        {enviando === a.id ? 'Confirmando...' : 'Confirmar'}
                                    </PrimaryButton>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </PortalCard>
    );
};

export default PortalAnnouncements;
