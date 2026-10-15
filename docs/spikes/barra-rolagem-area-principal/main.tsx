/**
 * Harness: o `Layout` DE PRODUÇÃO (menu lateral + barra superior + <main>) com
 * conteúdo curto ou longo, para medir a barra de rolagem da área principal
 * (15/10/2026 — saiu `scrollbar-hide`, entrou `[scrollbar-gutter:stable]`).
 *
 *   ?conteudo=longo (padrão) — tela que rola: a barra tem de aparecer
 *   ?conteudo=curto          — tela que não rola: o conteúdo tem de ficar na
 *                              MESMA largura da longa (o espaço da barra é reservado)
 *
 * Sem sessão: o Layout desenha com o perfil padrão e o store vazio. Só se mede a
 * moldura e a área de conteúdo.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import Layout from '../../../components/Layout';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';
import { ligarBarraDeRolagemProxima } from '../../../utils/barraDeRolagemProxima';

ligarBarraDeRolagemProxima();
const longo = (new URLSearchParams(location.search).get('conteudo') ?? 'longo') === 'longo';

function Conteudo() {
  return (
    <div className="space-y-6 pb-20" data-el="raiz-tela">
      <h1 className="text-3xl font-bold text-gray-900">Tela de teste</h1>
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6" data-el="card">
        {(longo ? Array.from({ length: 80 }) : Array.from({ length: 3 })).map((_, i) => (
          <p key={i} className="py-2 border-b border-gray-100 text-sm text-gray-700">Linha {i + 1}</p>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <ToastProvider>
      <Layout
        activeView="dashboard"
        onChangeView={() => {}}
        projectName="Harness"
        onEditProject={() => {}}
        onSaveProject={() => {}}
        onDeleteProject={() => {}}
      >
        <Conteudo />
      </Layout>
    </ToastProvider>
  </ConfirmProvider>,
);
