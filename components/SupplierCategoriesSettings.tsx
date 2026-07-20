import React from 'react';
import { useStore } from '../store/useStore';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { SupplierCategory } from '../types';
import { Tag, Plus, Check, X, Loader2, Copy, Download, AlertCircle } from 'lucide-react';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { DEFAULT_SUPPLIER_CATEGORIES } from '../constants/supplierCategories';

const SupplierCategoriesSettings: React.FC = () => {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const organizations = useStore(state => state.organizations);
    const orgId = activeOrganizationId ?? undefined;
    // Em "Todas as organizações": com UMA só organização, ela é o alvo de
    // criação/importação; com várias, o alvo é ambíguo e precisa ser escolhido.
    const effectiveOrganizationId = activeOrganizationId ?? (organizations.length === 1 ? organizations[0].id : undefined);
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();

    const [categories, setCategories] = React.useState<SupplierCategory[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Form states
    const [isAdding, setIsAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

    const loadCategories = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await supplierCategoryService.listCategories(orgId);
            setCategories(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const handleAdd = async () => {
        if (!editValue.trim()) return;
        if (!effectiveOrganizationId) { showToast('Selecione uma organização para criar uma categoria.', 'error'); return; }
        try {
            await supplierCategoryService.createCategory({
                name: editValue.trim(),
                organization_id: effectiveOrganizationId
            });
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
            await supplierCategoryService.updateCategory(id, { name: editValue.trim() }, orgId);
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
            await supplierCategoryService.deleteCategory(id, orgId);
            showToast('Categoria excluída', 'success');
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (category: SupplierCategory) => {
        if (!effectiveOrganizationId) { showToast('Selecione uma organização para duplicar.', 'error'); return; }
        try {
            await supplierCategoryService.createCategory({
                name: `${category.name} (Cópia)`,
                organization_id: effectiveOrganizationId
            });
            showToast('Categoria duplicada com sucesso', 'success');
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleImportDefaults = async () => {
        if (!await confirm({ title: 'Importar Categorias Padrão', message: 'Deseja importar as categorias padrão do sistema para poder editá-las?' })) return;
        setLoading(true);
        try {
            const categoriesToImport = DEFAULT_SUPPLIER_CATEGORIES.map(name => ({
                name,
                organization_id: effectiveOrganizationId
            }));
            await supplierCategoryService.createCategories(categoriesToImport);
            showToast('Categorias padrão importadas com sucesso', 'success');
            loadCategories();
        } catch (error: any) {
            showToast(error.message || 'Erro ao importar categorias padrão', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (cat: SupplierCategory) => {
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                        <Tag className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Categorias de Fornecedores</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos e especialidades de seus fornecedores.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {categories.length === 0 && !loading && (
                        <Button onClick={handleImportDefaults} variant="secondary" className="gap-2 shrink-0 text-sm hidden sm:flex">
                            <Download className="w-4 h-4" /> Importar Padrões
                        </Button>
                    )}
                    {!isAdding && !editingId && (
                        <Button
                            onClick={startAdd}
                            disabled={!effectiveOrganizationId}
                            title={!effectiveOrganizationId ? 'Selecione uma organização específica para criar uma categoria.' : undefined}
                            className="gap-2 shrink-0 text-sm bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" /> Nova Categoria
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                {loading ? (
                    <div className="flex items-center justify-center p-8 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {isAdding && (
                            <li className="flex items-center gap-2 p-2 border border-indigo-200 rounded-lg bg-indigo-50/50">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    placeholder="Nome da categoria..."
                                    className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                />
                                <button onClick={handleAdd} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                            </li>
                        )}
                        {categories.map(cat => (
                            <li key={cat.id} className="group flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-gray-50/50">
                                {editingId === cat.id ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)}
                                        />
                                        <button onClick={() => handleUpdate(cat.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                                            {(!cat.organization_id || cat.id.startsWith('default-')) && (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 ml-2">
                                                    Global
                                                </span>
                                            )}
                                        </div>
                                        {(!cat.organization_id || cat.id.startsWith('default-')) ? (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <button onClick={() => handleDuplicate(cat)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Duplicar">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <ActionIconButton kind="edit" onClick={() => startEdit(cat)} />
                                                <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(cat)} />
                                                <ActionIconButton kind="delete" onClick={() => handleDelete(cat.id)} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        ))}
                        {!isAdding && categories.length === 0 && (
                            <li className="text-center p-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                Nenhuma categoria cadastrada.
                                <div className="mt-4 flex justify-center">
                                    <Button onClick={handleImportDefaults} variant="secondary" className="gap-2 text-sm">
                                        <Download className="w-4 h-4" /> Importar Padrões
                                    </Button>
                                </div>
                            </li>
                        )}
                    </ul>
                )}
            </div>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default SupplierCategoriesSettings;
