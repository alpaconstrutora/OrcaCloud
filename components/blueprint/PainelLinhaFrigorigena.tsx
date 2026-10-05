/**
 * LINHA FRIGORÍGENA E DRENO (05/10/2026, E5 do roadmap de climatização): as
 * hipóteses da linha (cota, encaixe, pré-carga, declividade e DN do dreno,
 * isolamento), o plano por sistema (comprimento, Ø, dreno por gravidade/bomba),
 * Lançar/Relançar e Aceitar com motivo quando desligados, a conferência em 3
 * estados e a nota da tabela de fabricante. Molde: `PainelSelecaoSplit`.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { HipotesesDaLinha } from '../../utils/blueprintClimatizacao';
import { LIMITES_DA_LINHA } from '../../utils/blueprintClimatizacao';
import { FONTE_DAS_FAIXAS, type LinhaConferida, type PlanoDaLinha } from '../../utils/blueprintLinhaFrigorigena';
import type { EstadoDaConferencia, ItemConferido } from '../../utils/blueprintConferenciaClimatizacao';

interface Props {
  plano: PlanoDaLinha;
  linhas: LinhaConferida[];
  conferencia: ItemConferido[];
  hip: HipotesesDaLinha;
  onHip: (h: HipotesesDaLinha) => void;
  /** Trechos da linha/dreno e peças de dreno ainda sugeridos no pavimento. */
  sugeridos: { trechos: ObjectId[]; terminais: ObjectId[] };
  onLancar: () => void;
  onAceitar: (s: { trechos: ObjectId[]; terminais: ObjectId[] }) => void;
  onSelecionar?: (ids: string[]) => void;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const botao = 'rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';
const m1 = (mm: number | null) => (mm == null ? '—' : `${(mm / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`);

function Numero({ rotulo, chave, hip, onHip, passo }: { rotulo: string; chave: keyof HipotesesDaLinha; hip: HipotesesDaLinha; onHip: (h: HipotesesDaLinha) => void; passo: number }) {
  const faixa = LIMITES_DA_LINHA[chave];
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{rotulo}</span>
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={hip[chave]}
        onChange={(e) => {
          const x = Number(e.target.value);
          if (Number.isFinite(x) && x >= faixa.min && x <= faixa.max) onHip({ ...hip, [chave]: x });
        }}
        aria-label={rotulo}
        className={`w-24 ${campo}`}
      />
    </label>
  );
}

function IconeDoEstado({ estado }: { estado: EstadoDaConferencia }) {
  if (estado === 'OK') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="ok" />;
  if (estado === 'NAO_AVALIADO') return <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label="não avaliado" />;
  return <AlertTriangle className={`h-3.5 w-3.5 ${estado === 'FALTA' ? 'text-red-600' : 'text-amber-600'}`} aria-label={estado === 'FALTA' ? 'falta' : 'aviso'} />;
}

