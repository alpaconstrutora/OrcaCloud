/**
 * TRAVA — nenhum cabeçalho de tabela/grade em cinza (12/10/2026).
 *
 * Pedido do usuário (com print do cabeçalho do Gantt): *"Nenhum header deve estar na cor
 * cinza!"*. Plano: docs/planos/2026-10-12-cabecalhos-sem-cinza.md. A cor do cabeçalho é a de
 * `components/ui/cabecalhoDeTabela.ts` (azul-claro que o app já usa).
 *
 * É uma CATRACA, nos moldes de `orgContextGuard`: `BASELINE` é a dívida herdada de
 * 12/10/2026 (cabeçalho escrito à mão, fora do `StandardTable`) e SÓ PODE DIMINUIR.
 *   - arquivo fora do baseline com cabeçalho cinza = código novo = build quebrado;
 *   - arquivo do baseline com MAIS ocorrências que o registrado = build quebrado;
 *   - arquivo do baseline com MENOS ocorrências = o baseline está desatualizado: abaixe-o
 *     (assim a dívida paga não volta escondida atrás do número antigo).
 * NÃO adicione entrada ao BASELINE para "fazer passar": use `CABECALHO_TABELA`.
 *
 * O que conta como cabeçalho cinza (por linha de código, fora de comentário):
 *   - `<thead className=…bg-{gray|slate|zinc|neutral|stone}-N>`;
 *   - `<th className=…bg-{…}-N>`;
 *   - `<tr className=…>` com fundo `{…}-50|100|200` E sinal de cabeçalho
 *     (`uppercase`, `sticky`, `font-semibold|medium|bold`, `tracking-wide`).
 * Barras do Gantt, trilho de abas e barras de ferramentas NÃO são cabeçalho de tabela.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

const THEAD = /<thead\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+/;
const TH = /<th\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+/;
const TR = /<tr\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-(?:50|100|200)\b[^"`]*\b(?:uppercase|sticky|font-semibold|font-medium|font-bold|tracking-wide)/;
const COMENTARIO = /^\s*(\/\/|\*|\{\/\*)/;

/** Dívida herdada de 12/10/2026 — só diminui. */
const BASELINE: Record<string, number> = {
    'components/AnomaliesPanel.tsx': 2,
    'components/AppraisalModule.tsx': 2,
    'components/AreaEngineModule.tsx': 1,
    'components/AssetImportModal.tsx': 1,
    'components/BalanceteReport.tsx': 1,
    'components/BankReconciliation.tsx': 3,
    'components/BoletoManager.tsx': 1,
    'components/BrokerList.tsx': 1,
    'components/BudgetEditor.tsx': 4,
    'components/CashFlowDashboard.tsx': 1,
    'components/ClientArea.tsx': 5,
    'components/ClientCategoriesSettings.tsx': 1,
    'components/ClientChargesModule.tsx': 1,
    'components/ClientImportModal.tsx': 1,
    'components/ClientList.tsx': 1,
    'components/ClientSelect.tsx': 1,
    'components/CofinsRatesSettings.tsx': 1,
    'components/CommercialModule.tsx': 2,
    'components/CompaniesModule.tsx': 1,
    'components/ContasPagarManager.tsx': 1,
    'components/ContasPagarParcelas.tsx': 1,
    'components/ContasReceberManager.tsx': 1,
    'components/ContractDetailView.tsx': 10,
    'components/ContractIndexManager.tsx': 1,
    'components/ContractMeasurementModal.tsx': 1,
    'components/ContractTypesSettings.tsx': 1,
    'components/ContractsDashboard.tsx': 1,
    'components/CostCenterModule.tsx': 1,
    'components/CostCenterV2ImportModal.tsx': 1,
    'components/DREReport.tsx': 2,
    'components/DRESPEReport.tsx': 1,
    'components/DealModal.tsx': 2,
    'components/DiaryProjectsList.tsx': 1,
    'components/DivergencesPanel.tsx': 3,
    'components/DocxTemplateManager.tsx': 1,
    'components/EmpreendimentoTypesSettings.tsx': 1,
    'components/EmpreendimentoUnitCharacteristicsSettings.tsx': 1,
    'components/FinancialCategoriesManager.tsx': 1,
    'components/FinancialIntelligence.tsx': 1,
    'components/FinancialRegistryManager.tsx': 1,
    'components/ImovibBlocksTypologyTab.tsx': 1,
    'components/ImovibCapexForm.tsx': 1,
    'components/ImovibCashFlow.tsx': 1,
    'components/ImovibDashboard.tsx': 1,
    'components/ImovibExecutiveSummary.tsx': 1,
    'components/InssBracketsSettings.tsx': 1,
    'components/InventoryModule.tsx': 4,
    'components/InvestorList.tsx': 1,
    'components/InvoiceManager.tsx': 1,
    'components/LaborAllocations.tsx': 1,
    'components/LaborEmployeeList.tsx': 1,
    'components/LaborEmployeeSalaryHistory.tsx': 1,
    'components/LaborRubrics.tsx': 1,
    'components/LaborTrainings.tsx': 1,
    'components/LaborValeRefeicao.tsx': 5,
    'components/NotificationsCenter.tsx': 2,
    'components/OperacionalList.tsx': 1,
    'components/OperacionalModule.tsx': 1,
    'components/OpuraAssetsModule.tsx': 4,
    'components/OpuraCnoModule.tsx': 1,
    'components/OpuraDocsModule.tsx': 4,
    'components/OrderReceiptModal.tsx': 1,
    'components/OrganizationList.tsx': 2,
    'components/OrganizationUsers.tsx': 3,
    'components/ParametricEstimator.tsx': 1,
    'components/PaymentTypesSettings.tsx': 1,
    'components/PaymentsPanel.tsx': 1,
    'components/PayrollRunDetail.tsx': 1,
    'components/PayrollRunList.tsx': 1,
    'components/PaystubModal.tsx': 1,
    'components/PisRatesSettings.tsx': 1,
    'components/PlanningList.tsx': 1,
    'components/PlanoContasImportModal.tsx': 1,
    'components/PortalHelpSettings.tsx': 2,
    'components/PriceTableManager.tsx': 1,
    'components/ProcessosModule.tsx': 1,
    'components/ProcurementModule.tsx': 4,
    'components/ProjectFinancialManager.tsx': 4,
    'components/ProjectList.tsx': 1,
    'components/ProjectModal.tsx': 1,
    'components/ProlaboreReconciliationPanel.tsx': 1,
    'components/QuotationResponseForm.tsx': 2,
    'components/RegulatoryZoneTable.tsx': 1,
    'components/RentalIntelligenceTab.tsx': 1,
    'components/RentalsModule.tsx': 5,
    'components/ReportViewer.tsx': 2,
    'components/SalesModule.tsx': 3,
    'components/SinapiRebaseModal.tsx': 1,
    'components/SmartReconciliationCenter.tsx': 1,
    'components/SupplierCategoriesSettings.tsx': 1,
    'components/SupplierDashboard.tsx': 4,
    'components/SupplierList.tsx': 1,
    'components/SupplierSelect.tsx': 1,
    'components/SupplyChainContractList.tsx': 1,
    'components/SupplyChainOrderDetails.tsx': 3,
    'components/SupplyChainOrderForm.tsx': 2,
    'components/SupplyChainOrderList.tsx': 1,
    'components/SupplyChainQuotationForm.tsx': 2,
    'components/SupplyChainQuotationList.tsx': 1,
    'components/SupplyChainReceiptManager.tsx': 1,
    'components/TasksList.tsx': 1,
    'components/TaxSettingsManager.tsx': 1,
    'components/TributosAPagarManager.tsx': 1,
    'components/UnitSelect.tsx': 1,
    'components/WarrantyModule.tsx': 1,
    'components/__validation__/ProfitabilityDiffPanel.tsx': 1,
    'components/academy/AcademyAssignmentsTab.tsx': 1,
    'components/academy/AcademyCatalogTab.tsx': 1,
    'components/academy/AcademyPanels.tsx': 1,
    'components/area-engine/AreaEngineShared.tsx': 1,
    'components/blueprint/BlueprintModule.tsx': 1,
    'components/blueprint/PainelCar.tsx': 1,
    'components/blueprint/PainelEletrica.tsx': 1,
    'components/blueprint/PainelLoteDigitado.tsx': 2,
    'components/blueprint/PainelReurb.tsx': 1,
    'components/blueprint/PainelRoteiroPerimetrico.tsx': 1,
    'components/blueprint/PainelSigef.tsx': 2,
    'components/blueprint/PainelViasEGreide.tsx': 3,
    'components/blueprint/QuadroDeDivisas.tsx': 1,
    'components/blueprint/TelaAlternativas.tsx': 1,
    'components/blueprint/TelaArmadura.tsx': 2,
    'components/blueprint/TelaQuantitativos.tsx': 4,
    'components/blueprint/TelaTabelas.tsx': 1,
    'components/broker/BrokerDevelopments.tsx': 2,
    'components/condominio/AtivosTab.tsx': 1,
    'components/condominio/CondominiosModule.tsx': 1,
    'components/condominio/DocumentosTab.tsx': 1,
    'components/condominio/FinanceiroTab.tsx': 2,
    'components/condominio/FracoesTab.tsx': 1,
    'components/condominio/ManutencaoTab.tsx': 3,
    'components/condominio/OcupacoesTab.tsx': 1,
    'components/condominio/PortalCondominoAdmin.tsx': 2,
    'components/credit/CreditRoomCovenants.tsx': 1,
    'components/credit/CreditRoomDetail.tsx': 4,
    'components/credit/CreditRoomDisbursements.tsx': 1,
    'components/credit/CreditRoomFunding.tsx': 1,
    'components/credit/CreditRoomModule.tsx': 1,
    'components/credit/CreditRoomRequests.tsx': 1,
    'components/debt/DebtAccrual.tsx': 1,
    'components/debt/DebtAllocations.tsx': 1,
    'components/debt/DebtCovenants.tsx': 1,
    'components/debt/DebtDashboard.tsx': 2,
    'components/debt/DebtDetail.tsx': 3,
    'components/debt/DebtGuarantees.tsx': 1,
    'components/debt/DebtModule.tsx': 1,
    'components/debt/DebtProposals.tsx': 1,
    'components/debt/DebtSimulator.tsx': 1,
    'components/documents/DocumentsTable.tsx': 1,
    'components/empreendimento/CaracteristicasAdicionaisTab.tsx': 1,
    'components/empreendimento/EmpreendimentoModule.tsx': 1,
    'components/empreendimento/FloorEditor.tsx': 1,
    'components/empreendimento/HistoricoTab.tsx': 1,
    'components/financeiro/BaixaRecebivelSheet.tsx': 1,
    'components/financeiro/FechamentoCentroCusto.tsx': 1,
    'components/fiscal/FiscalDocuments.tsx': 2,
    'components/fiscal/FiscalJobs.tsx': 1,
    'components/fiscal/FiscalRules.tsx': 1,
    'components/inventory/StockItemImportModal.tsx': 2,
    'components/inventory/StockItemsTab.tsx': 1,
    'components/investor/ContributionsManager.tsx': 1,
    'components/investor/DueDiligencePanel.tsx': 1,
    'components/investor/HoldingsList.tsx': 1,
    'components/investor/LandDealComparatorPanel.tsx': 1,
    'components/investor/OpportunitiesTab.tsx': 1,
    'components/investor/OpportunityDetail.tsx': 1,
    'components/investor/OpportunityForm.tsx': 2,
    'components/investor/RiskMatrixPanel.tsx': 1,
    'components/oficios/SeletorDestinatario.tsx': 1,
    'components/partner/PartnerWorkspaceManager.tsx': 4,
    'components/reconciliation/ConciliatedTab.tsx': 1,
    'components/regulatoryMap/RegulatoryMapExcelImportModal.tsx': 1,
    'components/regulatoryMap/RegulatoryMapModule.tsx': 1,
    'components/rentals/RentalGuaranteePanel.tsx': 4,
    'components/rentals/RentalRenewals.tsx': 1,
    'components/schedule/LastPlannerPanel.tsx': 2,
    'components/schedule/ScenariosPanel.tsx': 1,
    'components/settings/NomenclaturaTable.tsx': 1,
    'components/supplier/SupplierPortalManager.tsx': 1,
    'components/ui/DataTable.tsx': 1,
    'components/warranty/VincularSuprimentosSheet.tsx': 1,
};

