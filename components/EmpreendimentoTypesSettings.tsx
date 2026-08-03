import React from 'react';
import { useStore } from '../store/useStore';
import {
    empreendimentoTypeService,
    EmpreendimentoTypeRecord,
    EmpreendimentoMotorCategory,
    MOTOR_CATEGORY_OPTIONS,
    COLOR_OPTIONS,
    colorClasses,
} from '../services/empreendimentoTypeService';
import { Building2, Plus, Check, X, Search, AlertCircle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useOrganizationPicker } from './ui/useOrganizationPicker';
import { useToast } from '../hooks/useToast';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

const TYPE_COLUMNS: ColumnConfig[] = [
    { key: 'name',     label: 'Nome',      sortable: true },
    { key: 'category', label: 'Categoria', sortable: true },
    { key: 'actions',  label: 'Ações',     sortable: false },
];

// Extrai só o tom de texto do combo bg+text+border de colorClasses() — mantém
// a cor escolhida pelo usuário como identificação, sem reintroduzir a pílula
// (§8: texto colorido simples, sem fundo/uppercase/rounded-full).
const colorTextClass = (colorKey: string) => colorClasses(colorKey).match(/text-\S+/)?.[0] ?? 'text-gray-600';

const EmpreendimentoTypesSettings: React.FC = () => {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const organizations = useStore(state => state.organizations);
    const orgId = activeOrganizationId ?? undefined;
    // Em "Todas as organizações": com UMA só organização, ela é o alvo de
    // criação; com várias, o alvo é ambíguo e precisa ser escolhido.
    const effectiveOrganizationId = activeOrganizationId ?? (organizations.length === 1 ? organizations[0].id : undefined);
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const { pickOrganization, orgPickerModal } = useOrganizationPicker();

    const [types, setTypes] = React.useState<EmpreendimentoTypeRecord[]>([]);
    const [loading, setLoading] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState(false);
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editCategory, setEditCategory] = React.useState<EmpreendimentoMotorCategory>('vertical');
    const [editColor, setEditColor] = React.useState('gray');

    const [searchTerm, setSearchTerm] = usePersistedState<string>('empreendimentoTypes:search', '');
    const tableColumns = useTableColumns(TYPE_COLUMNS, 'empreendimentoTypesColumns');

    const loadTypes = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await empreendimentoTypeService.list(orgId);
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
        if (!createOrgId) { showToast('Selecione uma organização para criar um tipo de empreendimento.', 'error'); return; }
        try {
            await empreendimentoTypeService.create({ name: editName.trim(), motor_category: editCategory, color: editColor, description: null, organization_id: createOrgId });
            showToast('Tipo de empreendimento criado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await empreendimentoTypeService.update(id, { name: editName.trim(), motor_category: editCategory, color: editColor });
            showToast('Tipo de empreendimento atualizado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir tipo de empreendimento?', message: 'Empreendimentos que já usam este tipo mantêm o valor salvo, mas ele deixa de aparecer no formulário. Tem certeza?', variant: 'danger' })) return;
        try {
            await empreendimentoTypeService.remove(id);
            showToast('Tipo de empreendimento excluído', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (type: EmpreendimentoTypeRecord) => {
        const targetOrgId = effectiveOrganizationId ?? (await pickOrganization()) ?? undefined;
        if (!targetOrgId) return;
        try {
            await empreendimentoTypeService.duplicate(type, targetOrgId);
            showToast('Tipo de empreendimento duplicado com sucesso', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const startEdit = (type: EmpreendimentoTypeRecord) => {
        setEditingId(type.id);
        setEditName(type.name);
        setEditCategory(type.motor_category);
        setEditColor(type.color);
        setIsAdding(false);
    };

    const startAdd = async () => {
        const targetOrgId = effectiveOrganizationId ?? (await pickOrganization()) ?? undefined;
        if (!targetOrgId) return;
        setCreateOrgId(targetOrgId);
        setIsAdding(true);
        setEditingId(null);
        setEditName('');
        setEditCategory('vertical');
        setEditColor('gray');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setCreateOrgId(undefined);
        setEditingId(null);
        setEditName('');
        setEditCategory('vertical');
        setEditColor('gray');
    };

    const categoryLabel = (c: EmpreendimentoMotorCategory) => MOTOR_CATEGORY_OPTIONS.find(o => o.value === c)?.label ?? c;

    const selectCls = 'h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all';

    const filteredTypes = types
        .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (tableColumns.sortColumn === 'category') {
                return tableColumns.sortDirection === 'asc'
                    ? categoryLabel(a.motor_category).localeCompare(categoryLabel(b.motor_category))
                    : categoryLabel(b.motor_category).localeCompare(categoryLabel(a.motor_category));
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
                        <Building2 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tipos de Empreendimento</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos disponíveis no cadastro de Empreendimentos (Incorporação). A categoria define como o empreendimento é classificado no motor de Áreas NBR 12721.</p>
                    </div>
                </div>
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

            <div className="mt-6 border-t border-gray-100 pt-6">
                {isAdding && (
                    <div className="flex items-center gap-2 p-2 mb-3 border border-indigo-200 rounded-[10px] bg-indigo-50/50 flex-wrap">
                        <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Nome do tipo de empreendimento..."
                            className="flex-1 min-w-[10rem] h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <select value={editCategory} onChange={e => setEditCategory(e.target.value as EmpreendimentoMotorCategory)} className={selectCls}>
                            {MOTOR_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={editColor} onChange={e => setEditColor(e.target.value)} className={selectCls}>
                            {COLOR_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
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
                                    placeholder="Buscar tipo de empreendimento..."
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
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum tipo de empreendimento encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre um novo tipo.</p>
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
                                                        <span className={`font-normal ${colorTextClass(type.color)}`}>{type.name}</span>
                                                        {type.is_system && (
                                                            <span className="text-xs font-normal text-gray-400">Global</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('category') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {editingId === type.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <select value={editCategory} onChange={e => setEditCategory(e.target.value as EmpreendimentoMotorCategory)} className={selectCls}>
                                                            {MOTOR_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                        <select value={editColor} onChange={e => setEditColor(e.target.value)} className={selectCls}>
                                                            {COLOR_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                                        </select>
                                                    </div>
                                                ) : categoryLabel(type.motor_category)}
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
                                                    ) : type.is_system ? (
                                                        <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(type)} />
                                                    ) : (
                                                        <>
                                                            <ActionIconButton kind="edit" onClick={() => startEdit(type)} />
                                                            <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(type)} />
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

            {orgPickerModal}
        </div>
    );
};

export default EmpreendimentoTypesSettings;
