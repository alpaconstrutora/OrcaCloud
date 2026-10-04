import React from 'react';
import { AlertCircle, CalendarDays, Download, HandCoins, Loader2 } from 'lucide-react';
import { PurchaseOrder, Supplier } from '../../../types';
import { useFinanceiroDoFornecedor } from '../../../hooks/useFinanceiroDoFornecedor';
import { descreverCondicoes, linhasDaAbaFinanceiro, LinhaFinanceiro, STATUS_EM_ABERTO } from '../../../services/pedidoFinanceiroService';
import {
    CardHeader, fmtBRL, fmtBRLCents, fmtDate, KpiItem, KpiStrip, parseDate, PortalCard,
    PortalEmpty, PortalLoading, PortalTabs, SoftButton, StatusPill, Td, TextLinkButton, Th,
} from '../../portal/PortalKit';
import { reciboPagamentoPortalService, rotuloRecibo } from '../../../services/reciboPagamentoPortalService';
import { PAYABLE_STATUS, SEM_PARCELAS } from './status';

interface Props {
    supplier: Supplier;
    orders: PurchaseOrder[];
    /** Acesso via link público — troca o service autenticado pela RPC por token. */
    portalToken?: string;
    /** Abre o detalhe do pedido (aba Financeiro dele mostra as mesmas parcelas). */
    onOpenOrder: (orderId: string) => void;
}

const FILTROS = [
    { id: 'todas',    label: 'Todas',     fn: (_l: LinhaFinanceiro) => true },
    { id: 'abertas',  label: 'Em aberto', fn: (l: LinhaFinanceiro) => !!l.parcela && STATUS_EM_ABERTO.has(l.parcela.status) },
    { id: 'vencidas', label: 'Vencidas',  fn: (l: LinhaFinanceiro) => l.parcela?.status === 'VENCIDO' },
    { id: 'pagas',    label: 'Pagas',     fn: (l: LinhaFinanceiro) => l.parcela?.status === 'PAGO' },
] as const;
type FiltroId = typeof FILTROS[number]['id'];

/**
 * Aba Financeiro do Portal do Fornecedor (link público / prévia) — vocabulário
 * §24. O que a construtora deve ao fornecedor, por parcela: as condições que o
 * comprador definiu em Suprimentos › Pedidos › Financeiro e as parcelas reais
 * do Contas a Pagar. A visão do app (fornecedor logado) é
 * `components/supplier/SupplierFinanceiroTab.tsx`, com o mesmo hook.
 */
