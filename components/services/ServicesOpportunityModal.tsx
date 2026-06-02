import React, { useState } from 'react';
import { X } from 'lucide-react';
import { servicesCommercialService, ServiceOpportunity, Priority } from '../../services/servicesCommercialService';

interface Props {
  organizationId: string;
  initial?: Partial<ServiceOpportunity>;
  onClose: () => void;
  onSaved: (opp: ServiceOpportunity) => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

const ServicesOpportunityModal: React.FC<Props> = ({ organizationId, initial, onClose, onSaved }) => {
  const [form, setForm] = useState({
    contact_name: initial?.contact_name ?? '',
    contact_phone: initial?.contact_phone ?? '',
    contact_email: initial?.contact_email ?? '',
    contact_whatsapp: initial?.contact_whatsapp ?? '',
    city: initial?.city ?? '',
    work_type: initial?.work_type ?? '',
    estimated_area: initial?.estimated_area?.toString() ?? '',
    estimated_value: initial?.estimated_value?.toString() ?? '',
    scope_summary: initial?.scope_summary ?? '',
    origin_channel: initial?.origin_channel ?? '',
    priority: (initial?.priority ?? 'medium') as Priority,
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_name.trim()) { setError('Nome do contato obrigatório'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        organization_id: organizationId,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        contact_whatsapp: form.contact_whatsapp || null,
        city: form.city || null,
        work_type: form.work_type || null,
        estimated_area: form.estimated_area ? Number(form.estimated_area) : null,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
        scope_summary: form.scope_summary || null,
        origin_channel: form.origin_channel || null,
        priority: form.priority,
        stage: 'lead' as const,
        assigned_to: null,
        lost_reason: null,
        notes: form.notes || null,
        rich_contract_id: null,
      };
      const saved = initial?.id
        ? await servicesCommercialService.updateOpportunity(initial.id, payload)
        : await servicesCommercialService.createOpportunity(payload);
      onSaved(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {initial?.id ? 'Editar oportunidade' : 'Novo lead'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <form id="services-opportunity-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={LABEL}>Nome do contato *</label>
              <input className={INPUT} value={form.contact_name} onChange={set('contact_name')} required />
            </div>
            <div>
              <label className={LABEL}>Telefone</label>
              <input className={INPUT} value={form.contact_phone} onChange={set('contact_phone')} />
            </div>
            <div>
              <label className={LABEL}>WhatsApp</label>
              <input className={INPUT} value={form.contact_whatsapp} onChange={set('contact_whatsapp')} />
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input className={INPUT} type="email" value={form.contact_email} onChange={set('contact_email')} />
            </div>
            <div>
              <label className={LABEL}>Cidade</label>
              <input className={INPUT} value={form.city} onChange={set('city')} />
            </div>
            <div>
              <label className={LABEL}>Tipo de obra</label>
              <input className={INPUT} placeholder="Ex: Reforma, Construção..." value={form.work_type} onChange={set('work_type')} />
            </div>
            <div>
              <label className={LABEL}>Área estimada (m²)</label>
              <input className={INPUT} type="number" min="0" value={form.estimated_area} onChange={set('estimated_area')} />
            </div>
            <div>
              <label className={LABEL}>Valor estimado (R$)</label>
              <input className={INPUT} type="number" min="0" value={form.estimated_value} onChange={set('estimated_value')} />
            </div>
            <div>
              <label className={LABEL}>Prioridade</label>
              <select className={INPUT} value={form.priority} onChange={set('priority')}>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Origem</label>
              <input className={INPUT} placeholder="WhatsApp, indicação..." value={form.origin_channel} onChange={set('origin_channel')} />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Escopo resumido</label>
              <textarea className={INPUT} rows={2} value={form.scope_summary} onChange={set('scope_summary')} />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Observações internas</label>
              <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900">Cancelar</button>
          <button
            type="submit"
            form="services-opportunity-form"
            disabled={saving}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServicesOpportunityModal;
