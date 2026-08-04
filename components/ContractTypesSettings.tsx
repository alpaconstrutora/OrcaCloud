import React from 'react';
import { contractTypeService } from '../services/contractTypeService';
import { ContractTypeRecord } from '../types';
import { FileText, Plus, Check, X, Search, AlertCircle, Download } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, type WriteTarget } from '../hooks/useOrgContext';
import { useToast } from '../hooks/useToast';
import { ContractTypeCategory } from '../constants/contractTypes';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

const CATEGORIES: ContractTypeCategory[] = ['Serviços', 'Suprimentos', 'Geral'];

const isDefault = (type: ContractTypeRecord) => !type.organization_id || type.id.startsWith('default-');

const TYPE_COLUMNS: ColumnConfig[] = [
    { key: 'name',     label: 'Nome',      sortable: true },
    { key: 'category', label: 'Categoria', sortable: true },
    { key: 'actions',  label: 'Ações',     sortable: false },
];

const ContractTypesSettings: React.FC = () => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const orgId = activeOrganizationId ?? undefined;
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [types, setTypes] = React.useState<ContractTypeRecord[]>([]);
    const [loading, setLoading] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState(false);
    const [createTarget, setCreateTarget] = React.useState<WriteTarget | null>(null);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editCategory, setEditCategory] = React.useState<ContractTypeCategory>('Geral');

    const [searchTerm, setSearchTerm] = usePersistedState<string>('contractTypes:search', '');
    const tableColumns = useTableColumns(TYPE_COLUMNS, 'contractTypesColumns');

    const loadTypes = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await contractTypeService.listTypes(orgId);
            setTypes(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => {
        loadTypes();
    }, [loadTypes]);

    const handleAdd = async () => {
        if (!editName.trim()) return;
        if (!createTarget) { showToast('Selecione uma organização para criar um tipo de contrato.', 'error'); return; }
        const nome = editName.trim();
        const { ok, failed } = await forEachTargetOrg(createTarget, orgId =>
            contractTypeService.createType({ name: nome, category: editCategory, organization_id: orgId }));
        if (ok === 0) {
            showToast(failed[0]?.error instanceof Error ? failed[0].error.message : 'Erro ao criar', 'error');
            return;
        }
        showToast(failed.length ? `Criado em ${ok} de ${ok + failed.length} organizações (as demais já tinham).`
            : ok > 1 ? `Criado em ${ok} organizações` : 'Tipo de contrato criado com sucesso', 'success');
        cancelEdit();
        loadTypes();
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await contractTypeService.updateType(id, { name: editName.trim(), category: editCategory });
            showToast('Tipo de contrato atualizado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir tipo de contrato?', message: 'Tem certeza que deseja excluir este tipo de contrato?', variant: 'danger' })) return;
        try {
            await contractTypeService.deleteType(id);
            showToast('Tipo de contrato excluído', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (type: ContractTypeRecord) => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        const { ok, failed } = await forEachTargetOrg(target, async (targetOrgId) => {
            await contractTypeService.createType({ name: `${type.name} (Cópia)`, category: type.category, organization_id: targetOrgId });
        });
        if (ok === 0) {
            showToast(failed[0]?.error instanceof Error ? failed[0].error.message : 'Erro ao salvar', 'error');
            return;
        }
        // Replicação parcial não é erro: organização que já tinha o item falha
        // no UNIQUE e as demais seguem — o aviso diz exatamente o que houve.
        showToast(failed.length ? `Aplicado em ${ok} de ${ok + failed.length} organizações (as demais já tinham).`
            : ok > 1 ? `Aplicado em ${ok} organizações` : 'Tipo de contrato duplicado com sucesso', 'success');
        loadTypes();
    };

    const handleImportDefaults = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        if (!await confirm({ title: 'Importar Tipos Padrão', message: 'Deseja importar os tipos de contrato padrão do sistema para poder editá-los?' })) return;
        setLoading(true);
        const { ok, failed } = await forEachTargetOrg(target, async (targetOrgId) => {
            await contractTypeService.importDefaults(targetOrgId);
        });
        setLoading(false);
        if (ok === 0) {
            showToast(failed[0]?.error instanceof Error ? failed[0].error.message : 'Erro ao salvar', 'error');
            return;
        }
        // Replicação parcial não é erro: organização que já tinha o item falha
        // no UNIQUE e as demais seguem — o aviso diz exatamente o que houve.
        showToast(failed.length ? `Aplicado em ${ok} de ${ok + failed.length} organizações (as demais já tinham).`
            : ok > 1 ? `Aplicado em ${ok} organizações` : 'Tipos padrão importados com sucesso', 'success');
        loadTypes();
    };

    const startEdit = (type: ContractTypeRecord) => {
        setEditingId(type.id);
        setEditName(type.name);
        setEditCategory(type.category);
        setIsAdding(false);
    };

    const startAdd = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setCreateTarget(target);
        setIsAdding(true);
        setEditingId(null);
        setEditName('');
        setEditCategory('Geral');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setCreateTarget(null);
        setEditingId(null);
        setEditName('');
        setEditCategory('Geral');
    };

    const filteredTypes = types
        .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (tableColumns.sortColumn === 'category') {
                return tableColumns.sortDirection === 'asc'
                    ? a.category.localeCompare(b.category)
                    : b.category.localeCompare(a.category);
            }
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
                        <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tipos de Contrato</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos de contrato disponíveis em Suprimentos e Serviços.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!loading && types.some(isDefault) && (
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
                            Novo tipo
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
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Nome do tipo de contrato..."
                            className="flex-1 h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <select
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value as ContractTypeCategory)}
                            className="h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
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
                                    placeholder="Buscar tipo de contrato..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={TYPE_COLUMNS.filter(c => c.key !== 'actions')}
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
                    ) : filteredTypes.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum tipo de contrato encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre um novo tipo.</p>
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
                                    {tableColumns.visibleColumns.includes('category') && (
                                        <SortableHeader
                                            colKey="category"
                                            label="Categoria"
                                            uppercase={false}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredTypes.map(type => (
                                    <tr key={type.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {editingId === type.id ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="w-full h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                        onKeyDown={e => e.key === 'Enter' && handleUpdate(type.id)}
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        {type.name}
                                                        {isDefault(type) && (
                                                            <span className="text-xs font-normal text-gray-400">
                                                                Global
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('category') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {editingId === type.id ? (
                                                    <select
                                                        value={editCategory}
                                                        onChange={e => setEditCategory(e.target.value as ContractTypeCategory)}
                                                        className="h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                    >
                                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                ) : type.category}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    {editingId === type.id ? (
                                                        <>
                                                            <button onClick={() => handleUpdate(type.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors"><Check className="w-4 h-4" /></button>
                                                            <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors"><X className="w-4 h-4" /></button>
                                                        </>
                                                    ) : isDefault(type) ? (
                                                        <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(type)} />
                                                    ) : (
                                                        <>
                                                            <ActionIconButton kind="edit" onClick={() => startEdit(type)} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDelete(type.id)} />
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

export default ContractTypesSettings;
