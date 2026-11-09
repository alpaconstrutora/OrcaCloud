/**
 * Anexos do pedido de compra (Recebimento › Documentos) — regras puras.
 *
 * O anexo só GUARDA o arquivo: uma NF anexada aqui não entra no fiscal nem gera
 * título (decisão do usuário, 09/11/2026). As mesmas regras de tipo e tamanho
 * estão repetidas na Edge Function `supplier-portal-upload`, que é a trava de
 * verdade para o link público.
 */

export type CategoriaDocumentoPedido = 'NOTA_FISCAL' | 'RECIBO' | 'COMPROVANTE' | 'BOLETO' | 'OUTRO';
export type LadoDocumentoPedido = 'COMPRADOR' | 'FORNECEDOR';

export interface DocumentoPedido {
    id: string;
    orderId: string;
    categoria: CategoriaDocumentoPedido;
    descricao: string | null;
    filePath: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    enviadoPorLado: LadoDocumentoPedido;
    enviadoPor: string | null;
    createdAt: string;
}

export const CATEGORIAS_DOCUMENTO_PEDIDO: { value: CategoriaDocumentoPedido; label: string }[] = [
    { value: 'NOTA_FISCAL', label: 'Nota fiscal' },
    { value: 'RECIBO', label: 'Recibo' },
    { value: 'COMPROVANTE', label: 'Comprovante' },
    { value: 'BOLETO', label: 'Boleto' },
    { value: 'OUTRO', label: 'Outro' },
];

export function rotuloCategoriaDocumento(categoria: string): string {
    return CATEGORIAS_DOCUMENTO_PEDIDO.find(c => c.value === categoria)?.label ?? 'Outro';
}

export const EXTENSOES_DOCUMENTO_PEDIDO = ['pdf', 'xml', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
export const ACCEPT_DOCUMENTO_PEDIDO = EXTENSOES_DOCUMENTO_PEDIDO.map(e => `.${e}`).join(',');
export const TAMANHO_MAXIMO_DOCUMENTO_PEDIDO = 10 * 1024 * 1024;

/** `null` = arquivo aceito; senão, a frase para mostrar ao usuário. */
export function erroDoArquivoDocumento(arquivo: { name: string; size: number }): string | null {
    if (arquivo.size === 0) return 'O arquivo está vazio.';
    if (arquivo.size > TAMANHO_MAXIMO_DOCUMENTO_PEDIDO) return 'O arquivo passa de 10 MB.';
    const partes = arquivo.name.toLowerCase().split('.');
    const ext = partes.length > 1 ? partes[partes.length - 1] : '';
    if (!EXTENSOES_DOCUMENTO_PEDIDO.includes(ext)) return 'Tipo não aceito: envie PDF, XML ou imagem (JPG, PNG, WEBP, HEIC).';
    return null;
}

/** Cada lado exclui só o que o próprio lado enviou (mesma regra da policy). */
export function podeExcluirDocumento(doc: Pick<DocumentoPedido, 'enviadoPorLado'>, ehComprador: boolean): boolean {
    return doc.enviadoPorLado === (ehComprador ? 'COMPRADOR' : 'FORNECEDOR');
}

export function motivoNaoExcluir(doc: Pick<DocumentoPedido, 'enviadoPorLado'>, ehComprador: boolean): string | null {
    if (podeExcluirDocumento(doc, ehComprador)) return null;
    return doc.enviadoPorLado === 'FORNECEDOR'
        ? 'Enviado pelo fornecedor — só ele pode excluir'
        : 'Enviado pelo comprador — só ele pode excluir';
}

export function tamanhoLegivel(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Linha crua (tabela ou RPC de link) → objeto da tela. */
export function documentoDaLinha(r: Record<string, unknown>): DocumentoPedido {
    return {
        id: String(r.id),
        orderId: String(r.order_id),
        categoria: (r.categoria as CategoriaDocumentoPedido) ?? 'OUTRO',
        descricao: (r.descricao as string | null) ?? null,
        filePath: String(r.file_path),
        fileName: String(r.file_name),
        mimeType: (r.mime_type as string | null) ?? null,
        sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
        enviadoPorLado: r.enviado_por_lado === 'FORNECEDOR' ? 'FORNECEDOR' : 'COMPRADOR',
        enviadoPor: (r.enviado_por as string | null) ?? null,
        createdAt: String(r.created_at),
    };
}
