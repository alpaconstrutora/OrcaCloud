import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronRight, Camera, Filter, Check, Columns3, EyeOff } from 'lucide-react';

import { HierarchyNode, ProjectSchedule, BudgetEntry, ResourceAllocation } from '../../types';

interface ScheduleGanttProps {
    hierarchy: HierarchyNode[];
    schedule: ProjectSchedule;
    timelineColumns: any[];
    minDate: Date;
    totalWidth: number;
    pxPerDay: number;
    sidebarWidth: number;
    expandedNodes: Record<string, boolean>;
    toggleNode: (id: string) => void;
    getGanttSidebarTotal: () => number;
    getGanttColStyle: (col: string) => React.CSSProperties;
    idToUid: Record<string, string>;
    handleUpdatePredecessorField: (itemId: string, field: 'uid' | 'type' | 'lag', value: any) => void;
    handleUpdateCrewField: (id: string, field: string, value: any) => void;
    handleUpdateItemSchedule: (itemId: string, field: 'duration' | 'startDate' | 'endDate', value: string | number) => void;
    handleGanttBarMouseDown: (e: React.MouseEvent, id: string, date: string) => void;
    crewPopoverItem: string | null;
    crewPopoverPos: { top: number; left: number } | null;
    setCrewPopoverItem: (id: string | null) => void;
    setCrewPopoverPos: (pos: { top: number; left: number } | null) => void;
    getPhotosForItem: (id: string) => string[];
    setViewingTaskPhotos: (data: { id: string; name: string; photos: string[] } | null) => void;
    isSimulationMode: boolean;
    isDraggingTask: string | null;
    budget: BudgetEntry[];
    SchedulingEngine: any; // Passed from parent or utils
    taskInsights?: Record<string, { missingItems: number; missingCost: number; hasAlert: boolean; message: string }>;
    visibleSummaryLevels: Set<string>;
    onToggleSummaryLevel: (level: string) => void;
    collapsedCols: Set<string>;
    onToggleColumn: (key: string) => void;
    handleSplitterDblClick: () => void;
    handleUpdateRealPct: (itemId: string, value: string) => void;
}


