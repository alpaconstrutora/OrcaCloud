/**
 * Harness: ContractModal DE PRODUÇÃO embutido (variant="inline") com as mesmas
 * seções que a aba Financeiro do detalhe do contrato usa
 * (ContractDetailView › FINANCEIRO_FORM_SECTIONS). Serve para ver o que aparece
 * ao escolher "Parcelado" — o relato de 21/09/2026 é que não há campos de nº de
 * parcelas, entrada e periodicidade.
 *
 * `?recorrente=1` abre com is_recurring=true (contrato de locação/serviço
 * recorrente); sem o parâmetro, contrato de venda comum.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ContractModal } from '../../../components/ContractModal';
import { ConfirmProvider } from '../../../components/ui/confirm';

const recorrente = new URLSearchParams(location.search).get('recorrente') === '1';
// `?salvo=1`: contrato já gravado com cronograma (entrada + 3 semestrais) — a
// tela tem de reabrir com Entrada/Nº/Periodicidade/1º vencimento preenchidos.
const salvo = new URLSearchParams(location.search).get('salvo') === '1';

const contrato: any = {
  id: '11111111-1111-1111-1111-111111111111',
  organization_id: '00000000-0000-0000-0000-000000000000',
  number: 'CT-000123',
  title: 'Venda da unidade 101',
  contract_type: 'Venda',
  nature: 'Fornecimento',
  direction: 'INCOMING',
  domain: 'VENDAS',
  start_date: '2026-09-21',
  end_date: '2027-09-21',
  status: 'Rascunho',
  original_value: 120000,
  payment_method: 'Boleto Bancário',
  payment_term_type: 'Vista',
  payment_installments: 1,
  is_recurring: recorrente,
  billing_cycle: 'Mensal',
  due_day: 10,
  ...(salvo ? {
    payment_term_type: 'Parcelado',
    payment_installments: 3,
    payment_schedule: [
      { date: '2026-09-30', value: 30000, installment_type: 'SINAL' },
      { date: '2026-11-05', value: 30000, installment_type: 'SEMESTRAL' },
      { date: '2027-05-05', value: 30000, installment_type: 'SEMESTRAL' },
      { date: '2027-11-05', value: 30000, installment_type: 'SEMESTRAL' },
    ],
  } : {}),
};

function Harness() {
  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <ContractModal
        isOpen
        variant="inline"
        sections={['valores', 'pagamento', 'centro_custo']}
        initialData={contrato}
        projectId=""
        organizationId={contrato.organization_id}
        direction={contrato.direction}
        domain="VENDAS"
        onClose={() => {}}
        onToast={(m, t) => console.log('toast', t, m)}
        onSubmit={async (data) => { console.log('submit', JSON.stringify(data)); }}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
