import React, { Suspense, useState } from 'react'
import { Building2, Home, Users, Briefcase, FileText, BarChart3, ArrowLeft } from 'lucide-react'
import type { BrokerProfile } from '../types'

// Sub-módulos carregados sob demanda (lazy) por aba
const SalesModule              = React.lazy(() => import('./SalesModule'))
const RentalsModule            = React.lazy(() => import('./RentalsModule'))
const BrokerList               = React.lazy(() => import('./BrokerList'))
const BrokerPortal             = React.lazy(() => import('./BrokerPortal'))
const ServicesCommercialModule = React.lazy(() => import('./ServicesCommercialModule'))
const ServiceContractsModule   = React.lazy(() => import('./ServiceContractsModule'))
const ImovibDashboard          = React.lazy(() => import('./ImovibDashboard'))
const ImovibForm               = React.lazy(() => import('./ImovibForm'))
const ImovibDetailView         = React.lazy(() => import('./ImovibDetailView'))

// ── Tipos e mapa de views ─────────────────────────────────────────────────────
export type { SalesTab } from '../constants/salesTabs'
export { VIEW_TO_SALES_TAB } from '../constants/salesTabs'
import type { SalesTab } from '../constants/salesTabs'

// Mapeia tab de broker para o internal tab do BrokerPortal
const BROKER_INTERNAL_TAB: Record<string, string> = {
  'broker-proposals': 'propostas', 'broker-leads': 'leads',
  'broker-commissions': 'comissoes', 'broker-materials': 'materiais',
  'broker-ranking': 'ranking', 'broker-training': 'treinamento',
  'broker-events': 'agenda', 'broker-chat': 'chat',
  'broker-analytics': 'analytics', 'broker-health': 'saude',
  'broker-integrations': 'integracoes',
}

interface Props {
  organizationId?: string
  profile: { group: string; role: string; email?: string }
  budget?: import('../types').BudgetEntry[]
  defaultTab?: SalesTab
  sourceView?: string
  onGoToProject?: (id: string, section?: string) => void
}

const TABS: Array<{ id: SalesTab; label: string; icon: React.ElementType }> = [
  { id: 'espelho',    label: 'Vendas de Ativos',   icon: Building2 },
  { id: 'alugueis',   label: 'Aluguéis',            icon: Home      },
  { id: 'corretores', label: 'Corretores',           icon: Users     },
  { id: 'crm',        label: 'CRM Serviços',         icon: Briefcase },
  { id: 'contratos',  label: 'Contratos de Serviço', icon: FileText  },
  { id: 'viabilidade',label: 'Viabilidade',          icon: BarChart3 },
]

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const SalesManagementModule: React.FC<Props> = ({
  organizationId, profile, budget = [], defaultTab = 'espelho', sourceView, onGoToProject,
}) => {
  const [activeTab, setActiveTab] = useState<SalesTab>(defaultTab)

  // Imovib sub-estado
  const [isCreatingImovibStudy, setIsCreatingImovibStudy] = useState(false)
  const [editingImovibStudyId, setEditingImovibStudyId]   = useState<string | null>(null)
  const [viewingImovibStudyId, setViewingImovibStudyId]   = useState<string | null>(null)

  // Corretor selecionado para visualizar o portal
  const [selectedBroker, setSelectedBroker] = useState<BrokerProfile | null>(null)

  const handleTabChange = (tab: SalesTab) => {
    setActiveTab(tab)
    setSelectedBroker(null)
    if (tab !== 'viabilidade') {
      setIsCreatingImovibStudy(false)
      setEditingImovibStudyId(null)
      setViewingImovibStudyId(null)
    }
  }

  const brokerInternalTab = sourceView ? (BROKER_INTERNAL_TAB[sourceView] ?? 'estoque') : 'estoque'

  // Aba Corretores: lista → portal (ao selecionar um corretor)
  if (activeTab === 'corretores') {
    if (selectedBroker) {
      return (
        <div className="space-y-0">
          {/* Breadcrumb de volta */}
          <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100">
            <button
              onClick={() => setSelectedBroker(null)}
              className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Meus Corretores
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-xs font-black text-blue-700 uppercase tracking-widest">{selectedBroker.name}</span>
          </div>
          <Suspense fallback={<Spinner />}>
            <BrokerPortal
              profile={profile}
              organizationId={organizationId}
              activeTab={brokerInternalTab as 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes'}
              initialBroker={selectedBroker}
            />
          </Suspense>
        </div>
      )
    }

    return (
      <Suspense fallback={<Spinner />}>
        <BrokerList
          organizationId={organizationId}
          onSelectBroker={setSelectedBroker}
        />
      </Suspense>
    )
  }

  return (
    <div className="space-y-0">
      {/* Barra de abas */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all -mb-px',
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      <div className="pt-4">
        <Suspense fallback={<Spinner />}>
          {activeTab === 'espelho' && (
            <SalesModule organizationId={organizationId} />
          )}

          {activeTab === 'alugueis' && (
            <RentalsModule organizationId={organizationId} />
          )}

          {activeTab === 'crm' && (
            <ServicesCommercialModule
              organizationId={organizationId ?? null}
              onGoToProject={onGoToProject ? (id) => onGoToProject(id, 'analytic') : () => {}}
            />
          )}

          {activeTab === 'contratos' && (
            <ServiceContractsModule
              organizationId={organizationId ?? undefined}
              budget={budget}
              onGoToProject={onGoToProject ? (id) => onGoToProject(id, 'analytic') : () => {}}
            />
          )}

          {activeTab === 'viabilidade' && (
            isCreatingImovibStudy ? (
              <ImovibForm
                organizationId={organizationId}
                studyId={editingImovibStudyId || undefined}
                onBack={() => { setIsCreatingImovibStudy(false); setEditingImovibStudyId(null) }}
                onSaved={() => { setIsCreatingImovibStudy(false); setEditingImovibStudyId(null) }}
              />
            ) : viewingImovibStudyId ? (
              <ImovibDetailView
                studyId={viewingImovibStudyId}
                onBack={() => setViewingImovibStudyId(null)}
              />
            ) : (
              <ImovibDashboard
                organizationId={organizationId}
                onNewStudy={() => { setEditingImovibStudyId(null); setIsCreatingImovibStudy(true) }}
                onViewStudy={(id: string) => setViewingImovibStudyId(id)}
              />
            )
          )}
        </Suspense>
      </div>
    </div>
  )
}

export default SalesManagementModule
