import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { isObra } from '../utils/projectClassification'
import { Plus, CheckSquare, AlertTriangle, Settings2, Layers, List, Kanban, LayoutGrid, FolderOpen, FolderCog, CalendarClock, Smartphone } from 'lucide-react'

export type GroupByField = 'none' | 'status' | 'assignee' | 'priority' | 'project' | 'source'
export type FilterView   = 'today' | 'all' | 'overdue'

// Sentinelas dos popovers de recorte (§5.4): '' = sem recorte.
const SPACE_NONE  = '__none__'      // tarefas sem espaço
const FOLDER_NONE = '__no_folder__' // tarefas do espaço sem pasta

import { supabase } from '../lib/supabase'
import { taskStatusService, type TaskStatus } from '../services/taskService'
import { taskSpaceService, type TaskSpaceWithMeta } from '../services/taskSpaceService'
import TasksList from './TasksList'
import TaskForm, { type TaskRecord, type EmployeeOption, type ProjectOption, type OrgOption, type TaskDefaults, type SpaceOption } from './TaskForm'
import TaskStatusManager from './TaskStatusManager'
import TasksBoard from './TasksBoard'
import TaskSpaceManager from './TaskSpaceManager'
import TaskSpacesSheet from './TaskSpacesSheet'
import { FilterPopover } from './ui/FilterPopover'
import { usePersistedState } from './ui/TableUtils'
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext'
import { useStore } from '../store/useStore'
import MobilePreviewFrame from './MobilePreviewFrame'
import TasksMobileApp from './TasksMobileApp'
import { isSystemProject, excludeSystemProjects, SYSTEM_PROJECT_NAMES_SQL } from '../utils/systemProjects'

type ViewMode = 'list' | 'board'

interface Props {
  activeOrganizationId?: string
  organizations?: OrgOption[]
  projects?: Array<{ id: string; name: string; settings?: { organizationId?: string; classification?: string; isSystemProject?: boolean } }>
  onChangeView?: (view: string) => void
}

