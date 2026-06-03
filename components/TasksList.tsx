import React, { useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, ExternalLink, Inbox,
  User, Building2, ChevronDown, ChevronRight, Plus,
  ArrowUp, ArrowDown, Search, X, SlidersHorizontal,
  GripVertical, CornerLeftUp,
} from 'lucide-react'
import type { TaskRecord, EmployeeOption, ProjectOption } from './TaskForm'
import type { TaskStatus } from '../services/taskService'

interface Props {
  tasks: TaskRecord[]
  loading: boolean
  employees: EmployeeOption[]
  projects: ProjectOption[]
  statuses?: TaskStatus[]
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onAddSubtask: (parent: TaskRecord) => void
  onMakeSubtask: (taskId: string, newParentId: string | null) => void
  onNavigate: (route: string) => void
}

const PRIORITY_META: Record<number, { label: string; cls: string; bar: string; sort: number }> = {
  1: { label: 'Urgente', cls: 'text-red-700 bg-red-50',      bar: 'bg-red-500',    sort: 1 },
  2: { label: 'Alta',    cls: 'text-orange-700 bg-orange-50', bar: 'bg-orange-400', sort: 2 },
  3: { label: 'Normal',  cls: 'text-slate-600 bg-slate-100',  bar: 'bg-slate-300',  sort: 3 },
  4: { label: 'Baixa',   cls: 'text-blue-700 bg-blue-50',     bar: 'bg-blue-300',   sort: 4 },
}

const MODULE_LABEL: Record<string, { label: string; cls: string }> = {
  manual:      { label: 'Manual',      cls: 'bg-slate-100 text-slate-600' },
  operacional: { label: 'Operacional', cls: 'bg-amber-100 text-amber-700' },
  financeiro:  { label: 'Financeiro',  cls: 'bg-emerald-100 text-emerald-700' },
  rh:          { label: 'RH',          cls: 'bg-purple-100 text-purple-700' },
  compras:     { label: 'Compras',     cls: 'bg-indigo-100 text-indigo-700' },
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function dueDot(iso: string | null): { dot: string; label: string } {
  if (!iso) return { dot: 'bg-slate-200', label: '—' }
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86_400_000)
  if (d < today)     return { dot: 'bg-red-500',    label: fmt(iso) }
  if (d < tomorrow)  return { dot: 'bg-orange-400', label: fmt(iso) }
  return               { dot: 'bg-emerald-400',  label: fmt(iso) }
}

type SortCol = 'title' | 'assignee' | 'project' | 'start_date' | 'due_date' | 'priority' | 'status' | null
type SortDir = 'asc' | 'desc'

const COL  = 'px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap'
const HEAD = 'px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left select-none'

function SortIcon({ col, active, dir }: { col: string; active: SortCol; dir: SortDir }) {
  if (active !== col) return <span className="inline-block w-3 h-3 opacity-0 group-hover/th:opacity-30"><ArrowUp className="w-3 h-3" /></span>
  return dir === 'asc'
    ? <ArrowUp   className="inline-block w-3 h-3 text-blue-600 ml-1" />
    : <ArrowDown className="inline-block w-3 h-3 text-blue-600 ml-1" />
}

