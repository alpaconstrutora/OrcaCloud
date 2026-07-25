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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
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
    setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(() => {});
}