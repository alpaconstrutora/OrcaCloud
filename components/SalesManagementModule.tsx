import React, { Suspense, useState } from 'react'
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
}

interface Props {
  organizationId?: string
  profile: { group: string; role: string; email?: string }
  budget?: import('../types').BudgetEntry[]
  defaultTab?: SalesTab
  sourceView?: string
  onGoToProject?: (id: string, section?: string) => void
}

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const SalesManagementModule: React.FC<Props> = ({
  organizationId, profile, budget = [], defaultTab = 'espelho', sourceView, onGoToProject,
}) => {
  const [activeTab, setActiveTab] = useState<SalesTab>(defaultTab)

  // Imovib sub-estado. Criar é um drawer (ImovibForm) por cima da listagem;
  // editar abre o MESMO drawer de dentro do detalhe (ImovibDetailView).
  const [isCreatingImovibStudy, setIsCreatingImovibStudy] = useState(false)
  const [viewingImovibStudyId, setViewingImovibStudyId]   = useState<string | null>(null)

  // Corretor selecionado para visualizar o portal
  const [selectedBroker, setSelectedBroker] = useState<BrokerProfile | null>(null)

  // Sincroniza com mudanças externas de defaultTab (ex: sidebar navega de Portal do Corretor para Comercial)
  React.useEffect(() => {
    setActiveTab(defaultTab)
    setSelectedBroker(null)
    if (defaultTab !== 'viabilidade') {
      setIsCreatingImovibStudy(false)
      setViewingImovibStudyId(null)
    }
  }, [defaultTab])

  const brokerInternalTab = sourceView ? (BROKER_INTERNAL_TAB[sourceView] ?? 'analytics') : 'analytics'

  // Aba Corretores: lista → portal (ao selecionar um corretor)
  if (activeTab === 'corretores') {
    if (selectedBroker) {
      return (
        <Suspense fallback={<Spinner />}>
          {/* Voltar para "Meus Corretores" fica DENTRO do BrokerPortal (toolbar
              de botões §5.3) — a barra de breadcrumb separada foi removida (§18:
              não duplicar o contexto que o próprio portal já mostra). */}
          <BrokerPortal
            profile={profile}
            organizationId={organizationId}
            activeTab={brokerInternalTab as 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude'}
            initialBroker={selectedBroker}
            onBack={() => setSelectedBroker(null)}
          />
        </Suspense>
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
      {/* Navegação entre Vendas de Ativos/Aluguéis/CRM Serviços/Contratos de Serviço/Viabilidade
          já existe no dropdown "Comercial" do sidebar (Layout.tsx) — não duplicar aqui (§18). */}
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
            viewingImovibStudyId ? (
              <ImovibDetailView
                studyId={viewingImovibStudyId}
                onBack={() => setViewingImovibStudyId(null)}
              />
            ) : (
              <>
                <ImovibDashboard
                  organizationId={organizationId}
                  onNewStudy={() => setIsCreatingImovibStudy(true)}
                  onViewStudy={(id: string) => setViewingImovibStudyId(id)}
                />
                {/* Criado → abre o estudo (antes voltava para a lista sem retorno). */}
                <ImovibForm
                  open={isCreatingImovibStudy}
                  onClose={() => setIsCreatingImovibStudy(false)}
                  onSaved={(study) => { setIsCreatingImovibStudy(false); setViewingImovibStudyId(study.id) }}
                />
              </>
            )
          )}
        </Suspense>
    </div>
  )
}

export default SalesManagementModule
