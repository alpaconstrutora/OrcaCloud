/**
 * Harness: o FinancialDashboard de produção, sem mock de componente, dentro de uma
 * casca com a MESMA largura útil do app (barra lateral de 260px + `<main>` com
 * `p-4 md:p-6` e o gutter da barra de rolagem, components/Layout.tsx).
 *
 * As RPCs são respondidas pelo passeio.mjs (page.route) com respostas reais da Alpa
 * capturadas em 28/10/2026 (fixture-*.json) — ou com estados fabricados (vazio, erro,
 * carregando). Sem login: o supabase client chama com a chave anon e a rota responde.
 *
 * Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import FinancialDashboard from '../../../components/FinancialDashboard';

function Casca() {
    const [navegou, setNavegou] = React.useState<string | null>(null);
    return (
        <div className="flex h-screen bg-gray-50">
            <aside className="hidden md:block w-[260px] shrink-0 bg-[#1a1a1a] border-r" aria-label="Menu (casca do harness)" />
            <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4 md:p-6 relative">
                <span data-navegou={navegou ?? ''} hidden />
                <FinancialDashboard onNavigate={setNavegou} />
            </main>
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(<Casca />);
