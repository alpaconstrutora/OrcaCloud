import React from 'react';
import {
    empreendimentoUnitCharacteristicService,
    INPUT_TYPE_OPTIONS,
} from '../services/empreendimentoUnitCharacteristicService';
import { empreendimentoTypeService, EmpreendimentoTypeRecord } from '../services/empreendimentoTypeService';
import { COLOR_OPTIONS, colorClasses } from '../services/obraTypeService';
import { EmpreendimentoUnitCharacteristic, UnitCharacteristicInputType, UnitCharacteristicOption } from '../types/empreendimento';
import { ListChecks, Plus, Check, X, Search, AlertCircle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, errorMessage, partialFailureNote, type WriteTarget } from '../hooks/useOrgContext';
import { useToast } from '../hooks/useToast';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

const CHARACTERISTIC_COLUMNS: ColumnConfig[] = [
    { key: 'name',        label: 'Nome',            sortable: true },
    { key: 'input_type',  label: 'Tipo de seletor', sortable: true },
    { key: 'options',     label: 'Opções',          sortable: false },
    { key: 'applies_to',  label: 'Aplica-se a',     sortable: false },
    { key: 'actions',     label: 'Ações',           sortable: false },
];

const CHARACTERISTIC_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Nome', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
    input_type: { label: 'Tipo de seletor', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
    options: { label: 'Opções', sortable: false, className: 'px-6 py-2 border-r border-gray-100' },
    applies_to: { label: 'Aplica-se a', sortable: false, className: 'px-6 py-2 border-r border-gray-100' },
};

const OPTION_COLOR_ROTATION = COLOR_OPTIONS.filter(c => c.key !== 'gray').map(c => c.key);

