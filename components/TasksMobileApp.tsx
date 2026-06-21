import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, LayoutGrid, Mail, ChevronRight, ChevronDown, ChevronUp,
  Loader2, Menu, CheckCircle2, X, ArrowLeft, FolderOpen,
  Folder, ChevronLeft, User, AlignLeft, Tag,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string
  org_id: string
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  priority: number
  status: 'open' | 'done' | 'snoozed'
  status_id: string | null
  source_module: string
  space_id: string | null
  folder_id: string | null
  project_id: string | null
  assignee_employee_id: string | null
  alert_at: string | null
  parent_task_id: string | null
  created_at: string
}

interface TaskStatusOption { id: string; name: string; color: string; is_done: boolean }
interface EmployeeOption   { id: string; name: string }

interface Space     { id: string; name: string; color: string; task_count?: number }
interface Folder_   { id: string; space_id: string; name: string; color: string | null }
interface Project   { id: string; name: string }
interface Props     { orgId?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#6366f1',
  4: '#94a3b8',
}
const PRIORITY_LABEL: Record<number, string> = {
  1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baixa',
}

const DAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTH_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Module-level stable date constants — computed once at load time
const _TODAY = new Date(); _TODAY.setHours(0, 0, 0, 0)
const TODAY_MS = _TODAY.getTime()
const NOW_48H  = Date.now() - 48 * 3600 * 1000

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const TODAY_ISO  = isoDate(_TODAY)
const STRIP: Date[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(_TODAY); d.setDate(_TODAY.getDate() + i - 3); return d
})
const STRIP_ISOS = STRIP.map(isoDate)

