/**
 * Harness: Engenharia › Planejamento sem a faixa de título — o voltar mora no
 * ribbon, como na Planta Inteligente (pedido de 10/10/2026).
 *
 * O componente sob teste é o `ScheduleHeader` de produção. As 51 props vêm de
 * um Proxy: as que importam para o cabeçalho têm valor de verdade; o resto é
 * função vazia, `Set` vazio (colunas/níveis/naturezas) ou zero (contagens).
 * Ele é chamado como função dentro de um componente porque `{...proxy}` não
 * copia as chaves de um Proxy sem `ownKeys`.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ScheduleHeader from '../../../components/schedule/ScheduleHeader';

const base: Record<string, unknown> = {
    onBack: () => { (window as any).__voltou = ((window as any).__voltou ?? 0) + 1; },
    telaCheia: false,
    settings: { name: 'Casa de Formação', linkedProjectId: 'orc1', schedule: {} },
    projects: [{ id: 'orc1', name: 'Casa de Formação', settings: { classification: 'ORCAMENTO' } }],
    viewMode: 'gantt',
    timeScale: 'week',
    schedule: { startDate: '2026-03-20', endDate: '2027-03-20', itemSchedules: [], distributions: [], baselines: [] },
    isSimulationMode: false,
    isExportingPDF: false,
    allExpanded: false,
    allAuto: false,
    hasNewerBudgetVersion: false,
};
const noop = () => {};
const props = new Proxy(base, {
    get(t, k: string) {
        if (k in t) return t[k];
        if (/Cols$|Levels$|Natures$/.test(k)) return new Set();
        if (/Count$|Length$/.test(k)) return 0;
        return noop;
    },
});

function Harness() {
    // Raiz da tela do Planejamento: `space-y-6` (ver FinancialSchedule.tsx).
    return <div className="space-y-6">{(ScheduleHeader as any)(props)}</div>;
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
