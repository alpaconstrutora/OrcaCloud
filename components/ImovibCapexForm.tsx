import React, { useState, useEffect, useMemo } from 'react';
import { ImovibStudy, ImovibCapexItem, ImovibCapexItemInsert } from '../types';
import { imovibService } from '../services/imovibService';
import { Calculator, ChevronDown, ChevronRight, Save, PieChart, Activity, Leaf, Trash2, Plus, Edit2 } from 'lucide-react';
import { useImovibMath } from '../hooks/useImovibMath';

interface ImovibCapexFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const DEFAULT_CAPEX_TEMPLATE = [
    // 1. Terreno
    { category: '1. Terreno', name: 'ITBI na Aquisição', value_type: 'percent', value: 3 },
    { category: '1. Terreno', name: 'Escritura e Registro', value_type: 'percent', value: 1.5 },
    { category: '1. Terreno', name: 'Comissão Imobiliária (Terreno)', value_type: 'percent', value: 6 },
    { category: '1. Terreno', name: 'Topografia e Sondagem', value_type: 'currency', value: 15000 },

    // 2. Projetos e Consultorias
    { category: '2. Projetos e Consultorias', name: 'Projeto Estrutural', value_type: 'currency', value: 0 },
    { category: '2. Projetos e Consultorias', name: 'Projeto Arquitetônico', value_type: 'currency', value: 0 },
    { category: '2. Projetos e Consultorias', name: 'Projetos Complementares', value_type: 'currency', value: 0 },
    { category: '2. Projetos e Consultorias', name: 'Projeto Legal/Aprovação', value_type: 'currency', value: 0 },
    { category: '2. Projetos e Consultorias', name: 'Pesquisa de Mercado', value_type: 'currency', value: 10000 },

    // 3. Construção Direta (Calculated implicitly or overridden here?) 
    // Usually, construction is derived from Blocks. but some lines are fixed. 
    // We will leave an explicit entry if they want to pad it, but mainly we use the block's cost.
    { category: '3. Construção (Adicional)', name: 'Fundações Especiais', value_type: 'currency', value: 0 },
    { category: '3. Construção (Adicional)', name: 'Paisagismo e Áreas Comuns', value_type: 'currency', value: 0 },

    // 4. Construção Indireta & Canteiro (BDI)
    { category: '4. Construção Indireta', name: 'Instalação de Canteiro', value_type: 'currency', value: 0 },
    { category: '4. Construção Indireta', name: 'Administração Local', value_type: 'percent', value: 4 }, // % do custo de obra
    { category: '4. Construção Indireta', name: 'Equipamentos (Grua, Elevador)', value_type: 'currency', value: 0 },

    // 5. Marketing e Vendas
    { category: '5. Marketing e Vendas', name: 'Stand de Vendas', value_type: 'currency', value: 0 },
    { category: '5. Marketing e Vendas', name: 'Apto Decorado', value_type: 'currency', value: 0 },
    { category: '5. Marketing e Vendas', name: 'Verba de Lançamento (Mídia)', value_type: 'percent', value: 1.5 }, // % do VGV
    { category: '5. Marketing e Vendas', name: 'Comissão de Corretores', value_type: 'percent', value: 5 }, // % do VGV
    { category: '5. Marketing e Vendas', name: 'Gestão Comercial / House', value_type: 'percent', value: 1 }, // % do VGV

    // 6. Despesas Legais e Incorporação
    { category: '6. Legais e Incorporação', name: 'Registro de Incorporação (RI)', value_type: 'currency', value: 15000 },
    { category: '6. Legais e Incorporação', name: 'Alvarás e Taxas Municipais', value_type: 'currency', value: 0 },
    { category: '6. Legais e Incorporação', name: 'EIA/RIMA ou EIV', value_type: 'currency', value: 0 },
    { category: '6. Legais e Incorporação', name: 'Outorga Onerosa', value_type: 'currency', value: 0 },

    // 7. Impostos Consolidados
    { category: '7. Impostos', name: 'RET (Regime Especial)', value_type: 'percent', value: 4 }, // % do VGV Recebido
    { category: '7. Impostos', name: 'PIS/COFINS/IRPJ/CSLL (Normal)', value_type: 'percent', value: 6.73 },

    // 8. Despesas Financeiras
    { category: '8. Financeiras', name: 'Taxas de Estruturação (Plano Empresário)', value_type: 'percent', value: 1.5 }, // % do Financiamento
    { category: '8. Financeiras', name: 'Juros SFH / Construção', value_type: 'percent', value: 0 },

    // 9. Contingência
    { category: '9. Contingência', name: 'Fundo de Reserva', value_type: 'percent', value: 2 }, // % da Receita ou Custo
];

