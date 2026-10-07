/**
 * A LISTA DE MATERIAIS DA CLIMATIZAÇÃO na tela (E9.3, 07/10/2026): as premissas
 * que a compra acrescenta ao desenho (suportes, sobra do cabo, perda da chapa)
 * editáveis, e a lista — a MESMA de `materiaisDeClimatizacao` que vai para a
 * folha do conjunto e para a aba do XLSX.
 */
import React from 'react';
import type { HipotesesDosMateriais } from '../../utils/blueprintClimatizacao';
import { FONTE_DOS_MATERIAIS, LIMITES_DOS_MATERIAIS } from '../../utils/blueprintClimatizacao';
import type { MateriaisDeClimatizacao } from '../../utils/blueprintMateriaisClimatizacao';

interface Props {
  materiais: MateriaisDeClimatizacao;
  hip: HipotesesDosMateriais;
  onHip: (h: HipotesesDosMateriais) => void;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const qtd = (v: number, un: string) => (un === 'un' ? String(Math.round(v)) : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const ROTULOS: Record<keyof HipotesesDosMateriais, string> = {
  espacamentoSuporteLinhaM: 'Suporte da linha a cada (m)',
  espacamentoSuporteDrenoM: 'Suporte do dreno a cada (m)',
  espacamentoSuporteDutoM: 'Suporte do duto a cada (m)',
  folgaDoCaboM: 'Sobra do cabo por sistema (m)',
  perdaDaChapaPct: 'Perda da chapa do duto (%)',
  raioDoEletrodutoM: 'Alcance do eletroduto até a peça (m)',
  pesoDoPainelKgM2: 'Peso do painel pré-isolado (kg/m²)',
};

export default function PainelMateriaisClimatizacao({ materiais, hip, onHip }: Props) {
  const grupos = [...new Set(materiais.totais.map((l) => l.grupo))];
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-3" data-testid="materiais-climatizacao">
      <p className="text-sm font-semibold text-slate-800">Lista de materiais</p>
      <p className="mt-0.5 text-xs text-slate-500">A mesma da folha do conjunto de pranchas e da aba do XLSX.</p>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        {(Object.keys(ROTULOS) as (keyof HipotesesDosMateriais)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2">
            <span>{ROTULOS[k]}</span>
            <input
              type="number"
              min={LIMITES_DOS_MATERIAIS[k].min}
              max={LIMITES_DOS_MATERIAIS[k].max}
              step={LIMITES_DOS_MATERIAIS[k].max <= 10 ? 0.1 : 1}
              value={hip[k]}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (Number.isFinite(x) && x >= LIMITES_DOS_MATERIAIS[k].min && x <= LIMITES_DOS_MATERIAIS[k].max) onHip({ ...hip, [k]: x });
              }}
              aria-label={ROTULOS[k]}
              className={`w-24 ${campo}`}
            />
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{FONTE_DOS_MATERIAIS}</p>

      {materiais.totais.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Sem instalação de climatização no desenho.</p>
      ) : (
        <div className="mt-2 space-y-2" data-testid="materiais-climatizacao-lista">
          {grupos.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold text-slate-700">{g}</p>
              <ul className="mt-0.5 space-y-0.5">
                {materiais.totais
                  .filter((l) => l.grupo === g)
                  .map((l, i) => (
                    <li key={`${g}:${l.item}:${i}`} className="flex items-baseline justify-between gap-3 text-xs text-slate-700" title={l.nota}>
                      <span className="min-w-0">{l.item}</span>
                      <span className="shrink-0 tabular-nums">
                        {qtd(l.quantidade, l.unidade)} {l.unidade}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {materiais.avisos.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-700" data-testid="materiais-climatizacao-avisos">
          {materiais.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
