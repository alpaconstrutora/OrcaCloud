import React, { useState, useCallback } from 'react';
import { Plus, FileText, FileStack } from 'lucide-react';
import { ContractsDashboard } from './ContractsDashboard';
import ContractDetailView from './ContractDetailView';
import { ContractModal } from './ContractModal';
import DocxTemplateManager from './DocxTemplateManager';
import { Contract, BudgetEntry } from '../types';
import { contractService } from '../services/contractService';

interface Props {
    organizationId: string;
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
                <div className="h-full flex flex-col">
                    {/* Barra de ações */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <FileText size={18} className="text-blue-600" />
                            <span className="font-semibold text-sm">Contratos de Serviço</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsTemplateManagerOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                title="Gerenciar modelos de documento (.docx) para emissão"
                            >
                                <FileStack size={15} className="text-blue-600" /> Modelos de Documento
                            </button>
                            <button
                                onClick={() => {
                                    setEditingContract({
                                        contract_type: 'Prestação de Serviços',
                                        nature: 'Serviço',
                                        direction: 'OUTGOING',
                                    } as any);
                                    setIsModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                                <Plus size={15} /> Novo Contrato
                            </button>
                        </div>
                    </div>

                    {/* Dashboard filtrado: só contratos OUTGOING (emitidos para clientes) */}
                    <div className="flex-1 overflow-auto" key={version}>
                        <ContractsDashboard
                            organizationId={organizationId}
                            direction="OUTGOING"
                            onViewContract={(id) => { setSelectedId(id); setView('detail'); }}
                        />
                    </div>

                    {/* Ambiente de gestão de modelos de documento (.docx) */}
                    {isTemplateManagerOpen && (
                        <DocxTemplateManager
                            organizationId={organizationId}
                            onClose={() => setIsTemplateManagerOpen(false)}
                        />
                    )}
                </div>
            )}

            {/* Modal de criação/edição — acessível em qualquer view */}
            <ContractModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingContract(null); }}
                onSubmit={handleSubmit}
                projectId={editingContract?.project_id ?? ''}
                organizationId={organizationId}
                initialData={editingContract ?? undefined}
                direction="OUTGOING"
            />
        </>
    );
};

export default ServiceContractsModule;
