import React, { useState } from 'react';
import SupplyChainContractList from './SupplyChainContractList';
import ContractDetailView from './ContractDetailView';
import { ContractModal } from './ContractModal';
import { Contract, BudgetEntry } from '../types';
import { contractService } from '../services/contractService';
import { useServicesToast } from './services/useServicestoast';
import { useOrgWriteTarget } from '../hooks/useOrgContext';
import ServicesToast from './services/ServicesToast';

interface Props {
    organizationId?: string;
    budget?: BudgetEntry[];
    onGoToProject?: (projectId: string) => void;
}

const ServiceContractsModule: React.FC<Props> = ({
    organizationId,
    budget = [],
}) => {
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [createOrgId, setCreateOrgId] = useState<string | undefined>(undefined);
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // O drawer só CRIA. Ajustar é a página do contrato (abas Resumo/Financeiro/
    // Emissão) — ver docs/planos/2026-11-10-contrato-lapis-abre-pagina.md.
    const [newContract, setNewContract] = useState<Partial<Contract> | null>(null);
    const [version, setVersion] = useState(0);
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();

    const handleSubmit = async (data: Partial<Contract>) => {
        const payload = { ...data, direction: 'OUTGOING' as const, domain: 'SERVICOS' as const, organization_id: createOrgId || organizationId };
        const saved = await contractService.createContract(payload as Omit<Contract, 'id' | 'created_at' | 'current_value'>);
        setVersion(v => v + 1);
        setNewContract(null);
        setSelectedId(saved.id);
        setView('detail');
    };

    return (
        <>
            {view === 'detail' && selectedId ? (
                <ContractDetailView
                    contractId={selectedId}
                    onBack={() => { setView('list'); setSelectedId(null); }}
                    budget={budget}
                    organizationId={organizationId}
                />
            ) : (
                <SupplyChainContractList
                    projectId=""
                    organizationId={organizationId}
                    direction="OUTGOING"
                    domain="SERVICOS"
                    title="Contratos de Serviço"
                    subtitle="Contratos emitidos para clientes — aditivos e medições."
                    version={version}
                    onCreateNew={async () => {
                        // Contrato é registro operacional: exige uma organização.
                        // Em "Todas as organizações" pergunta em qual, em vez de o
                        // botão não fazer nada. Ver hooks/useOrgContext.tsx.
                        const target = await resolveWriteOrg('single');
                        if (!target || target.kind !== 'org') return;
                        setCreateOrgId(target.orgId);
                        setNewContract({
                            contract_type: 'Prestação de Serviços',
                            nature: 'Serviço',
                            direction: 'OUTGOING',
                            domain: 'SERVICOS',
                        } as any);
                    }}
                    onViewDetails={(id) => { setSelectedId(id); setView('detail'); }}
                    /* §22: a lista já remove o item do array local — não forçar
                       recarga completa (contratos + fornecedores + clientes + obras). */
                    onDelete={() => { }}
                />
            )}

            {/* A organização é a resolvida em onCreateNew — assim funciona igual
                em "Todas as organizações". */}
            {(createOrgId || organizationId) && (
                <ContractModal
                    isOpen={newContract !== null}
                    onClose={() => { setNewContract(null); setCreateOrgId(undefined); }}
                    onSubmit={handleSubmit}
                    projectId=""
                    organizationId={createOrgId || organizationId}
                    initialData={newContract ?? undefined}
                    direction="OUTGOING"
                    onToast={showToast}
                />
            )}
            <ServicesToast toasts={toasts} onDismiss={dismissToast} />
            {orgTargetModal}
        </>
    );
};

export default ServiceContractsModule;
