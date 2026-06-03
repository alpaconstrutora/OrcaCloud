import React from 'react';
import { X, Plus, Edit3, Copy, Trash2, Save, ClipboardList, Loader2 } from 'lucide-react';
import { contractScopeService, ContractScopeTemplate } from '../services/contractScopeService';

interface Props {
    organizationId: string;
    onClose: () => void;
    onSelect?: (scope: ContractScopeTemplate) => void;
    mode: 'manage' | 'pick';
}

const ContractScopeManager: React.FC<Props> = ({ organizationId, onClose, onSelect, mode }) => {
    const [scopes, setScopes] = React.useState<ContractScopeTemplate[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editing, setEditing] = React.useState<ContractScopeTemplate | null>(null);
    const [isNew, setIsNew] = React.useState(false);
    const [form, setForm] = React.useState({ name: '', content: '' });
    const [saving, setSaving] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try { setScopes(await contractScopeService.list(organizationId)); }
        finally { setLoading(false); }
    };

    React.useEffect(() => { load(); }, [organizationId]);

    const startNew = () => { setIsNew(true); setEditing(null); setForm({ name: '', content: '' }); };
    const startEdit = (s: ContractScopeTemplate) => { setEditing(s); setIsNew(false); setForm({ name: s.name, content: s.content }); };
    const cancelForm = () => { setEditing(null); setIsNew(false); setForm({ name: '', content: '' }); };

    const handleSave = async () => {
        if (!form.name.trim() || !form.content.trim()) return;
        setSaving(true);
        try {
            if (isNew) {
                await contractScopeService.create({ organization_id: organizationId, name: form.name.trim(), content: form.content.trim() });
            } else if (editing) {
                await contractScopeService.update(editing.id, { name: form.name.trim(), content: form.content.trim() });
            }
            cancelForm();
            await load();
        } finally { setSaving(false); }
    };

    const handleDuplicate = async (id: string) => {
        try { await contractScopeService.duplicate(id); await load(); } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await contractScopeService.remove(id); await load(); } finally { setDeletingId(null); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="bg-[#0B1727] px-8 py-6 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-medium tracking-tight">
                                {mode === 'pick' ? 'Buscar Escopo Salvo' : 'Gerenciar Escopos'}
                            </h2>
                            <p className="text-blue-400 text-[11px] uppercase tracking-widest">Modelos de Escopo Contratual</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all hover:rotate-90 duration-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Form (manage mode) */}
                    {mode === 'manage' && (isNew || editing) && (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                                {isNew ? 'Novo Escopo' : `Editando: ${editing?.name}`}
                            </p>
                            <input
                                type="text"
                                placeholder="Nome do escopo (ex: Reforma Completa, Instalação Elétrica) *"
                                value={form.name}
                                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <textarea
                                rows={6}
                                placeholder="Conteúdo do escopo — descreva os serviços contratados *"
                                value={form.content}
                                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                                className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                            />
                            <div className="flex gap-2">
                                <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold uppercase tracking-wider disabled:opacity-50 hover:bg-blue-700 transition-colors">
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {saving ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button onClick={cancelForm} className="px-5 py-2.5 bg-white text-gray-500 border border-gray-200 rounded-xl text-[12px] font-medium hover:bg-gray-50 transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Toolbar (manage mode) */}
                    {mode === 'manage' && !isNew && !editing && (
                        <button onClick={startNew}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-[12px] font-semibold uppercase tracking-wider hover:bg-blue-600 transition-colors">
                            <Plus className="w-4 h-4" /> Novo Escopo
                        </button>
                    )}

                    {/* List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                        </div>
                    ) : scopes.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                            <ClipboardList className="w-10 h-10 opacity-30" />
                            <p className="text-sm">Nenhum escopo salvo.</p>
                            {mode === 'manage' && <button onClick={startNew} className="text-sm text-blue-600 font-medium hover:underline">Criar o primeiro</button>}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {scopes.map(s => (
                                <div key={s.id}
                                    className={`bg-gray-50 border rounded-2xl p-5 transition-all ${mode === 'pick' ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/40' : 'border-gray-100'}`}
                                    onClick={mode === 'pick' ? () => { onSelect?.(s); onClose(); } : undefined}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-2 whitespace-pre-line">{s.content}</p>
                                        </div>
                                        {mode === 'manage' && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={e => { e.stopPropagation(); startEdit(s); }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDuplicate(s.id); }}
                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Duplicar">
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} disabled={deletingId === s.id}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50" title="Excluir">
                                                    {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        )}
                                        {mode === 'pick' && (
                                            <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider shrink-0">Usar →</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContractScopeManager;
