import React from 'react';
import { X, Tag, Plus, Edit2, Trash2, Copy, Save } from 'lucide-react';
import { SupplierCategory } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';

const DEFAULT_CATEGORIES = [
    'Materiais de Construção',
    'Mão de Obra / Serviços',
    'Equipamentos / Ferramentas',
    'Consultoria / Projetos',
    'Transporte / Logística',
    'Outros'
];

interface SupplierCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId?: string;
}

export const SupplierCategoryModal: React.FC<SupplierCategoryModalProps> = ({ isOpen, onClose, organizationId }) => {
    const [categories, setCategories] = React.useState<SupplierCategory[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isAdding, setIsAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState({ name: '' });

    const loadCategories = async () => {
        setIsLoading(true);
        try {
            const data = await supplierCategoryService.listCategories(organizationId);
            setCategories(data);
        } catch (error) {
            console.error("Error loading categories:", error);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        if (isOpen) {
            loadCategories();
        }
    }, [isOpen, organizationId]);

    const handleSave = async (id?: string) => {
        if (!formData.name.trim()) return;
        try {
            if (id) {
                await supplierCategoryService.updateCategory(id, { name: formData.name }, organizationId);
            } else {
                await supplierCategoryService.createCategory({
                    name: formData.name,
                    organization_id: organizationId
                });
            }
            setIsAdding(false);
            setEditingId(null);
            setFormData({ name: '' });
            loadCategories();
        } catch (error: any) {
            console.error("Error saving category:", error);
            const msg = error.message || "Verifique se a tabela 'supplier_categories' existe no banco de dados.";
            alert(`Erro ao salvar categoria: ${msg}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;
        try {
            await supplierCategoryService.deleteCategory(id, organizationId);
            loadCategories();
        } catch (error) {
            console.error("Error deleting category:", error);
            alert("Erro ao excluir categoria.");
        }
    };

    const handleDuplicate = async (category: SupplierCategory) => {
        try {
            await supplierCategoryService.createCategory({
                name: `${category.name} (Cópia)`,
                organization_id: organizationId
            });
            loadCategories();
        } catch (error) {
            console.error("Error duplicating category:", error);
            alert("Erro ao duplicar categoria.");
        }
    };

    const handleImportDefaults = async () => {
        if (!confirm("Deseja importar as categorias padrão do sistema para poder editá-las?")) return;
        setIsLoading(true);
        try {
            const categoriesToImport = DEFAULT_CATEGORIES.map(name => ({
                name,
                organization_id: organizationId
            }));
            await supplierCategoryService.createCategories(categoriesToImport);
            loadCategories();
        } catch (error) {
            console.error("Error importing default categories:", error);
            alert("Erro ao importar categorias. Verifique se a tabela 'supplier_categories' existe.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-12">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="flex justify-between items-center px-10 py-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 rounded-2xl text-blue-600 shadow-sm shadow-blue-100">
                            <Tag className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 leading-none">Categorias de Fornecedores</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Gerencie as categorias disponíveis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-md border border-transparent hover:border-gray-100 rounded-full transition-all">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lista de Categorias</h3>
                        {!isAdding && (
                            <button
                                onClick={() => { setIsAdding(true); setEditingId(null); setFormData({ name: '' }); }}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-200"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {isAdding && !editingId && (
                            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200 flex gap-3 animate-in fade-in slide-in-from-top-4">
                                <input
                                    autoFocus
                                    className="flex-1 rounded-xl border border-blue-200 p-3 outline-none focus:ring-4 focus:ring-blue-500/10 font-medium text-sm"
                                    placeholder="Nome da categoria..."
                                    value={formData.name}
                                    onChange={e => setFormData({ name: e.target.value })}
                                />
                                <button onClick={() => handleSave()} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">
                                    <Save className="w-5 h-5" />
                                </button>
                                <button onClick={() => setIsAdding(false)} className="p-3 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {categories.map(category => (
                            <div key={category.id} className="group p-4 bg-white border border-gray-100 rounded-2xl flex items-center justify-between hover:border-blue-200 hover:shadow-sm transition-all">
                                {editingId === category.id ? (
                                    <div className="flex-1 flex gap-3">
                                        <input
                                            autoFocus
                                            className="flex-1 rounded-xl border border-blue-200 p-2 outline-none focus:ring-4 focus:ring-blue-500/10 font-medium text-sm"
                                            value={formData.name}
                                            onChange={e => setFormData({ name: e.target.value })}
                                        />
                                        <button onClick={() => handleSave(category.id)} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">
                                            <Save className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-all">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                                                <Tag className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-gray-700">{category.name}</span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditingId(category.id); setFormData({ name: category.name }); setIsAdding(false); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDuplicate(category)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Duplicar">
                                                <Copy className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(category.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Excluir">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        {categories.length === 0 && !isLoading && !isAdding && (
                            <div className="text-center py-10 space-y-4">
                                <p className="opacity-50 italic">Nenhuma categoria personalizada encontrada.</p>
                                <button
                                    onClick={handleImportDefaults}
                                    className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 font-bold text-xs uppercase tracking-widest transition-all"
                                >
                                    Carregar Categorias Padrão
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
