import React, { useCallback, useEffect, useState } from 'react';
import {
  Workflow, RefreshCw, ChevronRight, Loader2, Inbox, Building2, BarChart3, Plus,
} from 'lucide-react';
import type {
  FlowService, FlowStage, FlowRecord, FlowProcessItem, FlowEdge, FlowGroup, FlowTemplateAtivo, SeamStatus,
} from '../../types/processFlow';
import { processService } from '../../services/processService';
import { INSTANCE_STATUS_LABEL, PROCESS_EVENT_LABEL } from '../../types/process';
import type { Celulas } from '../../utils/p2pLayout';
import { KpiCard, KpiColor } from '../ui/KpiCard';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { useStore } from '../../store/useStore';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import TemplateEditorModal, { type ModeloEmEdicao } from '../processos/TemplateEditorModal';
import { SEAM_CFG } from '../p2p/p2pSeam';
import { P2PCanvas, type P2PSelecao } from '../p2p/P2PCanvas';
import { P2PLibrary } from '../p2p/P2PLibrary';
import { P2PMetricsPanel } from '../p2p/P2PMetricsPanel';
import { P2PListaMobile } from '../p2p/P2PListaMobile';

/**
 * O que distingue uma Torre de Controle da outra (P2P em Suprimentos,
 * Financeiro): textos do cabeçalho, o serviço que monta o quadro, o arranjo
 * das etapas no desenho, os ícones e as chaves do que fica salvo no navegador.
 * O resto — KPIs de costura, canvas, biblioteca, painel, drawers, editor de
 * gatilho — é o mesmo, e mora aqui (§31 do guia de UI). Nasceu do corpo do
 * `P2PFlowBoard` em 16/10/2026, quando a Torre do Financeiro apareceu.
 */
export interface FlowBoardConfig {
  titulo: string;
  subtitulo: string;
  service: FlowService;
  celulas: Celulas;
  icones: Record<string, React.ElementType>;
  /** Chave do painel de métricas aberto/fechado (`usePersistedState`). */
  chavePainel: string;
  /** Chave da tabela de etapas do painel (colunas e larguras). */
  chaveTabela: string;
}

interface Props {
  config: FlowBoardConfig;
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

// KPIs de saúde das integrações — um por situação da costura de entrada.
const SEAM_KPI: { seam: SeamStatus; label: string; sub: string; color: KpiColor; vazio: string }[] = [
  { seam: 'auto',        label: 'Automáticas',  sub: 'Integração sem intervenção', color: 'emerald', vazio: 'Nenhuma etapa recebe dados automaticamente.' },
  { seam: 'orquestrada', label: 'Orquestradas', sub: 'Conduzidas por um processo', color: 'indigo',  vazio: 'Nenhuma etapa é conduzida por processo. Crie um gatilho numa transição do fluxo.' },
  { seam: 'manual',      label: 'Semi-manuais', sub: 'Exigem ação do usuário',     color: 'amber',   vazio: 'Nenhuma etapa depende de ação manual.' },
  { seam: 'gap',         label: 'Lacunas',      sub: 'Sem integração',             color: 'red',     vazio: 'Nenhuma lacuna de integração.' },
];

const fmtDataHora = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : undefined;

const BTN_PRIMARIO   = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50';
const BTN_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50';

/**
 * Desktop × celular decidido por JS, não por CSS: renderizar canvas e lista
 * ao mesmo tempo (escondendo um por `hidden lg:block`) duplicaria o nome de
 * cada etapa no DOM. Sem `matchMedia` (jsdom) é desktop.
 */
function useDesktop(): boolean {
  const consulta = () => (typeof window === 'undefined' || !window.matchMedia) ? true : window.matchMedia('(min-width: 1024px)').matches;
  const [desktop, setDesktop] = useState(consulta);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const aoMudar = () => setDesktop(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);
  return desktop;
}

// ── Registros de uma etapa (corpo do drawer) ────────────────────────────────
function StageRecords({ service, stageId, organizationId, projectId }: {
  service: FlowService;
  stageId: string;
  organizationId: string | null;
  projectId?: string;
}) {
  const [records, setRecords] = useState<FlowRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    service.getStageRecords(stageId, organizationId, projectId)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [service, stageId, organizationId, projectId]);

