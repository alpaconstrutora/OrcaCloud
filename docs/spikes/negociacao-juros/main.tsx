/**
 * Harness: DealModal DE PRODUÇÃO aberto na aba Financeiro de uma VENDA já em
 * "Parcelado", para ver o "Montar plano" com juros (Price/SAC) — plano
 * docs/planos/2026-11-09-negociacao-parcelamento-com-juros.md, Task 3. Molde:
 * docs/spikes/negociacao-parcelado. A rede é stubada pelo roteiro Playwright
 * (c:/tmp/pwtest/negociacao-juros/passeio.js), que também responde
 * `sales_plans` com um plano ativo de 1% a.m. — o juros chega pré-preenchido.
 *
 * Venda de R$ 120.000,00, Data Efetiva 10/11/2026, 1º vencimento 10/12/2026.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import DealModal from '../../../components/DealModal';
import { ConfirmProvider } from '../../../components/ui/confirm';

const ORG = '00000000-0000-0000-0000-000000000000';

function Harness() {
  return (
    <div style={{ height: '100vh', position: 'relative' }}>
      <DealModal
        isOpen
        onClose={() => {}}
        defaultType="SALE"
        organizationId={ORG}
        initialTab="pagamento"
        // Empreendimento da unidade: é por ele que o Plano de vendas é lido.
        buildingId="bld-0000-0000-0000-000000000001"
        initialData={{
          type: 'SALE',
          organization_id: ORG,
          date: '2026-11-10',
          payment_due_date: '2026-12-10',
          value: 120000,
          contract_total_value: 120000,
          payment_method: 'INSTALLMENTS',
          status: 'PROPOSTA',
        } as any}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
