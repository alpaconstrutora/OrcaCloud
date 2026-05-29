import React, { useEffect, useState } from 'react'
import { X, Loader2, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export type TaskRecord = {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: number
  status: 'open' | 'done' | 'snoozed'
  source_module: string
  source_ref: { type?: string; id?: string; route?: string } | null
  completed_at: string | null
  created_at: string
}

interface Props {
  orgId: string
  task?: TaskRecord | null
  onClose: () => void
  onSaved: () => void
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
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60_000)
  return local.toISOString().slice(0, 16)
}

const TaskForm: React.FC<Props> = ({ orgId, task, onClose, onSaved }) => {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [due, setDue] = useState(toLocalInput(task?.due_date ?? null))
  const [priority, setPriority] = useState<number>(task?.priority ?? 3)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!title.trim()) { setError('Título é obrigatório'); return }
    setSaving(true); setError(null)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: due ? new Date(due).toISOString() : null,
      priority,
    }
    try {
      if (task?.id) {
        const { error: e } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (e) throw e
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado')
        const { error: e } = await supabase.from('tasks').insert({
          ...payload,
          org_id: orgId,
          user_id: user.id,
          source_module: 'manual',
        })
        if (e) throw e
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!task?.id) return
    if (!window.confirm('Excluir esta tarefa?')) return
    setSaving(true)
    const { error: e } = await supabase.from('tasks').delete().eq('id', task.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">
            {task?.id ? 'Editar tarefa' : 'Nova tarefa'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Título *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              placeholder="O que precisa ser feito?"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prazo</label>
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prioridade</label>
              <div className="mt-1 flex gap-1.5">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all
                      ${priority === p.value ? p.cls + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
          <div>
            {task?.id && (
              <button
                onClick={remove}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
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
