import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Loader2, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import type { P2PEdge, P2PProcessItem, P2PStage, P2PTemplateAtivo } from '../../services/p2pFlowService';
import { INSTANCE_STATUS_LABEL } from '../../types/process';
import { SEAM_CFG } from './p2pSeam';
import type { P2PSelecao } from './P2PCanvas';

// Cromo do §28 — copiado de rentals/RentalAnalysisOverview.tsx, não interpretado.
const GRID = '#f1f5f9';
const CATEGORY_TICK = { fontSize: 12, fill: '#475569' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: 12,
};
const TOOLTIP_CURSOR = { fill: '#f8fafc' };
const INITIAL_DIMENSION = { width: 320, height: 200 };
const END_LABEL = { position: 'right' as const, fontSize: 11, fill: '#64748b' };
const SERIE_PRINCIPAL = '#3b82f6';
const SERIE_CONTEXTO = '#94a3b8';

const COLUNAS: StandardTableColumn[] = [
  { key: 'label',     label: 'Etapa',     sortable: true, width: 130 },
  { key: 'count',     label: 'Registros', sortable: true, width: 84, align: 'right' },
  { key: 'pending',   label: 'Pendentes', sortable: true, width: 84, align: 'right' },
  { key: 'processos', label: 'Processos', sortable: true, width: 84, align: 'right' },
  { key: 'seam',      label: 'Entrada',   sortable: true, width: 104 },
];

const fmtDataHora = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : undefined;

/** Carrega as instâncias de processo nascidas num nó — o `getStageProcesses` do serviço do fluxo. */
export type CarregarProcessos = (stageId: string, organizationId: string | null, projectId?: string) => Promise<P2PProcessItem[]>;

