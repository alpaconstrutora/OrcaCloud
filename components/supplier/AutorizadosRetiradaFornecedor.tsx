import React from 'react';
import { retiradaPedidoService, type AutorizadoParaFornecedor } from '../../services/retiradaPedidoService';
import { formatarCpf } from '../../utils/retiradaPedido';

/**
 * Pedido FOB, visão do FORNECEDOR: quem o comprador autorizou a retirar —
 * nome e CPF, para conferir no balcão. Só leitura (a retirada é registrada
 * pelo comprador). Dados pela RPC `purchase_order_retirada_autorizados_fornecedor`
 * (token do link ou sessão do fornecedor); nada mais do cadastro do RH.
 *
 * Usado no detalhe do pedido (aba Recebimento) e na logística do portal.
 */
const AutorizadosRetiradaFornecedor: React.FC<{ orderId: string; portalToken?: string | null }> = ({ orderId, portalToken }) => {
    const [autorizados, setAutorizados] = React.useState<AutorizadoParaFornecedor[] | null>(null);
    const [erro, setErro] = React.useState(false);

    React.useEffect(() => {
        let cancelado = false;
        setErro(false);
        retiradaPedidoService.autorizadosParaFornecedor(orderId, portalToken)
            .then(a => { if (!cancelado) setAutorizados(a); })
            .catch(err => {
                console.error('[RETIRADA] Falha ao carregar autorizados (fornecedor):', err);
                if (!cancelado) setErro(true);
            });
        return () => { cancelado = true; };
    }, [orderId, portalToken]);

    return (
        <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500">Autorizados a retirar</p>
            {erro ? (
                // Erro dito como erro — lista vazia aqui leria "ninguém autorizado".
                <p className="text-sm font-normal text-red-600">Não foi possível carregar os autorizados. Recarregue a página.</p>
            ) : autorizados === null ? (
                <p className="text-sm font-normal text-gray-500">Carregando…</p>
            ) : autorizados.length === 0 ? (
                <p className="text-sm font-normal text-gray-500">O comprador ainda não informou quem vai retirar.</p>
            ) : (
                <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100 bg-white">
                    {autorizados.map((a, i) => (
                        <li key={`${a.nome}-${i}`} className="px-3 py-2 text-sm font-normal text-gray-900">
                            {a.nome}
                            {a.cpf && <span className="text-gray-500"> · CPF {formatarCpf(a.cpf)}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default AutorizadosRetiradaFornecedor;
