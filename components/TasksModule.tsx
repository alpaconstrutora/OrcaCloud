import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, CheckSquare, Calendar, AlertTriangle, ListChecks, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import TasksList from './TasksList'
import TaskForm, { type TaskRecord, type EmployeeOption, type ProjectOption, type OrgOption } from './TaskForm'

type FilterView = 'today' | 'all' | 'overdue'

interface Props {
  activeOrganizationId?: string
  organizations?: OrgOption[]
  projects?: Array<{ id: string; name: string; settings?: { organizationId?: string; classification?: string; isSystemProject?: boolean } }>
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

const TasksModule: React.FC<Props> = ({ activeOrganizationId, organizations = [], projects = [], onChangeView }) => {
  const [view, setView]               = useState<FilterView>('today')
  const [tasks, setTasks]             = useState<TaskRecord[]>([])
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState<TaskRecord | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [filterOrg, setFilterOrg]     = useState<string>(activeOrganizationId ?? '')
  const [employees, setEmployees]     = useState<EmployeeOption[]>([])
  const [parentTask, setParentTask]   = useState<TaskRecord | null>(null)

  // Carrega tarefas
  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase
      .from('tasks')
      .select('*')
      .order('status',    { ascending: true })
      .order('due_date',  { ascending: true, nullsFirst: false })
      .order('priority',  { ascending: true })

    const { data, error } = await q
    if (error) { console.error('[tasks] load', error); setTasks([]) }
    else        { setTasks((data ?? []) as TaskRecord[]) }
    setLoading(false)
  }, [])

  // Carrega colaboradores da org selecionada para o form
  const loadEmployees = useCallback(async (orgId: string) => {
    if (!orgId) { setEmployees([]); return }
    const { data } = await supabase
      .from('employees')
      .select('id, name, role')
      .eq('org_id', orgId)
      .eq('status', 'ATIVO')
      .order('name')
    setEmployees((data ?? []) as EmployeeOption[])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadEmployees(filterOrg || activeOrganizationId || '') }, [filterOrg, activeOrganizationId, loadEmployees])

  // Obras disponíveis filtradas pela org selecionada (apenas classification === 'OBRA')
  const obras: ProjectOption[] = useMemo(() => {
    const orgId = filterOrg || activeOrganizationId
    return projects
      .filter(p => {
        const s = p.settings
        if (!s) return false
        if (s.classification !== 'OBRA') return false
        if (s.isSystemProject) return false
        if (orgId && s.organizationId && s.organizationId !== orgId) return false
        return true
      })
      .map(p => ({ id: p.id, name: p.name }))
  }, [projects, filterOrg, activeOrganizationId])

  // Filtros de tabs (Hoje/Atrasadas/Todas) — operam sobre pais, mantém subtarefas agrupadas
  const { today, overdue, visible } = useMemo(() => {
    const now          = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday   = new Date(startOfToday.getTime() + 86_400_000)

    let byOrg = tasks
    if (filterOrg) byOrg = byOrg.filter(t => t.org_id === filterOrg)

    const parents = byOrg.filter(t => !t.parent_task_id)
    const open    = parents.filter(t => t.status !== 'done')
    const today   = open.filter(t => {
      if (!t.due_date) return false
      const d = new Date(t.due_date)
      return d >= startOfToday && d < endOfToday
    })
    const overdue = open.filter(t => {
      if (!t.due_date) return false
      return new Date(t.due_date) < startOfToday
    })

    const visibleParents = view === 'today' ? today : view === 'overdue' ? overdue : parents
    const parentIds = new Set(visibleParents.map(t => t.id))
    const subtasks  = byOrg.filter(t => t.parent_task_id && parentIds.has(t.parent_task_id))
    const visible   = [...visibleParents, ...subtasks]

    return { today, overdue, visible }
  }, [tasks, filterOrg, view])

  const orgForNew = filterOrg || activeOrganizationId || ''

  const toggleDone = async (t: TaskRecord) => {
    const next = t.status === 'done' ? 'open' : 'done'
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', t.id)
    if (error) { console.error(error); load() }
  }

  const handleNavigate = (route: string) => {
    if (onChangeView && route.startsWith('/')) {
      onChangeView(route.replace(/^\//, '').split('/')[0])
    }
  }

  const orgsOptions: OrgOption[] = organizations.length
    ? organizations
    : activeOrganizationId
      ? [{ id: activeOrganizationId, name: 'Minha Organização' }]
      : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tarefas</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">Sua agenda pessoal de pendências</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabBtn active={view === 'today'}   icon={Calendar}      label="Hoje"      count={today.length}   onClick={() => setView('today')} />
          <TabBtn active={view === 'overdue'} icon={AlertTriangle} label="Atrasadas" count={overdue.length} onClick={() => setView('overdue')} />
          <TabBtn active={view === 'all'}     icon={ListChecks}    label="Todas"                            onClick={() => setView('all')} />
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            disabled={!orgForNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Nova
          </button>
        </div>
      </div>

      {/* Filtro de organização */}
      {orgsOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="text-xs font-bold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
          >
            <option value="">Todas as organizações</option>
            {orgsOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Aviso sem org */}
      {!orgForNew && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-800">
          Selecione uma organização para criar tarefas.
        </div>
      )}

      {/* Banner atrasadas */}
      {view === 'today' && overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs font-bold text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Você tem <span className="font-black">{overdue.length}</span> tarefa(s) atrasada(s).
          <button onClick={() => setView('overdue')} className="ml-auto font-black uppercase tracking-wider hover:underline">
            Ver atrasadas
          </button>
        </div>
      )}

      <TasksList
        tasks={visible}
        loading={loading}
        employees={employees}
        projects={obras}
        onToggleDone={toggleDone}
        onEdit={(t) => { loadEmployees(t.org_id); setEditing(t); setParentTask(null); setShowForm(true) }}
        onAddSubtask={(parent) => { loadEmployees(parent.org_id); setEditing(null); setParentTask(parent); setShowForm(true) }}
        onNavigate={handleNavigate}
      />

      {showForm && (
        <TaskForm
          orgId={parentTask?.org_id ?? orgForNew}
          orgs={orgsOptions}
          employees={employees}
          projects={obras}
          task={editing}
          parentTaskId={parentTask?.id ?? null}
          parentTaskTitle={parentTask?.title ?? null}
          onClose={() => { setShowForm(false); setParentTask(null) }}
          onOrgChange={(id) => loadEmployees(id)}
          onSaved={() => { setShowForm(false); setParentTask(null); load() }}
        />
      )}
    </div>
  )
}

export { CheckSquare }
export default TasksModule
