import { supabase } from '../lib/supabase';

/**
 * Recibo de PAGAMENTO (o credor assina) visto pelos portais do credor.
 * Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md (Fase 2).
 *
 * O PDF fica no bucket privado `financial-receipts`; o portal não lê o bucket.
 * Cada Edge Function autoriza pela MESMA RPC que a tela do portal usa, com a
 * credencial de quem pede, e devolve uma URL assinada de 15 minutos:
 *   · Portal do Fornecedor (parcelas de pedido) → supplier-portal-recibo-download
 *   · Portal do Parceiro (contrato/medição)      → partner-portal-recibo-download
 */

async function pedirUrl(funcao: string, body: Record<string, unknown>): Promise<{ url: string; numero: number }> {
    const { data, error } = await supabase.functions.invoke(funcao, { body });
    if (error) {
        // Resposta 4xx chega como FunctionsHttpError — a mensagem útil está no corpo.
        const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(corpo?.error || 'Não foi possível baixar o recibo.');
    }
    if (!data?.url) throw new Error(data?.error || 'Não foi possível baixar o recibo.');
    return { url: data.url as string, numero: data.numero as number };
}

/** A URL assinada já vem com `download=<nome>`: um clique numa âncora baixa sem sair da página. */
function abrirDownload(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/** "Nº 000001" — mesmo formato do PDF (utils/reciboRecebimento.numeroRecibo),
 *  repetido aqui para o portal não carregar o jsPDF só para formatar um número. */
export const rotuloRecibo = (n: number) => `Nº ${String(n).padStart(6, '0')}`;

export const reciboPagamentoPortalService = {
    /** Portal do Fornecedor: `token` (link público) OU `orderId` (logado). */
    async baixarDoFornecedor(params: { token?: string; orderId?: string; transactionId: string }): Promise<void> {
        const { url } = await pedirUrl('supplier-portal-recibo-download', {
            transactionId: params.transactionId,
            ...(params.token ? { token: params.token } : { orderId: params.orderId }),
        });
        abrirDownload(url);
    },

    /** Portal do Parceiro: `token` (link público) OU `workspaceId` (app). */
    async baixarDoParceiro(params: { token?: string; workspaceId?: string; transactionId: string }): Promise<void> {
        const { url } = await pedirUrl('partner-portal-recibo-download', {
            transactionId: params.transactionId,
            ...(params.token ? { token: params.token } : { workspaceId: params.workspaceId }),
        });
        abrirDownload(url);
    },
};
