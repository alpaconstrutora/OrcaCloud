import React, { useState } from 'react';
import { FileStack } from 'lucide-react';
import SupplyChainContractList from './SupplyChainContractList';
import ContractDetailView from './ContractDetailView';
import { ContractModal } from './ContractModal';
import DocxTemplateManager from './DocxTemplateManager';
import { Contract, BudgetEntry } from '../types';
import { contractService } from '../services/contractService';
import { useServicesToast } from './services/useServicestoast';
import ServicesToast from './services/ServicesToast';

interface Props {
    organizationId?: string;
    budget?: BudgetEntry[];
    onGoToProject?: (projectId: string) => void;
}

const ServiceContractsModule: React.FC<Props> = ({
    organizationId,
    budget = [],
    onGoToProject,
}) => {
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingContract, setEditingContract] = useState<Contract | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
    const [version, setVersion] = useState(0);
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();

    const handleSubmit = async (data: Partial<Contract>) => {
        const payload = { ...data, direction: 'OUTGOING' as const, organization_id: organizationId };
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

    const templateButton = (
        <button
            onClick={() => setIsTemplateManagerOpen(true)}
            className="flex items-center gap-2 px-6 py-4 bg-white border border-gray-100 rounded-2xl text-gray-500 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm font-medium text-[12px] uppercase tracking-widest active:scale-95"
            title="Gerenciar modelos de documento (.docx)"
        >
            <FileStack className="w-4 h-4" /> Modelos de Documento
        </button>
    );

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
                <div className="p-6 lg:p-8">
                    <SupplyChainContractList
                        projectId=""
                        organizationId={organizationId}
                        direction="OUTGOING"
                        title="Contratos de Serviço"
                        subtitle="Contratos emitidos para clientes — aditivos e medições."
                        version={version}
                        onCreateNew={() => {
                            if (!organizationId) return;
                            setEditingContract({
                                contract_type: 'Prestação de Serviços',
                                nature: 'Serviço',
                                direction: 'OUTGOING',
                            } as any);
                            setIsModalOpen(true);
                        }}
                        onViewDetails={(id) => { setSelectedId(id); setView('detail'); }}
                        onEdit={(contract) => {
                            setEditingContract(contract);
                            setIsModalOpen(true);
                        }}
                        onDelete={() => setVersion(v => v + 1)}
                        extraActions={templateButton}
                    />
                </div>
            )}

            {organizationId && (
            <ContractModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingContract(null); }}
                onSubmit={handleSubmit}
                projectId={editingContract?.project_id ?? ''}
                organizationId={organizationId}
                initialData={editingContract ?? undefined}
                direction="OUTGOING"
                onToast={showToast}
            />
            )}
            <ServicesToast toasts={toasts} onDismiss={dismissToast} />

            {isTemplateManagerOpen && organizationId && (
                <DocxTemplateManager
                    organizationId={organizationId}
                    onClose={() => setIsTemplateManagerOpen(false)}
                />
            )}
        </>
    );
};

export default ServiceContractsModule;
