/**
 * GAVETA "Insolação e ventilação" (19/09/2026, E5.1). Controles do instante
 * (data de referência ou data livre, HORA SOLAR, latitude — da georreferência
 * ou suposta), o entorno (vizinhos por divisa: altura, afastamento,
 * profundidade), o toggle do sol no 3D, e a tabela por ambiente: fachadas com
 * janela e horas de sol em 21/06, 21/03 e 21/12, horas do ambiente, ventilação
 * cruzada e "sol agora". Clique na linha seleciona a etiqueta. Só leitura do
 * desenho; as hipóteses são do navegador.
 */
import React, { useMemo } from 'react';
import { AlertTriangle, Plus, Sun, Trash2 } from 'lucide-react';
import type { BoundaryPapel, ObjectId } from '../../utils/blueprintKernel';
import {
  DATAS_DE_REFERENCIA,
  diaDoAno,
  LATITUDE_PADRAO,
  orientacaoDoSol,
  posicaoSolar,
  resumirInsolacao,
  ROTULO_DO_LADO,
  type DataDeReferencia,
  type InsolacaoDoAmbiente,
  type VizinhoDoEntorno,
} from '../../utils/blueprintInsolacao';

export interface HipotesesDeInsolacao {
  /** 'YYYY-MM-DD'. */
  data: string;
  horaSolar: number;
  /** Latitude usada quando o estudo não tem georreferência. */
  latitudeManual: number;
  vizinhos: VizinhoDoEntorno[];
  solNo3d: boolean;
}

export const HIPOTESES_DE_INSOLACAO_PADRAO: HipotesesDeInsolacao = {
  data: DATAS_DE_REFERENCIA.INVERNO.data,
  horaSolar: 9,
  latitudeManual: LATITUDE_PADRAO,
  vizinhos: [],
  solNo3d: true,
};

interface Props {
  hipoteses: HipotesesDeInsolacao;
  onHipoteses: (h: HipotesesDeInsolacao) => void;
  /** Latitude da georreferência do estudo, quando há. */
  latitudeDoEstudo: number | null;
  norteGraus: number | null;
  analise: InsolacaoDoAmbiente[];
  /** Mínimo de horas de sol da zona (E3.1), quando declarado. */
  insolacaoMinimaH: number | null;
  temLote: boolean;
  nomeDoPavimento: string;
  onSelecionar: (etiquetaId: ObjectId) => void;
}

const h = (v: number) => `${v.toFixed(2).replace('.', ',')} h`;
const LADOS: BoundaryPapel[] = ['FRENTE', 'FUNDOS', 'LATERAL_DIREITA', 'LATERAL_ESQUERDA'];

