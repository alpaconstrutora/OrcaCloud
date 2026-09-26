/**
 * Recibo de recebimento de Contas a Receber — emitir, guardar e baixar.
 *
 * Banco: migration aplicar_20270926000110. Escrita SÓ pelas RPCs:
 *   emitir_recibo_recebimento(tx)   → numera e congela o conteúdo; idempotente
 *                                     (título com recibo ativo devolve o mesmo)
 *   registrar_arquivo_recibo(id, p) → grava o caminho do PDF, uma vez
 * Estorno da baixa cancela o recibo por trigger — nada a fazer aqui.
 *
 * O PDF é montado a partir do registro congelado (`utils/reciboRecebimento.ts`)
 * e guardado em `financial-receipts/<org>/<id>.pdf`. Reimprimir baixa o arquivo
 * guardado; se ele não existir (upload anterior falhou), monta de novo pelo
 * mesmo registro e tenta guardar outra vez — o conteúdo é o mesmo.
 */
import { saveAs } from 'file-saver';
import { supabase } from '../lib/supabase';
import { montarReciboPdf, nomeArquivoRecibo } from '../utils/reciboRecebimento';
import type { FinancialReceipt } from '../types/financial';

const BUCKET = 'financial-receipts';

/** Resumo do recibo ativo de um título — o que a tabela precisa saber. */
export type ReciboAtivo = Pick<FinancialReceipt, 'id' | 'transaction_id' | 'receipt_number'>;

/** PostgREST recebe o `.in()` pela URL — lotes de 200 UUIDs ficam longe do limite. */
function chunk<T>(list: T[], size = 200): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

const logoCache = new Map<string, Promise<string | null>>();

/** Logo da organização como data URL para o jsPDF. Falha → recibo sem logo. */
function logoComoDataUrl(url?: string | null): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    let p = logoCache.get(url);
    if (!p) {
        p = fetch(url)
            .then(res => (res.ok ? res.blob() : null))
            .then(blob => blob && blob.type.startsWith('image/')
                ? new Promise<string | null>(resolve => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                })
                : null)
            .catch(() => null);
        logoCache.set(url, p);
    }
    return p;
}

async function guardarPdf(recibo: FinancialReceipt, pdf: Blob): Promise<void> {
    const path = `${recibo.organization_id}/${recibo.id}.pdf`;
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, pdf, { contentType: 'application/pdf', upsert: false });
    // Já existe = um upload anterior subiu e o registro do caminho é que falhou.
    // O bucket não tem UPDATE (arquivo imutável), então segue para registrar.
    if (error && !/exist|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
        throw error;
    }
    const { error: rpcError } = await supabase.rpc('registrar_arquivo_recibo', {
        p_receipt_id: recibo.id,
        p_file_path: path,
    });
    if (rpcError) throw rpcError;
}

export const financialReceiptService = {
    /** Numera e congela (ou devolve o recibo ativo do título). */
    async emitir(transactionId: string): Promise<FinancialReceipt> {
        const { data, error } = await supabase.rpc('emitir_recibo_recebimento', {
            p_transaction_id: transactionId,
        });
        if (error) throw error;
        return data as FinancialReceipt;
    },

    /** Recibos ativos dos títulos informados — para a tela saber o número. */
    async listarAtivos(transactionIds: string[]): Promise<Map<string, ReciboAtivo>> {
        const out = new Map<string, ReciboAtivo>();
        if (transactionIds.length === 0) return out;
        for (const ids of chunk(transactionIds)) {
            const { data, error } = await supabase
                .from('financial_receipts')
                .select('id,transaction_id,receipt_number')
                .in('transaction_id', ids)
                .is('cancelled_at', null);
            if (error) throw error;
            for (const r of (data ?? []) as ReciboAtivo[]) {
                if (r.transaction_id) out.set(r.transaction_id, r);
            }
        }
        return out;
    },

    /**
     * Fluxo único da baixa e da reimpressão: emite (ou reaproveita) o recibo e
     * entrega o PDF ao navegador. Devolve o recibo, e `guardado=false` quando o
     * PDF foi entregue mas não conseguiu ir para o Storage (a próxima
     * reimpressão tenta de novo).
     */
    async baixarPdf(
        transactionId: string,
        opts: { logoUrl?: string | null } = {},
    ): Promise<{ recibo: FinancialReceipt; guardado: boolean }> {
        const recibo = await this.emitir(transactionId);
        const nome = nomeArquivoRecibo(recibo);

        if (recibo.file_path) {
            const { data, error } = await supabase.storage.from(BUCKET).download(recibo.file_path);
            if (!error && data) {
                saveAs(data, nome);
                return { recibo, guardado: true };
            }
            // Arquivo sumiu do bucket: monta de novo pelo registro congelado.
        }

        const pdf = montarReciboPdf(recibo, await logoComoDataUrl(opts.logoUrl)).output('blob');
        let guardado = !!recibo.file_path;
        if (!recibo.file_path) {
            try {
                await guardarPdf(recibo, pdf);
                guardado = true;
            } catch (e) {
                console.error('[recibo] PDF entregue, mas não foi guardado no Storage:', e);
            }
        }
        saveAs(pdf, nome);
        return { recibo, guardado };
    },
};
