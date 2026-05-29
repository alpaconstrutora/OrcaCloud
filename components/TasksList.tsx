import React from 'react'
import { CheckCircle2, Circle, Clock, AlertCircle, ExternalLink, Inbox } from 'lucide-react'
import type { TaskRecord } from './TaskForm'

interface Props {
  tasks: TaskRecord[]
  loading: boolean
  onToggleDone: (task: TaskRecord) => void
  onEdit: (task: TaskRecord) => void
  onNavigate: (route: string) => void
}

const PRIORITY_BAR: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-slate-300',
  4: 'bg-blue-300',
}

const MODULE_LABEL: Record<string, { label: string; cls: string }> = {
  manual:      { label: 'Manual',      cls: 'bg-slate-100 text-slate-600' },
  operacional: { label: 'Operacional', cls: 'bg-amber-100 text-amber-700' },
  financeiro:  { label: 'Financeiro',  cls: 'bg-emerald-100 text-emerald-700' },
  rh:          { label: 'RH',          cls: 'bg-purple-100 text-purple-700' },
  compras:     { label: 'Compras',     cls: 'bg-indigo-100 text-indigo-700' },
}

function formatDue(iso: string | null): { text: string; cls: string; icon: React.ElementType } {
  if (!iso) return { text: 'Sem prazo', cls: 'text-slate-400', icon: Clock }
  const due = new Date(iso)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  const sameDay = due.toDateString() === now.toDateString()

  if (diffMs < 0 && !sameDay) return { text: `Atrasada ${Math.abs(diffDays)}d`, cls: 'text-red-600', icon: AlertCircle }
  if (sameDay) {
    const hh = String(due.getHours()).padStart(2, '0')
    const mm = String(due.getMinutes()).padStart(2, '0')
    return { text: `Hoje ${hh}:${mm}`, cls: 'text-orange-600', icon: Clock }
  }
  if (diffDays === 1) return { text: 'Amanhã', cls: 'text-blue-600', icon: Clock }
  if (diffDays < 7) return { text: `Em ${diffDays}d`, cls: 'text-slate-600', icon: Clock }
  return { text: due.toLocaleDateString('pt-BR'), cls: 'text-slate-500', icon: Clock }
}

const TasksList: React.FC<Props> = ({ tasks, loading, onToggleDone, onEdit, onNavigate }) => {
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

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
      {tasks.map(t => {
        const due = formatDue(t.due_date)
        const mod = MODULE_LABEL[t.source_module] ?? MODULE_LABEL.manual
        const route = t.source_ref?.route
        const isDone = t.status === 'done'
        const DueIcon = due.icon

        return (
          <div
            key={t.id}
            className={`group flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors
              ${isDone ? 'opacity-50' : ''}`}
          >
            <div className={`w-1 h-10 rounded-full flex-shrink-0 ${PRIORITY_BAR[t.priority]}`} />

            <button
              onClick={() => onToggleDone(t)}
              className="flex-shrink-0 text-slate-300 hover:text-emerald-600 transition-colors"
              aria-label={isDone ? 'Reabrir' : 'Concluir'}
            >
              {isDone
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <Circle className="w-5 h-5" />}
            </button>

            <button
              onClick={() => onEdit(t)}
              className="flex-1 min-w-0 text-left"
            >
              <div className={`font-bold text-sm text-slate-900 truncate ${isDone ? 'line-through' : ''}`}>
                {t.title}
              </div>
              {t.description && (
                <div className="text-xs text-slate-400 truncate font-medium">{t.description}</div>
              )}
            </button>

            <div className={`flex items-center gap-1 text-[11px] font-bold whitespace-nowrap ${due.cls}`}>
              <DueIcon className="w-3.5 h-3.5" />
              {due.text}
            </div>

            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${mod.cls}`}>
              {mod.label}
            </span>

            {route && (
              <button
                onClick={() => onNavigate(route)}
                title="Abrir origem"
                className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TasksList
