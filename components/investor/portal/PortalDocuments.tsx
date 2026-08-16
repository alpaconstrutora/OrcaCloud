import React from 'react';
import { Download, FileText } from 'lucide-react';
import { InvestorReport, REPORT_CATEGORY_LABELS, ReportCategory } from '../../../services/investorPortalService';
import { CardHeader, fmtDate, PortalCard, PortalEmpty, TagChip, Td, Th } from './PortalKit';

interface Props {
    reports: InvestorReport[];
    /** Título do card — muda entre a aba Documentos e a aba Relatórios. */
    title?: string;
    subtitle?: string;
    /** Quando presente, mostra só documentos dessa categoria (aba Relatórios). */
    onlyCategory?: ReportCategory;
    emptyTitle?: string;
    emptySubtitle?: string;
}

const fmtReportDate = (value?: string) => {
    if (!value) return '—';
    // `report_date` é gravado como texto pt-BR pelo upload antigo — nesse caso
    // devolve como veio; só formata quando é ISO de verdade.
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? fmtDate(value) : value;
};

const PortalDocuments: React.FC<Props> = ({
    reports, title = 'Documentos', subtitle, onlyCategory,
    emptyTitle = 'Nenhum documento disponível',
    emptySubtitle = 'Relatórios, contratos e prestações de contas aparecem aqui.',
}) => {
    const linhas = onlyCategory ? reports.filter(r => r.category === onlyCategory) : reports;

    return (
        <PortalCard className="overflow-hidden">
            <CardHeader
                title={title}
                subtitle={subtitle ?? (linhas.length > 0 ? `${linhas.length} arquivo${linhas.length === 1 ? '' : 's'} disponível${linhas.length === 1 ? '' : 'eis'}` : undefined)}
            />
            <div className="overflow-x-auto border-t border-[#ECECEF]">
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
                        {linhas.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <PortalEmpty icon={<FileText className="w-9 h-9" />} title={emptyTitle} subtitle={emptySubtitle} />
                                </td>
                            </tr>
                        ) : linhas.map((r, i) => (
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
        </PortalCard>
    );
};

export default PortalDocuments;
