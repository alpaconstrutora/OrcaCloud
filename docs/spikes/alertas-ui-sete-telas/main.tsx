/**
 * Harness (16/11/2026): monta as 7 telas DE PRODUÇÃO cujos alertas do check-ui-standard.sh foram
 * corrigidos, com dados falsos, para medir no DOM e olhar o print — todas exigem login no app.
 * `?tela=<nome>`. Os serviços que iriam ao banco são trocados por funções que devolvem dados fixos
 * ANTES de montar (o componente não é tocado).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';
import Dashboard from '../../../components/Dashboard';
import ParametricEstimator from '../../../components/ParametricEstimator';
import ProjectOverview from '../../../components/ProjectOverview';
import { RentalsDashboard } from '../../../components/RentalsDashboard';
import SupplyChainQuotationComparison from '../../../components/SupplyChainQuotationComparison';
import TaxReport from '../../../components/TaxReport';
import HoldingsList from '../../../components/investor/HoldingsList';
import { parametricService } from '../../../services/parametricService';
import { rentalsDashboardService } from '../../../services/rentalsDashboardService';
import { quotationService } from '../../../services/quotationService';
import { projectService } from '../../../services/projectService';
import { orderService } from '../../../services/orderService';
import { projectTypeTemplatesService } from '../../../services/projectTypeTemplatesService';

const fixo = <T,>(v: T) => (async () => v) as any;
const P = (o: object) => o as any;

// ── serviços sem banco ─────────────────────────────────────────────────────────
Object.assign(parametricService, {
    calculateTotalEstimatedValueAsync: fixo(2_350_000),
    getHistoricalCubDataAsync: fixo([{ date: '2026-08', rate: 2810 }, { date: '2026-09', rate: 2832 }, { date: '2026-10', rate: 2851 }]),
    getRegionalComparisonDataAsync: fixo([{ state: 'MS', rate: 2851 }, { state: 'SP', rate: 2990 }]),
    getMixComparisonAsync: fixo({ standard: 'R8-A', total: 3_100_000, m2: 3100 }),
});
// Etapas com valor (17/11/2026): "Salvar cenário" fica desligado quando o orçamento dá R$ 0,00.
parametricService.generateParametricBudgetAsync = fixo([
    ['01.01.01 Fundação', 'Materiais', 420_000], ['01.02.01 Estrutura', 'Materiais', 610_000],
    ['01.03.01 Alvenaria', 'Mão de Obra', 260_000], ['01.04.01 Instalações', 'Materiais', 330_000],
    ['01.05.01 Acabamento', 'Mão de Obra', 380_000],
].map(([subPhase, nature, price], i) => ({ id: `e${i}`, subPhase, quantity: 1, sinapiItem: { code: `E${i}`, description: subPhase, nature, price, unit: 'vb' } })));
Object.assign(rentalsDashboardService, {
    getDashboardMetrics: fixo(P({
        valorTotalPatrimonio: 12_400_000, receitaMensal: 68_000, yieldMensal: 0.0055, taxaOcupacao: 0.82,
        unidadesDisponiveis: 4, unidadesTotal: 22, unidadesInadimplentes: 1,
        rentCurve: ['jun', 'jul', 'ago', 'set', 'out', 'nov'].map((m, i) => ({ month: m, planejado: 60000 + i * 1500, real: 58000 + i * 1800 })),
        canais: [{ name: 'Direto', value: 12 }, { name: 'Imobiliária', value: 6 }],
        tipologia: [{ name: 'Sala', value: 14 }, { name: 'Loja', value: 8 }],
        proximasVencimentos: [],
    })),
});
const REQ = P({
    id: 'req1', number: 'COT-0042', projectId: '', title: 'Concreto e aço — bloco B', deadline: '2026-11-30', status: 'Em Análise',
    invitedSupplierIds: ['s1', 's2'],
    items: [
        { code: 'C30', description: 'Concreto usinado fck 30 MPa', unit: 'm³', quantity: 120 },
        { code: 'CA50', description: 'Aço CA-50 10 mm', unit: 'kg', quantity: 8000 },
    ],
});
const RESPS = P([
    {
        id: 'r1', requestId: 'req1', supplierId: 's1', supplierName: 'Concreteira Pantanal LTDA', status: 'Enviada', negotiationStatus: 'Contraproposta',
        items: [
            { code: 'C30', description: 'Concreto', unit: 'm³', quantity: 120, unitPrice: 520, total: 62400 },
            { code: 'CA50', description: 'Aço', unit: 'kg', quantity: 8000, unitPrice: 7.9, total: 63200 },
        ],
        paymentMethod: 'Boleto', paymentTermType: 'Vista', paymentDays: 28, deliveryDate: '2026-12-05', deliveryMethod: 'CIF',
        counterProposal: { items: [{ code: 'C30', unitPrice: 495 }], paymentMethod: 'PIX', paymentTermType: 'Parcelado', paymentInstallments: 3, deliveryDate: '2026-12-10', deliveryMethod: 'FOB' },
        negotiationHistory: [{ timestamp: '2026-11-14T13:00:00Z', action: 'Contraproposta enviada', author: 'Comprador', changes: { items: [{ code: 'C30', oldPrice: 520, newPrice: 495 }] } }],
    },
    {
        id: 'r2', requestId: 'req1', supplierId: 's2', supplierName: 'Aço Forte Distribuidora', status: 'Enviada', negotiationStatus: 'Nova Proposta',
        items: [
            { code: 'C30', description: 'Concreto', unit: 'm³', quantity: 120, unitPrice: 510, total: 61200 },
            { code: 'CA50', description: 'Aço', unit: 'kg', quantity: 8000, unitPrice: 7.4, total: 59200 },
        ],
        paymentMethod: 'Boleto', paymentTermType: 'Vista', paymentDays: 30, deliveryDate: '2026-12-02', deliveryMethod: 'CIF',
    },
]);
Object.assign(quotationService, { listRequests: fixo([REQ]), listResponses: fixo(RESPS) });
Object.assign(projectService, { loadProject: fixo(null) });
Object.assign(orderService, { listOrders: fixo([]) });
Object.assign(projectTypeTemplatesService, { getTemplate: fixo(null) });

// ── dados das telas de props ───────────────────────────────────────────────────
const SETTINGS = P({
    id: 'p1', name: 'Residencial Altavista', code: 'OB-017', obraStatus: 'Em Andamento', area: 1000, standard: 'R8-N',
    location: 'MS', referenceMonth: '2026-10', bdi: 25, kFactor: 1, organizationId: 'org1', cubRate: 2851,
});
const BUDGET = P([
    ['Estrutura', 'C30', 'Concreto usinado fck 30', 120, 520], ['Estrutura', 'CA50', 'Aço CA-50', 8000, 7.9],
    ['Alvenaria', 'BL14', 'Bloco cerâmico 14 cm', 9000, 2.1], ['Revestimento', 'PORC', 'Porcelanato 60×60', 800, 89],
    ['Instalações', 'TUBO', 'Tubo PVC 100 mm', 600, 31], ['Esquadrias', 'JAN', 'Janela alumínio', 40, 980],
].map(([cat, code, desc, q, price], i) => ({
    id: `b${i}`, quantity: q, bdi: 0, group: cat, phase: cat, subPhase: cat,
    sinapiItem: { code, description: desc, category: cat, price, unit: 'un' },
})));
const HOLDINGS = P([
    { id: 'h1', name: 'Garden Cambuhy', cota: '1x', equity: 230000, status: 'Em andamento', progress: 5.4 },
    { id: 'h2', name: 'Residencial Altavista', cota: '2x', equity: 410000, status: 'Lançamento', progress: 31 },
]);
const CONTRIB = P([
    { id: 'c1', project_id: 'h1', type: 'aporte', status: 'liquidado', amount: 230000 },
    { id: 'c2', project_id: 'h1', type: 'dividendo', status: 'liquidado', amount: 12000 },
]);

const nada = () => {};

/**
 * Faz o papel do App (17/11/2026): guarda as configurações do projeto — onde os cenários moram — e
 * desmonta/monta a tela com "Sair da tela"/"Voltar", como trocar de menu e voltar.
 */
