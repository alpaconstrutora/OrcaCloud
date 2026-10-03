/**
 * URL hash-based tab routing.
 * Each browser tab/window has its own URL hash, so multiple tabs can show
 * different views independently (e.g., Tab 1 = #/orcamento, Tab 2 = #/planejamento).
 */

export function parseHashView(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const view = hash.substring(2).split('?')[0];
  return view || null;
}

/** Read initial view from URL hash, falling back to localStorage. */
export function getInitialView(): string {
  if (typeof window === 'undefined') return 'central';
  const fromHash = parseHashView(window.location.hash);
  if (fromHash) return fromHash;
  return localStorage.getItem('orca_activeView') || 'central';
}

/**
 * Sync the current view to the URL hash without triggering hashchange.
 *
 * ⚠️ Só reescreve quando a VISTA é outra. Antes comparava o hash inteiro e,
 * com isso, apagava a query dos links diretos (`#/blueprint?studyId=…`,
 * `#/planta-ai?studyId=…`): a vista carregada sob demanda (Suspense) montava
 * DEPOIS deste sync e já não achava o parâmetro (02/10/2026, prova no app real).
 */
export function syncViewToUrl(view: string): void {
  if (typeof window === 'undefined') return;
  if (parseHashView(window.location.hash) === view) return;
  window.history.replaceState(null, '', `#/${view}`);
}

/** Build a URL for a specific view (for opening in new tab/window). */
export function viewUrl(view: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/${view}`;
}

/** Broadcast a sign-out event to all other tabs/windows of this app. */
export function broadcastSignOut(): void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const ch = new BroadcastChannel('orca_auth_sync');
  ch.postMessage({ type: 'SIGNED_OUT' });
  ch.close();
}
