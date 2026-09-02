import React, { useState, useCallback } from 'react';
import ServicesPipeline from './services/ServicesPipeline';
import ServicesOpportunityDetail from './services/ServicesOpportunityDetail';
import ServicesVisit from './services/ServicesVisit';
import ServicesBudget from './services/ServicesBudget';
import ServicesProposal from './services/ServicesProposal';
import ContractDetailView from './ContractDetailView';
import Breadcrumb, { type BreadcrumbItem } from './ui/Breadcrumb';

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

// Rótulo do 3º nível da trilha (§23). `opportunity` fica de fora: ele é o 2º
// nível e usa o nome do contato.
const SUB_VIEW_LABEL: Partial<Record<ServicesView, string>> = {
  visit: 'Visita',
  budget: 'Orçamento',
  proposal: 'Proposta',
  'contract-detail': 'Contrato',
};

const ServicesCommercialModule: React.FC<Props> = ({ organizationId, onGoToProject }) => {
  const [view, setView] = useState<ServicesView>('pipeline');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  // Org da oportunidade selecionada — usada nas sub-telas de escrita quando
  // estamos na visão "todas as organizações" (organizationId === null).
  const [selectedOppOrgId, setSelectedOppOrgId] = useState<string | null>(null);
  // Nome do contato da oportunidade aberta — só para rotular a trilha (§23).
  const [selectedOppLabel, setSelectedOppLabel] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  // Org efetiva para as telas de detalhe/escrita: a org selecionada, ou a org
  // da própria oportunidade quando estamos na visão consolidada.
  const effectiveOrgId = organizationId ?? selectedOppOrgId;

  const navigate = useCallback((nextView: ServicesView, opportunityId?: string, opportunityOrgId?: string, opportunityLabel?: string) => {
    if (opportunityId !== undefined) setSelectedOpportunityId(opportunityId);
    if (opportunityOrgId !== undefined) setSelectedOppOrgId(opportunityOrgId);
    if (opportunityLabel !== undefined) setSelectedOppLabel(opportunityLabel);
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

  // Trilha Pipeline → Oportunidade → sub-tela (§23). O nível do meio precisa
  // existir e ser clicável: visita/orçamento/proposta/contrato só são
  // alcançáveis DE DENTRO da oportunidade, e é para lá que o `onBack` de cada
  // uma volta.
  const crumbs: BreadcrumbItem[] = React.useMemo(() => {
    if (!selectedOpportunityId || view === 'pipeline') return [];
    const items: BreadcrumbItem[] = [
      { label: 'Pipeline', onClick: () => navigate('pipeline') },
      { label: selectedOppLabel || 'Oportunidade', onClick: () => navigate('opportunity', selectedOpportunityId) },
    ];
    const sub = SUB_VIEW_LABEL[view];
    if (sub) items.push({ label: sub });
    return items;
  }, [selectedOpportunityId, selectedOppLabel, view, navigate]);

  return (
    <div className="h-full flex flex-col">
      {crumbs.length > 0 && (
        <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-white">
          <Breadcrumb items={crumbs} />
        </div>
      )}

      <div className="flex-1 overflow-auto">{renderView()}</div>
    </div>
  );
};

export default ServicesCommercialModule;
