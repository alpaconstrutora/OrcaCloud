import React, { useState, useRef, useEffect } from 'react'
import {
  Calendar, AlertTriangle, ListChecks, Inbox,
  ChevronRight, ChevronDown, Plus, FolderOpen, Loader2, Hash, Settings2,
} from 'lucide-react'
import type { TaskSpaceWithMeta } from '../services/taskSpaceService'
import type { FilterView } from './TasksModule'

interface Props {
  spaces: TaskSpaceWithMeta[]
  loadingSpaces: boolean
  // contexto ativo
  selectedSpaceId: string | null   // null = inbox, '__none__' = sem espaço, uuid = espaço
  selectedFolderId: string | null
  activeFilter: FilterView          // só relevante quando selectedSpaceId === null
  // contadores (calculados no módulo-pai)
  todayCount: number
  overdueCount: number
  noSpaceCount: number
  // callbacks
  onSelectInbox: (filter: FilterView) => void
  onSelectSpace: (spaceId: string, folderId?: string | null) => void
  onSelectNoSpace: () => void
  onCreateSpace: (name: string) => void
  onCreateFolder: (spaceId: string, name: string) => void
  onManageSpace: (space: TaskSpaceWithMeta) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dot(color: string) {
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

// ─────────────────────────────────────────────────────────────────────────────

const TaskSpaceRail: React.FC<Props> = ({
  spaces, loadingSpaces,
  selectedSpaceId, selectedFolderId, activeFilter,
  todayCount, overdueCount, noSpaceCount,
  onSelectInbox, onSelectSpace, onSelectNoSpace,
  onCreateSpace, onCreateFolder, onManageSpace,
}) => {
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set())
  const [creatingSpace, setCreatingSpace]   = useState(false)
  const [newSpaceName, setNewSpaceName]     = useState('')
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null)
  const [newFolderName, setNewFolderName]   = useState('')
  const newSpaceRef  = useRef<HTMLInputElement>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)

  // Auto-expande espaço ao selecioná-lo
  useEffect(() => {
    if (selectedSpaceId && selectedSpaceId !== '__none__') {
      setExpandedSpaces(prev => new Set([...prev, selectedSpaceId]))
    }
  }, [selectedSpaceId])

  useEffect(() => { if (creatingSpace)    newSpaceRef.current?.focus()  }, [creatingSpace])
  useEffect(() => { if (creatingFolderIn) newFolderRef.current?.focus() }, [creatingFolderIn])

  const toggleExpand = (spaceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedSpaces(prev => {
      const s = new Set(prev)
      s.has(spaceId) ? s.delete(spaceId) : s.add(spaceId)
      return s
    })
  }

  const handleCreateSpace = () => {
    const name = newSpaceName.trim()
    if (!name) { setCreatingSpace(false); return }
    onCreateSpace(name)
    setNewSpaceName('')
    setCreatingSpace(false)
  }

  const handleCreateFolder = (spaceId: string) => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolderIn(null); return }
    onCreateFolder(spaceId, name)
    setNewFolderName('')
    setCreatingFolderIn(null)
  }

  // ── item de nav ────────────────────────────────────────────────────────────
  function NavItem({
    active, onClick, children, count, indent = false,
  }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
    count?: number
    indent?: boolean
  }) {
    return (
      <button
        onClick={onClick}
        className={[
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all text-left group/nav',
          indent ? 'pl-5' : '',
          active
            ? 'bg-blue-50 text-blue-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 flex-1 min-w-0">{children}</span>
        {count !== undefined && count > 0 && (
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${active ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
            {count}
          </span>
        )}
      </button>
    )
  }

  const isInbox = selectedSpaceId === null

  return (
    <div className="hidden md:flex flex-col w-52 flex-shrink-0 gap-1 pt-1">

      {/* ── INBOX ────────────────────────────────────────────────────────── */}
      <p className="px-2 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Inbox</p>

      <NavItem
        active={isInbox && activeFilter === 'today'}
        onClick={() => onSelectInbox('today')}
        count={todayCount}
      >
        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
        Hoje
      </NavItem>

      <NavItem
        active={isInbox && activeFilter === 'overdue'}
        onClick={() => onSelectInbox('overdue')}
        count={overdueCount}
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        Atrasadas
      </NavItem>

      <NavItem
        active={isInbox && activeFilter === 'all'}
        onClick={() => onSelectInbox('all')}
      >
        <ListChecks className="w-3.5 h-3.5 flex-shrink-0" />
        Todas as minhas
      </NavItem>

      <NavItem
        active={selectedSpaceId === '__none__'}
        onClick={onSelectNoSpace}
        count={noSpaceCount}
      >
        <Inbox className="w-3.5 h-3.5 flex-shrink-0" />
        Sem espaço
      </NavItem>

      {/* ── ESPAÇOS ──────────────────────────────────────────────────────── */}
      <div className="mt-3 mb-1 flex items-center justify-between px-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Espaços</p>
        <button
          onClick={() => setCreatingSpace(true)}
          title="Novo espaço"
          className="text-slate-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {loadingSpaces && (
        <div className="flex items-center gap-2 px-2 py-1 text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Carregando...</span>
        </div>
      )}

      {/* Lista de espaços */}
      {spaces.map(space => {
        const isExpanded    = expandedSpaces.has(space.id)
        const isSpaceActive = selectedSpaceId === space.id && !selectedFolderId

        return (
          <div key={space.id}>
            {/* Espaço */}
            <div className={[
              'flex items-center gap-1 rounded-lg transition-all group/space',
              isSpaceActive ? 'bg-blue-50' : 'hover:bg-slate-100',
            ].join(' ')}>
              {/* Toggle expansão */}
              <button
                onClick={(e) => toggleExpand(space.id, e)}
                className="p-1 text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0"
              >
                {space.folders.length > 0
                  ? isExpanded
                    ? <ChevronDown  className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />
                  : <span className="w-3 h-3 block" />
                }
              </button>

              {/* Nome do espaço */}
              <button
                onClick={() => onSelectSpace(space.id, null)}
                className={[
                  'flex items-center gap-1.5 flex-1 min-w-0 py-1.5 pr-1 text-xs font-semibold text-left',
                  isSpaceActive ? 'text-blue-700' : 'text-slate-700',
                ].join(' ')}
              >
                {dot(space.color)}
                <span className="truncate flex-1">{space.name}</span>
                {space.open_task_count > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${isSpaceActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
                    {space.open_task_count}
                  </span>
                )}
              </button>

              {/* botões no hover */}
              <button
                onClick={(e) => { e.stopPropagation(); setCreatingFolderIn(space.id); setExpandedSpaces(prev => new Set([...prev, space.id])) }}
                title="Nova pasta"
                className="opacity-0 group-hover/space:opacity-100 p-1 text-slate-300 hover:text-blue-600 transition-all flex-shrink-0"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onManageSpace(space) }}
                title="Gerenciar espaço"
                className="opacity-0 group-hover/space:opacity-100 p-1 text-slate-300 hover:text-slate-600 transition-all flex-shrink-0"
              >
                <Settings2 className="w-3 h-3" />
              </button>
            </div>

            {/* Pastas */}
            {isExpanded && (
              <div className="ml-4 mt-0.5 space-y-0.5">
                {space.folders.map(folder => {
                  const isFolderActive = selectedSpaceId === space.id && selectedFolderId === folder.id
                  return (
                    <button
                      key={folder.id}
                      onClick={() => onSelectSpace(space.id, folder.id)}
                      className={[
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-all',
                        isFolderActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                      ].join(' ')}
                    >
                      <FolderOpen className={`w-3.5 h-3.5 flex-shrink-0 ${folder.color ? '' : 'text-slate-400'}`}
                        style={folder.color ? { color: folder.color } : undefined}
                      />
                      <span className="truncate">{folder.name}</span>
                    </button>
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
                        if (e.key === 'Enter') handleCreateFolder(space.id)
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
              if (e.key === 'Enter') handleCreateSpace()
              if (e.key === 'Escape') { setCreatingSpace(false); setNewSpaceName('') }
            }}
            onBlur={handleCreateSpace}
            placeholder="Nome do espaço…"
            className="flex-1 text-xs py-1 px-2 rounded-lg border border-blue-300 outline-none bg-white text-slate-800 min-w-0"
          />
        </div>
      )}

      {!loadingSpaces && spaces.length === 0 && !creatingSpace && (
        <button
          onClick={() => setCreatingSpace(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Criar primeiro espaço
        </button>
      )}
    </div>
  )
}

export default TaskSpaceRail
