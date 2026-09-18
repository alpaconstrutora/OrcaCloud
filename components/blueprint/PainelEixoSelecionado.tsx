/**
 * O EIXO da malha selecionado (18/09/2026, E1.4): nome da bolha, direção e
 * comprimento, excluir. Molde: `PainelCorteSelecionado` — a mesma família de
 * "linha do projeto inteiro".
 */
import React from 'react';
import type { Eixo } from '../../utils/blueprintKernel';
import { MAX_NOME_DE_EIXO } from '../../utils/blueprintKernel';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  eixo: Eixo | null;
  onProps: (campos: { nome?: string }) => void;
  onExcluir: () => void;
  /** Quantos cruzamentos com outros eixos este eixo tem — o que os pilares automáticos usam. */
  cruzamentos?: number;
}

export default function PainelEixoSelecionado({ eixo, onProps, onExcluir, cruzamentos }: Props) {
  if (!eixo) return null;
  const dx = eixo.b.x - eixo.a.x;
  const dy = eixo.b.y - eixo.a.y;
  const comprimentoM = Math.hypot(dx, dy) / 1000;
  const direcao = dx === 0 ? 'vertical' : dy === 0 ? 'horizontal' : `inclinado ${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}°`;

  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-eixo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">{eixo.nome ? `Eixo ${eixo.nome}` : 'Linha de referência'}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {direcao} · {comprimentoM.toFixed(2).replace('.', ',')} m
            {cruzamentos != null ? ` · ${cruzamentos} cruzamento(s)` : ''}
          </p>
          <IdentificadorDoElemento uid={eixo.uid} familia="eixo" />
        </div>
        <button
          type="button"
          onClick={onExcluir}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          Excluir
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Nome
        <input
          type="text"
          key={`${eixo.id}-nome`}
          defaultValue={eixo.nome}
          maxLength={MAX_NOME_DE_EIXO}
          placeholder="vazio = sem bolha"
          aria-label="Nome do eixo, como na bolha da prancha (vazio = linha de referência)"
          onBlur={(e) => onProps({ nome: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
      </label>
      <p className="mt-1.5 text-[11px] text-slate-400">
        O eixo vale para todos os pavimentos. O ímã puxa para a linha e para os cruzamentos; "Pilares
        automáticos" propõe um pilar em cada cruzamento.
      </p>
    </div>
  );
}
