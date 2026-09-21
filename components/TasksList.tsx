import React, { useMemo, useState } from 'react'
import {
  CheckCircle2, ExternalLink, Inbox,
  Building2, ChevronDown, ChevronRight, Plus,
  Search, X, SlidersHorizontal, MoveHorizontal,
  GripVertical, CornerLeftUp, Flag, Calendar, AlertTriangle,
  ChevronsDownUp, ChevronsUpDown, Bell,
} from 'lucide-react'
import type { TaskRecord, EmployeeOption, ProjectOption, TaskDefaults } from './TaskForm'
import type { TaskStatus } from '../services/taskService'
import type { GroupByField } from './TasksModule'
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils'
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils'
import ActionIconButton from './ui/ActionIconButton'

interface TaskGroup { key: string; label: string; color?: string; tasks: TaskRecord[] }

interface Props {
  tasks: TaskRecord[]
  loading: boolean
  employees: EmployeeOption[]
  projects: ProjectOption[]
  statuses?: TaskStatus[]
  /** Controles de recorte do módulo (Prazo / Espaço / Pasta / painel Espaços — §5.4),
   *  renderizados na toolbar acoplada logo depois da busca. O estado vive no pai
   *  porque o mesmo recorte vale para o Kanban. */
  filters?: React.ReactNode
  groupBy?: GroupByField
  resetDragSignal?: number
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onAddSubtask: (parent: TaskRecord) => void
  onMakeSubtask: (taskId: string, newParentId: string | null) => void
  onAddTask?: (defaults?: TaskDefaults) => void
  onNavigate: (route: string) => void
  /** Estado vazio: o pai diz qual recorte (Prazo / Espaço / Pasta) está escondendo as
   *  tarefas e oferece o atalho para desfazê-lo — sem isso "0 tarefas" com um recorte
   *  persistido parece defeito (21/09/2026: Prazo · Hoje com 20 tarefas abertas sem prazo). */
  emptyHint?: { message: string; action?: { label: string; onClick: () => void } }
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

// ── Colunas (visibilidade, ordem arrastável e ordenação via useTableColumns) ──
// Toda coluna de valor único é ordenável (§6.3). 'actions' é estrutural: fica fora
// da engrenagem, do arraste e da ordenação.
// `defaultHidden`: a área de conteúdo de Tarefas mede ~1290px em 1600 (viewport −
// sidebar 260 − gutter 48; o rail de espaços saiu em 21/09/2026). Nove colunas com
// `px-6` não cabem aí; com a coluna de Ações fora da tela a primeira impressão é
// de defeito. Nascem visíveis as oito que cabem; Data inicial e Alerta ligam na
// engrenagem (quem já tinha preferência salva mantém as colunas que via).
const TASKS_LIST_COLUMNS: ColumnConfig[] = [
  { key: 'title',      label: 'Nome',          sortable: true  },
  { key: 'assignee',   label: 'Responsável',   sortable: true  },
  { key: 'project',    label: 'Obra',          sortable: true  },
  { key: 'start_date', label: 'Data inicial',  sortable: true, defaultHidden: true },
  { key: 'due_date',   label: 'Vencimento',    sortable: true  },
  { key: 'priority',   label: 'Prioridade',    sortable: true  },
  { key: 'source',     label: 'Origem',        sortable: true  },
  { key: 'alert',      label: 'Alerta',        sortable: true, defaultHidden: true },
  { key: 'status',     label: 'Status',        sortable: true  },
  { key: 'actions',    label: 'Ações',         sortable: false },
]

type ColKey = 'title' | 'assignee' | 'project' | 'start_date' | 'due_date' | 'priority' | 'source' | 'alert' | 'status' | 'actions'

// Larguras de partida — redimensionável via useResizableColumns (§6.1); o botão
// "Ajustar largura ao conteúdo" (§6.1.2) mede o dado real e substitui estes valores.
// Cada coluna precisa caber o rótulo do cabeçalho + ícone de ordenação com px-6
// (48px de respiro): "Vencimento" pede ~146px, "Prioridade" ~136px.
// Soma alvo das visíveis por padrão: 56 (grip+checkbox) + 240+150+160+146+136+116+150+134 = 1288 ≤ 1290.
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  title: 240, assignee: 150, project: 160, start_date: 146, due_date: 146,
  priority: 136, source: 116, alert: 150, status: 150, actions: 134,
}
// Colunas estruturais (grip de arraste + checkbox circular) — largura fixa, fora do
// redimensionamento. Entram no <colgroup> sem data-col-key, e o autofit as desconta.
const GRIP_COL_WIDTH  = 24
const CHECK_COL_WIDTH = 32

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