const PortalFinanceiro: React.FC<Props> = ({ orders, portalToken, onOpenOrder }) => {
    const { pedidos, resumo, loading, error, reload } = useFinanceiroDoFornecedor({ orders, portalToken });
    const [filtro, setFiltro] = React.useState<FiltroId>('todas');
    // Recibo de pagamento: o credor baixa o PDF que a construtora guardou.
    const [baixandoRecibo, setBaixandoRecibo] = React.useState<string | null>(null);
    const [erroRecibo, setErroRecibo] = React.useState<string | null>(null);
    const baixarRecibo = async (orderId: string, transactionId: string) => {
        setBaixandoRecibo(transactionId);
        setErroRecibo(null);
        try {
            await reciboPagamentoPortalService.baixarDoFornecedor({
                token: portalToken,
                orderId: portalToken ? undefined : orderId,
                transactionId,
            });
        } catch (e) {
            setErroRecibo((e as Error).message || 'Não foi possível baixar o recibo.');
        } finally {
            setBaixandoRecibo(null);
        }
    };

    const linhas = React.useMemo(() => linhasDaAbaFinanceiro(pedidos), [pedidos]);
    const ativo = FILTROS.find(f => f.id === filtro) ?? FILTROS[0];
    const visiveis = linhas.filter(ativo.fn);

    const diasAte = (() => {
        const d = parseDate(resumo.proximoVencimento?.dueDate);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    const kpis: KpiItem[] = [
        { label: 'Em aberto', value: fmtBRL(resumo.emAberto), ...(resumo.emAberto > 0 ? { delta: 'a receber', direction: 'flat' as const } : {}) },
        { label: 'Vencido', value: fmtBRL(resumo.vencido), ...(resumo.vencido > 0 ? { delta: 'em atraso', direction: 'down' as const } : {}) },
        { label: 'Recebido', value: fmtBRL(resumo.recebido) },
        {
            label: 'Próximo vencimento',
            value: resumo.proximoVencimento ? fmtDate(resumo.proximoVencimento.dueDate) : '—',
            hint: diasAte != null ? (diasAte < 0 ? `${Math.abs(diasAte)} dias em atraso` : `em ${diasAte} dias`) : undefined,
        },
    ];

    return (
        <div className="space-y-3">
            {error && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3 border-[#F3D9D1] bg-[#FDF8F6]">
                    <AlertCircle className="w-4 h-4 text-[#C24428] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#C24428] flex-1">{error}</p>
                    <SoftButton type="button" onClick={reload}>Tentar de novo</SoftButton>
                </PortalCard>
            )}

            {erroRecibo && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3 border-[#F3D9D1] bg-[#FDF8F6]">
                    <AlertCircle className="w-4 h-4 text-[#C24428] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#C24428] flex-1">{erroRecibo}</p>
                </PortalCard>
            )}

            <KpiStrip items={kpis} data-tour="financeiro-kpis" />

            {resumo.proximoVencimento && (
                <PortalCard className="px-5 py-3.5 flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-[#E1553C] shrink-0" />
                    <p className="text-[13px] text-[#4A505C]">
                        Próximo vencimento: <strong className="font-semibold text-[#1F2430]">{fmtBRLCents(resumo.proximoVencimento.amount)}</strong>
                        {' '}em <strong className="font-semibold text-[#1F2430]">{fmtDate(resumo.proximoVencimento.dueDate)}</strong>
                        {resumo.proximoVencimento.pedidoNumber ? ` · Pedido ${resumo.proximoVencimento.pedidoNumber}` : ''}
                    </p>
                </PortalCard>
            )}

            <PortalCard className="overflow-hidden" data-tour="financeiro-parcelas">
                <CardHeader
                    title="Parcelas"
                    subtitle="Condições de pagamento e parcelas dos seus pedidos"
                />
                <PortalTabs
                    tabs={FILTROS.map(f => ({ id: f.id, label: f.label, count: linhas.filter(f.fn).length }))}
                    active={filtro}
                    onChange={id => setFiltro(id as FiltroId)}
                />
                {loading ? (
                    <PortalLoading label="Carregando parcelas..." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[880px]">
                            <thead>
                                <tr className="border-b border-[#ECECEF]">
                                    <Th>Pedido</Th>
                                    <Th>Obra</Th>
                                    <Th>Parcela</Th>
                                    <Th>Vencimento</Th>
                                    <Th>Valor</Th>
                                    <Th>Recibo</Th>
                                    <Th>Status</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F4F4F6]">
                                {visiveis.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <PortalEmpty
                                                icon={<HandCoins className="w-9 h-9" />}
                                                title={linhas.length === 0 ? 'Nenhum pedido com financeiro' : 'Nenhuma parcela neste filtro'}
                                                subtitle={linhas.length === 0 ? 'As parcelas aparecem aqui quando o pedido é entregue com nota fiscal vinculada.' : undefined}
                                            />
                                        </td>
                                    </tr>
                                ) : visiveis.map(({ pedido, parcela }) => {
                                    const st = parcela ? PAYABLE_STATUS[parcela.status] : SEM_PARCELAS;
                                    return (
                                        <tr key={parcela ? parcela.id : `pedido-${pedido.orderId}`} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenOrder(pedido.orderId)}
                                                    className="font-medium text-[#C24428] hover:text-[#E1553C] transition-colors"
                                                >
                                                    {pedido.number || pedido.orderId.slice(0, 8)}
                                                </button>
                                            </Td>
                                            <Td className="text-[#1F2430]">{pedido.projectName}</Td>
                                            <Td className="text-[#8A8F9A] whitespace-nowrap">
                                                {parcela ? `${parcela.numero}/${parcela.totalParcelas}` : '—'}
                                            </Td>
                                            <Td className="text-[#8A8F9A] whitespace-nowrap">
                                                {parcela ? fmtDate(parcela.dueDate) : descreverCondicoes(pedido.financeiro.condicoes)}
                                            </Td>
                                            <Td className="text-[#1F2430] font-medium tabular-nums whitespace-nowrap">
                                                {parcela ? fmtBRLCents(parcela.amount) : fmtBRLCents(pedido.total)}
                                            </Td>
                                            <Td className="whitespace-nowrap">
                                                {parcela?.status === 'PAGO' && parcela.reciboNumero != null ? (
                                                    <TextLinkButton
                                                        onClick={() => baixarRecibo(pedido.orderId, parcela.id)}
                                                        disabled={baixandoRecibo === parcela.id}
                                                        title="Baixar o recibo deste pagamento"
                                                    >
                                                        {baixandoRecibo === parcela.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Download className="w-3.5 h-3.5" />}
                                                        {rotuloRecibo(parcela.reciboNumero)}
                                                    </TextLinkButton>
                                                ) : (
                                                    <span className="text-[#A0A4AD]">—</span>
                                                )}
                                            </Td>
                                            <Td>
                                                <span title={parcela ? undefined : 'Parcelas são geradas na entrega, com nota fiscal vinculada'}>
                                                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                                                </span>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>
        </div>
    );
};

export default PortalFinanceiro;
