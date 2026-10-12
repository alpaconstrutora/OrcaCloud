import { useEffect, useCallback } from 'react';
import { parseHashView, syncViewToUrl } from '../lib/tabRouter';
import { haPendenciaDeSaida, limparPendencias } from '../lib/guardaDeSaida';

/**
 * Enables multi-tab/window routing:
 * - Listens to URL hash changes so back/forward and manually typed URLs work.
 * - BroadcastChannel syncs sign-out events across all open tabs/windows.
 */
export function useTabRouter(
  activeView: string,
  setActiveView: (view: string) => void,
  onSignedOut: () => void,
  /** Pergunta antes de sair de uma tela com edição não salva (lib/guardaDeSaida.ts). */
  confirmarSaida?: () => Promise<boolean>,
) {
  // Update state when the URL hash changes (e.g. browser back/forward, or
  // another piece of code calls window.history.pushState with a new hash).
  useEffect(() => {
    const handle = async () => {
      const view = parseHashView(window.location.hash);
      if (!view || view === activeView) return;
      // Voltar/avançar com edição pendente: pergunta; se o usuário fica, o
      // endereço volta para a tela atual (o hash já tinha mudado).
      if (confirmarSaida && haPendenciaDeSaida()) {
        if (!(await confirmarSaida())) {
          syncViewToUrl(activeView);
          return;
        }
        limparPendencias();
      }
      setActiveView(view);
    };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [activeView, setActiveView, confirmarSaida]);

  // Cross-tab sign-out sync: when any tab logs out, all others log out too.
  const stableOnSignedOut = useCallback(onSignedOut, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const ch = new BroadcastChannel('orca_auth_sync');
    ch.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'SIGNED_OUT') stableOnSignedOut();
    };
    return () => ch.close();
  }, [stableOnSignedOut]);
}
