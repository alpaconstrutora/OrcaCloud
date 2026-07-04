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
  const { label, color, icon: Icon } = STATUS_CONFIG[status] ?? STATUS_CONFIG.planned
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${color}`}>
      <Icon className="w-3 h-3" />
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

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Em Execução</p>
          <p className="text-3xl font-black text-indigo-600 mt-1">{kpis.inProgress}</p>
          <p className="text-xs text-slate-400 mt-1">{kpis.total} total</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Atrasadas</p>
          <p className={`text-3xl font-black mt-1 ${kpis.overdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>{kpis.overdue}</p>
          <p className="text-xs text-slate-400 mt-1">{kpis.blocked} bloqueadas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Avanço Médio</p>
          <p className="text-3xl font-black text-blue-600 mt-1">{kpis.avgPct.toFixed(0)}%</p>
          <div className="mt-2"><ProgressBar pct={kpis.avgPct} /></div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Custo Realizado</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{fmtCurrency(kpis.totalActual)}</p>
          <p className="text-xs text-slate-400 mt-1">de {fmtCurrency(kpis.totalPlanned)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código ou título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {phases.length > 0 && (
          <select
            value={phaseFilter}
            onChange={e => setPhaseFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todas as etapas</option>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        <button
          onClick={() => setOverdueOnly(v => !v)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-form-input font-black uppercase tracking-widest border transition-all ${
            overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200 hover:border-red-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Atrasadas
        </button>

        {/* View mode toggle */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('cards')}
            title="Visualização em cards"
            className={`flex items-center gap-1.5 px-3 py-2.5 text-button font-black transition-all ${
              viewMode === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="Visualização em linha"
            className={`flex items-center gap-1.5 px-3 py-2.5 text-button font-black transition-all border-l border-slate-200 ${
              viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
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
        >
          <Plus className="w-4 h-4" />
          Nova OE
        </Button>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_FILTERS.map(f => {
          const count = f.value === 'all'
            ? workOrders.length
            : workOrders.filter(w => w.status === f.value).length
          if (count === 0 && f.value !== 'all') return null
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-button font-black uppercase tracking-widest transition-all border ${
                statusFilter === f.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] ${
                statusFilter === f.value ? 'bg-white/20' : 'bg-slate-100'
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
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {tableColumns.visibleColumns.includes('title') && (
                    <SortableHeader label="Código / Título" colKey="title" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3" />
                  )}
                  {tableColumns.visibleColumns.includes('phase') && (
                    <SortableHeader label="Etapa" colKey="phase" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3 hidden md:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('status') && (
                    <SortableHeader label="Status" colKey="status" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3" />
                  )}
                  {tableColumns.visibleColumns.includes('deadline') && (
                    <SortableHeader label="Prazo" colKey="deadline" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3 hidden lg:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('progress') && (
                    <SortableHeader label="Avanço" colKey="progress" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3 hidden lg:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('cost') && (
                    <SortableHeader label="Custo Real" colKey="cost" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3 hidden xl:table-cell" />
                  )}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-4 py-3" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(wo => {
                  const overdue = isOverdue(wo)
                  const openNcs = (wo.non_conformances ?? []).filter(nc => nc.status !== 'closed').length
                  const { color: pColor } = PRIORITY_CONFIG[wo.priority] ?? PRIORITY_CONFIG.normal

                  return (
                    <tr
                      key={wo.id}
                      onClick={() => onViewDetail(wo.id)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${overdue ? 'bg-red-50/30' : ''}`}
                    >
                      {tableColumns.visibleColumns.includes('title') && (
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${pColor}`} />
                            <div>
                              <div className="flex items-center gap-1.5">
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
                              <p className="text-sm font-bold text-slate-900 mt-0.5 leading-snug line-clamp-1">{wo.title}</p>
                              {wo.team && (
                                <p className="text-xs text-slate-400 font-medium">{(wo.team as { name: string }).name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('phase') && (
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-slate-500 font-medium">{wo.phase ?? '—'}</span>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('status') && (
                        <td className="px-4 py-3">
                          <StatusBadge status={wo.status} />
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('deadline') && (
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className={`text-table-body font-bold ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                            {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                            {fmtDate(wo.planned_end_date)}
                          </div>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('progress') && (
                        <td className="px-4 py-3 hidden lg:table-cell w-32">
                          <ProgressBar pct={wo.completion_pct} />
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('cost') && (
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs font-bold text-slate-700">{fmtCurrency(wo.actual_total_cost)}</span>
                        </td>
                      )}
                      {tableColumns.visibleColumns.includes('actions') && (
                        <td className="px-4 py-3">
                          <ArrowRight className="w-4 h-4 text-slate-300" />
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
