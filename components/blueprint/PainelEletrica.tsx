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
import { usePersistedState } from '../ui/TableUtils';
import { pontosAPreencher } from '../../utils/blueprintPotenciaPadrao';
import {
  CRITERIOS_DE_AGRUPAMENTO,
  CRITERIO_SUGERIDO,
  ROTULO_DO_CRITERIO,
  agruparPontos,
  type CriterioDeAgrupamento,
} from '../../utils/blueprintAgrupamentoDePontos';

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
  onCriarCircuitoELigar,
  onAceitarSugeridas,
  onPreencherPotencias,
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
  /**
   * "Criar novo…" no seletor (13/09/2026): cria o circuito no quadro e já liga
   * os pontos, sem ir ao quadro de cargas criar antes. Quem implementa é o
   * editor (o id do circuito novo só existe depois do comando).
   */
  onCriarCircuitoELigar?: (quadroId: ObjectId, nome: string, terminalIds: ObjectId[]) => void;
  /** Tira a marca de SUGERIDA de todos os pontos — "onde estão está bom". */
  onAceitarSugeridas?: () => void;
  /**
   * Preenche a potência da NBR 5410 nos pontos que estão SEM potência (os
   * criados antes do padrão de 13/09/2026). Nunca sobrescreve o declarado.
   */
  onPreencherPotencias?: () => void;
}) {
  const [novoCircuito, setNovoCircuito] = useState<Record<string, string>>({});
  const cargas = quadroDeCargas(model);
  /**
   * COMO a lista de pontos fora de circuito se agrupa (13/09/2026). Escolha
   * do usuário, persistida; "ambiente" é a sugestão — é como um projeto
   * elétrico se lê (cômodo a cômodo), e é a divisão que a NBR 5410 usa.
   */
  const [agrupamento, setAgrupamento] = usePersistedState<CriterioDeAgrupamento>(
    'blueprint:agruparPontosSoltos',
    CRITERIO_SUGERIDO,
  );
  const gruposDeSoltos = agruparPontos(model, cargas.soltos, agrupamento);
  /**
   * A POTÊNCIA de cada ponto solto (13/09/2026: "incluir coluna com Potência
   * (VA), já que cada ponto vem com VA definido por padrão pela NBR 5410").
   * Lida do terminal, nunca somada em silêncio: ponto sem potência mostra "—"
   * e o grupo diz quantos ficaram fora da soma.
   */
  const potenciaDoPonto = new Map((model.terminais ?? []).map((t) => [t.id, t.potenciaW ?? null]));
  const somaDoGrupo = (itens: readonly { terminalId: string }[]) => {
    let soma = 0;
    let sem = 0;
    for (const s of itens) {
      const p = potenciaDoPonto.get(s.terminalId) ?? null;
      if (p == null) sem++;
      else soma += p;
    }
    return { soma, sem };
  };
  const va = (n: number) => `${n.toLocaleString('pt-BR')} ${UNIDADE_DE_POTENCIA}`;
  /**
   * Quantos pontos a norma sabe valorar e estão sem potência — o LEGADO
   * ("verifique por que alguns pontos não têm potência", 13/09/2026: eram
   * anteriores ao padrão). O botão preenche todos de uma vez.
   */
  const semPotenciaPreenchivel = pontosAPreencher(model, null);
  const botaoPreencher =
    onPreencherPotencias && semPotenciaPreenchivel > 0 ? (
      <button
        type="button"
        onClick={onPreencherPotencias}
        title="Tomadas e luzes sem potência recebem o padrão da NBR 5410 (100/600 VA; luz pelo mínimo do cômodo), e tomadas de banheiro/cozinha abaixo de 600 VA sobem ao mínimo enquanto houver vaga nos três pontos. O resto não é tocado."
        className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
      >
        Preencher potência pela norma ({semPotenciaPreenchivel})
      </button>
    ) : null;
  /**
   * O mini-formulário de "Criar novo…" — para QUAIS pontos e com que nome
   * sugerido. Um só de cada vez: abrir outro fecha o anterior.
   */
  const [criando, setCriando] = useState<{ terminalIds: ObjectId[]; sugestao: string } | null>(null);
  const quadros = model.quadros ?? [];
  /** "C3", ou "C3 — Ambiente 1" quando é o grupo inteiro: o próximo número livre no quadro. */
  const nomeSugerido = (quadroId: ObjectId | undefined, sufixo: string | null) => {
    const n = (model.circuitos ?? []).filter((c) => !quadroId || c.quadroId === quadroId).length + 1;
    return sufixo ? `C${n} — ${sufixo}` : `C${n}`;
  };
  const NOVO = '__novo__';
  /** Só há o que criar com um quadro para o circuito nascer e alguém para criá-lo. */
  const podeCriar = quadros.length > 0 && !!onCriarCircuitoELigar;
  const mesmosIds = (a: readonly ObjectId[], b: readonly ObjectId[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
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
        {botaoPreencher}
        {cargas.pontosSemCircuito > 0 && (
          <p className="text-[11px] text-amber-700">
            E há <strong>{cargas.pontosSemCircuito}</strong>{' '}
            {cargas.pontosSemCircuito === 1 ? 'ponto elétrico' : 'pontos elétricos'} esperando
            circuito:{' '}
            {cargas.soltos
              .map((s) => {
                const p = potenciaDoPonto.get(s.terminalId);
                return p == null ? `${s.rotulo} (sem potência)` : `${s.rotulo} (${va(p)})`;
              })
              .join(', ')}
            .
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
      {botaoPreencher && (
        <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-amber-800">
          <span>
            <strong>{semPotenciaPreenchivel}</strong>{' '}
            {semPotenciaPreenchivel === 1 ? 'ponto' : 'pontos'} sem potência ou abaixo do mínimo da
            norma — anteriores ao padrão, ou criados antes de o cômodo receber o tipo.
          </span>
          {botaoPreencher}
        </p>
      )}
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
            {/* O CRITÉRIO é do usuário (13/09/2026): "ofereça a forma que ele
                quer agrupar; sugira por ambiente e ele decide". */}
            <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-600">
              Agrupar por
              <select
                value={agrupamento}
                onChange={(e) => setAgrupamento(e.target.value as CriterioDeAgrupamento)}
                aria-label="Agrupar os pontos fora de circuito por"
                className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
              >
                {CRITERIOS_DE_AGRUPAMENTO.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_DO_CRITERIO[c]}
                    {c === CRITERIO_SUGERIDO ? ' (sugerido)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {/* As colunas, nomeadas uma vez: ponto · potência · circuito. */}
            <span className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
              <span className="min-w-0 flex-1">Ponto</span>
              <span className="w-16 shrink-0 text-right">Potência</span>
              <span className="w-32 shrink-0">Circuito</span>
            </span>
            <span className="mt-1 block space-y-2">
              {gruposDeSoltos.map((g) => (
                <span key={g.chave} className="block space-y-1">
                  {g.titulo && (
                    <span className="flex items-center gap-1.5 border-b border-amber-200 pb-0.5">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {g.titulo}
                        <span className="ml-1 font-normal normal-case tracking-normal text-slate-500">
                          ({g.itens.length})
                        </span>
                      </span>
                      {/* A SOMA do grupo — e quantos ficaram fora dela. */}
                      {(() => {
                        const { soma, sem } = somaDoGrupo(g.itens);
                        return (
                          <span
                            className="w-16 shrink-0 text-right text-[10px] font-semibold normal-case tabular-nums tracking-normal text-slate-700"
                            title={sem > 0 ? `${sem} sem potência — fora da soma` : 'Soma das potências declaradas'}
                          >
                            {va(soma)}
                            {sem > 0 && <span className="text-amber-700"> ⚠</span>}
                          </span>
                        );
                      })()}
                      {/* Ligar o GRUPO inteiro num gesto: é o caso comum — os
                          pontos de um cômodo vão para o mesmo circuito. */}
                      {(todosOsCircuitos.length > 0 || podeCriar) && g.itens.length > 1 && (
                        <select
                          value=""
                          aria-label={`Circuito de todos em ${g.titulo}`}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            if (e.target.value === NOVO) {
                              setCriando({
                                terminalIds: g.itens.map((s) => s.terminalId),
                                sugestao: nomeSugerido(quadros[0]?.id, g.titulo),
                              });
                              return;
                            }
                            for (const s of g.itens) onLigarAoCircuito?.(s.terminalId, e.target.value);
                          }}
                          className="w-32 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                        >
                          <option value="">Ligar todos a…</option>
                          {todosOsCircuitos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.quadro} · {c.nome}
                            </option>
                          ))}
                          {podeCriar && <option value={NOVO}>Criar novo…</option>}
                        </select>
                      )}
                    </span>
                  )}
                  {criando && g.itens.length > 1 && mesmosIds(criando.terminalIds, g.itens.map((s) => s.terminalId)) && (
                    <FormularioNovoCircuito
                      quadros={quadros}
                      sugestao={criando.sugestao}
                      quantos={criando.terminalIds.length}
                      onCriar={(quadroId, nome) => {
                        onCriarCircuitoELigar?.(quadroId, nome, criando.terminalIds);
                        setCriando(null);
                      }}
                      onCancelar={() => setCriando(null)}
                    />
                  )}
                  {g.itens.map((s) => (
                    <React.Fragment key={s.terminalId}>
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelecionar?.(s.terminalId)}
                        title="Selecionar este ponto no desenho"
                        className="min-w-0 flex-1 truncate text-left text-[11px] text-blue-700 hover:underline"
                      >
                        {s.rotulo}
                      </button>
                      <span
                        className={`w-16 shrink-0 text-right text-[11px] tabular-nums ${
                          potenciaDoPonto.get(s.terminalId) == null ? 'text-amber-700' : 'text-slate-700'
                        }`}
                        title={
                          potenciaDoPonto.get(s.terminalId) == null
                            ? 'Sem potência declarada — informe no painel do ponto'
                            : 'Potência declarada (o padrão da NBR 5410 veio ao criar; editável no ponto)'
                        }
                      >
                        {potenciaDoPonto.get(s.terminalId) == null ? '—' : va(potenciaDoPonto.get(s.terminalId) as number)}
                      </span>
                      {todosOsCircuitos.length === 0 && !podeCriar ? (
                        <span className="shrink-0 text-[10px] text-slate-500">
                          crie um circuito abaixo
                        </span>
                      ) : (
                        <select
                          value=""
                          aria-label={`Circuito de ${s.rotulo}`}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            if (e.target.value === NOVO) {
                              setCriando({ terminalIds: [s.terminalId], sugestao: nomeSugerido(quadros[0]?.id, null) });
                              return;
                            }
                            onLigarAoCircuito?.(s.terminalId, e.target.value);
                          }}
                          className="w-32 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                        >
                          <option value="">Ligar a…</option>
                          {todosOsCircuitos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.quadro} · {c.nome}
                            </option>
                          ))}
                          {/* "Criar novo…" (13/09/2026): o circuito que ainda não existe
                              nasce daqui, sem ir ao quadro criar antes. */}
                          {podeCriar && <option value={NOVO}>Criar novo…</option>}
                        </select>
                      )}
                    </span>
                    {criando && criando.terminalIds.length === 1 && criando.terminalIds[0] === s.terminalId && (
                      <FormularioNovoCircuito
                        quadros={quadros}
                        sugestao={criando.sugestao}
                        quantos={1}
                        onCriar={(quadroId, nome) => {
                          onCriarCircuitoELigar?.(quadroId, nome, criando.terminalIds);
                          setCriando(null);
                        }}
                        onCancelar={() => setCriando(null)}
                      />
                    )}
                    </React.Fragment>
                  ))}
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

