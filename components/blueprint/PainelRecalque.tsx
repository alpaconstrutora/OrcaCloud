/**
 * O RECALQUE na gaveta de água (29/09/2026, E4.4): só aparece com reservatório
 * INFERIOR. Vazão, Forchheimer, DN de sucção e recalque, altura manométrica e
 * a potência com o motor comercial; e o botão que lança bomba, sucção e
 * recalque (sugeridos, um lote).
 */
import React from 'react';
import type { HipotesesDeRecalque, PlanoDoRecalque } from '../../utils/blueprintRecalque';

interface Props {
  plano: PlanoDoRecalque;
  hip: HipotesesDeRecalque;
  onHip: (h: HipotesesDeRecalque) => void;
  onLancar: () => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelRecalque({ plano, hip, onHip, onLancar }: Props) {
  const motivoDoBotao = plano.motivo ?? (plano.comandos.length === 0 ? 'Bomba, sucção e recalque confirmados já estão no desenho' : undefined);
  const numero = (v: string, padrao: number) => {
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? x : padrao;
  };
  return (
    <div className="space-y-2" data-testid="recalque">
      <p className="text-xs font-semibold text-slate-700">Recalque (inferior → superior)</p>
      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{plano.motivo}</p>
      ) : (
        <>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700" data-testid="recalque-bomba">
            Bomba de {n(plano.motorCv, plano.motorCv < 1 ? 2 : 1)} cv — {n(plano.vazaoLs * 3.6, 2)} m³/h a {n(plano.alturaManometricaM)} mca (potência calculada {n(plano.potenciaCv, 2)} cv).
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <dt>Vazão</dt>
            <dd className="tabular-nums">
              {n(plano.vazaoLs, 3)} L/s ({n(hip.horasDeFuncionamento, 0)} h/dia)
            </dd>
            <dt>Forchheimer</dt>
            <dd className="tabular-nums">D = {n(plano.diametroForchheimerMm)} mm</dd>
            <dt>Recalque · sucção</dt>
            <dd className="tabular-nums">
              DN {plano.dnRecalqueMm} ({n(plano.comprimentoRecalqueM)} m) · DN {plano.dnSuccaoMm} ({n(plano.comprimentoSuccaoM)} m)
            </dd>
            <dt>Desnível · perdas</dt>
            <dd className="tabular-nums">
              {n(plano.desnivelGeometricoM, 2)} m · {n(plano.perdasMca, 2)} mca
            </dd>
          </dl>
          {plano.avisos.map((a) => (
            <p key={a} className="text-xs text-amber-700">
              {a}
            </p>
          ))}
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Horas por dia
          <input type="number" min={1} max={24} step={1} value={hip.horasDeFuncionamento} onChange={(e) => onHip({ ...hip, horasDeFuncionamento: Math.min(24, Math.max(1, numero(e.target.value, 6))) })} aria-label="Horas de funcionamento da bomba por dia" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Rendimento
          <input type="number" min={0.2} max={0.9} step={0.05} value={hip.rendimento} onChange={(e) => onHip({ ...hip, rendimento: Math.min(0.9, Math.max(0.2, numero(e.target.value, 0.5))) })} aria-label="Rendimento do conjunto motor-bomba" className={campo} />
        </label>
        <button
          type="button"
          onClick={onLancar}
          disabled={!!motivoDoBotao}
          title={motivoDoBotao}
          className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {plano.apagados > 0 ? 'Relançar recalque' : 'Lançar bomba e recalque'}
        </button>
      </div>
    </div>
  );
}
