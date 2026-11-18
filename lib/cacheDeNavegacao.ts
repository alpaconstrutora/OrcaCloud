/**
 * Cache de NAVEGAÇÃO do Service Worker (rota `request.mode === 'navigate'` em
 * `vite.config.ts` → `runtimeCaching`, NetworkFirst com 4 s de espera).
 *
 * O que ele guarda é sempre o MESMO `index.html` da SPA (o Vercel reescreve toda
 * rota fora de `/assets/` para ele). Serve de reserva quando a rede demora — não
 * abre portal nenhum offline: os bundles JS não são precacheados e o Vercel os
 * entrega com `max-age=0, must-revalidate`.
 *
 * ── O problema (18/11/2026, revisão da varredura de segurança) ──────────────
 * O cache antigo (`navigation-cache`) era chaveado pela URL INTEIRA. Abrir
 * `/portal-cliente?token=…`, `/portal-sindico?token=…`, `/celular?token=…` ou
 * `/pedido/<token>` deixava o token de acesso do portal gravado no Cache
 * Storage do navegador — sem prazo, sobrevivendo a "Sair", legível por quem usar
 * o mesmo navegador depois (DevTools › Application › Cache Storage). E a própria
 * resposta guardada carrega `response.url`, com o token.
 *
 * ── O que mudou ─────────────────────────────────────────────────────────────
 * - Cache novo (`CACHE_NAVEGACAO`), chaveado SEM a query e com segmento-UUID do
 *   caminho trocado por `:id` (`chaveDoCacheDeNavegacao`). O HTML é o mesmo para
 *   qualquer query/id, e o app lê o token de `window.location`, não do cache:
 *   a reserva continua funcionando igual para os portais.
 * - A resposta é regravada sem `url` (`respostaSemUrl`), e só a 200 da própria
 *   origem é guardada (redirect opaco carregaria a URL pedida).
 * - O cache antigo é apagado no boot (`index.tsx`), com tudo o que tinha.
 *
 * ⚠️ As duas funções abaixo são SERIALIZADAS pelo workbox-build (`toString()`)
 * para dentro do `sw.js`. Elas não podem usar NADA de fora do próprio corpo —
 * nem import, nem constante deste arquivo. `__tests__/cacheDeNavegacao.test.ts`
 * confere isso recriando cada uma a partir do texto.
 */

export const CACHE_NAVEGACAO = 'navigation-cache-v2';
/** Nome antigo, chaveado pela URL inteira (com `?token=`). Apagado no boot. */
export const CACHE_NAVEGACAO_LEGADO = 'navigation-cache';

/**
 * Plugin Workbox `cacheKeyWillBeUsed`: a chave de leitura e de escrita do cache
 * de navegação é a origem + o caminho, sem query nem fragmento, com todo
 * segmento que é um UUID (token de compartilhamento: `/pedido/<uuid>`,
 * `/proposta/<uuid>`…) trocado por `:id`.
 */
export async function chaveDoCacheDeNavegacao({ request }: { request: Request }): Promise<string> {
    const url = new URL(request.url);
    const caminho = url.pathname.replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
        '/:id',
    );
    return url.origin + caminho;
}

/**
 * Plugin Workbox `cacheWillUpdate`: só a resposta 200 da própria origem entra, e
 * entra REGRAVADA (`new Response`), para não levar junto `response.url` — que é
 * a URL pedida, com o token. Qualquer outra (redirect opaco, erro) não é guardada.
 */
export async function respostaSemUrl({ response }: { response: Response }): Promise<Response | null> {
    if (!response || response.status !== 200 || response.type !== 'basic') return null;
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
