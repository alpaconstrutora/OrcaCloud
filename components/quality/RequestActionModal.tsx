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

interface StepDraft {
  id: string;
  description: string;
}

const RequestActionModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const [description, setDescription]     = React.useState('');
  const [assigneeName, setAssigneeName]   = React.useState('');
  const [assigneeId, setAssigneeId]       = React.useState('');
  const [slaDeadline, setSlaDeadline]     = React.useState('');
  const [estimatedCost, setEstimatedCost] = React.useState('');
  const [steps, setSteps]                 = React.useState<StepDraft[]>([
    { id: crypto.randomUUID(), description: '' }
  ]);
  const [isSubmitting, setIsSubmitting]   = React.useState(false);
  const [error, setError]                 = React.useState<string | null>(null);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const addStep = () => setSteps(s => [...s, { id: crypto.randomUUID(), description: '' }]);
  const removeStep = (id: string) => setSteps(s => s.filter(s => s.id !== id));
  const updateStep = (id: string, value: string) =>
    setSteps(s => s.map(s => s.id === id ? { ...s, description: value } : s));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { setError('Descrição é obrigatória'); return; }
    if (!assigneeName.trim()) { setError('Responsável é obrigatório'); return; }
    if (!slaDeadline) { setError('Prazo é obrigatório'); return; }
    const validSteps = steps.filter(s => s.description.trim());
    if (validSteps.length === 0) { setError('Adicione ao menos uma etapa'); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.requestAction({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        description:     description.trim(),
        assignedTo: {
          actorId:   assigneeId.trim() || crypto.randomUUID(),
          actorType: 'user',
          name:      assigneeName.trim(),
        },
        slaDeadline,
        steps: validSteps.map(s => ({
          id:          s.id,
          description: s.description.trim(),
          evidenceIds: [],
        })),
        estimatedCost: estimatedCost
          ? { amount: parseFloat(estimatedCost), currency: 'BRL' }
          : undefined,
        requestedBy: currentActor,
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Erro ao criar plano de ação');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Criar plano de ação</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição do plano <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Descreva o que será feito para resolver a condição..."
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
                Prazo <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custo estimado (R$)
            </label>
            <input
              type="number"
              value={estimatedCost}
              onChange={e => setEstimatedCost(e.target.value)}
              placeholder="0,00"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Etapas <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar etapa
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={step.description}
                    onChange={e => updateStep(step.id, e.target.value)}
                    placeholder={`Etapa ${i + 1}...`}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      className="text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
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
            onClick={handleSubmit as any}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Criando plano...' : 'Criar plano de ação'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestActionModal;