const TasksList: React.FC<Props> = ({
  tasks, loading, employees, projects, statuses = [],
  onToggleDone, onEdit, onAddSubtask, onMakeSubtask, onNavigate,
}) => {
  const [search, setSearch]         = useState('')
  const [sortCol, setSortCol]       = useState<SortCol>(null)
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [fPriority, setFPriority]   = useState('')
  const [fStatus, setFStatus]       = useState('')
  const [fAssignee, setFAssignee]   = useState('')
  const [fProject, setFProject]     = useState('')
  const [draggingId, setDraggingId]       = useState<string | null>(null)
  const [dragOverId, setDragOverId]       = useState<string | null>(null)
  const [dragOverDetach, setDragOverDetach] = useState(false)

  const empMap     = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])
  const projMap    = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const statusMap  = useMemo(() => Object.fromEntries(statuses.map(s => [s.id, s])), [statuses])

  // DnD helpers — evita ciclos ao transformar tarefa em subtarefa
  function isDescendant(ancestorId: string, checkId: string): boolean {
    const children = childMap[ancestorId] ?? []
    return children.some(c => c.id === checkId || isDescendant(c.id, checkId))
  }
  function canDrop(draggedId: string, targetId: string): boolean {
    if (draggedId === targetId) return false
    if (isDescendant(draggedId, targetId)) return false // evita ciclo
    const dragged = tasks.find(x => x.id === draggedId)
    if (dragged?.parent_task_id === targetId) return false // já é filho
    return true
  }

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const q = search.toLowerCase()
  const activeFilters = !!(fPriority || fStatus || fAssignee || fProject)

  // Separate parents and children
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

  // Filter + sort parents
  const filtered = useMemo(() => {
    let rows = parents.filter(t => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
      if (fPriority && String(t.priority) !== fPriority) return false
      if (fStatus) {
        if (statuses.length > 0) {
          if (t.status_id !== fStatus) return false
        } else {
          if (t.status !== fStatus) return false
        }
      }
      if (fAssignee && t.assignee_employee_id !== fAssignee) return false
      if (fProject  && t.project_id !== fProject) return false
      return true
    })
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
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return rows
  }, [parents, q, fPriority, fStatus, fAssignee, fProject, sortCol, sortDir, empMap, projMap])

  const clearFilters = () => { setFPriority(''); setFStatus(''); setFAssignee(''); setFProject(''); setSearch('') }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <div className="animate-pulse text-xs font-bold uppercase tracking-widest">Carregando...</div>
    </div>
  )

  const sel = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-blue-400 text-slate-700'

  function TaskRow({ t, depth = 0 }: { t: TaskRecord; depth?: number }) {
    const children = childMap[t.id] ?? []
    const isExpanded = expanded.has(t.id)
    const taskStatus = t.status_id ? statusMap[t.status_id] : null
    const isDone  = taskStatus ? taskStatus.is_done : t.status === 'done'
    const prio    = PRIORITY_META[t.priority] ?? PRIORITY_META[3]
    const mod     = MODULE_LABEL[t.source_module] ?? MODULE_LABEL.manual
    const assignee = t.assignee_employee_id ? empMap[t.assignee_employee_id] : null
    const proj     = t.project_id ? projMap[t.project_id] : null
    const { dot: startDot } = dueDot(t.start_date)
    const { dot: dueDotCls, label: dueLabel } = dueDot(t.due_date)
    const startLabel = fmt(t.start_date)
    const route = t.source_ref?.route
    const indent = depth * 18
    const isBeingDragged = draggingId === t.id
    const isDropTarget   = dragOverId === t.id && draggingId !== null && canDrop(draggingId, t.id)

    return (
      <>
        <tr
          onDragEnd={() => { setDraggingId(null); setDragOverId(null); setDragOverDetach(false) }}
          onDragOver={(e) => { e.preventDefault(); if (draggingId && draggingId !== t.id) setDragOverId(t.id) }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverId(null) }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggingId && canDrop(draggingId, t.id)) {
              onMakeSubtask(draggingId, t.id)
              setExpanded(prev => { const s = new Set(prev); s.add(t.id); return s })
            }
            setDraggingId(null); setDragOverId(null)
          }}
          className={[
            'group transition-all duration-100',
            isDone ? 'opacity-50' : '',
            depth > 0 ? 'bg-slate-50/40' : '',
            isBeingDragged ? 'opacity-25 scale-[0.99]' : 'hover:bg-slate-50/70',
            isDropTarget
              ? 'bg-blue-50 shadow-[inset_0_0_0_2px_#3b82f6]'
              : '',
          ].join(' ')}
        >
          {/* Grip handle */}
          <td className="pl-2 pr-0 py-2.5 w-6">
            <div
              draggable
              onDragStart={(e) => { e.stopPropagation(); setDraggingId(t.id); e.dataTransfer.effectAllowed = 'move' }}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex items-center"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          </td>

          {/* Checkbox */}
          <td className="px-2 py-2.5">
            <button onClick={() => onToggleDone(t)} className="text-slate-300 hover:text-emerald-600 transition-colors">
              {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4" />}
            </button>
          </td>

          {/* Barra prioridade */}
          <td className="py-2.5 pl-0 pr-1.5">
            <div className={`w-1 h-7 rounded-full ${prio.bar}`} />
          </td>

          {/* Título */}
          <td className={COL + ' max-w-[240px]'}>
            <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
              {children.length > 0 ? (
                <button onClick={() => toggleExpand(t.id)} className="flex-shrink-0 text-slate-400 hover:text-slate-700">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-3.5 flex-shrink-0">
                  {depth > 0 && <span className="text-slate-300">↳</span>}
                </span>
              )}
              <button onClick={() => onEdit(t)} className="text-left min-w-0">
                <div className={`font-bold text-slate-900 truncate text-xs ${isDone ? 'line-through' : ''}`}>{t.title}</div>
                {t.description && <div className="text-[11px] text-slate-400 truncate">{t.description}</div>}
              </button>
              {children.length > 0 && (
                <span className="ml-1 text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  {children.length}
                </span>
              )}
            </div>
          </td>

          {/* Responsável */}
          <td className={COL}>
            {assignee
              ? <div className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="truncate max-w-[100px]">{assignee.name}</span></div>
              : <span className="text-slate-300">—</span>}
          </td>

          {/* Obra */}
          <td className={COL}>
            {proj
              ? <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="truncate max-w-[100px]">{proj.name}</span></div>
              : <span className="text-slate-300">—</span>}
          </td>

          {/* Início */}
          <td className={COL}>
            <div className="flex items-center gap-1.5">
              {t.start_date && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${startDot}`} />}
              <span className="text-slate-500">{startLabel}</span>
            </div>
          </td>

          {/* Término */}
          <td className={COL}>
            <div className="flex items-center gap-1.5">
              {t.due_date && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dueDotCls}`} />}
              {t.due_date
                ? <span className={dueDotCls === 'bg-red-500' ? 'text-red-600 font-bold' : dueDotCls === 'bg-orange-400' ? 'text-orange-600 font-bold' : 'text-slate-500'}>{dueLabel}</span>
                : <span className="text-slate-300">—</span>}
            </div>
          </td>

          {/* Prioridade */}
          <td className={COL}>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${prio.cls}`}>{prio.label}</span>
          </td>

          {/* Origem */}
          <td className={COL}>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${mod.cls}`}>{mod.label}</span>
          </td>

          {/* Status customizado */}
          <td className={COL}>
            {taskStatus ? (
              <span
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full w-fit"
                style={{ backgroundColor: taskStatus.color + '20', color: taskStatus.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: taskStatus.color }} />
                {taskStatus.name}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>

          {/* Ações */}
          <td className="px-2 py-2.5">
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button
                onClick={() => onAddSubtask(t)}
                title="Adicionar subtarefa"
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-[11px] font-bold"
              >
                <Plus className="w-3 h-3" />
                subtarefa
              </button>
              {route && (
                <button onClick={() => onNavigate(route)} title="Abrir origem"
                  className="p-1 rounded-md text-slate-300 hover:text-blue-600 hover:bg-blue-50">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </td>
        </tr>

        {/* Subtarefas expandidas — recursivo em qualquer profundidade */}
        {isExpanded && children.map(child => (
          <TaskRow key={child.id} t={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  const ThSort = ({ col, children: label }: { col: SortCol; children: React.ReactNode }) => (
    <th className={HEAD + ' cursor-pointer group/th hover:text-slate-600'} onClick={() => toggleSort(col)}>
      {label}
      <SortIcon col={col!} active={sortCol} dir={sortDir} />
    </th>
  )

  return (
    <div className="space-y-3">
      {/* Barra de busca + filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all
            ${showFilters || activeFilters ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtros
          {activeFilters && <span className="bg-white/20 text-white text-[10px] font-black px-1.5 rounded-md">●</span>}
        </button>
        {(activeFilters || search) && (
          <button onClick={clearFilters} className="text-xs font-bold text-slate-400 hover:text-red-600 flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
        <span className="ml-auto text-[11px] font-bold text-slate-400">{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</span>
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
              : <>
                  <option value="open">Abertas</option>
                  <option value="done">Concluídas</option>
                  <option value="snoozed">Adiadas</option>
                </>
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

      {/* Zona de soltar para virar tarefa raiz — aparece só quando arrasta uma subtarefa */}
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
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <Inbox className="w-12 h-12 mb-3" />
          <p className="font-black text-slate-400">Nenhuma tarefa encontrada</p>
          {(q || activeFilters) && <p className="text-xs mt-1 text-slate-300 font-medium">Tente ajustar a busca ou os filtros</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className={HEAD} style={{ width: 24 }} />
                  <th className={HEAD} style={{ width: 36 }} />
                  <th className={HEAD} style={{ width: 8 }} />
                  <ThSort col="title">Tarefa</ThSort>
                  <ThSort col="assignee">Responsável</ThSort>
                  <ThSort col="project">Obra / Projeto</ThSort>
                  <ThSort col="start_date">Início</ThSort>
                  <ThSort col="due_date">Término</ThSort>
                  <ThSort col="priority">Prioridade</ThSort>
                  <th className={HEAD}>Origem</th>
                  <ThSort col="status">Status</ThSort>
                  <th className={HEAD} style={{ width: 64 }} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(t => <TaskRow key={t.id} t={t} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default TasksList