export const ScheduleGantt: React.FC<ScheduleGanttProps> = ({
    hierarchy,
    schedule,
    timelineColumns,
    minDate,

    totalWidth,
    pxPerDay,
    sidebarWidth,
    expandedNodes,
    toggleNode,
    getGanttSidebarTotal,
    getGanttColStyle,
    idToUid,
    handleUpdatePredecessorField,
    handleUpdateCrewField,
    handleUpdateItemSchedule,
    handleGanttBarMouseDown,
    crewPopoverItem,
    crewPopoverPos,
    setCrewPopoverItem,
    setCrewPopoverPos,
    getPhotosForItem,
    setViewingTaskPhotos,
    isSimulationMode,
    isDraggingTask,
    budget,
    SchedulingEngine,
    taskInsights,
    visibleSummaryLevels,
    onToggleSummaryLevel,
    collapsedCols,
    onToggleColumn,
    handleSplitterDblClick,
    handleUpdateRealPct
}) => {

    const formatDateDisplay = (dateString?: string) => {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-').map(Number);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return dateString;
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
    };

    const headerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const colMenuRef = useRef<HTMLDivElement>(null);
    const [showLevelsDropdown, setShowLevelsDropdown] = useState(false);
    const [showColsDropdown, setShowColsDropdown] = useState(false);

    // Close menu on click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
                setShowColsDropdown(false);
            }
        };
        if (showColsDropdown) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColsDropdown]);

    const COL_LABELS: Record<string, string> = {
        gId: 'ID',
        gPred: 'Predecessora',
        gDur: 'Duração',
        gStart: 'Início',
        gEnd: 'Término',
        gEsEf: 'ES/EF',
        gLsLf: 'LS/LF',
        gFloat: 'Folga',
        gBudgeted: 'Orçado (B)',
        gPlanned: 'Planejado (C)',
        gRealized: 'Realizado $',
        gVariation: 'Variação $',
        gResources: 'Recursos',
        gRealPct: 'Real %'
    };
    const TOGGLEABLE_COLS = Object.keys(COL_LABELS);


    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (headerRef.current) {
            headerRef.current.scrollLeft = (e.currentTarget as HTMLDivElement).scrollLeft;
        }
    };

    const renderGanttRow = (node: HierarchyNode, isParentVisible = true): React.ReactNode => {
        const isVisible = node.type === 'item' || visibleSummaryLevels.has(node.type);
        const isExpanded = expandedNodes[node.id];
        const isItem = node.type === 'item';

        // If this node is not visible but its parent is, we skip it but still render its children.
        // We pass false for isParentVisible so children know their direct parent was hidden,
        // which helps in deciding whether to render them or not.
        if (!isVisible && isParentVisible) {
            return (
                <React.Fragment key={node.id}>
                    {node.children && node.children.map(child => renderGanttRow(child, false))}
                </React.Fragment>
            );
        }

        // If this level is hidden AND its parent was hidden, we just continue down the tree.
        if (!isVisible && !isParentVisible) {
            return (
                <React.Fragment key={node.id}>
                    {node.children && node.children.map(child => renderGanttRow(child, false))}
                </React.Fragment>
            );
        }

        if (isItem && node.data) {

            const item = node.data;
            const itemSchedule = schedule.itemSchedules?.find(s => s.id === item.id);

            return (
                <div key={item.id} className="flex border-b border-gray-50 hover:bg-blue-50/20 transition-colors h-9 relative">
                    <div
                        className="shrink-0 flex bg-white sticky left-0 z-[35] shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] border-r border-gray-100"
                        style={{ width: `${getGanttSidebarTotal()}px` }}
                    >
                        <div
                            className="shrink-0 truncate px-4 py-2 text-[12px] text-gray-600 border-r border-gray-100 flex items-center gap-1.5"
                            title={item.sinapiItem.description}
                            style={{ paddingLeft: `${(node.level * 20) + 16}px`, width: `${sidebarWidth}px` }}
                        >
                            <span className="truncate flex-1">{item.sinapiItem.description}</span>
                            {taskInsights?.[item.id]?.hasAlert && (
                                <div className="shrink-0 flex items-center justify-center text-red-500 cursor-help relative group/insight">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                    <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 hidden group-hover/insight:block w-48 p-2 bg-gray-900 border border-gray-800 text-white text-[12px] font-medium leading-tight rounded shadow-xl z-[100] text-center whitespace-normal">
                                        {taskInsights[item.id].message}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div data-gantt-col="gId" className={`shrink-0 border-r border-gray-100 flex items-center justify-center text-[12px] font-medium ${itemSchedule?.isCritical ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50/50'}`} style={getGanttColStyle('gId')}>
                            {node.uid}
                        </div>

                        <div data-gantt-col="gPred" className="shrink-0 border-r border-gray-100 flex items-center gap-0.5 px-0.5 relative group/pred" style={getGanttColStyle('gPred')}>
                            <input
                                type="text"
                                className="w-full bg-transparent border-none rounded text-center text-[12px] p-0.5 focus:ring-1 focus:ring-blue-300 font-medium text-blue-600"
                                value={itemSchedule?.predecessors?.[0] ? idToUid[itemSchedule.predecessors[0].id] || '' : ''}
                                onChange={(e) => handleUpdatePredecessorField(item.id, 'uid', e.target.value)}
                                placeholder="-"
                            />
                        </div>

                        <div data-gantt-col="gDur" className="shrink-0 border-r border-gray-100 flex items-center justify-center p-0.5 relative group/gdur" style={getGanttColStyle('gDur')}>
                            {itemSchedule?.autoDuration ? (
                                <div className="flex items-center gap-0.5">
                                    <span className="text-[12px] font-medium text-green-600">{node.isMilestone ? '0d' : `${itemSchedule?.duration || 1}d`}</span>
                                    <button
                                        onClick={() => handleUpdateCrewField(item.id, 'autoDuration', false)}
                                        className="text-green-500 hover:text-green-700"
                                        title="Desativar auto"
                                    >
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-0.5">
                                    {node.isMilestone ? (
                                        <span className="text-[12px] font-medium text-gray-600">0d</span>
                                    ) : (
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={isSimulationMode}
                                            title={isSimulationMode ? 'Arraste a barra no Gantt para alterar a duração' : 'Duração em dias'}
                                            className={`w-14 bg-white border border-gray-200 rounded text-center text-[12px] p-0.5 font-medium text-gray-700 ${isSimulationMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            value={itemSchedule?.duration ?? ''}
                                            onChange={(e) => handleUpdateItemSchedule(item.id, 'duration', parseInt(e.target.value, 10) || 0)}
                                        />
                                    )}
                                    <button
                                        onClick={(e) => {
                                            handleUpdateCrewField(item.id, 'autoDuration', true);
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setCrewPopoverPos({ top: rect.bottom + 4, left: rect.left - 180 });
                                            setCrewPopoverItem(item.id);
                                        }}
                                        className="opacity-0 group-hover/gdur:opacity-100 flex items-center justify-center w-4 h-4 rounded bg-blue-50 border border-blue-200 text-blue-500 hover:bg-blue-100 transition-all"
                                        title="Calcular pela equipe"
                                    >
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
                                    </button>
                                </div>
                            )}
                            {itemSchedule?.autoDuration && (
                                <button
                                    onClick={(e) => {
                                        if (crewPopoverItem === item.id) {
                                            setCrewPopoverItem(null);
                                            setCrewPopoverPos(null);
                                        } else {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setCrewPopoverPos({ top: rect.bottom + 4, left: rect.left });
                                            setCrewPopoverItem(item.id);
                                        }
                                    }}
                                    className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[6px] px-1 py-0 rounded-b border border-t-0 border-gray-200 z-20 transition-colors ${crewPopoverItem === item.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-500'}`}
                                >
                                    ▾
                                </button>
                            )}
                            {crewPopoverItem === item.id && crewPopoverPos && ReactDOM.createPortal(
                                <div
                                    className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-52"
                                    style={{ position: 'fixed', top: crewPopoverPos.top, left: crewPopoverPos.left, zIndex: 9999 }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="text-[12px] font-medium text-gray-700 mb-2 flex items-center justify-between">
                                        <span>⚙ Equipe</span>
                                        <button onClick={() => { setCrewPopoverItem(null); setCrewPopoverPos(null); }} className="text-gray-400 hover:text-gray-600 text-sm leading-none">×</button>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-100 mb-2">
                                            <div className="text-[12px] font-medium text-gray-400 uppercase mb-1 px-1">Modelo de Cálculo</div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleUpdateCrewField(item.id, 'mainWorkerProd', (itemSchedule?.mainWorkerProd || 0) > 0 ? 0 : 10)}
                                                    className={`flex-1 text-[12px] py-1 rounded border transition-all ${(itemSchedule?.mainWorkerProd || 0) > 0 ? 'bg-blue-600 border-blue-700 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                >
                                                    Produtividade
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateCrewField(item.id, 'mainWorkerProd', 0)}
                                                    className={`flex-1 text-[12px] py-1 rounded border transition-all ${(itemSchedule?.mainWorkerProd || 0) <= 0 ? 'bg-blue-600 border-blue-700 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                >
                                                    HH/unid
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] text-gray-500">Oficiais</label>
                                            <input type="number" min="0" step="1" className="w-16 border border-gray-200 rounded text-center text-[12px] p-0.5" value={itemSchedule?.crewMainWorkers ?? ''} onChange={(e) => handleUpdateCrewField(item.id, 'crewMainWorkers', parseInt(e.target.value, 10) || 0)} placeholder="0" />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] text-gray-500">Serventes</label>
                                            <input type="number" min="0" step="1" className="w-16 border border-gray-200 rounded text-center text-[12px] p-0.5" value={itemSchedule?.crewHelpers ?? ''} onChange={(e) => handleUpdateCrewField(item.id, 'crewHelpers', parseInt(e.target.value, 10) || 0)} placeholder="0" />
                                        </div>

                                        {(itemSchedule?.mainWorkerProd || 0) > 0 ? (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[12px] text-blue-600 font-medium">Prod. Oficial</label>
                                                    <input type="number" min="0.1" step="0.1" className="w-16 border border-blue-200 bg-blue-50/30 rounded text-center text-[12px] p-0.5" value={itemSchedule?.mainWorkerProd ?? ''} onChange={(e) => handleUpdateCrewField(item.id, 'mainWorkerProd', parseFloat(e.target.value) || 0)} placeholder="un/dia" />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[12px] text-blue-600 font-medium">Prod. Servente</label>
                                                    <input type="number" min="0" step="0.1" className="w-16 border border-blue-200 bg-blue-50/30 rounded text-center text-[12px] p-0.5" value={itemSchedule?.helperProd ?? ''} onChange={(e) => handleUpdateCrewField(item.id, 'helperProd', parseFloat(e.target.value) || 0)} placeholder="un/dia" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[12px] text-gray-500">HH/unid</label>
                                                    <input type="number" min="0" step="0.1" className="w-16 border border-gray-200 rounded text-center text-[12px] p-0.5" value={itemSchedule?.effortCoefficient ?? ''} onChange={(e) => handleUpdateCrewField(item.id, 'effortCoefficient', parseFloat(e.target.value) || 0)} placeholder="0" />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[12px] text-gray-500">Fator Ajudante</label>
                                                    <input type="number" min="0" max="1" step="0.1" className="w-16 border border-gray-200 rounded text-center text-[12px] p-0.5" value={itemSchedule?.helperFactor ?? 0.5} onChange={(e) => handleUpdateCrewField(item.id, 'helperFactor', parseFloat(e.target.value) || 0.5)} />
                                                </div>
                                            </>
                                        )}

                                        <div className="flex gap-1 mt-1">
                                            <button
                                                onClick={() => {
                                                    const budgetItem = budget.find(b => b.id === item.id);
                                                    if (budgetItem?.sinapiItem?.composition) {
                                                        const laborSum = SchedulingEngine.deriveEffortFromComposition(budgetItem.sinapiItem.composition);
                                                        if (laborSum > 0) handleUpdateCrewField(item.id, 'effortCoefficient', laborSum);
                                                    }
                                                }}
                                                className="flex-1 text-[12px] py-1 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium uppercase transition-all shadow-sm"
                                            >
                                                Resetar SINAPI (HH)
                                            </button>
                                        </div>

                                        <hr className="border-gray-100" />

                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] text-amber-600 font-medium">Eficiência</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range" min="0.5" max="1.5" step="0.1"
                                                    className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                    value={itemSchedule?.efficiencyFactor ?? 1.0}
                                                    onChange={(e) => handleUpdateCrewField(item.id, 'efficiencyFactor', parseFloat(e.target.value) || 1.0)}
                                                />
                                                <span className="text-[12px] font-medium text-amber-700 w-6">{(itemSchedule?.efficiencyFactor ?? 1.0).toFixed(1)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] text-gray-500">Horas/dia</label>
                                            <input type="number" min="1" max="24" step="1" className="w-16 border border-gray-200 rounded text-center text-[12px] p-0.5" value={itemSchedule?.hoursPerDay ?? 8} onChange={(e) => handleUpdateCrewField(item.id, 'hoursPerDay', parseFloat(e.target.value) || 8)} />
                                        </div>

                                        <div className="mt-2 pt-2 border-t border-gray-100 text-[12px] text-gray-500 bg-gray-50/50 p-1.5 rounded-lg">
                                            <div className="flex justify-between mb-0.5">
                                                <span>Capacidade/dia:</span>
                                                <span className="font-medium text-gray-700">
                                                    {(() => {
                                                        const mainWorkers = itemSchedule?.crewMainWorkers || 0;
                                                        const helpers = itemSchedule?.crewHelpers || 0;
                                                        let cap = 0;
                                                        if ((itemSchedule?.mainWorkerProd || 0) > 0) {
                                                            cap = (mainWorkers * (itemSchedule?.mainWorkerProd || 0)) + (helpers * (itemSchedule?.helperProd || 0));
                                                        } else {
                                                            const effCrew = mainWorkers + (helpers * (itemSchedule?.helperFactor || 0.5));
                                                            const coef = itemSchedule?.effortCoefficient || 0;
                                                            const hpd = itemSchedule?.hoursPerDay || 8;
                                                            if (coef > 0) cap = (effCrew * hpd) / coef;
                                                        }
                                                        return (cap * (itemSchedule?.efficiencyFactor ?? 1.0)).toFixed(2);
                                                    })()} un
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[12px]">
                                                <span className="font-medium">Duração Final:</span>
                                                <span className="font-medium text-blue-600">{itemSchedule?.duration} dias</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>

                        <div data-gantt-col="gStart" className="shrink-0 border-r border-gray-100 flex items-center justify-center text-[12px] font-medium text-gray-500" style={getGanttColStyle('gStart')}>
                            {itemSchedule?.startDate ? new Date(itemSchedule.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                        </div>

                        <div data-gantt-col="gEnd" className="shrink-0 border-r border-gray-100 flex items-center justify-center text-[12px] font-medium text-gray-500" style={getGanttColStyle('gEnd')}>
                            {itemSchedule?.endDate ? new Date(itemSchedule.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                        </div>

                        <div data-gantt-col="gEsEf" className="shrink-0 border-r border-gray-100 flex flex-col items-center justify-center bg-blue-50/20 text-[12px] font-medium text-blue-600 leading-tight" style={getGanttColStyle('gEsEf')}>
                            <span>{itemSchedule?.earlyStart ? new Date(itemSchedule.earlyStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-'}</span>
                            <span>{itemSchedule?.earlyFinish ? new Date(itemSchedule.earlyFinish).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-'}</span>
                        </div>

                        <div data-gantt-col="gLsLf" className="shrink-0 border-r border-gray-100 flex flex-col items-center justify-center bg-orange-50/20 text-[12px] font-medium text-orange-600 leading-tight" style={getGanttColStyle('gLsLf')}>
                            <span>{formatDateDisplay(itemSchedule?.lateStart)?.split('/')?.slice(0, 2)?.join('/') || '-'}</span>
                            <span>{formatDateDisplay(itemSchedule?.lateFinish)?.split('/')?.slice(0, 2)?.join('/') || '-'}</span>
                        </div>

                        <div data-gantt-col="gFloat" className="shrink-0 border-r border-gray-100 flex items-center justify-center text-[12px] font-medium text-indigo-600 bg-gray-50/30" style={getGanttColStyle('gFloat')}>
                            {itemSchedule?.totalFloat !== undefined ? `${itemSchedule.totalFloat}d` : '-'}
                        </div>

                        <div data-gantt-col="gBudgeted" className="shrink-0 border-r border-gray-100 flex items-center justify-end px-2 text-[12px] font-medium text-gray-400" style={getGanttColStyle('gBudgeted')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.budgetedTotal)}
                        </div>

                        <div data-gantt-col="gPlanned" className="shrink-0 flex items-center justify-end px-2 text-[12px] font-medium text-blue-600 border-r border-gray-100" style={getGanttColStyle('gPlanned')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.plannedTotal)}
                        </div>

                        <div data-gantt-col="gRealized" className="shrink-0 flex items-center justify-end px-2 text-[12px] font-medium text-emerald-500 border-r border-gray-100" style={getGanttColStyle('gRealized')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.realizedTotal || 0)}
                        </div>

                        <div data-gantt-col="gVariation" className={`shrink-0 flex items-center justify-end px-2 text-[12px] font-medium border-r border-gray-100 ${(node.variation ?? 0) > 0 ? 'text-red-500' : (node.variation ?? 0) < 0 ? 'text-emerald-500' : 'text-gray-400'}`} style={getGanttColStyle('gVariation')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.variation || 0)}
                        </div>

                        <div data-gantt-col="gResources" className="shrink-0 flex items-center px-2 border-r border-gray-100" style={getGanttColStyle('gResources')}>
                            <div className="flex -space-x-2 overflow-hidden py-1">
                                {(() => {
                                    const allocations = itemSchedule?.allocations || [];
                                    if (allocations.length === 0) return <span className="text-[12px] text-gray-300 italic">Nenhum</span>;
                                    return allocations.map((alloc: ResourceAllocation, idx: number) => (
                                        <div key={idx} className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[12px] font-medium text-indigo-600 shadow-sm ring-2 ring-white" title={(alloc as any).roleName || (alloc as any).workerName || (alloc as any).teamName}>
                                            {((alloc as any).roleName || (alloc as any).workerName || (alloc as any).teamName || '?').substring(0, 1).toUpperCase()}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        <div data-gantt-col="gRealPct" className="shrink-0 flex items-center justify-center" style={getGanttColStyle('gRealPct')}>
                            <div className="flex items-center text-[12px] text-blue-600 font-medium">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className={`w-9 bg-transparent border-none p-0 text-[12px] font-medium text-right focus:ring-0 ${itemSchedule?.manualRealPct !== undefined ? 'text-orange-500' : 'text-blue-600'}`}
                                    value={itemSchedule?.manualRealPct !== undefined ? itemSchedule.manualRealPct : (node.total > 0 ? (node.realizedTotal / node.total * 100) : 0).toFixed(0)}
                                    onChange={(e) => handleUpdateRealPct(item.id, e.target.value)}
                                />
                                <span>%</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative flex-1 h-full" style={{ width: `${totalWidth}px` }}>
                        {timelineColumns.map((column, index) => (
                            <div
                                key={`grid-${index}`}
                                className={`absolute top-0 bottom-0 border-l border-gray-100 h-full ${index % 2 === 0 ? 'bg-gray-50/30' : ''}`}
                                style={{
                                    left: `${(Math.max(minDate.getTime(), column.date.getTime()) - minDate.getTime()) / (1000 * 60 * 60 * 24) * pxPerDay}px`,
                                    width: `${column.width}px`
                                }}
                            />
                        ))}

                        {itemSchedule?.startDate && (itemSchedule?.duration !== undefined) ? (() => {
                            const itemStart = new Date(itemSchedule.startDate).getTime();
                            const startOffset = Math.max(0, (itemStart - minDate.getTime()) / (1000 * 60 * 60 * 24));
                            const width = Math.max(pxPerDay / 2, (itemSchedule.duration || 0) * pxPerDay);
                            const left = startOffset * pxPerDay;
                            const baseColor = node.color || '#3b82f6';
                            const progress = itemSchedule?.manualRealPct !== undefined
                                ? itemSchedule.manualRealPct
                                : (node.total > 0 ? (node.realizedTotal / node.total * 100) : 0);

                            if (node.isMilestone) {
                                return (
                                    <div
                                        className="absolute top-1.5 flex items-center justify-center z-10 cursor-pointer"
                                        style={{ left: `${left}px`, width: `${pxPerDay}px`, height: '24px', transform: 'translateX(-50%)' }}
                                    >
                                        <div
                                            className={`w-3.5 h-3.5 rotate-45 border border-white shadow-md ${itemSchedule.isCritical ? 'bg-red-600 ring-2 ring-red-100' : ''}`}
                                            style={!itemSchedule.isCritical ? { backgroundColor: baseColor } : {}}
                                        />
                                        <div className="opacity-0 hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[12px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
                                            Marco: {new Date(itemSchedule.startDate).toLocaleDateString()} {itemSchedule.isCritical ? '(CRÍTICO)' : ''}
                                        </div>
                                        {/* External Label for Milestones */}
                                        <div className="absolute left-[calc(100%+8px)] whitespace-nowrap text-[12px] font-medium text-gray-500 pointer-events-none">
                                            {node.name}
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div className="group/task-container absolute top-1.5 flex items-center overflow-visible" style={{ left: `${left}px`, width: `${width}px` }}>
                                    {itemSchedule.totalFloat && itemSchedule.totalFloat > 0 && (
                                        <div
                                            className="absolute top-0 h-6 bg-indigo-500/10 border border-dashed border-indigo-300 rounded-r z-[1]"
                                            style={{ left: `${width}px`, width: `${itemSchedule.totalFloat * pxPerDay}px` }}
                                        />
                                    )}

                                    <div className="absolute inset-y-0 left-[-20px] w-[20px] flex items-center justify-center opacity-0 group-hover/task-container:opacity-100 transition-opacity">
                                        {getPhotosForItem(item.id).length > 0 && (
                                            <Camera
                                                className="w-3 h-3 text-indigo-500 cursor-pointer hover:scale-110 transition-transform"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setViewingTaskPhotos({
                                                        id: item.id,
                                                        name: item.sinapiItem.description,
                                                        photos: getPhotosForItem(item.id)
                                                    });
                                                }}
                                            />
                                        )}
                                    </div>

                                    <div
                                        className={`relative h-6 rounded shadow-sm border group/bar transition-all z-[2] flex overflow-hidden ${itemSchedule?.isCritical ? 'border-red-600' : 'border-black/10'} ${isSimulationMode ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-purple-400 hover:z-[10]' : 'cursor-pointer'} ${isDraggingTask === item.id ? 'opacity-80 scale-105 z-[20] shadow-xl ring-2 ring-purple-600 ring-offset-1' : ''}`}
                                        style={{ width: `${width}px`, backgroundColor: `${baseColor}55` }} // translucent base
                                        onMouseDown={(e) => {
                                            if (isSimulationMode) {
                                                handleGanttBarMouseDown(e, item.id, itemSchedule.startDate as string);
                                            }
                                        }}
                                    >
                                        {/* Progress Bar (darker portion) */}
                                        <div
                                            className="h-full transition-all duration-500"
                                            style={{ width: `${Math.min(100, progress)}%`, backgroundColor: baseColor }}
                                        />

                                        {/* Progress Text overlay */}
                                        {width > 40 && (
                                            <div
                                                className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-[12px] font-medium text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] pointer-events-none z-10"
                                                style={{ width: `${Math.min(100, progress)}%` }}
                                            >
                                                {progress > 8 ? `${progress.toFixed(0)}%` : ''}
                                            </div>
                                        )}

                                        <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[12px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
                                            {new Date(itemSchedule.startDate).toLocaleDateString()} - {itemSchedule.endDate ? new Date(itemSchedule.endDate).toLocaleDateString() : ''} ({itemSchedule.duration}d)
                                            {itemSchedule.totalFloat ? ` | Folga: ${itemSchedule.totalFloat}d` : ''}
                                        </div>
                                    </div>

                                    {/* Right side label (Name + Duration) */}
                                    <div className="ml-2 whitespace-nowrap text-[12px] font-medium text-gray-500 pointer-events-none truncate max-w-[200px]" title={`${node.name} (${itemSchedule.duration}d)`}>
                                        {node.name} <span className="font-medium text-gray-400">({itemSchedule.duration}d)</span>
                                    </div>
                                </div>
                            );
                        })() : null}
                    </div>
                </div>
            );
        }

        return (
            <div key={node.id}>
                <div
                    className={`flex border-b border-gray-200 cursor-pointer group/row h-9 ${node.type === 'subphase' ? 'bg-gray-50' : 'bg-gray-100'}`}
                    onClick={() => toggleNode(node.id)}
                >
                    <div
                        className={`shrink-0 flex sticky left-0 z-[35] shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] border-r border-gray-200 ${node.type === 'subphase' ? 'bg-gray-50' : 'bg-gray-100'}`}
                        style={{ width: `${getGanttSidebarTotal()}px` }}
                    >
                        <div
                            className={`shrink-0 font-medium ${node.type === 'subphase' ? 'text-gray-700' : 'text-gray-800'} py-1.5 px-4 border-r border-gray-200 flex items-center gap-2`}
                            style={{ paddingLeft: `${(node.level * 20) + 16}px`, width: `${sidebarWidth}px` }}
                        >
                            {node.children && node.children.length > 0 && (
                                isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            <span className="truncate">{node.name}</span>
                            {taskInsights?.[node.id]?.hasAlert && (
                                <div className="shrink-0 flex items-center justify-center text-red-500 cursor-help relative group/insight ml-auto mr-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                    <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 hidden group-hover/insight:block w-48 p-2 bg-gray-900 border border-gray-800 text-white text-[12px] font-medium leading-tight rounded shadow-xl z-[100] text-center whitespace-normal">
                                        {taskInsights[node.id].message}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div data-gantt-col="gId" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gId')}>{node.uid}</div>
                        <div data-gantt-col="gPred" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gPred')}></div>
                        <div data-gantt-col="gDur" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gDur')}></div>
                        <div data-gantt-col="gStart" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gStart')}></div>
                        <div data-gantt-col="gEnd" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gEnd')}></div>
                        <div data-gantt-col="gEsEf" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gEsEf')}></div>
                        <div data-gantt-col="gLsLf" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gLsLf')}></div>
                        <div data-gantt-col="gFloat" className="shrink-0 border-r border-gray-200" style={getGanttColStyle('gFloat')}></div>
                        <div data-gantt-col="gBudgeted" className="shrink-0 border-r border-gray-200 flex items-center justify-end px-2 text-[12px] font-medium text-gray-500" style={getGanttColStyle('gBudgeted')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.budgetedTotal)}
                        </div>
                        <div data-gantt-col="gPlanned" className="shrink-0 flex items-center justify-end px-2 text-[12px] font-medium text-blue-700 border-r border-gray-100" style={getGanttColStyle('gPlanned')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.plannedTotal)}
                        </div>
                        <div data-gantt-col="gRealized" className="shrink-0 flex items-center justify-end px-2 text-[12px] font-medium text-emerald-600 border-r border-gray-100" style={getGanttColStyle('gRealized')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.realizedTotal || 0)}
                        </div>
                        <div data-gantt-col="gVariation" className={`shrink-0 flex items-center justify-end px-2 text-[12px] font-medium border-r border-gray-100 ${(node.variation ?? 0) > 0 ? 'text-red-500' : (node.variation ?? 0) < 0 ? 'text-emerald-500' : 'text-gray-400'}`} style={getGanttColStyle('gVariation')}>
                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.variation || 0)}
                        </div>
                        <div data-gantt-col="gResources" className="shrink-0 flex items-center px-2 border-r border-gray-200 overflow-hidden" style={getGanttColStyle('gResources')}>
                            <div className="flex -space-x-1.5 overflow-hidden py-1">
                                {(() => {
                                    const allocations = node.schedule?.allocations || [];
                                    if (allocations.length === 0) return <span className="text-[12px] text-gray-300 italic">Nenhum</span>;
                                    return allocations.map((alloc: ResourceAllocation, idx: number) => (
                                        <div key={idx} className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[12px] font-medium text-indigo-600 shadow-sm ring-1 ring-white" title={(alloc as any).roleName || (alloc as any).workerName || (alloc as any).teamName}>
                                            {((alloc as any).roleName || (alloc as any).workerName || (alloc as any).teamName || '?').substring(0, 1).toUpperCase()}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                        <div data-gantt-col="gRealPct" className="shrink-0 flex items-center justify-center" style={getGanttColStyle('gRealPct')}>
                            <div className="text-[12px] text-blue-600 font-medium">
                                {(node.total > 0 ? (node.realizedTotal / node.total * 100) : 0).toFixed(0)}%
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 bg-gray-100/50 group-hover/row:bg-blue-50/10 transition-colors relative h-full overflow-hidden" style={{ width: `${totalWidth}px` }}>
                        {timelineColumns.map((column, index) => (
                            <div
                                key={`grid-parent-${index}`}
                                className={`absolute top-0 bottom-0 border-l border-gray-200/50 h-full ${index % 2 === 0 ? 'bg-gray-50/10' : ''}`}
                                style={{
                                    left: `${(Math.max(minDate.getTime(), column.date.getTime()) - minDate.getTime()) / (1000 * 60 * 60 * 24) * pxPerDay}px`,
                                    width: `${column.width}px`
                                }}
                            />
                        ))}

                        {(visibleSummaryLevels.has(node.type)) && node.earlyStart && node.earlyFinish ? (() => {
                            const start = new Date(node.earlyStart).getTime();
                            const finish = new Date(node.earlyFinish).getTime();
                            const startOffset = Math.max(0, (start - minDate.getTime()) / (1000 * 60 * 60 * 24));
                            const durationDays = Math.max(1, (finish - start) / (1000 * 60 * 60 * 24) + 1);
                            const width = durationDays * pxPerDay;
                            const left = startOffset * pxPerDay;
                            const baseColor = node.color || '#374151';

                            const progress = node.total > 0 ? (node.realizedTotal / node.total) * 100 : 0;

                            return (
                                <div
                                    className="absolute top-2 h-[14px] z-20 overflow-visible flex items-center group/summary-bar"
                                    style={{ left: `${left}px`, width: `${width}px` }}
                                >
                                    {/* Main Bar Background & Progress clipping */}
                                    <div
                                        className="absolute inset-0 overflow-hidden rounded-sm shadow-sm border border-black/5 flex items-center"
                                        style={{ backgroundColor: `${baseColor}44` }}
                                    >
                                        {/* Progress Fill */}
                                        <div
                                            className="h-full transition-all duration-500"
                                            style={{ width: `${Math.min(100, progress)}%`, backgroundColor: baseColor }}
                                        />

                                        {/* Progress Text overlay */}
                                        {width > 30 && (
                                            <div
                                                className="absolute inset-y-0 left-0 flex items-center justify-end pr-1.5 text-[12px] font-medium text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] pointer-events-none z-10"
                                                style={{ width: `${Math.min(100, progress)}%` }}
                                            >
                                                {progress > 5 ? `${progress.toFixed(0)}%` : ''}
                                            </div>
                                        )}

                                        {/* Top accent line */}
                                        <div className="absolute top-0 left-0 right-0 h-[3px] bg-black/10" />
                                    </div>

                                    {/* Summary hooks (brackets) - positioned outside the clipping div */}
                                    <div className="absolute left-0 top-0 bottom-[-6px] w-[2px] overflow-hidden pointer-events-none">
                                        <div className="w-[10px] h-[10px] rotate-45 translate-y-[8px] -translate-x-1/2 shadow-sm border border-black/10" style={{ backgroundColor: baseColor }} />
                                    </div>
                                    <div className="absolute right-0 top-0 bottom-[-6px] w-[2px] overflow-hidden pointer-events-none">
                                        <div className="w-[10px] h-[10px] -rotate-45 translate-y-[8px] translate-x-1/2 shadow-sm border border-black/10" style={{ backgroundColor: baseColor }} />
                                    </div>

                                    <div className="opacity-0 group-hover/summary-bar:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[12px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none font-medium">
                                        {node.name}: {new Date(node.earlyStart).toLocaleDateString()} - {new Date(node.earlyFinish).toLocaleDateString()} ({durationDays.toFixed(0)}d)
                                    </div>
                                </div>
                            );
                        })() : null}
                    </div>
                </div>
                {(isExpanded || !isVisible) && node.children.map(child => renderGanttRow(child, isVisible))}
            </div>
        );
    };


    try {
        const flattened: Record<string, number> = {};
        let rowIdx = 0;
        const flatten = (nodes: HierarchyNode[], isParentExpanded = true) => {
            nodes.forEach(node => {
                const isVisible = node.type === 'item' || visibleSummaryLevels.has(node.type);
                const isExpanded = expandedNodes[node.id];

                if (isParentExpanded && isVisible) {
                    flattened[node.id] = rowIdx++;
                }

                if (node.children) {
                    // Filtering via visibleSummaryLevels should NOT stop children from being flattened
                    // Only the expansion state (toggle) should prevent descendants from having a row index
                    flatten(node.children, isParentExpanded && isExpanded);
                }
            });
        };
        flatten(hierarchy);


        return (
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-auto bg-white border border-gray-100 rounded-3xl shadow-sm relative scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
            >
                <div className="inline-block min-w-full">
                    {/* Gantt Header */}
                    <div className="flex sticky top-0 z-50 bg-gray-50 border-b border-gray-200 shadow-sm">
                        <div
                            className="shrink-0 flex sticky left-0 z-60 bg-gray-50 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] border-r border-gray-200"
                            style={{ width: `${getGanttSidebarTotal()}px` }}
                        >
                            <div className="shrink-0 px-4 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest border-r border-gray-200 bg-gray-50/80 backdrop-blur-sm flex items-center justify-between group/h-task" style={{ width: `${sidebarWidth}px` }}>
                                <div className="flex items-center gap-2">
                                    <span>Tarefa / Atividade</span>
                                    <div className="relative" ref={colMenuRef}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowColsDropdown(!showColsDropdown); }}
                                            className={`p-1 rounded-md transition-all ${showColsDropdown ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'}`}
                                            title="Gerenciar colunas visíveis"
                                        >
                                            <Columns3 className="w-3 h-3" />
                                        </button>
                                        {showColsDropdown && (
                                            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-[200] animate-in fade-in slide-in-from-top-2 duration-150 normal-case tracking-normal">
                                                <div className="px-3 py-1.5 border-b border-gray-100 mb-1">
                                                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Colunas Visíveis</span>
                                                </div>
                                                <div className="max-h-72 overflow-y-auto">
                                                    {TOGGLEABLE_COLS.map(key => {
                                                        const isVisible = !collapsedCols.has(key);
                                                        return (
                                                            <button
                                                                key={key}
                                                                onClick={(e) => { e.stopPropagation(); onToggleColumn(key); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors group/col"
                                                            >
                                                                <div className={`flex items-center justify-center w-4 h-4 rounded border transition-all ${isVisible ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-300 group-hover/col:border-indigo-300'}`}>
                                                                    {isVisible && (
                                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </div>
                                                                <span className={`text-[12px] font-medium ${isVisible ? 'text-gray-700' : 'text-gray-400'}`}>
                                                                    {COL_LABELS[key]}
                                                                </span>
                                                                {!isVisible && <EyeOff className="w-3 h-3 text-gray-300 ml-auto" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {collapsedCols.size > 0 && (
                                                    <div className="border-t border-gray-100 mt-1 pt-1 px-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleSplitterDblClick(); setShowColsDropdown(false); }}
                                                            className="w-full text-center text-[12px] font-medium text-indigo-600 hover:text-indigo-700 py-1.5 rounded-md hover:bg-indigo-50 transition-colors"
                                                        >
                                                            Exibir todas ({collapsedCols.size} ocultas)
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowLevelsDropdown(!showLevelsDropdown)}
                                        className={`px-2 py-1 flex items-center gap-1.5 rounded-lg border transition-all text-[12px] font-medium ${showLevelsDropdown ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 shadow-sm'}`}
                                        title="Filtrar níveis de resumo"
                                    >
                                        <Filter className={`w-3 h-3 ${showLevelsDropdown ? 'fill-white/20' : ''}`} />
                                        <span>NÍVEIS</span>
                                    </button>

                                    {showLevelsDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowLevelsDropdown(false)} />
                                            <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-100 rounded-xl shadow-2xl z-[70] p-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="text-[12px] font-medium text-gray-400 uppercase tracking-widest px-2 pb-2 border-b border-gray-50 mb-1">Resumo Gantt</div>
                                                {[
                                                    { id: 'group', label: 'Grupos' },
                                                    { id: 'phase', label: 'Etapas' },
                                                    { id: 'subphase', label: 'Subetapas' }
                                                ].map((level) => (
                                                    <button
                                                        key={level.id}
                                                        onClick={() => onToggleSummaryLevel(level.id)}
                                                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg text-left transition-colors group/item"
                                                    >
                                                        <span className={`text-[12px] font-medium ${visibleSummaryLevels.has(level.id) ? 'text-indigo-600' : 'text-gray-500'}`}>{level.label}</span>
                                                        {visibleSummaryLevels.has(level.id) && <Check className="w-3 h-3 text-indigo-600" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div data-gantt-col="gId" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gId')}>ID</div>
                            <div data-gantt-col="gPred" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gPred')}>PRÉD.</div>
                            <div data-gantt-col="gDur" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gDur')}>DUR.</div>
                            <div data-gantt-col="gStart" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gStart')}>INÍCIO</div>
                            <div data-gantt-col="gEnd" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gEnd')}>FIM</div>
                            <div data-gantt-col="gEsEf" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-blue-400 bg-blue-50/30" style={getGanttColStyle('gEsEf')}>P.I/P.T</div>
                            <div data-gantt-col="gLsLf" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-orange-400 bg-orange-50/30" style={getGanttColStyle('gLsLf')}>M.I/M.T</div>
                            <div data-gantt-col="gFloat" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-indigo-400" style={getGanttColStyle('gFloat')}>F.L</div>
                            <div data-gantt-col="gBudgeted" className="shrink-0 border-r border-gray-200 flex items-center justify-end px-2 text-[12px] font-medium text-gray-400" style={getGanttColStyle('gBudgeted')}>ORÇADO</div>
                            <div data-gantt-col="gPlanned" className="shrink-0 border-r border-gray-200 flex items-center justify-end px-2 text-[12px] font-medium text-blue-500" style={getGanttColStyle('gPlanned')}>PLANEJ.</div>
                            <div data-gantt-col="gRealized" className="shrink-0 border-r border-gray-200 flex items-center justify-end px-2 text-[12px] font-medium text-emerald-500" style={getGanttColStyle('gRealized')}>REALIZADO</div>
                            <div data-gantt-col="gVariation" className="shrink-0 border-r border-gray-200 flex items-center justify-end px-2 text-[12px] font-medium text-gray-400" style={getGanttColStyle('gVariation')}>VARIAÇÃO</div>
                            <div data-gantt-col="gResources" className="shrink-0 border-r border-gray-200 flex items-center justify-center text-[12px] font-medium text-gray-400" style={getGanttColStyle('gResources')}>RECURSOS</div>
                            <div data-gantt-col="gRealPct" className="shrink-0 flex items-center justify-center text-[12px] font-medium text-blue-600" style={getGanttColStyle('gRealPct')}>REAL %</div>
                        </div>
                        <div
                            ref={headerRef}
                            className="flex-1 flex overflow-hidden bg-gray-50"
                            style={{ width: `${totalWidth}px` }}
                        >
                            {timelineColumns.map((column, index) => (
                                <div
                                    key={index}
                                    className={`shrink-0 border-l border-gray-100 flex flex-col items-center justify-center px-1 py-1.5 ${column.isToday ? 'bg-orange-50/50' : ''}`}
                                    style={{ width: `${column.width}px` }}
                                >
                                    <span className="text-[12px] font-medium text-gray-400 leading-none">{column.label}</span>
                                    <span className={`text-[12px] font-medium leading-none mt-1 ${column.isToday ? 'text-orange-600' : 'text-gray-300'}`}>{column.subLabel}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        {hierarchy.map(node => renderGanttRow(node, true))}

                        {/* Global Today Line */}
                        {(() => {
                            const today = new Date();
                            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                            const minDateTime = minDate.getTime();
                            if (todayStart >= minDateTime) {
                                const offsetDays = (todayStart - minDateTime) / (1000 * 60 * 60 * 24);
                                const left = offsetDays * pxPerDay + getGanttSidebarTotal();
                                return (
                                    <div
                                        className="absolute top-0 bottom-0 w-[2px] bg-orange-500/60 z-30 pointer-events-none"
                                        style={{ left: `${left}px` }}
                                    >
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rotate-45 flex items-center justify-center text-[12px] font-medium text-white shadow-lg">
                                            H
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-[25]" style={{ minHeight: `${rowIdx * 36}px`, width: `${totalWidth + getGanttSidebarTotal()}px` }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orientation="auto">
                                    <path d="M0,0 L6,2 L0,4 Z" fill="#94a3b8" />
                                </marker>
                            </defs>
                            {(() => {
                                const tasks = schedule.itemSchedules || [];
                                return tasks.map(task => {
                                    if (!task.startDate || !task.predecessors?.length) return null;
                                    const taskIdx = flattened[task.id];
                                    if (taskIdx === undefined) return null;

                                    const taskStart = new Date(task.startDate).getTime();
                                    const taskLeft = ((taskStart - minDate.getTime()) / (1000 * 60 * 60 * 24)) * pxPerDay + getGanttSidebarTotal();
                                    const taskWidth = (task.duration || 1) * pxPerDay;
                                    const taskRight = taskLeft + taskWidth;
                                    const taskY = taskIdx * 36 + 18;

                                    return task.predecessors.map((pred, pIdx) => {
                                        const predTask = tasks.find(t => t.id === pred.id);
                                        const fromIdx = flattened[pred.id];
                                        if (!predTask?.startDate || fromIdx === undefined) return null;

                                        const predStart = new Date(predTask.startDate).getTime();
                                        const predLeft = ((predStart - minDate.getTime()) / (1000 * 60 * 60 * 24)) * pxPerDay + getGanttSidebarTotal();
                                        const predWidth = (predTask.duration || 1) * pxPerDay;
                                        const predRight = predLeft + predWidth;
                                        const predY = fromIdx * 36 + 18;

                                        let startX = 0;
                                        let endX = 0;

                                        if (pred.type === 'FS') { startX = predRight; endX = taskLeft; }
                                        else if (pred.type === 'SS') { startX = predLeft; endX = taskLeft; }
                                        else if (pred.type === 'FF') { startX = predRight; endX = taskRight; }
                                        else if (pred.type === 'SF') { startX = predLeft; endX = taskRight; }

                                        const isCritical = task.isCritical && predTask.isCritical;
                                        const color = isCritical ? '#ef4444' : '#94a3b8';

                                        const midX = startX + (endX - startX) / 2;
                                        const d = `M ${startX} ${predY} L ${midX} ${predY} L ${midX} ${taskY} L ${endX} ${taskY}`;

                                        return (
                                            <path
                                                key={`${task.id}-${pred.id}-${pIdx}`}
                                                d={d}
                                                fill="none"
                                                stroke={color}
                                                strokeWidth={isCritical ? 1.5 : 1}
                                                markerEnd="url(#arrowhead)"
                                                className="transition-all duration-300"
                                            />
                                        );
                                    });
                                });
                            })()}
                        </svg>
                    </div>
                </div>
            </div>
        );
    } catch (err) {
        console.error('Error rendering Gantt:', err);
        return <div className="p-4 text-red-500">Erro ao renderizar gráfico Gantt. Verifique o console.</div>;
    }
};
