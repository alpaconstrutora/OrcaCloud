import React from 'react';
import type { P2PEdge, SeamStatus } from '../../services/p2pFlowService';
import type { Ret } from '../../utils/p2pLayout';
import { caminhoOrtogonal } from '../../utils/p2pLayout';
import { SEAM_CFG } from './p2pSeam';

const SEAMS = Object.keys(SEAM_CFG) as SeamStatus[];
const SETA_W = 12;
const SETA_H = 8;

/**
 * As linhas do fluxo: um `<path>` visível por aresta (2px, cor da costura,
 * ponta de seta por cor — molde do Gantt do Planejamento) e um segundo
 * `<path>` transparente e largo por cima, que é o que recebe o clique. O
 * `<svg>` não captura ponteiro; só os caminhos de clique.
 *
 * No modo "escolher transição" (a biblioteca pediu um gatilho novo), as
 * arestas que aceitam evento ficam tracejadas e pulsam; clicar numa delas é
 * escolher. Os rótulos são HTML (`P2PEdgeLabel`), fora daqui.
 */
export function P2PEdges({ edges, posicoes, tamanho, selecionadaId, modoEscolher, onSelect, onEscolher }: {
  edges: P2PEdge[];
  posicoes: Record<string, Ret>;
  tamanho: { w: number; h: number };
  selecionadaId: string | null;
  modoEscolher: boolean;
  onSelect: (edge: P2PEdge) => void;
  onEscolher: (edge: P2PEdge) => void;
}) {
  return (
    <svg
      className="absolute left-0 top-0 overflow-visible pointer-events-none"
      width={tamanho.w}
      height={tamanho.h}
      aria-hidden="true"
    >
      <defs>
        {SEAMS.map(seam => (
          <marker
            key={seam}
            id={`p2p-seta-${seam}`}
            markerUnits="userSpaceOnUse"
            markerWidth={SETA_W}
            markerHeight={SETA_H}
            refX={SETA_W - 1}
            refY={SETA_H / 2}
            orient="auto"
          >
            <path d={`M 0 0 L ${SETA_W} ${SETA_H / 2} L 0 ${SETA_H} z`} fill={SEAM_CFG[seam].stroke} />
          </marker>
        ))}
      </defs>
      {edges.map(edge => {
        const a = posicoes[edge.from];
        const b = posicoes[edge.to];
        if (!a || !b) return null;
        const { d } = caminhoOrtogonal(a, b);
        const elegivel = modoEscolher && !!edge.eventKeys;
        const selecionada = edge.id === selecionadaId;
        const cor = SEAM_CFG[edge.seam].stroke;
        return (
          <g key={edge.id}>
            <path
              data-edge={edge.id}
              d={d}
              fill="none"
              stroke={cor}
              strokeWidth={selecionada ? 3 : 2}
              strokeDasharray={elegivel ? '6 4' : undefined}
              className={elegivel ? 'animate-pulse' : undefined}
              markerEnd={`url(#p2p-seta-${edge.seam})`}
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: 'stroke', cursor: elegivel ? 'copy' : 'pointer' }}
              onClick={() => (elegivel ? onEscolher(edge) : onSelect(edge))}
            />
          </g>
        );
      })}
    </svg>
  );
}
