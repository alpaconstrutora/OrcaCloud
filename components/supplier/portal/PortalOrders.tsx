import React from 'react';
import { ChevronDown, FileCheck, FileText, Package, Search, Truck } from 'lucide-react';
import { Invoice, PurchaseOrder } from '../../../types';
import { usePersistedState } from '../../ui/TableUtils';
import {
    CardHeader, DetailField, fmtBRL, fmtBRLCents, fmtDate, PortalCard, PortalEmpty,
    PortalLoading, PrimaryButton, SoftButton, StatusPill, Td, Th,
} from '../../portal/PortalKit';
import { ORDER_TONE, isOpenOrder, orderTotal } from './status';

interface Props {
    orders: PurchaseOrder[];
    invoices: Invoice[];
    loading: boolean;
    onOpenOrder: (id: string, mode: 'details' | 'logistics') => void;
}

const FILTERS = ['Todos', 'Em aberto', 'Em trânsito', 'Concluídos'] as const;
type Filter = typeof FILTERS[number];

const matchesFilter = (o: PurchaseOrder, f: Filter) => {
    if (f === 'Todos') return true;
    if (f === 'Em trânsito') return ['Separação', 'Em Trânsito'].includes(o.status);
    if (f === 'Concluídos') return ['Entregue', 'Recebido'].includes(o.status);
    return isOpenOrder(o) && !['Separação', 'Em Trânsito', 'Entregue'].includes(o.status);
};

const pagamento = (o: PurchaseOrder) => {
    const forma = o.paymentMethod || 'A definir';
    const prazo = o.paymentTermType === 'Parcelado'
        ? `${o.paymentInstallments || 1}x`
        : o.paymentDays ? `${o.paymentDays} dias` : 'À vista';
    return `${forma} · ${prazo}`;
};

