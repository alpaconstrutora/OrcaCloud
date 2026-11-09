import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { invoiceService } from './invoiceService';
import { supplierPortalTokenService } from './supplierPortalTokenService';
import { numeroDaChaveNfe } from '../supabase/functions/_shared/origemDoLancamento';
import { sanitizeFileName } from '../utils/storageUtils';
import {
    documentoDaLinha,
    erroDoArquivoDocumento,
    type CategoriaDocumentoPedido,
    type DocumentoPedido,
    type LadoDocumentoPedido,
} from '../lib/pedidoDocumentos';

/**
 * Anexos do pedido de compra (Recebimento › Documentos) e as notas fiscais que
 * já chegam ao pedido por outros caminhos.
 *
 * As três portas do detalhe do pedido passam por aqui, e a diferença fica
 * dentro do serviço:
 *   • comprador e fornecedor LOGADOS → tabela + bucket, sob RLS;
 *   • fornecedor pelo LINK (`portalToken`, sessão anon) → RPC de leitura e
 *     Edge Functions `supplier-portal-upload`/`-download`, que validam o token.
 *
 * O anexo só GUARDA o arquivo — não cria `invoices`, `nfe_invoices` nem título.
 */

const BUCKET = 'purchase-order-documents';
const COLUNAS = 'id, order_id, categoria, descricao, file_path, file_name, mime_type, size_bytes, enviado_por_lado, enviado_por, created_at';
const VALIDADE_URL = 60 * 15;

/** Nota fiscal que já está ligada ao pedido (só leitura nesta aba). */
export interface NotaVinculadaAoPedido {
    id: string;
    /** FORNECEDOR = nota enviada pelo fornecedor (`invoices`); NFE = NF-e importada no fiscal. */
    origem: 'FORNECEDOR' | 'NFE';
    numero: string | null;
    emitente: string | null;
    valor: number | null;
    data: string | null;
    arquivo: { bucket: 'invoices' | 'fiscal-documents'; path: string; nome: string } | null;
}

export const pedidoDocumentoService = {
    async listar(orderId: string, portalToken?: string): Promise<DocumentoPedido[]> {
        if (portalToken) {
            const { data, error } = await supabase.rpc('supplier_portal_get_order_documents', {
                p_token: portalToken, p_order_id: orderId,
            });
            if (error) throw error;
            if (!data?.valid) return [];
            return ((data.documents ?? []) as Record<string, unknown>[]).map(documentoDaLinha);
        }
        const { data, error } = await supabase
            .from('purchase_order_documents')
            .select(COLUNAS)
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => documentoDaLinha(r as Record<string, unknown>));
    },

    async enviar(params: {
        orderId: string;
        file: File;
        categoria: CategoriaDocumentoPedido;
        descricao?: string;
        lado: LadoDocumentoPedido;
        portalToken?: string;
    }): Promise<DocumentoPedido> {
        const { orderId, file, categoria, lado, portalToken } = params;
        const descricao = params.descricao?.trim() || null;
        const erro = erroDoArquivoDocumento(file);
        if (erro) throw new Error(erro);

        if (portalToken) {
            const form = new FormData();
            form.append('token', portalToken);
            form.append('destino', 'pedido_documento');
            form.append('orderId', orderId);
            form.append('categoria', categoria);
            if (descricao) form.append('descricao', descricao);
            form.append('file', file);
            const { data, error } = await supabase.functions.invoke('supplier-portal-upload', { body: form });
            if (error) throw error;
            if (!data?.documento) throw new Error(data?.error || 'Erro ao enviar o documento.');
            return documentoDaLinha(data.documento);
        }

        const path = `${orderId}/${crypto.randomUUID()}_${sanitizeFileName(file.name)}`;
        await storageService.uploadFile(BUCKET, path, file);
        const { data, error } = await supabase
            .from('purchase_order_documents')
            .insert({
                order_id: orderId,
                categoria,
                descricao,
                file_path: path,
                file_name: file.name,
                mime_type: file.type || null,
                size_bytes: file.size,
                enviado_por_lado: lado,
            })
            .select(COLUNAS)
            .single();
        if (error) {
            // Sem a linha, o objeto fica órfão — e a policy de DELETE do bucket
            // libera justamente o órfão.
            await supabase.storage.from(BUCKET).remove([path]);
            throw error;
        }
        return documentoDaLinha(data as Record<string, unknown>);
    },

    /** A linha sai primeiro (a policy dela confere o lado); o arquivo depois. */
    async excluir(doc: DocumentoPedido, portalToken?: string): Promise<void> {
        if (portalToken) {
            const form = new FormData();
            form.append('token', portalToken);
            form.append('destino', 'pedido_documento');
            form.append('acao', 'excluir');
            form.append('documentId', doc.id);
            const { data, error } = await supabase.functions.invoke('supplier-portal-upload', { body: form });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'Erro ao excluir o documento.');
            return;
        }
        const { data, error } = await supabase
            .from('purchase_order_documents')
            .delete()
            .eq('id', doc.id)
            .select('id');
        if (error) throw error;
        // DELETE barrado pela RLS não dá erro: volta zero linhas.
        if (!data || data.length === 0) throw new Error('Você não pode excluir este documento.');
        await supabase.storage.from(BUCKET).remove([doc.filePath]);
    },

    /** URL assinada no CLIQUE (15 min): assinar a lista inteira ao carregar expiraria antes. */
    async urlDoDocumento(doc: DocumentoPedido, portalToken?: string): Promise<string> {
        return urlAssinada(BUCKET, doc.filePath, portalToken);
    },

    /**
     * Notas que já estão ligadas ao pedido por outros módulos:
     *   • `invoices.order_id` — enviada pelo fornecedor (as duas pontas veem);
     *   • `nfe_invoices.purchase_order_id` — NF-e importada no fiscal (só o
     *     comprador: é dado interno da empresa).
     * Cada origem falha sozinha — uma sem permissão não apaga a outra.
     */
    async notasVinculadas(orderId: string, opts: { portalToken?: string; ehComprador: boolean }): Promise<NotaVinculadaAoPedido[]> {
        const [doFornecedor, nfes] = await Promise.all([
            notasDoFornecedor(orderId, opts.portalToken).catch(e => {
                console.error('[pedidoDocumentoService] notas do fornecedor:', e);
                return [] as NotaVinculadaAoPedido[];
            }),
            opts.ehComprador && !opts.portalToken
                ? nfesDoPedido(orderId).catch(e => {
                    console.error('[pedidoDocumentoService] NF-e do pedido:', e);
                    return [] as NotaVinculadaAoPedido[];
                })
                : Promise.resolve([] as NotaVinculadaAoPedido[]),
        ]);
        return [...nfes, ...doFornecedor];
    },

    async urlDaNota(nota: NotaVinculadaAoPedido, portalToken?: string): Promise<string> {
        if (!nota.arquivo) throw new Error('Esta nota não tem arquivo.');
        return urlAssinada(nota.arquivo.bucket, nota.arquivo.path, portalToken);
    },
};

