/**
 * Corte de tempo do fetch do client Supabase, por tipo de chamada.
 *
 * 20 s: banco/PostgREST, RPC, auth e storage — sem corte, um backend travado
 * deixa a UI presa em "Sincronizando..." para sempre.
 *
 * 150 s: Edge Function (16/10/2026). Ela tem prazo próprio no servidor (o
 * gateway corta em 150 s) e algumas trabalham mais que 20 s de propósito — IA,
 * importação, leitura de PDFs. Com 20 s, a busca por período da captura de
 * boletos (32 s) terminou certa no servidor e o navegador mostrou
 * "Failed to send a request to the Edge Function".
 */
export const REQUEST_TIMEOUT_MS = 20_000;
export const EDGE_FUNCTION_TIMEOUT_MS = 150_000;

export function tempoLimiteDaRequisicao(input: RequestInfo | URL): number {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let caminho: string;
    try {
        caminho = new URL(url).pathname;
    } catch {
        caminho = url;
    }
    return caminho.startsWith('/functions/v1/') ? EDGE_FUNCTION_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}
