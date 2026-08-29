/**
 * Seletor de vista do editor de Planta Inteligente — planta baixa, as quatro
 * elevações e o 3D.
 *
 * Segmented control no vocabulário canônico do §19.1 do `docs/ui_ux_guia_unificado.md`:
 * trilho `bg-gray-50`, item ativo `bg-white text-blue-600 shadow-sm`, inativo
 * `text-gray-700 hover:text-gray-900`, `flex-wrap` (nunca `overflow-x-auto`),
 * itens `h-7`. É sub-fluxo da MESMA tela, não navegação de módulo.
 */

import React from 'react';
import { Box, PanelBottom, PanelLeft, PanelRight, PanelTop, Ruler } from 'lucide-react';
import type { DirecaoElevacao } from '../../utils/blueprintElevation';

export type VistaBlueprint =
  | 'planta'
  | 'frente'
  | 'fundos'
  | 'lateral-esq'
  | 'lateral-dir'
  | '3d';

/** A elevação só existe para as quatro vistas de fachada. */
export const DIRECAO_DA_VISTA: Partial<Record<VistaBlueprint, DirecaoElevacao>> = {
  frente: 'FRENTE',
  fundos: 'FUNDOS',
  'lateral-esq': 'LATERAL_ESQUERDA',
  'lateral-dir': 'LATERAL_DIREITA',
};

export const ehVistaDeElevacao = (v: VistaBlueprint): boolean => v in DIRECAO_DA_VISTA;

const ITENS: { id: VistaBlueprint; rotulo: string; icone: React.ComponentType<{ className?: string }> }[] = [
  { id: 'planta', rotulo: 'Planta', icone: Ruler },
  { id: 'frente', rotulo: 'Frente', icone: PanelTop },
  { id: 'fundos', rotulo: 'Fundos', icone: PanelBottom },
  { id: 'lateral-esq', rotulo: 'Lat. esquerda', icone: PanelLeft },
  { id: 'lateral-dir', rotulo: 'Lat. direita', icone: PanelRight },
  { id: '3d', rotulo: '3D', icone: Box },
];

export default function SeletorDeVista({
  vista,
  onEscolher,
}: {
  vista: VistaBlueprint;
  onEscolher: (v: VistaBlueprint) => void;
}) {
  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-1 rounded-[10px] border border-gray-100 bg-gray-50 p-1"
      role="tablist"
      aria-label="Vista da planta"
    >
      {ITENS.map(({ id, rotulo, icone: Icone }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={vista === id}
          onClick={() => onEscolher(id)}
          className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-sm font-medium transition-all ${
            vista === id
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-700 hover:text-gray-900'
          }`}
        >
          <Icone className="h-3.5 w-3.5" />
          {rotulo}
        </button>
      ))}
    </div>
  );
}
