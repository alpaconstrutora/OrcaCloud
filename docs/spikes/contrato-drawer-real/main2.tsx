/**
 * Verifica a correção do bug "não carrega Centro de Custo": monta o
 * ContractModal real com organizationId=undefined (equivalente ao topo em
 * "Todas as Organizações"), semeia uma organização fake na store, e o teste
 * (passeio2.mjs) escolhe essa organização no seletor INTERNO do modal — antes
 * da correção, loadDependencies() nunca reexecutava nesse fluxo porque o
 * efeito só dependia de organizationIdProp (que continua undefined; quem muda
 * é pickedOrgId, estado local).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ContractModal } from '../../../components/ContractModal';
import { useStore } from '../../../store/useStore';

useStore.setState({
  organizations: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Organização Teste' } as any],
});

function Harness() {
  const [isOpen] = React.useState(true);
  return (
    <ContractModal
      isOpen={isOpen}
      onClose={() => {}}
      onSubmit={async () => {}}
      projectId=""
      organizationId={undefined}
      domain="SUPRIMENTOS"
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