export default function PainelInsolacao({ hipoteses, onHipoteses, latitudeDoEstudo, norteGraus, analise, insolacaoMinimaH, temLote, nomeDoPavimento, onSelecionar }: Props) {
  const latitude = latitudeDoEstudo ?? hipoteses.latitudeManual;
  const dia = diaDoAno(hipoteses.data);
  const sol = useMemo(() => posicaoSolar(latitude, dia, hipoteses.horaSolar), [latitude, dia, hipoteses.horaSolar]);
  const resumo = useMemo(() => resumirInsolacao(analise, insolacaoMinimaH), [analise, insolacaoMinimaH]);
  const set = (mudanca: Partial<HipotesesDeInsolacao>) => onHipoteses({ ...hipoteses, ...mudanca });
  const dataDeReferencia = (Object.keys(DATAS_DE_REFERENCIA) as DataDeReferencia[]).find((k) => DATAS_DE_REFERENCIA[k].data === hipoteses.data) ?? '';
  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs';

  return (
    <div className="space-y-4" data-testid="tarefa-insolacao">
      {/* ── Instante ── */}
      <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="instante-solar">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1">
            Data
            <select value={dataDeReferencia} onChange={(e) => e.target.value && set({ data: DATAS_DE_REFERENCIA[e.target.value as DataDeReferencia].data })} aria-label="Data de referência" className={campo}>
              <option value="">outra…</option>
              {(Object.keys(DATAS_DE_REFERENCIA) as DataDeReferencia[]).map((k) => (
                <option key={k} value={k}>{DATAS_DE_REFERENCIA[k].rotulo}</option>
              ))}
            </select>
            <input type="date" value={hipoteses.data} onChange={(e) => e.target.value && set({ data: e.target.value })} aria-label="Data da insolação" className={campo} />
          </label>
          <label className="flex items-center gap-1">
            Hora solar
            <input type="range" min={5} max={19} step={0.5} value={hipoteses.horaSolar} onChange={(e) => set({ horaSolar: Number(e.target.value) })} aria-label="Hora solar" className="w-32" />
            <span className="w-12 tabular-nums" data-testid="hora-solar">{hipoteses.horaSolar.toFixed(1).replace('.', ',')} h</span>
          </label>
          <label className="flex items-center gap-1">
            Latitude
            <input
              type="number"
              step={0.01}
              value={latitude}
              disabled={latitudeDoEstudo != null}
              onChange={(e) => Number.isFinite(Number(e.target.value)) && set({ latitudeManual: Number(e.target.value) })}
              aria-label="Latitude (graus, negativa ao sul)"
              className={`${campo} w-24 text-right tabular-nums disabled:bg-slate-100`}
            />
          </label>
          <label className="ml-auto inline-flex items-center gap-1">
            <input type="checkbox" checked={hipoteses.solNo3d} onChange={(e) => set({ solNo3d: e.target.checked })} aria-label="Sol e sombras no 3D" className="h-3.5 w-3.5 rounded border-slate-300" />
            <Sun className="h-3.5 w-3.5 text-amber-500" /> Sol e sombras no 3D
          </label>
        </div>
        <p className="mt-1.5" data-testid="posicao-do-sol">
          {sol.alturaGraus >= 0 ? (
            <>
              Sol a <strong>{sol.alturaGraus.toFixed(0)}°</strong> de altura, azimute <strong>{sol.azimuteGraus.toFixed(0)}°</strong> ({orientacaoDoSol(sol)})
            </>
          ) : (
            <>Sol abaixo do horizonte a esta hora.</>
          )}
          {' · '}
          {latitudeDoEstudo != null ? `latitude da georreferência (${latitudeDoEstudo.toFixed(2).replace('.', ',')}°)` : <span className="text-amber-800">latitude SUPOSTA — georreferencie o estudo (Terreno › Dados do lote)</span>}
          {' · '}
          {norteGraus == null ? 'norte = +Y do desenho' : `norte girado ${norteGraus}°`}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Hora SOLAR (meio-dia = sol no meridiano), não a do relógio. Horas de sol contadas a cada 15 min em cada fachada com janela, a 1,20 m do piso, descontando a sombra do entorno declarado; a sombra
          da própria edificação não entra na conta (o 3D a mostra).
        </p>
      </div>

      {/* ── Resumo ── */}
      <div className="text-xs text-slate-700" data-testid="resumo-da-insolacao">
        <strong>{resumo.ambientes} ambiente(s)</strong>, {resumo.comJanela} com janela · ventilação cruzada em <strong>{resumo.comVentilacaoCruzada}</strong>
        {insolacaoMinimaH != null && <> · mínimo da zona: {insolacaoMinimaH} h de sol no inverno</>}
        {resumo.semSolNoInverno.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {insolacaoMinimaH != null ? `Abaixo do mínimo em 21/06` : 'Sem sol algum em 21/06'}: {resumo.semSolNoInverno.map((a) => `${a.rotulo} (${h(a.horas.INVERNO)})`).join(', ')}.
          </p>
        )}
        {resumo.semVentilacaoCruzada.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Sem ventilação cruzada: {resumo.semVentilacaoCruzada.map((a) => `${a.rotulo} (${a.ventilacao.motivo})`).join('; ')}.
          </p>
        )}
      </div>

      {/* ── Por ambiente ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="tabela-de-insolacao">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 font-medium">Fachadas com janela (h de sol 21/06 · 21/03 · 21/12)</th>
              <th className="py-1 pr-2 text-right font-medium">Sol 21/06</th>
              <th className="py-1 pr-2 text-right font-medium">Sol 21/12</th>
              <th className="py-1 pr-2 font-medium">Ventilação cruzada</th>
              <th className="py-1 pr-2 font-medium">Agora</th>
            </tr>
          </thead>
          <tbody>
            {analise.map((a) => {
              const comJanela = a.fachadas.filter((f) => f.janelas > 0);
              const abaixo = a.temJanela && (insolacaoMinimaH != null ? a.horas.INVERNO < insolacaoMinimaH : a.horas.INVERNO === 0);
              return (
                <tr key={a.spaceId} className={`border-t border-slate-100 ${a.etiquetaId ? 'cursor-pointer hover:bg-blue-50' : ''}`} onClick={() => a.etiquetaId && onSelecionar(a.etiquetaId)} aria-label={`Ambiente ${a.rotulo}`}>
                  <td className="py-1 pr-2 font-medium text-gray-800">{a.rotulo}</td>
                  <td className="py-1 pr-2 text-slate-700">
                    {comJanela.length === 0 ? <span className="text-slate-400">sem janela</span> : comJanela.map((f) => `${f.orientacao} (${f.janelas} jan.): ${f.horas.INVERNO.toFixed(1).replace('.', ',')} · ${f.horas.EQUINOCIO.toFixed(1).replace('.', ',')} · ${f.horas.VERAO.toFixed(1).replace('.', ',')}`).join(' — ')}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${abaixo ? 'font-medium text-red-700' : 'text-slate-700'}`}>{a.temJanela ? h(a.horas.INVERNO) : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{a.temJanela ? h(a.horas.VERAO) : '—'}</td>
                  <td className={`py-1 pr-2 ${a.ventilacao.cruzada ? 'text-emerald-700' : 'text-slate-600'}`} title={a.ventilacao.motivo}>
                    {a.ventilacao.cruzada ? `sim (${a.ventilacao.orientacoes.join('/')})` : `não — ${a.ventilacao.motivo}`}
                  </td>
                  <td className="py-1 pr-2">
                    {a.agora === 'SOL' ? <span className="rounded bg-amber-100 px-1 text-amber-800">sol</span> : a.agora === 'SOMBRA' ? <span className="rounded bg-slate-200 px-1 text-slate-700">sombra</span> : a.agora === 'NOITE' ? <span className="text-slate-400">noite</span> : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {analise.length === 0 && <p className="py-3 text-xs text-slate-500">Sem ambientes fechados em {nomeDoPavimento}.</p>}
      </div>

      {/* ── Entorno ── */}
      <div className="rounded-[6px] border border-slate-200 px-3 py-2" data-testid="entorno">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-700">Entorno — vizinhos que fazem sombra</p>
          <button
            type="button"
            disabled={!temLote}
            onClick={() => set({ vizinhos: [...hipoteses.vizinhos, { id: `v${Date.now().toString(36)}`, lado: 'LATERAL_DIREITA', alturaM: 9, afastamentoM: 1.5, profundidadeM: 12 }] })}
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="novo-vizinho"
          >
            <Plus className="h-3.5 w-3.5" /> Vizinho
          </button>
        </div>
        {!temLote && <p className="mt-1 text-[11px] text-amber-800">Desenhe as divisas do lote (Terreno) para posicionar vizinhos por lado.</p>}
        {hipoteses.vizinhos.length > 0 && (
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-0.5 pr-2 font-medium">Lado</th>
                <th className="py-0.5 pr-2 font-medium">Altura (m)</th>
                <th className="py-0.5 pr-2 font-medium">Afast. da divisa (m)</th>
                <th className="py-0.5 pr-2 font-medium">Profundidade (m)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hipoteses.vizinhos.map((v, i) => {
                const mudar = (m: Partial<VizinhoDoEntorno>) => set({ vizinhos: hipoteses.vizinhos.map((x, k) => (k === i ? { ...x, ...m } : x)) });
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="py-0.5 pr-2">
                      <select value={v.lado} onChange={(e) => mudar({ lado: e.target.value as BoundaryPapel })} aria-label={`Lado do vizinho ${i + 1}`} className={campo}>
                        {LADOS.map((l) => (
                          <option key={l} value={l}>{ROTULO_DO_LADO[l]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" min={0} step={0.5} value={v.alturaM} onChange={(e) => mudar({ alturaM: Math.max(0, Number(e.target.value)) })} aria-label={`Altura do vizinho ${i + 1} (m)`} className={`${campo} w-20 text-right`} />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" min={0} step={0.5} value={v.afastamentoM} onChange={(e) => mudar({ afastamentoM: Math.max(0, Number(e.target.value)) })} aria-label={`Afastamento do vizinho ${i + 1} (m)`} className={`${campo} w-20 text-right`} />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" min={1} step={1} value={v.profundidadeM} onChange={(e) => mudar({ profundidadeM: Math.max(1, Number(e.target.value)) })} aria-label={`Profundidade do vizinho ${i + 1} (m)`} className={`${campo} w-20 text-right`} />
                    </td>
                    <td className="py-0.5 text-right">
                      <button type="button" onClick={() => set({ vizinhos: hipoteses.vizinhos.filter((_, k) => k !== i) })} aria-label={`Remover o vizinho ${i + 1}`} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[11px] text-slate-500">Cada vizinho é um bloco ao longo da divisa escolhida, do lado de fora do lote. Entra na conta das horas e na sombra do 3D.</p>
      </div>
    </div>
  );
}
