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
        } as any}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
