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
import CamposDeDimensao from './CamposDeDimensao';
import {
  GRUPO_DO_PONTO_ELETRICO,
  MEDIDAS_PADRAO_TERMINAL,
  ROTULO_DO_PONTO_ELETRICO,
  giroDaPeca,
  medidasDaPeca,
  terminalEhRedondo,
} from '../../utils/blueprintRede';
import {
  TIPOS_DE_PONTO_ELETRICO,
  type TipoDePontoEletrico,
} from '../../utils/blueprintKernel';
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
    circuitoId?: string | null;
    condutores?: number | null;
  }) => void;
  onTerminal: (campos: {
    tipo?: string;
    cotaMm?: number;
    itemCode?: string | null;
    rotulo?: string | null;
    circuitoId?: string | null;
    potenciaW?: number | null;
    comando?: string | null;
    tipoEletrico?: TipoDePontoEletrico | null;
    larguraMm?: number | null;
    alturaMm?: number | null;
    profundidadeMm?: number | null;
    rotacaoGraus?: number | null;
  }) => void;
  /** Os circuitos do desenho, para o ponto elétrico escolher o seu. */
  circuitos?: { id: string; nome: string; quadroNome: string }[];
}

export default function PainelTrechoSelecionado({
  trecho,
  terminal,
  onTrecho,
  onTerminal,
  circuitos = [],
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
          <CamposDeDimensao
            id={terminal.id}
            medidas={medidasDaPeca(terminal, MEDIDAS_PADRAO_TERMINAL)}
            declarado={
              terminal.larguraMm != null ||
              terminal.alturaMm != null ||
              terminal.profundidadeMm != null
            }
            rotacaoGraus={giroDaPeca(terminal)}
            giroVisivelEmPlanta={!terminalEhRedondo(terminal)}
            onMedidas={onTerminal}
          />
          {/* ⚠️ O TIPO vem ANTES do circuito e da potência: ele é o que a peça
              É, e é dele que saem o grupo, a contagem por família e o símbolo.
              Um ponto sem tipo aparece como "a classificar" — estado legítimo,
              e visível. */}
          {terminal.disciplina === 'ELETRICA' && (
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">Tipo do ponto</span>
              <select
                value={terminal.tipoEletrico ?? ''}
                onChange={(e) =>
                  onTerminal({ tipoEletrico: (e.target.value || null) as TipoDePontoEletrico | null })
                }
                aria-label="Tipo do ponto elétrico"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">A classificar</option>
                {TIPOS_DE_PONTO_ELETRICO.map((t) => (
                  <option key={t} value={t}>
                    {GRUPO_DO_PONTO_ELETRICO[t].replace('Elétrica — ', '')} ·{' '}
                    {ROTULO_DO_PONTO_ELETRICO[t]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* ⚠️ CIRCUITO e POTÊNCIA só no ponto ELÉTRICO. Num ponto de água
              eles não significam nada, e um campo que não significa nada é um
              convite a preencher com qualquer coisa. */}
          {terminal.disciplina === 'ELETRICA' && (
            <>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">Circuito</span>
                <select
                  value={terminal.circuitoId ?? ''}
                  onChange={(e) => onTerminal({ circuitoId: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Sem circuito</option>
                  {circuitos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.quadroNome} · {c.nome}
                    </option>
                  ))}
                </select>
                {circuitos.length === 0 && (
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    Nenhum circuito ainda — crie um no painel <strong>Elétrica</strong>.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">
                  Potência declarada
                </span>
                <input
                  type="number"
                  min={0}
                  value={terminal.potenciaW ?? ''}
                  onChange={(e) =>
                    onTerminal({ potenciaW: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  placeholder="W"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                {/* ⚠️ Vazio é DIFERENTE de zero, e a frase existe para isso: em
                    branco o ponto entra na contagem e não na carga, e o quadro
                    de cargas o mostra como incompleto. */}
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  Em branco é <strong>não informado</strong>, não zero: o ponto conta e a
                  carga dele fica de fora da soma.
                </span>
              </label>

              {/* ── A LETRA DO COMANDO ────────────────────────────────────
                  "a", "b", "c": o interruptor `a` comanda a luminária `a`. É a
                  convenção da prancha, e é uma RELAÇÃO escrita como texto —
                  ver o cabeçalho do campo no kernel. */}
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">Comando</span>
                <input
                  type="text"
                  maxLength={4}
                  value={terminal.comando ?? ''}
                  onChange={(e) => onTerminal({ comando: e.target.value || null })}
                  placeholder="a"
                  aria-label="Letra do comando"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  A letra que liga interruptor e ponto de luz: o interruptor{' '}
                  <strong>a</strong> comanda a luminária <strong>a</strong>. Ela aparece ao
                  lado do símbolo no desenho.
                </span>
              </label>
            </>
          )}

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

        {/* ⚠️ CIRCUITO e CONDUTORES só no trecho ELÉTRICO: num cano de água eles
            não significam nada, e campo que não significa nada é convite a
            preencher com qualquer coisa. */}
        {trecho.disciplina === 'ELETRICA' && (
          <>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">Circuito</span>
              <select
                value={trecho.circuitoId ?? ''}
                onChange={(e) => onTrecho({ circuitoId: e.target.value || null })}
                aria-label="Circuito do trecho"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">Sem circuito</option>
                {circuitos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.quadroNome} · {c.nome}
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                A <strong>seção</strong> escrita ao lado do traço (<code>#2,5</code>) é a
                declarada neste circuito — ela não se digita aqui, para a prancha não
                divergir do quadro de cargas.
              </span>
            </label>
            <CampoMedida
              rotulo="Condutores"
              valor={trecho.condutores ?? 0}
              casas={0}
              sufixo="fios"
              chave={`cond-${trecho.id}`}
              aoAplicar={(v) => onTrecho({ condutores: v > 0 ? Math.round(v) : null })}
              ariaLabel="Quantos condutores passam no eletroduto"
            />
            <span className="block text-[10px] text-slate-500">
              São os traços cruzando a linha na prancha: 2 = fase e neutro, 3 = com
              retorno, 4 = com terra. <strong>Declarado</strong>, nunca calculado.
            </span>
          </>
        )}

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