// Chip compacto — rounded-[6px] (não rounded-full) + sem uppercase, então não
// é a pílula de status que o §8 proíbe: são valores de catálogo (opção/tipo),
// não estado de um registro.
function Chip({ label, color }: { label: string; color?: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-normal border ${colorClasses(color || 'gray')}`}>
            {label}
        </span>
    );
}

function slugifyOption(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
}

interface RenderCtx {
    editingId: string | null;
    editName: string;
    setEditName: (v: string) => void;
    handleUpdate: (id: string) => void;
    editInputType: UnitCharacteristicInputType;
    setEditInputType: (v: UnitCharacteristicInputType) => void;
    editOptions: UnitCharacteristicOption[];
    editOptionDraft: string;
    setEditOptionDraft: (v: string) => void;
    addOption: () => void;
    removeOption: (value: string) => void;
    editAppliesToAll: boolean;
    setEditAppliesToAll: (v: boolean) => void;
    editAppliesTo: string[];
    setEditAppliesTo: (v: string[]) => void;
    tipos: EmpreendimentoTypeRecord[];
    tiposMap: Record<string, EmpreendimentoTypeRecord>;
    inputTypeLabel: (t: UnitCharacteristicInputType) => string;
    selectCls: string;
}

function renderCharacteristicCell(key: string, item: EmpreendimentoUnitCharacteristic, ctx: RenderCtx): React.ReactNode {
    const editing = ctx.editingId === item.id;
    switch (key) {
        case 'name':
            return editing ? (
                <input
                    autoFocus
                    type="text"
                    value={ctx.editName}
                    onChange={e => ctx.setEditName(e.target.value)}
                    className="w-full h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    onKeyDown={e => e.key === 'Enter' && ctx.handleUpdate(item.id)}
                />
            ) : (
                <span className="text-sm font-normal text-gray-700">{item.name}</span>
            );

        case 'input_type':
            return editing ? (
                <select value={ctx.editInputType} onChange={e => ctx.setEditInputType(e.target.value as UnitCharacteristicInputType)} className={ctx.selectCls}>
                    {INPUT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ) : (
                <span className="text-sm font-normal text-gray-600">{ctx.inputTypeLabel(item.input_type)}</span>
            );

        case 'options':
            if (editing) {
                if (ctx.editInputType !== 'SELECT' && ctx.editInputType !== 'MULTI_SELECT') {
                    return <span className="text-xs font-normal text-gray-400">Não aplicável a este tipo de seletor</span>;
                }
                return (
                    <div className="flex flex-col gap-1.5 min-w-[14rem]">
                        <div className="flex flex-wrap gap-1">
                            {ctx.editOptions.map(o => (
                                <span key={o.value} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-normal border ${colorClasses(o.color || 'gray')}`}>
                                    {o.label}
                                    <button type="button" onClick={() => ctx.removeOption(o.value)} className="hover:opacity-60">
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={ctx.editOptionDraft}
                            onChange={e => ctx.setEditOptionDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ctx.addOption(); } }}
                            placeholder="Nova opção + Enter"
                            className="h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                );
            }
            if (item.input_type !== 'SELECT' && item.input_type !== 'MULTI_SELECT') {
                return <span className="text-sm font-normal text-gray-400">—</span>;
            }
            return item.options.length === 0
                ? <span className="text-sm font-normal text-gray-400">Nenhuma opção cadastrada</span>
                : (
                    <div className="flex flex-wrap gap-1">
                        {item.options.map(o => <Chip key={o.value} label={o.label} color={o.color} />)}
                    </div>
                );

        case 'applies_to':
            if (editing) {
                return (
                    <div className="flex flex-col gap-1.5 min-w-[12rem]">
                        <label className="flex items-center gap-1.5 text-xs font-normal text-gray-600">
                            <input type="checkbox" checked={ctx.editAppliesToAll} onChange={e => ctx.setEditAppliesToAll(e.target.checked)} />
                            Todos os tipos
                        </label>
                        {!ctx.editAppliesToAll && (
                            <select
                                multiple
                                size={Math.min(5, Math.max(3, ctx.tipos.length))}
                                value={ctx.editAppliesTo}
                                onChange={e => ctx.setEditAppliesTo(Array.from(e.target.selectedOptions).map(o => o.value))}
                                className="px-2 py-1 rounded-[6px] border border-gray-200 text-xs font-normal bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            >
                                {ctx.tipos.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                            </select>
                        )}
                    </div>
                );
            }
            return item.applies_to_tipos.length === 0
                ? <span className="text-sm font-normal text-gray-500">Todos os tipos</span>
                : (
                    <div className="flex flex-wrap gap-1">
                        {item.applies_to_tipos.map(slug => {
                            const tipo = ctx.tiposMap[slug];
                            return <Chip key={slug} label={tipo?.name ?? slug} color={tipo?.color} />;
                        })}
                    </div>
                );

        default:
            return null;
    }
}

