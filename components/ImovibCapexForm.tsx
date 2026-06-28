import React, { useState, useEffect, useMemo } from 'react';
import { ImovibStudy, ImovibCapexItem, ImovibCapexItemInsert, ImovibRegulatoryZone } from '../types';
import { imovibService } from '../services/imovibService';
import { Calculator, ChevronRight, Activity, Leaf, Trash2, Plus, LayoutList, Zap } from 'lucide-react';
import { useImovibMath } from '../hooks/useImovibMath';

const parseRegVal = (v: string | undefined): number | null => {
    if (!v || v === 'N.A.' || v.trim() === '') return null;
    return parseFloat(v.replace(',', '.')) || null;
};

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

    // 3. Construção (Adicional)
    { category: '3. Construção (Adicional)', name: 'Fundações Especiais', value_type: 'currency', value: 0 },
    { category: '3. Construção (Adicional)', name: 'Paisagismo e Áreas Comuns', value_type: 'currency', value: 0 },

    // 4. Construção Indireta & Canteiro
    { category: '4. Construção Indireta', name: 'Instalação de Canteiro', value_type: 'currency', value: 0 },
    { category: '4. Construção Indireta', name: 'Administração Local', value_type: 'percent', value: 4 },
    { category: '4. Construção Indireta', name: 'Equipamentos (Grua, Elevador)', value_type: 'currency', value: 0 },

    // 5. Marketing e Vendas
    { category: '5. Marketing e Vendas', name: 'Stand de Vendas', value_type: 'currency', value: 0 },
    { category: '5. Marketing e Vendas', name: 'Apto Decorado', value_type: 'currency', value: 0 },
    { category: '5. Marketing e Vendas', name: 'Verba de Lançamento (Mídia)', value_type: 'percent', value: 1.5 },
    { category: '5. Marketing e Vendas', name: 'Comissão de Corretores', value_type: 'percent', value: 5 },
    { category: '5. Marketing e Vendas', name: 'Gestão Comercial / House', value_type: 'percent', value: 1 },

    // 6. Despesas Legais e Incorporação
    { category: '6. Legais e Incorporação', name: 'Registro de Incorporação (RI)', value_type: 'currency', value: 15000 },
    { category: '6. Legais e Incorporação', name: 'Alvarás e Taxas Municipais', value_type: 'currency', value: 0 },
    { category: '6. Legais e Incorporação', name: 'EIA/RIMA ou EIV', value_type: 'currency', value: 0 },
    { category: '6. Legais e Incorporação', name: 'Outorga Onerosa', value_type: 'currency', value: 0 },

    // 7. Impostos Consolidados
    { category: '7. Impostos', name: 'RET (Regime Especial)', value_type: 'percent', value: 4 },
    { category: '7. Impostos', name: 'PIS/COFINS/IRPJ/CSLL (Normal)', value_type: 'percent', value: 6.73 },

    // 8. Despesas Financeiras
    { category: '8. Financeiras', name: 'Taxas de Estruturação (Plano Empresário)', value_type: 'percent', value: 1.5 },
    { category: '8. Financeiras', name: 'Juros SFH / Construção', value_type: 'percent', value: 0 },

    // 9. Contingência
    { category: '9. Contingência', name: 'Fundo de Reserva', value_type: 'percent', value: 2 },
];

