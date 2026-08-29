import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Phone, MapPin, Wifi, WifiOff, Search, X, Clock, History, Settings, Users, Send, DollarSign, Percent } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  servicesCommercialService,
  ServiceOpportunity,
  OpportunityStage,
  PipelineStageConfig,
} from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';
import ServicesOpportunityModal from './ServicesOpportunityModal';
import ServicesPipelineConfigModal from './ServicesPipelineConfigModal';
import { KpiCard } from '../ui/KpiCard';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';

interface KPIs {
  activeLeads: number;
  proposalsSent: number;
  inNegotiation: number;
  conversionRate: number;
}

interface Props {
  organizationId: string | null;
  // `opportunityLabel`: nome do contato, só para rotular a trilha do §23.
  onNavigate: (view: ServicesView, opportunityId?: string, opportunityOrgId?: string, opportunityLabel?: string) => void;
}

const STAGES: { id: OpportunityStage; label: string; hex: string }[] = [
  { id: 'lead',     label: 'Lead',            hex: '#6b7280' },
  { id: 'visit',    label: 'Visita',           hex: '#3b82f6' },
  { id: 'budget',   label: 'Orçamento',        hex: '#eab308' },
  { id: 'proposal', label: 'Proposta enviada', hex: '#a855f7' },
  { id: 'won',      label: 'Ganho',            hex: '#22c55e' },
];

const LOST_HEX = '#f87171';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

const PRIORITY_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  high:   { label: 'ALTA',   bg: '#ffedd5', color: '#ea580c' },
  medium: { label: 'NORMAL', bg: '#dbeafe', color: '#2563eb' },
  low:    { label: 'BAIXA',  bg: '#f0fdf4', color: '#16a34a' },
};

// ── Aging / SLA ──────────────────────────────────────────────────────────────
// Formata a diferença entre `iso` e agora em "3h", "5d", "2sem"…
const formatAge = (iso: string | null): string => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  return `${Math.floor(d / 7)}sem`;
};

// Cor por faixa de tempo parado (verde < 2d, amarelo 2–5d, vermelho > 5d).
const ageColor = (iso: string | null): string => {
  if (!iso) return '#94a3b8';
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 2) return '#16a34a';
  if (days < 5) return '#eab308';
  return '#ef4444';
};

const AgingBadges: React.FC<{ createdAt: string; updatedAt: string }> = ({ createdAt, updatedAt }) => (
  <div className="flex items-center gap-2 text-xs font-semibold">
    <span className="flex items-center gap-0.5 text-slate-400" title="Idade do lead (desde a criação)">
      <Clock size={11} className="flex-shrink-0" /> {formatAge(createdAt)}
    </span>
    <span
      className="flex items-center gap-0.5"
      style={{ color: ageColor(updatedAt) }}
      title="Parado há (desde a última movimentação)"
    >
      <History size={11} className="flex-shrink-0" /> {formatAge(updatedAt)}
    </span>
  </div>
);

