import React, { useEffect, useState } from 'react'
import { X, Plus, Save, Loader2, GripVertical, Check } from 'lucide-react'
import { taskStatusService, type TaskStatus } from '../services/taskService'
import Button from './ui/Button'
import ActionIconButton from './ui/ActionIconButton'

const COLORS = [
  { hex: '#94a3b8', label: 'Cinza' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#f59e0b', label: 'Amarelo' },
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#8b5cf6', label: 'Roxo' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#06b6d4', label: 'Ciano' },
  { hex: '#84cc16', label: 'Lima' },
]

interface Props {
  orgId: string
  onClose: () => void
  onChanged: () => void
}

interface EditingStatus {
  id?: string
  name: string
  color: string
  is_default: boolean
  is_done: boolean
  position: number
}

const TaskStatusManager: React.FC<Props> = ({ orgId, onClose, onChanged }) => {
  const [statuses, setStatuses]     = useState<TaskStatus[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [editing, setEditing]       = useState<EditingStatus | null>(null)
  const [showNew, setShowNew]       = useState(false)
  const [newStatus, setNewStatus]   = useState<EditingStatus>({ name: '', color: '#3b82f6', is_default: false, is_done: false, position: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const data = await taskStatusService.list(orgId)
      setStatuses(data)
    } catch {
      setError('Erro ao carregar status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orgId])

  const saveEdit = async (s: EditingStatus) => {
    if (!s.name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(s.id ?? 'new')
    setError(null)
    try {
      if (s.id) {
        await taskStatusService.update(s.id, {
          name: s.name.trim(),
          color: s.color,
          is_default: s.is_default,
          is_done: s.is_done,
        })
        // if set as default, clear other defaults
        if (s.is_default) {
          for (const other of statuses.filter(o => o.id !== s.id && o.is_default)) {
            await taskStatusService.update(other.id, { is_default: false })
          }
        }
      } else {
        const maxPos = statuses.length > 0 ? Math.max(...statuses.map(x => x.position)) + 1 : 0
        await taskStatusService.create({
          org_id: orgId,
          name: s.name.trim(),
          color: s.color,
          position: maxPos,
          is_default: s.is_default,
          is_done: s.is_done,
        })
        if (s.is_default) {
          const loaded = await taskStatusService.list(orgId)
          const created = loaded.find(x => x.name === s.name.trim())
          if (created) {
            for (const other of loaded.filter(o => o.id !== created.id && o.is_default)) {
              await taskStatusService.update(other.id, { is_default: false })
            }
          }
        }
      }
      await load()
      onChanged()
      setEditing(null)
      setShowNew(false)
      setNewStatus({ name: '', color: '#3b82f6', is_default: false, is_done: false, position: 0 })
    } catch (e) {
      const err = e as { message?: string }
      setError(err.message ?? 'Erro ao salvar')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Excluir este status? Tarefas vinculadas perderão o status.')) return
    setSaving(id)
    try {
      await taskStatusService.remove(id)
      await load()
      onChanged()
    } catch (e) {
      const err = e as { message?: string }
      setError(err.message ?? 'Erro ao excluir')
    } finally {
      setSaving(null)
    }
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white'

  function StatusForm({ s, onChange, onSave, onCancel }: {
    s: EditingStatus
    onChange: (patch: Partial<EditingStatus>) => void
    onSave: () => void
    onCancel: () => void
  }) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <input
            autoFocus
            value={s.name}
            onChange={(e) => onChange({ name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave() }}
            placeholder="Nome do status"
            className={inp + ' flex-1'}
          />
          <div className="flex items-center gap-1">
            {COLORS.map(c => (
              <button
                key={c.hex}
                title={c.label}
                onClick={() => onChange({ color: c.hex })}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${s.color === c.hex ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-form-label font-bold text-slate-600">
            <input
              type="checkbox"
              checked={s.is_default}
              onChange={(e) => onChange({ is_default: e.target.checked })}
              className="rounded border-slate-300"
            />
            Status padrão (novas tarefas)
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-form-label font-bold text-slate-600">
            <input
              type="checkbox"
              checked={s.is_done}
              onChange={(e) => onChange({ is_done: e.target.checked })}
              className="rounded border-slate-300"
            />
            Marca como concluída
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-button font-black text-slate-500 hover:bg-slate-200 rounded-lg">
            Cancelar
          </button>
          <Button
            onClick={onSave}
            disabled={saving !== null}
            size="sm"
            className="flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">Gerenciar Status</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Crie e organize os status das suas tarefas</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
          {error && (
            <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {statuses.map((s) => (
                <div key={s.id}>
                  {editing?.id === s.id ? (
                    <StatusForm
                      s={editing}
                      onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
                      onSave={() => saveEdit(editing)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 group transition-colors">
                      <GripVertical className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-sm font-bold text-slate-800">{s.name}</span>
                      <div className="flex items-center gap-1.5">
                        {s.is_default && (
                          <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Padrão</span>
                        )}
                        {s.is_done && (
                          <span className="flex items-center gap-1 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                            <Check className="w-3 h-3" />Conclusão
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditing({ id: s.id, name: s.name, color: s.color, is_default: s.is_default, is_done: s.is_done, position: s.position })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 text-button font-black"
                        >
                          Editar
                        </button>
                        <ActionIconButton
                          kind="delete"
                          size="sm"
                          disabled={saving === s.id}
                          icon={saving === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                          onClick={() => remove(s.id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {showNew ? (
                <StatusForm
                  s={newStatus}
                  onChange={(patch) => setNewStatus(prev => ({ ...prev, ...patch }))}
                  onSave={() => saveEdit(newStatus)}
                  onCancel={() => { setShowNew(false); setNewStatus({ name: '', color: '#3b82f6', is_default: false, is_done: false, position: 0 }) }}
                />
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors text-button font-black"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo status
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-button font-black text-slate-500 hover:bg-slate-200">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskStatusManager
