import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Ruler } from 'lucide-react';
import {
  HIPOTESES_PADRAO,
  METODOS_DE_INSTALACAO,
  type HipotesesEletricas,
  type PreDimensionamentoDoCircuito,
} from '../../utils/blueprintEletricaDimensionamento';

/**
 * O PRÉ-DIMENSIONAMENTO na tela — a linha de cada circuito e as hipóteses.
 *
 * ─── ⚠️ CALCULADO AO LADO DO DECLARADO, NUNCA NO LUGAR ──────────────────────
 *
 * O campo "Disj." e o campo "Seção" continuam sendo o que o projetista
 * declarou. Esta linha mostra o que a NBR 5410 pede para a carga declarada —
 * IB, seção mínima, disjuntor que cabe, queda de tensão — e acusa quando o
 * declarado não atende, com o item da norma. "Usar sugerido" preenche o
 * declarado com um clique; ainda assim é ele quem clica.
 *
 * Toda hipótese que muda um número está no painel recolhível abaixo, com o
 * padrão e a tabela de origem. Item 6 (13/09/2026), molde da topografia:
 * pré-dimensionamento com hipóteses declaradas.
 */

const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const mm2 = (v: number) => String(v).replace('.', ',');

export function LinhaPreDimensionamento({
  r,
  hipoteses,
  onUsarSugerido,
}: {
  r: PreDimensionamentoDoCircuito;
  hipoteses: HipotesesEletricas;
  onUsarSugerido?: (campos: { disjuntorA?: number; secaoMm2?: number }) => void;
}) {
  const faltas = r.achados.filter((a) => a.nivel === 'FALTA');
  const cor = faltas.length > 0 ? 'text-red-700' : r.ibA == null ? 'text-slate-400' : 'text-emerald-700';

  if (r.ibA == null) {
    return (
      <div className="px-2 pb-1.5 text-xs text-slate-400" aria-label={`Pré-dimensionamento do circuito ${r.nome}`}>
        Pré-dimensionamento: {r.naoAvaliado.join('; ')}.
      </div>
    );
  }

  const secaoQueVale = r.secaoDeclaradaMm2 ?? r.secaoCalculada?.secaoMm2 ?? null;
  const sugerirSecao = r.secaoCalculada && (r.secaoDeclaradaMm2 == null || r.secaoDeclaradaMm2 < r.secaoCalculada.secaoMm2);
  const sugerirDisj = r.disjuntorSugeridoA != null && r.disjuntorDeclaradoA !== r.disjuntorSugeridoA;

  return (
    <div className="min-w-0 space-y-0.5 break-words px-2 pb-1.5 text-sm" aria-label={`Pré-dimensionamento do circuito ${r.nome}`}>
      <p className={cor}>
        <span className="font-semibold">IB {n1(r.ibA)} A</span>
        {r.pontosSemPotencia > 0 && <span title="há pontos sem potência — IB é um piso"> (≥)</span>}
        {' · '}
        seção mín.{' '}
        {r.secaoCalculada ? (
          <span title={`Iz corrigida ${n1(r.secaoCalculada.izA)} A · critério: ${r.secaoCalculada.criterio === 'USO' ? 'Tab. 47 (uso)' : 'Tab. 36 (corrente)'}`}>
            {mm2(r.secaoCalculada.secaoMm2)} mm²
          </span>
        ) : (
          '—'
        )}
        {' · '}
        In{' '}
        {r.disjuntorSugeridoA != null ? (
          `${r.disjuntorSugeridoA} A`
        ) : (
          <span title="Nenhum disjuntor do catálogo fica entre IB e a capacidade da seção que vai existir — a resposta é a seção, não o disjuntor">
            nenhum cabe na seção
          </span>
        )}
        {r.quedaPct != null && r.comprimento && (
          <>
            {' · '}
            <span title={`${n1(r.comprimento.metros)} m ${r.comprimento.origem === 'ESTIMADO' ? 'estimados em planta' : 'pelos eletrodutos'}${secaoQueVale != null ? ` com ${mm2(secaoQueVale)} mm²` : ''}`}>
              ΔV {n1(r.quedaPct)} %{r.comprimento.origem === 'ESTIMADO' ? ' (est.)' : ''}
            </span>
          </>
        )}
        {onUsarSugerido && (sugerirSecao || sugerirDisj) && (
          <>
            {' '}
            <button
              type="button"
              onClick={() =>
                onUsarSugerido({
                  ...(sugerirSecao && r.secaoCalculada ? { secaoMm2: r.secaoCalculada.secaoMm2 } : {}),
                  ...(sugerirDisj && r.disjuntorSugeridoA != null ? { disjuntorA: r.disjuntorSugeridoA } : {}),
                })
              }
              title="Preenche seção e disjuntor declarados com os sugeridos — quem clica decide"
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              usar sugerido
            </button>
          </>
        )}
      </p>
      {faltas.map((a, i) => (
        <p key={i} className="text-red-700">
          <span className="font-mono text-xs text-red-500">{a.referencia}</span> {a.mensagem}
        </p>
      ))}
      {r.naoAvaliado.length > 0 && (
        <p className="text-slate-400">Fora da avaliação: {r.naoAvaliado.join('; ')}.</p>
      )}
    </div>
  );
}

