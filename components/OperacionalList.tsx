import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus, Search, Filter, AlertTriangle, AlertCircle,
  Clock, CheckCircle2, XCircle, Loader2, ChevronDown,
  Lock, PlayCircle, Eye, ArrowRight, MoreVertical,
  TrendingUp, DollarSign, Zap, ClipboardList,
  LayoutGrid, List
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WorkOrderStatus, WorkOrderPriority } from '../types/operational-control'
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils'
import Button from './ui/Button'

const OPERACIONAL_COLUMNS: ColumnConfig[] = [
  { key: 'title', label: 'Código / Título', sortable: true },
  { key: 'phase', label: 'Etapa', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'deadline', label: 'Prazo', sortable: true },
  { key: 'progress', label: 'Avanço', sortable: true },
  { key: 'cost', label: 'Custo Real', sortable: true },
  { key: 'actions', label: '', sortable: false },
]

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

interface Props {
  projectId: string
  orgId: string
  onViewDetail: (id: string) => void
  onCreateNew: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  planned:             { label: 'Planejada',           color: 'bg-slate-100 text-slate-600',    icon: Clock },
  released:            { label: 'Liberada',            color: 'bg-blue-100 text-blue-700',      icon: PlayCircle },
  in_progress:         { label: 'Em Execução',         color: 'bg-indigo-100 text-indigo-700',  icon: TrendingUp },
  pending_inspection:  { label: 'Ag. Inspeção',        color: 'bg-amber-100 text-amber-700',    icon: Eye },
  approved:            { label: 'Aprovada',            color: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2 },
  rejected:            { label: 'Reprovada',           color: 'bg-red-100 text-red-700',        icon: XCircle },
  measured:            { label: 'Medida',              color: 'bg-violet-100 text-violet-700',  icon: CheckCircle2 },
  closed:              { label: 'Encerrada',           color: 'bg-slate-100 text-slate-500',    icon: CheckCircle2 },
  blocked:             { label: 'Bloqueada',           color: 'bg-red-100 text-red-700',        icon: Lock },
}

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; color: string }> = {
  normal:   { label: 'Normal',   color: 'text-slate-400' },
  high:     { label: 'Alta',     color: 'text-amber-500' },
  critical: { label: 'Crítica',  color: 'text-red-600' },
}

function isOverdue(wo: WorkOrderRow) {
  if (!wo.planned_end_date) return false
  if (['measured', 'closed'].includes(wo.status)) return false
  return new Date(wo.planned_end_date) < new Date()
}

