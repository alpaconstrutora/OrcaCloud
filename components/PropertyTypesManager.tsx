import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Check, Shield } from 'lucide-react';
import { propertyTypesService, PropertyType } from '../services/propertyTypesService';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { useConfirm } from './ui/confirm';

interface PropertyTypesManagerProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId: string;
    onTypesChanged?: () => void;
}

const PropertyTypesManager: React.FC<PropertyTypesManagerProps> = ({
    isOpen, onClose, organizationId, onTypesChanged,
}) => {
    const [types, setTypes] = useState<PropertyType[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [newCode, setNewCode] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const confirm = useConfirm();

    const load = async () => {
        setLoading(true);
        try {
            setTypes(await propertyTypesService.listTypes());
        } catch {
            setError('Erro ao carregar tipos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (isOpen) { setError(''); load(); } }, [isOpen]);

    const handleCreate = async () => {
        if (!newCode.trim() || !newLabel.trim()) { setError('Preencha o código e a descrição.'); return; }
        setSaving(true); setError('');
        try {
            await propertyTypesService.createType(organizationId, newCode.trim(), newLabel.trim(), types.length + 1);
            setNewCode(''); setNewLabel('');
            await load();
            onTypesChanged?.();
        } catch (err: any) {
            setError(err.message || 'Erro ao criar tipo.');
        } finally { setSaving(false); }
    };

    const handleUpdate = async (id: string) => {
        if (!editLabel.trim()) return;
        setSaving(true);
        try {
            await propertyTypesService.updateType(id, editLabel.trim());
            setEditingId(null);
            await load();
            onTypesChanged?.();
        } catch (err: any) {
            setError(err.message || 'Erro ao atualizar tipo.');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string, label: string) => {
        const ok = await confirm({
            title: `Excluir tipo "${label}"?`,
            message: 'Imóveis existentes com este tipo não serão afetados.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await propertyTypesService.deleteType(id);
            await load();
            onTypesChanged?.();
        } catch (err: any) {
            setError(err.message || 'Erro ao excluir tipo.');
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            {/* Header */}
            <SheetHeader onClose={onClose}>
                <SheetTitle>Tipos de Imóvel</SheetTitle>
                <SheetDescription>Gerencie os tipos disponíveis para cadastro</SheetDescription>
            </SheetHeader>

            {/* Body */}
            <SheetPanel className="p-6 space-y-4">
                    {error && (
                        <div className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-bold">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        {loading ? (
                            <div className="text-center py-8 text-gray-400 font-bold text-sm">Carregando...</div>
                        ) : types.map(t => (
                            <div
                                key={t.id}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                                    t.is_system
                                        ? 'bg-gray-50 border-gray-100'
                                        : 'bg-white border-gray-200 hover:border-blue-200'
                                }`}
                            >
                                {t.is_system && <Shield className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}

                                <div className="flex-1 min-w-0">
                                    {editingId === t.id ? (
                                        <input
                                            value={editLabel}
                                            onChange={e => setEditLabel(e.target.value)}
                                            className="w-full px-3 py-1.5 bg-white border border-blue-400 rounded-lg text-sm font-bold outline-none"
                                            autoFocus
                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id)}
                                        />
                                    ) : (
                                        <>
                                            <p className={`font-bold text-sm ${t.is_system ? 'text-gray-500' : 'text-gray-800'}`}>
                                                {t.label}
                                            </p>
                                            <p className="text-[10px] font-mono text-gray-400">{t.code}</p>
                                        </>
                                    )}
                                </div>

                                {!t.is_system ? (
                                    <div className="flex items-center gap-1">
                                        {editingId === t.id ? (
                                            <button
                                                onClick={() => handleUpdate(t.id)}
                                                disabled={saving}
                                                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingId(t.id); setEditLabel(t.label); setError(''); }}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(t.id, t.label)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Sistema</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Formulário de novo tipo */}
                    <div className="border-t border-gray-100 pt-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Novo Tipo</p>
                        <div className="flex gap-2">
                            <input
                                value={newCode}
                                onChange={e => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                placeholder="CÓDIGO"
                                maxLength={30}
                                className="w-28 px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-mono font-bold text-sm text-gray-700 placeholder-gray-300 transition-all"
                            />
                            <input
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                placeholder="Descrição do tipo"
                                className="flex-1 px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-sm text-gray-700 transition-all"
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
                            <button
                                onClick={handleCreate}
                                disabled={saving || !newCode.trim() || !newLabel.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2">
                            O código é imutável após criação (ex: STUDIO, PENTHOUSE, GALPAO)
                        </p>
                    </div>
            </SheetPanel>
        </Sheet>
    );
};

export default PropertyTypesManager;
