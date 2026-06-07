import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, CheckSquare, Calendar, AlertTriangle, ListChecks, Building2, Settings2, Layers, List, Kanban, LayoutGrid, X } from 'lucide-react'

export type GroupByField = 'none' | 'status' | 'assignee' | 'priority' | 'project' | 'source'
export type FilterView   = 'today' | 'all' | 'overdue'

import { supabase } from '../lib/supabase'
import { taskStatusService, type TaskStatus } from '../services/taskService'
import { taskSpaceService, type TaskSpaceWithMeta } from '../services/taskSpaceService'
import TasksList from './TasksList'
import TaskForm, { type TaskRecord, type EmployeeOption, type ProjectOption, type OrgOption, type TaskDefaults, type SpaceOption } from './TaskForm'
import TaskStatusManager from './TaskStatusManager'
import TasksBoard from './TasksBoard'
import TaskSpaceRail from './TaskSpaceRail'
import TaskSpaceManager from './TaskSpaceManager'
import TaskSpaceBottomSheet from './TaskSpaceBottomSheet'
import TaskSpaceFolderView from './TaskSpaceFolderView'

type ViewMode = 'list' | 'board'

interface Props {
  activeOrganizationId?: string
  organizations?: OrgOption[]
  projects?: Array<{ id: string; name: string; settings?: { organizationId?: string; classification?: string; isSystemProject?: boolean } }>
  onChangeView?: (view: string) => void
}

