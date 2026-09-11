import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { HandCoins } from 'lucide-react';
import FinancialRegistryManager from './FinancialRegistryManager';
import PlanoContasImportModal from './PlanoContasImportModal';
import { financialRegistryService } from '../services/financialRegistryService';
import { exportService } from '../services/exportService';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import { useStore } from '../store/useStore';
import { CostCenter } from '../types/financial';

// Módulo dedicado "Plano de Contas" (Minha Organização) — dimensão contábil
// hierárquica por organização (tabela `plano_de_contas`, códigos pontilhados
// 1.4.6.1, com coluna Natureza Credora/Devedora). É SEPARADO de Centro de Custo
// (cost_centers_v2 / CostCenterModule) — duas dimensões diferentes. A árvore
// hierárquica e a UI vêm de FinancialRegistryManager; este módulo é dono da
// própria carga de dados e do CRUD, sem passar por OrganizationList.
//
// Sem props de organização: lê do `useOrgContext` (CLAUDE.md REGRA #5). Até
// 11/09/2026 recebia `organizationId` de `OrganizationList`, que em "Todas as
// organizações" caía em `organizations[0]` — a tela listava UMA organização
// com o topo dizendo "Todas", e o botão Importar não fazia nada.

const PlanoDeContasModule: React.FC = () => {
    // null = "Todas as organizações": lista sem filtro, a RLS recorta.
    const { orgId: organizationId } = useOrgContext();
    // Importar exige UMA organização (a planilha é de um plano só): com o topo
    // em "Todas", pergunta — modo 'single', sem a opção de replicar.
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const organizations = useStore(s => s.organizations);
    const orgOptions = useMemo(() => organizations.map(o => ({ id: o.id, name: o.name })), [organizations]);
    const orgNameById = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);

    const [items, setItems] = useState<CostCenter[]>([]);
    const [importOrgId, setImportOrgId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await financialRegistryService.listPlanoContas(organizationId || undefined);
            setItems(data);
        } catch (error) {
            console.error('Erro ao carregar plano de contas:', error);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    const abrirImportacao = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        setImportOrgId(target.orgId);
    };

    return (
        <>
            <FinancialRegistryManager
                title="Plano de Contas"
                description="Estruture seu plano de contas para classificação contábil"
                icon={HandCoins}
                items={items}
                showCode={true}
                showNature={true}
                // Seletor de organização no formulário e coluna Organização SÓ em
                // "Todas as organizações": com org no topo, o sistema não pergunta.
                organizations={organizationId ? undefined : orgOptions}
                defaultOrganizationId={organizationId || undefined}
                showOrganization={!organizationId}
                organizationNameById={orgNameById}
                onSave={async (item) => {
                    const orgId = item.organization_id || organizationId;
                    if (!orgId) throw new Error('Selecione uma organização para vincular a conta.');
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
                onImport={abrirImportacao}
            />

            {importOrgId && (
                <PlanoContasImportModal
                    organizationId={importOrgId}
                    existingItems={items.filter(i => i.organization_id === importOrgId)}
                    onClose={() => setImportOrgId(null)}
                    onSuccess={() => { load(); setImportOrgId(null); }}
                />
            )}

            {orgTargetModal}
        </>
    );
};

export default PlanoDeContasModule;
