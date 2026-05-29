import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Edit2, MapPin, Phone, Mail, Calendar, ClipboardList, Calculator, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import {
  servicesCommercialService,
  ServiceOpportunity,
  ServiceOpportunityEvent,
  OpportunityStage,
} from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';
import ServicesOpportunityModal from './ServicesOpportunityModal';

interface Props {
  opportunityId: string;
  organizationId: string;
  onNavigate: (view: ServicesView, opportunityId?: string) => void;
  onBack: () => void;
}

const STAGE_LABELS: Record<OpportunityStage, string> = {
  lead: 'Lead', visit: 'Visita', budget: 'Orçamento',
  proposal: 'Proposta enviada', won: 'Ganho', lost: 'Perdido',
};

const STAGE_COLORS: Record<OpportunityStage, string> = {
  lead: 'bg-gray-100 text-gray-700',
  visit: 'bg-blue-100 text-blue-700',
  budget: 'bg-yellow-100 text-yellow-700',
  proposal: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

const NEXT_STAGES: Partial<Record<OpportunityStage, OpportunityStage>> = {
  lead: 'visit', visit: 'budget', budget: 'proposal', proposal: 'won',
};

const ServicesOpportunityDetail: React.FC<Props> = ({ opportunityId, organizationId, onNavigate, onBack }) => {
  const [opp, setOpp] = useState<ServiceOpportunity | null>(null);
  const [events, setEvents] = useState<ServiceOpportunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    const [oppData, eventsData] = await Promise.all([
      servicesCommercialService.getOpportunity(opportunityId),
      servicesCommercialService.listEvents(opportunityId),
    ]);
    setOpp(oppData);
    setEvents(eventsData);
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => { load(); }, [load]);

  const moveToNext = async () => {
    if (!opp) return;
    const next = NEXT_STAGES[opp.stage];
    if (!next) return;
    setMoving(true);
    const updated = await servicesCommercialService.moveStage(opp.id, next);
    setOpp(updated);
    setMoving(false);
    load();
  };

  const markLost = async () => {
    if (!opp || !lostReason.trim()) return;
    setMoving(true);
    const updated = await servicesCommercialService.moveStage(opp.id, 'lost', lostReason.trim());
    setOpp(updated);
    setShowLostModal(false);
    setMoving(false);
    load();
  };

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>;
  if (!opp) return <div className="p-8 text-center text-gray-400 text-sm">Oportunidade não encontrada.</div>;

  const fmt = (n: number | null) =>
    n != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n) : '—';

  const nextStage = NEXT_STAGES[opp.stage];
  const isTerminal = opp.stage === 'won' || opp.stage === 'lost';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{opp.contact_name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[opp.stage]}`}>
              {STAGE_LABELS[opp.stage]}
            </span>
            {opp.work_type && <span className="text-xs text-gray-400">{opp.work_type}</span>}
          </div>
        </div>
        <button onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-blue-600">
          <Edit2 size={18} />
        </button>
      </div>

      {/* Actions */}
      {!isTerminal && (
        <div className="flex gap-3">
          {nextStage && (
            <button
              onClick={moveToNext}
              disabled={moving}
              className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {moving ? 'Movendo...' : `Avançar para "${STAGE_LABELS[nextStage]}"`}
            </button>
          )}
          <button
            onClick={() => setShowLostModal(true)}
            className="px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Marcar como Perdido
          </button>
        </div>
      )}

      {/* Quick nav para sub-telas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { view: 'visit' as ServicesView, icon: <ClipboardList size={18} />, label: 'Visita técnica', disabled: opp.stage === 'lead' },
          { view: 'budget' as ServicesView, icon: <Calculator size={18} />, label: 'Orçamento', disabled: ['lead', 'visit'].includes(opp.stage) },
          { view: 'proposal' as ServicesView, icon: <FileText size={18} />, label: 'Proposta', disabled: ['lead', 'visit', 'budget'].includes(opp.stage) },
        ].map(({ view, icon, label, disabled }) => (
          <button
            key={view}
            disabled={disabled}
            onClick={() => onNavigate(view, opportunityId)}
            className={`flex flex-col items-center gap-1.5 py-4 rounded-xl border text-sm font-medium transition-colors ${
              disabled
                ? 'border-gray-100 text-gray-300 dark:border-gray-800 dark:text-gray-600 cursor-not-allowed'
                : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
        {[
          { icon: <Phone size={14} />, label: 'Telefone', value: opp.contact_phone },
          { icon: <Mail size={14} />, label: 'E-mail', value: opp.contact_email },
          { icon: <MapPin size={14} />, label: 'Cidade', value: opp.city },
          { icon: <Calculator size={14} />, label: 'Área', value: opp.estimated_area ? `${opp.estimated_area} m²` : null },
          { icon: <Calendar size={14} />, label: 'Valor estimado', value: fmt(opp.estimated_value) },
        ].map(({ icon, label, value }) => value ? (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <span className="text-gray-400">{icon}</span>
            <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
            <span className="text-sm text-gray-900 dark:text-white">{value}</span>
          </div>
        ) : null)}
        {opp.scope_summary && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Escopo</p>
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{opp.scope_summary}</p>
          </div>
        )}
        {opp.lost_reason && (
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/10">
            <p className="text-xs text-red-500 mb-1">Motivo da perda</p>
            <p className="text-sm text-red-700 dark:text-red-400">{opp.lost_reason}</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Histórico</h3>
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="flex items-start gap-3 text-xs text-gray-500">
              <Clock size={13} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {ev.event_type === 'stage_changed' ? `Movido para "${ev.to_value}"` : ev.event_type}
                </span>
                <span className="ml-2 text-gray-400">
                  {new Date(ev.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="text-xs text-gray-400">Sem eventos registrados.</p>}
        </div>
      </div>

      {/* Modal de perda */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Marcar como Perdido</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo da perda *</label>
              <textarea
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                rows={3}
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                placeholder="Ex: preço, concorrente, desistência..."
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowLostModal(false)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button
                onClick={markLost}
                disabled={!lostReason.trim() || moving}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {isEditing && (
        <ServicesOpportunityModal
          organizationId={organizationId}
          initial={opp}
          onClose={() => setIsEditing(false)}
          onSaved={updated => { setOpp(updated); setIsEditing(false); }}
        />
      )}
    </div>
  );
};

export default ServicesOpportunityDetail;
