import React from 'react';
import {
  FileText, GitMerge, Receipt, ShieldCheck, Send, FileInput, HandCoins, BellRing, Landmark, CheckCircle2, BookOpen,
} from 'lucide-react';
import { financeiroFlowService } from '../services/financeiroFlowService';
import { CELULAS_FINANCEIRO } from '../utils/p2pLayout';
import { ProcessFlowBoard, type FlowBoardConfig } from './fluxo/ProcessFlowBoard';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

const ICONES_FIN: Record<string, React.ElementType> = {
  boletos:         FileText,
  origens_pagar:   GitMerge,
  a_pagar:         Receipt,
  aprovacao:       ShieldCheck,
  pagamento:       Send,
  origens_receber: FileInput,
  a_receber:       HandCoins,
  cobranca:        BellRing,
  extrato:         Landmark,
  baixado:         CheckCircle2,
  fechamento:      BookOpen,
};

const FIN_CONFIG: FlowBoardConfig = {
  titulo: 'Torre de Controle — Fluxo Financeiro',
  subtitulo: 'A pagar e a receber → Tesouraria → Controladoria. Clique numa etapa para ver os registros; numa transição, para ver quem a conduz.',
  service: financeiroFlowService,
  celulas: CELULAS_FINANCEIRO,
  icones: ICONES_FIN,
  chavePainel: 'fin-fluxo:painel',
  chaveTabela: 'fin-fluxo:metricas:etapas',
};

/**
 * Torre de Controle — Fluxo Financeiro (Financeiro › Análise). Mesma página
 * da Torre P2P (`ProcessFlowBoard`, §31 do guia); o que é do Financeiro mora
 * em `financeiroFlowService`. Plano: docs/planos/2026-10-16-torre-fluxo-financeiro.md.
 */
export const FinanceiroFlowBoard: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => (
  <ProcessFlowBoard config={FIN_CONFIG} activeOrganizationId={activeOrganizationId} onChangeView={onChangeView} />
);

export default FinanceiroFlowBoard;
