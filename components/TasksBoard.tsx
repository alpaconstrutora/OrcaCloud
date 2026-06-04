import React, { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { CheckCircle2, Flag, Plus, Calendar } from 'lucide-react'
import type { TaskRecord, EmployeeOption, ProjectOption, TaskDefaults } from './TaskForm'
import type { TaskStatus } from '../services/taskService'
import type { GroupByField } from './TasksModule'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface BoardColumn { key: string; label: string; color?: string; tasks: TaskRecord[] }

interface Props {
  tasks: TaskRecord[]
  employees: EmployeeOption[]
  projects: ProjectOption[]
  statuses: TaskStatus[]
  groupBy: GroupByField
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onAddTask?: (defaults?: TaskDefaults) => void
  onMoveCard: (taskId: string, newGroupKey: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_META: Record<number, { label: string; flag: string }> = {
  1: { label: 'Urgente', flag: 'text-red-500'    },
  2: { label: 'Alta',    flag: 'text-orange-400' },
  3: { label: 'Normal',  flag: 'text-blue-400'   },
  4: { label: 'Baixa',   flag: 'text-slate-300'  },
}

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
function fmt(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function isOverdue(iso: string | null) {
  if (!iso) return false
  return new Date(iso) < new Date(new Date().toDateString())
}

function buildDefaults(groupKey: string, groupBy: GroupByField): TaskDefaults {
  if (groupKey === '__none__') return {}
  switch (groupBy) {
    case 'status':   return { status_id: groupKey }
    case 'assignee': return { assignee_employee_id: groupKey }
    case 'priority': return { priority: Number(groupKey) }
    case 'project':  return { project_id: groupKey }
    default:         return {}
  }
}

// ── Card arrastável ──────────────────────────────────────────────────────────
function DraggableCard({
  task, employees, projects, statuses, showStatus,
  onToggleDone, onEdit,
}: {
  task: TaskRecord
  employees: Record<string, EmployeeOption>
  projects: Record<string, ProjectOption>
  statuses: Record<string, TaskStatus>
  showStatus: boolean
  onToggleDone: (t: TaskRecord) => void
  onEdit: (t: TaskRecord) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const taskStatus = task.status_id ? statuses[task.status_id] : null
  const isDone     = taskStatus ? taskStatus.is_done : task.status === 'done'
  const prio       = PRIORITY_META[task.priority] ?? PRIORITY_META[3]
  const assignee   = task.assignee_employee_id ? employees[task.assignee_employee_id] : null
  const checkColor = taskStatus?.color ?? (isDone ? '#10b981' : '#94a3b8')

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing transition-all
        ${isDragging ? 'opacity-30 scale-95' : 'hover:shadow-md hover:border-slate-300'}`}
    >
      {/* Barra de prioridade no topo */}
      <div className="h-0.5 rounded-t-xl" style={{ backgroundColor: taskStatus?.color ?? 'transparent' }} />

      <div className="p-3 space-y-2.5">
        {/* Título + checkbox */}
        <div className="flex items-start gap-2">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onToggleDone(task) }}
            className="mt-0.5 flex-shrink-0"
          >
            {isDone ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: checkColor }} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-dashed" style={{ borderColor: checkColor }} />
            )}
          </button>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            className="text-left min-w-0"
          >
            <p className={`text-sm font-medium text-slate-900 leading-snug ${isDone ? 'line-through text-slate-400' : ''}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>
            )}
          </button>
        </div>

        {/* Footer do card */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Flag prioridade */}
          <Flag className={`w-3 h-3 fill-current flex-shrink-0 ${prio.flag}`} />

          {/* Vencimento */}
          {task.due_date && (
            <span className={`flex items-center gap-1 text-[11px] font-medium ${isOverdue(task.due_date) ? 'text-red-500' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3" />
              {fmt(task.due_date)}
            </span>
          )}

          {/* Status badge (quando não está agrupado por status) */}
          {showStatus && taskStatus && (
            <span
              className="ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded"
              style={{ backgroundColor: taskStatus.color + '20', color: taskStatus.color }}
            >
              {taskStatus.name}
            </span>
          )}

          {/* Avatar responsável */}
          {assignee && !showStatus && (
            <div className={`ml-auto w-5 h-5 rounded-full text-[9px] font-black text-white flex items-center justify-center ${avatarBg(assignee.name)}`}>
              {initials(assignee.name)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Coluna droppável ─────────────────────────────────────────────────────────
function DroppableColumn({
  col, empMap, projMap, statusMap, showStatus, groupBy,
  onToggleDone, onEdit, onAddTask,
}: {
  col: BoardColumn
  empMap: Record<string, EmployeeOption>
  projMap: Record<string, ProjectOption>
  statusMap: Record<string, TaskStatus>
  showStatus: boolean
  groupBy: GroupByField
  onToggleDone: (t: TaskRecord) => void
  onEdit: (t: TaskRecord) => void
  onAddTask?: (defaults?: TaskDefaults) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })

  return (
    <div className="flex flex-col w-[270px] flex-shrink-0">
      {/* Header da coluna */}
      <div className="flex items-center gap-2 px-1 pb-2 mb-1">
        {col.color && (
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: col.color }} />
        )}
        <span className="font-black text-xs uppercase tracking-wider text-slate-700">{col.label}</span>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {col.tasks.length}
        </span>
        {onAddTask && (
          <button
            onClick={() => onAddTask(buildDefaults(col.key, groupBy))}
            className="ml-auto p-1 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-colors
          ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-slate-50/60'}`}
      >
        {col.tasks.map(t => (
          <DraggableCard
            key={t.id}
            task={t}
            employees={empMap}
            projects={projMap}
            statuses={statusMap}
            showStatus={showStatus}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
          />
        ))}

        {col.tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-slate-300 font-medium">
            Nenhuma tarefa
          </div>
        )}
      </div>

      {/* Footer da coluna */}
      {onAddTask && (
        <button
          onClick={() => onAddTask(buildDefaults(col.key, groupBy))}
          className="mt-2 flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors font-medium w-full"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
        </button>
      )}
    </div>
  )
}

// ── Board principal ──────────────────────────────────────────────────────────
const TasksBoard: React.FC<Props> = ({
  tasks, employees, projects, statuses,
  groupBy, onToggleDone, onEdit, onAddTask, onMoveCard,
}) => {
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const empMap    = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])
  const projMap   = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const statusMap = useMemo(() => Object.fromEntries(statuses.map(s => [s.id, s])), [statuses])

  // Apenas tarefas raiz
  const rootTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks])

  const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#94a3b8' }

  const columns: BoardColumn[] = useMemo(() => {
    const map = new Map<string, BoardColumn>()

    for (const t of rootTasks) {
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
        default: key = '__all__'; label = 'Todas'
      }

      if (!map.has(key)) map.set(key, { key, label, color, tasks: [] })
      map.get(key)!.tasks.push(t)
    }

    // Ordem estável para status e prioridade
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
  }, [rootTasks, groupBy, statusMap, empMap, projMap, statuses])

  function onDragStart({ active }: DragStartEvent) {
    setActiveTask(tasks.find(t => t.id === active.id) ?? null)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    // `over.id` é a key da coluna de destino
    const targetColKey = String(over.id)
    const sourceTask   = tasks.find(t => t.id === active.id)
    if (!sourceTask) return

    // Verifica se o card já está nessa coluna
    const currentKey = getTaskGroupKey(sourceTask)
    if (currentKey === targetColKey) return

    onMoveCard(String(active.id), targetColKey)
  }

  function getTaskGroupKey(t: TaskRecord): string {
    switch (groupBy) {
      case 'status':   return t.status_id ?? '__none__'
      case 'assignee': return t.assignee_employee_id ?? '__none__'
      case 'priority': return String(t.priority)
      case 'project':  return t.project_id ?? '__none__'
      default:         return '__all__'
    }
  }

  const showStatus = groupBy !== 'status'

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-[400px]">
        {columns.map(col => (
          <DroppableColumn
            key={col.key}
            col={col}
            empMap={empMap}
            projMap={projMap}
            statusMap={statusMap}
            showStatus={showStatus}
            groupBy={groupBy}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
            onAddTask={onAddTask}
          />
        ))}

        {columns.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-300 text-sm font-medium">
            Nenhuma tarefa para exibir
          </div>
        )}
      </div>

      {/* Ghost card durante drag */}
      <DragOverlay>
        {activeTask && (
          <div className="bg-white rounded-xl border border-blue-300 shadow-2xl p-3 w-[260px] rotate-2 opacity-90">
            <p className="text-sm font-medium text-slate-900 truncate">{activeTask.title}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default TasksBoard
