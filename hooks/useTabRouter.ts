import { useEffect, useCallback } from 'react';
import { parseHashView } from '../lib/tabRouter';

/**
 * Enables multi-tab/window routing:
 * - Listens to URL hash changes so back/forward and manually typed URLs work.
 * - BroadcastChannel syncs sign-out events across all open tabs/windows.
 */
export function useTabRouter(
  activeView: string,
  setActiveView: (view: string) => void,
  onSignedOut: () => void,
) {
  // Update state when the URL hash changes (e.g. browser back/forward, or
  // another piece of code calls window.history.pushState with a new hash).
  useEffect(() => {
    const handle = () => {
      const view = parseHashView(window.location.hash);
      if (view && view !== activeView) {
        setActiveView(view);
      }
    };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [activeView, setActiveView]);

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
