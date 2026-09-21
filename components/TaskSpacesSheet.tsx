import React, { useState } from 'react'
import { ArrowDown, ArrowUp, FolderOpen, LayoutGrid, Plus } from 'lucide-react'
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet'
import ActionIconButton from './ui/ActionIconButton'
import { taskSpaceService, type TaskSpaceWithMeta } from '../services/taskSpaceService'

interface Props {
  open: boolean
  spaces: TaskSpaceWithMeta[]
  loading: boolean
  /** Sem organização definida no topo não dá para criar espaço (o botão fica desabilitado). */
  canCreate: boolean
  onClose: () => void
  onCreateSpace: (name: string) => Promise<void> | void
  /** Abre o `TaskSpaceManager` (nome, cor, pastas, membros, excluir) daquele espaço. */
  onManageSpace: (space: TaskSpaceWithMeta) => void
  /** Recarrega a lista depois de reordenar. */
  onReloaded: () => void
}

/**
 * Painel "Espaços" — o que sobrou do antigo rail lateral de Tarefas depois que a
 * navegação (Prazo / Espaço / Pasta) foi para a toolbar acoplada da tabela: criar
 * espaço, reordenar (↑/↓ em vez de arrastar) e abrir o gerenciador de cada um.
 * Plano: docs/planos/2026-09-21-tarefas-sem-painel-lateral.md.
 */
const TaskSpacesSheet: React.FC<Props> = ({ open, spaces, loading, canCreate, onClose, onCreateSpace, onManageSpace, onReloaded }) => {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [reordering, setReordering] = useState(false)

  const create = async () => {
    const name = newName.trim()
    if (!name || !canCreate) return
    setCreating(true)
    try {
      await onCreateSpace(name)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= spaces.length) return
    const ids = spaces.map(s => s.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    setReordering(true)
    try {
      await taskSpaceService.reorderSpaces(ids)
      onReloaded()
    } catch (e) {
      console.error('[spaces] reorder', e)
    } finally {
      setReordering(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} size="md">
      <SheetHeader onClose={onClose}>
        <SheetTitle>Espaços</SheetTitle>
        <SheetDescription>Crie, ordene e gerencie os espaços e pastas das tarefas desta organização.</SheetDescription>
      </SheetHeader>
      <SheetPanel className="p-6 space-y-6">
        {/* Novo espaço — §30: rótulo 6px acima do campo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Novo espaço</label>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="Nome do espaço…"
              disabled={!canCreate || creating}
              className="flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
            <button
              onClick={create}
              disabled={!canCreate || creating || !newName.trim()}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-[15px] h-[15px]" />
              Criar
            </button>
          </div>
          {!canCreate && (
            <p className="text-xs text-amber-700">Selecione uma organização no topo para criar espaços.</p>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando...</p>
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-12">
            <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum espaço</h3>
            <p className="text-sm text-gray-500">Crie o primeiro espaço acima para organizar as tarefas.</p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-gray-100 divide-y divide-gray-100">
            {spaces.map((space, i) => (
              <div key={space.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: space.color }} />
                <div className="flex-1 min-w-0">
                  <p title={space.name} className="text-sm font-normal text-gray-800 truncate">{space.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    {space.open_task_count} aberta{space.open_task_count === 1 ? '' : 's'}
                    <span className="text-gray-300">·</span>
                    <FolderOpen className="w-3 h-3" />
                    {space.folders.length} pasta{space.folders.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <ActionIconButton kind="move" size="sm" title="Mover para cima" icon={<ArrowUp className="w-3.5 h-3.5" />}
                    disabled={reordering || i === 0} onClick={() => move(i, -1)} />
                  <ActionIconButton kind="move" size="sm" title="Mover para baixo" icon={<ArrowDown className="w-3.5 h-3.5" />}
                    disabled={reordering || i === spaces.length - 1} onClick={() => move(i, 1)} />
                  <ActionIconButton kind="settings" size="sm" title="Gerenciar espaço (nome, cor, pastas, membros)" onClick={() => onManageSpace(space)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetPanel>
    </Sheet>
  )
}

export default TaskSpacesSheet
