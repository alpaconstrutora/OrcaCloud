/**
 * O ALIMENTADOR PREDIAL (29/09/2026, E4.3): do hidrômetro à torneira de boia,
 * com o DN, a vazão, a velocidade, as perdas e a pressão que chega à boia.
 *
 * 14/10/2026: mora na tela "Dimensionamento da água" (não mais na gaveta) e
 * não tem botão próprio — o "Lançar tudo" da gaveta já lança hidrômetro e
 * alimentador, e lançar com o desenho escondido seria lançar sem ver. As
 * premissas ficam recolhidas; velocidade
 * máxima, DN mínimo e pressão mínima na boia viraram campos (eram constantes
 * escondidas); campo numérico que só grava ao sair (apagar a pressão da rede
 * gravava 0 kPa).
 */
import React from 'react';
import type { HipotesesDeAlimentacao, PlanoDoAlimentador } from '../../utils/blueprintAlimentador';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  plano: PlanoDoAlimentador;
  hip: HipotesesDeAlimentacao;
  onHip: (h: HipotesesDeAlimentacao) => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** A série do PVC soldável (`FICHA_DO_MATERIAL.PVC_SOLDAVEL`) até onde um alimentador predial chega. */
const DN_MINIMOS = [20, 25, 32, 40, 50] as const;

export default function PainelAlimentador({ plano, hip, onHip }: Props) {
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
          {plano.hidrometroProposto && (
            <p className="text-xs text-slate-600" data-testid="alimentador-hidrometro-proposto">
              Sem hidrômetro no desenho: o "Lançar tudo" da gaveta Água automática o põe na frente do lote, no cavalete. Arraste-o para onde a concessionária vai ligar.
            </p>
          )}
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
      <BlocoDeHipoteses
        id="alimentador"
        titulo="Hipóteses do alimentador"
        resumo={[
          `rede ${n(hip.pressaoDaRedePublicaKpa, 0)} kPa`,
          `≤ ${n(hip.velocidadeMaxMs)} m/s`,
          `DN ≥ ${hip.dnMinimoMm}`,
          `boia ≥ ${n(hip.pressaoMinimaNaBoiaKpa, 0)} kPa`,
        ].join(' · ')}
        regras={
          <>
            <li>
              Vazão = o consumo de 24 h da reservação; DN = o menor do PVC soldável, a partir de {hip.dnMinimoMm}, com velocidade até{' '}
              {n(hip.velocidadeMaxMs)} m/s. O mesmo DN mínimo vale para as peças da caixa (entrada e boia).
            </li>
            <li>
              Pressão na boia = a da rede pública − desnível − perdas (tubo, peças e hidrômetro); atende a partir de{' '}
              {n(hip.pressaoMinimaNaBoiaKpa, 0)} kPa. O percurso corre pelas paredes, enterrado a {hip.cotaEnterradaMm} mm.
            </li>
          </>
        }
      >
        <label className="flex items-center gap-1.5">
          Pressão da rede pública
          <CampoNumericoDeHipotese value={hip.pressaoDaRedePublicaKpa} onCommit={(v) => onHip({ ...hip, pressaoDaRedePublicaKpa: v })} min={0} max={1000} step={10} aria-label="Pressão da rede pública em kPa" />
          kPa
        </label>
        <label className="flex items-center gap-1.5">
          Cota enterrada
          <CampoNumericoDeHipotese value={hip.cotaEnterradaMm} onCommit={(v) => onHip({ ...hip, cotaEnterradaMm: v })} min={-3000} max={0} step={50} aria-label="Cota do alimentador enterrado em mm" />
          mm
        </label>
        <label className="flex items-center gap-1.5">
          Velocidade máx.
          <CampoNumericoDeHipotese value={hip.velocidadeMaxMs} onCommit={(v) => onHip({ ...hip, velocidadeMaxMs: v })} min={0.3} max={3} step={0.1} casas={1} aria-label="Velocidade máxima no alimentador em metros por segundo" title="A NBR 5626 limita a 3 m/s; o padrão do sistema para o alimentador é 1 m/s" />
          m/s
        </label>
        <label className="flex items-center gap-1.5">
          DN mínimo
          <select value={hip.dnMinimoMm} onChange={(e) => onHip({ ...hip, dnMinimoMm: Number(e.target.value) })} aria-label="DN mínimo do alimentador" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
            {DN_MINIMOS.map((v) => (
              <option key={v} value={v}>
                {v} mm
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Pressão mín. na boia
          <CampoNumericoDeHipotese value={hip.pressaoMinimaNaBoiaKpa} onCommit={(v) => onHip({ ...hip, pressaoMinimaNaBoiaKpa: v })} min={0} max={200} step={5} aria-label="Pressão mínima na torneira de boia em kPa" />
          kPa
        </label>
      </BlocoDeHipoteses>
    </div>
  );
}
