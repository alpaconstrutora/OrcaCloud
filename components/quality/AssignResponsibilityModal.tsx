import React from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type { ConstructionCondition, ActorReference, ResponsibleParty } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const PARTY_OPTIONS: { value: ResponsibleParty; label: string; description: string }[] = [
  { value: 'construtora',     label: 'Construtora',        description: 'Falha de execução ou material sob responsabilidade da construtora' },
  { value: 'fornecedor',      label: 'Fornecedor',         description: 'Defeito de produto ou serviço prestado por terceiro contratado' },
  { value: 'proprietario',    label: 'Proprietário',       description: 'Modificação ou intervenção realizada pelo proprietário da unidade' },
  { value: 'uso_inadequado',  label: 'Uso inadequado',     description: 'Uso em desacordo com as especificações do manual do proprietário' },
  { value: 'indeterminado',   label: 'Indeterminado',      description: 'Não é possível determinar a responsabilidade sem perícia adicional' },
];

const AssignResponsibilityModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const existing = condition.responsibility;
  const [party, setParty]               = React.useState<ResponsibleParty>(existing?.responsibleParty ?? 'indeterminado');
  const [justification, setJustification] = React.useState(existing?.justification ?? '');
  const [relatedNorm, setRelatedNorm]   = React.useState(existing?.relatedNorm ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError]               = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 10) {
      setError('A justificativa precisa ter ao menos 10 caracteres');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.assignResponsibility({
        conditionId:      condition.id,
        organizationId,
        expectedVersion:  condition.version,
        responsibleParty: party,
        justification:    justification.trim(),
        relatedNorm:      relatedNorm.trim() || undefined,
        assignedBy:       currentActor,
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Erro ao atribuir responsabilidade');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Atribuir responsabilidade</h2>
            {existing && (
              <p className="text-xs text-yellow-600 mt-0.5">Reatribuição — substituirá a atribuição atual</p>
            )}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parte responsável <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {PARTY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    party === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="party"
                    value={opt.value}
                    checked={party === opt.value}
                    onChange={() => setParty(opt.value)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Justificativa técnica <span className="text-red-500">*</span>
            </label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={3}
              placeholder="Descreva os fundamentos técnicos da atribuição de responsabilidade..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
            <p className="text-xs text-gray-400 mt-1">{justification.length} caracteres (mín. 10)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Norma de referência
            </label>
            <input
              type="text"
              value={relatedNorm}
              onChange={e => setRelatedNorm(e.target.value)}
              placeholder="Ex: NBR 15575-2:2013 seção 11.2"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
            {isSubmitting ? 'Salvando...' : 'Confirmar responsabilidade'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignResponsibilityModal;
