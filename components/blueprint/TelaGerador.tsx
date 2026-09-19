/**
 * TELA "Gerar" (19/09/2026, E6.2): as hipóteses do gerador, o botão que roda N
 * sementes (num Web Worker — a tela segue viva e mostra o progresso), a tabela
 * das alternativas ranqueadas (nota, área, útil, paredes, Pareto), a miniatura
 * da escolhida com os ambientes, o LOG DE DECISÕES (o "explicar solução" da
 * E6.4 nasce daqui) e os avisos. Duas saídas: "Criar alternativa com esta"
 * (um ramo novo, E6.1) e "Aplicar neste pavimento" (as paredes, portas,
 * janelas e nomes entram no desenho aberto — dois lotes, Ctrl+Z desfaz).
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Play, Square, Wand2 } from 'lucide-react';

import { frenteDePareto, HIPOTESES_DO_GERADOR_PADRAO, type EntradaDoGerador, type HipotesesDoGerador, type ResultadoDoGerador } from '../../utils/blueprintGerador';
import type { EstadoDoGerador } from '../../hooks/useGerador';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import MiniPlanta, { caixaDosModelos } from './MiniPlanta';
import { NotaGeral } from './TelaAvaliacao';

interface Props {
  gerador: EstadoDoGerador;
  entrada: Omit<EntradaDoGerador, 'hipotesesDaAvaliacao'>;
  hipoteses: HipotesesDoGerador;
  onHipoteses: (h: HipotesesDoGerador) => void;
  /** Texto de contexto: de onde vem o envelope/frente (ou por que não há). */
  contexto: { temPrograma: boolean; temEnvelope: boolean; frenteDeclarada: boolean; envelopeM2: number | null };
  onCriarAlternativa: (r: ResultadoDoGerador) => Promise<void>;
  onAplicarAqui: (r: ResultadoDoGerador) => Promise<void>;
  /** O pavimento aberto já tem paredes? (aviso antes de aplicar) */
  pavimentoTemParedes: boolean;
  onAbrirPrograma: () => void;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'semente', label: 'Semente', width: 90 },
  { key: 'nota', label: 'Nota', width: 90 },
  { key: 'construida', label: 'Construída', width: 110 },
  { key: 'util', label: 'Útil', width: 100 },
  { key: 'paredes', label: 'Paredes', width: 100 },
  { key: 'objetivo', label: 'Objetivo', width: 100 },
  { key: 'pareto', label: 'Pareto', width: 90 },
  { key: 'avisos', label: 'Avisos', width: 90 },
];

const f2 = (v: number) => v.toFixed(2).replace('.', ',');

