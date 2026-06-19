import React, { useEffect, useState } from 'react'
import {
  Bell, Calendar, AlertTriangle, Plus, LayoutGrid,
  ListChecks, ChevronRight, Loader2, Flag, Search,
  SlidersHorizontal, AlignLeft, Columns2, Layers,
  Settings2, Building2, Menu, CheckCircle2, X,
  Save, ArrowLeft, FolderOpen,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string
  title: string
  due_date: string | null
  priority: number
  status: 'open' | 'done' | 'snoozed'
  status_id: string | null
  source_module: string
  space_id: string | null
  project_id: string | null
  alert_at: string | null
  parent_task_id: string | null
}

interface TaskStatus {
  id: string
  name: string
  color: string
  is_done: boolean
}

interface Space {
  id: string
  name: string
  color: string
  task_count?: number
}

interface Project {
  id: string
  name: string
}

interface Props {
  orgId?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_FLAG: Record<number, { color: string; label: string }> = {
  1: { color: 'text-red-500',    label: 'Urgente' },
  2: { color: 'text-orange-400', label: 'Alta'    },
  3: { color: 'text-blue-400',   label: 'Normal'  },
  4: { color: 'text-slate-300',  label: 'Baixa'   },
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function isOverdue(iso: string | null) {
  if (!iso) return false
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return due < today
}

function isToday(iso: string | null) {
  if (!iso) return false
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  return due >= today && due < tomorrow
}

type FilterView = 'hoje' | 'atrasadas' | 'todas'
type NavTab = 'inbox' | 'espacos'

// ── Task Card ─────────────────────────────────────────────────────────────────
const TaskCard: React.FC<{
  task: Task
  statuses: TaskStatus[]
  spaces: Space[]
  projects: Project[]
  onToggle: (id: string) => void
  onAddSubtask: () => void
}> = ({ task, statuses, spaces, projects, onToggle }) => {
  const overdue   = isOverdue(task.due_date)
  const pFlag     = PRIORITY_FLAG[task.priority] ?? PRIORITY_FLAG[3]
  const status    = statuses.find(s => s.id === task.status_id)
  const spaceName = spaces.find(s => s.id === task.space_id)?.name
  const projName  = projects.find(p => p.id === task.project_id)?.name

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 pt-4 pb-3 space-y-2">
      <div className="flex items-start gap-3">
        {/* Dashed circle checkbox */}
        <button
          onClick={() => onToggle(task.id)}
          className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all"
          style={{ border: '2px dashed #94a3b8' }}
        />

        {/* Title + alert bell */}
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          <p className="text-sm font-bold text-slate-800 leading-snug flex-1">{task.title}</p>
          {task.alert_at && <Bell className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />}
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        {task.due_date && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border
            ${overdue ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
            <Calendar className="w-3 h-3" />
            {fmtDate(task.due_date)}
          </span>
        )}

        {task.priority <= 2 && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-50 border border-slate-100 ${pFlag.color}`}>
            <Flag className="w-3 h-3" />
            {pFlag.label}
          </span>
        )}

        {status && (
          <span
            className="px-2 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wide"
            style={{ backgroundColor: status.color + '22', color: status.color }}
          >
            {status.name}
          </span>
        )}

        {!status && (
          <span className="px-2 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wide bg-slate-100 text-slate-500">
            {task.status === 'done' ? 'Concluída' : 'Aberta'}
          </span>
        )}
      </div>

      {/* Space / projeto */}
      {(spaceName || projName) && (
        <div className="flex items-center gap-1.5 pl-8">
          <Building2 className="w-3 h-3 text-slate-300 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 font-medium truncate">
            {projName ?? spaceName}
          </span>
        </div>
      )}

      {/* + Subtarefa */}
      <div className="pl-8 pt-0.5">
        <button className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-blue-500 transition-colors">
          <Plus className="w-3 h-3" />
          Subtarefa
        </button>
      </div>
    </div>
  )
}

// ── Espaços screen ────────────────────────────────────────────────────────────
const EspacosScreen: React.FC<{
  spaces: Space[]
  loading: boolean
  onSelect: (s: Space) => void
}> = ({ spaces, loading, onSelect }) => (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
    {loading ? (
      <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
    ) : spaces.length === 0 ? (
      <div className="flex flex-col items-center py-16 gap-3">
        <LayoutGrid className="w-10 h-10 text-slate-200" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhum espaço</p>
      </div>
    ) : spaces.map(space => (
      <button
        key={space.id}
        onClick={() => onSelect(space)}
        className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
      >
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: space.color + '22' }}>
          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: space.color }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{space.name}</p>
          <p className="text-[11px] text-slate-400 font-medium">{space.task_count ?? 0} tarefa{space.task_count !== 1 ? 's' : ''}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-200" />
      </button>
    ))}
  </div>
)

// ── Nova Tarefa bottom sheet ──────────────────────────────────────────────────
const NewTaskSheet: React.FC<{
  orgId?: string
  onClose: () => void
  onSaved: () => void
}> = ({ orgId, onClose, onSaved }) => {
  const [title, setTitle]       = useState('')
  const [priority, setPriority] = useState(3)
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const save = async () => {
    if (!title.trim()) { setError('Informe o título'); return }
    setSaving(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado'); setSaving(false); return }
    const { error: e } = await supabase.from('tasks').insert({
      title:         title.trim(),
      priority,
      due_date:      dueDate ? new Date(dueDate).toISOString() : null,
      status:        'open',
      source_module: 'manual',
      org_id:        orgId ?? null,
      user_id:       user.id,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const PRIOS = [
    { v: 1, label: 'Urgente', cls: 'bg-red-100 text-red-600 border-red-200' },
    { v: 2, label: 'Alta',    cls: 'bg-orange-100 text-orange-600 border-orange-200' },
    { v: 3, label: 'Normal',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    { v: 4, label: 'Baixa',   cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  ]

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-20" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="px-5 pb-1 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Nova Tarefa</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-7 space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="O que precisa ser feito?"
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade</label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {PRIOS.map(({ v, label, cls }) => (
                <button
                  key={v}
                  onClick={() => setPriority(v)}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all
                    ${priority === v ? cls + ' ring-2 ring-offset-1 ring-slate-200' : 'bg-white text-slate-400 border-slate-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prazo</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
const TasksMobileApp: React.FC<Props> = ({ orgId }) => {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [statuses, setStatuses]     = useState<TaskStatus[]>([])
  const [spaces, setSpaces]         = useState<Space[]>([])
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingTasks, setLoading]  = useState(true)
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [filter, setFilter]         = useState<FilterView>('hoje')
  const [nav, setNav]               = useState<NavTab>('inbox')
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [done, setDone]             = useState<Set<string>>(new Set())
  const [search, setSearch]         = useState('')
  const [showNewTask, setShowNewTask] = useState(false)

  const loadTasks = async (spaceId?: string | null) => {
    setLoading(true)
    let q = supabase
      .from('tasks')
      .select('id, title, due_date, priority, status, status_id, source_module, space_id, project_id, alert_at, parent_task_id')
      .eq('status', 'open')
      .is('parent_task_id', null)
      .order('priority', { ascending: true })
      .order('due_date',  { ascending: true, nullsFirst: false })
      .limit(80)
    if (orgId)   q = q.eq('org_id', orgId)
    if (spaceId) q = q.eq('space_id', spaceId)
    const { data } = await q
    setTasks((data ?? []) as Task[])
    setLoading(false)
  }

  const loadMeta = async () => {
    // statuses
    let sq = supabase.from('task_statuses').select('id, name, color, is_done').order('position')
    if (orgId) sq = sq.eq('org_id', orgId)
    const { data: sd } = await sq
    setStatuses((sd ?? []) as TaskStatus[])

    // projects
    let pq = supabase.from('projects').select('id, name').order('name').limit(200)
    if (orgId) pq = pq.filter('settings->>organizationId', 'eq', orgId)
    const { data: pd } = await pq
    setProjects((pd ?? []) as Project[])
  }

  const loadSpaces = async () => {
    setLoadingSpaces(true)
    let q = supabase.from('task_spaces').select('id, name, color').order('position')
    if (orgId) q = q.eq('org_id', orgId)
    const { data: sd } = await q

    const { data: cd } = await supabase
      .from('tasks').select('space_id').eq('status', 'open').is('parent_task_id', null).not('space_id', 'is', null)
    const counts: Record<string, number> = {}
    ;(cd ?? []).forEach((t: { space_id: string }) => { counts[t.space_id] = (counts[t.space_id] ?? 0) + 1 })

    setSpaces((sd ?? []).map((s: Space) => ({ ...s, task_count: counts[s.id] ?? 0 })))
    setLoadingSpaces(false)
  }

  useEffect(() => { loadTasks(); loadMeta() }, [orgId])
  useEffect(() => { if (nav === 'espacos') loadSpaces() }, [nav, orgId])

  const toggleDone = (id: string) => {
    setDone(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    supabase.from('tasks').update({ status: 'done' }).eq('id', id)
  }

  const now = new Date()
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const visible = tasks.filter(t => {
    if (done.has(t.id)) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    if (selectedSpace) return true
    if (filter === 'hoje')      return isToday(t.due_date) || !t.due_date
    if (filter === 'atrasadas') return isOverdue(t.due_date)
    return true
  })

  const overdueCount = tasks.filter(t => !done.has(t.id) && isOverdue(t.due_date)).length
  const todayCount   = tasks.filter(t => !done.has(t.id) && isToday(t.due_date)).length
  const allCount     = tasks.filter(t => !done.has(t.id)).length

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans select-none overflow-hidden relative">

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-white flex-shrink-0">
        <span className="text-[11px] font-black text-slate-700">{timeStr}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 items-end h-3">
            {[3,5,7,9].map((h,i) => <div key={i} className="w-1 bg-slate-700 rounded-sm" style={{ height: h }} />)}
          </div>
          <div className="w-6 h-3 border border-slate-700 rounded-sm relative">
            <div className="absolute inset-0.5 bg-slate-700 rounded-[1px]" style={{ width: '70%' }} />
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-700 rounded-r" />
          </div>
        </div>
      </div>

      {/* App header */}
      <div className="bg-white px-4 pt-2 pb-3 border-b border-slate-100 flex-shrink-0">
        {selectedSpace ? (
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { setSelectedSpace(null); setNav('inbox'); loadTasks() }}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: selectedSpace.color + '22' }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSpace.color }} />
            </span>
            <h1 className="text-lg font-black text-slate-900 flex-1 truncate">{selectedSpace.name}</h1>
          </div>
        ) : (
          <>
            {/* Top row */}
            <div className="flex items-center justify-between mb-2">
              <button className="p-1 text-slate-600"><Menu className="w-5 h-5" /></button>
              <button className="relative p-1 text-slate-500">
                <Bell className="w-5 h-5" />
                {overdueCount > 0 && (
                  <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">{overdueCount}</span>
                )}
              </button>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-black text-slate-900 leading-tight">Tarefas</h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5 mb-3">Sua agenda pessoal de pendências</p>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              {([
                { key: 'hoje',      label: 'Hoje',      icon: Calendar,    count: todayCount },
                { key: 'atrasadas', label: 'Atrasadas', icon: AlertTriangle, count: overdueCount },
                { key: 'todas',     label: 'Todas',     icon: ListChecks,  count: allCount },
              ] as const).map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  onClick={() => { setFilter(key); setNav('inbox') }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide flex-shrink-0 transition-all
                    ${nav === 'inbox' && filter === key
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black
                      ${nav === 'inbox' && filter === key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setNav('espacos')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide flex-shrink-0 transition-all
                  ${nav === 'espacos' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* View controls */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase bg-slate-900 text-white">
                  <AlignLeft className="w-3 h-3" />Lista
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-400">
                  <Columns2 className="w-3 h-3" />Kanban
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-400">
                  <Layers className="w-3 h-3" />Agrupar
                </button>
              </div>
              <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase border border-slate-200 text-slate-500 bg-white">
                <Settings2 className="w-3 h-3" />Status
              </button>
              <button
                onClick={() => setShowNewTask(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase bg-slate-900 text-white shadow-sm"
              >
                <Plus className="w-3 h-3" />Nova
              </button>
            </div>
          </>
        )}

        {/* Search */}
        {nav === 'inbox' && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar tarefa..."
                className="flex-1 text-xs text-slate-600 bg-transparent outline-none placeholder:text-slate-300 font-medium"
              />
              {search && <button onClick={() => setSearch('')}><X className="w-3 h-3 text-slate-300" /></button>}
            </div>
            <button className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-100 bg-white text-[10px] font-black text-slate-500 uppercase tracking-wide">
              <SlidersHorizontal className="w-3 h-3" />Filtros
            </button>
            <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">{visible.length} tarefas</span>
          </div>
        )}
      </div>

      {/* Main content */}
      {nav === 'espacos' && !selectedSpace ? (
        <EspacosScreen spaces={spaces} loading={loadingSpaces} onSelect={s => { setSelectedSpace(s); loadTasks(s.id) }} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loadingTasks ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
                {selectedSpace ? <FolderOpen className="w-8 h-8 text-slate-300" /> : <CheckCircle2 className="w-8 h-8 text-slate-300" />}
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
                {selectedSpace ? 'Nenhuma tarefa neste espaço'
                  : filter === 'hoje' ? 'Sem tarefas para hoje'
                  : filter === 'atrasadas' ? 'Nenhuma atrasada'
                  : 'Nenhuma tarefa'}
              </p>
            </div>
          ) : (
            visible.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                statuses={statuses}
                spaces={spaces}
                projects={projects}
                onToggle={toggleDone}
                onAddSubtask={() => {}}
              />
            ))
          )}
          <div className="h-16" />
        </div>
      )}

      {/* FAB */}
      <div className="absolute bottom-6 right-5 z-10">
        <button
          onClick={() => setShowNewTask(true)}
          className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Nova tarefa sheet */}
      {showNewTask && (
        <NewTaskSheet
          orgId={orgId}
          onClose={() => setShowNewTask(false)}
          onSaved={() => { setShowNewTask(false); loadTasks(selectedSpace?.id) }}
        />
      )}
    </div>
  )
}

export default TasksMobileApp
