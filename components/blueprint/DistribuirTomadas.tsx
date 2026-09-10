import React, { useState } from 'react';
import { Plug } from 'lucide-react';
import type {
  ConferenciaDeIluminacao,
  ConferenciaDeTomadas,
  LadoDaParede,
} from '../../utils/blueprintDistribuicao';

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

/**
 * A linha da NORMA no ambiente: o mínimo da NBR 5410 (9.5.2.2.1), o que há,
 * o que falta — e o botão que completa só o DÉFICIT, como sugeridas.
 *
 * ⚠️ Três estados, todos ditos: sem tipo ("classifique para conferir"),
 * atende, e falta N. Nunca sugere remover: o mínimo é piso.
 */
export function ConferenciaDoAmbiente({
  conferencia,
  luz,
  onCompletar,
}: {
  conferencia: ConferenciaDeTomadas | null;
  /** A iluminação (9.5.2.1) — vale para todo cômodo, com ou sem tipo. */
  luz?: ConferenciaDeIluminacao | null;
  onCompletar: () => number;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const c = conferencia;
  const faltaTomada = !!c && (c.deficit > 0 || c.deficitMedias > 0);
  const faltaLuz =
    !!luz && (luz.faltaLuzDeTeto || luz.faltaInterruptor || luz.faltaComando || luz.deficitVA > 0);
  const semTipo = c && c.semTipo > 0 ? ` (+${c.semTipo} sem tipo, fora da conta)` : '';

  const linhaDaLuz = luz && (
    <p className={faltaLuz ? 'text-amber-700' : 'text-emerald-700'}>
      Iluminação: mín. <strong>{luz.minimoVA} VA</strong> · luz de teto{' '}
      {luz.faltaLuzDeTeto ? '✗' : '✓'} · interruptor{' '}
      {luz.faltaInterruptor ? '✗' : luz.faltaComando ? '✗ (letras sem par)' : '✓'}
      {luz.luzes > 0 && (
        <>
          {' '}· {luz.declaradoVA} VA declarados
          {luz.semPotencia > 0 ? ` (+${luz.semPotencia} sem potência)` : ''}
        </>
      )}
      {' — '}
      {faltaLuz ? 'falta' : 'atende'}
    </p>
  );

  return (
    <div className="mt-1 space-y-1 text-[11px]">
      {c ? (
        <p className={faltaTomada ? 'text-amber-700' : 'text-emerald-700'}>
          NBR 5410: mín. <strong>{c.minimo}</strong> ({c.regra}) · há <strong>{c.existentes}</strong>
          {semTipo}
          {c.medias > 0 && (
            <>
              {' '}· altura média: {c.existentesMedias}/{c.medias}
            </>
          )}
          {' — '}
          {faltaTomada ? (
            <>
              faltam <strong>{Math.max(c.deficit, c.deficitMedias)}</strong>
              {c.deficitMedias > 0 && c.ondeAMedia ? `, ${c.deficitMedias} ${c.ondeAMedia}` : ''}
            </>
          ) : (
            'atende'
          )}
        </p>
      ) : (
        <p className="text-slate-400">
          NBR 5410: classifique o ambiente para conferir o mínimo de tomadas.
        </p>
      )}
      {linhaDaLuz}
      {(faltaTomada || faltaLuz) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const n = onCompletar();
              setAviso(
                n === 0
                  ? 'Sem parede livre para completar — a face está tomada por portas e janelas.'
                  : `${n} ${n === 1 ? 'ponto sugerido' : 'pontos sugeridos'} — mova cada um para o lugar certo.`,
              );
            }}
            title="Cria só o que falta para o mínimo da norma — tomadas, luz de teto e interruptor — como pontos sugeridos"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50"
          >
            <Plug className="h-3.5 w-3.5" />
            Completar pela norma
          </button>
          {aviso && (
            <span role="status" className="text-slate-500">
              {aviso}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
