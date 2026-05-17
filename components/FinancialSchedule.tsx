import React, { useState, useEffect, useRef } from 'react';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
    ProjectSettings,
    BudgetEntry,
    ProjectSchedule,
    SchedulePeriod,
    ItemScheduleDetails,
    DependencyType,
    Predecessor,
    ConstraintType,
    Baseline,
    ReplanMode,
    PurchaseOrder,
    ResourceRole,
    ResourceAllocation,
    LevelingIssue,
    ResourceWorker,
    ResourceTeam,
    LevelingResult,
    HierarchyNode,
    FinancialTransaction
} from '../types';
import { BaselineModal } from './schedule/BaselineModal';
import { ConfigModal } from './schedule/ConfigModal';
import { LevelingDecisionModal } from './schedule/LevelingDecisionModal';
import { PredecessorModal } from './schedule/PredecessorModal';
import { ResourceAllocationModal } from './schedule/ResourceAllocationModal';
import { ScheduleGantt } from './schedule/ScheduleGantt';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { ResourceManagement } from './ResourceManagement';
import { ScheduleRiskDashboard } from './schedule/ScheduleRiskDashboard';
import { orderService } from '../services/orderService';
import { projectService } from '../services/projectService';
import ScheduleHeader from './schedule/ScheduleHeader';
import SimulationBanner from './schedule/SimulationBanner';
import ScheduleGridView from './schedule/ScheduleGridView';
import ModernDateInput from './ModernDateInput';
import {
    ChevronDown,
    AlertTriangle,
    TrendingUp,
    Camera,
    X,
    FileDown,
    Trash
} from 'lucide-react';

function getWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

const formatDateDisplay = (dateString?: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return dateString;
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
};

function ensureFullScheduleList(currentItems: ItemScheduleDetails[], budgetItems: BudgetEntry[]): ItemScheduleDetails[] {
    const list = [...currentItems];
    budgetItems.forEach(item => {
        if (!list.some(s => s.id === item.id)) {
            const laborData = SchedulingEngine.deriveTotalLaborFromComposition(item.sinapiItem.composition || []);
            const effortCoef = SchedulingEngine.deriveEffortCoefficient(item.sinapiItem.composition || []);

            list.push({
                id: item.id,
                autoDuration: effortCoef > 0,
                effortCoefficient: effortCoef,
                totalManHours: laborData.effort * item.quantity,
                totalLaborCost: laborData.cost * item.quantity,
                crewMainWorkers: 1,
                hoursPerDay: 8,
                efficiencyFactor: 1.0
            });
        }
    });
    return list;
}
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

interface FinancialScheduleProps {
    settings: ProjectSettings;
    budget: BudgetEntry[];
    projects: any[];
    organizations?: any[]; // Organization[] (using any to avoid complex import cycles for now)
    onLoadProject: (id: string, targetView?: string) => void;
    onUpdateSettings: (settings: ProjectSettings) => void;
    onBack?: () => void;
    organizationId?: string;
}


function buildHierarchy(budget: BudgetEntry[], itemSchedules: ItemScheduleDetails[] = [], realizedValues: Record<string, number>, globalBdi: number = 0): HierarchyNode[] {
    const groups: Record<string, HierarchyNode> = {};

    budget.forEach(item => {
        const itemBdi = item.bdi !== undefined ? item.bdi : globalBdi;
        const itemTotal = item.quantity * item.sinapiItem.price * (1 + itemBdi / 100);
        const itemRealized = realizedValues[item.id] || 0;
        const itemSchedule = itemSchedules.find(s => s.id === item.id);

        // Manual override or automatic from labor
        const pValue = itemSchedule?.plannedValue ?? itemSchedule?.totalLaborCost ?? itemTotal;
        const bValue = itemSchedule?.budgetedValue ?? itemTotal;

        // 1. Group Level
        const groupName = item.group || 'Sem Grupo';
        const groupId = `group-${groupName}`;

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                uid: '',
                type: 'group',

                name: groupName,
                children: [],
                total: 0,
                realizedTotal: 0,
                budgetedTotal: 0,
                plannedTotal: 0,
                variation: 0,
                level: 0
            };
        }
        groups[groupId].total += itemTotal;
        groups[groupId].realizedTotal += itemRealized;
        groups[groupId].budgetedTotal += bValue;
        groups[groupId].plannedTotal += pValue;
        groups[groupId].variation = (groups[groupId].variation || 0) + (itemSchedule?.costVariation || 0);

        // 2. Phase Level
        const phaseName = item.phase || 'Sem Etapa';
        const phaseId = `${groupId}-phase-${phaseName}`;
        let phaseNode = groups[groupId].children.find(c => c.id === phaseId);

        if (!phaseNode) {
            phaseNode = {
                id: phaseId,
                uid: '',
                type: 'phase',

                name: phaseName,
                children: [],
                total: 0,
                realizedTotal: 0,
                budgetedTotal: 0,
                plannedTotal: 0,
                variation: 0,
                level: 1
            };
            groups[groupId].children.push(phaseNode);
        }
        phaseNode.total += itemTotal;
        phaseNode.realizedTotal += itemRealized;
        phaseNode.budgetedTotal += bValue;
        phaseNode.plannedTotal += pValue;
        phaseNode.variation = (phaseNode.variation || 0) + (itemSchedule?.costVariation || 0);

        // 3. SubPhase Level (Optional)
        let parentForItems = phaseNode;
        if (item.subPhase) {
            const subPhaseName = item.subPhase;
            const subPhaseId = `${phaseId}-sub-${subPhaseName}`;
            let subPhaseNode = phaseNode.children.find(c => c.id === subPhaseId);

            if (!subPhaseNode) {
                subPhaseNode = {
                    id: subPhaseId,
                    uid: '',
                    type: 'subphase',

                    name: subPhaseName,
                    children: [],
                    total: 0,
                    realizedTotal: 0,
                    budgetedTotal: 0,
                    plannedTotal: 0,
                    variation: 0,
                    level: 2
                };
                phaseNode.children.push(subPhaseNode);
            }
            subPhaseNode.total += itemTotal;
            subPhaseNode.realizedTotal += itemRealized;
            subPhaseNode.budgetedTotal += bValue;
            subPhaseNode.plannedTotal += pValue;
            subPhaseNode.variation = (subPhaseNode.variation || 0) + (itemSchedule?.costVariation || 0);
            parentForItems = subPhaseNode;
        }

        // 4. Item Level
        parentForItems.children.push({
            id: item.id,
            uid: '',
            type: 'item',
            name: item.sinapiItem.description,
            children: [],
            data: item,
            schedule: itemSchedule,
            total: itemTotal,
            realizedTotal: itemRealized,
            budgetedTotal: bValue,
            plannedTotal: pValue,
            variation: itemSchedule?.costVariation || 0,
            isCritical: itemSchedule?.isCritical,
            isMilestone: itemSchedule?.isMilestone,
            earlyStart: itemSchedule?.earlyStart,
            earlyFinish: itemSchedule?.earlyFinish,
            lateStart: itemSchedule?.lateStart,
            lateFinish: itemSchedule?.lateFinish,
            totalFloat: itemSchedule?.totalFloat,
            level: parentForItems.level + 1
        });
    });

    const result = Object.values(groups);

    // ── Group Color Themes ──
    const GANTT_PALETTE = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#6366f1', '#14b8a6', '#ec4899'];
    const assignColors = (nodes: HierarchyNode[], color?: string) => {
        nodes.forEach((node, idx) => {
            const nodeColor = color || GANTT_PALETTE[idx % GANTT_PALETTE.length];
            node.color = nodeColor;
            if (node.children) assignColors(node.children, nodeColor);
        });
    };
    assignColors(result);

    // Aggregated date calculation for parents
    const aggregateDates = (nodes: HierarchyNode[]) => {
        nodes.forEach(node => {
            if (node.type !== 'item') {
                aggregateDates(node.children);

                const childDates = node.children.map(c => {
                    let start = c.earlyStart ? new Date(c.earlyStart).getTime() : Infinity;
                    let finish = c.earlyFinish ? new Date(c.earlyFinish).getTime() : -Infinity;

                    if (c.type === 'item' && c.schedule) {
                        if (start === Infinity && c.schedule.startDate) {
                            start = new Date(c.schedule.startDate).getTime();
                        }
                        if (finish === -Infinity) {
                            if (c.schedule.endDate) {
                                finish = new Date(c.schedule.endDate).getTime();
                            } else if (c.schedule.startDate && c.schedule.duration !== undefined) {
                                const d = new Date(c.schedule.startDate);
                                d.setDate(d.getDate() + Math.max(0, c.schedule.duration - 1));
                                finish = d.getTime();
                            }

                        }
                    }
                    return { start, finish };
                });

                const minStart = Math.min(...childDates.map(d => d.start));
                const maxFinish = Math.max(...childDates.map(d => d.finish));

                if (minStart !== Infinity) node.earlyStart = new Date(minStart).toISOString().split('T')[0];
                if (maxFinish !== -Infinity) node.earlyFinish = new Date(maxFinish).toISOString().split('T')[0];

                node.isCritical = node.children.some(c => c.isCritical);
            }
        });
    };
    aggregateDates(result);

    // Assign sequential UIDs using depth-first traversal
    let counter = 1;
    const assignUid = (nodes: HierarchyNode[]) => {
        nodes.forEach(node => {
            node.uid = (counter++).toString();
            if (node.children && node.children.length > 0) {
                assignUid(node.children);
            }
        });
    };
    assignUid(result);

    return result;
}




