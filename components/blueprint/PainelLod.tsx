/**
 * LOD (21/09/2026, backlog P2): o nível de desenvolvimento DERIVADO de cada
 * família do pavimento, o alvo que a pessoa declara por família e as peças
 * abaixo do alvo com o que falta — clicar seleciona a peça no desenho.
 * Molde do painel de departamentos.
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import { FICHA_DA_FAMILIA_LOD, FICHA_DO_LOD, NIVEIS_DE_LOD, type AlvoDeLod, type FamiliaLod, type LinhaDoQuadroDeLod, type LodDoElemento, type NivelDeLod } from '../../utils/blueprintLod';

interface Props {
  nomeDoPavimento: string;
  quadro: LinhaDoQuadroDeLod[];
  pendencias: LodDoElemento[];
  alvo: AlvoDeLod;
  onAlvo: (alvo: AlvoDeLod) => void;
  onSelecionar: (familia: FamiliaLod, id: ObjectId) => void;
}

const LIMITE_DE_PENDENCIAS = 60;

export default function PainelLod({ nomeDoPavimento, quadro, pendencias, alvo, onAlvo, onSelecionar }: Props) {
  const campo = 'h-7 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';
  const pecas = quadro.reduce((s, l) => s + l.pecas, 0);
  const minimo = quadro.reduce<NivelDeLod | null>((m, l) => (l.minimo !== null && (m === null || l.minimo < m) ? l.minimo : m), null);
  return (
    <div className="space-y-4" data-testid="tarefa-lod">
      <div className="rounded-[10px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p>
          <strong>{nomeDoPavimento}</strong> — {pecas} peça(s) avaliada(s){minimo !== null ? ` · LOD do conjunto: ${minimo}` : ''} · {pendencias.length} abaixo do alvo.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          O LOD é lido do que cada peça já tem — não se declara. Parede com camadas é 300; com item de catálogo em toda camada, 350. O alvo é seu, por família; 400 (fabricação) só existe em estrutura — armadura declarada por peça, completa e sem avisos — e o teto de cada família está no quadro.
        </p>
        <ul className="mt-1 text-[11px] text-slate-500">
          {NIVEIS_DE_LOD.map((n) => (
            <li key={n}>
              <strong>{FICHA_DO_LOD[n].rotulo}</strong> — {FICHA_DO_LOD[n].descricao}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quadro por família</h4>
        {quadro.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nenhuma peça neste pavimento.</p>
        ) : (
          <table className="mt-2 w-full text-xs" data-testid="quadro-de-lod">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">Família</th>
                <th className="py-1 pl-3 text-right font-medium">Peças</th>
                <th className="py-1 pl-3 text-right font-medium">200</th>
                <th className="py-1 pl-3 text-right font-medium">300</th>
                <th className="py-1 pl-3 text-right font-medium">350</th>
                <th className="py-1 pl-3 text-right font-medium">400</th>
                <th className="py-1 pl-3 text-right font-medium">Alvo</th>
                <th className="py-1 pl-3 text-right font-medium">No alvo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quadro.map((l) => (
                <tr key={l.familia} data-testid={`lod-${l.familia}`}>
                  <td className="py-1">
                    {l.rotulo}
                    <span className="ml-1 text-[10px] text-slate-400" title={`300: ${FICHA_DA_FAMILIA_LOD[l.familia].criterio300}${FICHA_DA_FAMILIA_LOD[l.familia].criterio350 ? ` · 350: ${FICHA_DA_FAMILIA_LOD[l.familia].criterio350}` : ''}${FICHA_DA_FAMILIA_LOD[l.familia].criterio400 ? ` · 400: ${FICHA_DA_FAMILIA_LOD[l.familia].criterio400}` : ''}`}>
                      teto {l.teto}
                    </span>
                  </td>
                  <td className="py-1 pl-3 text-right tabular-nums">{l.pecas}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{l.porNivel[200] || '—'}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{l.porNivel[300] || '—'}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{l.porNivel[350] || '—'}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{l.porNivel[400] || '—'}</td>
                  <td className="py-1 pl-3 text-right">
                    <select value={alvo[l.familia]} onChange={(e) => onAlvo({ ...alvo, [l.familia]: Number(e.target.value) as NivelDeLod })} aria-label={`Alvo de LOD para ${l.rotulo}`} className={campo}>
                      {NIVEIS_DE_LOD.filter((n) => n <= l.teto).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`py-1 pl-3 text-right tabular-nums ${l.pct >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {l.noAlvo}/{l.pecas} · {l.pct.toFixed(0)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Abaixo do alvo ({pendencias.length})</h4>
        {pendencias.length === 0 ? (
          <p className="mt-2 text-xs text-emerald-700">Toda peça do pavimento está no alvo da família.</p>
        ) : (
          <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-auto text-xs" data-testid="pendencias-de-lod">
            {pendencias.slice(0, LIMITE_DE_PENDENCIAS).map((p) => (
              <li key={`${p.familia}-${p.id}`}>
                <button type="button" onClick={() => onSelecionar(p.familia, p.id)} className="flex w-full items-start justify-between gap-2 py-1.5 text-left hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <strong>{p.rotulo}</strong> <span className="text-slate-500">· LOD {p.lod}</span>
                    <span className="block text-[11px] text-slate-500">{p.falta.join(' · ')}</span>
                  </span>
                </button>
              </li>
            ))}
            {pendencias.length > LIMITE_DE_PENDENCIAS && <li className="py-1.5 text-[11px] text-slate-500">… e mais {pendencias.length - LIMITE_DE_PENDENCIAS}.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
