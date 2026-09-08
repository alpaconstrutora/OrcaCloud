import React from 'react';
import { ArrowDownRight, MoveVertical } from 'lucide-react';
import type { DisciplinaDeRede, Terminal, Trecho } from '../../utils/blueprintKernel';
import { DISCIPLINAS } from '../../utils/blueprintKernel';
import {
  ROTULO_DA_DISCIPLINA,
  comprimentoDoTrecho,
  ehPrumada,
} from '../../utils/blueprintRede';
import { CampoMedida } from './PainelParedeSelecionada';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Trecho selecionado" / "Ponto selecionado" do painel lateral.
 *
 * ─── AS DUAS COTAS SÃO CAMPOS SEPARADOS, E É O PONTO DESTE PAINEL ───────────
 *
 * A tentação é oferecer "altura" e um campo de inclinação. Seria pior de duas
 * formas: obrigaria a decidir de que ponta a inclinação parte (e a resposta
 * muda o desenho), e esconderia o caso em que as duas pontas estão em cotas
 * escolhidas uma a uma — que é o normal quando o cano desvia de uma viga.
 *
 * Com as duas cotas à vista, a PRUMADA e o CAIMENTO deixam de ser modos: são o
 * que os dois números dizem.
 *
 * ─── O COMPRIMENTO É LEITURA, NÃO CAMPO ─────────────────────────────────────
 *
 * Ele sai das duas pontas e das duas cotas. Um campo editável de comprimento
 * teria de decidir qual ponta mover para obedecer — e a escolha silenciosa
 * moveria o cano para longe do ponto em que ele está ligado.
 */
interface Props {
  trecho: Trecho | null;
  terminal: Terminal | null;
  /** Campo omitido fica como está — o painel edita uma coisa por vez. */
  onTrecho: (campos: {
    disciplina?: DisciplinaDeRede;
    cotaAMm?: number;
    cotaBMm?: number;
    bitolaMm?: number;
    itemCode?: string | null;
    rotulo?: string | null;
  }) => void;
  onTerminal: (campos: {
    tipo?: string;
    cotaMm?: number;
    itemCode?: string | null;
    rotulo?: string | null;
  }) => void;
}

export default function PainelTrechoSelecionado({
  trecho,
  terminal,
  onTrecho,
  onTerminal,
}: Props) {
  if (terminal) {
    return (
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ponto selecionado
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          {ROTULO_DA_DISCIPLINA[terminal.disciplina]} · {terminal.tipo}
        </p>

        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Tipo</span>
            <input
              type="text"
              value={terminal.tipo}
              onChange={(e) => onTerminal({ tipo: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </label>
          <CampoMedida
            rotulo="Cota"
            valor={terminal.cotaMm}
            casas={0}
            sufixo="mm"
            chave={`cota-${terminal.id}`}
            aoAplicar={(v) => onTerminal({ cotaMm: v })}
            ariaLabel="Cota do ponto, em milímetros do piso"
          />
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Item de catálogo</span>
            <input
              type="text"
              value={terminal.itemCode ?? ''}
              onChange={(e) => onTerminal({ itemCode: e.target.value })}
              placeholder="ex.: 91953"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </label>
        </div>

        <IdentificadorDoElemento uid={terminal.uid} familia="terminal" />
      </div>
    );
  }

  if (!trecho) return null;

  const prumada = ehPrumada(trecho);
  const desnivelMm = trecho.cotaBMm - trecho.cotaAMm;
  const plantaMm = Math.hypot(trecho.b.x - trecho.a.x, trecho.b.y - trecho.a.y);
  const comprimentoM = comprimentoDoTrecho(trecho) / 1000;
  // A inclinação em porcentagem — o número que quem faz esgoto procura. Sem
  // percurso em planta não há inclinação: uma prumada é vertical, não é uma
  // rampa de 100%.
  const inclinacaoPct = plantaMm > 0 ? (desnivelMm / plantaMm) * 100 : null;

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Trecho selecionado
      </h3>

      {/* O RESULTADO EM PALAVRAS, antes dos campos — como no painel da escada. */}
      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
        {prumada ? (
          <MoveVertical className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowDownRight className="h-3 w-3 shrink-0" />
        )}
        <span>
          {prumada ? (
            <>
              <strong>Prumada</strong> de {comprimentoM.toFixed(3)} m
            </>
          ) : (
            <>
              {comprimentoM.toFixed(3)} m
              {desnivelMm !== 0 && inclinacaoPct !== null && (
                <>
                  {' '}
                  com caimento de <strong>{Math.abs(inclinacaoPct).toFixed(1)}%</strong>
                </>
              )}
            </>
          )}
        </span>
      </p>

      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600">Disciplina</span>
          <select
            value={trecho.disciplina}
            onChange={(e) => onTrecho({ disciplina: e.target.value as DisciplinaDeRede })}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {DISCIPLINAS.map((d) => (
              <option key={d} value={d}>
                {ROTULO_DA_DISCIPLINA[d]}
              </option>
            ))}
          </select>
        </label>

        <CampoMedida
          rotulo="Bitola"
          valor={trecho.bitolaMm}
          casas={0}
          sufixo="mm"
          chave={`bitola-${trecho.id}`}
          aoAplicar={(v) => onTrecho({ bitolaMm: v })}
          ariaLabel="Bitola do trecho, em milímetros"
        />

        {/* ⚠️ AS DUAS COTAS, lado a lado e independentes. É o que faz a prumada
            e o caimento existirem — ver o cabeçalho deste arquivo. */}
        <div className="grid grid-cols-2 gap-2">
          <CampoMedida
            rotulo="Cota início"
            valor={trecho.cotaAMm}
            casas={0}
            sufixo="mm"
            chave={`cotaA-${trecho.id}`}
            aoAplicar={(v) => onTrecho({ cotaAMm: v })}
            ariaLabel="Cota da ponta inicial, em milímetros do piso"
          />
          <CampoMedida
            rotulo="Cota fim"
            valor={trecho.cotaBMm}
            casas={0}
            sufixo="mm"
            chave={`cotaB-${trecho.id}`}
            aoAplicar={(v) => onTrecho({ cotaBMm: v })}
            ariaLabel="Cota da ponta final, em milímetros do piso"
          />
        </div>
        <p className="text-[10px] text-slate-500">
          Em milímetros <strong>do piso do pavimento</strong>. Negativo é abaixo dele —
          é onde o esgoto corre.
        </p>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-600">Item de catálogo</span>
          <input
            type="text"
            value={trecho.itemCode ?? ''}
            onChange={(e) => onTrecho({ itemCode: e.target.value })}
            placeholder="ex.: 91834"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-600">Rótulo</span>
          <input
            type="text"
            value={trecho.rotulo ?? ''}
            onChange={(e) => onTrecho({ rotulo: e.target.value })}
            placeholder="ex.: AF-1, Coluna 3"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
      </div>

      <IdentificadorDoElemento uid={trecho.uid} familia="trecho" />
    </div>
  );
}
