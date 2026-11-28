/**
 * Regras puras da Edge `pedido-recebimento` (validação do corpo e tradução de
 * erro). Sem Deno nem Supabase — o Vitest testa direto
 * (__tests__/pedidoRecebimentoEdgeRegras.test.ts).
 * docs/planos/2026-11-27-recebimento-mobile.md, Fase 3.
 */
import type { EntradaDoItem, Problema } from '../../../lib/recebimento.ts';
import { erroDoArquivoDocumento, type CategoriaDocumentoPedido } from '../../../lib/pedidoDocumentos.ts';

export const BUCKET_COMPROVANTE = 'receipts';
export const BUCKET_DOCUMENTO = 'purchase-order-documents';
export const MENSAGEM_LINK_RECUSADO = 'link inválido ou vencido';
export const MENSAGEM_CONFLITO = 'Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIAS: CategoriaDocumentoPedido[] = ['NOTA_FISCAL', 'RECIBO', 'COMPROVANTE', 'BOLETO', 'OUTRO'];
const MAX_ITENS = 500;
const MAX_PATHS = 100;

export type PedidoDaEdge =
    | { acao: 'receber'; token: string | null; orderId: string; receiptId: string; versao: number; itens: EntradaDoItem[]; notas: string | null; foto: string | null }
    | { acao: 'retirada'; token: string | null; orderId: string; versao: number; data: string; employeeId: string }
    | { acao: 'comprovante_subir'; token: string | null; orderId: string; receiptId: string }
    | { acao: 'documento_subir'; token: string | null; orderId: string; nome: string; tamanho: number }
    | { acao: 'documento_registrar'; token: string | null; orderId: string; path: string; nome: string; tamanho: number; tipo: string | null; categoria: CategoriaDocumentoPedido; descricao: string | null }
    | { acao: 'assinar'; token: string | null; orderId: string; paths: string[] };

type Validacao = { ok: true; pedido: PedidoDaEdge } | { ok: false; erro: string };

const texto = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function itens(v: unknown): EntradaDoItem[] | null {
    if (!Array.isArray(v) || v.length === 0 || v.length > MAX_ITENS) return null;
    const out: EntradaDoItem[] = [];
    for (const raw of v) {
        if (!raw || typeof raw !== 'object') return null;
        const r = raw as Record<string, unknown>;
        if (!Number.isInteger(r.indice) || typeof r.recebida !== 'number' || !Number.isFinite(r.recebida)) return null;
        if (r.problema != null && r.problema !== 'faltando' && r.problema !== 'quebrado') return null;
        if (r.restoDepois != null && typeof r.restoDepois !== 'boolean') return null;
        out.push({
            indice: r.indice as number,
            recebida: r.recebida,
            problema: (r.problema ?? null) as Problema | null,
            restoDepois: r.restoDepois === true,
            obs: texto(r.obs, 500),
        });
    }
    return out;
}

