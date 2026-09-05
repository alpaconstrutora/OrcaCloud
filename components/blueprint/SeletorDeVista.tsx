/**
 * Seletor de vista do editor de Planta Inteligente — planta baixa, as quatro
 * elevações e o 3D.
 *
 * Popover, e não segmented control: seis botões lado a lado ocupavam a barra
 * inteira e, com o `MenuExibir` e o "Enquadrar" ao lado, ela quebrava linha. A
 * mecânica é a mesma do `MenuExibir` (mousedown fora + Esc fecham, `role="menu"`,
 * popover e não modal — `UI_PATTERNS.md`). O botão fechado mostra a vista atual,
 * então o estado nunca some.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Ruler,
  Scissors,
} from 'lucide-react';
import type { DirecaoElevacao } from '../../utils/blueprintElevation';

export type VistaBlueprint =
  | 'planta'
  | 'frente'
  | 'fundos'
  | 'lateral-esq'
  | 'lateral-dir'
  | '3d'
  /**
   * Um CORTE, pelo id da linha que o define.
   *
   * As outras seis vistas são fixas; os cortes são quantos o usuário desenhar,
   * então a vista carrega o id em vez de um nome no union. O prefixo é o que
   * permite distinguir sem uma segunda variável de estado — e é o que faz a
   * vista persistida em `localStorage` sobreviver a um recarregamento.
   */
  | `corte:${string}`;

/** O id do corte, quando a vista é um. `null` para as seis fixas. */
export function corteDaVista(v: VistaBlueprint): string | null {
  return v.startsWith('corte:') ? v.slice('corte:'.length) : null;
}

/** A elevação só existe para as quatro vistas de fachada. */
export const DIRECAO_DA_VISTA: Partial<Record<VistaBlueprint, DirecaoElevacao>> = {
  frente: 'FRENTE',
  fundos: 'FUNDOS',
  'lateral-esq': 'LATERAL_ESQUERDA',
  'lateral-dir': 'LATERAL_DIREITA',
};

export const ehVistaDeElevacao = (v: VistaBlueprint): boolean => v in DIRECAO_DA_VISTA;

/** Elevação OU corte — as vistas que o `ElevationCanvas` desenha. */
export const ehVistaDeProjecao = (v: VistaBlueprint): boolean =>
  ehVistaDeElevacao(v) || corteDaVista(v) !== null;

const ITENS: {
  id: VistaBlueprint;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
}[] = [
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
  cortes = [],
}: {
  vista: VistaBlueprint;
  onEscolher: (v: VistaBlueprint) => void;
  /** Os cortes desenhados, na ordem do modelo. Vazio = a lista fica só com as seis. */
  cortes?: { id: string; rotulo: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  // Os cortes entram DEPOIS das seis fixas: eles nascem e somem com o desenho,
  // e uma lista que reordena a cada corte novo faria o olho reprocurar as
  // vistas de sempre.
  const itens = [
    ...ITENS,
    ...cortes.map((c) => ({
      id: `corte:${c.id}` as VistaBlueprint,
      rotulo: `Corte ${c.rotulo}`,
      icone: Scissors,
    })),
  ];

  const atual = itens.find((i) => i.id === vista) ?? ITENS[0];
  const IconeAtual = atual.icone;

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Trocar de vista"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          aberto
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <IconeAtual className="h-3.5 w-3.5" />
        {atual.rotulo}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Vista da planta"
          className="absolute left-0 top-full z-30 mt-1 w-48 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {itens.map(({ id, rotulo, icone: Icone }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={vista === id}
              onClick={() => {
                setAberto(false);
                onEscolher(id);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                vista === id
                  ? 'font-medium text-blue-700 hover:bg-blue-50'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {/* Largura reservada para o check: sem ela a lista dança a cada troca. */}
              <span className="w-3.5 shrink-0">
                {vista === id ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <Icone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{rotulo}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
