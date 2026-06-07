import React, { useState, useRef, useEffect } from 'react'
import {
  Calendar, AlertTriangle, ListChecks, Inbox,
  ChevronRight, ChevronDown, Plus, FolderOpen, Loader2, Hash, Settings2, GripVertical,
  Pencil, Check, ArrowRightLeft,
} from 'lucide-react'
import { taskSpaceService, type TaskSpaceWithMeta } from '../services/taskSpaceService'
import type { FilterView } from './TasksModule'

interface Props {
  spaces: TaskSpaceWithMeta[]
  loadingSpaces: boolean
  selectedSpaceId: string | null
  selectedFolderId: string | null
  activeFilter: FilterView
  todayCount: number
  overdueCount: number
  noSpaceCount: number
  onSelectInbox: (filter: FilterView) => void
  onSelectSpace: (spaceId: string, folderId?: string | null) => void
  onSelectNoSpace: () => void
  onCreateSpace: (name: string) => void
  onCreateFolder: (spaceId: string, name: string) => void
  onManageSpace: (space: TaskSpaceWithMeta) => void
  onReloaded: () => void
  onTaskDropOnFolder: (taskId: string, spaceId: string, folderId: string) => void
}

function dot(color: string) {
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

const TaskSpaceRail: React.FC<Props> = ({
  spaces, loadingSpaces,
  selectedSpaceId, selectedFolderId, activeFilter,
  todayCount, overdueCount, noSpaceCount,
  onSelectInbox, onSelectSpace, onSelectNoSpace,
  onCreateSpace, onCreateFolder, onManageSpace, onReloaded, onTaskDropOnFolder,
}) => {
  // ── ordem local (para feedback visual imediato no drag) ──────────────────
  const [localSpaces, setLocalSpaces] = useState(spaces)
  useEffect(() => setLocalSpaces(spaces), [spaces])

  // ── drag de espaços ──────────────────────────────────────────────────────
  const [draggingSpaceId, setDraggingSpaceId] = useState<string | null>(null)
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null)

  const dropSpace = async (targetId: string) => {
    if (!draggingSpaceId || draggingSpaceId === targetId) return
    const next = [...localSpaces]
    const from = next.findIndex(s => s.id === draggingSpaceId)
    const to   = next.findIndex(s => s.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLocalSpaces(next)
    setDraggingSpaceId(null); setDragOverSpaceId(null)
    try {
      await taskSpaceService.reorderSpaces(next.map(s => s.id))
      onReloaded()
    } catch (e) {
      console.error('[rail] reorderSpaces', e)
      setLocalSpaces(spaces) // reverte
    }
  }

  // ── drag de pastas ───────────────────────────────────────────────────────
  const [draggingFolderId, setDraggingFolderId]       = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId]       = useState<string | null>(null)
  const draggingFolderSpaceId                         = useRef<string | null>(null)
  // drag de pasta → espaço diferente
  const [folderDragOverSpaceId, setFolderDragOverSpaceId] = useState<string | null>(null)
  // drag de tarefa → pasta (drop para mover tarefa)
  const [taskDragOverFolderId, setTaskDragOverFolderId]   = useState<string | null>(null)

  // edição inline de pasta
  const [editingFolderId, setEditingFolderId]         = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName]     = useState('')
  const editFolderRef                                 = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editingFolderId) editFolderRef.current?.focus() }, [editingFolderId])

  // dropdown "mover pasta para"
  const [movingFolderId, setMovingFolderId]           = useState<string | null>(null)
  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!movingFolderId) return
    const close = () => setMovingFolderId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [movingFolderId])

  const dropFolder = async (spaceId: string, targetFolderId: string) => {
    if (!draggingFolderId || draggingFolderId === targetFolderId) return
    const spaceIdx = localSpaces.findIndex(s => s.id === spaceId)
    if (spaceIdx < 0) return
    const folders = [...localSpaces[spaceIdx].folders]
    const from = folders.findIndex(f => f.id === draggingFolderId)
    const to   = folders.findIndex(f => f.id === targetFolderId)
    if (from < 0 || to < 0) return
    const [moved] = folders.splice(from, 1)
    folders.splice(to, 0, moved)
    const updated = localSpaces.map((s, i) => i === spaceIdx ? { ...s, folders } : s)
    setLocalSpaces(updated)
    setDraggingFolderId(null); setDragOverFolderId(null)
    try {
      await taskSpaceService.reorderFolders(folders.map(f => f.id))
      onReloaded()
    } catch (e) {
      console.error('[rail] reorderFolders', e)
      setLocalSpaces(spaces)
    }
  }

  // Drag de pasta para espaço diferente
  const dropFolderOnSpace = async (targetSpaceId: string) => {
    const fromSpaceId = draggingFolderSpaceId.current
    if (!draggingFolderId || !fromSpaceId || fromSpaceId === targetSpaceId) {
      setDraggingFolderId(null); setFolderDragOverSpaceId(null); return
    }
    const folderId = draggingFolderId
    setDraggingFolderId(null); setFolderDragOverSpaceId(null)
    try {
      await taskSpaceService.moveFolder(folderId, targetSpaceId)
      onReloaded()
    } catch (e) { console.error('[rail] moveFolder', e); setLocalSpaces(spaces) }
  }

  // Editar pasta inline
  const saveEditFolder = async (folderId: string) => {
    const name = editingFolderName.trim()
    setEditingFolderId(null)
    if (!name) return
    try {
      await taskSpaceService.updateFolder(folderId, { name })
      onReloaded()
    } catch (e) { console.error('[rail] renameFolder', e) }
  }

  // Mover pasta via dropdown
  const moveFolderTo = async (folderId: string, newSpaceId: string) => {
    setMovingFolderId(null)
    try {
      await taskSpaceService.moveFolder(folderId, newSpaceId)
      onReloaded()
    } catch (e) { console.error('[rail] moveFolderTo', e) }
  }

  // ── expandir / recolher ──────────────────────────────────────────────────
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (selectedSpaceId && selectedSpaceId !== '__none__')
      setExpandedSpaces(prev => new Set([...prev, selectedSpaceId]))
  }, [selectedSpaceId])

  const toggleExpand = (spaceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedSpaces(prev => { const s = new Set(prev); s.has(spaceId) ? s.delete(spaceId) : s.add(spaceId); return s })
  }

  // ── criação inline ───────────────────────────────────────────────────────
  const [creatingSpace, setCreatingSpace]         = useState(false)
  const [newSpaceName, setNewSpaceName]           = useState('')
  const [creatingFolderIn, setCreatingFolderIn]   = useState<string | null>(null)
  const [newFolderName, setNewFolderName]         = useState('')
  const newSpaceRef  = useRef<HTMLInputElement>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creatingSpace)    newSpaceRef.current?.focus()  }, [creatingSpace])
  useEffect(() => { if (creatingFolderIn) newFolderRef.current?.focus() }, [creatingFolderIn])

  const handleCreateSpace = () => {
    const name = newSpaceName.trim()
    if (!name) { setCreatingSpace(false); return }
    onCreateSpace(name); setNewSpaceName(''); setCreatingSpace(false)
  }
  const handleCreateFolder = (spaceId: string) => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolderIn(null); return }
    onCreateFolder(spaceId, name); setNewFolderName(''); setCreatingFolderIn(null)
  }

  // ── NavItem ──────────────────────────────────────────────────────────────
  function NavItem({ active, onClick, children, count }: {
    active: boolean; onClick: () => void; children: React.ReactNode; count?: number
  }) {
    return (
      <button onClick={onClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-all text-left
          ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
      >
        <span className="flex items-center gap-2 flex-1 min-w-0">{children}</span>
        {count !== undefined && count > 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${active ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
            {count}
          </span>
        )}
      </button>
    )
  }

  const isInbox = selectedSpaceId === null

  return (
    <div className="hidden md:flex flex-col w-64 flex-shrink-0 gap-1 pt-1">

      {/* ── INBOX ────────────────────────────────────────────────────────── */}
      <p className="px-2 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Inbox</p>

      <NavItem active={isInbox && activeFilter === 'today'}   onClick={() => onSelectInbox('today')}   count={todayCount}>
        <Calendar className="w-3.5 h-3.5 flex-shrink-0" /> Hoje
      </NavItem>
      <NavItem active={isInbox && activeFilter === 'overdue'} onClick={() => onSelectInbox('overdue')} count={overdueCount}>
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Atrasadas
      </NavItem>
      <NavItem active={isInbox && activeFilter === 'all'}     onClick={() => onSelectInbox('all')}>
        <ListChecks className="w-3.5 h-3.5 flex-shrink-0" /> Todas as minhas
      </NavItem>
      <NavItem active={selectedSpaceId === '__none__'} onClick={onSelectNoSpace} count={noSpaceCount}>
        <Inbox className="w-3.5 h-3.5 flex-shrink-0" /> Sem espaço
      </NavItem>

      {/* ── ESPAÇOS ──────────────────────────────────────────────────────── */}
      <div className="mt-3 mb-1 flex items-center justify-between px-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Espaços</p>
        <button onClick={() => setCreatingSpace(true)} title="Novo espaço"
          className="text-slate-400 hover:text-blue-600 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {loadingSpaces && (
        <div className="flex items-center gap-2 px-2 py-1 text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Carregando...</span>
        </div>
      )}

      {/* Lista de espaços — draggable */}
      {localSpaces.map(space => {
        const isExpanded      = expandedSpaces.has(space.id)
        const isSpaceActive   = selectedSpaceId === space.id && !selectedFolderId
        const isDragging      = draggingSpaceId === space.id
        const isOver          = dragOverSpaceId === space.id && draggingSpaceId !== space.id
        const isFolderTarget  = folderDragOverSpaceId === space.id && draggingFolderSpaceId.current !== space.id

        return (
          <div
            key={space.id}
            onDragOver={e => {
              e.preventDefault()
              // distingue drag de espaço vs drag de pasta
              if (draggingFolderId) setFolderDragOverSpaceId(space.id)
              else setDragOverSpaceId(space.id)
            }}
            onDragLeave={e => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDragOverSpaceId(null); setFolderDragOverSpaceId(null)
              }
            }}
            onDrop={e => {
              e.preventDefault()
              if (draggingFolderId) dropFolderOnSpace(space.id)
              else dropSpace(space.id)
            }}
            className={`rounded-lg transition-all ${isDragging ? 'opacity-30' : ''} ${isOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''} ${isFolderTarget ? 'bg-violet-50 ring-1 ring-violet-300' : ''}`}
          >
            {/* Linha do espaço */}
            <div className={`flex items-center gap-1 rounded-lg transition-all group/space ${!isDragging && !isOver && isSpaceActive ? 'bg-blue-50' : !isDragging && !isOver ? 'hover:bg-slate-100' : ''}`}>

              {/* Grip drag handle */}
              <div
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; requestAnimationFrame(() => setDraggingSpaceId(space.id)) }}
                onDragEnd={() => { setDraggingSpaceId(null); setDragOverSpaceId(null) }}
                className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 flex-shrink-0"
                title="Arrastar para reordenar"
              >
                <GripVertical className="w-3 h-3" />
              </div>

              {/* Toggle expansão */}
              <button onClick={e => toggleExpand(space.id, e)}
                className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0">
                {space.folders.length > 0
                  ? isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                  : <span className="w-3 h-3 block" />}
              </button>

              {/* Nome */}
              <button onClick={() => onSelectSpace(space.id, null)}
                className={`flex items-center gap-1.5 flex-1 min-w-0 py-1.5 pr-1 text-sm font-medium text-left
                  ${isSpaceActive ? 'text-blue-700' : 'text-slate-700'}`}>
                {dot(space.color)}
                <span className="truncate flex-1">{space.name}</span>
                {space.open_task_count > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                    ${isSpaceActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
                    {space.open_task_count}
                  </span>
                )}
              </button>

              {/* Botões sempre visíveis */}
              <button
                onClick={e => { e.stopPropagation(); setCreatingFolderIn(space.id); setExpandedSpaces(prev => new Set([...prev, space.id])) }}
                title="Nova pasta"
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0">
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onManageSpace(space) }}
                title="Gerenciar espaço"
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors flex-shrink-0">
                <Settings2 className="w-3 h-3" />
              </button>
            </div>

            {/* Pastas — draggable */}
            {isExpanded && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {space.folders.map(folder => {
                  const isFolderActive   = selectedSpaceId === space.id && selectedFolderId === folder.id
                  const isFolderDragging = draggingFolderId === folder.id
                  const isFolderOver     = dragOverFolderId === folder.id && draggingFolderId !== folder.id
                  const isTaskOver       = taskDragOverFolderId === folder.id
                  const isEditing        = editingFolderId === folder.id
                  const isMoving         = movingFolderId  === folder.id
                  const otherSpaces      = localSpaces.filter(s => s.id !== space.id)

                  return (
                    <div
                      key={folder.id}
                      draggable={!isEditing}
                      onDragStart={e => {
                        e.stopPropagation()
                        e.dataTransfer.effectAllowed = 'move'
                        draggingFolderSpaceId.current = space.id
                        requestAnimationFrame(() => setDraggingFolderId(folder.id))
                      }}
                      onDragEnd={() => { setDraggingFolderId(null); setDragOverFolderId(null); setFolderDragOverSpaceId(null); setTaskDragOverFolderId(null) }}
                      onDragOver={e => {
                        e.preventDefault(); e.stopPropagation()
                        const isTaskDrag = e.dataTransfer.types.includes('taskid')
                        if (isTaskDrag) { setTaskDragOverFolderId(folder.id); return }
                        if (!draggingFolderId || draggingFolderSpaceId.current === space.id) setDragOverFolderId(folder.id)
                      }}
                      onDragLeave={e => { e.stopPropagation(); setDragOverFolderId(null); setTaskDragOverFolderId(null) }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation()
                        const taskId = e.dataTransfer.getData('taskId')
                        if (taskId) {
                          onTaskDropOnFolder(taskId, space.id, folder.id)
                          setTaskDragOverFolderId(null); return
                        }
                        if (draggingFolderSpaceId.current === space.id) dropFolder(space.id, folder.id)
                      }}
                      className={`group/folder flex items-center gap-1 rounded-lg transition-all
                        ${isFolderDragging ? 'opacity-30' : ''}
                        ${isFolderOver     ? 'bg-blue-50 ring-1 ring-blue-300' : ''}
                        ${isTaskOver       ? 'bg-emerald-50 ring-2 ring-emerald-400 scale-[1.02]' : ''}
                        ${!isFolderDragging && !isFolderOver && !isTaskOver && isFolderActive ? 'bg-blue-50' : !isFolderDragging && !isFolderOver && !isTaskOver ? 'hover:bg-slate-100' : ''}`}
                    >
                      {/* Grip */}
                      <div className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 flex-shrink-0">
                        <GripVertical className="w-3 h-3" />
                      </div>

                      {/* Nome — ou input de edição */}
                      {isEditing ? (
                        <input
                          ref={editFolderRef}
                          value={editingFolderName}
                          onChange={e => setEditingFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  saveEditFolder(folder.id)
                            if (e.key === 'Escape') setEditingFolderId(null)
                          }}
                          onBlur={() => saveEditFolder(folder.id)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 min-w-0 text-sm px-1.5 py-1 border border-blue-300 rounded-md outline-none bg-white text-slate-800"
                        />
                      ) : (
                        <button
                          onClick={() => onSelectSpace(space.id, folder.id)}
                          className={`flex items-center gap-2 flex-1 min-w-0 py-1.5 text-sm font-medium text-left
                            ${isFolderActive ? 'text-blue-700' : 'text-slate-600 group-hover/folder:text-slate-900'}`}
                        >
                          <FolderOpen className={`w-3.5 h-3.5 flex-shrink-0 ${isFolderActive ? 'text-blue-500' : 'text-slate-400'}`}
                            style={folder.color ? { color: folder.color } : undefined} />
                          <span className="truncate">{folder.name}</span>
                        </button>
                      )}

                      {/* Botão editar */}
                      {!isEditing && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); setMovingFolderId(null) }}
                          title="Renomear pasta"
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {isEditing && (
                        <button
                          onClick={() => saveEditFolder(folder.id)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded flex-shrink-0"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}

                      {/* Botão mover para + dropdown */}
                      {!isEditing && otherSpaces.length > 0 && (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setMovingFolderId(isMoving ? null : folder.id); setEditingFolderId(null) }}
                            title="Mover para outro espaço"
                            className={`p-1 rounded transition-colors ${isMoving ? 'text-violet-600 bg-violet-50' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                          </button>

                          {isMoving && (
                            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[140px] py-1 overflow-hidden">
                              <p className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mover para</p>
                              {otherSpaces.map(s => (
                                <button
                                  key={s.id}
                                  onClick={e => { e.stopPropagation(); moveFolderTo(folder.id, s.id) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                >
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                  <span className="truncate">{s.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Input criação de pasta inline */}
                {creatingFolderIn === space.id && (
                  <div className="flex items-center gap-1 px-1">
                    <Hash className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <input
                      ref={newFolderRef}
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleCreateFolder(space.id)
                        if (e.key === 'Escape') { setCreatingFolderIn(null); setNewFolderName('') }
                      }}
                      onBlur={() => handleCreateFolder(space.id)}
                      placeholder="Nome da pasta…"
                      className="flex-1 text-xs py-1 px-1.5 rounded border border-blue-300 outline-none bg-white text-slate-800 min-w-0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Input criação de espaço inline */}
      {creatingSpace && (
        <div className="flex items-center gap-1.5 px-2 mt-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
          <input
            ref={newSpaceRef}
            value={newSpaceName}
            onChange={e => setNewSpaceName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleCreateSpace()
              if (e.key === 'Escape') { setCreatingSpace(false); setNewSpaceName('') }
            }}
            onBlur={handleCreateSpace}
            placeholder="Nome do espaço…"
            className="flex-1 text-xs py-1 px-2 rounded-lg border border-blue-300 outline-none bg-white text-slate-800 min-w-0"
          />
        </div>
      )}

      {!loadingSpaces && spaces.length === 0 && !creatingSpace && (
        <button onClick={() => setCreatingSpace(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Criar primeiro espaço
        </button>
      )}
    </div>
  )
}

export default TaskSpaceRail