/** Instâncias de processo nascidas no nó emissor da aresta selecionada. */
function ProcessosDaAresta({ edge, organizationId, projectId, carregarProcessos }: {
  edge: P2PEdge; organizationId: string | null; projectId?: string; carregarProcessos: CarregarProcessos;
}) {
  const [itens, setItens] = useState<P2PProcessItem[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setItens(null);
    carregarProcessos(edge.from, organizationId, projectId)
      .then(lista => { if (vivo) setItens(lista); })
      .catch(() => { if (vivo) setItens([]); });
    return () => { vivo = false; };
  }, [edge.from, organizationId, projectId, carregarProcessos]);

  if (itens === null) return <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-blue-600" /></div>;
  if (itens.length === 0) return <p className="text-xs text-gray-500">Nenhum processo em andamento nesta transição.</p>;
  return (
    <ul className="rounded-[10px] border border-gray-100 divide-y divide-gray-100">
      {itens.map(p => (
        <li key={p.id} className="px-3 py-2 flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm text-gray-800 truncate" title={p.title}>{p.title}</span>
            <span className="block text-xs text-gray-500 truncate">{p.templateName}{p.stepName && ` · ${p.stepName}`}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-sm font-normal ${p.overdue ? 'text-red-600' : 'text-gray-600'}`}>
              {p.overdue ? 'Atrasado' : (INSTANCE_STATUS_LABEL[p.status] ?? p.status)}
            </span>
            {p.dueAt && <span className="block text-xs text-gray-400">prazo {fmtDataHora(p.dueAt)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Coluna da direita do canvas: gráfico de registros por etapa (§28 — barras
 * horizontais, ênfase na etapa selecionada), a tabela das etapas (§6.10) e
 * o detalhe do que está selecionado no desenho (nó ou transição).
 */
export function P2PMetricsPanel({
  stages, edges, selecao, organizationId, projectId, loading,
  onClose, onSelectNode, onOpenNode, onNovoGatilho, onEditarTemplate, nomeDaOrg,
  carregarProcessos, storageKey = 'p2p:metricas:etapas',
}: {
  stages: P2PStage[];
  edges: P2PEdge[];
  selecao: P2PSelecao;
  organizationId: string | null;
  projectId?: string;
  loading: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
  onNovoGatilho: (edge: P2PEdge) => void;
  onEditarTemplate: (tpl: P2PTemplateAtivo, edge: P2PEdge) => void;
  /** Nome da organização dona de um modelo — só aparece quando a transição tem modelos de mais de uma org ("Todas"). */
  nomeDaOrg?: (id: string) => string | undefined;
  carregarProcessos: CarregarProcessos;
  /** Chave da tabela de etapas (colunas, larguras) — uma por fluxo. */
  storageKey?: string;
}) {
  const noId = selecao?.tipo === 'no' ? selecao.id : null;
  const no = noId ? stages.find(s => s.id === noId) ?? null : null;
  const aresta = selecao?.tipo === 'aresta' ? edges.find(e => e.id === selecao.id) ?? null : null;

  const dados = useMemo(() => stages.map(s => ({ id: s.id, label: s.label, count: s.count })), [stages]);
  const linhas = useMemo(() => stages, [stages]);

  return (
    <aside className="bg-white rounded-[10px] border border-gray-100 shadow-sm flex flex-col min-h-0 lg:max-h-[560px]">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Métricas do fluxo</h3>
        <ActionIconButton kind="view" size="sm" title="Fechar métricas" icon={<X className="w-4 h-4" />} onClick={onClose} />
      </div>

      <div className="p-4 space-y-5 overflow-y-auto">
        <section>
          <h4 className="text-sm font-semibold text-gray-700">Registros por etapa</h4>
          <p className="text-xs text-gray-400 mt-0.5">Registros em cada etapa, no recorte do filtro de obra. Clique na barra para selecionar a etapa.</p>
          {stages.length === 0 ? (
            <p className="mt-3 min-h-[120px] text-sm text-gray-400">{loading ? 'Carregando…' : 'Nenhuma etapa carregada — atualize o quadro.'}</p>
          ) : (
            <div className="mt-3" style={{ height: dados.length * 44 + 16 }}>
              <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={12}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={110} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                  <RechartsTooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(v) => [String(v), 'Registros']} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                    cursor="pointer"
                    isAnimationActive={false}
                    label={END_LABEL}
                    onClick={(d: { payload?: { id?: string } }) => d?.payload?.id && onSelectNode(d.payload.id)}
                  >
                    {dados.map(d => <Cell key={d.id} fill={!noId || noId === d.id ? SERIE_PRINCIPAL : SERIE_CONTEXTO} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Etapas</h4>
          <div className="rounded-[10px] border border-gray-100 overflow-hidden">
            {/* Sem busca: poucas linhas fixas (8 no P2P, 11 no Financeiro); o filtro da tela é o de obra no cabeçalho. */}
            <StandardTable<P2PStage>
              storageKey={storageKey}
              columns={COLUNAS}
              rows={linhas}
              rowKey={s => s.id}
              dense
              bare
              loading={loading && stages.length === 0}
              onRowClick={s => onSelectNode(s.id)}
              rowClassName={s => (noId === s.id ? 'bg-blue-50/60' : '')}
              sortValue={(key, s) => key === 'count' ? s.count : key === 'pending' ? (s.pending ?? 0) : key === 'processos' ? (s.processes?.ativos ?? 0) : key === 'seam' ? SEAM_CFG[s.inboundSeam].label : s.label}
              renderCell={(key, s) => {
                if (key === 'count') return <span className="text-sm font-normal text-gray-600">{s.count}</span>;
                if (key === 'pending') return <span className="text-sm font-normal text-gray-600">{s.pending ?? 0}</span>;
                if (key === 'processos') return <span className="text-sm font-normal text-gray-600">{s.processes ? s.processes.ativos : '—'}</span>;
                if (key === 'seam') return <span className={`text-sm font-normal ${SEAM_CFG[s.inboundSeam].text}`}>{SEAM_CFG[s.inboundSeam].label}</span>;
                return <span className="text-sm font-normal text-gray-700">{s.label}</span>;
              }}
              empty={{ title: 'Nenhuma etapa', subtitle: 'Atualize o quadro.' }}
            />
          </div>
        </section>

        {no && (
          <section data-detalhe="no" className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">{no.label}</h4>
            <p className="text-xs text-gray-500">{no.owner}</p>
            <p className="text-sm">
              <span className="text-gray-500">Entrada: </span>
              <span className={`font-normal ${SEAM_CFG[no.inboundSeam].text}`}>{SEAM_CFG[no.inboundSeam].label}</span>
            </p>
            {no.inboundNote && <p className="text-xs text-gray-500">{no.inboundNote}</p>}
            <button
              type="button"
              onClick={() => onOpenNode(no.id)}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Ver registros <ChevronRight className="w-[15px] h-[15px]" />
            </button>
          </section>
        )}

        {aresta && (
          <section data-detalhe="aresta" className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">
              {stages.find(s => s.id === aresta.from)?.label ?? aresta.from} → {stages.find(s => s.id === aresta.to)?.label ?? aresta.to}
            </h4>
            <p className="text-sm">
              <span className="text-gray-500">Transição: </span>
              <span className={`font-normal ${SEAM_CFG[aresta.seam].text}`}>{SEAM_CFG[aresta.seam].label}</span>
            </p>
            {aresta.note && <p className="text-xs text-gray-500">{aresta.note}</p>}

            {aresta.eventKeys ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500">Modelos que escutam esta transição</p>
                  {(aresta.templates ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhum modelo escuta esta transição.</p>
                  ) : (
                    <ul className="rounded-[10px] border border-gray-100 divide-y divide-gray-100">
                      {aresta.templates!.map(t => {
                        const variasOrgs = new Set(aresta.templates!.map(x => x.organizationId)).size > 1;
                        const org = variasOrgs ? nomeDaOrg?.(t.organizationId) : undefined;
                        return (
                          <li key={t.id} className="px-3 py-1.5 flex items-center gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-700 truncate" title={t.name}>{t.name}</span>
                              {org && <span className="block text-xs text-gray-400 truncate">{org}</span>}
                            </span>
                            <ActionIconButton kind="edit" size="sm" title={`Editar "${t.name}"${org ? ` (${org})` : ''}`} onClick={() => onEditarTemplate(t, aresta)} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500">Processos em andamento</p>
                  <ProcessosDaAresta edge={aresta} organizationId={organizationId} projectId={projectId} carregarProcessos={carregarProcessos} />
                </div>
                <button
                  type="button"
                  onClick={() => onNovoGatilho(aresta)}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                  <Plus className="w-[15px] h-[15px]" /> Novo gatilho
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-500">Esta transição é feita pelo próprio sistema e não emite evento para o motor de Processos.</p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
