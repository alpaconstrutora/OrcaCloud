/**
 * Harness de DESEMPENHO: rolagem do Gantt do Planejamento com muitas tarefas
 * (relato de 11/10/2026: "a barra de rolagem esta travando na visualizacao gantt").
 *
 * `ScheduleGantt` de produção + as funções de `utils/scheduleTimeline.ts`, ligados
 * como em `FinancialSchedule.tsx`. Parâmetros de URL:
 *   ?tarefas=300        número de tarefas (em grupos de 10)
 *   ?escala=day|week|month|year
 *   ?recuo=0            0 = timeline começa no início (como antes de 10/10);
 *                       N = recuo de N passos (o que a tela faz hoje: abre com 1)
 *   ?navegar=0          desliga o recuo automático na borda esquerda
 *   ?layout=app         Gantt dentro do rolador da página, como na tela real
 *   ?criticas=1         etapas pares críticas (folga 0), ímpares normais (folga 3d)
 *
 * `window.__harness` expõe colunas, linhas e o número de nós do DOM do Gantt.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ligarBarraDeRolagemProxima } from '../../../utils/barraDeRolagemProxima';
import { ScheduleGantt } from '../../../components/schedule/ScheduleGantt';
import { SchedulingEngine } from '../../../utils/schedulingEngine';
import {
    buildTimelineColumns,
    ganttAnchorDate,
    ganttTimelineOrigin,
    GANTT_LEAD_MAX_STEPS,
    TIMELINE_PX_PER_DAY,
    TimelineScale,
} from '../../../utils/scheduleTimeline';

const params = new URLSearchParams(location.search);
const N = Number(params.get('tarefas') ?? 300);
const RECUO = Number(params.get('recuo') ?? 1);
const NAVEGAR = params.get('navegar') !== '0';
// `?criticas=1`: etapas pares críticas (folga 0), ímpares normais (folga 3d) — setas das duas cores.
const CRITICAS = params.get('criticas') === '1';
// ?progresso=N — % realizado das etapas (barras de resumo), para ver a ponta já pintada.
const PROGRESSO = Number(params.get('progresso') ?? 0);

const INICIO = '2026-03-20';
const FIM = '2027-03-20';
const iso = (d: Date) => d.toISOString().slice(0, 10);

const itemSchedules: any[] = [];
const grupos: any[] = [];
for (let g = 0; g * 10 < N; g++) {
    const filhos: any[] = [];
    for (let k = 0; k < 10 && g * 10 + k < N; k++) {
        const idx = g * 10 + k;
        const ini = new Date('2026-03-20T12:00:00Z');
        // Com ?criticas=1, tarefas em SEQUÊNCIA (cada uma começa depois da anterior) — o caso
        // comum, em que a linha FS chega pela esquerda.
        ini.setUTCDate(ini.getUTCDate() + (CRITICAS ? (idx * 15) % 330 : (idx * 3) % 330));
        const fim = new Date(ini); fim.setUTCDate(fim.getUTCDate() + 12);
        const critica = CRITICAS && g % 2 === 0;
        const s = { id: `i${idx}`, startDate: iso(ini), endDate: iso(fim), duration: 12, predecessors: idx % 10 ? [{ id: `i${idx - 1}`, type: 'FS', lag: 0 }] : [], ...(CRITICAS ? { isCritical: critica, totalFloat: critica ? 0 : 3 } : {}) };
        itemSchedules.push(s);
        filhos.push({
            id: s.id, uid: s.id, type: 'item', name: `Tarefa ${idx + 1} — serviço de obra`, children: [], level: 1, wbsCode: `${g + 1}.${k + 1}`,
            data: { id: s.id, quantity: 1, sinapiItem: { code: s.id, description: `Tarefa ${idx + 1}`, price: 1000, unit: 'un' } },
            schedule: s, total: 1000, realizedTotal: 0, realizedPhysicalTotal: 0, realizedFinancialTotal: 0,
            budgetedTotal: 1000, budgetedWithBdiTotal: 1000, plannedTotal: 1000, earlyStart: s.startDate, earlyFinish: s.endDate,
        });
    }
    grupos.push({
        id: `g${g}`, uid: `g${g}`, type: 'group', name: `Etapa ${g + 1}`, level: 0, wbsCode: `${g + 1}`, children: filhos,
        total: 10000, realizedTotal: 100 * PROGRESSO, realizedPhysicalTotal: 0, realizedFinancialTotal: 0, budgetedTotal: 10000, budgetedWithBdiTotal: 10000, plannedTotal: 10000,
        earlyStart: filhos[0].earlyStart, earlyFinish: filhos[filhos.length - 1].earlyFinish,
    });
}
const expandidos = Object.fromEntries(grupos.map((g) => [g.id, true]));
const schedule = { startDate: INICIO, endDate: FIM, itemSchedules, distributions: [] } as any;
const noop = () => {};
const niveis = new Set(['group', 'phase', 'subphase', 'item']);
const vazio = new Set<string>();

function Harness() {
    const [timeScale] = React.useState<TimelineScale>((params.get('escala') as TimelineScale) || 'day');
    const [lead, setLead] = React.useState({ scale: timeScale, steps: RECUO });
    const steps = lead.scale === timeScale ? lead.steps : RECUO;
    const anchor = React.useMemo(() => ganttAnchorDate(new Date(INICIO), itemSchedules.map((s) => s.startDate)), []);
    const columns = React.useMemo(() => {
        const origem = steps > 0 ? ganttTimelineOrigin(anchor, timeScale, steps) : new Date(INICIO);
        return buildTimelineColumns(origem, new Date(FIM), timeScale);
    }, [anchor, timeScale, steps]);
    const pode = NAVEGAR && steps > 0 && steps < GANTT_LEAD_MAX_STEPS[timeScale];
    const onReach = React.useCallback(() => setLead((p) => ({ scale: timeScale, steps: Math.min((p.scale === timeScale ? p.steps : RECUO) + 1, GANTT_LEAD_MAX_STEPS[timeScale]) })), [timeScale]);

    const minDate = columns[0].date;
    const pxPerDay = TIMELINE_PX_PER_DAY[timeScale];
    const totalDays = Math.ceil((columns[columns.length - 1].date.getTime() - minDate.getTime()) / 86400000);
    const totalWidth = Math.max(800, totalDays * pxPerDay + 200);

    React.useEffect(() => {
        (window as any).__harness = {
            colunas: columns.length, tarefas: N, passos: steps,
            nos: () => document.querySelector('[data-gantt-rolador]')?.querySelectorAll('*').length ?? 0,
        };
    });

    return (
        <ScheduleGantt
            hierarchy={grupos}
            schedule={schedule}
            timelineColumns={columns}
            timeScale={timeScale}
            minDate={minDate}
            anchorDate={anchor}
            isVisible
            onReachTimelineStart={pode ? onReach : undefined}
            totalWidth={totalWidth}
            pxPerDay={pxPerDay}
            sidebarWidth={260}
            expandedNodes={expandidos}
            toggleNode={noop}
            getGanttSidebarTotal={() => 260}
            getGanttColStyle={() => ({ display: 'none' })}
            idToUid={{}}
            handleUpdatePredecessorField={noop}
            handleUpdateCrewField={noop}
            handleUpdateItemSchedule={noop}
            handleGanttBarMouseDown={noop}
            dragGhostOffset={0}
            crewPopoverItem={null}
            crewPopoverPos={null}
            setCrewPopoverItem={noop}
            setCrewPopoverPos={noop}
            getPhotosForItem={() => []}
            setViewingTaskPhotos={noop}
            isSimulationMode={false}
            isDraggingTask={null}
            budget={[]}
            SchedulingEngine={SchedulingEngine}
            visibleSummaryLevels={niveis}
            collapsedCols={vazio}
            onSidebarResizeStart={noop}
            handleUpdateRealPct={noop}
            setPredecessorModalTask={noop}
        />
    );
}

// `?layout=app`: o Gantt no MESMO encaixe da tela real — dentro do rolador da página
// (o <main> do Layout: `overflow-y-auto p-4 md:p-6`), abaixo do espaço do ribbon, num pai
// `overflow-x-auto min-h-[400px] flex flex-col` SEM altura (FinancialSchedule.tsx). É o
// que faz o contêiner do Gantt crescer até a última linha (11/10/2026).
// Como em index.tsx: a barra alarga quando o cursor se aproxima.
ligarBarraDeRolagemProxima();

const raiz = document.getElementById('raiz')!;
if (params.get('layout') === 'app') {
    raiz.removeAttribute('style');
    createRoot(raiz).render(
        <main id="rolador-pagina" className="overflow-y-auto p-6" style={{ height: '100vh', boxSizing: 'border-box' }}>
            <div className="space-y-6">
                <div data-ribbon className="rounded-[10px] border border-gray-100 bg-white shadow-sm" style={{ height: 180 }} />
                {/* O card externo da vista, como em FinancialSchedule.tsx (compartilhado com a Tabela). */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto min-h-[400px] bg-white flex flex-col">
                        <Harness />
                    </div>
                </div>
            </div>
        </main>
    );
} else {
    createRoot(raiz).render(<Harness />);
}
