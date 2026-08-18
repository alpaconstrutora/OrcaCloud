/**
 * Harness: monta o ContractModal DE PRODUÇÃO (sem mock do componente, só das
 * chamadas de rede via anon key contra o Supabase real — as listas devem vir
 * vazias sem sessão, o que é aceitável para este teste de interação de UI).
 *
 * Existe porque uma réplica manual do CSS do overlay (docs/spikes/contrato-drawer)
 * NÃO reproduziu o bug relatado ("ao clicar em Centro de Custo/Plano de Contas o
 * drawer fecha") — sinal de que a causa não está só nas classes do container, e
 * só o componente real, no fluxo real do form, pode confirmar.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ContractModal } from '../../../components/ContractModal';

function Harness() {
  const [isOpen, setIsOpen] = React.useState(true);
  const [log, setLog] = React.useState<string[]>([]);

  return (
    <div>
      <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }} data-el="log">
        isOpen={String(isOpen)} · eventos: {log.join(' | ')}
      </div>
      <ContractModal
        isOpen={isOpen}
        onClose={() => { setLog(l => [...l, 'onClose']); setIsOpen(false); }}
        onSubmit={async (data) => { setLog(l => [...l, 'onSubmit']); console.log('submit', data); }}
        projectId=""
        organizationId="00000000-0000-0000-0000-000000000000"
        domain="SUPRIMENTOS"
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