const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const ImovibCapexForm: React.FC<ImovibCapexFormProps> = ({ study, onDataChanged }) => {
    const [items, setItems] = useState<ImovibCapexItem[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [landCost, setLandCost] = useState<number>(study.land_cost || 0);
    const [landCostFocused, setLandCostFocused] = useState(false);
    const [zones, setZones] = useState<ImovibRegulatoryZone[]>([]);
    const [blockCosts, setBlockCosts] = useState<Record<string, number>>(
        Object.fromEntries((study.blocks || []).map(b => [b.id, b.construction_cost_sqm || 0]))
    );
    const fmtBRL = (v: number) => v > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : '';

    // Simplified mode local state
    const [capexMode, setCapexMode] = useState<'simplified' | 'detailed'>(study.capex_mode || 'detailed');
    const [simplifiedCostSqm, setSimplifiedCostSqm] = useState<number>(study.capex_simplified_cost_sqm || 0);
    const [simplifiedAreaSqm, setSimplifiedAreaSqm] = useState<number>(study.capex_simplified_area_sqm || 0);

    const math = useImovibMath(study);

    useEffect(() => {
        imovibService.getRegulatoryZones(study.id).then(setZones).catch(console.error);
    }, [study.id]);

    // Área Total = Σ(T.O. × Área do Terreno × Pavimentos) — igual à coluna nas Premissas
    const totalAreaM2 = useMemo(() => {
        const toVal = zones.length ? parseRegVal(zones[0].taxa_ocupacao_maxima) : null;
        const terrArea = study.terreno_area || null;
        const toBase = (toVal != null && terrArea) ? toVal * terrArea : null;
        if (toBase == null) return null;
        let total = 0;
        study.blocks?.forEach(block => {
            block.units?.forEach(u => {
                total += toBase * ((u as any).pavimentos || 1);
            });
        });
        return total;
    }, [study, zones]);

    // Total area from blocks for pre-filling
    const totalBlockArea = useMemo(() => {
        let area = 0;
        study.blocks?.forEach(block => {
            block.units?.forEach(u => {
                area += (u.quantity || 0) * ((u.private_area || 0) + (u.common_area || 0));
            });
        });
        return area;
    }, [study.blocks]);

    const effectiveArea = simplifiedAreaSqm > 0 ? simplifiedAreaSqm : totalBlockArea;
    const simplifiedTotal = effectiveArea * simplifiedCostSqm;

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
                const { data: existing, error } = await (await import('../lib/supabase')).supabase
                    .from('imovib_capex_items')
                    .select('id, study_id, category, subcategory, name, value_type, value, created_at, updated_at')
                    .eq('study_id', study.id)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (existing && existing.length > 0) {
                    setItems(existing);
                    const uniqueCats = Array.from(new Set(existing.map((i: any) => i.category))).sort() as string[];
                    setExpandedCategories(uniqueCats.slice(0, 2));
                } else {
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
                console.error('Failed to seed capex', e);
            } finally {
                setInitializing(false);
            }
        };
        fetchOrSeed();
    }, [study.id]);

    const saveBlockCost = async (blockId: string, value: number) => {
        try {
            await imovibService.updateBlock(blockId, { construction_cost_sqm: value });
            onDataChanged();
        } catch (e) {
            console.error('Failed to save construction_cost_sqm', e);
        }
    };

    const saveLandCost = async (value: number) => {
        try {
            await imovibService.updateStudy(study.id, { land_cost: value } as any);
            onDataChanged();
        } catch (e) {
            console.error('Failed to save land_cost', e);
        }
    };

    const saveMode = async (newMode: 'simplified' | 'detailed') => {
        setCapexMode(newMode);
        try {
            await imovibService.updateStudy(study.id, { capex_mode: newMode });
            onDataChanged();
        } catch (e) {
            console.error('Failed to save capex_mode', e);
        }
    };

    const saveSimplifiedFields = async (costSqm: number, areaSqm: number) => {
        try {
            await imovibService.updateStudy(study.id, {
                capex_simplified_cost_sqm: costSqm,
                capex_simplified_area_sqm: areaSqm || null,
            } as any);
            onDataChanged();
        } catch (e) {
            console.error('Failed to save simplified capex', e);
        }
    };

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleUpdateItem = async (id: string, updates: Partial<ImovibCapexItem>) => {
        const origItems = [...items];
        setItems(items.map(i => i.id === id ? { ...i, ...updates } : i));
        try {
            setIsSaving(true);
            await imovibService.updateCapexItem(id, updates);
            onDataChanged();
        } catch (e) {
            console.error('Failed to update item', e);
            alert('Erro ao salvar item CAPEX.');
            setItems(origItems);
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
            console.error('Failed to delete item', e);
            alert('Erro ao excluir item.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddItem = async (category: string) => {
        const name = window.prompt('Nome do novo item:');
        if (!name) return;
        const newItem: ImovibCapexItemInsert = { study_id: study.id, category, name, value_type: 'currency', value: 0 };
        try {
            setIsSaving(true);
            const inserted = await imovibService.upsertCapexItems([newItem]);
            setItems([...items, ...inserted]);
            onDataChanged();
        } catch (e) {
            console.error('Failed to add item', e);
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
                {/* Header + mode toggle */}
                <div className="flex items-start justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Calculator className="w-6 h-6 text-indigo-500" />
                            Orçamento Mestre (CAPEX)
                        </h2>
                        <p className="text-slate-500 text-sm mt-1 font-medium max-w-xl">
                            {capexMode === 'simplified'
                                ? 'Modo simplificado: custo total calculado por área × preço/m².'
                                : 'Gerencie as premissas de custos indiretos, marketing, comissões, legais e financeiras.'}
                        </p>
                    </div>
                    {/* Mode toggle */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 shrink-0">
                        <button
                            onClick={() => saveMode('simplified')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                capexMode === 'simplified'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Simplificado
                        </button>
                        <button
                            onClick={() => saveMode('detailed')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                capexMode === 'detailed'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <LayoutList className="w-3.5 h-3.5" />
                            Completo
                        </button>
                    </div>
                </div>

                {/* ── ÁREA TOTAL ── */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-4">
                    <label className="block text-form-label font-black uppercase tracking-wider text-slate-500 mb-3">
                        Área Total (m²)
                    </label>
                    <div className="text-2xl font-black text-indigo-700">
                        {totalAreaM2 != null
                            ? totalAreaM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²'
                            : <span className="text-slate-300 text-base font-bold">— preencha T.O. e Área do Terreno nas Premissas</span>
                        }
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-1">
                        Σ (T.O. × Área do Terreno × Pavimentos) por tipologia
                    </p>
                </div>

                {/* ── CUSTO OBRA POR BLOCO ── */}
                {study.blocks && study.blocks.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-4">
                        <label className="block text-form-label font-black uppercase tracking-wider text-slate-500 mb-4">
                            Custo de Obra (R$/m²) por Bloco
                        </label>
                        <div className="space-y-3">
                            {study.blocks.map(block => (
                                <div key={block.id} className="flex items-center gap-4">
                                    <span className="text-sm font-bold text-slate-700 min-w-[120px]">{block.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-bold text-sm">R$</span>
                                        <input
                                            type="number"
                                            value={blockCosts[block.id] ?? block.construction_cost_sqm ?? 0}
                                            onChange={(e) => setBlockCosts(prev => ({ ...prev, [block.id]: parseFloat(e.target.value) || 0 }))}
                                            onBlur={() => saveBlockCost(block.id, blockCosts[block.id] ?? 0)}
                                            className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none font-bold text-slate-800 text-right"
                                        />
                                        <span className="text-slate-400 text-sm font-medium">/m²</span>
                                    </div>
                                    {totalAreaM2 != null && (
                                        <span className="text-sm text-slate-500 font-medium">
                                            = {((blockCosts[block.id] ?? block.construction_cost_sqm ?? 0) * totalAreaM2)
                                                .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── CUSTO DE AQUISIÇÃO DO TERRENO ── */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
                    <label className="block text-form-label font-black uppercase tracking-wider text-amber-700 mb-3">
                        Custo de Aquisição do Terreno (R$)
                    </label>
                    <div className="flex items-center gap-3 max-w-xs">
                        <span className="text-slate-500 font-bold text-sm">R$</span>
                        <input
                            type={landCostFocused ? 'number' : 'text'}
                            value={landCostFocused ? (landCost || '') : fmtBRL(landCost)}
                            placeholder="0,00"
                            onFocus={() => setLandCostFocused(true)}
                            onChange={(e) => setLandCost(parseFloat(e.target.value) || 0)}
                            onBlur={() => { setLandCostFocused(false); saveLandCost(landCost); }}
                            className="flex-1 px-4 py-3 bg-white border border-amber-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none font-bold text-slate-800 text-lg"
                        />
                    </div>
                    <p className="text-xs text-amber-600 font-medium mt-2">
                        Valor usado em: Estática → Aquisição do Terreno
                    </p>
                </div>

                {/* ── SIMPLIFIED MODE ── */}
                {capexMode === 'simplified' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Área */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <label className="block text-form-label font-black uppercase tracking-wider text-slate-400 mb-2">
                                    Área Total (m²)
                                </label>
                                {totalBlockArea > 0 && simplifiedAreaSqm === 0 && (
                                    <p className="text-xs text-indigo-500 font-medium mb-2">
                                        Calculado dos blocos: {totalBlockArea.toLocaleString('pt-BR')} m²
                                    </p>
                                )}
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder={totalBlockArea > 0 ? String(Math.round(totalBlockArea)) : '0'}
                                        value={simplifiedAreaSqm || ''}
                                        onChange={(e) => setSimplifiedAreaSqm(parseFloat(e.target.value) || 0)}
                                        onBlur={() => saveSimplifiedFields(simplifiedCostSqm, simplifiedAreaSqm)}
                                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-xl py-3 px-4 font-bold text-slate-800 transition-all text-lg pr-14"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">m²</span>
                                </div>
                                {totalBlockArea > 0 && (
                                    <button
                                        onClick={() => {
                                            setSimplifiedAreaSqm(0);
                                            saveSimplifiedFields(simplifiedCostSqm, 0);
                                        }}
                                        className="mt-2 text-button text-indigo-500 hover:text-indigo-700 font-medium underline"
                                    >
                                        Usar área dos blocos ({Math.round(totalBlockArea).toLocaleString('pt-BR')} m²)
                                    </button>
                                )}
                            </div>

                            {/* Custo por m² */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <label className="block text-form-label font-black uppercase tracking-wider text-slate-400 mb-2">
                                    Custo Total por m²
                                </label>
                                <p className="text-xs text-slate-400 font-medium mb-2">
                                    All-in: construção + soft costs + overhead
                                </p>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={simplifiedCostSqm || ''}
                                        onChange={(e) => setSimplifiedCostSqm(parseFloat(e.target.value) || 0)}
                                        onBlur={() => saveSimplifiedFields(simplifiedCostSqm, simplifiedAreaSqm)}
                                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-800 transition-all text-lg"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Total result */}
                        <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-1">Custo Total (CAPEX)</p>
                                <p className="text-sm text-indigo-600 font-medium">
                                    {effectiveArea > 0
                                        ? `${Math.round(effectiveArea).toLocaleString('pt-BR')} m² × ${fmt(simplifiedCostSqm)}/m²`
                                        : 'Informe a área e o custo/m²'}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-black text-indigo-700">{fmt(simplifiedTotal)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── DETAILED MODE ── */}
                {capexMode === 'detailed' && (
                    <>
                        {math.esgCostTotal > 0 && (
                            <div className="mb-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                                        <Leaf className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-emerald-900 tracking-tight">Custo Provisionado: Medidas ESG</h4>
                                        <p className="text-xs text-emerald-700 font-medium">Calculado automaticamente com base nas Iniciativas Sustentáveis (Aba Parecer).</p>
                                    </div>
                                </div>
                                <span className="text-lg font-black text-emerald-700">
                                    + {fmt(math.esgCostTotal)}
                                </span>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mb-4">
                            <button onClick={expandAll} className="px-3 py-1.5 text-button font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">Expandir Tudo</button>
                            <button onClick={collapseAll} className="px-3 py-1.5 text-button font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">Recolher Tudo</button>
                        </div>

                        <div className="space-y-4">
                            {categories.map(category => (
                                <div key={category} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm transition-all">
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
                                                                        step={item.value_type === 'percent' ? '0.01' : '1'}
                                                                        onBlur={(e) => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            if (val !== item.value) {
                                                                                handleUpdateItem(item.id, { value: val });
                                                                            }
                                                                        }}
                                                                        className={`w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-xl py-2 px-3 font-bold text-slate-800 transition-all ${item.value_type === 'currency' ? 'pl-9' : 'pr-8 text-right'}`}
                                                                    />
                                                                    {item.value_type === 'percent' && (
                                                                        <span className="absolute right-3 text-slate-400 font-bold text-sm">%</span>
                                                                    )}
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
                    </>
                )}
            </div>
        </div>
    );
};

export default ImovibCapexForm;
