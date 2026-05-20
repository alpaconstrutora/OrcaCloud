import React from 'react';
import { X, AlertCircle, Loader2, CheckCircle2, Upload, Clock } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import { supabase } from '../../lib/supabase';
import type { ConstructionCondition, ActorReference, ActionStep } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const CompleteRepairStepModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const steps: ActionStep[] = condition.actionPlan?.steps ?? [];
  const pendingSteps = steps.filter(s => !s.completedAt);
  const doneSteps    = steps.filter(s =>  s.completedAt);

  const [selectedStepId, setSelectedStepId] = React.useState<string>(pendingSteps[0]?.id ?? '');
  const [files, setFiles]                   = React.useState<File[]>([]);
  const [isSubmitting, setIsSubmitting]     = React.useState(false);
  const [error, setError]                   = React.useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected].slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStepId) { setError('Selecione uma etapa'); return; }
    if (files.length === 0) { setError('Anexe ao menos 1 foto como evidência da etapa'); return; }

    setIsSubmitting(true);
    setError(null);

    try {
      const uploadedIds: string[] = [];

      for (const file of files) {
        const evidenceId = crypto.randomUUID();
        const path = await qualityConditionService.uploadEvidence(
          organizationId, condition.id, evidenceId, file
        );

        const buf  = await file.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        const hex  = Array.from(new Uint8Array(hash))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        await supabase.from('condition_evidence').insert({
          id:              evidenceId,
          organization_id: organizationId,
          condition_id:    condition.id,
          type:            file.type.startsWith('image') ? 'photo' : 'document',
          url:             path,
          mime_type:       file.type,
          size_bytes:      file.size,
          captured_at:     new Date().toISOString(),
          captured_by:     currentActor,
          checksum:        hex,
          attached_to:     'step',
          attached_to_ref: selectedStepId,
        });

        uploadedIds.push(evidenceId);
      }

      await qualityConditionService.completeRepairStep({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        stepId:          selectedStepId,
        evidenceIds:     uploadedIds,
        completedBy:     currentActor,
      });

      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir etapa');
      setIsSubmitting(false);
    }
  };

  if (pendingSteps.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-base font-semibold text-gray-900">Todas as etapas concluídas</p>
          <p className="text-sm text-gray-500 mt-1">O reparo está pronto para validação.</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Concluir etapa de reparo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {doneSteps.length}/{steps.length} etapas concluídas
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Etapas concluídas */}
          {doneSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Concluídas</p>
              <ul className="space-y-1">
                {doneSteps.map(s => (
                  <li key={s.id} className="flex items-center gap-2 text-sm text-gray-500 line-through">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    {s.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selecionar etapa pendente */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pendentes</p>
            <div className="space-y-2">
              {pendingSteps.map(s => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedStepId === s.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="step"
                    value={s.id}
                    checked={selectedStepId === s.id}
                    onChange={() => setSelectedStepId(s.id)}
                    className="accent-blue-600"
                  />
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800">{s.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Upload de evidência */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Evidência da conclusão <span className="text-red-500">*</span>
            </label>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-sm text-gray-500">Clique para adicionar foto</span>
              <span className="text-xs text-gray-400">Foto do serviço executado — máx. 5 arquivos</span>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 ml-2 text-xs shrink-0"
                    >
                      remover
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
            {isSubmitting ? 'Salvando...' : 'Marcar etapa como concluída'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompleteRepairStepModal;