const TabBtn: React.FC<{
  active: boolean
  icon: React.ElementType
  label: string
  count?: number
  onClick: () => void
}> = ({ active, icon: Icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
      ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
  >
    <Icon className="w-4 h-4" />
    {label}
    {count !== undefined && count > 0 && (
      <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
        {count}
      </span>
    )}
  </button>
)

const TasksModule: React.FC<Props> = ({ activeOrganizationId, organizations = [], projects = [], onChangeView }) => {
  const [view, setView]               = useState<FilterView>('today')
  const [tasks, setTasks]             = useState<TaskRecord[]>([])
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState<TaskRecord | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [showStatusMgr, setShowStatusMgr] = useState(false)
  const [groupBy, setGroupBy]             = useState<GroupByField>('none')
  const [viewMode, setViewMode]           = useState<ViewMode>('list')
  const [taskDefaults, setTaskDefaults]   = useState<TaskDefaults>({})
  const [filterOrg, setFilterOrg]     = useState<string>(activeOrganizationId ?? '')
  const [employees, setEmployees]     = useState<EmployeeOption[]>([])
  const [statuses, setStatuses]       = useState<TaskStatus[]>([])
  const [parentTask, setParentTask]   = useState<TaskRecord | null>(null)

  const [dragResetSignal, setDragResetSignal] = useState(0)

  // ── Espaços ──────────────────────────────────────────────────────────────
  const [spaces, setSpaces]                   = useState<TaskSpaceWithMeta[]>([])
  // SpaceOption para o TaskForm (subconjunto de TaskSpaceWithMeta)
  const spaceOptions = useMemo<SpaceOption[]>(
    () => spaces.map(s => ({ id: s.id, name: s.name, color: s.color, folders: s.folders })),
    [spaces]
  )
  const [loadingSpaces, setLoadingSpaces]     = useState(false)
  // null = inbox pessoal, '__none__' = sem espaço, uuid = espaço específico
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [managingSpace, setManagingSpace]   = useState<TaskSpaceWithMeta | null>(null)
  const [showSpaceSheet, setShowSpaceSheet] = useState(false)

  const loadSpaces = useCallback(async (orgId: string) => {
    setLoadingSpaces(true)
    try {
      const data = await taskSpaceService.listSpaces(orgId)
      setSpaces(data)
    } catch (e) {
      console.error('[spaces] load', e)
      setSpaces([])
    } finally {
      setLoadingSpaces(false)
    }
  }, [])

  // Carrega tarefas
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('id, org_id, user_id, title, description, due_date, priority, status, status_id, snoozed_until, source_module, source_ref, created_at, completed_at, parent_task_id, space_id, folder_id')
      .order('status',   { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })

    if (error) { console.error('[tasks] load', error); setTasks([]) }
    else        { setTasks((data ?? []) as unknown as TaskRecord[]) }
    setLoading(false)
  }, [])

  // Carrega colaboradores da org selecionada para o form
  const loadEmployees = useCallback(async (orgId: string) => {
    if (!orgId) { setEmployees([]); return }
    const { data } = await supabase
      .from('employees')
      .select('id, name, role')
      .eq('org_id', orgId)
      .eq('status', 'ATIVO')
      .order('name')
    setEmployees((data ?? []) as EmployeeOption[])
  }, [])

  const loadStatuses = useCallback(async (orgId: string) => {
    try {
      const data = orgId
        ? await taskStatusService.list(orgId)
        : await taskStatusService.listAll()
      setStatuses(data)
    } catch {
      setStatuses([])
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const orgId = filterOrg || activeOrganizationId || ''
    loadEmployees(orgId)
    loadStatuses(orgId)
    // loadSpaces recebe filterOrg diretamente: '' = todas as orgs (RLS filtra por membro)
    // Não usar o fallback activeOrganizationId aqui para respeitar "Todas as organizações"
    loadSpaces(filterOrg)
  }, [filterOrg, activeOrganizationId, loadEmployees, loadStatuses, loadSpaces])

  // Obras disponíveis filtradas pela org selecionada
  const obras: ProjectOption[] = useMemo(() => {
    const orgId = filterOrg || activeOrganizationId
    return projects
      .filter(p => {
        const s = p.settings
        if (!s) return false
        if (s.classification !== 'OBRA') return false
        if (s.isSystemProject) return false
        if (p.name === 'Gestão Comercial') return false
        if (orgId && s.organizationId && s.organizationId !== orgId) return false
        return true
      })
      .map(p => ({ id: p.id, name: p.name }))
  }, [projects, filterOrg, activeOrganizationId])

  // ── Filtros e contadores ──────────────────────────────────────────────────
  const { today, overdue, visible, noSpaceCount } = useMemo(() => {
    const now          = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday   = new Date(startOfToday.getTime() + 86_400_000)

    let byOrg = tasks
    if (filterOrg) byOrg = byOrg.filter(t => t.org_id === filterOrg)

    // helper recursivo de descendentes
    const getAllDescendants = (ids: Set<string>): TaskRecord[] => {
      const children = byOrg.filter(t => t.parent_task_id && ids.has(t.parent_task_id))
      if (children.length === 0) return []
      return [...children, ...getAllDescendants(new Set(children.map(t => t.id)))]
    }

    // ── contador "sem espaço" (tarefas raiz abertas sem space_id) ────────
    const noSpaceCount = byOrg.filter(t => !t.parent_task_id && !t.space_id && t.status !== 'done').length

    // ── modo espaço: selecionar por space_id / folder_id ─────────────────
    if (selectedSpaceId === '__none__') {
      const parents = byOrg.filter(t => !t.parent_task_id && !t.space_id)
      return {
        today: [], overdue: [],
        noSpaceCount,
        visible: [...parents, ...getAllDescendants(new Set(parents.map(t => t.id)))],
      }
    }

    if (selectedSpaceId) {
      let parents = byOrg.filter(t => !t.parent_task_id && t.space_id === selectedSpaceId)
      if (selectedFolderId === '__no_folder__') {
        parents = parents.filter(t => !t.folder_id)
      } else if (selectedFolderId) {
        parents = parents.filter(t => t.folder_id === selectedFolderId)
      }
      return {
        today: [], overdue: [],
        noSpaceCount,
        visible: [...parents, ...getAllDescendants(new Set(parents.map(t => t.id)))],
      }
    }

    // ── modo inbox pessoal (apenas minhas tarefas) ────────────────────────
    const parents = byOrg.filter(t => !t.parent_task_id)
    const open    = parents.filter(t => t.status !== 'done')
    const today   = open.filter(t => {
      if (!t.due_date) return false
      const d = new Date(t.due_date)
      return d >= startOfToday && d < endOfToday
    })
    const overdue = open.filter(t => {
      if (!t.due_date) return false
      return new Date(t.due_date) < startOfToday
    })

    const visibleParents = view === 'today' ? today : view === 'overdue' ? overdue : parents
    return {
      today, overdue, noSpaceCount,
      visible: [...visibleParents, ...getAllDescendants(new Set(visibleParents.map(t => t.id)))],
    }
  }, [tasks, filterOrg, view, selectedSpaceId, selectedFolderId])

  const orgForNew = filterOrg || activeOrganizationId || ''

  // ── Callbacks do rail ─────────────────────────────────────────────────────
  const handleSelectInbox = (filter: FilterView) => {
    setSelectedSpaceId(null)
    setSelectedFolderId(null)
    setView(filter)
  }

  const handleSelectSpace = (spaceId: string, folderId?: string | null) => {
    setSelectedSpaceId(spaceId)
    setSelectedFolderId(folderId ?? null)
  }

  const handleSelectNoSpace = () => {
    setSelectedSpaceId('__none__')
    setSelectedFolderId(null)
  }

  const handleCreateSpace = async (name: string) => {
    const orgId = orgForNew
    if (!orgId) return
    try {
      await taskSpaceService.createSpace(orgId, name)
      await loadSpaces(orgId)
    } catch (e) {
      console.error('[spaces] create', e)
    }
  }

  const handleTaskDropOnFolder = useCallback(async (taskId: string, spaceId: string, folderId: string) => {
    setDragResetSignal(s => s + 1)   // força limpeza do drag state em TasksList
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, space_id: spaceId, folder_id: folderId } : t))
    const { error } = await supabase.from('tasks').update({ space_id: spaceId, folder_id: folderId }).eq('id', taskId)
    if (error) { console.error('[tasks] move to folder', error); load() }
    else loadSpaces(filterOrg || activeOrganizationId || '')
  }, [filterOrg, activeOrganizationId, load, loadSpaces])

  const handleCreateFolder = async (spaceId: string, name: string) => {
    try {
      await taskSpaceService.createFolder(spaceId, name)
      await loadSpaces(filterOrg || activeOrganizationId || '')
    } catch (e) {
      console.error('[folders] create', e)
    }
  }

  const toggleDone = async (t: TaskRecord) => {
    const currentStatusObj = statuses.find(s => s.id === t.status_id)
    const isDone = currentStatusObj ? currentStatusObj.is_done : t.status === 'done'

    let nextStatusId: string | null = t.status_id ?? null
    let nextLegacy: 'open' | 'done' = isDone ? 'open' : 'done'

    if (statuses.length > 0) {
      if (isDone) {
        const def = statuses.find(s => s.is_default) ?? statuses.find(s => !s.is_done) ?? statuses[0]
        nextStatusId = def?.id ?? null
        nextLegacy = 'open'
      } else {
        const doneStatus = statuses.find(s => s.is_done)
        nextStatusId = doneStatus?.id ?? null
        nextLegacy = 'done'
      }
    }

    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: nextLegacy, status_id: nextStatusId } : x))
    const patch: Record<string, unknown> = { status: nextLegacy }
    if (nextStatusId !== undefined) patch.status_id = nextStatusId
    const { error } = await supabase.from('tasks').update(patch).eq('id', t.id)
    if (error) { console.error(error); load() }
  }

  const moveCard = async (taskId: string, newGroupKey: string) => {
    let patch: Partial<TaskRecord> = {}
    if (groupBy === 'status') {
      const s = statuses.find(x => x.id === newGroupKey)
      patch = { status_id: newGroupKey === '__none__' ? null : newGroupKey, status: s?.is_done ? 'done' : 'open' }
    } else if (groupBy === 'assignee') {
      patch = { assignee_employee_id: newGroupKey === '__none__' ? null : newGroupKey }
    } else if (groupBy === 'priority') {
      patch = { priority: Number(newGroupKey) as 1 | 2 | 3 | 4 }
    } else if (groupBy === 'project') {
      patch = { project_id: newGroupKey === '__none__' ? null : newGroupKey }
    }
    if (!Object.keys(patch).length) return
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
    if (error) { console.error(error); load() }
  }

  const makeSubtask = async (taskId: string, newParentId: string | null) => {
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, parent_task_id: newParentId } : x))
    const { error } = await supabase.from('tasks').update({ parent_task_id: newParentId }).eq('id', taskId)
    if (error) { console.error(error); load() }
  }

  const handleNavigate = (route: string) => {
    if (onChangeView && route.startsWith('/')) {
      onChangeView(route.replace(/^\//, '').split('/')[0])
    }
  }

  const orgsOptions: OrgOption[] = organizations.length
    ? organizations
    : activeOrganizationId
      ? [{ id: activeOrganizationId, name: 'Minha Organização' }]
      : []

  const isSpaceMode = selectedSpaceId !== null

  // Espaço selecionado sem pasta → mostra grade de pastas em vez das tarefas
  const activeSpace    = spaces.find(s => s.id === selectedSpaceId) ?? null
  const showFolderView = selectedSpaceId !== null
                       && selectedSpaceId !== '__none__'
                       && selectedFolderId === null
                       && activeSpace !== null

  // Título contextual da área de conteúdo (só quando não está em folder view, que tem seu próprio header)
  const contentTitle = useMemo(() => {
    if (selectedSpaceId === '__none__') return 'Sem espaço'
    if (selectedSpaceId && !showFolderView) {
      const space = spaces.find(s => s.id === selectedSpaceId)
      if (!space) return ''
      if (selectedFolderId) {
        const folder = space.folders.find(f => f.id === selectedFolderId)
        return folder ? `${space.name} / ${folder.name}` : space.name
      }
      return space.name
    }
    return null
  }, [selectedSpaceId, selectedFolderId, spaces, showFolderView])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tarefas</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">Sua agenda pessoal de pendências</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tabs — só no mobile (no desktop o rail substitui) */}
          <div className="flex items-center gap-1 md:hidden">
            <TabBtn active={!isSpaceMode && view === 'today'}   icon={Calendar}      label="Hoje"      count={today.length}   onClick={() => handleSelectInbox('today')} />
            <TabBtn active={!isSpaceMode && view === 'overdue'} icon={AlertTriangle} label="Atrasadas" count={overdue.length} onClick={() => handleSelectInbox('overdue')} />
            <TabBtn active={!isSpaceMode && view === 'all'}     icon={ListChecks}    label="Todas"                            onClick={() => handleSelectInbox('all')} />
            {/* Botão "Espaços" no mobile */}
            {spaces.length > 0 && (
              <button
                onClick={() => setShowSpaceSheet(true)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                  ${isSpaceMode
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                Espaços
              </button>
            )}
          </div>

          {/* Toggle List / Board */}
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button
              onClick={() => setViewMode('list')}
              title="Visualização em lista"
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-black uppercase tracking-widest transition-all
                ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setViewMode('board')
                if (groupBy === 'none') setGroupBy('status')
              }}
              title="Visualização Kanban"
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-black uppercase tracking-widest transition-all
                ${viewMode === 'board' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Kanban className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Seletor Group By */}
          <div className="relative">
            <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupByField)}
              className={`pl-8 pr-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border appearance-none cursor-pointer transition-all
                ${groupBy !== 'none'
                  ? 'bg-blue-600 text-white border-blue-600 [&>option]:bg-white [&>option]:text-slate-900'
                  : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'}`}
            >
              <option value="none">Agrupar</option>
              <option value="status">Status</option>
              <option value="assignee">Responsável</option>
              <option value="priority">Prioridade</option>
              <option value="project">Obra</option>
              <option value="source">Origem</option>
            </select>
          </div>

          {orgsOptions.length > 0 && (
            <button
              onClick={() => setShowStatusMgr(true)}
              title="Gerenciar status"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <Settings2 className="w-4 h-4" />
              Status
            </button>
          )}
          <button
            onClick={() => {
              setEditing(null)
              setTaskDefaults({
                space_id: selectedSpaceId && selectedSpaceId !== '__none__' ? selectedSpaceId : null,
                folder_id: selectedFolderId && selectedFolderId !== '__no_folder__' ? selectedFolderId : null,
              })
              setShowForm(true)
            }}
            disabled={!orgForNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Nova
          </button>
        </div>
      </div>

      {/* Filtro de organização */}
      {orgsOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="text-xs font-bold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
          >
            <option value="">Todas as organizações</option>
            {orgsOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Aviso sem org */}
      {!orgForNew && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-800">
          Selecione uma organização para criar tarefas.
        </div>
      )}

      {/* Banner atrasadas — só no modo inbox */}
      {!isSpaceMode && view === 'today' && overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs font-bold text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Você tem <span className="font-black">{overdue.length}</span> tarefa(s) atrasada(s).
          <button onClick={() => handleSelectInbox('overdue')} className="ml-auto font-black uppercase tracking-wider hover:underline">
            Ver atrasadas
          </button>
        </div>
      )}

      {/* Chip de contexto ativo — mobile only */}
      {isSpaceMode && contentTitle && (
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
            {selectedSpaceId !== '__none__' && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: spaces.find(s => s.id === selectedSpaceId)?.color ?? '#3b82f6' }}
              />
            )}
            <span className="truncate max-w-[180px]">{contentTitle}</span>
            <button onClick={() => handleSelectInbox(view)} className="ml-1 text-blue-400 hover:text-blue-700 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Layout: rail (desktop) + conteúdo ── */}
      <div className="flex gap-5 items-start">

        {/* Rail de navegação — oculto no mobile */}
        <TaskSpaceRail
          spaces={spaces}
          loadingSpaces={loadingSpaces}
          selectedSpaceId={selectedSpaceId}
          selectedFolderId={selectedFolderId}
          activeFilter={view}
          todayCount={today.length}
          overdueCount={overdue.length}
          noSpaceCount={noSpaceCount}
          onSelectInbox={handleSelectInbox}
          onSelectSpace={handleSelectSpace}
          onSelectNoSpace={handleSelectNoSpace}
          onCreateSpace={handleCreateSpace}
          onCreateFolder={handleCreateFolder}
          onManageSpace={setManagingSpace}
          onReloaded={() => loadSpaces(filterOrg || activeOrganizationId || '')}
          onTaskDropOnFolder={handleTaskDropOnFolder}
        />

        {/* Área de conteúdo */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Título contextual quando em modo espaço */}
          {contentTitle && (
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-800">{contentTitle}</h2>
              <button
                onClick={() => handleSelectInbox(view)}
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                title="Voltar para inbox"
              >
                ✕
              </button>
            </div>
          )}

          {showFolderView && activeSpace ? (
            /* ── Vista de pastas do espaço ── */
            <TaskSpaceFolderView
              space={activeSpace}
              tasks={tasks}
              onSelectFolder={folderId => handleSelectSpace(selectedSpaceId!, folderId)}
              onSelectNoFolder={() => {
                // mostra tarefas do espaço sem pasta (usa __none__ local dentro do espaço)
                handleSelectSpace(selectedSpaceId!, '__no_folder__')
              }}
              onCreateFolder={async name => {
                await handleCreateFolder(selectedSpaceId!, name)
              }}
            />
          ) : viewMode === 'list' ? (
            <TasksList
              tasks={visible}
              loading={loading}
              employees={employees}
              projects={obras}
              statuses={statuses}
              groupBy={groupBy}
              resetDragSignal={dragResetSignal}
              onToggleDone={toggleDone}
              onEdit={(t) => { loadEmployees(t.org_id); setEditing(t); setParentTask(null); setShowForm(true) }}
              onAddSubtask={(parent) => { loadEmployees(parent.org_id); setEditing(null); setParentTask(parent); setShowForm(true) }}
              onMakeSubtask={makeSubtask}
              onAddTask={orgForNew ? (defaults) => {
                setTaskDefaults({
                  ...(defaults ?? {}),
                  space_id: selectedSpaceId && selectedSpaceId !== '__none__' ? selectedSpaceId : null,
                  folder_id: selectedFolderId && selectedFolderId !== '__no_folder__' ? selectedFolderId : null,
                })
                setEditing(null)
                setShowForm(true)
              } : undefined}
              onNavigate={handleNavigate}
            />
          ) : (
            <TasksBoard
              tasks={visible}
              employees={employees}
              projects={obras}
              statuses={statuses}
              groupBy={groupBy === 'none' ? 'status' : groupBy}
              onToggleDone={toggleDone}
              onEdit={(t) => { loadEmployees(t.org_id); setEditing(t); setParentTask(null); setShowForm(true) }}
              onAddTask={orgForNew ? (defaults) => {
                setTaskDefaults({
                  ...(defaults ?? {}),
                  space_id: selectedSpaceId && selectedSpaceId !== '__none__' ? selectedSpaceId : null,
                  folder_id: selectedFolderId && selectedFolderId !== '__no_folder__' ? selectedFolderId : null,
                })
                setEditing(null)
                setShowForm(true)
              } : undefined}
              onMoveCard={moveCard}
            />
          )}
        </div>
      </div>

      {showForm && (
        <TaskForm
          orgId={parentTask?.org_id ?? orgForNew}
          orgs={orgsOptions}
          employees={employees}
          projects={obras}
          statuses={statuses}
          spaces={spaceOptions}
          task={editing}
          initialDefaults={editing ? undefined : taskDefaults}
          parentTaskId={parentTask?.id ?? null}
          parentTaskTitle={parentTask?.title ?? null}
          onClose={() => { setShowForm(false); setParentTask(null) }}
          onOrgChange={(id) => { loadEmployees(id); loadStatuses(id); loadSpaces(id) }}
          onSaved={() => { setShowForm(false); setParentTask(null); load(); loadSpaces(filterOrg || activeOrganizationId || '') }}
        />
      )}

      {showStatusMgr && (
        <TaskStatusManager
          orgId={filterOrg || activeOrganizationId || orgsOptions[0]?.id || ''}
          onClose={() => setShowStatusMgr(false)}
          onChanged={() => loadStatuses(filterOrg || activeOrganizationId || '')}
        />
      )}

      <TaskSpaceBottomSheet
        open={showSpaceSheet}
        spaces={spaces}
        selectedSpaceId={selectedSpaceId}
        selectedFolderId={selectedFolderId}
        activeFilter={view}
        todayCount={today.length}
        overdueCount={overdue.length}
        noSpaceCount={noSpaceCount}
        onSelectInbox={handleSelectInbox}
        onSelectSpace={handleSelectSpace}
        onSelectNoSpace={handleSelectNoSpace}
        onClose={() => setShowSpaceSheet(false)}
      />

      {managingSpace && (
        <TaskSpaceManager
          space={managingSpace}
          orgId={filterOrg || activeOrganizationId || orgForNew}
          onClose={() => setManagingSpace(null)}
          onChanged={() => loadSpaces(filterOrg || activeOrganizationId || '')}
          onDeleted={() => {
            if (selectedSpaceId === managingSpace.id) {
              setSelectedSpaceId(null)
              setSelectedFolderId(null)
            }
            loadSpaces(filterOrg || activeOrganizationId || '')
          }}
        />
      )}
    </div>
  )
}

export { CheckSquare }
export default TasksModule
