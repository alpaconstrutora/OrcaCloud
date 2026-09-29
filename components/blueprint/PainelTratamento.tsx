/**
 * TRATAMENTO INDIVIDUAL na gaveta de esgoto (29/09/2026, E7 do roadmap
 * hidrossanitário, NBR 7229/13969): onde não há rede pública — o tanque
 * séptico, o filtro anaeróbio (opcional) e o sumidouro em fila a partir da
 * caixa de inspeção; e o botão que lança.
 */
import React from 'react';
import { FICHA_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import type { HipotesesDeTratamento, PlanoDeTratamento } from '../../utils/blueprintTratamento';

interface Props {
  plano: PlanoDeTratamento;
  hip: HipotesesDeTratamento;
  onHip: (h: HipotesesDeTratamento) => void;
  onLancar: () => void;
}

const m = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PainelTratamento({ plano, hip, onHip, onLancar }: Props) {
  const podeLancar = plano.comandos.length > 0;
  return (
    <div className="space-y-2" data-testid="tratamento">
      <p className="text-xs font-semibold text-slate-700">Tratamento individual (sem rede pública)</p>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={hip.comFiltro} onChange={(e) => onHip({ ...hip, comFiltro: e.target.checked })} aria-label="Com filtro anaeróbio entre o tanque e o sumidouro" />
        Com filtro anaeróbio entre o tanque e o sumidouro (NBR 13969)
      </label>
      {plano.motivo ? (
        <p className="text-xs text-slate-500" data-testid="tratamento-motivo">{plano.motivo}</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-slate-600" data-testid="tratamento-unidades">
          {plano.unidades.map((u) => (
            <li key={u.tipo}>
              <span className="font-medium text-slate-700">{FICHA_DO_PONTO_HIDRAULICO[u.tipo].rotulo}</span>{' '}
              <span className="tabular-nums">
                {u.tipo === 'TANQUE_SEPTICO' ? `${m(u.medidas.comprimentoMm)} × ${m(u.medidas.larguraMm)} m` : `ø ${m(u.medidas.larguraMm)} m`}, altura {m(u.medidas.alturaMm)} m · tubo a {m(u.cotaMm)} m
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onLancar}
        disabled={!podeLancar}
        title={podeLancar ? undefined : (plano.motivo ?? 'Nada a lançar')}
        className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="tratamento-lancar"
      >
        {plano.apagados > 0 ? 'Relançar tratamento' : 'Lançar tratamento'}
      </button>
    </div>
  );
}
