/**
 * INCÊNDIO — sinalização de emergência (01/10/2026, E7.2 do roadmap de
 * incêndio): equipamentos sem placa, placas sem equipamento ou sem código, os
 * pontos da rota de fuga que pedem placa (mudança de direção e saída), e a
 * proposta que lança tudo num lote. Tudo derivado (`blueprintSinalizacao`).
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { AnaliseDeSinalizacao } from '../../utils/blueprintSinalizacao';

interface Props {
  analise: AnaliseDeSinalizacao;
  onSelecionar: (ids: ObjectId[]) => void;
  proposta: { quantas: number; onPropor: () => void };
}

function Linha({ rotulo, ids, onSelecionar }: { rotulo: string; ids: ObjectId[]; onSelecionar: (ids: ObjectId[]) => void }) {
  if (!ids.length) return null;
  return (
    <li>
      <button type="button" className="text-left text-red-700 hover:underline" onClick={() => onSelecionar(ids)}>
        {ids.length} {rotulo}
      </button>
    </li>
  );
}

export default function PainelSinalizacaoIncendio({ analise: a, onSelecionar, proposta }: Props) {
  const rota = a.pontosDaRota;
  const faltamNaRota = rota.filter((p) => !p.coberto);
  const tudoCerto = !a.equipamentosSemPlaca.length && !a.placasOrfas.length && !a.placasSemCodigo.length && !faltamNaRota.length;
  return (
    <div className="space-y-2" data-testid="sinalizacao-incendio">
      <div>
        <h4 className="text-xs font-semibold text-slate-700">Sinalização</h4>
        <p className="text-[11px] text-slate-500">Placa de cada equipamento e da rota de fuga (mudanças de direção e saída) — {a.fonte}.</p>
      </div>
      {tudoCerto ? (
        <p className="text-xs text-emerald-700" data-testid="sinalizacao-ok">
          Equipamentos sinalizados e {rota.length} ponto(s) da rota com placa.
        </p>
      ) : (
        <ul className="space-y-1 text-xs" data-testid="sinalizacao-falta">
          <Linha rotulo="equipamento(s) sem placa" ids={a.equipamentosSemPlaca} onSelecionar={onSelecionar} />
          <Linha rotulo="placa(s) sem equipamento (ele foi apagado)" ids={a.placasOrfas} onSelecionar={onSelecionar} />
          <Linha rotulo="placa(s) sem código" ids={a.placasSemCodigo} onSelecionar={onSelecionar} />
          {faltamNaRota.length > 0 && (
            <li className="text-red-700">
              {faltamNaRota.length} de {rota.length} ponto(s) da rota sem placa ({faltamNaRota.filter((p) => p.codigo === 'S12').length} saída(s), {faltamNaRota.filter((p) => p.codigo === 'S1').length} de orientação — curvas e a cada 15 m)
            </li>
          )}
        </ul>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={proposta.onPropor}
          disabled={proposta.quantas === 0}
          title={proposta.quantas === 0 ? 'nada a sinalizar' : 'Lança as placas que faltam — um passo de desfazer'}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {proposta.quantas > 0 ? `Propor ${proposta.quantas} placa(s)` : 'Propor placas'}
        </button>
      </div>
    </div>
  );
}
