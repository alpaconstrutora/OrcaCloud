import React from 'react';
import { ChevronRight, Clock, Search, Send } from 'lucide-react';
import { QuotationRequest } from '../../../types';
import { usePersistedState } from '../../ui/TableUtils';
import {
    CardHeader, fmtDate, parseDate, PortalCard, PortalEmpty,
    PortalLoading, StatusPill, Td, Th,
} from '../../portal/PortalKit';
import { QUOTATION_TONE } from './status';

interface Props {
    quotations: QuotationRequest[];
    loading: boolean;
    onRespond: (id: string) => void;
}

/** Dias até o prazo — negativo = vencido. `parseDate` evita o pulo de fuso. */
const daysLeft = (deadline?: string) => {
    const d = parseDate(deadline);
    if (!d) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
};

const PortalQuotations: React.FC<Props> = ({ quotations, loading, onRespond }) => {
    // §3 — busca persistida.
    const [search, setSearch] = usePersistedState<string>('supplierPortal:searchQuotations', '');

    const rows = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return quotations
            .filter(r => !q
                || r.number.toLowerCase().includes(q)
                || r.title.toLowerCase().includes(q)
                || (r.projectName || '').toLowerCase().includes(q))
            .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
    }, [quotations, search]);

    const abertas = rows.filter(r => r.status === 'Aberta').length;

    return (
        <div className="space-y-3">
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Solicitações de cotação"
                    subtitle={`${rows.length} solicitaç${rows.length === 1 ? 'ão' : 'ões'} · ${abertas} aguardando resposta`}
                    right={
                        <div className="relative hidden md:block">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A4AD]" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar cotação"
                                className="h-8 w-52 pl-8 pr-3 rounded-[8px] border border-[#ECECEF] bg-white text-[13px] text-[#1F2430] placeholder:text-[#A0A4AD] outline-none focus:border-[#E1553C] transition-colors"
                            />
                        </div>
                    }
                />

                <div className="md:hidden px-4 pb-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A4AD]" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar cotação"
                            className="h-9 w-full pl-8 pr-3 rounded-[8px] border border-[#ECECEF] bg-white text-[13px] outline-none focus:border-[#E1553C]"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="border-t border-[#ECECEF]"><PortalLoading label="Carregando cotações..." /></div>
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[820px]">
                                <thead>
                                    <tr className="border-b border-[#ECECEF]">
                                        <Th>RFQ</Th>
                                        <Th>Título</Th>
                                        <Th>Obra</Th>
                                        <Th>Prazo</Th>
                                        <Th>Itens</Th>
                                        <Th>Status</Th>
                                        <Th className="text-right">Ação</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F4F4F6]">
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <PortalEmpty
                                                    icon={<Clock className="w-9 h-9" />}
                                                    title="Nenhuma cotação no momento"
                                                    subtitle="As solicitações de orçamento da construtora aparecem aqui."
                                                />
                                            </td>
                                        </tr>
                                    ) : rows.map(r => {
                                        const dias = daysLeft(r.deadline);
                                        return (
                                            <tr
                                                key={r.id}
                                                className="cursor-pointer transition-colors hover:bg-gray-50/70"
                                                onClick={() => onRespond(r.id)}
                                            >
                                                <Td className="text-[#1F2430] font-medium whitespace-nowrap">{r.number}</Td>
                                                <Td className="text-[#4A505C]">{r.title}</Td>
                                                <Td className="text-[#8A8F9A]">{r.projectName || '—'}</Td>
                                                <Td className="whitespace-nowrap">
                                                    <span className={dias != null && dias < 0 ? 'text-[#C24428]' : 'text-[#4A505C]'}>
                                                        {fmtDate(r.deadline)}
                                                    </span>
                                                    {dias != null && (
                                                        <span className="block text-[12px] text-[#A0A4AD]">
                                                            {dias < 0 ? 'prazo encerrado' : dias === 0 ? 'vence hoje' : `em ${dias} dia${dias === 1 ? '' : 's'}`}
                                                        </span>
                                                    )}
                                                </Td>
                                                <Td className="text-[#8A8F9A] tabular-nums">{r.items.length}</Td>
                                                <Td><StatusPill tone={QUOTATION_TONE[r.status] ?? 'muted'}>{r.status}</StatusPill></Td>
                                                <Td className="text-right">
                                                    <span className="inline-flex items-center justify-end gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); onRespond(r.id); }}
                                                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#C24428] hover:text-[#E1553C] transition-colors"
                                                        >
                                                            <Send className="w-3.5 h-3.5" />
                                                            Responder
                                                        </button>
                                                        <ChevronRight className="w-3.5 h-3.5 text-[#D5D7DC]" aria-hidden />
                                                    </span>
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="md:hidden border-t border-[#ECECEF] divide-y divide-[#F4F4F6]">
                            {rows.length === 0 ? (
                                <PortalEmpty icon={<Clock className="w-9 h-9" />} title="Nenhuma cotação no momento" />
                            ) : rows.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => onRespond(r.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-gray-50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[#1F2430] truncate">{r.title}</p>
                                            <p className="text-[12px] text-[#A0A4AD] mt-0.5 truncate">{r.number} · {r.projectName || 'Obra não informada'}</p>
                                        </div>
                                        <StatusPill tone={QUOTATION_TONE[r.status] ?? 'muted'}>{r.status}</StatusPill>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-3">
                                        <span className="text-[12px] text-[#8A8F9A]">Prazo {fmtDate(r.deadline)}</span>
                                        <span className="text-[13px] font-semibold text-[#C24428]">Responder</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </PortalCard>
        </div>
    );
};

export default PortalQuotations;
