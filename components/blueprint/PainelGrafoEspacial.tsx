/**
 * GAVETA "Grafo espacial" (19/09/2026, E4.2): a planta do pavimento como rede
 * de ambientes — resumo (circulação %, saídas, ilhados, sem fachada, porta
 * estreita, percurso mais longo) e a tabela por ambiente: uso, área, vizinhos
 * por porta e por parede, fachadas com orientação e janelas, percurso até a
 * saída. Um clique seleciona a etiqueta do ambiente. Só leitura: o grafo é
 * derivado do desenho.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import {
  descreverFachadas,
  percursoAteASaida,
  percursoEntre,
  resumirGrafo,
  vizinhosDe,
  type GrafoEspacial,
  type NoEspacial,
} from '../../utils/blueprintGrafoEspacial';
import { FICHA_DO_USO } from '../../utils/blueprintPrograma';

interface Props {
  grafo: GrafoEspacial | null;
  nomeDoPavimento: string;
  onSelecionar: (etiquetaId: ObjectId) => void;
}

const m = (mm: number) => `${(mm / 1000).toFixed(2).replace('.', ',')} m`;
const m2 = (mm2: number) => `${(mm2 / 1_000_000).toFixed(2).replace('.', ',')} m²`;

export default function PainelGrafoEspacial({ grafo, nomeDoPavimento, onSelecionar }: Props) {
  const [de, setDe] = useState<ObjectId>('');
  const [para, setPara] = useState<ObjectId | 'EXTERIOR'>('EXTERIOR');
  const resumo = useMemo(() => (grafo ? resumirGrafo(grafo) : null), [grafo]);
  const percurso = useMemo(() => {
    if (!grafo || !de) return null;
    return percursoEntre(grafo, de, para === 'EXTERIOR' ? null : para);
  }, [grafo, de, para]);
  if (!grafo || !resumo || grafo.nos.length === 0) {
    return (
      <p className="text-sm text-slate-500" data-testid="tarefa-grafo">
        Sem ambientes fechados em {nomeDoPavimento}: desenhe paredes que fechem cômodos e ponha portas entre eles.
      </p>
    );
  }
  const nomeDe = (id: ObjectId | null) => (id === null ? 'exterior' : grafo.nos.find((n) => n.spaceId === id)?.rotulo ?? '—');
  const linhaDoNo = (n: NoEspacial) => {
    const viz = vizinhosDe(grafo, n.spaceId);
    const porPorta = viz.filter((v) => v.arestas.some((a) => a.tipo !== 'PAREDE'));
    const soParede = viz.filter((v) => v.no && !v.arestas.some((a) => a.tipo !== 'PAREDE'));
    const saida = percursoAteASaida(grafo, n.spaceId);
    return { n, porPorta, soParede, saida };
  };
  const linhas = grafo.nos.map(linhaDoNo);

  return (
    <div className="space-y-4" data-testid="tarefa-grafo">
      <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="resumo-do-grafo">
        <p>
          <strong>{resumo.ambientes} ambiente(s)</strong> · {resumo.portas} porta(s), {resumo.passagens} passagem(ns), {resumo.paredesDivididas} parede(s) dividida(s) · <strong>{resumo.saidas} saída(s)</strong> para o exterior ·
          circulação <strong>{grafo.circulacaoPct.toFixed(1).replace('.', ',')} %</strong> da área útil ({m2(grafo.areaCirculacaoMm2)} de {m2(grafo.areaUtilMm2)})
          {grafo.norteGraus == null && <span className="text-slate-500"> · norte = +Y do desenho (sem georreferência)</span>}
        </p>
        {resumo.percursoMaisLongo && (
          <p className="mt-1">
            Percurso mais longo até a saída: <strong>{resumo.percursoMaisLongo.no.rotulo}</strong>, {m(resumo.percursoMaisLongo.mm)}.
          </p>
        )}
        {(resumo.ilhados.length > 0 || resumo.semFachada.length > 0 || resumo.portasEstreitas.length > 0 || resumo.saidas === 0) && (
          <ul className="mt-1 space-y-0.5">
            {resumo.saidas === 0 && (
              <li className="flex items-center gap-1 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Nenhuma porta para o exterior: os percursos até a saída ficam sem valor.
              </li>
            )}
            {resumo.ilhados.length > 0 && (
              <li className="flex items-center gap-1 text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Sem porta nem passagem (não se chega): {resumo.ilhados.map((x) => x.rotulo).join(', ')}.
              </li>
            )}
            {resumo.semFachada.length > 0 && (
              <li className="flex items-center gap-1 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Sem fachada (nenhum lado dá para fora): {resumo.semFachada.map((x) => x.rotulo).join(', ')}.
              </li>
            )}
            {resumo.portasEstreitas.length > 0 && (
              <li className="flex items-center gap-1 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Porta(s) com vão &lt; 0,80 m: {resumo.portasEstreitas.map((a) => `${nomeDe(a.de)} ↔ ${nomeDe(a.para)} (${a.comprimentoMm} mm)`).join('; ')}.
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="tabela-do-grafo">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 font-medium">Uso</th>
              <th className="py-1 pr-2 text-right font-medium">Área</th>
              <th className="py-1 pr-2 font-medium">Liga-se a (porta)</th>
              <th className="py-1 pr-2 font-medium">Encosta em (parede)</th>
              <th className="py-1 pr-2 font-medium">Fachada</th>
              <th className="py-1 pr-2 text-right font-medium">Até a saída</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ n, porPorta, soParede, saida }) => (
              <tr
                key={n.spaceId}
                className={`border-t border-slate-100 ${n.etiquetaId ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                onClick={() => n.etiquetaId && onSelecionar(n.etiquetaId)}
                aria-label={`Ambiente ${n.rotulo}`}
              >
                <td className="py-1 pr-2 font-medium text-gray-800">
                  {n.rotulo}
                  {n.circulacao && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] text-slate-700">circulação</span>}
                  {n.ilhado && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">ilhado</span>}
                </td>
                <td className="py-1 pr-2 text-slate-600">{n.uso ? FICHA_DO_USO[n.uso].rotulo : <span className="text-slate-400">—</span>}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{m2(n.areaMm2)}</td>
                <td className="py-1 pr-2 text-slate-700">
                  {porPorta.length === 0
                    ? '—'
                    : porPorta.map((v) => `${v.no?.rotulo ?? 'exterior'} (${v.arestas.filter((a) => a.tipo !== 'PAREDE').map((a) => `${a.tipo === 'PASSAGEM' ? 'vão' : 'porta'} ${(a.comprimentoMm / 1000).toFixed(2).replace('.', ',')}`).join(', ')})`).join(' · ')}
                </td>
                <td className="py-1 pr-2 text-slate-600">{soParede.length === 0 ? '—' : soParede.map((v) => `${v.no!.rotulo} (${m(v.arestas.reduce((s, a) => s + a.comprimentoMm, 0))})`).join(' · ')}</td>
                <td className={`py-1 pr-2 ${n.fachadas.length === 0 ? 'text-amber-800' : 'text-slate-700'}`}>{descreverFachadas(n.fachadas)}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{saida ? `${m(saida.mm)} · ${saida.portas.length} porta(s)` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-[6px] border border-slate-200 px-3 py-2" data-testid="percurso-entre">
        <p className="text-xs font-medium text-slate-700">Percurso entre dois ambientes</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <select value={de} onChange={(e) => setDe(e.target.value)} aria-label="Percurso: de" className="h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs">
            <option value="">De…</option>
            {grafo.nos.map((n) => (
              <option key={n.spaceId} value={n.spaceId}>{n.rotulo}</option>
            ))}
          </select>
          <span className="text-slate-400">→</span>
          <select value={para} onChange={(e) => setPara(e.target.value)} aria-label="Percurso: para" className="h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs">
            <option value="EXTERIOR">exterior (saída)</option>
            {grafo.nos.map((n) => (
              <option key={n.spaceId} value={n.spaceId}>{n.rotulo}</option>
            ))}
          </select>
          {de && (
            <span className="text-slate-700" data-testid="resultado-do-percurso">
              {percurso
                ? `${m(percurso.mm)} · ${percurso.ambientes.map(nomeDe).join(' → ')} · ${percurso.portas.length} porta(s)${percurso.larguraUtilMinMm != null ? ` · menor vão ${(percurso.larguraUtilMinMm / 1000).toFixed(2).replace('.', ',')} m` : ''}`
                : 'sem caminho por portas'}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Medido pelos centros das portas: centro do ambiente → porta → porta → centro do destino. O menor vão pelo caminho é o que uma cadeira de rodas encontra (NBR 9050: 0,80 m).
        </p>
      </div>
    </div>
  );
}
