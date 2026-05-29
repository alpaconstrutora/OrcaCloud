import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Edit2, MapPin, Phone, Mail, Calendar, ClipboardList, Calculator, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useServicesToast } from './useServicestoast';
import ServicesToast from './ServicesToast';
import ServicesWonModal from './ServicesWonModal';
import ServicesEngineeringPicker from './ServicesEngineeringPicker';
import {
  servicesCommercialService,
  ServiceOpportunity,
  ServiceOpportunityEvent,
  OpportunityStage,
  EngineeringProjectSummary,
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
  const [wonResult, setWonResult] = useState<{
    contractNumber: string | null;
    projectName: string | null;
    projectId: string | null;
    contractId: string | null;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [engineeringSummary, setEngineeringSummary] = useState<EngineeringProjectSummary | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [moving, setMoving] = useState(false);
  const { toasts, show: showToast, dismiss } = useServicesToast();

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

  useEffect(() => {
    if (opp?.budget_source === 'engineering' && opp.engineering_project_id) {
      servicesCommercialService.getEngineeringSummary(opp.engineering_project_id)
        .then(setEngineeringSummary);
    } else {
      setEngineeringSummary(null);
    }
  }, [opp?.budget_source, opp?.engineering_project_id]);

  const handleLinkEngineering = async (project: EngineeringProjectSummary) => {
    if (!opp) return;
    setShowPicker(false);
    try {
      const updated = await servicesCommercialService.linkEngineeringProject(opp.id, project.id);
      setOpp(updated);
      showToast(`Orçamento "${project.name}" vinculado.`);
    } catch {
      showToast('Erro ao vincular orçamento.', 'error');
    }
  };

  const handleUnlinkEngineering = async () => {
    if (!opp) return;
    try {
      const updated = await servicesCommercialService.unlinkEngineering(opp.id);
      setOpp(updated);
      showToast('Vínculo removido. Voltando ao orçamento simples.');
    } catch {
      showToast('Erro ao desvincular.', 'error');
    }
  };

  const handleRequestEngineering = async () => {
    if (!opp || !requestEmail.trim()) return;
    try {
      const { projectId } = await servicesCommercialService.requestEngineering(
        opp,
        [requestEmail.trim()]
      );
      setShowRequestModal(false);
      setRequestEmail('');
      showToast(`Solicitação enviada. Projeto ${projectId.slice(0, 8)}… criado em rascunho.`);
      load();
    } catch {
      showToast('Erro ao solicitar orçamento.', 'error');
    }
  };

  const handleMigrate = async () => {
    if (!opp) return;
    setShowMigrateConfirm(false);
    try {
      await servicesCommercialService.migrateSimpleToEngineering(opp);
      showToast('Orçamento migrado para Engenharia!');
      load();
    } catch {
      showToast('Erro ao migrar orçamento.', 'error');
    }
  };

  const moveToNext = async () => {
    if (!opp) return;
    const next = NEXT_STAGES[opp.stage];
    if (!next) return;
    setMoving(true);
    try {
      const updated = await servicesCommercialService.moveStage(opp.id, next);
      setOpp(updated);
      if (next === 'won') {
        const result = await servicesCommercialService.getConversionResult(updated);
        setWonResult(result);
      } else {
        showToast(`Movido para "${STAGE_LABELS[next]}"`);
      }
      load();
    } catch {
      showToast('Erro ao mover oportunidade.', 'error');
    } finally {
      setMoving(false);
    }
  };

  const markLost = async () => {
    if (!opp || !lostReason.trim()) return;
    setMoving(true);
    try {
      const updated = await servicesCommercialService.moveStage(opp.id, 'lost', lostReason.trim());
      setOpp(updated);
      setShowLostModal(false);
      showToast('Oportunidade marcada como perdida.');
      load();
    } catch {
      showToast('Erro ao registrar perda.', 'error');
    } finally {
      setMoving(false);
    }
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

      {/* Origem do orçamento (Sprint 2: integração engenharia) */}
      {!isTerminal && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Origem do orçamento</span>
            <div className="flex gap-1 text-xs">
              <button
                onClick={async () => {
                  if (opp.budget_source === 'simple') return;
                  await handleUnlinkEngineering();
                }}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  opp.budget_source === 'simple'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 text-gray-600 hover:border-blue-300 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                Simples
              </button>
              <button
                onClick={() => {
                  if (opp.budget_source === 'engineering') return;
                  setShowPicker(true);
                }}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  opp.budget_source === 'engineering'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 text-gray-600 hover:border-blue-300 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                Engenharia
              </button>
            </div>
          </div>

          {opp.budget_source === 'engineering' && opp.engineering_project_id && engineeringSummary && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-200 truncate">
                  {engineeringSummary.name}
                </span>
                {opp.engineering_request_status === 'pending' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                    Aguardando orçamentista
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-gray-500">Subtotal</div>
                <div className="text-right font-medium text-gray-900 dark:text-white">{fmt(engineeringSummary.subtotal)}</div>
                <div className="text-gray-500">BDI {engineeringSummary.bdi_pct}%</div>
                <div className="text-right text-gray-600">{fmt(engineeringSummary.subtotal * engineeringSummary.bdi_pct / 100)}</div>
                <div className="text-gray-500">Margem {engineeringSummary.margin_pct}%</div>
                <div className="text-right text-gray-600">
                  {fmt(engineeringSummary.subtotal * (1 + engineeringSummary.bdi_pct / 100) * (engineeringSummary.margin_pct / 100))}
                </div>
                <div className="font-semibold text-blue-900 dark:text-blue-200 pt-1.5 border-t border-blue-100 dark:border-blue-800">Total</div>
                <div className="text-right font-bold text-green-600 dark:text-green-400 pt-1.5 border-t border-blue-100 dark:border-blue-800">
                  {fmt(engineeringSummary.total)}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowPicker(true)} className="text-xs text-blue-700 dark:text-blue-300 hover:underline">
                  Trocar
                </button>
                <button onClick={handleUnlinkEngineering} className="text-xs text-red-500 hover:underline">
                  Desvincular
                </button>
              </div>
            </div>
          )}

          {opp.budget_source === 'engineering' && !opp.engineering_project_id && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowPicker(true)}
                className="flex-1 py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                Vincular existente
              </button>
              <button
                onClick={() => setShowRequestModal(true)}
                className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300 transition-colors"
              >
                Solicitar à engenharia
              </button>
            </div>
          )}

          {opp.budget_source === 'simple' && (
            <button
              onClick={() => setShowMigrateConfirm(true)}
              className="w-full text-xs text-blue-600 hover:underline pt-1"
            >
              Migrar para orçamento de Engenharia →
            </button>
          )}
        </div>
      )}

      {/* Quick nav para sub-telas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { view: 'visit' as ServicesView, icon: <ClipboardList size={18} />, label: 'Visita técnica', disabled: opp.stage === 'lead' },
          { view: 'budget' as ServicesView, icon: <Calculator size={18} />, label: 'Orçamento', disabled: ['lead', 'visit'].includes(opp.stage) || opp.budget_source === 'engineering' },
          { view: 'proposal' as ServicesView, icon: <FileText size={18} />, label: 'Proposta', disabled: ['lead', 'visit'].includes(opp.stage) },
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
          onSaved={updated => { setOpp(updated); setIsEditing(false); showToast('Oportunidade atualizada!'); }}
        />
      )}

      {wonResult && (
        <ServicesWonModal
          contactName={opp.contact_name}
          contractNumber={wonResult.contractNumber}
          projectName={wonResult.projectName}
          onClose={() => setWonResult(null)}
          onGoToProject={wonResult.projectId ? () => {
            setWonResult(null);
            onNavigate('pipeline');
          } : undefined}
        />
      )}

      {showPicker && (
        <ServicesEngineeringPicker
          organizationId={organizationId}
          onClose={() => setShowPicker(false)}
          onSelect={handleLinkEngineering}
        />
      )}

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Solicitar orçamento à engenharia</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Um projeto vazio será criado em <strong>Engenharia → Orçamentos</strong> e uma notificação será enviada ao destinatário abaixo.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail do orçamentista *</label>
              <input
                type="email"
                autoFocus
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                value={requestEmail}
                onChange={e => setRequestEmail(e.target.value)}
                placeholder="orcamento@empresa.com.br"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRequestModal(false)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button
                onClick={handleRequestEngineering}
                disabled={!requestEmail.trim()}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Solicitar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMigrateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Migrar para Engenharia</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Os itens do orçamento simples serão copiados para um novo projeto da engenharia. O orçamento simples será mantido como histórico.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowMigrateConfirm(false)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button
                onClick={handleMigrate}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Migrar
              </button>
            </div>
          </div>
        </div>
      )}

      <ServicesToast toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default ServicesOpportunityDetail;
