import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Save, X, Search, Building2, Filter, HandCoins, AlertCircle, Download, FileDown, Upload } from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import Button from './ui/Button';

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
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Partial<RegistryItem>>({});

    // Build column config dynamically based on props
    const registryColumns = useMemo<ColumnConfig[]>(() => {
        const cols: ColumnConfig[] = [];
        if (showCode) cols.push({ key: 'code', label: 'Código', sortable: true });
        cols.push({ key: 'name', label: 'Nome', sortable: true });
        if (showDescription || showBankDetails) cols.push({ key: 'details', label: 'Detalhes', sortable: false });
        return cols;
    }, [showCode, showDescription, showBankDetails]);

    const tableColumns = useTableColumns(registryColumns, 'financialRegistryColumns');

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
        } catch (error) {
            console.error('Error saving item:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = useMemo(() => items
        .filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.code?.toLowerCase().includes(searchTerm.toLowerCase()))
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
        }), [items, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const getLevel = (code?: string) => code ? code.split('.').length : 0;

    const LEVEL_STYLES = [
        // level 0 (sem código)
        { indent: 0,  nameCls: 'text-sm font-bold text-gray-900',        codeCls: 'bg-gray-100 text-gray-500',          rowCls: '' },
        // level 1  (ex: 1)
        { indent: 0,  nameCls: 'text-sm font-black text-gray-900',       codeCls: 'bg-gray-800 text-white',             rowCls: 'bg-gray-50/60' },
        // level 2  (ex: 1.1)
        { indent: 16, nameCls: 'text-sm font-bold text-gray-800',        codeCls: 'bg-blue-100 text-blue-700',          rowCls: '' },
        // level 3  (ex: 1.1.1)
        { indent: 32, nameCls: 'text-xs font-semibold text-gray-500',    codeCls: 'bg-gray-100 text-gray-400',          rowCls: '' },
        // level 4  (ex: 1.1.1.1)
        { indent: 48, nameCls: 'text-xs font-medium text-gray-400',      codeCls: 'bg-gray-50 text-gray-300 border border-gray-200', rowCls: '' },
    ];

    const getLevelStyle = (code?: string) => {
        const level = getLevel(code);
        return LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                            <Icon className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{title}</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onDownloadTemplate && (
                            <Button
                                variant="secondary"
                                onClick={onDownloadTemplate}
                                title="Baixar modelo para importação"
                                className="text-gray-500 active:scale-95"
                            >
                                <FileDown className="w-4 h-4" />
                                <span>Template</span>
                            </Button>
                        )}
                        {onImport && (
                            <Button
                                variant="secondary"
                                onClick={onImport}
                                className="text-gray-600 active:scale-95"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Importar</span>
                            </Button>
                        )}
                        {onExport && items.length > 0 && (
                            <Button
                                variant="secondary"
                                onClick={onExport}
                                className="text-gray-600 active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                                <span>Exportar</span>
                            </Button>
                        )}
                        <ColumnConfigButton
                            columns={registryColumns}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        <Button
                            variant="primary"
                            onClick={handleAdd}
                            className="shadow-lg shadow-blue-900/10 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Novo Cadastro</span>
                        </Button>
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Pesquisar nos registros..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium"
                    />
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto">
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

                <div className="min-w-full inline-block align-middle">
                    <div className="overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-100 border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs tracking-widest border-b border-gray-200">
                                <tr>
                                    {showCode && tableColumns.visibleColumns.includes('code') && (
                                        <SortableHeader label="Código" colKey="code" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left w-32" />
                                    )}
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader label="Nome" colKey="name" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-left" />
                                    )}
                                    {(showDescription || showBankDetails) && tableColumns.visibleColumns.includes('details') && (
                                        <SortableHeader label="Detalhes" colKey="details" sortable={false} className="px-6 py-2 border-r border-gray-100 text-left" />
                                    )}
                                    <th className="px-6 py-2 text-right w-24">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 bg-white">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-20 text-center">
                                            <AlertCircle className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum registro encontrado</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map(item => {
                                        const lvl = showCode ? getLevelStyle(item.code) : getLevelStyle(undefined);
                                        return (
                                        <tr key={item.id} className={`group hover:bg-blue-50/50 transition-colors cursor-pointer ${lvl.rowCls}`} onClick={() => handleEdit(item)}>
                                            {showCode && tableColumns.visibleColumns.includes('code') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                    <span className={`text-xs font-black px-2 py-1 rounded uppercase tracking-wider whitespace-nowrap ${lvl.codeCls}`}>
                                                        {item.code || '-'}
                                                    </span>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('name') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-2.5" style={{ paddingLeft: showCode ? lvl.indent : 0 }}>
                                                        <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-white border border-transparent group-hover:border-blue-100 transition-all shrink-0">
                                                            <Icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                        </div>
                                                        <span className={`truncate ${lvl.nameCls}`}>{item.name}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {(showDescription || showBankDetails) && tableColumns.visibleColumns.includes('details') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-3 text-sm">
                                                        {item.description && <p className="font-bold text-gray-500 uppercase tracking-tight line-clamp-1 flex-1">{item.description}</p>}
                                                        {showBankDetails && (item.bank || item.branch || item.account_number) && (
                                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                                {item.bank && <span className="text-xs font-bold text-blue-600/60 uppercase">Banco: {item.bank}</span>}
                                                                {item.branch && <span className="text-xs font-bold text-gray-400 uppercase">Ag: {item.branch}</span>}
                                                                {item.account_number && <span className="text-xs font-bold text-gray-400 uppercase">Cc: {item.account_number}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                                                        className="p-1.5 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600 border border-transparent hover:border-blue-100 transition-all"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Deseja excluir este registro?')) {
                                                                onDelete(item.id);
                                                            }
                                                        }}
                                                        className="p-1.5 hover:bg-white rounded-lg text-gray-400 hover:text-red-600 border border-transparent hover:border-red-100 transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
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
        </div>
    );
};

export default FinancialRegistryManager;
