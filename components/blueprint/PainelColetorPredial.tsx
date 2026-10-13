/**
 * O COLETOR PREDIAL na gaveta de esgoto (29/09/2026, E5.3): da caixa de
 * inspeção à ligação na rede pública — DN (tabela 7), declividade, as caixas
 * intermediárias e se chega por gravidade; e o botão que lança.
 *
 * 13/10/2026 (docs/planos/2026-10-13-hidro-ancoras-automaticas.md, item 4.2):
 * sem ligação no desenho, o painel diz que ela vai na frente do lote ao lançar;
 * com a cota da rede ESTIMADA pelo automático, diz isso e oferece "Confirmar
 * cota" — editar a cota da peça também confirma (kernel, `SetTerminalProps`).
 */
import React from 'react';
import type { PlanoDoColetor } from '../../utils/blueprintColetorPredial';

interface Props {
  plano: PlanoDoColetor;
  /** A premissa de profundidade da rede — o que a cota estimada presume. */
  profundidadeDaRedeMm: number;
  onLancar: () => void;
  onConfirmarCota: () => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export default function PainelColetorPredial({ plano, profundidadeDaRedeMm, onLancar, onConfirmarCota }: Props) {
  const motivoDoBotao = plano.motivo ?? undefined;
  return (
    <div className="space-y-2" data-testid="coletor-predial">
      <p className="text-xs font-semibold text-slate-700">Coletor predial e ligação à rede pública</p>
      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{plano.motivo}</p>
      ) : (
        <>
          <p
            className={`rounded-md border px-3 py-1.5 text-xs ${plano.porGravidade ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
            data-testid="coletor-situacao"
          >
            {plano.porGravidade ? 'Chega à rede por gravidade' : 'Não chega à rede por gravidade'} — DN {plano.dnMm} a {n(plano.declividadePct, 2)} % (mín. {n(plano.declividadeMinimaPct, 0)} %).
          </p>
          {plano.ligacaoProposta && (
            <p className="text-xs text-slate-600" data-testid="coletor-ligacao-proposta">
              Sem ligação no desenho: ao lançar, ela vai na frente do lote, com a rede estimada a −{n(Math.abs(plano.ligacaoProposta.cotaMm) / 1000, 2)} m.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <dt>Comprimento</dt>
            <dd className="tabular-nums">{n(plano.comprimentoM)} m</dd>
            <dt>UHC que chega à caixa</dt>
            <dd className="tabular-nums">{plano.uhc}</dd>
            <dt>Caixas intermediárias</dt>
            <dd className="tabular-nums">{plano.caixasIntermediarias === 0 ? 'nenhuma (até 15 m)' : `${plano.caixasIntermediarias} (15 m da ligação, 25 m entre caixas)`}</dd>
          </dl>
          {plano.avisos.map((a) => (
            <p key={a} className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          {plano.cotaEstimada && plano.ligacaoId && (
            <div className="flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="coletor-cota-estimada">
              <span>
                Cota da rede <strong>estimada</strong> ({n(profundidadeDaRedeMm / 1000, 2)} m abaixo do terreno na frente). Confirme com a concessionária — enquanto
                estimada, a emissão com ART fica pendente.
              </span>
              <button
                type="button"
                onClick={onConfirmarCota}
                title="Confirma a cota atual da ligação. Para mudar a cota, edite a peça: editar também confirma."
                className="shrink-0 rounded-[6px] border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Confirmar cota
              </button>
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onLancar}
        disabled={!!motivoDoBotao}
        title={motivoDoBotao}
        className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {plano.ligacaoProposta ? 'Lançar ligação e coletor' : plano.apagados > 0 ? 'Relançar coletor' : 'Lançar coletor'}
      </button>
    </div>
  );
}
