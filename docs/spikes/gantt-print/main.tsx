/**
 * Harness VISUAL: o Gantt do Planejamento no formato do print de referência
 * (21/11/2026 — *"Para visualizacao gantt implemente o mesmo formato de barras e
 * cores do print"* e *"A barra (Gantt; Dia; Sem; Mês; Ano; Início; Término) inves de
 * estar acoplada ao menu deve estar acoplada a tabela no timeline"*).
 *
 * `ScheduleGantt` e `BarraDeOpcoesDaGrade` de produção, dentro do mesmo card que
 * `FinancialSchedule.tsx` desenha. Dados: as 4 fases do print (cores da GANTT_PALETTE
 * por grupo raiz, como `finalizeHierarchy` pinta), tarefas com % feito, marcos
 * (concluído e não) e dependências FS. `?escala=day|week|month|year`.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ScheduleGantt } from '../../../components/schedule/ScheduleGantt';
import { BarraDeOpcoesDaGrade } from '../../../components/schedule/ScheduleHeader';
import { SchedulingEngine } from '../../../utils/schedulingEngine';
import { buildTimelineColumns, TIMELINE_PX_PER_DAY, TimelineScale } from '../../../utils/scheduleTimeline';

const params = new URLSearchParams(location.search);
const PALETA = ['#3b82f6', '#22c55e', '#a855f7', '#f97316'];

type T = [nome: string, ini: string, dias: number, pct: number, pred?: string, marco?: boolean];
const FASES: { nome: string; tarefas: T[] }[] = [
    { nome: 'Iniciação', tarefas: [
        ['Levantamento de requisitos', '2026-03-02', 3, 50],
        ['Workshop com envolvidos', '2026-03-05', 2, 75],
        ['Storyboard', '2026-03-05', 8, 80, 'Levantamento de requisitos'],
        ['Iniciação concluída', '2026-03-13', 0, 100, 'Storyboard', true],
    ] },
    { nome: 'Projeto', tarefas: [
        ['Projeto da solução', '2026-03-07', 9, 35],
        ['Wireframes', '2026-03-12', 5, 80],
        ['Protótipo', '2026-03-13', 10, 40, 'Wireframes'],
        ['Projeto concluído', '2026-03-23', 0, 0, 'Protótipo', true],
    ] },
    { nome: 'Implementação', tarefas: [
        ['ETL', '2026-03-09', 11, 15],
        ['Modelagem de dados', '2026-03-15', 7, 40],
        ['Medidas e KPIs', '2026-03-15', 3, 50],
        ['Visualização', '2026-03-20', 4, 15, 'Medidas e KPIs'],
        ['Teste de desempenho', '2026-03-20', 4, 20],
        ['Implementação concluída', '2026-03-24', 0, 0, 'Teste de desempenho', true],
    ] },
    { nome: 'Implantação', tarefas: [
        ['Treinamento', '2026-03-23', 2, 65],
        ['Agenda e alertas', '2026-03-27', 1, 50, 'Treinamento'],
        ['Apresentação executiva', '2026-03-28', 4, 0, 'Agenda e alertas'],
        ['Implantação concluída', '2026-04-01', 0, 0, undefined, true],
    ] },
];

const somaDias = (iso: string, d: number) => {
    const x = new Date(`${iso}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
};

const itemSchedules: any[] = [];
const idPorNome: Record<string, string> = {};
const grupos = FASES.map((fase, g) => {
    const cor = PALETA[g % PALETA.length];
    const filhos = fase.tarefas.map(([nome, ini, dias, pct, , marco], k) => {
        const id = `t${g}-${k}`;
        idPorNome[nome] = id;
        const s: any = { id, startDate: ini, endDate: somaDias(ini, dias), duration: dias, manualRealPct: pct, predecessors: [] };
        itemSchedules.push(s);
        return {
            id, uid: String(itemSchedules.length), type: 'item', name: nome, children: [], level: 1, wbsCode: `${g + 1}.${k + 1}`,
            color: cor, isMilestone: !!marco,
            data: { id, quantity: 1, sinapiItem: { code: id, description: nome, price: 1000, unit: 'un' } },
            schedule: s, total: 1000, realizedTotal: 10 * pct, realizedPhysicalTotal: 10 * pct, realizedFinancialTotal: 0,
            budgetedTotal: 1000, budgetedWithBdiTotal: 1000, plannedTotal: 1000, earlyStart: s.startDate, earlyFinish: s.endDate,
        };
    });
    const ini = filhos.map((f) => f.earlyStart).sort()[0];
    const fim = filhos.map((f) => f.earlyFinish).sort().slice(-1)[0];
    const total = filhos.length * 1000;
    const feito = filhos.reduce((a, f) => a + f.realizedTotal, 0);
    return {
        id: `g${g}`, uid: `G${g + 1}`, type: 'group', name: fase.nome, level: 0, wbsCode: `${g + 1}`, children: filhos, color: cor,
        total, realizedTotal: feito, realizedPhysicalTotal: feito, realizedFinancialTotal: 0, budgetedTotal: total, budgetedWithBdiTotal: total, plannedTotal: total,
        earlyStart: ini, earlyFinish: fim,
    };
});
FASES.forEach((fase) => fase.tarefas.forEach(([nome, , , , pred]) => {
    if (!pred) return;
    itemSchedules.find((s) => s.id === idPorNome[nome]).predecessors = [{ id: idPorNome[pred], type: 'FS', lag: 0 }];
}));

const expandidos = Object.fromEntries(grupos.map((g) => [g.id, true]));
const niveis = new Set(['group', 'phase', 'subphase', 'item']);
const vazio = new Set<string>();
const noop = () => {};
const COLUNAS_VISIVEIS: Record<string, number> = { gStart: 80, gEnd: 80, gDur: 60, gRealPct: 70 };
const larguraLateral = 240 + Object.values(COLUNAS_VISIVEIS).reduce((a, b) => a + b, 0);

function Harness() {
    const [timeScale, setTimeScale] = React.useState<TimelineScale>((params.get('escala') as TimelineScale) || 'day');
    const [schedule, setSchedule] = React.useState<any>({ startDate: '2026-03-02', endDate: '2026-04-02', itemSchedules, distributions: [] });
    const columns = React.useMemo(() => buildTimelineColumns(new Date('2026-02-28T12:00:00'), new Date('2026-04-08T12:00:00'), timeScale), [timeScale]);
    const minDate = columns[0].date;
    const pxPerDay = TIMELINE_PX_PER_DAY[timeScale];
    const totalDays = Math.ceil((columns[columns.length - 1].date.getTime() - minDate.getTime()) / 86400000);
    const totalWidth = Math.max(800, totalDays * pxPerDay + 200);

    return (
        <div className="space-y-6">
            <div className="rounded-[10px] border border-gray-100 bg-white shadow-sm p-3 text-xs text-slate-500">
                (card do ribbon — termina nas abas; a barra da vista não fica mais aqui)
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <BarraDeOpcoesDaGrade
                    viewMode="gantt"
                    timeScale={timeScale}
                    setTimeScale={setTimeScale}
                    schedule={schedule}
                    settings={{ id: 'p', name: 'Plano' } as any}
                    handleRecalculate={(_s, ini) => ini && setSchedule((p: any) => ({ ...p, startDate: ini }))}
                    onUpdateSettings={(s: any) => setSchedule(s.schedule)}
                />
                <div className="overflow-x-auto min-h-[400px] bg-white flex flex-col">
                    <ScheduleGantt
                        hierarchy={grupos as any}
                        schedule={schedule}
                        timelineColumns={columns}
                        timeScale={timeScale}
                        minDate={minDate}
                        anchorDate={minDate}
                        isVisible
                        totalWidth={totalWidth}
                        pxPerDay={pxPerDay}
                        sidebarWidth={240}
                        expandedNodes={expandidos}
                        toggleNode={noop}
                        getGanttSidebarTotal={() => larguraLateral}
                        getGanttColStyle={(c) => (COLUNAS_VISIVEIS[c] ? { width: `${COLUNAS_VISIVEIS[c]}px` } : { display: 'none' })}
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
                </div>
            </div>
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
