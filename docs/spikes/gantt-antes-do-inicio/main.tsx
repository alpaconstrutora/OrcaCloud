/**
 * Harness: o Gantt do Planejamento navega para ANTES do início do projeto
 * (pedido de 10/10/2026).
 *
 * O componente sob teste é o `ScheduleGantt` de produção e as funções de
 * `utils/scheduleTimeline.ts`, sem mock. A ligação entre eles (recuo em passos,
 * âncora, `onReachTimelineStart`) repete a de `components/FinancialSchedule.tsx`
 * — se mudar lá, mude aqui. Só o projeto (1 grupo, 2 tarefas) é fabricado.
 *
 * `window.__harness` expõe o estado para o passeio medir.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
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

const INICIO = '2026-06-15';
const FIM = '2026-12-31';

const item = (id: string, desc: string) => ({
    id,
    quantity: 1,
    sinapiItem: { code: id, description: desc, price: 1000, unit: 'un', type: 'COMPOSITION' },
}) as any;

const itemSchedules = [
    { id: 'i1', startDate: INICIO, endDate: '2026-07-14', duration: 30, predecessors: [] },
    { id: 'i2', startDate: '2026-07-15', endDate: '2026-08-13', duration: 30, predecessors: [] },
] as any[];

const node = (id: string, desc: string, s: any) => ({
    id, uid: id, type: 'item', name: desc, children: [], data: item(id, desc), schedule: s,
    total: 1000, realizedTotal: 0, realizedPhysicalTotal: 0, realizedFinancialTotal: 0,
    budgetedTotal: 1000, budgetedWithBdiTotal: 1000, plannedTotal: 1000, level: 1,
    earlyStart: s.startDate, earlyFinish: s.endDate,
});

const hierarchy = [{
    id: 'g1', uid: 'g1', type: 'group', name: 'Fundação', level: 0,
    children: [node('i1', 'Escavação', itemSchedules[0]), node('i2', 'Sapatas', itemSchedules[1])],
    total: 2000, realizedTotal: 0, realizedPhysicalTotal: 0, realizedFinancialTotal: 0,
    budgetedTotal: 2000, budgetedWithBdiTotal: 2000, plannedTotal: 2000,
    earlyStart: INICIO, earlyFinish: '2026-08-13',
}] as any[];

const schedule = { startDate: INICIO, endDate: FIM, itemSchedules, distributions: [] } as any;
const noop = () => {};

function Harness() {
    const params = new URLSearchParams(location.search);
    const [timeScale, setTimeScale] = React.useState<TimelineScale>((params.get('escala') as TimelineScale) || 'week');
    const [lead, setLead] = React.useState<{ scale: TimelineScale; steps: number }>({ scale: timeScale, steps: 1 });
    const leadSteps = lead.scale === timeScale ? lead.steps : 1;

    const anchor = React.useMemo(() => ganttAnchorDate(new Date(INICIO), itemSchedules.map(s => s.startDate)), []);
    const columns = React.useMemo(
        () => buildTimelineColumns(ganttTimelineOrigin(anchor, timeScale, leadSteps), new Date(FIM), timeScale),
        [anchor, timeScale, leadSteps]
    );
    const canExtend = leadSteps < GANTT_LEAD_MAX_STEPS[timeScale];
    const onReach = React.useCallback(() => setLead(prev => ({
        scale: timeScale,
        steps: Math.min((prev.scale === timeScale ? prev.steps : 1) + 1, GANTT_LEAD_MAX_STEPS[timeScale]),
    })), [timeScale]);

    const minDate = columns[0].date;
    const pxPerDay = TIMELINE_PX_PER_DAY[timeScale];
    const totalDays = Math.ceil((columns[columns.length - 1].date.getTime() - minDate.getTime()) / 86400000);
    const totalWidth = Math.max(800, totalDays * pxPerDay + 200);

    (window as any).__harness = {
        leadSteps, timeScale, pxPerDay,
        primeiraColuna: columns[0].id,
        anchorOffsetPx: (anchor.getTime() - minDate.getTime()) / 86400000 * pxPerDay,
        setTimeScale,
    };

    return (
        <ScheduleGantt
            hierarchy={hierarchy}
            schedule={schedule}
            timelineColumns={columns}
            timeScale={timeScale}
            minDate={minDate}
            anchorDate={anchor}
            isVisible
            onReachTimelineStart={canExtend ? onReach : undefined}
            totalWidth={totalWidth}
            pxPerDay={pxPerDay}
            sidebarWidth={260}
            expandedNodes={{ g1: true }}
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
            visibleSummaryLevels={new Set(['group', 'phase', 'subphase', 'item'])}
            collapsedCols={new Set()}
            onSidebarResizeStart={noop}
            handleUpdateRealPct={noop}
            setPredecessorModalTask={noop}
        />
    );
}

// `?largura=3200` alarga a área para o caso "timeline inteira cabe na tela" (sem barra de rolagem).
const raiz = document.getElementById('raiz')!;
const largura = new URLSearchParams(location.search).get('largura');
if (largura) raiz.style.width = `${Number(largura)}px`;
createRoot(raiz).render(<Harness />);
