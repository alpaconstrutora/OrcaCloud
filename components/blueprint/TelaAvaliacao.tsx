/**
 * TELA "Avaliação" (19/09/2026, E5.2). A nota geral (média ponderada dos
 * indicadores avaliados), os três piores em destaque, a tabela dos dezoito
 * indicadores com nota, peso (editável), explicação e detalhes, e os alvos
 * clicáveis (o ambiente/porta/peça que puxou a nota). As hipóteses (pesos,
 * custo/m² de referência, vão de viga, módulo, raio do shaft) são do
 * navegador. Só leitura do desenho; nada trava.
 *
 * Aba **Sugestões** (E5.3): o texto determinístico derivado dos piores
 * indicadores, com prioridade, alvo clicável, porta de entrada (tela/gaveta)
 * e o botão Copiar (o texto corrido que a IA da E6.4 vai receber).
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, RotateCcw } from 'lucide-react';
import { resumirSugestoes, ROTULO_DA_PRIORIDADE, sugerirMelhorias, textoDasSugestoes, type DestinoDaSugestao, type PrioridadeDaSugestao } from '../../utils/blueprintSugestoes';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import {
  CHAVES_DOS_INDICADORES,
  corDaNota,
  HIPOTESES_DA_AVALIACAO_PADRAO,
  PESOS_PADRAO,
  ROTULO_DO_INDICADOR,
  type Avaliacao,
  type HipotesesDaAvaliacao,
  type Indicador,
} from '../../utils/blueprintAvaliacao';

interface Props {
  avaliacao: Avaliacao;
  hipoteses: HipotesesDaAvaliacao;
  onHipoteses: (h: HipotesesDaAvaliacao) => void;
  onSelecionar: (id: string) => void;
  /** Para onde a sugestão leva quando não é um elemento (tela ou gaveta). */
  onNavegar?: (destino: DestinoDaSugestao) => void;
}

type AbaDaAvaliacao = 'indicadores' | 'sugestoes';

const TOM: Record<ReturnType<typeof corDaNota>, { texto: string; barra: string; fundo: string }> = {
  verde: { texto: 'text-emerald-700', barra: 'bg-emerald-500', fundo: 'bg-emerald-50' },
  ambar: { texto: 'text-amber-800', barra: 'bg-amber-500', fundo: 'bg-amber-50' },
  vermelho: { texto: 'text-red-700', barra: 'bg-red-500', fundo: 'bg-red-50' },
  cinza: { texto: 'text-slate-500', barra: 'bg-slate-300', fundo: 'bg-slate-50' },
};

export function NotaGeral({ nota, tamanho = 'md' }: { nota: number | null; tamanho?: 'md' | 'lg' }) {
  const tom = TOM[corDaNota(nota)];
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums ${tom.fundo} ${tom.texto} ${tamanho === 'lg' ? 'h-20 w-20 text-3xl' : 'h-10 w-10 text-sm'}`} data-testid="nota-geral">
      {nota == null ? '—' : nota}
    </span>
  );
}

function Barra({ nota }: { nota: number | null }) {
  const tom = TOM[corDaNota(nota)];
  return (
    <span className="inline-flex w-40 items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full ${tom.barra}`} style={{ width: `${nota ?? 0}%` }} />
      </span>
      <span className={`w-8 text-right text-sm font-semibold tabular-nums ${tom.texto}`}>{nota == null ? '—' : nota}</span>
    </span>
  );
}

