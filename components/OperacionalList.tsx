import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus, Search, AlertTriangle,
  Clock, CheckCircle2, XCircle,
  Lock, PlayCircle, Eye, RefreshCw, MoveHorizontal,
  TrendingUp, DollarSign, Zap, ClipboardList
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WorkOrderStatus, WorkOrderPriority } from '../types/operational-control'
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils'
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils'
import ActionIconButton from './ui/ActionIconButton'
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
// `hidden md/lg/xl:table-cell` foi removido de propósito: com §6.1 o <colgroup>
// tem um <col> por coluna visível, e esconder a célula por CSS (sem tirar o <col>)
// desalinha todas as colunas seguintes. Quem escolhe o que aparece é o
// ColumnConfigButton — o mesmo controle em qualquer largura de tela.
const OPERACIONAL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string; tdClassName: string }> = {
  title:    { label: 'Código / Título', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  phase:    { label: 'Etapa',           className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  status:   { label: 'Status',          className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  deadline: { label: 'Prazo',           className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  progress: { label: 'Avanço',          className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
  cost:     { label: 'Custo Real',      className: 'px-6 py-2 border-r border-gray-100 overflow-hidden', tdClassName: 'px-6 py-2.5 border-r border-gray-100' },
}

// §6.1 — larguras padrão; arrastar a borda do cabeçalho ajusta, duplo clique
// restaura, e o botão de auto-ajuste (§6.1.2) mede o conteúdo real.
// Larguras medidas na tela real (1440px → container útil ~1130): abaixo destes
// valores o rótulo "Custo Real" e a data "10 de jun." quebram em duas linhas.
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  title: 280, phase: 150, status: 130, deadline: 130, progress: 150, cost: 150, actions: 90,
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
  onEdit?: (id: string) => void
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

// Em KPI, zero é informação ("ainda não gastei nada"), não ausência de dado —
// o "—" de `fmtCurrency` fazia o card ler "Custo Realizado —, de —".
function fmtCurrencyKpi(v: number | null) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
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
          <div className="min-w-0 flex-1">
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
            {/* §6.1.2 — `truncate` só recorta em elemento block; `title` devolve o texto inteiro */}
            <p className="block truncate text-sm font-normal text-gray-700 mt-0.5 leading-snug" title={wo.title}>{wo.title}</p>
            {wo.team && (
              <p className="block truncate text-[11px] text-gray-400 font-medium" title={(wo.team as { name: string }).name}>{(wo.team as { name: string }).name}</p>
            )}
          </div>
        </div>
      )
    case 'phase':
      return <span className="block truncate text-sm font-normal text-gray-600" title={wo.phase ?? undefined}>{wo.phase ?? '—'}</span>
    case 'status':
      return <StatusBadge status={wo.status} />
    case 'deadline':
      return (
        <div className={`text-sm whitespace-nowrap ${ctx.overdue ? 'font-medium text-red-600' : 'font-normal text-gray-700'}`}>
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
const OperacionalList: React.FC<Props> = ({ projectId, orgId, onViewDetail, onCreateNew, onEdit }) => {
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // F2: filtros sobrevivem a navegação/reload.
  const [search, setSearch] = usePersistedState('operacionalListFilters:search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<WorkOrderStatus | 'all'>('operacionalListFilters:status', 'all')
  const [phaseFilter, setPhaseFilter] = usePersistedState<string>('operacionalListFilters:phase', 'all')
  const [overdueOnly, setOverdueOnly] = usePersistedState('operacionalListFilters:overdueOnly', false)
  const tableColumns = useTableColumns(OPERACIONAL_COLUMNS, 'operacionalListColumns')
  const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'operacionalListFilters:advanced')
  const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'operacionalListColWidths')

  // §6.1 — a largura do <table> é a SOMA exata das colunas visíveis. Com
  // table-layout:fixed + w-full o navegador redistribui a sobra e arrastar uma
  // borda passa a redimensionar a coluna vizinha errada.
  const tableTotalWidth = tableColumns.orderedVisibleColumns
    .reduce((sum, key) => sum + cols.getWidth(key), 0)

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
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">Carregando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
        <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível carregar as ordens</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
        >
          <RefreshCw className="w-[15px] h-[15px]" />
          Tentar novamente
        </button>
      </div>
    )
  }



  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3 animate-in fade-in slide-in-from-top-4 duration-700">
        <KpiCard label="Total" value={kpis.total} sub="Ordens de execução" icon={<ClipboardList className="w-5 h-5" />} color="blue" />
        <KpiCard label="Em Execução" value={kpis.inProgress} sub="Ativas" icon={<TrendingUp className="w-5 h-5" />} color="indigo" />
        <KpiCard label="Atrasadas" value={kpis.overdue} sub={`${kpis.blocked} bloqueadas`} icon={<AlertTriangle className="w-5 h-5" />} color={kpis.overdue > 0 ? "red" : "gray"} />
        <KpiCard label="Custo Realizado" value={fmtCurrencyKpi(kpis.totalActual)} sub={`de ${fmtCurrencyKpi(kpis.totalPlanned)}`} icon={<DollarSign className="w-5 h-5" />} color="emerald" />
      </div>

      {/* §5.2 — toolbar (busca + filtros + pílulas de status) e tabela dividem UM
          card: moldura só no pai, e a única linha entre eles é o border-b. */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-2 border-b border-gray-100 bg-white space-y-3">
      <div className="flex flex-col md:flex-row gap-2.5 items-center">
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
            className={`flex items-center justify-center h-9 px-3 rounded-[6px] text-sm font-medium border transition-all ${
              overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Atrasadas</span>
          </button>

          <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />

          <button
            onClick={load}
            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Separador entre o grupo "filtrar" e o grupo "configurar colunas" */}
          <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0 mx-1"></div>

          <div className="flex items-center h-9 px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
            <ColumnConfigButton
              columns={OPERACIONAL_COLUMNS}
              visibleColumns={tableColumns.visibleColumns}
              showColumnConfig={tableColumns.showColumnConfig}
              onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
              onToggleColumn={tableColumns.toggleColumn}
              onReset={tableColumns.resetColumns}
            />
            {/* §6.1.2 — auto-ajuste sob comando explícito, nunca automático: recalcular a
                cada busca/filtro faria as colunas dançarem enquanto o usuário digita.
                Duplo clique no divisor continua sendo "restaurar largura padrão". */}
            <button
              onClick={() => cols.autoFit()}
              className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
              title="Ajustar largura das colunas ao conteúdo"
            >
              <MoveHorizontal className="w-4 h-4" />
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

      {/* Pílulas de status — segunda linha da toolbar acoplada */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
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
      </div>

      {/* Tabela — visualização única (§6). O toggle cards/lista foi removido:
          a lista de OEs é uma tabela, com colunas configuráveis e redimensionáveis.
          Sem moldura própria: o card acoplado acima já supre (§5.2). */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma ordem encontrada</h3>
          <p className="text-sm text-gray-500">
            {workOrders.length === 0 ? 'Crie a primeira ordem de execução desta obra.' : 'Tente ajustar seus filtros de busca.'}
          </p>
          {workOrders.length === 0 && (
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 mt-4 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" />
              Criar primeira OE
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
            {/* §6.1 — largura explícita (soma das colunas), nunca w-full: com
                table-layout:fixed em 100% o navegador redistribui a sobra e o arraste
                passa a redimensionar a coluna vizinha errada. */}
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
              <colgroup>
                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                  <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                ))}
                {/* §6.1.1 — espaçador sem largura, ANTES de "Ações": absorve a folga no
                    meio da tabela. Depois de "Ações", a sobra empurraria a coluna a cada
                    arraste e ela desalinharia da régua de controles acima. */}
                <col />
                {tableColumns.visibleColumns.includes('actions') && (
                  <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                )}
              </colgroup>
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
                        className={def.className}>
                        <cols.ResizeHandle colKey={key} />
                      </SortableHeader>
                    )
                  })}
                  {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                  <th aria-hidden="true" className="border-r border-gray-100" />
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                      Ações
                      <cols.ResizeHandle colKey="actions" />
                    </th>
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
                      className={`group hover:bg-blue-50/50 transition-colors cursor-pointer ${overdue ? 'bg-red-50/20' : ''}`}
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
                      {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                      <td aria-hidden="true" className="border-r border-gray-100"></td>
                      {tableColumns.visibleColumns.includes('actions') && (
                        <td className="px-6 py-2.5 text-right">
                          {/* §9.1 — clicar na linha já abre o detalhe (ação dominante), então
                              a coluna guarda só o que NÃO é essa ação. Sempre visível: nada de
                              opacity-0/group-hover (§9). */}
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {onEdit
                              ? <ActionIconButton kind="edit" onClick={() => onEdit(wo.id)} />
                              : <ActionIconButton kind="view" onClick={() => onViewDetail(wo.id)} />}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
      </div>
    </div>
  )
}

export default OperacionalList
