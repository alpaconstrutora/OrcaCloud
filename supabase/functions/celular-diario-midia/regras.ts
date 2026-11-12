// Regras PURAS da Edge `celular-diario-midia` (Diário pelo link do celular).
// Sem Deno e sem import por URL de propósito: o Vitest importa este arquivo
// (`__tests__/celularDiarioMidiaRegras.test.ts`). Quem decide se o TOKEN pode
// mexer na mídia é o banco (RPCs `celular_diario_*`); aqui só se confere a
// forma do pedido e se monta o path.

export const MAX_PATHS = 100;
// Teto por path: {org}/{projeto}/{uuid}.{ext} tem ~85 caracteres; 300 sobra.
export const MAX_TAMANHO_PATH = 300;

// Extensões aceitas no link do celular (Global Constraint do plano): só imagem,
// em minúscula. Nada executável nem renderizável como página (html, svg...).
export const EXTENSOES_PERMITIDAS: readonly string[] = [
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
];

export type PedidoMidia =
    | { acao: 'subir'; token: string; project_id: string; ext: string }
    | { acao: 'assinar'; token: string; paths: string[] }
    | { acao: 'remover'; token: string; project_id: string; paths: string[] };

export type ResultadoValidacao =
    | { ok: true; pedido: PedidoMidia }
    | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recusa = (erro: string): ResultadoValidacao => ({ ok: false, erro });

function pathsValidos(v: unknown): v is string[] {
    return Array.isArray(v)
        && v.length >= 1
        && v.length <= MAX_PATHS
        && v.every(p => typeof p === 'string' && p.trim() !== '' && p.length <= MAX_TAMANHO_PATH);
}

export function validarPedido(body: unknown): ResultadoValidacao {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return recusa('Corpo inválido');
    }
    const b = body as Record<string, unknown>;

    const acao = b.acao;
    if (acao !== 'subir' && acao !== 'assinar' && acao !== 'remover') {
        return recusa('Ação desconhecida');
    }
    if (typeof b.token !== 'string' || b.token.trim() === '') {
        return recusa('token é obrigatório');
    }
    const token = b.token;

    if (acao === 'assinar') {
        if (!pathsValidos(b.paths)) return recusa(`paths deve ter de 1 a ${MAX_PATHS} caminhos de até ${MAX_TAMANHO_PATH} caracteres`);
        return { ok: true, pedido: { acao, token, paths: b.paths } };
    }

    if (typeof b.project_id !== 'string' || !UUID.test(b.project_id)) {
        return recusa('project_id deve ser um uuid');
    }
    // O banco compara o prefixo com `uuid::text` (minúscula): maiúscula quebraria o path.
    const project_id = b.project_id.toLowerCase();

    if (acao === 'subir') {
        if (typeof b.ext !== 'string' || !EXTENSOES_PERMITIDAS.includes(b.ext)) {
            return recusa('Extensão de arquivo não permitida');
        }
        return { ok: true, pedido: { acao, token, project_id, ext: b.ext } };
    }

    if (!pathsValidos(b.paths)) return recusa(`paths deve ter de 1 a ${MAX_PATHS} caminhos de até ${MAX_TAMANHO_PATH} caracteres`);
    return { ok: true, pedido: { acao, token, project_id, paths: b.paths } };
}

// Formato que `_celular_midia_path_ok` (banco) aceita: {org}/{projeto}/{arquivo}.
export function montarPath(org: string, projeto: string, uuid: string, ext: string): string {
    return `${org}/${projeto}/${uuid}.${ext}`;
}
