import React from 'react';
import {
    ChevronDown,
    ChevronRight,
    Camera,
    AlertCircle,
    Link2,
    Users,
    Columns3,
    EyeOff,
    Filter,
    Check
} from 'lucide-react';
import { HierarchyNode, ProjectSchedule, ItemScheduleDetails } from '../../types';
import ModernDateInput from '../ModernDateInput';

interface ScheduleGridViewProps {
    hierarchy: HierarchyNode[];
    schedule: ProjectSchedule;
    timelineColumns: any[];
    timeScale: 'day' | 'week' | 'month' | 'year';
    expandedNodes: Record<string, boolean>;
    toggleNode: (id: string) => void;
    handleUpdateItemSchedule: (itemId: string, field: 'duration' | 'startDate' | 'endDate', value: string | number) => void;
    handleUpdatePredecessorField: (itemId: string, field: 'uid' | 'type' | 'lag', value: any) => void;
    handleUpdateCrewField: (id: string, field: string, value: any) => void;
    handleUpdateDistribution: (itemId: string, periodId: string, value: string) => void;
    handleUpdateRealPct: (itemId: string, value: string) => void;
    getDistribution: (itemId: string, periodId: string) => number;
    getPhotosForItem: (itemId: string) => any[];
    setViewingTaskPhotos: (task: any) => void;
    handleDistributeEvenly: (itemId: string) => void;
    handleClearItem: (itemId: string) => void;
    idToUid: Record<string, string>;
    realizedState: any;
    nodePeriodPlanned: Record<string, Record<string, number>>;
    nodePeriodRealized: Record<string, Record<string, number>>;
    periodTotals: Record<string, { planned: number; realized: number }>;
    budget: any[];
    collapsedCols: Set<string>;
    handleSplitterMouseDown: (e: React.MouseEvent) => void;
    handleSplitterDblClick: () => void;
    getColWidth: (key: string) => number | string;
    collapsedColStyle: string;
    tableRef: React.RefObject<HTMLTableElement | null>;
    ResizeHandle: React.FC<{ colKey: string }>;
    setPredecessorModalTask: (id: string) => void;
    setResourceAllocationTask: (id: string) => void;
    crewPopoverItem: string | null;
    setCrewPopoverItem: (id: string | null) => void;
    formatDateDisplay: (date: any) => string;
    taskInsights?: Record<string, { missingItems: number; missingCost: number; hasAlert: boolean; message: string }>;
    onToggleColumn?: (colKey: string) => void;
    visibleSummaryLevels?: Set<string>;
    onToggleSummaryLevel?: (level: string) => void;
}

