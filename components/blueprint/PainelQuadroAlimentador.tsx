import React from 'react';
import type { ClasseDeDPS, Command, CorrenteDiferencialMa, DispositivoDPS, DRDoQuadro, FaseDoCircuito, LigacaoDoCircuito, ObjectId, PolosDoDR, TipoDeQuadro } from '../../utils/blueprintKernel';
import { CLASSES_DE_DPS, CORRENTES_DIFERENCIAIS_MA, LIGACOES_DO_CIRCUITO, POLOS_DO_DR, ROTULO_DO_TIPO_DE_QUADRO, TIPOS_DE_QUADRO, rotuloDoDPS, rotuloDoDR } from '../../utils/blueprintKernel';
import type { PreDimensionamentoDoQuadro } from '../../utils/blueprintEletricaDimensionamento';
import type { SugestaoDeDR } from '../../utils/blueprintNbr5410';
import { comandosDasSugestoesDeDR } from '../../utils/blueprintNbr5410';
import { Plus, X } from 'lucide-react';

/**
 * QUADRO E ALIMENTADOR (F6, 13/09/2026) — sob a tabela de cada quadro.
 *
 * Linha 1: as DECLARAÇÕES da alimentação (ligação, tensão, metros até a
 * origem). Linha 2: o que sai delas — carga por grupo, demanda (com o nome
 * da tabela), IB do alimentador, seção, disjuntor geral, queda da origem ao
 * pior ponto — e, em quadro trifásico, a carga por fase. Falta em vermelho
 * com a referência; o que não deu para avaliar, dito.
 */
