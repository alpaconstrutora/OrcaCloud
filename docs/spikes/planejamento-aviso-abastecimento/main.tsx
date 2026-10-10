/**
 * Harness: Engenharia › Planejamento — o banner "etapas em risco de abastecimento"
 * virou ícone com contador no ribbon + painel lateral (pedido de 10/10/2026).
 *
 * Componentes de produção sem mock: `ScheduleHeader` e `PainelRiscoAbastecimento`.
 * A ligação entre os dois repete a de `FinancialSchedule.tsx` (estado `aberto`,
 * resumo → ribbon, insights + hierarquia → painel). As 51 props do cabeçalho vêm
 * de um Proxy (ver docs/spikes/planejamento-sem-titulo/main.tsx).
 *
 * `?sem-risco` renderiza sem nenhum alerta (o ícone não pode aparecer).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ScheduleHeader from '../../../components/schedule/ScheduleHeader';
import PainelRiscoAbastecimento from '../../../components/schedule/PainelRiscoAbastecimento';
import { ConfirmProvider } from '../../../components/ui/confirm';

const semRisco = new URLSearchParams(location.search).has('sem-risco');

const nomes = [
    'Serviços Iniciais', 'Instalações Provisórias', 'Locação da obra com gabarito de madeira',
    'Fundação', 'Escavação manual de vala com profundidade até 1,5 m', 'Lastro de concreto magro',
    'Armação de bloco, viga baldrame ou sapata utilizando aço CA-50 de 10 mm — montagem',
    'Concreto fck = 25 MPa, traço 1:2,3:2,7, preparo mecânico com betoneira 400 L',
];
const hierarchy = [{
    id: 'g', uid: 'g', type: 'group', name: 'Obra', wbsCode: '00', level: 0,
    children: nomes.map((n, i) => ({ id: `n${i}`, uid: `n${i}`, type: 'item', name: n, wbsCode: `01.0${i + 1}`, children: [], level: 1 })),
}] as any[];
const taskInsights: Record<string, { missingItems: number; missingCost: number }> = semRisco ? {} :
    Object.fromEntries(nomes.map((_, i) => [`n${i}`, { missingItems: (i % 4) + 1, missingCost: 1200 * (i + 1) * 7.3 }]));
const resumo = semRisco ? null : { etapas: nomes.length, insumos: 126, custo: 254752.28 };

const base: Record<string, unknown> = {
    onBack: () => {},
    telaCheia: false,
    settings: { name: 'Casa de Formação', schedule: {} },
    projects: [],
    viewMode: 'gantt',
    timeScale: 'day',
    schedule: { startDate: '2026-11-01', endDate: '2027-03-20', itemSchedules: [], distributions: [], baselines: [] },
    isSimulationMode: false, isExportingPDF: false, allExpanded: false, allAuto: false, hasNewerBudgetVersion: false,
};
const noop = () => {};

function Harness() {
    const [aberto, setAberto] = React.useState(false);
    const props = React.useMemo(() => new Proxy({ ...base, riscoDeAbastecimento: resumo, onAbrirRiscoDeAbastecimento: () => setAberto(true) }, {
        get(t: Record<string, unknown>, k: string) {
            if (k in t) return t[k];
            if (/Cols$|Levels$|Natures$/.test(k)) return new Set();
            if (/Count$|Length$/.test(k)) return 0;
            return noop;
        },
    }), []);
    (window as any).__aberto = aberto;
    return (
        <div className="space-y-6">
            {(ScheduleHeader as any)(props)}
            <PainelRiscoAbastecimento
                open={aberto}
                onClose={() => setAberto(false)}
                resumo={resumo ?? { etapas: 0, insumos: 0, custo: 0 }}
                taskInsights={taskInsights}
                hierarchy={hierarchy}
            />
            {/* O que vem logo abaixo na tela real: a grade. Sem banner no meio.
                Dentro dela, as MESMAS camadas do cabeçalho fixo do Gantt
                (ScheduleGantt.tsx: `sticky top-0 z-50`, coluna fixa `z-60`,
                popovers `z-[100]`) — e DEPOIS do painel no DOM, como na tela real.
                Foi assim que o cabeçalho do Gantt apareceu por cima do painel. */}
            <div data-grade className="h-64 rounded-[10px] border border-gray-100 bg-white overflow-auto">
                <div data-cabecalho-gantt className="sticky top-0 z-50 flex h-12 bg-gray-50 border-b border-gray-200">
                    <div className="sticky left-0 z-60 w-[440px] shrink-0 bg-gray-50 px-4 py-3 text-xs text-gray-400">TAREFA / ATIVIDADE</div>
                    <div className="relative z-[100] flex-1 px-4 py-3 text-xs text-gray-400">Novembro 2026</div>
                </div>
            </div>
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