const ScheduleGridView: React.FC<ScheduleGridViewProps> = ({
    hierarchy,
    schedule,
    timelineColumns,
    timeScale,
    expandedNodes,
    toggleNode,
    handleUpdateItemSchedule,
    handleUpdatePredecessorField,
    handleUpdateCrewField,
    handleUpdateDistribution,
    handleUpdateRealPct,
    getDistribution,
    getPhotosForItem,
    setViewingTaskPhotos,
    handleDistributeEvenly,
    handleClearItem,
    idToUid,
    realizedState,
    nodePeriodPlanned,
    nodePeriodRealized,
    periodTotals,
    budget,
    collapsedCols,
    handleSplitterMouseDown,
    handleSplitterDblClick,
    getColWidth,
    collapsedColStyle,
    tableRef,
    ResizeHandle,
    setPredecessorModalTask,
    setResourceAllocationTask,
    crewPopoverItem,
    setCrewPopoverItem,
    formatDateDisplay,
    taskInsights,
    onToggleColumn,
    visibleSummaryLevels,
    onToggleSummaryLevel,
}) => {
    const [isColMenuOpen, setIsColMenuOpen] = React.useState(false);
    const [showLevelsDropdown, setShowLevelsDropdown] = React.useState(false);
    const colMenuRef = React.useRef<HTMLDivElement>(null);
    const levelsMenuRef = React.useRef<HTMLDivElement>(null);

    // Close menu on click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
                setIsColMenuOpen(false);
            }
            if (levelsMenuRef.current && !levelsMenuRef.current.contains(e.target as Node)) {
                setShowLevelsDropdown(false);
            }
        };
        if (isColMenuOpen || showLevelsDropdown) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isColMenuOpen, showLevelsDropdown]);

    const COL_LABELS: Record<string, string> = {
        uid: 'ID',
        pred: 'Predecessora',
        duration: 'Duração',
        start: 'Início',
        end: 'Término',
        esef: 'ES/EF',
        lslf: 'LS/LF',
        float: 'Folga',
        budgeted: 'Orçado (B)',
        planned: 'Planejado (C)',
        realized: 'Realizado',
        variation: 'Variação',
        resources: 'Recursos',
        realPct: 'Real %',
    };
    const TOGGLEABLE_COLS = Object.keys(COL_LABELS);

    return (
        <div className="overflow-x-auto">
            {collapsedColStyle && <style>{collapsedColStyle}</style>}
            <table ref={tableRef} className="sched-tbl w-full text-[12px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                    <col data-col="item" style={{ width: getColWidth('item') }} />
                    <col data-col="uid" style={{ width: getColWidth('uid') }} />
                    <col data-col="pred" style={{ width: getColWidth('pred') }} />
                    <col data-col="duration" style={{ width: getColWidth('duration') }} />
                    <col data-col="start" style={{ width: getColWidth('start') }} />
                    <col data-col="end" style={{ width: getColWidth('end') }} />
                    <col data-col="esef" style={{ width: getColWidth('esef') }} />
                    <col data-col="lslf" style={{ width: getColWidth('lslf') }} />
                    <col data-col="float" style={{ width: getColWidth('float') }} />
                    <col data-col="budgeted" style={{ width: getColWidth('budgeted') }} />
                    <col data-col="planned" style={{ width: getColWidth('planned') }} />
                    <col data-col="realized" style={{ width: getColWidth('realized') }} />
                    <col data-col="variation" style={{ width: getColWidth('variation') }} />
                    <col data-col="resources" style={{ width: 140 }} />
                    <col data-col="realPct" style={{ width: getColWidth('realPct') }} />
                    <col data-col="splitter" style={{ width: 6 }} />
                    {timelineColumns.map(column => (
                        <col key={column.id} data-col={`tl-${column.id}`} style={{ width: 80 }} />
                    ))}
                    <col data-col="totalPct" style={{ width: getColWidth('totalPct') }} />
                </colgroup>
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 uppercase tracking-widest">
                    <tr>
                        <th className="px-4 py-3 text-left relative">
                            <div className="flex items-center gap-2">
                                <span>Item / Etapa</span>
                                {onToggleColumn && (
                                    <div className="relative" ref={colMenuRef}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsColMenuOpen(!isColMenuOpen); }}
                                            className={`p-1 rounded-md transition-all ${isColMenuOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                            title="Gerenciar colunas visíveis"
                                        >
                                            <Columns3 className="w-3.5 h-3.5" />
                                        </button>
                                        {isColMenuOpen && (
                                            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-[200] animate-in fade-in slide-in-from-top-2 duration-150">
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
                                                                <div className={`flex items-center justify-center w-4 h-4 rounded border transition-all ${isVisible ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover/col:border-blue-300'}`}>
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
                                                            onClick={(e) => { e.stopPropagation(); handleSplitterDblClick(); setIsColMenuOpen(false); }}
                                                            className="w-full text-center text-[12px] font-medium text-blue-600 hover:text-blue-700 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                                                        >
                                                            Exibir todas ({collapsedCols.size} ocultas)
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {visibleSummaryLevels && onToggleSummaryLevel && (
                                    <div className="relative ml-auto" ref={levelsMenuRef}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowLevelsDropdown(!showLevelsDropdown); }}
                                            className={`px-2 py-1 flex items-center gap-1.5 rounded-lg border transition-all text-[12px] font-medium ${showLevelsDropdown ? 'bg-blue-600 border-blue-700 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 shadow-sm'}`}
                                            title="Filtrar níveis de resumo"
                                        >
                                            <Filter className={`w-3 h-3 ${showLevelsDropdown ? 'fill-white/20' : ''}`} />
                                            <span>NÍVEIS</span>
                                        </button>

                                        {showLevelsDropdown && (
                                            <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-100 rounded-xl shadow-2xl z-50 p-2 animate-in fade-in slide-in-from-top-1 duration-200 normal-case tracking-normal">
                                                <div className="text-[12px] font-medium text-gray-400 uppercase tracking-widest px-2 pb-2 border-b border-gray-50 mb-1">Resumo Planilha</div>
                                                {[
                                                    { id: 'group', label: 'Grupos' },
                                                    { id: 'phase', label: 'Etapas' },
                                                    { id: 'subphase', label: 'Subetapas' }
                                                ].map((level) => (
                                                    <button
                                                        key={level.id}
                                                        onClick={() => onToggleSummaryLevel(level.id)}
                                                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg text-left transition-colors group/levelitem"
                                                    >
                                                        <span className={`text-[12px] font-medium ${visibleSummaryLevels.has(level.id) ? 'text-blue-600' : 'text-gray-500'}`}>{level.label}</span>
                                                        {visibleSummaryLevels.has(level.id) && <Check className="w-3 h-3 text-blue-600" />}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <ResizeHandle colKey="item" />
                        </th>
                        <th className="px-1 py-3 text-center relative">ID<ResizeHandle colKey="uid" /></th>
                        <th className="px-1 py-3 text-center relative">Pred<ResizeHandle colKey="pred" /></th>
                        <th className="px-4 py-3 text-center relative">Duração<ResizeHandle colKey="duration" /></th>
                        <th className="px-4 py-3 text-center relative">Início<ResizeHandle colKey="start" /></th>
                        <th className="px-4 py-3 text-center relative">Término<ResizeHandle colKey="end" /></th>
                        <th className="px-4 py-3 text-center bg-blue-50/50 relative">ES/EF<ResizeHandle colKey="esef" /></th>
                        <th className="px-4 py-3 text-center bg-orange-50/50 relative">LS/LF<ResizeHandle colKey="lslf" /></th>
                        <th className="px-4 py-3 text-center relative">Folga<ResizeHandle colKey="float" /></th>
                        <th className="px-4 py-3 text-right relative">Orçado (B)<ResizeHandle colKey="budgeted" /></th>
                        <th className="px-4 py-3 text-right relative">Plan. (C)<ResizeHandle colKey="planned" /></th>
                        <th className="px-4 py-3 text-right relative">Real<ResizeHandle colKey="realized" /></th>
                        <th className="px-4 py-3 text-right relative">Var.<ResizeHandle colKey="variation" /></th>
                        <th className="px-4 py-3 text-left relative text-[12px] text-gray-400 uppercase tracking-widest font-medium">Recursos</th>
                        <th className="px-4 py-3 text-center border-l border-gray-200 relative">Real %<ResizeHandle colKey="realPct" /></th>
                        <th
                            className="relative p-0 cursor-col-resize select-none group/splitter"
                            onMouseDown={handleSplitterMouseDown}
                            onDoubleClick={handleSplitterDblClick}
                            title={collapsedCols.size > 0 ? `${collapsedCols.size} colunas ocultas — duplo clique para restaurar` : 'Arraste para ocultar colunas'}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-300 via-blue-400 to-blue-300 group-hover/splitter:from-blue-400 group-hover/splitter:via-blue-500 group-hover/splitter:to-blue-400 transition-colors" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[2px] opacity-60 group-hover/splitter:opacity-100 transition-opacity">
                                <div className="w-[2px] h-[2px] rounded-full bg-white" />
                                <div className="w-[2px] h-[2px] rounded-full bg-white" />
                                <div className="w-[2px] h-[2px] rounded-full bg-white" />
                            </div>
                            {collapsedCols.size > 0 && (
                                <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-blue-500 text-white text-[12px] w-4 h-4 flex items-center justify-center rounded-full shadow-sm font-medium z-30">
                                    {collapsedCols.size}
                                </div>
                            )}
                        </th>
                        {timelineColumns.map(column => (
                            <th key={column.id} className="px-2 py-3 text-center border-l border-gray-100 relative">
                                <div className="text-[12px] font-medium text-gray-700">{column.name}</div>
                                {timeScale !== 'day' && (
                                    <div className="text-[12px] font-normal text-gray-400">
                                        {new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(column.date)}
                                    </div>
                                )}
                                <ResizeHandle colKey={`tl-${column.id}`} />
                            </th>
                        ))}
                        <th className="px-4 py-3 text-center border-l border-gray-200 relative">Total %<ResizeHandle colKey="totalPct" /></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {hierarchy.map(node => {
                        const renderNode = (node: HierarchyNode) => {
                            const isExpanded = expandedNodes[node.id];
                            const isItem = node.type === 'item';

                            if (isItem && node.data) {
                                const item = node.data;
                                const totalDistributed = schedule.periods.reduce((sum, period) => sum + getDistribution(item.id, period.id), 0);
                                const isFullyDistributed = Math.abs(totalDistributed - 100) < 0.1;
                                const itemSchedule = schedule.itemSchedules?.find(s => s.id === item.id) || { id: item.id } as ItemScheduleDetails;

                                return (
                                    <tr key={item.id} className="hover:bg-blue-50/10 transition-colors group">
                                        <td className="px-4 py-2" style={{ paddingLeft: `${(node.level * 20) + 16}px` }}>
                                            <div className="flex items-center gap-2">
                                                <div className="font-medium text-gray-700 truncate max-w-[300px] text-[12px]" title={item.sinapiItem.description}>
                                                    {item.sinapiItem.description}
                                                </div>
                                                {getPhotosForItem(item.id).length > 0 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingTaskPhotos({
                                                                id: item.id,
                                                                name: item.sinapiItem.description,
                                                                photos: getPhotosForItem(item.id)
                                                            });
                                                        }}
                                                        className="p-1 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors shadow-sm shrink-0"
                                                        title={`${getPhotosForItem(item.id).length} fotos do Diário de Obra`}
                                                    >
                                                        <Camera className="w-3 h-3" />
                                                    </button>
                                                )}
                                                {taskInsights?.[item.id]?.hasAlert && (
                                                    <div className="shrink-0 flex items-center justify-center p-1 bg-red-50 text-red-500 rounded cursor-help transition-all hover:bg-red-100 relative group/insight">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 hidden group-hover/insight:block w-48 p-2 bg-gray-900 border border-gray-800 text-white text-[12px] font-medium leading-tight rounded shadow-xl z-[100] break-words whitespace-normal text-center">
                                                            {taskInsights[item.id].message}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleDistributeEvenly(item.id)} className="text-[12px] text-blue-500 hover:underline cursor-pointer flex items-center gap-1">Distribuir Igual</button>
                                                <span className="text-gray-300">|</span>
                                                <button onClick={() => handleClearItem(item.id)} className="text-[12px] text-red-400 hover:text-red-500 hover:underline cursor-pointer">Limpar</button>
                                            </div>
                                        </td>
                                        <td className={`px-1 py-2 text-center font-medium transition-all ${itemSchedule.isCritical ? 'text-red-600 bg-red-50' : 'text-gray-400 bg-gray-50/50'}`}>
                                            <div className="flex items-center justify-center gap-1">
                                                {node.uid}
                                                {itemSchedule.isCritical && <AlertCircle className="w-2.5 h-2.5 animate-pulse" />}
                                            </div>
                                        </td>
                                        <td className="px-1 py-1 text-center group/pred relative">
                                            <input
                                                type="text"
                                                className="w-full bg-transparent border-none rounded text-center text-[12px] p-1 focus:ring-1 focus:ring-blue-300 font-medium text-blue-600"
                                                value={itemSchedule.predecessors?.map(p => idToUid[p.id] || '').join(', ') || ''}
                                                onChange={(e) => handleUpdatePredecessorField(item.id, 'uid', e.target.value)}
                                                placeholder="-"
                                            />
                                            {(itemSchedule.predecessors?.length || 0) > 1 && (
                                                <span className="absolute -right-1 -top-1 bg-blue-500 text-white text-[12px] w-3 h-3 flex items-center justify-center rounded-full border border-white shadow-sm font-medium z-10">
                                                    +{itemSchedule.predecessors!.length - 1}
                                                </span>
                                            )}
                                            <button onClick={() => setPredecessorModalTask(item.id)} className="absolute right-0 opacity-0 group-hover/pred:opacity-100 p-0.5 text-blue-500 hover:bg-blue-50 rounded transition-opacity">
                                                <Link2 className="w-3 h-3" />
                                            </button>
                                        </td>
                                        <td className="px-1 py-1 text-center relative group/dur">
                                            {itemSchedule.autoDuration ? (
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <span className="text-[12px] font-medium text-green-600">{itemSchedule.duration ?? '—'}d</span>
                                                    <button onClick={() => handleUpdateCrewField(item.id, 'autoDuration', false)} className="text-green-500 hover:text-green-700 transition-colors" title="Desativar cálculo automático">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-0.5">
                                                    <input
                                                        type="number" min="0"
                                                        className="w-16 bg-gray-50 border border-gray-200 rounded text-center text-[12px] p-1"
                                                        value={itemSchedule.duration ?? ''}
                                                        onChange={(e) => handleUpdateItemSchedule(item.id, 'duration', parseInt(e.target.value, 10) || 0)}
                                                        placeholder="dias"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            handleUpdateCrewField(item.id, 'autoDuration', true);
                                                            setCrewPopoverItem(item.id);
                                                        }}
                                                        className="flex items-center justify-center w-5 h-5 rounded bg-blue-50 border border-blue-200 text-blue-500 hover:bg-blue-100 hover:text-blue-700 transition-colors shrink-0"
                                                        title="Calcular duração pela equipe"
                                                    >
                                                        <Users className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                            {(crewPopoverItem === item.id || itemSchedule.autoDuration) && (
                                                <button
                                                    onClick={() => setCrewPopoverItem(crewPopoverItem === item.id ? null : item.id)}
                                                    className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[12px] px-1.5 py-0 rounded-b-md border border-t-0 border-gray-200 z-20 transition-colors ${crewPopoverItem === item.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-500'}`}
                                                >
                                                    ▾ equipe
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                            <ModernDateInput
                                                value={itemSchedule.startDate ? itemSchedule.startDate.split('T')[0] : ''}
                                                onChange={(val) => handleUpdateItemSchedule(item.id, 'startDate', val)}
                                                compact
                                                className="w-32 mx-auto"
                                            />
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                            <div className="text-[12px] font-medium text-gray-500">{formatDateDisplay(itemSchedule.endDate)}</div>
                                        </td>
                                        <td className={`px-1 py-2 text-center bg-blue-50/20 text-[12px] font-medium ${node.isCritical ? 'text-red-500' : 'text-blue-600'}`}>
                                            <div>{formatDateDisplay(node.earlyStart)}</div>
                                            <div>{formatDateDisplay(node.earlyFinish)}</div>
                                        </td>
                                        <td className="px-1 py-2 text-center bg-orange-50/20 text-[12px] font-medium text-orange-600">
                                            <div>{formatDateDisplay(node.lateStart)}</div>
                                            <div>{formatDateDisplay(node.lateFinish)}</div>
                                        </td>
                                        <td className="px-1 py-2 text-center font-medium text-[12px] text-indigo-600">
                                            {node.totalFloat !== undefined ? `${node.totalFloat}d` : '-'}
                                        </td>
                                        <td className="px-1 py-2 text-right text-[12px] text-gray-500">
                                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.budgetedTotal)}
                                        </td>
                                        <td className="px-1 py-2 text-right text-[12px] font-medium text-blue-700">
                                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.plannedTotal)}
                                        </td>
                                        <td className="px-1 py-2 text-right text-[12px] text-green-700">
                                            {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.realizedTotal)}
                                        </td>
                                        <td className={`px-1 py-2 text-right text-[12px] font-medium ${node.variation && node.variation > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                            {node.variation ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2, signDisplay: 'always' }).format(node.variation) : '-'}
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex flex-wrap gap-1 min-h-[24px] cursor-pointer hover:bg-black/5 p-1 rounded-lg transition-colors group/res" onClick={() => setResourceAllocationTask(item.id)}>
                                                {itemSchedule.allocations?.map(alloc => {
                                                    const role = alloc.resourceType === 'ROLE' ? schedule.resources?.roles.find(r => r.id === alloc.resourceId) : null;
                                                    const worker = alloc.resourceType === 'WORKER' ? schedule.resources?.workers.find(w => w.id === alloc.resourceId) : null;
                                                    const name = role?.name || worker?.name || 'Recurso';
                                                    return (
                                                        <span key={alloc.id} className={`px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-tighter ${alloc.resourceType === 'ROLE' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`} title={name}>
                                                            {name.substring(0, 10)}{name.length > 10 ? '...' : ''}
                                                        </span>
                                                    );
                                                })}
                                                {(itemSchedule.allocations?.length || 0) === 0 && <span className="text-[12px] text-gray-300 font-medium opacity-0 group-hover/res:opacity-100 transition-opacity">+ Alocar</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 border-l border-gray-100">
                                            <div className="overflow-hidden w-full">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-[12px] text-blue-600 font-medium whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="1"
                                                                className={`w-10 bg-transparent border-none p-0 text-[12px] font-medium focus:ring-1 focus:ring-blue-300 rounded ${itemSchedule.manualRealPct !== undefined ? 'text-orange-500' : 'text-blue-600'}`}
                                                                value={(() => {
                                                                    const calculatedPct = node.total > 0 ? (node.realizedTotal / node.total * 100) : 0;
                                                                    // If we have manualPct, show it. But if diary showed more (already factored in node.realizedTotal), 
                                                                    // we show the calculated one to avoid "0%" confusion.
                                                                    return Math.max(Number(itemSchedule.manualRealPct) || 0, calculatedPct).toFixed(0);
                                                                })()}
                                                                onChange={(e) => handleUpdateRealPct(item.id, e.target.value)}
                                                                placeholder="0"
                                                            />
                                                            <span>%</span>
                                                            {itemSchedule.manualRealPct !== undefined && (
                                                                <button
                                                                    onClick={() => handleUpdateRealPct(item.id, '')}
                                                                    className="ml-1 text-[12px] text-gray-400 hover:text-red-500 uppercase tracking-tighter"
                                                                    title="Voltar ao automático"
                                                                >
                                                                    Limpar
                                                                </button>
                                                            )}
                                                        </div>
                                                        <span className="text-gray-400">Progresso</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden relative">
                                                        <div
                                                            className={`${itemSchedule.manualRealPct !== undefined ? 'bg-orange-400' : 'bg-blue-400'} h-full transition-all`}
                                                            style={{ width: `${Math.min(node.total > 0 ? (node.realizedTotal / node.total * 100) : 0, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-0 bg-blue-200/30" />
                                        {timelineColumns.map(column => {
                                            const pct = getDistribution(item.id, column.id);
                                            const plannedVal = nodePeriodPlanned[item.id]?.[column.id] || 0;
                                            const realizedVal = nodePeriodRealized[item.id]?.[column.id] || 0;
                                            return (
                                                <td key={column.id} className="px-1 py-1 border-l border-gray-100 text-center relative min-w-[80px]">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="relative group/input mx-1">
                                                            <div className="absolute inset-0 bg-blue-50 rounded-md pointer-events-none transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                value={pct || ''}
                                                                onChange={(e) => {
                                                                    const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                                                    handleUpdateDistribution(item.id, column.id, val.toString());
                                                                }}
                                                                className={`relative z-10 w-full text-center bg-transparent outline-none text-[12px] font-medium py-1 rounded-md focus:bg-white focus:ring-1 focus:ring-blue-300 transition-all ${pct > 0 ? 'text-blue-700 font-medium' : 'text-gray-400'}`}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col text-[12px] leading-tight px-1">
                                                            {plannedVal > 0 && <span className="text-blue-500 font-medium">O: {new Intl.NumberFormat('pt-BR').format(plannedVal)}</span>}
                                                            {realizedVal > 0 && <span className="text-green-600 font-medium">E: {new Intl.NumberFormat('pt-BR').format(realizedVal)}</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-2 text-center border-l border-gray-100">
                                            <div className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-medium ${isFullyDistributed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {isFullyDistributed ? <span>100%</span> : <span>{totalDistributed.toFixed(0)}%</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            const hasChildren = node.children && node.children.length > 0;
                            const isVisible = isItem || !visibleSummaryLevels || visibleSummaryLevels.has(node.type);

                            if (!isVisible) {
                                return (
                                    <React.Fragment key={node.id}>
                                        {node.children.map(child => renderNode(child))}
                                    </React.Fragment>
                                );
                            }

                            return (
                                <React.Fragment key={node.id}>
                                    <tr className={`bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer ${node.type === 'subphase' ? 'bg-gray-50/20' : ''}`} onClick={() => toggleNode(node.id)}>
                                        <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2" style={{ paddingLeft: `${(node.level * 20) + 16}px` }}>
                                            {hasChildren && (isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
                                            <span className={`${node.isCritical ? 'text-red-700' : ''}`}>{node.name}</span>
                                            {taskInsights?.[node.id]?.hasAlert && (
                                                <div className="shrink-0 flex items-center justify-center p-1 bg-red-50 text-red-500 rounded cursor-help transition-all hover:bg-red-100 relative group/insight ml-auto">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 hidden group-hover/insight:block w-48 p-2 bg-gray-900 border border-gray-800 text-white text-[12px] font-medium leading-tight rounded shadow-xl z-[100] text-center">
                                                        {taskInsights[node.id].message}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className={`px-1 py-3 text-center font-medium ${node.isCritical ? 'text-red-500 bg-red-50' : 'text-gray-400'}`}>{node.uid}</td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-1 py-3"></td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900 text-[12px]">{new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.budgetedTotal)}</td>
                                        <td className="px-2 py-3 text-right font-medium text-blue-700 text-[12px]">{new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.plannedTotal)}</td>
                                        <td className="px-2 py-3 text-right font-medium text-green-700 text-[12px]">{new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(node.realizedTotal)}</td>
                                        <td className={`px-2 py-3 text-right font-medium text-[12px] ${node.variation && node.variation > 0 ? 'text-red-500' : 'text-green-600'}`}>{node.variation ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2, signDisplay: 'always' }).format(node.variation) : '-'}</td>
                                        <td className="px-2 py-3"></td>
                                        <td className="px-4 py-3 border-l border-gray-200">
                                            <div className="overflow-hidden w-full">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-[12px] text-blue-600 font-medium whitespace-nowrap">
                                                        <span>{node.total > 0 ? (node.realizedTotal / node.total * 100).toFixed(0) : 0}%</span>
                                                        <span className="text-gray-400 font-medium uppercase tracking-tighter">Realizado</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.min(node.total > 0 ? (node.realizedTotal / node.total * 100) : 0, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-0 bg-blue-200/30" />
                                        {timelineColumns.map(column => {
                                            const plannedVal = nodePeriodPlanned[node.id]?.[column.id] || 0;
                                            const realizedVal = nodePeriodRealized[node.id]?.[column.id] || 0;
                                            return (
                                                <td key={column.id} className="px-2 py-3 border-l border-gray-100 bg-gray-50/30 text-[12px] text-center">
                                                    <div className="flex flex-col gap-0.5 font-medium">
                                                        {plannedVal > 0 && <span className="text-blue-600">O: {new Intl.NumberFormat('pt-BR').format(plannedVal)}</span>}
                                                        {realizedVal > 0 && <span className="text-green-700">E: {new Intl.NumberFormat('pt-BR').format(realizedVal)}</span>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-3 border-l border-gray-200"></td>
                                    </tr>
                                    {isExpanded && node.children.map(child => renderNode(child))}
                                </React.Fragment>
                            );
                        };
                        return renderNode(node);
                    })}
                </tbody>
                <tfoot className="bg-gray-50 font-medium text-gray-900 border-t-2 border-gray-200">
                    <tr>
                        <td className="px-4 py-3">TOTAL GERAL</td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-1 py-3"></td>
                        <td className="px-4 py-3 text-right">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget.reduce((sum, item) => {
                                const task = schedule.itemSchedules?.find(s => s.id === item.id);
                                return sum + (task?.budgetedValue ?? (item.quantity * item.sinapiItem.price));
                            }, 0))}
                        </td>
                        <td className="px-2 py-3 text-right">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget.reduce((sum, item) => {
                                const task = schedule.itemSchedules?.find(s => s.id === item.id);
                                return sum + (task?.plannedValue ?? task?.totalLaborCost ?? (item.quantity * item.sinapiItem.price));
                            }, 0))}
                        </td>
                        <td className="px-2 py-3 text-right text-green-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Object.values(realizedState.realizedValues) as number[]).reduce((a: number, b: number) => a + b, 0))}
                        </td>
                        <td className="px-2 py-3"></td>
                        <td className="px-2 py-3"></td>
                        <td className="px-4 py-3 border-l border-gray-100"></td>
                        <td className="p-0 bg-blue-200/30" />
                        {timelineColumns.map(column => {
                            const pData = periodTotals[column.id] || { planned: 0, realized: 0 };
                            return (
                                <td key={column.id} className="px-2 py-3 text-center border-l border-gray-100 text-[12px]">
                                    <div className="flex flex-col">
                                        <span className="text-blue-700">O: {new Intl.NumberFormat('pt-BR').format(pData.planned)}</span>
                                        <span className="text-green-700">E: {new Intl.NumberFormat('pt-BR').format(pData.realized)}</span>
                                    </div>
                                </td>
                            );
                        })}
                        <td className="border-l border-gray-200"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

export default ScheduleGridView;
