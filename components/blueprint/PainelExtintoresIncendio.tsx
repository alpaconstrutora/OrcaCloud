/**
 * INCÊNDIO — extintores (01/10/2026, E7.1 do roadmap de incêndio): o risco e a
 * distância a percorrer, os ambientes que ficam longe demais de um extintor da
 * classe deles, o pavimento sem extintor, a capacidade abaixo da mínima, e a
 * proposta que cobre o resto num lote. Tudo derivado (`blueprintExtintores`).
 */
import React from 'react';
import { AGENTES_EXTINTORES, type AgenteExtintor, type ObjectId } from '../../utils/blueprintKernel';
import { ROTULO_DO_AGENTE, type AnaliseDeExtintores, type HipotesesDeExtintores, limiteDaClasse } from '../../utils/blueprintExtintores';

interface Props {
  analise: AnaliseDeExtintores;
  hip: HipotesesDeExtintores;
  onHip: (h: HipotesesDeExtintores) => void;
  onSelecionar: (ids: ObjectId[]) => void;
  /** A proposta: quantos extintores lança, e por que não (desligado). */
  proposta: { quantos: number; motivo: string | null; semCobertura: string[]; onPropor: () => void };
  nomeDe: (id: ObjectId) => string;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';
const ROTULO_DO_RISCO = { BAIXO: 'baixo', MEDIO: 'médio', ALTO: 'alto' } as const;

export default function PainelExtintoresIncendio({ analise: a, hip, onHip, onSelecionar, proposta, nomeDe }: Props) {
  const longe = a.ambientes.filter((x) => !x.atende).sort((x, y) => (y.distanciaM ?? Infinity) - (x.distanciaM ?? Infinity));
  const fracos = a.extintores.filter((x) => x.capacidadeAtende === false);
  return (
    <div className="space-y-3" data-testid="extintores-incendio">
      <div>
        <h4 className="text-xs font-semibold text-slate-700">Extintores</h4>
        <p className="text-[11px] text-slate-500">
          Risco {ROTULO_DO_RISCO[a.risco]} ({a.motivoDoRisco}) · a distância a percorrer vai pela classe do fogo do ambiente (A{' '}
          {n(limiteDaClasse('A', a.risco, null) ?? 0, 0)} m · B {n(limiteDaClasse('B', a.risco, null) ?? 0, 0)} m · C{' '}
          {n(limiteDaClasse('C', a.risco, null) ?? 0, 0)} m), e um extintor a até 10 m da entrada de cada pavimento — {a.fonte}.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">
          <span>
            Distância máxima <span className="text-slate-400">(m · vazio = do risco)</span>
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={hip.distanciaMaximaM ?? ''}
            placeholder={String(a.distanciaMaximaM)}
            onChange={(e) => {
              if (e.target.value === '') return onHip({ ...hip, distanciaMaximaM: null });
              const x = Number(e.target.value);
              if (Number.isFinite(x) && x > 0) onHip({ ...hip, distanciaMaximaM: x });
            }}
            aria-label="Distância máxima até o extintor (m)"
            className={`w-20 tabular-nums ${campo}`}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Extintor da proposta</span>
          <select value={hip.agentePadrao} onChange={(e) => onHip({ ...hip, agentePadrao: e.target.value as AgenteExtintor })} aria-label="Agente do extintor da proposta" className={campo}>
            {AGENTES_EXTINTORES.map((x) => (
              <option key={x} value={x}>{ROTULO_DO_AGENTE[x]}</option>
            ))}
          </select>
        </label>
      </div>

      {[
        ...a.pendencias,
        ...a.pavimentosSemExtintor.map((p) => `${p.nome}: nenhum extintor no pavimento`),
        ...(a.entradasLonge ?? []).map((p) => `${p.nome}: nenhum extintor a até 10 m da entrada (IT 16, 5.2.2.9)${p.distanciaM != null ? ` — o mais perto a ${n(p.distanciaM)} m` : ''}`),
        ...(a.pavimentosSemABC ?? []).map((p) => `${p.nome}: sem unidade de pó ABC (nem A + BC) no pavimento (IT 16, 6.2.1)`),
      ].map((p) => (
        <p key={p} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          {p}
        </p>
      ))}

      {longe.length === 0 ? (
        <p className="text-xs text-emerald-700" data-testid="extintores-cobertos">
          Todos os {a.ambientes.length} ambientes têm extintor da classe deles a até {n(a.distanciaMaximaM, 0)} m.
        </p>
      ) : (
        <table className="w-full text-xs" data-testid="extintores-longe">
          <tbody>
            {longe.slice(0, 8).map((x) => (
              <tr key={x.spaceId} className="border-b border-slate-100 text-slate-700">
                <td className="py-1.5 pr-2">
                  <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onSelecionar([x.spaceId])}>
                    {x.rotulo}
                  </button>
                  <span className="text-slate-400"> · classe {x.classes.join(', ')} ({x.motivo})</span>
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-red-700">{x.distanciaM == null ? 'sem extintor da classe' : `${n(x.distanciaM)} m`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {fracos.length > 0 && (
        <p className="text-xs text-red-700" data-testid="extintores-capacidade">
          Capacidade abaixo da mínima do risco:{' '}
          {fracos.map((x, i) => (
            <span key={x.terminalId}>
              {i > 0 && ', '}
              <button type="button" className="hover:underline" onClick={() => onSelecionar([x.terminalId])}>
                {nomeDe(x.terminalId)} ({x.capacidade})
              </button>
            </span>
          ))}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          {proposta.semCobertura.length > 0 && `Sem cobertura possível: ${proposta.semCobertura.join('; ')}.`}
        </span>
        <button
          type="button"
          onClick={proposta.onPropor}
          disabled={!!proposta.motivo}
          title={proposta.motivo ?? 'Lança os extintores que cobrem os ambientes que faltam — um passo de desfazer'}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {proposta.quantos > 0 ? `Propor ${proposta.quantos} extintor(es)` : 'Propor extintores'}
        </button>
      </div>
    </div>
  );
}
