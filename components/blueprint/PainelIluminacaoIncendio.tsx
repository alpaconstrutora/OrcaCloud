/**
 * INCÊNDIO — iluminação de emergência (01/10/2026, E7.3 do roadmap de
 * incêndio): os pontos obrigatórios da rota (mudança de direção, saída,
 * escada), os trechos longe demais de uma luminária, a autonomia curta, e a
 * proposta num lote. Tudo derivado (`blueprintIluminacaoEmergencia`).
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { AnaliseDeIluminacao, HipotesesDeIluminacao } from '../../utils/blueprintIluminacaoEmergencia';

interface Props {
  analise: AnaliseDeIluminacao;
  hip: HipotesesDeIluminacao;
  onHip: (h: HipotesesDeIluminacao) => void;
  onSelecionar: (ids: ObjectId[]) => void;
  proposta: { quantas: number; onPropor: () => void };
}

const ROTULO = { MUDANCA: 'mudança(s) de direção', SAIDA: 'saída(s)', ESCADA: 'boca(s) de escada' } as const;

export default function PainelIluminacaoIncendio({ analise: a, hip, onHip, onSelecionar, proposta }: Props) {
  const faltam = a.pontosObrigatorios.filter((p) => !p.coberto);
  const porTipo = (['SAIDA', 'MUDANCA', 'ESCADA'] as const).map((t) => [t, faltam.filter((p) => p.tipo === t).length] as const).filter(([, n]) => n > 0);
  const semProtecao = a.tensaoSemProtecao ?? [];
  const ok = !faltam.length && !a.trechosSemLuz.length && !a.autonomiaCurta.length && !semProtecao.length;
  return (
    <div className="space-y-2" data-testid="iluminacao-incendio">
      <div>
        <h4 className="text-xs font-semibold text-slate-700">Iluminação de emergência</h4>
        <p className="text-[11px] text-slate-500">
          Ao longo das rotas de fuga, luminárias a no máximo {a.espacamentoM.toLocaleString('pt-BR')} m umas das outras, e uma em cada mudança de direção, saída e escada — {a.fonte}.
        </p>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Espaçamento máximo <span className="text-slate-400">(m · vazio = norma)</span>
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={hip.espacamentoMaximoM ?? ''}
          placeholder={String(a.espacamentoM)}
          onChange={(e) => {
            if (e.target.value === '') return onHip({ espacamentoMaximoM: null });
            const x = Number(e.target.value);
            if (Number.isFinite(x) && x > 0) onHip({ espacamentoMaximoM: x });
          }}
          aria-label="Espaçamento máximo das luminárias (m)"
          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
        />
      </label>
      {ok ? (
        <p className="text-xs text-emerald-700" data-testid="iluminacao-ok">
          {a.luminarias} luminária(s): rotas iluminadas e {a.pontosObrigatorios.length} ponto(s) obrigatório(s) atendidos.
        </p>
      ) : (
        <ul className="space-y-1 text-xs text-red-700" data-testid="iluminacao-falta">
          {porTipo.map(([t, n]) => (
            <li key={t}>
              {n} {ROTULO[t]} sem luminária
            </li>
          ))}
          {a.trechosSemLuz.length > 0 && <li>{a.trechosSemLuz.length} trecho(s) da rota longe demais de uma luminária</li>}
          {a.autonomiaCurta.length > 0 && (
            <li>
              <button type="button" className="text-left hover:underline" onClick={() => onSelecionar(a.autonomiaCurta)}>
                {a.autonomiaCurta.length} luminária(s) com autonomia abaixo de 60 min
              </button>
            </li>
          )}
          {semProtecao.length > 0 && (
            <li>
              <button type="button" className="text-left hover:underline" onClick={() => onSelecionar(semProtecao)}>
                {semProtecao.length} luminária(s) abaixo de 2,5 m em circuito sem DR de 30 mA ou com disjuntor acima de 10 A (IT 13, 5.5)
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={proposta.onPropor}
          disabled={proposta.quantas === 0}
          title={proposta.quantas === 0 ? 'nada a iluminar' : 'Lança as luminárias que faltam — um passo de desfazer'}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {proposta.quantas > 0 ? `Propor ${proposta.quantas} luminária(s)` : 'Propor luminárias'}
        </button>
      </div>
    </div>
  );
}
