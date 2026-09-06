import React from 'react';
import { LayoutGrid, List, Plus, RefreshCw, Settings2, Tag, Trash2 } from 'lucide-react';
import type { RegraDeConciliacao } from './RulesTab';

/**
 * Aba "Categorias" da Conciliação Bancária.
 *
 * Segunda aba extraída de `BankReconciliation.tsx` (item 3.4 do plano), depois de Regras.
 * A quebra vai uma aba por vez, com conferência visual de cada uma.
 *
 * Ao contrário de Regras, esta aba **não tem modal** — renomear e criar usam `prompt` do
 * próprio navegador, dentro dos handlers que ficaram no pai. Por isso ela é só um
 * componente, sem o irmão `fixed` que Regras precisou.
 *
 * A contagem "N regras ativas" é derivada de `rules` aqui dentro, como era no pai: a
 * categoria não guarda quantas regras a usam, isso se conta na hora.
 */

interface Props {
    uniqueCategories: string[];
    rules: RegraDeConciliacao[];
    categoriesViewMode: 'grid' | 'list';
    setCategoriesViewMode: (m: 'grid' | 'list') => void;
    isLoading: boolean;
    onAddCategory: (name: string) => void;
    onRenameCategory: (oldName: string, newName: string) => void;
    onDuplicateCategory: (catName: string) => void;
    onDeleteCategory: (catName: string) => void;
    onSyncCategories: () => void;
}

export default function CategoriesTab({
    uniqueCategories, rules, categoriesViewMode, setCategoriesViewMode, isLoading,
    onAddCategory, onRenameCategory, onDuplicateCategory, onDeleteCategory, onSyncCategories,
}: Props) {
    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-4">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Gestão de Categorias
                </h4>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => setCategoriesViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${categoriesViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Linha"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setCategoriesViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${categoriesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600">{uniqueCategories.length} Categorias</span>
                    <button
                        onClick={onSyncCategories}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                        title="Importar categorias já usadas em transações e regras"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sincronizar
                    </button>
                    <button
                        onClick={() => {
                            const name = prompt('Nome da nova categoria:');
                            if (name) onAddCategory(name);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nova categoria
                    </button>
                </div>
            </div>

            <div className={categoriesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                {uniqueCategories.map(cat => {
                    const ruleCount = rules.filter(r => r.actions?.category === cat).length;
                
                    if (categoriesViewMode === 'list') {
                        return (
                            <div key={cat} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all">
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                                    {cat.charAt(0).toUpperCase()}
                                </div>
                            
                                <div className="flex-1 min-w-0">
                                    <h6 className="text-xs font-black text-gray-900 uppercase truncate mb-0.5">{cat}</h6>
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{ruleCount} {ruleCount === 1 ? 'Regra ativa' : 'Regras ativas'}</span>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            const newName = prompt('Novo nome para a categoria:', cat);
                                            if (newName) onRenameCategory(cat, newName);
                                        }}
                                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Renomear"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => onDuplicateCategory(cat)}
                                        className="p-2 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-all"
                                        title="Duplicar"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => onDeleteCategory(cat)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={cat} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-lg">
                                    {cat.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h6 className="text-sm font-black text-gray-900 uppercase truncate">{cat}</h6>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{ruleCount} {ruleCount === 1 ? 'Regra ativa' : 'Regras ativas'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <button 
                                    onClick={() => {
                                        const newName = prompt('Novo nome para a categoria:', cat);
                                        if (newName) onRenameCategory(cat, newName);
                                    }}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-blue-50/50 hover:bg-blue-50 text-blue-600 rounded-2xl transition-all"
                                >
                                    <Settings2 className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Renomear</span>
                                </button>
                                <button 
                                    onClick={() => onDuplicateCategory(cat)}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-purple-50/50 hover:bg-purple-50 text-purple-600 rounded-2xl transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Duplicar</span>
                                </button>
                                <button 
                                    onClick={() => onDeleteCategory(cat)}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 bg-red-50/50 hover:bg-red-50 text-red-600 rounded-2xl transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">Excluir</span>
                                </button>
                            </div>

                            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-emerald-50/20 rounded-full blur-2xl group-hover:bg-emerald-50/40 transition-all" />
                        </div>
                    );
                })}

                {uniqueCategories.length === 0 && (
                    <div className="md:col-span-2 lg:col-span-3 bg-white border-2 border-dashed border-gray-100 rounded-[2.5rem] p-16 text-center">
                        <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <Tag className="w-10 h-10" />
                        </div>
                        <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Nenhuma categoria ativa</h5>
                        <p className="text-xs text-gray-400">As categorias aparecem aqui automaticamente quando você as define nas regras de automação.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
