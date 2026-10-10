import React from 'react';
import { DESCRICAO_HIPOTESES_INDICADORES, HIPOTESES_INDICADORES_PADRAO } from '../../utils/opuraMarketIndicadores';
import type { MarketIndicadores } from '../../hooks/useMarketIndicadores';

/**
 * Hipóteses de Saturação e Score Potencial (plano 2026-10-10, item 3), no mesmo
 * desenho do bloco "Hipóteses do cálculo" da Fase 5. Mudou, os números do bairro
 * são refeitos na hora; "Salvar para a praça" grava para a organização + cidade.
 */
export default function MarketHipotesesIndicadores({ ind }: { ind: MarketIndicadores }) {
  const { hipoteses, setHipoteses, gravadas, erros, salvar, salvando, motivoSalvar } = ind;
  const foraDoPadrao = DESCRICAO_HIPOTESES_INDICADORES.filter((d) => hipoteses[d.chave] !== HIPOTESES_INDICADORES_PADRAO[d.chave]).length;
  return (
    <details className="border border-slate-100 rounded-xl bg-slate-50/50" open={erros.length > 0 || undefined}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600">
        Hipóteses dos indicadores{foraDoPadrao > 0 ? ` · ${foraDoPadrao} fora do padrão` : ' · padrão'}
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-3">
          {DESCRICAO_HIPOTESES_INDICADORES.map((d) => (
            <div key={d.chave} className="space-y-1.5" title={d.explicacao}>
              <label className="block text-[11px] font-semibold text-slate-500 leading-tight">
                {d.rotulo} <span className="font-normal text-slate-400">({d.unidade})</span>
              </label>
              <input
                type="number"
                step={d.passo}
                min={d.min}
                max={d.max}
                value={Number.isFinite(hipoteses[d.chave]) ? hipoteses[d.chave] : ''}
                onChange={(e) => setHipoteses((h) => ({ ...h, [d.chave]: e.target.value === '' ? Number.NaN : Number(e.target.value) }))}
                className={`w-full px-2 h-8 bg-white border rounded-[6px] text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500 ${hipoteses[d.chave] !== gravadas[d.chave] ? 'border-amber-300' : 'border-slate-200'}`}
              />
            </div>
          ))}
        </div>
        {erros.length > 0 && (
          <ul className="text-xs text-rose-600 space-y-0.5">
            {erros.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400">Passe o mouse sobre um campo para ver o efeito. Campo em âmbar = diferente do salvo para esta praça.</span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setHipoteses(HIPOTESES_INDICADORES_PADRAO)}
              disabled={foraDoPadrao === 0}
              title={foraDoPadrao === 0 ? 'Todas as hipóteses já estão no padrão.' : undefined}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              Restaurar padrões
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !!motivoSalvar}
              title={motivoSalvar}
              className="h-8 px-3 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {salvando ? 'Salvando…' : 'Salvar para a praça'}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