function ParametricoComProjeto() {
    const [settings, setSettings] = React.useState(SETTINGS);
    const [aberta, setAberta] = React.useState(true);
    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button data-harness="sair" onClick={() => setAberta(false)}>Sair da tela</button>
                <button data-harness="voltar" onClick={() => setAberta(true)}>Voltar</button>
                <span data-harness="gravados">{(settings.parametricScenarios ?? []).length} gravado(s) no projeto</span>
            </div>
            {aberta && <ParametricEstimator settings={settings} onUpdateBudget={nada} onUpdateSettings={setSettings} onNavigate={nada} />}
        </div>
    );
}

const tela = new URLSearchParams(location.search).get('tela') ?? 'dashboard';
const TELAS: Record<string, React.ReactNode> = {
    dashboard: <Dashboard budget={BUDGET} settings={SETTINGS} />,
    parametrico: <ParametricoComProjeto />,
    visao: <ProjectOverview settings={SETTINGS} budget={BUDGET} projects={[]} onNavigate={nada} onLoadProject={fixo(null)} />,
    locacoes: <RentalsDashboard organizationId="org1" />,
    cotacoes: <SupplyChainQuotationComparison requestId="req1" onBack={nada} />,
    ir: <TaxReport investorContributions={CONTRIB} activeProjects={[{ id: 'h1', name: 'Garden Cambuhy' }] as any} />,
    carteira: <HoldingsList holdings={HOLDINGS} filterStatus="all" viewMode="list" onFilterChange={nada} onViewModeChange={nada} onSelectAsset={nada} />,
    carteiraGrade: <HoldingsList holdings={HOLDINGS} filterStatus="all" viewMode="grid" onFilterChange={nada} onViewModeChange={nada} onSelectAsset={nada} />,
};

createRoot(document.getElementById('raiz')!).render(
    <ToastProvider>
        <ConfirmProvider>
            <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }} data-tela={tela}>{TELAS[tela]}</div>
        </ConfirmProvider>
    </ToastProvider>,
);
