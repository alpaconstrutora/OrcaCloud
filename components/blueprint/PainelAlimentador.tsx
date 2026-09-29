/**
 * O ALIMENTADOR PREDIAL na gaveta de água (29/09/2026, E4.3): do hidrômetro à
 * torneira de boia, com o DN, a vazão, a velocidade, as perdas e a pressão que
 * chega à boia; e o botão que lança (sugerido, um lote). Sem entrada ou sem
 * caixa, o botão fica desligado dizendo por quê.
 */
import React from 'react';
import type { HipotesesDeAlimentacao, PlanoDoAlimentador } from '../../utils/blueprintAlimentador';

interface Props {
  plano: PlanoDoAlimentador;
  hip: HipotesesDeAlimentacao;
  onHip: (h: HipotesesDeAlimentacao) => void;
  onLancar: () => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelAlimentador({ plano, hip, onHip, onLancar }: Props) {
  const motivoDoBotao = plano.motivo ?? (plano.comandos.length === 0 ? 'O alimentador confirmado já está no desenho' : undefined);
  const numero = (v: string, padrao: number) => {
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? x : padrao;
  };
  return (
    <div className="space-y-2" data-testid="alimentador">
      <p className="text-xs font-semibold text-slate-700">Alimentador predial</p>
      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{plano.motivo}</p>
      ) : (
        <>
          <p
            className={`rounded-md border px-3 py-1.5 text-xs ${plano.atende ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
            data-testid="alimentador-situacao"
          >
            Chega à boia do reservatório {plano.destinoInferior ? 'inferior' : 'superior'} com {n(plano.pressaoNaBoiaKpa)} kPa (mín. {n(hip.pressaoMinimaNaBoiaKpa, 0)}).
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <dt>DN · comprimento</dt>
            <dd className="tabular-nums">
              {plano.dnMm} mm · {n(plano.comprimentoM)} m
            </dd>
            <dt>Vazão (consumo em 24 h)</dt>
            <dd className="tabular-nums">
              {n(plano.vazaoLs, 3)} L/s · {n(plano.velocidadeMs, 2)} m/s
            </dd>
            <dt>Desnível</dt>
            <dd className="tabular-nums">{n(plano.desnivelM, 2)} m</dd>
            <dt>Perdas (tubo · peças · hidrômetro)</dt>
            <dd className="tabular-nums">
              {n(plano.perdaDistribuidaKpa)} · {n(plano.perdaLocalizadaKpa)} · {n(plano.perdaNoHidrometroKpa)} kPa
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
          Pressão da rede pública (kPa)
          <input type="number" min={0} step={10} value={hip.pressaoDaRedePublicaKpa} onChange={(e) => onHip({ ...hip, pressaoDaRedePublicaKpa: Math.max(0, numero(e.target.value, 100)) })} aria-label="Pressão da rede pública em kPa" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Cota enterrada (mm)
          <input type="number" max={0} step={50} value={hip.cotaEnterradaMm} onChange={(e) => onHip({ ...hip, cotaEnterradaMm: Math.min(0, Math.round(numero(e.target.value, -300))) })} aria-label="Cota do alimentador enterrado em mm" className={campo} />
        </label>
        <button
          type="button"
          onClick={onLancar}
          disabled={!!motivoDoBotao}
          title={motivoDoBotao}
          className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {plano.apagados > 0 ? 'Relançar alimentador' : 'Lançar alimentador'}
        </button>
      </div>
    </div>
  );
}
