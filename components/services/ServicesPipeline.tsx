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

const STAGES: { id: OpportunityStage; label: string; color: string }[] = [
  { id: 'lead',     label: 'Lead',            color: 'bg-gray-500' },
  { id: 'visit',    label: 'Visita',           color: 'bg-blue-500' },
  { id: 'budget',   label: 'Orçamento',        color: 'bg-yellow-500' },
  { id: 'proposal', label: 'Proposta enviada', color: 'bg-purple-500' },
  { id: 'won',      label: 'Ganho',            color: 'bg-green-500' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const OpportunityCard: React.FC<{
  opp: ServiceOpportunity;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ opp, onClick, onDragStart }) => (
  <div
    draggable
    onDragStart={onDragStart}
    onClick={onClick}
    className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow select-none"
  >
    <div className="flex items-start justify-between gap-2 mb-1">
      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{opp.contact_name}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITY_COLORS[opp.priority]}`}>
        {opp.priority === 'high' ? 'Alta' : opp.priority === 'medium' ? 'Média' : 'Baixa'}
      </span>
    </div>
    {opp.work_type && (
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{opp.work_type}</p>
    )}
    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
      {opp.city && (
        <span className="flex items-center gap-0.5">
          <MapPin size={11} /> {opp.city}
        </span>
      )}
      {opp.contact_phone && (
        <span className="flex items-center gap-0.5">
          <Phone size={11} /> {opp.contact_phone}
        </span>
      )}
    </div>
    <div className="flex items-center justify-between mt-2">
      {opp.estimated_value != null ? (
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(opp.estimated_value)}
        </span>
      ) : <span />}
      {(opp as any).assigned_email && (
        <span className="text-[10px] text-gray-400 truncate max-w-[90px]" title={(opp as any).assigned_email}>
          @{((opp as any).assigned_email as string).split('@')[0]}
        </span>
      )}
    </div>
  </div>
);

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
    setLoading(true);
    servicesCommercialService.listOpportunities(organizationId)
      .then(setOpportunities)
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`services-pipeline-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'services_opportunities',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          setOpportunities(prev => {
            if (prev.some(o => o.id === payload.new.id)) return prev;
            return [payload.new as ServiceOpportunity, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'services_opportunities',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          setOpportunities(prev =>
            prev.map(o => o.id === payload.new.id ? payload.new as ServiceOpportunity : o)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'services_opportunities',
        },
        (payload) => {
          setOpportunities(prev => prev.filter(o => o.id !== payload.old.id));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const handleDrop = async (stage: OpportunityStage) => {
    if (!draggingId || stage === 'won') return;
    setDraggingId(null);
    setDragOverStage(null);
    setOpportunities(prev =>
      prev.map(o => o.id === draggingId ? { ...o, stage } : o)
    );
    try {
      await servicesCommercialService.moveStage(draggingId, stage);
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

  const byStage = (stage: OpportunityStage) =>
    filtered.filter(o => o.stage === stage);

  const hasFilter = !!search || filterPriority !== 'all';

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pipeline de Serviços</h2>
          {realtimeStatus === 'connected' && (
            <span title="Atualizações em tempo real ativas" className="text-green-500">
              <Wifi size={14} />
            </span>
          )}
          {realtimeStatus === 'error' && (
            <span title="Tempo real indisponível — dados podem estar desatualizados" className="text-red-400">
              <WifiOff size={14} />
            </span>
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
      <div className="flex items-center gap-2 mb-3 flex-wrap">
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

      <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
        {STAGES.map(({ id, label, color }) => {
          const cards = byStage(id);
          const isOver = dragOverStage === id;
          return (
            <div
              key={id}
              onDragOver={e => { e.preventDefault(); setDragOverStage(id); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={() => handleDrop(id)}
              className={`flex flex-col shrink-0 w-64 rounded-xl transition-colors ${
                isOver ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400' : 'bg-gray-50 dark:bg-gray-900/50'
              }`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{label}</span>
                <span className="ml-auto text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 rounded-full">{cards.length}</span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 px-2 pb-2 overflow-y-auto flex-1">
                {loading ? (
                  [...Array(2)].map((_, i) => (
                    <div key={i} className="h-20 bg-white dark:bg-gray-800 rounded-lg animate-pulse" />
                  ))
                ) : cards.length === 0 ? (
                  <div className="text-center text-xs text-gray-300 dark:text-gray-600 py-6">Vazio</div>
                ) : (
                  cards.map(opp => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      onClick={() => onNavigate('opportunity', opp.id)}
                      onDragStart={() => setDraggingId(opp.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {/* Coluna Perdido — só exibição */}
        <div className="flex flex-col shrink-0 w-64 rounded-xl bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Perdido</span>
            <span className="ml-auto text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 rounded-full">
              {opportunities.filter(o => o.stage === 'lost').length}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-2 pb-2 overflow-y-auto flex-1">
            {opportunities.filter(o => o.stage === 'lost').map(opp => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                onClick={() => onNavigate('opportunity', opp.id)}
                onDragStart={() => setDraggingId(opp.id)}
              />
            ))}
          </div>
        </div>
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
