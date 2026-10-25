/**
 * Harness: monta o `LaborFiscalSettings` DE PRODUÇÃO (RH › Configurações Fiscais)
 * para conferir na tela as abas e as tabelas de 25/10/2026
 * (docs/planos/2026-10-25-rh-configuracoes-fiscais-abas-tabela.md).
 *
 * As leituras e escritas do PostgREST são servidas pelo `passeio.mjs` (page.route,
 * banco em memória) — nada chega ao Supabase. A casca reproduz a largura útil do app:
 * barra lateral de 260px + gutter do Layout (§20.2: 24px no desktop).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import LaborFiscalSettings from '../../../components/LaborFiscalSettings';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';

function Harness() {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <div className="flex min-h-screen">
          <aside style={{ width: 260 }} className="shrink-0 bg-slate-900" />
          <main className="flex-1 min-w-0 p-4 md:p-6">
            <LaborFiscalSettings />
          </main>
        </div>
      </ToastProvider>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
