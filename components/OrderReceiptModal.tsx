import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { Modal, ModalHeader, ModalBody } from './ui/modal';
import { criarFonteRecebimento, type PedidoAberto, type ResultadoDaConferencia } from '../services/recebimentoFonte';
import { motivoParaNaoReceber, podeReceber, saldoPorItem } from '../lib/recebimento';
import ConferenciaForm from './suprimentos/recebimento/ConferenciaForm';

/**
 * "Checkout de Obra" no computador — a MESMA conferência do celular e do link
 * (`ConferenciaForm` + lib/recebimento.ts), gravada pela MESMA Edge
 * `pedido-recebimento`. Plano: docs/planos/2026-11-27-recebimento-mobile.md (Fase 6).
 *
 * Antes (até 28/11/2026) este modal gravava pelo navegador (`orderService.confirmOrderReceipt`):
 * só pedido "Entregue", sem parcial, e o recebimento era gravado antes de conferir a
 * versão do pedido. Agora vale a regra única: CIF recebe já "Em Trânsito", "o resto vem
 * depois" vira saldo, e a gravação é atômica no banco.
 */

interface OrderReceiptModalProps {
    order: PurchaseOrder;
    onClose: () => void;
    /** Depois de gravar — com o resultado, para quem chamou avisar (parcelas a pagar etc.). */
    onSave: (r?: ResultadoDaConferencia) => void;
}

const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({ order, onClose, onSave }) => {
    // Leitura pela sessão (recebimento_abrir) — a organização é a do pedido.
    const fonte = React.useMemo(() => criarFonteRecebimento({}), []);
    const [pedido, setPedido] = React.useState<PedidoAberto | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelado = false;
        fonte.abrir(order.id)
            .then(p => { if (!cancelado) setPedido(p); })
            .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error && e.message ? e.message : 'Não consegui abrir o pedido.'); });
        return () => { cancelado = true; };
    }, [fonte, order.id]);

    const saldo = React.useMemo(() => (pedido
        ? saldoPorItem(pedido.itens, pedido.conferencias.map(c => ({
            status: c.status,
            itens: c.itens.map(i => ({ indice: i.indice, code: i.code, quantidadeRecebida: Number(i.recebida) })),
        })))
        : []), [pedido]);

    const motivo = pedido ? motivoParaNaoReceber(pedido.status, pedido.fob) : null;

    return (
        <Modal open onClose={onClose} size="2xl">
            <ModalHeader
                title="Checkout de obra"
                description={`Conferência do recebimento — ${order.number}`}
                icon={
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                }
                onClose={onClose}
            />
            <ModalBody className="bg-gray-50/60 max-h-[75vh] overflow-y-auto">
                {erro ? (
                    <div role="alert" className="text-center py-10">
                        <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
                        <p className="text-sm font-semibold text-gray-900">{erro}</p>
                    </div>
                ) : !pedido ? (
                    <div role="status" className="text-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" aria-hidden="true" />
                        <p className="mt-2 text-gray-500 text-sm">Carregando…</p>
                    </div>
                ) : !podeReceber(pedido.status, pedido.fob) ? (
                    <p className="text-sm text-gray-700 py-6 text-center">{motivo}</p>
                ) : (
                    <ConferenciaForm
                        fonte={fonte}
                        pedido={pedido}
                        saldo={saldo}
                        semCabecalho
                        onCancelar={onClose}
                        onGravado={r => { onSave(r); onClose(); }}
                    />
                )}
            </ModalBody>
        </Modal>
    );
};

export default OrderReceiptModal;
