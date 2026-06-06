import React, { useState, useRef, useEffect } from 'react'
import { FolderOpen, Plus, Inbox } from 'lucide-react'
import type { TaskSpaceWithMeta } from '../services/taskSpaceService'
import type { TaskRecord } from './TaskForm'

interface Props {
  space: TaskSpaceWithMeta
  tasks: TaskRecord[]                           // tarefas já carregadas (para contar por pasta)
  onSelectFolder: (folderId: string) => void
  onSelectNoFolder: () => void                  // tarefas do espaço sem pasta
  onCreateFolder: (name: string) => void
}

const TaskSpaceFolderView: React.FC<Props> = ({
  space, tasks, onSelectFolder, onSelectNoFolder, onCreateFolder,
}) => {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const inputRef                = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creating) inputRef.current?.focus() }, [creating])

  const confirm = () => {
    const name = newName.trim()
    if (name) onCreateFolder(name)
    setNewName(''); setCreating(false)
  }

  // Contagem de tarefas abertas por pasta
  const countForFolder = (folderId: string) =>
    tasks.filter(t => t.folder_id === folderId && t.status !== 'done' && !t.parent_task_id).length

  const noFolderCount = tasks.filter(
    t => t.space_id === space.id && !t.folder_id && t.status !== 'done' && !t.parent_task_id
  ).length

  return (
    <div className="space-y-6">
      {/* Cabeçalho do espaço */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: space.color }} />
        <h2 className="text-xl font-black text-slate-900">{space.name}</h2>
        <span className="text-sm text-slate-400 font-medium">{space.folders.length} pasta{space.folders.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Grid de pastas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

        {/* Card "Sem pasta" — tarefas diretas no espaço */}
        {noFolderCount > 0 && (
          <button
            onClick={onSelectNoFolder}
            className="flex flex-col gap-3 p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
              <Inbox className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Sem pasta</p>
              <p className="text-xs text-slate-400 mt-0.5">{noFolderCount} tarefa{noFolderCount !== 1 ? 's' : ''} em aberto</p>
            </div>
          </button>
        )}

        {/* Pastas do espaço */}
        {space.folders.map(folder => {
          const count = countForFolder(folder.id)
          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className="flex flex-col gap-3 p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all text-left group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                style={{ backgroundColor: folder.color ? folder.color + '20' : '#f1f5f9' }}
              >
                <FolderOpen
                  className="w-5 h-5"
                  style={{ color: folder.color ?? '#94a3b8' }}
                />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 truncate">{folder.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {count > 0 ? `${count} tarefa${count !== 1 ? 's' : ''} em aberto` : 'Nenhuma tarefa'}
                </p>
              </div>
            </button>
          )
        })}

        {/* Card "+ Nova pasta" */}
        {creating ? (
          <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-300 bg-blue-50">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-blue-500" />
            </div>
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  confirm()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              onBlur={confirm}
              placeholder="Nome da pasta…"
              className="text-sm px-2 py-1 rounded-lg border border-blue-300 outline-none bg-white text-slate-800 w-full"
            />
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600"
          >
            <Plus className="w-6 h-6" />
            <span className="text-xs font-bold">Nova pasta</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default TaskSpaceFolderView
