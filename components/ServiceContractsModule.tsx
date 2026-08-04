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
    const [editingContract, setEditingContract] = useState<Contract | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [version, setVersion] = useState(0);
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();

    const handleSubmit = async (data: Partial<Contract>) => {
        // Editar: org do próprio contrato. Criar: a resolvida em onCreateNew.
        const effectiveOrgId = editingContract?.organization_id || createOrgId || organizationId;
        const payload = { ...data, direction: 'OUTGOING' as const, domain: 'SERVICOS' as const, organization_id: effectiveOrgId };
        let saved: Contract;
        if (editingContract?.id) {
            saved = await contractService.updateContract(editingContract.id, payload);
        } else {
            saved = await contractService.createContract(payload as Omit<Contract, 'id' | 'created_at' | 'current_value'>);
        }
        setVersion(v => v + 1);
        setIsModalOpen(false);
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
                    onEdit={(contract) => {
                        setEditingContract(contract);
                        setIsModalOpen(true);
                    }}
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
                        setEditingContract({
                            contract_type: 'Prestação de Serviços',
                            nature: 'Serviço',
                            direction: 'OUTGOING',
                            domain: 'SERVICOS',
                        } as any);
                        setIsModalOpen(true);
                    }}
                    onViewDetails={(id) => { setSelectedId(id); setView('detail'); }}
                    onEdit={(contract) => {
                        setEditingContract(contract);
                        setIsModalOpen(true);
                    }}
                    /* §22: a lista já remove o item do array local — não forçar
                       recarga completa (contratos + fornecedores + clientes + obras). */
                    onDelete={() => { }}
                />
            )}

            {/* Editar: a organização sai do próprio contrato. Criar: a resolvida
                em onCreateNew. Assim funciona igual em "Todas as organizações". */}
            {(editingContract?.organization_id || createOrgId || organizationId) && (
                <ContractModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setEditingContract(null); setCreateOrgId(undefined); }}
                    onSubmit={handleSubmit}
                    projectId={editingContract?.project_id ?? ''}
                    organizationId={editingContract?.organization_id || createOrgId || organizationId}
                    initialData={editingContract ?? undefined}
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
