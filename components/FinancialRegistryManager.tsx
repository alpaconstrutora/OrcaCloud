import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Save, Search, AlertCircle, Download, FileDown, Upload, Hash } from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import Button from './ui/Button';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { useConfirm } from './ui/confirm';
import { KpiCard } from './ui/KpiCard';

interface RegistryItem {
    id: string;
    name: string;
    code?: string;
    description?: string;
    bank?: string;
    branch?: string;
    account_number?: string;
    organization_id?: string;
}

interface OrgOption {
    id: string;
    name: string;
}

interface FinancialRegistryManagerProps {
    title: string;
    description: string;
    icon: React.ElementType;
    items: RegistryItem[];
    onSave: (item: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onExport?: () => void;
    onDownloadTemplate?: () => void;
    onImport?: () => void;
    showCode?: boolean;
    showDescription?: boolean;
    showBankDetails?: boolean;
    organizations?: OrgOption[];
    defaultOrganizationId?: string;
}

const FinancialRegistryManager: React.FC<FinancialRegistryManagerProps> = ({
    title,
    description,
    icon: Icon,
    items,
    onSave,
    onDelete,
    onExport,
    onDownloadTemplate,
    onImport,
    showCode = false,
    showDescription = false,
    showBankDetails = false,
    organizations,
    defaultOrganizationId,
}) => {
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    // F2: filtro sobrevive a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('financialRegistryFilters:search', '');
    const [loading, setLoading] = useState(false);
    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Form state
    const [formData, setFormData] = useState<Partial<RegistryItem>>({});

    // Build column config dynamically based on props
    const registryColumns = useMemo<ColumnConfig[]>(() => {
        const cols: ColumnConfig[] = [];
        if (showCode) cols.push({ key: 'code', label: 'Código', sortable: true });
        cols.push({ key: 'name', label: 'Nome', sortable: true });
        // Detalhes = descrição + dados bancários combinados — sem valor único óbvio pra ordenar (§6.3).
        if (showDescription || showBankDetails) cols.push({ key: 'details', label: 'Detalhes', sortable: false });
        return cols;
    }, [showCode, showDescription, showBankDetails]);

    const tableColumns = useTableColumns(registryColumns, 'financialRegistryColumns');

    // F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Campos variam
    // com as mesmas props que já controlam as colunas (showCode/showDescription/
    // showBankDetails), pra não oferecer filtro de um campo que a tela não usa.
    const advancedFilterFields = useMemo<FilterFieldConfig[]>(() => {
        const fields: FilterFieldConfig[] = [{ key: 'name', label: 'Nome', type: 'text' }];
        if (showCode) fields.push({ key: 'code', label: 'Código', type: 'text' });
        if (showDescription) fields.push({ key: 'description', label: 'Descrição', type: 'text' });
        if (showBankDetails) {
            fields.push({ key: 'bank', label: 'Banco', type: 'text' });
            fields.push({ key: 'account_number', label: 'Conta', type: 'text' });
        }
        return fields;
    }, [showCode, showDescription, showBankDetails]);

    const getAdvancedFilterValue = (item: RegistryItem, key: string): unknown => (item as any)[key] ?? null;

    const advancedFilters = useAdvancedFilters(advancedFilterFields, 'financialRegistryFilters:advanced');

    const handleEdit = (item: RegistryItem) => {
        setFormData(item);
        setIsEditing(item.id);
        setIsAdding(false);
    };

    const handleAdd = () => {
        setFormData({ name: '', code: '', description: '', organization_id: defaultOrganizationId });
        setIsAdding(true);
        setIsEditing(null);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setIsEditing(null);
        setFormData({});
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;

        setLoading(true);
        try {
            await onSave(formData);
            handleCancel();
            notify('Registro salvo com sucesso.', 'success');
        } catch (error) {
            console.error('Error saving item:', error);
            notify('Erro ao salvar o registro.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir registro?',
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await onDelete(id);
            notify('Registro excluído com sucesso.', 'success');
        } catch (error) {
            console.error('Error deleting item:', error);
            notify('Erro ao excluir o registro.', 'error');
        }
    };

    const filteredItems = useMemo(() => applyFilterRules(
        items.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.code?.toLowerCase().includes(searchTerm.toLowerCase()))
        ),
        advancedFilters.rules, advancedFilterFields, getAdvancedFilterValue,
    )
        .sort((a, b) => {
            // TableUtils sort takes priority over default sort
            if (tableColumns.sortColumn) {
                const col = tableColumns.sortColumn;
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                if (col === 'name') return a.name.localeCompare(b.name, 'pt-BR') * dir;
                if (col === 'code') {
                    if (!a.code && !b.code) return 0;
                    if (!a.code) return 1 * dir;
                    if (!b.code) return -1 * dir;
                    return a.code.localeCompare(b.code, 'pt-BR', { numeric: true }) * dir;
                }
            }
            if (!a.code && !b.code) return a.name.localeCompare(b.name, 'pt-BR');
            if (!a.code) return 1;
            if (!b.code) return -1;
            return a.code.localeCompare(b.code, 'pt-BR', { numeric: true });
        }), [items, searchTerm, advancedFilters.rules, advancedFilterFields, tableColumns.sortColumn, tableColumns.sortDirection]);

