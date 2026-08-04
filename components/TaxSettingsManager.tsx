import React, { useMemo } from 'react';
import { Landmark, Plus, Check, X, Search, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, errorMessage, partialFailureNote, type WriteTarget } from '../hooks/useOrgContext';
import { useToast } from '../hooks/useToast';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../lib/queryClient';
import { taxSettingsService, TaxSetting, TaxSettingInput, DEFAULT_TAX_MODULES } from '../services/taxSettingsService';

const COLUMNS: ColumnConfig[] = [
    { key: 'nome',           label: 'Nome',              sortable: true },
    { key: 'aliquota',       label: 'Alíquota (%)',      sortable: true },
    { key: 'base_calculo',   label: 'Base de Cálculo',   sortable: false },
    { key: 'regra_retencao', label: 'Regra de Retenção', sortable: false },
    { key: 'aplica',         label: 'Aplica a',          sortable: false },
    { key: 'ativo',          label: 'Ativo',             sortable: true },
    { key: 'actions',        label: 'Ações',             sortable: false },
];

const emptyForm: TaxSettingInput = { nome: '', aliquota: null, base_calculo: '', regra_retencao: '', ativo: true, aplica_venda_ativo: true, aplica_locacao: true };

const inputCls = 'w-full h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all';

const TaxSettingsManager: React.FC = () => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const qc = useQueryClient();
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [searchTerm, setSearchTerm] = usePersistedState<string>('taxSettings:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'taxSettingsColumns');

    const [isAdding, setIsAdding] = React.useState(false);
    const [createTarget, setCreateTarget] = React.useState<WriteTarget | null>(null);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [form, setForm] = React.useState<TaxSettingInput>(emptyForm);

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['tax-settings', activeOrganizationId],
        queryFn: () => taxSettingsService.list(activeOrganizationId ?? undefined),
        staleTime: STALE.normal,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ['tax-settings', activeOrganizationId] });

    const createMut = useMutation({
        mutationFn: ({ target, input }: { target: WriteTarget; input: TaxSettingInput }) =>
            forEachTargetOrg(target, orgId => taxSettingsService.create(orgId, input)),
        onSuccess: ({ ok, failed }) => {
            if (ok === 0) {
                const e = failed[0]?.error;
                showToast(errorMessage(e, '').includes('unique')
                    ? 'Já existe um tributo com esse nome.'
                    : (errorMessage(e, 'Erro ao criar.')), 'error');
                return;
            }
            cancelEdit(); invalidate();
            // Replicação parcial não é erro: a organização que já tinha o tributo
            // falha no UNIQUE e as demais seguem.
            showToast(failed.length ? `Criado em ${ok} de ${ok + failed.length} organizações (${partialFailureNote(failed)}).`
                : ok > 1 ? `Tributo criado em ${ok} organizações` : 'Tributo criado com sucesso', 'success');
        },
        onError: (e: any) => showToast(e.message || 'Erro ao criar.', 'error'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<TaxSettingInput> }) => taxSettingsService.update(id, input),
        onSuccess: () => { cancelEdit(); invalidate(); showToast('Tributo atualizado com sucesso', 'success'); },
        onError: (e: any) => showToast(e.message || 'Erro ao atualizar.', 'error'),
    });

    const removeMut = useMutation({
        mutationFn: taxSettingsService.remove,
        onSuccess: () => { invalidate(); showToast('Tributo excluído', 'success'); },
        onError: (e: any) => showToast(e.message || 'Erro ao excluir.', 'error'),
    });

    const seedMut = useMutation({
        mutationFn: (target: WriteTarget) =>
            forEachTargetOrg(target, orgId => taxSettingsService.seedDefaults(orgId)),
        onSuccess: ({ ok, failed }) => {
            invalidate();
            if (ok === 0) {
                const e = failed[0]?.error;
                showToast(errorMessage(e, 'Erro ao criar tributos padrão.'), 'error');
                return;
            }
            showToast(ok > 1 ? `Tributos padrão criados em ${ok} organizações` : 'Tributos padrão criados.', 'success');
        },
        onError: (e: any) => showToast(e.message || 'Erro ao criar tributos padrão.', 'error'),
    });

    const handleSeedDefaults = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        seedMut.mutate(target);
    };

    const startAdd = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setCreateTarget(target);
        setIsAdding(true); setEditingId(null); setForm(emptyForm);
    };
    const startEdit = (item: TaxSetting) => {
        setEditingId(item.id);
        setIsAdding(false);
        setForm({ nome: item.nome, aliquota: item.aliquota, base_calculo: item.base_calculo, regra_retencao: item.regra_retencao, ativo: item.ativo, aplica_venda_ativo: item.aplica_venda_ativo, aplica_locacao: item.aplica_locacao });
    };
    const cancelEdit = () => { setIsAdding(false); setCreateTarget(null); setEditingId(null); setForm(emptyForm); };

    const handleSave = () => {
        if (!form.nome.trim()) return;
        const input: TaxSettingInput = { ...form, nome: form.nome.trim() };
        if (editingId) updateMut.mutate({ id: editingId, input });
        else if (createTarget) createMut.mutate({ target: createTarget, input });
    };

    const handleDelete = async (item: TaxSetting) => {
        if (!await confirm({ title: 'Excluir tributo?', message: `Tem certeza que deseja excluir "${item.nome}"?`, variant: 'danger' })) return;
        removeMut.mutate(item.id);
    };

    const missingDefaults = useMemo(
        () => DEFAULT_TAX_MODULES.some(nome => !items.some(i => i.nome === nome)),
        [items]
    );

    const filteredItems = useMemo(() =>
        items
            .filter(i => i.nome.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                if (tableColumns.sortColumn === 'nome') {
                    return tableColumns.sortDirection === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
                }
                if (tableColumns.sortColumn === 'aliquota') {
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    return ((a.aliquota ?? -1) - (b.aliquota ?? -1)) * dir;
                }
                if (tableColumns.sortColumn === 'ativo') {
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    return (Number(a.ativo) - Number(b.ativo)) * dir;
                }
                return a.nome.localeCompare(b.nome);
            }),
        [items, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]
    );

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-[10px]">
                        <Landmark className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tributos e Impostos</h2>
                        <p className="text-sm text-gray-500 mt-1">Alíquota, base de cálculo e regra de retenção usados como referência para os tributos da organização.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {missingDefaults && (
                        <button
                            onClick={handleSeedDefaults}
                            disabled={seedMut.isPending}
                            title="Criar Imposto de Renda, PIS, COFINS, CSLL e IRRF"
                            className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                        >
                            {seedMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Criar tributos padrão
                        </button>
                    )}
                    {!isAdding && !editingId && (
                        <button
                            onClick={startAdd}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Novo tributo
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                {(isAdding || editingId) && (
                    <div className="flex items-start gap-2 p-2 border border-indigo-200 rounded-[10px] bg-indigo-50/50 flex-wrap">
                        <input
                            autoFocus
                            type="text"
                            value={form.nome}
                            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                            placeholder="Nome (ex: PIS)"
                            className={`${inputCls} w-40`}
                        />
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.aliquota ?? ''}
                            onChange={e => setForm(f => ({ ...f, aliquota: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                            placeholder="Alíquota %"
                            className={`${inputCls} w-28`}
                        />
                        <input
                            type="text"
                            value={form.base_calculo ?? ''}
                            onChange={e => setForm(f => ({ ...f, base_calculo: e.target.value }))}
                            placeholder="Base de cálculo"
                            className={`${inputCls} flex-1 min-w-[10rem]`}
                        />
                        <input
                            type="text"
                            value={form.regra_retencao ?? ''}
                            onChange={e => setForm(f => ({ ...f, regra_retencao: e.target.value }))}
                            placeholder="Regra de retenção"
                            className={`${inputCls} flex-1 min-w-[10rem]`}
                        />
                        <label className="flex items-center gap-1.5 h-8 px-1 text-sm text-gray-600 shrink-0" title="Incide sobre Vendas de Ativos">
                            <input type="checkbox" checked={form.aplica_venda_ativo} onChange={e => setForm(f => ({ ...f, aplica_venda_ativo: e.target.checked }))} />
                            Venda de Ativo
                        </label>
                        <label className="flex items-center gap-1.5 h-8 px-1 text-sm text-gray-600 shrink-0" title="Incide sobre Locações">
                            <input type="checkbox" checked={form.aplica_locacao} onChange={e => setForm(f => ({ ...f, aplica_locacao: e.target.checked }))} />
                            Locação
                        </label>
                        <label className="flex items-center gap-1.5 h-8 px-1 text-sm text-gray-600 shrink-0">
                            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                            Ativo
                        </label>
                        <button
                            onClick={handleSave}
                            disabled={!form.nome.trim() || createMut.isPending || updateMut.isPending}
                            className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors disabled:opacity-40"
                        >
                            {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar tributo..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={tableColumns.visibleColumns}
                                    showColumnConfig={tableColumns.showColumnConfig}
                                    onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                    onToggleColumn={tableColumns.toggleColumn}
                                    onReset={tableColumns.resetColumns}
                                />
                            </div>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-12">
                            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum tributo cadastrado</h3>
                            <p className="text-sm text-gray-500">
                                {searchTerm ? 'Tente ajustar sua busca.' : 'Clique em "Criar tributos padrão" ou cadastre manualmente.'}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.visibleColumns.includes('nome') && (
                                        <SortableHeader colKey="nome" label="Nome" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('aliquota') && (
                                        <SortableHeader colKey="aliquota" label="Alíquota (%)" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('base_calculo') && (
                                        <th className="px-6 py-2 border-r border-gray-100 text-sm font-semibold text-gray-500">Base de Cálculo</th>
                                    )}
                                    {tableColumns.visibleColumns.includes('regra_retencao') && (
                                        <th className="px-6 py-2 border-r border-gray-100 text-sm font-semibold text-gray-500">Regra de Retenção</th>
                                    )}
                                    {tableColumns.visibleColumns.includes('aplica') && (
                                        <th className="px-6 py-2 border-r border-gray-100 text-sm font-semibold text-gray-500">Aplica a</th>
                                    )}
                                    {tableColumns.visibleColumns.includes('ativo') && (
                                        <SortableHeader colKey="ativo" label="Ativo" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredItems.map(item => (
                                    <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.visibleColumns.includes('nome') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.nome}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('aliquota') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-700">
                                                {item.aliquota !== null ? `${item.aliquota.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%` : '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('base_calculo') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.base_calculo || '—'}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('regra_retencao') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.regra_retencao || '—'}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('aplica') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {(() => {
                                                    const parts: string[] = [];
                                                    if (item.aplica_venda_ativo) parts.push('Venda de Ativo');
                                                    if (item.aplica_locacao) parts.push('Locação');
                                                    return parts.length ? parts.join(' · ') : <span className="text-gray-400">—</span>;
                                                })()}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('ativo') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm">
                                                <span className={item.ativo ? 'text-emerald-600' : 'text-gray-400'}>{item.ativo ? 'Sim' : 'Não'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <ActionIconButton kind="edit" onClick={() => startEdit(item)} />
                                                    <ActionIconButton kind="delete" disabled={removeMut.isPending} onClick={() => handleDelete(item)} />
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
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
};

export default TaxSettingsManager;
