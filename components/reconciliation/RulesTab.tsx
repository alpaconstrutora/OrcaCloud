import React from 'react';
import {
    Zap, Plus, Trash2, Search, Brain, LayoutGrid, List, Briefcase, Settings2, ShieldCheck,
    Info, DollarSign,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';

/**
 * Aba "Regras de Automação" da Conciliação Bancária.
 *
 * Primeira aba extraída de `BankReconciliation.tsx` (item 3.4 do plano). O pai tinha
 * 5.971 linhas e onze abas; a quebra vai UMA POR VEZ, com conferência visual de cada
 * uma, porque é refatoração sem rede: a suíte cobre regra de negócio, não layout.
 *
 * Esta foi a escolhida para começar por ser a menor e a mais isolada — não compartilha
 * estado com nenhuma outra aba, e tudo que precisa cabe em props.
 *
 * ⚠️ O tipo da regra é o que o PAI declara localmente, e NÃO o `ReconciliationRule` de
 * `types/financial.ts`: naquele, `conditions` e `actions` são `Record<string, unknown>`, e
 * ler `conditions.value` de um `unknown` não compila. A forma abaixo é a mesma do local.
 */

export type RegraDeConciliacao = {
    id: string;
    name: string;
    priority: number;
    is_active: boolean;
    organization_id: string;
    conditions: { type: string; field: string; value: string };
    actions: { category: string; counterparty?: string };
    created_at?: string;
    [key: string]: unknown;
};

export interface NovaRegra {
    name: string;
    conditionValue: string;
    category: string;
    clientName: string;
    supplierName: string;
}

interface PropsLista {
    rules: RegraDeConciliacao[];
    rulesViewMode: 'grid' | 'list';
    setRulesViewMode: (m: 'grid' | 'list') => void;
    selectedRuleIds: Set<string>;
    setSelectedRuleIds: (s: Set<string>) => void;
    isLoading: boolean;
    selectedAccountId: string | null;
    setShowRuleModal: (v: boolean) => void;
    onEditRule: (rule: RegraDeConciliacao) => void;
    onDeleteRule: (ruleId: string) => void;
    onApplyRulesManually: () => void;
    onApplySelectedRules: () => void;
}

export default function RulesTab({
    rules, rulesViewMode, setRulesViewMode, selectedRuleIds, setSelectedRuleIds,
    isLoading, selectedAccountId, setShowRuleModal, onEditRule, onDeleteRule,
    onApplyRulesManually, onApplySelectedRules,
}: PropsLista) {
    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Regras de Automação
                </h4>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => setRulesViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${rulesViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Linha"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setRulesViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${rulesViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={onApplyRulesManually}
                        disabled={isLoading || !selectedAccountId}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-100 transition-all disabled:opacity-50"
                        title="Re-aplicar todas as regras e matching"
                    >
                        <Zap className="w-4 h-4" />
                        Aplicar Regras Agora
                    </button>
                    {selectedRuleIds.size > 0 && (
                        <button 
                            onClick={onApplySelectedRules}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 animate-in slide-in-from-right"
                        >
                            <Zap className="w-4 h-4" />
                            Aplicar Selecionadas ({selectedRuleIds.size})
                        </button>
                    )}
                    <button 
                        onClick={() => setShowRuleModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-100 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Regra
                    </button>
                </div>
            </div>

            {rules.length > 0 && (
                <div className="flex items-center gap-2 px-4 mb-2">
                    <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        checked={rules.length > 0 && rules.every(r => selectedRuleIds.has(r.id))}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setSelectedRuleIds(new Set(rules.map(r => r.id)));
                            } else {
                                setSelectedRuleIds(new Set());
                            }
                        }}
                    />
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Selecionar Todas</span>
                </div>
            )}

            <div className={rulesViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "space-y-3"}>

                {rules.length === 0 ? (
                    <div className="md:col-span-2 bg-white border-2 border-dashed border-gray-100 rounded-[2.5rem] p-12 text-center">
                        <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-4">
                            <Zap className="w-8 h-8" />
                        </div>
                        <h5 className="text-sm font-black text-gray-400 uppercase">Nenhuma regra ativa</h5>
                        <p className="text-xs text-gray-400 mt-2">Crie regras para automatizar a categorização e o matching de transações recorrentes.</p>
                    </div>
                ) : (
                    rules.map(rule => (
                        rulesViewMode === 'grid' ? (
                            <div key={rule.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden">
                                <div className="absolute top-0 left-0 p-4 z-10">
                                    <input 
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                        checked={selectedRuleIds.has(rule.id)}
                                        onChange={(e) => {
                                            const next = new Set(selectedRuleIds);
                                            if (e.target.checked) next.add(rule.id);
                                            else next.delete(rule.id);
                                            setSelectedRuleIds(next);
                                        }}
                                    />
                                </div>
                                <div className="absolute top-0 right-0 p-4 flex gap-1.5">
                                    <ActionIconButton kind="edit" title="Editar Regra" icon={<Settings2 className="w-4 h-4" />} onClick={() => onEditRule(rule)} />
                                    <ActionIconButton kind="delete" title="Excluir Regra" onClick={() => onDeleteRule(rule.id)} />
                                </div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h6 className="text-sm font-black text-gray-900 uppercase truncate">{rule.name}</h6>
                                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Prioridade {rule.priority}</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Se a descrição contiver:</p>
                                        <p className="text-xs font-bold text-gray-700">"{rule.conditions.value}"</p>
                                    </div>
                                    <div className="bg-emerald-50/30 p-3 rounded-xl border border-emerald-100/50">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Então categorizar como:</p>
                                        <p className="text-xs font-bold text-emerald-700">{rule.actions.category}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={rule.id} className={`bg-white p-4 rounded-2xl border transition-all flex items-center gap-4 group hover:shadow-md ${selectedRuleIds.has(rule.id) ? 'border-purple-200 bg-purple-50/20' : 'border-gray-100 shadow-sm'}`}>
                                <div className="flex items-center justify-center shrink-0">
                                    <input 
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer shadow-sm transition-transform hover:scale-110"
                                        checked={selectedRuleIds.has(rule.id)}
                                        onChange={(e) => {
                                            const next = new Set(selectedRuleIds);
                                            if (e.target.checked) next.add(rule.id);
                                            else next.delete(rule.id);
                                            setSelectedRuleIds(next);
                                        }}
                                    />
                                </div>
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0 ml-1">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                            
                                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-8 items-center">
                                    <div className="min-w-0">
                                        <h6 className="text-xs font-black text-gray-900 uppercase truncate mb-0.5">{rule.name}</h6>
                                        <span className="text-[8px] font-black text-purple-400 uppercase tracking-[0.2em]">Prioridade {rule.priority}</span>
                                    </div>

                                    <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 min-w-0">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-0.5">Descrição contém</p>
                                        <p className="text-xs font-bold text-gray-700 truncate">"{rule.conditions.value}"</p>
                                    </div>

                                    <div className="bg-emerald-50/50 px-3 py-1.5 rounded-lg border border-emerald-100/50 min-w-0">
                                        <p className="text-[8px] font-black text-emerald-600 uppercase mb-0.5">Categorizar como</p>
                                        <p className="text-xs font-bold text-emerald-700 truncate">{rule.actions.category}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <ActionIconButton kind="edit" icon={<Settings2 className="w-4 h-4" />} onClick={() => onEditRule(rule)} />
                                    <ActionIconButton kind="delete" onClick={() => onDeleteRule(rule.id)} />
                                </div>
                            </div>
                        )
                    ))
                )}
            </div>

            <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 flex items-start gap-4">
                <Info className="w-5 h-5 text-blue-500 mt-1 shrink-0" />
                <div className="space-y-1">
                    <p className="text-xs font-black text-blue-700 uppercase">Dica de Especialista</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                        Regras de automação são aplicadas assim que você importa o arquivo bancário. 
                        Elas aumentam drasticamente a velocidade de fechamento mensal ao pré-identificar tarifas, impostos e transferências recorrentes.
                    </p>
                </div>
            </div>
        </div>
    );
}

