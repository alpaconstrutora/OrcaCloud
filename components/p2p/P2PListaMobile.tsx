import React from 'react';
import { ArrowDown } from 'lucide-react';
import type { P2PEdge, P2PStage } from '../../services/p2pFlowService';
import { P2PNodeCard } from './P2PNodeCard';
import { SEAM_CFG } from './p2pSeam';

/**
 * Abaixo de `lg` o canvas com pan/zoom não cabe: o fluxo vira uma lista
 * vertical na ordem das etapas, com a transição de entrada de cada uma como
 * uma linha de texto entre os cartões.
 */
export function P2PListaMobile({ stages, edges, onOpenNode, onNavigate, icones }: {
  stages: P2PStage[];
  edges: P2PEdge[];
  onOpenNode: (id: string) => void;
  onNavigate: (view: string) => void;
  icones?: Record<string, React.ElementType>;
}) {
  return (
    <div className="space-y-2">
      {stages.map(stage => {
        const entrada = edges.find(e => e.to === stage.id);
        const cfg = entrada ? SEAM_CFG[entrada.seam] : null;
        return (
          <React.Fragment key={stage.id}>
            {entrada && cfg && (
              <div className="flex items-start gap-2 px-2 py-1 text-xs">
                <ArrowDown className={`w-4 h-4 shrink-0 ${cfg.text}`} />
                <span className="min-w-0">
                  <span className={`font-normal ${cfg.text}`}>{cfg.label}</span>
                  {entrada.note && <span className="text-gray-500"> — {entrada.note}</span>}
                </span>
              </div>
            )}
            <P2PNodeCard stage={stage} selected={false} onOpen={() => onOpenNode(stage.id)} onNavigate={onNavigate} icones={icones} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
