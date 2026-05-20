import React from 'react';
import { X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import type {
  ConstructionCondition, ActorReference,
  TaxonomySystem, TaxonomyPathology, Severity, ProbableOrigin
} from '../../types/quality';

interface Props {
  condition: ConstructionCondition;
  currentActor: ActorReference;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}

const ClassifyConditionModal: React.FC<Props> = ({
  condition, currentActor, organizationId, onClose, onDone
}) => {
  const prev = condition.taxonomy ?? condition.provisionalTaxonomy;

  const [systems, setSystems]         = React.useState<TaxonomySystem[]>([]);
  const [pathologies, setPathologies] = React.useState<TaxonomyPathology[]>([]);
  const [systemCode, setSystemCode]   = React.useState(prev?.systemCode ?? '');
  const [pathologyCode, setPathologyCode] = React.useState(prev?.pathologyCode ?? '');
  const [normRef, setNormRef]         = React.useState(prev?.normRef ?? '');
  const [severity, setSeverity]       = React.useState<Severity>(condition.severity);
  const [origin, setOrigin]           = React.useState<ProbableOrigin>(condition.origin);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError]             = React.useState<string | null>(null);

  React.useEffect(() => {
    qualityConditionService.getTaxonomySystems().then(setSystems).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!systemCode) { setPathologies([]); return; }
    qualityConditionService.getTaxonomyPathologies(systemCode)
      .then(setPathologies).catch(() => {});
  }, [systemCode]);

  const photoCount = condition.evidence.filter(e => e.type === 'photo' && !e.superseded).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!systemCode || !pathologyCode) {
      setError('Sistema e patologia são obrigatórios');
      return;
    }
    if (photoCount < 1) {
      setError('A condição precisa de ao menos 1 foto antes de ser classificada');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await qualityConditionService.classify({
        conditionId:     condition.id,
        organizationId,
        expectedVersion: condition.version,
        taxonomy:        { systemCode, pathologyCode, normRef: normRef || undefined },
        severity,
        origin,
        classifiedBy:    currentActor,
      });
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao classificar');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Classificar condição</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {photoCount < 1 && (
            <div className="flex items-start gap-2 bg-yellow-50 text-yellow-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              Sem fotos — adicione ao menos 1 foto antes de classificar.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sistema construtivo <span className="text-red-500">*</span>
            </label>
            <select
              value={systemCode}
              onChange={e => { setSystemCode(e.target.value); setPathologyCode(''); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Selecionar sistema...</option>
              {systems.map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patologia <span className="text-red-500">*</span>
            </label>
            <select
              value={pathologyCode}
              onChange={e => setPathologyCode(e.target.value)}
              disabled={!systemCode}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              required
            >
              <option value="">Selecionar patologia...</option>
              {pathologies.map(p => (
                <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
              ))}
            </select>
            {pathologyCode && pathologies.find(p => p.code === pathologyCode)?.definition && (
              <p className="mt-1 text-xs text-gray-500 italic">
                {pathologies.find(p => p.code === pathologyCode)?.definition}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Norma de referência
            </label>
            <input
              type="text"
              value={normRef}
              onChange={e => setNormRef(e.target.value)}
              placeholder="Ex: NBR 6118:2023 seção 13.4"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
                <option value="alta">Alta — comprometimento imediato</option>
                <option value="critica">Crítica — risco estrutural/saúde</option>
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

          {severity === 'baixa' && (
            <div className="flex items-start gap-2 bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              Severidade baixa: ao classificar, a condição poderá ir direto para Validada sem plano de ação.
            </div>
          )}
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
            disabled={isSubmitting || photoCount < 1}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Classificando...' : 'Confirmar classificação'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassifyConditionModal;
