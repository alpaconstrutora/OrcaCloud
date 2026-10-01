/**
 * INCÊNDIO — detecção e alarme (01/10/2026, E7.4 do roadmap de incêndio): se
 * as medidas são exigidas (E0), os ambientes sem cobertura de detector, os
 * longe de um acionador, o pavimento sem avisador, a central e o laço, e a
 * proposta num lote. Tudo derivado (`blueprintDeteccaoAlarme`).
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { AnaliseDeAlarme } from '../../utils/blueprintDeteccaoAlarme';

interface Props {
  analise: AnaliseDeAlarme;
  onSelecionar: (ids: ObjectId[]) => void;
  proposta: { quantos: number; onPropor: () => void };
}

const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function PainelAlarmeIncendio({ analise: a, onSelecionar, proposta }: Props) {
  const semDeteccao = a.ambientes.filter((x) => !x.atende);
  const itens: React.ReactNode[] = [];
  if (a.semCentral) itens.push(<li key="central">Não há central de alarme</li>);
  if (semDeteccao.length)
    itens.push(
      <li key="det">
        <button type="button" className="text-left hover:underline" onClick={() => onSelecionar(semDeteccao.map((x) => x.spaceId))}>
          {semDeteccao.length} ambiente(s) sem cobertura de detector
        </button>
        <span className="text-slate-500"> ({semDeteccao.slice(0, 3).map((x) => x.rotulo).join(', ')}{semDeteccao.length > 3 ? '…' : ''})</span>
      </li>,
    );
  if (a.longeDoAcionador.length)
    itens.push(
      <li key="ac">
        {a.longeDoAcionador.length} ambiente(s) a mais de 30 m de um acionador
        {a.longeDoAcionador.some((x) => x.distanciaM != null) && (
          <span className="text-slate-500"> (pior: {n(Math.max(...a.longeDoAcionador.map((x) => x.distanciaM ?? 0)))} m)</span>
        )}
      </li>,
    );
  for (const p of a.pavimentosSemAvisador) itens.push(<li key={`av${p.levelId}`}>{p.nome}: nenhum avisador</li>);
  if (a.foraDoLaco.length)
    itens.push(
      <li key="laco">
        <button type="button" className="text-left hover:underline" onClick={() => onSelecionar(a.foraDoLaco)}>
          {a.foraDoLaco.length} dispositivo(s) fora do laço de uma central
        </button>
      </li>,
    );
  return (
    <div className="space-y-2" data-testid="alarme-incendio">
      <div>
        <h4 className="text-xs font-semibold text-slate-700">Detecção e alarme</h4>
        <p className="text-[11px] text-slate-500">
          Detecção {a.deteccaoExigida ? 'exigida' : 'não exigida'} · alarme {a.alarmeExigido ? 'exigido' : 'não exigido'} (pela classificação) — {a.fonte}.
        </p>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-emerald-700" data-testid="alarme-ok">
          {a.deteccaoExigida || a.alarmeExigido ? 'Detectores, acionadores, avisadores e laço atendem.' : 'Nada exigido, e o que foi lançado está no laço.'}
        </p>
      ) : (
        <ul className="space-y-1 text-xs text-red-700" data-testid="alarme-falta">
          {itens}
        </ul>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={proposta.onPropor}
          disabled={proposta.quantos === 0}
          title={proposta.quantos === 0 ? 'nada a lançar' : 'Lança a central, os detectores, os acionadores e os avisadores que faltam, já no laço — um passo de desfazer'}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {proposta.quantos > 0 ? `Propor ${proposta.quantos} item(ns)` : 'Propor detecção e alarme'}
        </button>
      </div>
    </div>
  );
}