/**
 * O mini-formulário de "Criar novo…" (13/09/2026): nome sugerido (o próximo
 * número livre, com o ambiente quando é o grupo inteiro), o quadro quando há
 * mais de um, e "Criar e ligar". Nasce onde o seletor foi acionado — abaixo do
 * ponto ou do cabeçalho do grupo — para não obrigar a procurar o quadro de
 * cargas e voltar.
 */
function FormularioNovoCircuito({
  quadros,
  sugestao,
  quantos,
  onCriar,
  onCancelar,
}: {
  quadros: readonly { id: ObjectId; nome: string }[];
  sugestao: string;
  quantos: number;
  onCriar: (quadroId: ObjectId, nome: string) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(sugestao);
  const [quadroId, setQuadroId] = useState<ObjectId>(quadros[0]?.id ?? '');
  const podeCriar = !!nome.trim() && !!quadroId;
  return (
    <span
      role="group"
      aria-label="Novo circuito"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5"
    >
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && podeCriar) onCriar(quadroId, nome.trim());
          if (e.key === 'Escape') onCancelar();
        }}
        autoFocus
        // Não "Nome do novo circuito": é o rótulo do campo de criar circuito no
        // rodapé de cada quadro, e dois campos com o mesmo nome acessível
        // confundem leitor de tela (e o teste).
        aria-label="Nome do circuito a criar"
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
      />
      {quadros.length > 1 && (
        <select
          value={quadroId}
          onChange={(e) => setQuadroId(e.target.value)}
          aria-label="Quadro do novo circuito"
          className="shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
        >
          {quadros.map((q) => (
            <option key={q.id} value={q.id}>
              {q.nome}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => onCriar(quadroId, nome.trim())}
        disabled={!podeCriar}
        className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
        {quantos > 1 ? `Criar e ligar ${quantos}` : 'Criar e ligar'}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-white"
      >
        Cancelar
      </button>
    </span>
  );
}
