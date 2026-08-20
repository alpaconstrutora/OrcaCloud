import React from 'react';
import { ChevronDown, Gavel, Handshake } from 'lucide-react';
import { PurchaseOrder } from '../../../types';
import {
    CardHeader, DetailField, fmtBRL, fmtBRLCents, fmtDate, PortalCard, PortalEmpty,
    PortalLoading, PrimaryButton, StatusPill, Td, Th,
} from '../../portal/PortalKit';
import { ORDER_TONE, isNegotiating, orderTotal } from './status';

interface Props {
    orders: PurchaseOrder[];
    loading: boolean;
    onNegotiate: (orderId: string) => void;
}

/**
 * Lances = pedidos que ainda estão em mesa (`Enviado` / `Em Negociação`).
 *
 * ⚠️ A versão anterior desta aba listava um array fixo de exemplo ("Cimento
 * CP-II", "Edifício Horizon") — dado falso, exibido ao fornecedor real no link
 * público. Aqui a lista vem dos pedidos de verdade, com estado vazio honesto.
 */
const PortalNegotiations: React.FC<Props> = ({ orders, loading, onNegotiate }) => {
    const [expanded, setExpanded] = React.useState<string | null>(null);

    const rows = React.useMemo(
        () => orders.filter(isNegotiating).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
        [orders],
    );

    const emJogo = rows.reduce((s, o) => s + orderTotal(o), 0);

    return (
        <div className="space-y-3">
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Oportunidades de venda"
                    subtitle={rows.length > 0
                        ? `${rows.length} negociaç${rows.length === 1 ? 'ão' : 'ões'} em aberto · ${fmtBRL(emJogo)} em jogo`
                        : undefined}
                />

                {loading ? (
                    <div className="border-t border-[#ECECEF]"><PortalLoading label="Carregando negociações..." /></div>
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[780px]">
                                <thead>
                                    <tr className="border-b border-[#ECECEF]">
                                        <Th>Pedido</Th>
                                        <Th>Obra</Th>
                                        <Th>Itens</Th>
                                        <Th>Entrega</Th>
                                        <Th>Valor proposto</Th>
                                        <Th>Status</Th>
                                        <Th className="text-right">Ação</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F4F4F6]">
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <PortalEmpty
                                                    icon={<Handshake className="w-9 h-9" />}
                                                    title="Nenhuma negociação em aberto"
                                                    subtitle="Quando a construtora enviar um pedido para negociação, ele aparece aqui."
                                                />
                                            </td>
                                        </tr>
                                    ) : rows.map(o => {
                                        const isOpen = expanded === o.id;
                                        return (
                                            <React.Fragment key={o.id}>
                                                <tr
                                                    className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#FDF8F6]' : 'hover:bg-gray-50/70'}`}
                                                    onClick={() => setExpanded(isOpen ? null : o.id)}
                                                >
                                                    <Td className="text-[#1F2430] font-medium whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-2">
                                                            <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                                                            {o.number || o.id.slice(0, 8)}
                                                        </span>
                                                    </Td>
                                                    <Td className="text-[#4A505C]">{o.projectName || '—'}</Td>
                                                    <Td className="text-[#8A8F9A] tabular-nums">{o.items?.length || 0}</Td>
                                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(o.deliveryDate)}</Td>
                                                    <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRL(orderTotal(o))}</Td>
                                                    <Td><StatusPill tone={ORDER_TONE[o.status] ?? 'muted'}>{o.status}</StatusPill></Td>
                                                    <Td className="text-right">
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); onNegotiate(o.id); }}
                                                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#C24428] hover:text-[#E1553C] transition-colors"
                                                        >
                                                            <Gavel className="w-3.5 h-3.5" />
                                                            Negociar
                                                        </button>
                                                    </Td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                                                        <Td colSpan={7} className="pb-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                                                <DetailField label="Valor proposto">{fmtBRLCents(orderTotal(o))}</DetailField>
                                                                <DetailField label="Entrega prevista">{fmtDate(o.deliveryDate)}</DetailField>
                                                                <DetailField label="Forma de entrega">{o.deliveryMethod || '—'}</DetailField>
                                                                <DetailField label="Local de entrega">{o.deliveryLocation || 'Canteiro'}</DetailField>
                                                                <DetailField label="Pagamento">{o.paymentMethod || 'A definir'}</DetailField>
                                                                <DetailField label="Condição">
                                                                    {o.paymentTermType === 'Parcelado'
                                                                        ? `${o.paymentInstallments || 1}x`
                                                                        : o.paymentDays ? `${o.paymentDays} dias` : 'À vista'}
                                                                </DetailField>
                                                            </div>
                                                            <div className="mt-4">
                                                                <PrimaryButton onClick={() => onNegotiate(o.id)}>
                                                                    <Gavel className="w-4 h-4" />
                                                                    Abrir negociação
                                                                </PrimaryButton>
                                                            </div>
                                                        </Td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="md:hidden border-t border-[#ECECEF] divide-y divide-[#F4F4F6]">
                            {rows.length === 0 ? (
                                <PortalEmpty icon={<Handshake className="w-9 h-9" />} title="Nenhuma negociação em aberto" />
                            ) : rows.map(o => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => onNegotiate(o.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-gray-50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[#1F2430] truncate">{o.number || o.id.slice(0, 8)}</p>
                                            <p className="text-[12px] text-[#A0A4AD] mt-0.5 truncate">{o.projectName || 'Obra não informada'}</p>
                                        </div>
                                        <StatusPill tone={ORDER_TONE[o.status] ?? 'muted'}>{o.status}</StatusPill>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-3">
                                        <span className="text-sm font-semibold text-[#1F2430] tabular-nums">{fmtBRL(orderTotal(o))}</span>
                                        <span className="text-[13px] font-semibold text-[#C24428]">Negociar</span>
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

export default PortalNegotiations;
