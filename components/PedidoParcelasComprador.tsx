import React from 'react';
import { Receipt } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import { pedidoFinanceiroService, STATUS_EM_ABERTO } from '../services/pedidoFinanceiroService';
import { PAYABLE_STATUS } from './supplier/portal/status';
import { fmtDate } from './portal/PortalKit';
import type { ParcelaDoPedido } from '../types';

/**
 * Suprimentos › Pedidos › aba Financeiro, visão do COMPRADOR: as parcelas que o
 * pedido gerou no Contas a Pagar (pedido do usuário em 2026-10-19).
 *
 * Fonte: `purchase_order_financeiro_json` (via `pedidoFinanceiroService`) — a
 * MESMA da visão do fornecedor e do portal, então os três lugares nunca
 * discordam. As parcelas nascem em `financialService.syncOrderToFinance`, quando
 * o pedido chega a Entregue/Recebido/Divergência com nota fiscal vinculada.
 *
 * Recarrega a cada montagem (a aba é montada quando aberta): a parcela pode ter
 * sido gerada, paga ou renegociada desde a última vez.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const COLUMNS: StandardTableColumn[] = [
    { key: 'parcela', label: 'Parcela', sortable: true, width: 100 },
    { key: 'vencimento', label: 'Vencimento', sortable: true, width: 130 },
    { key: 'valor', label: 'Valor', sortable: true, width: 140, align: 'right' },
    { key: 'pagamento', label: 'Pago em', sortable: true, width: 130 },
    { key: 'status', label: 'Status', sortable: true, width: 130 },
];

const corDoStatus = (s: ParcelaDoPedido['status']) =>
    s === 'PAGO' ? 'text-emerald-600'
    : s === 'VENCIDO' ? 'text-red-600'
    : s === 'CANCELADO' ? 'text-gray-500'
    : 'text-amber-600';

const PedidoParcelasComprador: React.FC<{ orderId: string }> = ({ orderId }) => {
    const [parcelas, setParcelas] = React.useState<ParcelaDoPedido[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState(false);

    React.useEffect(() => {
        let cancelado = false;
        setCarregando(true);
        setErro(false);
        pedidoFinanceiroService.get(orderId)
            .then(f => { if (!cancelado) setParcelas(f?.parcelas ?? []); })
            .catch(e => {
                console.error('[PEDIDO] Falha ao carregar parcelas do Contas a Pagar:', e);
                // Erro dito como erro — tabela vazia diria "parcelas não geradas".
                if (!cancelado) setErro(true);
            })
            .finally(() => { if (!cancelado) setCarregando(false); });
        return () => { cancelado = true; };
    }, [orderId]);

    const totais = React.useMemo(() => {
        let total = 0, pago = 0, emAberto = 0, vencido = 0;
        for (const p of parcelas) {
            if (p.status === 'CANCELADO') continue;
            total += p.amount;
            if (p.status === 'PAGO') pago += p.amount;
            else if (STATUS_EM_ABERTO.has(p.status)) {
                emAberto += p.amount;
                if (p.status === 'VENCIDO') vencido += p.amount;
            }
        }
        return { total, pago, emAberto, vencido };
    }, [parcelas]);

    return (
        <div className="bg-white p-6 rounded-[10px] shadow-sm border border-gray-100 space-y-4">
            <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-500" />
                    Parcelas no Contas a Pagar
                </h3>
                <p className="mt-1 text-sm font-normal text-gray-500">
                    Geradas pelo pedido quando ele é entregue (no FOB, retirado) e tem nota fiscal vinculada.
                </p>
            </div>

            {erro ? (
                <p className="text-sm font-normal text-red-600">Não foi possível carregar as parcelas. Recarregue a página.</p>
            ) : (
                // Sem busca de propósito: um pedido tem poucas parcelas, e a
                // ordenação pelo cabeçalho já resolve.
                <StandardTable<ParcelaDoPedido>
                    storageKey="suprimentos:pedido:parcelas"
                    columns={COLUMNS}
                    rows={parcelas}
                    rowKey={p => p.id}
                    loading={carregando}
                    sortValue={(key, p) =>
                        key === 'parcela' ? p.numero
                        : key === 'vencimento' ? p.dueDate
                        : key === 'valor' ? p.amount
                        : key === 'pagamento' ? (p.paymentDate ?? '')
                        : PAYABLE_STATUS[p.status]?.label ?? p.status}
                    renderCell={(key, p) => {
                        switch (key) {
                            case 'parcela':
                                return <span className="text-sm font-normal text-gray-700">{p.numero}/{p.totalParcelas}</span>;
                            case 'vencimento':
                                return <span className="text-sm font-normal text-gray-700">{p.dueDate ? fmtDate(p.dueDate) : '—'}</span>;
                            case 'valor':
                                return <span className="text-sm font-medium text-gray-800 tabular-nums">{brl(p.amount)}</span>;
                            case 'pagamento':
                                return <span className="text-sm font-normal text-gray-700">{p.paymentDate ? fmtDate(p.paymentDate) : '—'}</span>;
                            case 'status':
                                return <span className={`text-sm font-normal ${corDoStatus(p.status)}`}>{PAYABLE_STATUS[p.status]?.label ?? p.status}</span>;
                            default:
                                return null;
                        }
                    }}
                    empty={{
                        icon: <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Parcelas ainda não geradas',
                        subtitle: 'São geradas quando o pedido é entregue (no FOB, retirado) e tem nota fiscal vinculada.',
                    }}
                    renderTotals={parcelas.length > 0 ? (n) => (
                        <tr className="border-t border-gray-200 bg-white text-sm font-semibold text-gray-700">
                            <td colSpan={n} className="px-6 py-2.5">
                                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                    <span>Total {brl(totais.total)}</span>
                                    <span className="flex flex-wrap gap-x-4 gap-y-1 font-normal tabular-nums">
                                        <span className="text-emerald-600">Pago {brl(totais.pago)}</span>
                                        <span className="text-amber-600">Em aberto {brl(totais.emAberto)}</span>
                                        {totais.vencido > 0 && <span className="text-red-600">Vencido {brl(totais.vencido)}</span>}
                                    </span>
                                </span>
                            </td>
                        </tr>
                    ) : undefined}
                    bare
                />
            )}
        </div>
    );
};

export default PedidoParcelasComprador;
