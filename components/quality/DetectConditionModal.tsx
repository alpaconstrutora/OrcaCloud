import React from 'react';
import { X, Upload, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { qualityConditionService } from '../../services/qualityConditionService';
import { supabase } from '../../lib/supabase';
import type {
  ActorReference, TaxonomySystem, TaxonomyPathology,
  Severity, ProbableOrigin
} from '../../types/quality';

interface Project { id: string; name: string; }

interface Props {
  organizationId: string;
  currentActor: ActorReference;
  onClose: () => void;
  onCreated: (conditionId: string) => void;
}

const DetectConditionModal: React.FC<Props> = ({
  organizationId, currentActor, onClose, onCreated
}) => {
  const [projects, setProjects]          = React.useState<Project[]>([]);
  const [systems, setSystems]            = React.useState<TaxonomySystem[]>([]);
  const [pathologies, setPathologies]    = React.useState<TaxonomyPathology[]>([]);
  const [isSubmitting, setIsSubmitting]  = React.useState(false);
  const [error, setError]                = React.useState<string | null>(null);

  // Form state
  const [empreendimentoId, setEmpreendimento] = React.useState('');
  const [unidade, setUnidade]                 = React.useState('');
  const [ambiente, setAmbiente]               = React.useState('');
  const [systemCode, setSystemCode]           = React.useState('');
  const [pathologyCode, setPathologyCode]     = React.useState('');
  const [severity, setSeverity]               = React.useState<Severity>('media');
  const [origin, setOrigin]                   = React.useState<ProbableOrigin>('indeterminada');
  const [files, setFiles]                     = React.useState<File[]>([]);
  const [captureGeo, setCaptureGeo]           = React.useState(false);
  const [geoRef, setGeoRef]                   = React.useState<GeolocationCoordinates | null>(null);

  React.useEffect(() => {
    // Load obras from this organization
    supabase
      .from('projects')
      .select('id, name')
      .filter('settings->>organizationId', 'eq', organizationId)
      .filter('settings->>classification', 'eq', 'OBRA')
      .order('name')
      .then(({ data }) => setProjects(data ?? []));

    qualityConditionService.getTaxonomySystems().then(setSystems).catch(() => {});
  }, [organizationId]);

  React.useEffect(() => {
    if (!systemCode) { setPathologies([]); setPathologyCode(''); return; }
    qualityConditionService.getTaxonomyPathologies(systemCode)
      .then(setPathologies)
      .catch(() => {});
  }, [systemCode]);

  const handleGeo = () => {
    setCaptureGeo(true);
    navigator.geolocation?.getCurrentPosition(
      pos => { setGeoRef(pos.coords); setCaptureGeo(false); },
      ()  => { setCaptureGeo(false); }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected].slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empreendimentoId) {
      setError('Selecione um empreendimento');
      return;
    }
    if (files.length === 0) {
      setError('Anexe ao menos uma foto');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await qualityConditionService.detect({
        organizationId,
        assetEmpreendimentoId: empreendimentoId,
        assetUnidadeId:  unidade.trim()  || undefined,
        assetAmbienteId: ambiente.trim() || undefined,
        provisionalTaxonomy: systemCode ? {
          systemCode,
          pathologyCode: pathologyCode || undefined,
        } : undefined,
        severity,
        origin,
        detectedBy: currentActor,
      }) as unknown as { conditionId: string };

      const conditionId = result.conditionId;

      for (const file of files) {
        const evidenceId = crypto.randomUUID();
        const path = await qualityConditionService.uploadEvidence(
          organizationId, conditionId, evidenceId, file
        );

        const geo = geoRef ? {
          latitude:   geoRef.latitude,
          longitude:  geoRef.longitude,
          accuracy:   geoRef.accuracy,
          capturedAt: new Date().toISOString(),
        } : undefined;

        const buf  = await file.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        const hex  = Array.from(new Uint8Array(hash))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        await supabase.from('condition_evidence').insert({
          id:              evidenceId,
          organization_id: organizationId,
          condition_id:    conditionId,
          type:            file.type.startsWith('image') ? 'photo' : 'document',
          url:             path,
          mime_type:       file.type,
          size_bytes:      file.size,
          geo_ref:         geo,
          captured_at:     new Date().toISOString(),
          captured_by:     currentActor,
          checksum:        hex,
          attached_to:     'condition',
        });
      }

      onCreated(conditionId);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao registrar condição');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Registrar condição</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Localização */}
          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Localização
            </legend>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empreendimento <span className="text-red-500">*</span>
                </label>
                <select
                  value={empreendimentoId}
                  onChange={e => setEmpreendimento(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecionar obra...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {projects.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Nenhuma obra encontrada nesta organização.
                  </p>
                )}
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
            </div>
          </fieldset>

          {/* Classificação */}
          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Classificação (provisional)
            </legend>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sistema</label>
                  <select
                    value={systemCode}
                    onChange={e => setSystemCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecionar...</option>
                    {systems.map(s => (
                      <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patologia</label>
                  <select
                    value={pathologyCode}
                    onChange={e => setPathologyCode(e.target.value)}
                    disabled={!systemCode || pathologies.length === 0}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Selecionar...</option>
                    {pathologies.map(p => (
                      <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
                    ))}
                  </select>
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
            </div>
          </fieldset>

          {/* Evidências */}
          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Evidências <span className="text-red-500">*</span>
            </legend>

            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-6 h-6 text-gray-400 mb-1" />
              <span className="text-sm text-gray-500">Clique para adicionar fotos ou documentos</span>
              <span className="text-xs text-gray-400 mt-0.5">JPG, PNG, PDF — máx. 5 arquivos, 50MB cada</span>
              <input
                type="file"
                multiple
                accept="image/*,video/*,application/pdf"
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
                      className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={handleGeo}
              disabled={captureGeo}
              className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {captureGeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {geoRef
                ? `GPS capturado (±${Math.round(geoRef.accuracy)}m)`
                : captureGeo ? 'Capturando GPS...' : 'Capturar GPS (recomendado)'}
            </button>
          </fieldset>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Registrando...' : 'Registrar condição'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetectConditionModal;