export const FinancialSchedule: React.FC<FinancialScheduleProps> = ({
    settings,
    budget,
    projects,
    organizations,
    onLoadProject,
    onUpdateSettings,
    onBack
}) => {
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const [schedule, setSchedule] = useState<ProjectSchedule>(
        settings.schedule || {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            duration: 12,
            periods: [],
            distributions: [],
            resources: {
                roles: [],
                workers: [],
                teams: []
            }
        }
    );

    const [viewMode, setViewModeState] = useState<'table' | 'gantt' | 's-curve' | 'resources' | 'risks'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('schedule-view-mode');
            if (saved === 'table' || saved === 'gantt' || saved === 's-curve' || saved === 'resources' || saved === 'risks') {
                return saved;
            }
        }
        return 'table';
    });

    const setViewMode = (mode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks') => {
        setViewModeState(mode);
        localStorage.setItem('schedule-view-mode', mode);
    };

    const [timeScale, setTimeScaleState] = useState<'day' | 'week' | 'month' | 'year'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('schedule-time-scale');
            if (saved === 'day' || saved === 'week' || saved === 'month' || saved === 'year') {
                return saved;
            }
        }
        return 'month';
    });

    const setTimeScale = (scale: 'day' | 'week' | 'month' | 'year') => {
        setTimeScaleState(scale);
        localStorage.setItem('schedule-time-scale', scale);
    };

    const [ganttExpandedNodes, setGanttExpandedNodes] = useState<Record<string, boolean>>({});
    const [tableExpandedNodes, setTableExpandedNodes] = useState<Record<string, boolean>>({});
    const [sidebarWidth, setSidebarWidth] = useState(300);
    const [isResizing, setIsResizing] = useState(false);
    const [predecessorModalTask, setPredecessorModalTask] = useState<string | null>(null);
    const [isBaselineModalOpen, setIsBaselineModalOpen] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [crewPopoverItem, setCrewPopoverItem] = useState<string | null>(null);
    const [crewPopoverPos, setCrewPopoverPos] = useState<{ top: number; left: number } | null>(null);
    const [resourceAllocationTask, setResourceAllocationTask] = useState<string | null>(null);
    const [allocationType, setAllocationType] = useState<'ROLE' | 'WORKER' | 'TEAM'>('ROLE');
    const [levelingIssues, setLevelingIssues] = useState<LevelingIssue[] | null>(null);

    // ── Export State & Ref ──
    const exportRef = useRef<HTMLDivElement>(null);
    const [isExportingPDF, setIsExportingPDF] = useState(false);

    // ── Photo Gallery State ──
    const [viewingTaskPhotos, setViewingTaskPhotos] = useState<{ id: string; name: string; photos: string[] } | null>(null);

    // ── Simulation & Drag State ──
    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [originalScheduleBackup, setOriginalScheduleBackup] = useState<ProjectSchedule | null>(null);
    const [isDraggingTask, setIsDraggingTask] = useState<string | null>(null);
    const [dragTaskStartOffset, setDragTaskStartOffset] = useState<number>(0);

    // ── Safe Persistence Wrapper ──
    const persistSchedule = (newSchedule: ProjectSchedule) => {
        if (isSimulationMode) {
            console.log('[FinancialSchedule] SIMULATION MODE ACTIVE. Persist blocked.');
            return;
        }
        onUpdateSettings({ ...settings, schedule: newSchedule });
    };

    // ── Column Resize State ──
    const DEFAULT_COL_WIDTHS: Record<string, number> = {
        item: 250, uid: 40, pred: 50, duration: 60,
        start: 100, end: 100, esef: 80, lslf: 80, float: 50,
        budgeted: 100, planned: 100, realized: 100, variation: 100, realPct: 100, totalPct: 80
    };
    const COL_MIN = 30;
    const COL_MAX = 500;
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem('schedule-col-widths');
            return saved ? JSON.parse(saved) : { ...DEFAULT_COL_WIDTHS };
        } catch { return { ...DEFAULT_COL_WIDTHS }; }
    });
    const colResizeRef = React.useRef<{ colKey: string; startX: number; startW: number } | null>(null);
    const tableRef = React.useRef<HTMLTableElement>(null);

    const getColWidth = (key: string) => colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? 80;

    const handleColResizeStart = (colKey: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        colResizeRef.current = { colKey, startX: e.clientX, startW: getColWidth(colKey) };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleColDblClick = (colKey: string) => {
        setColWidths((prev: Record<string, number>) => {
            const next = { ...prev, [colKey]: DEFAULT_COL_WIDTHS[colKey] ?? 80 };
            localStorage.setItem('schedule-col-widths', JSON.stringify(next));
            return next;
        });
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const ref = colResizeRef.current;
            if (!ref) return;
            const delta = e.clientX - ref.startX;
            const newW = Math.max(COL_MIN, Math.min(COL_MAX, ref.startW + delta));
            // Direct DOM update via colgroup for zero-rerender perf
            if (tableRef.current) {
                const col = tableRef.current.querySelector(`col[data - col= "${ref.colKey}"]`) as HTMLElement;
                if (col) col.style.width = `${newW} px`;
            }
        };
        const onMouseUp = () => {
            const ref = colResizeRef.current;
            if (!ref) return;
            // Read final width from DOM and flush to state
            let finalW = ref.startW;
            if (tableRef.current) {
                const col = tableRef.current.querySelector(`col[data - col= "${ref.colKey}"]`) as HTMLElement;
                if (col) finalW = parseInt(col.style.width) || ref.startW;
            }
            colResizeRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setColWidths((prev: Record<string, number>) => {
                const next = { ...prev, [ref.colKey]: finalW };
                localStorage.setItem('schedule-col-widths', JSON.stringify(next));
                return next;
            });
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);


    const ResizeHandle = ({ colKey }: { colKey: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-20 group/resize hover:bg-blue-400/40 active:bg-blue-500/60 transition-colors"
            onMouseDown={(e) => handleColResizeStart(colKey, e)}
            onDoubleClick={() => handleColDblClick(colKey)}
        >
            <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gray-200 group-hover/resize:bg-blue-400" />
        </div>
    );

    // ── Gantt Column Resize ──
    const GANTT_DEFAULT_COL_WIDTHS: Record<string, number> = {
        gId: 44, gPred: 56, gDur: 64, gStart: 86, gEnd: 86,
        gEsEf: 86, gLsLf: 86, gFloat: 56, gBudgeted: 110, gPlanned: 110, gRealized: 110, gVariation: 110, gResources: 120, gRealPct: 100
    };
    const [ganttColWidths, setGanttColWidths] = useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem('gantt-col-widths');
            return saved ? JSON.parse(saved) : { ...GANTT_DEFAULT_COL_WIDTHS };
        } catch { return { ...GANTT_DEFAULT_COL_WIDTHS }; }
    });
    const ganttColResizeRef = React.useRef<{ colKey: string; startX: number; startW: number } | null>(null);
    const ganttSidebarRef = React.useRef<HTMLDivElement>(null);

    const getGanttColW = (key: string) => ganttColWidths[key] ?? GANTT_DEFAULT_COL_WIDTHS[key] ?? 80;
    const getGanttSidebarTotal = () =>
        sidebarWidth + Object.keys(GANTT_DEFAULT_COL_WIDTHS).reduce((sum, k) => sum + (ganttCollapsedCols.has(k) ? 0 : getGanttColW(k)), 0) + 6; // +6 for splitter handle

    const handleGanttColResizeStart = (colKey: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        ganttColResizeRef.current = { colKey, startX: e.clientX, startW: getGanttColW(colKey) };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const ref = ganttColResizeRef.current;
            if (!ref) return;
            const delta = e.clientX - ref.startX;
            const newW = Math.max(COL_MIN, Math.min(COL_MAX, ref.startW + delta));
            // Direct DOM update for perf: find all elements with data-gantt-col
            if (ganttSidebarRef.current) {
                ganttSidebarRef.current.querySelectorAll(`[data-gantt-col="${ref.colKey}"]`).forEach((el) => {
                    (el as HTMLElement).style.width = `${newW}px`;
                });
            }
        };
        const onMouseUp = () => {
            const ref = ganttColResizeRef.current;
            if (!ref) return;
            let finalW = ref.startW;
            if (ganttSidebarRef.current) {
                const el = ganttSidebarRef.current.querySelector(`[data-gantt-col="${ref.colKey}"]`) as HTMLElement;
                if (el) finalW = parseInt(el.style.width) || ref.startW;
            }
            ganttColResizeRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setGanttColWidths(prev => {
                const next = { ...prev, [ref.colKey]: finalW };
                localStorage.setItem('gantt-col-widths', JSON.stringify(next));
                return next;
            });
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    const GanttResizeHandle = ({ colKey }: { colKey: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-30 group/gresize hover:bg-blue-400/40 active:bg-blue-500/60 transition-colors"
            onMouseDown={(e) => handleGanttColResizeStart(colKey, e)}
            onDoubleClick={() => {
                setGanttColWidths(prev => {
                    const next = { ...prev, [colKey]: GANTT_DEFAULT_COL_WIDTHS[colKey] ?? 80 };
                    localStorage.setItem('gantt-col-widths', JSON.stringify(next));
                    return next;
                });
            }}
        >
            <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gray-200 group-hover/gresize:bg-blue-400" />
        </div>
    );

    // ── Gantt Timeline Splitter (collapsible sidebar columns) ──
    const GANTT_COL_KEYS = ['gId', 'gPred', 'gDur', 'gStart', 'gEnd', 'gEsEf', 'gLsLf', 'gFloat', 'gBudgeted', 'gPlanned', 'gRealized', 'gVariation', 'gResources', 'gRealPct'];
    const GANTT_HIDEABLE_COLS = [...GANTT_COL_KEYS].reverse(); // right-to-left: gPlanned → gId

    const [ganttCollapsedCols, setGanttCollapsedCols] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('gantt-collapsed-cols');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });

    const [ganttVisibleLevels, setGanttVisibleLevels] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('idx_schedule_gantt_levels_v5');
            return saved ? new Set(JSON.parse(saved)) : new Set(['group', 'phase', 'subphase']);
        } catch { return new Set(['group', 'phase', 'subphase']); }
    });

    const handleToggleGanttLevel = (level: string) => {
        setGanttVisibleLevels(prev => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            localStorage.setItem('idx_schedule_gantt_levels_v5', JSON.stringify([...next]));
            return next;
        });
    };

    const [tableVisibleLevels, setTableVisibleLevels] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('idx_schedule_table_levels_v5');
            return saved ? new Set(JSON.parse(saved)) : new Set(['group', 'phase', 'subphase']);
        } catch { return new Set(['group', 'phase', 'subphase']); }
    });

    const handleToggleTableLevel = (level: string) => {
        setTableVisibleLevels(prev => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            localStorage.setItem('idx_schedule_table_levels_v5', JSON.stringify([...next]));
            return next;
        });
    };

    const ganttSplitterDragRef = React.useRef<{ startX: number; initialCount: number } | null>(null);
    const ganttCollapsedCountRef = React.useRef(0);

    const handleGanttSplitterMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const count = ganttCollapsedCols.size;
        ganttCollapsedCountRef.current = count;
        ganttSplitterDragRef.current = { startX: e.clientX, initialCount: count };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleGanttSplitterDblClick = () => {
        setGanttCollapsedCols(new Set());
        localStorage.setItem('gantt-collapsed-cols', '[]');
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const ref = ganttSplitterDragRef.current;
            if (!ref) return;
            const delta = e.clientX - ref.startX;
            const colStep = 60;
            let targetCount: number;
            if (delta < 0) {
                targetCount = ref.initialCount + Math.floor(Math.abs(delta) / colStep);
            } else {
                targetCount = ref.initialCount - Math.floor(delta / colStep);
            }
            targetCount = Math.max(0, Math.min(GANTT_HIDEABLE_COLS.length, targetCount));
            if (targetCount !== ganttCollapsedCountRef.current) {
                ganttCollapsedCountRef.current = targetCount;
                const next = new Set<string>();
                for (let i = 0; i < targetCount; i++) next.add(GANTT_HIDEABLE_COLS[i]);
                setGanttCollapsedCols(next);
            }
        };
        const onUp = () => {
            if (!ganttSplitterDragRef.current) return;
            ganttSplitterDragRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('gantt-collapsed-cols', JSON.stringify([...ganttCollapsedCols]));
    }, [ganttCollapsedCols]);

    // Helper: returns inline style for a gantt column, zeroing collapsed ones
    const getGanttColStyle = (key: string): React.CSSProperties =>
        ganttCollapsedCols.has(key)
            ? { width: 0, minWidth: 0, maxWidth: 0, padding: 0, overflow: 'hidden', fontSize: 0, borderWidth: 0, opacity: 0 }
            : { width: `${getGanttColW(key)}px` };

    // ── Timeline Splitter (collapsible fixed columns) ──
    const FIXED_COL_KEYS = ['item', 'uid', 'pred', 'duration', 'start', 'end', 'esef', 'lslf', 'float', 'budgeted', 'planned', 'realized', 'variation', 'resources', 'realPct'];
    const HIDEABLE_COLS = [...FIXED_COL_KEYS].reverse().filter(k => k !== 'item'); // right-to-left, never hide 'item'
    const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('schedule-collapsed-cols');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const splitterDragRef = React.useRef<{ startX: number; initialCount: number } | null>(null);
    const collapsedCountRef = React.useRef(0);

    const handleSplitterMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const count = collapsedCols.size;
        collapsedCountRef.current = count;
        splitterDragRef.current = { startX: e.clientX, initialCount: count };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleSplitterDblClick = () => {
        setCollapsedCols(new Set());
        localStorage.setItem('schedule-collapsed-cols', '[]');
    };

    const handleToggleColumn = (colKey: string) => {
        setCollapsedCols(prev => {
            const next = new Set(prev);
            if (next.has(colKey)) {
                next.delete(colKey);
            } else {
                next.add(colKey);
            }
            return next;
        });
    };

    const handleToggleGanttColumn = (colKey: string) => {
        setGanttCollapsedCols(prev => {
            const next = new Set(prev);
            if (next.has(colKey)) {
                next.delete(colKey);
            } else {
                next.add(colKey);
            }
            return next;
        });
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const ref = splitterDragRef.current;
            if (!ref) return;
            const delta = e.clientX - ref.startX;
            const colStep = 70;
            let targetCount: number;
            if (delta < 0) {
                targetCount = ref.initialCount + Math.floor(Math.abs(delta) / colStep);
            } else {
                targetCount = ref.initialCount - Math.floor(delta / colStep);
            }
            targetCount = Math.max(0, Math.min(HIDEABLE_COLS.length, targetCount));
            if (targetCount !== collapsedCountRef.current) {
                collapsedCountRef.current = targetCount;
                const next = new Set<string>();
                for (let i = 0; i < targetCount; i++) next.add(HIDEABLE_COLS[i]);
                setCollapsedCols(next);
            }
        };
        const onUp = () => {
            if (!splitterDragRef.current) return;
            splitterDragRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    // Persist collapsed cols
    useEffect(() => {
        localStorage.setItem('schedule-collapsed-cols', JSON.stringify([...collapsedCols]));
    }, [collapsedCols]);

    // Dynamic CSS to hide collapsed columns via nth-child (avoids modifying every td)
    const collapsedColStyle = React.useMemo(() => {
        if (collapsedCols.size === 0) return '';
        const rules: string[] = [];
        collapsedCols.forEach(key => {
            const idx = FIXED_COL_KEYS.indexOf(key) + 1;
            if (idx > 0) {
                rules.push(
                    `.sched-tbl col:nth-child(${idx}), ` +
                    `.sched-tbl th:nth-child(${idx}), ` +
                    `.sched-tbl td:nth-child(${idx}) {` +
                    `  width: 0!important; max-width: 0!important; min-width: 0!important; ` +
                    `  padding: 0!important; overflow: hidden!important; ` +
                    `  font-size: 0!important; border-width: 0!important; opacity: 0; ` +
                    `  line-height: 0!important; height: 0!important; ` +
                    `} `
                );
            }
        });
        return rules.join('\n');
    }, [collapsedCols]);

    // Sidebar resizing logic (Gantt sidebar)
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = Math.max(150, Math.min(600, e.clientX - 64)); // 64 value based on sidebar
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // Initialize & Sync checks
    const [lastSyncedScheduleJson, setLastSyncedScheduleJson] = useState<string>('');

    useEffect(() => {
        if (!settings.schedule) {
            const startStr = settings.startDate || new Date().toISOString().split('T')[0];
            const endStr = settings.endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

            // Calculate duration in months if both dates available
            let duration = 12;
            if (settings.startDate && settings.endDate) {
                const start = new Date(settings.startDate);
                const end = new Date(settings.endDate);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    duration = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                    if (end.getDate() >= start.getDate()) duration += 1; // Include partial month
                    duration = Math.max(1, duration);
                }
            }

            const initialSchedule: ProjectSchedule = {
                startDate: startStr,
                endDate: endStr,
                duration: duration,
                periods: [],
                distributions: []
            };
            setSchedule(initialSchedule);
            setLastSyncedScheduleJson(JSON.stringify(initialSchedule));
        } else {
            const incomingJson = JSON.stringify(settings.schedule);

            // If the schedule exists, but the user updated the root project dates in the modal,
            // we should gracefully sync the schedule's startDate if it doesn't match the root startDate.
            const needsStartSync = settings.startDate && settings.schedule.startDate !== settings.startDate;
            const needsEndSync = settings.endDate && settings.schedule.endDate !== settings.endDate;

            if (incomingJson !== lastSyncedScheduleJson || needsStartSync || needsEndSync) {
                if (needsStartSync) {
                    // We call handleRecalculate with the new start date to shift all tasks correctly
                    handleRecalculate(settings.schedule.itemSchedules || [], settings.startDate);
                } else if (needsEndSync) {
                    const start = new Date(settings.schedule.startDate);
                    const end = settings.endDate ? new Date(settings.endDate) : null;
                    let newDuration = settings.schedule.duration;

                    if (!isNaN(start.getTime()) && end && !isNaN(end.getTime())) {
                        newDuration = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                        if (end.getDate() >= start.getDate()) newDuration += 1;
                        newDuration = Math.max(1, newDuration);
                    }

                    const updatedSchedule = {
                        ...settings.schedule,
                        endDate: settings.endDate,
                        duration: newDuration
                    };
                    setSchedule(updatedSchedule);
                } else {
                    setSchedule(settings.schedule);
                }
                setLastSyncedScheduleJson(incomingJson);
            }
        }
    }, [settings.schedule, settings.startDate, settings.endDate, lastSyncedScheduleJson]);

    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [allDiaryEntries, setAllDiaryEntries] = useState<any[]>(settings.diaryEntries || []);


    useEffect(() => {
        const fetchData = async () => {

            if (!settings.id && !settings.linkedProjectId) {
                return;
            }

            try {
                const orderPromises = [];
                if (settings.id) orderPromises.push(orderService.listOrders(settings.id));
                if (settings.linkedProjectId) orderPromises.push(orderService.listOrders(settings.linkedProjectId));

                const ordersResults = await Promise.all(orderPromises);
                const combinedOrders = ordersResults.flat();
                setOrders(combinedOrders);

                // --- Diary Discovery ---
                let diaryEntries = [...(settings.diaryEntries || [])];

                // If it's a Planning project, we likely need to look elsewhere for diaries
                if (settings.classification === 'PLANEJAMENTO' || diaryEntries.length === 0) {
                    const findObraId = (currentId: string, currentSettings: ProjectSettings): string | null => {
                        if (currentSettings.classification === 'OBRA') return currentId;
                        if (!currentSettings.linkedProjectId) {
                            // Fallback: search by name if ID missing but name exists
                            if (currentSettings.linkedProjectName) {
                                const byName = projects.find(p => p.settings?.name === currentSettings.linkedProjectName);
                                if (byName) return findObraId(byName.id, byName.settings);
                            }
                            return null;
                        }
                        const linkedId = currentSettings.linkedProjectId;
                        const linked = linkedId ? projects.find((p: any) => p.id === linkedId) : null;
                        if (linked) return findObraId(linked.id, linked.settings);
                        return null;
                    };

                    const obraId = settings.id ? findObraId(settings.id, settings) : null;
                    if (obraId) {
                        // Find all projects that belong to this Obra
                        const rootObra = projects.find(o => o.id === obraId);
                        const related = projects.filter(p =>
                            p.id === obraId ||
                            p.settings?.linkedProjectId === obraId ||
                            p.settings?.linkedProjectName === rootObra?.settings?.name ||
                            p.settings?.classification === 'DIARIO'
                        );

                        const diaryPromises = related.map(p => {
                            return projectService.loadProject(p.id);
                        });
                        const projectsData = await Promise.all(diaryPromises);

                        const aggregated = projectsData.flatMap(p => {
                            const entries = p?.settings?.diaryEntries || [];
                            return entries;
                        });

                        // Filter unique by date + some key if possible
                        const unique = Array.from(new Map(aggregated.map(e => [e.date + (e.id || ''), e])).values());
                        diaryEntries = unique;
                    }
                }
                setAllDiaryEntries(diaryEntries);

            } catch (error) {
                console.error("[FinancialSchedule] Error fetching background data:", error);
            }
        };

        fetchData();
    }, [settings.id, settings.linkedProjectId, projects]);

    // Aggregate Progress (Realized)
    const realizedState = React.useMemo(() => {
        // 1. Calculate Total Budgeted Quantity per Code (to distribute shared materials)
        const totalBudgetedQtyByCode = new Map<string, number>();
        budget.forEach(item => {
            if (item.sinapiItem?.code) {
                const current = totalBudgetedQtyByCode.get(item.sinapiItem.code) || 0;
                totalBudgetedQtyByCode.set(item.sinapiItem.code, current + item.quantity);
            }
        });

        // 2. Calculate Total Purchased Value per Code
        const totalPurchasedValueByCode = new Map<string, number>();
        orders.forEach(order => {
            if (order.status !== 'Cancelado') {
                order.items.forEach(item => {
                    const current = totalPurchasedValueByCode.get(item.code) || 0;
                    totalPurchasedValueByCode.set(item.code, current + (item.total || 0));
                });
            }
        });

        const realizedValues: Record<string, number> = {};

        // 3. Distribute purchased value to budget items
        budget.forEach(item => {
            const itemBdi = item.bdi !== undefined ? item.bdi : (settings.bdi || 0);
            const itemTotal = item.quantity * item.sinapiItem.price * (1 + itemBdi / 100);

            // Physical Progress (Diary or Manual Sync)
            const task = schedule.itemSchedules?.find(s => s.id === item.id);
            const diaryMaxEvolution = allDiaryEntries?.reduce((max, entry: any) => {
                const activity = entry.activities?.find((a: any) => {
                    const matchId = a.itemId === item.id;
                    const matchDesc = a.description && item.sinapiItem?.description && a.description.trim() === item.sinapiItem.description.trim();
                    return matchId || matchDesc;
                });
                return Math.max(max, activity?.evolution || 0);
            }, 0) || 0;

            const physicalPct = Math.max(task?.manualRealPct || 0, diaryMaxEvolution);
            const physicalRealized = itemTotal * (physicalPct / 100);

            // Financial Progress (Orders)
            let financialRealized = 0;
            if (item.sinapiItem?.code) {
                const totalPurchased = totalPurchasedValueByCode.get(item.sinapiItem.code) || 0;
                if (totalPurchased > 0) {
                    const totalBudgeted = totalBudgetedQtyByCode.get(item.sinapiItem.code) || 1;
                    financialRealized = totalPurchased * (item.quantity / totalBudgeted);
                }
            }

            // Take the MAXIMUM or use a strategy to show both?
            // For the 'REAL %' column in the schedule, we usually want the most advanced indicator.
            // If it's a service, physical is better. If it's material, financial might be more accurate.
            // But to fix the specific bug (35% not showing), we MUST take the physical progress into account.
            realizedValues[item.id] = Math.max(physicalRealized, financialRealized);
        });

        return { itemQty: {}, realizedValues };
    }, [orders, budget, allDiaryEntries, settings.bdi]);

    // Calculate Hierarchy
    const hierarchy = React.useMemo(() => buildHierarchy(budget, schedule.itemSchedules || [], realizedState.realizedValues, settings.bdi), [budget, schedule.itemSchedules, realizedState.realizedValues, settings.bdi]);

    const taskInsights = React.useMemo(() => {
        const insights: Record<string, { missingItems: number; missingCost: number; hasAlert: boolean; message: string }> = {};
        const today = new Date();
        const approvedStatuses = ['Confirmado', 'Separação', 'Em Trânsito', 'Entregue', 'Recebido'];
        const approvedOrders = orders.filter(o => approvedStatuses.includes(o.status));
        const orderedCodes = new Set(approvedOrders.flatMap(o => o.items.map(i => i.code)));

        const evaluateNode = (node: HierarchyNode) => {
            let startDateStr = node.type === 'item' ? node.schedule?.startDate : node.earlyStart;
            if (startDateStr) {
                const taskStart = new Date(startDateStr);
                const daysUntilStart = (taskStart.getTime() - today.getTime()) / (1000 * 3600 * 24);
                const pct = node.total > 0 ? (node.realizedTotal / node.total * 100) : 0;

                if (daysUntilStart <= 30 && daysUntilStart >= -30 && pct < 100) {
                    const leafItems: any[] = [];
                    const gatherLeaves = (n: HierarchyNode) => {
                        if (n.type === 'item') leafItems.push(n.data);
                        else if (n.children) n.children.forEach(gatherLeaves);
                    };
                    gatherLeaves(node);

                    let missingCriticalItems = 0;
                    let missingCost = 0;

                    leafItems.forEach(item => {
                        if (item.sinapiItem?.code && !orderedCodes.has(item.sinapiItem.code)) {
                            missingCriticalItems++;
                            missingCost += item.quantity * item.sinapiItem.price;
                        }
                    });

                    if (missingCriticalItems > 0 && missingCost > 500) {
                        insights[node.id] = {
                            missingItems: missingCriticalItems,
                            missingCost,
                            hasAlert: true,
                            message: `Atenção: A etapa inicia em breve, mas faltam pedidos para ${missingCriticalItems} itens(R$ ${missingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
                        };
                    }
                }
            }
            if (node.children) node.children.forEach(evaluateNode);
        };
        hierarchy.forEach(evaluateNode);
        return insights;
    }, [hierarchy, orders]);

    // Aggregate insight summary for the risk panel
    const insightSummary = React.useMemo(() => {
        const entries = Object.values(taskInsights);
        const totalAlerts = entries.length;
        const totalMissingItems = entries.reduce((sum, e) => sum + e.missingItems, 0);
        const totalMissingCost = entries.reduce((sum, e) => sum + e.missingCost, 0);
        return { totalAlerts, totalMissingItems, totalMissingCost };
    }, [taskInsights]);

    const [isRiskPanelExpanded, setIsRiskPanelExpanded] = React.useState(false);

    // Auto-expand all nodes on first load
    const hasAutoExpanded = React.useRef(false);
    React.useEffect(() => {
        if (hierarchy.length > 0 && !hasAutoExpanded.current) {
            hasAutoExpanded.current = true;
            const allNodes: Record<string, boolean> = {};
            const traverse = (nodes: HierarchyNode[]) => {
                nodes.forEach(node => {
                    if (node.type !== 'item') {
                        allNodes[node.id] = true;
                        if (node.children) traverse(node.children);
                    }
                });
            };
            traverse(hierarchy);
            setGanttExpandedNodes(allNodes);
            setTableExpandedNodes(allNodes);
        }
    }, [hierarchy]);

    // Create ID to UID and UID to ID mappings for predecessor lookup
    const { idToUid, uidToId } = React.useMemo(() => {
        const i2u: Record<string, string> = {};
        const u2i: Record<string, string> = {};
        const traverse = (nodes: HierarchyNode[]) => {
            nodes.forEach(node => {
                i2u[node.id] = node.uid;
                u2i[node.uid] = node.id;
                if (node.children) traverse(node.children);
            });
        };
        traverse(hierarchy);
        return { idToUid: i2u, uidToId: u2i };
    }, [hierarchy]);

    // Sync budget quantity changes to schedule

    React.useEffect(() => {
        const itemSchedules = schedule.itemSchedules || [];
        const budgetLength = budget.length;
        const scheduleLength = itemSchedules.length;

        // 1. If we have budget items but NO schedule items, we MUST recalculate to initialize them
        if (budgetLength > 0 && scheduleLength === 0) {
            handleRecalculate();
            return;
        }

        // 2. If length differs, we likely added/removed items from budget
        if (budgetLength !== scheduleLength) {
            handleRecalculate();
            return;
        }

        let shouldRecalculate = false;
        for (const budgetItem of budget) {
            const task = itemSchedules.find(t => t.id === budgetItem.id);

            // If task is missing for a budget item, we MUST sync
            if (!task) {
                shouldRecalculate = true;
                break;
            }

            // check sync for auto-duration tasks
            if (task.autoDuration) {
                const expectedDuration = SchedulingEngine.calculateDuration(task, budgetItem.quantity);
                if (expectedDuration !== null && expectedDuration !== task.duration) {
                    shouldRecalculate = true;
                    break;
                }
            }
        }

        if (shouldRecalculate) {
            handleRecalculate();
        }
    }, [budget, schedule.itemSchedules]);


    const handleUpdateDistribution = (itemId: string, periodId: string, value: string) => {
        const numValue = parseFloat(value) || 0;
        // Clamp between 0 and 100
        const clampedValue = Math.min(100, Math.max(0, numValue));

        const existingDistIndex = schedule.distributions.findIndex(
            d => d.itemId === itemId && d.periodId === periodId
        );

        let newDistributions = [...schedule.distributions];

        if (existingDistIndex >= 0) {
            if (clampedValue === 0) {
                newDistributions.splice(existingDistIndex, 1);
            } else {
                newDistributions[existingDistIndex] = {
                    ...newDistributions[existingDistIndex],
                    percentage: clampedValue
                };
            }
        } else if (clampedValue > 0) {
            newDistributions.push({
                itemId,
                periodId,
                percentage: clampedValue,
                value: 0
            });
        }

        const newSchedule = { ...schedule, distributions: newDistributions };
        setSchedule(newSchedule);
        persistSchedule(newSchedule);
    };

    const getDistribution = (itemId: string, periodId: string) => {
        return schedule.distributions.find(d => d.itemId === itemId && d.periodId === periodId)?.percentage || 0;
    };

    const toggleNode = (nodeId: string) => {
        if (viewMode === 'gantt') {
            setGanttExpandedNodes(prev => ({
                ...prev,
                [nodeId]: !prev[nodeId]
            }));
        } else {
            setTableExpandedNodes(prev => ({
                ...prev,
                [nodeId]: !prev[nodeId]
            }));
        }
    };

    const handleExpandAll = () => {
        const allNodes: Record<string, boolean> = {};
        const traverse = (nodes: HierarchyNode[]) => {
            nodes.forEach(node => {
                if (node.type !== 'item') {
                    allNodes[node.id] = true;
                    if (node.children) traverse(node.children);
                }
            });
        };
        traverse(hierarchy);
        if (viewMode === 'gantt') setGanttExpandedNodes(allNodes);
        else setTableExpandedNodes(allNodes);
    };

    const handleCollapseAll = () => {
        if (viewMode === 'gantt') setGanttExpandedNodes({});
        else setTableExpandedNodes({});
    };

    const handleDistributeEvenly = (itemId: string) => {
        if (timelineColumns.length === 0) return;
        const perPeriod = 100 / timelineColumns.length;

        let newDistributions = schedule.distributions.filter(d => d.itemId !== itemId);
        timelineColumns.forEach(column => {
            newDistributions.push({
                itemId,
                periodId: column.id,
                percentage: perPeriod,
                value: 0
            });
        });

        const newSchedule = { ...schedule, distributions: newDistributions };
        setSchedule(newSchedule);
        persistSchedule(newSchedule);
    };

    const handleClearItem = (itemId: string) => {
        const newDistributions = schedule.distributions.filter(d => d.itemId !== itemId);
        const newSchedule = { ...schedule, distributions: newDistributions };
        setSchedule(newSchedule);
        persistSchedule(newSchedule);
    };

    const handleRecalculate = (currentSchedules?: ItemScheduleDetails[], newStartDate?: string) => {
        setSchedule(prev => {
            try {
                const projectStart = newStartDate || prev.startDate;
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const itemsToUse = ensureFullScheduleList(currentSchedules || prev.itemSchedules || [], budget);

                const calculated = SchedulingEngine.calculate(
                    itemsToUse,
                    projectStart,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, startDate: projectStart, itemSchedules: calculated };
                // Also trigger persistence
                persistSchedule(newSchedule);
                return newSchedule;
            } catch (err: any) {
                alert(err.message || 'Erro ao recalcular cronograma');
                return prev;
            }
        });
    };

    const handleLevelResources = () => {
        try {
            const currentItemSchedules = schedule.itemSchedules || [];

            // 1. Initial Check: Is there any overload to begin with?
            const initialHistogram = SchedulingEngine.calculateResourceHistogram(
                currentItemSchedules,
                schedule.useWorkingDays ?? true,
                schedule.resources?.workers || [],
                schedule.resources?.teams || []
            );
            const limits = new Map<string, number>();
            schedule.resources?.roles.forEach(r => {
                const count = (schedule.resources?.workers || []).filter(w => w.roleId === r.id).length;
                limits.set(r.id, Math.max(1, count));
            });
            (schedule.resources?.workers || []).forEach(w => limits.set(w.id, 1));
            (schedule.resources?.teams || []).forEach(t => limits.set(t.id, 1));

            let initialOverload = false;
            for (const day of Object.values(initialHistogram)) {
                for (const [resId, usage] of Object.entries(day)) {
                    if (usage.total > (limits.get(resId) || 0)) {
                        initialOverload = true;
                        break;
                    }
                }
                if (initialOverload) break;
            }

            if (!initialOverload) {
                alert("O seu cronograma já está equilibrado e sem sobreposição de recursos. Nenhuma ação de nivelamento é necessária!");
                return;
            }

            // 2. Proceed with leveling as there ARE overloads
            const itemQuantities = new Map<string, number>();
            budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

            const result = SchedulingEngine.levelResources(
                currentItemSchedules,
                schedule.startDate,
                schedule.useWorkingDays ?? true,
                schedule.resources?.roles || [],
                schedule.resources?.workers || [],
                schedule.resources?.teams || [],
                itemQuantities
            );

            if (result.issues.length > 0) {
                setLevelingIssues(result.issues);
            } else {
                const newSchedule = { ...schedule, itemSchedules: result.leveledSchedules };

                // 3. Final Check: Did we solve it?
                const finalHistogram = SchedulingEngine.calculateResourceHistogram(
                    result.leveledSchedules,
                    schedule.useWorkingDays ?? true,
                    schedule.resources?.workers || [],
                    schedule.resources?.teams || []
                );

                let levelSucceeded = true;
                for (const day of Object.values(finalHistogram)) {
                    for (const [resId, usage] of Object.entries(day)) {
                        if (usage.total > (limits.get(resId) || 0)) {
                            levelSucceeded = false;
                            break;
                        }
                    }
                    if (!levelSucceeded) break;
                }

                setSchedule(newSchedule);
                persistSchedule(newSchedule);

                if (levelSucceeded) {
                    alert(`Nivelamento concluído com sucesso em ${result.iterations} iterações! Toda a sobrecarga foi resolvida.`);
                } else {
                    alert(`Nivelamento concluído em ${result.iterations} iterações.Alguns gargalos persistem devido a restrições de prazo ou precedência que impedem novos deslocamentos.`);
                }
            }
        } catch (err: any) {
            alert(err.message || 'Erro ao nivelar recursos');
        }
    };

    const handleResolveLevelingIssues = (action: 'EXTEND' | 'INCREASE') => {
        setSchedule(prev => {
            let updatedSchedules = [...(prev.itemSchedules || [])];
            let updatedResources = { ...(prev.resources || { roles: [], workers: [], teams: [] }) };

            levelingIssues?.forEach(issue => {
                if (action === 'EXTEND') {
                    // Reduce crew to fit capacity
                    const taskIdx = updatedSchedules.findIndex(s => s.id === issue.itemId);
                    if (taskIdx >= 0) {
                        const task = { ...updatedSchedules[taskIdx] };
                        // Simple heuristic: if it's a role, adjust crew numbers
                        // We assumes single-task over capacity means allocations > limit
                        // We can force auto-duration or just reduce allocation qty
                        if (task.allocations) {
                            task.allocations = task.allocations.map(a =>
                                a.resourceId === issue.resourceId ? { ...a, quantity: issue.capacity } : a
                            );
                        }
                        // If using autoDuration, recalculate it
                        if (task.autoDuration) {
                            // CrewEngine would trigger recalculation in SchedulingEngine.calculate
                        }
                        updatedSchedules[taskIdx] = task;
                    }
                } else if (action === 'INCREASE') {
                    // Increase role capacity (requires adding placeholders or just changing metadata if stored)
                    // In our current system, capacity is derived from workers list.
                    // To "increase team", we'd need to add placeholder workers.
                    const roleIdx = updatedResources.roles.findIndex(r => r.id === issue.resourceId);
                    if (roleIdx >= 0) {
                        const neededExtras = issue.required - issue.capacity;
                        for (let i = 0; i < neededExtras; i++) {
                            const newWorker = {
                                id: `extra - ${issue.resourceId} -${Date.now()} -${i} `,
                                name: `${updatedResources.roles[roleIdx].name} (Adicional ${i + 1})`,
                                roleId: issue.resourceId
                            };
                            updatedResources.workers = [...updatedResources.workers, newWorker as any];
                        }
                    }
                }
            });

            const itemQuantities = new Map<string, number>();
            budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

            const finalSchedules = SchedulingEngine.calculate(
                ensureFullScheduleList(updatedSchedules, budget),
                prev.startDate,
                undefined,
                prev.useWorkingDays ?? true,
                prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                updatedResources.roles,
                itemQuantities,
                updatedResources.workers,
                updatedResources.teams
            );

            // Re-run leveling after fixing inherent bottlenecks
            const finalResult = SchedulingEngine.levelResources(
                finalSchedules,
                prev.startDate,
                prev.useWorkingDays ?? true,
                updatedResources.roles,
                updatedResources.workers,
                updatedResources.teams,
                itemQuantities
            );

            // Check if bottlenecks remain after resolving inherent ones
            const histogram = SchedulingEngine.calculateResourceHistogram(
                finalResult.leveledSchedules,
                prev.useWorkingDays ?? true,
                updatedResources.workers,
                updatedResources.teams
            );
            const limits = new Map<string, number>();
            updatedResources.roles.forEach(r => {
                const count = updatedResources.workers.filter(w => w.roleId === r.id).length;
                limits.set(r.id, count || 1);
            });
            updatedResources.workers.forEach(w => limits.set(w.id, 1));
            updatedResources.teams.forEach(t => limits.set(t.id, 1));

            let hasOverload = false;
            for (const day of Object.values(histogram)) {
                for (const [resId, usage] of Object.entries(day)) {
                    const limit = limits.get(resId) || 0;
                    if (usage.total > limit) {
                        hasOverload = true;
                        break;
                    }
                }
                if (hasOverload) break;
            }

            const newSchedule = {
                ...prev,
                resources: updatedResources,
                itemSchedules: finalResult.leveledSchedules
            };
            persistSchedule(newSchedule);
            setLevelingIssues(null);

            if (hasOverload) {
                alert(`Gargalos indissolúveis resolvidos, mas restam sobreposições menores que não podem ser movidas devido a restrições do cronograma.`);
            } else {
                alert(`Sucesso! Todos os gargalos e sobrecargas foram resolvidos.`);
            }

            return newSchedule;
        });
    };


    const handleUpdateRealPct = (itemId: string, value: string) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);
            const numValue = value === '' ? undefined : parseFloat(value);
            const clampedValue = numValue !== undefined ? Math.min(100, Math.max(0, numValue)) : undefined;

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) {
                updatedSchedules[taskIdx] = { ...updatedSchedules[taskIdx], manualRealPct: clampedValue };
            } else {
                updatedSchedules.push({ id: itemId, manualRealPct: clampedValue });
            }

            const newSchedule = { ...prev, itemSchedules: updatedSchedules };
            persistSchedule(newSchedule);
            return newSchedule;
        });
    };

    const handleUpdateAllocation = (itemId: string, allocations: any[]) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);

            const newTask: ItemScheduleDetails = taskIdx >= 0
                ? { ...currentItems[taskIdx] }
                : { id: itemId };

            newTask.allocations = allocations;

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) updatedSchedules[taskIdx] = newTask;
            else updatedSchedules.push(newTask);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    ensureFullScheduleList(updatedSchedules, budget),
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                persistSchedule(newSchedule);
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    // ── Crew field update handler ──
    const handleUpdateCrewField = (itemId: string, field: string, value: any) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);

            const newTask: ItemScheduleDetails = taskIdx >= 0
                ? { ...currentItems[taskIdx] }
                : {
                    id: itemId,
                    autoDuration: true,
                    crewMainWorkers: 1,
                    crewHelpers: 0,
                    hoursPerDay: 8,
                    efficiencyFactor: 1.0,
                    helperFactor: 0.5,
                    effortCoefficient: 0,
                    mainWorkerProd: 0,
                    helperProd: 0
                };

            (newTask as any)[field] = value;

            // Force autoDuration on any crew field change
            const crewFields = ['crewMainWorkers', 'crewHelpers', 'helperFactor', 'effortCoefficient',
                'mainWorkerProd', 'helperProd', 'efficiencyFactor', 'hoursPerDay'];
            if (crewFields.includes(field)) {
                newTask.autoDuration = true;
            }

            // Eagerly compute auto-duration so UI and endDate stay in sync
            let updatedRoles = prev.resources?.roles || [];

            if (newTask.autoDuration) {
                const budgetItem = budget.find(b => b.id === itemId);
                const qty = budgetItem?.quantity ?? 1;

                // Try to initialize or re-derive effortCoefficient if:
                // 1. We are explicitly toggling Auto ON (user expects a reset/calculation)
                // 2. The current value is 0 or default 1.0
                const isTogglingAuto = field === 'autoDuration' && value === true;
                const isDefaultOrEmpty = (newTask.effortCoefficient || 0) === 0 || (newTask.effortCoefficient || 0) === 1.0;

                if ((isTogglingAuto || isDefaultOrEmpty) && budgetItem?.sinapiItem?.composition) {
                    const laborSum = SchedulingEngine.deriveEffortFromComposition(budgetItem.sinapiItem.composition);
                    if (laborSum > 0) newTask.effortCoefficient = laborSum;

                    // NEW: Auto-allocate for single item
                    const compLabor = budgetItem.sinapiItem.composition.filter(c => SchedulingEngine.isLaborComp(c));
                    if (compLabor.length > 0) {
                        const newRolesMap = new Map<string, ResourceRole>(updatedRoles.map(r => [r.id, r]));
                        const allocMap = new Map<string, ResourceAllocation>();

                        (newTask.allocations || []).forEach(a => {
                            if (a.resourceType !== 'ROLE') allocMap.set(a.resourceId, a);
                        });

                        const isHelper = (name: string) => name.includes('SERVENTE') || name.includes('AJUDANTE') || name.includes('AUXILIAR');
                        const defaultMainWorkers = Number(newTask.crewMainWorkers ?? 1);
                        let defaultHelpers = Number(newTask.crewHelpers ?? 0);

                        compLabor.forEach(comp => {
                            let roleName = comp.description.split(' COM ')[0].trim().toUpperCase();
                            if (roleName.length > 50) roleName = roleName.substring(0, 50);

                            let matchingRole = Array.from(newRolesMap.values()).find(r => r.name.toUpperCase() === roleName);
                            if (!matchingRole) {
                                const newRoleId = crypto.randomUUID();
                                matchingRole = {
                                    id: newRoleId,
                                    name: roleName,
                                    costPerHour: Number(comp.price) || 0,
                                    costPerDay: (Number(comp.price) || 0) * 8,
                                    source: 'SINAPI'
                                };
                                newRolesMap.set(newRoleId, matchingRole);
                            }

                            if (!allocMap.has(matchingRole.id)) {
                                const helper = isHelper(roleName);
                                if (helper && defaultHelpers === 0) defaultHelpers = 1;
                                let allocQty = helper ? defaultHelpers : defaultMainWorkers;
                                allocQty = Math.max(1, allocQty);

                                allocMap.set(matchingRole.id, {
                                    id: crypto.randomUUID(),
                                    resourceId: matchingRole.id,
                                    resourceType: 'ROLE',
                                    quantity: allocQty,
                                    hoursPerDay: Number(newTask.hoursPerDay ?? 8)
                                });
                            }
                        });

                        newTask.allocations = Array.from(allocMap.values());
                        newTask.crewHelpers = defaultHelpers;
                        updatedRoles = Array.from(newRolesMap.values());
                    }
                }

                // Fallback to avoid zero-blocking
                if ((newTask.effortCoefficient || 0) === 0 && (newTask.mainWorkerProd || 0) === 0) {
                    newTask.effortCoefficient = 1.0;
                }

                const calculatedDur = SchedulingEngine.calculateDurationFromCrew(newTask, qty);
                if (calculatedDur !== null) {
                    newTask.duration = calculatedDur;
                    if (newTask.startDate) {
                        const start = new Date(newTask.startDate);
                        const end = SchedulingEngine.addDays(start, calculatedDur, prev.useWorkingDays ?? true);
                        newTask.endDate = end.toISOString().split('T')[0];
                    }
                }
            }

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) updatedSchedules[taskIdx] = newTask;
            else updatedSchedules.push(newTask);

            const newResources = {
                roles: updatedRoles,
                workers: prev.resources?.workers || [],
                teams: prev.resources?.teams || []
            };

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    ensureFullScheduleList(updatedSchedules, budget),
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    newResources.roles,
                    itemQuantities,
                    newResources.workers,
                    newResources.teams
                );

                const newSchedule = { ...prev, itemSchedules: calculated, resources: newResources };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    // ── Bulk: Apply auto-duration to ALL items ──
    const handleApplyAutoAllItems = () => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const itemMap = new Map(currentItems.map(s => [s.id, s]));

            // NEW: Extract roles from budget compositions
            const existingRoles = prev.resources?.roles || [];
            const newRolesMap = new Map<string, ResourceRole>(existingRoles.map(r => [r.id, r]));

            budget.forEach(item => {
                if (item.sinapiItem?.composition) {
                    item.sinapiItem.composition.forEach(comp => {
                        if (SchedulingEngine.isLaborComp(comp)) {
                            // Extract base name, e.g., "PEDREIRO COM ENCARGOS COMPLEMENTARES" -> "PEDREIRO"
                            let roleName = comp.description.split(' COM ')[0].trim().toUpperCase();
                            if (roleName.length > 50) roleName = roleName.substring(0, 50);

                            let roleExists = Array.from(newRolesMap.values()).some(r => r.name.toUpperCase() === roleName);
                            if (!roleExists) {
                                const newRoleId = crypto.randomUUID();
                                newRolesMap.set(newRoleId, {
                                    id: newRoleId,
                                    name: roleName,
                                    costPerHour: Number(comp.price) || 0,
                                    costPerDay: (Number(comp.price) || 0) * 8,
                                    source: 'SINAPI'
                                });
                            }
                        }
                    });
                }
            });
            const updatedRoles = Array.from(newRolesMap.values());

            const updatedBudgetItems = budget.map(item => {
                const existing = itemMap.get(item.id);

                let effortCoef = Number(existing?.effortCoefficient ?? 0);

                if (item.sinapiItem?.composition) {
                    const derived = SchedulingEngine.deriveEffortFromComposition(item.sinapiItem.composition);
                    if (derived > 0) effortCoef = derived;
                }

                if (effortCoef === 0) effortCoef = 1.0;

                const isHelper = (name: string) => name.includes('SERVENTE') || name.includes('AJUDANTE') || name.includes('AUXILIAR');
                const defaultMainWorkers = Number(existing?.crewMainWorkers ?? 1);
                let defaultHelpers = Number(existing?.crewHelpers ?? 0);

                // NEW: Auto-allocate
                let newAllocations = existing?.allocations || [];
                if (item.sinapiItem?.composition) {
                    const compLabor = item.sinapiItem.composition.filter(c => SchedulingEngine.isLaborComp(c));
                    if (compLabor.length > 0) {
                        const allocMap = new Map<string, ResourceAllocation>();
                        newAllocations.forEach(a => {
                            if (a.resourceType !== 'ROLE') allocMap.set(a.resourceId, a);
                        });

                        compLabor.forEach(comp => {
                            let roleName = comp.description.split(' COM ')[0].trim().toUpperCase();
                            if (roleName.length > 50) roleName = roleName.substring(0, 50);
                            const matchingRole = updatedRoles.find(r => r.name.toUpperCase() === roleName);

                            if (matchingRole && !allocMap.has(matchingRole.id)) {
                                const helper = isHelper(roleName);
                                // Set at least 1 helper if the composition requires it and it was 0
                                if (helper && defaultHelpers === 0) {
                                    defaultHelpers = 1;
                                }
                                let qty = helper ? defaultHelpers : defaultMainWorkers;
                                qty = Math.max(1, qty); // Ensure it appears in Capacity Plan

                                allocMap.set(matchingRole.id, {
                                    id: crypto.randomUUID(),
                                    resourceId: matchingRole.id,
                                    resourceType: 'ROLE',
                                    quantity: qty,
                                    hoursPerDay: Number(existing?.hoursPerDay ?? 8)
                                });
                            }
                        });
                        newAllocations = Array.from(allocMap.values());
                    }
                }

                return {
                    ...(existing || { id: item.id }),
                    autoDuration: true,
                    crewMainWorkers: defaultMainWorkers,
                    crewHelpers: defaultHelpers,
                    helperFactor: Number(existing?.helperFactor ?? 0.5),
                    effortCoefficient: effortCoef,
                    hoursPerDay: Number(existing?.hoursPerDay ?? 8),
                    efficiencyFactor: Number(existing?.efficiencyFactor ?? 1.0),
                    mainWorkerProd: Number(existing?.mainWorkerProd ?? 0),
                    helperProd: Number(existing?.helperProd ?? 0),
                    allocations: newAllocations
                };
            });

            const newResources = {
                roles: updatedRoles,
                workers: prev.resources?.workers || [],
                teams: prev.resources?.teams || []
            };

            const budgetIds = new Set(budget.map(b => b.id));
            const extraTasks = currentItems.filter(s => !budgetIds.has(s.id));
            const fullList = ensureFullScheduleList([...updatedBudgetItems, ...extraTasks], budget);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    fullList,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    newResources.roles,
                    itemQuantities,
                    newResources.workers,
                    newResources.teams
                );

                const newSchedule = { ...prev, itemSchedules: calculated, resources: newResources };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: fullList, resources: newResources };
            }
        });
    };

    // ── Bulk: Disable auto-duration on ALL items ──
    const handleDisableAutoAllItems = () => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const updatedSchedules = currentItems.map(s => ({
                ...s,
                autoDuration: false
            }));

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    updatedSchedules,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    const handleSaveBaseline = (name: string, description: string) => {
        const itemDates: Record<string, { startDate: string; endDate: string }> = {};
        schedule.itemSchedules?.forEach(s => {
            if (s.startDate && s.endDate) {
                itemDates[s.id] = { startDate: s.startDate, endDate: s.endDate };
            }
        });

        const newBaseline: Baseline = {
            id: crypto.randomUUID(),
            name,
            description,
            createdAt: new Date().toISOString(),
            itemDates
        };

        const newSchedule = {
            ...schedule,
            baselines: [...(schedule.baselines || []), newBaseline],
            activeBaselineId: newBaseline.id
        };

        setSchedule(newSchedule);
        onUpdateSettings({ ...settings, schedule: newSchedule });
        setIsBaselineModalOpen(false);
    };

    const handleActivateBaseline = (id: string | null) => {
        const newSchedule = { ...schedule, activeBaselineId: id === null ? undefined : id };
        setSchedule(newSchedule);

        // Trigger recalculation to update slippage/spi
        const activeBaseline = newSchedule.baselines?.find(b => b.id === newSchedule.activeBaselineId);
        const itemQuantities = new Map<string, number>();
        budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

        const calculated = SchedulingEngine.calculate(
            ensureFullScheduleList(newSchedule.itemSchedules || [], budget),
            newSchedule.startDate,
            activeBaseline,
            newSchedule.useWorkingDays ?? true,
            newSchedule.replanMode ?? ReplanMode.AFFECTED_TASK,
            newSchedule.resources?.roles || [],
            itemQuantities,
            newSchedule.resources?.workers || [],
            newSchedule.resources?.teams || []
        );
        const finalSchedule = { ...newSchedule, itemSchedules: calculated };
        setSchedule(finalSchedule);
        persistSchedule(finalSchedule);
    };

    const handleDeleteBaseline = (id: string) => {
        const newSchedule = {
            ...schedule,
            baselines: (schedule.baselines || []).filter(b => b.id !== id),
            activeBaselineId: schedule.activeBaselineId === id ? undefined : schedule.activeBaselineId
        };
        setSchedule(newSchedule);
        persistSchedule(newSchedule);
    };

    // ── What-If Analysis (Simulation Mode) ──
    const handleToggleSimulation = () => {
        if (!isSimulationMode) {
            // Entrar no modo simulação: salva o estado atual
            setOriginalScheduleBackup(JSON.parse(JSON.stringify(schedule)));
            setIsSimulationMode(true);
        } else {
            // Sair do modo simulação (Descartar)
            if (originalScheduleBackup) {
                setSchedule(originalScheduleBackup);
            }
            setIsSimulationMode(false);
            setOriginalScheduleBackup(null);
        }
    };

    const handleSaveSimulation = () => {
        setIsSimulationMode(false);
        setOriginalScheduleBackup(null);
        // Agora que isSimulationMode é false, podemos persistir o estado atual que estava "simulado"
        onUpdateSettings({ ...settings, schedule: schedule });
    };

    const handleExportPDF = async () => {
        if (!exportRef.current) return;
        setIsExportingPDF(true);

        try {
            // Options to ensure good quality in html2canvas
            const canvas = await html2canvas(exportRef.current, {
                scale: 2, // High resolution
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');

            // Set up landscape A4 PDF
            const pdf = new jsPDF('l', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            const projectName = projects?.find(p => p.id === settings.id)?.name || "Cronograma_Projeto";
            const today = new Date().toLocaleDateString('pt-BR');

            // Header info
            pdf.setFontSize(14);
            pdf.setTextColor(40, 40, 40);
            pdf.text(`Cronograma Físico - Financeiro - ${projectName} `, 14, 15);
            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Emitido em: ${today} `, 14, 22);

            // Calculate image dimensions to fit within PDF page
            const margin = 10;
            const startY = 28;
            const availableWidth = pageWidth - (margin * 2);
            const availableHeight = pageHeight - startY - margin;

            const imgRatio = canvas.width / canvas.height;
            let imgRenderWidth = availableWidth;
            let imgRenderHeight = availableWidth / imgRatio;

            // Scale down if too tall
            if (imgRenderHeight > availableHeight) {
                imgRenderHeight = availableHeight;
                imgRenderWidth = availableHeight * imgRatio;
            }

            pdf.addImage(imgData, 'PNG', margin, startY, imgRenderWidth, imgRenderHeight);

            pdf.save(`Cronograma_${projectName.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.pdf`);

        } catch (error) {
            console.error('Falha ao exportar PDF:', error);
            alert('Não foi possível gerar a exportação neste momento.');
        } finally {
            setIsExportingPDF(false);
        }
    };

    const getPhotosForItem = (itemId: string): string[] => {
        if (!settings.diaryEntries) return [];
        const taskPhotos: string[] = [];
        settings.diaryEntries.forEach(entry => {
            const hasActivity = entry.activities?.some(act => act.itemId === itemId);
            if (hasActivity && entry.images && entry.images.length > 0) {
                taskPhotos.push(...entry.images);
            }
        });
        return taskPhotos;
    };

    const handleGanttBarMouseDown = (e: React.MouseEvent, taskId: string, taskStartStr?: string) => {
        if (!isSimulationMode) return; // Só permite arrastar no modo simulação
        if (!taskStartStr) return;

        e.preventDefault();
        e.stopPropagation();

        const taskStart = new Date(taskStartStr);
        // O offset inicial = a posição X do mouse menos a data base do projeto (simplificação para drag)
        setIsDraggingTask(taskId);
        setDragTaskStartOffset(e.clientX);
        document.body.style.cursor = 'grabbing';
    };

    useEffect(() => {
        if (!isDraggingTask) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingTask) return;

            const deltaX = e.clientX - dragTaskStartOffset;
            const daysShift = Math.round(deltaX / 30); // Usando 30px como base de 1 dia na visualização padrão

            if (daysShift !== 0) {
                setSchedule(prev => {
                    const currentItems = prev.itemSchedules || [];
                    const taskIdx = currentItems.findIndex(s => s.id === isDraggingTask);
                    if (taskIdx === -1) return prev;

                    const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                    // Pega a data original (usamos originalScheduleBackup para evitar acumular offsets de arrastos rápidos)
                    const backupTask = originalScheduleBackup?.itemSchedules?.find(s => s.id === isDraggingTask);
                    if (!backupTask || !backupTask.startDate) return prev;

                    const originalDate = new Date(backupTask.startDate);
                    const newDate = SchedulingEngine.addDays(originalDate, daysShift, prev.useWorkingDays ?? true);
                    const newDateStr = newDate.toISOString().split('T')[0];

                    // Atualiza a task sendo arrastada
                    const newTask = { ...currentItems[taskIdx], startDate: newDateStr, constraintType: ConstraintType.MSO as ConstraintType, constraintDate: newDateStr };

                    const updatedSchedules = [...currentItems];
                    updatedSchedules[taskIdx] = newTask;

                    const itemQuantities = new Map<string, number>();
                    budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                    try {
                        // Faz o recálculo live do impacto (O SchedulingEngine cuida de empurrar sucessores)
                        const calculated = SchedulingEngine.calculate(
                            ensureFullScheduleList(updatedSchedules, budget),
                            prev.startDate,
                            activeBaseline,
                            prev.useWorkingDays ?? true,
                            prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                            prev.resources?.roles || [],
                            itemQuantities,
                            prev.resources?.workers || [],
                            prev.resources?.teams || []
                        );
                        return { ...prev, itemSchedules: calculated };
                    } catch (err) {
                        return prev;
                    }
                });
            }
        };

        const handleMouseUp = () => {
            setIsDraggingTask(null);
            document.body.style.cursor = '';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingTask, dragTaskStartOffset, originalScheduleBackup, budget]);

    const handleUpdateItemSchedule = (itemId: string, field: 'startDate' | 'endDate' | 'duration', value: string | number) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);

            let newDetails: ItemScheduleDetails = taskIdx >= 0
                ? { ...currentItems[taskIdx] }
                : { id: itemId };

            newDetails = { ...newDetails, [field]: value };

            // Manual override logic if user changes dates directly
            if (field === 'startDate') {
                const dateVal = value as string;
                if (dateVal) {
                    if (newDetails.duration) {
                        const start = new Date(dateVal);
                        const end = new Date(start);
                        end.setDate(start.getDate() + (newDetails.duration as number));
                        newDetails.endDate = end.toISOString().split('T')[0];
                    }
                    // Use MSO (Must Start On) so it's not "blocked" by predecessors during manual override
                    newDetails.constraintType = ConstraintType.MSO;
                    newDetails.constraintDate = dateVal;
                } else {
                    console.log('[DEBUG] Clearing start date and constraints for item:', itemId);
                    // If date is cleared, remove constraint to allow predecessors to drive it
                    newDetails.constraintType = undefined;
                    newDetails.constraintDate = undefined;
                    newDetails.earlyStart = undefined;
                    newDetails.earlyFinish = undefined;
                    // newDetails.startDate = undefined; // Do not clear startDate/endDate if we want to show something?
                    // Actually, if we clear start date manually, we probably want to see what the scheduler calculates.
                    // But the scheduler needs *some* date or needs to know it's unconstrained.
                }
            } else if (field === 'duration' && value !== undefined && newDetails.startDate) {
                const start = new Date(newDetails.startDate);
                const end = new Date(start);
                end.setDate(start.getDate() + (value as number));
                newDetails.endDate = end.toISOString().split('T')[0];
                newDetails.autoDuration = false; // Override auto if manually set
            } else if (field === 'endDate' && value !== undefined && newDetails.startDate) {
                const start = new Date(newDetails.startDate);
                const end = new Date(value as string);
                const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                newDetails.duration = Math.max(0, diffDays);
            }

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) updatedSchedules[taskIdx] = newDetails;
            else updatedSchedules.push(newDetails);

            const itemsToUse = ensureFullScheduleList(updatedSchedules, budget);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    itemsToUse,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    const handleAddPredecessor = (itemId: string, predId: string, type: DependencyType, lag: number) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);

            const newTask: ItemScheduleDetails = taskIdx >= 0
                ? { ...currentItems[taskIdx] }
                : { id: itemId };

            const preds = newTask.predecessors || [];
            if (preds.some(p => p.id === predId)) return prev; // Avoid duplicates

            newTask.predecessors = [...preds, { id: predId, type, lag }];

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) updatedSchedules[taskIdx] = newTask;
            else updatedSchedules.push(newTask);

            const itemsToUse = ensureFullScheduleList(updatedSchedules, budget);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    itemsToUse,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    const handleRemovePredecessor = (itemId: string, predId: string) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);
            if (taskIdx < 0) return prev;

            const newTask = { ...currentItems[taskIdx] };
            newTask.predecessors = (newTask.predecessors || []).filter(p => p.id !== predId);

            const updatedSchedules = [...currentItems];
            updatedSchedules[taskIdx] = newTask;

            const itemsToUse = ensureFullScheduleList(updatedSchedules, budget);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    itemsToUse,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    const handleUpdatePredecessorField = (itemId: string, field: 'uid' | 'type' | 'lag', value: any) => {
        setSchedule(prev => {
            const currentItems = prev.itemSchedules || [];
            const taskIdx = currentItems.findIndex(s => s.id === itemId);

            const newTask: ItemScheduleDetails = taskIdx >= 0
                ? { ...currentItems[taskIdx] }
                : { id: itemId };

            const preds = [...(newTask.predecessors || [])];

            newTask.predecessors = preds;

            if (field === 'uid') {
                // Split possibly multiple UIDs: "4, 1"
                const uids = value.split(/[,\s]+/).filter((u: string) => u.trim());
                const newPreds: Predecessor[] = [];

                uids.forEach((u: string) => {
                    const uidId = uidToId[u.trim()];
                    if (uidId && !newPreds.some(p => p.id === uidId)) {
                        const existing = (newTask.predecessors || []).find(p => p.id === uidId);
                        newPreds.push(existing || { id: uidId, type: DependencyType.FS, lag: 0 });
                    }
                });

                newTask.predecessors = newPreds;

                // If adding predecessors, we should probably relax constraints to let the predecessor drive the date
                if (newPreds.length > 0) {
                    newTask.constraintType = undefined;
                    newTask.constraintDate = undefined;
                }
            }

            const updatedSchedules = [...currentItems];
            if (taskIdx >= 0) updatedSchedules[taskIdx] = newTask;
            else updatedSchedules.push(newTask);

            const itemsToUse = ensureFullScheduleList(updatedSchedules, budget);

            try {
                const activeBaseline = prev.baselines?.find(b => b.id === prev.activeBaselineId);
                const itemQuantities = new Map<string, number>();
                budget.forEach(entry => itemQuantities.set(entry.id, entry.quantity));

                const calculated = SchedulingEngine.calculate(
                    itemsToUse,
                    prev.startDate,
                    activeBaseline,
                    prev.useWorkingDays ?? true,
                    prev.replanMode ?? ReplanMode.AFFECTED_TASK,
                    prev.resources?.roles || [],
                    itemQuantities,
                    prev.resources?.workers || [],
                    prev.resources?.teams || []
                );

                const newSchedule = { ...prev, itemSchedules: calculated };
                onUpdateSettings({ ...settings, schedule: newSchedule });
                return newSchedule;
            } catch (err: any) {
                console.error('Recalculate error:', err);
                return { ...prev, itemSchedules: updatedSchedules };
            }
        });
    };

    // Unified Timeline Columns Calculation
    const timelineColumns = React.useMemo(() => {
        const minDate = new Date(schedule.startDate);
        if (isNaN(minDate.getTime())) return [];

        let maxDate = schedule.endDate ? new Date(schedule.endDate) : new Date(minDate);
        if (!schedule.endDate) {
            maxDate.setMonth(maxDate.getMonth() + (schedule.duration || 12));
            schedule.itemSchedules?.forEach(s => {
                if (s.endDate) {
                    const end = new Date(s.endDate);
                    if (!isNaN(end.getTime()) && end > maxDate) maxDate = end;
                }
            });
        }

        const bufferedMaxDate = new Date(maxDate);
        if (timeScale === 'year') {
            bufferedMaxDate.setFullYear(bufferedMaxDate.getFullYear() + 1);
        } else {
            bufferedMaxDate.setDate(bufferedMaxDate.getDate() + 30);
        }

        const columns = [];
        let current = new Date(minDate);
        let loopCount = 0;
        const MAX_LOOPS = 5000;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const scaleConfig = {
            day: { pxPerDay: 40, stepDays: 1 },
            week: { pxPerDay: 10, stepDays: 7 },
            month: { pxPerDay: 3, stepDays: 30 }, // Average
            year: { pxPerDay: 0.5, stepDays: 365 }
        };
        const { pxPerDay } = scaleConfig[timeScale];

        const labelFormats = {
            day: (d: Date) => d.getDate().toString(),
            week: (d: Date) => `Sem ${getWeekNumber(d)} `,
            month: (d: Date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(d),
            year: (d: Date) => d.getFullYear().toString()
        };

        const subLabelFormats = {
            day: (d: Date) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).toUpperCase(),
            week: (d: Date) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).toUpperCase(),
            month: (d: Date) => d.getFullYear().toString(),
            year: (d: Date) => ''
        };

        if (timeScale === 'day') {
            while (current <= maxDate && loopCount++ < MAX_LOOPS) {
                const isToday = current.getTime() === today.getTime();
                columns.push({
                    id: current.toISOString().split('T')[0],
                    date: new Date(current),
                    name: labelFormats.day(current),
                    label: labelFormats.day(current),
                    subLabel: subLabelFormats.day(current),
                    width: pxPerDay,
                    isToday
                });
                current.setDate(current.getDate() + 1);
            }
        } else if (timeScale === 'week') {
            const day = current.getDay();
            const diff = current.getDate() - day + (day === 0 ? -6 : 1);
            current.setDate(diff);
            while (current <= maxDate && loopCount++ < MAX_LOOPS) {
                const nextWeek = new Date(current);
                nextWeek.setDate(current.getDate() + 7);
                const isToday = today >= current && today < nextWeek;

                columns.push({
                    id: current.toISOString().split('T')[0],
                    date: new Date(current),
                    name: labelFormats.week(current),
                    label: labelFormats.week(current).toUpperCase(),
                    subLabel: subLabelFormats.week(current),
                    width: pxPerDay * 7,
                    isToday
                });
                current.setDate(current.getDate() + 7);
            }
        } else if (timeScale === 'month') {
            current.setDate(1);
            while (current <= maxDate && loopCount++ < MAX_LOOPS) {
                const nextMonth = new Date(current);
                nextMonth.setMonth(current.getMonth() + 1);
                const daysInMonth = Math.round((nextMonth.getTime() - current.getTime()) / (1000 * 3600 * 24));
                const isToday = today >= current && today < nextMonth;

                columns.push({
                    id: current.toISOString().split('T')[0],
                    date: new Date(current),
                    name: labelFormats.month(current),
                    label: labelFormats.month(current).split(' ')[0].toUpperCase(),
                    subLabel: subLabelFormats.month(current),
                    width: pxPerDay * daysInMonth,
                    isToday
                });
                current.setMonth(current.getMonth() + 1);
            }
        } else if (timeScale === 'year') {
            current.setMonth(0, 1);
            while (current <= maxDate && loopCount++ < MAX_LOOPS) {
                const nextYear = new Date(current);
                nextYear.setFullYear(current.getFullYear() + 1);
                const daysInYear = Math.round((nextYear.getTime() - current.getTime()) / (1000 * 3600 * 24));
                const isToday = today >= current && today < nextYear;

                columns.push({
                    id: current.toISOString().split('T')[0],
                    date: new Date(current),
                    name: labelFormats.year(current),
                    label: labelFormats.year(current),
                    subLabel: '',
                    width: pxPerDay * daysInYear,
                    isToday
                });
                current.setFullYear(current.getFullYear() + 1);
            }
        }

        return columns;
    }, [schedule.startDate, schedule.endDate, schedule.duration, schedule.itemSchedules, timeScale]);



    // Calculate totals for Chart
    // ── Consolidate Planned/Realized values per Period and Item ──
    const periodCalculation = React.useMemo(() => {
        const itemPeriodRealized: Record<string, Record<string, number>> = {};
        const itemPeriodPlanned: Record<string, Record<string, number>> = {};
        const periodTotals: Record<string, { planned: number; realized: number }> = {};

        // Initialize timeline column data
        timelineColumns.forEach(period => {
            periodTotals[period.id] = { planned: 0, realized: 0 };
        });

        // 1. Calculate Planned Values (Automatic distribution by dates OR manual distributions)
        budget.forEach(item => {
            itemPeriodPlanned[item.id] = {};
            const scheduleItem = schedule.itemSchedules?.find(s => s.id === item.id);
            const totalValue = (item.quantity * item.sinapiItem.price);

            if (scheduleItem?.startDate && scheduleItem?.endDate) {
                const taskStart = new Date(scheduleItem.startDate);
                const taskEnd = new Date(scheduleItem.endDate);
                // Calculate total duration in days (inclusive)
                const totalDays = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const dailyRate = totalValue / (totalDays || 1);

                timelineColumns.forEach(period => {
                    const periodStart = new Date(period.date);
                    const nextPeriodStart = timelineColumns[timelineColumns.indexOf(period) + 1]
                        ? new Date(timelineColumns[timelineColumns.indexOf(period) + 1].date)
                        : new Date(new Date(periodStart).setMonth(periodStart.getMonth() + 1));

                    // Intersection: Max(taskStart, periodStart) to Min(taskEnd, nextPeriodStart - 1 day)
                    const overlapStart = new Date(Math.max(taskStart.getTime(), periodStart.getTime()));
                    // nextPeriodStart is exclusive, so we use it as boundary. 
                    // But taskEnd is inclusive, so we need the min of (taskEnd + 1) and nextPeriodStart.
                    const taskEndBound = new Date(taskEnd.getTime() + (1000 * 60 * 60 * 24));
                    const overlapEnd = new Date(Math.min(taskEndBound.getTime(), nextPeriodStart.getTime()));

                    const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
                    const overlapDays = Math.max(0, overlapMs / (1000 * 60 * 60 * 24));

                    const plannedValue = overlapDays * dailyRate;
                    itemPeriodPlanned[item.id][period.id] = plannedValue;
                    if (periodTotals[period.id]) {
                        periodTotals[period.id].planned += plannedValue;
                    }
                });
            } else {
                // FALLBACK: Manual Distribution (Percentages)
                timelineColumns.forEach(period => {
                    const dist = schedule.distributions.find(d => d.itemId === item.id && d.periodId === period.id);
                    const plannedValue = dist ? totalValue * (dist.percentage / 100) : 0;
                    itemPeriodPlanned[item.id][period.id] = plannedValue;
                    if (periodTotals[period.id]) {
                        periodTotals[period.id].planned += plannedValue;
                    }
                });
            }
        });

        // 2. Calculate Realized Values (Diary Entries + Orders)
        budget.forEach(item => {
            itemPeriodRealized[item.id] = {};
            timelineColumns.forEach((period, idx) => {
                const periodStart = new Date(period.date);
                const nextPeriodStart = timelineColumns[idx + 1]
                    ? new Date(timelineColumns[idx + 1].date)
                    : new Date(new Date(periodStart).setMonth(periodStart.getMonth() + 1));

                let val = 0;

                // From Diary
                if (allDiaryEntries) {
                    allDiaryEntries.forEach(entry => {
                        const entryDate = new Date(entry.date);
                        if (entryDate >= periodStart && entryDate < nextPeriodStart && entry.status !== 'Recusado') {
                            const activity = entry.activities?.find((a: any) =>
                                a.itemId === item.id ||
                                (a.description && item.sinapiItem?.description && a.description.trim() === item.sinapiItem.description.trim())
                            );
                            if (activity) {
                                // Fallback: If realizedQty is 0 (Legacy or not filled), use evolution % to calculate financial value
                                if ((activity.realizedQty || 0) === 0 && (activity.evolution || 0) > 0) {
                                    const itemBdi = item.bdi !== undefined ? item.bdi : (settings.bdi || 0);
                                    // Estimate based on evolution if realizedQty is missing
                                    const totalItemValRaw = item.quantity * item.sinapiItem.price;
                                    val += (activity.evolution / 100) * totalItemValRaw;
                                } else {
                                    val += (activity.realizedQty || 0) * item.sinapiItem.price;
                                }
                            }
                        }
                    });
                }
                itemPeriodRealized[item.id][period.id] = val;
                if (periodTotals[period.id]) periodTotals[period.id].realized += val;
            });
        });

        // 3. Add Orders to Realized (Orders current associate material value to periods)
        // Note: Orders match materials by code. We'll distribute order value proportionally to budget items with same code.
        if (orders) {
            orders.forEach(order => {
                if (order.status === 'Cancelado') return;
                const dateStr = order.deliveryDate || order.created_at;
                if (!dateStr) return;
                const orderDate = new Date(dateStr);

                const period = timelineColumns.find((p, idx) => {
                    const start = new Date(p.date);
                    const next = timelineColumns[idx + 1]
                        ? new Date(timelineColumns[idx + 1].date)
                        : new Date(new Date(start).setMonth(start.getMonth() + 1));
                    return orderDate >= start && orderDate < next;
                });

                if (period) {
                    order.items.forEach(orderItem => {
                        const budgetItemsMatching = budget.filter(b => b.sinapiItem?.code === orderItem.code);
                        if (budgetItemsMatching.length === 0) {
                            // Order total still counts for project total even if item not in budget?
                            // For simplicity, let's just add it to periodTotals realized.
                            periodTotals[period.id].realized += (orderItem.total || 0);
                        } else {
                            // Weight by budget quantity
                            const totalBudgetQty = budgetItemsMatching.reduce((acc, b) => acc + b.quantity, 0) || 1;
                            budgetItemsMatching.forEach(bi => {
                                const weightedVal = (orderItem.total || 0) * (bi.quantity / totalBudgetQty);
                                itemPeriodRealized[bi.id][period.id] = (itemPeriodRealized[bi.id][period.id] || 0) + weightedVal;
                                periodTotals[period.id].realized += weightedVal;
                            });
                        }
                    });
                }
            });
        }

        // 4. Aggregate values for Parent Nodes (Phases/Groups)
        const nodePeriodPlanned: Record<string, Record<string, number>> = { ...itemPeriodPlanned };
        const nodePeriodRealized: Record<string, Record<string, number>> = { ...itemPeriodRealized };

        const aggregateNode = (node: HierarchyNode) => {
            if (node.type === 'item') return;

            nodePeriodPlanned[node.id] = {};
            nodePeriodRealized[node.id] = {};
            timelineColumns.forEach(p => {
                nodePeriodPlanned[node.id][p.id] = 0;
                nodePeriodRealized[node.id][p.id] = 0;
            });

            node.children.forEach(child => {
                aggregateNode(child);
                timelineColumns.forEach(p => {
                    nodePeriodPlanned[node.id][p.id] += (nodePeriodPlanned[child.id]?.[p.id] || 0);
                    nodePeriodRealized[node.id][p.id] += (nodePeriodRealized[child.id]?.[p.id] || 0);
                });
            });
        };

        hierarchy.forEach(aggregateNode);

        // Generate Chart Data from consolidated totals
        const chartData = timelineColumns.map(period => {
            const data = periodTotals[period.id];
            return {
                name: period.name,
                valor: data.planned,
                realizado: data.realized
            };
        });

        // Calculate Cumulative for Chart
        let cumulative = 0;
        let cumulativeRealized = 0;
        const chartDataWithCumulative = chartData.map(d => {
            cumulative += d.valor;
            cumulativeRealized += d.realizado;
            return {
                ...d,
                acumulado: cumulative,
                acumuladoRealizado: cumulativeRealized
            };
        });

        return {
            nodePeriodPlanned,
            nodePeriodRealized,
            periodTotals,
            chartData: chartDataWithCumulative
        };
    }, [timelineColumns, budget, schedule.distributions, settings.diaryEntries, orders, hierarchy]);

    const { chartData, nodePeriodPlanned, nodePeriodRealized, periodTotals } = periodCalculation;

    const chartDataWithCumulative = chartData; // Legacy reference support if needed

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <ScheduleHeader
                onBack={onBack}
                settings={settings}
                isProjectSelectorOpen={isProjectSelectorOpen}
                setIsProjectSelectorOpen={setIsProjectSelectorOpen}
                projects={projects}
                onLoadProject={onLoadProject}
                viewMode={viewMode}
                setViewMode={setViewMode}
                timeScale={timeScale}
                setTimeScale={setTimeScale}
                schedule={schedule}
                setIsBaselineModalOpen={setIsBaselineModalOpen}
                isSimulationMode={isSimulationMode}
                handleToggleSimulation={handleToggleSimulation}
                handleExportPDF={handleExportPDF}
                isExportingPDF={isExportingPDF}
                setIsConfigModalOpen={setIsConfigModalOpen}
                handleLevelResources={handleLevelResources}
                handleRecalculate={handleRecalculate}
                onUpdateSettings={onUpdateSettings}
                handleExpandAll={handleExpandAll}
                handleCollapseAll={handleCollapseAll}
                handleApplyAutoAllItems={handleApplyAutoAllItems}
                handleDisableAutoAllItems={handleDisableAutoAllItems}
                budgetLength={budget.length}
                autoCount={budget.filter(b => (schedule.itemSchedules || []).some(s => s.id === b.id && s.autoDuration)).length}
                allAuto={budget.length > 0 && budget.filter(b => (schedule.itemSchedules || []).some(s => s.id === b.id && s.autoDuration)).length >= budget.length}
                onClearAll={() => {
                    if (window.confirm('Tem certeza que deseja limpar todo o planejamento?')) {
                        const newSchedule = { ...schedule, distributions: [] };
                        setSchedule(newSchedule);
                        onUpdateSettings({ ...settings, schedule: newSchedule });
                    }
                }}
            />

            {/* Simulation Active Banner */}
            <SimulationBanner
                isSimulationMode={isSimulationMode}
                originalScheduleBackup={originalScheduleBackup}
                schedule={schedule}
                handleToggleSimulation={handleToggleSimulation}
                handleSaveSimulation={handleSaveSimulation}
            />

            {/* Supply Risk Summary Panel */}
            {insightSummary.totalAlerts > 0 && (
                <div className="bg-gradient-to-r from-red-50 via-orange-50 to-amber-50 border border-red-200/60 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setIsRiskPanelExpanded(prev => !prev)}
                        className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-red-100/30 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-100 text-red-600 shadow-sm">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-red-800">
                                    {insightSummary.totalAlerts} {insightSummary.totalAlerts === 1 ? 'etapa em risco' : 'etapas em risco'} de abastecimento
                                </p>
                                <p className="text-xs text-red-600/80 mt-0.5">
                                    {insightSummary.totalMissingItems} insumos sem pedido de compra — Custo estimado: <strong>R$ {insightSummary.totalMissingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-red-500 uppercase tracking-wider">{isRiskPanelExpanded ? 'Ocultar' : 'Ver detalhes'}</span>
                            <ChevronDown className={`w - 4 h - 4 text - red - 400 transition - transform duration - 200 ${isRiskPanelExpanded ? 'rotate-180' : ''} `} />
                        </div>
                    </button>

                    {isRiskPanelExpanded && (
                        <div className="px-5 pb-4 pt-1 border-t border-red-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                                {Object.entries(taskInsights).map(([id, insight]) => {
                                    const findName = (nodes: HierarchyNode[]): string => {
                                        for (const n of nodes) {
                                            if (n.id === id) return n.name || n.data?.sinapiItem?.description || id;
                                            if (n.children) {
                                                const found = findName(n.children);
                                                if (found) return found;
                                            }
                                        }
                                        return '';
                                    };
                                    const name = findName(hierarchy);
                                    return (
                                        <div key={id} className="flex items-start gap-2.5 bg-white/70 backdrop-blur-sm rounded-xl px-3.5 py-2.5 border border-red-100/60 shadow-xs">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-gray-800 truncate" title={name}>{name}</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    {insight.missingItems} {insight.missingItems === 1 ? 'insumo' : 'insumos'} sem pedido — R$ {insight.missingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Main Content: Chart + Table */}
            <div ref={exportRef} className="flex flex-col gap-6 bg-white p-2 rounded-xl">

                {/* Chart - Only visible in S-Curve mode */}
                {viewMode === 's-curve' && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-green-600" />
                                Curva S - Desembolso Acumulado
                            </h3>
                        </div>
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartDataWithCumulative} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)} k`} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)} k`} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="valor" name="Previsto (M)" barSize={30} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar yAxisId="left" dataKey="realizado" name="Realizado (M)" barSize={30} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Previsto (Acum)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                                    <Line yAxisId="right" type="monotone" dataKey="acumuladoRealizado" name="Realizado (Acum)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {viewMode === 'resources' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[600px]">
                        <ResourceManagement
                            resources={schedule.resources || { roles: [], workers: [], teams: [] }}
                            itemSchedules={schedule.itemSchedules || []}
                            useWorkingDays={schedule.useWorkingDays}
                            organizations={organizations}
                            localLabel="Planejamento"
                            onUpdateResources={(resources, updatedItemSchedules) => {
                                const newSchedule = {
                                    ...schedule,
                                    resources,
                                    ...(updatedItemSchedules ? { itemSchedules: updatedItemSchedules } : {})
                                };
                                setSchedule(newSchedule);
                                persistSchedule(newSchedule);
                                onUpdateSettings({ ...settings, schedule: newSchedule });
                            }}
                            onLevelResources={handleLevelResources}
                            budget={budget}
                        />
                    </div>
                )}

                {viewMode === 'risks' && (
                    <ScheduleRiskDashboard
                        hierarchy={hierarchy}
                        schedule={schedule}
                        budget={budget}
                        orders={orders}
                        taskInsights={taskInsights}
                        realizedState={realizedState}
                    />
                )}

                {/* Content Area - Only visible in Table or Gantt mode */}
                {(viewMode === 'table' || viewMode === 'gantt') && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {viewMode === 'table' ? (
                            <ScheduleGridView
                                hierarchy={hierarchy}
                                schedule={schedule}
                                timelineColumns={timelineColumns}
                                timeScale={timeScale}
                                expandedNodes={tableExpandedNodes}
                                toggleNode={toggleNode}
                                handleUpdateItemSchedule={handleUpdateItemSchedule}
                                handleUpdatePredecessorField={handleUpdatePredecessorField}
                                handleUpdateCrewField={handleUpdateCrewField}
                                handleUpdateDistribution={handleUpdateDistribution}
                                getDistribution={getDistribution}
                                getPhotosForItem={getPhotosForItem}
                                setViewingTaskPhotos={setViewingTaskPhotos}
                                handleDistributeEvenly={handleDistributeEvenly}
                                handleClearItem={handleClearItem}
                                idToUid={idToUid}
                                realizedState={realizedState}
                                nodePeriodPlanned={nodePeriodPlanned}
                                nodePeriodRealized={nodePeriodRealized}
                                periodTotals={periodTotals}
                                handleUpdateRealPct={handleUpdateRealPct}
                                budget={budget}
                                collapsedCols={collapsedCols}
                                handleSplitterMouseDown={handleSplitterMouseDown}
                                handleSplitterDblClick={handleSplitterDblClick}
                                getColWidth={getColWidth}
                                collapsedColStyle={collapsedColStyle}
                                tableRef={tableRef}
                                ResizeHandle={ResizeHandle}
                                setPredecessorModalTask={setPredecessorModalTask}
                                setResourceAllocationTask={setResourceAllocationTask}
                                crewPopoverItem={crewPopoverItem}
                                setCrewPopoverItem={setCrewPopoverItem}
                                formatDateDisplay={formatDateDisplay}
                                taskInsights={taskInsights}
                                onToggleColumn={handleToggleColumn}
                                visibleSummaryLevels={tableVisibleLevels}
                                onToggleSummaryLevel={handleToggleTableLevel}
                            />



                        ) : (
                            <div className="overflow-x-auto min-h-[400px] bg-gray-50 flex flex-col" ref={ganttSidebarRef}>
                                {(() => {
                                    try {
                                        const minDate = new Date(schedule.startDate);
                                        const maxDate = timelineColumns.length > 0
                                            ? timelineColumns[timelineColumns.length - 1].date
                                            : minDate;

                                        const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                                        const scaleConfig = {
                                            day: { pxPerDay: 40 },
                                            week: { pxPerDay: 10 },
                                            month: { pxPerDay: 3 },
                                            year: { pxPerDay: 0.5 }
                                        };
                                        const { pxPerDay } = scaleConfig[timeScale];
                                        const totalWidth = Math.max(800, totalDays * pxPerDay + 200);

                                        if (timelineColumns.length === 0) return <div className="p-4 text-red-500">Erro ao gerar planejamento</div>;

                                        return (
                                            <ScheduleGantt
                                                hierarchy={hierarchy}
                                                schedule={schedule}
                                                timelineColumns={timelineColumns}
                                                minDate={minDate}
                                                totalWidth={totalWidth}
                                                pxPerDay={pxPerDay}
                                                sidebarWidth={sidebarWidth}
                                                expandedNodes={ganttExpandedNodes}
                                                toggleNode={toggleNode}
                                                getGanttSidebarTotal={getGanttSidebarTotal}
                                                visibleSummaryLevels={ganttVisibleLevels}
                                                onToggleSummaryLevel={handleToggleGanttLevel}
                                                getGanttColStyle={getGanttColStyle}
                                                collapsedCols={ganttCollapsedCols}
                                                onToggleColumn={handleToggleGanttColumn}
                                                handleSplitterDblClick={handleGanttSplitterDblClick}
                                                idToUid={idToUid}
                                                handleUpdatePredecessorField={handleUpdatePredecessorField}
                                                handleUpdateCrewField={handleUpdateCrewField}
                                                handleUpdateItemSchedule={handleUpdateItemSchedule}
                                                handleGanttBarMouseDown={handleGanttBarMouseDown}
                                                crewPopoverItem={crewPopoverItem}
                                                crewPopoverPos={crewPopoverPos}
                                                setCrewPopoverItem={setCrewPopoverItem}
                                                setCrewPopoverPos={setCrewPopoverPos}
                                                getPhotosForItem={getPhotosForItem}
                                                setViewingTaskPhotos={setViewingTaskPhotos}
                                                isSimulationMode={isSimulationMode}
                                                isDraggingTask={isDraggingTask}
                                                budget={budget}
                                                SchedulingEngine={SchedulingEngine}
                                                taskInsights={taskInsights}
                                                handleUpdateRealPct={handleUpdateRealPct}
                                            />
                                        );
                                    } catch (err) {
                                        console.error('Error rendering Gantt:', err);
                                        return <div className="p-4 text-red-500 font-bold bg-white m-4 p-4 rounded-xl shadow-sm border border-red-100">Erro ao renderizar gráfico Gantt. Verifique o console.</div>;
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Predecessor Modal */}
            {predecessorModalTask && (
                <PredecessorModal
                    taskId={predecessorModalTask}
                    hierarchy={hierarchy}
                    idToUid={idToUid}
                    predecessors={schedule.itemSchedules?.find(s => s.id === predecessorModalTask)?.predecessors || []}
                    onClose={() => setPredecessorModalTask(null)}
                    onUpdate={(newPreds: Predecessor[]) => predecessorModalTask && handleUpdateItemSchedule(predecessorModalTask, 'predecessors' as any, newPreds as any)}
                />
            )}

            {viewingTaskPhotos && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setViewingTaskPhotos(null)}>
                    <div className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-50 rounded-2xl">
                                    <Camera className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 leading-tight">{viewingTaskPhotos.name}</h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Evidências Visuais do Diário de Obra • {viewingTaskPhotos.photos.length} Itens</p>
                                </div>
                            </div>
                            <button onClick={() => setViewingTaskPhotos(null)} className="p-3 hover:bg-gray-100 rounded-2xl transition-colors">
                                <X className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {viewingTaskPhotos.photos.map((photo, idx) => (
                                    <div key={idx} className="group relative aspect-[4/3] bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
                                        <img src={photo} alt={`Progresso ${idx + 1} `} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex justify-between items-end">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const link = document.createElement('a');
                                                    link.href = photo;
                                                    link.download = `foto_obra_${viewingTaskPhotos.id}_${idx}.jpg`;
                                                    link.click();
                                                }}
                                                className="p-2.5 bg-white/20 hover:bg-white/40 backdrop-blur-md text-white rounded-xl transition-all"
                                                title="Download da Foto"
                                            >
                                                <FileDown className="w-5 h-5" />
                                            </button>
                                            <div className="text-right">
                                                <span className="block text-[10px] font-black text-white/60 uppercase tracking-widest">Foto #{idx + 1}</span>
                                                <span className="text-xs font-bold text-white">Ver em detalhes</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 flex justify-center">
                            <button onClick={() => setViewingTaskPhotos(null)} className="px-10 py-3 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg active:scale-95">
                                FECHAR GALERIA
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {resourceAllocationTask && (
                <ResourceAllocationModal
                    taskId={resourceAllocationTask}
                    schedule={schedule}
                    allocationType={allocationType}
                    setAllocationType={setAllocationType}
                    onClose={() => setResourceAllocationTask(null)}
                    onUpdateAllocation={handleUpdateAllocation}
                />
            )}

            {levelingIssues && (
                <LevelingDecisionModal
                    issues={levelingIssues}
                    onClose={() => setLevelingIssues(null)}
                    onResolve={handleResolveLevelingIssues}
                />
            )}

            <BaselineModal
                isOpen={isBaselineModalOpen}
                onClose={() => setIsBaselineModalOpen(false)}
                baselines={schedule.baselines || []}
                onSave={handleSaveBaseline}
                onActivate={handleActivateBaseline}
                onDelete={handleDeleteBaseline}
                activeBaselineId={schedule.activeBaselineId}
            />

            <ConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                schedule={schedule}
                onUpdate={(updates) => {
                    const newSchedule = { ...schedule, ...updates };
                    setSchedule(newSchedule);
                    onUpdateSettings({ ...settings, schedule: newSchedule });
                    // Trigger recalculation if replan mode or working days changed
                    handleRecalculate(newSchedule.itemSchedules || []);
                }}
            />
        </div>
    );
};