const PortalOrders: React.FC<Props> = ({ orders, invoices, loading, onOpenOrder }) => {
    // §3 — busca persistida, chave própria da tela do portal.
    const [search, setSearch] = usePersistedState<string>('supplierPortal:searchOrders', '');
    const [filter, setFilter] = usePersistedState<Filter>('supplierPortal:filterOrders', 'Todos');
    const [expanded, setExpanded] = React.useState<string | null>(null);

    const invoiceByOrder = React.useMemo(() => {
        const map = new Map<string, Invoice>();
        invoices.forEach(i => { if (i.orderId) map.set(i.orderId, i); });
        return map;
    }, [invoices]);

    const rows = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders
            .filter(o => matchesFilter(o, filter))
            .filter(o => !q
                || (o.number || o.id).toLowerCase().includes(q)
                || (o.projectName || '').toLowerCase().includes(q))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }, [orders, search, filter]);

    const totalAberto = rows.filter(isOpenOrder).reduce((s, o) => s + orderTotal(o), 0);

    return (
        <div className="space-y-3">
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Meus pedidos"
                    subtitle={`${rows.length} pedido${rows.length === 1 ? '' : 's'} · ${fmtBRL(totalAberto)} em aberto`}
                    right={
                        <div className="hidden md:flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A4AD]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar pedido ou obra"
                                    className="h-8 w-52 pl-8 pr-3 rounded-[8px] border border-[#ECECEF] bg-white text-[13px] text-[#1F2430] placeholder:text-[#A0A4AD] outline-none focus:border-[#E1553C] transition-colors"
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-[#F6F6F8] p-1 rounded-[8px]">
                                {FILTERS.map(f => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFilter(f)}
                                        className={`px-3 h-7 rounded-[6px] text-[12px] whitespace-nowrap transition-all ${
                                            filter === f
                                                ? 'bg-white text-[#C24428] font-semibold shadow-sm'
                                                : 'text-[#8A8F9A] hover:text-[#1F2430]'
                                        }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    }
                />

                {/* Mobile — busca + filtros rolando sob o título */}
                <div className="md:hidden px-4 pb-3 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A4AD]" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar pedido ou obra"
                            className="h-9 w-full pl-8 pr-3 rounded-[8px] border border-[#ECECEF] bg-white text-[13px] outline-none focus:border-[#E1553C]"
                        />
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                        {FILTERS.map(f => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                className={`px-3 h-7 rounded-[6px] text-[12px] whitespace-nowrap transition-all ${
                                    filter === f ? 'bg-[#FDEDE8] text-[#C24428] font-semibold' : 'bg-[#F6F6F8] text-[#8A8F9A]'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="border-t border-[#ECECEF]"><PortalLoading label="Carregando pedidos..." /></div>
                ) : (
                    <>
                        {/* Desktop — tabela */}
                        <div className="hidden md:block overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[880px]">
                                <thead>
                                    <tr className="border-b border-[#ECECEF]">
                                        <Th>Pedido</Th>
                                        <Th>Data</Th>
                                        <Th>Obra</Th>
                                        <Th>Itens</Th>
                                        <Th>Pagamento</Th>
                                        <Th>Valor</Th>
                                        <Th>Status</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F4F4F6]">
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <PortalEmpty
                                                    icon={<Package className="w-9 h-9" />}
                                                    title="Nenhum pedido nesse filtro"
                                                    subtitle="Os pedidos enviados pela construtora aparecem aqui."
                                                />
                                            </td>
                                        </tr>
                                    ) : rows.map(o => {
                                        const isOpen = expanded === o.id;
                                        const nf = invoiceByOrder.get(o.id);
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
                                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(o.created_at)}</Td>
                                                    <Td className="text-[#4A505C]">{o.projectName || '—'}</Td>
                                                    <Td className="text-[#8A8F9A] tabular-nums">{o.items?.length || 0}</Td>
                                                    <Td className="text-[#8A8F9A]">{pagamento(o)}</Td>
                                                    <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRL(orderTotal(o))}</Td>
                                                    <Td>
                                                        <span className="inline-flex items-center gap-2">
                                                            <StatusPill tone={ORDER_TONE[o.status] ?? 'muted'}>{o.status}</StatusPill>
                                                            {nf && <FileCheck className="w-3.5 h-3.5 text-emerald-500" aria-label="Nota fiscal vinculada" />}
                                                        </span>
                                                    </Td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                                                        <Td colSpan={7} className="pb-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                                                <DetailField label="Entrega prevista">{fmtDate(o.deliveryDate)}</DetailField>
                                                                <DetailField label="Local de entrega">{o.deliveryLocation || 'Canteiro'}</DetailField>
                                                                <DetailField label="Forma de entrega">{o.deliveryMethod || '—'}</DetailField>
                                                                <DetailField label="Valor total">{fmtBRLCents(orderTotal(o))}</DetailField>
                                                                <DetailField label="Separação">{fmtDate(o.separationDate)}</DetailField>
                                                                <DetailField label="Saída">{fmtDate(o.shippedDate)}</DetailField>
                                                                <DetailField label="Entrega efetiva">{fmtDate(o.actualDeliveryDate)}</DetailField>
                                                                <DetailField label="Nota fiscal">{nf ? nf.fileName : 'Não enviada'}</DetailField>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 mt-4">
                                                                <PrimaryButton onClick={() => onOpenOrder(o.id, 'details')}>
                                                                    <FileText className="w-4 h-4" />
                                                                    Ver detalhes
                                                                </PrimaryButton>
                                                                <SoftButton onClick={() => onOpenOrder(o.id, 'logistics')}>
                                                                    <Truck className="w-4 h-4" />
                                                                    Logística do pedido
                                                                </SoftButton>
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

                        {/* Mobile — cartões */}
                        <div className="md:hidden border-t border-[#ECECEF] divide-y divide-[#F4F4F6]">
                            {rows.length === 0 ? (
                                <PortalEmpty icon={<Package className="w-9 h-9" />} title="Nenhum pedido nesse filtro" />
                            ) : rows.map(o => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => onOpenOrder(o.id, 'details')}
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
                                        <span className="text-[12px] text-[#8A8F9A]">
                                            {fmtDate(o.created_at)} · {o.items?.length || 0} {o.items?.length === 1 ? 'item' : 'itens'}
                                        </span>
                                        <span className="text-sm font-semibold text-[#1F2430] tabular-nums">{fmtBRL(orderTotal(o))}</span>
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

export default PortalOrders;
