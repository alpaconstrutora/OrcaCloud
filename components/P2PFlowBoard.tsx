import React, { useState, useEffect, useCallback } from 'react';
import {
  Workflow, RefreshCw, ArrowRight, ArrowDown,
  CheckCircle2, AlertTriangle, XCircle,
  ClipboardList, FileSearch, ShoppingCart, Truck,
  Warehouse, FileText, DollarSign, Landmark,
  ChevronRight, Loader2, Inbox,
  Building2,
} from 'lucide-react';
import { p2pFlowService, P2PStage, P2PRecord, P2PProcessItem, SeamStatus } from '../services/p2pFlowService';
import { INSTANCE_STATUS_LABEL } from '../types/process';
import { KpiCard, KpiColor } from './ui/KpiCard';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

const STAGE_ICON: Record<string, React.ElementType> = {
  solicitacao: ClipboardList,
  cotacao:     FileSearch,
  pedido:      ShoppingCart,
  recebimento: Truck,
  estoque:     Warehouse,
  fiscal:      FileText,
  financeiro:  DollarSign,
  pagamento:   Landmark,
};

const SEAM_CFG: Record<SeamStatus, { label: string; color: string; lineColor: string; border: string; icon: React.ElementType }> = {
  auto:        { label: 'Automático',  color: 'text-emerald-600', lineColor: 'bg-emerald-300', border: 'border-slate-200',  icon: CheckCircle2 },
  orquestrada: { label: 'Orquestrada', color: 'text-indigo-600',  lineColor: 'bg-indigo-300',  border: 'border-indigo-200', icon: Workflow },
  manual:      { label: 'Semi-manual', color: 'text-amber-600',   lineColor: 'bg-amber-300',   border: 'border-amber-200',  icon: AlertTriangle },
  gap:         { label: 'Lacuna',      color: 'text-red-600',     lineColor: 'bg-red-300',     border: 'border-red-200',    icon: XCircle },
};

/** Costuras que pedem atenção (a legenda do rodapé). `orquestrada` é conduzida por processo, não é pendência. */
const SEAM_ATENCAO: SeamStatus[] = ['manual', 'gap'];

// KPIs de saúde das integrações — um por situação da costura de entrada.
const SEAM_KPI: { seam: SeamStatus; label: string; sub: string; color: KpiColor; icon: React.ElementType; vazio: string }[] = [
  { seam: 'auto',        label: 'Automáticas',  sub: 'Integração sem intervenção', color: 'emerald', icon: CheckCircle2,  vazio: 'Nenhuma etapa recebe dados automaticamente.' },
  { seam: 'orquestrada', label: 'Orquestradas', sub: 'Conduzidas por um processo', color: 'indigo',  icon: Workflow,      vazio: 'Nenhuma etapa é conduzida por processo. Ative um template com gatilho por evento em Processos › Templates.' },
  { seam: 'manual',      label: 'Semi-manuais', sub: 'Exigem ação do usuário',     color: 'amber',   icon: AlertTriangle, vazio: 'Nenhuma etapa depende de ação manual.' },
  { seam: 'gap',         label: 'Lacunas',      sub: 'Sem integração',             color: 'red',     icon: XCircle,       vazio: 'Nenhuma lacuna de integração.' },
];

const fmtDataHora = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : undefined;

const BTN_PRIMARIO   = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95';
const BTN_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95';