function fmtCurrency(v: number | null) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: WorkOrderStatus }> = ({ status }) => {
  const { label, color } = STATUS_CONFIG[status] ?? STATUS_CONFIG.planned
  
  // Convert basic color classes (bg-blue-100 text-blue-700) to standard border config
  // For standard badge: we need bg-color-50, text-color-700, border-color-200
  let badgeColor = color;
  if (color.includes('bg-slate-100')) {
    badgeColor = 'bg-gray-50 text-gray-600 border-gray-200';
  } else if (color.includes('bg-blue-100')) {
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (color.includes('bg-indigo-100')) {
    badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  } else if (color.includes('bg-amber-100')) {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (color.includes('bg-emerald-100')) {
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (color.includes('bg-red-100')) {
    badgeColor = 'bg-red-50 text-red-700 border-red-200';
  } else if (color.includes('bg-violet-100')) {
    badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${badgeColor}`}>
      {label}
    </span>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 95 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
    <span className="text-xs font-black text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
  </div>
)

// ── Filter bar ────────────────────────────────────────────────────────────────
const STATUS_FILTERS: Array<{ value: WorkOrderStatus | 'all'; label: string }> = [
  { value: 'all',                label: 'Todos' },
  { value: 'planned',            label: 'Planejada' },
  { value: 'released',           label: 'Liberada' },
  { value: 'in_progress',        label: 'Em Execução' },
  { value: 'pending_inspection', label: 'Ag. Inspeção' },
  { value: 'approved',           label: 'Aprovada' },
  { value: 'blocked',            label: 'Bloqueada' },
  { value: 'closed',             label: 'Encerrada' },
]

// ── Component ─────────────────────────────────────────────────────────────────
const OperacionalList: React.FC<Props> = ({ projectId, orgId, onViewDetail, onCreateNew }) => {
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // F2: filtros sobrevivem a navegação/reload.
  const [search, setSearch] = usePersistedState('operacionalListFilters:search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<WorkOrderStatus | 'all'>('operacionalListFilters:status', 'all')
  const [phaseFilter, setPhaseFilter] = usePersistedState<string>('operacionalListFilters:phase', 'all')
  const [overdueOnly, setOverdueOnly] = usePersistedState('operacionalListFilters:overdueOnly', false)
  const [viewMode, setViewMode] = usePersistedState<'cards' | 'list'>('operacionalListFilters:viewMode', 'cards')
  const tableColumns = useTableColumns(OPERACIONAL_COLUMNS, 'operacionalListColumns')

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('work_orders')
        .select(`
          id, code, title, phase, type, status, priority,
          planned_start_date, planned_end_date,
          completion_pct, planned_cost, actual_total_cost,
          team_id,
          team:labor_teams(name),
          responsible:employees(name),
          non_conformances(status)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (err) throw err
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setWorkOrders((data ?? []) as unknown as WorkOrderRow[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar ordens')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  const phases = useMemo(() => {
    const set = new Set(workOrders.map(w => w.phase).filter(Boolean))
    return Array.from(set) as string[]
  }, [workOrders])

  const filtered = useMemo(() => {
    const list = workOrders.filter(wo => {
      if (statusFilter !== 'all' && wo.status !== statusFilter) return false
      if (phaseFilter !== 'all' && wo.phase !== phaseFilter) return false
      if (overdueOnly && !isOverdue(wo)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!wo.title.toLowerCase().includes(q) && !(wo.code ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    if (!tableColumns.sortColumn) return list
    return [...list].sort((a, b) => {
      const dir = tableColumns.sortDirection === 'asc' ? 1 : -1
      switch (tableColumns.sortColumn) {
        case 'title': return dir * a.title.localeCompare(b.title)
        case 'phase': return dir * ((a.phase ?? '').localeCompare(b.phase ?? ''))
        case 'status': return dir * a.status.localeCompare(b.status)
        case 'deadline': return dir * ((a.planned_end_date ?? '').localeCompare(b.planned_end_date ?? ''))
        case 'progress': return dir * (a.completion_pct - b.completion_pct)
        case 'cost': return dir * ((a.actual_total_cost ?? 0) - (b.actual_total_cost ?? 0))
        default: return 0
      }
    })
  }, [workOrders, statusFilter, phaseFilter, overdueOnly, search, tableColumns.sortColumn, tableColumns.sortDirection])

  // KPIs do topo
  const kpis = useMemo(() => ({
    total: workOrders.length,
    inProgress: workOrders.filter(w => w.status === 'in_progress').length,
    overdue: workOrders.filter(isOverdue).length,
    blocked: workOrders.filter(w => w.status === 'blocked').length,
    totalPlanned: workOrders.reduce((s, w) => s + (w.planned_cost ?? 0), 0),
    totalActual: workOrders.reduce((s, w) => s + (w.actual_total_cost ?? 0), 0),
    avgPct: workOrders.length
      ? workOrders.reduce((s, w) => s + w.completion_pct, 0) / workOrders.length
      : 0,
  }), [workOrders])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <AlertCircle className="w-10 h-10 mb-2" />
        <p className="font-bold">{error}</p>
        <button onClick={load} className="mt-3 px-4 py-2 bg-red-50 rounded-lg text-sm font-bold hover:bg-red-100">
          Tentar novamente
        </button>
      </div>
    )
  }

const COLOR_MAP: Record<string, { border: string, bg: string, text: string, dot: string }> = {
  blue: { border: 'hover:border-blue-100', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  emerald: { border: 'hover:border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  amber: { border: 'hover:border-amber-100', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
  red: { border: 'hover:border-red-100', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  gray: { border: 'hover:border-gray-100', bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-500' },
  indigo: { border: 'hover:border-indigo-100', bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-500' },
};

const StatCard: React.FC<{ title: string, value: string | number, subtext?: string, icon: React.ElementType, color: string }> = ({ title, value, subtext, icon: Icon, color }) => {
  const theme = COLOR_MAP[color] || COLOR_MAP.gray;
  return (
    <div className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg transition-all ${theme.border}`}>
      <div className={`p-3.5 ${theme.bg} ${theme.text} rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 ${theme.dot} rounded-full shrink-0`}></span>
          <p className="text-xs text-gray-400 font-medium truncate">{subtext}</p>
        </div>
      </div>
    </div>
  );
};

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <StatCard title="Total" value={kpis.total} subtext="Ordens de execução" icon={ClipboardList} color="blue" />
        <StatCard title="Em Execução" value={kpis.inProgress} subtext="Ativas" icon={TrendingUp} color="indigo" />
        <StatCard title="Atrasadas" value={kpis.overdue} subtext={`${kpis.blocked} bloqueadas`} icon={AlertTriangle} color={kpis.overdue > 0 ? "red" : "gray"} />
        <StatCard title="Custo Realizado" value={fmtCurrency(kpis.totalActual)} subtext={`de ${fmtCurrency(kpis.totalPlanned)}`} icon={DollarSign} color="emerald" />
      </div>

      {/* Toolbar */}
      <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center mb-6">
        <div className="relative flex-1 w-full group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Buscar por código ou título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {phases.length > 0 && (
            <select
              value={phaseFilter}
              onChange={e => setPhaseFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border-2 border-gray-100 rounded-[1.25rem] text-sm text-gray-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">Todas as etapas</option>
              {phases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <button
            onClick={() => setOverdueOnly(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[1.25rem] text-xs font-bold uppercase tracking-widest border-2 transition-all shadow-sm ${
              overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-100 hover:border-red-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Atrasadas</span>
          </button>

          {/* View mode toggle */}
          <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm gap-1.5 shrink-0">
            <button
              onClick={() => setViewMode('cards')}
              title="Visualização em cards"
              className={`p-2.5 rounded-xl transition-all ${
                viewMode === 'cards' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Visualização em linha"
              className={`p-2.5 rounded-xl transition-all ${
                viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {viewMode === 'list' && (
            <ColumnConfigButton
              columns={OPERACIONAL_COLUMNS}
              visibleColumns={tableColumns.visibleColumns}
              showColumnConfig={tableColumns.showColumnConfig}
              onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
              onToggleColumn={tableColumns.toggleColumn}
              onReset={tableColumns.resetColumns}
            />
          )}

          <Button
            onClick={onCreateNew}
            className="rounded-[1.25rem] shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova OE</span>
          </Button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
        {STATUS_FILTERS.map(f => {
          const count = f.value === 'all'
            ? workOrders.length
            : workOrders.filter(w => w.status === f.value).length
          if (count === 0 && f.value !== 'all') return null
          
          const isActive = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex items-center gap-2 px-4 py-4 rounded-[1.25rem] transition-all active:scale-95 shadow-sm text-sm font-semibold uppercase tracking-wider whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white'
              }`}
            >
              {f.label}
              <span className={`ml-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                isActive ? 'bg-white/20' : 'bg-blue-100 text-blue-700 group-hover:bg-blue-400'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* List / Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 h-48">
          <ClipboardList className="w-10 h-10 text-slate-200 mb-2" />
          <p className="text-slate-400 font-bold">Nenhuma ordem encontrada</p>
          {workOrders.length === 0 && (
            <Button
              onClick={onCreateNew}
              className="mt-3"
            >
              <Plus className="w-3 h-3" />
              Criar primeira OE
            </Button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* ── Cards view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(wo => {
            const overdue = isOverdue(wo)
            const openNcs = (wo.non_conformances ?? []).filter(nc => nc.status !== 'closed').length
            const { color: pColor } = PRIORITY_CONFIG[wo.priority] ?? PRIORITY_CONFIG.normal

            return (
              <div
                key={wo.id}
                onClick={() => onViewDetail(wo.id)}
                className={`bg-white rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] flex flex-col gap-3 p-4 ${
                  overdue ? 'border-red-200 bg-red-50/20' : 'border-slate-100'
                }`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {wo.code && (
                      <span className="text-xs font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {wo.code}
                      </span>
                    )}
                    {openNcs > 0 && (
                      <span className="text-xs font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        {openNcs} NC
                      </span>
                    )}
                  </div>
                  <Zap className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${pColor}`} />
                </div>

                {/* Title */}
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{wo.title}</p>
                  {wo.phase && (
                    <p className="text-xs font-medium text-slate-400 mt-0.5">{wo.phase}</p>
                  )}
                </div>

                {/* Progress */}
                <ProgressBar pct={wo.completion_pct} />

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50">
                  <StatusBadge status={wo.status} />
                  <div className={`flex items-center gap-1 text-xs font-bold ${overdue ? 'text-red-600' : 'text-slate-400'}`}>
                    {overdue && <AlertTriangle className="w-3 h-3" />}
                    <Clock className="w-3 h-3" />
                    {fmtDate(wo.planned_end_date)}
                  </div>
                </div>

                {(wo.team || wo.actual_total_cost > 0) && (
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium -mt-1">
                    <span>{wo.team ? (wo.team as { name: string }).name : ''}</span>
                    <span className="font-bold text-slate-600">{fmtCurrency(wo.actual_total_cost)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── List/inline view ── */
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                  {tableColumns.visibleColumns.includes('title') && (
                    <SortableHeader label="Código / Título" colKey="title" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('phase') && (
                    <SortableHeader label="Etapa" colKey="phase" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 hidden md:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('status') && (
                    <SortableHeader label="Status" colKey="status" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('deadline') && (
                    <SortableHeader label="Prazo" colKey="deadline" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 hidden lg:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('progress') && (
                    <SortableHeader label="Avanço" colKey="progress" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 hidden lg:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('cost') && (
                    <SortableHeader label="Custo Real" colKey="cost" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 hidden xl:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-right">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(wo => {
                  const overdue = isOverdue(wo)
                  const openNcs = (wo.non_conformances ?? []).filter(nc => nc.status !== 'closed').length
                  const { color: pColor } = PRIORITY_CONFIG[wo.priority] ?? PRIORITY_CONFIG.normal

                  return (
                    <tr
                      key={wo.id}
                      onClick={() => onViewDetail(wo.id)}
                      className={`group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer ${overdue ? 'bg-red-50/10' : ''}`}
                    >
                      {tableColumns.visibleColumns.includes('title') && (
                        <td className="px-6 py-2.5 border-r border-gray-100">
                          <div className="flex items-start gap-2">
                            <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${pColor}`} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                {wo.code && (
                                  <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {wo.code}
                                  </span>
                                )}
                                {openNcs > 0 && (
                                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                                    {openNcs} NC
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-normal text-gray-700 mt-0.5 leading-snug line-clamp-1">{wo.title}</p>
                              {wo.team && (
                                <p className="text-[11px] text-gray-400 font-medium">{(wo.team as { name: string }).name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('phase') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 hidden md:table-cell">
                          <span className="text-sm font-normal text-gray-600">{wo.phase ?? '—'}</span>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('status') && (
                        <td className="px-6 py-2.5 border-r border-gray-100">
                          <StatusBadge status={wo.status} />
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('deadline') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 hidden lg:table-cell">
                          <div className={`text-sm ${overdue ? 'font-medium text-red-600' : 'font-normal text-gray-700'}`}>
                            {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                            {fmtDate(wo.planned_end_date)}
                          </div>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('progress') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 hidden lg:table-cell w-32">
                          <ProgressBar pct={wo.completion_pct} />
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('cost') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 hidden xl:table-cell">
                          <span className="text-sm font-medium text-gray-800">{fmtCurrency(wo.actual_total_cost)}</span>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('actions') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                          <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default OperacionalList
