import React, { useState, useEffect, useCallback } from 'react';
import {
  Workflow, RefreshCw, ArrowRight, ArrowDown,
  CheckCircle2, AlertTriangle, XCircle,
  ClipboardList, FileSearch, ShoppingCart, Truck,
  Warehouse, FileText, DollarSign, Landmark,
  ChevronDown, ChevronUp, ChevronRight, Loader2,
  Building2,
} from 'lucide-react';
import { p2pFlowService, P2PStage, P2PRecord, SeamStatus } from '../services/p2pFlowService';

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

const SEAM_CFG: Record<SeamStatus, { label: string; color: string; lineColor: string; icon: React.ElementType }> = {
  auto:   { label: 'Automático',  color: 'text-emerald-600', lineColor: 'bg-emerald-300', icon: CheckCircle2 },
  manual: { label: 'Semi-manual', color: 'text-amber-600',   lineColor: 'bg-amber-300',   icon: AlertTriangle },
  gap:    { label: 'Lacuna',      color: 'text-red-600',     lineColor: 'bg-red-300',      icon: XCircle },
};

// ── Detalhe de um nó expandido ──────────────────────────────────────────────
function StageDetail({ stageId, organizationId, projectId }: {
  stageId: string;
  organizationId: string;
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
    <div className="py-4 flex justify-center">
      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
    </div>
  );

  if (records.length === 0) return (
    <p className="py-3 text-xs text-slate-400 text-center">Nenhum registro nesta etapa.</p>
  );

  return (
    <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
      {records.map(r => (
        <div key={r.id} className="flex items-start justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{r.label}</p>
            {r.sublabel && <p className="text-[11px] text-slate-500 truncate">{r.sublabel}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {r.status && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 uppercase tracking-wide whitespace-nowrap">
                {r.status}
              </span>
            )}
            {r.date && <span className="text-[10px] text-slate-400">{r.date}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Nó do fluxo ──────────────────────────────────────────────────────────────
function StageCard({
  stage, organizationId, projectId, expanded, onToggle, onNavigate,
}: {
  stage: P2PStage;
  organizationId: string;
  projectId?: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (v: string) => void;
}) {
  const Icon = STAGE_ICON[stage.id] ?? Workflow;
  const seam = SEAM_CFG[stage.inboundSeam];

  return (
    <div className={`w-full sm:w-48 bg-white border rounded-2xl shadow-sm transition-all
      ${stage.inboundSeam === 'gap' ? 'border-red-200' : stage.inboundSeam === 'manual' ? 'border-amber-200' : 'border-slate-200'}`}
    >
      {/* Cabeçalho clicável (expande/colapsa) */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="ml-auto">
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">{stage.owner}</p>
        <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">{stage.label}</p>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-black text-slate-900">{stage.count}</span>
          {stage.pending != null && stage.pending > 0 && (
            <span className="text-[11px] font-bold text-amber-600">{stage.pending} pend.</span>
          )}
        </div>

        {/* Badge da costura de entrada */}
        <div className={`mt-2 flex items-center gap-1 ${seam.color}`}>
          <seam.icon className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase tracking-wide">{seam.label}</span>
        </div>
      </button>

      {/* Expansão com registros + botão de navegar */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-2">
          <StageDetail stageId={stage.id} organizationId={organizationId} projectId={projectId} />
          {stage.view && (
            <button
              onClick={() => onNavigate(stage.view!)}
              className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
            >
              Abrir módulo <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganizationId) { setStages([]); return; }
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

  // Carrega lista de projetos uma vez
  useEffect(() => {
    if (!activeOrganizationId) return;
    p2pFlowService.listProjects(activeOrganizationId).then(setProjects);
  }, [activeOrganizationId]);

  useEffect(() => { load(); }, [load]);

  if (!activeOrganizationId) return (
    <div className="p-8 text-center">
      <Workflow className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <p className="text-sm font-bold text-slate-600">Selecione uma organização para ver o fluxo.</p>
    </div>
  );

  const gaps    = stages.filter(s => s.inboundSeam === 'gap').length;
  const manuais = stages.filter(s => s.inboundSeam === 'manual').length;
  const autos   = stages.filter(s => s.inboundSeam === 'auto').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
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
                onChange={e => { setSelectedProjectId(e.target.value); setExpandedId(null); }}
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
            onClick={() => { load(); setExpandedId(null); }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards de saúde */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Automáticas</p>
          <p className="text-2xl font-black text-emerald-700">{autos}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Semi-manuais</p>
          <p className="text-2xl font-black text-amber-700">{manuais}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-700">Lacunas</p>
          <p className="text-2xl font-black text-red-700">{gaps}</p>
        </div>
      </div>

      {/* Fluxo */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-6 overflow-x-auto">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start gap-1">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.id}>
              <StageCard
                stage={stage}
                organizationId={activeOrganizationId}
                projectId={selectedProjectId || undefined}
                expanded={expandedId === stage.id}
                onToggle={() => setExpandedId(prev => prev === stage.id ? null : stage.id)}
                onNavigate={onChangeView}
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
      {(gaps > 0 || manuais > 0) && (
        <div className="mt-6">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-2">
            Pontos de atenção nas integrações
          </h2>
          <div className="space-y-2">
            {stages.filter(s => s.inboundSeam !== 'auto').map(s => {
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
        <p className="mt-4 text-[11px] text-slate-400">
          Atualizado em {new Date(generatedAt).toLocaleString('pt-BR')}
          {selectedProjectId && projects.find(p => p.id === selectedProjectId) && (
            <> · Obra: <strong>{projects.find(p => p.id === selectedProjectId)!.name}</strong></>
          )}
        </p>
      )}
    </div>
  );
};

export default P2PFlowBoard;
