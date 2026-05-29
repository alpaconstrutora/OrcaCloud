import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { servicesCommercialService, ServiceBudget, ServiceBudgetItem } from '../../services/servicesCommercialService';

interface Props {
  opportunityId: string;
  organizationId: string;
  onBack: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const ServicesBudget: React.FC<Props> = ({ opportunityId, organizationId, onBack }) => {
  const [budget, setBudget] = useState<ServiceBudget | null>(null);
  const [items, setItems] = useState<Partial<ServiceBudgetItem>[]>([]);
  const [marginPct, setMarginPct] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const b = await servicesCommercialService.getBudget(opportunityId);
    if (b) {
      setBudget(b);
      setItems(b.items ?? []);
      setMarginPct(b.margin_pct);
      setNotes(b.notes ?? '');
    } else {
      setItems([{ description: '', unit: 'un', quantity: 1, unit_price: 0, position: 0 }]);
    }
  }, [opportunityId]);

  useEffect(() => { load(); }, [load]);

  const addItem = () =>
    setItems(prev => [...prev, { description: '', unit: 'un', quantity: 1, unit_price: 0, position: prev.length }]);

  const removeItem = async (idx: number) => {
    const item = items[idx];
    if (item.id) await servicesCommercialService.deleteBudgetItem(item.id);
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: string | number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const subtotal = items.reduce((acc, it) => acc + ((it.quantity ?? 0) * (it.unit_price ?? 0)), 0);
  const total = subtotal * (1 + (marginPct / 100));

  const save = async () => {
    setSaving(true);
    try {
      const b = await servicesCommercialService.upsertBudget({
        id: budget?.id,
        opportunity_id: opportunityId,
        organization_id: organizationId,
        subtotal,
        margin_pct: marginPct,
        total,
        notes: notes || null,
      } as Parameters<typeof servicesCommercialService.upsertBudget>[0]);
      setBudget(b);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.description?.trim()) continue;
        const saved = await servicesCommercialService.upsertBudgetItem({
          id: it.id,
          budget_id: b.id,
          organization_id: organizationId,
          position: i,
          description: it.description!,
          unit: it.unit ?? 'un',
          quantity: Number(it.quantity ?? 0),
          unit_price: Number(it.unit_price ?? 0),
        });
        setItems(prev => prev.map((item, idx) => idx === i ? { ...item, ...saved } : item));
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Orçamento</h2>
      </div>

      {/* Itens */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_80px_100px_36px] gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span>Descrição</span><span>Unid.</span><span>Qtd.</span><span>Valor unit.</span><span />
        </div>

        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_70px_80px_100px_36px] gap-2 px-4 py-2 border-t border-gray-50 dark:border-gray-700/50 items-center">
            <input className={INPUT} value={it.description ?? ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Descrição do item" />
            <input className={INPUT} value={it.unit ?? 'un'} onChange={e => updateItem(idx, 'unit', e.target.value)} />
            <input className={INPUT} type="number" min="0" value={it.quantity ?? ''} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
            <input className={INPUT} type="number" min="0" step="0.01" value={it.unit_price ?? ''} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} />
            <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400 flex justify-center">
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <Plus size={15} /> Adicionar item
          </button>
        </div>
      </div>

      {/* Totais */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-medium text-gray-900 dark:text-white">{fmt(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">Margem (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className="w-24 text-right rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
            value={marginPct}
            onChange={e => setMarginPct(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Total</span>
          <span className="text-lg font-bold text-green-600 dark:text-green-400">{fmt(total)}</span>
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações</label>
        <textarea
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Salvando...' : 'Salvar orçamento'}
      </button>
    </div>
  );
};

export default ServicesBudget;
