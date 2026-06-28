import React, { useEffect, useState } from 'react'
import {
  Calendar, AlertTriangle, ListChecks, Inbox,
  ChevronRight, ChevronDown, FolderOpen, X,
} from 'lucide-react'
import type { TaskSpaceWithMeta } from '../services/taskSpaceService'
import type { FilterView } from './TasksModule'

interface Props {
  open: boolean
  spaces: TaskSpaceWithMeta[]
  selectedSpaceId: string | null
  selectedFolderId: string | null
  activeFilter: FilterView
  todayCount: number
  overdueCount: number
  noSpaceCount: number
  onSelectInbox: (filter: FilterView) => void
  onSelectSpace: (spaceId: string, folderId?: string | null) => void
  onSelectNoSpace: () => void
  onClose: () => void
}

function dot(color: string) {
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

const TaskSpaceBottomSheet: React.FC<Props> = ({
  open, spaces,
  selectedSpaceId, selectedFolderId, activeFilter,
  todayCount, overdueCount, noSpaceCount,
  onSelectInbox, onSelectSpace, onSelectNoSpace, onClose,
}) => {
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set())
  // Controla animação: mount antes de abrir, unmount depois de fechar
  const [visible, setVisible] = useState(false)
  const [animIn, setAnimIn]   = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
    } else {
      setAnimIn(false)
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // Auto-expande espaço ativo
  useEffect(() => {
    if (selectedSpaceId && selectedSpaceId !== '__none__') {
      setExpandedSpaces(prev => new Set([...prev, selectedSpaceId]))
    }
  }, [selectedSpaceId])

  const toggleExpand = (spaceId: string) =>
    setExpandedSpaces(prev => { const s = new Set(prev); s.has(spaceId) ? s.delete(spaceId) : s.add(spaceId); return s })

  const pick = (fn: () => void) => { fn(); onClose() }

  if (!visible) return null

  const isInbox = selectedSpaceId === null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden
          ${animIn ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out md:hidden
          ${animIn ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '80vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header da sheet */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <span className="text-sm font-black text-slate-800">Navegar</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="overflow-y-auto px-4 py-3 space-y-1" style={{ maxHeight: 'calc(80vh - 80px)' }}>

          {/* ── INBOX ──────────────────────────────────────────────────── */}
          <p className="px-2 pt-1 pb-2 text-xs font-black text-slate-400 uppercase tracking-widest">Inbox</p>

          {([
            ['today',   'Hoje',          <Calendar      className="w-4 h-4" />, todayCount  ],
            ['overdue', 'Atrasadas',     <AlertTriangle className="w-4 h-4" />, overdueCount],
            ['all',     'Todas as minhas', <ListChecks  className="w-4 h-4" />, 0           ],
          ] as const).map(([filter, label, icon, count]) => {
            const active = isInbox && activeFilter === filter
            return (
              <button
                key={filter}
                onClick={() => pick(() => onSelectInbox(filter))}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left
                  ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                <span className={active ? 'text-blue-500' : 'text-slate-400'}>{icon}</span>
                <span className="flex-1">{label}</span>
                {(count as number) > 0 && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${active ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                    {count as number}
                  </span>
                )}
              </button>
            )
          })}

          <button
            onClick={() => pick(onSelectNoSpace)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left
              ${selectedSpaceId === '__none__' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Inbox className={`w-4 h-4 ${selectedSpaceId === '__none__' ? 'text-blue-500' : 'text-slate-400'}`} />
            <span className="flex-1">Sem espaço</span>
            {noSpaceCount > 0 && (
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${selectedSpaceId === '__none__' ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                {noSpaceCount}
              </span>
            )}
          </button>

          {/* ── ESPAÇOS ────────────────────────────────────────────────── */}
          {spaces.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-2 text-xs font-black text-slate-400 uppercase tracking-widest">Espaços</p>

              {spaces.map(space => {
                const isExpanded    = expandedSpaces.has(space.id)
                const isSpaceActive = selectedSpaceId === space.id && !selectedFolderId

                return (
                  <div key={space.id}>
                    <div className={`flex items-center gap-1 rounded-xl transition-all ${isSpaceActive ? 'bg-blue-50' : 'hover:bg-slate-100'}`}>
                      {/* toggle */}
                      {space.folders.length > 0 ? (
                        <button onClick={() => toggleExpand(space.id)} className="p-2 text-slate-300 flex-shrink-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      ) : (
                        <span className="w-8 flex-shrink-0" />
                      )}

                      {/* nome */}
                      <button
                        onClick={() => pick(() => onSelectSpace(space.id, null))}
                        className={`flex items-center gap-2.5 flex-1 min-w-0 py-3 pr-3 text-sm font-semibold text-left
                          ${isSpaceActive ? 'text-blue-700' : 'text-slate-700'}`}
                      >
                        {dot(space.color)}
                        <span className="truncate flex-1">{space.name}</span>
                        {space.open_task_count > 0 && (
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0 ${isSpaceActive ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                            {space.open_task_count}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Pastas */}
                    {isExpanded && space.folders.map(folder => {
                      const isFolderActive = selectedSpaceId === space.id && selectedFolderId === folder.id
                      return (
                        <button
                          key={folder.id}
                          onClick={() => pick(() => onSelectSpace(space.id, folder.id))}
                          className={`w-full flex items-center gap-3 pl-10 pr-3 py-3 rounded-xl text-sm font-medium text-left transition-all
                            ${isFolderActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                          <FolderOpen className={`w-4 h-4 flex-shrink-0 ${isFolderActive ? 'text-blue-500' : 'text-slate-400'}`}
                            style={folder.color ? { color: folder.color } : undefined}
                          />
                          {folder.name}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}

          {/* padding inferior para scroll confortável */}
          <div className="h-4" />
        </div>
      </div>
    </>
  )
}

export default TaskSpaceBottomSheet
