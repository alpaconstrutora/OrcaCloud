import React from 'react';
import { CalendarClock } from 'lucide-react';

/**
 * A régua de data do 4D — o controle que colore o 3D por etapa da obra.
 *
 * ─── ⚠️ ELA MOSTRA O PLANEJADO, E DIZ ISSO NA TELA ──────────────────────────
 *
 * Medido no banco em 06/09/2026: das 265 tarefas de cronograma existentes, 265
 * têm data planejada e apenas 4 têm execução informada. Uma cena colorida
 * convence antes de alguém conferir a data de uma peça — se ela não disser que
 * é previsão, vira relatório de obra sem nunca ter sido medida.
 *
 * Por isso o rótulo não é opcional nem some quando a cena está bonita: ele é o
 * que separa "vai ser assim" de "está assim".
 *
 * ─── QUANDO NÃO APARECE ─────────────────────────────────────────────────────
 *
 * Sem obra vinculada ou sem cronograma, o controle não é renderizado. Mostrar
 * uma régua que não colore nada faria a pessoa procurar defeito onde falta
 * cadastro.
 */
export default function ReguaDoTempo({
  data,
  onData,
  tarefas,
  pecasColoridas,
  algumRealConhecido,
}: {
  data: string;
  onData: (d: string) => void;
  /** Quantas tarefas o cronograma da obra tem. Zero = não renderiza. */
  tarefas: number;
  /** Quantas peças do desenho a data atual colore. */
  pecasColoridas: number;
  /** Alguma tarefa tem execução informada? Muda o que o rótulo promete. */
  algumRealConhecido: boolean;
}) {
  if (tarefas === 0) return null;

  return (
    <div className="border-t border-slate-200 px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <CalendarClock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        Como estará em
        <input
          type="date"
          value={data}
          onChange={(e) => onData(e.target.value)}
          aria-label="Data da simulação no 3D"
          className="h-7 rounded-[6px] border border-slate-200 px-1.5 text-[11px] text-slate-800"
        />
      </label>

      <p className="mt-1 text-[11px] text-slate-500">
        {pecasColoridas > 0
          ? `${pecasColoridas} peça(s) do desenho ligadas a ${tarefas} tarefa(s).`
          : `Nenhuma peça ligada ainda — as ${tarefas} tarefas do cronograma não vieram desta planta.`}
      </p>

      {/* O aviso é a parte que não pode faltar. Ver o cabeçalho. */}
      <p className="mt-1 text-[10px] text-amber-700">
        {algumRealConhecido
          ? 'Datas PLANEJADAS. Parte das tarefas tem execução informada, mas a cor não a usa.'
          : 'Datas PLANEJADAS — não é o que foi executado.'}
      </p>
    </div>
  );
}
