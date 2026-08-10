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
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils'
import Button from './ui/Button'
import { KpiCard } from './ui/KpiCard'

const OPERACIONAL_COLUMNS: ColumnConfig[] = [
  { key: 'title', label: 'Código / Título', sortable: true },
  { key: 'phase', label: 'Etapa', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'deadline', label: 'Prazo', sortable: true },
  { key: 'progress', label: 'Avanço', sortable: true },
  { key: 'cost', label: 'Custo Real', sortable: true },
  { key: 'actions', label: '', sortable: false },
]

// Metadados de header/célula por coluna — usados para renderizar thead/tbody a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de uma
// sequência fixa de JSX. 'actions' é estrutural (fixo, fora do drag) e não entra aqui.
const OPERACIONAL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string; tdClassName: string }> = {
  title:    { label: 'Código / Título', className: 'px-6 py-2 border-r border-gray-100',                    tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  phase:    { label: 'Etapa',           className: 'px-6 py-2 border-r border-gray-100 hidden md:table-cell', tdClassName: 'px-6 py-2.5 border-r border-gray-100 hidden md:table-cell' },
  status:   { label: 'Status',          className: 'px-6 py-2 border-r border-gray-100',                    tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  deadline: { label: 'Prazo',           className: 'px-6 py-2 border-r border-gray-100 hidden lg:table-cell', tdClassName: 'px-6 py-2.5 border-r border-gray-100 hidden lg:table-cell' },
  progress: { label: 'Avanço',          className: 'px-6 py-2 border-r border-gray-100 hidden lg:table-cell', tdClassName: 'px-6 py-2.5 border-r border-gray-100 hidden lg:table-cell w-32' },
  cost:     { label: 'Custo Real',      className: 'px-6 py-2 border-r border-gray-100 hidden xl:table-cell', tdClassName: 'px-6 py-2.5 border-r border-gray-100 hidden xl:table-cell' },
}

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

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa
// busca/status/etapa já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'title', label: 'Título', type: 'text' },
  { key: 'code', label: 'Código', type: 'text' },
  { key: 'phase', label: 'Etapa', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label })) },
  { key: 'priority', label: 'Prioridade', type: 'select', options: Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label })) },
  { key: 'progress', label: 'Avanço (%)', type: 'number' },
  { key: 'cost', label: 'Custo Real', type: 'number' },
  { key: 'deadline', label: 'Prazo', type: 'date' },
]

