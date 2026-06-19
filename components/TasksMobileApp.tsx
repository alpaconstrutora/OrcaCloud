import React, { useEffect, useRef, useState } from 'react'
import {
  CheckSquare, AlertTriangle, Calendar, Plus, Inbox,
  LayoutGrid, Bell, ChevronRight, Loader2, Clock,
  CheckCircle2, X, ArrowLeft, Save, FolderOpen,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: number
  status: string
  source_module: string
  space_id: string | null
  alert_at: string | null
}

interface Space {
  id: string
  name: string
  color: string
  task_count?: number
}

interface Props {
  orgId?: string
}

const PRIORITY: Record<number, { label: string; dot: string; badge: string }> = {
  1: { label: 'Urgente', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-600' },
  2: { label: 'Alta',    dot: 'bg-orange-400', badge: 'bg-orange-100 text-orange-600' },
  3: { label: 'Normal',  dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-600' },
  4: { label: 'Baixa',   dot: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-500' },
}

const SOURCE_LABEL: Record<string, string> = {
  operacional: 'Operacional',
  financeiro:  'Financeiro',
  rh:          'RH',
  compras:     'Compras',
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
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

type Tab = 'hoje' | 'atrasadas' | 'todas'
type NavTab = 'inbox' | 'espacos'

// ── Tela de Espaços ───────────────────────────────────────────────────────────
const EspacosScreen: React.FC<{
  spaces: Space[]
  loading: boolean
  onSelect: (space: Space) => void
}> = ({ spaces, loading, onSelect }) => (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
    {loading ? (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    ) : spaces.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
          <LayoutGrid className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
          Nenhum espaço criado
        </p>
      </div>
    ) : (
      spaces.map(space => (
        <button
          key={space.id}
          onClick={() => onSelect(space)}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-50 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
        >
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: space.color + '22' }}
          >
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: space.color }} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">{space.name}</p>
            {space.task_count !== undefined && (
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {space.task_count} tarefa{space.task_count !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-200 flex-shrink-0" />
        </button>
      ))
    )}
  </div>
)

// ── Formulário nova tarefa (bottom sheet) ─────────────────────────────────────
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120) }, [])

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

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 z-20" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        <div className="px-5 pb-2 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Nova Tarefa</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Título */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título *</label>
            <input
              ref={inputRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="O que precisa ser feito?"
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade</label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {([1,2,3,4] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all
                    ${priority === p ? PRIORITY[p].badge + ' border-transparent ring-2 ring-offset-1 ring-slate-200' : 'bg-white text-slate-400 border-slate-100'}`}
                >
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prazo</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar tarefa
          </button>
        </div>
      </div>
    </>
  )
}

// ── App principal ─────────────────────────────────────────────────────────────
const TasksMobileApp: React.FC<Props> = ({ orgId }) => {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [spaces, setSpaces]         = useState<Space[]>([])
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [tab, setTab]               = useState<Tab>('hoje')
  const [done, setDone]             = useState<Set<string>>(new Set())
  const [nav, setNav]               = useState<NavTab>('inbox')
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)

  const loadTasks = async (spaceId?: string | null) => {
    setLoadingTasks(true)
    let q = supabase
      .from('tasks')
      .select('id, title, description, due_date, priority, status, source_module, space_id, alert_at')
      .eq('status', 'open')
      .is('parent_task_id', null)
      .order('priority', { ascending: true })
      .order('due_date',  { ascending: true, nullsFirst: false })
      .limit(50)
    if (orgId)    q = q.eq('org_id', orgId)
    if (spaceId)  q = q.eq('space_id', spaceId)
    const { data } = await q
    setTasks((data ?? []) as Task[])
    setLoadingTasks(false)
  }

  const loadSpaces = async () => {
    setLoadingSpaces(true)
    let q = supabase
      .from('task_spaces')
      .select('id, name, color')
      .order('position', { ascending: true })
    if (orgId) q = q.eq('org_id', orgId)
    const { data: spacesData } = await q

    // conta tarefas abertas por espaço
    const { data: countData } = await supabase
      .from('tasks')
      .select('space_id')
      .eq('status', 'open')
      .is('parent_task_id', null)
      .not('space_id', 'is', null)

    const counts: Record<string, number> = {}
    ;(countData ?? []).forEach((t: { space_id: string }) => {
      counts[t.space_id] = (counts[t.space_id] ?? 0) + 1
    })

    setSpaces(
      (spacesData ?? []).map((s: Space) => ({ ...s, task_count: counts[s.id] ?? 0 }))
    )
    setLoadingSpaces(false)
  }

  useEffect(() => { loadTasks() }, [orgId])
  useEffect(() => { if (nav === 'espacos') loadSpaces() }, [nav, orgId])

  const handleSelectSpace = (space: Space) => {
    setSelectedSpace(space)
    loadTasks(space.id)
  }

  const handleBackFromSpace = () => {
    setSelectedSpace(null)
    loadTasks()
  }

  const toggleDone = (id: string) => {
    setDone(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    supabase.from('tasks').update({ status: 'done' }).eq('id', id)
  }

  const visible = tasks.filter(t => {
    if (done.has(t.id)) return false
    if (selectedSpace) return true  // espaço já filtrado no DB
    if (tab === 'hoje')      return isToday(t.due_date) || !t.due_date
    if (tab === 'atrasadas') return isOverdue(t.due_date)
    return true
  })

  const overdueCount = tasks.filter(t => !done.has(t.id) && isOverdue(t.due_date)).length
  const todayCount   = tasks.filter(t => !done.has(t.id) && isToday(t.due_date)).length
  const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans select-none overflow-hidden relative">

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-white flex-shrink-0">
        <span className="text-[11px] font-black text-slate-700">{timeStr}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 items-end h-3">
            {[3,5,7,9].map((h, i) => (
              <div key={i} className="w-1 bg-slate-700 rounded-sm" style={{ height: h }} />
            ))}
          </div>
          <div className="w-6 h-3 border border-slate-700 rounded-sm relative">
            <div className="absolute inset-0.5 bg-slate-700 rounded-[1px]" style={{ width: '70%' }} />
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-700 rounded-r" />
          </div>
        </div>
      </div>

      {/* Header — muda conforme contexto */}
      <div className="bg-white px-5 pt-2 pb-4 shadow-sm flex-shrink-0">
        {selectedSpace ? (
          /* Header do espaço selecionado */
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackFromSpace}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: selectedSpace.color + '22' }}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSpace.color }} />
            </span>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Espaço</p>
              <h1 className="text-lg font-black text-slate-900 leading-tight">{selectedSpace.name}</h1>
            </div>
          </div>
        ) : nav === 'espacos' ? (
          /* Header de Espaços */
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Navegação</p>
            <h1 className="text-xl font-black text-slate-900 leading-tight">Espaços</h1>
          </div>
        ) : (
          /* Header do Inbox */
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bem-vindo</p>
              <h1 className="text-xl font-black text-slate-900 leading-tight">Minhas Tarefas</h1>
            </div>
            <div className="relative">
              <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Bell className="w-4 h-4 text-white" />
              </div>
              {overdueCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">
                  {overdueCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Summary pills — só no inbox sem espaço selecionado */}
        {nav === 'inbox' && !selectedSpace && (
          <div className="flex gap-2 mt-3">
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-xl border border-red-100">
                <AlertTriangle className="w-3 h-3 text-red-500" />
                <span className="text-[11px] font-black text-red-600">{overdueCount} atrasada{overdueCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {todayCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                <Calendar className="w-3 h-3 text-blue-500" />
                <span className="text-[11px] font-black text-blue-600">{todayCount} para hoje</span>
              </div>
            )}
            {overdueCount === 0 && todayCount === 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-[11px] font-black text-emerald-600">Tudo em dia!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs — só no inbox sem espaço selecionado */}
      {nav === 'inbox' && !selectedSpace && (
        <div className="flex gap-1 px-4 pt-3 pb-1 bg-slate-50 flex-shrink-0">
          {([
            { key: 'hoje',      label: 'Hoje',      count: todayCount },
            { key: 'atrasadas', label: 'Atrasadas', count: overdueCount },
            { key: 'todas',     label: 'Todas',     count: tasks.filter(t => !done.has(t.id)).length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black transition-all
                ${tab === key
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-white text-slate-500 border border-slate-100'}`}
            >
              {label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${tab === key ? 'bg-white/20' : 'bg-slate-100'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo principal */}
      {nav === 'espacos' && !selectedSpace ? (
        <EspacosScreen spaces={spaces} loading={loadingSpaces} onSelect={handleSelectSpace} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {loadingTasks ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
                {selectedSpace
                  ? <FolderOpen className="w-8 h-8 text-slate-300" />
                  : <CheckSquare className="w-8 h-8 text-slate-300" />}
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
                {selectedSpace
                  ? 'Nenhuma tarefa neste espaço'
                  : tab === 'hoje' ? 'Sem tarefas para hoje'
                  : tab === 'atrasadas' ? 'Nenhuma atrasada'
                  : 'Nenhuma tarefa'}
              </p>
            </div>
          ) : (
            visible.map(task => {
              const p = PRIORITY[task.priority] ?? PRIORITY[3]
              const overdue = isOverdue(task.due_date)
              const isDone  = done.has(task.id)
              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-2xl p-4 shadow-sm border transition-all active:scale-[0.98]
                    ${isDone ? 'opacity-50' : ''}
                    ${overdue && !isDone ? 'border-red-100' : 'border-slate-50'}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleDone(task.id)}
                      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all
                        ${isDone ? 'border-emerald-400 bg-emerald-400' : overdue ? 'border-red-300' : 'border-slate-300'}`}
                    >
                      {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} />
                        <p className={`text-sm font-bold text-slate-800 leading-tight ${isDone ? 'line-through text-slate-400' : ''}`}>
                          {task.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        {task.due_date ? (
                          <span className={`flex items-center gap-1 text-[10px] font-bold ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                            {overdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                            {fmtDate(task.due_date)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
                            <Clock className="w-3 h-3" />Sem prazo
                          </span>
                        )}
                        {task.alert_at && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                            <Bell className="w-3 h-3" />Alerta
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide ${p.badge}`}>
                          {p.label}
                        </span>
                        {task.source_module !== 'manual' && SOURCE_LABEL[task.source_module] && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase">
                            {SOURCE_LABEL[task.source_module]}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-200 flex-shrink-0 mt-1" />
                  </div>
                </div>
              )
            })
          )}
          <div className="h-6" />
        </div>
      )}

      {/* FAB */}
      <div className="absolute bottom-20 right-5 z-10">
        <button
          onClick={() => setShowNewTask(true)}
          className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-300 active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-slate-100 px-6 py-3 flex items-center justify-around flex-shrink-0">
        {([
          { key: 'inbox',   icon: Inbox,       label: 'Inbox' },
          { key: 'espacos', icon: LayoutGrid,   label: 'Espaços' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => { setNav(key); setSelectedSpace(null) }}
            className={`flex flex-col items-center gap-1 transition-colors ${nav === key ? 'text-blue-600' : 'text-slate-300'}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
          </button>
        ))}
      </div>

      {/* Bottom sheet — Nova Tarefa */}
      {showNewTask && (
        <NewTaskSheet
          orgId={orgId}
          onClose={() => setShowNewTask(false)}
          onSaved={() => {
            setShowNewTask(false)
            loadTasks(selectedSpace?.id)
          }}
        />
      )}
    </div>
  )
}

export default TasksMobileApp