const EmpreendimentoUnitCharacteristicsSettings: React.FC = () => {
    const { orgId: activeOrganizationId } = useOrgContext();
    const orgId = activeOrganizationId ?? undefined;
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [characteristics, setCharacteristics] = React.useState<EmpreendimentoUnitCharacteristic[]>([]);
    const [tipos, setTipos] = React.useState<EmpreendimentoTypeRecord[]>([]);
    const [loading, setLoading] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState(false);
    const [createTarget, setCreateTarget] = React.useState<WriteTarget | null>(null);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editInputType, setEditInputType] = React.useState<UnitCharacteristicInputType>('SELECT');
    const [editOptions, setEditOptions] = React.useState<UnitCharacteristicOption[]>([]);
    const [editOptionDraft, setEditOptionDraft] = React.useState('');
    const [editAppliesToAll, setEditAppliesToAll] = React.useState(true);
    const [editAppliesTo, setEditAppliesTo] = React.useState<string[]>([]);

    const [searchTerm, setSearchTerm] = usePersistedState<string>('empreendimentoUnitCharacteristics:search', '');
    const tableColumns = useTableColumns(CHARACTERISTIC_COLUMNS, 'empreendimentoUnitCharacteristicsColumns');

    const loadAll = React.useCallback(async () => {
        if (!orgId) { setCharacteristics([]); setTipos([]); return; }
        setLoading(true);
        try {
            const [chars, types] = await Promise.all([
                empreendimentoUnitCharacteristicService.listCharacteristics(orgId),
                empreendimentoTypeService.list(orgId),
            ]);
            setCharacteristics(chars);
            setTipos(types);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => { loadAll(); }, [loadAll]);

    const tiposMap = React.useMemo(() => Object.fromEntries(tipos.map(t => [t.slug, t])), [tipos]);
    const inputTypeLabel = (t: UnitCharacteristicInputType) => INPUT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

    const addOption = () => {
        const label = editOptionDraft.trim();
        if (!label) return;
        const value = slugifyOption(label);
        if (editOptions.some(o => o.value === value)) { setEditOptionDraft(''); return; }
        const color = OPTION_COLOR_ROTATION[editOptions.length % OPTION_COLOR_ROTATION.length];
        setEditOptions(prev => [...prev, { value, label, color }]);
        setEditOptionDraft('');
    };
    const removeOption = (value: string) => setEditOptions(prev => prev.filter(o => o.value !== value));

    const handleAdd = async () => {
        if (!editName.trim()) return;
        if (!createTarget) { showToast('Selecione uma organização para criar uma característica.', 'error'); return; }
        const nome = editName.trim();
        const appliesTo = editAppliesToAll ? [] : editAppliesTo;
        const { ok, failed } = await forEachTargetOrg(createTarget, targetOrgId =>
            empreendimentoUnitCharacteristicService.createCharacteristic({
                name: nome,
                organization_id: targetOrgId,
                input_type: editInputType,
                options: editOptions,
                applies_to_tipos: appliesTo,
                active: true,
                sort_order: characteristics.length,
            }));
        if (ok === 0) {
            showToast(errorMessage(failed[0]?.error, 'Erro ao criar'), 'error');
            return;
        }
        showToast(failed.length ? `Criado em ${ok} de ${ok + failed.length} organizações (${partialFailureNote(failed)}).`
            : ok > 1 ? `Criado em ${ok} organizações` : 'Característica criada com sucesso', 'success');
        cancelEdit();
        loadAll();
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await empreendimentoUnitCharacteristicService.updateCharacteristic(id, {
                name: editName.trim(),
                input_type: editInputType,
                options: editOptions,
                applies_to_tipos: editAppliesToAll ? [] : editAppliesTo,
            });
            showToast('Característica atualizada com sucesso', 'success');
            cancelEdit();
            loadAll();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir característica?', message: 'As unidades que já têm valor salvo para esta característica perdem esse valor. Tem certeza?', variant: 'danger' })) return;
        try {
            await empreendimentoUnitCharacteristicService.removeCharacteristic(id);
            showToast('Característica excluída', 'success');
            loadAll();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (item: EmpreendimentoUnitCharacteristic) => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        const { ok, failed } = await forEachTargetOrg(target, targetOrgId =>
            empreendimentoUnitCharacteristicService.duplicateCharacteristic(item, targetOrgId));
        if (ok === 0) {
            showToast(errorMessage(failed[0]?.error, 'Erro ao duplicar'), 'error');
            return;
        }
        showToast(ok > 1 ? `Duplicado em ${ok} organizações` : 'Característica duplicada com sucesso', 'success');
        loadAll();
    };

    const startEdit = (item: EmpreendimentoUnitCharacteristic) => {
        setEditingId(item.id);
        setEditName(item.name);
        setEditInputType(item.input_type);
        setEditOptions(item.options);
        setEditOptionDraft('');
        setEditAppliesToAll(item.applies_to_tipos.length === 0);
        setEditAppliesTo(item.applies_to_tipos);
        setIsAdding(false);
    };

    const startAdd = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setCreateTarget(target);
        setIsAdding(true);
        setEditingId(null);
        setEditName('');
        setEditInputType('SELECT');
        setEditOptions([]);
        setEditOptionDraft('');
        setEditAppliesToAll(true);
        setEditAppliesTo([]);
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setCreateTarget(null);
        setEditingId(null);
        setEditName('');
        setEditInputType('SELECT');
        setEditOptions([]);
        setEditOptionDraft('');
        setEditAppliesToAll(true);
        setEditAppliesTo([]);
    };

    const selectCls = 'h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all';

    const filteredCharacteristics = characteristics
        .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (tableColumns.sortColumn === 'name') {
                return tableColumns.sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            }
            if (tableColumns.sortColumn === 'input_type') {
                return tableColumns.sortDirection === 'asc'
                    ? inputTypeLabel(a.input_type).localeCompare(inputTypeLabel(b.input_type))
                    : inputTypeLabel(b.input_type).localeCompare(inputTypeLabel(a.input_type));
            }
            return (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
        });

    const ctx: RenderCtx = {
        editingId, editName, setEditName, handleUpdate,
        editInputType, setEditInputType,
        editOptions, editOptionDraft, setEditOptionDraft, addOption, removeOption,
        editAppliesToAll, setEditAppliesToAll, editAppliesTo, setEditAppliesTo,
        tipos, tiposMap, inputTypeLabel, selectCls,
    };

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-[10px]">
                        <ListChecks className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Características de Unidade</h2>
                        <p className="text-sm text-gray-500 mt-1">Catálogo de características adicionais (ex: Acessibilidade, Comunicação Visual) exibidas na aba "Características Adicionais" do Empreendimento. "Aplica-se a" vazio libera a característica para qualquer tipo de empreendimento.</p>
                    </div>
                </div>
                {!isAdding && !editingId && (
                    <button
                        onClick={startAdd}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Nova característica
                    </button>
                )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                {isAdding && (
                    <div className="flex flex-col gap-3 p-3 mb-3 border border-indigo-200 rounded-[10px] bg-indigo-50/50">
                        <div className="flex items-center gap-2 flex-wrap">
                            <input
                                autoFocus
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Nome da característica..."
                                className="flex-1 min-w-[10rem] h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                            <select value={editInputType} onChange={e => setEditInputType(e.target.value as UnitCharacteristicInputType)} className={selectCls}>
                                {INPUT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button onClick={handleAdd} className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors"><Check className="w-5 h-5" /></button>
                            <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs font-normal text-gray-500 mb-1">Opções</p>
                                {renderCharacteristicCell('options', { id: 'draft', options: editOptions, input_type: editInputType } as EmpreendimentoUnitCharacteristic, ctx)}
                            </div>
                            <div>
                                <p className="text-xs font-normal text-gray-500 mb-1">Aplica-se a</p>
                                {renderCharacteristicCell('applies_to', { id: 'draft', applies_to_tipos: [] } as unknown as EmpreendimentoUnitCharacteristic, { ...ctx, editingId: 'draft' })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar acoplada à tabela (§5.2) */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar característica..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={CHARACTERISTIC_COLUMNS.filter(c => c.key !== 'actions')}
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
                    ) : filteredCharacteristics.length === 0 ? (
                        <div className="text-center py-12">
                            <ListChecks className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma característica encontrada</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre uma nova característica.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = CHARACTERISTIC_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                colKey={key}
                                                label={def.label}
                                                sortable={def.sortable !== false}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}
                                            />
                                        );
                                    })}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredCharacteristics.map(item => (
                                    <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group align-top">
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderCharacteristicCell(key, item, ctx)}
                                            </td>
                                        ))}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    {editingId === item.id ? (
                                                        <>
                                                            <button onClick={() => handleUpdate(item.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors"><Check className="w-4 h-4" /></button>
                                                            <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors"><X className="w-4 h-4" /></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ActionIconButton kind="edit" onClick={() => startEdit(item)} />
                                                            <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(item)} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDelete(item.id)} />
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

export default EmpreendimentoUnitCharacteristicsSettings;
