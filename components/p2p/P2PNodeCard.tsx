import React from 'react';
import {
  Workflow, ClipboardList, FileSearch, ShoppingCart, Truck,
  Warehouse, FileText, DollarSign, Landmark, ChevronRight,
} from 'lucide-react';
import type { P2PStage } from '../../services/p2pFlowService';
import type { Ret } from '../../utils/p2pLayout';
import { SEAM_CFG } from './p2pSeam';

export const STAGE_ICON: Record<string, React.ElementType> = {
  solicitacao: ClipboardList,
  cotacao:     FileSearch,
  pedido:      ShoppingCart,
  recebimento: Truck,
  estoque:     Warehouse,
  fiscal:      FileText,
  financeiro:  DollarSign,
  pagamento:   Landmark,
};

/**
 * Cartão de uma etapa no canvas (§31 do guia). Com `pos` fica absoluto na
 * camada do desenho; sem `pos` é um cartão de fluxo normal (lista do celular).
 *
 * O corpo inteiro é um `button` (o nome acessível inclui o rótulo da etapa):
 * clicar seleciona e abre o drawer de registros. O rodapé é um segundo botão
 * com outra ação — abrir o módulo — por isso fica FORA do primeiro (botão
 * dentro de botão não é HTML válido). `data-no-pan` impede o arraste de fundo
 * de começar aqui (ver `usePanZoom`).
 *
 * `inboundNote` NÃO aparece aqui de propósito: a nota é da transição e mora
 * no rótulo da aresta e no painel de detalhes.
 */
export function P2PNodeCard({ stage, pos, selected, onOpen, onNavigate }: {
  stage: P2PStage;
  pos?: Ret;
  selected: boolean;
  onOpen: () => void;
  onNavigate?: (view: string) => void;
}) {
  const Icon = STAGE_ICON[stage.id] ?? Workflow;
  const seam = SEAM_CFG[stage.inboundSeam];
  const processos = stage.processes;

  return (
    <div
      data-no-pan
      data-node={stage.id}
      className={`bg-white rounded-[10px] border shadow-sm flex flex-col transition-shadow
        ${selected ? 'ring-2 ring-blue-400 border-blue-300' : seam.border}`}
      style={pos ? { position: 'absolute', left: pos.x, top: pos.y, width: pos.w, height: pos.h } : undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-h-0 text-left px-3 pt-2.5 pb-1.5 rounded-t-[10px] hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-[6px] bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold text-gray-800 truncate">{stage.label}</span>
          <span className="ml-auto text-xs text-gray-500 truncate shrink-0 max-w-[40%]" title={stage.owner}>{stage.owner}</span>
        </div>

        <dl className="mt-2 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-gray-500">Registros</dt>
            <dd className="text-sm font-medium text-gray-800">{stage.count}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-gray-500">Pendentes</dt>
            <dd className={`text-sm ${stage.pending ? 'font-medium text-amber-600' : 'text-gray-400'}`}>{stage.pending ?? 0}</dd>
          </div>
          {processos && (
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <dt className="text-gray-500">Processos</dt>
              <dd className={`text-sm ${processos.atrasados > 0 ? 'font-medium text-red-600' : 'text-gray-800'}`}>
                {processos.ativos}
                {processos.atrasados > 0 && <span className="text-xs"> · {processos.atrasados} atrasado{processos.atrasados === 1 ? '' : 's'}</span>}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-gray-500">Entrada</dt>
            <dd className={`text-sm font-normal ${seam.text}`}>{seam.label}</dd>
          </div>
        </dl>
      </button>

      {stage.view && onNavigate && (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            onClick={() => onNavigate(stage.view!)}
            className="w-full h-8 flex items-center justify-center gap-1 rounded-[6px] border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Ver no módulo <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
