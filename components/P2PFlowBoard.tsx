import React, { useState, useEffect, useCallback } from 'react';
import {
  Workflow, RefreshCw, ArrowRight, ArrowDown, CheckCircle2,
  AlertTriangle, XCircle, ClipboardList, FileSearch, ShoppingCart,
  Truck, Warehouse, FileText, DollarSign, Landmark, ChevronRight,
} from 'lucide-react';
import { p2pFlowService, P2PStage, SeamStatus } from '../services/p2pFlowService';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

// Ícone por etapa (mantém a ordem do fluxo da spec)
const STAGE_ICON: Record<string, React.ElementType> = {
  solicitacao: ClipboardList,
  cotacao: FileSearch,
  pedido: ShoppingCart,
  recebimento: Truck,
  estoque: Warehouse,
  fiscal: FileText,
  financeiro: DollarSign,
  pagamento: Landmark,
};

// Aparência da costura de entrada de cada nó
const SEAM: Record<SeamStatus, { label: string; color: string; icon: React.ElementType }> = {
  auto:   { label: 'Automático',   color: 'text-emerald-600', icon: CheckCircle2 },
  manual: { label: 'Semi-manual',  color: 'text-amber-600',   icon: AlertTriangle },
  gap:    { label: 'Lacuna',       color: 'text-red-600',     icon: XCircle },
};

const SEAM_LINE: Record<SeamStatus, string> = {
  auto:   'bg-emerald-300',
  manual: 'bg-amber-300',
  gap:    'bg-red-300',
};

function StageCard({ stage, onOpen }: { stage: P2PStage; onOpen: (v?: string) => void }) {
  const Icon = STAGE_ICON[stage.id] ?? Workflow;
  return (
    <button
      onClick={() => onOpen(stage.view)}
      disabled={!stage.view}
      className={`group relative w-full sm:w-44 text-left bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition
        ${stage.view ? 'hover:border-indigo-300 hover:shadow-md cursor-pointer' : 'cursor-default opacity-90'}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
          <Icon className="w-4 h-4" />
        </div>
        {stage.view && (
          <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-indigo-400" />
        )}
      </div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{stage.owner}</p>
      <p className="text-sm font-bold text-slate-800 leading-tight">{stage.label}</p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-black text-slate-900">{stage.count}</span>
        {stage.pending != null && stage.pending > 0 && (
          <span className="text-[11px] font-bold text-amber-600">{stage.pending} pend.</span>
        )}
      </div>
    </button>
  );
}

function Seam({ status, note, horizontal }: { status: SeamStatus; note?: string; horizontal: boolean }) {
  const s = SEAM[status];
  const Arrow = horizontal ? ArrowRight : ArrowDown;
  return (
    <div className={`flex ${horizontal ? 'flex-col w-16' : 'flex-row h-16'} items-center justify-center gap-1 shrink-0`}>
      <div className={`flex items-center justify-center gap-1 ${horizontal ? 'flex-col' : 'flex-row'}`}>
        <div className={`${horizontal ? 'h-0.5 w-8' : 'w-0.5 h-8'} ${SEAM_LINE[status]} rounded-full`} />
        <Arrow className={`w-4 h-4 ${s.color}`} />
      </div>
      <span className={`text-[9px] font-black uppercase tracking-wide ${s.color} text-center leading-tight`} title={note}>
        {s.label}
      </span>
    </div>
  );
}

export const P2PFlowBoard: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => {
  const [stages, setStages] = useState<P2PStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  const load = useCallback(async () => {
    if (!activeOrganizationId) { setStages([]); return; }
    setLoading(true);
    try {
      const snap = await p2pFlowService.getSnapshot(activeOrganizationId);
      setStages(snap.stages);
      setGeneratedAt(snap.generatedAt);
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => { load(); }, [load]);

  if (!activeOrganizationId) {
    return (
      <div className="p-8 text-center">
        <Workflow className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-600">Selecione uma organização para ver o fluxo.</p>
      </div>
    );
  }

  const gaps = stages.filter(s => s.inboundSeam === 'gap').length;
  const manuais = stages.filter(s => s.inboundSeam === 'manual').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-600" />
            Torre de Controle — Fluxo P2P
          </h1>
          <p className="text-sm text-slate-500">
            Suprimentos → Estoque → Fiscal → Financeiro → Tesouraria. Cada nó mostra o nº de registros vivos.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Resumo de saúde das costuras */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Costuras automáticas</p>
          <p className="text-2xl font-black text-emerald-700">{stages.filter(s => s.inboundSeam === 'auto').length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Semi-manuais</p>
          <p className="text-2xl font-black text-amber-700">{manuais}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-700">Lacunas de integração</p>
          <p className="text-2xl font-black text-red-700">{gaps}</p>
        </div>
      </div>

      {/* Fluxo: horizontal no desktop, vertical no mobile */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-6 overflow-x-auto">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.id}>
              <StageCard stage={stage} onOpen={(v) => v && onChangeView(v)} />
              {i < stages.length - 1 && (
                <>
                  {/* seta horizontal no desktop */}
                  <div className="hidden sm:block">
                    <Seam status={stages[i + 1].inboundSeam} note={stages[i + 1].inboundNote} horizontal />
                  </div>
                  {/* seta vertical no mobile */}
                  <div className="sm:hidden self-center">
                    <Seam status={stages[i + 1].inboundSeam} note={stages[i + 1].inboundNote} horizontal={false} />
                  </div>
                </>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legenda das lacunas (detalhe das costuras não-automáticas) */}
      {(gaps > 0 || manuais > 0) && (
        <div className="mt-6">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-2">Pontos de atenção nas integrações</h2>
          <div className="space-y-2">
            {stages.filter(s => s.inboundSeam !== 'auto').map(s => {
              const cfg = SEAM[s.inboundSeam];
              const SeamIcon = cfg.icon;
              return (
                <div key={s.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3">
                  <SeamIcon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      → {s.label} <span className={`text-xs font-black ${cfg.color}`}>({cfg.label})</span>
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
        </p>
      )}
    </div>
  );
};

export default P2PFlowBoard;
