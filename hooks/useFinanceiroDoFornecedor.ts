import React from 'react';
import type { PedidoComFinanceiro, PurchaseOrder } from '../types';
import { supplierPortalTokenService } from '../services/supplierPortalTokenService';
import { pedidoFinanceiroService, resumirParcelas, ResumoParcelas } from '../services/pedidoFinanceiroService';
import { orderTotal } from '../components/supplier/portal/status';

/**
 * Dados da aba Financeiro do Portal do Fornecedor — a mesma lógica para as
 * duas cascas (kit coral do link público e vocabulário do guia no app).
 *
 * `portalToken` responde "por onde os dados entram" (regra de
 * utils/pedidoPerfil.ts): com token, uma RPC devolve pedidos + financeiro;
 * logado, os pedidos já vieram por `orderService.listOrders` e só o
 * financeiro é buscado, em lote. Não há gate por organização: o recorte é
 * por fornecedor, feito no banco.
 */
export function useFinanceiroDoFornecedor(args: {
    orders: PurchaseOrder[];
    portalToken?: string;
}): {
    pedidos: PedidoComFinanceiro[];
    resumo: ResumoParcelas;
    loading: boolean;
    error: string | null;
    reload: () => void;
} {
    const { orders, portalToken } = args;
    const [pedidos, setPedidos] = React.useState<PedidoComFinanceiro[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [tick, setTick] = React.useState(0);

    // Recarrega quando o CONJUNTO de pedidos muda, não a cada referência nova
    // do array (o dashboard recria `orders` a cada load).
    const idsDosPedidos = orders.map(o => o.id).sort().join(',');

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                let lista: PedidoComFinanceiro[];
                if (portalToken) {
                    lista = await supplierPortalTokenService.getFinancials(portalToken);
                } else {
                    const ids = idsDosPedidos ? idsDosPedidos.split(',') : [];
                    const porPedido = await pedidoFinanceiroService.getForOrders(ids);
                    lista = orders
                        .filter(o => o.status !== 'Rascunho')
                        .map(o => ({
                            orderId: o.id,
                            number: o.number,
                            projectName: o.projectName || '-',
                            status: o.status,
                            total: orderTotal(o),
                            // Pedido que a RPC não devolveu (sem permissão) fica
                            // com as condições que o próprio pedido já trouxe e
                            // sem parcelas — o mesmo que ele veria.
                            financeiro: porPedido[o.id] ?? {
                                condicoes: {
                                    paymentMethod: o.paymentMethod,
                                    paymentTermType: o.paymentTermType,
                                    paymentDays: o.paymentDays,
                                    paymentInstallments: o.paymentInstallments,
                                    notes: o.notes,
                                },
                                parcelas: [],
                            },
                        }));
                }
                if (!cancelled) setPedidos(lista);
            } catch (e) {
                console.error('[useFinanceiroDoFornecedor]', e);
                if (!cancelled) setError('Não foi possível carregar o financeiro dos seus pedidos.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [portalToken, idsDosPedidos, tick]);

    const resumo = React.useMemo(() => resumirParcelas(pedidos), [pedidos]);
    const reload = React.useCallback(() => setTick(t => t + 1), []);

    return { pedidos, resumo, loading, error, reload };
}
