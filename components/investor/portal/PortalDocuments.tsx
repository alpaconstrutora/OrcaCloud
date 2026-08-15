import React from 'react';
import { Bell, CheckCircle2, Download, FileText } from 'lucide-react';
import { InvestorReport, REPORT_CATEGORY_LABELS, ReportCategory } from '../../../services/investorPortalService';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import {
    fmtDate, PortalCard, PortalEmpty, PortalTabs, PrimaryButton, StatusPill, TagChip, Td, Th,
} from './PortalKit';

interface Props {
    reports: InvestorReport[];
    announcements: any[];
    portalToken?: string;
    onAcknowledged: (announcementId: string) => void;
}

const fmtReportDate = (value?: string) => {
    if (!value) return '—';
    // `report_date` é gravado como texto pt-BR pelo upload antigo — nesse caso
    // devolve como veio; só formata quando é ISO de verdade.
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? fmtDate(value) : value;
};

const PortalDocuments: React.FC<Props> = ({ reports, announcements, portalToken, onAcknowledged }) => {
    const [tab, setTab] = React.useState('documentos');
    const [ackSending, setAckSending] = React.useState<string | null>(null);

    const unread = announcements.filter(a => !a.acknowledged && a.requires_acknowledgment).length;

    const acknowledge = async (id: string) => {
        if (!portalToken) return;
        setAckSending(id);
        try {
            await investorPortalTokenService.acknowledgeByToken(portalToken, id);
            onAcknowledged(id);
        } catch (e) {
            console.error('Erro ao confirmar leitura', e);
        } finally {
            setAckSending(null);
        }
    };

    return (
        <PortalCard className="overflow-hidden">
            <PortalTabs
                tabs={[
                    { id: 'documentos', label: 'Documentos', count: reports.length },
                    { id: 'comunicados', label: 'Comunicados', count: announcements.length },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'documentos' && (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Data</Th>
                                <Th>Documento</Th>
                                <Th>Categoria</Th>
                                <Th>Formato</Th>
                                <Th className="text-right">Ação</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <PortalEmpty
                                            icon={<FileText className="w-9 h-9" />}
                                            title="Nenhum documento disponível"
                                            subtitle="Relatórios, contratos e prestações de contas aparecem aqui."
                                        />
                                    </td>
                                </tr>
                            ) : reports.map((r, i) => (
                                <tr key={r.id ?? `rep-${i}`} className="hover:bg-gray-50/70 transition-colors">
                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtReportDate(r.report_date ?? r.created_at)}</Td>
                                    <Td className="text-[#1F2430] font-medium">{r.name}</Td>
                                    <Td>{r.category ? <TagChip>{REPORT_CATEGORY_LABELS[r.category as ReportCategory] ?? r.category}</TagChip> : '—'}</Td>
                                    <Td className="text-[#8A8F9A]">{r.type || '—'}</Td>
                                    <Td className="text-right">
                                        {r.url ? (
                                            <button
                                                type="button"
                                                onClick={() => window.open(r.url, '_blank', 'noopener')}
                                                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#C24428] hover:text-[#E1553C] transition-colors"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Baixar
                                            </button>
                                        ) : <span className="text-[13px] text-gray-300">Indisponível</span>}
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'comunicados' && (
                <div>
                    {unread > 0 && (
                        <div className="px-5 pt-4">
                            <StatusPill tone="accent">{unread} aguardando confirmação</StatusPill>
                        </div>
                    )}
                    {announcements.length === 0 ? (
                        <PortalEmpty icon={<Bell className="w-9 h-9" />} title="Nenhum comunicado publicado" />
                    ) : (
                        <div className="divide-y divide-[#F4F4F6]">
                            {announcements.map((a: any) => (
                                <div key={a.id} className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                {a.type && <StatusPill tone="info">{a.type}</StatusPill>}
                                                {a.published_at && (
                                                    <span className="text-[12px] text-gray-400">
                                                        {new Date(a.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
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
                                            <PrimaryButton
                                                className="shrink-0"
                                                disabled={ackSending === a.id}
                                                onClick={() => acknowledge(a.id)}
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {ackSending === a.id ? 'Confirmando...' : 'Confirmar'}
                                            </PrimaryButton>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </PortalCard>
    );
};

export default PortalDocuments;
