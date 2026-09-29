/**
 * ÁGUAS PLUVIAIS — a contribuição (29/09/2026, E6.1 do roadmap
 * hidrossanitário, NBR 10844): de onde vem a intensidade (informada, tabela
 * pela cidade ou os 150 mm/h de até 100 m²), a área de contribuição de cada
 * água do telhado e de cada laje descoberta e a vazão de projeto. As premissas
 * são do estudo.
 */
import React from 'react';
import {
  INTENSIDADE_POR_CIDADE,
  PERIODOS_DE_RETORNO,
  type ContribuicaoPluvial,
  type HipotesesPluviais,
  type PeriodoDeRetorno,
} from '../../utils/blueprintPluvial';

interface Props {
  c: ContribuicaoPluvial;
  hip: HipotesesPluviais;
  onHip: (h: HipotesesPluviais) => void;
  onSelecionar: (ids: string[]) => void;
}

const m2 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const lmin = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L/min`;
const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

const ORIGEM: Record<NonNullable<ContribuicaoPluvial['origem']>, string> = {
  INFORMADA: 'informada no estudo',
  TABELA: 'tabela da NBR 10844 pela cidade — confira o valor na norma',
  ATE_100M2: 'até 100 m² de projeção: 150 mm/h (NBR 10844, 5.1.4)',
};

const PERIODO: Record<PeriodoDeRetorno, string> = {
  1: '1 ano — áreas pavimentadas onde empoçar é tolerável',
  5: '5 anos — coberturas e terraços',
  25: '25 anos — onde não se tolera extravasamento',
};

export default function PainelPluvial({ c, hip, onHip, onSelecionar }: Props) {
  const cidades = Object.keys(INTENSIDADE_POR_CIDADE).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return (
    <div className="space-y-3" data-testid="pluvial">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Cidade
          <select value={hip.cidade ?? ''} onChange={(e) => onHip({ ...hip, cidade: e.target.value || null })} aria-label="Cidade da tabela de intensidades" className={campo}>
            <option value="">— nenhuma —</option>
            {cidades.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Período de retorno
          <select value={hip.periodoDeRetornoAnos} onChange={(e) => onHip({ ...hip, periodoDeRetornoAnos: Number(e.target.value) as PeriodoDeRetorno })} aria-label="Período de retorno" className={campo}>
            {PERIODOS_DE_RETORNO.map((t) => (
              <option key={t} value={t}>{PERIODO[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Intensidade (mm/h)
          <input
            type="number"
            min={0}
            step={1}
            value={hip.intensidadeMmH ?? ''}
            placeholder="da tabela"
            onChange={(e) => {
              const n = Number(e.target.value.replace(',', '.'));
              onHip({ ...hip, intensidadeMmH: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null });
            }}
            aria-label="Intensidade pluviométrica informada, em mm/h (vazio = tabela)"
            className={`w-24 ${campo}`}
          />
        </label>
      </div>

      {c.pendencias.map((p) => (
        <p key={p} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="pluvial-pendencia">
          {p}
        </p>
      ))}

      {c.intensidadeMmH != null && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700" data-testid="pluvial-intensidade">
          I = <strong className="tabular-nums">{c.intensidadeMmH} mm/h</strong> — {ORIGEM[c.origem!]}
        </p>
      )}

      {c.superficies.length > 0 && (
        <table className="w-full text-xs" data-testid="pluvial-superficies">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Superfície</th>
              <th className="py-1 pr-2 text-right font-medium">Projeção</th>
              <th className="py-1 pr-2 text-right font-medium">i</th>
              <th className="py-1 pr-2 text-right font-medium">Contribuição</th>
              <th className="py-1 text-right font-medium">Vazão</th>
            </tr>
          </thead>
          <tbody>
            {c.superficies.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 text-slate-700">
                <td className="py-1.5 pr-2">
                  <button type="button" onClick={() => onSelecionar([s.id])} className="text-left text-blue-700 hover:underline">
                    {s.rotulo}
                  </button>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{m2(s.areaProjecaoM2)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s.inclinacaoPct.toLocaleString('pt-BR')} %</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{m2(s.areaContribuicaoM2)}</td>
                <td className="py-1.5 text-right tabular-nums">{s.vazaoLMin != null ? lmin(s.vazaoLMin) : '—'}</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-800">
              <td className="py-1.5 pr-2">Total</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{m2(c.areaProjecaoTotalM2)}</td>
              <td />
              <td className="py-1.5 pr-2 text-right tabular-nums">{m2(c.areaContribuicaoTotalM2)}</td>
              <td className="py-1.5 text-right tabular-nums" data-testid="pluvial-vazao-total">{c.vazaoTotalLMin != null ? lmin(c.vazaoTotalLMin) : '—'}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-slate-500">
        Área de contribuição (NBR 10844, 5.2): a projeção mais metade da altura da água — A = Ap·(1 + i/2); a laje
        descoberta conta a projeção. As paredes que interceptam a chuva não entram. Vazão: Q = I·A/60. Calhas e
        condutores vêm nas próximas fases.
      </p>
    </div>
  );
}