/** As hipóteses, recolhidas — abrir para editar. */
export function HipotesesDoPreDimensionamento({
  hipoteses,
  onChange,
}: {
  hipoteses: HipotesesEletricas;
  onChange: (h: HipotesesEletricas) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const Seta = aberto ? ChevronDown : ChevronRight;
  const resumo = `${hipoteses.metodoDeInstalacao} · ${hipoteses.temperaturaAmbienteC} °C · ${hipoteses.circuitosAgrupados} circ./eletroduto · ρ ${String(hipoteses.rhoOhmMm2PorM).replace('.', ',')} · ΔV ≤ ${hipoteses.limiteQuedaTerminalPct} %`;
  const campo = 'w-16 rounded border border-slate-300 px-1 py-0.5 text-sm';
  return (
    <div className="rounded-md border border-dashed border-slate-300">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
      >
        <Seta className="h-3 w-3 shrink-0 text-slate-400" />
        <Ruler className="h-3 w-3 shrink-0 text-slate-400" />
        <span className="font-medium">Hipóteses do pré-dimensionamento</span>
        <span className="ml-auto truncate text-xs text-slate-400">{resumo}</span>
      </button>
      {aberto && (
        <div className="space-y-1.5 border-t border-slate-200 px-2 py-2 text-sm text-slate-600">
          <label className="flex items-center justify-between gap-2">
            <span>Método de instalação (Tab. 33/36)</span>
            <select
              value={hipoteses.metodoDeInstalacao}
              onChange={(e) => onChange({ ...hipoteses, metodoDeInstalacao: e.target.value as HipotesesEletricas['metodoDeInstalacao'] })}
              aria-label="Método de instalação"
              className={campo}
            >
              {METODOS_DE_INSTALACAO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Temperatura ambiente, °C (Tab. 40)</span>
            <input type="number" value={hipoteses.temperaturaAmbienteC} onChange={(e) => onChange({ ...hipoteses, temperaturaAmbienteC: Number(e.target.value) })} aria-label="Temperatura ambiente" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Circuitos por eletroduto (Tab. 42)</span>
            <input type="number" min={1} value={hipoteses.circuitosAgrupados} onChange={(e) => onChange({ ...hipoteses, circuitosAgrupados: Math.max(1, Number(e.target.value) || 1) })} aria-label="Circuitos agrupados" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>ρ do cobre, Ω·mm²/m</span>
            <input type="number" step="0.0001" value={hipoteses.rhoOhmMm2PorM} onChange={(e) => onChange({ ...hipoteses, rhoOhmMm2PorM: Number(e.target.value) || HIPOTESES_PADRAO.rhoOhmMm2PorM })} aria-label="Resistividade do cobre" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Queda máxima no terminal, % (6.2.7)</span>
            <input type="number" step="0.5" value={hipoteses.limiteQuedaTerminalPct} onChange={(e) => onChange({ ...hipoteses, limiteQuedaTerminalPct: Number(e.target.value) || HIPOTESES_PADRAO.limiteQuedaTerminalPct })} aria-label="Limite de queda de tensão" className={campo} />
          </label>
          <p className="text-xs text-slate-400">
            Cobre com isolação PVC (Tabela 36); B1 = eletroduto embutido em alvenaria. Disjuntores:{' '}
            {hipoteses.catalogoDeDisjuntoresA.join(', ')} A.{' '}
            <button type="button" onClick={() => onChange(HIPOTESES_PADRAO)} className="text-blue-700 hover:underline">
              Voltar ao padrão
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
