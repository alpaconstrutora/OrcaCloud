import React, { Suspense, useState } from 'react';
import { LineChart, TrendingUp, Calculator } from 'lucide-react';

const BudgetActualPage = React.lazy(() => import('./BudgetActualPage'));
const CashflowProjectionPage = React.lazy(() => import('./CashflowProjectionPage'));
const BudgetScenarioPage = React.lazy(() => import('./BudgetScenarioPage'));

type FpaTab = 'orcado-realizado' | 'fluxo-projetado' | 'cenarios';

interface Props {
  organizationId?: string;
  projectId?: string;
  defaultTab?: FpaTab;
}

const TABS: Array<{ id: FpaTab; label: string; icon: React.ElementType }> = [
  { id: 'orcado-realizado', label: 'Orçado vs Realizado', icon: LineChart },
  { id: 'fluxo-projetado',  label: 'Fluxo de Caixa Projetado', icon: TrendingUp },
  { id: 'cenarios',         label: 'Simulação de Cenários (What-if)', icon: Calculator },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const FpaModule: React.FC<Props> = ({ organizationId, projectId, defaultTab = 'orcado-realizado' }) => {
  const [activeTab, setActiveTab] = useState<FpaTab>(defaultTab);

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
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
          );
        })}
      </div>

      <div className="pt-4">
        <Suspense fallback={<Spinner />}>
          {activeTab === 'orcado-realizado' && (
            <BudgetActualPage organizationId={organizationId} projectId={projectId} />
          )}
          {activeTab === 'fluxo-projetado' && (
            <CashflowProjectionPage organizationId={organizationId} />
          )}
          {activeTab === 'cenarios' && (
            <BudgetScenarioPage organizationId={organizationId} projectId={projectId} />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default FpaModule;
