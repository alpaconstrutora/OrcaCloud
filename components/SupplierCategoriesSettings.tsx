import React from 'react';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { SupplierCategory } from '../types';
import { Tag, Plus, Check, X, Search, AlertCircle, Download } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import { useToast } from '../hooks/useToast';
import { DEFAULT_SUPPLIER_CATEGORIES } from '../constants/supplierCategories';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

const isDefaultCategory = (cat: SupplierCategory) => !cat.organization_id || cat.id.startsWith('default-');

const CATEGORY_COLUMNS: ColumnConfig[] = [
    { key: 'name',    label: 'Nome', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const SupplierCategoriesSettings: React.FC = () => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const orgId = activeOrganizationId ?? undefined;
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [categories, setCategories] = React.useState<SupplierCategory[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Form states
    const [isAdding, setIsAdding] = React.useState(false);
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

    const [searchTerm, setSearchTerm] = usePersistedState<string>('supplierCategories:search', '');
    const tableColumns = useTableColumns(CATEGORY_COLUMNS, 'supplierCategoriesColumns');

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
        if (!createOrgId) { showToast('Selecione uma organização para criar uma categoria.', 'error'); return; }
        try {
            await supplierCategoryService.createCategory({
                name: editValue.trim(),
                organization_id: createOrgId
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
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const targetOrgId = target.orgId;
        try {
            await supplierCategoryService.createCategory({
                name: `${category.name} (Cópia)`,
                organization_id: targetOrgId
            });
            showToast('Categoria duplicada com sucesso', 'success');
            loadCategories();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleImportDefaults = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const targetOrgId = target.orgId;
        if (!await confirm({ title: 'Importar Categorias Padrão', message: 'Deseja importar as categorias padrão do sistema para poder editá-las?' })) return;
        setLoading(true);
        try {
            const categoriesToImport = DEFAULT_SUPPLIER_CATEGORIES.map(name => ({
                name,
                organization_id: targetOrgId
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

    const startAdd = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const targetOrgId = target.orgId;
        setCreateOrgId(targetOrgId);
        setIsAdding(true);
        setEditingId(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setEditingId(null);
        setEditValue('');
    };

    const filteredCategories = categories
        .filter(cat => cat.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (tableColumns.sortColumn === 'name') {
                return tableColumns.sortDirection === 'asc'
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            }
            return a.name.localeCompare(b.name); // default sem seleção: nome A-Z
        });

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-[10px]">
                        <Tag className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Categorias de Fornecedores</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos e especialidades de seus fornecedores.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!loading && categories.some(isDefaultCategory) && (
                        <button onClick={handleImportDefaults} className="hidden sm:flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
                            <Download className="w-4 h-4" /> Importar Padrões
                        </button>
                    )}
                    {!isAdding && !editingId && (
                        <button
                            onClick={startAdd}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Nova categoria
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                {isAdding && (
                    <div className="flex items-center gap-2 p-2 mb-3 border border-indigo-200 rounded-[10px] bg-indigo-50/50">
                        <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder="Nome da categoria..."
                            className="flex-1 h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <button onClick={handleAdd} className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors"><Check className="w-5 h-5" /></button>
                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                )}

                {/* Toolbar acoplada à tabela (§5.2) — mesmo padrão de ClientCategoriesSettings.tsx */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar categoria..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={CATEGORY_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={tableColumns.visibleColumns}
                                    showColumnConfig={tableColumns.showColumnConfig}
                                    onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                    onToggleColumn={tableColumns.toggleColumn}
                                    onReset={tableColumns.resetColumns}
                                />
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="text-center py-12">
                            <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma categoria encontrada</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre uma nova categoria.</p>
                            {!searchTerm && (
                                <div className="mt-4 flex justify-center">
                                    <button onClick={handleImportDefaults} className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all mx-auto">
                                        <Download className="w-4 h-4" /> Importar Padrões
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader
                                            colKey="name"
                                            label="Nome"
                                            uppercase={false}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredCategories.map(cat => (
                                    <tr key={cat.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {editingId === cat.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            className="flex-1 h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)}
                                                        />
                                                        <button onClick={() => handleUpdate(cat.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors"><Check className="w-4 h-4" /></button>
                                                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors"><X className="w-4 h-4" /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        {cat.name}
                                                        {isDefaultCategory(cat) && (
                                                            <span className="text-xs font-normal text-gray-400">
                                                                Global
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    {isDefaultCategory(cat) ? (
                                                        <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(cat)} />
                                                    ) : (
                                                        <>
                                                            <ActionIconButton kind="edit" onClick={() => startEdit(cat)} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDelete(cat.id)} />
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
};

export default SupplierCategoriesSettings;
