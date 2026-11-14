import React from 'react';
import { Zap, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { formatMoney } from '../ui/Format';
import { codigosComConfiancaBaixa, type LeituraIaDoPedido } from '../../lib/pedidoFast';
import type { PurchaseOrder } from '../../types';

/**
 * Detalhe do pedido › aviso do Pedido Fast: quem comprou, quando, e o que a
 * leitura da foto deixou para o gestor conferir. Só para o comprador (o
 * fornecedor não vê `leitura_ia`). Plano: docs/planos/2026-11-14-pedido-fast.md
 * (Parte 1, item 10).
 */

interface Props {
    order: PurchaseOrder;
    onVerFotos: () => void;
}

const JA_CONFERIDO = ['Recebido', 'Divergência', 'Cancelado'];

const AvisoPedidoFast: React.FC<Props> = ({ order, onVerFotos }) => {
    const l = order.leituraIa as LeituraIaDoPedido | null | undefined;
    const comprador = l?.comprador?.nome || 'comprador';
    const quando = order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : null;
    const conferir = !JA_CONFERIDO.includes(order.status);

    const alertas: string[] = [];
    if (l) {
        if (l.falhaDaLeitura || l.itens.length === 0) {
            alertas.push(`A leitura da foto falhou${l.falhaDaLeitura ? ` (${l.falhaDaLeitura})` : ''}: lance os itens olhando a foto.`);
        }
        if (l.itens.length > 0 && l.conferencia && !l.conferencia.confere) {
            alertas.push(`Total da nota ${formatMoney(l.conferencia.totalDaNota)} × calculado pelos itens ${formatMoney(l.conferencia.totalCalculado)}.`);
        }
        const duvidosos = new Set(codigosComConfiancaBaixa(l));
        const nomes = (order.items ?? []).filter(i => duvidosos.has(i.code)).map(i => i.description);
        if (nomes.length) alertas.push(`Leitura duvidosa: ${nomes.slice(0, 3).join('; ')}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ''}.`);
    }
    if (!order.supplierId) alertas.push(`Fornecedor a conferir${l?.fornecedor?.nome ? `: ${l.fornecedor.nome}` : ''}.`);

    return (
        <div className="bg-white rounded-[10px] border border-violet-100 shadow-sm px-4 py-3 mb-3 flex flex-col md:flex-row md:items-start gap-3">
            <Zap className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm text-gray-900">
                    <span className="font-semibold">Pedido Fast</span> · comprado por {comprador}{quando ? ` em ${quando}` : ''}.
                    {conferir && <span className="text-gray-600"> Itens lidos da foto da nota — confira antes de Receber.</span>}
                </p>
                {conferir && alertas.length > 0 && (
                    <ul className="space-y-0.5">
                        {alertas.map(a => (
                            <li key={a} className="flex items-start gap-1.5 text-sm text-amber-800">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[3px]" /> {a}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <button type="button" onClick={onVerFotos}
                className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                <ImageIcon className="w-[15px] h-[15px]" /> Ver foto da nota
            </button>
        </div>
    );
};

export default AvisoPedidoFast;