function fmtShort(iso: string | null) {
  if (!iso) return null
  const [, m, d] = iso.split('T')[0].split('-').map(Number)
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`
}

function isOverdue(iso: string | null) {
  if (!iso) return false
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).getTime() < TODAY_MS
}

function isNewTask(created_at: string) {
  return new Date(created_at).getTime() > NOW_48H
}

type NavTab    = 'inbox' | 'espacos'
type FilterTab = 'todas' | 'atrasadas'

// ── Task Card ─────────────────────────────────────────────────────────────────
const TaskCard = React.memo<{
  task:     Task
  spaces:   Space[]
  projects: Project[]
  onToggle: (id: string) => void
  onPress:  (task: Task) => void
  isDone:   boolean
}>(({ task, spaces, projects, onToggle, onPress, isDone }) => {
  const overdue  = isOverdue(task.due_date)
  const space    = spaces.find(s => s.id === task.space_id)
  const proj     = projects.find(p => p.id === task.project_id)
  const context  = proj?.name ?? space?.name
  const dotColor = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3]
  const showNew  = isNewTask(task.created_at)
  const dateStr  = fmtShort(task.due_date)

  return (
    <div
      onClick={() => onPress(task)}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex items-center gap-3 transition-opacity active:bg-slate-50 cursor-pointer ${isDone ? 'opacity-40' : ''}`}
    >
      {/* Priority dot */}
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          {showNew && (
            <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase tracking-wide rounded-md flex-shrink-0">
              NEW
            </span>
          )}
          <p className={`text-sm font-bold leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {dateStr && (
            <span className={`text-[11px] font-semibold ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
              Até {dateStr}
            </span>
          )}
          {context && (
            <span className="text-[11px] text-slate-300 truncate">· {context}</span>
          )}
        </div>
      </div>

      {/* Circular checkbox — stopPropagation to avoid opening edit sheet */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(task.id) }}
        className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all active:scale-90
          ${isDone ? 'bg-blue-600 border-blue-600' : 'border-slate-200 hover:border-blue-400'}`}
      >
        {isDone && <CheckCircle2 className="w-4 h-4 text-white" />}
      </button>
    </div>
  )
})

// ── Espaços screen ────────────────────────────────────────────────────────────
const EspacosScreen = React.memo<{
  spaces:   Space[]
  loading:  boolean
  onSelect: (s: Space) => void
}>(({ spaces, loading, onSelect }) => (
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
))

// ── Pastas screen ─────────────────────────────────────────────────────────────
const FoldersScreen = React.memo<{
  folders:  Folder_[]
  loading:  boolean
  onSelect: (f: Folder_) => void
}>(({ folders, loading, onSelect }) => (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
    {loading ? (
      <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
    ) : folders.length === 0 ? (
      <div className="flex flex-col items-center py-16 gap-3">
        <FolderOpen className="w-10 h-10 text-slate-200" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhuma pasta</p>
      </div>
    ) : folders.map(folder => (
      <button
        key={folder.id}
        onClick={() => onSelect(folder)}
        className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: (folder.color ?? '#6366f1') + '22' }}
        >
          <Folder className="w-4 h-4" style={{ color: folder.color ?? '#6366f1' }} />
        </span>
        <p className="flex-1 text-sm font-bold text-slate-800 truncate">{folder.name}</p>
        <ChevronRight className="w-4 h-4 text-slate-200" />
      </button>
    ))}
  </div>
))

// ── Mini Calendar ─────────────────────────────────────────────────────────────
const MiniCalendar: React.FC<{
  value:    string   // YYYY-MM-DD or ''
  onChange: (iso: string) => void
}> = ({ value, onChange }) => {
  const init = value ? new Date(value + 'T12:00:00') : new Date()
  const [year,  setYear]  = useState(init.getFullYear())
  const [month, setMonth] = useState(init.getMonth())   // 0-based

  const selectedISO = value

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else              setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else               setMonth(m => m + 1)
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-slate-50 rounded-2xl p-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
          {MONTH_PT[month].substring(0, 3)} {year}
        </span>
        <button onClick={nextMonth} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LETTER.map((l, i) => (
          <div key={i} className="text-center text-[9px] font-black text-slate-300 uppercase py-1">{l}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const iso      = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isToday_ = iso === TODAY_ISO
          const isSel    = iso === selectedISO
          return (
            <button
              key={i}
              onClick={() => onChange(isSel ? '' : iso)}
              className={`w-8 h-8 mx-auto rounded-full text-xs font-bold transition-all flex items-center justify-center
                ${isSel
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : isToday_
                    ? 'bg-blue-50 text-blue-600 font-black'
                    : 'text-slate-600 hover:bg-white'}`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Task Edit sheet ───────────────────────────────────────────────────────────
const TaskEditSheet: React.FC<{
  task:    Task
  onClose: () => void
  onSaved: () => void
}> = ({ task, onClose, onSaved }) => {
  const [title,      setTitle]      = useState(task.title)
  const [desc,       setDesc]       = useState(task.description ?? '')
  const [startDate,  setStartDate]  = useState(task.start_date  ? task.start_date.split('T')[0]  : '')
  const [dueDate,    setDueDate]    = useState(task.due_date    ? task.due_date.split('T')[0]    : '')
  const [priority,   setPriority]   = useState(task.priority)
  const [statusId,   setStatusId]   = useState(task.status_id ?? '')
  const [assigneeId, setAssigneeId] = useState(task.assignee_employee_id ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Calendar: which field is open ('start' | 'end' | null)
  const [calFor, setCalFor] = useState<'start' | 'end' | null>(null)

  // Remote data loaded on open
  const [statuses,   setStatuses]   = useState<TaskStatusOption[]>([])
  const [employees,  setEmployees]  = useState<EmployeeOption[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('task_statuses').select('id,name,color,is_done').eq('org_id', task.org_id).order('position'),
      supabase.from('employees').select('id,name').order('name').limit(200),
    ]).then(([{ data: sd }, { data: ed }]) => {
      setStatuses((sd ?? []) as TaskStatusOption[])
      setEmployees((ed ?? []) as EmployeeOption[])
    })
  }, [task.org_id])

  const handleCalChange = (iso: string) => {
    if (calFor === 'start') setStartDate(iso)
    else                    setDueDate(iso)
    if (iso) setCalFor(null)   // fecha ao selecionar
  }

  const save = async () => {
    if (!title.trim()) { setError('Informe o título'); return }
    setSaving(true); setError(null)
    const { error: e } = await supabase.from('tasks').update({
      title:                title.trim(),
      description:          desc.trim() || null,
      start_date:           startDate ? new Date(startDate + 'T12:00:00').toISOString() : null,
      due_date:             dueDate   ? new Date(dueDate   + 'T12:00:00').toISOString() : null,
      priority,
      status_id:            statusId   || null,
      assignee_employee_id: assigneeId || null,
    }).eq('id', task.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  // Date field button
  const DateBtn = ({ field, label, value, onClear }: {
    field: 'start' | 'end'; label: string; value: string; onClear: () => void
  }) => {
    const active = calFor === field
    return (
      <div className="flex-1">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCalFor(active ? null : field)}
            className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all
              ${active
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                : value
                  ? 'bg-slate-50 text-slate-700 border-slate-200'
                  : 'bg-white text-slate-400 border-slate-100'}`}
          >
            <span>{value ? fmtShort(value) : 'Definir'}</span>
            {active ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {value && !active && (
            <button onClick={onClear} className="text-slate-300 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-20" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl max-h-[94%] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
          <h2 className="text-base font-black text-slate-900">Editar tarefa</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-8 space-y-4">
          {/* Title */}
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Título da tarefa"
            className="w-full text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2.5 outline-none placeholder:text-slate-300 focus:border-blue-500 transition-colors"
          />

          {/* Datas: Início + Término lado a lado */}
          <div className="space-y-2">
            <div className="flex gap-3">
              <DateBtn field="start" label="Início"   value={startDate} onClear={() => setStartDate('')} />
              <DateBtn field="end"   label="Término"  value={dueDate}   onClear={() => setDueDate('')}   />
            </div>
            {calFor && (
              <MiniCalendar
                value={calFor === 'start' ? startDate : dueDate}
                onChange={handleCalChange}
              />
            )}
          </div>

          {/* Prioridade */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag className="w-3 h-3 text-slate-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {([1, 2, 3, 4] as const).map(v => (
                <button key={v} onClick={() => setPriority(v)}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all
                    ${priority === v ? 'text-white border-transparent shadow-md' : 'bg-white text-slate-400 border-slate-100'}`}
                  style={priority === v ? { backgroundColor: PRIORITY_COLOR[v] } : undefined}
                >
                  {PRIORITY_LABEL[v]}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          {statuses.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {statuses.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStatusId(statusId === s.id ? '' : s.id)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all"
                    style={statusId === s.id
                      ? { backgroundColor: s.color + '22', color: s.color, borderColor: s.color + '44' }
                      : { backgroundColor: 'white', color: '#94a3b8', borderColor: '#f1f5f9' }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Responsável */}
          {employees.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <User className="w-3 h-3 text-slate-400" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável</p>
              </div>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-100 rounded-xl text-sm text-slate-700 bg-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">Sem responsável</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descrição */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlignLeft className="w-3 h-3 text-slate-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</p>
            </div>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Adicione uma descrição..."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-100 rounded-xl text-sm text-slate-700 bg-slate-50 outline-none placeholder:text-slate-300 focus:border-blue-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </>
  )
}

// ── Add Task modal ────────────────────────────────────────────────────────────
const AddTaskModal: React.FC<{
  orgId?:   string
  onClose:  () => void
  onSaved:  () => void
}> = ({ orgId, onClose, onSaved }) => {
  const [title,     setTitle]     = useState('')
  const [desc,      setDesc]      = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate,   setDueDate]   = useState('')
  const [highPrio,  setHighPrio]  = useState(false)
  const [calFor,    setCalFor]    = useState<'start' | 'end' | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const handleCalChange = (iso: string) => {
    if (calFor === 'start') setStartDate(iso)
    else                    setDueDate(iso)
    if (iso) setCalFor(null)
  }

  const save = async () => {
    if (!title.trim()) { setError('Informe o título'); return }
    setSaving(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado'); setSaving(false); return }
    const { error: e } = await supabase.from('tasks').insert({
      title:         title.trim(),
      description:   desc.trim() || null,
      start_date:    startDate ? new Date(startDate + 'T12:00:00').toISOString() : null,
      due_date:      dueDate   ? new Date(dueDate   + 'T12:00:00').toISOString() : null,
      priority:      highPrio ? 1 : 3,
      status:        'open',
      source_module: 'manual',
      org_id:        orgId ?? null,
      user_id:       user.id,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const DateBtn2 = ({ field, label, value, onClear }: {
    field: 'start' | 'end'; label: string; value: string; onClear: () => void
  }) => {
    const active = calFor === field
    return (
      <div className="flex-1">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCalFor(active ? null : field)}
            className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all
              ${active ? 'bg-blue-600 text-white border-blue-600' : value ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-white text-slate-400 border-slate-100'}`}
          >
            <span>{value ? fmtShort(value) : 'Definir'}</span>
            {active ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {value && !active && (
            <button onClick={onClear} className="text-slate-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-20" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl max-h-[94%] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4 flex-shrink-0">
          <h2 className="text-lg font-black text-slate-900">Nova tarefa</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-4">
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()} placeholder="Nome da tarefa *"
            className="w-full text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2.5 outline-none placeholder:text-slate-300 focus:border-blue-500 transition-colors"
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descrição..." rows={2}
            className="w-full text-xs text-slate-500 border-b border-slate-100 pb-2 outline-none resize-none placeholder:text-slate-300 bg-transparent focus:border-blue-300 transition-colors"
          />
          <div className="space-y-2">
            <div className="flex gap-3">
              <DateBtn2 field="start" label="Início"   value={startDate} onClear={() => setStartDate('')} />
              <DateBtn2 field="end"   label="Término"  value={dueDate}   onClear={() => setDueDate('')}   />
            </div>
            {calFor && (
              <MiniCalendar
                value={calFor === 'start' ? startDate : dueDate}
                onChange={handleCalChange}
              />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Alta prioridade</span>
            <button onClick={() => setHighPrio(!highPrio)}
              className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${highPrio ? 'bg-blue-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${highPrio ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Add task
          </button>
        </div>
      </div>
    </>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
const TasksMobileApp: React.FC<Props> = ({ orgId }) => {
  const [tasks,          setTasks]          = useState<Task[]>([])
  const [spaces,         setSpaces]         = useState<Space[]>([])
  const [folders,        setFolders]        = useState<Folder_[]>([])
  const [projects,       setProjects]       = useState<Project[]>([])
  const [loadingTasks,   setLoading]        = useState(true)
  const [loadingSpaces,  setLoadingSpaces]  = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [filterTab,      setFilterTab]      = useState<FilterTab>('todas')
  const [nav,            setNav]            = useState<NavTab>('inbox')
  const [selectedSpace,  setSelectedSpace]  = useState<Space | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<Folder_ | null>(null)
  const [editingTask,    setEditingTask]     = useState<Task | null>(null)
  const [done,           setDone]           = useState<Set<string>>(new Set())
  const [showAddTask,    setShowAddTask]    = useState(false)
  const [selectedDate,   setSelectedDate]   = useState<string>(TODAY_ISO)

  const stripRef     = useRef<HTMLDivElement>(null)
  const spacesLoaded = useRef(false)

  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-today="true"]') as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [])

  const loadTasks = useCallback(async (folderId?: string | null, spaceId?: string | null) => {
    setLoading(true)
    let q = supabase
      .from('tasks')
      .select('id, org_id, title, description, start_date, due_date, priority, status, status_id, source_module, space_id, folder_id, project_id, assignee_employee_id, alert_at, parent_task_id, created_at')
      .eq('status', 'open')
      .is('parent_task_id', null)
      .order('priority', { ascending: true })
      .order('due_date',  { ascending: true, nullsFirst: false })
      .limit(80)
    if (orgId)    q = q.eq('org_id', orgId)
    if (folderId) q = q.eq('folder_id', folderId)
    else if (spaceId) q = q.eq('space_id', spaceId)
    const { data } = await q
    setTasks((data ?? []) as Task[])
    setLoading(false)
  }, [orgId])

  const loadMeta = useCallback(async () => {
    let pq = supabase.from('projects').select('id, name').order('name').limit(200)
    if (orgId) pq = pq.filter('settings->>organizationId', 'eq', orgId)
    const { data: pd } = await pq
    setProjects((pd ?? []) as Project[])
  }, [orgId])

  const loadSpaces = useCallback(async () => {
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
  }, [orgId])

  const loadFolders = useCallback(async (spaceId: string) => {
    setLoadingFolders(true)
    const { data } = await supabase
      .from('task_folders')
      .select('id, space_id, name, color')
      .eq('space_id', spaceId)
      .order('position')
    setFolders((data ?? []) as Folder_[])
    setLoadingFolders(false)
  }, [])

  useEffect(() => { loadTasks(); loadMeta() }, [loadTasks, loadMeta])

  useEffect(() => {
    if (nav === 'espacos' && !spacesLoaded.current) {
      spacesLoaded.current = true
      loadSpaces()
    }
  }, [nav, loadSpaces])

  const toggleDone = useCallback((id: string) => {
    setDone(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    supabase.from('tasks').update({ status: 'done' }).eq('id', id)
  }, [])

  const overdueCount = useMemo(
    () => tasks.filter(t => !done.has(t.id) && isOverdue(t.due_date)).length,
    [tasks, done]
  )
  const allCount = useMemo(
    () => tasks.filter(t => !done.has(t.id)).length,
    [tasks, done]
  )
  const visible = useMemo(() => tasks.filter(t => {
    if (done.has(t.id))            return false
    if (selectedFolder)            return true  // already filtered by server
    if (filterTab === 'atrasadas') return isOverdue(t.due_date)
    if (!t.due_date)               return true
    if (isOverdue(t.due_date))     return true
    return t.due_date.split('T')[0] === selectedDate
  }), [tasks, done, selectedFolder, filterTab, selectedDate])

  const timeStr  = useMemo(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), [])
  const monthName = MONTH_PT[_TODAY.getMonth()]

  // Navigation helpers
  const goBackFromFolder = useCallback(() => {
    setSelectedFolder(null)
    loadTasks()  // reset to inbox tasks
  }, [loadTasks])

  const goBackFromSpace = useCallback(() => {
    setSelectedSpace(null)
    setSelectedFolder(null)
    setFolders([])
  }, [])

  // Determine what screen to show in main content
  const inFolderList = nav === 'espacos' && selectedSpace && !selectedFolder
  const inTaskList   = nav === 'inbox' || (nav === 'espacos' && selectedFolder)
  const inSpacesList = nav === 'espacos' && !selectedSpace

  // Header state
  const showFullHeader = !selectedSpace && !selectedFolder && nav === 'inbox'
  const headerTitle    = selectedFolder
    ? selectedFolder.name
    : selectedSpace
      ? selectedSpace.name
      : null

  return (
    <div className="flex flex-col h-screen bg-[#eef2ff] font-sans select-none overflow-hidden relative">

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-white flex-shrink-0">
        <span className="text-[11px] font-black text-slate-700">{timeStr}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 items-end h-3">
            {[3, 5, 7, 9].map((h, i) => (
              <div key={i} className="w-1 bg-slate-700 rounded-sm" style={{ height: h }} />
            ))}
          </div>
          <div className="w-6 h-3 border border-slate-700 rounded-sm relative">
            <div className="absolute inset-0.5 bg-slate-700 rounded-[1px]" style={{ width: '70%' }} />
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-700 rounded-r" />
          </div>
        </div>
      </div>

      {/* App header */}
      <div className="bg-white px-4 pt-2 pb-0 flex-shrink-0 border-b border-slate-100">
        {/* Breadcrumb header (space or folder selected) */}
        {headerTitle ? (
          <div className="flex items-center gap-2 pb-3">
            <button
              onClick={selectedFolder ? goBackFromFolder : goBackFromSpace}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {selectedSpace && (
              <span
                className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: selectedSpace.color + '22' }}
              >
                {selectedFolder
                  ? <Folder className="w-3.5 h-3.5" style={{ color: selectedFolder.color ?? selectedSpace.color }} />
                  : <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSpace.color }} />
                }
              </span>
            )}
            <div className="flex-1 min-w-0">
              {selectedFolder && (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 truncate">
                  {selectedSpace?.name}
                </p>
              )}
              <h1 className="text-base font-black text-slate-900 leading-tight truncate">{headerTitle}</h1>
            </div>
          </div>
        ) : (
          <>
            {/* Full header: hamburger · title · avatar */}
            <div className="flex items-center justify-between mb-3">
              <button className="p-1 text-slate-500"><Menu className="w-5 h-5" /></button>
              <span className="text-sm font-black text-slate-800">Tarefas</span>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
                <span className="text-[9px] font-black text-white tracking-tight">EU</span>
              </div>
            </div>

            {/* Month selector */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-xl font-black text-slate-900">{monthName}</span>
              <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5" />
            </div>

            {/* Date strip */}
            <div ref={stripRef} className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4">
              {STRIP.map((d, i) => {
                const iso        = STRIP_ISOS[i]
                const isSelected = iso === selectedDate
                const isToday_   = iso === TODAY_ISO
                return (
                  <button
                    key={i}
                    data-today={isToday_ ? 'true' : undefined}
                    onClick={() => setSelectedDate(iso)}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl flex-shrink-0 min-w-[44px] transition-all
                      ${isSelected
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                        : isToday_
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span className="text-[9px] font-black uppercase">{DAY_LETTER[d.getDay()]}</span>
                    <span className="text-[15px] font-black leading-none">{d.getDate()}</span>
                  </button>
                )
              })}
            </div>

            {/* Tabs */}
            <div className="flex">
              {([
                { key: 'todas',     label: 'All tasks', count: allCount     },
                { key: 'atrasadas', label: 'Atrasadas', count: overdueCount },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilterTab(key)}
                  className={`flex items-center gap-1.5 px-1 py-2.5 mr-5 text-xs font-black border-b-2 -mb-px transition-colors
                    ${filterTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                >
                  {label}
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md
                    ${filterTab === key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      {inSpacesList ? (
        <EspacosScreen
          spaces={spaces}
          loading={loadingSpaces}
          onSelect={s => { setSelectedSpace(s); loadFolders(s.id) }}
        />
      ) : inFolderList ? (
        <FoldersScreen
          folders={folders}
          loading={loadingFolders}
          onSelect={f => { setSelectedFolder(f); loadTasks(f.id) }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loadingTasks ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                {selectedFolder
                  ? <FolderOpen className="w-8 h-8 text-slate-300" />
                  : <CheckCircle2 className="w-8 h-8 text-blue-200" />}
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
                {selectedFolder
                  ? 'Nenhuma tarefa nesta pasta'
                  : filterTab === 'atrasadas'
                    ? 'Nenhuma atrasada'
                    : 'Sem tarefas para este dia'}
              </p>
            </div>
          ) : (
            visible.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                spaces={spaces}
                projects={projects}
                onToggle={toggleDone}
                onPress={setEditingTask}
                isDone={done.has(task.id)}
              />
            ))
          )}
          <div className="h-24" />
        </div>
      )}

      {/* FAB */}
      <div className="absolute bottom-[72px] right-5 z-10">
        <button
          onClick={() => setShowAddTask(true)}
          className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-xl shadow-blue-300 active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-slate-100 px-8 py-3 flex items-center justify-around flex-shrink-0">
        {([
          { key: 'inbox',   icon: Mail,       label: 'Inbox'   },
          { key: 'espacos', icon: LayoutGrid,  label: 'Espaços' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => {
              setNav(key)
              if (key === 'inbox') { setSelectedSpace(null); setSelectedFolder(null); setFolders([]) }
            }}
            className={`flex flex-col items-center gap-1 transition-colors ${nav === key ? 'text-blue-600' : 'text-slate-300'}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
          </button>
        ))}
      </div>

      {/* Add task modal */}
      {showAddTask && (
        <AddTaskModal
          orgId={orgId}
          onClose={() => setShowAddTask(false)}
          onSaved={() => {
            setShowAddTask(false)
            loadTasks(selectedFolder?.id ?? null, selectedSpace?.id ?? null)
          }}
        />
      )}

      {/* Task edit sheet */}
      {editingTask && (
        <TaskEditSheet
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null)
            loadTasks(selectedFolder?.id ?? null, selectedSpace?.id ?? null)
          }}
        />
      )}
    </div>
  )
}

export default TasksMobileApp
