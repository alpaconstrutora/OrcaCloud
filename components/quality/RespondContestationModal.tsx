import React from 'react';
import { X, AlertCircle, Loader2, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import { supabase } from '../../lib/supabase';
import type { ConstructionCondition, ActorReference } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const RespondContestationModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const contestation = condition.contestation;
  // null = não decidido ainda | true = reparo ok | false = reparo insuficiente
  const [repairAccepted, setRepairAccepted] = React.useState<boolean | null>(null);
  const [justification, setJustification]  = React.useState('');
  const [files, setFiles]                  = React.useState<File[]>([]);
  const [isSubmitting, setIsSubmitting]    = React.useState(false);
  const [error, setError]                  = React.useState<string | null>(null);

  if (!contestation) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (repairAccepted === null) { setError('Selecione uma decisão'); return; }
    if (justification.trim().length < 10) { setError('A justificativa precisa ter ao menos 10 caracteres'); return; }

    setIsSubmitting(true);
    setError(null);

    try {
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
          attached_to:     'contestation',
          attached_to_ref: contestation.id,
        });
      }

      await qualityConditionService.respondToContestation({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        repairAccepted:  repairAccepted,
        justification:   justification.trim(),
        respondedBy:     currentActor,
      });

      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao responder contestação');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Responder contestação</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Contestação original */}
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Contestação recebida</p>
            <p className="text-sm text-gray-800">{contestation.basis}</p>
            <p className="text-xs text-gray-400 mt-1">
              Por {contestation.contestedBy.name} em {new Date(contestation.contestedAt).toLocaleDateString('pt-BR')}
              {' · '}Prazo: {new Date(contestation.slaDeadline).toLocaleDateString('pt-BR')}
            </p>
          </div>

          {/* Decisão */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Decisão <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  repairAccepted === true
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value="accepted"
                  checked={repairAccepted === true}
                  onChange={() => setRepairAccepted(true)}
                  className="sr-only"
                />
                <CheckCircle2 className={`w-6 h-6 ${repairAccepted === true ? 'text-green-600' : 'text-gray-300'}`} />
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800">Reparo aceito</p>
                  <p className="text-xs text-gray-500 mt-0.5">Contestação improcedente — condição vai para Validada</p>
                </div>
              </label>

              <label
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  repairAccepted === false
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value="rejected"
                  checked={repairAccepted === false}
                  onChange={() => setRepairAccepted(false)}
                  className="sr-only"
                />
                <XCircle className={`w-6 h-6 ${repairAccepted === false ? 'text-red-600' : 'text-gray-300'}`} />
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800">Reparo rejeitado</p>
                  <p className="text-xs text-gray-500 mt-0.5">Contestação procedente — retorna para Ação necessária</p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Justificativa <span className="text-red-500">*</span>
            </label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={3}
              placeholder="Descreva os fundamentos técnicos da decisão..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Documentos de suporte (opcional)</label>
            <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-700">
              <Upload className="w-4 h-4" />
              Adicionar arquivo
              <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-2">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as React.MouseEventHandler<HTMLButtonElement>}
            disabled={isSubmitting || repairAccepted === null}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
              repairAccepted === false ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Enviando...' : 'Confirmar decisão'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RespondContestationModal;