const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const va = (v: number) => `${Math.round(v)} VA`;

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
}: {
  q: PreDimensionamentoDoQuadro;
  ligacaoDeclarada: LigacaoDoCircuito | null;
  tensaoDeclarada: number | null;
  alimentadorM: number | null;
  onQuadro: (campos: { ligacao?: LigacaoDoCircuito | null; tensaoV?: number | null; alimentadorM?: number | null; dps?: DispositivoDPS | null; icnKa?: number | null; tipo?: TipoDeQuadro | null; quadroPaiId?: ObjectId | null }) => void;
  /** Em quadro trifásico: a fase declarada de cada circuito FN, para o select. */
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
}) {
  const faltas = q.achados.filter((a) => a.nivel === 'FALTA');
  const avisos = q.achados.filter((a) => a.nivel === 'AVISO');
  const campo = 'rounded border border-slate-200 px-1.5 py-0.5 text-sm';
  return (
    <div className="space-y-1 border-t border-slate-100 px-2 py-1.5 text-sm" aria-label={`Alimentador do quadro ${q.nome}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500">
        <span className="font-medium text-slate-600">Alimentação</span>
        {/* E4.1: TIPO e quadro-PAI — um QD alimentado pelo QGBT vira linha no quadro de cargas dele. */}
        <select value={tipo ?? 'QD'} onChange={(e) => onQuadro({ tipo: e.target.value === 'QD' ? null : (e.target.value as TipoDeQuadro) })} aria-label={`Tipo do quadro ${q.nome}`} title={ROTULO_DO_TIPO_DE_QUADRO[tipo ?? 'QD']} className={campo}>
          {TIPOS_DE_QUADRO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1" title="O quadro que ALIMENTA este. Sem pai = quadro de entrada (é onde a 6.3.5.2 pede o DPS). O alimentador passa a ser o eletroduto entre os dois, quando lançado">
          de
          <select value={quadroPaiId ?? ''} onChange={(e) => onQuadro({ quadroPaiId: e.target.value || null })} aria-label={`Quadro que alimenta ${q.nome}`} className={campo}>
            <option value="">entrada (sem pai)</option>
            {quadrosDisponiveis.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <select
            value={ligacaoDeclarada ?? ''}
            onChange={(e) => onQuadro({ ligacao: (e.target.value || null) as LigacaoDoCircuito | null })}
            aria-label={`Ligação do quadro ${q.nome}`}
            className={campo}
          >
            <option value="">{q.ligacaoDeduzida ? `deduzida: ${q.ligacao}` : '—'}</option>
            {LIGACOES_DO_CIRCUITO.map((l) => (
              <option key={l} value={l}>
                {l === 'FN' ? 'F-N' : l === 'FF' ? 'F-F' : 'trifásico'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="number"
            value={tensaoDeclarada ?? ''}
            onChange={(e) => onQuadro({ tensaoV: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder={q.tensaoV ? String(q.tensaoV) : 'V'}
            aria-label={`Tensão do quadro ${q.nome}, em volts`}
            className={`w-16 text-right ${campo}`}
          />
          V
        </label>
        <label className="flex items-center gap-1" title="Metros de condutor do medidor (ou do quadro anterior) até este quadro — o medidor não está no desenho">
          alimentador
          <input
            type="number"
            min={0}
            value={alimentadorM ?? ''}
            onChange={(e) => onQuadro({ alimentadorM: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
            placeholder={q.alimentadorOrigem === 'ELETRODUTOS' && q.alimentadorM != null ? `${n1(q.alimentadorM)} (eletroduto)` : 'm'}
            aria-label={`Comprimento do alimentador do quadro ${q.nome}, em metros`}
            className={`w-16 text-right ${campo}`}
          />
          m
        </label>
        {/* E3.3: Icn dos disjuntores do quadro × Ik presumida (hipótese das hipóteses). */}
        <label className="flex items-center gap-1" title={`Capacidade de interrupção dos disjuntores do quadro (NBR NM 60898: 3, 4,5, 6, 10 kA). Tem de ser ≥ à corrente de curto presumida${ikEntradaKa != null ? ` — ${String(ikEntradaKa).replace('.', ',')} kA, hipótese a confirmar com a concessionária` : ''} (5.3.5.5)`}>
          Icn
          <select
            value={icnKa ?? ''}
            onChange={(e) => onQuadro({ icnKa: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label={`Capacidade de interrupção dos disjuntores do quadro ${q.nome}, em kA`}
            className={`${campo} ${ikEntradaKa != null && icnKa != null && icnKa < ikEntradaKa ? 'text-red-700' : ''}`}
          >
            <option value="">—</option>
            {[3, 4.5, 6, 10, 15, 25].map((v) => (
              <option key={v} value={v}>
                {String(v).replace('.', ',')} kA
              </option>
            ))}
          </select>
          {ikEntradaKa != null && <span className="text-xs text-slate-400">Ik {String(ikEntradaKa).replace('.', ',')} kA (hip.)</span>}
        </label>
      </div>

      {/* E4.1: o que este quadro alimenta — cada filho é uma linha no quadro de cargas dele. */}
      {q.filhos.length > 0 && (
        <p className="text-slate-600">
          Alimenta{' '}
          {q.filhos.map((f, i) => (
            <span key={f.quadroId}>
              {i > 0 && ' · '}
              <span className={f.faltas > 0 ? 'text-red-700' : ''}>
                {f.nome} ({va(f.sDemandadaVA)} dem.{f.ibA != null ? ` · IB ${n1(f.ibA)} A` : ''}{f.disjuntorGeralA != null ? ` · geral ${f.disjuntorGeralA} A` : ''})
              </span>
            </span>
          ))}
          {' '}— demanda própria {va(q.sDemandadaPropriaVA)}.
        </p>
      )}
      <p className={faltas.length > 0 ? 'text-red-700' : q.ibA == null ? 'text-slate-400' : 'text-emerald-700'}>
        {va(q.sInstaladaVA)} instalados (luz {va(q.porGrupoVA.ILUMINACAO)} · TUG {va(q.porGrupoVA.TUG)} · força {va(q.porGrupoVA.FORCA)}{q.porGrupoVA.MOTOR ? <> · motores/AC {va(q.porGrupoVA.MOTOR)}</> : null})
        {q.sDemandadaVA !== q.sInstaladaVA && <> · demandados {va(q.sDemandadaVA)} ({q.demanda.nome})</>}
        {q.ibA != null && (
          <>
            {' · '}
            <span className="font-semibold">IB {n1(q.ibA)} A</span>
            {q.secaoCalculada && <> · {String(q.secaoCalculada.secaoMm2).replace('.', ',')} mm²</>}
            {' · geral '}
            {q.disjuntorGeralA != null ? `${q.disjuntorGeralA} A` : '—'}
            {q.quedaTotalMaxPct != null && q.quedaAlimentadorPct != null && (
              <> · ΔV alimentador {n1(q.quedaAlimentadorPct)} % (total {n1(q.quedaTotalMaxPct)} %)</>
            )}
          </>
        )}
      </p>

      {q.fases && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
          <span>
            Fases: R {Math.round(q.fases.R)} · S {Math.round(q.fases.S)} · T {Math.round(q.fases.T)} VA
            {q.desequilibrioPct != null && <> · desequilíbrio {n1(q.desequilibrioPct)} %</>}
          </span>
          {fasesDosCircuitos
            .filter((c) => c.ligacao === 'FN')
            .map((c) => (
              <label key={c.circuitoId} className="flex items-center gap-1">
                {c.nome}
                <select
                  value={c.fase ?? ''}
                  onChange={(e) => onFase(c.circuitoId, (e.target.value || null) as FaseDoCircuito | null)}
                  aria-label={`Fase do circuito ${c.nome}`}
                  className={campo}
                >
                  <option value="">—</option>
                  <option value="R">R</option>
                  <option value="S">S</option>
                  <option value="T">T</option>
                </select>
              </label>
            ))}
        </div>
      )}

      {/* E3.1 — PROTEÇÃO DR: peças do quadro. Cada campo grava; o legado
          (marcado no circuito) aparece e diz como virar peça. Sugestões da
          5.1.3.2.2 com "Adicionar" — sugestão, não decisão. */}
      {(onDR || drs.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600" aria-label={`Proteção DR do quadro ${q.nome}`}>
          <span className="font-medium text-slate-600">Proteção DR</span>
          {drs.length === 0 && <span className="text-slate-400">nenhum</span>}
          {drs.map((d) => {
            const nomes = d.geral ? 'geral do quadro' : d.circuitoIds.map((id) => fasesDosCircuitos.find((c) => c.circuitoId === id)?.nome ?? '?').join(', ') || 'sem circuito';
            if (d.legado || !onDR) {
              return (
                <span key={d.id} className="rounded bg-slate-100 px-1.5 py-0.5" title={d.legado ? 'Declarado no circuito (legado): escolha um DR na coluna DR da tabela para virar peça com In' : undefined}>
                  DR {rotuloDoDR(d)} · {nomes}
                  {d.legado && <span className="text-slate-400"> (no circuito)</span>}
                </span>
              );
            }
            return (
              <span key={d.id} className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5">
                <span>DR</span>
                <select
                  value={d.inA ?? ''}
                  onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, inA: e.target.value === '' ? null : Number(e.target.value) }])}
                  aria-label={`Corrente nominal do DR ${rotuloDoDR(d)} do quadro ${q.nome}`}
                  title="Corrente nominal do DR (catálogo comercial — hipótese). O disjuntor à frente precisa ter In ≤ este valor"
                  className={campo}
                >
                  <option value="">In —</option>
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
                  className={campo}
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
                  className={campo}
                >
                  <option value="">polos —</option>
                  {POLOS_DO_DR.map((p) => (
                    <option key={p} value={p}>
                      {p}P
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1" title="Geral: fica entre o disjuntor geral e o barramento e protege todos os circuitos do quadro">
                  <input type="checkbox" checked={d.geral} onChange={(e) => onDR([{ type: 'SetDRProps', drId: d.id, geral: e.target.checked }])} aria-label={`DR ${rotuloDoDR(d)} geral do quadro ${q.nome}`} className="h-3.5 w-3.5 rounded border-gray-300" />
                  geral
                </label>
                <span className="text-slate-500">{nomes}</span>
                <button type="button" onClick={() => onDR([{ type: 'DeleteDR', drId: d.id }])} aria-label={`Remover DR ${rotuloDoDR(d)} do quadro ${q.nome}`} title="Remover este DR" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
          {onDR && (
            <button
              type="button"
              onClick={() => onDR([{ type: 'AddDR', quadroId: q.quadroId, idnMa: 30, geral: drs.length === 0 && fasesDosCircuitos.length > 0 ? false : false }])}
              className="flex items-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-slate-600 hover:border-slate-400"
              title="Novo DR de 30 mA, sem circuito — escolha os circuitos na coluna DR da tabela, ou marque geral"
            >
              <Plus className="h-3.5 w-3.5" /> DR
            </button>
          )}
          {onDR && sugestoesDeDR.length > 0 && (
            <span className="flex flex-wrap items-center gap-1 text-amber-700">
              <span>5.1.3.2.2 pede:</span>
              {sugestoesDeDR.map((s) => (
                <button
                  key={s.circuitoId}
                  type="button"
                  onClick={() => onDR(comandosDasSugestoesDeDR([s]))}
                  className="rounded border border-amber-300 px-1.5 py-0.5 hover:bg-amber-50"
                  title={`${s.motivo} — adiciona um DR individual de 30 mA${s.inA != null ? ` com In ${s.inA} A (≥ disjuntor do circuito)` : ' (In a declarar: o circuito não tem disjuntor declarado nem sugerido)'}`}
                >
                  {s.nome}: DR {s.inA != null ? `${s.inA} A / ` : ''}30 mA
                </button>
              ))}
              {sugestoesDeDR.length > 1 && (
                <button type="button" onClick={() => onDR(comandosDasSugestoesDeDR(sugestoesDeDR))} className="rounded bg-amber-100 px-1.5 py-0.5 font-medium hover:bg-amber-200">
                  adicionar todos
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {/* E3.2 — DPS: declarado inteiro pelo `onQuadro({ dps })`; sem DPS, o botão
          põe o sugerido (hipótese de catálogo, dita no title) e a exposição
          declarada nas hipóteses aparece ao lado. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600" aria-label={`Proteção contra surtos do quadro ${q.nome}`}>
        <span className="font-medium text-slate-600">DPS</span>
        {dps ? (
          <span className="flex flex-wrap items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5">
            <select value={dps.classe} onChange={(e) => onQuadro({ dps: { ...dps, classe: e.target.value as ClasseDeDPS } })} aria-label={`Classe do DPS do quadro ${q.nome}`} title="Classe de ensaio (IEC 61643-11): I na entrada exposta a raio direto; II no quadro; III junto ao equipamento" className={campo}>
              {CLASSES_DE_DPS.map((c) => (
                <option key={c} value={c}>
                  classe {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="number" min={0} step={5} value={dps.inKa ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, inKa: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })} placeholder="In" aria-label={`Corrente nominal de descarga do DPS do quadro ${q.nome}, em kA`} className={`w-14 text-right ${campo}`} />
              kA
            </label>
            <label className="flex items-center gap-1">
              Up
              <input type="number" min={0} step={0.1} value={dps.upKv ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, upKv: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })} placeholder="kV" aria-label={`Nível de proteção do DPS do quadro ${q.nome}, em kV`} className={`w-14 text-right ${campo}`} />
              kV
            </label>
            <label className="flex items-center gap-1" title="Disjuntor à frente do DPS, pedido pelo fabricante — o DPS em fim de vida vira curto">
              desconexão
              <select value={dps.disjuntorDesconexaoA ?? ''} onChange={(e) => onQuadro({ dps: { ...dps, disjuntorDesconexaoA: e.target.value === '' ? null : Number(e.target.value) } })} aria-label={`Disjuntor de desconexão do DPS do quadro ${q.nome}`} className={campo}>
                <option value="">—</option>
                {catalogoDeDisjuntoresA.map((a) => (
                  <option key={a} value={a}>
                    {a} A
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => onQuadro({ dps: null })} aria-label={`Remover o DPS do quadro ${q.nome}`} title="Remover o DPS" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <>
            <span className="text-slate-400">nenhum</span>
            {dpsSugerido && (
              <button
                type="button"
                onClick={() => onQuadro({ dps: { ...dpsSugerido } })}
                className="flex items-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-slate-600 hover:border-slate-400"
                title={`Adiciona ${rotuloDoDPS(dpsSugerido)} — hipótese de catálogo (classe II no quadro, 6.3.5.2.2; Up pela categoria II da Tab. 31). Confira com o fabricante.`}
              >
                <Plus className="h-3.5 w-3.5" /> DPS sugerido
              </button>
            )}
          </>
        )}
        {exposicao && <span className="text-xs text-slate-400">exposição a descargas: {exposicao}</span>}
      </div>

      {faltas.map((a, i) => (
        <p key={`f${i}`} className="text-red-700">
          <span className="font-mono text-xs text-red-500">{a.referencia}</span> {a.mensagem}
        </p>
      ))}
      {avisos.map((a, i) => (
        <p key={`a${i}`} className="text-amber-700">
          {a.mensagem}
        </p>
      ))}
      {q.naoAvaliado.length > 0 && <p className="text-slate-400">Fora da avaliação: {q.naoAvaliado.join('; ')}.</p>}
    </div>
  );
}
