/**
 * Harness: ContractDetailView DE PRODUÇÃO na aba Financeiro › Parcelas, com o
 * contractService (e os serviços da carga inicial) substituídos NO NAVEGADOR —
 * nada vai ao banco. Serve para ver a coluna Ações com "Alterar vencimento", o
 * painel, e o selo "Alterado manualmente" na célula da Data depois de salvar.
 * Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ContractDetailView from '../../../components/ContractDetailView';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { contractService, type ParcelaDoContrato } from '../../../services/contractService';
import { contractGuaranteeService } from '../../../services/contractGuaranteeService';
import { contractPenaltyService } from '../../../services/contractPenaltyService';
import { contractRiskService } from '../../../services/contractRiskService';
import { contractLaborQuestionnaireService } from '../../../services/contractLaborQuestionnaireService';
import { contractAcceptanceService } from '../../../services/contractAcceptanceService';
import { contractTechnicalResponsibilityService } from '../../../services/contractTechnicalResponsibilityService';
import { contractEvaluationService } from '../../../services/contractEvaluationService';
import { contractSupplyMatrixService } from '../../../services/contractSupplyMatrixService';

try { localStorage.setItem('contractFinance:subTab', JSON.stringify('parcelas')); } catch { /* sem storage */ }

const contrato: any = {
  id: 'c0000000-0000-0000-0000-000000000001',
  organization_id: '00000000-0000-0000-0000-000000000000',
  number: 'CT-000777', title: 'Empreitada de pintura', contract_type: 'Empreitada', nature: 'Serviço',
  direction: 'OUTGOING', domain: 'SUPRIMENTOS', status: 'Ativo',
  start_date: '2026-10-01', end_date: '2027-03-31', original_value: 3000, current_value: 3000,
  payment_method: 'Boleto Bancário', payment_term_type: 'Parcelado', payment_installments: 3, is_recurring: false,
  payment_schedule: [
    { date: '2026-10-10', value: 1000 }, { date: '2026-11-10', value: 1000 }, { date: '2026-12-10', value: 1000 },
  ],
};

let parcelas: ParcelaDoContrato[] = [1, 2, 3].map(n => ({
  id: `t${n}`, source_system: 'CONTRACT_PARCELADO', reference_id: `${contrato.id}:p${n}`,
  transaction_date: `2026-${String(9 + n).padStart(2, '0')}-10`, amount: 1000, direction: 'DEBIT',
  description: `Contrato: Empreitada de pintura - Parcela ${n}/3`, category: 'Serviços',
  status: n === 1 ? 'CONCILIATED' : 'PENDING', business_status: n === 1 ? 'PAGO' : 'PREVISTO',
}));

const vazio = async () => [];
const nulo = async () => null;
const cs = contractService as any;
cs.getContractById = async () => contrato;
cs.listFinancialEntries = async () => parcelas.map(p => ({ ...p }));
cs.updateFinancialEntry = async (id: string, patch: { due_date?: string }) => {
  (window as any).__gravacoes = [...((window as any).__gravacoes ?? []), { id, patch }];
  parcelas = parcelas.map(p => p.id !== id || !patch.due_date ? p : {
    ...p, transaction_date: patch.due_date, vencimento_manual: true,
    vencimento_manual_anterior: p.vencimento_manual ? p.vencimento_manual_anterior : p.transaction_date,
    vencimento_manual_em: new Date().toISOString(), vencimento_manual_por_nome: 'Fulana de Tal',
  });
};
for (const m of ['listContractItems', 'listAddendums', 'listMeasurements', 'listUtilityBills', 'listRetentionReleases',
  'listPrecedentConditions', 'listDocumentRequirements']) cs[m] = vazio;
cs.getRetentionLedger = nulo;
for (const svc of [contractGuaranteeService, contractPenaltyService, contractAcceptanceService,
  contractTechnicalResponsibilityService, contractEvaluationService] as any[]) svc.list = vazio;
(contractRiskService as any).get = nulo;
(contractLaborQuestionnaireService as any).get = nulo;
(contractSupplyMatrixService as any).listItems = vazio;
(contractSupplyMatrixService as any).listInterfaces = vazio;

function Harness() {
  return (
    <div style={{ padding: 24 }}>
      <ContractDetailView contractId={contrato.id} onBack={() => {}} budget={[]} organizationId={contrato.organization_id} />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