function tsx(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return tsx(p);
        return n.endsWith('.tsx') ? [p] : [];
    });
}

export function contarCabecalhosCinza(texto: string): number {
    return texto.split('\n').filter((l) => !COMENTARIO.test(l) && (THEAD.test(l) || TH.test(l) || TR.test(l))).length;
}

const reais: Record<string, number> = {};
for (const f of tsx(join(RAIZ, 'components'))) {
    const n = contarCabecalhosCinza(readFileSync(f, 'utf-8'));
    if (n) reais[relative(RAIZ, f).split(sep).join('/')] = n;
}

describe('trava: nenhum cabeçalho de tabela em cinza', () => {
    it('detecta o padrão (a trava não está cega)', () => {
        expect(contarCabecalhosCinza('<thead className="bg-gray-50 text-gray-500">')).toBe(1);
        expect(contarCabecalhosCinza('<tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold">')).toBe(1);
        expect(contarCabecalhosCinza('<th className="px-4 bg-slate-100">')).toBe(1);
        expect(contarCabecalhosCinza('<thead className={`bg-zinc-50 ${x}`}>')).toBe(1);
    });

    it('não confunde com o que é permitido (cabeçalho azul, linha de dado zebrada, comentário)', () => {
        expect(contarCabecalhosCinza('<thead className="bg-blue-50 text-blue-800">')).toBe(0);
        expect(contarCabecalhosCinza('<tr className="hover:bg-gray-50 transition-colors">')).toBe(0);
        expect(contarCabecalhosCinza('// <thead className="bg-gray-50">')).toBe(0);
        expect(contarCabecalhosCinza('<tr className="bg-gray-50/50">')).toBe(0);
    });

    it('nenhum arquivo NOVO tem cabeçalho cinza, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) — use CABECALHO_TABELA de components/ui/cabecalhoDeTabela.ts`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
