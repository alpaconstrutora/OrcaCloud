// Regras PURAS da Edge `pedido-fast`. Sem Deno e sem import por URL de propósito:
// o Vitest importa este arquivo (`__tests__/pedidoFastEdgeRegras.test.ts`).
// Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 1, item 5).
//
// Quem decide se o USUÁRIO pode pedir é o banco (`fn_pode_criar_pedido_de`);
// aqui só se confere a forma do pedido e se montam os paths do lote.

import { MAX_FOTOS_FAST } from '../../../lib/pedidoFast.ts';

/** Bucket dos anexos do pedido (o mesmo de `services/pedidoDocumentoService.ts`). */
export const BUCKET = 'purchase-order-documents';

/** Raiz dos lotes temporários: `fast-tmp/<user>/<lote>/…`. */
export const RAIZ_TEMPORARIA = 'fast-tmp';

/**
 * ~5 MB de imagem em base64 (como `planta-ia`). A tela comprime antes
 * (`utils/comprimirFoto.ts`, 2048 px, JPEG 0,82) — uma foto de nota fica bem abaixo.
 */
export const MAX_BASE64_POR_FOTO = 7_000_000;

/** Lote temporário mais velho que isto é apagado (best-effort, a cada `ler`). */
export const IDADE_MAXIMA_DO_LOTE_MS = 24 * 60 * 60 * 1000;

/** Tipos que a API de visão aceita. HEIC não: a tela converte para JPEG antes. */
export const TIPOS_DE_IMAGEM: Readonly<Record<string, string>> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export interface FotoRecebida {
    base64: string;
    mediaType: string;
}

export type PedidoFast =
    | { acao: 'ler'; fotos: FotoRecebida[]; token: string | null }
    | { acao: 'criar'; lote: string; projectId: string; token: string | null };

export type ResultadoValidacao =
    | { ok: true; pedido: PedidoFast }
    | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const recusa = (erro: string): ResultadoValidacao => ({ ok: false, erro });

export function ehUuid(v: unknown): v is string {
    return typeof v === 'string' && UUID.test(v);
}

export function validarPedido(body: unknown): ResultadoValidacao {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return recusa('Corpo inválido.');
    }
    const b = body as Record<string, unknown>;

    // Parte 2 (link do celular): o token vem no corpo. Sem ele, é o app logado (JWT).
    let token: string | null = null;
    if (b.token !== undefined && b.token !== null) {
        if (typeof b.token !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(b.token)) return recusa('Link inválido.');
        token = b.token;
    }

    if (b.acao === 'ler') {
        if (!Array.isArray(b.fotos) || b.fotos.length < 1 || b.fotos.length > MAX_FOTOS_FAST) {
            return recusa(`Envie de 1 a ${MAX_FOTOS_FAST} fotos.`);
        }
        const fotos: FotoRecebida[] = [];
        for (const f of b.fotos) {
            const foto = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
            if (typeof foto.mediaType !== 'string' || !TIPOS_DE_IMAGEM[foto.mediaType]) {
                return recusa('Formato de foto não aceito — use JPEG, PNG ou WEBP.');
            }
            if (typeof foto.base64 !== 'string' || foto.base64.length === 0 || !BASE64.test(foto.base64)) {
                return recusa('Foto inválida.');
            }
            if (foto.base64.length > MAX_BASE64_POR_FOTO) {
                return recusa('Foto grande demais (máx. ~5 MB).');
            }
            fotos.push({ base64: foto.base64, mediaType: foto.mediaType });
        }
        return { ok: true, pedido: { acao: 'ler', fotos, token } };
    }

    if (b.acao === 'criar') {
        if (!ehUuid(b.lote)) return recusa('Lote inválido.');
        if (!ehUuid(b.projectId)) return recusa('Escolha a obra.');
        return { ok: true, pedido: { acao: 'criar', lote: b.lote.toLowerCase(), projectId: b.projectId.toLowerCase(), token } };
    }

    return recusa('Ação desconhecida.');
}

