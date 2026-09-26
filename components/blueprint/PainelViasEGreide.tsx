/**
 * VIAS E GREIDE (C2) — o relatório em gaveta.
 *
 * Por via: o eixo traçado (estacas a cada `passo`), a seção tipo, o greide
 * (PIVs editáveis estaca a estaca, com curva vertical), o perfil terreno ×
 * greide, a seção transversal da estaca escolhida, os volumes por áreas
 * médias e a nota de serviço (simples ou composta) — com CSVs de nota,
 * greide e pontos de locação.
 *
 * O que se grava é só eixo, passo, PIVs e seção tipo (pelo pai). Tudo o mais
 * é derivado aqui, contra a versão de topografia exibida.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Pencil, Trash2, X } from 'lucide-react';
import type { Point } from '../../utils/blueprintKernel';
import type { ViaDeProjeto } from '../../hooks/useBlueprintVias';
import {
  conferirGreide,
  cotaDoGreide,
  csvDaNotaDeServico,
  csvDeLocacaoDaVia,
  csvDoGreide,
  estaquear,
  greideDoTerreno,
  notaDeServico,
  pontosDeLocacaoDaVia,
  secoesTransversais,
  svgDaSecao,
  svgDoPerfilDaVia,
  volumesPorAreasMedias,
  type Greide,
  type ModoDaNota,
  type SecaoTipo,
  type ViaDoLoteamento,
} from '../../utils/blueprintVias';
import { numeroBr } from '../../utils/blueprintMemorialLote';

export interface Props {
  vias: ViaDeProjeto[];
  ativaId: string | null;
  onAtiva: (id: string | null) => void;
  /** Liga a ferramenta Eixo na barra. */
  onTracar: () => void;
  onAlterar: (id: string, patch: Partial<Omit<ViaDeProjeto, 'id'>>) => void;
  onRemover: (id: string) => void;
  /** A cota do terreno da versão exibida; `null` sem topografia. */
  cotaEmM: ((p: Point) => number | null) | null;
  /** Empolamento e contração da premissa de terraplenagem. */
  material: { empolamentoPct: number; contracaoPct: number };
  onBaixar: (nome: string, conteudo: string, tipo: 'text/csv' | 'image/svg+xml') => void;
  nomeDoEstudo: string;
  persistenciaIndisponivel: boolean;
  /** C3: as Vias desenhadas no loteamento e o que cada via de projeto é em relação a elas. */
  viasDoLoteamento?: ViaDoLoteamento[];
  ligacao?: Record<string, { doLoteamento: boolean; orfa: boolean }>;
  onUsarViaDoLoteamento?: (v: ViaDoLoteamento) => void;
}

const fmt = (v: number | null | undefined, casas = 2) => (v === null || v === undefined ? '—' : numeroBr(v, casas));

function CampoNumero({ rotulo, valor, passo, min, sufixo, onMudar, largura = 'w-20' }: { rotulo: string; valor: number; passo: string; min: string; sufixo?: string; onMudar: (v: number) => void; largura?: string }) {
  return (
    <label className="text-[11px] text-slate-500">
      <span className="block">{rotulo}</span>
      <span className="mt-0.5 flex items-center gap-1">
        <input
          type="number"
          step={passo}
          min={min}
          value={valor}
          aria-label={rotulo}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= Number(min)) onMudar(v);
          }}
          className={`${largura} rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800`}
        />
        {sufixo && <span className="text-slate-400">{sufixo}</span>}
      </span>
    </label>
  );
}

