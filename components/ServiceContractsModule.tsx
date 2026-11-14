import React, { useEffect, useState } from 'react';
import { FileText, BarChart3 } from 'lucide-react';
import SupplyChainContractList from './SupplyChainContractList';
import ContractDetailView from './ContractDetailView';
import { ContractModal } from './ContractModal';
import { Contract, BudgetEntry } from '../types';
import { contractService } from '../services/contractService';
import { useServicesToast } from './services/useServicestoast';
import { useOrgWriteTarget } from '../hooks/useOrgContext';
import ServicesToast from './services/ServicesToast';
import { TabsBar } from './ui/TabsBar';
import { usePersistedState } from './ui/TableUtils';
import ServiceContractsAnalysisTab, { linkDaAnaliseServico } from './serviceContracts/ServiceContractsAnalysisTab';

interface Props {
    organizationId?: string;
    budget?: BudgetEntry[];
    onGoToProject?: (projectId: string) => void;
}

/** Abas da tela (§19.1). Análise: docs/planos/2026-11-13-contratos-servico-aba-analise.md. */
type Aba = 'contratos' | 'analise';

/** O título fica; o subtítulo diz de que a aba fala (§20). */
const CABECALHO: Record<Aba, { title: string; subtitle: string }> = {
    contratos: { title: 'Contratos de Serviço', subtitle: 'Contratos emitidos para clientes — aditivos e medições.' },
    analise: { title: 'Contratos de Serviço', subtitle: 'Carteira contratada, vigência, medição e recebimentos, por cliente.' },
};

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

    // Aba persistida; o link da Análise (`#/service-contracts?aba=analise…`)
    // manda sobre a aba salva — inclusive colado numa aba do navegador que já
    // está nesta tela (só o `#…` muda).
    const [aba, setAba] = usePersistedState<Aba>('serviceContracts:aba', 'contratos');
    useEffect(() => {
        if (linkDaAnaliseServico()) setAba('analise');
        const aoMudarEndereco = () => {
            if (!linkDaAnaliseServico()) return;
            setView('list');
            setSelectedId(null);
            setAba('analise');
        };
        window.addEventListener('hashchange', aoMudarEndereco);
        return () => window.removeEventListener('hashchange', aoMudarEndereco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const abaAtiva: Aba = aba === 'analise' ? 'analise' : 'contratos';

    const abrirContrato = (id: string) => { setSelectedId(id); setView('detail'); };

    const tabsBar = (
        <TabsBar<Aba>
            tabs={[
                { id: 'contratos', label: 'Contratos', icon: <FileText className="w-3.5 h-3.5" /> },
                { id: 'analise', label: 'Análise', icon: <BarChart3 className="w-3.5 h-3.5" /> },
            ]}
            value={abaAtiva}
            onChange={setAba}
        />
    );

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
            ) : abaAtiva === 'analise' ? (
                // Mesma anatomia da lista: título → abas → escopo → números (§20).
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{CABECALHO.analise.title}</h1>
                        <p className="text-gray-500 text-sm mt-1.5 font-medium">{CABECALHO.analise.subtitle}</p>
                    </div>
                    <div>
                        {tabsBar}
                        <ServiceContractsAnalysisTab onOpenContract={abrirContrato} onToast={showToast} />
                    </div>
                </div>
            ) : (
                <SupplyChainContractList
                    projectId=""
                    organizationId={organizationId}
                    direction="OUTGOING"
                    domain="SERVICOS"
                    title={CABECALHO.contratos.title}
                    subtitle={CABECALHO.contratos.subtitle}
                    tabsSlot={tabsBar}
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
                    onViewDetails={abrirContrato}
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
