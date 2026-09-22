import React, { useMemo, useState } from 'react'
import { AlertTriangle, Pencil } from 'lucide-react'
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet'
import type { TaskRecord, EmployeeOption, ProjectOption, SpaceOption } from './TaskForm'
import type { TaskStatus } from '../services/taskService'

/** Campos que a edição em lote pode gravar numa tarefa. `undefined` = não alterar. */
export type TaskBulkPatch = Partial<Pick<TaskRecord,
  'status' | 'status_id' | 'priority' | 'assignee_employee_id' | 'project_id' | 'space_id' | 'folder_id' | 'start_date' | 'due_date'
>>

interface Props {
  open: boolean
  tasks: TaskRecord[]
  employees: EmployeeOption[]
  projects: ProjectOption[]
  statuses: TaskStatus[]
  spaces: SpaceOption[]
  onClose: () => void
  /** Grava o patch nas tarefas; rejeita com Error para o painel mostrar a mensagem. */
  onApply: (patch: TaskBulkPatch) => Promise<void>
}

// Sentinelas dos selects: '' = não alterar; CLEAR = gravar NULL.
const CLEAR = '__clear__'
type DateMode = '' | 'set' | 'clear'

const PRIORITIES: { value: TaskRecord['priority']; label: string }[] = [
  { value: 1, label: 'Urgente' }, { value: 2, label: 'Alta' }, { value: 3, label: 'Normal' }, { value: 4, label: 'Baixa' },
]

// Data-só (yyyy-mm-dd) → ISO ao meio-dia local, como o TaskForm grava (TIMESTAMPTZ), para a
// data não escorregar de dia ao voltar do banco (memória: fuso em datas).
function dateToIso(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day, 12, 0, 0).toISOString()
}

/**
 * Edição em lote das tarefas selecionadas (ui_ux_guia_unificado.md §10 — modal dedicado;
 * REGRA #4 — painel lateral). Cada campo nasce em "Não alterar"; só o que o usuário mexer
 * entra no patch. Modelo: BankTxEdicaoEmLoteModal.tsx (Extrato).
 */