// ── Card ─────────────────────────────────────────────────────────────────────
const OpportunityCard: React.FC<{
  opp: ServiceOpportunity;
  stageHex: string;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ opp, stageHex, isDragging, onClick, onDragStart }) => {
  const prio = PRIORITY_BADGE[opp.priority] ?? PRIORITY_BADGE.medium;
  const formattedValue = opp.estimated_value != null
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(opp.estimated_value)
    : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing transition-all select-none
        ${isDragging ? 'opacity-20 scale-95' : 'hover:shadow-md hover:border-slate-300'}`}
    >
      {/* Faixa colorida do stage */}
      <div className="h-1 rounded-t-2xl" style={{ backgroundColor: stageHex }} />

      <div className="p-3.5 space-y-2.5">
        {/* Badge de prioridade */}
        <span
          className="inline-block text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
          style={{ backgroundColor: prio.bg, color: prio.color }}
        >
          {prio.label}
        </span>

        {/* Título */}
        <p className="text-sm font-bold text-slate-900 leading-snug">{opp.contact_name}</p>

        {/* Sub-status (etapa dentro do estágio) */}
        {opp.sub_status && (
          <span
            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md border"
            style={{ borderColor: `${stageHex}55`, color: stageHex, backgroundColor: `${stageHex}11` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stageHex }} />
            {opp.sub_status}
          </span>
        )}

        {/* Tipo de trabalho */}
        {opp.work_type && (
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{opp.work_type}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
            {opp.city && (
              <span className="flex items-center gap-0.5 truncate">
                <MapPin size={11} className="flex-shrink-0" /> {opp.city}
              </span>
            )}
            {opp.contact_phone && (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <Phone size={11} /> {opp.contact_phone}
              </span>
            )}
          </div>
          {formattedValue && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0">
              {formattedValue}
            </span>
          )}
        </div>

        {/* Aging / SLA — oculto em estágios terminais (ganho/perdido) */}
        {opp.stage !== 'won' && opp.stage !== 'lost' && (
          <div className="pt-1.5 border-t border-slate-100">
            <AgingBadges createdAt={opp.created_at} updatedAt={opp.updated_at} />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Coluna ───────────────────────────────────────────────────────────────────
const PipelineColumn: React.FC<{
  id: OpportunityStage;
  label: string;
  hex: string;
  cards: ServiceOpportunity[];
  loading: boolean;
  isOver: boolean;
  readonly?: boolean;
  draggingId: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onNavigate: (view: ServicesView, id: string, orgId?: string, label?: string) => void;
  setDraggingId: (id: string) => void;
  onAddNew?: () => void;
}> = ({ id, label, hex, cards, loading, isOver, readonly, draggingId, onDragOver, onDragLeave, onDrop, onNavigate, setDraggingId, onAddNew }) => (
  <div className="flex flex-col w-[280px] flex-shrink-0">
    {/* Header */}
    <div className="flex items-center gap-2 px-1 pb-3">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white ring-offset-0"
        style={{ backgroundColor: hex }}
      />
      <span className="font-black text-xs uppercase tracking-widest text-slate-700 flex-1">{label}</span>
      <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{cards.length}</span>
      {onAddNew && (
        <button
          onClick={onAddNew}
          className="p-1 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    {/* Drop zone */}
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex-1 min-h-[120px] rounded-2xl p-2 space-y-2.5 transition-colors
        ${isOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : 'bg-slate-50/70'}`}
    >
      {loading ? (
        <>
          <div className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
          <div className="h-16 bg-white rounded-2xl animate-pulse border border-slate-100" />
        </>
      ) : cards.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-xs text-slate-300 font-medium">
          Vazio
        </div>
      ) : (
        cards.map(opp => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            stageHex={hex}
            isDragging={draggingId === opp.id}
            onClick={() => onNavigate('opportunity', opp.id, opp.organization_id, opp.contact_name)}
            onDragStart={e => {
              if (readonly) { e.preventDefault(); return; }
              e.dataTransfer.effectAllowed = 'move';
              setDraggingId(opp.id);
            }}
          />
        ))
      )}
    </div>

    {/* Footer "+ Adicionar" */}
    {onAddNew && (
      <button
        onClick={onAddNew}
        className="mt-2 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-button font-bold text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors w-full"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar lead
      </button>
    )}
  </div>
);

