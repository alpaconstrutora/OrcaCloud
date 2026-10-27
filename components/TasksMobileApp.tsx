import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Plus, LayoutGrid, Inbox, ChevronRight, ChevronDown, ChevronUp, ChevronLeft,
  Loader2, CheckCircle2, Check, X, ArrowLeft, FolderOpen, Folder, User, AlignLeft,
  Tag, AlertCircle, CalendarDays,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import { useOrgWriteTarget } from '../hooks/useOrgContext'
import { taskSpaceService, TaskSpaceWithMeta } from '../services/taskSpaceService'
import { taskStatusService, TaskStatus } from '../services/taskService'
import { statusesOfOrg, doneStatusOfOrg } from '../utils/taskStatusByName'
import {
  startOfDay, addDays, isoDate, dayOf, isOverdue, isNewTask, groupBySection, onDay,
  dueLabel, shortDate, longDayLabel, chipDayLabel, weekStartOf, weekDays, weekMonthLabel,
  dateFromDay, msUntilNextDay, MONTH_PT,
} from '../utils/tasksMobileAgenda'

/**
 * Minhas Tarefas — aplicativo mobile.
 *
 * É usado em dois lugares (o mesmo arranjo de `DiaryMobileApp`):
 *  - celular de verdade → `TasksModule` devolve este componente. Ele fica DENTRO
 *    do Layout (o cabeçalho com menu, usuário e seletor de organização continua
 *    valendo — por isso não há ☰ nem avatar aqui, §18) e ocupa a área de conteúdo
 *    inteira, anulando o gutter do `<main>`;
 *  - desktop → dentro de `MobilePreviewFrame`, com `previa`: o iframe é o
 *    "telefone" e o topo ganha o respiro do notch desenhado pela moldura.
 *
 * A Entrada é uma agenda honesta: "Todas" mostra todas as tarefas abertas, em
 * seções (Atrasadas · Hoje · Próximos 7 dias · Depois · Sem prazo). Tocar num dia
 * da semana é um filtro explícito, com chip para tirar. Antes, a lista escondia
 * toda tarefa com prazo fora do dia escolhido numa faixa fixa de 14 dias
 * (`docs/planos/2026-10-27-tarefas-mobile-critica.md`).
 */

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

interface EmployeeOption { id: string; name: string }
interface FolderSel      { id: string; space_id: string; name: string; color: string | null }
interface Props {
  orgId?: string
  /** Dentro do `MobilePreviewFrame` (desktop): altura do iframe e respiro do notch. */
  previa?: boolean
}

interface ToastState {
  message: string
  tone:    'success' | 'error'
  action?: { label: string; run: () => void }
}

const TASK_COLS = 'id, org_id, title, description, start_date, due_date, priority, status, status_id, source_module, space_id, folder_id, project_id, assignee_employee_id, alert_at, parent_task_id, created_at'
const TASK_LIMIT = 300
/** Pasta virtual: tarefas do espaço que não estão em pasta nenhuma. */
const NO_FOLDER = '__sem_pasta__'

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

/** Fundo claro de uma cor de espaço/pasta — vale para qualquer formato de cor, não só #rrggbb. */
const tint = (color: string) => `color-mix(in srgb, ${color} 14%, transparent)`

const falha = (acao: string) => `Não foi possível ${acao}. Verifique a conexão e tente de novo.`

/** Grava a data escolhida (YYYY-MM-DD) como meio-dia local — o dia não muda com o fuso. */
const toIso = (day: string) => (day ? new Date(day + 'T12:00:00').toISOString() : null)

