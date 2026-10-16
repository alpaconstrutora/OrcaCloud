import React from 'react';
import { p2pFlowService } from '../services/p2pFlowService';
import { CELULAS_P2P } from '../utils/p2pLayout';
import { STAGE_ICON } from './p2p/P2PNodeCard';
import { ProcessFlowBoard, type FlowBoardConfig } from './fluxo/ProcessFlowBoard';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

/**
 * Torre de Controle — Fluxo P2P (Suprimentos). A página é o
 * `ProcessFlowBoard` genérico (16/10/2026, quando a Torre do Financeiro
 * nasceu); aqui ficam só os textos, o serviço, o arranjo e os ícones do P2P.
 * As chaves salvas no navegador são as de antes da extração — quem já tinha o
 * painel fechado continua com ele fechado.
 */
const P2P_CONFIG: FlowBoardConfig = {
  titulo: 'Torre de Controle — Fluxo P2P',
  subtitulo: 'Suprimentos → Estoque & Fiscal → Financeiro. Clique numa etapa para ver os registros; numa transição, para ver quem a conduz.',
  service: p2pFlowService,
  celulas: CELULAS_P2P,
  icones: STAGE_ICON,
  chavePainel: 'p2p:painel',
  chaveTabela: 'p2p:metricas:etapas',
};

export const P2PFlowBoard: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => (
  <ProcessFlowBoard config={P2P_CONFIG} activeOrganizationId={activeOrganizationId} onChangeView={onChangeView} />
);

export default P2PFlowBoard;
