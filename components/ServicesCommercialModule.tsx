import React, { useState, useEffect, useCallback } from 'react';
import ServicesDashboard from './services/ServicesDashboard';
import ServicesPipeline from './services/ServicesPipeline';
import ServicesOpportunityDetail from './services/ServicesOpportunityDetail';
import ServicesVisit from './services/ServicesVisit';
import ServicesBudget from './services/ServicesBudget';
import ServicesProposal from './services/ServicesProposal';
import ServicesContracts from './services/ServicesContracts';

export type ServicesView =
  | 'dashboard'
  | 'pipeline'
  | 'opportunity'
  | 'visit'
  | 'budget'
  | 'proposal'
  | 'contracts';

interface Props {
  organizationId: string;
  onGoToProject: (projectId: string) => void;
}

const ServicesCommercialModule: React.FC<Props> = ({ organizationId, onGoToProject }) => {
  const [view, setView] = useState<ServicesView>('pipeline');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);

  const navigate = useCallback((nextView: ServicesView, opportunityId?: string) => {
    if (opportunityId !== undefined) setSelectedOpportunityId(opportunityId);
    setView(nextView);
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <ServicesDashboard
            organizationId={organizationId}
            onNavigate={navigate}
          />
        );
      case 'pipeline':
        return (
          <ServicesPipeline
            organizationId={organizationId}
            onNavigate={navigate}
          />
        );
      case 'opportunity':
        return selectedOpportunityId ? (
          <ServicesOpportunityDetail
            opportunityId={selectedOpportunityId}
            organizationId={organizationId}
            onNavigate={navigate}
            onBack={() => navigate('pipeline')}
            onGoToProject={onGoToProject}
          />
        ) : null;
      case 'visit':
        return selectedOpportunityId ? (
          <ServicesVisit
            opportunityId={selectedOpportunityId}
            organizationId={organizationId}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'budget':
        return selectedOpportunityId ? (
          <ServicesBudget
            opportunityId={selectedOpportunityId}
            organizationId={organizationId}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'proposal':
        return selectedOpportunityId ? (
          <ServicesProposal
            opportunityId={selectedOpportunityId}
            organizationId={organizationId}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'contracts':
        return (
          <ServicesContracts
            organizationId={organizationId}
            onNavigate={navigate}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {(['dashboard', 'pipeline', 'contracts'] as ServicesView[]).map(v => (
          <button
            key={v}
            onClick={() => navigate(v)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              view === v
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {v === 'dashboard' ? 'Dashboard' : v === 'pipeline' ? 'Pipeline' : 'Contratos'}
          </button>
        ))}
        {selectedOpportunityId && ['opportunity', 'visit', 'budget', 'proposal'].includes(view) && (
          <span className="ml-2 text-xs text-gray-400 truncate">
            / {view === 'opportunity' ? 'Oportunidade' : view === 'visit' ? 'Visita' : view === 'budget' ? 'Orçamento' : 'Proposta'}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">{renderView()}</div>
    </div>
  );
};

export default ServicesCommercialModule;
