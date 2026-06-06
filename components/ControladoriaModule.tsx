import React, { Suspense, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Receipt, Layers, FileText, BookOpen } from 'lucide-react'
import type { Organization } from '../types'

const DREReport                  = React.lazy(() => import('./DREReport'))
const CashFlowDashboard          = React.lazy(() => import('./CashFlowDashboard'))
const BoletoManager              = React.lazy(() => import('./BoletoManager'))
const ContasPagarManager         = React.lazy(() => import('./ContasPagarManager'))
const BankReconciliation         = React.lazy(() => import('./BankReconciliation'))
const FinancialCategoriesManager = React.lazy(() => import('./FinancialCategoriesManager'))
const BalanceteReport            = React.lazy(() => import('./BalanceteReport'))

export type { ControladoriaTab } from '../constants/controladoríaTabs'
export { VIEW_TO_CONTROLADORIA_TAB } from '../constants/controladoríaTabs'
import type { ControladoriaTab } from '../constants/controladoríaTabs'

interface Props {
  organizationId?: string
  organizations?: Organization[]
  userEmail?: string
  defaultTab?: ControladoriaTab
  onOrgChange?: (id: string | null) => void
}

const TABS: Array<{ id: ControladoriaTab; label: string; icon: React.ElementType }> = [
  { id: 'dre',          label: 'DRE',                 icon: BarChart3    },
  { id: 'balancete',    label: 'Balancete',            icon: BookOpen     },
  { id: 'fluxo',        label: 'Fluxo de Caixa',      icon: TrendingUp   },
  { id: 'boletos',      label: 'Boletos',              icon: FileText     },
  { id: 'contas_pagar', label: 'Contas a Pagar',       icon: TrendingDown },
  { id: 'conciliacao',  label: 'Conciliação Bancária', icon: Receipt      },
  { id: 'categorias',   label: 'Categorias',           icon: Layers       },
]

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const ControladoriaModule: React.FC<Props> = ({
  organizationId, organizations = [], userEmail, defaultTab = 'dre', onOrgChange,
}) => {
  const [activeTab, setActiveTab] = useState<ControladoriaTab>(defaultTab)
  const orgId = organizationId || organizations[0]?.id || ''

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

      <div className="pt-4">
        <Suspense fallback={<Spinner />}>
          {activeTab === 'dre' && (
            <DREReport organizationId={orgId} />
          )}
          {activeTab === 'balancete' && (
            <BalanceteReport organizationId={orgId} />
          )}
          {activeTab === 'fluxo' && (
            <CashFlowDashboard organizationId={orgId} />
          )}
          {activeTab === 'boletos' && (
            <BoletoManager
              organizationId={orgId}
              userEmail={userEmail}
              organizations={organizations}
              onOrgChange={onOrgChange || (() => {})}
            />
          )}
          {activeTab === 'contas_pagar' && (
            <ContasPagarManager
              organizationId={organizationId}
              organizations={organizations}
              onOrgChange={onOrgChange || (() => {})}
            />
          )}
          {activeTab === 'conciliacao' && (
            <BankReconciliation organizationId={orgId} />
          )}
          {activeTab === 'categorias' && (
            <FinancialCategoriesManager />
          )}
        </Suspense>
      </div>
    </div>
  )
}

export default ControladoriaModule
