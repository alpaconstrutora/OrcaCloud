import React, { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import {
  servicesCommercialService,
  PipelineStageConfig,
  OpportunityStage,
} from '../../services/servicesCommercialService';
import Button from '../ui/Button';

// Estágios canônicos (motor) + rótulo/cor padrão. A engrenagem só personaliza
// apresentação por organização — não cria nem remove estágios.
const CANONICAL: { stage: OpportunityStage; label: string; color: string; position: number }[] = [
  { stage: 'lead',     label: 'Lead',            color: '#6b7280', position: 0 },
  { stage: 'visit',    label: 'Visita',          color: '#3b82f6', position: 1 },
  { stage: 'budget',   label: 'Orçamento',       color: '#eab308', position: 2 },
  { stage: 'proposal', label: 'Proposta enviada', color: '#a855f7', position: 3 },
  { stage: 'won',      label: 'Ganho',           color: '#22c55e', position: 4 },
  { stage: 'lost',     label: 'Perdido',         color: '#f87171', position: 5 },
];

interface RowState {
  stage: OpportunityStage;
  label: string;
  color: string;
  position: number;
  sub_statuses: string[];
}

interface Props {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}

const ServicesPipelineConfigModal: React.FC<Props> = ({ organizationId, onClose, onSaved }) => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    servicesCommercialService.listStageConfig(organizationId)
      .then((cfg: PipelineStageConfig[]) => {
        const byStage = new Map(cfg.map(c => [c.stage, c]));
        setRows(CANONICAL.map(c => {
          const existing = byStage.get(c.stage);
          return {
            stage: c.stage,
            label: existing?.label ?? c.label,
            color: existing?.color ?? c.color,
            position: existing?.position ?? c.position,
            sub_statuses: existing?.sub_statuses ?? [],
          };
        }));
      })
      .catch(() => setRows(CANONICAL.map(c => ({ ...c, sub_statuses: [] }))))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const updateRow = (stage: OpportunityStage, patch: Partial<RowState>) =>
    setRows(rs => rs.map(r => r.stage === stage ? { ...r, ...patch } : r));

  const addSubStatus = (stage: OpportunityStage) =>
    updateRow(stage, { sub_statuses: [...(rows.find(r => r.stage === stage)?.sub_statuses ?? []), ''] });

  const setSubStatus = (stage: OpportunityStage, idx: number, value: string) => {
    const list = [...(rows.find(r => r.stage === stage)?.sub_statuses ?? [])];
    list[idx] = value;
    updateRow(stage, { sub_statuses: list });
  };

  const removeSubStatus = (stage: OpportunityStage, idx: number) => {
    const list = (rows.find(r => r.stage === stage)?.sub_statuses ?? []).filter((_, i) => i !== idx);
    updateRow(stage, { sub_statuses: list });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const r of rows) {
        await servicesCommercialService.upsertStageConfig({
          organization_id: organizationId,
          stage: r.stage,
          label: r.label.trim() || r.stage,
          color: r.color,
          position: r.position,
          sub_statuses: r.sub_statuses.map(s => s.trim()).filter(Boolean),
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Configurar funil</h3>
            <p className="text-xs text-gray-400">Personalize rótulo, cor e etapas de cada estágio</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando…</p>
          ) : rows.map(r => (
            <div key={r.stage} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={r.color}
                  onChange={e => updateRow(r.stage, { color: e.target.value })}
                  className="w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer bg-transparent p-0.5"
                  title="Cor do estágio"
                />
                <input
                  value={r.label}
                  onChange={e => updateRow(r.stage, { label: e.target.value })}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs uppercase tracking-wider text-gray-300 font-bold w-16 text-right">{r.stage}</span>
              </div>

              {/* Sub-status presets */}
              <div className="pl-10 space-y-1.5">
                {r.sub_statuses.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                    <input
                      value={s}
                      onChange={e => setSubStatus(r.stage, idx, e.target.value)}
                      placeholder="Ex: 1º contato, Em análise…"
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1 text-form-input text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <ActionIconButton kind="delete" size="sm" onClick={() => removeSubStatus(r.stage, idx)} />
                  </div>
                ))}
                <button
                  onClick={() => addSubStatus(r.stage)}
                  className="flex items-center gap-1 text-button text-blue-600 hover:underline"
                >
                  <Plus size={12} /> Adicionar etapa
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900">Cancelar</button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ServicesPipelineConfigModal;
