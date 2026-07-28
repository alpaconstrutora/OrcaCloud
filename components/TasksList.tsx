import React, { useMemo, useState } from 'react'
import {
  CheckCircle2, ExternalLink, Inbox,
  Building2, ChevronDown, ChevronRight, Plus,
  ArrowUp, ArrowDown, Search, X, SlidersHorizontal,
  GripVertical, CornerLeftUp, Flag, Calendar, AlertTriangle,
  ChevronsDownUp, ChevronsUpDown, Bell,
} from 'lucide-react'
import type { TaskRecord, EmployeeOption, ProjectOption, TaskDefaults } from './TaskForm'
import type { TaskStatus } from '../services/taskService'
import type { GroupByField } from './TasksModule'
import { ColumnConfig, useTableColumns, ColumnConfigButton, usePersistedState } from './ui/TableUtils'
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils'
import ActionIconButton from './ui/ActionIconButton'

interface TaskGroup { key: string; label: string; color?: string; tasks: TaskRecord[] }

interface Props {
  tasks: TaskRecord[]
  loading: boolean
  employees: EmployeeOption[]
  projects: ProjectOption[]
  statuses?: TaskStatus[]
  groupBy?: GroupByField
  resetDragSignal?: number
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onAddSubtask: (parent: TaskRecord) => void
  onMakeSubtask: (taskId: string, newParentId: string | null) => void
  onAddTask?: (defaults?: TaskDefaults) => void
  onNavigate: (route: string) => void
}

// ── Prioridade ────────────────────────────────────────────────────────────────
const PRIORITY_META: Record<number, { label: string; flag: string }> = {
  1: { label: 'Urgente', flag: 'text-red-500'    },
  2: { label: 'Alta',    flag: 'text-orange-400' },
  3: { label: 'Normal',  flag: 'text-blue-400'   },
  4: { label: 'Baixa',   flag: 'text-slate-300'  },
}

const MODULE_LABEL: Record<string, { label: string; cls: string }> = {
  manual:      { label: 'Manual',      cls: 'text-slate-500' },
  operacional: { label: 'Operacional', cls: 'text-amber-700' },
  financeiro:  { label: 'Financeiro',  cls: 'text-emerald-700' },
  rh:          { label: 'RH',          cls: 'text-purple-700' },
  compras:     { label: 'Compras',     cls: 'text-indigo-700' },
}

// ── Configuração de visibilidade de colunas ───────────────────────────────────
const TASKS_LIST_COLUMNS: ColumnConfig[] = [
  { key: 'title',      label: 'Nome',         sortable: false },
  { key: 'assignee',  label: 'Responsável',   sortable: false },
  { key: 'project',   label: 'Obra',          sortable: false },
  { key: 'start_date',label: 'Data Inicial',  sortable: false },
  { key: 'due_date',  label: 'Vencimento',    sortable: false },
  { key: 'priority',  label: 'Prioridade',    sortable: false },
  { key: 'source',    label: 'Origem',        sortable: false },
  { key: 'alert',     label: 'Alerta',        sortable: false },
  { key: 'status',    label: 'Status',        sortable: false },
  { key: 'actions',   label: 'Ações',         sortable: false },
]

// ── Colunas reordenáveis ──────────────────────────────────────────────────────
const COLUMN_DEFS = [
  { key: 'title',      label: 'Nome',          sortCol: 'title'      as const },
  { key: 'assignee',   label: 'Responsável',   sortCol: 'assignee'   as const },
  { key: 'project',    label: 'Obra',          sortCol: 'project'    as const },
  { key: 'start_date', label: 'Data Inicial',  sortCol: 'start_date' as const },
  { key: 'due_date',   label: 'Vencimento',    sortCol: 'due_date'   as const },
  { key: 'priority',   label: 'Prioridade',    sortCol: 'priority'   as const },
  { key: 'source',     label: 'Origem',        sortCol: null },
  { key: 'alert',      label: 'Alerta',        sortCol: 'alert'      as const },
  { key: 'status',     label: 'Status',        sortCol: 'status'     as const },
  { key: 'actions',    label: '',              sortCol: null },
] as const