export default function TelaAvaliacao({ avaliacao, hipoteses, onHipoteses, onSelecionar, onNavegar }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [aba, setAba] = usePersistedState<AbaDaAvaliacao>('blueprint:avaliacao:aba', 'indicadores');
  const sugestoes = useMemo(() => sugerirMelhorias(avaliacao), [avaliacao]);
  const resumoDasSugestoes = useMemo(() => resumirSugestoes(sugestoes), [sugestoes]);
  const [copiado, setCopiado] = useState(false);
  const abas: TabsBarItem[] = [
    { id: 'indicadores', label: 'Indicadores', badge: avaliacao.avaliados },
    { id: 'sugestoes', label: 'Sugestões', badge: resumoDasSugestoes.total },
  ];
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoDasSugestoes(avaliacao, sugestoes));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  const [mostrarHipoteses, setMostrarHipoteses] = useState(false);
  const setPeso = (chave: Indicador['chave'], v: number) => onHipoteses({ ...hipoteses, pesos: { ...hipoteses.pesos, [chave]: Math.max(0, Math.min(10, Math.round(v))) } });
  const campo = 'h-8 w-24 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums';

  return (
    <div className="space-y-4" data-testid="tela-avaliacao">
      <div className="flex flex-wrap items-center gap-5 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="resumo-da-avaliacao">
        <NotaGeral nota={avaliacao.notaGeral} tamanho="lg" />
        <div className="min-w-[16rem] flex-1 text-sm text-gray-700">
          <p>
            <strong className="text-gray-900">Nota geral</strong> · média ponderada de <strong>{avaliacao.avaliados}</strong> indicador(es) avaliado(s)
            {avaliacao.naoAvaliados > 0 && <span className="text-slate-500"> · {avaliacao.naoAvaliados} não avaliado(s) por falta de dado</span>}
          </p>
          {avaliacao.piores.length > 0 && (
            <p className="mt-1 text-xs text-slate-600" data-testid="piores">
              Pesam mais para baixo: {avaliacao.piores.map((i) => `${i.rotulo} (${i.nota})`).join(' · ')}.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Réguas de pré-projeto, escritas em cada indicador — servem para comparar alternativas do mesmo estudo. O que não deu para medir fica "não avaliado" e diz o que falta. Nada aqui trava o desenho.
          </p>
        </div>
        <button type="button" onClick={() => setMostrarHipoteses((v) => !v)} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50" aria-expanded={mostrarHipoteses}>
          {mostrarHipoteses ? 'Ocultar hipóteses' : 'Pesos e hipóteses'}
        </button>
      </div>

      {mostrarHipoteses && (
        <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="hipoteses-da-avaliacao">
          <div className="flex flex-wrap items-end gap-4 text-xs text-slate-600">
            <label className="flex flex-col gap-1">
              Custo/m² de referência (R$)
              <input
                key={hipoteses.referenciaM2BRL ?? ''}
                type="number"
                min={0}
                step={50}
                defaultValue={hipoteses.referenciaM2BRL ?? ''}
                placeholder="ex.: 3200"
                aria-label="Custo por m² de referência (R$)"
                onBlur={(e) => {
                  const v = e.target.value.trim() ? Number(e.target.value) : null;
                  if (v === null || (Number.isFinite(v) && v > 0)) onHipoteses({ ...hipoteses, referenciaM2BRL: v });
                }}
                className={campo}
              />
            </label>
            <label className="flex flex-col gap-1">
              Vão máx. de viga (m)
              <input key={hipoteses.vaoMaxDaVigaMm} type="number" min={1} step={0.5} defaultValue={hipoteses.vaoMaxDaVigaMm / 1000} aria-label="Vão máximo de viga (m)" onBlur={(e) => Number(e.target.value) > 0 && onHipoteses({ ...hipoteses, vaoMaxDaVigaMm: Math.round(Number(e.target.value) * 1000) })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              Módulo (mm)
              <input key={hipoteses.moduloMm} type="number" min={10} step={10} defaultValue={hipoteses.moduloMm} aria-label="Módulo da malha (mm)" onBlur={(e) => Number(e.target.value) > 0 && onHipoteses({ ...hipoteses, moduloMm: Math.round(Number(e.target.value)) })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              Raio do shaft (m)
              <input key={hipoteses.raioDoShaftMm} type="number" min={0.5} step={0.5} defaultValue={hipoteses.raioDoShaftMm / 1000} aria-label="Raio de atendimento do shaft (m)" onBlur={(e) => Number(e.target.value) > 0 && onHipoteses({ ...hipoteses, raioDoShaftMm: Math.round(Number(e.target.value) * 1000) })} className={campo} />
            </label>
            <button type="button" onClick={() => onHipoteses({ ...HIPOTESES_DA_AVALIACAO_PADRAO, pesos: { ...PESOS_PADRAO } })} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-slate-50" data-testid="restaurar-padrao">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Os pesos (0–10) ficam na coluna Peso da tabela; peso 0 tira o indicador da média.</p>
        </div>
      )}

      <div className="rounded-[6px] border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2">
          <TabsBar tabs={abas} value={aba} onChange={(id) => setAba(id as AbaDaAvaliacao)} bare />
          {aba === 'sugestoes' && (
            <button type="button" onClick={() => void copiar()} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-slate-50" data-testid="copiar-sugestoes">
              <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado' : 'Copiar como texto'}
            </button>
          )}
        </div>
        {aba === 'sugestoes' && (
          <div className="px-4 py-3" data-testid="sugestoes">
            <p className="text-xs text-slate-600" data-testid="resumo-das-sugestoes">
              <strong className="text-gray-900">{resumoDasSugestoes.total} sugestão(ões)</strong> · {resumoDasSugestoes.altas} alta(s), {resumoDasSugestoes.medias} média(s), {resumoDasSugestoes.baixas} baixa(s)
              {resumoDasSugestoes.desbloqueios > 0 && <> · {resumoDasSugestoes.desbloqueios} para destravar avaliações</>} — derivadas dos indicadores abaixo de 75, na ordem do impacto (100 − nota) × peso. Texto determinístico, sem IA.
            </p>
            {sugestoes.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nada a sugerir: todos os indicadores avaliados estão em 75 ou mais.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {sugestoes.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start gap-3 py-2" data-testid={`sugestao-${s.id}`}>
                    <PrioridadeBadge prioridade={s.prioridade} desbloqueio={s.desbloqueio} />
                    <div className="min-w-[14rem] flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {s.titulo}
                        <span className="ml-2 text-xs font-normal text-slate-400">{s.rotuloDoIndicador}</span>
                      </p>
                      <p className="text-xs text-gray-600">{s.texto}</p>
                    </div>
                    <span className="flex items-center gap-1">
                      {s.alvo && (
                        <button type="button" onClick={() => onSelecionar(s.alvo!.id)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-50">
                          Ir para {s.alvo.rotulo}
                        </button>
                      )}
                      {s.destino && onNavegar && (
                        <button type="button" onClick={() => onNavegar(s.destino!)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-50">
                          Abrir {ROTULO_DO_DESTINO[s.destino]}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {aba === 'indicadores' && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="tabela-de-indicadores">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Indicador</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2 font-medium">Peso</th>
              <th className="px-4 py-2 font-medium">Explicação</th>
            </tr>
          </thead>
          <tbody>
            {CHAVES_DOS_INDICADORES.map((chave) => {
              const i = avaliacao.indicadores.find((x) => x.chave === chave)!;
              const temMais = i.detalhes.length > 0 || i.alvos.length > 0;
              const abertoAqui = aberto === chave;
              return (
                <React.Fragment key={chave}>
                  <tr className={`border-t border-slate-100 align-top ${temMais ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => temMais && setAberto(abertoAqui ? null : chave)} aria-label={`Indicador ${ROTULO_DO_INDICADOR[chave]}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      <span className="inline-flex items-center gap-1">
                        {temMais ? abertoAqui ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <span className="inline-block w-3.5" />}
                        {i.rotulo}
                      </span>
                    </td>
                    <td className="px-4 py-2">{i.nota == null ? <span className="text-xs text-slate-500">não avaliado</span> : <Barra nota={i.nota} />}</td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="number" min={0} max={10} value={i.peso} onChange={(e) => setPeso(chave, Number(e.target.value))} aria-label={`Peso de ${i.rotulo}`} className="h-8 w-16 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums" />
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">{i.explicacao}</td>
                  </tr>
                  {abertoAqui && (
                    <tr className="bg-slate-50" data-testid={`detalhes-${chave}`}>
                      <td colSpan={4} className="px-4 py-2 text-xs text-slate-700">
                        {i.detalhes.length > 0 && (
                          <ul className="list-disc space-y-0.5 pl-5">
                            {i.detalhes.map((d, k) => (
                              <li key={k}>{d}</li>
                            ))}
                          </ul>
                        )}
                        {i.alvos.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Ir para:
                            {i.alvos.slice(0, 12).map((a, k) => (
                              <button key={`${a.id}-${k}`} type="button" onClick={() => onSelecionar(a.id)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-blue-700 hover:bg-blue-50">
                                {a.rotulo}
                              </button>
                            ))}
                            {i.alvos.length > 12 && <span className="text-slate-500">… e mais {i.alvos.length - 12}</span>}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </div>
  );
}

const ROTULO_DO_DESTINO: Record<DestinoDaSugestao, string> = {
  programa: 'Programa',
  legislacao: 'Legislação',
  insolacao: 'Insolação',
  orcamento: 'Orçamento',
  terreno: 'Dados do lote',
  grafo: 'Grafo espacial',
  quantitativos: 'Quantitativos',
};

function PrioridadeBadge({ prioridade, desbloqueio }: { prioridade: PrioridadeDaSugestao; desbloqueio: boolean }) {
  if (desbloqueio) return <span className="mt-0.5 w-16 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[11px] font-medium text-slate-600">dado</span>;
  const tom = prioridade === 'ALTA' ? 'bg-red-50 text-red-700' : prioridade === 'MEDIA' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700';
  return <span className={`mt-0.5 w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${tom}`}>{ROTULO_DA_PRIORIDADE[prioridade]}</span>;
}

/** Cartão compacto para o Resumo dos Quantitativos: nota geral + os três piores. */
export function CartaoDaAvaliacao({ avaliacao, onAbrir }: { avaliacao: Avaliacao; onAbrir: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-slate-200 bg-white p-4" data-testid="cartao-da-avaliacao">
      <NotaGeral nota={avaliacao.notaGeral} />
      <div className="flex-1 text-sm text-slate-700">
        <p>
          <strong className="text-gray-900">Avaliação</strong> · {avaliacao.avaliados} indicador(es) avaliado(s){avaliacao.naoAvaliados > 0 ? `, ${avaliacao.naoAvaliados} sem dado` : ''}
        </p>
        {avaliacao.piores.length > 0 && <p className="text-xs text-slate-500">Piores: {avaliacao.piores.map((i) => `${i.rotulo} (${i.nota})`).join(' · ')}</p>}
      </div>
      <button type="button" onClick={onAbrir} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50">
        Ver avaliação
      </button>
    </div>
  );
}
