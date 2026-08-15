import React from 'react';
import { Building2, ChevronDown, ExternalLink, MapPin } from 'lucide-react';
import { HoldingItem } from '../types';
import {
    CardHeader, DetailField, fmtBRL, fmtBRLCents, PortalCard, PortalEmpty,
    PrimaryButton, StatusPill, TagChip, Td, Th, PillTone,
} from './PortalKit';

interface Props {
    holdings: HoldingItem[];
    filterStatus: string;
    onFilterChange: (status: string) => void;
    onSelectAsset: (h: HoldingItem) => void;
}

const STATUS_FILTERS = ['Todos', 'Em Execução', 'Lançamento', 'Concluída'];

const tone = (status: string): PillTone => {
    const s = status.toLowerCase();
    if (s.includes('conclu')) return 'good';
    if (s.includes('lança') || s.includes('lanca')) return 'info';
    if (s.includes('parad') || s.includes('atras')) return 'accent';
    return 'neutral';
};

const PortalHoldings: React.FC<Props> = ({ holdings, filterStatus, onFilterChange, onSelectAsset }) => {
    const [expanded, setExpanded] = React.useState<string | null>(null);

    const totalEquity = holdings.reduce((s, h) => s + (Number(h.equity) || 0), 0);
    const totalInvested = holdings.reduce((s, h) => s + (h.invested ?? 0), 0);

    return (
        <div className="space-y-3">
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Minha carteira"
                    subtitle={`${holdings.length} participa${holdings.length === 1 ? 'ção' : 'ções'} · ${fmtBRL(totalEquity)} em patrimônio`}
                    right={
                        <div className="hidden md:flex items-center gap-1 bg-[#F6F6F8] p-1 rounded-[8px]">
                            {STATUS_FILTERS.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onFilterChange(s)}
                                    className={`px-3 h-7 rounded-[6px] text-[12px] whitespace-nowrap transition-all ${
                                        filterStatus === s
                                            ? 'bg-white text-[#C24428] font-semibold shadow-sm'
                                            : 'text-[#8A8F9A] hover:text-[#1F2430]'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    }
                />

                {/* Filtro no mobile — rola horizontalmente sob o título */}
                <div className="md:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto scrollbar-hide">
                    {STATUS_FILTERS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onFilterChange(s)}
                            className={`px-3 h-7 rounded-[6px] text-[12px] whitespace-nowrap transition-all ${
                                filterStatus === s
                                    ? 'bg-[#FDEDE8] text-[#C24428] font-semibold'
                                    : 'bg-[#F6F6F8] text-[#8A8F9A]'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                {/* Desktop — tabela */}
                <div className="hidden md:block overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[860px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Empreendimento</Th>
                                <Th>Cota</Th>
                                <Th>Aportado</Th>
                                <Th>Patrimônio</Th>
                                <Th>Retorno</Th>
                                <Th>Status</Th>
                                <Th>Progresso</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {holdings.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <PortalEmpty
                                            icon={<Building2 className="w-9 h-9" />}
                                            title="Nenhuma participação nesse filtro"
                                            subtitle="Troque o filtro de status para ver os demais empreendimentos."
                                        />
                                    </td>
                                </tr>
                            ) : holdings.map((h, i) => {
                                const key = h.id ?? `h-${i}`;
                                const isOpen = expanded === key;
                                return (
                                    <React.Fragment key={key}>
                                        <tr
                                            className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#FDF8F6]' : 'hover:bg-gray-50/70'}`}
                                            onClick={() => setExpanded(isOpen ? null : key)}
                                        >
                                            <Td className="text-[#1F2430] font-medium">
                                                <span className="inline-flex items-center gap-2">
                                                    <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate">{h.name}</span>
                                                        {h.location && <span className="block text-[12px] text-[#A0A4AD] font-normal truncate">{h.location}</span>}
                                                    </span>
                                                </span>
                                            </Td>
                                            <Td><TagChip>{h.cota}</TagChip></Td>
                                            <Td className="tabular-nums">{h.invested ? fmtBRL(h.invested) : '—'}</Td>
                                            <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRL(Number(h.equity) || 0)}</Td>
                                            <Td className={`tabular-nums ${(h.yoc ?? 0) > 0 ? 'text-emerald-600' : 'text-[#8A8F9A]'}`}>{h.yield ?? '—'}</Td>
                                            <Td><StatusPill tone={tone(h.status)}>{h.status}</StatusPill></Td>
                                            <Td>
                                                <div className="flex items-center gap-2 min-w-[120px]">
                                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-[#E1553C] rounded-full" style={{ width: `${Math.min(100, h.progress ?? 0)}%` }} />
                                                    </div>
                                                    <span className="text-[12px] text-[#8A8F9A] tabular-nums w-9 text-right">{h.progress ?? 0}%</span>
                                                </div>
                                            </Td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                                                <Td colSpan={7} className="pb-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                                        <DetailField label="Localização">{h.location || '—'}</DetailField>
                                                        <DetailField label="Participação">{h.cota}</DetailField>
                                                        <DetailField label="Capital aportado">{h.invested ? fmtBRLCents(h.invested) : '—'}</DetailField>
                                                        <DetailField label="Patrimônio estimado">{fmtBRLCents(Number(h.equity) || 0)}</DetailField>
                                                        <DetailField label="Retorno realizado">{h.yield ?? '—'}</DetailField>
                                                        <DetailField label="Andamento da obra">{`${h.progress ?? 0}%`}</DetailField>
                                                    </div>
                                                    <div className="mt-4">
                                                        <PrimaryButton onClick={() => onSelectAsset(h)}>
                                                            <ExternalLink className="w-4 h-4" />
                                                            Ver empreendimento
                                                        </PrimaryButton>
                                                    </div>
                                                </Td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        {holdings.length > 0 && (
                            <tfoot>
                                <tr className="border-t border-[#ECECEF] bg-[#FAFAFB]">
                                    <Td className="text-[#8A8F9A]">Total</Td>
                                    <Td />
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRL(totalInvested)}</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRL(totalEquity)}</Td>
                                    <Td colSpan={3} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Mobile — cartões */}
                <div className="md:hidden border-t border-[#ECECEF] divide-y divide-[#F4F4F6]">
                    {holdings.length === 0 ? (
                        <PortalEmpty icon={<Building2 className="w-9 h-9" />} title="Nenhuma participação nesse filtro" />
                    ) : holdings.map((h, i) => (
                        <button
                            key={h.id ?? `m-${i}`}
                            type="button"
                            onClick={() => onSelectAsset(h)}
                            className="w-full text-left px-4 py-3.5 active:bg-gray-50"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#1F2430] truncate">{h.name}</p>
                                    {h.location && (
                                        <p className="flex items-center gap-1 text-[12px] text-[#A0A4AD] mt-0.5 truncate">
                                            <MapPin className="w-3 h-3 shrink-0" />{h.location}
                                        </p>
                                    )}
                                </div>
                                <TagChip>{h.cota}</TagChip>
                            </div>
                            <div className="flex items-center justify-between gap-3 mt-3">
                                <span className="text-sm font-semibold text-[#1F2430] tabular-nums">{fmtBRL(Number(h.equity) || 0)}</span>
                                <StatusPill tone={tone(h.status)}>{h.status}</StatusPill>
                            </div>
                            <div className="flex items-center gap-2 mt-2.5">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#E1553C] rounded-full" style={{ width: `${Math.min(100, h.progress ?? 0)}%` }} />
                                </div>
                                <span className="text-[12px] text-[#8A8F9A] tabular-nums">{h.progress ?? 0}%</span>
                            </div>
                        </button>
                    ))}
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalHoldings;