type ColKey = typeof COLUMN_DEFS[number]['key']
type SortCol = Exclude<typeof COLUMN_DEFS[number]['sortCol'], null>
type SortDir = 'asc' | 'desc'

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa os
// chips de filtro (fPriority/fStatus/fAssignee/fProject) já existentes, não os
// substitui. Só usa campos planos do próprio TaskRecord (sem depender dos mapas
// de resolução employees/projects/statuses, que são de escopo do componente).
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'title', label: 'Nome', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'priority', label: 'Prioridade', type: 'select', options: [
      { value: '1', label: 'Urgente' }, { value: '2', label: 'Alta' },
      { value: '3', label: 'Normal' }, { value: '4', label: 'Baixa' },
  ] },
  { key: 'source_module', label: 'Origem', type: 'select', options: [
      { value: 'manual', label: 'Manual' }, { value: 'operacional', label: 'Operacional' },
      { value: 'financeiro', label: 'Financeiro' }, { value: 'rh', label: 'RH' },
      { value: 'compras', label: 'Compras' },
  ] },
  { key: 'start_date', label: 'Data Inicial', type: 'date' },
  { key: 'due_date', label: 'Vencimento', type: 'date' },
]

function getAdvancedFilterValue(t: TaskRecord, key: string): unknown {
  switch (key) {
    case 'title': return t.title
    case 'status': return t.status
    case 'priority': return String(t.priority)
    case 'source_module': return t.source_module
    case 'start_date': return t.start_date
    case 'due_date': return t.due_date
    default: return null
  }
}

const DEFAULT_COL_ORDER: ColKey[] = COLUMN_DEFS.map(c => c.key)
const COL_DEF_MAP = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c])) as Record<ColKey, typeof COLUMN_DEFS[number]>

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function isOverdue(iso: string | null) {
  if (!iso) return false
  return new Date(iso) < new Date(new Date().toDateString())
}

