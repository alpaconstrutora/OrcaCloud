import React from 'react';
import { Search, Plus, Edit2, Trash2, Truck, Mail, Phone, Tag, LayoutDashboard, Table2, Loader2, AlertCircle, Building2, Users, Pencil, X, Filter } from 'lucide-react';
import { Supplier } from '../types';
import { supplierService } from '../services/supplierService';
import { SupplierModal } from './SupplierModal';
import { ColumnConfigButton, SortableHeader, usePersistedState, ColumnConfig, useTableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import Button from './ui/Button';

const SUPPLIER_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Fornecedor', sortable: true },
    { key: 'category', label: 'Categoria', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'document', label: 'Documento', sortable: true },
];

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/ordenação já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Fornecedor', type: 'text' },
    { key: 'category', label: 'Categoria', type: 'text' },
    { key: 'organization', label: 'Organização', type: 'text' },
    { key: 'document', label: 'Documento', type: 'text' },
    { key: 'type', label: 'Tipo', type: 'select', options: [
        { value: 'PJ', label: 'Pessoa Jurídica' }, { value: 'PF', label: 'Pessoa Física' },
    ] },
];

function getAdvancedFilterValue(supplier: Supplier, key: string): unknown {
    switch (key) {
        case 'name': return supplier.name;
        case 'category': return supplier.category ?? '';
        case 'organization': return supplier.organization_name ?? '';
        case 'document': return supplier.document ?? '';
        case 'type': return supplier.type ?? '';
        default: return null;
    }
}

interface SupplierListProps {
    organizationId?: string;
}