export default function PainelViasEGreide({ vias, ativaId, onAtiva, onTracar, onAlterar, onRemover, cotaEmM, material, onBaixar, nomeDoEstudo, persistenciaIndisponivel, viasDoLoteamento = [], ligacao = {}, onUsarViaDoLoteamento }: Props) {
  const via = vias.find((v) => v.id === ativaId) ?? vias[0] ?? null;
  const [modoDaNota, setModoDaNota] = useState<ModoDaNota>('SIMPLES');
  const [estacaDaSecao, setEstacaDaSecao] = useState<number>(0);

  const estacas = useMemo(() => (via ? estaquear(via.eixo, via.passoM) : []), [via]);
  const greide = useMemo<Greide | null>(() => {
    if (!via) return null;
    if (via.greide && via.greide.pontos.length > 0) return via.greide;
    return cotaEmM ? greideDoTerreno(estacas, cotaEmM) : null;
  }, [via, estacas, cotaEmM]);
  const greideEhDePartida = !!via && !(via.greide && via.greide.pontos.length > 0);
  const secoes = useMemo(() => (via && cotaEmM && greide ? secoesTransversais(estacas, cotaEmM, via.secaoTipo, greide) : []), [via, cotaEmM, greide, estacas]);
  const volumes = useMemo(() => (secoes.length > 1 ? volumesPorAreasMedias(secoes, material) : null), [secoes, material]);
  const nota = useMemo(() => notaDeServico(secoes, modoDaNota), [secoes, modoDaNota]);
  const avisos = useMemo(() => (greide ? conferirGreide(greide) : []), [greide]);
  const secaoEscolhida = secoes[Math.min(estacaDaSecao, Math.max(0, secoes.length - 1))] ?? null;

  const definirPiv = (distM: number, cotaM: number) => {
    if (!via || !greide) return;
    const pontos = greide.pontos.filter((p) => Math.abs(p.distM - distM) > 1e-6);
    const existente = greide.pontos.find((p) => Math.abs(p.distM - distM) <= 1e-6);
    pontos.push({ distM, cotaM, ...(existente?.curvaM ? { curvaM: existente.curvaM } : {}) });
    onAlterar(via.id, { greide: { pontos } });
  };
  const removerPiv = (distM: number) => {
    if (!via || !greide) return;
    const pontos = greide.pontos.filter((p) => Math.abs(p.distM - distM) > 1e-6);
    onAlterar(via.id, { greide: pontos.length > 0 ? { pontos } : null });
  };
  const definirCurva = (distM: number, curvaM: number) => {
    if (!via || !greide) return;
    onAlterar(via.id, { greide: { pontos: greide.pontos.map((p) => (Math.abs(p.distM - distM) <= 1e-6 ? { ...p, ...(curvaM > 0 ? { curvaM } : { curvaM: undefined }) } : p)) } });
  };
  const alterarSecao = (patch: Partial<SecaoTipo>) => via && onAlterar(via.id, { secaoTipo: { ...via.secaoTipo, ...patch } });
  const nomeBase = `${nomeDoEstudo || 'estudo'} - ${via?.nome ?? 'via'}`.replace(/[\\/:*?"<>|]+/g, '-');
  const ligada = via ? ligacao[via.id] : undefined;
  // C3: as Vias do desenho ainda sem projeto geométrico.
  const semProjeto = viasDoLoteamento.filter((k) => !vias.some((v) => v.viaUid === k.uid));
  // C3: a nota de serviço de TODAS as vias num CSV só (coluna `via`).
  const notasDeTodas = (): string => {
    if (!cotaEmM) return '';
    const linhas: string[] = [];
    vias.forEach((v, i) => {
      const e = estaquear(v.eixo, v.passoM);
      const g = v.greide && v.greide.pontos.length > 0 ? v.greide : greideDoTerreno(e, cotaEmM);
      if (!g) return;
      const csv = csvDaNotaDeServico(notaDeServico(secoesTransversais(e, cotaEmM, v.secaoTipo, g), 'SIMPLES'), 'SIMPLES').split('\n');
      if (i === 0 || linhas.length === 0) linhas.push(`via;${csv[0]}`);
      for (const l of csv.slice(1)) linhas.push(`${v.nome.replace(/;/g, ',')};${l}`);
    });
    return linhas.join('\n');
  };

  return (
    <div className="space-y-5 text-xs text-slate-700" data-testid="painel-vias">
      {persistenciaIndisponivel && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
          A tabela de vias ainda não existe neste banco: nada aqui é gravado — o eixo some ao recarregar.
        </p>
      )}

      {/* Qual via, o eixo e o passo */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-slate-500">
          <span className="block">Via</span>
          <select
            value={via?.id ?? ''}
            aria-label="Via"
            onChange={(e) => onAtiva(e.target.value || null)}
            className="mt-0.5 min-w-40 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          >
            {vias.length === 0 && <option value="">— nenhuma —</option>}
            {vias.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome} · {v.eixo.length} vértices
              </option>
            ))}
          </select>
        </label>
        {via && (
          <>
            <label className="text-[11px] text-slate-500">
              <span className="block">Nome</span>
              <input
                value={via.nome}
                aria-label="Nome da via"
                disabled={!!ligada?.doLoteamento}
                title={ligada?.doLoteamento ? 'O nome vem da via desenhada no loteamento — renomeie lá' : undefined}
                onChange={(e) => onAlterar(via.id, { nome: e.target.value })}
                className="mt-0.5 w-36 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
              />
            </label>
            <CampoNumero rotulo="Passo" valor={via.passoM} passo="5" min="1" sufixo="m" onMudar={(v) => onAlterar(via.id, { passoM: Math.min(100, v) })} />
          </>
        )}
        <button
          type="button"
          onClick={onTracar}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Traça um eixo novo na planta: cliques encadeados, clique no último vértice termina"
        >
          <Pencil className="h-3.5 w-3.5" /> Traçar eixo
        </button>
        {via && (
          <button
            type="button"
            onClick={() => onRemover(via.id)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            aria-label={`Remover ${via.nome}`}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        )}
      </div>

      {/* C3: as ruas do loteamento, prontas para virar eixo — sem traçar de novo. */}
      {semProjeto.length > 0 && onUsarViaDoLoteamento && (
        <div className="rounded-md bg-slate-50 px-3 py-2" data-testid="vias-do-loteamento">
          <p className="text-slate-700">Vias do loteamento sem projeto geométrico:</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {semProjeto.map((k) => (
              <li key={k.uid}>
                <button
                  type="button"
                  onClick={() => onUsarViaDoLoteamento(k)}
                  title="Usa o eixo desenhado no loteamento: nome, eixo, pista e calçada acompanham o desenho; greide, passo e taludes são do projeto"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Projetar {k.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!via && <p className="text-slate-500">Nenhum eixo traçado. Trace um na planta — a via nasce dele, com estacas a cada 20 m.</p>}

      {ligada?.doLoteamento && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-blue-800" data-testid="via-ligada">
          Via do loteamento: o eixo, o nome, a pista e as calçadas vêm do DESENHO — mude a rua no loteamento e as estacas, as seções e a nota acompanham.
        </p>
      )}
      {ligada?.orfa && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800" data-testid="via-orfa">
          A via do loteamento a que este projeto estava ligado foi apagada do desenho: ficou o último eixo gravado.
        </p>
      )}

      {via && (
        <>
          <p className="text-slate-600">
            {estacas.length} estacas · {fmt(estacas[estacas.length - 1]?.distM)} m
            {!cotaEmM && <> · <span className="text-amber-700">sem topografia gerada: não há terreno para comparar</span></>}
          </p>

          {/* Seção tipo */}
          <div>
            <p className="font-medium text-slate-800">Seção tipo</p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              <CampoNumero rotulo="Pista" valor={via.secaoTipo.pistaM} passo="0.5" min="1" sufixo="m" onMudar={(v) => alterarSecao({ pistaM: v })} />
              <CampoNumero rotulo="Calçada (cada)" valor={via.secaoTipo.calcadaM} passo="0.5" min="0" sufixo="m" onMudar={(v) => alterarSecao({ calcadaM: v })} />
              <CampoNumero rotulo="Talude corte 1:" valor={via.secaoTipo.taludeCorteH} passo="0.25" min="0.25" onMudar={(v) => alterarSecao({ taludeCorteH: v })} />
              <CampoNumero rotulo="Talude aterro 1:" valor={via.secaoTipo.taludeAterroH} passo="0.25" min="0.25" onMudar={(v) => alterarSecao({ taludeAterroH: v })} />
            </div>
          </div>

          {avisos.length > 0 && (
            <ul className="space-y-1">
              {avisos.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Perfil terreno × greide */}
          {secoes.length > 1 && greide && (
            <div>
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">
                  Perfil e greide{greideEhDePartida && <span className="ml-2 font-normal text-slate-500">greide de partida: reta do terreno no início ao fim — edite a cota de uma estaca para criar um PIV</span>}
                </p>
                <button
                  type="button"
                  onClick={() => onBaixar(`${nomeBase} - perfil.svg`, svgDoPerfilDaVia(secoes, greide, { titulo: `${via.nome} — perfil e greide` }), 'image/svg+xml')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> SVG
                </button>
              </div>
              {/* SVG gerado aqui, sem HTML de fora — vai como imagem (data URL), como o perfil do painel do terreno. */}
              <img
                alt={`Perfil e greide de ${via.nome}`}
                data-testid="vias-perfil"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoPerfilDaVia(secoes, greide, { largura: 620, altura: 200 }))}`}
                className="mt-1 w-full rounded-md border border-slate-200"
              />
            </div>
          )}

          {/* Estacas e greide */}
          {greide && (
            <div>
              <p className="font-medium text-slate-800">Estacas e greide</p>
              <div className="mt-1 max-h-72 overflow-auto rounded-md border border-slate-200">
                <table className="w-full text-xs" data-testid="vias-estacas">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Estaca</th>
                      <th className="px-2 py-1.5 text-right">Dist. (m)</th>
                      <th className="px-2 py-1.5 text-right">Terreno (m)</th>
                      <th className="px-2 py-1.5 text-right">Greide (m)</th>
                      <th className="px-2 py-1.5">PIV</th>
                      <th className="px-2 py-1.5 text-right">Curva (m)</th>
                      <th className="px-2 py-1.5 text-right">Aterro / corte (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estacas.map((e, i) => {
                      const s = secoes[i];
                      const cota = cotaDoGreide(greide, e.distM);
                      const piv = greide.pontos.find((p) => Math.abs(p.distM - e.distM) <= 1e-6);
                      const terreno = s?.cotaTerrenoM ?? (cotaEmM ? cotaEmM({ x: e.x, y: e.y }) : null);
                      return (
                        <tr key={e.indice} className={`border-t border-slate-100 ${i === estacaDaSecao ? 'bg-blue-50' : ''}`}>
                          <td className="px-2 py-1">
                            <button type="button" onClick={() => setEstacaDaSecao(i)} className="text-blue-700 hover:underline" title="Ver a seção transversal desta estaca">
                              {e.nome}
                            </button>
                            {e.vertice && <span className="ml-1 text-slate-400">v</span>}
                          </td>
                          <td className="px-2 py-1 text-right">{fmt(e.distM)}</td>
                          <td className="px-2 py-1 text-right">{fmt(terreno, 3)}</td>
                          <td className="px-2 py-1 text-right">
                            <input
                              type="number"
                              step="0.01"
                              aria-label={`Cota do greide na estaca ${e.nome}`}
                              value={cota === null ? '' : Math.round(cota * 1000) / 1000}
                              onChange={(ev) => {
                                const v = Number(ev.target.value);
                                if (Number.isFinite(v)) definirPiv(e.distM, v);
                              }}
                              className={`w-24 rounded-md border px-2 py-0.5 text-right ${piv ? 'border-blue-400 bg-white' : 'border-slate-200 bg-slate-50'}`}
                            />
                          </td>
                          <td className="px-2 py-1">
                            {piv ? (
                              <button type="button" onClick={() => removerPiv(e.distM)} aria-label={`Remover PIV da estaca ${e.nome}`} className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                                PIV <X className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {piv && i > 0 && i < estacas.length - 1 ? (
                              <input
                                type="number"
                                step="10"
                                min="0"
                                aria-label={`Curva vertical na estaca ${e.nome}`}
                                value={piv.curvaM ?? 0}
                                onChange={(ev) => {
                                  const v = Number(ev.target.value);
                                  if (Number.isFinite(v) && v >= 0) definirCurva(e.distM, v);
                                }}
                                className="w-16 rounded-md border border-slate-200 px-2 py-0.5 text-right"
                              />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className={`px-2 py-1 text-right ${s?.diferencaM !== null && s?.diferencaM !== undefined ? (s.diferencaM > 0 ? 'text-blue-700' : s.diferencaM < 0 ? 'text-red-700' : '') : ''}`}>
                            {s && s.diferencaM !== null ? (s.diferencaM >= 0 ? `+${fmt(s.diferencaM)}` : fmt(s.diferencaM)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => onBaixar(`${nomeBase} - greide.csv`, csvDoGreide(estacas, greide), 'text/csv')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Cotas do greide (CSV)
                </button>
              </div>
            </div>
          )}

          {/* Seção transversal da estaca escolhida */}
          {secaoEscolhida && (
            <div>
              <p className="font-medium text-slate-800">Seção transversal · estaca {secaoEscolhida.estaca.nome}</p>
              {secaoEscolhida.taludeNaoFecha && (
                <p className="mt-1 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>O talude não encontra o terreno dentro de 15 m de um dos lados: a área desta seção está incompleta.</span>
                </p>
              )}
              <img
                alt={`Seção transversal na estaca ${secaoEscolhida.estaca.nome}`}
                data-testid="vias-secao"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDaSecao(secaoEscolhida, { largura: 620, altura: 160 }))}`}
                className="mt-1 w-full rounded-md border border-slate-200"
              />
            </div>
          )}

          {/* Volumes */}
          {volumes && (
            <div>
              <p className="font-medium text-slate-800">Volumes por áreas médias</p>
              <dl className="mt-1 grid grid-cols-3 gap-x-3 gap-y-1" data-testid="vias-volumes">
                <div><dt className="text-slate-500">Corte</dt><dd className="font-medium text-slate-800">{fmt(volumes.corteM3, 1)} m³</dd></div>
                <div><dt className="text-slate-500">Aterro</dt><dd className="font-medium text-slate-800">{fmt(volumes.aterroM3, 1)} m³</dd></div>
                <div><dt className="text-slate-500">{volumes.saldoM3 >= 0 ? 'Bota-fora' : 'Empréstimo'}</dt><dd className="font-medium text-slate-800">{fmt(Math.abs(volumes.saldoM3), 1)} m³</dd></div>
                <div><dt className="text-slate-500">Solto (transporte)</dt><dd className="text-slate-800">{fmt(volumes.corteSoltoM3, 1)} m³</dd></div>
                <div><dt className="text-slate-500">Aterro em banco</dt><dd className="text-slate-800">{fmt(volumes.aterroEmBancoM3, 1)} m³</dd></div>
                {volumes.trechosSemDados > 0 && <div><dt className="text-slate-500">Trechos sem dados</dt><dd className="text-amber-700">{volumes.trechosSemDados} fora da conta</dd></div>}
              </dl>
              <div className="mt-1 max-h-48 overflow-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Trecho</th>
                      <th className="px-2 py-1.5 text-right">L (m)</th>
                      <th className="px-2 py-1.5 text-right">Corte (m³)</th>
                      <th className="px-2 py-1.5 text-right">Aterro (m³)</th>
                      <th className="px-2 py-1.5 text-right">Corte acum.</th>
                      <th className="px-2 py-1.5 text-right">Aterro acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volumes.trechos.map((t) => (
                      <tr key={t.de.indice} className="border-t border-slate-100">
                        <td className="px-2 py-1">{t.de.nome} → {t.ate.nome}</td>
                        <td className="px-2 py-1 text-right">{fmt(t.compM)}</td>
                        <td className="px-2 py-1 text-right">{fmt(t.corteM3, 1)}</td>
                        <td className="px-2 py-1 text-right">{fmt(t.aterroM3, 1)}</td>
                        <td className="px-2 py-1 text-right">{fmt(t.corteAcumM3, 1)}</td>
                        <td className="px-2 py-1 text-right">{fmt(t.aterroAcumM3, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Nota de serviço e locação */}
          {secoes.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-800">Nota de serviço</p>
                <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {(
                    [
                      ['SIMPLES', 'Simples'],
                      ['COMPOSTA', 'Composta'],
                    ] as [ModoDaNota, string][]
                  ).map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={modoDaNota === valor}
                      onClick={() => setModoDaNota(valor)}
                      className={`rounded-[4px] px-2 py-1 text-xs font-medium transition-all ${modoDaNota === valor ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Simples: cota do terreno e do greide no eixo, com o aterro ou corte. Composta: mais os bordos e os pés/cristas de talude, com offset e cota, e as áreas da seção.
              </p>
              <div className="mt-1 max-h-64 overflow-auto rounded-md border border-slate-200">
                <table className="w-full text-xs" data-testid="vias-nota">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Estaca</th>
                      <th className="px-2 py-1.5 text-right">Terreno</th>
                      <th className="px-2 py-1.5 text-right">Projeto</th>
                      <th className="px-2 py-1.5 text-right">Aterro</th>
                      <th className="px-2 py-1.5 text-right">Corte</th>
                      {modoDaNota === 'COMPOSTA' && (
                        <>
                          <th className="px-2 py-1.5 text-right">Bordo E</th>
                          <th className="px-2 py-1.5 text-right">Bordo D</th>
                          <th className="px-2 py-1.5 text-right">Pé E</th>
                          <th className="px-2 py-1.5 text-right">Pé D</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {nota.map((l) => (
                      <tr key={l.estaca} className="border-t border-slate-100">
                        <td className="px-2 py-1">{l.estaca}</td>
                        <td className="px-2 py-1 text-right">{fmt(l.terrenoM, 3)}</td>
                        <td className="px-2 py-1 text-right">{fmt(l.projetoM, 3)}</td>
                        <td className="px-2 py-1 text-right text-blue-700">{l.diferencaM !== null && l.diferencaM > 0 ? fmt(l.diferencaM, 3) : ''}</td>
                        <td className="px-2 py-1 text-right text-red-700">{l.diferencaM !== null && l.diferencaM < 0 ? fmt(-l.diferencaM, 3) : ''}</td>
                        {modoDaNota === 'COMPOSTA' && (
                          <>
                            <td className="px-2 py-1 text-right">{l.bordoEsq ? `${fmt(l.bordoEsq.offsetM, 1)} / ${fmt(l.bordoEsq.cotaM, 3)}` : '—'}</td>
                            <td className="px-2 py-1 text-right">{l.bordoDir ? `${fmt(l.bordoDir.offsetM, 1)} / ${fmt(l.bordoDir.cotaM, 3)}` : '—'}</td>
                            <td className="px-2 py-1 text-right">{l.peEsq ? `${fmt(l.peEsq.offsetM, 1)} / ${fmt(l.peEsq.cotaM, 3)}` : '—'}</td>
                            <td className="px-2 py-1 text-right">{l.peDir ? `${fmt(l.peDir.offsetM, 1)} / ${fmt(l.peDir.cotaM, 3)}` : '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onBaixar(`${nomeBase} - nota de servico ${modoDaNota.toLowerCase()}.csv`, csvDaNotaDeServico(nota, modoDaNota), 'text/csv')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Nota de serviço (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => onBaixar(`${nomeBase} - locacao.csv`, csvDeLocacaoDaVia(pontosDeLocacaoDaVia(secoes, via.nome)), 'text/csv')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  title="Eixo, bordos e pés de talude por estaca, com a cota de projeto — no PNEZD que Importar levantamento lê de volta"
                >
                  <Download className="h-3.5 w-3.5" /> Pontos de locação (CSV)
                </button>
                {vias.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onBaixar(`${nomeDoEstudo || 'estudo'} - notas de servico de todas as vias.csv`, notasDeTodas(), 'text/csv')}
                    title="A nota de serviço simples de cada via, uma embaixo da outra, com a coluna via"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Notas de todas as vias ({vias.length})
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
