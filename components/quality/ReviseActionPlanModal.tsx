import React from 'react';
import { X, AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type { ConstructionCondition, ActorReference } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const ReviseActionPlanModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const plan = condition.actionPlan!;

  const [description, setDescription]   = React.useState(plan.description);
  const [assigneeName, setAssigneeName] = React.useState(plan.assignedTo.name);
  const [slaDeadline, setSlaDeadline]   = React.useState(plan.slaDeadline);
  const [revisionReason, setRevisionReason] = React.useState('');
  const [costAmount, setCostAmount]     = React.useState(plan.estimatedCost?.amount?.toString() ?? '');
  const [steps, setSteps]               = React.useState<string[]>(
    plan.steps.filter(s => !s.completedAt).map(s => s.description)
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError]               = React.useState<string | null>(null);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const addStep = () => setSteps(prev => [...prev, '']);

  const updateStep = (i: number, val: string) =>
    setSteps(prev => prev.map((s, j) => j === i ? val : s));

  const removeStep = (i: number) =>
    setSteps(prev => prev.filter((_, j) => j !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 5) {
      setError('Descrição muito curta (mín. 5 caracteres)');
      return;
    }
    if (!assigneeName.trim()) {
      setError('Informe o responsável');
      return;
    }
    if (!slaDeadline) {
      setError('Informe o novo prazo');
      return;
    }
    if (revisionReason.trim().length < 10) {
      setError('Motivo da revisão precisa ter ao menos 10 caracteres');
      return;
    }
    const validSteps = steps.filter(s => s.trim().length > 0);
    if (validSteps.length === 0) {
      setError('Adicione ao menos uma etapa ao plano');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.reviseActionPlan({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        description:     description.trim(),
        assignedTo: {
          actorId:   currentActor.actorId,
          actorType: currentActor.actorType,
          name:      assigneeName.trim(),
        },
        slaDeadline,
        steps: validSteps.map((s, i) => ({
          id:          crypto.randomUUID(),
          description: s.trim(),
          order:       i + 1,
          evidenceIds: [] as string[],
        })),
        estimatedCost: costAmount ? {
          amount:   parseFloat(costAmount),
          currency: 'BRL',
        } : undefined,
        revisionReason: revisionReason.trim(),
        revisedBy: currentActor,
      });
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao revisar plano de ação');
      setIsSubmitting(false);
    }
  };

  const completedSteps = plan.steps.filter(s => s.completedAt);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Revisar plano de ação</h2>
            <p className="text-xs text-gray-500 mt-0.5">Um novo plano substituirá o atual</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {completedSteps.length > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Etapas já concluídas (mantidas)
              </p>
              <ul className="space-y-1">
                {completedSteps.map(s => (
                  <li key={s.id} className="text-xs text-gray-500 line-through">{s.description}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo da revisão <span className="text-red-500">*</span>
            </label>
            <textarea
              value={revisionReason}
              onChange={e => setRevisionReason(e.target.value)}
              rows={2}
              placeholder="Por que o plano está sendo revisado? O que mudou?"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição do plano <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Descreva o novo plano de ação..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={assigneeName}
                onChange={e => setAssigneeName(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Novo prazo <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={slaDeadline}
                min={minDateStr}
                onChange={e => setSlaDeadline(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custo estimado (opcional)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-gray-400">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costAmount}
                onChange={e => setCostAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Etapas pendentes <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar etapa
              </button>
            </div>
            {steps.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 border-2 border-dashed border-gray-200 rounded-lg">
                Clique em "Adicionar etapa" para começar
              </p>
            ) : (
              <ul className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
                    <input
                      type="text"
                      value={step}
                      onChange={e => updateStep(i, e.target.value)}
                      placeholder={`Etapa ${i + 1}...`}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as React.MouseEventHandler<HTMLButtonElement>}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Salvando...' : 'Salvar revisão'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviseActionPlanModal;
