import React from 'react'
import { CheckCircle2, Circle, Clock, AlertCircle, ExternalLink, Inbox, User, Building2 } from 'lucide-react'
import type { TaskRecord, EmployeeOption, ProjectOption } from './TaskForm'

interface Props {
  tasks: TaskRecord[]
  loading: boolean
  employees: EmployeeOption[]
  projects: ProjectOption[]
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onNavigate: (route: string) => void
}

const PRIORITY_LABEL: Record<number, { label: string; cls: string; bar: string }> = {
  1: { label: 'Urgente', cls: 'text-red-700 bg-red-50',     bar: 'bg-red-500' },
  2: { label: 'Alta',    cls: 'text-orange-700 bg-orange-50', bar: 'bg-orange-400' },
  3: { label: 'Normal',  cls: 'text-slate-600 bg-slate-100', bar: 'bg-slate-300' },
  4: { label: 'Baixa',   cls: 'text-blue-700 bg-blue-50',   bar: 'bg-blue-300' },
}

const MODULE_LABEL: Record<string, { label: string; cls: string }> = {
  manual:      { label: 'Manual',      cls: 'bg-slate-100 text-slate-600' },
  operacional: { label: 'Operacional', cls: 'bg-amber-100 text-amber-700' },
  financeiro:  { label: 'Financeiro',  cls: 'bg-emerald-100 text-emerald-700' },
  rh:          { label: 'RH',          cls: 'bg-purple-100 text-purple-700' },
  compras:     { label: 'Compras',     cls: 'bg-indigo-100 text-indigo-700' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function dueMeta(iso: string | null): { text: string; cls: string; icon: React.ElementType } {
  if (!iso) return { text: '—', cls: 'text-slate-400', icon: Clock }
  const due = new Date(iso)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  const sameDay = due.toDateString() === now.toDateString()
  if (diffMs < 0 && !sameDay) return { text: `Atrasada ${Math.abs(diffDays)}d`, cls: 'text-red-600 font-bold', icon: AlertCircle }
  if (sameDay) {
    const hh = String(due.getHours()).padStart(2, '0')
    const mm = String(due.getMinutes()).padStart(2, '0')
    return { text: `Hoje ${hh}:${mm}`, cls: 'text-orange-600 font-bold', icon: Clock }
  }
  if (diffDays === 1) return { text: 'Amanhã', cls: 'text-blue-600', icon: Clock }
  if (diffDays < 7)  return { text: `Em ${diffDays}d`, cls: 'text-slate-600', icon: Clock }
  return { text: due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), cls: 'text-slate-500', icon: Clock }
}

const COL = 'px-3 py-3 text-xs text-slate-700 whitespace-nowrap'
const HEAD = 'px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left'

const TasksList: React.FC<Props> = ({ tasks, loading, employees, projects, onToggleDone, onEdit, onNavigate }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <div className="animate-pulse text-xs font-bold uppercase tracking-widest">Carregando...</div>
      </div>
    )
  }

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-300">
        <Inbox className="w-12 h-12 mb-3" />
        <p className="font-black text-slate-400">Nenhuma tarefa</p>
        <p className="text-xs mt-1 font-medium text-slate-300">Aproveite o silêncio</p>
      </div>
    )
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))
  const projMap = Object.fromEntries(projects.map(p => [p.id, p]))

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className={HEAD} style={{ width: 32 }}></th>
              <th className={HEAD} style={{ width: 8 }}></th>
              <th className={HEAD}>Tarefa</th>
              <th className={HEAD}>Responsável</th>
              <th className={HEAD}>Obra / Projeto</th>
              <th className={HEAD}>Início</th>
              <th className={HEAD}>Prazo</th>
              <th className={HEAD}>Prioridade</th>
              <th className={HEAD}>Origem</th>
              <th className={HEAD} style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tasks.map(t => {
              const due      = dueMeta(t.due_date)
              const prio     = PRIORITY_LABEL[t.priority] ?? PRIORITY_LABEL[3]
              const mod      = MODULE_LABEL[t.source_module] ?? MODULE_LABEL.manual
              const assignee = t.assignee_employee_id ? empMap[t.assignee_employee_id] : null
              const proj     = t.project_id ? projMap[t.project_id] : null
              const isDone   = t.status === 'done'
              const DueIcon  = due.icon
              const route    = t.source_ref?.route

              return (
                <tr
                  key={t.id}
                  className={`group hover:bg-slate-50/70 transition-colors ${isDone ? 'opacity-50' : ''}`}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => onToggleDone(t)}
                      className="flex-shrink-0 text-slate-300 hover:text-emerald-600 transition-colors"
                    >
                      {isDone
                        ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                        : <Circle className="w-4.5 h-4.5" />}
                    </button>
                  </td>

                  {/* Barra de prioridade */}
                  <td className="py-3 pl-0 pr-2">
                    <div className={`w-1 h-8 rounded-full ${prio.bar}`} />
                  </td>

                  {/* Título + descrição */}
                  <td className={COL + ' max-w-[260px]'}>
                    <button onClick={() => onEdit(t)} className="text-left w-full">
                      <div className={`font-bold text-slate-900 truncate ${isDone ? 'line-through' : ''}`}>
                        {t.title}
                      </div>
                      {t.description && (
                        <div className="text-[11px] text-slate-400 truncate">{t.description}</div>
                      )}
                    </button>
                  </td>

                  {/* Responsável */}
                  <td className={COL}>
                    {assignee
                      ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-[110px]">{assignee.name}</span>
                        </div>
                      )
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Obra */}
                  <td className={COL}>
                    {proj
                      ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-[110px]">{proj.name}</span>
                        </div>
                      )
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Início */}
                  <td className={COL + ' text-slate-500'}>{formatDate(t.start_date)}</td>

                  {/* Prazo */}
                  <td className={COL}>
                    <div className={`flex items-center gap-1 text-[11px] ${due.cls}`}>
                      <DueIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      {due.text}
                    </div>
                  </td>

                  {/* Prioridade */}
                  <td className={COL}>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${prio.cls}`}>
                      {prio.label}
                    </span>
                  </td>

                  {/* Origem */}
                  <td className={COL}>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${mod.cls}`}>
                      {mod.label}
                    </span>
                  </td>

                  {/* Ação origem */}
                  <td className="px-2 py-3">
                    {route && (
                      <button
                        onClick={() => onNavigate(route)}
                        title="Abrir origem"
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TasksList
