import React from 'react';
import type { FaseDoCircuito, LigacaoDoCircuito } from '../../utils/blueprintKernel';
import { LIGACOES_DO_CIRCUITO } from '../../utils/blueprintKernel';
import type { PreDimensionamentoDoQuadro } from '../../utils/blueprintEletricaDimensionamento';

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
}: {
  q: PreDimensionamentoDoQuadro;
  ligacaoDeclarada: LigacaoDoCircuito | null;
  tensaoDeclarada: number | null;
  alimentadorM: number | null;
  onQuadro: (campos: { ligacao?: LigacaoDoCircuito | null; tensaoV?: number | null; alimentadorM?: number | null }) => void;
  /** Em quadro trifásico: a fase declarada de cada circuito FN, para o select. */
  fasesDosCircuitos: { circuitoId: string; nome: string; ligacao: LigacaoDoCircuito; fase: FaseDoCircuito | null }[];
  onFase: (circuitoId: string, fase: FaseDoCircuito | null) => void;
}) {
  const faltas = q.achados.filter((a) => a.nivel === 'FALTA');
  const avisos = q.achados.filter((a) => a.nivel === 'AVISO');
  const campo = 'rounded border border-slate-200 px-1 py-0 text-[10px]';
  return (
    <div className="space-y-1 border-t border-slate-100 px-2 py-1.5 text-[10px]" aria-label={`Alimentador do quadro ${q.nome}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500">
        <span className="font-medium text-slate-600">Alimentação</span>
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
            className={`w-12 text-right ${campo}`}
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
            placeholder="m"
            aria-label={`Comprimento do alimentador do quadro ${q.nome}, em metros`}
            className={`w-12 text-right ${campo}`}
          />
          m
        </label>
      </div>

      <p className={faltas.length > 0 ? 'text-red-700' : q.ibA == null ? 'text-slate-400' : 'text-emerald-700'}>
        {va(q.sInstaladaVA)} instalados (luz {va(q.porGrupoVA.ILUMINACAO)} · TUG {va(q.porGrupoVA.TUG)} · força {va(q.porGrupoVA.FORCA)})
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

      {faltas.map((a, i) => (
        <p key={`f${i}`} className="text-red-700">
          <span className="font-mono text-[9px] text-red-500">{a.referencia}</span> {a.mensagem}
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
