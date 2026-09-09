import React, { useState } from 'react';
import CamposDeDimensao from './CamposDeDimensao';
import { MEDIDAS_PADRAO_QUADRO, giroDaPeca, medidasDaPeca } from '../../utils/blueprintRede';
import { AlertTriangle, Plus, Zap } from 'lucide-react';
import type { BlueprintModel, ObjectId } from '../../utils/blueprintKernel';
import { quadroDeCargas } from '../../utils/blueprintKernel';

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
  onQuadroProps,
  onSelecionar,
  onLigarAoCircuito,
}: {
  model: BlueprintModel;
  onAddCircuito: (quadroId: ObjectId, nome: string) => void;
  onCircuitoProps: (
    circuitoId: ObjectId,
    campos: { nome?: string; tipo?: string | null; tensaoV?: number | null; disjuntorA?: number | null; secaoMm2?: number | null },
  ) => void;
  onQuadroProps: (
    quadroId: ObjectId,
    campos: {
      nome?: string;
      larguraMm?: number | null;
      alturaMm?: number | null;
      profundidadeMm?: number | null;
      rotacaoGraus?: number | null;
    },
  ) => void;
  onSelecionar?: (id: string) => void;
  /** Liga um ponto solto a um circuito, direto daqui. */
  onLigarAoCircuito?: (terminalId: ObjectId, circuitoId: ObjectId) => void;
}) {
  const [novoCircuito, setNovoCircuito] = useState<Record<string, string>>({});
  const cargas = quadroDeCargas(model);

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
            <input
              type="text"
              value={q.nome}
              onChange={(e) => onQuadroProps(q.quadroId, { nome: e.target.value })}
              aria-label="Nome do quadro"
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:border-slate-400"
            />
            <button
              type="button"
              onClick={() => onSelecionar?.(q.quadroId)}
              className="shrink-0 text-[10px] text-blue-700 hover:underline"
            >
              ver
            </button>
          </div>

          {/* As MEDIDAS da caixa. ⚠️ Saem do modelo, e não do quadro de cargas:
              o quadro de cargas é derivado de circuitos e potências, e não tem
              nem deve ter geometria. */}
          {(() => {
            const peca = (model.quadros ?? []).find((x) => x.id === q.quadroId);
            if (!peca) return null;
            return (
              <div className="border-b border-slate-200 px-2 py-1.5">
                <CamposDeDimensao
                  id={peca.id}
                  medidas={medidasDaPeca(peca, MEDIDAS_PADRAO_QUADRO)}
                  declarado={
                    peca.larguraMm != null ||
                    peca.alturaMm != null ||
                    peca.profundidadeMm != null
                  }
                  rotacaoGraus={giroDaPeca(peca)}
                  onMedidas={(campos) => onQuadroProps(peca.id, campos)}
                />
              </div>
            );
          })()}

          {q.circuitos.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-slate-500">Sem circuitos ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1 font-semibold">Circuito</th>
                    <th className="px-2 py-1 text-right font-semibold">Disj.</th>
                    <th className="px-2 py-1 text-right font-semibold">Seção</th>
                    <th className="px-2 py-1 text-right font-semibold">Pontos</th>
                    <th className="px-2 py-1 text-right font-semibold">Carga</th>
                  </tr>
                </thead>
                <tbody>
                  {q.circuitos.map((c) => (
                    <tr key={c.circuitoId} className="border-t border-slate-100">
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
                        {c.potenciaW} W
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-2 py-1" colSpan={3}>
                      Total do quadro
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{q.pontos}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{q.potenciaW} W</td>
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

      <p className="text-[10px] text-slate-500">
        Disjuntor e seção são <strong>o que você declarou</strong>. Esta tela soma e conta —
        ela não dimensiona, e não sugere valor nenhum.
      </p>
    </div>
  );
}
