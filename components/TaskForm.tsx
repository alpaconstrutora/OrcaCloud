import React, { useEffect, useState } from 'react'
import { X, Loader2, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export type TaskRecord = {
  id: string
  org_id: string
  user_id: string
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  priority: number
  status: 'open' | 'done' | 'snoozed'
  source_module: string
  source_ref: { type?: string; id?: string; route?: string } | null
  assignee_employee_id: string | null
  project_id: string | null
  parent_task_id: string | null
  completed_at: string | null
  created_at: string
}

export type EmployeeOption = { id: string; name: string; role: string }
export type ProjectOption  = { id: string; name: string }
export type OrgOption      = { id: string; name: string }

interface Props {
  orgId: string
  orgs: OrgOption[]
  employees: EmployeeOption[]
  projects: ProjectOption[]
  task?: TaskRecord | null
  parentTaskId?: string | null
  parentTaskTitle?: string | null
  onClose: () => void
  onSaved: () => void
  onOrgChange?: (orgId: string) => void
}

const PRIORITIES: Array<{ value: number; label: string; cls: string }> = [
  { value: 1, label: 'Urgente', cls: 'bg-red-100 text-red-700 border-red-200' },
  { value: 2, label: 'Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 3, label: 'Normal',  cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 4, label: 'Baixa',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
]

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const TaskForm: React.FC<Props> = ({
  orgId, orgs, employees, projects, task,
  parentTaskId = null, parentTaskTitle = null,
  onClose, onSaved, onOrgChange,
}) => {
  const [selectedOrgId, setSelectedOrgId] = useState(task?.org_id ?? orgId)
  const [title, setTitle]             = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [startDate, setStartDate]     = useState(toLocalInput(task?.start_date ?? null))
  const [due, setDue]                 = useState(toLocalInput(task?.due_date ?? null))
  const [priority, setPriority]       = useState<number>(task?.priority ?? 3)
  const [assigneeId, setAssigneeId]   = useState<string>(task?.assignee_employee_id ?? '')
  const [projectId, setProjectId]     = useState<string>(task?.project_id ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!title.trim()) { setError('Título é obrigatório'); return }
    if (!selectedOrgId) { setError('Selecione uma organização'); return }
    setSaving(true); setError(null)
    const payload = {
      title:                title.trim(),
      description:          description.trim() || null,
      start_date:           startDate ? new Date(startDate).toISOString() : null,
      due_date:             due       ? new Date(due).toISOString()       : null,
      priority,
      assignee_employee_id: assigneeId || null,
      project_id:           projectId  || null,
    }
    try {
      if (task?.id) {
        const { error: e } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (e) throw e
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado')
        const { data: inserted, error: e } = await supabase
          .from('tasks')
          .insert({
            ...payload,
            org_id: selectedOrgId,
            user_id: user.id,
            source_module: 'manual',
            parent_task_id: parentTaskId ?? null,
          })
          .select().single()
        if (e) throw e
        if (!inserted) throw new Error('Tarefa não foi salva — tente novamente')
      }
      onSaved()
    } catch (e) {
      const err = e as { message?: string; details?: string }
      setError(err.message || err.details || 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!task?.id) return
    if (!window.confirm('Excluir esta tarefa? As subtarefas também serão excluídas.')) return
    setSaving(true)
    const { error: e } = await supabase.from('tasks').delete().eq('id', task.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const sel = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white'
  const inp = 'mt-1 ' + sel

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {task?.id ? 'Editar tarefa' : parentTaskId ? 'Nova subtarefa' : 'Nova tarefa'}
            </h2>
            {parentTaskTitle && (
              <p className="text-xs text-slate-400 mt-0.5 font-medium">↳ {parentTaskTitle}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {orgs.length > 1 && !parentTaskId && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Organização</label>
              <select value={selectedOrgId} onChange={(e) => { setSelectedOrgId(e.target.value); onOrgChange?.(e.target.value) }} className={inp} disabled={!!task?.id}>
                <option value="">Selecione...</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Título *</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="O que precisa ser feito?" />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={'mt-1 ' + sel + ' resize-none'} placeholder="Opcional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Responsável</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inp}>
                <option value="">Nenhum</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}{emp.role ? ` — ${emp.role}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Obra / Projeto</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inp}>
                <option value="">Nenhuma</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data início</label>
              <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Término</label>
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inp} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prioridade</label>
            <div className="mt-1 flex gap-1.5">
              {PRIORITIES.map(p => (
                <button key={p.value} onClick={() => setPriority(p.value)}
                  className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all
                    ${priority === p.value ? p.cls + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
          <div>
            {task?.id && (
              <button onClick={remove} disabled={saving} className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-600 hover:text-red-700">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskForm
