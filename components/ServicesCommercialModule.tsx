import React, { useState, useCallback } from 'react';
import ServicesPipeline from './services/ServicesPipeline';
import ServicesOpportunityDetail from './services/ServicesOpportunityDetail';
import ServicesVisit from './services/ServicesVisit';
import ServicesBudget from './services/ServicesBudget';
import ServicesProposal from './services/ServicesProposal';
import ContractDetailView from './ContractDetailView';

// A listagem de contratos vive em Comercial › Contratos de Serviço
// (ServiceContractsModule, motor `contracts`). Aqui só existe o detalhe de um
// contrato aberto a partir da oportunidade que o gerou.
export type ServicesView =
  | 'pipeline'
  | 'opportunity'
  | 'visit'
  | 'budget'
  | 'proposal'
  | 'contract-detail';

interface Props {
  // null ⇒ "todas as organizações" (visão consolidada, somente leitura para criação)
  organizationId: string | null;
  onGoToProject: (projectId: string) => void;
}

const ServicesCommercialModule: React.FC<Props> = ({ organizationId, onGoToProject }) => {
  const [view, setView] = useState<ServicesView>('pipeline');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  // Org da oportunidade selecionada — usada nas sub-telas de escrita quando
  // estamos na visão "todas as organizações" (organizationId === null).
  const [selectedOppOrgId, setSelectedOppOrgId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  // Org efetiva para as telas de detalhe/escrita: a org selecionada, ou a org
  // da própria oportunidade quando estamos na visão consolidada.
  const effectiveOrgId = organizationId ?? selectedOppOrgId;

  const navigate = useCallback((nextView: ServicesView, opportunityId?: string, opportunityOrgId?: string) => {
    if (opportunityId !== undefined) setSelectedOpportunityId(opportunityId);
    if (opportunityOrgId !== undefined) setSelectedOppOrgId(opportunityOrgId);
    setView(nextView);
  }, []);

  const goToContract = useCallback((contractId: string, contractOrgId?: string) => {
    setSelectedContractId(contractId);
    if (contractOrgId !== undefined) setSelectedOppOrgId(contractOrgId);
    setView('contract-detail');
  }, []);

  const renderView = () => {
    switch (view) {
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
            organizationId={effectiveOrgId ?? ''}
            onNavigate={navigate}
            onBack={() => navigate('pipeline')}
            onGoToProject={onGoToProject}
            onGoToContract={goToContract}
          />
        ) : null;
      case 'visit':
        return selectedOpportunityId ? (
          <ServicesVisit
            opportunityId={selectedOpportunityId}
            organizationId={effectiveOrgId ?? ''}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'budget':
        return selectedOpportunityId ? (
          <ServicesBudget
            opportunityId={selectedOpportunityId}
            organizationId={effectiveOrgId ?? ''}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'proposal':
        return selectedOpportunityId ? (
          <ServicesProposal
            opportunityId={selectedOpportunityId}
            organizationId={effectiveOrgId ?? ''}
            onBack={() => navigate('opportunity', selectedOpportunityId)}
          />
        ) : null;
      case 'contract-detail':
        return selectedContractId ? (
          <ContractDetailView
            contractId={selectedContractId}
            onBack={() => setView(selectedOpportunityId ? 'opportunity' : 'pipeline')}
            budget={[]}
            organizationId={effectiveOrgId ?? ''}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {selectedOpportunityId && ['opportunity', 'visit', 'budget', 'proposal'].includes(view) && (
        <div className="flex items-center px-4 pt-3 pb-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <button onClick={() => navigate('pipeline')} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Pipeline
          </button>
          <span className="mx-2 text-button text-gray-400 truncate">
            / {view === 'opportunity' ? 'Oportunidade' : view === 'visit' ? 'Visita' : view === 'budget' ? 'Orçamento' : 'Proposta'}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto">{renderView()}</div>
    </div>
  );
};

export default ServicesCommercialModule;
