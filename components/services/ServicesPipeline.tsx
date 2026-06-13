import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Phone, MapPin, Wifi, WifiOff, Search, X } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  servicesCommercialService,
  ServiceOpportunity,
  OpportunityStage,
} from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';
import ServicesOpportunityModal from './ServicesOpportunityModal';

interface Props {
  organizationId: string;
  onNavigate: (view: ServicesView, opportunityId?: string) => void;
}

const STAGES: { id: OpportunityStage; label: string; hex: string }[] = [
  { id: 'lead',     label: 'Lead',            hex: '#6b7280' },
  { id: 'visit',    label: 'Visita',           hex: '#3b82f6' },
  { id: 'budget',   label: 'Orçamento',        hex: '#eab308' },
  { id: 'proposal', label: 'Proposta enviada', hex: '#a855f7' },
  { id: 'won',      label: 'Ganho',            hex: '#22c55e' },
];

const LOST_HEX = '#f87171';

const PRIORITY_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  high:   { label: 'ALTA',   bg: '#ffedd5', color: '#ea580c' },
  medium: { label: 'NORMAL', bg: '#dbeafe', color: '#2563eb' },
  low:    { label: 'BAIXA',  bg: '#f0fdf4', color: '#16a34a' },
};

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
          className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
          style={{ backgroundColor: prio.bg, color: prio.color }}
        >
          {prio.label}
        </span>

        {/* Título */}
        <p className="text-sm font-bold text-slate-900 leading-snug">{opp.contact_name}</p>

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
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0">
              {formattedValue}
            </span>
          )}
        </div>
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
  onNavigate: (view: ServicesView, id: string) => void;
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
      <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{cards.length}</span>
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
            onClick={() => onNavigate('opportunity', opp.id)}
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
        className="mt-2 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors w-full"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar lead
      </button>
    )}
  </div>
);

// ── Pipeline principal ────────────────────────────────────────────────────────
const ServicesPipeline: React.FC<Props> = ({ organizationId, onNavigate }) => {
  const [opportunities, setOpportunities] = useState<ServiceOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<OpportunityStage | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const load = useCallback(() => {
    if (!organizationId) return;
    setLoading(true);
    servicesCommercialService.listOpportunities(organizationId)
      .then(setOpportunities)
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
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
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage } : o));
    try {
      await servicesCommercialService.moveStage(id, stage);
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
    <div className="p-4 h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pipeline de Serviços</h2>
          {realtimeStatus === 'connected' && (
            <span title="Atualizações em tempo real ativas" className="text-green-500"><Wifi size={14} /></span>
          )}
          {realtimeStatus === 'error' && (
            <span title="Tempo real indisponível" className="text-red-400"><WifiOff size={14} /></span>
          )}
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Novo Lead
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, cidade, tipo..."
            className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {(['all', 'high', 'medium', 'low'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterPriority === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {p === 'all' ? 'Todos' : p === 'high' ? 'Alta' : p === 'medium' ? 'Média' : 'Baixa'}
            </button>
          ))}
        </div>
        {hasFilter && (
          <span className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-6 flex-1 min-h-0">
        {STAGES.map(({ id, label, hex }) => (
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
            onAddNew={id === 'lead' ? () => setIsModalOpen(true) : undefined}
          />
        ))}

        {/* Coluna Perdido — somente leitura */}
        <PipelineColumn
          id="lost"
          label="Perdido"
          hex={LOST_HEX}
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

      {isModalOpen && (
        <ServicesOpportunityModal
          organizationId={organizationId}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => { setIsModalOpen(false); load(); }}
        />
      )}
    </div>
  );
};

export default ServicesPipeline;
