import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, HandCoins, Wallet } from 'lucide-react';
import { PurchaseOrder, Supplier } from '../../types';
import { useFinanceiroDoFornecedor } from '../../hooks/useFinanceiroDoFornecedor';
import { descreverCondicoes, linhasDaAbaFinanceiro, LinhaFinanceiro, STATUS_EM_ABERTO } from '../../services/pedidoFinanceiroService';
import { PAYABLE_STATUS, SEM_PARCELAS } from './portal/status';
import { KpiCard } from '../ui/KpiCard';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatCurrency } from '../../utils/financialMath';
import { fmtDate, parseDate } from '../portal/PortalKit';

interface Props {
    supplier: Supplier;
    orders: PurchaseOrder[];
    onOpenOrder: (orderId: string) => void;
}

const COLUMNS: StandardTableColumn[] = [
    { key: 'pedido',     label: 'Pedido',     sortable: true, width: 140 },
    { key: 'obra',       label: 'Obra',       sortable: true, width: 220 },
    { key: 'parcela',    label: 'Parcela',    sortable: true, width: 100, align: 'center' },
    { key: 'vencimento', label: 'Vencimento', sortable: true, width: 200 },
    { key: 'valor',      label: 'Valor',      sortable: true, width: 140, align: 'right' },
    { key: 'status',     label: 'Status',     sortable: true, width: 130 },
];

/** §8 — status como texto colorido, sem pílula. Mesmas cores do Contas a Pagar. */
const STATUS_TEXT_COLOR: Record<string, string> = {
    PAGO: 'text-emerald-600',
    VENCIDO: 'text-red-600',
    PREVISTO: 'text-amber-600', APROVADO: 'text-amber-600', EMITIDO: 'text-amber-600', ENVIADO: 'text-amber-600',
    PARCIAL: 'text-blue-600', RENEGOCIADO: 'text-blue-600',
    CANCELADO: 'text-gray-500',
};

type FiltroStatus = 'TODAS' | 'ABERTAS' | 'VENCIDAS' | 'PAGAS';

/**
 * Aba Financeiro do Portal do Fornecedor — visão do APP (fornecedor logado e
 * impersonação do gestor), no vocabulário do guia (§4 KpiCard, §6.10
 * StandardTable, §8 status texto). A mesma lógica do link público
 * (`portal/PortalFinanceiro.tsx`) via `useFinanceiroDoFornecedor`; só a casca
 * muda — §24 autoriza trocar cor com `accent`, não vocabulário.
 */
const SupplierFinanceiroTab: React.FC<Props> = ({ orders, onOpenOrder }) => {
    const { pedidos, resumo, loading, error } = useFinanceiroDoFornecedor({ orders });
    const [filtro, setFiltro] = React.useState<FiltroStatus>('TODAS');

    const linhas = React.useMemo(() => linhasDaAbaFinanceiro(pedidos), [pedidos]);
    const visiveis = linhas.filter(l => {
        if (filtro === 'TODAS') return true;
        if (!l.parcela) return false;
        if (filtro === 'ABERTAS') return STATUS_EM_ABERTO.has(l.parcela.status);
        if (filtro === 'VENCIDAS') return l.parcela.status === 'VENCIDO';
        return l.parcela.status === 'PAGO';
    });

    const diasAte = (() => {
        const d = parseDate(resumo.proximoVencimento?.dueDate);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    const rowKey = (l: LinhaFinanceiro) => l.parcela ? l.parcela.id : `pedido-${l.pedido.orderId}`;

    return (
        <div className="space-y-3">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Em aberto" value={formatCurrency(resumo.emAberto)} icon={<Wallet />} color="blue" />
                <KpiCard label="Vencido" value={formatCurrency(resumo.vencido)} icon={<AlertTriangle />} color="rose" />
                <KpiCard label="Recebido" value={formatCurrency(resumo.recebido)} icon={<CheckCircle2 />} color="emerald" />
                <KpiCard
                    label="Próximo vencimento"
                    value={resumo.proximoVencimento ? fmtDate(resumo.proximoVencimento.dueDate) : '—'}
                    sub={diasAte != null ? (diasAte < 0 ? `${Math.abs(diasAte)} dias em atraso` : `em ${diasAte} dias`) : undefined}
                    icon={<CalendarClock />}
                    color="amber"
                />
            </div>

            <StandardTable<LinhaFinanceiro>
                storageKey="supplierDashboard:financeiro"
                columns={COLUMNS}
                rows={visiveis}
                rowKey={rowKey}
                loading={loading}
                searchText={l => `${l.pedido.number ?? ''} ${l.pedido.projectName}`}
                filters={
                    <select
                        value={filtro}
                        onChange={e => setFiltro(e.target.value as FiltroStatus)}
                        className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="TODAS">Todas</option>
                        <option value="ABERTAS">Em aberto</option>
                        <option value="VENCIDAS">Vencidas</option>
                        <option value="PAGAS">Pagas</option>
                    </select>
                }
                sortValue={(key, l) => {
                    switch (key) {
                        case 'pedido': return l.pedido.number ?? '';
                        case 'obra': return l.pedido.projectName;
                        case 'parcela': return l.parcela?.numero ?? 0;
                        case 'vencimento': return l.parcela?.dueDate ?? '9999';
                        case 'valor': return l.parcela ? l.parcela.amount : l.pedido.total;
                        case 'status': return l.parcela ? PAYABLE_STATUS[l.parcela.status].label : SEM_PARCELAS.label;
                        default: return '';
                    }
                }}
                renderCell={(key, l) => {
                    const { pedido, parcela } = l;
                    switch (key) {
                        case 'pedido':
                            return (
                                <button
                                    type="button"
                                    onClick={() => onOpenOrder(pedido.orderId)}
                                    className="text-sm font-normal text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    {pedido.number || pedido.orderId.slice(0, 8)}
                                </button>
                            );
                        case 'obra':
                            return <span className="text-sm font-normal text-gray-700">{pedido.projectName}</span>;
                        case 'parcela':
                            return <span className="text-sm font-normal text-gray-700">{parcela ? `${parcela.numero}/${parcela.totalParcelas}` : '—'}</span>;
                        case 'vencimento':
                            return (
                                <span className="text-sm font-normal text-gray-700">
                                    {parcela ? fmtDate(parcela.dueDate) : descreverCondicoes(pedido.financeiro.condicoes)}
                                </span>
                            );
                        case 'valor':
                            return (
                                <span className="text-sm font-medium text-gray-800 tabular-nums">
                                    {formatCurrency(parcela ? parcela.amount : pedido.total)}
                                </span>
                            );
                        case 'status': {
                            if (!parcela) {
                                return (
                                    <span
                                        className="text-sm font-normal text-gray-500"
                                        title="Parcelas são geradas na entrega, com nota fiscal vinculada"
                                    >
                                        {SEM_PARCELAS.label}
                                    </span>
                                );
                            }
                            return (
                                <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[parcela.status] ?? 'text-gray-600'}`}>
                                    {PAYABLE_STATUS[parcela.status].label}
                                </span>
                            );
                        }
                        default:
                            return null;
                    }
                }}
                empty={{
                    icon: <HandCoins className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: linhas.length === 0 ? 'Nenhum pedido com financeiro' : 'Nenhuma parcela neste filtro',
                    subtitle: linhas.length === 0 ? 'As parcelas aparecem aqui quando o pedido é entregue com nota fiscal vinculada.' : undefined,
                }}
            />
        </div>
    );
};

export default SupplierFinanceiroTab;
