/**
 * Caches do Service Worker com arquivos do Supabase Storage (ver `runtimeCaching`
 * em `vite.config.ts`).
 *
 * - `CACHE_STORAGE_PUBLICO`: o único que o SW ainda grava — só URLs de bucket
 *   PÚBLICO (`/object/public/`, `/render/image/public/`).
 * - `CACHE_STORAGE_LEGADO`: nome antigo. Guardava QUALQUER GET em `/storage/`
 *   (download autenticado de bucket privado, URL assinada) por 30 dias, chaveado
 *   só pela URL: sobrevivia ao logout e respondia sem passar pela RLS do Storage.
 *   Nada mais grava nele; é apagado no boot (`index.tsx`) e ao sair.
 */
export const CACHE_STORAGE_PUBLICO = 'supabase-storage-public-cache';
export const CACHE_STORAGE_LEGADO = 'supabase-storage-cache';

/**
 * Buckets que eram públicos e viraram privados (documento de RH, contrato,
 * relatório — lib/storageAssinado.ts). O SW guardou arquivo deles por até 30
 * dias em `CACHE_STORAGE_PUBLICO`; a URL não serve mais, mas a cópia guardada
 * respondia sem login neste navegador. O SW novo não os grava (vite.config.ts).
 */
const BUCKETS_QUE_VIRARAM_PRIVADOS = /\/storage\/v1\/(?:object|render\/image)\/public\/(?:documents|organization-assets)\//i;

/** Apaga do cache público as entradas dos buckets que viraram privados (boot). */
export async function limparDoCachePublicoOsBucketsPrivados(): Promise<number> {
  try {
    if (typeof caches === 'undefined') return 0;
    if (!(await caches.has(CACHE_STORAGE_PUBLICO))) return 0;
    const cache = await caches.open(CACHE_STORAGE_PUBLICO);
    let apagadas = 0;
    for (const pedido of await cache.keys()) {
      if (BUCKETS_QUE_VIRARAM_PRIVADOS.test(pedido.url) && await cache.delete(pedido)) apagadas++;
    }
    return apagadas;
  } catch {
    // Cache Storage indisponível (contexto inseguro, modo privado) — nada a limpar.
    return 0;
  }
}

/** Apaga os caches do Storage no navegador. Nada guardado ali sobrevive à sessão. */
export function limparCacheDoStorage(): void {
  try {
    if (typeof caches === 'undefined') return;
    for (const nome of [CACHE_STORAGE_PUBLICO, CACHE_STORAGE_LEGADO]) {
      caches.delete(nome).catch(() => {});
    }
  } catch {
    // Cache Storage indisponível (contexto inseguro, modo privado) — nada a limpar.
  }
}
