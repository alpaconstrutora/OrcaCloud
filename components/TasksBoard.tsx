import React, { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { CheckCircle2, Plus, Calendar, CheckSquare, AlertTriangle } from 'lucide-react'
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
const PRIORITY_BADGE: Record<number, { label: string; bg: string; color: string }> = {
  1: { label: 'URGENTE', bg: '#fee2e2', color: '#dc2626' },
  2: { label: 'ALTA',    bg: '#ffedd5', color: '#ea580c' },
  3: { label: 'NORMAL',  bg: '#dbeafe', color: '#2563eb' },
  4: { label: 'BAIXA',   bg: '#f0fdf4', color: '#16a34a' },
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
  task, subtasks, employees, statuses, showStatus,
  onToggleDone, onEdit,
}: {
  task: TaskRecord
  subtasks: TaskRecord[]
  employees: Record<string, EmployeeOption>
  statuses: Record<string, TaskStatus>
  showStatus: boolean
  onToggleDone: (t: TaskRecord) => void
  onEdit: (t: TaskRecord) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const taskStatus = task.status_id ? statuses[task.status_id] : null
  const isDone     = taskStatus ? taskStatus.is_done : task.status === 'done'
  const prio       = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE[3]
  const assignee   = task.assignee_employee_id ? employees[task.assignee_employee_id] : null
  const checkColor = taskStatus?.color ?? (isDone ? '#10b981' : '#94a3b8')
  const doneSubCount = subtasks.filter(s => {
    const ss = s.status_id ? statuses[s.status_id] : null
    return ss ? ss.is_done : s.status === 'done'
  }).length

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing transition-all select-none
        ${isDragging ? 'opacity-20 scale-95' : 'hover:shadow-md hover:border-slate-300'}`}
    >
      {/* Faixa colorida do status no topo */}
      {taskStatus?.color && (
        <div className="h-1 rounded-t-2xl" style={{ backgroundColor: taskStatus.color }} />
      )}

      <div className="p-3.5 space-y-3">
        {/* Badge de prioridade + checkbox done */}
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
            style={{ backgroundColor: prio.bg, color: prio.color }}
          >
            {prio.label}
          </span>

          {/* Status badge (quando não agrupado por status) */}
          {showStatus && taskStatus && (
            <span
              className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md"
              style={{ backgroundColor: taskStatus.color + '22', color: taskStatus.color }}
            >
              {taskStatus.name}
            </span>
          )}
        </div>

        {/* Título + checkbox */}
        <div className="flex items-start gap-2.5">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onToggleDone(task) }}
            className="mt-0.5 flex-shrink-0"
            title={isDone ? 'Reabrir' : 'Concluir'}
          >
            {isDone ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: checkColor }} />
            ) : (
              <div
                className="w-4 h-4 rounded-full border-2 border-dashed hover:border-solid transition-all"
                style={{ borderColor: checkColor }}
              />
            )}
          </button>

          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            className="text-left min-w-0 flex-1"
          >
            <p className={`text-sm font-bold text-slate-900 leading-snug ${isDone ? 'line-through text-slate-400' : ''}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}
          </button>
        </div>

        {/* Subtarefas */}
        {subtasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                {doneSubCount}/{subtasks.length} subtarefa{subtasks.length !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Barra de progresso */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: subtasks.length > 0 ? `${(doneSubCount / subtasks.length) * 100}%` : '0%',
                  backgroundColor: taskStatus?.color ?? '#10b981',
                }}
              />
            </div>
            {/* Primeiras 2 subtarefas */}
            {subtasks.slice(0, 2).map(sub => {
              const subDone = (() => {
                const ss = sub.status_id ? statuses[sub.status_id] : null
                return ss ? ss.is_done : sub.status === 'done'
              })()
              return (
                <div key={sub.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center
                    ${subDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}
                  >
                    {subDone && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`truncate ${subDone ? 'line-through text-slate-300' : ''}`}>{sub.title}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer: avatar + data */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Avatar */}
          {assignee ? (
            <div
              className={`w-6 h-6 rounded-full text-[10px] font-black text-white flex items-center justify-center flex-shrink-0 ${avatarBg(assignee.name)}`}
              title={assignee.name}
            >
              {initials(assignee.name)}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-200 flex-shrink-0" />
          )}

          {/* Botão adicionar responsável (placeholder visual) */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            className="w-5 h-5 rounded-full border border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 transition-colors flex-shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>

          <div className="flex-1" />

          {/* Vencimento */}
          {task.due_date && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg
              ${isOverdue(task.due_date) ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}
            >
              {isOverdue(task.due_date) ? <AlertTriangle className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
              {fmt(task.due_date)}
            </span>
          )}

          {/* Contagem de subtarefas no rodapé (quando não há lista acima) */}
          {subtasks.length === 0 && (
            <span className="text-[11px] text-slate-300 font-medium">
              {/* espaço reservado */}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Coluna droppável ─────────────────────────────────────────────────────────
function DroppableColumn({
  col, empMap, statusMap, showStatus, groupBy,
  childMap,
  onToggleDone, onEdit, onAddTask,
}: {
  col: BoardColumn
  empMap: Record<string, EmployeeOption>
  statusMap: Record<string, TaskStatus>
  showStatus: boolean
  groupBy: GroupByField
  childMap: Record<string, TaskRecord[]>
  onToggleDone: (t: TaskRecord) => void
  onEdit: (t: TaskRecord) => void
  onAddTask?: (defaults?: TaskDefaults) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })

  return (
    <div className="flex flex-col w-[280px] flex-shrink-0">
      {/* Header da coluna */}
      <div className="flex items-center gap-2 px-1 pb-3">
        {col.color && (
          <span
            className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white ring-offset-0"
            style={{ backgroundColor: col.color }}
          />
        )}
        <span className="font-black text-xs uppercase tracking-widest text-slate-700 flex-1">{col.label}</span>
        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          {col.tasks.length}
        </span>
        {onAddTask && (
          <button
            onClick={() => onAddTask(buildDefaults(col.key, groupBy))}
            className="p-1 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-2xl p-2 space-y-2.5 transition-colors
          ${isOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : 'bg-slate-50/70'}`}
      >
        {col.tasks.map(t => (
          <DraggableCard
            key={t.id}
            task={t}
            subtasks={childMap[t.id] ?? []}
            employees={empMap}
            statuses={statusMap}
            showStatus={showStatus}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
          />
        ))}

        {col.tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-slate-300 font-medium">
            Sem tarefas
          </div>
        )}
      </div>

      {/* Footer "+ Adicionar tarefa" */}
      {onAddTask && (
        <button
          onClick={() => onAddTask(buildDefaults(col.key, groupBy))}
          className="mt-2 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors w-full"
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

  const rootTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks])

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

  const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#16a34a' }

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
          key = String(t.priority); label = PRIORITY_BADGE[t.priority]?.label ?? 'Normal'
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
    const targetColKey = String(over.id)
    const sourceTask   = tasks.find(t => t.id === active.id)
    if (!sourceTask) return
    if (getTaskGroupKey(sourceTask) === targetColKey) return
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
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1 min-h-[500px]">
        {columns.map(col => (
          <DroppableColumn
            key={col.key}
            col={col}
            empMap={empMap}
            statusMap={statusMap}
            showStatus={showStatus}
            groupBy={groupBy}
            childMap={childMap}
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

      <DragOverlay>
        {activeTask && (
          <div className="bg-white rounded-2xl border border-blue-300 shadow-2xl p-3.5 w-[272px] rotate-2 opacity-95">
            <p className="text-sm font-bold text-slate-900 truncate">{activeTask.title}</p>
            {activeTask.description && (
              <p className="text-xs text-slate-400 mt-1 truncate">{activeTask.description}</p>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default TasksBoard
