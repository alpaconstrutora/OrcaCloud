/**
 * DEPARTAMENTOS (21/09/2026, backlog P2 — P2.22): o quadro por setor do
 * pavimento (ambientes, m² úteis, %), o departamento de cada ambiente para
 * editar em linha (texto livre com os sugeridos) e a sugestão automática pelo
 * nome/tipo — que só grava quando a pessoa manda. Molde do painel de rodapés.
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import { MAX_CHARS_DO_DEPARTAMENTO } from '../../utils/blueprintKernel';
import { DEPARTAMENTOS_SUGERIDOS, type LinhaDoQuadroDeDepartamentos, type SugestaoDeDepartamento } from '../../utils/blueprintDepartamentos';

export interface AmbienteComDepartamento {
  spaceId: ObjectId;
  rotulo: string;
  departamento: string | null;
  areaM2: number;
}

interface Props {
  nomeDoPavimento: string;
  ambientes: AmbienteComDepartamento[];
  quadro: LinhaDoQuadroDeDepartamentos[];
  sugestoes: SugestaoDeDepartamento[];
  onDepartamento: (spaceId: ObjectId, departamento: string | null) => void;
  onLancarSugestoes: (quais: SugestaoDeDepartamento[]) => void;
  onAbrirPlanta: () => void;
  emPlanta: boolean;
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');
const pct = (v: number) => v.toFixed(1).replace('.', ',');

export default function PainelDepartamentos({ nomeDoPavimento, ambientes, quadro, sugestoes, onDepartamento, onLancarSugestoes, onAbrirPlanta, emPlanta }: Props) {
  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-800';
  const semDepartamento = ambientes.filter((a) => !a.departamento).length;
  return (
    <div className="space-y-4" data-testid="tarefa-departamentos">
      <div className="rounded-[10px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <div className="flex items-center justify-between gap-2">
          <p>
            <strong>{nomeDoPavimento}</strong> — {ambientes.length} ambiente(s), {semDepartamento} sem departamento.
          </p>
          <span className="flex items-center gap-2">
            <button type="button" disabled={sugestoes.length === 0} onClick={() => onLancarSugestoes(sugestoes)} className="h-8 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="sugerir-departamentos">
              Sugerir para {sugestoes.length} ambiente(s)
            </button>
            <button type="button" onClick={onAbrirPlanta} className="h-8 rounded-[6px] border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50" data-testid="abrir-planta-de-departamentos">
              {emPlanta ? 'Voltar à planta' : 'Planta de departamentos'}
            </button>
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          O departamento é texto livre gravado na etiqueta do ambiente (Social, Íntimo, Serviço, Circulação, Técnico…). A sugestão lê o nome e o tipo do ambiente e só grava quando você manda — um passo de desfazer.
        </p>
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quadro por departamento</h4>
        {quadro.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nenhum ambiente fechado neste pavimento.</p>
        ) : (
          <table className="mt-2 w-full text-xs" data-testid="quadro-de-departamentos">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">Departamento</th>
                <th className="py-1 text-right font-medium">Ambientes</th>
                <th className="py-1 text-right font-medium">Área útil</th>
                <th className="py-1 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quadro.map((l) => (
                <tr key={l.departamento ?? '—'}>
                  <td className="py-1">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm border border-slate-400" style={{ backgroundColor: l.cor ?? '#f1f5f9' }} aria-hidden />
                      {l.departamento ?? <span className="text-slate-500">Sem departamento</span>}
                    </span>
                  </td>
                  <td className="py-1 text-right tabular-nums">{l.ambientes}</td>
                  <td className="py-1 text-right tabular-nums">{m2(l.areaM2)} m²</td>
                  <td className="py-1 text-right tabular-nums">{pct(l.pct)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Ambientes</h4>
        <datalist id="departamentos-sugeridos">
          {DEPARTAMENTOS_SUGERIDOS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-auto text-xs">
          {ambientes.map((a) => {
            const sugestao = sugestoes.find((s) => s.spaceId === a.spaceId);
            return (
              <li key={a.spaceId} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  <strong>{a.rotulo}</strong> · {m2(a.areaM2)} m²
                  {sugestao && <span className="ml-1 text-[11px] text-slate-500">(sugestão: {sugestao.departamento})</span>}
                </span>
                <input
                  key={`${a.spaceId}-${a.departamento ?? ''}`}
                  list="departamentos-sugeridos"
                  defaultValue={a.departamento ?? ''}
                  maxLength={MAX_CHARS_DO_DEPARTAMENTO}
                  placeholder="Departamento"
                  aria-label={`Departamento do ambiente ${a.rotulo}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (a.departamento ?? '')) onDepartamento(a.spaceId, v || null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className={`${campo} w-40`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