function getAdvancedFilterValue(wo: WorkOrderRow, key: string): unknown {
  switch (key) {
    case 'title': return wo.title ?? ''
    case 'code': return wo.code ?? ''
    case 'phase': return wo.phase ?? ''
    case 'status': return wo.status
    case 'priority': return wo.priority
    case 'progress': return wo.completion_pct ?? null
    case 'cost': return wo.actual_total_cost ?? null
    case 'deadline': return wo.planned_end_date ?? null
    default: return null
  }
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
  
  // Extrai apenas a cor de texto (ex: text-blue-700) ignorando bg-*
  const textColor = color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-600'

  return (
    <span className={`text-sm font-normal ${textColor}`}>
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

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderOperacionalCell(key: string, wo: WorkOrderRow, ctx: { overdue: boolean; openNcs: number; pColor: string }): React.ReactNode {
  switch (key) {
    case 'title':
      return (
        <div className="flex items-start gap-2">
          <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${ctx.pColor}`} />
          <div>
            <div className="flex items-center gap-1.5">
              {wo.code && (
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {wo.code}
                </span>
              )}
              {ctx.openNcs > 0 && (
                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                  {ctx.openNcs} NC
                </span>
              )}
            </div>
            <p className="text-sm font-normal text-gray-700 mt-0.5 leading-snug line-clamp-1">{wo.title}</p>
            {wo.team && (
              <p className="text-[11px] text-gray-400 font-medium">{(wo.team as { name: string }).name}</p>
            )}
          </div>
        </div>
      )
    case 'phase':
      return <span className="text-sm font-normal text-gray-600">{wo.phase ?? '—'}</span>
    case 'status':
      return <StatusBadge status={wo.status} />
    case 'deadline':
      return (
        <div className={`text-sm ${ctx.overdue ? 'font-medium text-red-600' : 'font-normal text-gray-700'}`}>
          {ctx.overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {fmtDate(wo.planned_end_date)}
        </div>
      )
    case 'progress':
      return <ProgressBar pct={wo.completion_pct} />
    case 'cost':
      return <span className="text-sm font-medium text-gray-800">{fmtCurrency(wo.actual_total_cost)}</span>
    default:
      return null
  }
}

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
  const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'operacionalListFilters:advanced')

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
    let list = workOrders.filter(wo => {
      if (statusFilter !== 'all' && wo.status !== statusFilter) return false
      if (phaseFilter !== 'all' && wo.phase !== phaseFilter) return false
      if (overdueOnly && !isOverdue(wo)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!wo.title.toLowerCase().includes(q) && !(wo.code ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    list = applyFilterRules(list, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue)
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
  }, [workOrders, statusFilter, phaseFilter, overdueOnly, search, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection])

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3 animate-in fade-in slide-in-from-top-4 duration-700">
        <KpiCard label="Total" value={kpis.total} sub="Ordens de execução" icon={<ClipboardList className="w-5 h-5" />} color="blue" />
        <KpiCard label="Em Execução" value={kpis.inProgress} sub="Ativas" icon={<TrendingUp className="w-5 h-5" />} color="indigo" />
        <KpiCard label="Atrasadas" value={kpis.overdue} sub={`${kpis.blocked} bloqueadas`} icon={<AlertTriangle className="w-5 h-5" />} color={kpis.overdue > 0 ? "red" : "gray"} />
        <KpiCard label="Custo Realizado" value={fmtCurrency(kpis.totalActual)} sub={`de ${fmtCurrency(kpis.totalPlanned)}`} icon={<DollarSign className="w-5 h-5" />} color="emerald" />
      </div>

      {/* Toolbar - Variante desaninhada compacta */}
      <div className="flex flex-col md:flex-row gap-2.5 items-center mb-6">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Buscar por código ou título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {phases.length > 0 && (
            <select
              value={phaseFilter}
              onChange={e => setPhaseFilter(e.target.value)}
              className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">Todas as etapas</option>
              {phases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <button
            onClick={() => setOverdueOnly(v => !v)}
            className={`flex items-center justify-center h-9 px-3 rounded-[6px] text-xs font-semibold uppercase tracking-widest border transition-all shadow-sm ${
              overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Atrasadas</span>
          </button>

          <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />

          <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0 mx-1"></div>

          {/* View mode toggle & column config */}
          <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
            {viewMode === 'list' && (
              <>
                <ColumnConfigButton
                  columns={OPERACIONAL_COLUMNS}
                  visibleColumns={tableColumns.visibleColumns}
                  showColumnConfig={tableColumns.showColumnConfig}
                  onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                  onToggleColumn={tableColumns.toggleColumn}
                  onReset={tableColumns.resetColumns}
                />
                <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
              </>
            )}
            <button
              onClick={() => setViewMode('cards')}
              title="Visualização em cards"
              className={`p-1.5 rounded-[6px] transition-all ${
                viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Visualização em linha"
              className={`p-1.5 rounded-[6px] transition-all ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0 mx-1"></div>

          <button
            onClick={onCreateNew}
            className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-[15px] h-[15px]" />
            <span className="hidden sm:inline">Nova OE</span>
          </button>
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
              className={`flex items-center gap-2 h-9 px-3.5 rounded-[6px] transition-all active:scale-95 shadow-sm text-sm font-medium whitespace-nowrap border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold ${
                isActive ? 'bg-white/20' : 'bg-blue-50 text-blue-700'
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
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                    const def = OPERACIONAL_COLUMN_HEADERS[key]
                    if (!def) return null
                    return (
                      <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                        sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                        onSort={tableColumns.handleColumnSort}
                        onMoveColumn={tableColumns.moveColumn}
                        className={def.className} />
                    )
                  })}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-right text-table-header font-semibold text-gray-500">Ações</th>
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
                      {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                        const def = OPERACIONAL_COLUMN_HEADERS[key]
                        if (!def) return null
                        return (
                          <td key={key} className={def.tdClassName}>
                            {renderOperacionalCell(key, wo, { overdue, openNcs, pColor })}
                          </td>
                        )
                      })}
                      {tableColumns.visibleColumns.includes('actions') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right w-[120px]">
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewDetail(wo.id) }}
                            className="inline-flex items-center justify-end gap-1.5 font-bold text-[13px] text-blue-600 hover:text-blue-700 transition-colors bg-blue-50/50 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 w-full"
                          >
                            Ver <ArrowRight className="w-3.5 h-3.5" />
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