export const SupplierList: React.FC<SupplierListProps> = ({ organizationId }) => {
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('supplierListFilters:search', '');
    const [isIdInitialized, setIsIdInitialized] = React.useState(false);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [editingSupplier, setEditingSupplier] = React.useState<Supplier | undefined>();
    const [sortBy, setSortBy] = usePersistedState<string>('supplierListFilters:sortBy', 'name-asc');
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('supplierListFilters:viewMode', 'list');
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [isBulkEditOpen, setIsBulkEditOpen] = React.useState(false);
    const confirm = useConfirm();

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const clearSelection = () => setSelectedIds(new Set());
    const [lastCheckedIndex, setLastCheckedIndex] = React.useState<number | null>(null);

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Seleção em lote com Shift: seleciona do último item clicado (âncora) até o
    // item atual, marcando todos os intermediários — não previsto no guia, mas é o
    // padrão universal de seleção de intervalo (Explorer/Gmail/Planilhas).
    const handleRowCheck = (id: string, index: number, shiftKey: boolean, visibleRows: Supplier[]) => {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = visibleRows.slice(start, end + 1).map(s => s.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleSelected(id);
            setLastCheckedIndex(index);
        }
    };

    const loadSuppliers = async () => {
        setIsLoading(true);
        try {
            const data = await supplierService.listSuppliers(organizationId);
            setSuppliers(data);
        } catch (error) {
            console.error("Erro ao listar fornecedores:", error);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        loadSuppliers();
    }, [organizationId]);

    const handleAdd = async (data: Partial<Supplier>) => {
        try {
            const sanitizedData = Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
            );
            await supplierService.addSupplier(sanitizedData as Omit<Supplier, 'id' | 'created_at'>);
            setIsModalOpen(false);
            loadSuppliers();
            notify('Fornecedor cadastrado com sucesso.');
        } catch (error) {
            console.error("Erro ao adicionar fornecedor:", error);
            notify(`Erro ao adicionar o fornecedor: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    };

    const handleEdit = async (data: Partial<Supplier>) => {
        try {
            if (!editingSupplier?.id) return;
            const sanitizedData = Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
            );
            await supplierService.updateSupplier(editingSupplier.id, sanitizedData);
            setIsModalOpen(false);
            loadSuppliers();
            notify('Fornecedor atualizado com sucesso.');
        } catch (error) {
            console.error("Erro ao editar fornecedor:", error);
            notify(`Erro ao editar o fornecedor: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    };

    const performDelete = async (id: string) => {
        try {
            await supplierService.deleteSupplier(id);
            setSuppliers(prev => prev.filter(s => s.id !== id));
            notify('Fornecedor excluído com sucesso.');
        } catch (error) {
            console.error("Erro ao excluir fornecedor:", error);
            notify('Erro ao excluir o fornecedor.', 'error');
        }
    };

    // Excluir fora da tabela (grid view): pede confirmação via useConfirm.
    // Dentro da tabela, o InlineDisclosureMenu já tem confirmação embutida (performDelete direto).
    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm({
            title: 'Excluir fornecedor?',
            message: `Tem certeza que deseja excluir o fornecedor "${name}"? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await performDelete(id);
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds];
        const ok = await confirm({
            title: `Excluir ${ids.length} fornecedor${ids.length !== 1 ? 'es' : ''}?`,
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        for (const id of ids) {
            await supplierService.deleteSupplier(id).catch(err => console.error('Erro ao excluir fornecedor em lote:', err));
        }
        setSuppliers(prev => prev.filter(s => !selectedIds.has(s.id)));
        clearSelection();
        notify(`${ids.length} fornecedor${ids.length !== 1 ? 'es excluídos' : ' excluído'} com sucesso.`);
    };

    const handleBulkCategoryChange = async (category: string) => {
        const ids = [...selectedIds];
        for (const id of ids) {
            await supplierService.updateSupplier(id, { category }).catch(err => console.error('Erro ao editar fornecedor em lote:', err));
        }
        setIsBulkEditOpen(false);
        clearSelection();
        await loadSuppliers();
        notify(`Categoria atualizada em ${ids.length} fornecedor${ids.length !== 1 ? 'es' : ''}.`);
    };

    const tableColumns = useTableColumns(SUPPLIER_COLUMNS, 'supplierListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'supplierListFilters:advanced');

    const filteredSuppliers = React.useMemo(() => {
        let result = suppliers
            .filter(s =>
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.document?.includes(searchTerm) ||
                s.category?.toLowerCase().includes(searchTerm.toLowerCase())
            );

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                // TableUtils sort takes priority over dropdown sort
                if (tableColumns.sortColumn) {
                    const col = tableColumns.sortColumn;
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    if (col === 'name') return a.name.localeCompare(b.name) * dir;
                    if (col === 'category') return (a.category || '').localeCompare(b.category || '') * dir;
                    if (col === 'organization') return (a.organization_name || '').localeCompare(b.organization_name || '') * dir;
                    if (col === 'document') return (a.document || '').localeCompare(b.document || '') * dir;
                }
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [suppliers, searchTerm, sortBy, tableColumns.sortColumn, tableColumns.sortDirection, advancedFilters.rules]);

    const distinctCategories = React.useMemo(
        () => [...new Set(suppliers.map(s => s.category).filter((c): c is string => !!c))].sort(),
        [suppliers]
    );

    const kpis = React.useMemo(() => ({
        total: suppliers.length,
        pj: suppliers.filter(s => s.type === 'PJ').length,
        pf: suppliers.filter(s => s.type === 'PF').length,
        categorias: distinctCategories.length,
    }), [suppliers, distinctCategories]);

    const visibleIds = filteredSuppliers.map(s => s.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    const toggleAllVisible = () => {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                visibleIds.forEach(id => next.delete(id));
                return next;
            }
            return new Set([...prev, ...visibleIds]);
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Fornecedores</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua rede de parceiros e fornecedores com agilidade premium.</p>
                </div>
                <div className="flex items-center gap-3">

                    <button
                        onClick={() => { setEditingSupplier(undefined); setIsModalOpen(true); }}
                        className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-button uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Novo Fornecedor
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard shadow={false} label="Total de Fornecedores" value={kpis.total} sub="Cadastrados na organização" icon={<Truck className="w-5 h-5" />} color="blue" />
                <KpiCard shadow={false} label="Pessoa Jurídica" value={kpis.pj} sub="Fornecedores PJ" icon={<Building2 className="w-5 h-5" />} color="indigo" />
                <KpiCard shadow={false} label="Pessoa Física" value={kpis.pf} sub="Fornecedores PF" icon={<Users className="w-5 h-5" />} color="purple" />
                <KpiCard shadow={false} label="Categorias" value={kpis.categorias} sub="Categorias distintas em uso" icon={<Tag className="w-5 h-5" />} color="amber" />
            </div>

            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, categoria, e-mail ou documento..."
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                        <option value="category">Categoria</option>
                        <option value="recent">Mais Recentes</option>
                    </select>
                </div>
                <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />

                <button
                    onClick={loadSuppliers}
                    className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
                    title="Atualizar"
                >
                    <Filter className="w-4 h-4" />
                </button>

                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 gap-1.5 shrink-0">
                    {viewMode === 'list' && (
                        <>
                            <ColumnConfigButton
                                columns={SUPPLIER_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <div className="w-px bg-gray-200 mx-1 my-1"></div>
                        </>
                    )}
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : viewMode === 'list' ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                    <th className="w-10 px-4 py-5 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={visibleIds.length === 0}
                                            onChange={toggleAllVisible}
                                        />
                                    </th>
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader label="Fornecedor" colKey="name" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-5" />
                                    )}
                                    {tableColumns.visibleColumns.includes('category') && (
                                        <SortableHeader label="Categoria" colKey="category" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-5" />
                                    )}
                                    {tableColumns.visibleColumns.includes('organization') && (
                                        <SortableHeader label="Organização" colKey="organization" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-5" />
                                    )}
                                    {tableColumns.visibleColumns.includes('contact') && (
                                        <SortableHeader label="Contato" colKey="contact" sortable={false} className="px-6 py-5" />
                                    )}
                                    {tableColumns.visibleColumns.includes('document') && (
                                        <SortableHeader label="Documento" colKey="document" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-5" />
                                    )}
                                    <th className="px-6 py-5 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredSuppliers.length > 0 ? (
                                    filteredSuppliers.map((supplier, rowIndex) => (
                                        <tr
                                            key={supplier.id}
                                            onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                                            className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedIds.has(supplier.id) ? 'bg-blue-50/60' : ''}`}
                                        >
                                            <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedIds.has(supplier.id)}
                                                    onChange={(e) => handleRowCheck(supplier.id, rowIndex, (e.nativeEvent as MouseEvent).shiftKey, filteredSuppliers)}
                                                />
                                            </td>
                                            {tableColumns.visibleColumns.includes('name') && (
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                                                            <Truck className="w-5 h-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-normal text-gray-700 group-hover:text-blue-700 transition-colors">{supplier.name}</p>
                                                            <p className="text-xs font-medium text-gray-400 uppercase tracking-tight">{supplier.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('category') && (
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-normal text-gray-700">{supplier.category}</span>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('organization') && (
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-normal text-gray-700">{supplier.organization_name}</span>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('contact') && (
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1.5">
                                                        {supplier.email && (
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                                <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                                {supplier.email}
                                                            </div>
                                                        )}
                                                        {supplier.phone && (
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                                {supplier.phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('document') && (
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-normal text-gray-600">
                                                        {supplier.document || '---'}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Editar
                                                    </button>
                                                    <InlineDisclosureMenu
                                                        showDelete
                                                        onDelete={() => performDelete(supplier.id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={tableColumns.visibleColumns.length + 2} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-4 max-w-xs mx-auto">
                                                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center animate-pulse">
                                                    <Truck className="w-10 h-10 text-blue-200" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-lg font-bold text-gray-900">Nenhum Fornecedor</h4>
                                                    <p className="text-sm text-gray-500">Comece sua base de parceiros cadastrando o primeiro fornecedor.</p>
                                                </div>
                                                <button
                                                    onClick={() => { setEditingSupplier(undefined); setIsModalOpen(true); }}
                                                    className="mt-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-bold text-sm"
                                                >
                                                    Cadastrar Agora
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSuppliers.length > 0 ? (
                        filteredSuppliers.map(supplier => (
                            <div
                                key={supplier.id}
                                onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                                className="bg-white rounded-2xl border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col overflow-hidden cursor-pointer"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                                            <Truck className="w-6 h-6" />
                                        </div>
                                        <span className="text-sm font-normal text-gray-600">{supplier.category}</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors mb-1 line-clamp-1">
                                        {supplier.name}
                                    </h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
                                        {supplier.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                                    </p>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400 font-bold uppercase tracking-widest">Organização</span>
                                            <span className="text-gray-900 font-semibold">{supplier.organization_name}</span>
                                        </div>
                                        {supplier.email && (
                                            <div className="flex items-center gap-2.5 text-sm text-gray-600 underline-offset-4 hover:underline cursor-pointer">
                                                <Mail className="w-4 h-4 text-blue-400" />
                                                <span className="truncate">{supplier.email}</span>
                                            </div>
                                        )}
                                        {supplier.phone && (
                                            <div className="flex items-center gap-2.5 text-sm text-gray-600">
                                                <Phone className="w-4 h-4 text-gray-400" />
                                                <span>{supplier.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs pt-2">
                                            <span className="text-gray-400 font-bold uppercase tracking-widest">Documento</span>
                                            <span className="text-sm font-normal text-gray-700">
                                                {supplier.document || '---'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-2xl border-t border-gray-100 flex justify-end gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); setIsModalOpen(true); }}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id, supplier.name); }}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-gray-100">
                            <div className="flex flex-col items-center justify-center space-y-4 max-w-xs mx-auto">
                                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center">
                                    <Truck className="w-10 h-10 text-blue-200" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-lg font-bold text-gray-900">Nenhum Fornecedor</h4>
                                    <p className="text-sm text-gray-500">Comece sua base de parceiros cadastrando o primeiro fornecedor.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsBulkEditOpen(true)}
                        className="text-blue-700 border-none hover:bg-blue-50"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar Categoria em Lote
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleBulkDelete}
                        className="text-red-600 border-none hover:bg-red-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                    </Button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {isBulkEditOpen && (
                <SupplierBulkCategoryModal
                    count={selectedIds.size}
                    categories={distinctCategories}
                    onClose={() => setIsBulkEditOpen(false)}
                    onSave={handleBulkCategoryChange}
                />
            )}

            <SupplierModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={editingSupplier ? handleEdit : handleAdd}
                initialData={editingSupplier}
            />

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

interface SupplierBulkCategoryModalProps {
    count: number;
    categories: string[];
    onClose: () => void;
    onSave: (category: string) => Promise<void>;
}

// Modal dedicado de edição em lote — categoria dos fornecedores selecionados.
// Ver docs/ui_ux_standard_guide.md § 10: edição em lote deve abrir modal, não
// empilhar selects inline na barra fixa.
const SupplierBulkCategoryModal: React.FC<SupplierBulkCategoryModalProps> = ({ count, categories, onClose, onSave }) => {
    const [category, setCategory] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    const handleSave = async () => {
        if (!category.trim()) return;
        setSaving(true);
        try {
            await onSave(category.trim());
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col">
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Editar Categoria em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {count} fornecedor{count !== 1 ? 'es' : ''} selecionado{count !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-3">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block">Nova categoria</label>
                    <input
                        type="text"
                        list="supplier-bulk-categories"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={saving}
                        placeholder="Digite ou selecione uma categoria"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-blue-400 disabled:opacity-50"
                    />
                    <datalist id="supplier-bulk-categories">
                        {categories.map(c => <option key={c} value={c} />)}
                    </datalist>
                    <p className="text-xs text-gray-400">Todos os fornecedores selecionados passarão a ter essa categoria.</p>
                </div>

                <div className="px-6 pb-6 pt-2 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !category.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-900/20"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};
