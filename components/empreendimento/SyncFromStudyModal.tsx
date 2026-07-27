// components/empreendimento/SyncFromStudyModal.tsx
import React from 'react';
import { X, Loader2, RefreshCw, AlertTriangle, Building, Layers, Trees, ShieldCheck } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import { EmpreendimentoSyncReport } from '../../types';

interface Props {
  empreendimentoId: string;
  onClose: () => void;
  onSynced: () => void;
}

export const SyncFromStudyModal: React.FC<Props> = ({ empreendimentoId, onClose, onSynced }) => {
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<EmpreendimentoSyncReport | null>(null);
  const [overwrite, setOverwrite] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    empreendimentoService.previewSync(empreendimentoId)
      .then(r => { if (active) setReport(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [empreendimentoId]);

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      await empreendimentoService.syncFromStudy(empreendimentoId, { overwriteCommercialState: overwrite });
      onSynced();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const hasOrphans = !!report && (report.orphanTowers.length > 0 || report.orphanUnits.length > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-[10px]">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-violet-600" /> Sincronizar do Estudo
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
              <p className="text-sm font-medium text-gray-400">Analisando estudo...</p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-[10px] p-4 text-sm font-medium flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" /> {error}
            </div>
          ) : report ? (
            <>
              <p className="text-sm text-gray-500">
                Esta prévia mostra o que será importado do estudo de viabilidade vinculado. Nada é alterado até você confirmar.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Stat icon={Building} label="Torres a criar" value={report.towersCreated} />
                <Stat icon={Building} label="Torres a atualizar" value={report.towersUpdated} />
                <Stat icon={Layers} label="Unidades a criar" value={report.unitsCreated} />
                <Stat icon={Layers} label="Unidades a atualizar" value={report.unitsUpdated} />
                <Stat icon={Trees} label="Áreas comuns novas" value={report.commonAreasUpserted} />
                <Stat icon={ShieldCheck} label="Estado comercial preservado" value={report.skippedDueToLocalChanges.length} />
              </div>

              {report.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-[10px] p-4 space-y-1.5">
                  {report.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 font-medium flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                    </p>
                  ))}
                </div>
              )}

              {hasOrphans && (
                <div className="bg-orange-50 border border-orange-100 rounded-[10px] p-4 text-xs text-orange-700 font-medium">
                  <p className="font-semibold text-orange-700 mb-1">Itens órfãos (mantidos)</p>
                  <p>
                    {report.orphanTowers.length} torre(s) e {report.orphanUnits.length} unidade(s) não existem mais no estudo.
                    Elas <strong>não</strong> serão removidas automaticamente — exclua manualmente se desejar.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="w-4 h-4" />
                Sobrescrever também status e preço das unidades (descarta alterações comerciais locais)
              </label>
            </>
          ) : null}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3 rounded-b-[10px]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            disabled={loading || applying || !!error || !report}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
            Sincronizar
          </button>
        </div>
      </div>
    </div>
  );
};

// Stat = mini-KPI dentro do modal — label mantém uppercase (mesmo padrão do
// KpiCard "md" em ui_ux_guia_unificado.md §4.3, não é o estilo "gritado" do §21).
const Stat: React.FC<{ icon: any; label: string; value: number }> = ({ icon: Icon, label, value }) => (
  <div className="bg-gray-50/60 border border-gray-100 rounded-[10px] p-4 flex items-center gap-3">
    <div className="p-2 bg-white rounded-[6px] text-violet-600 border border-gray-100"><Icon className="w-4 h-4" /></div>
    <div>
      <span className="text-xl font-black text-gray-800">{value}</span>
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block leading-tight">{label}</span>
    </div>
  </div>
);

export default SyncFromStudyModal;
