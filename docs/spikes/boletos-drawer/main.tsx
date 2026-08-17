/**
 * Harness: prova visual de que o campo Plano de Contas (novo em
 * BoletoFormModal.tsx) e o Centro de Custo (que passou a usar
 * panelVariant="drawer") abrem o mesmo painel lateral (Sheet) usado em
 * DealModal.tsx (Locações > Gerenciar Negociação > Forma de Pagamento).
 *
 * O componente sob teste é o `HierarchicalSelect` de produção, sem mock —
 * só os itens (Centro de Custo / Plano de Contas) são fabricados, com os
 * MESMOS nomes de props usados em components/BoletoFormModal.tsx.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import HierarchicalSelect from '../../../components/HierarchicalSelect';

const costCenters = [
  { id: 'cc1', code: '01', name: 'Administrativo' },
  { id: 'cc2', code: '02', name: 'Obra Alpha' },
  { id: 'cc3', code: '02.01', name: 'Obra Alpha > Fundação' },
  { id: 'cc4', code: '03', name: 'Obra Beta' },
];

const planoContas = [
  { id: 'pc1', code: '3.1', name: 'Materiais de Construção' },
  { id: 'pc2', code: '3.2', name: 'Mão de Obra' },
  { id: 'pc3', code: '3.3', name: 'Serviços de Terceiros' },
  { id: 'pc4', code: '4.1', name: 'Despesas Administrativas' },
];

function Harness() {
  const [costCenterId, setCostCenterId] = React.useState('');
  const [planoDeContasId, setPlanoDeContasId] = React.useState('');

  return (
    <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-100">
      <div data-field="centro-custo">
        <label className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-widest text-gray-500 mb-1">
          Centro de Custo
        </label>
        <HierarchicalSelect
          items={costCenters}
          value={costCenterId}
          onChange={setCostCenterId}
          valueField="id"
          placeholder="—"
          hoverCls="hover:bg-blue-50"
          panelVariant="drawer"
          drawerTitle="Selecionar Centro de Custo"
        />
      </div>

      <div data-field="plano-contas">
        <label className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-widest text-gray-500 mb-1">
          Plano de Contas
        </label>
        <HierarchicalSelect
          items={planoContas}
          value={planoDeContasId}
          onChange={setPlanoDeContasId}
          valueField="id"
          placeholder="—"
          hoverCls="hover:bg-blue-50"
          panelVariant="drawer"
          drawerTitle="Selecionar Plano de Contas"
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
