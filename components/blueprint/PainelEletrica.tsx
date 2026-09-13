import React, { useState } from 'react';
import CamposDeDimensao from './CamposDeDimensao';
import { MEDIDAS_PADRAO_QUADRO, UNIDADE_DE_POTENCIA, giroDaPeca, medidasDaPeca } from '../../utils/blueprintRede';
import { AlertTriangle, Plus, Zap } from 'lucide-react';
import type { BlueprintModel, FaseDoCircuito, LigacaoDoCircuito, ObjectId } from '../../utils/blueprintKernel';
import { LIGACOES_DO_CIRCUITO, quadroDeCargas } from '../../utils/blueprintKernel';
import {
  HIPOTESES_PADRAO,
  preDimensionarCircuito,
  type HipotesesEletricas,
} from '../../utils/blueprintEletricaDimensionamento';
import { HipotesesDoPreDimensionamento, LinhaPreDimensionamento } from './PainelPreDimensionamento';
import PainelQuadroAlimentador from './PainelQuadroAlimentador';
import { preDimensionarQuadroCompleto } from '../../utils/blueprintEletricaDimensionamento';

/**
 * O painel de ELÉTRICA — quadros, circuitos e o quadro de cargas.
 *
 * ─── ⚠️ O QUE ESTA TELA NÃO FAZ, E É DECISÃO ────────────────────────────────
 *
 * Ela não sugere disjuntor, não calcula seção de fio e não aplica fator de
 * demanda normativo. Tudo o que aparece aqui foi DECLARADO por alguém, e o que
 * a tela faz é somar e contar.
 *
 * A fronteira é fina e por isso está escrita: um número "sugerido" numa tela
 * vira decisão de projeto na cabeça de quem lê, e projeto elétrico tem norma,
 * responsabilidade técnica e ART atrás. Somar é registro; decidir é projeto.
 *
 * ─── ⚠️ E ELA MOSTRA O QUE FALTA, NÃO SÓ O QUE HÁ ───────────────────────────
 *
 * Ponto sem circuito e ponto sem potência aparecem em destaque. Uma soma que
 * esconde os pontos que não entraram nela parece completa — e é a pior espécie
 * de erro, porque o número sai plausível.
 */
