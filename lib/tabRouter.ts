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
  if (typeof window === 'undefined') return 'eng-obras';
  const fromHash = parseHashView(window.location.hash);
  if (fromHash) return fromHash;
  return localStorage.getItem('orca_activeView') || 'eng-obras';
}

/** Sync the current view to the URL hash without triggering hashchange. */
export function syncViewToUrl(view: string): void {
  if (typeof window === 'undefined') return;
  const newHash = `#/${view}`;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash);
  }
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