async function urlAssinada(bucket: string, path: string, portalToken?: string): Promise<string> {
    if (!portalToken) return storageService.createSignedUrl(bucket, path, VALIDADE_URL);
    if (bucket === 'invoices') return supplierPortalTokenService.getInvoiceDownloadUrl(portalToken, path);
    const { data, error } = await supabase.functions.invoke('supplier-portal-download', {
        body: { token: portalToken, storagePath: path, bucket },
    });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de acesso ao documento.');
    return data.signedUrl;
}

async function notasDoFornecedor(orderId: string, portalToken?: string): Promise<NotaVinculadaAoPedido[]> {
    const invoices = portalToken
        ? (await supplierPortalTokenService.getOrderDetail(portalToken, orderId)).invoices ?? []
        : await invoiceService.listInvoicesByOrder(orderId);
    return invoices
        .filter(i => !i.orderId || i.orderId === orderId)
        .map(i => ({
            id: i.id,
            origem: 'FORNECEDOR' as const,
            numero: null,
            emitente: null,
            valor: i.amount ?? null,
            data: i.createdAt ?? null,
            arquivo: i.filePath ? { bucket: 'invoices' as const, path: i.filePath, nome: i.fileName } : null,
        }));
}

async function nfesDoPedido(orderId: string): Promise<NotaVinculadaAoPedido[]> {
    const { data, error } = await supabase
        .from('nfe_invoices')
        .select('id, access_key, issuer_name, total_value, issue_date, raw_document:raw_documents(file_path)')
        .eq('purchase_order_id', orderId)
        .order('issue_date', { ascending: false });
    if (error) throw error;
    type Linha = {
        id: string; access_key: string | null; issuer_name: string | null; total_value: number | null;
        issue_date: string | null; raw_document: { file_path: string | null } | { file_path: string | null }[] | null;
    };
    return ((data ?? []) as Linha[]).map(n => {
        const raw = Array.isArray(n.raw_document) ? n.raw_document[0] : n.raw_document;
        const path = raw?.file_path ?? null;
        return {
            id: n.id,
            origem: 'NFE' as const,
            numero: numeroDaChaveNfe(n.access_key),
            emitente: n.issuer_name,
            valor: n.total_value,
            data: n.issue_date,
            arquivo: path ? { bucket: 'fiscal-documents' as const, path, nome: path.split('/').pop() || 'NF-e.xml' } : null,
        };
    });
}
