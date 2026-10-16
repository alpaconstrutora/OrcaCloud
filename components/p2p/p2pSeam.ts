import { CheckCircle2, AlertTriangle, XCircle, Workflow } from 'lucide-react';
import type { SeamStatus } from '../../services/p2pFlowService';

/**
 * Vocabulário visual das costuras do fluxo P2P — uma fonte para o canvas
 * (linha SVG + rótulo), o cartão do nó, os KPIs e os drawers. `text` é a cor
 * do texto (§8: costura é texto colorido, nunca pílula); `stroke` é a mesma
 * família em hex para a linha e a ponta da seta do SVG.
 */
export const SEAM_CFG: Record<SeamStatus, {
  label: string;
  text: string;
  stroke: string;
  border: string;
  icon: typeof CheckCircle2;
}> = {
  auto:        { label: 'Automática',  text: 'text-emerald-600', stroke: '#10b981', border: 'border-emerald-200', icon: CheckCircle2 },
  orquestrada: { label: 'Orquestrada', text: 'text-indigo-600',  stroke: '#6366f1', border: 'border-indigo-200',  icon: Workflow },
  manual:      { label: 'Semi-manual', text: 'text-amber-600',   stroke: '#f59e0b', border: 'border-amber-200',   icon: AlertTriangle },
  gap:         { label: 'Lacuna',      text: 'text-red-600',     stroke: '#ef4444', border: 'border-red-200',     icon: XCircle },
};

/** Costuras que pedem atenção. `orquestrada` é conduzida por processo, não é pendência. */
export const SEAM_ATENCAO: SeamStatus[] = ['manual', 'gap'];