// ── Pipeline principal ────────────────────────────────────────────────────────
const ServicesPipeline: React.FC<Props> = ({ organizationId, onNavigate }) => {
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [createLeadOrgId, setCreateLeadOrgId] = useState<string | undefined>(undefined);

  const [opportunities, setOpportunities] = useState<ServiceOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<OpportunityStage | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [search, setSearch] = usePersistedState('services_pipeline_search', '');
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [stageConfig, setStageConfig] = useState<PipelineStageConfig[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    servicesCommercialService.listOpportunities(organizationId)
      .then(setOpportunities)
      .finally(() => setLoading(false));
  }, [organizationId]);

  const loadKpis = useCallback(() => {
    servicesCommercialService.getKPIs(organizationId).then(setKpis).catch(() => setKpis(null));
  }, [organizationId]);

  const loadConfig = useCallback(() => {
    if (!organizationId) { setStageConfig([]); return; }
    servicesCommercialService.listStageConfig(organizationId)
      .then(setStageConfig)
      .catch(() => setStageConfig([]));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadKpis(); }, [loadKpis]);

  // Mescla rótulo/cor configurados por org sobre os estágios canônicos.
  const stageView = useMemo(() => {
    const byStage = new Map(stageConfig.map(c => [c.stage, c]));
    const apply = (s: { id: OpportunityStage; label: string; hex: string }) => {
      const cfg = byStage.get(s.id);
      return { ...s, label: cfg?.label ?? s.label, hex: cfg?.color ?? s.hex };
    };
    return { stages: STAGES.map(apply), lost: apply({ id: 'lost', label: 'Perdido', hex: LOST_HEX }) };
  }, [stageConfig]);

  useEffect(() => {
    // Visão "todas as organizações": sem assinatura realtime filtrada por org
    // (evita escutar uma org específica). O usuário recarrega para atualizar.
    if (!organizationId) { setRealtimeStatus('connecting'); return; }

    const channel = supabase
      .channel(`services-pipeline-${organizationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'services_opportunities', filter: `organization_id=eq.${organizationId}` },
        payload => setOpportunities(prev => prev.some(o => o.id === payload.new.id) ? prev : [payload.new as ServiceOpportunity, ...prev])
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'services_opportunities', filter: `organization_id=eq.${organizationId}` },
        payload => setOpportunities(prev => prev.map(o => o.id === payload.new.id ? payload.new as ServiceOpportunity : o))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'services_opportunities' },
        payload => setOpportunities(prev => prev.filter(o => o.id !== payload.old.id))
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const handleDrop = async (stage: OpportunityStage) => {
    if (!draggingId || stage === 'won') return;
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage, updated_at: new Date().toISOString() } : o));
    try {
      await servicesCommercialService.moveStage(id, stage);
      loadKpis();
    } catch {
      load();
    }
  };

  const filtered = useMemo(() =>
    opportunities.filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        o.contact_name.toLowerCase().includes(q) ||
        (o.city ?? '').toLowerCase().includes(q) ||
        (o.work_type ?? '').toLowerCase().includes(q);
      const matchPriority = filterPriority === 'all' || o.priority === filterPriority;
      return matchSearch && matchPriority;
    }),
    [opportunities, search, filterPriority]
  );

  const byStage = (stage: OpportunityStage) => filtered.filter(o => o.stage === stage);
  const hasFilter = !!search || filterPriority !== 'all';

  return (
    <div className="p-4 space-y-6 h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pipeline de Serviços</h1>
            {realtimeStatus === 'connected' && (
              <span title="Atualizações em tempo real ativas" className="text-green-500"><Wifi size={16} /></span>
            )}
            {realtimeStatus === 'error' && (
              <span title="Tempo real indisponível" className="text-red-400"><WifiOff size={16} /></span>
            )}
          </div>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">Funil comercial de oportunidades de serviços, da captação ao contrato assinado.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowConfig(true)}
            disabled={!organizationId}
            title={!organizationId ? 'Selecione uma organização específica para configurar' : 'Configurar funil'}
            className="h-9 w-9 flex items-center justify-center bg-white border border-gray-200 text-gray-500 rounded-[6px] hover:bg-gray-50 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={async () => {
              const target = await resolveWriteOrg('single');
              if (!target || target.kind !== 'org') return;
              const orgId = target.orgId;
              setCreateLeadOrgId(orgId);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
          >
            <Plus className="w-[15px] h-[15px]" /> Novo Lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis ? (
          <>
            <KpiCard shadow={false} size="sm" label="Leads ativos" value={kpis.activeLeads} icon={<Users className="w-4 h-4" />} color="blue" />
            <KpiCard shadow={false} size="sm" label="Propostas enviadas" value={kpis.proposalsSent} icon={<Send className="w-4 h-4" />} color="purple" />
            <KpiCard shadow={false} size="sm" label="Em negociação" value={fmtCurrency(kpis.inNegotiation)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
            <KpiCard shadow={false} size="sm" label="Taxa de conversão" value={`${kpis.conversionRate}%`} icon={<Percent className="w-4 h-4" />} color="orange" />
          </>
        ) : (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-[10px] animate-pulse" />
          ))
        )}
      </div>

      {/* Toolbar acoplada + Board (padrão §5.2, extraído do ÒPURA Docs) */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-2 border-b border-gray-100 bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente, cidade, tipo..."
                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              {(['all', 'high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={`px-2.5 h-7 rounded-[6px] text-xs font-semibold transition-all ${
                    filterPriority === p
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {p === 'all' ? 'Todos' : p === 'high' ? 'Alta' : p === 'medium' ? 'Média' : 'Baixa'}
                </button>
              ))}
            </div>

            {hasFilter && (
              <span className="text-xs text-gray-400 font-medium shrink-0">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 min-h-0 overflow-x-auto p-4">
          <div className="flex gap-4 h-full">
            {stageView.stages.map(({ id, label, hex }) => (
              <PipelineColumn
                key={id}
                id={id}
                label={label}
                hex={hex}
                cards={byStage(id)}
                loading={loading}
                isOver={dragOverStage === id}
                readonly={id === 'won'}
                draggingId={draggingId}
                onDragOver={e => { e.preventDefault(); if (id !== 'won') setDragOverStage(id); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={() => handleDrop(id)}
                onNavigate={onNavigate}
                setDraggingId={setDraggingId}
                onAddNew={id === 'lead' && organizationId ? () => setIsModalOpen(true) : undefined}
              />
            ))}

            {/* Coluna Perdido — somente leitura */}
            <PipelineColumn
              id="lost"
              label={stageView.lost.label}
              hex={stageView.lost.hex}
              cards={opportunities.filter(o => o.stage === 'lost')}
              loading={loading}
              isOver={false}
              readonly
              draggingId={draggingId}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => {}}
              onDrop={() => {}}
              onNavigate={onNavigate}
              setDraggingId={setDraggingId}
            />
          </div>
        </div>
      </div>

      {isModalOpen && createLeadOrgId && (
        <ServicesOpportunityModal
          organizationId={createLeadOrgId}
          onClose={() => { setIsModalOpen(false); setCreateLeadOrgId(undefined); }}
          onSaved={() => { setIsModalOpen(false); setCreateLeadOrgId(undefined); load(); loadKpis(); }}
        />
      )}

      {orgTargetModal}

      {showConfig && organizationId && (
        <ServicesPipelineConfigModal
          organizationId={organizationId}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); loadConfig(); }}
        />
      )}
    </div>
  );
};

export default ServicesPipeline;
