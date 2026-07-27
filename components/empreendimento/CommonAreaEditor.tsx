// components/empreendimento/CommonAreaEditor.tsx
import React from 'react';
import { Plus, Loader2, Trees, AlertCircle } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
  EmpreendimentoCommonArea, CommonAreaCategory, EmpreendimentoCommonAreaInsert,
} from '../../types';

interface Props {
  empreendimentoId: string;
}

const CATEGORY_LABELS: Record<CommonAreaCategory, string> = {
  LAZER: 'Lazer',
  COMUM: 'Comum',
  TECNICA: 'Técnica',
  CIRCULACAO: 'Circulação',
  GARAGEM: 'Garagem',
  OUTRO: 'Outro',
};

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const CATEGORY_TEXT_COLOR: Record<CommonAreaCategory, string> = {
  LAZER: 'text-emerald-600',
  COMUM: 'text-blue-600',
  TECNICA: 'text-amber-600',
  CIRCULACAO: 'text-gray-600',
  GARAGEM: 'text-slate-500',
  OUTRO: 'text-gray-500',
};

export const CommonAreaEditor: React.FC<Props> = ({ empreendimentoId }) => {
  const [areas, setAreas] = React.useState<EmpreendimentoCommonArea[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', category: 'LAZER' as CommonAreaCategory, area: '', floor: '', description: '' });
  const confirm = useConfirm();
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setAreas(await empreendimentoService.listCommonAreas(empreendimentoId));
    } catch (err) {
      console.error('[CommonAreaEditor] erro ao carregar áreas:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { notify('Informe o nome da área comum.', 'error'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoCommonAreaInsert = {
        empreendimento_id: empreendimentoId,
        name: form.name.trim(),
        category: form.category,
        area: form.area ? Number(form.area) : undefined,
        floor: form.floor ? Number(form.floor) : undefined,
        description: form.description || undefined,
        is_vendavel: false,
      };
      await empreendimentoService.createCommonArea(payload);
      setForm({ name: '', category: 'LAZER', area: '', floor: '', description: '' });
      await load();
    } catch (err: any) {
      notify(`Erro ao adicionar área comum: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (area: EmpreendimentoCommonArea) => {
    const ok = await confirm({
      title: `Excluir "${area.name}"?`,
      message: 'Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteCommonArea(area.id);
      setAreas(prev => prev.filter(a => a.id !== area.id));
    } catch (err: any) {
      notify(`Erro ao excluir área: ${err.message}`, 'error');
    }
  };

  const inputCls = 'h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-gray-50/60 border border-gray-100 rounded-[10px] p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <input className={inputCls} placeholder="Nome (ex: Piscina)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <select className={inputCls} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as CommonAreaCategory }))}>
          {(Object.keys(CATEGORY_LABELS) as CommonAreaCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input className={inputCls} placeholder="Área m²" type="number" step="0.01" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} />
        <input className={inputCls} placeholder="Pav." type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
        <input className={inputCls} placeholder="Descrição" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
          Adicionar
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : areas.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Trees className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma área comum cadastrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {areas.map(a => (
            <div key={a.id} className="bg-white rounded-[10px] border border-gray-100 p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-800 text-sm">{a.name}</h4>
                  <span className={`text-sm font-normal ${CATEGORY_TEXT_COLOR[a.category]}`}>{CATEGORY_LABELS[a.category]}</span>
                </div>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  {a.area != null ? `${a.area} m²` : 'sem área'}{a.floor != null ? ` · pav. ${a.floor}` : ''}
                </p>
                {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
              </div>
              <ActionIconButton kind="delete" onClick={() => handleDelete(a)} />
            </div>
          ))}
        </div>
      )}

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default CommonAreaEditor;