const ImovibCapexForm: React.FC<ImovibCapexFormProps> = ({ study, onDataChanged }) => {
    const [items, setItems] = useState<ImovibCapexItem[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const math = useImovibMath(study);

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, ImovibCapexItem[]> = {};
        items.forEach(item => {
            if (!groups[item.category]) groups[item.category] = [];
            groups[item.category].push(item);
        });
        return groups;
    }, [items]);

    const categories = useMemo(() => Object.keys(groupedItems).sort(), [groupedItems]);

    useEffect(() => {
        const fetchOrSeed = async () => {
            setInitializing(true);
            try {
                // Sempre busca do banco para evitar duplicatas por race condition
                const { data: existing, error } = await (await import('../lib/supabase')).supabase
                    .from('imovib_capex_items')
                    .select('*')
                    .eq('study_id', study.id)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (existing && existing.length > 0) {
                    // Já tem itens — só exibe
                    setItems(existing);
                    const uniqueCats = Array.from(new Set(existing.map((i: any) => i.category))).sort() as string[];
                    setExpandedCategories(uniqueCats.slice(0, 2));
                } else {
                    // Banco vazio para este estudo — seed inicial
                    const toInsert: ImovibCapexItemInsert[] = DEFAULT_CAPEX_TEMPLATE.map(t => ({
                        study_id: study.id,
                        category: t.category,
                        name: t.name,
                        value_type: t.value_type as 'currency' | 'percent',
                        value: t.value
                    }));
                    const inserted = await imovibService.upsertCapexItems(toInsert);
                    setItems(inserted);
                    if (inserted.length > 0) {
                        const uniqueCats = Array.from(new Set(inserted.map(i => i.category))).sort();
                        setExpandedCategories(uniqueCats.slice(0, 2));
                    }
                    onDataChanged();
                }
            } catch (e) {
                console.error("Failed to seed capex", e);
            } finally {
                setInitializing(false);
            }
        };

        fetchOrSeed();
    }, [study.id]); // re-run only if study changes

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleUpdateItem = async (id: string, updates: Partial<ImovibCapexItem>) => {
        // Optimistic UI update
        const origItems = [...items];
        setItems(items.map(i => i.id === id ? { ...i, ...updates } : i));

        try {
            setIsSaving(true);
            await imovibService.updateCapexItem(id, updates);
            onDataChanged();
        } catch (e) {
            console.error("Failed to update item", e);
            alert('Erro ao salvar item CAPEX.');
            setItems(origItems); // revert
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (!window.confirm('Excluir este item do orçamento?')) return;
        
        try {
            setIsSaving(true);
            await imovibService.deleteCapexItem(id);
            setItems(items.filter(i => i.id !== id));
            onDataChanged();
        } catch (e) {
            console.error("Failed to delete item", e);
            alert('Erro ao excluir item.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddItem = async (category: string) => {
        const name = window.prompt('Nome do novo item:');
        if (!name) return;

        const newItem: ImovibCapexItemInsert = {
            study_id: study.id,
            category,
            name,
            value_type: 'currency',
            value: 0
        };

        try {
            setIsSaving(true);
            const inserted = await imovibService.upsertCapexItems([newItem]);
            setItems([...items, ...inserted]);
            onDataChanged();
        } catch (e) {
            console.error("Failed to add item", e);
            alert('Erro ao adicionar item.');
        } finally {
            setIsSaving(false);
        }
    };

    const expandAll = () => setExpandedCategories(categories);
    const collapseAll = () => setExpandedCategories([]);

    if (initializing) {
        return (
            <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex flex-col items-center">
                    <Activity className="w-8 h-8 text-indigo-500 animate-pulse mb-4" />
                    <p className="text-slate-500 font-bold">Gerando template de orçamento mestre...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Calculator className="w-6 h-6 text-indigo-500" />
                            Orçamento Mestre (CAPEX)
                        </h2>
                        <p className="text-slate-500 text-sm mt-1 font-medium max-w-xl">
                            Gerencie as premissas de custos indiretos, marketing, comissões, legais e financeiras.
                            Os valores monetários (R$) são custos fixos, e os percentuais (%) incidem sobre a Base (VGV, Custo de Obra, etc) na hora de simular.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={expandAll} className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">Expandir Tudo</button>
                        <button onClick={collapseAll} className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">Recolher Tudo</button>
                    </div>
                </div>

                {math.esgCostTotal > 0 && (
                    <div className="mb-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                                <Leaf className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-emerald-900 tracking-tight">Custo Provisionado: Medidas ESG</h4>
                                <p className="text-xs text-emerald-700 font-medium">Investimento calculado automaticamente com base nas Iniciativas Sustentáveis (Aba Parecer).</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="block text-lg font-black text-emerald-700">
                                + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(math.esgCostTotal)}
                            </span>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {categories.map(category => (
                        <div key={category} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm transition-all">
                            {/* Accordion Header */}
                            <button
                                onClick={() => toggleCategory(category)}
                                className="w-full px-6 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-1 rounded-md transition-transform ${expandedCategories.includes(category) ? 'rotate-90 bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-800 tracking-tight">{category}</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200">
                                        {groupedItems[category].length} itens
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleAddItem(category); }}
                                        className="p-1 px-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-slate-200 text-indigo-600 border border-slate-200 rounded-md transition-all active:scale-95"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Novo
                                    </button>
                                </div>
                            </button>

                            {/* Accordion Body */}
                            {expandedCategories.includes(category) && (
                                <div className="p-0 border-t border-slate-200">
                                    <table className="w-full text-left bg-white">
                                        <thead>
                                            <tr className="bg-slate-50/50 text-[10px] font-black tracking-widest uppercase text-slate-400 border-b border-slate-100">
                                                <th className="px-6 py-3 w-1/2">Rubrica / Linha de Custo</th>
                                                <th className="px-6 py-3 w-1/4">Tipo</th>
                                                <th className="px-6 py-3 w-1/4">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {groupedItems[category].map(item => (
                                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-2 group/name">
                                                            <input
                                                                type="text"
                                                                defaultValue={item.name}
                                                                onBlur={(e) => {
                                                                    if (e.target.value !== item.name && e.target.value.trim()) {
                                                                        handleUpdateItem(item.id, { name: e.target.value });
                                                                    }
                                                                }}
                                                                className="bg-transparent border-none focus:ring-0 font-bold text-sm text-slate-700 w-full p-0 py-0.5 hover:bg-slate-100/50 rounded transition-colors focus:bg-white focus:px-2"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <span className={`inline-flex items-center px-2 py-1 text-[10px] font-black tracking-wider uppercase rounded-md ${item.value_type === 'percent'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                            }`}>
                                                            {item.value_type === 'percent' ? 'Percentual (%)' : 'Moeda (R$)'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="relative flex items-center">
                                                            {item.value_type === 'currency' && (
                                                                <span className="absolute left-3 text-slate-400 font-bold text-sm">R$</span>
                                                            )}
                                                            <input
                                                                type="number"
                                                                defaultValue={item.value}
                                                                step={item.value_type === 'percent' ? "0.01" : "1"}
                                                                onBlur={(e) => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    if (val !== item.value) {
                                                                        handleUpdateItem(item.id, { value: val });
                                                                    }
                                                                }}
                                                                className={`w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-xl py-2 px-3 font-bold text-slate-800 transition-all ${item.value_type === 'currency' ? 'pl-9' : 'pr-8 text-right'
                                                                    }`}
                                                            />
                                                            {item.value_type === 'percent' && (
                                                                <span className="absolute right-3 text-slate-400 font-bold text-sm">%</span>
                                                            )}

                                                            {/* Saving indicator overlay */}
                                                            {isSaving && (
                                                                <div className="absolute right-3 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <button 
                                                            onClick={() => handleDeleteItem(item.id)}
                                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                            title="Excluir item"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ImovibCapexForm;