// Avatar com iniciais e cor baseada no nome
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
]
function avatarBg(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function SortIcon({ col, active, dir }: { col: string; active: SortCol | null; dir: SortDir }) {
  if (active !== col) return <span className="inline-block w-3 h-3 opacity-0 group-hover/th:opacity-40"><ArrowUp className="w-3 h-3" /></span>
  return dir === 'asc'
    ? <ArrowUp   className="inline-block w-3 h-3 text-blue-500 ml-0.5" />
    : <ArrowDown className="inline-block w-3 h-3 text-blue-500 ml-0.5" />
}

const COL = 'px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-slate-700 whitespace-nowrap'

// ─────────────────────────────────────────────────────────────────────────────

const TasksList: React.FC<Props> = ({
  tasks, loading, employees, projects, statuses = [], groupBy = 'none', resetDragSignal,
  onToggleDone, onEdit, onAddSubtask, onMakeSubtask, onAddTask, onNavigate,
}) => {
  // F2: filtros + ordenação sobrevivem a navegação/reload.
  const [search, setSearch]           = usePersistedState('tasksListFilters:search', '')
  const [sortCol, setSortCol]         = usePersistedState<SortCol | null>('tasksListFilters:sortCol', null)
  const [sortDir, setSortDir]         = usePersistedState<SortDir>('tasksListFilters:sortDir', 'asc')
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [fPriority, setFPriority]     = usePersistedState('tasksListFilters:priority', '')
  const [fStatus, setFStatus]         = usePersistedState('tasksListFilters:status', '')
  const [fAssignee, setFAssignee]     = usePersistedState('tasksListFilters:assignee', '')
  const [fProject, setFProject]       = usePersistedState('tasksListFilters:project', '')

  const [draggingId, setDraggingId]         = useState<string | null>(null)
  const [dragOverId, setDragOverId]         = useState<string | null>(null)
  const [dragOverDetach, setDragOverDetach] = useState(false)

  // Ref para poder cancelar o RAF antes que ele dispare
  const dragRafRef = React.useRef<number | null>(null)

  const clearDrag = React.useCallback(() => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    setDraggingId(null); setDragOverId(null); setDragOverDetach(false)
  }, [])

  // Limpeza quando o drop ocorre fora do componente (ex: no rail)
  React.useEffect(() => {
    window.addEventListener('dragend', clearDrag)
    return () => window.removeEventListener('dragend', clearDrag)
  }, [clearDrag])

  // Limpeza quando o pai (TasksModule) confirma que houve drop no rail
  React.useEffect(() => {
    if (resetDragSignal) clearDrag()
  }, [resetDragSignal, clearDrag])

  const [colOrder, setColOrder]       = useState<ColKey[]>(DEFAULT_COL_ORDER)
  const [colDragging, setColDragging] = useState<ColKey | null>(null)
  const [colDragOver, setColDragOver] = useState<ColKey | null>(null)

  // Visibility via TableUtils (sort handled by existing sortCol/sortDir state)
  const taskVisibility = useTableColumns(TASKS_LIST_COLUMNS, 'tasksListColumns')
  const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'tasksListFilters:advanced')
  // Filter colOrder by visible columns
  const visibleColOrder = useMemo(
    () => colOrder.filter(k => taskVisibility.visibleColumns.includes(k)),
    [colOrder, taskVisibility.visibleColumns]
  )

  const empMap    = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])
  const projMap   = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const statusMap = useMemo(() => Object.fromEntries(statuses.map(s => [s.id, s])), [statuses])

  const parents  = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks])
  const childMap = useMemo(() => {
    const m: Record<string, TaskRecord[]> = {}
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!m[t.parent_task_id]) m[t.parent_task_id] = []
        m[t.parent_task_id].push(t)
      }
    })
    return m
  }, [tasks])

  function isDescendant(ancestorId: string, checkId: string): boolean {
    return (childMap[ancestorId] ?? []).some(c => c.id === checkId || isDescendant(c.id, checkId))
  }
  function canDrop(draggedId: string, targetId: string): boolean {
    if (draggedId === targetId) return false
    if (isDescendant(draggedId, targetId)) return false
    if (tasks.find(x => x.id === draggedId)?.parent_task_id === targetId) return false
    return true
  }

  const toggleSort   = (col: SortCol) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }
  const toggleExpand = (id: string)   => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const q = search.toLowerCase()
  const activeFilters = !!(fPriority || fStatus || fAssignee || fProject)

  const filtered = useMemo(() => {
    let rows = parents.filter(t => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
      if (fPriority && String(t.priority) !== fPriority) return false
      if (fStatus && (statuses.length > 0 ? t.status_id !== fStatus : t.status !== fStatus)) return false
      if (fAssignee && t.assignee_employee_id !== fAssignee) return false
      if (fProject  && t.project_id !== fProject) return false
      return true
    })
    rows = applyFilterRules(rows, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue)
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        let av: string | number = '', bv: string | number = ''
        if (sortCol === 'title')      { av = a.title.toLowerCase(); bv = b.title.toLowerCase() }
        if (sortCol === 'priority')   { av = a.priority; bv = b.priority }
        if (sortCol === 'status')     { av = a.status; bv = b.status }
        if (sortCol === 'start_date') { av = a.start_date ?? ''; bv = b.start_date ?? '' }
        if (sortCol === 'due_date')   { av = a.due_date ?? ''; bv = b.due_date ?? '' }
        if (sortCol === 'assignee')   { av = (empMap[a.assignee_employee_id ?? '']?.name ?? '').toLowerCase(); bv = (empMap[b.assignee_employee_id ?? '']?.name ?? '').toLowerCase() }
        if (sortCol === 'project')    { av = (projMap[a.project_id ?? '']?.name ?? '').toLowerCase(); bv = (projMap[b.project_id ?? '']?.name ?? '').toLowerCase() }
        if (sortCol === 'alert')      { av = a.alert_at ?? ''; bv = b.alert_at ?? '' }
        return av < bv ? (sortDir === 'asc' ? -1 : 1) : av > bv ? (sortDir === 'asc' ? 1 : -1) : 0
      })
    }
    return rows
  }, [parents, q, fPriority, fStatus, fAssignee, fProject, sortCol, sortDir, empMap, projMap, statuses, advancedFilters.rules])

  const clearFilters = () => { setFPriority(''); setFStatus(''); setFAssignee(''); setFProject(''); setSearch('') }

  // ── Agrupamento ─────────────────────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const groups: TaskGroup[] = useMemo(() => {
    if (groupBy === 'none') return [{ key: '__all__', label: '', tasks: filtered }]

    const map = new Map<string, TaskGroup>()
    const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#94a3b8' }

    for (const t of filtered) {
      let key: string, label: string, color: string | undefined

      switch (groupBy) {
        case 'status': {
          const s = statusMap[t.status_id ?? '']
          key = t.status_id ?? '__none__'; label = s?.name ?? 'Sem status'; color = s?.color; break
        }
        case 'assignee': {
          const emp = empMap[t.assignee_employee_id ?? '']
          key = t.assignee_employee_id ?? '__none__'; label = emp?.name ?? 'Não atribuído'; break
        }
        case 'priority': {
          key = String(t.priority); label = PRIORITY_META[t.priority]?.label ?? 'Normal'
          color = PRIORITY_COLORS[t.priority]; break
        }
        case 'project': {
          const proj = projMap[t.project_id ?? '']
          key = t.project_id ?? '__none__'; label = proj?.name ?? 'Sem obra'; break
        }
        case 'source': {
          key = t.source_module; label = MODULE_LABEL[t.source_module]?.label ?? t.source_module; break
        }
        default: key = '__all__'; label = ''
      }

      if (!map.has(key)) map.set(key, { key, label, color, tasks: [] })
      map.get(key)!.tasks.push(t)
    }

    // Ordem estável para status (position) e prioridade (1→4)
    if (groupBy === 'status') {
      return [...map.values()].sort((a, b) => {
        const pa = statuses.find(s => s.id === a.key)?.position ?? 99
        const pb = statuses.find(s => s.id === b.key)?.position ?? 99
        return pa - pb
      })
    }
    if (groupBy === 'priority') {
      return [...map.values()].sort((a, b) => Number(a.key) - Number(b.key))
    }
    return [...map.values()]
  }, [filtered, groupBy, statusMap, empMap, projMap, statuses])

  // ── Expandir / recolher tudo ──────────────────────────────────────────────
  // IDs de tarefas que possuem subtarefas (únicos que têm o que expandir)
  const expandableIds = useMemo(() => Object.keys(childMap), [childMap])
  const allExpanded =
    expandableIds.every(id => expanded.has(id)) &&
    (groupBy === 'none' || collapsedGroups.size === 0)

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpanded(new Set())
      // sem agrupamento não há cabeçalho de grupo para reabrir — não recolhe grupos
      if (groupBy !== 'none') setCollapsedGroups(new Set(groups.map(g => g.key)))
    } else {
      setExpanded(new Set(expandableIds))
      setCollapsedGroups(new Set())
    }
  }

  const handleColDrop = (fromKey: ColKey, toKey: ColKey) => {
    if (fromKey === toKey) return
    const next = [...colOrder]
    const from = next.indexOf(fromKey)
    const to   = next.indexOf(toKey)
    next.splice(from, 1)
    next.splice(to, 0, fromKey)
    setColOrder(next)
  }

  if (loading) return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-2 text-gray-500">Carregando...</p>
    </div>
  )

  const sel = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-blue-400 text-slate-700'

  // ── Linha de tarefa ─────────────────────────────────────────────────────────
  function TaskRow({ t, depth = 0 }: { t: TaskRecord; depth?: number }) {
    const children   = childMap[t.id] ?? []
    const isExpanded = expanded.has(t.id)
    const taskStatus = t.status_id ? statusMap[t.status_id] : null
    const isDone     = taskStatus ? taskStatus.is_done : t.status === 'done'
    const prio       = PRIORITY_META[t.priority] ?? PRIORITY_META[3]
    const mod        = MODULE_LABEL[t.source_module] ?? MODULE_LABEL.manual
    const assignee   = t.assignee_employee_id ? empMap[t.assignee_employee_id] : null
    const proj       = t.project_id ? projMap[t.project_id] : null
    const route      = t.source_ref?.route
    const indent     = depth * 20

    const isBeingDragged = draggingId === t.id
    const isDropTarget   = dragOverId === t.id && draggingId !== null && canDrop(draggingId, t.id)

    // Cor do checkbox baseada no status customizado
    const checkColor = taskStatus?.color ?? (isDone ? '#10b981' : '#94a3b8')

    const cells: Record<ColKey, React.ReactNode> = {
      // ── Nome ──────────────────────────────────────────────────────────────
      title: (
        <td key="title" className="px-3 py-2.5 border-r border-gray-100 text-sm text-slate-700 w-[320px] max-w-[400px]">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: indent }}>
            {children.length > 0 ? (
              <button onClick={() => toggleExpand(t.id)} className="flex-shrink-0 text-slate-400 hover:text-slate-700 transition-colors">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 flex-shrink-0 text-center">
                {depth > 0 && <span className="text-slate-300 text-xs">↳</span>}
              </span>
            )}
            <button onClick={() => onEdit(t)} className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`font-normal text-slate-900 truncate leading-snug ${isDone ? 'line-through text-slate-400' : ''}`}>
                  {t.title}
                </span>
                {t.alert_at && (
                  <span title={`Alerta: ${new Date(t.alert_at).toLocaleString('pt-BR')}`} className="flex-shrink-0">
                    <Bell className={`w-3 h-3 ${new Date(t.alert_at) < new Date() ? 'text-red-400' : 'text-amber-400'}`} />
                  </span>
                )}
              </div>
              {t.description && (
                <div className="text-xs text-slate-400 truncate mt-0.5">{t.description}</div>
              )}
            </button>
            {children.length > 0 && (
              <span className="text-xs font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {children.length}
              </span>
            )}
          </div>
        </td>
      ),

      // ── Responsável — avatar ───────────────────────────────────────────────
      assignee: (
        <td key="assignee" className={COL}>
          {assignee ? (
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${avatarBg(assignee.name)}`}>
                {initials(assignee.name)}
              </div>
              <span className="truncate max-w-[110px] text-slate-700">{assignee.name}</span>
            </div>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Obra ──────────────────────────────────────────────────────────────
      project: (
        <td key="project" className={COL}>
          {proj ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate max-w-[120px]">{proj.name}</span>
            </div>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Data Inicial ───────────────────────────────────────────────────────
      start_date: (
        <td key="start_date" className={COL}>
          {t.start_date ? (
            <span className={isOverdue(t.start_date) ? 'text-red-500 font-semibold' : 'text-slate-600'}>
              {fmt(t.start_date)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Vencimento ────────────────────────────────────────────────────────
      due_date: (
        <td key="due_date" className={COL}>
          {t.due_date ? (
            <span className={isOverdue(t.due_date) ? 'text-red-500 font-semibold' : 'text-slate-600'}>
              {fmt(t.due_date)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Prioridade — flag ─────────────────────────────────────────────────
      priority: (
        <td key="priority" className={COL}>
          <div className="flex items-center gap-1.5">
            <Flag className={`w-3.5 h-3.5 flex-shrink-0 fill-current ${prio.flag}`} />
            <span className="text-slate-700">{prio.label}</span>
          </div>
        </td>
      ),

      // ── Origem ────────────────────────────────────────────────────────────
      source: (
        <td key="source" className={COL}>
          <span className={`text-sm font-normal ${mod.cls}`}>{mod.label}</span>
        </td>
      ),

      // ── Alerta / Lembrete ─────────────────────────────────────────────────
      alert: (
        <td key="alert" className={COL}>
          {t.alert_at ? (() => {
            const d = new Date(t.alert_at)
            const past = d < new Date()
            return (
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-table-body font-semibold
                ${past ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}
              >
                <Bell className="w-3 h-3 flex-shrink-0" />
                {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                {' '}
                {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )
          })() : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Status — badge ClickUp ─────────────────────────────────────────────
      status: (
        <td key="status" className={COL}>
          {taskStatus ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-normal" style={{ color: taskStatus.color }}>
              <span
                className="w-2.5 h-2.5 rounded-full border-2 flex-shrink-0"
                style={{ borderColor: taskStatus.color, backgroundColor: taskStatus.is_done ? taskStatus.color : 'transparent' }}
              />
              {taskStatus.name}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),

      // ── Ações ─────────────────────────────────────────────────────────────
      actions: (
        <td key="actions" className="px-2 py-2.5">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onAddSubtask(t)}
              title="Adicionar subtarefa"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
            >
              + subtarefa
            </button>
            {route && (
              <ActionIconButton kind="view" title="Abrir origem" icon={<ExternalLink className="w-4 h-4" />} onClick={() => onNavigate(route)} />
            )}
          </div>
        </td>
      ),
    }

    return (
      <>
        <tr
          onDragEnd={clearDrag}
          onDragOver={(e) => { e.preventDefault(); if (draggingId && draggingId !== t.id) setDragOverId(t.id) }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverId(null) }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggingId && canDrop(draggingId, t.id)) {
              onMakeSubtask(draggingId, t.id)
              setExpanded(prev => { const s = new Set(prev); s.add(t.id); return s })
            }
            clearDrag()
          }}
          className={[
            'group border-b border-slate-100 transition-all duration-100',
            isDone ? 'opacity-50' : '',
            depth > 0 ? 'bg-slate-50/50' : 'bg-white',
            isBeingDragged ? 'opacity-20' : 'hover:bg-[#f8f9ff]',
            isDropTarget ? 'bg-blue-50 shadow-[inset_0_0_0_2px_#3b82f6]' : '',
          ].join(' ')}
        >
          {/* Grip */}
          <td className="pl-2 pr-0 py-0 w-6">
            <div
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.setData('row', t.id)
                e.dataTransfer.setData('taskId', t.id)   // para drop em pastas do rail
                e.dataTransfer.effectAllowed = 'move'
                dragRafRef.current = requestAnimationFrame(() => {
                  dragRafRef.current = null
                  setDraggingId(t.id)
                })
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex items-center py-2.5"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          </td>

          {/* Checkbox circular dashed — estilo ClickUp */}
          <td className="px-2 py-0 w-8">
            <button
              onClick={() => onToggleDone(t)}
              className="flex items-center justify-center w-5 h-5 rounded-full transition-all hover:scale-110"
              title={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
            >
              {isDone ? (
                <CheckCircle2 className="w-5 h-5" style={{ color: checkColor }} />
              ) : (
                <div
                  className="w-4 h-4 rounded-full border-2 border-dashed hover:border-solid transition-all"
                  style={{ borderColor: checkColor }}
                />
              )}
            </button>
          </td>

          {/* Colunas reordenáveis */}
          {visibleColOrder.map(key => cells[key])}
        </tr>

        {isExpanded && children.map(child => (
          <TaskRow key={child.id} t={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  // ── Cartão de tarefa (mobile) ───────────────────────────────────────────────
  function TaskCard({ t, depth = 0 }: { t: TaskRecord; depth?: number }) {
    const children   = childMap[t.id] ?? []
    const isExpanded = expanded.has(t.id)
    const taskStatus = t.status_id ? statusMap[t.status_id] : null
    const isDone     = taskStatus ? taskStatus.is_done : t.status === 'done'
    const prio       = PRIORITY_META[t.priority] ?? PRIORITY_META[3]
    const assignee   = t.assignee_employee_id ? empMap[t.assignee_employee_id] : null
    const proj       = t.project_id ? projMap[t.project_id] : null
    const route      = t.source_ref?.route
    const checkColor = taskStatus?.color ?? (isDone ? '#10b981' : '#94a3b8')

    return (
      <div>
        <div
          className={`rounded-2xl border p-3.5 transition-all ${isDone ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 shadow-sm'}`}
          style={{ marginLeft: depth * 14 }}
        >
          <div className="flex items-start gap-3">
            {/* checkbox circular dashed — estilo ClickUp */}
            <button
              onClick={() => onToggleDone(t)}
              className="mt-0.5 flex-shrink-0 active:scale-90 transition-transform"
              title={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
            >
              {isDone
                ? <CheckCircle2 className="w-6 h-6" style={{ color: checkColor }} />
                : <div className="w-5 h-5 rounded-full border-2 border-dashed" style={{ borderColor: checkColor }} />}
            </button>

            {/* conteúdo — toque para editar */}
            <button onClick={() => onEdit(t)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-[15px] leading-snug text-slate-900 ${isDone ? 'line-through text-slate-400' : ''}`}>
                  {t.title}
                </span>
                {t.alert_at && (
                  <span title={`Alerta: ${new Date(t.alert_at).toLocaleString('pt-BR')}`} className="flex-shrink-0">
                    <Bell className={`w-3.5 h-3.5 ${new Date(t.alert_at) < new Date() ? 'text-red-400' : 'text-amber-400'}`} />
                  </span>
                )}
              </div>
              {t.description && <div className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</div>}

              {/* chips de metadados */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {t.due_date && (
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${isOverdue(t.due_date) ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                    {isOverdue(t.due_date) ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                    {fmt(t.due_date)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                  <Flag className={`w-3 h-3 fill-current ${prio.flag}`} /> {prio.label}
                </span>
                {taskStatus && (
                  <span
                    className="inline-flex items-center text-xs font-black uppercase tracking-wide px-2 py-1 rounded-lg"
                    style={{ backgroundColor: taskStatus.color, color: '#fff' }}
                  >
                    {taskStatus.name}
                  </span>
                )}
                {proj && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
                    <Building2 className="w-3 h-3 flex-shrink-0" /> <span className="truncate max-w-[110px]">{proj.name}</span>
                  </span>
                )}
                {assignee && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black text-white flex-shrink-0 ${avatarBg(assignee.name)}`}>
                    {initials(assignee.name)}
                  </span>
                )}
              </div>
            </button>

            {/* abrir origem */}
            {route && (
              <button
                onClick={() => onNavigate(route)}
                title="Abrir origem"
                className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* rodapé — subtarefas */}
          <div className="flex items-center gap-4 mt-2.5 pl-9">
            {children.length > 0 && (
              <button onClick={() => toggleExpand(t.id)} className="flex items-center gap-1 text-xs font-bold text-slate-400">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {children.length} subtarefa{children.length > 1 ? 's' : ''}
              </button>
            )}
            <button onClick={() => onAddSubtask(t)} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600">
              <Plus className="w-3.5 h-3.5" /> Subtarefa
            </button>
          </div>
        </div>

        {/* filhos */}
        {isExpanded && children.length > 0 && (
          <div className="mt-2 space-y-2">
            {children.map(child => <TaskCard key={child.id} t={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  // Constrói os defaults para criação contextual dentro de um grupo
  function buildDefaults(groupKey: string): TaskDefaults {
    if (groupKey === '__none__') return {}
    switch (groupBy) {
      case 'status':   return { status_id: groupKey }
      case 'assignee': return { assignee_employee_id: groupKey }
      case 'priority': return { priority: Number(groupKey) }
      case 'project':  return { project_id: groupKey }
      default:         return {}
    }
  }

  // ── Cabeçalho de grupo (ClickUp style) ────────────────────────────────────
  function GroupHeader({ group }: { group: TaskGroup }) {
    const isCollapsed = collapsedGroups.has(group.key)
    const totalCols = 2 + visibleColOrder.length

    return (
      <tr className="group/gh">
        <td colSpan={totalCols} className="p-0">
          <div
            onClick={() => toggleGroup(group.key)}
            className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none border-b border-slate-200 transition-colors"
          >
            <span className="text-slate-400 flex-shrink-0 transition-transform">
              {isCollapsed
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronDown  className="w-3.5 h-3.5" />}
            </span>

            {group.color && (
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />
            )}

            <span className="font-bold text-sm text-slate-800">{group.label}</span>

            <span className="text-xs font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {group.tasks.length}
            </span>

            <div className="flex-1 h-px bg-slate-200" />

            {onAddTask && (
              <button
                onClick={e => { e.stopPropagation(); onAddTask(buildDefaults(group.key)) }}
                className="opacity-0 group-hover/gh:opacity-100 flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600 transition-all px-2 py-1 rounded hover:bg-blue-50 flex-shrink-0"
              >
                <Plus className="w-3 h-3" /> Tarefa
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  // ── Cabeçalho arrastável ────────────────────────────────────────────────────
  function ColHeader({ colKey }: { colKey: ColKey }) {
    const col    = COL_DEF_MAP[colKey]
    const isOver = colDragOver === colKey && colDragging !== colKey

    return (
      <th
        onDragOver={(e)  => { e.preventDefault(); e.stopPropagation(); if (colDragging && colDragging !== colKey) setColDragOver(colKey) }}
        onDragLeave={(e) => { e.stopPropagation(); setColDragOver(null) }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation()
          const from = e.dataTransfer.getData('col') as ColKey
          if (from && from !== colKey) handleColDrop(from, colKey)
          setColDragging(null); setColDragOver(null)
        }}
        onClick={() => col.sortCol && toggleSort(col.sortCol as SortCol)}
        className={[
          'text-[11px] font-semibold text-slate-500 text-left select-none p-0 border-r border-gray-100 last:border-r-0',
          col.sortCol ? 'group/th' : '',
          isOver ? 'bg-blue-50 text-blue-600' : '',
          colDragging === colKey ? 'opacity-40' : '',
          'transition-colors',
        ].join(' ')}
        style={{ width: colKey === 'actions' ? 130 : undefined }}
      >
        <div
          draggable={colKey !== 'actions'}
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.setData('col', colKey)
            e.dataTransfer.effectAllowed = 'move'
            requestAnimationFrame(() => setColDragging(colKey))
          }}
          onDragEnd={(e) => { e.stopPropagation(); setColDragging(null); setColDragOver(null) }}
          className={[
            'flex items-center gap-1 px-3 py-2.5 w-full select-none',
            colKey !== 'actions' ? 'cursor-grab active:cursor-grabbing hover:text-slate-700' : '',
          ].join(' ')}
        >
          {col.label}
          {col.sortCol && <SortIcon col={col.sortCol} active={sortCol} dir={sortDir} />}
        </div>
      </th>
    )
  }

  return (
    <div className="space-y-3">
      {/* Barra busca + filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            className="w-full h-9 pl-8 pr-8 text-sm font-medium border border-slate-200 rounded-[6px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium border transition-all
            ${showFilters || activeFilters ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtros
          {activeFilters && <span className="bg-white/20 text-white text-xs font-black px-1.5 rounded-md">●</span>}
        </button>
        {(expandableIds.length > 0 || groupBy !== 'none') && (
          <button
            onClick={toggleExpandAll}
            title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium border border-slate-200 text-slate-600 hover:border-slate-300 bg-white transition-all"
          >
            {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
            {allExpanded ? 'Recolher' : 'Expandir'}
          </button>
        )}
        {(activeFilters || search) && (
          <button onClick={clearFilters} className="text-button font-bold text-slate-400 hover:text-red-500 flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
        <span className="ml-auto text-xs font-bold text-slate-400">{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</span>
        <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
        <ColumnConfigButton
          columns={TASKS_LIST_COLUMNS}
          visibleColumns={taskVisibility.visibleColumns}
          showColumnConfig={taskVisibility.showColumnConfig}
          onToggleShow={() => taskVisibility.setShowColumnConfig(!taskVisibility.showColumnConfig)}
          onToggleColumn={taskVisibility.toggleColumn}
          onReset={taskVisibility.resetColumns}
        />
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={sel}>
            <option value="">Todas as prioridades</option>
            <option value="1">Urgente</option>
            <option value="2">Alta</option>
            <option value="3">Normal</option>
            <option value="4">Baixa</option>
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}>
            <option value="">Todos os status</option>
            {statuses.length > 0
              ? statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
              : <><option value="open">Abertas</option><option value="done">Concluídas</option><option value="snoozed">Adiadas</option></>
            }
          </select>
          <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className={sel}>
            <option value="">Todos os responsáveis</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={sel}>
            <option value="">Todas as obras</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* Zona de soltar — virar tarefa raiz */}
      {draggingId && tasks.find(t => t.id === draggingId)?.parent_task_id && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverDetach(true) }}
          onDragLeave={() => setDragOverDetach(false)}
          onDrop={(e) => {
            e.preventDefault()
            onMakeSubtask(draggingId, null)
            setDraggingId(null); setDragOverDetach(false)
          }}
          className={[
            'flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-bold transition-all duration-150',
            dragOverDetach
              ? 'bg-violet-50 border-violet-400 text-violet-700 scale-[1.01]'
              : 'border-slate-300 text-slate-400 bg-slate-50',
          ].join(' ')}
        >
          <CornerLeftUp className="w-4 h-4 flex-shrink-0" />
          Soltar aqui para transformar em tarefa principal
        </div>
      )}

      {/* Tabela */}
      {filtered.length === 0 && !onAddTask ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <Inbox className="w-12 h-12 mb-3" />
          <p className="text-lg font-bold text-slate-400">Nenhuma tarefa encontrada</p>
          {(q || activeFilters) && <p className="text-sm mt-1 text-slate-400">Tente ajustar a busca ou os filtros</p>}
        </div>
      ) : (
        <>
        {/* ── Desktop: tabela ─────────────────────────────────────────────── */}
        <div className="hidden md:block bg-white rounded-[10px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-6 p-0" />
                  <th className="w-8 p-0" />
                  {visibleColOrder.map(key => <ColHeader key={key} colKey={key} />)}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <React.Fragment key={group.key}>
                    {/* Cabeçalho do grupo — só quando agrupamento ativo */}
                    {groupBy !== 'none' && <GroupHeader group={group} />}

                    {/* Tarefas do grupo */}
                    {!collapsedGroups.has(group.key) && group.tasks.map(t => (
                      <TaskRow key={t.id} t={t} />
                    ))}

                    {/* + Adicionar Tarefa no rodapé de cada grupo */}
                    {!collapsedGroups.has(group.key) && onAddTask && groupBy !== 'none' && (
                      <tr>
                        <td colSpan={2 + visibleColOrder.length} className="px-4 py-1.5 border-b border-slate-100">
                          <button
                            onClick={() => onAddTask(buildDefaults(group.key))}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-600 transition-colors font-medium group/add"
                          >
                            <Plus className="w-3.5 h-3.5" /> Adicionar Tarefa
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}

                {/* + Adicionar Tarefa global (sem agrupamento) */}
                {groupBy === 'none' && onAddTask && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={2 + visibleColOrder.length} className="px-4 py-2">
                      <button
                        onClick={() => onAddTask()}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-600 transition-colors font-medium group/add"
                      >
                        <span className="w-5 h-5 rounded flex items-center justify-center text-slate-300 group-hover/add:text-blue-500 group-hover/add:bg-blue-50 transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                        Adicionar Tarefa
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Mobile: cartões ─────────────────────────────────────────────── */}
        <div className="md:hidden space-y-5">
          {groups.map(group => {
            const collapsed = collapsedGroups.has(group.key)
            return (
              <div key={group.key} className="space-y-2.5">
                {/* Cabeçalho do grupo — só quando agrupamento ativo */}
                {groupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-2 px-1 select-none"
                  >
                    <span className="text-slate-400 flex-shrink-0">
                      {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                    {group.color && <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />}
                    <span className="font-black text-sm text-slate-800">{group.label}</span>
                    <span className="text-xs font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {group.tasks.length}
                    </span>
                  </button>
                )}

                {!collapsed && group.tasks.map(t => <TaskCard key={t.id} t={t} />)}

                {/* + Adicionar tarefa */}
                {!collapsed && onAddTask && (
                  <button
                    onClick={() => onAddTask(buildDefaults(group.key))}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Adicionar tarefa
                  </button>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}

export default TasksList
