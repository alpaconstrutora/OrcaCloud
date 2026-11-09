/**
 * Harness: ContractDetailView DE PRODUÇÃO, aba Resumo › "Aplicar reajuste", num
 * contrato PARCELADO. O `supabase.from` é trocado NO NAVEGADOR por tabelas em
 * memória — o clique roda o `applyReajuste` e o `syncParceladoScheduleToFinance`
 * REAIS; só o banco é falso. `window.__banco` mostra o que foi gravado.
 * Parcela 1 paga, 2 e 3 em aberto (vencem depois de hoje).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ContractDetailView from '../../../components/ContractDetailView';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { supabase } from '../../../lib/supabase';
import { contractService } from '../../../services/contractService';
import { contractIndexService } from '../../../services/contractIndexService';
import { contractGuaranteeService } from '../../../services/contractGuaranteeService';
import { contractPenaltyService } from '../../../services/contractPenaltyService';
import { contractRiskService } from '../../../services/contractRiskService';
import { contractLaborQuestionnaireService } from '../../../services/contractLaborQuestionnaireService';
import { contractAcceptanceService } from '../../../services/contractAcceptanceService';
import { contractTechnicalResponsibilityService } from '../../../services/contractTechnicalResponsibilityService';
import { contractEvaluationService } from '../../../services/contractEvaluationService';
import { contractSupplyMatrixService } from '../../../services/contractSupplyMatrixService';

const ID = 'c0000000-0000-0000-0000-000000000001';
const ORG = '00000000-0000-0000-0000-000000000000';
const mes = (n: number) => { const d = new Date(); d.setDate(10); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

const banco: Record<string, any[]> = {
  contracts: [{
    id: ID, organization_id: ORG, number: 'CT-000888', title: 'Empreitada de estrutura', contract_type: 'Empreitada',
    nature: 'Serviço', direction: 'OUTGOING', domain: 'SUPRIMENTOS', status: 'Ativo',
    start_date: mes(-1), end_date: mes(6), original_value: 3000, current_value: 3000,
    reajuste_index: 'INCC-M', reajuste_data_base: mes(-1),
    payment_method: 'Boleto Bancário', payment_term_type: 'Parcelado', payment_installments: 3, is_recurring: false,
    payment_schedule: [{ date: mes(-1), value: 1000 }, { date: mes(1), value: 1000 }, { date: mes(2), value: 1000 }],
  }],
  internal_transactions: [1, 2, 3].map(n => ({
    id: `t${n}`, organization_id: ORG, source_system: 'CONTRACT_PARCELADO', reference_id: `${ID}:p${n}`,
    entry_type: null, transaction_date: [mes(-1), mes(1), mes(2)][n - 1], due_date: [mes(-1), mes(1), mes(2)][n - 1],
    amount: 1000, direction: 'DEBIT', description: `Contrato: Empreitada de estrutura - Parcela ${n}/3`,
    category: 'Serviços', status: n === 1 ? 'CONCILIATED' : 'PENDING', business_status: n === 1 ? 'PAGO' : 'PREVISTO',
  })),
};
(window as any).__banco = banco;

/** Query builder mínimo: eq/like(prefixo)/in filtram; o resto é aceito e ignorado. */
function tabela(nome: string) {
  const filtros: Array<(r: any) => boolean> = [];
  let op = 'select'; let payload: any = null;
  const linhas = () => (banco[nome] ??= []).filter(r => filtros.every(f => f(r)));
  const executar = () => {
    if (op === 'update') { linhas().forEach(r => Object.assign(r, payload)); return linhas(); }
    if (op === 'delete') { const fora = new Set(linhas()); banco[nome] = banco[nome].filter(r => !fora.has(r)); return null; }
    if (op === 'upsert') {
      for (const p of [].concat(payload)) {
        const i = banco[nome].findIndex(r => r.reference_id === (p as any).reference_id);
        if (i >= 0) Object.assign(banco[nome][i], p); else banco[nome].push({ id: crypto.randomUUID(), ...(p as any) });
      }
      return null;
    }
    if (op === 'insert') { banco[nome].push(...[].concat(payload)); return null; }
    return linhas();
  };
  const b: any = {
    select: () => b,
    update: (p: any) => { op = 'update'; payload = p; return b; },
    upsert: (p: any) => { op = 'upsert'; payload = p; return b; },
    insert: (p: any) => { op = 'insert'; payload = p; return b; },
    delete: () => { op = 'delete'; return b; },
    eq: (c: string, v: any) => { filtros.push(r => r[c] === v); return b; },
    in: (c: string, v: any[]) => { filtros.push(r => v.includes(r[c])); return b; },
    like: (c: string, v: string) => { filtros.push(r => String(r[c] ?? '').startsWith(v.replace(/%$/, ''))); return b; },
    neq: () => b, not: () => b, or: () => b, is: () => b, gte: () => b, lte: () => b, order: () => b, limit: () => b, filter: () => b,
    single: async () => { const d = executar(); return { data: Array.isArray(d) ? d[0] ?? null : d, error: null }; },
    maybeSingle: async () => { const d = executar(); return { data: Array.isArray(d) ? d[0] ?? null : d, error: null }; },
    then: (ok: (v: unknown) => void) => ok({ data: executar() ?? [], error: null }),
  };
  return b;
}
(supabase as any).from = (nome: string) => tabela(nome);

const cs = contractService as any;
cs.getContractById = async () => ({ ...banco.contracts[0] });
cs.listFinancialEntries = async () => banco.internal_transactions
  .filter(t => String(t.reference_id).startsWith(ID)).map(t => ({ ...t }));
(contractIndexService as any).getClosestTo = async (_i: string, data: string) => (data.slice(0, 7) < new Date().toISOString().slice(0, 7)
  ? { id: 'i-base', value: 1000, reference_month: mes(-1).slice(0, 8) + '01' }
  : { id: 'i-atual', value: 1050, reference_month: mes(0).slice(0, 8) + '01' });

const vazio = async () => [];
const nulo = async () => null;
for (const m of ['listContractItems', 'listAddendums', 'listMeasurements', 'listUtilityBills', 'listRetentionReleases',
  'listPrecedentConditions', 'listDocumentRequirements']) cs[m] = vazio;
cs.getRetentionLedger = nulo;
for (const svc of [contractGuaranteeService, contractPenaltyService, contractAcceptanceService,
  contractTechnicalResponsibilityService, contractEvaluationService] as any[]) svc.list = vazio;
(contractRiskService as any).get = nulo;
(contractLaborQuestionnaireService as any).get = nulo;
(contractSupplyMatrixService as any).listItems = vazio;
(contractSupplyMatrixService as any).listInterfaces = vazio;

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <div style={{ padding: 24 }}>
      <ContractDetailView contractId={ID} onBack={() => {}} budget={[]} organizationId={ORG} />
    </div>
  </ConfirmProvider>,
);