// §6.6/§7.2: px-6 + separador vertical + py-2.5 em toda célula. `overflow-hidden`
// porque a largura vem do <colgroup> (table-layout: fixed) — sem ele o texto de uma
// coluna estreita invadiria a vizinha; o `block truncate` + `title` (§6.1.2) nos
// spans de texto livre é o que devolve o conteúdo cortado.
const COL = 'px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-slate-700 whitespace-nowrap overflow-hidden'
const TH  = 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden'

const HEADER_LABEL: Record<Exclude<ColKey, 'actions'>, string> = {
  title: 'Nome', assignee: 'Responsável', project: 'Obra', start_date: 'Data inicial',
  due_date: 'Vencimento', priority: 'Prioridade', source: 'Origem', alert: 'Alerta', status: 'Status',
}

// ─────────────────────────────────────────────────────────────────────────────

const TasksList: React.FC<Props> = ({
  tasks, loading, employees, projects, statuses = [], filters, groupBy = 'none', resetDragSignal,
  onToggleDone, onEdit, onAddSubtask, onMakeSubtask, onAddTask, onNavigate, emptyHint,
}) => {
  // F2: filtros sobrevivem a navegação/reload (§3). Ordenação e ordem das colunas
  // vivem no useTableColumns (abaixo), também persistidas.
  const [search, setSearch]           = usePersistedState('tasksListFilters:search', '')
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

  // Visibilidade, ordem arrastável (estilo ClickUp, via SortableHeader onMoveColumn)
  // e ordenação — tudo persistido em 'tasksListColumns'.
  const taskVisibility = useTableColumns(TASKS_LIST_COLUMNS, 'tasksListColumns')
  const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'tasksListFilters:advanced')
  const { sortColumn, sortDirection } = taskVisibility
  // Colunas de dado visíveis, na ordem escolhida pelo usuário. 'actions' fica fora e
  // é renderizada por último, fixa, depois do espaçador (§6.1.1).
  const visibleColOrder = useMemo(
    () => taskVisibility.orderedVisibleColumns.filter((k): k is Exclude<ColKey, 'actions'> => k !== 'actions'),
    [taskVisibility.orderedVisibleColumns]
  )

  // §6.1: largura = soma exata das colunas visíveis (nunca w-full com table-layout
  // fixed — o navegador redistribuiria a folga e arrastar uma borda puxaria a vizinha).
  const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'tasksListColWidths')
  const tableTotalWidth = GRIP_COL_WIDTH + CHECK_COL_WIDTH
    + visibleColOrder.reduce((sum, k) => sum + cols.getWidth(k), 0)
    + cols.getWidth('actions')

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
    if (sortColumn) {
      const statusName = (t: TaskRecord) => (statusMap[t.status_id ?? '']?.name ?? t.status).toLowerCase()
      rows = [...rows].sort((a, b) => {
        let av: string | number = '', bv: string | number = ''
        if (sortColumn === 'title')      { av = a.title.toLowerCase(); bv = b.title.toLowerCase() }
        if (sortColumn === 'priority')   { av = a.priority; bv = b.priority }
        if (sortColumn === 'status')     { av = statusName(a); bv = statusName(b) }
        if (sortColumn === 'start_date') { av = a.start_date ?? ''; bv = b.start_date ?? '' }
        if (sortColumn === 'due_date')   { av = a.due_date ?? ''; bv = b.due_date ?? '' }
        if (sortColumn === 'assignee')   { av = (empMap[a.assignee_employee_id ?? '']?.name ?? '').toLowerCase(); bv = (empMap[b.assignee_employee_id ?? '']?.name ?? '').toLowerCase() }
        if (sortColumn === 'project')    { av = (projMap[a.project_id ?? '']?.name ?? '').toLowerCase(); bv = (projMap[b.project_id ?? '']?.name ?? '').toLowerCase() }
        if (sortColumn === 'source')     { av = MODULE_LABEL[a.source_module]?.label ?? a.source_module; bv = MODULE_LABEL[b.source_module]?.label ?? b.source_module }
        if (sortColumn === 'alert')      { av = a.alert_at ?? ''; bv = b.alert_at ?? '' }
        return av < bv ? (sortDirection === 'asc' ? -1 : 1) : av > bv ? (sortDirection === 'asc' ? 1 : -1) : 0
      })
    }
    return rows
  }, [parents, q, fPriority, fStatus, fAssignee, fProject, sortColumn, sortDirection, empMap, projMap, statusMap, statuses, advancedFilters.rules])

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

  // Filtros rápidos: <select> de escopo na escala compacta do §16 (h-9, 6px, text-sm).
  const sel = 'h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer'

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

    const cells: Record<Exclude<ColKey, 'actions'>, React.ReactNode> = {
      // ── Nome ──────────────────────────────────────────────────────────────
      title: (
        <td key="title" className={COL}>
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
              <div className="flex items-center gap-1.5 min-w-0">
                <span title={t.title} className={`block font-normal truncate leading-snug ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                  {t.title}
                </span>
                {t.alert_at && (
                  <span title={`Alerta: ${new Date(t.alert_at).toLocaleString('pt-BR')}`} className="flex-shrink-0">
                    <Bell className={`w-3 h-3 ${new Date(t.alert_at) < new Date() ? 'text-red-400' : 'text-amber-400'}`} />
                  </span>
                )}
              </div>
              {t.description && (
                <div title={t.description} className="block text-xs text-slate-400 truncate mt-0.5">{t.description}</div>
              )}
            </button>
            {children.length > 0 && (
              <span className="text-xs font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-[6px] flex-shrink-0">
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
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${avatarBg(assignee.name)}`}>
                {initials(assignee.name)}
              </div>
              <span title={assignee.name} className="block truncate text-slate-700">{assignee.name}</span>
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
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span title={proj.name} className="block truncate">{proj.name}</span>
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
            <span className={!isDone && isOverdue(t.start_date) ? 'text-red-600' : 'text-slate-600'}>
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
            <span className={!isDone && isOverdue(t.due_date) ? 'text-red-600' : 'text-slate-600'}>
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

      // ── Alerta / Lembrete — texto colorido simples, sem pílula (§8) ───────
      alert: (
        <td key="alert" className={COL}>
          {t.alert_at ? (() => {
            const d = new Date(t.alert_at)
            const past = d < new Date()
            return (
              <span className={`inline-flex items-center gap-1.5 text-sm font-normal ${past ? 'text-red-600' : 'text-amber-700'}`}>
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

      // ── Status — texto colorido + bolinha (§8: sem pílula/fundo/uppercase) ─
      status: (
        <td key="status" className={COL}>
          {taskStatus ? (
            <span className="flex items-center gap-1.5 text-sm font-normal min-w-0" style={{ color: taskStatus.color }}>
              <span
                className="w-2.5 h-2.5 rounded-full border-2 flex-shrink-0"
                style={{ borderColor: taskStatus.color, backgroundColor: taskStatus.is_done ? taskStatus.color : 'transparent' }}
              />
              <span title={taskStatus.name} className="block truncate">{taskStatus.name}</span>
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      ),
    }

    // ── Ações — sempre a última, fixa, depois do espaçador (§6.1.1/§9) ─────
    const actionsCell = (
      <td key="actions" className="px-6 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onAddSubtask(t)}
            title="Adicionar subtarefa"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all whitespace-nowrap"
          >
            + subtarefa
          </button>
          {route && (
            <ActionIconButton kind="view" title="Abrir origem" icon={<ExternalLink className="w-4 h-4" />} onClick={() => onNavigate(route)} />
          )}
        </div>
      </td>
    )

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
            // concluída: só o título é riscado (abaixo); esmaecer a linha inteira
            // (opacity-50) deixava data/responsável/status ilegíveis — reportado 21/09/2026
            depth > 0 ? 'bg-slate-50/50' : 'bg-white',
            isBeingDragged ? 'opacity-20' : 'hover:bg-[#f8f9ff]',
            isDropTarget ? 'bg-blue-50 shadow-[inset_0_0_0_2px_#3b82f6]' : '',
          ].join(' ')}
        >
          {/* Grip */}
          <td className="pl-2 pr-0 py-0">
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
          <td className="px-2 py-0">
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

          {/* Colunas de dado, na ordem arrastada pelo usuário */}
          {visibleColOrder.map(key => cells[key])}
          {/* espaçador — casa com o <col /> sem largura, antes de "Ações" (§6.1.1) */}
          <td aria-hidden="true" className="border-r border-gray-100"></td>
          {actionsCell}
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
          className={`rounded-2xl border p-3.5 transition-all ${isDone ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 shadow-sm'}`}
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
                <span className={`font-bold text-[15px] leading-snug ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
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
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${!isDone && isOverdue(t.due_date) ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                    {!isDone && isOverdue(t.due_date) ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
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
    // grip + checkbox + colunas de dado + espaçador + ações
    const totalCols = 2 + visibleColOrder.length + 2

    return (
      <tr className="group/gh">
        <td colSpan={totalCols} className="p-0">
          <div
            onClick={() => toggleGroup(group.key)}
            className="flex items-center gap-2.5 px-6 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none border-b border-slate-200 transition-colors"
          >
            <span className="text-slate-400 flex-shrink-0 transition-transform">
              {isCollapsed
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronDown  className="w-3.5 h-3.5" />}
            </span>

            {group.color && (
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />
            )}

            <span className="font-semibold text-sm text-slate-800">{group.label}</span>

            <span className="text-xs font-normal text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-[6px] flex-shrink-0">
              {group.tasks.length}
            </span>

            <div className="flex-1 h-px bg-slate-200" />

            {onAddTask && (
              <button
                onClick={e => { e.stopPropagation(); onAddTask(buildDefaults(group.key)) }}
                className="opacity-0 group-hover/gh:opacity-100 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-blue-600 transition-all px-2 py-1 rounded-[6px] hover:bg-blue-50 flex-shrink-0"
              >
                <Plus className="w-3 h-3" /> Tarefa
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const hasRows = filtered.length > 0
  // Sem linhas, o estado vazio (§12) sempre aparece — uma tabela só com o cabeçalho e
  // "+ Adicionar Tarefa" não diz por que está vazia.
  const showEmpty = !loading && !hasRows

  return (
    <div className="space-y-3">
      {/* Zona de soltar — virar tarefa raiz (transitória, só durante o arraste; fica
          fora do card acoplado para não quebrar a costura toolbar/tabela) */}
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
            'flex items-center gap-2 px-4 py-3 rounded-[10px] border-2 border-dashed text-sm font-medium transition-all duration-150',
            dragOverDetach
              ? 'bg-violet-50 border-violet-400 text-violet-700 scale-[1.01]'
              : 'border-slate-300 text-slate-400 bg-slate-50',
          ].join(' ')}
        >
          <CornerLeftUp className="w-4 h-4 flex-shrink-0" />
          Soltar aqui para transformar em tarefa principal
        </div>
      )}

      {/* ── Card acoplado (§5.2): toolbar + tabela num único container ──────── */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-2 border-b border-gray-100 bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5 items-center">
            {/* Busca persistida (§3) */}
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou descrição da tarefa..."
                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} title="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Recorte do módulo — Prazo / Espaço / Pasta / painel Espaços (§5.4) */}
            {filters}

            {/* Filtros rápidos (prioridade/status/responsável/obra) — painel abaixo */}
            <button
              onClick={() => setShowFilters(f => !f)}
              title="Filtros rápidos"
              className={`h-9 flex items-center gap-1.5 px-3 rounded-[6px] text-sm font-medium border transition-all whitespace-nowrap shrink-0 ${
                showFilters || activeFilters
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
            </button>

            <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />

            {(expandableIds.length > 0 || groupBy !== 'none') && (
              <button
                onClick={toggleExpandAll}
                title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
                className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95 shrink-0"
              >
                {allExpanded ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
              </button>
            )}

            {(activeFilters || search) && (
              <button onClick={clearFilters} className="h-9 flex items-center gap-1 px-2 text-sm font-medium text-gray-500 hover:text-red-600 whitespace-nowrap shrink-0">
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}

            <span className="text-sm text-gray-500 whitespace-nowrap shrink-0">
              {filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}
            </span>

            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

            {/* Engrenagem = quais colunas; setas = largura das colunas (§6.1.2) */}
            <ColumnConfigButton
              columns={TASKS_LIST_COLUMNS.filter(c => c.key !== 'actions')}
              visibleColumns={taskVisibility.visibleColumns}
              showColumnConfig={taskVisibility.showColumnConfig}
              onToggleShow={() => taskVisibility.setShowColumnConfig(!taskVisibility.showColumnConfig)}
              onToggleColumn={taskVisibility.toggleColumn}
              onReset={taskVisibility.resetColumns}
            />
            {/* Autofit sob comando explícito, nunca automático (§6.1.2): recalcular a
                cada busca faria as colunas dançarem enquanto o usuário digita. Duplo
                clique no divisor continua sendo "restaurar padrão". */}
            <button
              onClick={() => cols.autoFit()}
              className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
              title="Ajustar largura das colunas ao conteúdo"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>
          </div>

          {showFilters && (
            <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-[10px] p-4">
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
        </div>

      {/* Conteúdo — sem bg/border/rounded/shadow próprios (o card pai já supre) */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Carregando...</p>
        </div>
      ) : showEmpty ? (
        <div className="text-center py-12">
          <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma tarefa encontrada</h3>
          <p className="text-sm text-gray-500">
            {(q || activeFilters) ? 'Tente ajustar a busca ou os filtros.' : (emptyHint?.message ?? 'Nenhuma tarefa neste recorte.')}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {(q || activeFilters) && (
              <button onClick={clearFilters} className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                Limpar busca e filtros
              </button>
            )}
            {!(q || activeFilters) && emptyHint?.action && (
              <button onClick={emptyHint.action.onClick} className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                {emptyHint.action.label}
              </button>
            )}
            {onAddTask && (
              <button onClick={() => onAddTask()} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                <Plus className="w-[15px] h-[15px]" />
                Nova tarefa
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
        {/* ── Desktop: tabela ─────────────────────────────────────────────── */}
        <div className="hidden md:block overflow-auto max-h-[70vh]">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
              <colgroup>
                {/* grip e checkbox: estruturais, largura fixa, sem data-col-key */}
                <col style={{ width: `${GRIP_COL_WIDTH}px` }} />
                <col style={{ width: `${CHECK_COL_WIDTH}px` }} />
                {visibleColOrder.map(key => (
                  <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                ))}
                {/* espaçador sem largura — absorve a folga quando a tabela é mais estreita
                    que o container. ANTES de "Ações" (§6.1.1): depois dela, a sobra ia toda
                    para a direita e a borda de "Ações" andava a cada arraste. */}
                <col />
                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
              </colgroup>
              <thead>
                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  <th className="p-0" />
                  <th className="p-0" />
                  {visibleColOrder.map(key => (
                    <SortableHeader
                      key={key}
                      colKey={key}
                      label={HEADER_LABEL[key]}
                      uppercase={false}
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={taskVisibility.handleColumnSort}
                      onMoveColumn={taskVisibility.moveColumn}
                      className={TH}
                    >
                      <cols.ResizeHandle colKey={key} />
                    </SortableHeader>
                  ))}
                  {/* espaçador — casa com o <col /> sem largura do colgroup, na mesma ordem */}
                  <th aria-hidden="true" className="border-r border-gray-100" />
                  <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                    Ações
                    <cols.ResizeHandle colKey="actions" />
                  </th>
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
                        <td colSpan={2 + visibleColOrder.length + 2} className="px-6 py-1.5 border-b border-slate-100">
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
                    <td colSpan={2 + visibleColOrder.length + 2} className="px-6 py-2">
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

        {/* ── Mobile: cartões (vocabulário de app nativo, fora do §6/§7) ────── */}
        <div className="md:hidden space-y-5 p-4">
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
    </div>
  )
}

export default TasksList
