/**
 * INCÊNDIO — a cobertura dos hidrantes (30/09/2026, E3.3 do roadmap de
 * incêndio): mangueira + jato pelo percurso das portas; os ambientes fora do
 * alcance e a proposta de hidrantes que os cobre (sugeridos, num lote).
 */
import React from 'react';
import type { CoberturaDosHidrantes } from '../../utils/blueprintCoberturaIncendio';
import type { HipotesesHidraulicasDeIncendio } from '../../utils/blueprintCalculoIncendio';

interface Props {
  hip: HipotesesHidraulicasDeIncendio;
  onHip: (h: HipotesesHidraulicasDeIncendio) => void;
  cobertura: CoberturaDosHidrantes;
  /** O nome do pavimento, para agrupar a lista. */
  nomeDoPavimento: (levelId: string) => string;
  proposta: { hidrantes: number; semSolucao: number; onPropor: () => void };
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const m = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function PainelCoberturaIncendio({ hip, onHip, cobertura: c, nomeDoPavimento, proposta }: Props) {
  const motivoDePropor = c.descobertos.length === 0 ? 'todo ambiente já está ao alcance de um hidrante' : proposta.hidrantes === 0 ? 'nenhuma posição de hidrante alcança os ambientes descobertos (sem porta?)' : null;
  const porPavimento = new Map<string, typeof c.descobertos>();
  for (const a of c.descobertos) porPavimento.set(a.levelId, [...(porPavimento.get(a.levelId) ?? []), a]);
  return (
    <div className="space-y-3" data-testid="cobertura-incendio">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">
          <span>
            Alcance do jato <span className="text-slate-400">(m)</span>
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={hip.alcanceDoJatoM}
            onChange={(e) => {
              const x = Number(e.target.value.replace(',', '.'));
              if (Number.isFinite(x) && x > 0) onHip({ ...hip, alcanceDoJatoM: x });
            }}
            aria-label="Alcance do jato (m)"
            className={`w-20 ${campo}`}
          />
        </label>
        <p className="self-center">
          Hidrante: {m(hip.comprimentoMangueiraHidranteM)} m de mangueira + jato = <strong>{m(c.alcanceHidranteM)} m</strong>
        </p>
      </div>
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
        Mangueira e jato são pontos de partida — CONFERIR na IT do CBMMG. A distância é pelo percurso das portas, até o ponto mais desfavorável de cada
        ambiente, no mesmo pavimento.
      </p>

      <p className={`rounded-md border px-3 py-1.5 text-xs ${c.descobertos.length ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} data-testid="cobertura-incendio-resumo">
        {c.ambientes.length === 0
          ? 'Nenhum ambiente fechado no desenho.'
          : c.descobertos.length
            ? `${c.descobertos.length} de ${c.ambientes.length} ambiente(s) fora do alcance dos hidrantes.`
            : `Os ${c.ambientes.length} ambiente(s) estão ao alcance de um hidrante.`}
      </p>

      {[...porPavimento].map(([levelId, lista]) => (
        <div key={levelId}>
          <h4 className="mb-1 text-xs font-semibold text-slate-700">{nomeDoPavimento(levelId)}</h4>
          <ul className="space-y-0.5 text-xs text-slate-700">
            {lista.map((a) => (
              <li key={a.spaceId}>
                {a.nome} — {a.distanciaM == null ? 'nenhum hidrante chega (sem caminho por porta)' : `pior ponto a ${m(a.distanciaM)} m do hidrante mais perto`}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={proposta.onPropor}
          disabled={!!motivoDePropor}
          title={motivoDePropor ?? 'Lança hidrantes sugeridos (tracejados) que cobrem o que falta — um passo de desfazer; mover confirma'}
          className="rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Propor hidrantes{proposta.hidrantes > 0 ? ` (${proposta.hidrantes})` : ''}
        </button>
        {proposta.semSolucao > 0 && <span className="text-xs text-red-700">{proposta.semSolucao} ambiente(s) sem solução por porta</span>}
      </div>
      {motivoDePropor && <p className="text-[11px] text-slate-500">Propor: {motivoDePropor}.</p>}
    </div>
  );
}