export default function PainelEletrica({
  model,
  onAddCircuito,
  onCircuitoProps,
  onSelecionar,
  onLigarAoCircuito,
  onAceitarSugeridas,
  hipoteses = HIPOTESES_PADRAO,
  onHipoteses,
  onQuadroProps,
  executivoSlot,
}: {
  model: BlueprintModel;
  onAddCircuito: (quadroId: ObjectId, nome: string) => void;
  onCircuitoProps: (
    circuitoId: ObjectId,
    campos: {
      nome?: string;
      tipo?: string | null;
      tensaoV?: number | null;
      disjuntorA?: number | null;
      secaoMm2?: number | null;
      ligacao?: LigacaoDoCircuito | null;
      protecaoDR?: boolean | null;
      fase?: FaseDoCircuito | null;
    },
  ) => void;
  /** Hipóteses do pré-dimensionamento — ver `HipotesesEletricas`. */
  hipoteses?: HipotesesEletricas;
  onHipoteses?: (h: HipotesesEletricas) => void;
  /** F6: a alimentação do quadro (ligação, tensão, metros até a origem) — declarações. */
  onQuadroProps?: (
    quadroId: ObjectId,
    campos: { ligacao?: LigacaoDoCircuito | null; tensaoV?: number | null; alimentadorM?: number | null },
  ) => void;
  /** F7: o projeto executivo elétrico com ART, montado por quem tem o estudo em mãos. */
  executivoSlot?: React.ReactNode;
  onSelecionar?: (id: string) => void;
  /** Liga um ponto solto a um circuito, direto daqui. */
  onLigarAoCircuito?: (terminalId: ObjectId, circuitoId: ObjectId) => void;
  /** Tira a marca de SUGERIDA de todos os pontos — "onde estão está bom". */
  onAceitarSugeridas?: () => void;
}) {
  const [novoCircuito, setNovoCircuito] = useState<Record<string, string>>({});
  const cargas = quadroDeCargas(model);
  // ⚠️ A pendência das SUGERIDAS aparece com ou sem quadro: são pontos que o
  // sistema pôs e ninguém confirmou. Ver `Terminal.sugerida`.
  const sugeridas = (model.terminais ?? []).filter((t) => t.sugerida).length;
  const avisoSugeridas =
    sugeridas > 0 ? (
      <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-blue-700">
        <span>
          <strong>{sugeridas}</strong> {sugeridas === 1 ? 'tomada sugerida' : 'tomadas sugeridas'} pelo
          sistema {sugeridas === 1 ? 'aguarda' : 'aguardam'} posição — mover confirma.
        </span>
        {onAceitarSugeridas && (
          <button
            type="button"
            onClick={onAceitarSugeridas}
            title="Confirma todas onde estão — a marca de sugerida some"
            className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
          >
            Aceitar todas
          </button>
        )}
      </p>
    ) : null;

  if (cargas.quadros.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-500">
          Nenhum quadro de distribuição ainda. Use <strong>Componentes → Instalações →
          Quadro de distribuição</strong> para colocar um; os circuitos nascem dele.
        </p>
        {/* ⚠️ Os pontos soltos aparecem AQUI TAMBÉM. Sem isto, um desenho com
            tomadas e sem quadro escondia a pendência por inteiro: a tela dizia
            só "nenhum quadro ainda", e os pontos que ninguém alimenta ficavam
            invisíveis até alguém criar o quadro. */}
        {avisoSugeridas}
        {cargas.pontosSemCircuito > 0 && (
          <p className="text-[11px] text-amber-700">
            E há <strong>{cargas.pontosSemCircuito}</strong>{' '}
            {cargas.pontosSemCircuito === 1 ? 'ponto elétrico' : 'pontos elétricos'} esperando
            circuito: {cargas.soltos.map((s) => s.rotulo).join(', ')}.
          </p>
        )}
      </div>
    );
  }

  /** Todos os circuitos, com o quadro junto — "QDC · C1" é o que se reconhece. */
  const todosOsCircuitos = (model.circuitos ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    quadro: (model.quadros ?? []).find((q) => q.id === c.quadroId)?.nome ?? '',
  }));

  const numero = (v: number | null) => (v == null ? '—' : String(v));

  return (
    <div className="space-y-3">
      {avisoSugeridas}
      {cargas.pontosSemCircuito > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-slate-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span>
            <strong>{cargas.pontosSemCircuito}</strong>{' '}
            {cargas.pontosSemCircuito === 1 ? 'ponto elétrico' : 'pontos elétricos'} fora de
            circuito.
            <span className="mt-0.5 block text-[10px] text-slate-600">
              Eles não entram em soma nenhuma.
            </span>
            {/* ⚠️ A LISTA, e não só o número.
                O aviso dizia "selecione o ponto e escolha o circuito no painel
                dele" — e quem lia tinha de ACHAR o ponto no desenho, que é
                justamente o que ninguém consegue quando ele está fora de
                circuito por ter passado despercebido. Relato de uso, 09/09/2026:
                "porém não encontrou como conectar a um circuito". */}
            <span className="mt-1.5 block space-y-1">
              {cargas.soltos.map((s) => (
                <span key={s.terminalId} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelecionar?.(s.terminalId)}
                    title="Selecionar este ponto no desenho"
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-blue-700 hover:underline"
                  >
                    {s.rotulo}
                  </button>
                  {todosOsCircuitos.length === 0 ? (
                    <span className="shrink-0 text-[10px] text-slate-500">
                      crie um circuito abaixo
                    </span>
                  ) : (
                    <select
                      value=""
                      aria-label={`Circuito de ${s.rotulo}`}
                      onChange={(e) =>
                        e.target.value && onLigarAoCircuito?.(s.terminalId, e.target.value)
                      }
                      className="w-32 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                    >
                      <option value="">Ligar a…</option>
                      {todosOsCircuitos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.quadro} · {c.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              ))}
            </span>
          </span>
        </p>
      )}

      {cargas.quadros.map((q) => (
        <div key={q.quadroId} className="rounded-md border border-slate-200">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
            <Zap className="h-3 w-3 shrink-0 text-amber-500" />
            {/* ⚠️ TEXTO, e não campo. O nome é PROPRIEDADE da peça, e propriedade
                de peça tem um lugar só: "Quadro selecionado", em Componentes.
                Editável nos dois seria duas verdades sobre o mesmo campo — e foi
                a geometria do quadro morando aqui que gerou a confusão relatada
                em 09/09: o QDC se editava na Elétrica e o ponto em Componentes. */}
            <span className="min-w-0 flex-1 truncate px-1 py-0.5 text-xs font-semibold text-slate-700">
              {q.nome}
            </span>
            <button
              type="button"
              onClick={() => onSelecionar?.(q.quadroId)}
              className="shrink-0 text-[10px] text-blue-700 hover:underline"
            >
              ver
            </button>
          </div>

          {q.circuitos.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-slate-500">Sem circuitos ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              {/* `table-fixed` com larguras no cabeçalho: com a linha do
                  pré-dimensionamento (colSpan) o layout automático alargava a
                  tabela e a coluna Carga saía do painel — visto no harness. */}
              <table className="w-full table-fixed text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1 font-semibold">Circuito</th>
                    <th className="w-12 px-2 py-1 text-right font-semibold">Disj.</th>
                    <th className="w-12 px-2 py-1 text-right font-semibold">Seção</th>
                    <th className="w-12 px-2 py-1 text-right font-semibold">Pts.</th>
                    <th className="w-16 px-2 py-1 text-right font-semibold">Carga</th>
                  </tr>
                </thead>
                <tbody>
                  {q.circuitos.map((c) => (
                    <React.Fragment key={c.circuitoId}>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={c.nome}
                          onChange={(e) => onCircuitoProps(c.circuitoId, { nome: e.target.value })}
                          aria-label="Nome do circuito"
                          className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-slate-400"
                        />
                      </td>
                      {/* ⚠️ Campos DECLARADOS, e vazios quando ninguém informou —
                          nunca um valor de partida "recomendado". */}
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          value={c.disjuntorA ?? ''}
                          onChange={(e) =>
                            onCircuitoProps(c.circuitoId, {
                              disjuntorA: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          aria-label={`Disjuntor do circuito ${c.nome}, em ampères`}
                          className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-slate-300 focus:border-slate-400"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          step="0.5"
                          value={c.secaoMm2 ?? ''}
                          onChange={(e) =>
                            onCircuitoProps(c.circuitoId, {
                              secaoMm2: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          aria-label={`Seção do circuito ${c.nome}, em mm²`}
                          className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-slate-300 focus:border-slate-400"
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                        {c.pontos}
                        {c.pontosSemPotencia > 0 && (
                          <span
                            className="ml-1 text-amber-700"
                            title={`${c.pontosSemPotencia} sem potência informada`}
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                        {c.potenciaW} {UNIDADE_DE_POTENCIA}
                      </td>
                    </tr>
                    {/* As DECLARAÇÕES que o pré-dimensionamento lê — tensão,
                        ligação e DR — e, abaixo, o que a norma pede para elas.
                        Declarado e calculado lado a lado, nunca um no lugar
                        do outro (item 6, 13/09/2026). */}
                    <tr>
                      {/* `max-w-0`: sem isto o texto do pré-dimensionamento alarga a
                          tabela e empurra a coluna Carga para fora do painel — o
                          print do harness mostrou "CARG" cortado. */}
                      <td colSpan={5} className="max-w-0 pb-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2 text-[10px] text-slate-500">
                          <label className="flex items-center gap-1">
                            Tensão
                            <input
                              type="number"
                              value={c.tensaoV ?? ''}
                              onChange={(e) =>
                                onCircuitoProps(c.circuitoId, {
                                  tensaoV: e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              placeholder="V"
                              aria-label={`Tensão do circuito ${c.nome}, em volts`}
                              className="w-12 rounded border border-slate-200 px-1 py-0 text-right text-[10px]"
                            />
                            V
                          </label>
                          <label className="flex items-center gap-1">
                            Ligação
                            <select
                              value={circuitoDoModelo(model, c.circuitoId)?.ligacao ?? 'FN'}
                              onChange={(e) =>
                                onCircuitoProps(c.circuitoId, { ligacao: e.target.value as LigacaoDoCircuito })
                              }
                              aria-label={`Ligação do circuito ${c.nome}`}
                              className="rounded border border-slate-200 px-1 py-0 text-[10px]"
                            >
                              {LIGACOES_DO_CIRCUITO.map((l) => (
                                <option key={l} value={l}>
                                  {l === 'FN' ? 'F-N' : l === 'FF' ? 'F-F' : 'trifásico'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1" title="Dispositivo DR de 30 mA declarado neste circuito (5.1.3.2.2)">
                            <input
                              type="checkbox"
                              checked={circuitoDoModelo(model, c.circuitoId)?.protecaoDR === true}
                              onChange={(e) => onCircuitoProps(c.circuitoId, { protecaoDR: e.target.checked })}
                              aria-label={`Proteção DR do circuito ${c.nome}`}
                            />
                            DR
                          </label>
                        </div>
                        {(() => {
                          const circuito = circuitoDoModelo(model, c.circuitoId);
                          return circuito ? (
                            <LinhaPreDimensionamento
                              r={preDimensionarCircuito(model, circuito, hipoteses)}
                              hipoteses={hipoteses}
                              onUsarSugerido={(campos) => onCircuitoProps(c.circuitoId, campos)}
                            />
                          ) : null;
                        })()}
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-2 py-1" colSpan={3}>
                      Total do quadro
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{q.pontos}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{q.potenciaW} {UNIDADE_DE_POTENCIA}</td>
                  </tr>
                </tbody>
              </table>
              {q.pontosSemPotencia > 0 && (
                <p className="px-2 py-1 text-[10px] text-amber-700">
                  ⚠ {q.pontosSemPotencia}{' '}
                  {q.pontosSemPotencia === 1 ? 'ponto entra' : 'pontos entram'} na contagem e{' '}
                  <strong>não</strong> na carga — sem potência informada. A soma acima está
                  incompleta.
                </p>
              )}
            </div>
          )}

          {/* F6 — o QUADRO: alimentação declarada, demanda, alimentador, fases. */}
          {(() => {
            if (!onQuadroProps || q.circuitos.length === 0) return null;
            const pq = preDimensionarQuadroCompleto(model, q.quadroId, hipoteses);
            const quadro = (model.quadros ?? []).find((x) => x.id === q.quadroId);
            if (!pq || !quadro) return null;
            return (
              <PainelQuadroAlimentador
                q={pq}
                ligacaoDeclarada={quadro.ligacao ?? null}
                tensaoDeclarada={quadro.tensaoV ?? null}
                alimentadorM={quadro.alimentadorM ?? null}
                onQuadro={(campos) => onQuadroProps(q.quadroId, campos)}
                fasesDosCircuitos={(model.circuitos ?? [])
                  .filter((c) => c.quadroId === q.quadroId)
                  .map((c) => ({ circuitoId: c.id, nome: c.nome, ligacao: c.ligacao ?? 'FN', fase: c.fase ?? null }))}
                onFase={(circuitoId, fase) => onCircuitoProps(circuitoId, { fase })}
              />
            );
          })()}

          <div className="flex items-center gap-1.5 border-t border-slate-200 px-2 py-1.5">
            <input
              type="text"
              value={novoCircuito[q.quadroId] ?? ''}
              onChange={(e) =>
                setNovoCircuito((s) => ({ ...s, [q.quadroId]: e.target.value }))
              }
              placeholder="Novo circuito (ex.: C3 — Tomadas cozinha)"
              aria-label="Nome do novo circuito"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              disabled={!(novoCircuito[q.quadroId] ?? '').trim()}
              onClick={() => {
                onAddCircuito(q.quadroId, (novoCircuito[q.quadroId] ?? '').trim());
                setNovoCircuito((s) => ({ ...s, [q.quadroId]: '' }));
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> Circuito
            </button>
          </div>
        </div>
      ))}

      {onHipoteses && <HipotesesDoPreDimensionamento hipoteses={hipoteses} onChange={onHipoteses} />}

      {executivoSlot}

      <p className="text-[10px] text-slate-500">
        Disjuntor e seção são <strong>o que você declarou</strong>. O pré-dimensionamento abaixo
        de cada circuito é o que a NBR 5410 pede para a carga declarada, com as hipóteses
        escritas — ele sugere; quem grava é você. Dimensionamento é do responsável técnico.
      </p>
    </div>
  );
}

/** O circuito do kernel por id — para os campos que o quadro de cargas não carrega. */
function circuitoDoModelo(model: BlueprintModel, circuitoId: ObjectId) {
  return (model.circuitos ?? []).find((c) => c.id === circuitoId) ?? null;
}
