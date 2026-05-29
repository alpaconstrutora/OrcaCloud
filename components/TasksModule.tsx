import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, CheckSquare, Calendar, AlertTriangle, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import TasksList from './TasksList'
import TaskForm, { type TaskRecord } from './TaskForm'

type FilterView = 'today' | 'all' | 'overdue'

interface Props {
  activeOrganizationId?: string
  onChangeView?: (view: string) => void
}

const TabBtn: React.FC<{
  active: boolean
  icon: React.ElementType
  label: string
  count?: number
  onClick: () => void
}> = ({ active, icon: Icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
      ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
  >
    <Icon className="w-4 h-4" />
    {label}
    {count !== undefined && count > 0 && (
      <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
        {count}
      </span>
    )}
  </button>
)

const TasksModule: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => {
  const [view, setView] = useState<FilterView>('today')
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TaskRecord | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
    if (error) {
      console.error('[tasks] load', error)
      setTasks([])
    } else {
      setTasks((data ?? []) as TaskRecord[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const { today, overdue, all } = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000)

    const open = tasks.filter(t => t.status !== 'done')
    const today = open.filter(t => {
      if (!t.due_date) return false
      const d = new Date(t.due_date)
      return d >= startOfToday && d < endOfToday
    })
    const overdue = open.filter(t => {
      if (!t.due_date) return false
      return new Date(t.due_date) < startOfToday
    })
    return { today, overdue, all: tasks }
  }, [tasks])

  const visible = view === 'today' ? today : view === 'overdue' ? overdue : all

  const toggleDone = async (t: TaskRecord) => {
    const next = t.status === 'done' ? 'open' : 'done'
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', t.id)
    if (error) { console.error(error); load() }
  }

  const handleNavigate = (route: string) => {
    if (onChangeView && route.startsWith('/')) {
      const view = route.replace(/^\//, '').split('/')[0]
      onChangeView(view)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tarefas</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">Sua agenda pessoal de pendências no ORÇACLOUD</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabBtn active={view === 'today'}   icon={Calendar}      label="Hoje"      count={today.length}   onClick={() => setView('today')} />
          <TabBtn active={view === 'overdue'} icon={AlertTriangle} label="Atrasadas" count={overdue.length} onClick={() => setView('overdue')} />
          <TabBtn active={view === 'all'}     icon={ListChecks}    label="Todas"                            onClick={() => setView('all')} />
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            disabled={!activeOrganizationId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Nova
          </button>
        </div>
      </div>

      {!activeOrganizationId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-800">
          Selecione uma organização para criar tarefas.
        </div>
      )}

      {view === 'today' && overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs font-bold text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Você tem <span className="font-black">{overdue.length}</span> tarefa(s) atrasada(s).
          <button
            onClick={() => setView('overdue')}
            className="ml-auto text-red-700 hover:underline font-black uppercase tracking-wider"
          >
            Ver atrasadas
          </button>
        </div>
      )}

      <TasksList
        tasks={visible}
        loading={loading}
        onToggleDone={toggleDone}
        onEdit={(t) => { setEditing(t); setShowForm(true) }}
        onNavigate={handleNavigate}
      />

      {showForm && (
        <TaskForm
          orgId={activeOrganizationId ?? ''}
          task={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

export { CheckSquare }
export default TasksModule
