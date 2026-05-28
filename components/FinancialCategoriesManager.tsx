import React, { useState, useMemo } from 'react';
import {
    Tag, Plus, Trash2, Edit3, Check, X, RefreshCw,
    Loader2, Search, AlertTriangle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { STALE } from '../lib/queryClient';

// ── Service inline (simples — só 3 colunas) ───────────────────────────────────

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
        const { error } = await supabase
            .from('financial_categories')
            .insert({ name: name.trim() });
        if (error) throw error;
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

// ── Component ─────────────────────────────────────────────────────────────────

const FinancialCategoriesManager: React.FC = () => {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [newName, setNewName] = useState('');
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [syncing, setSyncing] = useState(false);

    const { data: categories = [], isLoading } = useQuery({
        queryKey: ['financial-categories'],
        queryFn: catService.list,
        staleTime: STALE.normal,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ['financial-categories'] });

    const createMut = useMutation({
        mutationFn: catService.create,
        onSuccess: () => { setNewName(''); setAdding(false); invalidate(); },
        onError: (e: any) => alert(e.message?.includes('unique') ? 'Categoria já existe.' : (e.message || 'Erro ao criar.')),
    });

    const renameMut = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => catService.rename(id, name),
        onSuccess: () => { setEditingId(null); invalidate(); },
        onError: (e: any) => alert(e.message?.includes('unique') ? 'Já existe uma categoria com esse nome.' : (e.message || 'Erro ao renomear.')),
    });

    const removeMut = useMutation({
        mutationFn: catService.remove,
        onSuccess: invalidate,
        onError: (e: any) => alert(e.message || 'Erro ao excluir.'),
    });

    const handleSync = async () => {
        setSyncing(true);
        try {
            const count = await catService.syncFromTransactions();
            invalidate();
            alert(count > 0
                ? `Sincronização concluída: ${count} categorias encontradas nas transações.`
                : 'Nenhuma categoria nova encontrada nas transações.');
        } catch (e: any) {
            alert(e.message || 'Erro ao sincronizar.');
        } finally {
            setSyncing(false);
        }
    };

    const handleAddKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newName.trim()) createMut.mutate(newName.trim());
        if (e.key === 'Escape') { setAdding(false); setNewName(''); }
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && editingName.trim() && editingId) renameMut.mutate({ id: editingId, name: editingName.trim() });
        if (e.key === 'Escape') setEditingId(null);
    };

    const filtered = useMemo(() =>
        categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
        [categories, search]
    );

    return (
        <div className="max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Tag className="w-5 h-5 text-indigo-600" />
                        Categorias Financeiras
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Fonte de verdade para conciliação bancária, transações e regras de automação
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                        title="Importar categorias já usadas em transações e regras"
                    >
                        {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Sincronizar de transações
                    </button>
                    <button
                        onClick={() => { setAdding(true); setTimeout(() => document.getElementById('new-cat-input')?.focus(), 50); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-900/20"
                    >
                        <Plus className="w-3.5 h-3.5" /> Nova categoria
                    </button>
                </div>
            </div>

            {/* Aviso de uso */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-700 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                Excluir uma categoria não afeta transações ou regras já criadas com esse nome — apenas remove a opção das listas de seleção futuras.
            </div>

            {/* Busca */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                    placeholder="Buscar categoria..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Lista */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Linha de adicionar */}
                {adding && (
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-indigo-50">
                        <Tag className="w-4 h-4 text-indigo-400 shrink-0" />
                        <input
                            id="new-cat-input"
                            className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200 transition-all"
                            placeholder="Nome da categoria..."
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={handleAddKeyDown}
                        />
                        <button
                            onClick={() => { if (newName.trim()) createMut.mutate(newName.trim()); }}
                            disabled={!newName.trim() || createMut.isPending}
                            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
                        >
                            {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            onClick={() => { setAdding(false); setNewName(''); }}
                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <Tag className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-400">
                            {search ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}
                        </p>
                        {!search && (
                            <p className="text-xs text-slate-300 mt-1">
                                Adicione manualmente ou clique em "Sincronizar de transações".
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {filtered.length} categoria{filtered.length !== 1 ? 's' : ''}
                                {search && ` • filtradas de ${categories.length}`}
                            </span>
                        </div>
                        <ul className="divide-y divide-slate-50">
                            {filtered.map(cat => (
                                <li key={cat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                                    <Tag className="w-4 h-4 text-indigo-300 shrink-0" />

                                    {editingId === cat.id ? (
                                        <>
                                            <input
                                                autoFocus
                                                className="flex-1 border border-indigo-200 rounded-lg px-3 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200 transition-all bg-white"
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                onKeyDown={handleRenameKeyDown}
                                            />
                                            <button
                                                onClick={() => { if (editingName.trim()) renameMut.mutate({ id: cat.id, name: editingName.trim() }); }}
                                                disabled={!editingName.trim() || renameMut.isPending}
                                                className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
                                            >
                                                {renameMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5 text-slate-400" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                                                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                                                    title="Renomear"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                                </button>
                                                <button
                                                    onClick={() => { if (confirm(`Excluir "${cat.name}"?`)) removeMut.mutate(cat.id); }}
                                                    disabled={removeMut.isPending}
                                                    className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};

export default FinancialCategoriesManager;
