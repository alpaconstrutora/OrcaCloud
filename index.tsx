import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { queryClient } from './lib/queryClient';
import { ConfirmProvider } from './components/ui/confirm';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

// PWA auto-update: quando um service worker novo (skipWaiting/clientsClaim) assume o
// controle, a aba aberta segue rodando o JS antigo até recarregar. Aqui forçamos um
// reload único nesse momento — assim o usuário pega o deploy novo sem unregister manual.
// O guard `hadController` evita o reload na primeira instalação (claim inicial).
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  /* Trava ANTI-LOOP. A `reloading` abaixo é variável de módulo: some a cada
     recarga. E `hadController` passa a ser true depois do primeiro reload. Ou
     seja, nada impedia o segundo, o terceiro, o enésimo — bastava o
     `controllerchange` disparar de novo, o que acontece toda vez que um SW
     novo assume. Com mais de um deploy em circulação (CDN servindo versões
     diferentes entre requisições), a checagem periódica achava "versão nova" a
     cada rodada e a aba entrava em recarga perpétua.

     `sessionStorage` sobrevive à recarga na mesma aba — é o único lugar onde a
     trava tem efeito. Um auto-reload por janela de tempo, no máximo. */
  const RELOAD_AT_KEY = 'orca_sw_reload_at';
  const MIN_RELOAD_INTERVAL_MS = 5 * 60 * 1000;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;

    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    if (Date.now() - last < MIN_RELOAD_INTERVAL_MS) {
      // Atualização fica para a próxima navegação. Melhor servir JS de um
      // deploy atrás do que prender o usuário num ciclo de recargas.
      console.warn('[PWA] Versão nova detectada, recarga automática suprimida (proteção anti-loop).');
      return;
    }

    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    reloading = true;
    window.location.reload();
  });
  // Limpeza única do cache legado de REST do Supabase (removido do vite.config).
  // O SW novo é NetworkOnly nessas rotas e não usa mais esse cache; apagamos as
  // entradas antigas para não deixar dado velho ocupando storage.
  if ('caches' in window) {
    caches.delete('supabase-api-cache').catch(() => {});
  }
  // Tabs abertas por muito tempo: checa atualização do SW periodicamente (e ao voltar o foco).
  navigator.serviceWorker.ready.then((reg) => {
    const check = () => { reg.update().catch(() => {}); };
    /* 30 min, não 60s. A cada checagem que encontra SW novo o controle troca e
       a aba recarrega — a cada minuto isso transforma qualquer sequência de
       deploys em recarga contínua. A checagem por `visibilitychange` abaixo já
       cobre o caso real (usuário volta para a aba depois de um tempo). */
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(() => {});
}