export default function TelaGerador({ gerador, entrada, hipoteses, onHipoteses, contexto, onCriarAlternativa, onAplicarAqui, pavimentoTemParedes, onAbrirPrograma }: Props) {
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ranqueadas = useMemo(() => [...gerador.resultados].sort((a, b) => (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.resumo.objetivoFinal - b.resumo.objetivoFinal || a.semente - b.semente), [gerador.resultados]);
  const pareto = useMemo(() => frenteDePareto(ranqueadas), [ranqueadas]);
  const atual = ranqueadas.find((r) => r.semente === escolhida) ?? ranqueadas[0] ?? null;
  const caixa = useMemo(() => (atual ? caixaDosModelos([atual.model]) : null), [atual]);
  const set = (m: Partial<HipotesesDoGerador>) => onHipoteses({ ...hipoteses, ...m });
  const campo = 'h-8 w-24 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums';

  const rodar = () => {
    setErro(null);
    setEscolhida(null);
    gerador.gerar({ ...entrada }, hipoteses, Array.from({ length: hipoteses.sementes }, (_, i) => i + 1));
  };
  const agir = async (nome: string, fn: () => Promise<void>) => {
    setOcupado(nome);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="tela-gerador">
      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="hipoteses-do-gerador">
        <div className="flex flex-wrap items-end gap-4 text-xs text-slate-600">
          <label className="flex flex-col gap-1">
            Sementes
            <input type="number" min={1} max={12} value={hipoteses.sementes} onChange={(e) => set({ sementes: Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1))) })} aria-label="Número de sementes" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Iterações
            <input type="number" min={20} max={5000} step={50} value={hipoteses.iteracoes} onChange={(e) => set({ iteracoes: Math.max(20, Math.min(5000, Math.round(Number(e.target.value) || 20))) })} aria-label="Iterações do recozimento" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Corredor (m)
            <input type="number" min={0.8} step={0.1} value={hipoteses.larguraCorredorMm / 1000} onChange={(e) => Number(e.target.value) >= 0.8 && set({ larguraCorredorMm: Math.round(Number(e.target.value) * 1000) })} aria-label="Largura do corredor (m)" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Pé-direito (m)
            <input type="number" min={2.3} step={0.1} value={hipoteses.peDireitoMm / 1000} onChange={(e) => Number(e.target.value) >= 2.3 && set({ peDireitoMm: Math.round(Number(e.target.value) * 1000) })} aria-label="Pé-direito (m)" className={campo} />
          </label>
          {!contexto.temEnvelope && (
            <>
              <label className="flex flex-col gap-1">
                Largura (m) — sem lote
                <input type="number" min={4} step={0.5} value={hipoteses.retanguloSemEnvelope.larguraMm / 1000} onChange={(e) => Number(e.target.value) >= 4 && set({ retanguloSemEnvelope: { ...hipoteses.retanguloSemEnvelope, larguraMm: Math.round(Number(e.target.value) * 1000) } })} aria-label="Largura do retângulo (m)" className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                Profundidade (m)
                <input type="number" min={4} step={0.5} value={hipoteses.retanguloSemEnvelope.profundidadeMm / 1000} onChange={(e) => Number(e.target.value) >= 4 && set({ retanguloSemEnvelope: { ...hipoteses.retanguloSemEnvelope, profundidadeMm: Math.round(Number(e.target.value) * 1000) } })} aria-label="Profundidade do retângulo (m)" className={campo} />
              </label>
            </>
          )}
          <label className="inline-flex items-center gap-1 pb-2">
            <input type="checkbox" checked={hipoteses.automaticos} onChange={(e) => set({ automaticos: e.target.checked })} aria-label="Lançar automáticos" className="h-3.5 w-3.5 rounded border-slate-300" />
            pilares, vigas, lajes, tomadas/luz e pontos hidráulicos
          </label>
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => onHipoteses({ ...HIPOTESES_DO_GERADOR_PADRAO })} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50">
              Padrão
            </button>
            {gerador.rodando ? (
              <button type="button" onClick={gerador.cancelar} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50" data-testid="cancelar-geracao">
                <Square className="h-4 w-4" /> Parar ({gerador.progresso.feitas}/{gerador.progresso.total})
              </button>
            ) : (
              <button type="button" onClick={rodar} disabled={!contexto.temPrograma} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="gerar">
                <Play className="h-4 w-4" /> Gerar {hipoteses.sementes} alternativa(s)
              </button>
            )}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="contexto-do-gerador">
          {contexto.temPrograma ? (
            <>Programa: <strong>{entrada.programa.itens.length} item(ns)</strong>, {entrada.programa.relacoes.length} relação(ões). </>
          ) : (
            <>
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
              Sem programa de necessidades —{' '}
              <button type="button" onClick={onAbrirPrograma} className="font-medium text-blue-700 hover:underline">
                defina um (ou aplique uma semente)
              </button>{' '}
              antes de gerar.{' '}
            </>
          )}
          {contexto.temEnvelope ? (
            <>
              Envelope edificável do pavimento: <strong>{contexto.envelopeM2 != null ? `${f2(contexto.envelopeM2)} m²` : '—'}</strong> (o gerador usa o maior retângulo de eixos alinhados dentro dele).{' '}
            </>
          ) : (
            <>Sem lote/envelope: usa o retângulo declarado acima. </>
          )}
          Frente {contexto.frenteDeclarada ? 'pela divisa FRENTE do lote' : 'suposta ao sul (marque a divisa FRENTE em Terreno › Dados do lote)'}; norte {entrada.rotacaoNorteDeg == null ? '= +Y do desenho' : `girado ${entrada.rotacaoNorteDeg}°`}. Mesma entrada e mesma semente dão sempre a mesma planta.
        </p>
        {(erro || gerador.erros.length > 0) && (
          <p className="mt-2 flex items-center gap-1 text-xs text-red-700" role="alert">
            <AlertTriangle className="h-3.5 w-3.5" /> {erro ?? gerador.erros.map((e) => `semente ${e.semente}: ${e.mensagem}`).join(' · ')}
          </p>
        )}
      </div>

      <StandardTable<ResultadoDoGerador>
        columns={COLUNAS}
        storageKey="blueprint:geradorResultados"
        rows={ranqueadas}
        rowKey={(r) => String(r.semente)}
        loading={gerador.rodando && ranqueadas.length === 0}
        onRowClick={(r) => setEscolhida(r.semente)}
        rowClassName={(r) => (atual && r.semente === atual.semente ? 'bg-blue-50/40 cursor-pointer' : 'cursor-pointer')}
        sortValue={(key, r) => {
          switch (key) {
            case 'semente':
              return r.semente;
            case 'nota':
              return r.avaliacao.notaGeral ?? -1;
            case 'construida':
              return r.resumo.areaConstruidaM2;
            case 'util':
              return r.resumo.areaUtilM2;
            case 'paredes':
              return r.resumo.paredesM;
            case 'objetivo':
              return r.resumo.objetivoFinal;
            case 'pareto':
              return pareto.has(r.semente) ? 0 : 1;
            case 'avisos':
              return r.avisos.length;
            default:
              return null;
          }
        }}
        renderCell={(key, r) => {
          switch (key) {
            case 'semente':
              return <span className="text-sm font-semibold text-gray-900">#{r.semente}</span>;
            case 'nota':
              return <NotaGeral nota={r.avaliacao.notaGeral} />;
            case 'construida':
              return <span className="text-sm tabular-nums text-gray-700">{f2(r.resumo.areaConstruidaM2)} m²</span>;
            case 'util':
              return <span className="text-sm tabular-nums text-gray-700">{f2(r.resumo.areaUtilM2)} m²</span>;
            case 'paredes':
              return <span className="text-sm tabular-nums text-gray-700">{f2(r.resumo.paredesM)} m</span>;
            case 'objetivo':
              return <span className="text-xs tabular-nums text-gray-600">{f2(r.resumo.objetivoInicial)} → {f2(r.resumo.objetivoFinal)}</span>;
            case 'pareto':
              return pareto.has(r.semente) ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">na frente</span> : <span className="text-xs text-slate-400">dominada</span>;
            case 'avisos':
              return r.avisos.length ? <span className="text-xs text-amber-800">{r.avisos.length}</span> : <span className="text-xs text-slate-400">—</span>;
            default:
              return null;
          }
        }}
        empty={{ title: gerador.rodando ? 'Gerando…' : 'Nenhuma alternativa gerada ainda', subtitle: 'Escolha as sementes e clique em Gerar. Cada semente é uma planta diferente; a frente de Pareto separa as que não são dominadas em área, paredes e nota.' }}
      />

      {atual && caixa && (
        <div className="space-y-4 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="alternativa-escolhida">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              <Wand2 className="mr-1 inline h-4 w-4 text-slate-400" /> Semente #{atual.semente} · nota {atual.avaliacao.notaGeral ?? '—'} · {f2(atual.resumo.areaConstruidaM2)} m² construídos
            </p>
            <span className="flex items-center gap-2">
              <button type="button" disabled={!!ocupado} onClick={() => void agir('criar', () => onCriarAlternativa(atual))} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50" data-testid="criar-alternativa-gerada">
                {ocupado === 'criar' ? 'Criando…' : 'Criar alternativa com esta'}
              </button>
              <button type="button" disabled={!!ocupado} onClick={() => void agir('aplicar', () => onAplicarAqui(atual))} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="aplicar-gerada" title={pavimentoTemParedes ? 'O pavimento aberto já tem paredes: a alternativa entra por cima (Ctrl+Z desfaz os dois lotes)' : 'Paredes, portas, janelas e nomes entram no pavimento aberto'}>
                {ocupado === 'aplicar' ? 'Aplicando…' : 'Aplicar neste pavimento'}
              </button>
            </span>
          </div>
          {pavimentoTemParedes && <p className="text-xs text-amber-800">O pavimento aberto já tem paredes — prefira "Criar alternativa com esta" para não misturar.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <MiniPlanta model={atual.model} levelId={atual.levelId} caixa={caixa} titulo={`Semente #${atual.semente}`} altura={360} />
            <div className="space-y-3 text-xs">
              <div data-testid="ambientes-gerados">
                <p className="mb-1 font-medium uppercase tracking-wide text-slate-500">Ambientes</p>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-0.5 pr-2 font-medium">Ambiente</th>
                      <th className="py-0.5 pr-2 font-medium">Zona</th>
                      <th className="py-0.5 pr-2 text-right font-medium">Área</th>
                      <th className="py-0.5 pr-2 text-right font-medium">Menor lado</th>
                      <th className="py-0.5 pr-2 font-medium">Fachada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atual.ambientes.map((a) => (
                      <tr key={a.nome} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2 text-gray-800">{a.nome}</td>
                        <td className="py-0.5 pr-2 text-slate-600">{a.zona.toLowerCase()}</td>
                        <td className={`py-0.5 pr-2 text-right tabular-nums ${a.areaM2 < a.item.areaMinM2 ? 'text-red-700' : 'text-gray-700'}`}>{f2(a.areaM2)} m²</td>
                        <td className={`py-0.5 pr-2 text-right tabular-nums ${a.larguraMinM * 1000 < a.item.larguraMinMm ? 'text-red-700' : 'text-gray-700'}`}>{f2(a.larguraMinM)} m</td>
                        <td className="py-0.5 pr-2 text-slate-600">{a.ladosExternos.length ? a.ladosExternos.join(', ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div data-testid="decisoes-do-gerador">
                <p className="mb-1 font-medium uppercase tracking-wide text-slate-500">Decisões do gerador</p>
                <ol className="list-decimal space-y-0.5 pl-5 text-gray-700">
                  {atual.decisoes.map((d, k) => (
                    <li key={k}>{d}</li>
                  ))}
                </ol>
              </div>
              {atual.avisos.length > 0 && (
                <div data-testid="avisos-do-gerador">
                  <p className="mb-1 font-medium uppercase tracking-wide text-amber-700">Avisos</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
                    {atual.avisos.map((d, k) => (
                      <li key={k}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {atual.avaliacao.piores.length > 0 && <p className="text-slate-600">Piores indicadores: {atual.avaliacao.piores.map((i) => `${i.rotulo} (${i.nota})`).join(' · ')}.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