interface PropsModal {
    showRuleModal: boolean;
    setShowRuleModal: (v: boolean) => void;
    editingRuleId: string | null;
    setEditingRuleId: (v: string | null) => void;
    newRule: NovaRegra;
    setNewRule: (r: NovaRegra) => void;
    testeDaRegra: { total: number; exemplos: string[] } | null;
    isLoading: boolean;
    uniqueCategories: string[];
    uniqueClients: string[];
    uniqueSuppliers: string[];
    onCreateRule: () => void;
    onTestarRegra: () => void;
    onSugerirRegrasDaMemoria: () => void;
}

/**
 * O formulário fica FORA de `RulesTab` de propósito. Ele é `fixed inset-0`, e o wrapper da
 * aba tem `animate-in slide-in-from-bottom-4`, cujo `animation-fill-mode: both` deixa um
 * `transform` no elemento mesmo depois de a animação acabar. Ancestral com transform vira o
 * bloco de contenção de um `fixed` — o modal deixaria de cobrir a tela e passaria a cobrir só
 * a área da aba. Por isso o pai continua montando este componente no topo do seu `return`,
 * exatamente onde o JSX inline estava.
 */
export function RuleFormModal({
    showRuleModal, setShowRuleModal, editingRuleId, setEditingRuleId,
    newRule, setNewRule, testeDaRegra, isLoading,
    uniqueCategories, uniqueClients, uniqueSuppliers,
    onCreateRule, onTestarRegra, onSugerirRegrasDaMemoria,
}: PropsModal) {
    if (!showRuleModal) return null;
    return (
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
                    <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase">
                                {editingRuleId ? 'Editar Regra' : 'Nova Regra'}
                            </h3>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                {editingRuleId ? 'Atualize os critérios de automação' : 'Automatize seu financeiro'}
                            </p>
                        </div>
                        <button 
                            onClick={() => {
                                setShowRuleModal(false);
                                setEditingRuleId(null);
                                setNewRule({ name: '', conditionValue: '', category: '', clientName: '', supplierName: '' });
                            }} 
                            className="text-gray-300 hover:text-gray-900 transition-colors"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Regra</label>
                            <input 
                                type="text" 
                                value={newRule.name}
                                onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                                placeholder="Ex: Tarifas Bancárias"
                                className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Se a descrição contiver</label>
                            <input 
                                type="text" 
                                value={newRule.conditionValue}
                                onChange={(e) => setNewRule({...newRule, conditionValue: e.target.value})}
                                placeholder="Ex: IOF, TARIFA, PIX"
                                className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={onTestarRegra}
                                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-100 hover:bg-blue-50 transition-all"
                                >
                                    <Search className="w-[15px] h-[15px]" />
                                    Testar
                                </button>
                                <button
                                    type="button"
                                    onClick={onSugerirRegrasDaMemoria}
                                    disabled={isLoading}
                                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-100 hover:bg-blue-50 transition-all disabled:opacity-50"
                                    title="Preencher a partir de uma contraparte já classificada muitas vezes"
                                >
                                    <Brain className="w-[15px] h-[15px]" />
                                    Sugerir da memória
                                </button>
                                {testeDaRegra && (
                                    <span className="text-sm text-gray-600">
                                        {testeDaRegra.total === 0
                                            ? 'Nenhum lançamento carregado seria afetado.'
                                            : `${testeDaRegra.total} lançamento(s) carregado(s) seriam afetados.`}
                                    </span>
                                )}
                            </div>
                            {testeDaRegra && testeDaRegra.exemplos.length > 0 && (
                                <ul className="mt-1 space-y-1">
                                    {testeDaRegra.exemplos.map((ex, i) => (
                                        <li key={i} className="text-xs text-gray-500">{ex}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Atribuir Cliente (Receita)</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center group-focus-within:bg-blue-600 group-focus-within:text-white transition-all">
                                        <Briefcase className="w-4 h-4" />
                                    </div>
                                    <input 
                                        list="client-suggestions"
                                        type="text" 
                                        placeholder="Ex: Cliente Alpha..." 
                                        value={newRule.clientName || ''}
                                        onChange={(e) => setNewRule({ ...newRule, clientName: e.target.value, supplierName: '' })}
                                        className="w-full pl-14 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-form-input font-bold transition-all outline-none"
                                    />
                                    <datalist id="client-suggestions">
                                        {uniqueClients.map(ent => (
                                            <option key={ent} value={ent} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Atribuir Credor (Despesa)</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center group-focus-within:bg-amber-600 group-focus-within:text-white transition-all">
                                        <DollarSign className="w-4 h-4" />
                                    </div>
                                    <input 
                                        list="supplier-suggestions"
                                        type="text" 
                                        placeholder="Ex: Posto Shell..." 
                                        value={newRule.supplierName || ''}
                                        onChange={(e) => setNewRule({ ...newRule, supplierName: e.target.value, clientName: '' })}
                                        className="w-full pl-14 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-amber-500 focus:bg-white rounded-2xl text-form-input font-bold transition-all outline-none"
                                    />
                                    <datalist id="supplier-suggestions">
                                        {uniqueSuppliers.map(ent => (
                                            <option key={ent} value={ent} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Categorizar como</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    list="existing-categories"
                                    value={newRule.category}
                                    onChange={(e) => setNewRule({...newRule, category: e.target.value})}
                                    placeholder="Ex: Despesas Bancárias"
                                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                                <datalist id="existing-categories">
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-3">
                        <button 
                            onClick={() => setShowRuleModal(false)}
                            className="flex-1 px-6 py-4 bg-white border border-gray-100 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={onCreateRule}
                            className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                        >
                            {editingRuleId ? 'Salvar Alterações' : 'Criar Regra'}
                        </button>
                    </div>
                </div>
            </div>
    );
}
