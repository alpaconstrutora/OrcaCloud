/**
 * GAVETA "Mobiliário e circulação" (19/09/2026, E6.3). O kit mínimo por
 * ambiente (derivado do nome — E4.1), a circulação livre verificada por grade
 * (0,90 / 1,20 m), o toggle que desenha as peças no canvas, e as duas ações
 * que persistem pelo kernel: vagas na garagem (planejador da E2.5) e o shaft
 * (E2.4) quando há mais de um pavimento. As peças em si ainda não são
 * entidade (E7.1): são sugestão desenhada, não gravada.
 */
import React from 'react';
import { AlertTriangle, CarFront, Grid2x2 } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import { resumirMobiliario, type HipotesesDeMobiliario, type MobiliarioDoAmbiente } from '../../utils/blueprintMobiliario';
import { FICHA_DO_USO } from '../../utils/blueprintPrograma';

interface Props {
  lista: MobiliarioDoAmbiente[];
  hipoteses: HipotesesDeMobiliario;
  onHipoteses: (h: HipotesesDeMobiliario) => void;
  mostrarNoDesenho: boolean;
  onMostrarNoDesenho: (v: boolean) => void;
  nomeDoPavimento: string;
  onSelecionar: (spaceId: ObjectId) => void;
  /** Garagens reconhecidas neste pavimento e a ação de lançar vagas nelas. */
  garagens: { spaceId: ObjectId; rotulo: string }[];
  onLancarVagas: (spaceId: ObjectId) => void;
  vagasResultado: string | null;
  /** Shaft: o motivo (quando não dá) ou a ação. */
  shaft: { possivel: boolean; motivo: string };
  onSugerirShaft: () => void;
  /** E7.1: grava as peças sugeridas como COMPONENTES do kernel (do pavimento, ou de um ambiente). */
  onAceitarMobiliario?: (spaceId: ObjectId | null) => void;
  componentesExistentes?: number;
}

const m = (mm: number) => `${(mm / 1000).toFixed(2).replace('.', ',')} m`;