    const getLevel = (code?: string) => code ? code.split('.').length : 0;

    // Hierarquia visual via cor/tamanho, nunca font-bold/font-black (ui_ux_standard_guide.md §7) —
    // o nível mais alto (1) ganha uma linha de fundo sutil pra se destacar sem precisar de peso.
    const LEVEL_STYLES = [
        // level 0 (sem código)
        { indent: 0,  nameCls: 'text-sm font-normal text-gray-900', codeCls: 'text-gray-500',   rowCls: '' },
        // level 1  (ex: 1)
        { indent: 0,  nameCls: 'text-sm font-normal text-gray-900', codeCls: 'text-gray-700',   rowCls: 'bg-gray-50/60' },
        // level 2  (ex: 1.1)
        { indent: 16, nameCls: 'text-sm font-normal text-gray-800', codeCls: 'text-blue-700',   rowCls: '' },
        // level 3  (ex: 1.1.1)
        { indent: 32, nameCls: 'text-xs font-normal text-gray-500', codeCls: 'text-gray-500',   rowCls: '' },
        // level 4  (ex: 1.1.1.1)
        { indent: 48, nameCls: 'text-xs font-normal text-gray-400', codeCls: 'text-gray-400',   rowCls: '' },
    ];

    const getLevelStyle = (code?: string) => {
        const level = getLevel(code);
        return LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];
    };

    const totalItems = items.length;

    return (
        <div className="space-y-6">
            {/* Header — mesma escala das demais abas de Minha Organização (h1 3xl, subtítulo mt-1.5) */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                        <Icon className="w-6 h-6 text-blue-600" />
                        {title}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{description}</p>
                </div>
                <KpiCard shadow={false} size="sm" label="Total de Registros" value={totalItems} icon={<Hash className="w-4 h-4" />} color="blue" />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                {/* Toolbar §5.1 (escala compacta §16), mesma decisão já aplicada no resto do módulo Organização */}
                <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Pesquisar nos registros..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center h-9">
                        <AdvancedFilterPanel fields={advancedFilterFields} state={advancedFilters} />
                    </div>

                    {(onDownloadTemplate || onImport || onExport) && (
                        <>
                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                            <div className="flex items-center gap-1.5">
                                {onDownloadTemplate && (
                                    <button onClick={onDownloadTemplate} title="Baixar modelo para importação"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <FileDown className="w-4 h-4" />
                                    </button>
                                )}
                                {onImport && (
                                    <button onClick={onImport} title="Importar"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <Upload className="w-4 h-4" />
                                    </button>
                                )}
                                {onExport && items.length > 0 && (
                                    <button onClick={onExport} title="Exportar"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                    <ColumnConfigButton
                        columns={registryColumns}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />

                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo cadastro
                    </button>
                </div>

                {/* List Content */}
                <div>
                {(isAdding || isEditing) && (
                    <div className="p-8 border-b border-gray-100 bg-blue-50/30">
                        <form onSubmit={handleSubmit} className="p-8 bg-white border border-blue-100 rounded-3xl shadow-xl shadow-blue-900/5 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className={showCode ? '' : 'md:col-span-2'}>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Nome / Identificação</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name || ''}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                        placeholder="Ex: Banco Itaú"
                                    />
                                </div>
                                {showCode && (
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Código Contábil</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.code || ''}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                            placeholder="Ex: 3.01.02"
                                        />
                                    </div>
                                )}
                                {showDescription && (
                                    <div className={showBankDetails ? '' : 'md:col-span-2'}>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Descrição Adicional</label>
                                        <input
                                            type="text"
                                            value={formData.description || ''}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                            placeholder="Opcional..."
                                        />
                                    </div>
                                )}
                                {showBankDetails && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Instituição Bancária</label>
                                            <input
                                                type="text"
                                                value={formData.bank || ''}
                                                onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                                placeholder="Ex: Itaú, 341..."
                                            />
                                        </div>
                                        {organizations && organizations.length > 0 && (
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Organização</label>
                                                <select
                                                    value={formData.organization_id || ''}
                                                    onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                                >
                                                    <option value="">Selecione uma organização…</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Agência</label>
                                                <input
                                                    type="text"
                                                    value={formData.branch || ''}
                                                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                                    placeholder="0001"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Número Conta</label>
                                                <input
                                                    type="text"
                                                    value={formData.account_number || ''}
                                                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-gray-700"
                                                    placeholder="12345-6"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 mt-8">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={handleCancel}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    Cancelar
                                </Button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex items-center gap-2 bg-black text-white px-10 py-3 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-800 transition-all disabled:opacity-50 shadow-xl shadow-gray-200"
                                >
                                    <Save className="w-4 h-4" />
                                    {loading ? 'Gravando...' : 'Salvar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* thead em sentence case (§6.2) — obrigatório porque a tela adotou a
                    escala de radius compacta (§16), mesmo critério do resto do módulo. */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {showCode && tableColumns.visibleColumns.includes('code') && (
                                    <SortableHeader label="Código" colKey="code" sortable={true} uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 w-32" />
                                )}
                                {tableColumns.visibleColumns.includes('name') && (
                                    <SortableHeader label="Nome" colKey="name" sortable={true} uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {(showDescription || showBankDetails) && tableColumns.visibleColumns.includes('details') && (
                                    <SortableHeader label="Detalhes" colKey="details" sortable={false} uppercase={false} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                <th className="px-6 py-2 text-right w-20 text-table-header font-semibold text-gray-500">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center">
                                        <AlertCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro encontrado</h3>
                                        <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre o primeiro registro.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map(item => {
                                    const lvl = showCode ? getLevelStyle(item.code) : getLevelStyle(undefined);
                                    return (
                                    <tr key={item.id} className={`group hover:bg-blue-50/50 transition-colors ${lvl.rowCls}`}>
                                        {showCode && tableColumns.visibleColumns.includes('code') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                <span className={`text-xs font-normal whitespace-nowrap ${lvl.codeCls}`}>
                                                    {item.code || '-'}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-2.5" style={{ paddingLeft: showCode ? lvl.indent : 0 }}>
                                                    <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center border border-transparent group-hover:border-blue-100 transition-all shrink-0">
                                                        <Icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                    </div>
                                                    <span className={`truncate ${lvl.nameCls}`}>{item.name}</span>
                                                </div>
                                            </td>
                                        )}
                                        {(showDescription || showBankDetails) && tableColumns.visibleColumns.includes('details') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-3 text-sm">
                                                    {item.description && <p className="text-sm font-normal text-gray-500 line-clamp-1 flex-1">{item.description}</p>}
                                                    {showBankDetails && (item.bank || item.branch || item.account_number) && (
                                                        <div className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-gray-400">
                                                            {item.bank && <span>Banco: {item.bank}</span>}
                                                            {item.branch && <span>Ag: {item.branch}</span>}
                                                            {item.account_number && <span>Cc: {item.account_number}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-6 py-2.5 text-right">
                                            {/* Editar = clique na linha (ação dominante, §9.1); ação sempre visível
                                                (nunca opacity-0 group-hover, proibido pelo §9). Kebab só tem Excluir. */}
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    Editar
                                                </button>
                                                <InlineDisclosureMenu showDelete onDelete={() => handleDelete(item.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </div>

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

export default FinancialRegistryManager;
