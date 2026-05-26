import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Filter, Loader2, Clock, PlayCircle, TrendingUp,
  Eye, CheckCircle2, XCircle, Lock, AlertTriangle, X,
  Calendar, GripVertical, User, ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { workOrderService } from '../services/workOrderService'
import { ALLOWED_TRANSITIONS } from '../types/operational-control'
import type { WorkOrderStatus, WorkOrderPriority } from '../types/operational-control'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkOrderRow {
  id: string
  code: string | null
  title: string
  phase: string | null
  type: string
  status: WorkOrderStatus
  priority: WorkOrderPriority
  planned_start_date: string | null
  planned_end_date: string | null
  completion_pct: number
  planned_cost: number | null
  actual_total_cost: number
  team_id: string | null
  team?: { name: string } | null
  responsible?: { name: string } | null
  non_conformances?: { status: string }[]
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, {
  label: string
  color: string
  headerBorder: string
  headerBg: string
  icon: React.ElementType
}> = {
  planned:            { label: 'Planejada',    color: 'bg-slate-100 text-slate-600',      headerBorder: 'border-slate-300', headerBg: 'bg-slate-50',    icon: Clock },
  released:           { label: 'Liberada',     color: 'bg-blue-100 text-blue-700',        headerBorder: 'border-blue-400',  headerBg: 'bg-blue-50',     icon: PlayCircle },
  in_progress:        { label: 'Em Execução',  color: 'bg-indigo-100 text-indigo-700',    headerBorder: 'border-indigo-400',headerBg: 'bg-indigo-50',   icon: TrendingUp },
  blocked:            { label: 'Bloqueada',    color: 'bg-red-100 text-red-700',          headerBorder: 'border-red-400',   headerBg: 'bg-red-50',      icon: Lock },
  pending_inspection: { label: 'Ag. Inspeção', color: 'bg-amber-100 text-amber-700',      headerBorder: 'border-amber-400', headerBg: 'bg-amber-50',    icon: Eye },
  approved:           { label: 'Aprovada',     color: 'bg-emerald-100 text-emerald-700',  headerBorder: 'border-emerald-400',headerBg: 'bg-emerald-50', icon: CheckCircle2 },
  rejected:           { label: 'Reprovada',    color: 'bg-red-100 text-red-700',          headerBorder: 'border-red-400',   headerBg: 'bg-red-50',      icon: XCircle },
  measured:           { label: 'Medida',       color: 'bg-violet-100 text-violet-700',    headerBorder: 'border-violet-400',headerBg: 'bg-violet-50',   icon: CheckCircle2 },
  closed:             { label: 'Encerrada',    color: 'bg-slate-100 text-slate-500',      headerBorder: 'border-slate-200', headerBg: 'bg-slate-50',    icon: CheckCircle2 },
}

const PRIORITY_DOT: Record<WorkOrderPriority, string> = {
  normal:   'bg-slate-300',
  high:     'bg-amber-400',
  critical: 'bg-red-500',
}

const COLUMN_ORDER: WorkOrderStatus[] = [
  'planned', 'released', 'in_progress', 'blocked',
  'pending_inspection', 'approved', 'rejected', 'measured', 'closed',
]

// ── Card ──────────────────────────────────────────────────────────────────────

const KanbanCard: React.FC<{
  wo: WorkOrderRow
  ghost?: boolean
  overlay?: boolean
  onViewDetail: (id: string) => void
}> = ({ wo, ghost, overlay, onViewDetail }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: wo.id })

  const isOverdue =
    !!wo.planned_end_date &&
    !['measured', 'closed'].includes(wo.status) &&
    new Date(wo.planned_end_date) < new Date()

  const openNCs = wo.non_conformances?.filter(nc => nc.status !== 'closed').length ?? 0

  const style: React.CSSProperties = overlay
    ? { transform: 'rotate(2deg)' }
    : { transform: CSS.Translate.toString(transform) }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm transition-shadow select-none
        ${ghost ? 'opacity-40' : ''}
        ${overlay ? 'shadow-2xl ring-2 ring-blue-300' : 'hover:shadow-md'}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 flex-shrink-0 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Content */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onViewDetail(wo.id)}
        >
          {wo.code && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              {wo.code}
            </p>
          )}

          <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
            {wo.title}
          </p>

          {wo.phase && (
            <p className="text-[10px] text-slate-400 mt-1 truncate">{wo.phase}</p>
          )}

          {/* Progress */}
          {wo.completion_pct > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">Progresso</span>
                <span className="text-[10px] font-bold text-slate-600">{wo.completion_pct}%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-1 bg-blue-500 rounded-full"
                  style={{ width: `${wo.completion_pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[wo.priority] ?? 'bg-slate-300'}`} />
              {wo.responsible?.name && (
                <div className="flex items-center gap-1 min-w-0">
                  <User className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  <span className="text-[10px] text-slate-400 truncate">
                    {wo.responsible.name.split(' ')[0]}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {openNCs > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
                  <AlertTriangle className="w-3 h-3" />
                  {openNCs}
                </span>
              )}
              {isOverdue ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
                  <Calendar className="w-3 h-3" />
                  Atr.
                </span>
              ) : wo.planned_end_date ? (
                <span className="text-[10px] text-slate-400">
                  {new Date(wo.planned_end_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

const KanbanColumn: React.FC<{
  status: WorkOrderStatus
  cards: WorkOrderRow[]
  isOver: boolean
  canReceive: boolean
  activeId: string | null
  onViewDetail: (id: string) => void
}> = ({ status, cards, isOver, canReceive, activeId, onViewDetail }) => {
  const { setNodeRef } = useDroppable({ id: status })
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon

  return (
    <div className="flex-shrink-0 w-68 flex flex-col" style={{ width: '272px' }}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b-2 ${cfg.headerBorder} ${cfg.headerBg}`}>
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-current opacity-70" />
          <span className="text-xs font-black uppercase tracking-widest">{cfg.label}</span>
        </div>
        <span className="text-xs font-bold bg-white/70 rounded-full px-2 py-0.5 text-slate-600">
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl min-h-[120px] transition-colors
          ${isOver && canReceive ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''}
          ${isOver && !canReceive ? 'bg-red-50 ring-2 ring-red-200 ring-inset' : ''}
          ${!isOver ? 'bg-slate-50/60' : ''}`}
        style={{ maxHeight: 'calc(100vh - 280px)' }}
      >
        {cards.map(wo => (
          <KanbanCard
            key={wo.id}
            wo={wo}
            ghost={activeId === wo.id}
            onViewDetail={onViewDetail}
          />
        ))}

        {cards.length === 0 && (
          <div className={`flex items-center justify-center rounded-xl border-2 border-dashed py-8 transition-colors
            ${isOver && canReceive ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200'}`}>
            <span className="text-xs text-slate-300 font-medium">
              {isOver && canReceive ? 'Soltar aqui' : 'Vazio'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  orgId: string
  onViewDetail: (id: string) => void
  onCreateNew: () => void
}

const OperacionalKanban: React.FC<Props> = ({
  projectId,
  onViewDetail,
  onCreateNew,
}) => {
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<WorkOrderStatus | null>(null)

  const [phaseFilter, setPhaseFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id, code, title, phase, type, status, priority,
          planned_start_date, planned_end_date,
          completion_pct, planned_cost, actual_total_cost, team_id,
          team:labor_teams(name),
          responsible:employees(name),
          non_conformances(status)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (!cancelled && !error && data) {
        setWorkOrders(data as unknown as WorkOrderRow[])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const phases = useMemo(() => {
    const set = new Set(workOrders.map(wo => wo.phase).filter(Boolean) as string[])
    return [...set].sort()
  }, [workOrders])

  const filtered = useMemo(() =>
    workOrders.filter(wo => {
      if (phaseFilter !== 'all' && wo.phase !== phaseFilter) return false
      if (priorityFilter !== 'all' && wo.priority !== priorityFilter) return false
      return true
    }),
    [workOrders, phaseFilter, priorityFilter],
  )

  const byStatus = useMemo(() => {
    const map = {} as Record<WorkOrderStatus, WorkOrderRow[]>
    COLUMN_ORDER.forEach(s => { map[s] = [] })
    filtered.forEach(wo => { map[wo.status]?.push(wo) })
    return map
  }, [filtered])

  const activeWO = useMemo(() => workOrders.find(w => w.id === activeId), [workOrders, activeId])

  const canReceive = useMemo(() => {
    if (!activeWO || !overId) return false
    return ALLOWED_TRANSITIONS[activeWO.status].includes(overId)
  }, [activeWO, overId])

  // ── DnD handlers ─────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    setOverId((e.over?.id as WorkOrderStatus) ?? null)
  }, [])

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    const draggedId = e.active.id as string
    const targetStatus = e.over?.id as WorkOrderStatus | undefined

    setActiveId(null)
    setOverId(null)

    if (!targetStatus) return

    const wo = workOrders.find(w => w.id === draggedId)
    if (!wo || wo.status === targetStatus) return
    if (!ALLOWED_TRANSITIONS[wo.status].includes(targetStatus)) return

    // Optimistic
    setWorkOrders(prev => prev.map(w => w.id === draggedId ? { ...w, status: targetStatus } : w))
    setTransitionError(null)

    try {
      await workOrderService.transition(draggedId, targetStatus)
    } catch (e) {
      // Revert and show error
      setWorkOrders(prev => prev.map(w => w.id === draggedId ? { ...w, status: wo.status } : w))
      setTransitionError(e instanceof Error ? e.message : 'Erro na transição')
      setTimeout(() => setTransitionError(null), 6000)
    }
  }, [workOrders])

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Transition error toast */}
      {transitionError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm font-bold text-red-700 flex-1">{transitionError}</p>
          <button onClick={() => setTransitionError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <select
            value={phaseFilter}
            onChange={e => setPhaseFilter(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-transparent outline-none pr-1 cursor-pointer"
          >
            <option value="all">Todas as etapas</option>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-transparent outline-none pr-1 cursor-pointer"
          >
            <option value="all">Todas as prioridades</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </div>

        <div className="ml-auto">
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova OE
          </button>
        </div>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMN_ORDER.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              cards={byStatus[status]}
              isOver={overId === status}
              canReceive={canReceive}
              activeId={activeId}
              onViewDetail={onViewDetail}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeWO ? (
            <KanbanCard
              wo={activeWO}
              overlay
              onViewDetail={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

export default OperacionalKanban
