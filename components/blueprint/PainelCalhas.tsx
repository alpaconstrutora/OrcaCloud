/**
 * CALHAS na gaveta de águas pluviais (29/09/2026, E6.2 do roadmap
 * hidrossanitário, NBR 10844 5.5): as premissas (seção, material, declividade),
 * o que o lançamento vai pôr em cada beiral e a conferência de toda calha do
 * desenho — capacidade por Manning contra a vazão da água.
 */
import React from 'react';
import { SECOES_DE_CALHA, type SecaoDeCalha } from '../../utils/blueprintKernel';
import { DECLIVIDADE_MINIMA_DA_CALHA_PCT, RUGOSIDADE_DA_CALHA, type CalhaVerificada, type PlanoDeCalhas, type Secao } from '../../utils/blueprintCalhas';
import type { HipotesesPluviais } from '../../utils/blueprintPluvial';

interface Props {
  plano: PlanoDeCalhas;
  calhas: readonly CalhaVerificada[];
  hip: HipotesesPluviais;
  onHip: (h: HipotesesPluviais) => void;
  onLancar: () => void;
  onSelecionar: (ids: string[]) => void;
}

const ROTULO_DA_SECAO: Record<SecaoDeCalha, string> = { SEMICIRCULAR: 'Meia-cana', RETANGULAR: 'Retangular' };
const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const lmin = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L/min`;
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
export const nomeDaSecao = (s: Secao) => (s.secao === 'SEMICIRCULAR' ? `meia-cana ø${s.larguraMm}` : `retangular ${s.larguraMm}×${s.alturaMm ?? s.larguraMm / 2}`);

export default function PainelCalhas({ plano, calhas, hip, onHip, onLancar, onSelecionar }: Props) {
  const podeLancar = plano.comandos.length > 0;
  return (
    <div className="space-y-2" data-testid="calhas">
      <p className="text-xs font-semibold text-slate-700">Calhas</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Seção
          <select value={hip.secaoDaCalha} onChange={(e) => onHip({ ...hip, secaoDaCalha: e.target.value as SecaoDeCalha })} aria-label="Seção da calha" className={campo}>
            {SECOES_DE_CALHA.map((s) => (
              <option key={s} value={s}>{ROTULO_DA_SECAO[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Material
          <select value={hip.materialDaCalha} onChange={(e) => onHip({ ...hip, materialDaCalha: e.target.value })} aria-label="Material da calha" className={campo}>
            {Object.entries(RUGOSIDADE_DA_CALHA).map(([k, r]) => (
              <option key={k} value={k}>{`${r.rotulo} (n ${r.n.toLocaleString('pt-BR')})`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Declividade (%)
          <input
            type="number"
            min={DECLIVIDADE_MINIMA_DA_CALHA_PCT}
            step={0.1}
            value={hip.declividadeDaCalhaPct}
            onChange={(e) => {
              const n = Number(e.target.value.replace(',', '.'));
              onHip({ ...hip, declividadeDaCalhaPct: Number.isFinite(n) ? Math.max(DECLIVIDADE_MINIMA_DA_CALHA_PCT, n) : DECLIVIDADE_MINIMA_DA_CALHA_PCT });
            }}
            aria-label="Declividade da calha em porcentagem (mínimo 0,5)"
            className={`w-20 ${campo}`}
          />
        </label>
      </div>

      {plano.motivo ? (
        <p className="text-xs text-slate-500" data-testid="calhas-motivo">{plano.motivo}</p>
      ) : (
        <table className="w-full text-xs" data-testid="calhas-plano">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Beiral</th>
              <th className="py-1 pr-2 text-right font-medium">Comprimento</th>
              <th className="py-1 pr-2 text-right font-medium">Vazão</th>
              <th className="py-1 text-right font-medium">Calha (capacidade)</th>
            </tr>
          </thead>
          <tbody>
            {plano.calhas.map((c) => (
              <tr key={c.aguaId} className="border-b border-slate-100 text-slate-700">
                <td className="py-1.5 pr-2">{c.rotulo}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{c.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{lmin(c.vazaoLMin)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {nomeDaSecao(c.secao)} ({lmin(c.capacidadeLMin)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plano.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700">{a}</p>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onLancar}
          disabled={!podeLancar}
          title={podeLancar ? undefined : (plano.motivo ?? 'Nada a lançar')}
          className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="calhas-lancar"
        >
          {plano.apagados > 0 ? 'Relançar calhas' : 'Lançar calhas'}
        </button>
        {plano.jaTemCalha > 0 && <span className="text-xs text-slate-500">{plano.jaTemCalha} água(s) com calha confirmada — mantida(s)</span>}
      </div>

      {calhas.length > 0 && (
        <table className="w-full text-xs" data-testid="calhas-verificacao">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Calha no desenho</th>
              <th className="py-1 pr-2 text-right font-medium">i</th>
              <th className="py-1 pr-2 text-right font-medium">Leva</th>
              <th className="py-1 text-right font-medium">Precisa</th>
            </tr>
          </thead>
          <tbody>
            {calhas.map((c) => (
              <tr key={c.trechoId} className={`border-b border-slate-100 ${c.atende ? 'text-slate-700' : 'text-red-700'}`}>
                <td className="py-1.5 pr-2">
                  <button type="button" onClick={() => onSelecionar([c.trechoId])} className="text-left hover:underline">
                    {nomeDaSecao(c.secao)} · {c.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m
                  </button>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{pct(c.declividadePct)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{lmin(c.capacidadeLMin)}</td>
                <td className="py-1.5 text-right tabular-nums">{c.vazaoLMin != null ? lmin(c.vazaoLMin) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-500">
        Capacidade por Manning (NBR 10844, 5.5): Q = 60 000·(S/n)·Rh^(2/3)·i^(1/2), com a seção cheia. Uma calha por
        beiral, com o bocal na ponta mais perto da caixa de areia; a calha lançada nasce sugerida.
      </p>
    </div>
  );
}
