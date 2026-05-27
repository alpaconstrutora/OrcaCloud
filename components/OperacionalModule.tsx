import React, { useState, useEffect } from 'react'
import {
  ClipboardList, LayoutDashboard, BookOpen,
  ChevronRight, Building2, Loader2, LayoutGrid, List,
  Kanban, Library,
} from 'lucide-react'
import OperacionalList from './OperacionalList'
import OperacionalDetail from './OperacionalDetail'
import OperacionalForm from './OperacionalForm'
import OperacionalDashboard from './OperacionalDashboard'
import OperacionalDiary from './OperacionalDiary'
import OperacionalKanban from './OperacionalKanban'
import OperacionalTemplateManager from './OperacionalTemplateManager'
import { supabase } from '../lib/supabase'

type OpsView = 'list' | 'detail' | 'form' | 'dashboard' | 'diary' | 'kanban' | 'templates'

interface Props {
  activeOrganizationId?: string
  projectId?: string | null
  projects?: Array<{ id: string; name: string; settings?: { organizationId?: string } }>
  activeSection?: string
  onChangeView?: (view: string) => void
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
const TabBtn: React.FC<{
  active: boolean
  icon: React.ElementType
  label: string
  onClick: () => void
}> = ({ active, icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
      ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
)

// ── Project selector ─────────────────────────────────────────────────────────
const ProjectSelector: React.FC<{
  projects: Array<{ id: string; name: string; settings?: { organizationId?: string } }>
  selectedId: string | null
  orgId?: string
  onSelect: (id: string) => void
}> = ({ projects, selectedId, orgId, onSelect }) => {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

  const filtered = orgId
    ? projects.filter(p => p.settings?.organizationId === orgId)
    : projects

  const obras = filtered.filter(p => {
    const s = (p as { settings?: { classification?: string; isSystemProject?: boolean; standard?: string; location?: string } }).settings
    return s?.classification === 'OBRA'
      && !s?.isSystemProject
      && s?.standard !== 'Vendas'
      && s?.location !== 'Sistema'
      && p.name !== 'Gestão Comercial'
  })

  if (!obras.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Building2 className="w-12 h-12 mb-3 opacity-30" />
        <p className="font-bold">Nenhuma obra encontrada</p>
        <p className="text-xs mt-1">Crie uma obra em Engenharia → Obras</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Selecione uma Obra</h2>
          <p className="text-sm text-slate-400 mt-1">Para acessar o Controle Operacional selecione a obra</p>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden flex-shrink-0">
          <button
            onClick={() => setViewMode('cards')}
            title="Visualização em cards"
            className={`flex items-center px-3 py-2.5 transition-all ${
              viewMode === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="Visualização em linha"
            className={`flex items-center px-3 py-2.5 transition-all border-l border-slate-200 ${
              viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {obras.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`text-left p-5 rounded-2xl border-2 transition-all hover:shadow-md active:scale-[0.98]
                ${selectedId === p.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-100 bg-white hover:border-blue-200'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-black text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Obra</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
          {obras.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-blue-50/50 active:bg-blue-100/50 ${
                selectedId === p.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Building2 className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Obra</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main module ──────────────────────────────────────────────────────────────
// Helper: verifica se um projeto é uma Obra operacional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObraProject(proj: any): boolean {
  const s = proj?.settings
  return (
    s?.classification === 'OBRA' &&
    !s?.isSystemProject &&
    s?.standard !== 'Vendas' &&
    s?.location !== 'Sistema'
  )
}

const OperacionalModule: React.FC<Props> = ({
  activeOrganizationId,
  projectId: propProjectId,
  projects = [],
  activeSection,
  onChangeView,
}) => {
  const [view, setView] = useState<OpsView>('list')

  // Só usar propProjectId se o projeto for uma OBRA — evita mostrar lista
  // vazia quando o usuário chega aqui com um projeto ORÇAMENTO/PLANEJAMENTO ativo.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (!propProjectId) return null
    const proj = projects.find(p => p.id === propProjectId)
    return isObraProject(proj) ? propProjectId : null
  })

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null)
  const [editingWorkOrderId, setEditingWorkOrderId] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(activeOrganizationId ?? null)

  // Sincronizar seção ativa com a view
  useEffect(() => {
    if (activeSection === 'operacional-dashboard') setView('dashboard')
    else if (activeSection === 'operacional-diary') setView('diary')
    else setView('list')
  }, [activeSection])

  // Resolver orgId a partir do projeto selecionado (sempre via settings.organizationId)
  useEffect(() => {
    if (selectedProjectId) {
      const proj = projects.find(p => p.id === selectedProjectId)
      const projOrgId = proj?.settings?.organizationId
      // Preferir o orgId do projeto; cair para activeOrganizationId como fallback
      setOrgId(projOrgId ?? activeOrganizationId ?? null)
    } else {
      setOrgId(activeOrganizationId ?? null)
    }
  }, [selectedProjectId, activeOrganizationId, projects])

  // ── Sem projeto selecionado: mostrar seletor ──────────────────────────────
  if (!selectedProjectId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Controle Operacional</h1>
            <p className="text-slate-400 text-sm mt-1 font-medium">
              Ordens de execução, apontamentos e diário de obra
            </p>
          </div>
        </div>
        <ProjectSelector
          projects={projects}
          selectedId={selectedProjectId}
          orgId={activeOrganizationId}
          onSelect={setSelectedProjectId}
        />
      </div>
    )
  }

  const projectName = projects.find(p => p.id === selectedProjectId)?.name ?? 'Obra'

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="hover:text-blue-600 transition-colors"
          >
            Obras
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-900">{projectName}</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Controle Operacional</h1>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn
          active={view === 'list' || view === 'detail' || view === 'form'}
          icon={ClipboardList}
          label="OEs"
          onClick={() => { setView('list'); setSelectedWorkOrderId(null) }}
        />
        <TabBtn
          active={view === 'kanban'}
          icon={Kanban}
          label="Kanban"
          onClick={() => { setView('kanban'); setSelectedWorkOrderId(null) }}
        />
        <TabBtn
          active={view === 'dashboard'}
          icon={LayoutDashboard}
          label="Dashboard"
          onClick={() => setView('dashboard')}
        />
        <TabBtn
          active={view === 'diary'}
          icon={BookOpen}
          label="Diário"
          onClick={() => setView('diary')}
        />
        <TabBtn
          active={view === 'templates'}
          icon={Library}
          label="Templates"
          onClick={() => setView('templates')}
        />
      </div>
    </div>
  )

  // ── Roteamento interno ────────────────────────────────────────────────────
  return (
    <div className="space-y-0">
      {header}

      {(view === 'list') && (
        <OperacionalList
          projectId={selectedProjectId}
          orgId={orgId ?? ''}
          onViewDetail={(id) => { setSelectedWorkOrderId(id); setView('detail') }}
          onCreateNew={() => { setEditingWorkOrderId(null); setView('form') }}
        />
      )}

      {view === 'kanban' && (
        <OperacionalKanban
          projectId={selectedProjectId}
          orgId={orgId ?? ''}
          onViewDetail={(id) => { setSelectedWorkOrderId(id); setView('detail') }}
          onCreateNew={() => { setEditingWorkOrderId(null); setView('form') }}
        />
      )}

      {view === 'detail' && selectedWorkOrderId && (
        <OperacionalDetail
          workOrderId={selectedWorkOrderId}
          orgId={orgId ?? ''}
          onBack={() => { setSelectedWorkOrderId(null); setView('list') }}
          onEdit={(id) => { setEditingWorkOrderId(id); setView('form') }}
          onViewOther={(id) => setSelectedWorkOrderId(id)}
        />
      )}

      {view === 'form' && (
        <OperacionalForm
          workOrderId={editingWorkOrderId ?? undefined}
          projectId={selectedProjectId}
          orgId={orgId ?? ''}
          onSave={(id) => { setSelectedWorkOrderId(id); setView('detail') }}
          onCancel={() => setView(selectedWorkOrderId ? 'detail' : 'list')}
        />
      )}

      {view === 'dashboard' && (
        <OperacionalDashboard
          projectId={selectedProjectId}
          orgId={orgId ?? ''}
          tipoObra={(projects.find(p => p.id === selectedProjectId) as any)?.settings?.tipoObra}
        />
      )}

      {view === 'diary' && (
        <OperacionalDiary
          projectId={selectedProjectId}
          orgId={orgId ?? ''}
        />
      )}

      {view === 'templates' && (
        <OperacionalTemplateManager
          orgId={orgId ?? ''}
        />
      )}
    </div>
  )
}

export default OperacionalModule
