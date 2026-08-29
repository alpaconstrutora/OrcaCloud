import React, { useMemo } from 'react';
import {
    Tag, Plus, Check, X, RefreshCw,
    Loader2, Search, AlertTriangle
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { STALE } from '../lib/queryClient';
import { financialRegistryService } from '../services/financialRegistryService';

// ── Service inline (simples — só 2 colunas) ───────────────────────────────────

interface FinancialCategory {
    id: string;
    name: string;
}

const catService = {
    async list(): Promise<FinancialCategory[]> {
        const { data, error } = await supabase
            .from('financial_categories')
            .select('id, name')
            .order('name');
        if (error) throw error;
        return data || [];
    },

    async create(name: string): Promise<void> {
        await financialRegistryService.getOrCreateChartOfAccountByName(name);
    },

    async rename(id: string, name: string): Promise<void> {
        const { error } = await supabase
            .from('financial_categories')
            .update({ name: name.trim() })
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('financial_categories')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // Lê categorias já usadas em transações e regras para sincronizar
    async syncFromTransactions(): Promise<number> {
        const [
            { data: intCats },
            { data: bankCats },
            { data: ruleCats },
        ] = await Promise.all([
            supabase.from('internal_transactions').select('category').not('category', 'is', null),
            supabase.from('bank_transactions').select('category').not('category', 'is', null),
            supabase.from('reconciliation_rules').select('actions').not('actions', 'is', null),
        ]);

        const cats = new Set<string>();
        intCats?.forEach((r: any)  => { if (r.category)           cats.add(r.category); });
        bankCats?.forEach((r: any) => { if (r.category)           cats.add(r.category); });
        ruleCats?.forEach((r: any) => { if (r.actions?.category)  cats.add(r.actions.category); });

        if (cats.size === 0) return 0;
        const rows = Array.from(cats).map(name => ({ name }));
        const { error } = await supabase
            .from('financial_categories')
            .upsert(rows, { onConflict: 'name', ignoreDuplicates: true });
        if (error) throw error;
        return cats.size;
    },
};

const CATEGORY_COLUMNS: ColumnConfig[] = [
    { key: 'name',    label: 'Nome', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica de fora: é célula fixa, não entra no
// arraste (mesmo padrão de ClientChargesModule.tsx).
const CATEGORY_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Nome', className: 'px-6 py-2 border-r border-gray-100' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderCategoryCell(
    key: string,
    cat: FinancialCategory,
    opts: { editingId: string | null; editingName: string; setEditingName: (v: string) => void; handleRenameKeyDown: (e: React.KeyboardEvent) => void },
): React.ReactNode {
    const { editingId, editingName, setEditingName, handleRenameKeyDown } = opts;
    switch (key) {
        case 'name':
            return editingId === cat.id ? (
                <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    className="w-full h-8 px-2 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
            ) : cat.name;
        default:
            return null;
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

const FinancialCategoriesManager: React.FC = () => {
    const qc = useQueryClient();
    const { localToast, showToast } = useToast();
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = usePersistedState<string>('financialCategories:search', '');
    const tableColumns = useTableColumns(CATEGORY_COLUMNS, 'financialCategoriesColumns');

    const [newName, setNewName] = React.useState('');
    const [adding, setAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editingName, setEditingName] = React.useState('');
    const [syncing, setSyncing] = React.useState(false);

    const { data: categories = [], isLoading } = useQuery({
        queryKey: ['financial-categories'],
        queryFn: catService.list,
        staleTime: STALE.normal,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ['financial-categories'] });

    const createMut = useMutation({
        mutationFn: catService.create,
        onSuccess: () => { setNewName(''); setAdding(false); invalidate(); showToast('Categoria criada com sucesso', 'success'); },
        onError: (e: any) => showToast(e.message?.includes('unique') ? 'Categoria já existe.' : (e.message || 'Erro ao criar.'), 'error'),
    });

    const renameMut = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => catService.rename(id, name),
        onSuccess: () => { setEditingId(null); invalidate(); showToast('Categoria atualizada com sucesso', 'success'); },
        onError: (e: any) => showToast(e.message?.includes('unique') ? 'Já existe uma categoria com esse nome.' : (e.message || 'Erro ao renomear.'), 'error'),
    });

    const removeMut = useMutation({
        mutationFn: catService.remove,
        onSuccess: () => { invalidate(); showToast('Categoria excluída', 'success'); },
        onError: (e: any) => showToast(e.message || 'Erro ao excluir.', 'error'),
    });

    const handleSync = async () => {
        setSyncing(true);
        try {
            const count = await catService.syncFromTransactions();
            invalidate();
            showToast(count > 0
                ? `Sincronização concluída: ${count} categorias encontradas nas transações.`
                : 'Nenhuma categoria nova encontrada nas transações.', 'success');
        } catch (e: any) {
            showToast(e.message || 'Erro ao sincronizar.', 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async (cat: FinancialCategory) => {
        if (!await confirm({ title: 'Excluir categoria?', message: `Tem certeza que deseja excluir "${cat.name}"? Isso não afeta transações ou regras já criadas com esse nome.`, variant: 'danger' })) return;
        removeMut.mutate(cat.id);
    };

    const handleAddKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newName.trim()) createMut.mutate(newName.trim());
        if (e.key === 'Escape') { setAdding(false); setNewName(''); }
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && editingName.trim() && editingId) renameMut.mutate({ id: editingId, name: editingName.trim() });
        if (e.key === 'Escape') setEditingId(null);
    };

    const filteredCategories = useMemo(() =>
        categories
            .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                if (tableColumns.sortColumn === 'name') {
                    return tableColumns.sortDirection === 'asc'
                        ? a.name.localeCompare(b.name)
                        : b.name.localeCompare(a.name);
                }
                return a.name.localeCompare(b.name); // default sem seleção: nome A-Z
            }),
        [categories, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]
    );

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-[10px]">
                        <Tag className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Categorias Financeiras</h2>
                        <p className="text-sm text-gray-500 mt-1">Fonte de verdade para conciliação bancária, transações e regras de automação.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        title="Importar categorias já usadas em transações e regras"
                        className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                    >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sincronizar de transações
                    </button>
                    {!adding && !editingId && (
                        <button
                            onClick={() => { setAdding(true); setTimeout(() => document.getElementById('new-financial-cat-input')?.focus(), 50); }}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Nova categoria
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                {/* Aviso de uso */}
                <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-[10px] text-xs text-blue-700 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                    Excluir uma categoria não afeta transações ou regras já criadas com esse nome — apenas remove a opção das listas de seleção futuras.
                </div>

                {adding && (
                    <div className="flex items-center gap-2 p-2 border border-indigo-200 rounded-[10px] bg-indigo-50/50">
                        <input
                            id="new-financial-cat-input"
                            autoFocus
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Nome da categoria..."
                            className="flex-1 h-9 px-3 rounded-[6px] border border-gray-200 text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            onKeyDown={handleAddKeyDown}
                        />
                        <button
                            onClick={() => { if (newName.trim()) createMut.mutate(newName.trim()); }}
                            disabled={!newName.trim() || createMut.isPending}
                            className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors disabled:opacity-40"
                        >
                            {createMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                        </button>
                        <button onClick={() => { setAdding(false); setNewName(''); }} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Toolbar acoplada à tabela (§5.2) — mesmo padrão de ClientCategoriesSettings.tsx */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
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

                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="text-center py-12">
                            <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma categoria encontrada</h3>
                            <p className="text-sm text-gray-500">
                                {searchTerm ? 'Tente ajustar sua busca.' : 'Adicione manualmente ou clique em "Sincronizar de transações".'}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = CATEGORY_COLUMN_HEADERS[key];
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
                                {filteredCategories.map(cat => (
                                    <tr key={cat.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {renderCategoryCell(key, cat, { editingId, editingName, setEditingName, handleRenameKeyDown })}
                                            </td>
                                        ))}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    {editingId === cat.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => { if (editingName.trim()) renameMut.mutate({ id: cat.id, name: editingName.trim() }); }}
                                                                disabled={!editingName.trim() || renameMut.isPending}
                                                                className="p-1.5 text-green-600 hover:bg-green-100 rounded-[6px] transition-colors disabled:opacity-40"
                                                            >
                                                                {renameMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                            </button>
                                                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-[6px] transition-colors">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ActionIconButton kind="edit" onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }} />
                                                            <ActionIconButton kind="delete" disabled={removeMut.isPending} onClick={() => handleDelete(cat)} />
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
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default FinancialCategoriesManager;
