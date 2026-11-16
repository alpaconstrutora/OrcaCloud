import { proPublicoAtivo } from '../utils/proPublico';
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
  // ÒPURA Pro público (/pro): não há telas do app ali — sem `#/central` no endereço do autônomo.
  if (proPublicoAtivo(window.location.pathname)) return;
  if (parseHashView(window.location.hash) === view) return;
  window.history.replaceState(null, '', `#/${view}`);
}

/** Build a URL for a specific view (for opening in new tab/window). */
export function viewUrl(view: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/${view}`;
}

/**
 * Identidade DESTE documento (aba/janela) no aviso de saída. O BroadcastChannel entrega a
 * mensagem a todo OUTRO objeto de canal com o mesmo nome — inclusive o ouvinte da própria
 * aba (`hooks/useTabRouter`), que é outro objeto. Sem a identidade, a aba que clicou em
 * "Sair" ouvia o próprio aviso e saía de novo (ver `ehAvisoDeSaidaDeOutraAba`).
 */
const ESTA_ABA = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Broadcast a sign-out event to all other tabs/windows of this app. */
export function broadcastSignOut(): void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const ch = new BroadcastChannel('orca_auth_sync');
  ch.postMessage({ type: 'SIGNED_OUT', origem: ESTA_ABA });
  ch.close();
}

/**
 * O aviso recebido é um "Sair" de OUTRA aba? (o da própria aba é ignorado).
 *
 * ⚠️ Quem recebe NÃO reenvia o aviso — `sairPorAvisoDeOutraAba` (store/useStore.ts) chama
 * `logout({ avisarOutrasAbas: false })`. Até 16/11/2026 o ouvinte chamava `logout()`, que
 * reenviava: cada aba que ouvia avisava as outras e a si mesma, sem fim — >1.000 avisos em
 * 0,3 s medidos em produção, e cada reenvio reiniciava a navegação para "/" (com 3 abas
 * abertas nenhuma terminava de carregar). Teste: `__tests__/sairEcoEntreAbas.test.ts`.
 *
 * Aviso sem `origem` (aba ainda rodando o build anterior) conta como de outra aba.
 */
export function ehAvisoDeSaidaDeOutraAba(dados: unknown): boolean {
  const d = dados as { type?: unknown; origem?: unknown } | null | undefined;
  return d?.type === 'SIGNED_OUT' && d.origem !== ESTA_ABA;
}