/** Valida o corpo. Só formato — quem pode o quê decide o banco. */
export function validarPedido(corpo: unknown): Validacao {
    if (!corpo || typeof corpo !== 'object') return { ok: false, erro: 'Corpo inválido.' };
    const b = corpo as Record<string, unknown>;

    let token: string | null = null;
    if (b.token !== undefined && b.token !== null) {
        if (typeof b.token !== 'string' || !TOKEN.test(b.token)) return { ok: false, erro: 'Link inválido.' };
        token = b.token;
    }
    if (typeof b.orderId !== 'string' || !UUID.test(b.orderId)) return { ok: false, erro: 'Pedido inválido.' };
    const orderId = b.orderId.toLowerCase();

    switch (b.acao) {
        case 'receber': {
            if (typeof b.receiptId !== 'string' || !UUID.test(b.receiptId)) return { ok: false, erro: 'Conferência sem identificador.' };
            if (!Number.isInteger(b.versao)) return { ok: false, erro: 'Versão do pedido inválida.' };
            const its = itens(b.itens);
            if (!its) return { ok: false, erro: 'Itens da conferência inválidos.' };
            const foto = b.foto == null ? null : (typeof b.foto === 'string' ? b.foto : undefined);
            if (foto === undefined) return { ok: false, erro: 'Foto inválida.' };
            return { ok: true, pedido: { acao: 'receber', token, orderId, receiptId: b.receiptId.toLowerCase(), versao: b.versao as number, itens: its, notas: texto(b.notas, 2000), foto } };
        }
        case 'retirada': {
            if (!Number.isInteger(b.versao)) return { ok: false, erro: 'Versão do pedido inválida.' };
            if (typeof b.data !== 'string' || !DATA.test(b.data)) return { ok: false, erro: 'Data da retirada inválida.' };
            if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) return { ok: false, erro: 'Informe quem retirou.' };
            return { ok: true, pedido: { acao: 'retirada', token, orderId, versao: b.versao as number, data: b.data, employeeId: b.employeeId.toLowerCase() } };
        }
        case 'comprovante_subir': {
            if (typeof b.receiptId !== 'string' || !UUID.test(b.receiptId)) return { ok: false, erro: 'Conferência sem identificador.' };
            return { ok: true, pedido: { acao: 'comprovante_subir', token, orderId, receiptId: b.receiptId.toLowerCase() } };
        }
        case 'documento_subir': {
            const nome = texto(b.nome, 200);
            const tamanho = typeof b.tamanho === 'number' ? b.tamanho : NaN;
            if (!nome || !Number.isFinite(tamanho) || tamanho <= 0) return { ok: false, erro: 'Arquivo inválido.' };
            const erro = erroDoArquivoDocumento({ name: nome, size: tamanho });
            if (erro) return { ok: false, erro };
            return { ok: true, pedido: { acao: 'documento_subir', token, orderId, nome, tamanho } };
        }
        case 'documento_registrar': {
            const nome = texto(b.nome, 200);
            const tamanho = typeof b.tamanho === 'number' ? b.tamanho : NaN;
            if (!nome || !Number.isFinite(tamanho) || tamanho <= 0) return { ok: false, erro: 'Arquivo inválido.' };
            const erro = erroDoArquivoDocumento({ name: nome, size: tamanho });
            if (erro) return { ok: false, erro };
            if (typeof b.path !== 'string' || !b.path.startsWith(`${orderId}/`) || b.path.includes('..') || b.path.split('/').length !== 2) {
                return { ok: false, erro: 'Arquivo fora da pasta do pedido.' };
            }
            if (!CATEGORIAS.includes(b.categoria as CategoriaDocumentoPedido)) return { ok: false, erro: 'Categoria inválida.' };
            return { ok: true, pedido: { acao: 'documento_registrar', token, orderId, path: b.path, nome, tamanho, tipo: texto(b.tipo, 100), categoria: b.categoria as CategoriaDocumentoPedido, descricao: texto(b.descricao, 500) } };
        }
        case 'assinar': {
            if (!Array.isArray(b.paths) || b.paths.length === 0 || b.paths.length > MAX_PATHS
                || b.paths.some(p => typeof p !== 'string' || !p || p.length > 300)) {
                return { ok: false, erro: 'Arquivos inválidos.' };
            }
            return { ok: true, pedido: { acao: 'assinar', token, orderId, paths: [...new Set(b.paths as string[])] } };
        }
        default:
            return { ok: false, erro: 'Ação inválida.' };
    }
}

/** A cota do link de cada ação (`_celular_recebimento_autoriza`). */
export function acaoDaCota(acao: PedidoDaEdge['acao']): 'receber' | 'retirada' | 'subir' | 'assinar' {
    if (acao === 'receber' || acao === 'retirada' || acao === 'assinar') return acao;
    return 'subir';
}

/**
 * Erro do banco → resposta HTTP. 42501 → 403 (a tela do link reconhece a recusa
 * do token pela mensagem); 22023 → 400; 40001 → 409 (versão); 54000 → 429; o
 * resto → 500, e só ele vai para o log.
 */
export function respostaDoErro(erro: { code?: string; message?: string } | null | undefined): { status: number; corpo: { error: string }; logar: boolean } {
    const code = erro?.code;
    const msg = (erro?.message ?? '').trim();
    if (code === '42501') return { status: 403, corpo: { error: msg || MENSAGEM_LINK_RECUSADO }, logar: false };
    if (code === '22023') return { status: 400, corpo: { error: msg || 'Pedido inválido.' }, logar: false };
    if (code === '40001' || msg.startsWith('CONFLICT')) return { status: 409, corpo: { error: MENSAGEM_CONFLITO }, logar: false };
    if (code === '54000') return { status: 429, corpo: { error: msg || 'Limite de uso do link atingido — tente de novo na próxima hora.' }, logar: false };
    return { status: 500, corpo: { error: 'Falha ao registrar o recebimento. Tente de novo.' }, logar: true };
}

/** Nome do arquivo no bucket: `<pedido>/<uuid>_<nome sem acento/espaço>` (mesmo padrão do pedidoDocumentoService). */
export function pathDoDocumento(orderId: string, uuid: string, nomeLimpo: string): string {
    return `${orderId}/${uuid}_${nomeLimpo}`;
}