/** "Hoje" que vira à meia-noite (e ao voltar do segundo plano — o celular congela timers). */
function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))
  useEffect(() => {
    const refresh = () => setToday(prev => {
      const now = startOfDay(new Date())
      return now.getTime() === prev.getTime() ? prev : now
    })
    let timer: ReturnType<typeof setTimeout>
    const arm = () => { timer = setTimeout(() => { refresh(); arm() }, msUntilNextDay(new Date()) + 1000) }
    arm()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return today
}

/** Responsáveis da organização da tarefa — mesma regra do desktop (`TasksModule.loadEmployees`). */
async function listAssignable(orgId: string): Promise<EmployeeOption[]> {
  let q = supabase.from('employees').select('id, name').eq('status', 'ATIVO').order('name')
  if (orgId) {
    const { data: shared } = await supabase.from('employee_org_shares').select('employee_id').eq('target_org_id', orgId)
    const sharedIds = (shared ?? []).map((s: { employee_id: string }) => s.employee_id)
    q = q.or(sharedIds.length > 0 ? `org_id.eq.${orgId},id.in.(${sharedIds.join(',')})` : `org_id.eq.${orgId}`)
  }
  const { data } = await q
  return (data ?? []) as EmployeeOption[]
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────
/** Gaveta inferior: fecha pelo X, pelo fundo, pelo Esc e arrastando a alça para baixo. */
const BottomSheet: React.FC<{
  title:    string
  onClose:  () => void
  children: React.ReactNode
}> = ({ title, onClose, children }) => {
  const titleId   = useId()
  const ref       = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  // Foco na gaveta (não num campo: abrir não pode subir o teclado sozinho).
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-20" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
        className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl shadow-2xl max-h-[94%] flex flex-col outline-none"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="flex justify-center pt-3 pb-2 flex-shrink-0 touch-none"
          onTouchStart={e => { dragStart.current = e.touches[0].clientY }}
          onTouchMove={e => { if (dragStart.current !== null) setDragY(Math.max(0, e.touches[0].clientY - dragStart.current)) }}
          onTouchEnd={() => { if (dragY > 80) onClose(); else setDragY(0); dragStart.current = null }}
        >
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between pl-5 pr-3 pb-2 flex-shrink-0">
          <h2 id={titleId} className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-11 h-11 flex items-center justify-center">
            <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <X className="w-4 h-4" />
            </span>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────
const TaskCard = React.memo<{
  task:       Task
  context?:   string
  today:      Date
  now:        number
  completing: boolean
  onToggle:   (task: Task) => void
  onPress:    (task: Task) => void
}>(({ task, context, today, now, completing, onToggle, onPress }) => {
  const due      = dueLabel(task.due_date, today)
  const prio     = task.priority <= 2 ? PRIORITY_LABEL[task.priority] : null
  const dotColor = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3]
  const showNew  = isNewTask(task.created_at, now)

  return (
    <div className={`bg-white rounded-[10px] border border-slate-200/70 shadow-sm flex items-center transition-opacity duration-300 ${completing ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={() => onPress(task)}
        className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3 text-left rounded-l-[10px] active:bg-slate-50"
      >
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            {showNew && <span className="text-xs font-semibold text-blue-700 flex-shrink-0">Nova</span>}
            <span className={`block text-sm font-medium leading-snug ${completing ? 'line-through text-slate-500' : 'text-slate-800'}`}>
              {task.title}
            </span>
          </span>
          {!prio && <span className="sr-only">Prioridade {PRIORITY_LABEL[task.priority]?.toLowerCase()}.</span>}
          {(due || prio || context) && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 min-w-0">
              {due && (
                <span className={`font-medium flex-shrink-0 ${due.tone === 'overdue' ? 'text-red-700' : due.tone === 'today' ? 'text-blue-700' : 'text-slate-600'}`}>
                  {due.text}
                </span>
              )}
              {prio && (
                <>
                  {due && <span aria-hidden="true">·</span>}
                  <span className="font-medium text-slate-700 flex-shrink-0">{prio}</span>
                </>
              )}
              {context && (
                <>
                  {(due || prio) && <span aria-hidden="true">·</span>}
                  <span className="truncate">{context}</span>
                </>
              )}
            </span>
          )}
        </span>
      </button>

      {/* Concluir: área de toque 48px em volta do círculo de 28px */}
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={completing}
        aria-label={completing ? `Concluindo: ${task.title}` : `Concluir: ${task.title}`}
        className="w-12 h-12 mr-1 flex-shrink-0 flex items-center justify-center rounded-full active:scale-90 transition-transform"
      >
        <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${completing ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
          {completing && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
        </span>
      </button>
    </div>
  )
})

// ── Espaços screen ────────────────────────────────────────────────────────────
const EspacosScreen = React.memo<{
  spaces:   TaskSpaceWithMeta[]
  loading:  boolean
  failed:   boolean
  onRetry:  () => void
  onSelect: (s: TaskSpaceWithMeta) => void
}>(({ spaces, loading, failed, onRetry, onSelect }) => (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
    {loading ? (
      <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" aria-label="Carregando" /></div>
    ) : failed ? (
      <ErrorState message="Não foi possível carregar os espaços." onRetry={onRetry} />
    ) : spaces.length === 0 ? (
      <EmptyState
        icon={<LayoutGrid className="w-8 h-8 text-slate-400" />}
        title="Nenhum espaço ainda"
        text="Espaços agrupam tarefas por assunto. Crie o primeiro na versão para computador, em Tarefas."
      />
    ) : spaces.map(space => (
      <button
        key={space.id}
        type="button"
        onClick={() => onSelect(space)}
        className="w-full bg-white rounded-[10px] p-4 shadow-sm border border-slate-200/70 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
      >
        <span className="w-9 h-9 rounded-[6px] flex items-center justify-center" style={{ backgroundColor: tint(space.color) }}>
          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: space.color }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-800 truncate">{space.name}</span>
          <span className="block text-xs text-slate-600">
            {space.open_task_count} tarefa{space.open_task_count !== 1 ? 's' : ''} aberta{space.open_task_count !== 1 ? 's' : ''}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
      </button>
    ))}
  </div>
))

// ── Pastas screen ─────────────────────────────────────────────────────────────
const FoldersScreen = React.memo<{
  space:    TaskSpaceWithMeta
  onSelect: (f: FolderSel) => void
}>(({ space, onSelect }) => {
  const rows: FolderSel[] = [
    { id: NO_FOLDER, space_id: space.id, name: 'Sem pasta', color: null },
    ...space.folders,
  ]
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {rows.map(folder => {
        const isNone = folder.id === NO_FOLDER
        const color  = folder.color ?? space.color
        return (
          <button
            key={folder.id}
            type="button"
            onClick={() => onSelect(folder)}
            className="w-full bg-white rounded-[10px] p-4 shadow-sm border border-slate-200/70 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
          >
            <span className="w-9 h-9 rounded-[6px] flex items-center justify-center" style={{ backgroundColor: isNone ? '#f1f5f9' : tint(color) }}>
              {isNone
                ? <Inbox className="w-4 h-4 text-slate-600" />
                : <Folder className="w-4 h-4" style={{ color }} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-slate-800 truncate">{folder.name}</span>
              {isNone && <span className="block text-xs text-slate-600">Tarefas do espaço fora de pasta</span>}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
})

// ── Estados ───────────────────────────────────────────────────────────────────
const EmptyState: React.FC<{
  icon:    React.ReactNode
  title:   string
  text?:   string
  action?: { label: string; run: () => void }
}> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center py-14 px-6 gap-2 text-center">
    <div className="w-14 h-14 bg-white rounded-[10px] flex items-center justify-center shadow-sm mb-1">{icon}</div>
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {text && <p className="text-sm text-slate-600 max-w-[30ch]">{text}</p>}
    {action && (
      <Button variant="secondary" onClick={action.run} className="mt-2">{action.label}</Button>
    )}
  </div>
)

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert">
    <EmptyState
      icon={<AlertCircle className="w-8 h-8 text-red-600" />}
      title={message}
      text="Verifique a conexão e tente de novo."
      action={{ label: 'Tentar de novo', run: onRetry }}
    />
  </div>
)

// ── Mini Calendar ─────────────────────────────────────────────────────────────
const MiniCalendar: React.FC<{
  value:     string   // YYYY-MM-DD or ''
  onChange:  (iso: string) => void
  today:     Date
  /** Dias com tarefa (ponto embaixo do número). */
  marks?:    Set<string>
  /** Mês aberto quando não há valor. */
  initial?:  Date
}> = ({ value, onChange, today, marks, initial }) => {
  const init = value ? dateFromDay(value) : (initial ?? today)
  const [year,  setYear]  = useState(init.getFullYear())
  const [month, setMonth] = useState(init.getMonth())   // 0-based
  const todayIso = isoDate(today)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else              setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else               setMonth(m => m + 1)
  }

  const firstDay    = new Date(year, month, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-slate-50 rounded-[10px] p-2">
      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={prevMonth} aria-label="Mês anterior" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-white">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-slate-800" aria-live="polite">
          {MONTH_PT[month]} {year}
        </span>
        <button type="button" onClick={nextMonth} aria-label="Próximo mês" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-white">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1" aria-hidden="true">
        {DAY_LETTER.map((l, i) => (
          <div key={i} className="text-center text-xs font-medium text-slate-500 py-1">{l}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const iso     = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayIso
          const isSel   = iso === value
          const marked  = marks?.has(iso)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(isSel ? '' : iso)}
              aria-pressed={isSel}
              aria-label={`${longDayLabel(iso)}${isToday ? ', hoje' : ''}${marked ? ', tem tarefas' : ''}`}
              className={`w-10 h-10 mx-auto rounded-full text-sm font-medium transition-colors flex flex-col items-center justify-center gap-0.5
                ${isSel
                  ? 'bg-blue-600 text-white'
                  : isToday
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 hover:bg-white'}`}
            >
              <span className="leading-none">{day}</span>
              <span aria-hidden="true" className={`w-1 h-1 rounded-full ${marked ? (isSel ? 'bg-white' : 'bg-blue-500') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Campos compartilhados das gavetas ─────────────────────────────────────────
const DateField: React.FC<{
  label:    string
  value:    string
  active:   boolean
  today:    Date
  onToggle: () => void
  onClear:  () => void
}> = ({ label, value, active, today, onToggle, onClear }) => (
  <div className="flex-1 min-w-0">
    <p className="text-xs font-semibold text-slate-600 mb-1.5">{label}</p>
    <div className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-label={`${label}: ${value ? shortDate(value, today) : 'não definida'}`}
        className={`flex-1 min-w-0 h-10 flex items-center justify-between px-3 rounded-[6px] border text-sm font-medium transition-colors
          ${active
            ? 'bg-blue-600 text-white border-blue-600'
            : value
              ? 'bg-slate-50 text-slate-800 border-slate-200'
              : 'bg-white text-slate-500 border-slate-200'}`}
      >
        <span>{value ? shortDate(value, today) : 'Definir'}</span>
        {active ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {value && !active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Limpar ${label.toLowerCase()}`}
          className="w-10 h-10 -mr-2 flex-shrink-0 flex items-center justify-center text-slate-500 hover:text-red-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
)

const DatesField: React.FC<{
  start:    string
  due:      string
  today:    Date
  onStart:  (iso: string) => void
  onDue:    (iso: string) => void
}> = ({ start, due, today, onStart, onDue }) => {
  const [calFor, setCalFor] = useState<'start' | 'end' | null>(null)
  const pick = (iso: string) => {
    if (calFor === 'start') onStart(iso)
    else                    onDue(iso)
    if (iso) setCalFor(null)   // fecha ao selecionar
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <DateField label="Início"  value={start} active={calFor === 'start'} today={today}
          onToggle={() => setCalFor(calFor === 'start' ? null : 'start')} onClear={() => onStart('')} />
        <DateField label="Término" value={due}   active={calFor === 'end'}   today={today}
          onToggle={() => setCalFor(calFor === 'end' ? null : 'end')}     onClear={() => onDue('')} />
      </div>
      {calFor && (
        <MiniCalendar key={calFor} value={calFor === 'start' ? start : due} onChange={pick} today={today} />
      )}
    </div>
  )
}

const PriorityField: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      <Tag className="w-3 h-3 text-slate-500" aria-hidden="true" />
      <p className="text-xs font-semibold text-slate-600" id="prioridade-label">Prioridade</p>
    </div>
    <div role="radiogroup" aria-labelledby="prioridade-label" className="grid grid-cols-4 gap-1.5">
      {([1, 2, 3, 4] as const).map(v => {
        const sel = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(v)}
            className={`h-10 flex items-center justify-center gap-1.5 rounded-[6px] text-sm font-medium border transition-colors
              ${sel ? 'text-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
            style={sel ? { backgroundColor: tint(PRIORITY_COLOR[v]), borderColor: PRIORITY_COLOR[v] } : undefined}
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[v] }} />
            {PRIORITY_LABEL[v]}
          </button>
        )
      })}
    </div>
  </div>
)

// ── Task Edit sheet ───────────────────────────────────────────────────────────
const TaskEditSheet: React.FC<{
  task:     Task
  today:    Date
  statuses: TaskStatus[]   // já recortados pela org da tarefa
  onClose:  () => void
  onSaved:  (task: Task) => void
}> = ({ task, today, statuses, onClose, onSaved }) => {
  const [title,      setTitle]      = useState(task.title)
  const [desc,       setDesc]       = useState(task.description ?? '')
  const [startDate,  setStartDate]  = useState(task.start_date ? dayOf(task.start_date) : '')
  const [dueDate,    setDueDate]    = useState(task.due_date   ? dayOf(task.due_date)   : '')
  const [priority,   setPriority]   = useState(task.priority)
  const [statusId,   setStatusId]   = useState(task.status_id ?? '')
  const [assigneeId, setAssigneeId] = useState(task.assignee_employee_id ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [employees,  setEmployees]  = useState<EmployeeOption[]>([])

  useEffect(() => { listAssignable(task.org_id).then(setEmployees).catch(() => setEmployees([])) }, [task.org_id])

  const save = async () => {
    if (!title.trim()) { setError('Informe o título da tarefa.'); return }
    setSaving(true); setError(null)
    const chosen = statuses.find(s => s.id === statusId)
    const { data, error: e } = await supabase.from('tasks').update({
      title:                title.trim(),
      description:          desc.trim() || null,
      start_date:           toIso(startDate),
      due_date:             toIso(dueDate),
      priority,
      status_id:            statusId || null,
      // status concluído na lista de status = tarefa concluída (igual ao desktop)
      ...(chosen ? { status: chosen.is_done ? 'done' : 'open' } : {}),
      assignee_employee_id: assigneeId || null,
    }).eq('id', task.id).select(TASK_COLS).single()
    setSaving(false)
    if (e || !data) { console.error('[tarefas mobile] salvar', e); setError(falha('salvar a tarefa')); return }
    onSaved(data as Task)
  }

  return (
    <BottomSheet title="Editar tarefa" onClose={onClose}>
      <div className="overflow-y-auto flex-1 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          aria-label="Título da tarefa"
          placeholder="Título da tarefa"
          className="w-full text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2.5 outline-none placeholder:text-slate-500 focus:border-blue-500 transition-colors"
        />

        <DatesField start={startDate} due={dueDate} today={today} onStart={setStartDate} onDue={setDueDate} />

        <PriorityField value={priority} onChange={setPriority} />

        {statuses.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="w-3 h-3 text-slate-500" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-600">Status</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map(s => {
                const sel = statusId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setStatusId(sel ? '' : s.id)}
                    className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-[6px] text-sm font-medium border transition-colors
                      ${sel ? 'text-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                    style={sel ? { backgroundColor: tint(s.color), borderColor: s.color } : undefined}
                  >
                    <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {employees.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <User className="w-3 h-3 text-slate-500" aria-hidden="true" />
              <label htmlFor="tarefa-responsavel" className="text-xs font-semibold text-slate-600">Responsável</label>
            </div>
            <select
              id="tarefa-responsavel"
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 rounded-[6px] text-sm text-slate-800 bg-slate-50 outline-none focus:border-blue-400"
            >
              <option value="">Sem responsável</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlignLeft className="w-3 h-3 text-slate-500" aria-hidden="true" />
            <label htmlFor="tarefa-descricao" className="text-xs font-semibold text-slate-600">Descrição</label>
          </div>
          <textarea
            id="tarefa-descricao"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Adicione uma descrição..."
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-[6px] text-sm text-slate-800 bg-slate-50 outline-none placeholder:text-slate-500 focus:border-blue-400 resize-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 rounded-[6px] px-3 py-2">{error}</p>
        )}

        <Button onClick={save} disabled={saving} className="w-full py-3 active:scale-[0.98]">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </BottomSheet>
  )
}

// ── Add Task sheet ────────────────────────────────────────────────────────────
const AddTaskSheet: React.FC<{
  today:      Date
  /** Espaço/pasta do recorte aberto: a tarefa nova nasce lá. */
  space:      TaskSpaceWithMeta | null
  folder:     FolderSel | null
  /** Dia filtrado na semana: vira o prazo sugerido. */
  dueDay:     string | null
  resolveOrg: () => Promise<string | null>
  onClose:    () => void
  onCreated:  (task: Task) => void
}> = ({ today, space, folder, dueDay, resolveOrg, onClose, onCreated }) => {
  const [title,     setTitle]     = useState('')
  const [desc,      setDesc]      = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate,   setDueDate]   = useState(dueDay ?? '')
  const [priority,  setPriority]  = useState(3)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const realFolder = folder && folder.id !== NO_FOLDER ? folder : null
  const where      = space ? [space.name, realFolder?.name].filter(Boolean).join(' › ') : null

  const save = async () => {
    if (!title.trim()) { setError('Informe o nome da tarefa.'); return }
    setSaving(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Sua sessão expirou. Entre de novo para criar a tarefa.'); setSaving(false); return }
    // REGRA #5: nunca org_id nulo — a org vem do espaço, do topo, ou é perguntada.
    const orgId = await resolveOrg()
    if (!orgId) { setSaving(false); return }
    const { data, error: e } = await supabase.from('tasks').insert({
      title:         title.trim(),
      description:   desc.trim() || null,
      start_date:    toIso(startDate),
      due_date:      toIso(dueDate),
      priority,
      status:        'open',
      source_module: 'manual',
      org_id:        orgId,
      user_id:       user.id,
      space_id:      space?.id ?? null,
      folder_id:     realFolder?.id ?? null,
    }).select(TASK_COLS).single()
    setSaving(false)
    if (e || !data) { console.error('[tarefas mobile] criar', e); setError(falha('criar a tarefa')); return }
    onCreated(data as Task)
  }

  return (
    <BottomSheet title="Nova tarefa" onClose={onClose}>
      <div className="overflow-y-auto flex-1 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
        {where && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <Folder className="w-3.5 h-3.5" aria-hidden="true" />
            Em <span className="font-medium text-slate-800 truncate">{where}</span>
          </p>
        )}
        <input
          autoFocus value={title} onChange={e => setTitle(e.target.value)}
          aria-label="Nome da tarefa"
          placeholder="Nome da tarefa *"
          className="w-full text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2.5 outline-none placeholder:text-slate-500 focus:border-blue-500 transition-colors"
        />
        <textarea
          value={desc} onChange={e => setDesc(e.target.value)}
          aria-label="Descrição"
          placeholder="Descrição..." rows={2}
          className="w-full text-form-input text-slate-800 border-b border-slate-200 pb-2 outline-none resize-none placeholder:text-slate-500 bg-transparent focus:border-blue-300 transition-colors"
        />
        <DatesField start={startDate} due={dueDate} today={today} onStart={setStartDate} onDue={setDueDate} />
        <PriorityField value={priority} onChange={setPriority} />
        {error && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 rounded-[6px] px-3 py-2">{error}</p>}
        <Button onClick={save} disabled={saving} className="w-full py-3 active:scale-[0.98]">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Criar tarefa
        </Button>
      </div>
    </BottomSheet>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
type NavTab    = 'inbox' | 'espacos'
type FilterTab = 'todas' | 'atrasadas'

const TasksMobileApp: React.FC<Props> = ({ orgId, previa = false }) => {
  const today = useToday()
  const now   = useMemo(() => Date.now(), [today])   // "Nova" acompanha a virada do dia

  const [tasks,          setTasks]          = useState<Task[]>([])
  const [loadingTasks,   setLoading]        = useState(true)
  const [loadError,      setLoadError]      = useState(false)
  const [truncated,      setTruncated]      = useState(false)
  const [loadedScope,    setLoadedScope]    = useState<FolderSel | null>(null)
  const [projectNames,   setProjectNames]   = useState<Map<string, string>>(new Map())
  const [statuses,       setStatuses]       = useState<TaskStatus[]>([])
  const [spaces,         setSpaces]         = useState<TaskSpaceWithMeta[]>([])
  const [loadingSpaces,  setLoadingSpaces]  = useState(false)
  const [spacesError,    setSpacesError]    = useState(false)
  const [filterTab,      setFilterTab]      = useState<FilterTab>('todas')
  const [nav,            setNav]            = useState<NavTab>('inbox')
  const [selectedSpace,  setSelectedSpace]  = useState<TaskSpaceWithMeta | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<FolderSel | null>(null)
  const [editingTask,    setEditingTask]    = useState<Task | null>(null)
  const [showAddTask,    setShowAddTask]    = useState(false)
  const [showCalendar,   setShowCalendar]   = useState(false)
  const [completing,     setCompleting]     = useState<Set<string>>(new Set())
  const [selectedDay,    setSelectedDay]    = useState<string | null>(null)
  const [weekStart,      setWeekStart]      = useState<Date>(() => weekStartOf(new Date()))
  const [toast,          setToast]          = useState<ToastState | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const loadSeq    = useRef(0)
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget()

  const showToast = useCallback((t: ToastState) => {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])
  const hideToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null) }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ── Carga ──
  const loadTasks = useCallback(async (scope: FolderSel | null) => {
    const seq = ++loadSeq.current
    setLoading(true); setLoadError(false)
    let q = supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('status', 'open')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .limit(TASK_LIMIT)
    if (orgId) q = q.eq('org_id', orgId)
    if (scope) {
      q = scope.id === NO_FOLDER
        ? q.eq('space_id', scope.space_id).is('folder_id', null)
        : q.eq('folder_id', scope.id)
    }
    const { data, error } = await q
    if (seq !== loadSeq.current) return   // outra carga começou depois desta
    if (error) {
      console.error('[tarefas mobile] carregar', error)
      setLoadError(true); setLoading(false)
      return
    }
    const rows = (data ?? []) as Task[]
    setTasks(rows)
    setTruncated(rows.length === TASK_LIMIT)
    setLoadedScope(scope)
    setLoading(false)

    // Nome da obra só das tarefas na tela (antes: as 200 primeiras obras da org).
    const ids = [...new Set(rows.map(t => t.project_id).filter((id): id is string => !!id))]
    if (ids.length) {
      const { data: pd } = await supabase.from('projects').select('id, name').in('id', ids)
      setProjectNames(new Map((pd ?? []).map((p: { id: string; name: string }) => [p.id, p.name])))
    }
  }, [orgId])

  const loadSpaces = useCallback(async () => {
    setLoadingSpaces(true); setSpacesError(false)
    try {
      setSpaces(await taskSpaceService.listSpaces(orgId ?? ''))
    } catch (e) {
      console.error('[tarefas mobile] espaços', e)
      setSpacesError(true)
    } finally {
      setLoadingSpaces(false)
    }
  }, [orgId])

  useEffect(() => {
    loadTasks(null)
    loadSpaces()
    ;(orgId ? taskStatusService.list(orgId) : taskStatusService.listAll())
      .then(setStatuses)
      .catch(() => setStatuses([]))
  }, [orgId, loadTasks, loadSpaces])

  // ── Concluir / desfazer ──
  const reopen = useCallback(async (task: Task) => {
    hideToast()
    const ownStatuses = statusesOfOrg(statuses, task.org_id).length > 0
    setTasks(prev => (prev.some(t => t.id === task.id) ? prev : [...prev, task]))
    const { error } = await supabase.from('tasks')
      .update({ status: 'open', ...(ownStatuses ? { status_id: task.status_id ?? null } : {}) })
      .eq('id', task.id)
    if (error) {
      console.error('[tarefas mobile] desfazer', error)
      setTasks(prev => prev.filter(t => t.id !== task.id))
      showToast({ message: falha('desfazer'), tone: 'error' })
    }
  }, [statuses, hideToast, showToast])

  const complete = useCallback(async (task: Task) => {
    setCompleting(prev => new Set(prev).add(task.id))
    // Mesmo critério do desktop: com status próprios, grava o status "concluído" da org da tarefa.
    const ownStatuses = statusesOfOrg(statuses, task.org_id).length > 0
    const patch = { status: 'done', ...(ownStatuses ? { status_id: doneStatusOfOrg(statuses, task.org_id)?.id ?? null } : {}) }
    const [{ error }] = await Promise.all([
      supabase.from('tasks').update(patch).eq('id', task.id),
      new Promise(r => setTimeout(r, 450)),   // o check fica visível antes de a tarefa sair
    ])
    setCompleting(prev => { const n = new Set(prev); n.delete(task.id); return n })
    if (error) {
      console.error('[tarefas mobile] concluir', error)
      showToast({ message: falha('concluir a tarefa'), tone: 'error' })
      return
    }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    showToast({ message: 'Tarefa concluída', tone: 'success', action: { label: 'Desfazer', run: () => reopen(task) } })
  }, [statuses, showToast, reopen])

  // ── Recortes ──
  const dueDays = useMemo(
    () => new Set(tasks.filter(t => t.due_date).map(t => dayOf(t.due_date!))),
    [tasks]
  )
  const dayFiltered = useMemo(
    () => (selectedDay && !selectedFolder ? onDay(tasks, selectedDay) : tasks),
    [tasks, selectedDay, selectedFolder]
  )
  const overdueCount = useMemo(() => dayFiltered.filter(t => isOverdue(t.due_date, today)).length, [dayFiltered, today])
  const visible = useMemo(
    () => (filterTab === 'atrasadas' && !selectedFolder ? dayFiltered.filter(t => isOverdue(t.due_date, today)) : dayFiltered),
    [dayFiltered, filterTab, selectedFolder, today]
  )
  // Seções só quando a lista mistura prazos; dia filtrado ou "Atrasadas" já é um recorte só.
  const sections = useMemo(() => {
    if (selectedFolder || (!selectedDay && filterTab === 'todas')) return groupBySection(visible, today)
    return [{ key: 'recorte', label: '', items: groupBySection(visible, today).flatMap(s => s.items) }]
  }, [visible, today, selectedDay, filterTab, selectedFolder])

  const contextOf = useCallback((t: Task) => {
    if (t.project_id && projectNames.has(t.project_id)) return projectNames.get(t.project_id)
    const space = spaces.find(s => s.id === t.space_id)
    if (!space) return undefined
    const folder = space.folders.find(f => f.id === t.folder_id)
    return folder ? `${space.name} › ${folder.name}` : space.name
  }, [projectNames, spaces])

  const days          = useMemo(() => weekDays(weekStart), [weekStart])
  const todayIso      = isoDate(today)
  const isCurrentWeek = weekStart.getTime() === weekStartOf(today).getTime()

  // ── Navegação ──
  const goInbox = useCallback(() => {
    setNav('inbox'); setSelectedSpace(null); setSelectedFolder(null)
    if (loadedScope) loadTasks(null)   // a lista estava com as tarefas de uma pasta
  }, [loadedScope, loadTasks])

  const goEspacos = useCallback(() => {
    setNav('espacos')
    loadSpaces()   // contagens frescas a cada visita
  }, [loadSpaces])

  const openFolder = useCallback((f: FolderSel) => {
    setSelectedFolder(f)
    loadTasks(f)
  }, [loadTasks])

  const goBackFromFolder = useCallback(() => {
    setSelectedFolder(null)
    loadTasks(null)
  }, [loadTasks])

  const goToday = () => setWeekStart(weekStartOf(today))

  const resolveCreateOrg = useCallback(async (): Promise<string | null> => {
    if (selectedSpace) return selectedSpace.org_id
    const target = await resolveWriteOrg('single')
    return target && target.kind === 'org' ? target.orgId : null
  }, [selectedSpace, resolveWriteOrg])

  const onCreated = (task: Task) => {
    setShowAddTask(false)
    setTasks(prev => [...prev, task])   // §22: entra no array local, sem recarregar
    const hidden = !selectedFolder && (
      (selectedDay && (!task.due_date || dayOf(task.due_date) !== selectedDay)) ||
      (filterTab === 'atrasadas' && !isOverdue(task.due_date, today))
    )
    showToast(hidden
      ? { message: 'Tarefa criada, fora do filtro atual', tone: 'success', action: { label: 'Ver', run: () => { setSelectedDay(null); setFilterTab('todas'); hideToast() } } }
      : { message: 'Tarefa criada', tone: 'success' })
  }

  const onEdited = (task: Task) => {
    setEditingTask(null)
    if (task.status !== 'open') {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      showToast({ message: 'Tarefa concluída', tone: 'success' })
      return
    }
    setTasks(prev => prev.map(t => (t.id === task.id ? task : t)))
  }

  // Tela atual
  const inSpacesList = nav === 'espacos' && !selectedSpace
  const inFolderList = nav === 'espacos' && !!selectedSpace && !selectedFolder
  const headerTitle  = selectedFolder ? selectedFolder.name : selectedSpace ? selectedSpace.name : null

  const emptyState = (() => {
    if (selectedFolder) {
      return <EmptyState icon={<FolderOpen className="w-8 h-8 text-slate-400" />} title="Nenhuma tarefa aberta aqui"
        action={{ label: 'Nova tarefa', run: () => setShowAddTask(true) }} />
    }
    if (selectedDay) {
      return <EmptyState icon={<CalendarDays className="w-8 h-8 text-slate-400" />}
        title={filterTab === 'atrasadas' ? 'Nenhuma tarefa atrasada neste dia' : 'Nenhuma tarefa vence neste dia'}
        action={{ label: 'Ver todas as tarefas', run: () => { setSelectedDay(null); setFilterTab('todas') } }} />
    }
    if (filterTab === 'atrasadas') {
      return <EmptyState icon={<CheckCircle2 className="w-8 h-8 text-emerald-600" />} title="Nada atrasado" text="Todas as tarefas estão no prazo." />
    }
    return <EmptyState icon={<CheckCircle2 className="w-8 h-8 text-emerald-600" />} title="Nenhuma tarefa aberta"
      text="Toque em + para criar a primeira." />
  })()

  return (
    <div className={`flex flex-col bg-[#eef2ff] font-sans overflow-hidden relative ${previa
      ? 'h-screen'
      // Celular: ocupa o <main> inteiro — anula o gutter §20.2 (16px; 24px a partir de md).
      : '-m-4 md:-m-6 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)]'}`}
    >
      {/* Prévia: respiro do notch que a moldura desenha por cima do topo */}
      {previa && <div className="h-7 bg-white flex-shrink-0" aria-hidden="true" />}

      {/* Cabeçalho */}
      <header className="bg-white px-4 pt-3 pb-0 flex-shrink-0 border-b border-slate-200">
        {headerTitle ? (
          <div className="flex items-center gap-2 pb-3">
            <button
              type="button"
              onClick={selectedFolder ? goBackFromFolder : () => setSelectedSpace(null)}
              aria-label={selectedFolder ? `Voltar para ${selectedSpace?.name ?? 'o espaço'}` : 'Voltar para Espaços'}
              className="w-10 h-10 rounded-[6px] bg-slate-100 flex items-center justify-center text-slate-700 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {selectedSpace && (
              <span
                className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: tint(selectedSpace.color) }}
                aria-hidden="true"
              >
                {selectedFolder
                  ? <Folder className="w-3.5 h-3.5" style={{ color: selectedFolder.color ?? selectedSpace.color }} />
                  : <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSpace.color }} />}
              </span>
            )}
            <div className="flex-1 min-w-0">
              {selectedFolder && (
                <p className="text-xs font-medium text-slate-600 leading-none mb-0.5 truncate">{selectedSpace?.name}</p>
              )}
              <h1 className="text-base font-black text-slate-900 leading-tight truncate">{headerTitle}</h1>
            </div>
          </div>
        ) : nav === 'espacos' ? (
          <h1 className="text-lg font-black text-slate-900 pb-3">Espaços</h1>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 min-h-10">
              <h1 className="text-lg font-black text-slate-900">Tarefas</h1>
              {!isCurrentWeek && (
                <button type="button" onClick={goToday}
                  className="h-9 px-3 rounded-[6px] border border-slate-200 text-sm font-medium text-slate-700 active:bg-slate-50">
                  Hoje
                </button>
              )}
            </div>

            {/* Semana: o mês abre o calendário; as setas andam uma semana */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCalendar(true)}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 h-10 -ml-1 px-1 rounded-[6px] text-sm font-semibold text-slate-800 active:bg-slate-50"
              >
                <CalendarDays className="w-4 h-4 text-slate-500" aria-hidden="true" />
                {weekMonthLabel(weekStart)}
                <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
              </button>
              <div className="flex items-center -mr-2">
                <button type="button" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Semana anterior"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Próxima semana"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 pt-1 pb-3" role="group" aria-label={`Semana de ${longDayLabel(isoDate(weekStart))}`}>
              {days.map(d => {
                const iso        = isoDate(d)
                const isSelected = iso === selectedDay
                const isToday    = iso === todayIso
                const hasTasks   = dueDays.has(iso)
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : iso)}
                    aria-pressed={isSelected}
                    aria-label={`${longDayLabel(iso)}${isToday ? ', hoje' : ''}${hasTasks ? ', tem tarefas' : ''}`}
                    className={`flex flex-col items-center gap-1 pt-1.5 pb-1 rounded-[10px] transition-colors
                      ${isSelected
                        ? 'bg-blue-600 text-white'
                        : isToday
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 active:bg-slate-50'}`}
                  >
                    <span className="text-xs font-medium">{DAY_LETTER[d.getDay()]}</span>
                    <span className="text-base font-semibold leading-none">{d.getDate()}</span>
                    <span aria-hidden="true" className={`w-1 h-1 rounded-full ${hasTasks ? (isSelected ? 'bg-white' : 'bg-blue-500') : 'bg-transparent'}`} />
                  </button>
                )
              })}
            </div>

            <div role="tablist" aria-label="Filtro das tarefas" className="flex">
              {([
                { key: 'todas',     label: 'Todas',     count: dayFiltered.length },
                { key: 'atrasadas', label: 'Atrasadas', count: overdueCount       },
              ] as const).map(({ key, label, count }) => {
                const sel = filterTab === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={sel}
                    aria-controls="lista-tarefas"
                    onClick={() => setFilterTab(key)}
                    className={`flex items-center gap-1.5 h-11 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors
                      ${sel ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                  >
                    {label}
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-[6px] ${sel ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </header>

      {/* Conteúdo */}
      {inSpacesList ? (
        <EspacosScreen
          spaces={spaces}
          loading={loadingSpaces && spaces.length === 0}
          failed={spacesError}
          onRetry={loadSpaces}
          onSelect={setSelectedSpace}
        />
      ) : inFolderList && selectedSpace ? (
        <FoldersScreen space={selectedSpace} onSelect={openFolder} />
      ) : (
        <div id="lista-tarefas" role={selectedFolder ? undefined : 'tabpanel'} className="flex-1 overflow-y-auto px-4 pt-2 pb-3">
          {selectedDay && !selectedFolder && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-sm text-slate-600">Vencem em</span>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label={`Tirar o filtro de ${longDayLabel(selectedDay)}`}
                className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1.5 rounded-[6px] bg-blue-50 border border-blue-200 text-sm font-medium text-blue-700"
              >
                {chipDayLabel(selectedDay)}
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {loadingTasks ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" aria-label="Carregando tarefas" />
            </div>
          ) : loadError ? (
            <ErrorState message="Não foi possível carregar as tarefas." onRetry={() => loadTasks(selectedFolder)} />
          ) : visible.length === 0 ? (
            emptyState
          ) : (
            sections.map(section => (
              <section key={section.key} aria-label={section.label || undefined}>
                {section.label && (
                  <h2 className="flex items-center gap-1.5 px-1 pt-3 pb-1.5 text-xs font-semibold text-slate-700">
                    {section.label}
                    <span className="font-medium text-slate-500">{section.items.length}</span>
                  </h2>
                )}
                <div className="space-y-2">
                  {section.items.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      context={contextOf(task)}
                      today={today}
                      now={now}
                      completing={completing.has(task.id)}
                      onToggle={complete}
                      onPress={setEditingTask}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {truncated && !loadingTasks && (
            <p className="text-xs text-slate-600 text-center pt-4">
              Mostrando as primeiras {TASK_LIMIT} tarefas. A versão para computador lista todas.
            </p>
          )}
          <div className="h-6" />
        </div>
      )}

      {/* Aviso (com Desfazer) */}
      {toast && (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className="absolute left-4 right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-[10px] bg-slate-900 text-white pl-4 pr-1.5 py-1.5 shadow-xl"
        >
          {toast.tone === 'error'
            ? <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0" aria-hidden="true" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" aria-hidden="true" />}
          <p className="flex-1 text-sm font-medium py-2">{toast.message}</p>
          {toast.action && (
            <button type="button" onClick={toast.action.run}
              className="h-10 px-3 rounded-[6px] text-sm font-semibold text-blue-300 active:bg-white/10">
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {/* Navegação inferior — o "+" no centro, ao alcance do polegar e sem cobrir a lista */}
      <nav
        aria-label="Navegação das tarefas"
        className="bg-white border-t border-slate-200 px-6 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] grid grid-cols-3 items-end flex-shrink-0"
      >
        {([
          { key: 'inbox',   icon: Inbox,      label: 'Entrada', run: goInbox   },
          { key: 'add' },
          { key: 'espacos', icon: LayoutGrid, label: 'Espaços', run: goEspacos },
        ] as const).map(item => item.key === 'add' ? (
          <div key="add" className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowAddTask(true)}
              aria-label="Nova tarefa"
              className="-mt-6 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <button
            key={item.key}
            type="button"
            onClick={item.run}
            aria-current={nav === item.key ? 'page' : undefined}
            className={`h-12 flex flex-col items-center justify-center gap-1 transition-colors ${nav === item.key ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <item.icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {showCalendar && (
        <BottomSheet title="Escolher dia" onClose={() => setShowCalendar(false)}>
          <div className="px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3">
            <MiniCalendar
              value={selectedDay ?? ''}
              today={today}
              marks={dueDays}
              initial={addDays(weekStart, 3)}
              onChange={iso => {
                setSelectedDay(iso || null)
                if (iso) setWeekStart(weekStartOf(dateFromDay(iso)))
                setShowCalendar(false)
              }}
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { goToday(); setShowCalendar(false) }}>Ir para hoje</Button>
              {selectedDay && (
                <Button variant="secondary" className="flex-1" onClick={() => { setSelectedDay(null); setShowCalendar(false) }}>Ver todas</Button>
              )}
            </div>
          </div>
        </BottomSheet>
      )}

      {showAddTask && (
        <AddTaskSheet
          today={today}
          space={selectedSpace}
          folder={selectedFolder}
          dueDay={selectedFolder ? null : selectedDay}
          resolveOrg={resolveCreateOrg}
          onClose={() => setShowAddTask(false)}
          onCreated={onCreated}
        />
      )}

      {editingTask && (
        <TaskEditSheet
          task={editingTask}
          today={today}
          statuses={statusesOfOrg(statuses, editingTask.org_id)}
          onClose={() => setEditingTask(null)}
          onSaved={onEdited}
        />
      )}

      {orgTargetModal}
    </div>
  )
}

export default TasksMobileApp
