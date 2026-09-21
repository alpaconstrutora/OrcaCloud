/**
 * Harness: DealModal DE PRODUÇÃO aberto na aba Financeiro de uma venda, para
 * ver o que aparece ao escolher "Parcelado Direto / Mensalidade". Rede stubada
 * pelo roteiro Playwright (c:/tmp/pwtest/negociacao-parcelado/). Pedido de
 * 2026-09-21: o select não mostrava campo nenhum (nº, entrada, periodicidade).
 *
 * `?tipo=RENTAL` abre uma locação (sem entrada; parcela = valor mensal).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import DealModal from '../../../components/DealModal';
import { ConfirmProvider } from '../../../components/ui/confirm';

const tipo = (new URLSearchParams(location.search).get('tipo') || 'SALE') as 'SALE' | 'RENTAL';
// `?exemplo=1`: plano já montado como o usuário descreveu em 2026-09-21 —
// Parcela 1 entrada 100.000 · Parcelas 2–9 mensais 10.000 · Parcela 10 final 50.000.
const exemplo = new URLSearchParams(location.search).get('exemplo') === '1';
// `?salva=1`: negociação já gravada (id + comprador) — habilita "Gerar contrato e
// parcelas" na aba Parcelas; o roteiro Playwright stuba a criação do contrato.
const salva = new URLSearchParams(location.search).get('salva') === '1';
const mensais = Array.from({ length: 8 }, (_, i) => ({
  id: `ex-m-${i + 1}`, dueDate: `2026-${String(11 + i).padStart(2, '0')}-10`.replace(/2026-(1[3-9])/, (_m, mm) => `2027-${String(Number(mm) - 12).padStart(2, '0')}`),
  value: 10000, status: 'PENDING', installmentType: 'MENSAL', notes: 'Parcelas mensais em cheque',
}));
const ORG = '00000000-0000-0000-0000-000000000000';

function Harness() {
  return (
    <div style={{ height: '100vh', position: 'relative' }}>
      <DealModal
        isOpen
        onClose={() => {}}
        defaultType={tipo}
        organizationId={ORG}
        initialTab="pagamento"
        initialData={{
          type: tipo,
          organization_id: ORG,
          date: '2026-09-21',
          payment_due_date: '2026-10-10',
          value: tipo === 'RENTAL' ? 2500 : 120000,
          contract_total_value: tipo === 'SALE' ? 120000 : undefined,
          payment_method: 'CASH',
          status: 'PROPOSTA',
          ...(salva ? { id: 'deal-0000-0000-0000-000000000001', client_id: 'cli-0000-0000-0000-000000000001', property_id: 'prop-0000-0000-0000-000000000001', status: 'CONTRATO' } : {}),
          ...(exemplo ? {
            contract_total_value: 230000,
            payment_method: 'INSTALLMENTS',
            down_payment: 100000,
            down_payment_installment_type: 'SINAL',
            down_payment_notes: 'Entrada em dinheiro',
            custom_installments: [
              ...mensais,
              { id: 'ex-final', dueDate: '2027-07-10', value: 50000, status: 'PENDING', installmentType: 'CHAVES', notes: 'Nas chaves' },
            ],
          } : {}),
        } as any}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