  if (loading) return (
    <div className="text-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
      <p className="mt-2 text-gray-500">Carregando...</p>
    </div>
  );

  if (records.length === 0) return (
    <div className="text-center py-12">
      <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro nesta etapa</h3>
      <p className="text-sm text-gray-500">Tente outra obra no filtro do topo da tela.</p>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-[10px] divide-y divide-gray-100">
      {records.map(r => (
        <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 break-words">{r.label}</p>
            {r.sublabel && <p className="text-xs text-gray-500 break-words">{r.sublabel}</p>}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {r.status && <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{r.status}</span>}
            {r.date && <span className="text-xs text-gray-400">{r.date}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Processos nascidos numa etapa (corpo do drawer, só para nó com evento) ──
function StageProcesses({ service, stage, organizationId, projectId, onNavigate }: {
  service: FlowService;
  stage: FlowStage;
  organizationId: string | null;
  projectId?: string;
  onNavigate: (v: string) => void;
}) {
  const [itens, setItens] = useState<FlowProcessItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    service.getStageProcesses(stage.id, organizationId, projectId)
      .then(setItens)
      .finally(() => setLoading(false));
  }, [service, stage.id, organizationId, projectId]);

  const templates = stage.processes?.templates ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Processos em andamento</h3>
        <button
          onClick={() => onNavigate('opura-processos')}
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Abrir Processos <ChevronRight className="w-[15px] h-[15px]" />
        </button>
      </div>
      {templates.length > 0 && (
        <p className="text-xs text-gray-500">Nascem aqui: {templates.join(', ')}.</p>
      )}
      {loading ? (
        <div className="text-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
        </div>
      ) : itens.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">
          {templates.length > 0
            ? 'Nenhum processo em andamento nascido nesta etapa.'
            : 'Nenhum modelo ativo escuta esta etapa. Crie um gatilho na transição seguinte para ela virar orquestrada.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-[10px] divide-y divide-gray-100">
          {itens.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 break-words">{p.title}</p>
                <p className="text-xs text-gray-500 break-words">
                  {p.templateName}{p.stepName && ` · ${p.stepName}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={`text-sm font-normal whitespace-nowrap ${p.overdue ? 'text-red-600' : 'text-gray-600'}`}>
                  {p.overdue ? 'Atrasado' : (INSTANCE_STATUS_LABEL[p.status] ?? p.status)}
                </span>
                {p.dueAt && <span className="text-xs text-gray-400">prazo {fmtDataHora(p.dueAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Drawer de uma etapa ─────────────────────────────────────────────────────
function StageSheet({ service, stage, organizationId, projectId, onClose, onNavigate }: {
  service: FlowService;
  stage: FlowStage | null;
  organizationId: string | null;
  projectId?: string;
  onClose: () => void;
  onNavigate: (v: string) => void;
}) {
  const seam = stage ? SEAM_CFG[stage.inboundSeam] : null;
  return (
    <Sheet open={!!stage} onClose={onClose} size="lg">
      {stage && seam && (
        <>
          <SheetHeader onClose={onClose}>
            <SheetTitle>{stage.label}</SheetTitle>
            <SheetDescription>
              {stage.owner} · {stage.count} {stage.count === 1 ? 'registro' : 'registros'}
              {stage.pending != null && stage.pending > 0 && ` · ${stage.pending} pendentes`}
            </SheetDescription>
          </SheetHeader>

          <SheetPanel className="p-6 space-y-4">
            <div className="flex items-start gap-2">
              <seam.icon className={`w-4 h-4 mt-0.5 shrink-0 ${seam.text}`} />
              <div>
                <p className={`text-sm font-medium ${seam.text}`}>Entrada: {seam.label}</p>
                {stage.inboundNote && <p className="text-xs text-gray-500">{stage.inboundNote}</p>}
              </div>
            </div>
            <StageRecords service={service} stageId={stage.id} organizationId={organizationId} projectId={projectId} />
            {stage.eventKeys && (
              <StageProcesses service={service} stage={stage} organizationId={organizationId} projectId={projectId} onNavigate={onNavigate} />
            )}
          </SheetPanel>

          <SheetFooter>
            <button onClick={onClose} className={BTN_SECUNDARIO}>Fechar</button>
            {stage.view && (
              <button onClick={() => onNavigate(stage.view!)} className={BTN_PRIMARIO}>
                Abrir módulo <ChevronRight className="w-[15px] h-[15px]" />
              </button>
            )}
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}

// ── Drawer de um KPI: etapas naquela situação de integração ─────────────────
function SeamSheet({ seam, stages, icones, onClose, onOpenStage }: {
  seam: SeamStatus | null;
  stages: FlowStage[];
  icones: Record<string, React.ElementType>;
  onClose: () => void;
  onOpenStage: (id: string) => void;
}) {
  const kpi = SEAM_KPI.find(k => k.seam === seam);
  const cfg = seam ? SEAM_CFG[seam] : null;
  const lista = stages.filter(s => s.inboundSeam === seam);
  return (
    <Sheet open={!!seam} onClose={onClose} size="lg">
      {kpi && cfg && (
        <>
          <SheetHeader onClose={onClose}>
            <SheetTitle>Integrações {kpi.label.toLowerCase()}</SheetTitle>
            <SheetDescription>{kpi.sub} · {lista.length} {lista.length === 1 ? 'etapa' : 'etapas'}</SheetDescription>
          </SheetHeader>

          <SheetPanel className="p-6">
            {lista.length === 0 ? (
              <div className="text-center py-12">
                <cfg.icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma etapa</h3>
                <p className="text-sm text-gray-500">{kpi.vazio}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-[10px] divide-y divide-gray-100">
                {lista.map(s => {
                  const Icon = icones[s.id] ?? Workflow;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onOpenStage(s.id)}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition"
                    >
                      <Icon className="w-4 h-4 mt-0.5 text-indigo-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{s.label}</p>
                        {s.inboundNote && <p className="text-xs text-gray-500 break-words">{s.inboundNote}</p>}
                      </div>
                      <span className="text-sm text-gray-600 shrink-0">{s.count}</span>
                      <ChevronRight className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </SheetPanel>

          <SheetFooter>
            <button onClick={onClose} className={BTN_SECUNDARIO}>Fechar</button>
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}

/** O editor de modelo aberto a partir do canvas: org resolvida, e ou um modelo a editar, ou os valores de partida. */
interface EditorAberto {
  orgId: string;
  editando?: ModeloEmEdicao;
  inicial?: { trigger_type: 'EVENTO'; trigger_event_key: string; name: string };
}

// ── Página principal ─────────────────────────────────────────────────────────
export const ProcessFlowBoard: React.FC<Props> = ({ config, activeOrganizationId, onChangeView }) => {
  const { service, celulas, icones } = config;
  const [stages, setStages] = useState<FlowStage[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [groups, setGroups] = useState<FlowGroup[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [openSeam, setOpenSeam] = useState<SeamStatus | null>(null);
  const [selecao, setSelecao] = useState<P2PSelecao>(null);
  const [painelAberto, setPainelAberto] = usePersistedState<boolean>(config.chavePainel, true);
  const [modoEscolher, setModoEscolher] = useState(false);
  const [editor, setEditor] = useState<EditorAberto | null>(null);
  const desktop = useDesktop();
  // Só para NOMEAR a org de um modelo quando a transição tem modelos de mais de
  // uma ("Todas as organizações") — não decide de qual org ler (REGRA #5).
  const organizacoes = useStore(s => s.organizations);
  const nomeDaOrg = useCallback((id: string) => organizacoes?.find(o => o.id === id)?.name, [organizacoes]);
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const { showToast, localToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await service.getSnapshot(
        activeOrganizationId,
        selectedProjectId || undefined,
      );
      setStages(snap.stages);
      // Mocks antigos do snapshot não trazem arestas/grupos — a Torre segue sem desenhar linhas.
      setEdges(snap.edges ?? []);
      setGroups(snap.groups ?? []);
      setGeneratedAt(snap.generatedAt);
    } finally {
      setLoading(false);
    }
  }, [service, activeOrganizationId, selectedProjectId]);

  // Carrega lista de projetos uma vez (todas as organizações do usuário, se nenhuma estiver selecionada)
  useEffect(() => {
    service.listProjects(activeOrganizationId).then(setProjects);
  }, [service, activeOrganizationId]);

  useEffect(() => { load(); }, [load]);

  const contagemPorSeam: Record<SeamStatus, number> = {
    auto:        stages.filter(s => s.inboundSeam === 'auto').length,
    orquestrada: stages.filter(s => s.inboundSeam === 'orquestrada').length,
    manual:      stages.filter(s => s.inboundSeam === 'manual').length,
    gap:         stages.filter(s => s.inboundSeam === 'gap').length,
  };
  const openStage = stages.find(s => s.id === openStageId) ?? null;

  // ── editor de gatilho ──
  /**
   * Modelo é por organização: com o topo numa org não pergunta nada; em
   * "Todas", `resolveWriteOrg('single')` pergunta qual (REGRA #5). Mesmo
   * caminho de `ProcessosModule.handleNewTemplate`.
   */
  const novoGatilhoNaAresta = useCallback(async (edge: FlowEdge) => {
    setModoEscolher(false);
    const key = edge.eventKeys?.[0];
    if (!key) return;
    const target = await resolveWriteOrg('single');
    if (!target || target.kind !== 'org') return;
    setSelecao({ tipo: 'aresta', id: edge.id });
    setEditor({
      orgId: target.orgId,
      inicial: { trigger_type: 'EVENTO', trigger_event_key: key, name: `Processo: ${PROCESS_EVENT_LABEL[key]}` },
    });
  }, [resolveWriteOrg]);

  /** A org do modelo é a dele — não se pergunta (o modelo já existe lá). */
  const editarTemplate = useCallback(async (tpl: FlowTemplateAtivo, edge: FlowEdge) => {
    setSelecao({ tipo: 'aresta', id: edge.id });
    try {
      const [templates, steps] = await Promise.all([
        processService.listTemplates(tpl.organizationId),
        processService.getTemplateSteps(tpl.id),
      ]);
      const template = templates.find(t => t.id === tpl.id);
      if (!template) { showToast('Modelo não encontrado — atualize o quadro.', 'error'); return; }
      setEditor({ orgId: tpl.organizationId, editando: { template, steps } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível abrir o modelo.', 'error');
    }
  }, [showToast]);

  const aoSalvarModelo = useCallback(() => {
    load();
    showToast(editor?.editando ? 'Modelo salvo.' : 'Modelo salvo — a transição agora é orquestrada.');
  }, [editor?.editando, load, showToast]);

  const focarNo = (id: string) => setSelecao({ tipo: 'no', id });
  const abrirNo = (id: string) => setOpenStageId(id);
  const selecionarAresta = (edge: FlowEdge) => setSelecao({ tipo: 'aresta', id: edge.id });

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho (§20) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">{config.titulo}</h1>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">{config.subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {projects.length > 0 && (
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedProjectId}
                onChange={e => { setSelectedProjectId(e.target.value); setOpenStageId(null); }}
                className="h-9 pl-8 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer max-w-[220px]"
                title="Filtrar por obra"
              >
                <option value="">Todas as obras</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => { load(); setOpenStageId(null); }}
            disabled={loading}
            title="Atualizar o quadro"
            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {desktop && (
            <button
              type="button"
              onClick={() => setPainelAberto(v => !v)}
              aria-pressed={painelAberto}
              className={`${BTN_SECUNDARIO} ${painelAberto ? 'border-blue-300 bg-blue-50 text-blue-700' : ''}`}
            >
              <BarChart3 className="w-[15px] h-[15px]" /> Métricas
            </button>
          )}
          <button
            type="button"
            onClick={() => { setModoEscolher(true); }}
            disabled={modoEscolher || !desktop}
            title={!desktop ? 'Disponível no desktop (precisa do desenho do fluxo)' : modoEscolher ? 'Escolha a transição no desenho (Esc cancela)' : 'Criar um modelo de processo que nasce de um evento do fluxo'}
            className={BTN_PRIMARIO}
          >
            <Plus className="w-[15px] h-[15px]" /> Novo gatilho
          </button>
        </div>
      </div>

      {/* KPIs de saúde das integrações (§4) — clicar abre as etapas daquela situação */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {SEAM_KPI.map(k => {
          const Icon = SEAM_CFG[k.seam].icon;
          return (
            <KpiCard
              key={k.seam}
              label={k.label}
              value={contagemPorSeam[k.seam]}
              sub={k.sub}
              icon={<Icon className="w-4 h-4" />}
              color={k.color}
              onClick={() => setOpenSeam(k.seam)}
              title={`Ver etapas: ${k.label.toLowerCase()}`}
            />
          );
        })}
      </div>

      {/* Fluxo */}
      {desktop ? (
        <div className={`grid gap-3 items-start ${painelAberto ? 'lg:grid-cols-[224px_minmax(0,1fr)_320px]' : 'lg:grid-cols-[224px_minmax(0,1fr)]'}`}>
          <P2PLibrary
            stages={stages}
            edges={edges}
            selecao={selecao}
            modoEscolher={modoEscolher}
            onFocusNode={focarNo}
            onSelectEdge={selecionarAresta}
            onNovoGatilho={() => setModoEscolher(true)}
            onEditarTemplate={editarTemplate}
            icones={icones}
          />
          <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <P2PCanvas
              stages={stages}
              edges={edges}
              groups={groups}
              selecao={selecao}
              modoEscolher={modoEscolher}
              onCancelarModo={() => setModoEscolher(false)}
              onSelectNode={focarNo}
              onOpenNode={abrirNo}
              onNavigate={onChangeView}
              onSelectEdge={selecionarAresta}
              onEscolherAresta={novoGatilhoNaAresta}
              onNovoGatilho={novoGatilhoNaAresta}
              onEditarTemplate={editarTemplate}
              celulas={celulas}
              icones={icones}
            />
          </div>
          {painelAberto && (
            <P2PMetricsPanel
              stages={stages}
              edges={edges}
              selecao={selecao}
              organizationId={activeOrganizationId}
              projectId={selectedProjectId || undefined}
              loading={loading}
              onClose={() => setPainelAberto(false)}
              onSelectNode={focarNo}
              onOpenNode={abrirNo}
              onNovoGatilho={novoGatilhoNaAresta}
              onEditarTemplate={editarTemplate}
              nomeDaOrg={nomeDaOrg}
              carregarProcessos={service.getStageProcesses}
              storageKey={config.chaveTabela}
            />
          )}
        </div>
      ) : (
        <P2PListaMobile stages={stages} edges={edges} onOpenNode={abrirNo} onNavigate={onChangeView} icones={icones} />
      )}

      {generatedAt && (
        <p className="text-xs text-gray-400">
          Atualizado em {new Date(generatedAt).toLocaleString('pt-BR')}
          {selectedProjectId && projects.find(p => p.id === selectedProjectId) && (
            <> · Obra: <strong>{projects.find(p => p.id === selectedProjectId)!.name}</strong></>
          )}
        </p>
      )}

      {/* Drawers, modal do editor e o modal de organização ficam AQUI, irmãos da
          grade: `Sheet`/`Modal` são `fixed` sem portal e, dentro da camada com
          `transform` do canvas, nasceriam presos e escalados. */}
      <SeamSheet
        seam={openSeam}
        stages={stages}
        icones={icones}
        onClose={() => setOpenSeam(null)}
        onOpenStage={id => { setOpenSeam(null); setOpenStageId(id); }}
      />
      <StageSheet
        service={service}
        stage={openStage}
        organizationId={activeOrganizationId}
        projectId={selectedProjectId || undefined}
        onClose={() => setOpenStageId(null)}
        onNavigate={onChangeView}
      />
      <TemplateEditorModal
        open={!!editor}
        onClose={() => setEditor(null)}
        organizationId={editor?.orgId ?? ''}
        editando={editor?.editando ?? null}
        inicial={editor?.inicial}
        onSaved={aoSalvarModelo}
      />
      {orgTargetModal}
      {localToast && (
        <div className={`fixed bottom-6 right-6 z-[300] px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium text-white ${localToast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {localToast.message}
        </div>
      )}
    </div>
  );
};

export default ProcessFlowBoard;
