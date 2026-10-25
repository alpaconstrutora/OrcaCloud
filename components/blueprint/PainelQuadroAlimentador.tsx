import React from 'react';
import type { ClasseDeDPS, Command, CorrenteDiferencialMa, DispositivoDPS, DRDoQuadro, FaseDoCircuito, LigacaoDoCircuito, ObjectId, PolosDoDR, TipoDeQuadro } from '../../utils/blueprintKernel';
import { CLASSES_DE_DPS, CORRENTES_DIFERENCIAIS_MA, LIGACOES_DO_CIRCUITO, POLOS_DO_DR, ROTULO_DO_TIPO_DE_QUADRO, TIPOS_DE_QUADRO, rotuloDoDPS, rotuloDoDR } from '../../utils/blueprintKernel';
import type { PreDimensionamentoDoQuadro } from '../../utils/blueprintEletricaDimensionamento';
import type { SugestaoDeDR } from '../../utils/blueprintNbr5410';
import { comandosDasSugestoesDeDR } from '../../utils/blueprintNbr5410';
import { rotuloDaEntrada, type EntradaDoQuadro } from '../../utils/blueprintEntradaDeEnergia';
import { opcoesDeFase } from '../../utils/blueprintFasesEletricas';
import type { PlanoDeBalanceamento } from '../../utils/blueprintBalanceamento';
import { Gauge, Plug, Plus, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import SecaoTitulo from '../ui/SecaoTitulo';
import Button from '../ui/Button';

/**
 * QUADRO E ALIMENTADOR (F6, 13/09/2026) — sob a tabela de cada quadro.
 *
 * Linha 1: as DECLARAÇÕES da alimentação (ligação, tensão, metros até a
 * origem). Linha 2: o que sai delas — carga por grupo, demanda (com o nome
 * da tabela), IB do alimentador, seção, disjuntor geral, queda da origem ao
 * pior ponto — e, em quadro trifásico, a carga por fase. Falta em vermelho
 * com a referência; o que não deu para avaliar, dito.
 *
 * ─── EM SEÇÕES (25/10/2026, "organize melhor o Quadro de cargas e NBR 5410") ─
 *
 * Era uma linha corrida de selects com rótulo inline ("de", "V", "m", "Icn"),
 * a carga numa frase e os DRs em pílulas que quebravam onde coubesse — os 11
 * DRs da Garden em cinco linhas desalinhadas. Agora é o formulário do §30:
 * Alimentação · Carga e alimentador · Proteção DR · DPS, cada uma com
 * `SecaoTitulo`, campos com rótulo em cima, os resultados como valores com
 * rótulo e os DRs em colunas. Os `aria-label` são os mesmos.
 */
const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const va = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} VA`;
/** O controle do §30, na largura da coluna da grade. */
const CAMPO = 'h-9 w-full rounded-[6px] border border-gray-200 bg-white px-2.5 text-sm text-gray-900';

export default function PainelQuadroAlimentador({
  q,
  ligacaoDeclarada,
  tensaoDeclarada,
  alimentadorM,
  onQuadro,
  fasesDosCircuitos,
  onFase,
  drs = [],
  sugestoesDeDR = [],
  catalogoDeDrA = [],
  onDR,
  dps = null,
  dpsSugerido,
  exposicao,
  catalogoDeDisjuntoresA = [],
  icnKa = null,
  ikEntradaKa,
  tipo = null,
  quadroPaiId = null,
  quadrosDisponiveis = [],
  entrada = null,
  unidadeId = null,
  unidades = [],
  balanceamento,
  onBalancear,
}: {
  q: PreDimensionamentoDoQuadro;
  ligacaoDeclarada: LigacaoDoCircuito | null;
  tensaoDeclarada: number | null;
  alimentadorM: number | null;
  onQuadro: (campos: { ligacao?: LigacaoDoCircuito | null; tensaoV?: number | null; alimentadorM?: number | null; dps?: DispositivoDPS | null; icnKa?: number | null; tipo?: TipoDeQuadro | null; quadroPaiId?: ObjectId | null; unidadeId?: ObjectId | null }) => void;
  /** Em quadro trifásico: a fase declarada de cada circuito F-N e F-F (o F-F grava a 1ª fase do par — `blueprintFasesEletricas.ts`). */
  fasesDosCircuitos: { circuitoId: string; nome: string; ligacao: LigacaoDoCircuito; fase: FaseDoCircuito | null }[];
  onFase: (circuitoId: string, fase: FaseDoCircuito | null) => void;
  /** E3.1: os DRs do quadro (peças + legados), o que a 5.1.3.2.2 ainda pede, o catálogo de In e quem grava. */
  drs?: DRDoQuadro[];
  sugestoesDeDR?: SugestaoDeDR[];
  catalogoDeDrA?: readonly number[];
  onDR?: (comandos: Command[]) => void;
  /** E3.2: o DPS declarado do quadro, o que se sugere quando falta, a exposição (hipótese) e o catálogo de disjuntores. */
  dps?: DispositivoDPS | null;
  dpsSugerido?: DispositivoDPS;
  exposicao?: string;
  catalogoDeDisjuntoresA?: readonly number[];
  /** E3.3: Icn declarada dos disjuntores do quadro e a Ik presumida (hipótese) que ela tem de cobrir. */
  icnKa?: number | null;
  ikEntradaKa?: number;
  /** E4.1: tipo e quadro-pai declarados; os quadros que podem alimentar este (sem ele e sem os descendentes). */
  tipo?: TipoDeQuadro | null;
  quadroPaiId?: ObjectId | null;
  quadrosDisponiveis?: { id: ObjectId; nome: string }[];
  /** E4.3: a entrada de energia deste quadro (só sem pai) — categoria, ramal, geral, pontos no desenho. */
  entrada?: EntradaDoQuadro | null;
  /** E4.4: a unidade que este quadro atende e as unidades do Empreendimento para escolher. */
  unidadeId?: ObjectId | null;
  unidades?: { id: ObjectId; numero: string }[];
  /** E6.1: o plano de balanceamento deste quadro (prévia) e quem aplica o lote (um passo de Ctrl+Z). */
  balanceamento?: PlanoDeBalanceamento;
  onBalancear?: (comandos: Command[]) => void;
}) {
  const [previaAberta, setPreviaAberta] = React.useState(false);
  const faltas = q.achados.filter((a) => a.nivel === 'FALTA');
  const avisos = q.achados.filter((a) => a.nivel === 'AVISO');
  const nomeDoCircuito = (id: string) => fasesDosCircuitos.find((c) => c.circuitoId === id)?.nome ?? '?';
  const drsGerais = drs.filter((d) => d.geral).length;
  const protegidos = (d: DRDoQuadro) => (d.geral ? 'todos os circuitos do quadro' : d.circuitoIds.map(nomeDoCircuito).join(', ') || 'sem circuito');
  /** Os DRs na ordem do que protegem: o geral primeiro, depois pelo número do circuito (C2 antes de C10). */
  const drsEmOrdem = [...drs].sort((a, b) => Number(b.geral) - Number(a.geral) || protegidos(a).localeCompare(protegidos(b), 'pt-BR', { numeric: true }));
  return (
    <div className="space-y-8 text-sm" aria-label={`Alimentador do quadro ${q.nome}`}>
      {/* ── ALIMENTAÇÃO: as declarações de onde vem a energia (E4.1 tipo/pai, E4.4 unidade, F6, E3.3 Icn). ── */}
      <section className="space-y-4">
        <SecaoTitulo icon={Plug} titulo="Alimentação" resumo={quadroPaiId ? `alimentado por ${quadrosDisponiveis.find((x) => x.id === quadroPaiId)?.nome ?? 'outro quadro'}` : 'quadro de entrada'} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Campo rotulo="Tipo">
            <select value={tipo ?? 'QD'} onChange={(e) => onQuadro({ tipo: e.target.value === 'QD' ? null : (e.target.value as TipoDeQuadro) })} aria-label={`Tipo do quadro ${q.nome}`} title={ROTULO_DO_TIPO_DE_QUADRO[tipo ?? 'QD']} className={CAMPO}>
              {TIPOS_DE_QUADRO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          {/* E4.1: um QD alimentado pelo QGBT vira linha no quadro de cargas dele. */}
          <Campo rotulo="Alimentado por" dica="O quadro que alimenta este. Sem pai = quadro de entrada (é onde a 6.3.5.2 pede o DPS). O alimentador passa a ser o eletroduto entre os dois, quando lançado">
            <select value={quadroPaiId ?? ''} onChange={(e) => onQuadro({ quadroPaiId: e.target.value || null })} aria-label={`Quadro que alimenta ${q.nome}`} className={CAMPO}>
              <option value="">entrada (sem pai)</option>
              {quadrosDisponiveis.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </Campo>
          {/* E4.4: a UNIDADE que este quadro atende — no pai, entra com o fator de diversidade. */}
          {unidades.length > 0 && (
            <Campo rotulo="Unidade" dica="A unidade do Empreendimento que este quadro atende. No quadro que alimenta este, as unidades entram com o fator de diversidade; sem unidade é serviço/comum">
              <select value={unidadeId ?? ''} onChange={(e) => onQuadro({ unidadeId: e.target.value || null })} aria-label={`Unidade atendida pelo quadro ${q.nome}`} className={CAMPO}>
                <option value="">— (serviço)</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.numero}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Ligação">
            <select value={ligacaoDeclarada ?? ''} onChange={(e) => onQuadro({ ligacao: (e.target.value || null) as LigacaoDoCircuito | null })} aria-label={`Ligação do quadro ${q.nome}`} className={CAMPO}>
              <option value="">{q.ligacaoDeduzida ? `deduzida: ${q.ligacao}` : '—'}</option>
              {LIGACOES_DO_CIRCUITO.map((l) => (
                <option key={l} value={l}>
                  {l === 'FN' ? 'F-N' : l === 'FF' ? 'F-F' : 'trifásico'}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Tensão (V)">
            <input
              type="number"
              value={tensaoDeclarada ?? ''}
              onChange={(e) => onQuadro({ tensaoV: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder={q.tensaoV ? String(q.tensaoV) : ''}
              aria-label={`Tensão do quadro ${q.nome}, em volts`}
              className={`${CAMPO} text-right`}
            />
          </Campo>
          <Campo rotulo="Alimentador (m)" dica="Metros de condutor do medidor (ou do quadro anterior) até este quadro — o medidor não está no desenho">
            <input
              type="number"
              min={0}
              value={alimentadorM ?? ''}
              onChange={(e) => onQuadro({ alimentadorM: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              placeholder={q.alimentadorOrigem === 'ELETRODUTOS' && q.alimentadorM != null ? `${n1(q.alimentadorM)} (eletroduto)` : ''}
              aria-label={`Comprimento do alimentador do quadro ${q.nome}, em metros`}
              className={`${CAMPO} text-right`}
            />
          </Campo>
          {/* E3.3: Icn dos disjuntores do quadro × Ik presumida (hipótese das hipóteses). */}
          <Campo
            rotulo="Icn dos disjuntores"
            dica={`Capacidade de interrupção dos disjuntores do quadro (NBR NM 60898: 3, 4,5, 6, 10 kA). Tem de ser ≥ à corrente de curto presumida${ikEntradaKa != null ? ` — ${String(ikEntradaKa).replace('.', ',')} kA, hipótese a confirmar com a concessionária` : ''} (5.3.5.5)`}
            nota={ikEntradaKa != null ? `Ik presumida ${String(ikEntradaKa).replace('.', ',')} kA (hipótese)` : undefined}
          >
            <select
              value={icnKa ?? ''}
              onChange={(e) => onQuadro({ icnKa: e.target.value === '' ? null : Number(e.target.value) })}
              aria-label={`Capacidade de interrupção dos disjuntores do quadro ${q.nome}, em kA`}
              className={`${CAMPO} ${ikEntradaKa != null && icnKa != null && icnKa < ikEntradaKa ? 'text-red-700' : ''}`}
            >
              <option value="">—</option>
              {[3, 4.5, 6, 10, 15, 25].map((v) => (
                <option key={v} value={v}>
                  {String(v).replace('.', ',')} kA
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {/* E4.3: a ENTRADA — padrão da concessionária (hipótese, dito), categoria pela demanda, e os pontos no desenho. */}
        {entrada && (
          <p className={entrada.achados.some((a) => a.nivel === 'FALTA') ? 'text-red-700' : 'text-gray-700'} title={entrada.padrao.conferir}>
            <span className="font-semibold text-gray-900">Entrada de energia:</span> {rotuloDaEntrada(entrada)}
            {entrada.achados.map((a, i) => (
              <span key={i} className={a.nivel === 'FALTA' ? 'text-red-700' : 'text-amber-700'}>
                {' · '}
                {a.mensagem}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* ── CARGA E ALIMENTADOR: o que sai das declarações (F6) — carga, demanda, IB, seção, geral, queda. ── */}
      <section className="space-y-4">
        <SecaoTitulo icon={Gauge} titulo="Carga e alimentador" resumo={q.sDemandadaVA !== q.sInstaladaVA ? q.demanda.nome : undefined} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
          <Valor
            rotulo="Instalada"
            valor={va(q.sInstaladaVA)}
            detalhe={`luz ${va(q.porGrupoVA.ILUMINACAO)} · TUG ${va(q.porGrupoVA.TUG)} · força ${va(q.porGrupoVA.FORCA)}${q.porGrupoVA.MOTOR ? ` · motores/AC ${va(q.porGrupoVA.MOTOR)}` : ''}`}
          />
          <Valor rotulo="Demandada" valor={va(q.sDemandadaVA)} detalhe={q.sDemandadaVA !== q.sInstaladaVA ? q.demanda.nome : 'sem fator de demanda'} />
          <Valor rotulo="IB do alimentador" valor={q.ibA != null ? `${n1(q.ibA)} A` : '—'} destaque={q.ibA != null} />
          <Valor rotulo="Seção" valor={q.secaoCalculada ? `${String(q.secaoCalculada.secaoMm2).replace('.', ',')} mm²` : '—'} />
          <Valor rotulo="Disjuntor geral" valor={q.disjuntorGeralA != null ? `${q.disjuntorGeralA} A` : '—'} />
          <Valor
            rotulo="Queda de tensão"
            valor={q.quedaAlimentadorPct != null ? `${n1(q.quedaAlimentadorPct)} %` : '—'}
            detalhe={q.quedaTotalMaxPct != null ? `total ${n1(q.quedaTotalMaxPct)} % · limite ${n1(q.limiteQuedaEfetivoPct)} %` : `limite ${n1(q.limiteQuedaEfetivoPct)} %`}
            alerta={q.quedaTotalMaxPct != null && q.quedaTotalMaxPct > q.limiteQuedaEfetivoPct}
          />
        </dl>
        {/* E4.2: a cadeia até a origem, quando este quadro é alimentado por outro. */}
        {q.ibA != null && q.quedaTotalMaxPct != null && q.cadeia.length > 1 && (
          <p className="text-gray-600" title="Queda até a origem: a soma dos alimentadores de cada quadro acima deste (6.2.7.1)">
            <span className="font-semibold text-gray-900">Queda até a origem:</span> {q.cadeia.map((e) => `${e.nome} ${e.quedaAlimentadorPct == null ? '—' : n1(e.quedaAlimentadorPct)} %`).join(' + ')}
          </p>
        )}
        {/* E4.4: uso coletivo — a conta da diversidade, com a hipótese dita. */}
        {q.unidadesAtendidas > 0 && (
          <p className="text-gray-700" title="Demanda das unidades = Σ das demandas dos quadros de unidade × fator de diversidade (hipótese escolhida em Hipóteses); o resto é serviço">
            <span className="font-semibold text-gray-900">Uso coletivo:</span> {q.unidadesAtendidas} unidade(s) × fator {String(q.fatorDeDiversidade).replace('.', ',')} = {va(q.sDemandadaUnidadesVA)} + serviço {va(q.sDemandadaServicoVA)}
            {entrada && entrada.unidadesAtendidas.length > 0 && <> · medidores: {entrada.unidadesMedidas.length}/{entrada.unidadesAtendidas.length}</>}
          </p>
        )}
        {/* E4.1: o que este quadro alimenta — cada filho é uma linha no quadro de cargas dele. */}
        {q.filhos.length > 0 && (
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Alimenta:</span>{' '}
            {q.filhos.map((f, i) => (
              <span key={f.quadroId}>
                {i > 0 && ' · '}
                <span className={f.faltas > 0 ? 'text-red-700' : ''}>
                  {f.nome}{f.unidade ? ` (un. ${f.unidade})` : ''} ({va(f.sDemandadaVA)} dem.{f.ibA != null ? ` · IB ${n1(f.ibA)} A` : ''}{f.disjuntorGeralA != null ? ` · geral ${f.disjuntorGeralA} A` : ''})
                </span>
              </span>
            ))}
            {' '}— demanda própria {va(q.sDemandadaPropriaVA)}.
          </p>
        )}

        {q.fases && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-gray-700">
                <span className="font-semibold text-gray-900">Fases:</span> R {va(q.fases.R)} · S {va(q.fases.S)} · T {va(q.fases.T)}
                {q.desequilibrioPct != null && <> · desequilíbrio {n1(q.desequilibrioPct)} %</>}
              </p>
              {/* E6.1 — BALANCEAR: abre a prévia (antes → depois, quem muda); só "Aplicar" grava, num lote. */}
              {onBalancear && balanceamento && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviaAberta((v) => !v)}
                  disabled={!balanceamento.ok}
                  aria-expanded={balanceamento.ok ? previaAberta : undefined}
                  title={balanceamento.ok ? 'Distribuir os circuitos F-N e F-F entre R, S e T — mostra a prévia antes de gravar' : balanceamento.motivo}
                >
                  Balancear
                </Button>
              )}
            </div>
            {fasesDosCircuitos.some((c) => c.ligacao !== 'FFF') && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                {fasesDosCircuitos
                  .filter((c) => c.ligacao !== 'FFF')
                  // Na ordem do número do circuito (C2 antes de C10), como a tabela de circuitos.
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
                  .map((c) => (
                    <Campo key={c.circuitoId} rotulo={c.nome}>
                      <select
                        value={c.fase ?? ''}
                        onChange={(e) => onFase(c.circuitoId, (e.target.value || null) as FaseDoCircuito | null)}
                        aria-label={`Fase do circuito ${c.nome}`}
                        title={c.ligacao === 'FF' ? 'Circuito F-F ocupa duas fases — escolha o par' : 'Fase do circuito F-N'}
                        className={CAMPO}
                      >
                        <option value="">—</option>
                        {opcoesDeFase(c.ligacao).map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.rotulo}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  ))}
              </div>
            )}
          </div>
        )}

        {previaAberta && onBalancear && balanceamento?.ok && (
          <div data-testid="previa-balanceamento" aria-label={`Prévia do balanceamento do quadro ${q.nome}`} className="space-y-2 rounded-[6px] border border-blue-200 bg-blue-50 px-3 py-2.5 text-gray-700">
            <p>
              Desequilíbrio {balanceamento.antesPct == null ? '—' : `${n1(balanceamento.antesPct)} %`}
              {balanceamento.semFaseAntes.length > 0 && <span className="text-gray-500"> (sem contar {balanceamento.semFaseAntes.length} sem fase)</span>}
              {' → '}
              <span className="font-semibold">{n1(balanceamento.depoisPct)} %</span> (limite {n1(balanceamento.limitePct)} %) · R {va(balanceamento.depois.R)} · S {va(balanceamento.depois.S)} · T {va(balanceamento.depois.T)}
            </p>
            <p className="text-gray-600">{balanceamento.mudancas.map((m) => `${m.nome}: ${m.de ?? '—'} → ${m.para}`).join(' · ')}</p>
            {balanceamento.depoisPct > balanceamento.limitePct && (
              <p className="text-amber-700">Nem o melhor arranjo cabe no limite: um circuito grande domina uma fase. Divida a carga dele ou passe-o para F-F/F-F-F.</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onBalancear(balanceamento.comandos);
                  setPreviaAberta(false);
                }}
                title="Grava as fases num passo só — Ctrl+Z desfaz"
              >
                Aplicar ({balanceamento.mudancas.length} {balanceamento.mudancas.length === 1 ? 'circuito' : 'circuitos'})
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setPreviaAberta(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {(faltas.length > 0 || avisos.length > 0 || q.naoAvaliado.length > 0) && (
          <ul className="space-y-1">
            {faltas.map((a, i) => (
              <li key={`f${i}`} className="text-red-700">
                <span className="font-mono text-xs text-red-500">{a.referencia}</span> {a.mensagem}
              </li>
            ))}
            {avisos.map((a, i) => (
              <li key={`a${i}`} className="text-amber-700">
                {a.mensagem}
              </li>
            ))}
            {q.naoAvaliado.length > 0 && <li className="text-gray-500">Fora da avaliação: {q.naoAvaliado.join('; ')}.</li>}
          </ul>
        )}
      </section>

      {/* ── PROTEÇÃO DR (E3.1): uma linha por DR, colunas alinhadas. Cada campo grava; o legado (marcado no
          circuito) aparece e diz como virar peça. Sugestões da 5.1.3.2.2 com "Adicionar" — sugestão, não decisão. ── */}
      {(onDR || drs.length > 0) && (
        <section className="space-y-4" aria-label={`Proteção DR do quadro ${q.nome}`}>
          <SecaoTitulo
            icon={ShieldCheck}
            titulo="Proteção DR"
            resumo={drs.length === 0 ? 'nenhum' : `${drs.length} ${drs.length === 1 ? 'DR' : 'DRs'}${drsGerais > 0 ? ` · ${drsGerais} geral` : ''}`}
            acoes={
              onDR && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onDR([{ type: 'AddDR', quadroId: q.quadroId, idnMa: 30, geral: false }])}
                  title="Novo DR de 30 mA, sem circuito — escolha os circuitos na coluna DR da tabela, ou marque geral"
                >
                  <Plus className="h-3.5 w-3.5" /> DR
                </Button>
              )
            }
          />
          {drs.length > 0 && (
            <div className="grid max-w-4xl grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] items-center gap-x-4 gap-y-2">
              <span className="text-xs font-semibold text-slate-500">Protege</span>
              <span className="text-xs font-semibold text-slate-500">In</span>
              <span className="text-xs font-semibold text-slate-500">IΔn</span>
              <span className="text-xs font-semibold text-slate-500">Polos</span>
              <span className="text-xs font-semibold text-slate-500">Geral</span>
              <span />
              {drsEmOrdem.map((d) => {
                const nomes = protegidos(d);
                if (d.legado || !onDR) {
                  return (
                    <React.Fragment key={d.id}>
                      <span className="truncate text-gray-900" title={d.legado ? 'Declarado no circuito (legado): escolha um DR na coluna DR da tabela para virar peça com In' : nomes}>
                        {nomes}
                        {d.legado && <span className="text-gray-500"> (no circuito)</span>}
                      </span>
                      <span className="col-span-4 text-gray-700">DR {rotuloDoDR(d)}</span>
                      <span />
                    </React.Fragment>
                  );
                }
                return (
                  <React.Fragment key={d.id}>
                    <span className="truncate text-gray-900" title={nomes}>
                      {nomes}
                    </span>
                    <select
                      value={d.inA ?? ''}
                      onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, inA: e.target.value === '' ? null : Number(e.target.value) }])}
                      aria-label={`Corrente nominal do DR ${rotuloDoDR(d)} do quadro ${q.nome}`}
                      title="Corrente nominal do DR (catálogo comercial — hipótese). O disjuntor à frente precisa ter In ≤ este valor"
                      className={`${CAMPO} w-24`}
                    >
                      <option value="">—</option>
                      {catalogoDeDrA.map((a) => (
                        <option key={a} value={a}>
                          {a} A
                        </option>
                      ))}
                    </select>
                    <select
                      value={d.idnMa}
                      onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, idnMa: Number(e.target.value) as CorrenteDiferencialMa }])}
                      aria-label={`Sensibilidade do DR ${rotuloDoDR(d)} do quadro ${q.nome}`}
                      title="IΔn: 30 mA protege pessoas (5.1.3.2.2); 100–500 mA só contra incêndio"
                      className={`${CAMPO} w-24`}
                    >
                      {CORRENTES_DIFERENCIAIS_MA.map((ma) => (
                        <option key={ma} value={ma}>
                          {ma} mA
                        </option>
                      ))}
                    </select>
                    <select
                      value={d.polos ?? ''}
                      onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, polos: e.target.value === '' ? null : (Number(e.target.value) as PolosDoDR) }])}
                      aria-label={`Polos do DR ${rotuloDoDR(d)} do quadro ${q.nome}`}
                      className={`${CAMPO} w-20`}
                    >
                      <option value="">—</option>
                      {POLOS_DO_DR.map((p) => (
                        <option key={p} value={p}>
                          {p}P
                        </option>
                      ))}
                    </select>
                    <span className="flex justify-center" title="Geral: fica entre o disjuntor geral e o barramento e protege todos os circuitos do quadro">
                      <input type="checkbox" checked={d.geral} onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, geral: e.target.checked }])} aria-label={`DR ${rotuloDoDR(d)} geral do quadro ${q.nome}`} className="h-4 w-4 rounded border-gray-300" />
                    </span>
                    <button type="button" onClick={() => onDR([{ type: 'DeleteDR', drId: d.id }])} aria-label={`Remover DR ${rotuloDoDR(d)} do quadro ${q.nome}`} title="Remover este DR" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-700">
                      <X className="h-4 w-4" />
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {onDR && sugestoesDeDR.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <span className="font-medium">A 5.1.3.2.2 pede DR de 30 mA em:</span>
              {sugestoesDeDR.map((s) => (
                <button
                  key={s.circuitoId}
                  type="button"
                  onClick={() => onDR(comandosDasSugestoesDeDR([s]))}
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100"
                  title={`${s.motivo} — adiciona um DR individual de 30 mA${s.inA != null ? ` com In ${s.inA} A (≥ disjuntor do circuito)` : ' (In a declarar: o circuito não tem disjuntor declarado nem sugerido)'}`}
                >
                  {s.nome}: DR {s.inA != null ? `${s.inA} A / ` : ''}30 mA
                </button>
              ))}
              {sugestoesDeDR.length > 1 && (
                <button type="button" onClick={() => onDR(comandosDasSugestoesDeDR(sugestoesDeDR))} className="rounded bg-amber-200 px-2 py-0.5 font-medium hover:bg-amber-300">
                  adicionar todos
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── DPS (E3.2): declarado inteiro pelo `onQuadro({ dps })`; sem DPS, o botão põe o sugerido (hipótese de
          catálogo, dita no title) e a exposição declarada nas hipóteses vai no resumo do título. ── */}
      <section className="space-y-4" aria-label={`Proteção contra surtos do quadro ${q.nome}`}>
        <SecaoTitulo
          icon={ShieldAlert}
          titulo="Proteção contra surtos (DPS)"
          resumo={exposicao ? `exposição a descargas: ${exposicao}` : undefined}
          acoes={
            dps ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onQuadro({ dps: null })} aria-label={`Remover o DPS do quadro ${q.nome}`} title="Remover o DPS">
                <X className="h-3.5 w-3.5" /> Remover
              </Button>
            ) : (
              dpsSugerido && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onQuadro({ dps: { ...dpsSugerido } })}
                  title={`Adiciona ${rotuloDoDPS(dpsSugerido)} — hipótese de catálogo (classe II no quadro, 6.3.5.2.2; Up pela categoria II da Tab. 31). Confira com o fabricante.`}
                >
                  <Plus className="h-3.5 w-3.5" /> DPS sugerido
                </Button>
              )
            )
          }
        />
        {dps ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <Campo rotulo="Classe" dica="Classe de ensaio (IEC 61643-11): I na entrada exposta a raio direto; II no quadro; III junto ao equipamento">
              <select value={dps.classe} onChange={(e) => onQuadro({ dps: { ...dps, classe: e.target.value as ClasseDeDPS } })} aria-label={`Classe do DPS do quadro ${q.nome}`} className={CAMPO}>
                {CLASSES_DE_DPS.map((c) => (
                  <option key={c} value={c}>
                    classe {c}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="In (kA)">
              <input type="number" min={0} step={5} value={dps.inKa ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, inKa: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })} placeholder="kA" aria-label={`Corrente nominal de descarga do DPS do quadro ${q.nome}, em kA`} className={`${CAMPO} text-right`} />
            </Campo>
            <Campo rotulo="Up (kV)">
              <input type="number" min={0} step={0.1} value={dps.upKv ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, upKv: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })} placeholder="kV" aria-label={`Nível de proteção do DPS do quadro ${q.nome}, em kV`} className={`${CAMPO} text-right`} />
            </Campo>
            <Campo rotulo="Disjuntor de desconexão" dica="Disjuntor à frente do DPS, pedido pelo fabricante — o DPS em fim de vida vira curto">
              <select value={dps.disjuntorDesconexaoA ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, disjuntorDesconexaoA: e.target.value === '' ? null : Number(e.target.value) } })} aria-label={`Disjuntor de desconexão do DPS do quadro ${q.nome}`} className={CAMPO}>
                <option value="">—</option>
                {catalogoDeDisjuntoresA.map((a) => (
                  <option key={a} value={a}>
                    {a} A
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        ) : (
          <p className="text-gray-500">Nenhum DPS declarado neste quadro.</p>
        )}
      </section>
    </div>
  );
}

/** O campo do §30: rótulo em cima (6px), o controle na largura da coluna, a nota (hipótese) embaixo. */
function Campo({ rotulo, dica, nota, children }: { rotulo: string; dica?: string; nota?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5" title={dica}>
      <span className="block truncate text-xs font-semibold text-slate-500">{rotulo}</span>
      {children}
      {nota && <span className="block text-xs text-gray-500">{nota}</span>}
    </label>
  );
}

/** Um resultado do cálculo: rótulo em cima, o valor, e o detalhe que o explica. */
function Valor({ rotulo, valor, detalhe, destaque = false, alerta = false }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className="space-y-1.5">
      <dt className="text-xs font-semibold text-slate-500">{rotulo}</dt>
      <dd className={`text-base font-semibold tabular-nums ${alerta ? 'text-red-700' : destaque ? 'text-emerald-700' : 'text-gray-900'}`}>{valor}</dd>
      {detalhe && <dd className="text-xs text-gray-500">{detalhe}</dd>}
    </div>
  );
}