const TasksModule: React.FC<Props> = ({ organizations = [], projects = [], onChangeView }) => {
  // REGRA #5: o seletor do topo é a autoridade. `orgId` null = "Todas as organizações"
  // (lê tudo que a RLS deixa); para GRAVAR, `resolveWriteOrg('single')` só pergunta
  // quando o topo está em "Todas" e o usuário grava em mais de uma organização.
  const { orgId: ctxOrgId } = useOrgContext()
  const orgKey = ctxOrgId ?? ''   // forma que os services aceitam ('' = sem .eq)
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget()
  const storeOrganizations = useStore(state => state.organizations)
  const orgNameOf = useCallback((id: string) =>
    storeOrganizations.find(o => o.id === id)?.name ?? organizations.find(o => o.id === id)?.name ?? 'Organização',
  [storeOrganizations, organizations])
  // Organização do formulário aberto (criar: resolvida pelo topo; editar: a da tarefa).
  const [formOrgId, setFormOrgId]     = useState<string>('')
  const [statusMgrOrgId, setStatusMgrOrgId] = useState<string>('')

  // Recorte da tela (Prazo / Espaço / Pasta) — persistido (§3); vale para Lista e Kanban.
  // Padrão "Todas": metade das tarefas abertas não tem prazo (medido em 21/09/2026: 10 sem
  // prazo, 10 atrasadas, 0 para hoje) — "Hoje" como padrão abria a tela vazia. Chave nova
  // ('prazo') para o padrão valer também para quem tinha 'today' persistido do rail antigo.
  const [view, setView]               = usePersistedState<FilterView>('tasksModule:prazo', 'all')
  const [fSpace, setFSpace]           = usePersistedState('tasksListFilters:space', '')
  const [fFolder, setFFolder]         = usePersistedState('tasksListFilters:folder', '')
  const [tasks, setTasks]             = useState<TaskRecord[]>([])
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState<TaskRecord | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [groupBy, setGroupBy]             = useState<GroupByField>('none')
  const [viewMode, setViewMode]           = useState<ViewMode>('list')
  const [taskDefaults, setTaskDefaults]   = useState<TaskDefaults>({})
  const [employees, setEmployees]     = useState<EmployeeOption[]>([])
  const [obrasLocal, setObrasLocal]   = useState<ProjectOption[]>([])
  const [statuses, setStatuses]       = useState<TaskStatus[]>([])
  const [parentTask, setParentTask]   = useState<TaskRecord | null>(null)

  // ── Espaços ──────────────────────────────────────────────────────────────
  const [spaces, setSpaces]                   = useState<TaskSpaceWithMeta[]>([])
  // SpaceOption para o TaskForm (subconjunto de TaskSpaceWithMeta)
  const spaceOptions = useMemo<SpaceOption[]>(
    () => spaces.map(s => ({ id: s.id, name: s.name, color: s.color, folders: s.folders })),
    [spaces]
  )
  const [loadingSpaces, setLoadingSpaces]     = useState(false)
  const [spacesLoaded, setSpacesLoaded]       = useState(false)
  const [managingSpace, setManagingSpace]   = useState<TaskSpaceWithMeta | null>(null)
  const [showSpacesSheet, setShowSpacesSheet] = useState(false)

  // Espaço/pasta persistidos que não existem na organização atual (troca de org,
  // espaço excluído) são descartados — senão a tela abre vazia com o gatilho sem rótulo.
  const activeSpace = fSpace && fSpace !== SPACE_NONE ? spaces.find(s => s.id === fSpace) ?? null : null
  useEffect(() => {
    if (!spacesLoaded || loadingSpaces) return
    if (fSpace && fSpace !== SPACE_NONE && !activeSpace) { setFSpace(''); setFFolder(''); return }
    if (!activeSpace && fFolder) { setFFolder(''); return }
    if (activeSpace && fFolder && fFolder !== FOLDER_NONE && !activeSpace.folders.some(f => f.id === fFolder)) setFFolder('')
  }, [spacesLoaded, loadingSpaces, fSpace, fFolder, activeSpace, setFSpace, setFFolder])

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
      setSpacesLoaded(true)
    }
  }, [])

  // Carrega tarefas
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('id, org_id, user_id, title, description, start_date, due_date, alert_at, priority, status, status_id, snoozed_until, source_module, source_ref, created_at, completed_at, assignee_employee_id, project_id, parent_task_id, space_id, folder_id')
      .order('status',   { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })

    if (error) { console.error('[tasks] load', error); setTasks([]) }
    else        { setTasks((data ?? []) as unknown as TaskRecord[]) }
    setLoading(false)
  }, [])

  // Carrega colaboradores da org selecionada + os compartilhados com ela
  const loadEmployees = useCallback(async (orgId: string) => {
    let q = supabase
      .from('employees')
      .select('id, name, role, email')
      .eq('status', 'ATIVO')
      .order('name')
    if (orgId) {
      const { data: shared } = await supabase
        .from('employee_org_shares')
        .select('employee_id')
        .eq('target_org_id', orgId)
      const sharedIds = (shared ?? []).map((s: any) => s.employee_id)
      q = q.or(sharedIds.length > 0
        ? `org_id.eq.${orgId},id.in.(${sharedIds.join(',')})`
        : `org_id.eq.${orgId}`)
    }
    // sem organização ("Todas"): a RLS recorta — nunca esvaziar a lista (REGRA #5)
    const { data } = await q
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

  const loadObras = useCallback(async (orgId: string) => {
    let query = supabase
      .from('projects')
      .select('id, name, settings')
      .filter('settings->>classification', 'eq', 'OBRA')
      .not('name', 'in', SYSTEM_PROJECT_NAMES_SQL) // utils/systemProjects.ts
      .order('name')
    if (orgId) {
      query = query.filter('settings->>organizationId', 'eq', orgId)
    }
    const { data } = await query
    const filtered = excludeSystemProjects(data ?? [])
    setObrasLocal(filtered.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    loadEmployees(orgKey)
    loadStatuses(orgKey)
    loadObras(orgKey)
    loadSpaces(orgKey)   // '' = todas as orgs (RLS filtra por membro)
  }, [orgKey, loadEmployees, loadStatuses, loadObras, loadSpaces])

  // ── Recorte e contadores ─────────────────────────────────────────────────
  // Ordem: organização → espaço/pasta → prazo. Hoje/Atrasadas são contadas DEPOIS
  // do recorte de espaço/pasta, para o número do popover bater com a tabela.
  const { today, overdue, visible, noSpaceCount } = useMemo(() => {
    const now          = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday   = new Date(startOfToday.getTime() + 86_400_000)

    let byOrg = tasks
    if (ctxOrgId) byOrg = byOrg.filter(t => t.org_id === ctxOrgId)

    // helper recursivo de descendentes
    const getAllDescendants = (ids: Set<string>): TaskRecord[] => {
      const children = byOrg.filter(t => t.parent_task_id && ids.has(t.parent_task_id))
      if (children.length === 0) return []
      return [...children, ...getAllDescendants(new Set(children.map(t => t.id)))]
    }

    const allParents = byOrg.filter(t => !t.parent_task_id)
    // contador "sem espaço" (raiz, aberta, sem space_id) — sobre a organização inteira
    const noSpaceCount = allParents.filter(t => !t.space_id && t.status !== 'done').length

    let parents = allParents
    if (fSpace === SPACE_NONE)   parents = parents.filter(t => !t.space_id)
    else if (fSpace)             parents = parents.filter(t => t.space_id === fSpace)
    if (fSpace && fSpace !== SPACE_NONE) {
      if (fFolder === FOLDER_NONE) parents = parents.filter(t => !t.folder_id)
      else if (fFolder)            parents = parents.filter(t => t.folder_id === fFolder)
    }

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
  }, [tasks, ctxOrgId, view, fSpace, fFolder])

  // obras: usa obrasLocal (carregado direto do DB) como fonte primária, com fallback no prop
  const obras: ProjectOption[] = useMemo(() => {
    if (obrasLocal.length > 0) return obrasLocal
    const orgId = ctxOrgId
    return projects
      .filter(p => {
        const s = p.settings
        if (!s) return false
        if (!isObra(p)) return false
        if (isSystemProject(p)) return false
        if (orgId && s.organizationId && s.organizationId !== orgId) return false
        return true
      })
      .map(p => ({ id: p.id, name: p.name }))
  }, [obrasLocal, projects, ctxOrgId])

  const handleCreateSpace = async (name: string) => {
    const target = await resolveWriteOrg('single')
    if (!target || target.kind !== 'org') return
    try {
      await taskSpaceService.createSpace(target.orgId, name)
      await loadSpaces(orgKey)
    } catch (e) {
      console.error('[spaces] create', e)
    }
  }

  // Abre o formulário já com a organização certa: a da tarefa (editar/subtarefa) ou a
  // resolvida pelo topo (criar). Os catálogos (colaboradores, status, obras, espaços)
  // são recarregados para ESSA organização quando ela difere do recorte da tela.
  const openTaskForm = async (opts: { task?: TaskRecord | null; parent?: TaskRecord | null; defaults?: TaskDefaults }) => {
    let orgId = opts.task?.org_id ?? opts.parent?.org_id ?? null
    if (!orgId) {
      const target = await resolveWriteOrg('single')
      if (!target || target.kind !== 'org') return
      orgId = target.orgId
    }
    if (orgId !== orgKey) { loadEmployees(orgId); loadStatuses(orgId); loadObras(orgId); loadSpaces(orgId) }
    setFormOrgId(orgId)
    setEditing(opts.task ?? null)
    setParentTask(opts.parent ?? null)
    setTaskDefaults(opts.defaults ?? {})
    setShowForm(true)
  }
  const closeTaskForm = () => {
    setShowForm(false); setParentTask(null)
    // volta os catálogos ao recorte da tela, caso o formulário tenha carregado outra org
    if (formOrgId !== orgKey) { loadEmployees(orgKey); loadStatuses(orgKey); loadObras(orgKey); loadSpaces(orgKey) }
  }

  const openStatusManager = async () => {
    const target = await resolveWriteOrg('single')
    if (!target || target.kind !== 'org') return
    setStatusMgrOrgId(target.orgId)
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

  // ── Controles de recorte (§5.4) — vão para a toolbar acoplada da lista e, no
  // Kanban, para uma barra própria acima do quadro. ─────────────────────────
  const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label)
  const viewOptions = [
    { value: 'all' as FilterView,     label: 'Todas' },
    { value: 'today' as FilterView,   label: withCount('Hoje', today.length) },
    { value: 'overdue' as FilterView, label: withCount('Atrasadas', overdue.length) },
  ]
  const spaceFilterOptions = [
    { value: '', label: 'Todos' },
    { value: SPACE_NONE, label: withCount('Sem espaço', noSpaceCount) },
    ...spaces.map(sp => ({ value: sp.id, label: withCount(sp.name, sp.open_task_count) })),
  ]
  const folderOptions = activeSpace ? [
    { value: '', label: 'Todas' },
    { value: FOLDER_NONE, label: 'Sem pasta' },
    ...activeSpace.folders.map(f => ({ value: f.id, label: f.name })),
  ] : []
  const scopeControls = (
    <>
      <FilterPopover<FilterView>
        label="Prazo"
        icon={<CalendarClock className="w-3.5 h-3.5" />}
        value={view}
        onChange={setView}
        allValue="all"
        options={viewOptions}
      />
      <FilterPopover
        label="Espaço"
        icon={<LayoutGrid className="w-3.5 h-3.5" />}
        value={fSpace}
        onChange={v => { setFSpace(v); setFFolder('') }}
        options={spaceFilterOptions}
      />
      {activeSpace && activeSpace.folders.length > 0 && (
        <FilterPopover
          label="Pasta"
          icon={<FolderOpen className="w-3.5 h-3.5" />}
          value={fFolder}
          onChange={setFFolder}
          options={folderOptions}
        />
      )}
      <button
        onClick={() => setShowSpacesSheet(true)}
        title="Espaços — criar, ordenar e gerenciar"
        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95 shrink-0"
      >
        <FolderCog className="w-4 h-4" />
      </button>
    </>
  )

  // Estado vazio: diz qual recorte esconde as tarefas e oferece "Ver todas".
  const scopeActive = view !== 'all' || !!fSpace
  const emptyHint = {
    message: [
      view === 'today' ? 'Nenhuma tarefa vence hoje' : view === 'overdue' ? 'Nenhuma tarefa atrasada' : 'Nenhuma tarefa',
      fSpace === SPACE_NONE ? 'sem espaço' : activeSpace ? `no espaço ${activeSpace.name}` : '',
      activeSpace && fFolder === FOLDER_NONE ? 'sem pasta' : activeSpace && fFolder ? `na pasta ${activeSpace.folders.find(f => f.id === fFolder)?.name ?? ''}` : '',
    ].filter(Boolean).join(' ') + '.',
    action: scopeActive ? { label: 'Ver todas as tarefas', onClick: () => { setView('all'); setFSpace(''); setFFolder('') } } : undefined,
  }

  // Espaço/pasta que uma tarefa nova herda do recorte ativo.
  const scopeDefaults: TaskDefaults = {
    space_id:  activeSpace ? activeSpace.id : null,
    folder_id: activeSpace && fFolder && fFolder !== FOLDER_NONE ? fFolder : null,
  }

  // Mobile real
  if (isMobile) return <TasksMobileApp orgId={orgKey} />

  return (
    <div className="space-y-6">
      {/* Prévia Mobile */}
      {showMobilePreview && (
        <MobilePreviewFrame onClose={() => setShowMobilePreview(false)} title="Prévia — Minhas Tarefas">
          <TasksMobileApp orgId={orgKey} />
        </MobilePreviewFrame>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tarefas</h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">Sua agenda pessoal de pendências</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle List / Board */}
          <div className="flex items-center h-9 border border-slate-200 rounded-[6px] overflow-hidden bg-white">
            <button
              onClick={() => setViewMode('list')}
              title="Visualização em lista"
              className={`flex items-center gap-1.5 h-full px-3 text-sm font-medium transition-all
                ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              onClick={() => {
                setViewMode('board')
                if (groupBy === 'none') setGroupBy('status')
              }}
              title="Visualização Kanban"
              className={`flex items-center gap-1.5 h-full px-3 text-sm font-medium transition-all
                ${viewMode === 'board' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban
            </button>
          </div>

          {/* Seletor Group By */}
          <div className="relative">
            <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupByField)}
              className={`h-9 pl-8 pr-3 rounded-[6px] text-sm font-medium border appearance-none cursor-pointer transition-all
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

          <button
            onClick={openStatusManager}
            title="Gerenciar status"
            className="flex items-center gap-2 h-9 px-3 rounded-[6px] text-sm font-medium border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <Settings2 className="w-4 h-4" />
            Status
          </button>
          <button
            onClick={() => setShowMobilePreview(true)}
            title="Prévia Mobile"
            className="hidden md:flex items-center gap-2 h-9 px-3 rounded-[6px] text-sm font-medium border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <Smartphone className="w-4 h-4" />
            Mobile
          </button>
          <button
            onClick={() => openTaskForm({ defaults: scopeDefaults })}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-[15px] h-[15px]" />
            Nova
          </button>
        </div>
      </div>

      {/* Banner atrasadas — só no modo inbox */}
      {view === 'today' && overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs font-bold text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Você tem <span className="font-black">{overdue.length}</span> tarefa(s) atrasada(s).
          <button onClick={() => setView('overdue')} className="ml-auto font-black uppercase tracking-wider hover:underline">
            Ver atrasadas
          </button>
        </div>
      )}

      {/* ── Conteúdo (sem rail: Prazo / Espaço / Pasta vivem na toolbar) ── */}
      <div className="min-w-0">
          {viewMode === 'list' ? (
            <TasksList
              tasks={visible}
              loading={loading}
              employees={employees}
              projects={obras}
              statuses={statuses}
              filters={scopeControls}
              groupBy={groupBy}
              onToggleDone={toggleDone}
              onEdit={(t) => openTaskForm({ task: t })}
              onAddSubtask={(parent) => openTaskForm({ parent })}
              onMakeSubtask={makeSubtask}
              onAddTask={(defaults) => openTaskForm({ defaults: { ...(defaults ?? {}), ...scopeDefaults } })}
              onNavigate={handleNavigate}
              emptyHint={emptyHint}
            />
          ) : (
            <>
            {/* Kanban não tem toolbar acoplada: os mesmos controles numa barra §5.3 */}
            <div className="flex flex-wrap items-center gap-2.5 bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
              {scopeControls}
            </div>
            <TasksBoard
              tasks={visible}
              employees={employees}
              projects={obras}
              statuses={statuses}
              groupBy={groupBy === 'none' ? 'status' : groupBy}
              onToggleDone={toggleDone}
              onEdit={(t) => openTaskForm({ task: t })}
              onAddTask={(defaults) => openTaskForm({ defaults: { ...(defaults ?? {}), ...scopeDefaults } })}
              onMoveCard={moveCard}
            />
            </>
          )}
      </div>

      {showForm && (
        <TaskForm
          orgId={formOrgId}
          orgs={[{ id: formOrgId, name: orgNameOf(formOrgId) }]}  /* uma só: o topo já decidiu (REGRA #5) */
          employees={employees}
          projects={obras}
          statuses={statuses}
          spaces={spaceOptions}
          task={editing}
          initialDefaults={editing ? {
            space_id:  editing.space_id  ?? scopeDefaults.space_id,
            folder_id: editing.folder_id ?? scopeDefaults.folder_id,
          } : taskDefaults}
          parentTaskId={parentTask?.id ?? null}
          parentTaskTitle={parentTask?.title ?? null}
          onClose={closeTaskForm}
          onSaved={() => {
            closeTaskForm()
            load(); loadSpaces(orgKey)
          }}
        />
      )}

      {statusMgrOrgId && (
        <TaskStatusManager
          orgId={statusMgrOrgId}
          onClose={() => setStatusMgrOrgId('')}
          onChanged={() => loadStatuses(orgKey)}
        />
      )}

      <TaskSpacesSheet
        open={showSpacesSheet}
        spaces={spaces}
        loading={loadingSpaces}
        canCreate
        onClose={() => setShowSpacesSheet(false)}
        onCreateSpace={handleCreateSpace}
        onManageSpace={setManagingSpace}
        onReloaded={() => loadSpaces(orgKey)}
      />

      {managingSpace && (
        <TaskSpaceManager
          space={managingSpace}
          orgId={managingSpace.org_id}
          onClose={() => setManagingSpace(null)}
          onChanged={() => loadSpaces(orgKey)}
          onDeleted={() => {
            if (fSpace === managingSpace.id) { setFSpace(''); setFFolder('') }
            loadSpaces(orgKey)
          }}
        />
      )}

      {orgTargetModal}
    </div>
  )
}

export { CheckSquare }
export default TasksModule
