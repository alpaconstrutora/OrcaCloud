import React, { useEffect, useMemo, useState } from 'react'
import { X, Save, Trash2, Loader2, UserPlus, UserMinus, Settings, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { taskSpaceService, type TaskSpace, type TaskSpaceMember } from '../services/taskSpaceService'

// ── Paleta de cores predefinidas ──────────────────────────────────────────────
const COLOR_PALETTE = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#ef4444', '#f97316', '#f59e0b', '#10b981',
  '#14b8a6', '#06b6d4', '#64748b', '#1e293b',
]

interface OrgMember { user_id: string; name?: string; email: string }

interface Props {
  space: TaskSpace & { folders: { id: string; name: string }[] }
  orgId: string
  onClose: () => void
  onChanged: () => void   // recarrega lista de espaços no pai
  onDeleted: () => void   // espaço foi excluído
}

type Tab = 'settings' | 'members'

const TaskSpaceManager: React.FC<Props> = ({ space, orgId, onClose, onChanged, onDeleted }) => {
  const [tab, setTab] = useState<Tab>('settings')

  // ── Aba Configurações ───────────────────────────────────────────────────
  const [name, setName]   = useState(space.name)
  const [color, setColor] = useState(space.color)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveSettings = async () => {
    if (!name.trim()) return
    setSaving(true); setSaveError(null)
    try {
      await taskSpaceService.updateSpace(space.id, { name: name.trim(), color })
      onChanged()
      onClose()
    } catch (e) {
      setSaveError((e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const deleteSpace = async () => {
    if (!window.confirm(`Excluir o espaço "${space.name}"? As tarefas não serão excluídas — perderão apenas o espaço.`)) return
    setSaving(true)
    try {
      await taskSpaceService.deleteSpace(space.id)
      onDeleted()
      onClose()
    } catch (e) {
      setSaveError((e as Error).message ?? 'Erro ao excluir')
      setSaving(false)
    }
  }

  // ── Aba Membros ─────────────────────────────────────────────────────────
  const [members, setMembers]       = useState<TaskSpaceMember[]>([])
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [loadingM, setLoadingM]     = useState(false)
  const [addingId, setAddingId]     = useState('')
  const [memberError, setMemberError] = useState<string | null>(null)

  const loadMembers = async () => {
    setLoadingM(true)
    try {
      const [m, om] = await Promise.all([
        taskSpaceService.listMembers(space.id),
        supabase
          .from('organization_members')
          .select('user_id, name, email')
          .eq('organization_id', orgId)
          .not('user_id', 'is', null)
          .then(r => (r.data ?? []) as OrgMember[]),
      ])
      setMembers(m)
      setOrgMembers(om)
    } finally {
      setLoadingM(false)
    }
  }

  useEffect(() => { if (tab === 'members') loadMembers() }, [tab])

  // Usuários da org que ainda não são membros do espaço
  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members])
  const eligible  = useMemo(
    () => orgMembers.filter(u => u.user_id && !memberIds.has(u.user_id)),
    [orgMembers, memberIds]
  )

  // Enriquece membros com nome/email da org
  const enriched = useMemo(
    () => members.map(m => {
      const org = orgMembers.find(o => o.user_id === m.user_id)
      return { ...m, display_name: org?.name ?? org?.email ?? m.user_id, email: org?.email ?? '' }
    }),
    [members, orgMembers]
  )

  const addMember = async () => {
    if (!addingId) return
    setMemberError(null)
    try {
      await taskSpaceService.addMember(space.id, addingId)
      setAddingId('')
      await loadMembers()
      onChanged()
    } catch (e) {
      setMemberError((e as Error).message ?? 'Erro ao adicionar membro')
    }
  }

  const removeMember = async (userId: string) => {
    setMemberError(null)
    try {
      await taskSpaceService.removeMember(space.id, userId)
      await loadMembers()
      onChanged()
    } catch (e) {
      setMemberError((e as Error).message ?? 'Erro ao remover membro')
    }
  }

  // ── Initials avatar ─────────────────────────────────────────────────────
  const AVATAR_COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-orange-500','bg-pink-500']
  function avatarCls(name: string) {
    let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
  }
  function initials(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()
  }

  const inp  = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <h2 className="text-base font-black text-slate-900 truncate">{space.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0 px-6">
          {([['settings','Configurações', Settings], ['members','Membros', Users]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all -mb-px
                ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ── Aba Configurações ─────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveSettings()}
                className={'mt-1 ' + inp}
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cor</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                {/* cor customizada */}
                <label className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-colors overflow-hidden" title="Cor personalizada">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 opacity-0 absolute cursor-pointer" />
                  <span className="text-[9px] font-black text-slate-400">#</span>
                </label>
              </div>
              {/* preview */}
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-semibold text-slate-700">{name || 'Prévia do espaço'}</span>
              </div>
            </div>

            {saveError && (
              <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
            )}
          </div>
        )}

        {/* ── Aba Membros ───────────────────────────────────────────────── */}
        {tab === 'members' && (
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {loadingM ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : (
              <>
                {/* Lista atual */}
                <div className="space-y-1">
                  {enriched.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 group">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${avatarCls(m.display_name ?? '')}`}>
                        {initials(m.display_name ?? '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{m.display_name}</p>
                        {m.email && <p className="text-[10px] text-slate-400 truncate">{m.email}</p>}
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0
                        ${m.role === 'owner' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {m.role === 'owner' ? 'Owner' : 'Membro'}
                      </span>
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          title="Remover membro"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Adicionar membro */}
                {eligible.length > 0 && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Adicionar membro</label>
                    <div className="mt-1.5 flex gap-2">
                      <select
                        value={addingId}
                        onChange={e => setAddingId(e.target.value)}
                        className={'flex-1 ' + inp}
                      >
                        <option value="">Selecione um usuário...</option>
                        {eligible.map(u => (
                          <option key={u.user_id} value={u.user_id}>
                            {u.name ?? u.email}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addMember}
                        disabled={!addingId}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {eligible.length === 0 && members.length > 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">Todos os membros da organização já estão neste espaço.</p>
                )}

                {memberError && (
                  <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{memberError}</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={deleteSpace}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir espaço
          </button>
          {tab === 'settings' && (
            <button
              onClick={saveSettings}
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          )}
          {tab === 'members' && (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskSpaceManager
