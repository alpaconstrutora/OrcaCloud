import React from 'react';
import {
  X, Clock, FileText, CheckCircle2, AlertTriangle,
  Image, Loader2, ChevronRight, Gavel, Play,
  ClipboardList, UserCheck, Wrench, Shield, XCircle, Pencil
} from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type { ConstructionCondition, ActorReference, ConditionState } from '../../types/quality';
import ClassifyConditionModal     from './ClassifyConditionModal';
import AssignResponsibilityModal  from './AssignResponsibilityModal';
import RequestActionModal         from './RequestActionModal';
import CompleteRepairStepModal    from './CompleteRepairStepModal';
import ContestConditionModal      from './ContestConditionModal';
import RespondContestationModal   from './RespondContestationModal';
import ResolveEscalationModal     from './ResolveEscalationModal';
import EditConditionModal         from './EditConditionModal';
import ReviseActionPlanModal      from './ReviseActionPlanModal';

type Modal =
  | 'classify'
  | 'assign_responsibility'
  | 'request_action'
  | 'start_repair'
  | 'complete_step'
  | 'validate'
  | 'contest'
  | 'respond_contestation'
  | 'resolve_escalation'
  | 'close'
  | 'edit'
  | 'revise_plan';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onRefresh: () => void;
}

const SEVERITY_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const ORIGIN_LABELS   = {
  execucao: 'Execução', material: 'Material', projeto: 'Projeto',
  uso: 'Uso inadequado', manutencao: 'Manutenção', indeterminada: 'Indeterminada',
};

const ConditionDetailPanel: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onRefresh
}) => {
  const [history, setHistory]         = React.useState<any[]>([]);
  const [loadingHist, setLoadingHist] = React.useState(false);
  const [activeTab, setActiveTab]     = React.useState<'info' | 'evidence' | 'history'>('info');
  const [openModal, setOpenModal]     = React.useState<Modal | null>(null);
  const [isActing, setIsActing]       = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const taxonomy = condition.taxonomy ?? condition.provisionalTaxonomy;

  React.useEffect(() => {
    if (activeTab !== 'history') return;
    setLoadingHist(true);
    qualityConditionService
      .getHistory(condition.id, organizationId)
      .then(setHistory).catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [activeTab, condition.id, organizationId]);

  const handleModalDone = () => {
    setOpenModal(null);
    onRefresh();
  };

  // Ações inline (sem modal separado)
  const handleStartRepair = async () => {
    if (!condition.responsibility) {
      setActionError('Atribua a responsabilidade antes de iniciar o reparo');
      return;
    }
    setIsActing(true);
    setActionError(null);
    try {
      await qualityConditionService.startRepair({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        startedBy:       currentActor,
      });
      onRefresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleValidate = async (result: 'approved' | 'requires_correction') => {
    setIsActing(true);
    setActionError(null);
    try {
      await qualityConditionService.validate({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        result,
        validatedBy:     currentActor,
      });
      onRefresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleClose = async () => {
    setIsActing(true);
    setActionError(null);
    try {
      await qualityConditionService.close({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        closedBy:        currentActor,
      });
      onRefresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsActing(false);
    }
  };

  const modalProps = { condition, currentActor, organizationId, onClose: () => setOpenModal(null), onDone: handleModalDone };

  return (
    <>
      <div className="flex flex-col h-full">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{condition.id.slice(0, 12)}…</span>
              <StateChip state={condition.state} />
              {!condition.taxonomy && condition.provisionalTaxonomy && (
                <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">provisional</span>
              )}
            </div>
            <h3 className="text-base font-semibold text-gray-900 mt-1">
              {taxonomy?.pathologyCode ?? taxonomy?.systemCode ?? 'Sem classificação'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {SEVERITY_LABELS[condition.severity]} · {ORIGIN_LABELS[condition.origin]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {condition.state !== 'CLOSED' && condition.state !== 'IN_REPAIR' &&
             condition.state !== 'REPAIRED' && condition.state !== 'VALIDATED' &&
             condition.state !== 'CONTESTED' && condition.state !== 'ESCALATED' && (
              <button
                onClick={() => setOpenModal('edit')}
                title="Editar condição"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5">
          {(['info', 'evidence', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {{ info: 'Informações', evidence: `Evidências (${condition.evidence.filter(e => !e.superseded).length})`, history: 'Histórico' }[tab]}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {activeTab === 'info' && (
            <div className="space-y-5">
              {/* Dados gerais */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <InfoRow label="Score de qualidade" value={`${condition.qualityScore?.value ?? '—'}/100`} />
                <InfoRow label="Versão" value={`v${condition.version}`} />
                <InfoRow label="Detectado em" value={new Date(condition.detectedAt).toLocaleDateString('pt-BR')} />
                <InfoRow label="Detectado por" value={condition.detectedBy.name} />
                {condition.taxonomy?.normRef && (
                  <InfoRow label="Norma" value={condition.taxonomy.normRef} />
                )}
              </div>

              {/* Responsabilidade */}
              {condition.responsibility ? (
                <InfoSection title="Responsabilidade" action={
                  condition.state !== 'CLOSED' && condition.state !== 'IN_REPAIR' ? (
                    <button onClick={() => setOpenModal('assign_responsibility')} className="text-xs text-blue-600 hover:underline">Reatribuir</button>
                  ) : undefined
                }>
                  <InfoRow label="Parte responsável" value={condition.responsibility.responsibleParty} />
                  <InfoRow label="Justificativa" value={condition.responsibility.justification} />
                  {condition.responsibility.relatedNorm && (
                    <InfoRow label="Norma" value={condition.responsibility.relatedNorm} />
                  )}
                </InfoSection>
              ) : condition.state !== 'DETECTED' && condition.state !== 'CLOSED' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-yellow-800">Responsabilidade não atribuída</p>
                  <button onClick={() => setOpenModal('assign_responsibility')} className="text-xs font-medium text-yellow-700 hover:text-yellow-900 underline">
                    Atribuir agora
                  </button>
                </div>
              ) : null}

              {/* Descrição */}
              {condition.description && (
                <InfoSection title="Descrição">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{condition.description}</p>
                </InfoSection>
              )}

              {/* Localização */}
              {(condition.assetRef.unidadeId || condition.assetRef.ambienteId) && (
                <InfoSection title="Localização">
                  {condition.assetRef.unidadeId && <InfoRow label="Unidade" value={condition.assetRef.unidadeId} />}
                  {condition.assetRef.ambienteId && <InfoRow label="Ambiente" value={condition.assetRef.ambienteId} />}
                </InfoSection>
              )}

              {/* Plano de ação */}
              {condition.actionPlan && (
                <InfoSection title="Plano de ação" action={
                  condition.state !== 'CLOSED' ? (
                    <button onClick={() => setOpenModal('revise_plan')} className="text-xs text-blue-600 hover:underline">
                      Revisar plano
                    </button>
                  ) : undefined
                }>
                  <InfoRow label="Responsável" value={condition.actionPlan.assignedTo.name} />
                  <InfoRow label="Prazo" value={new Date(condition.actionPlan.slaDeadline).toLocaleDateString('pt-BR')} />
                  {condition.actionPlan.estimatedCost && (
                    <InfoRow label="Custo estimado" value={`R$ ${condition.actionPlan.estimatedCost.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  )}
                  <InfoRow label="Descrição" value={condition.actionPlan.description} />
                  {condition.actionPlan.steps.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Etapas</p>
                      <ul className="space-y-1.5">
                        {condition.actionPlan.steps.map((s, i) => (
                          <li key={s.id ?? i} className="flex items-start gap-2 text-sm">
                            {s.completedAt
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              : <Clock className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
                            <span className={s.completedAt ? 'text-gray-500 line-through' : 'text-gray-800'}>
                              {s.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </InfoSection>
              )}

              {/* Contestação */}
              {condition.contestation && (
                <InfoSection title="Contestação">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      condition.contestation.state === 'open'      ? 'bg-red-100 text-red-700' :
                      condition.contestation.state === 'resolved'  ? 'bg-green-100 text-green-700' :
                      condition.contestation.state === 'escalated' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {condition.contestation.state}
                    </span>
                  </div>
                  <InfoRow label="Fundamentação" value={condition.contestation.basis} />
                  <InfoRow label="Por" value={condition.contestation.contestedBy.name} />
                  <InfoRow label="Prazo SLA" value={new Date(condition.contestation.slaDeadline).toLocaleDateString('pt-BR')} />
                  {condition.contestation.response && (
                    <InfoRow
                      label="Decisão"
                      value={condition.contestation.response.repairAccepted
                        ? 'Reparo aceito — contestação improcedente'
                        : 'Reparo rejeitado — novo ciclo de reparo'}
                    />
                  )}
                </InfoSection>
              )}

              {/* Validações */}
              {condition.validations.length > 0 && (
                <InfoSection title="Histórico de validações">
                  <ul className="space-y-2">
                    {condition.validations.map(v => (
                      <li key={v.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {v.result === 'approved'
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                          <span className="text-gray-700 capitalize">{v.result.replace('_', ' ')}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {v.validatedBy.name} · {new Date(v.validatedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </InfoSection>
              )}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div>
              {condition.evidence.filter(e => !e.superseded).length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma evidência registrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {condition.evidence.filter(e => !e.superseded).map(ev => (
                    <div key={ev.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-700 capitalize">{ev.type}</p>
                          <span className="text-xs text-gray-400">{(ev.sizeBytes / 1024).toFixed(0)}KB</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(ev.capturedAt).toLocaleString('pt-BR')} · {ev.capturedBy.name}
                        </p>
                        {ev.attachedTo !== 'condition' && (
                          <p className="text-xs text-blue-500 mt-0.5">Referência: {ev.attachedTo}</p>
                        )}
                        {ev.geoRef?.latitude && (
                          <p className="text-xs text-green-600 mt-0.5">
                            GPS ±{Math.round(ev.geoRef.accuracy ?? 0)}m
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {loadingHist ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Nenhum evento registrado</p>
              ) : (
                <ol className="relative border-l border-gray-200 pl-5 space-y-5">
                  {history.map(ev => (
                    <li key={ev.event_id} className="relative">
                      <div className="absolute -left-[1.4rem] top-0.5 w-3 h-3 bg-blue-400 rounded-full border-2 border-white" />
                      <p className="text-xs text-gray-400">{new Date(ev.occurred_at).toLocaleString('pt-BR')}</p>
                      <p className="text-sm font-medium text-gray-800">{ev.event_type}</p>
                      <p className="text-xs text-gray-400">versão {ev.aggregate_version}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {/* Barra de ações por estado */}
        <div className="border-t border-gray-200 px-5 py-3 space-y-2">
          {actionError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{actionError}
            </div>
          )}
          <ActionBar
            state={condition.state}
            condition={condition}
            isActing={isActing}
            onClassify          ={() => setOpenModal('classify')}
            onAssignResp        ={() => setOpenModal('assign_responsibility')}
            onRequestAction     ={() => setOpenModal('request_action')}
            onStartRepair       ={handleStartRepair}
            onCompleteStep      ={() => setOpenModal('complete_step')}
            onValidateApproved  ={() => handleValidate('approved')}
            onValidateCorrection={() => handleValidate('requires_correction')}
            onClose             ={handleClose}
            onContest           ={() => setOpenModal('contest')}
            onRespondContestation={() => setOpenModal('respond_contestation')}
            onResolveEscalation ={() => setOpenModal('resolve_escalation')}
          />
        </div>
      </div>

      {/* Modais */}
      {openModal === 'classify'              && <ClassifyConditionModal    {...modalProps} />}
      {openModal === 'assign_responsibility' && <AssignResponsibilityModal {...modalProps} />}
      {openModal === 'request_action'        && <RequestActionModal        {...modalProps} />}
      {openModal === 'complete_step'         && <CompleteRepairStepModal   {...modalProps} />}
      {openModal === 'contest'               && <ContestConditionModal     {...modalProps} />}
      {openModal === 'respond_contestation'  && <RespondContestationModal  {...modalProps} />}
      {openModal === 'resolve_escalation'    && <ResolveEscalationModal    {...modalProps} />}
      {openModal === 'edit'                  && <EditConditionModal        {...modalProps} />}
      {openModal === 'revise_plan'           && condition.actionPlan && <ReviseActionPlanModal {...modalProps} />}
    </>
  );
};

// ────────────────────────────────────────────────────────────
// ActionBar — botões corretos para cada estado
// ────────────────────────────────────────────────────────────

interface ActionBarProps {
  state: ConditionState;
  condition: ConstructionCondition;
  isActing: boolean;
  onClassify: () => void;
  onAssignResp: () => void;
  onRequestAction: () => void;
  onStartRepair: () => void;
  onCompleteStep: () => void;
  onValidateApproved: () => void;
  onValidateCorrection: () => void;
  onClose: () => void;
  onContest: () => void;
  onRespondContestation: () => void;
  onResolveEscalation: () => void;
}

function ActionBar({ state, condition, isActing, ...actions }: ActionBarProps) {
  const hasPendingSteps = (condition.actionPlan?.steps ?? []).some(s => !s.completedAt);

  switch (state) {
    case 'DETECTED':
      return (
        <div className="flex items-center gap-2">
          <ActionBtn icon={<ClipboardList className="w-3.5 h-3.5" />} label="Classificar" onClick={actions.onClassify} loading={isActing} color="blue" />
          <Hint>Adicione ao menos 1 foto antes de classificar</Hint>
        </div>
      );

    case 'CLASSIFIED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          {!condition.responsibility && (
            <ActionBtn icon={<UserCheck className="w-3.5 h-3.5" />} label="Atribuir responsabilidade" onClick={actions.onAssignResp} loading={isActing} color="blue" />
          )}
          {condition.severity === 'baixa' ? (
            <ActionBtn icon={<Shield className="w-3.5 h-3.5" />} label="Validar diretamente" onClick={actions.onValidateApproved} loading={isActing} color="green" />
          ) : (
            <ActionBtn icon={<ClipboardList className="w-3.5 h-3.5" />} label="Criar plano de ação" onClick={actions.onRequestAction} loading={isActing} color="blue" />
          )}
        </div>
      );

    case 'ACTION_REQUIRED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          {!condition.responsibility && (
            <ActionBtn icon={<UserCheck className="w-3.5 h-3.5" />} label="Atribuir responsabilidade" onClick={actions.onAssignResp} loading={isActing} color="blue" />
          )}
          <ActionBtn
            icon={<Play className="w-3.5 h-3.5" />}
            label="Iniciar reparo"
            onClick={actions.onStartRepair}
            loading={isActing}
            color="blue"
            disabled={!condition.responsibility}
            title={!condition.responsibility ? 'Atribua a responsabilidade primeiro' : undefined}
          />
        </div>
      );

    case 'IN_REPAIR':
      return (
        <div className="flex flex-wrap items-center gap-2">
          {hasPendingSteps && (
            <ActionBtn icon={<Wrench className="w-3.5 h-3.5" />} label="Concluir etapa" onClick={actions.onCompleteStep} loading={isActing} color="blue" />
          )}
          {!hasPendingSteps && (
            <Hint>Todas as etapas concluídas — aguardando validação</Hint>
          )}
        </div>
      );

    case 'REPAIRED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ActionBtn icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Aprovar reparo" onClick={actions.onValidateApproved} loading={isActing} color="green" />
          <ActionBtn icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Solicitar correção" onClick={actions.onValidateCorrection} loading={isActing} color="orange" />
          <ActionBtn icon={<XCircle className="w-3.5 h-3.5" />} label="Contestar" onClick={actions.onContest} loading={isActing} color="red" />
        </div>
      );

    case 'VALIDATED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ActionBtn icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Encerrar condição" onClick={actions.onClose} loading={isActing} color="gray" />
          <ActionBtn icon={<XCircle className="w-3.5 h-3.5" />} label="Contestar" onClick={actions.onContest} loading={isActing} color="red" />
        </div>
      );

    case 'CONTESTED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ActionBtn icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Responder contestação" onClick={actions.onRespondContestation} loading={isActing} color="blue" />
          <Hint>SLA: {condition.contestation ? new Date(condition.contestation.slaDeadline).toLocaleDateString('pt-BR') : '—'}</Hint>
        </div>
      );

    case 'ESCALATED':
      return (
        <div className="flex items-center gap-2">
          <ActionBtn icon={<Gavel className="w-3.5 h-3.5" />} label="Resolver escalação" onClick={actions.onResolveEscalation} loading={isActing} color="purple" />
          <Hint>Requer decisão externa (laudo/judicial)</Hint>
        </div>
      );

    case 'REOPENED':
      return (
        <div className="flex items-center gap-2">
          <ActionBtn icon={<ClipboardList className="w-3.5 h-3.5" />} label="Reclassificar" onClick={actions.onClassify} loading={isActing} color="blue" />
          <Hint>Adicione nova evidência antes de reclassificar</Hint>
        </div>
      );

    case 'CLOSED':
      return <Hint>Condição encerrada — somente leitura</Hint>;

    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Sub-componentes
// ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onClick, loading, color, disabled, title
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  loading: boolean; color: string; disabled?: boolean; title?: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
    green:  'bg-green-600 hover:bg-green-700 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    red:    'bg-red-100 hover:bg-red-200 text-red-700',
    gray:   'bg-gray-100 hover:bg-gray-200 text-gray-700',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${colors[color] ?? colors.blue}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs text-gray-400 flex items-center gap-1">
      <ChevronRight className="w-3 h-3" />{children}
    </span>
  );
}

function StateChip({ state }: { state: ConditionState }) {
  const cfg: Record<ConditionState, string> = {
    DETECTED:        'bg-gray-100 text-gray-600',
    CLASSIFIED:      'bg-blue-100 text-blue-700',
    ACTION_REQUIRED: 'bg-orange-100 text-orange-700',
    IN_REPAIR:       'bg-blue-100 text-blue-700',
    REPAIRED:        'bg-teal-100 text-teal-700',
    VALIDATED:       'bg-green-100 text-green-700',
    CONTESTED:       'bg-red-100 text-red-700',
    ESCALATED:       'bg-purple-100 text-purple-700',
    REOPENED:        'bg-orange-100 text-orange-700',
    CLOSED:          'bg-gray-100 text-gray-400',
  };
  const labels: Record<ConditionState, string> = {
    DETECTED: 'Detectada', CLASSIFIED: 'Classificada',
    ACTION_REQUIRED: 'Ação necessária', IN_REPAIR: 'Em reparo',
    REPAIRED: 'Reparada', VALIDATED: 'Validada',
    CONTESTED: 'Contestada', ESCALATED: 'Escalada',
    REOPENED: 'Reaberta', CLOSED: 'Encerrada',
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg[state]}`}>{labels[state]}</span>;
}

function InfoSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h4>
        {action}
      </div>
      <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

export default ConditionDetailPanel;
