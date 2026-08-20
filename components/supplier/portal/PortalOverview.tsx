import React from 'react';
import { Clock, FileText, Package, Sparkles } from 'lucide-react';
import { Invoice, PurchaseOrder, QuotationRequest } from '../../../types';
import { SupplierAIInsight } from '../../../services/supplierAiService';
import {
    fmtBRL, fmtDate, KpiStrip, PortalCard, PortalEmpty, PortalTabs,
    SoftButton, StatusPill, Td, Th,
} from '../../portal/PortalKit';
import { INVOICE_STATUS, ORDER_TONE, QUOTATION_TONE, isNegotiating, isOpenOrder, orderTotal } from './status';

interface Props {
    orders: PurchaseOrder[];
    quotations: QuotationRequest[];
    invoices: Invoice[];
    insights: SupplierAIInsight[];
    loadingAI: boolean;
    onOpenOrder: (id: string, mode: 'details' | 'logistics') => void;
    onRespondQuotation: (id: string) => void;
    onNavigate: (tab: 'negotiations' | 'quotations' | 'orders' | 'documents') => void;
}

const RECENT = 6;

const PortalOverview: React.FC<Props> = ({
    orders, quotations, invoices, insights, loadingAI,
    onOpenOrder, onRespondQuotation, onNavigate,
}) => {
    const [tab, setTab] = React.useState('pedidos');

    const abertos = React.useMemo(() => orders.filter(isOpenOrder), [orders]);
    const emNegociacao = React.useMemo(() => orders.filter(isNegotiating), [orders]);
    const cotacoesAbertas = React.useMemo(() => quotations.filter(q => q.status === 'Aberta'), [quotations]);
    const faturado = React.useMemo(
        () => orders.filter(o => ['Confirmado', 'Entregue', 'Recebido'].includes(o.status)).reduce((s, o) => s + orderTotal(o), 0),
        [orders],
    );
    const ticket = orders.length > 0 ? orders.reduce((s, o) => s + orderTotal(o), 0) / orders.length : 0;

    const kpis = [
        { label: 'Pedidos em aberto', value: String(abertos.length), hint: abertos.length > 0 ? fmtBRL(abertos.reduce((s, o) => s + orderTotal(o), 0)) : undefined },
        { label: 'Em negociação', value: String(emNegociacao.length), hint: emNegociacao.length > 0 ? 'Aguardando sua resposta' : undefined },
        { label: 'Cotações abertas', value: String(cotacoesAbertas.length), hint: cotacoesAbertas.length === 0 ? 'Nenhuma pendente' : undefined },
        { label: 'Volume confirmado', value: fmtBRL(faturado) },
        { label: 'Ticket médio', value: orders.length > 0 ? fmtBRL(ticket) : '—' },
    ];

    const insight = insights[0];

    const tabs = [
        { id: 'pedidos', label: 'Pedidos recentes', count: orders.length },
        { id: 'cotacoes', label: 'Cotações', count: quotations.length },
        { id: 'notas', label: 'Notas fiscais', count: invoices.length },
    ];

    const recentOrders = React.useMemo(
        () => [...orders].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, RECENT),
        [orders],
    );
    const recentQuotations = React.useMemo(
        () => [...quotations].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')).slice(0, RECENT),
        [quotations],
    );
    const recentInvoices = React.useMemo(
        () => [...invoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, RECENT),
        [invoices],
    );

    return (
        <div className="space-y-3">
            {/* Insight de IA — faixa fina, sem competir com os KPIs */}
            {(loadingAI || insight) && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-[#E1553C] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#1F2430]">{insight?.title || 'Analisando seus pedidos...'}</p>
                        {loadingAI
                            ? <div className="h-3 w-64 max-w-full bg-gray-100 rounded animate-pulse mt-1.5" />
                            : <p className="text-[13px] text-[#8A8F9A] mt-0.5 leading-relaxed">{insight?.message}</p>}
                    </div>
                </PortalCard>
            )}

            <KpiStrip items={kpis} />

            <PortalCard className="overflow-hidden">
                <PortalTabs tabs={tabs} active={tab} onChange={setTab} />

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                {tab === 'pedidos' && (<><Th>Pedido</Th><Th>Data</Th><Th>Obra</Th><Th>Valor</Th><Th>Status</Th></>)}
                                {tab === 'cotacoes' && (<><Th>RFQ</Th><Th>Título</Th><Th>Obra</Th><Th>Prazo</Th><Th>Status</Th></>)}
                                {tab === 'notas' && (<><Th>Data</Th><Th>Arquivo</Th><Th>Pedido</Th><Th>Valor</Th><Th>Status</Th></>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {tab === 'pedidos' && (
                                recentOrders.length === 0 ? (
                                    <tr><td colSpan={5}>
                                        <PortalEmpty icon={<Package className="w-9 h-9" />} title="Nenhum pedido recebido ainda" />
                                    </td></tr>
                                ) : recentOrders.map(o => (
                                    <tr key={o.id} className="cursor-pointer hover:bg-gray-50/70 transition-colors" onClick={() => onOpenOrder(o.id, 'details')}>
                                        <Td className="text-[#1F2430] font-medium whitespace-nowrap">{o.number || o.id.slice(0, 8)}</Td>
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(o.created_at)}</Td>
                                        <Td className="text-[#4A505C]">{o.projectName || '—'}</Td>
                                        <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRL(orderTotal(o))}</Td>
                                        <Td><StatusPill tone={ORDER_TONE[o.status] ?? 'muted'}>{o.status}</StatusPill></Td>
                                    </tr>
                                ))
                            )}
                            {tab === 'cotacoes' && (
                                recentQuotations.length === 0 ? (
                                    <tr><td colSpan={5}>
                                        <PortalEmpty icon={<Clock className="w-9 h-9" />} title="Nenhuma cotação no momento" />
                                    </td></tr>
                                ) : recentQuotations.map(q => (
                                    <tr key={q.id} className="cursor-pointer hover:bg-gray-50/70 transition-colors" onClick={() => onRespondQuotation(q.id)}>
                                        <Td className="text-[#1F2430] font-medium whitespace-nowrap">{q.number}</Td>
                                        <Td className="text-[#4A505C]">{q.title}</Td>
                                        <Td className="text-[#8A8F9A]">{q.projectName || '—'}</Td>
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(q.deadline)}</Td>
                                        <Td><StatusPill tone={QUOTATION_TONE[q.status] ?? 'muted'}>{q.status}</StatusPill></Td>
                                    </tr>
                                ))
                            )}
                            {tab === 'notas' && (
                                recentInvoices.length === 0 ? (
                                    <tr><td colSpan={5}>
                                        <PortalEmpty icon={<FileText className="w-9 h-9" />} title="Nenhuma nota fiscal enviada" />
                                    </td></tr>
                                ) : recentInvoices.map(inv => {
                                    const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, tone: 'muted' as const };
                                    const pedido = orders.find(o => o.id === inv.orderId);
                                    return (
                                        <tr key={inv.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(inv.createdAt)}</Td>
                                            <Td className="text-[#1F2430] font-medium"><span className="block truncate max-w-[260px]">{inv.fileName}</span></Td>
                                            <Td className="text-[#8A8F9A]">{pedido ? (pedido.number || pedido.id.slice(0, 8)) : '—'}</Td>
                                            <Td className="tabular-nums">{inv.amount ? fmtBRL(inv.amount) : '—'}</Td>
                                            <Td><StatusPill tone={st.tone}>{st.label}</StatusPill></Td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end px-5 py-3 border-t border-[#ECECEF]">
                    <SoftButton
                        onClick={() => onNavigate(tab === 'pedidos' ? 'orders' : tab === 'cotacoes' ? 'quotations' : 'documents')}
                    >
                        {tab === 'pedidos' ? 'Ver todos os pedidos' : tab === 'cotacoes' ? 'Ver todas as cotações' : 'Ver todas as notas'}
                    </SoftButton>
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalOverview;
