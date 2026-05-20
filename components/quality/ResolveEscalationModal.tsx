import React from 'react';
import { X, AlertCircle, Loader2, Gavel } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type { ConstructionCondition, ActorReference } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const ResolveEscalationModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const [externalDecision, setExternalDecision] = React.useState('');
  const [resolution, setResolution]             = React.useState('');
  const [isSubmitting, setIsSubmitting]         = React.useState(false);
  const [error, setError]                       = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (externalDecision.trim().length < 5) {
      setError('Informe a referência da decisão externa (laudo, número do processo, etc.)');
      return;
    }
    if (resolution.trim().length < 10) {
      setError('A descrição da resolução precisa ter ao menos 10 caracteres');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.resolveEscalation({
        conditionId:      condition.id,
        organizationId,
        expectedVersion:  condition.version,
        externalDecision: externalDecision.trim(),
        resolution:       resolution.trim(),
        closedBy:         currentActor,
      });
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver escalação');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Gavel className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">Resolver escalação</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="bg-purple-50 text-purple-800 text-sm px-4 py-3 rounded-lg">
            <p className="font-medium mb-1">Condição escalada — resolução externa obrigatória</p>
            <p className="text-xs">
              Esta condição está aguardando resolução jurídica ou pericial. Ao encerrar, informe
              a referência da decisão externa que fundamenta o encerramento.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referência da decisão externa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={externalDecision}
              onChange={e => setExternalDecision(e.target.value)}
              placeholder="Ex: Laudo pericial nº 2024/0123 · Processo nº 1234-56.2024 · Acordo extrajudicial de 15/03/2024"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Número do laudo, processo judicial, acordo ou documento que resolveu a questão.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição da resolução <span className="text-red-500">*</span>
            </label>
            <textarea
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              rows={4}
              placeholder="Descreva como a questão foi resolvida: resultado da perícia, termos do acordo, decisão judicial, ações tomadas..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div className="bg-gray-50 text-gray-600 text-xs px-3 py-2 rounded-lg">
            Ao confirmar, a condição será encerrada (CLOSED) e não poderá ser modificada.
            O evento de encerramento ficará registrado no audit log com a referência informada.
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as React.MouseEventHandler<HTMLButtonElement>}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Encerrando...' : 'Confirmar resolução e encerrar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResolveEscalationModal;