export default function PainelLinhaFrigorigena({ plano, linhas, conferencia, hip, onHip, sugeridos, onLancar, onAceitar, onSelecionar }: Props) {
  const motivoDeLancar = plano.motivo ?? (plano.aCriar.length === 0 && plano.apagados === 0 ? 'nada a lançar' : null);
  const totalSugerido = sugeridos.trechos.length + sugeridos.terminais.length;
  return (
    <div className="space-y-3" data-testid="linha-frigorigena">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <Numero rotulo="Cota da linha (mm)" chave="cotaDaLinhaMm" passo={50} hip={hip} onHip={onHip} />
        <Numero rotulo="Encaixe na parede até (mm)" chave="raioDeEncaixeMm" passo={50} hip={hip} onHip={onHip} />
        <Numero rotulo="Pré-carga de gás (m)" chave="preCargaM" passo={1} hip={hip} onHip={onHip} />
        <Numero rotulo="Declividade do dreno (%)" chave="declividadeDrenoPct" passo={0.5} hip={hip} onHip={onHip} />
        <Numero rotulo="DN do dreno (mm)" chave="dnDrenoMm" passo={5} hip={hip} onHip={onHip} />
        <Numero rotulo="Isolamento até 24.000 (mm)" chave="isolamentoAte24kMm" passo={1} hip={hip} onHip={onHip} />
        <Numero rotulo="Isolamento acima de 24.000 (mm)" chave="isolamentoAcimaMm" passo={1} hip={hip} onHip={onHip} />
      </div>
      <p className="text-[11px] text-slate-500">{FONTE_DAS_FAIXAS}</p>

      {linhas.length > 0 && (
        <table className="w-full text-xs" data-testid="tabela-linhas">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 pr-2 font-medium">Sistema</th>
              <th className="py-1 pr-2 text-right font-medium">Linha</th>
              <th className="py-1 pr-2 text-right font-medium">Máx.</th>
              <th className="py-1 pr-2 font-medium">Ø líq./suc.</th>
              <th className="py-1 pr-2 text-right font-medium">Gás extra</th>
              <th className="py-1 font-medium">Curvas</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.evaporadoraId} className="border-t border-slate-100 align-top">
                <td className="py-1 pr-2">
                  <button type="button" className="text-left font-medium text-slate-800 hover:underline" onClick={() => onSelecionar?.([l.evaporadoraId, l.condensadoraId])}>
                    {l.nome}
                  </button>
                  {l.pendencias.length > 0 && <p className="text-[10px] text-amber-700">{l.pendencias.join(' · ')}</p>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{l.comprimentoM == null ? 'sem linha' : `${l.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{l.faixa.comprimentoMaxM} m</td>
                <td className="py-1 pr-2 tabular-nums">{l.dnLiquidoMm.length ? `${l.dnLiquidoMm.join('/')} · ${l.dnSuccaoMm.join('/')} mm` : `pede ${l.faixa.liquidoMm}/${l.faixa.succaoMm} mm`}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{l.gasAdicionalG == null ? '—' : `${l.gasAdicionalG.toLocaleString('pt-BR')} g`}</td>
                <td className="py-1 tabular-nums">{l.comprimentoM == null ? '—' : `${l.curvas} (r ≥ ${l.raioMinimoMm} mm)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="linha-motivo">
          {plano.motivo}
        </p>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="linha-resumo">
          {plano.aCriar.length > 0 ? (
            <>
              <p>
                Lança <strong>{plano.aCriar.length}</strong> linha(s) pela parede, na cota da linha, com o dreno — um passo, Ctrl+Z desfaz.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {plano.resumo.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhuma linha a lançar.</p>
          )}
          {plano.jaLigados.length > 0 && <p className="mt-1 text-slate-600">Já ligados (linha confirmada): {plano.jaLigados.join(', ')}.</p>}
          {plano.apagados > 0 && <p className="mt-1 text-slate-600">Relançar troca as {plano.apagados} peças/trechos ainda sugeridos.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={!!motivoDeLancar} title={motivoDeLancar ?? 'Lança a linha e o dreno sugeridos num passo só — Ctrl+Z desfaz'} className={`${botao} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
          {plano.apagados > 0 ? 'Relançar linha e dreno' : 'Lançar linha e dreno'}
        </button>
        <button
          type="button"
          onClick={() => onAceitar(sugeridos)}
          disabled={totalSugerido === 0}
          title={totalSugerido === 0 ? 'não há linha, dreno ou peça de dreno sugeridos para aceitar' : 'Confirma o sugerido — relançar não mexe mais nele'}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Aceitar{totalSugerido > 0 ? ` (${totalSugerido})` : ''}
        </button>
      </div>
      {motivoDeLancar && !plano.motivo && <p className="text-[11px] text-slate-500">Lançar: {motivoDeLancar}.</p>}

      <div data-testid="linha-conferencia">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Conferência</p>
        <ul className="mt-1 space-y-1 text-xs">
          {conferencia.map((c) => (
            <li key={c.codigo} className="flex items-start gap-1.5">
              <span className="mt-0.5">
                <IconeDoEstado estado={c.estado} />
              </span>
              <span>
                <span className="text-slate-800">{c.item}</span>
                <span className="text-slate-500"> — </span>
                <span className="text-slate-600">{c.obtido}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
