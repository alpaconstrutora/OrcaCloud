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
