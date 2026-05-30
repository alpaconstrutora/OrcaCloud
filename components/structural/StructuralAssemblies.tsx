import React, { useState } from 'react'
import { Plus, Trash2, Pencil, ChevronRight, FolderOpen, X, Check, Loader2 } from 'lucide-react'
import { useAssemblies } from '../../hooks/useStructuralQueries'
import { useUpsertAssembly, useDeleteAssembly } from '../../hooks/useStructuralMutations'
import type { StructuralAssembly, UpsertAssemblyInput } from '../../types/structural'

interface Props {
  orgId: string
  projectId: string
  selected: StructuralAssembly | null
  onSelect: (a: StructuralAssembly) => void
}

const StructuralAssemblies: React.FC<Props> = ({ orgId, projectId, selected, onSelect }) => {
  const { data: assemblies = [], isLoading } = useAssemblies(projectId)
  const upsert = useUpsertAssembly(projectId)
  const remove = useDeleteAssembly(projectId)

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [nome, setNome] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startNew = () => { setEditingId('new'); setNome(''); setError(null) }
  const startEdit = (a: StructuralAssembly) => { setEditingId(a.id); setNome(a.nome); setError(null) }
  const cancel = () => { setEditingId(null); setNome('') }

  const submit = () => {
    if (!nome.trim()) return
    const input: UpsertAssemblyInput = {
      id: editingId !== 'new' ? editingId ?? undefined : undefined,
      orgId, projectId, nome: nome.trim(),
    }
    upsert.mutate(input, {
      onSuccess: () => cancel(),
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  const onDelete = (a: StructuralAssembly, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Excluir "${a.nome}" e todos os seus elementos?`)) return
    if (selected?.id === a.id) onSelect(null as unknown as StructuralAssembly)
    remove.mutate(a.id, {
      onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao excluir'),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Estruturas</p>
        <button
          onClick={startNew}
          className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700"
        >
          <Plus className="w-3.5 h-3.5" /> Nova
        </button>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {editingId === 'new' && (
        <div className="flex items-center gap-2">
          <input
            autoFocus value={nome} onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel() }}
            placeholder="Nome da estrutura"
            className="flex-1 rounded-lg border border-blue-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={submit} disabled={upsert.isPending || !nome.trim()}
            className="p-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={cancel} className="p-1.5 text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6 text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : assemblies.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-slate-300">
          <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-medium text-slate-400">Nenhuma estrutura</p>
        </div>
      ) : (
        <div className="space-y-1">
          {assemblies.map(a => (
            editingId === a.id ? (
              <div key={a.id} className="flex items-center gap-2">
                <input
                  autoFocus value={nome} onChange={e => setNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel() }}
                  className="flex-1 rounded-lg border border-blue-300 px-2 py-1.5 text-sm focus:outline-none"
                />
                <button onClick={submit} disabled={upsert.isPending || !nome.trim()}
                  className="p-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                  {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={cancel} className="p-1.5 text-slate-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button
                key={a.id} onClick={() => onSelect(a)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all group
                  ${selected?.id === a.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
              >
                <FolderOpen className="w-4 h-4 flex-shrink-0 opacity-60" />
                <span className="flex-1 text-sm font-bold truncate">{a.nome}</span>
                <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity
                  ${selected?.id === a.id ? 'text-white/70' : 'text-slate-400'}`}>
                  <button onClick={e => { e.stopPropagation(); startEdit(a) }}
                    className="p-1 rounded hover:bg-black/10"><Pencil className="w-3 h-3" /></button>
                  <button onClick={e => onDelete(a, e)}
                    className="p-1 rounded hover:bg-black/10"><Trash2 className="w-3 h-3" /></button>
                </div>
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${selected?.id === a.id ? 'text-white/60' : 'text-slate-300'}`} />
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

export default StructuralAssemblies
