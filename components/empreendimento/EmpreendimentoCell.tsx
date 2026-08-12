// components/empreendimento/EmpreendimentoCell.tsx
//
// Célula "Empreendimento" das tabelas do Comercial e de Suprimentos. O vínculo
// nunca é uma FK na tabela da tela — é derivado em runtime, pela obra
// (`empreendimentoService.mapObrasToEmpreendimentos`) ou pelo imóvel
// (`empreendimentoService.mapPropertiesToEmpreendimentos`). Aqui só mora a
// apresentação, para as 6 telas não divergirem.
//
// Tipografia: §7 (texto padrão `text-sm font-normal text-gray-700`; subtexto da
// torre atenuado). Vazio é `—` em itálico, mesmo padrão de ProjectList.tsx.
import React from 'react';

export interface EmpreendimentoCellValue {
  id: string;
  name: string;
  /** Multi-torre: a obra/imóvel é de uma torre específica, não do empreendimento inteiro. */
  towerName?: string;
}

export const EmpreendimentoCell: React.FC<{ value?: EmpreendimentoCellValue | null }> = ({ value }) => {
  if (!value) return <span className="text-sm font-normal text-gray-400 italic">—</span>;
  return (
    <div className="min-w-0">
      <p className="text-sm font-normal text-gray-700 truncate">{value.name}</p>
      {value.towerName && (
        <p className="text-sm font-normal text-gray-400 truncate">{value.towerName}</p>
      )}
    </div>
  );
};

/**
 * Empreendimento de um pedido de compra (Pedidos e Recebimento usam o mesmo
 * `orderService.listOrders`).
 *
 * O mapa é indexado por id de OBRA, mas um pedido pode estar lançado num projeto
 * `classification='ORCAMENTO'` — cuja obra-pai mora em `settings.linkedProjectId`.
 * Sem resolver isso primeiro, todo pedido de orçamento mostraria "—" mesmo tendo
 * empreendimento.
 */
export function resolveOrderEmpreendimento(
  order: { projectId?: string; linkedProjectId?: string; projectClassification?: string },
  empreendimentoByProject: Record<string, EmpreendimentoCellValue>,
): EmpreendimentoCellValue | undefined {
  const obraId = order.projectClassification === 'ORCAMENTO'
    ? (order.linkedProjectId || order.projectId)
    : order.projectId;
  return obraId ? empreendimentoByProject[obraId] : undefined;
}

export default EmpreendimentoCell;
