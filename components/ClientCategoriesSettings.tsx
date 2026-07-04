import React from 'react';
import { useStore } from '../store/useStore';
import { clientCategoryService } from '../services/clientCategoryService';
import { ClientCategory } from '../types';
import { Users, Plus, Edit2, Trash2, Check, X, Loader2 } from 'lucide-react';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';

const ClientCategoriesSettings: React.FC = () => {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [categories, setCategories] = React.useState<ClientCategory[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Form states
    const [isAdding, setIsAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

    const loadCategories = React.useCallback(async () => {
        if (!activeOrganizationId) return;
        setLoading(true);
        try {
            const data = await clientCategoryService.list(activeOrganizationId);
            setCategories(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, showToast]);

    React.useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const handleAdd = async () => {
        if (!activeOrganizationId || !editValue.trim()) return;
        try {
            await clientCategoryService.create(activeOrganizationId, editValue.trim());
            showToast('Categoria criada com sucesso', 'success');
            setEditValue('');
            setIsAdding(false);
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editValue.trim()) return;
        try {
            await clientCategoryService.update(id, editValue.trim());
            showToast('Categoria atualizada com sucesso', 'success');
            setEditingId(null);
            setEditValue('');
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir categoria?', message: 'Tem certeza que deseja excluir esta categoria?', variant: 'danger' })) return;
        try {
            await clientCategoryService.delete(id);
            showToast('Categoria excluída', 'success');
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const startEdit = (cat: ClientCategory) => {
        setEditingId(cat.id);
        setEditValue(cat.name);
        setIsAdding(false);
    };

    const startAdd = () => {
        setIsAdding(true);
        setEditingId(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setEditingId(null);
        setEditValue('');
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tipos de Clientes</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie as categorias de clientes usadas na sua organização (ex: Condomínio, Locação, etc).</p>
                    </div>
                </div>
                {!isAdding && !editingId && (
                    <Button onClick={startAdd} className="gap-2 shrink-0 text-sm">
                        <Plus className="w-4 h-4" /> Nova Categoria
                    </Button>
                )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                {loading ? (
                    <div className="flex items-center justify-center p-8 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {isAdding && (
                            <li className="flex items-center gap-2 p-2 border border-blue-200 rounded-lg bg-blue-50/50">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    placeholder="Nome da categoria..."
                                    className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                />
                                <button onClick={handleAdd} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                            </li>
                        )}
                        {categories.map(cat => (
                            <li key={cat.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-gray-50/50">
                                {editingId === cat.id ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)}
                                        />
                                        <button onClick={() => handleUpdate(cat.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                            <button onClick={() => startEdit(cat)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                        {!isAdding && categories.length === 0 && (
                            <li className="text-center p-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                Nenhuma categoria cadastrada.
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ClientCategoriesSettings;
