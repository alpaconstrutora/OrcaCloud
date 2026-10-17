import React from 'react';
import { Plus } from 'lucide-react';
import type { P2PEdge, P2PTemplateAtivo } from '../../services/p2pFlowService';
import type { Ponto } from '../../utils/p2pLayout';
import { SEAM_CFG } from './p2pSeam';

/**
 * Rótulo de uma aresta: HTML absoluto sobre o `meio` da linha
 * (`caminhoOrtogonal` escolhe o trecho onde ele cabe sem tocar em cartão) —
 * não `<text>` SVG, assim é botão acessível e não borra no `scale`.
 *
 * Chip `rounded-[6px]`, sem caixa alta e sem `rounded-full`: não é status de
 * registro (§8) nem rótulo de posição no desenho (§8.1) — é a legenda da
 * transição, com o texto na cor da costura. Quando a transição é orquestrada,
 * o chip mostra o(s) modelo(s) e clicar abre a edição; quando aceita evento e
 * ninguém escuta, ganha o "+ Gatilho".
 */
export function P2PEdgeLabel({ edge, meio, selecionada, modoEscolher, onSelect, onEscolher, onNovoGatilho, onEditarTemplate }: {
  edge: P2PEdge;
  meio: Ponto;
  selecionada: boolean;
  modoEscolher: boolean;
  onSelect: (edge: P2PEdge) => void;
  onEscolher: (edge: P2PEdge) => void;
  onNovoGatilho: (edge: P2PEdge) => void;
  onEditarTemplate: (tpl: P2PTemplateAtivo, edge: P2PEdge) => void;
}) {
  const cfg = SEAM_CFG[edge.seam];
  const templates = edge.templates ?? [];
  const orgs = new Set(templates.map(t => t.organizationId));
  // O chip tem de caber no vão entre dois cartões (COL_GAP): situação + contagem.
  // Os nomes dos modelos vão no `title` e no painel de detalhes.
  const texto = templates.length > 0 ? `${cfg.label} · ${templates.length}` : cfg.label;
  const titulo = templates.length > 0
    ? [...new Set(templates.map(t => t.name))].join(', ') + (orgs.size > 1 ? ` · ${orgs.size} organizações` : '')
    : edge.note;
  const elegivel = modoEscolher && !!edge.eventKeys;

  return (
    <div
      data-no-pan
      data-edge-label={edge.id}
      className="absolute flex items-center gap-1"
      style={{ left: meio.x, top: meio.y, transform: 'translate(-50%, -50%)' }}
    >
      <button
        type="button"
        title={titulo}
        onClick={() => {
          if (elegivel) return onEscolher(edge);
          if (templates.length === 1) return onEditarTemplate(templates[0], edge);
          onSelect(edge);
        }}
        className={`h-6 max-w-[112px] px-2 rounded-[6px] border bg-white text-[11px] font-medium truncate shadow-sm transition-colors
          ${elegivel ? 'border-blue-400 text-blue-700 hover:bg-blue-50' : selecionada ? `border-blue-300 ${cfg.text}` : `border-gray-200 ${cfg.text} hover:border-gray-300`}`}
      >
        {elegivel ? 'Escolher esta transição' : texto}
      </button>
      {!modoEscolher && edge.eventKeys && templates.length === 0 && (
        <button
          type="button"
          title="Novo gatilho nesta transição"
          aria-label="Novo gatilho nesta transição"
          onClick={() => onNovoGatilho(edge)}
          className="h-6 w-6 flex items-center justify-center rounded-[6px] border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:border-blue-200 shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
