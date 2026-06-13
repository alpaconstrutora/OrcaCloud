import React from 'react';
import { Plus, Pencil, Trash2, Loader2, Lock, X, Check, AlertTriangle } from 'lucide-react';
import { obraTypeService, ObraType, ObraTypeInsert, COLOR_OPTIONS, colorClasses } from '../services/obraTypeService';

interface Props {
  organizationId: string;
}

// ── Formulário de criação / edição ────────────────────────────────────────────
interface FormState {
  name: string;
  slug: string;
  color: string;
  description: string;
}

const EMPTY_FORM: FormState = { name: '', slug: '', color: 'blue', description: '' };

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

const TypeForm: React.FC<{
  initial?: FormState;
  onSave: (f: FormState) => Promise<void>;
  onCancel: () => void;
}> = ({ initial = EMPTY_FORM, onSave, onCancel }) => {
  const [form, setForm] = React.useState<FormState>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!initial.slug);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const set = (k: keyof FormState, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'name' && !slugTouched) next.slug = slugify(v);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('O nome é obrigatório.'); return; }
    if (!form.slug.trim()) { setError('O slug é obrigatório.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('unique') ? 'Já existe um tipo com esse slug nesta organização.' : msg);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ex: Infraestrutura Urbana"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Slug (identificador) *</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.slug}
            onChange={e => { setSlugTouched(true); set('slug', e.target.value); }}
            placeholder="infraestrutura_urbana"
          />
          <p className="text-xs text-slate-400 mt-0.5">Usado internamente; sem espaços</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Cor</label>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                onClick={() => set('color', c.key)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${colorClasses(c.key).replace(/text-\S+|border-\S+/g, '')} ${form.color === c.key ? 'border-slate-800 scale-125' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Descrição opcional do tipo de obra"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar
        </button>
      </div>
    </form>
  );
};

// ── Modal genérico ─────────────────────────────────────────────────────────────
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="font-black text-slate-900">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ── Badge de tipo ──────────────────────────────────────────────────────────────
const TypeBadge: React.FC<{ type: ObraType }> = ({ type }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses(type.color)}`}>
    {type.name}
  </span>
);

// ── Manager principal ─────────────────────────────────────────────────────────
const ObraTypesManager: React.FC<Props> = ({ organizationId }) => {
  const [types, setTypes] = React.useState<ObraType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [editing, setEditing] = React.useState<ObraType | null>(null);
  const [deleting, setDeleting] = React.useState<ObraType | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      setTypes(await obraTypeService.list(organizationId));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async (form: FormState) => {
    const payload: ObraTypeInsert = {
      organization_id: organizationId,
      name: form.name.trim(),
      slug: form.slug.trim(),
      color: form.color,
      description: form.description.trim() || null as unknown as string,
      sort_order: types.filter(t => !t.is_system).length + 100,
    };
    await obraTypeService.create(payload);
    setShowCreate(false);
    load();
  };

  const handleUpdate = async (form: FormState) => {
    if (!editing) return;
    await obraTypeService.update(editing.id, {
      name: form.name.trim(),
      slug: form.slug.trim(),
      color: form.color,
      description: form.description.trim() || null as unknown as string,
    });
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await obraTypeService.remove(deleting.id);
      setDeleting(null);
      load();
    } finally {
      setDeleteLoading(false);
    }
  };

  const systemTypes = types.filter(t => t.is_system);
  const customTypes  = types.filter(t => !t.is_system);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Tipos de Obra</h1>
            <p className="text-sm text-slate-500 mt-1">
              Gerencie os tipos de obra disponíveis para sua organização.
              Os tipos do sistema não podem ser excluídos.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Tipo
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-4">

            {/* Tipos da organização */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Tipos Personalizados</h2>
                <span className="text-xs text-slate-400">{customTypes.length} tipo{customTypes.length !== 1 ? 's' : ''}</span>
              </div>

              {customTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <p className="text-sm font-semibold">Nenhum tipo personalizado</p>
                  <p className="text-xs mt-1">Clique em "Novo Tipo" para criar</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {customTypes.map(t => (
                    <li key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors">
                      <TypeBadge type={t} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-slate-400 font-mono">{t.slug}</span>
                        {t.description && <p className="text-xs text-slate-500 truncate">{t.description}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(t)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleting(t)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Tipos do sistema */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Tipos do Sistema</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {systemTypes.map(t => (
                  <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                    <TypeBadge type={t} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-400 font-mono">{t.slug}</span>
                    </div>
                    <span className="text-xs text-slate-300 italic">somente leitura</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      {/* Modal — criar */}
      {showCreate && (
        <Modal title="Novo Tipo de Obra" onClose={() => setShowCreate(false)}>
          <TypeForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {/* Modal — editar */}
      {editing && (
        <Modal title="Editar Tipo de Obra" onClose={() => setEditing(null)}>
          <TypeForm
            initial={{ name: editing.name, slug: editing.slug, color: editing.color, description: editing.description ?? '' }}
            onSave={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {/* Modal — confirmar exclusão */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900">Excluir tipo de obra</h3>
                <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              Tem certeza que deseja excluir o tipo <strong>"{deleting.name}"</strong>?
              Obras cadastradas com este tipo não serão afetadas.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleting(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ObraTypesManager;
