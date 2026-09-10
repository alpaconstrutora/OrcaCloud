import React, { useState } from 'react';
import { Plug } from 'lucide-react';
import type { LadoDaParede } from '../../utils/blueprintDistribuicao';

/**
 * O controle "N tomadas → Distribuir" — usado no AMBIENTE e na PAREDE.
 *
 * ─── O PEDIDO (10/09/2026) ─────────────────────────────────────────────────
 *
 * *"um campo para que o usuário possa decidir a quantidade de tomadas por
 * ambiente e por parede e depois ele move para o local que ele deseja"*
 *
 * ─── ⚠️ O QUE ELE DIZ DEPOIS DE CLICAR ──────────────────────────────────────
 *
 * "4 tomadas sugeridas — mova cada uma para o lugar certo." Não "4 tomadas
 * criadas": criadas soaria como pronto, e o ponto que o sistema escolheu não
 * é o ponto certo — é o ponto de partida. E quando não há parede livre (uma
 * face inteira de porta), diz isso em vez de criar zero em silêncio.
 *
 * Um só componente para os dois lugares: a diferença é o texto do escopo e
 * quem calcula os lados — isso fica com quem chama, em `onDistribuir`.
 */
export default function DistribuirTomadas({
  escopo,
  onDistribuir,
  ladosSlot,
}: {
  /** "neste ambiente" · "nesta parede". */
  escopo: string;
  /** Cria as tomadas e devolve QUANTAS nasceram (0 = sem parede livre). */
  onDistribuir: (n: number) => number;
  /** Opcional: o seletor de face, quando a parede tem dois ambientes. */
  ladosSlot?: React.ReactNode;
}) {
  // ⚠️ O TEXTO do campo, não o número: guardar o número e "corrigir" a cada
  // tecla impedia APAGAR para digitar outro — o campo vazio virava 1 na hora, e
  // digitar 4 em seguida dava 14. O teste pegou. O número só se fecha ao usar.
  const [texto, setTexto] = useState('2');
  const [aviso, setAviso] = useState<string | null>(null);
  const n = Math.max(1, Math.min(20, Math.round(Number(texto) || 1)));

  const distribuir = () => {
    setTexto(String(n));
    const criadas = onDistribuir(n);
    setAviso(
      criadas === 0
        ? 'Sem parede livre para tomada aqui — a face está tomada por portas e janelas.'
        : `${criadas} ${criadas === 1 ? 'tomada sugerida' : 'tomadas sugeridas'} — mova cada uma para o lugar certo.`,
    );
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <label className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAviso(null);
            }}
            onBlur={() => setTexto(String(n))}
            aria-label={`Quantidade de tomadas ${escopo}`}
            className="w-14 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          <span>{n === 1 ? 'tomada' : 'tomadas'} {escopo}</span>
        </label>
        {ladosSlot}
        <button
          type="button"
          onClick={distribuir}
          title={`Espalha as tomadas pelas paredes ${escopo}, fora de portas e janelas, como pontos sugeridos`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Plug className="h-3.5 w-3.5" />
          Distribuir
        </button>
      </div>
      {aviso && (
        <p role="status" className="text-[11px] text-slate-500">
          {aviso}
        </p>
      )}
    </div>
  );
}

/**
 * A variante da PAREDE: distribui numa FACE dela. A parede entre dois
 * ambientes tem duas faces, e "3 tomadas nesta parede" só faz sentido dizendo
 * de que lado — por isso o seletor aparece quando há mais de uma. A parede que
 * não fecha ambiente nenhum não tem face para tomada, e diz isso.
 */
export function TomadasNaParede({
  lados,
  onDistribuir,
}: {
  lados: readonly LadoDaParede[];
  onDistribuir: (lados: readonly LadoDaParede[], n: number) => number;
}) {
  const [spaceId, setSpaceId] = useState<string | null>(null);
  if (lados.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-slate-400">
        Esta parede não fecha nenhum ambiente — sem face para distribuir tomadas.
      </p>
    );
  }
  const escolhido = lados.find((l) => l.spaceId === spaceId) ?? lados[0];
  return (
    <DistribuirTomadas
      escopo="nesta parede"
      onDistribuir={(n) => onDistribuir([escolhido], n)}
      ladosSlot={
        lados.length > 1 ? (
          <label className="flex items-center gap-1">
            do lado
            <select
              value={escolhido.spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              aria-label="Face da parede onde distribuir as tomadas"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              {lados.map((l) => (
                <option key={l.spaceId} value={l.spaceId}>
                  {l.ambiente}
                </option>
              ))}
            </select>
          </label>
        ) : null
      }
    />
  );
}
