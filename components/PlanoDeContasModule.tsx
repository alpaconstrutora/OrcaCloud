import React, { useState, useCallback, useEffect } from 'react';
import { HandCoins } from 'lucide-react';
import FinancialRegistryManager from './FinancialRegistryManager';
import PlanoContasImportModal from './PlanoContasImportModal';
import { financialRegistryService } from '../services/financialRegistryService';
import { exportService } from '../services/exportService';
import { CostCenter } from '../types/financial';

// Módulo dedicado "Plano de Contas" (Minha Organização) — dimensão contábil
// hierárquica por organização (tabela `plano_de_contas`, códigos pontilhados
// 1.4.6.1, com coluna Natureza Credora/Devedora). É SEPARADO de Centro de Custo
// (cost_centers_v2 / CostCenterModule) — duas dimensões diferentes. A árvore
// hierárquica e a UI vêm de FinancialRegistryManager; este módulo é dono da
// própria carga de dados e do CRUD, sem passar por OrganizationList.

interface OrgOption { id: string; name: string; }

interface PlanoDeContasModuleProps {
    /** Org sobre a qual criar/editar. REGRA #5: leitura nunca bloqueia por org nula; criar exige. */
    organizationId: string | null;
    /** Seletor de organização da toolbar (cadastro por-org). */
    orgFilter?: {
        organizations: OrgOption[];
        value: string | null;
        onChange: (id: string) => void;
    };
}

const PlanoDeContasModule: React.FC<PlanoDeContasModuleProps> = ({ organizationId, orgFilter }) => {
    const [items, setItems] = useState<CostCenter[]>([]);
    const [showImport, setShowImport] = useState(false);

    const load = useCallback(async () => {
        try {
            // REGRA #5: "Todas as organizações" (organizationId null) não bloqueia
            // leitura — passa undefined e deixa a RLS filtrar pelas orgs do usuário.
            const data = await financialRegistryService.listPlanoContas(organizationId || undefined);
            setItems(data);
        } catch (error) {
            console.error('Erro ao carregar plano de contas:', error);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    return (
        <>
            <FinancialRegistryManager
                title="Plano de Contas"
                description="Estruture seu plano de contas para classificação contábil"
                icon={HandCoins}
                items={items}
                showCode={true}
                showNature={true}
                orgFilter={orgFilter}
                onSave={async (item) => {
                    const orgId = item.organization_id || organizationId;
                    if (!orgId) return alert('Selecione uma organização para vincular a conta.');
                    const payload = {
                        name: item.name,
                        code: item.code ?? '',
                        accounting_nature: (item as CostCenter).accounting_nature,
                    };
                    if (item.id) await financialRegistryService.updatePlanoConta(item.id, payload);
                    else await financialRegistryService.createPlanoConta({ ...payload, organization_id: orgId });
                    load();
                }}
                onDelete={async (id) => {
                    await financialRegistryService.deletePlanoConta(id);
                    load();
                }}
                onExport={() => exportService.exportCostCenters(items.map(p => ({ name: p.name, code: p.code })))}
                onDownloadTemplate={() => exportService.downloadCostCenterTemplate()}
                onImport={() => setShowImport(true)}
            />

            {showImport && organizationId && (
                <PlanoContasImportModal
                    organizationId={organizationId}
                    existingItems={items}
                    onClose={() => setShowImport(false)}
                    onSuccess={() => { load(); setShowImport(false); }}
                />
            )}
        </>
    );
};

export default PlanoDeContasModule;
