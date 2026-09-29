/**
 * CONDUTORES na gaveta de águas pluviais (29/09/2026, E6.3 do roadmap
 * hidrossanitário, NBR 10844 5.6/5.7): as premissas (declividade e
 * profundidade do condutor enterrado), o que o lançamento vai pôr e a
 * conferência de toda a rede — vazão acumulada contra a capacidade.
 */
import React from 'react';
import { DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT, type CondutorVerificado, type PlanoDeCondutores } from '../../utils/blueprintCondutoresPluviais';
import type { HipotesesPluviais } from '../../utils/blueprintPluvial';

interface Props {
  plano: PlanoDeCondutores;
  condutores: readonly CondutorVerificado[];
  hip: HipotesesPluviais;
  onHip: (h: HipotesesPluviais) => void;
  onLancar: () => void;
  onSelecionar: (ids: string[]) => void;
}

const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const lmin = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L/min`;

export default function PainelCondutores({ plano, condutores, hip, onHip, onLancar, onSelecionar }: Props) {
  const podeLancar = plano.comandos.length > 0;
  const ruins = condutores.filter((c) => !c.atende);
  const numero = (v: string, minimo: number, padrao: number) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? Math.max(minimo, n) : padrao;
  };
  return (
    <div className="space-y-2" data-testid="condutores">
      <p className="text-xs font-semibold text-slate-700">Condutores</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Declividade (%)
          <input type="number" min={DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT} step={0.5} value={hip.declividadeDoCondutorPct} onChange={(e) => onHip({ ...hip, declividadeDoCondutorPct: numero(e.target.value, DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT, 1) })} aria-label="Declividade do condutor horizontal em porcentagem (mínimo 0,5)" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Profundidade (mm)
          <input type="number" min={100} step={50} value={hip.profundidadeDoCondutorMm} onChange={(e) => onHip({ ...hip, profundidadeDoCondutorMm: numero(e.target.value, 100, 300) })} aria-label="Profundidade do condutor enterrado em milímetros" className={campo} />
        </label>
      </div>
      {plano.motivo ? (
        <p className="text-xs text-slate-500" data-testid="condutores-motivo">{plano.motivo}</p>
      ) : (
        <p className="text-xs text-slate-600" data-testid="condutores-plano">
          {plano.fontes} bocal(is) ou ralo(s): {plano.verticais} condutor(es) vertical(is) e {plano.horizontais} horizontal(is) até a caixa de areia e a saída.
        </p>
      )}
      {plano.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700">{a}</p>
      ))}
      <button
        type="button"
        onClick={onLancar}
        disabled={!podeLancar}
        title={podeLancar ? undefined : (plano.motivo ?? 'Nada a lançar')}
        className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="condutores-lancar"
      >
        {plano.apagados > 0 ? 'Relançar condutores' : 'Lançar condutores'}
      </button>
      {condutores.length > 0 && (
        <p className={`text-xs ${ruins.length ? 'text-red-700' : 'text-slate-600'}`} data-testid="condutores-verificacao">
          {ruins.length
            ? `${ruins.length} de ${condutores.length} trecho(s) não atendem — veja as marcas abaixo.`
            : `${condutores.length} trecho(s) conferido(s); o maior leva ${lmin(Math.max(...condutores.map((c) => c.vazaoLMin)))}.`}
          {ruins.length > 0 && (
            <button type="button" onClick={() => onSelecionar(ruins.map((c) => c.trechoId))} className="ml-1 text-blue-700 hover:underline">
              Selecionar
            </button>
          )}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Vertical: DN mínimo 75 (NBR 10844, 5.6.3); a capacidade usa a fórmula de Wyly–Eaton com ocupação de 1/3 — confira no ábaco
        da Figura 3 da norma. Horizontal: Manning com lâmina de 2/3 (Tabela 4), declividade mínima de 0,5 %.
      </p>
    </div>
  );
}
