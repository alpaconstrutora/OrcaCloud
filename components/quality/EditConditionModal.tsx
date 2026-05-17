import React from 'react';
import { X, AlertCircle, Loader2, Pencil } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type { ConstructionCondition, ActorReference, Severity, ProbableOrigin } from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const EditConditionModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const [unidade, setUnidade]       = React.useState(condition.assetRef.unidadeId ?? '');
  const [ambiente, setAmbiente]     = React.useState(condition.assetRef.ambienteId ?? '');
  const [severity, setSeverity]     = React.useState<Severity>(condition.severity);
  const [origin, setOrigin]         = React.useState<ProbableOrigin>(condition.origin);
  const [description, setDescription] = React.useState(condition.description ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError]           = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.updateDraft({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        assetUnidadeId:  unidade.trim()  || undefined,
        assetAmbienteId: ambiente.trim() || undefined,
        severity:        severity !== condition.severity ? severity : undefined,
        origin:          origin   !== condition.origin   ? origin   : undefined,
        description:     description.trim() || undefined,
        updatedBy:       currentActor,
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar alterações');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Editar condição</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
            Edição disponível apenas nos estados: Detectada, Classificada, Ação necessária e Reaberta.
            Alterações de taxonomia devem ser feitas via <strong>Classificar</strong>.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
              <input
                type="text"
                value={unidade}
                onChange={e => setUnidade(e.target.value)}
                placeholder="Ex: Apto 101, Casa 3"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ambiente</label>
              <input
                type="text"
                value={ambiente}
                onChange={e => setAmbiente(e.target.value)}
                placeholder="Ex: Banheiro suíte"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severidade</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as Severity)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="baixa">Baixa — estético</option>
                <option value="media">Média — funcional</option>
                <option value="alta">Alta — imediato</option>
                <option value="critica">Crítica — estrutural</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origem provável</label>
              <select
                value={origin}
                onChange={e => setOrigin(e.target.value as ProbableOrigin)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="indeterminada">Indeterminada</option>
                <option value="execucao">Execução deficiente</option>
                <option value="material">Material não conforme</option>
                <option value="projeto">Falha de projeto</option>
                <option value="uso">Uso inadequado</option>
                <option value="manutencao">Manutenção deficiente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Observações</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Descreva a condição com mais detalhes: localização exata, sintomas observados, histórico..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{description.length} caracteres</p>
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
            {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditConditionModal;
