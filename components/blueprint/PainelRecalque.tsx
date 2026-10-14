/**
 * O RECALQUE na gaveta de água (29/09/2026, E4.4): só aparece com reservatório
 * INFERIOR. Vazão, Forchheimer, DN de sucção e recalque, altura manométrica e
 * a potência com o motor comercial; e o botão que lança bomba, sucção e
 * recalque (sugeridos, um lote).
 *
 * 14/10/2026: o botão antes das premissas, que ficam recolhidas; a cota do
 * percurso virou campo (era constante escondida); campo numérico que só grava
 * ao sair — no rendimento, o primeiro "0" de 0,65 virava 0,20 na hora.
 */
import React from 'react';
import type { HipotesesDeRecalque, PlanoDoRecalque } from '../../utils/blueprintRecalque';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  plano: PlanoDoRecalque;
  hip: HipotesesDeRecalque;
  onHip: (h: HipotesesDeRecalque) => void;
  onLancar: () => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export default function PainelRecalque({ plano, hip, onHip, onLancar }: Props) {
  const motivoDoBotao = plano.motivo ?? (plano.comandos.length === 0 ? 'Bomba, sucção e recalque confirmados já estão no desenho' : undefined);
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
      <button
        type="button"
        onClick={onLancar}
        disabled={!!motivoDoBotao}
        title={motivoDoBotao}
        className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {plano.apagados > 0 ? 'Relançar recalque' : 'Lançar bomba e recalque'}
      </button>
      <BlocoDeHipoteses
        id="recalque"
        titulo="Hipóteses do recalque"
        resumo={[`${n(hip.horasDeFuncionamento, 0)} h/dia`, `rendimento ${n(hip.rendimento, 2)}`, `percurso a ${hip.cotaDoPercursoMm} mm`].join(' · ')}
        regras={
          <>
            <li>Vazão = o consumo diário em {n(hip.horasDeFuncionamento, 0)} h de bomba por dia; DN do recalque por Forchheimer, o da sucção um acima.</li>
            <li>Potência = vazão × altura manométrica ÷ rendimento ({n(hip.rendimento, 2)}), arredondada para o motor comercial acima.</li>
            <li>O recalque corre pelas paredes a {hip.cotaDoPercursoMm} mm do piso até subir na caixa superior.</li>
          </>
        }
      >
        <label className="flex items-center gap-1.5">
          Horas por dia
          <CampoNumericoDeHipotese value={hip.horasDeFuncionamento} onCommit={(v) => onHip({ ...hip, horasDeFuncionamento: v })} min={1} max={24} step={1} aria-label="Horas de funcionamento da bomba por dia" />
        </label>
        <label className="flex items-center gap-1.5">
          Rendimento
          <CampoNumericoDeHipotese value={hip.rendimento} onCommit={(v) => onHip({ ...hip, rendimento: v })} min={0.2} max={0.9} step={0.05} casas={2} aria-label="Rendimento do conjunto motor-bomba" />
        </label>
        <label className="flex items-center gap-1.5">
          Percurso a
          <CampoNumericoDeHipotese value={hip.cotaDoPercursoMm} onCommit={(v) => onHip({ ...hip, cotaDoPercursoMm: v })} min={0} max={6000} step={100} aria-label="Cota do percurso do recalque em mm" />
          mm
        </label>
      </BlocoDeHipoteses>
    </div>
  );
}