// ── Registros de uma etapa (corpo do drawer) ────────────────────────────────
function StageRecords({ stageId, organizationId, projectId }: {
  stageId: string;
  organizationId: string | null;
  projectId?: string;
}) {
  const [records, setRecords] = useState<P2PRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    p2pFlowService.getStageRecords(stageId, organizationId, projectId)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [stageId, organizationId, projectId]);

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
    <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
      {records.map(r => (
        <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 break-words">{r.label}</p>
            {r.sublabel && <p className="text-xs text-gray-500 break-words">{r.sublabel}</p>}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {r.status && (
              <span className="text-sm font-normal text-gray-600 whitespace-nowrap">
                {r.status}
              </span>
            )}
            {r.date && <span className="text-xs text-gray-400">{r.date}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Processos nascidos numa etapa (corpo do drawer, só para nó com evento) ──
function StageProcesses({ stage, organizationId, projectId, onNavigate }: {
  stage: P2PStage;
  organizationId: string | null;
  projectId?: string;
  onNavigate: (v: string) => void;
}) {
  const [itens, setItens] = useState<P2PProcessItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    p2pFlowService.getStageProcesses(stage.id, organizationId, projectId)
      .then(setItens)
      .finally(() => setLoading(false));
  }, [stage.id, organizationId, projectId]);

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
            : 'Nenhum template ativo escuta esta etapa. Ative um em Processos › Templates para a transição seguinte virar orquestrada.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
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
function StageSheet({ stage, organizationId, projectId, onClose, onNavigate }: {
  stage: P2PStage | null;
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
              <seam.icon className={`w-4 h-4 mt-0.5 shrink-0 ${seam.color}`} />
              <div>
                <p className={`text-sm font-medium ${seam.color}`}>Entrada: {seam.label}</p>
                {stage.inboundNote && <p className="text-xs text-gray-500">{stage.inboundNote}</p>}
              </div>
            </div>
            <StageRecords stageId={stage.id} organizationId={organizationId} projectId={projectId} />
            {stage.eventKeys && (
              <StageProcesses stage={stage} organizationId={organizationId} projectId={projectId} onNavigate={onNavigate} />
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
function SeamSheet({ seam, stages, onClose, onOpenStage }: {
  seam: SeamStatus | null;
  stages: P2PStage[];
  onClose: () => void;
  onOpenStage: (id: string) => void;
}) {
  const kpi = SEAM_KPI.find(k => k.seam === seam);
  const lista = stages.filter(s => s.inboundSeam === seam);
  return (
    <Sheet open={!!seam} onClose={onClose} size="lg">
      {kpi && (
        <>
          <SheetHeader onClose={onClose}>
            <SheetTitle>Integrações {kpi.label.toLowerCase()}</SheetTitle>
            <SheetDescription>{kpi.sub} · {lista.length} {lista.length === 1 ? 'etapa' : 'etapas'}</SheetDescription>
          </SheetHeader>

          <SheetPanel className="p-6">
            {lista.length === 0 ? (
              <div className="text-center py-12">
                <kpi.icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma etapa</h3>
                <p className="text-sm text-gray-500">{kpi.vazio}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {lista.map(s => {
                  const Icon = STAGE_ICON[s.id] ?? Workflow;
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

// ── Nó do fluxo ──────────────────────────────────────────────────────────────
function StageCard({ stage, selected, onOpen }: {
  stage: P2PStage;
  selected: boolean;
  onOpen: () => void;
}) {
  const Icon = STAGE_ICON[stage.id] ?? Workflow;
  const seam = SEAM_CFG[stage.inboundSeam];

  return (
    <button
      onClick={onOpen}
      className={`w-full sm:w-48 text-left p-4 bg-white border rounded-2xl shadow-sm hover:bg-slate-50 transition-all
        ${selected ? 'ring-2 ring-indigo-400' : ''}
        ${seam.border}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
      </div>

      <p className="text-xs font-black uppercase tracking-wider text-slate-400 leading-none">{stage.owner}</p>
      <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">{stage.label}</p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900">{stage.count}</span>
        {stage.pending != null && stage.pending > 0 && (
          <span className="text-xs font-bold text-amber-600">{stage.pending} pend.</span>
        )}
      </div>

      {/* Processos nascidos neste nó (só nó com evento do motor) */}
      {stage.processes && (
        <p className={`mt-1 text-xs ${stage.processes.atrasados > 0 ? 'text-red-600' : 'text-indigo-600'}`}>
          {stage.processes.ativos} {stage.processes.ativos === 1 ? 'processo' : 'processos'}
          {stage.processes.atrasados > 0 && ` · ${stage.processes.atrasados} atrasado${stage.processes.atrasados === 1 ? '' : 's'}`}
        </p>
      )}

      {/* Badge da costura de entrada */}
      <div className={`mt-2 flex items-center gap-1 ${seam.color}`}>
        <seam.icon className="w-3 h-3" />
        <span className="text-xs font-bold uppercase tracking-wide">{seam.label}</span>
      </div>
    </button>
  );
}

// ── Seta de conexão ──────────────────────────────────────────────────────────
function Seam({ status, horizontal }: { status: SeamStatus; horizontal: boolean }) {
  const s = SEAM_CFG[status];
  const Arrow = horizontal ? ArrowRight : ArrowDown;
  return (
    <div className={`flex ${horizontal ? 'flex-col w-12' : 'flex-row h-12'} items-center justify-center gap-0.5 shrink-0`}>
      <div className={`flex items-center justify-center gap-0.5 ${horizontal ? 'flex-col' : 'flex-row'}`}>
        <div className={`${horizontal ? 'h-0.5 w-6' : 'w-0.5 h-6'} ${s.lineColor} rounded-full`} />
        <Arrow className={`w-4 h-4 ${s.color}`} />
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export const P2PFlowBoard: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => {
  const [stages, setStages] = useState<P2PStage[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [openSeam, setOpenSeam] = useState<SeamStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await p2pFlowService.getSnapshot(
        activeOrganizationId,
        selectedProjectId || undefined,
      );
      setStages(snap.stages);
      setGeneratedAt(snap.generatedAt);
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, selectedProjectId]);

  // Carrega lista de projetos uma vez (todas as organizações do usuário, se nenhuma estiver selecionada)
  useEffect(() => {
    p2pFlowService.listProjects(activeOrganizationId).then(setProjects);
  }, [activeOrganizationId]);

  useEffect(() => { load(); }, [load]);

  const contagemPorSeam: Record<SeamStatus, number> = {
    auto:        stages.filter(s => s.inboundSeam === 'auto').length,
    orquestrada: stages.filter(s => s.inboundSeam === 'orquestrada').length,
    manual:      stages.filter(s => s.inboundSeam === 'manual').length,
    gap:         stages.filter(s => s.inboundSeam === 'gap').length,
  };
  const etapasComAtencao = stages.filter(s => SEAM_ATENCAO.includes(s.inboundSeam));
  const openStage = stages.find(s => s.id === openStageId) ?? null;

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-600 shrink-0" />
            Torre de Controle — Fluxo P2P
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Suprimentos → Estoque → Fiscal → Financeiro → Tesouraria. Clique num nó para ver os registros.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Filtro por obra */}
          {projects.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedProjectId}
                onChange={e => { setSelectedProjectId(e.target.value); setOpenStageId(null); }}
                className="bg-transparent text-slate-700 font-medium focus:outline-none max-w-[180px]"
              >
                <option value="">Todas as obras</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => { load(); setOpenStageId(null); }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs de saúde das integrações (§4) — clicar abre as etapas daquela situação */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {SEAM_KPI.map(k => (
          <KpiCard
            key={k.seam}
            label={k.label}
            value={contagemPorSeam[k.seam]}
            sub={k.sub}
            icon={<k.icon className="w-4 h-4" />}
            color={k.color}
            onClick={() => setOpenSeam(k.seam)}
            title={`Ver etapas: ${k.label.toLowerCase()}`}
          />
        ))}
      </div>

      {/* Fluxo */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-6 overflow-x-auto">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start gap-1">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.id}>
              <StageCard
                stage={stage}
                selected={openStageId === stage.id}
                onOpen={() => setOpenStageId(stage.id)}
              />
              {i < stages.length - 1 && (
                <>
                  <div className="hidden sm:flex items-center self-start mt-8">
                    <Seam status={stages[i + 1].inboundSeam} horizontal />
                  </div>
                  <div className="sm:hidden self-center">
                    <Seam status={stages[i + 1].inboundSeam} horizontal={false} />
                  </div>
                </>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legenda dos pontos de atenção */}
      {etapasComAtencao.length > 0 && (
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-2">
            Pontos de atenção nas integrações
          </h2>
          <div className="space-y-2">
            {etapasComAtencao.map(s => {
              const cfg = SEAM_CFG[s.inboundSeam];
              return (
                <div key={s.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3">
                  <cfg.icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      → {s.label}{' '}
                      <span className={`text-xs font-black ${cfg.color}`}>({cfg.label})</span>
                    </p>
                    <p className="text-xs text-slate-500">{s.inboundNote}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {generatedAt && (
        <p className="text-xs text-slate-400">
          Atualizado em {new Date(generatedAt).toLocaleString('pt-BR')}
          {selectedProjectId && projects.find(p => p.id === selectedProjectId) && (
            <> · Obra: <strong>{projects.find(p => p.id === selectedProjectId)!.name}</strong></>
          )}
        </p>
      )}

      <SeamSheet
        seam={openSeam}
        stages={stages}
        onClose={() => setOpenSeam(null)}
        onOpenStage={id => { setOpenSeam(null); setOpenStageId(id); }}
      />
      <StageSheet
        stage={openStage}
        organizationId={activeOrganizationId}
        projectId={selectedProjectId || undefined}
        onClose={() => setOpenStageId(null)}
        onNavigate={onChangeView}
      />
    </div>
  );
};

export default P2PFlowBoard;
