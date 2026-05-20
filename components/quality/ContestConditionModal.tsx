import React from 'react';
import { X, AlertCircle, Loader2, Upload } from 'lucide-react';
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

const ContestConditionModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const [basis, setBasis]               = React.useState('');
  const [slaDeadline, setSlaDeadline]   = React.useState('');
  const [files, setFiles]               = React.useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError]               = React.useState<string | null>(null);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  const minDateStr = minDate.toISOString().split('T')[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected].slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (basis.trim().length < 10) { setError('A fundamentação precisa ter ao menos 10 caracteres'); return; }
    if (!slaDeadline) { setError('Informe o prazo para resposta'); return; }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload de anexos (opcional)
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
        });
      }

      await qualityConditionService.contest({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        basis:           basis.trim(),
        slaDeadline,
        contestedBy:     currentActor,
      });

      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar contestação');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Contestar reparo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Estado atual: <span className="font-medium">{condition.state}</span>
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="bg-yellow-50 text-yellow-800 text-sm px-3 py-2 rounded-lg">
            A contestação bloqueia o encerramento da condição até ser respondida ou escalada.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fundamentação técnica ou jurídica <span className="text-red-500">*</span>
            </label>
            <textarea
              value={basis}
              onChange={e => setBasis(e.target.value)}
              rows={4}
              placeholder="Descreva os motivos da contestação. Seja específico: aponte o defeito persistente, a norma aplicável ou o laudo técnico que embase a contestação..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
            <p className="text-xs text-gray-400 mt-1">{basis.length} caracteres (mín. 10)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prazo para resposta <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={slaDeadline}
              min={minDateStr}
              onChange={e => setSlaDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Prazo mínimo: 3 dias. Após o vencimento sem resposta, a condição é escalada automaticamente.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anexos (opcional)
            </label>
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-xs text-gray-500">Fotos, laudos ou documentos — máx. 5 arquivos</span>
              <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-500 ml-2 shrink-0">remover</button>
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
          <button onClick={handleSubmit as React.MouseEventHandler<HTMLButtonElement>} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Registrando...' : 'Registrar contestação'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContestConditionModal;