const TaskBulkEditSheet: React.FC<Props> = ({ open, tasks, employees, projects, statuses, spaces, onClose, onApply }) => {
  const [statusId, setStatusId]     = useState('')
  const [priority, setPriority]     = useState('')
  const [assignee, setAssignee]     = useState('')
  const [project, setProject]       = useState('')
  const [space, setSpace]           = useState('')
  const [folder, setFolder]         = useState('')
  const [startMode, setStartMode]   = useState<DateMode>('')
  const [startDate, setStartDate]   = useState('')
  const [dueMode, setDueMode]       = useState<DateMode>('')
  const [dueDate, setDueDate]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const spaceFolders = useMemo(() => spaces.find(s => s.id === space)?.folders ?? [], [spaces, space])

  const patch = useMemo<TaskBulkPatch>(() => {
    const p: TaskBulkPatch = {}
    if (statusId) {
      const st = statuses.find(s => s.id === statusId)
      p.status_id = statusId
      p.status = st?.is_done ? 'done' : 'open'
    }
    if (priority) p.priority = Number(priority) as TaskRecord['priority']
    if (assignee) p.assignee_employee_id = assignee === CLEAR ? null : assignee
    if (project)  p.project_id = project === CLEAR ? null : project
    if (space) {
      p.space_id  = space === CLEAR ? null : space
      p.folder_id = space === CLEAR || !folder ? null : folder
    }
    if (startMode === 'clear') p.start_date = null
    if (startMode === 'set' && startDate) p.start_date = dateToIso(startDate)
    if (dueMode === 'clear') p.due_date = null
    if (dueMode === 'set' && dueDate) p.due_date = dateToIso(dueDate)
    return p
  }, [statusId, priority, assignee, project, space, folder, startMode, startDate, dueMode, dueDate, statuses])

  const nothingChanged = Object.keys(patch).length === 0

  const apply = async () => {
    if (nothingChanged) return
    setSaving(true); setError(null)
    try {
      await onApply(patch)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50'
  const label = 'text-xs font-semibold text-slate-500'
  const n = tasks.length

  return (
    <Sheet open={open} onClose={onClose} size="md" dirty={!nothingChanged && !saving}>
      <SheetHeader onClose={onClose}>
        <SheetTitle>Editar em lote</SheetTitle>
        <SheetDescription>{n} tarefa{n !== 1 ? 's' : ''} selecionada{n !== 1 ? 's' : ''} · deixe em "Não alterar" o que deve ficar como está.</SheetDescription>
      </SheetHeader>

      <SheetPanel className="p-6 space-y-6">
        {/* Resumo do lote */}
        <div className="rounded-[10px] border border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-36 overflow-y-auto">
          {tasks.map(t => (
            <p key={t.id} title={t.title} className="px-3 py-1.5 text-sm text-gray-700 truncate">{t.title}</p>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Campos — malha §30: rótulo 6px, campos 16/24px */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Pencil className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Alterar campos</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <label htmlFor="bulk-status" className={label}>Status</label>
              <select id="bulk-status" value={statusId} onChange={e => setStatusId(e.target.value)} disabled={saving || statuses.length === 0} className={field}>
                <option value="">Não alterar</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-priority" className={label}>Prioridade</label>
              <select id="bulk-priority" value={priority} onChange={e => setPriority(e.target.value)} disabled={saving} className={field}>
                <option value="">Não alterar</option>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-assignee" className={label}>Responsável</label>
              <select id="bulk-assignee" value={assignee} onChange={e => setAssignee(e.target.value)} disabled={saving} className={field}>
                <option value="">Não alterar</option>
                <option value={CLEAR}>Remover responsável</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-project" className={label}>Obra</label>
              <select id="bulk-project" value={project} onChange={e => setProject(e.target.value)} disabled={saving} className={field}>
                <option value="">Não alterar</option>
                <option value={CLEAR}>Remover obra</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-space" className={label}>Espaço</label>
              <select id="bulk-space" value={space} onChange={e => { setSpace(e.target.value); setFolder('') }} disabled={saving} className={field}>
                <option value="">Não alterar</option>
                <option value={CLEAR}>Remover do espaço</option>
                {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-folder" className={label}>Pasta</label>
              <select id="bulk-folder" value={folder} onChange={e => setFolder(e.target.value)} disabled={saving || !space || space === CLEAR || spaceFolders.length === 0} className={field}>
                <option value="">{space && space !== CLEAR ? 'Sem pasta' : '—'}</option>
                {spaceFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-start" className={label}>Data inicial</label>
              <div className="flex items-center gap-2">
                <select id="bulk-start" value={startMode} onChange={e => setStartMode(e.target.value as DateMode)} disabled={saving} className={field + ' w-auto shrink-0'}>
                  <option value="">Não alterar</option>
                  <option value="set">Definir</option>
                  <option value="clear">Limpar</option>
                </select>
                {startMode === 'set' && <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={saving} className={field} />}
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-due" className={label}>Vencimento</label>
              <div className="flex items-center gap-2">
                <select id="bulk-due" value={dueMode} onChange={e => setDueMode(e.target.value as DateMode)} disabled={saving} className={field + ' w-auto shrink-0'}>
                  <option value="">Não alterar</option>
                  <option value="set">Definir</option>
                  <option value="clear">Limpar</option>
                </select>
                {dueMode === 'set' && <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={saving} className={field} />}
              </div>
            </div>
          </div>
        </div>
      </SheetPanel>

      <SheetFooter>
        <button onClick={onClose} disabled={saving} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
          Cancelar
        </button>
        <button
          onClick={apply}
          disabled={saving || nothingChanged}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Aplicando…' : `Aplicar em ${n} tarefa${n !== 1 ? 's' : ''}`}
        </button>
      </SheetFooter>
    </Sheet>
  )
}

export default TaskBulkEditSheet