/** Pasta do lote — SEMPRE derivada do usuário autorizado, nunca do cliente. */
export function pastaDoLote(userId: string, lote: string): string {
    return `${RAIZ_TEMPORARIA}/${userId}/${lote}`;
}

export function pathDaFotoTemporaria(userId: string, lote: string, indice: number, mediaType: string): string {
    return `${pastaDoLote(userId, lote)}/foto-${indice + 1}.${TIPOS_DE_IMAGEM[mediaType] ?? 'jpg'}`;
}

export const ARQUIVO_DA_LEITURA = 'leitura.json';
export const ARQUIVO_DO_RESULTADO = 'criado.json';

/** `foto-1.jpg` → índice 0; qualquer outro nome → null. */
export function indiceDaFoto(nome: string): number | null {
    const m = /^foto-(\d)\.(jpg|png|webp)$/.exec(nome);
    return m ? Number(m[1]) - 1 : null;
}

/** Path definitivo do anexo: `${orderId}/${uuid}_${nome}`, o formato de `pedidoDocumentoService.enviar`. */
export function pathDoAnexo(orderId: string, uuid: string, numero: string, indice: number, ext: string): string {
    const base = `${numero || 'pedido'}-foto-${indice + 1}`.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `${orderId}/${uuid}_${base}.${ext}`;
}

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
export function hojeEmBrasilia(agora: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(agora);
}

/** Nome de quem comprou: perfil → membro da org → parte local do e-mail. */
export function nomeDoComprador(perfil: string | null | undefined, membro: string | null | undefined, email: string | null | undefined): string {
    const limpo = (s: string | null | undefined) => (s ?? '').trim();
    return limpo(perfil) || limpo(membro) || limpo(email).split('@')[0] || 'comprador';
}

/** Destinatários do aviso: donos/admins da org, sem o próprio comprador, sem repetir. */
export function destinatariosDoAviso(
    membros: { email: string | null; role: string | null }[],
    emailDoComprador: string,
): string[] {
    const comprador = emailDoComprador.trim().toLowerCase();
    const vistos = new Set<string>();
    for (const m of membros) {
        const e = (m.email ?? '').trim().toLowerCase();
        if (!e || e === comprador) continue;
        if (m.role !== 'owner' && m.role !== 'admin') continue;
        vistos.add(e);
    }
    return [...vistos];
}

/** Recusa do token que o gate do link reconhece (`MENSAGEM_LINK_RECUSADO` em services/celular/tarefasFonte.ts). */
export const MENSAGEM_LINK_RECUSADO = 'link inválido ou vencido';

/**
 * Erro do banco na autorização pelo LINK (`_celular_pedido_fast_autoriza`) → resposta HTTP.
 *   42501 → 403 com a mensagem do banco: "link inválido ou vencido" (o gate derruba a
 *           tela) ou "sem acesso a Pedidos de Compra" (o link segue válido);
 *   54000 → 429 (limite de uso por hora — não é recusa do link);
 *   22023 → 400; o resto → 500 (e só ele vai para o log).
 */
export function respostaDoErroDoLink(erro: { code?: string; message?: string } | null | undefined): { status: number; corpo: { error: string }; logar: boolean } {
    const code = erro?.code;
    const msg = (erro?.message ?? '').trim();
    if (code === '42501') return { status: 403, corpo: { error: msg || MENSAGEM_LINK_RECUSADO }, logar: false };
    if (code === '54000') return { status: 429, corpo: { error: msg || 'Limite de uso do link atingido — tente de novo na próxima hora.' }, logar: false };
    if (code === '22023') return { status: 400, corpo: { error: msg || 'Pedido inválido.' }, logar: false };
    return { status: 500, corpo: { error: 'Falha ao conferir o link. Tente de novo.' }, logar: true };
}