export default function PainelMobiliario({ lista, hipoteses, onHipoteses, mostrarNoDesenho, onMostrarNoDesenho, nomeDoPavimento, onSelecionar, garagens, onLancarVagas, vagasResultado, shaft, onSugerirShaft, onAceitarMobiliario, componentesExistentes = 0 }: Props) {
  const resumo = resumirMobiliario(lista, hipoteses);
  const exigidaMm = hipoteses.acessivel ? 1200 : 900;
  return (
    <div className="space-y-4" data-testid="tarefa-mobiliario">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={mostrarNoDesenho} onChange={(e) => onMostrarNoDesenho(e.target.checked)} aria-label="Mostrar mobiliário no desenho" className="h-3.5 w-3.5 rounded border-slate-300" />
          <Grid2x2 className="h-3.5 w-3.5 text-slate-500" /> Mostrar no desenho
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={hipoteses.acessivel} onChange={(e) => onHipoteses({ ...hipoteses, acessivel: e.target.checked })} aria-label="Exigir rota acessível (1,20 m)" className="h-3.5 w-3.5 rounded border-slate-300" />
          Rota acessível (1,20 m em vez de 0,90)
        </label>
        {onAceitarMobiliario && (
          <button type="button" disabled={resumo.pecas === 0} onClick={() => onAceitarMobiliario(null)} className="ml-auto inline-flex h-7 items-center gap-1 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="aceitar-mobiliario" title="Grava as peças sugeridas como componentes do desenho (sugeridos até você confirmar cada um)">
            Aceitar como componentes ({resumo.pecas})
          </button>
        )}
        <label className="inline-flex items-center gap-1">
          Giro da porta (m)
          <input type="number" min={0.6} step={0.1} value={hipoteses.giroDaPortaMm / 1000} onChange={(e) => Number(e.target.value) >= 0.6 && onHipoteses({ ...hipoteses, giroDaPortaMm: Math.round(Number(e.target.value) * 1000) })} aria-label="Giro reservado à frente da porta (m)" className="h-7 w-16 rounded-[6px] border border-slate-300 bg-white px-1.5 text-right text-xs" />
        </label>
      </div>

      <div className="text-xs text-slate-700" data-testid="resumo-do-mobiliario">
        <strong>{resumo.comKit} ambiente(s) com kit</strong> de {resumo.ambientes} em {nomeDoPavimento} · <strong>{resumo.pecas} peça(s)</strong> colocada(s)
        {resumo.naoCouberam > 0 && <span className="text-amber-800"> · {resumo.naoCouberam} não coube(ram)</span>} · circulação de {m(exigidaMm)} passa em <strong>{resumo.circulacaoOk}</strong> de {resumo.comKit}
        {resumo.circulacaoRuim.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Abaixo de {m(exigidaMm)}: {resumo.circulacaoRuim.map((x) => `${x.rotulo} (${x.circulacao.larguraLivreMm != null ? m(x.circulacao.larguraLivreMm) : '—'})`).join(', ')}.
          </p>
        )}
        {resumo.semUso.length > 0 && <p className="mt-1 text-slate-500">Sem kit (nome não reconhecido ou uso sem mobiliário mínimo): {resumo.semUso.map((x) => x.rotulo).join(', ')}.</p>}
        <p className="mt-1 text-[11px] text-slate-500">
          Kit mínimo por uso (cama/armário, sofá/mesa, bancada/geladeira/fogão, tanque/máquina, box/vaso/lavatório), colocado no retângulo interno respeitando o giro da porta e as janelas. A circulação é medida em grade de 5 cm, da
          porta à frente de cada peça. "Aceitar" grava as peças como componentes do kernel (E7.1){componentesExistentes ? ` — ${componentesExistentes} já no pavimento` : ''}.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="tabela-do-mobiliario">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 font-medium">Uso</th>
              <th className="py-1 pr-2 font-medium">Peças</th>
              <th className="py-1 pr-2 font-medium">Não coube</th>
              <th className="py-1 pr-2 text-right font-medium">Livre</th>
              <th className="py-1 pr-2 font-medium">Circulação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const ok = hipoteses.acessivel ? a.circulacao.ok120 : a.circulacao.ok90;
              const temKit = a.uso && a.pecas.length + a.naoCouberam.length > 0;
              return (
                <tr key={a.spaceId} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50" onClick={() => onSelecionar(a.spaceId)} aria-label={`Ambiente ${a.rotulo}`}>
                  <td className="py-1 pr-2 font-medium text-gray-800">{a.rotulo}</td>
                  <td className="py-1 pr-2 text-slate-600">{a.uso ? FICHA_DO_USO[a.uso].rotulo : <span className="text-slate-400">—</span>}</td>
                  <td className="py-1 pr-2 text-slate-700">{a.pecas.length ? a.pecas.map((p) => p.peca.rotulo).join(', ') : <span className="text-slate-400">—</span>}</td>
                  <td className={`py-1 pr-2 ${a.naoCouberam.length ? 'text-amber-800' : 'text-slate-400'}`}>{a.naoCouberam.length ? a.naoCouberam.join(', ') : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{a.circulacao.larguraLivreMm != null ? m(a.circulacao.larguraLivreMm) : '—'}</td>
                  <td className="py-1 pr-2">
                    {!temKit ? (
                      <span className="text-slate-400">—</span>
                    ) : ok ? (
                      <span className="rounded bg-emerald-50 px-1 text-emerald-700">passa</span>
                    ) : (
                      <span className="rounded bg-red-50 px-1 text-red-700" title={a.circulacao.foraDaRota90.length ? `Fora da rota: ${a.circulacao.foraDaRota90.join(', ')}` : ''}>
                        não passa{a.circulacao.semPorta ? ' (sem porta)' : ''}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="py-3 text-xs text-slate-500">Sem ambientes fechados em {nomeDoPavimento}.</p>}
      </div>

      <div className="rounded-[6px] border border-slate-200 px-3 py-2 text-xs" data-testid="gerados-pelo-programa">
        <p className="font-medium text-slate-700">Quando o programa pede</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {garagens.length === 0 ? (
            <span className="text-slate-500">Nenhuma garagem reconhecida pelo nome neste pavimento.</span>
          ) : (
            garagens.map((g) => (
              <button key={g.spaceId} type="button" onClick={() => onLancarVagas(g.spaceId)} className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 font-medium text-gray-700 hover:bg-slate-50" data-testid={`lancar-vagas-${g.spaceId}`}>
                <CarFront className="h-3.5 w-3.5" /> Lançar vagas em {g.rotulo}
              </button>
            ))
          )}
          <button type="button" disabled={!shaft.possivel} onClick={onSugerirShaft} title={shaft.motivo} className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50" data-testid="sugerir-shaft">
            Sugerir shaft
          </button>
          <span className="text-slate-500">{shaft.possivel ? `Shaft: ${shaft.motivo}` : `Shaft: ${shaft.motivo}`}</span>
        </div>
        {vagasResultado && <p className="mt-1 text-slate-600">{vagasResultado}</p>}
      </div>
    </div>
  );
}
