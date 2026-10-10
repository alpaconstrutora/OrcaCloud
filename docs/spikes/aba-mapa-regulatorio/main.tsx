/**
 * Harness da aba Mapa Regulatório dentro da Planta Inteligente (10/10/2026).
 *
 * Monta o `BlueprintModule` REAL. Sem login, o `medir.mjs` intercepta o REST do
 * Supabase (só leitura; escrita é abortada) e devolve uma planta e um mapa.
 * A coluna da esquerda imita a sidebar (256 px) e o `<main>` repete o gutter do
 * Layout (`p-6`) — sem eles a largura útil mentiria (ver memória "harness sem
 * sidebar mente sobre largura").
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintModule from '../../../components/blueprint/BlueprintModule';
import { ConfirmProvider } from '../../../components/ui/confirm';

const semPermissao = new URLSearchParams(location.search).has('sem-permissao');

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <BlueprintModule podeVerMapaRegulatorio={!semPermissao} />
      </main>
    </div>
  </ConfirmProvider>,
);
