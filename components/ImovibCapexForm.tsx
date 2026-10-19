import MoneyCentsInput from './ui/MoneyCentsInput';
import React, { useState, useEffect, useMemo } from 'react';
import { ImovibStudy, ImovibBlock, ImovibCapexItem, ImovibCapexItemInsert } from '../types';
import { imovibService } from '../services/imovibService';
import { Calculator, ChevronRight, Activity, Leaf, Plus, LayoutList, Zap } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useImovibMath, baseDaRubrica } from '../hooks/useImovibMath';
import type { ImovibCapexBase } from '../types';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

/** Área construída do bloco — a MESMA conta do motor (quantidade × pavimentos × (privativa + comum)). */
const areaDoBloco = (b: ImovibBlock): number =>
    (b.units || []).reduce((s, u) => s + (u.quantity || 0) * (u.pavimentos || 1) * ((u.private_area || 0) + (u.common_area || 0)), 0);

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

    // 7. Impostos Consolidados — RET e regime normal são ALTERNATIVOS: só um
    // com valor. Padrão = regime normal (decisão D3, 2026-10-12); para usar o
    // RET, zere o normal e preencha o RET.
    { category: '7. Impostos', name: 'RET (Regime Especial)', value_type: 'percent', value: 0 },
    { category: '7. Impostos', name: 'PIS/COFINS/IRPJ/CSLL (Normal)', value_type: 'percent', value: 6.73 },

    // 8. Despesas Financeiras. Sem rubrica de juros: os juros vêm do
    // financiamento (Receitas & Capital) e contariam duas vezes.
    { category: '8. Financeiras', name: 'Taxas de Estruturação (Plano Empresário)', value_type: 'percent', value: 1.5 },

    // 9. Contingência
    { category: '9. Contingência', name: 'Fundo de Reserva', value_type: 'percent', value: 2 },
];

// Base da rubrica: sobre o que o % incide e quando a saída acontece no fluxo.
const BASE_LABEL: Record<ImovibCapexBase, string> = {
    terreno: 'Terreno (mês 1)',
    obra: 'Obra (ao longo da obra)',
    vgv: 'VGV (com a receita)',
};

const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const ImovibCapexForm: React.FC<ImovibCapexFormProps> = ({ study, onDataChanged }) => {
    const [items, setItems] = useState<ImovibCapexItem[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    // Categoria com a linha de inclusão aberta (null = nenhuma) e o nome digitado.
    const [incluindoEm, setIncluindoEm] = useState<string | null>(null);
    const [novoNome, setNovoNome] = useState('');
    const [adicionando, setAdicionando] = useState(false);
    const confirm = useConfirm();
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();
    const [initializing, setInitializing] = useState(true);
    const [landCost, setLandCost] = useState<number>(study.land_cost || 0);
    const [landCostFocused, setLandCostFocused] = useState(false);
    // Custo e preço por torre, em edição local até sair do campo.
    const [blockCosts, setBlockCosts] = useState<Record<string, number>>({});
    const [blockPrices, setBlockPrices] = useState<Record<string, number>>({});
    const fmtBRL = (v: number) => v > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : '';

    // Simplified mode local state
    const [capexMode, setCapexMode] = useState<'simplified' | 'detailed'>(study.capex_mode || 'detailed');
    const [simplifiedCostSqm, setSimplifiedCostSqm] = useState<number>(study.capex_simplified_cost_sqm || 0);
    const [simplifiedAreaSqm, setSimplifiedAreaSqm] = useState<number>(study.capex_simplified_area_sqm || 0);

    const math = useImovibMath(study);

    // Área construída dos blocos — a MESMA do motor (com pavimentos). Antes esta
    // tela recalculava sem pavimentos e mostrava um total diferente do usado no VPL.
    const totalBlockArea = math.totalBlockArea;

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

    // Valor de cada rubrica NO CÁLCULO vem do motor (não recalcular aqui: com
    // inflação a rubrica de base vgv é corrigida mês a mês).
    const valorNoCalculo = math.capexValorPorRubrica;
    const totalDaCategoria = (cat: string) =>
        (groupedItems[cat] || []).reduce((acc, i) => acc + (valorNoCalculo[i.id] || 0), 0);

    // RET e regime normal são alternativos — os dois com valor = imposto em dobro.
    const impostosComValor = items.filter(i => i.category.startsWith('7.') && i.value_type === 'percent' && (i.value || 0) > 0);

    useEffect(() => {
        const fetchOrSeed = async () => {
            setInitializing(true);
            try {
                // Template aplicado UMA vez por estudo (capex_seeded_at + UNIQUE no
                // banco): o efeito rodar 2× no StrictMode não duplica mais nada, e
                // apagar todas as rubricas não traz o template de volta.
                const jaAplicado = !!study.capex_seeded_at;
                const template: ImovibCapexItemInsert[] = DEFAULT_CAPEX_TEMPLATE.map(t => ({
                    study_id: study.id,
                    category: t.category,
                    name: t.name,
                    value_type: t.value_type as 'currency' | 'percent',
                    value: t.value,
                    base: baseDaRubrica({ category: t.category }),
                }));
                // Quem só lê (sem canEditImovib) não aplica o template: abrir a aba
                // não pode gravar. Template vazio = o serviço só lê as rubricas.
                const loaded = await imovibService.seedCapexTemplate(study.id, pode ? template : []);
                setItems(loaded);
                const uniqueCats = Array.from(new Set(loaded.map(i => i.category))).sort();
                setExpandedCategories(uniqueCats.slice(0, 2));
                if (!jaAplicado) onDataChanged();
            } catch (e) {
                console.error('Failed to seed capex', e);
            showToast(`Erro ao carregar as rubricas de CAPEX do estudo: ${(e as Error).message}`, 'error');
            } finally {
                setInitializing(false);
            }
        };
        fetchOrSeed();
    }, [study.id]);

    // Só grava o que mudou: sair do campo sem editar não pode criar a linha do bloco
    // de uma torre que ainda não tem (imovibService.salvarEconomiaDoBloco).
    const saveBlockEconomia = async (block: ImovibBlock, campo: 'construction_cost_sqm' | 'sales_price_sqm', value: number | undefined) => {
        if (value == null || value === (block[campo] || 0)) return;
        try {
            await imovibService.salvarEconomiaDoBloco(block, { [campo]: value });
            onDataChanged();
        } catch (e) {
            console.error(`Failed to save ${campo}`, e);
            showToast(`Erro ao salvar o ${campo === 'construction_cost_sqm' ? 'custo de obra' : 'preço de venda'} de ${block.name}: ${(e as Error).message}`, 'error');
        } finally {
            const limpa = (prev: Record<string, number>) => { const n = { ...prev }; delete n[block.id]; return n; };
            if (campo === 'construction_cost_sqm') setBlockCosts(limpa); else setBlockPrices(limpa);
        }
    };

    const saveLandCost = async (value: number) => {
        try {
            await imovibService.updateStudy(study.id, { land_cost: value } as any);
            onDataChanged();
        } catch (e) {
            console.error('Failed to save land_cost', e);
            showToast(`Erro ao salvar o custo do terreno: ${(e as Error).message}`, 'error');
        }
    };

    const saveMode = async (newMode: 'simplified' | 'detailed') => {
        const anterior = capexMode;
        setCapexMode(newMode);
        try {
            await imovibService.updateStudy(study.id, { capex_mode: newMode });
            onDataChanged();
        } catch (e) {
            // Não gravou: a tela volta ao modo que está no banco (e no cálculo).
            setCapexMode(anterior);
            console.error('Failed to save capex_mode', e);
            showToast(`Erro ao salvar o modo do CAPEX (simplificado/detalhado): ${(e as Error).message}`, 'error');
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
            showToast(`Erro ao salvar o CAPEX simplificado (custo/m² e área): ${(e as Error).message}`, 'error');
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
            showToast(`Erro ao salvar a rubrica de CAPEX: ${(e as Error).message}`, 'error');
            setItems(origItems);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteItem = async (id: string) => {
        const item = items.find(i => i.id === id);
        const ok = await confirm({
            title: 'Excluir rubrica?',
            message: `A rubrica "${item?.name ?? ''}" será removida do orçamento deste estudo.`,
            confirmLabel: 'Excluir',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            setIsSaving(true);
            await imovibService.deleteCapexItem(id);
            setItems(items.filter(i => i.id !== id));
            onDataChanged();
        } catch (e) {
            console.error('Failed to delete item', e);
            showToast(`Erro ao excluir a rubrica de CAPEX: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Inclusão inline (item 5.7): linha com nome + Adicionar/Cancelar dentro da
    // própria categoria, no lugar do window.prompt.
    const abrirInclusao = (category: string) => {
        setIncluindoEm(category);
        setNovoNome('');
        setExpandedCategories(prev => prev.includes(category) ? prev : [...prev, category]);
    };
    const cancelarInclusao = () => {
        setIncluindoEm(null);
        setNovoNome('');
    };

    const handleAddItem = async (category: string) => {
        const name = novoNome.trim();
        if (!name || adicionando) return;
        // Mesma mensagem da UNIQUE do banco, sem ir ao banco quando já dá para saber.
        if (items.some(i => i.category === category && i.name === name)) {
            showToast(`Já existe a rubrica "${name}" em ${category}.`, 'error');
            return;
        }
        const newItem: ImovibCapexItemInsert = { study_id: study.id, category, name, value_type: 'currency', value: 0, base: baseDaRubrica({ category }) };
        try {
            setIsSaving(true);
            setAdicionando(true);
            const inserted = await imovibService.upsertCapexItems([newItem]);
            setItems(prev => [...prev, ...inserted]);
            cancelarInclusao();
            onDataChanged();
        } catch (e) {
            console.error('Failed to add item', e);
            const msg = String((e as Error)?.message || '');
            showToast(msg.includes('imovib_capex_items_study_category_name_key') || msg.includes('duplicate key')
                ? `Já existe a rubrica "${name}" em ${category}.`
                : `Erro ao adicionar a rubrica de CAPEX: ${msg}`, 'error');
        } finally {
            setIsSaving(false);
            setAdicionando(false);
        }
    };

    const expandAll = () => setExpandedCategories(categories);
    const collapseAll = () => setExpandedCategories([]);

    if (initializing) {
        return (
            <div className="flex items-center justify-center p-12 bg-white rounded-[10px] border border-gray-200">
                <div className="flex flex-col items-center">
                    <Activity className="w-8 h-8 text-indigo-500 animate-pulse mb-4" />
                    <p className="text-slate-500 text-sm font-medium">Gerando template de orçamento mestre...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-white rounded-[10px] p-6 border border-gray-200">
                {/* Header + mode toggle */}
                <div className="flex items-start justify-between mb-6 gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-indigo-500" />
                            Orçamento Mestre (CAPEX)
                        </h2>
                        <p className="text-slate-500 text-sm mt-1 max-w-xl">
                            {capexMode === 'simplified'
                                ? 'Modo simplificado: custo total calculado por área × preço/m².'
                                : 'Gerencie as premissas de custos indiretos, marketing, comissões, legais e financeiras.'}
                        </p>
                    </div>
                    {/* Mode toggle */}
                    <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 flex items-center h-9 bg-slate-100 rounded-[6px] p-0.5 gap-0.5 shrink-0">
                        <button
                            onClick={() => saveMode('simplified')}
                            className={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] font-medium text-[13px] transition-all ${
                                capexMode === 'simplified'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Simplificado
                        </button>
                        <button
                            onClick={() => saveMode('detailed')}
                            className={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] font-medium text-[13px] transition-all ${
                                capexMode === 'detailed'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <LayoutList className="w-3.5 h-3.5" />
                            Completo
                        </button>
                    </fieldset>
                </div>

                {/* ── ÁREA CONSTRUÍDA ── a do motor; antes era T.O. × terreno × pavimentos, outra conta. */}
                <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 mb-4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Área Construída (m²)
                    </label>
                    <div className="text-2xl font-semibold text-indigo-700">
                        {totalBlockArea > 0
                            ? totalBlockArea.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²'
                            : <span className="text-slate-500 text-sm font-normal">— sem unidades com área</span>
                        }
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        {study.estrutura?.origem === 'empreendimento'
                            ? `Σ (privativa + comum) das ${study.estrutura.unidades} unidade(s) de "${study.estrutura.empreendimento_nome}", vindas da Planta Inteligente`
                            : 'Σ (privativa + comum) das tipologias antigas do estudo. Vincule um empreendimento em Premissas › Identificação.'}
                    </p>
                </div>

                {/* ── CUSTO DE OBRA E PREÇO DE VENDA POR TORRE ── o que o estudo guarda; a
                    área vem do empreendimento. Sem valor no estudo, abre com o da torre. */}
                {study.blocks && study.blocks.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 mb-4">
                        <label className="block text-xs font-semibold text-slate-500 mb-3">
                            Por torre: custo de obra e preço de venda (R$/m²)
                        </label>
                        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-3">
                            {study.blocks.map(block => {
                                const area = areaDoBloco(block);
                                const custo = blockCosts[block.id] ?? block.construction_cost_sqm ?? 0;
                                return (
                                    <div key={block.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <span className="text-sm font-medium text-slate-700 min-w-[120px]">{block.name}</span>
                                        <label className="flex items-center gap-2 text-sm text-slate-500">
                                            Custo
                                            <MoneyCentsInput
                                                value={custo}
                                                onChange={(v) => setBlockCosts(prev => ({ ...prev, [block.id]: v === '' ? 0 : Number(v) }))}
                                                onBlur={() => saveBlockEconomia(block, 'construction_cost_sqm', blockCosts[block.id])}
                                                className="w-32 h-9 px-3 bg-white border border-slate-200 rounded-[6px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-medium text-slate-800 text-right"
                                            />
                                            <span className="text-slate-500">/m²</span>
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-slate-500">
                                            Venda
                                            <MoneyCentsInput
                                                value={blockPrices[block.id] ?? block.sales_price_sqm ?? 0}
                                                onChange={(v) => setBlockPrices(prev => ({ ...prev, [block.id]: v === '' ? 0 : Number(v) }))}
                                                onBlur={() => saveBlockEconomia(block, 'sales_price_sqm', blockPrices[block.id])}
                                                className="w-32 h-9 px-3 bg-white border border-slate-200 rounded-[6px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-medium text-slate-800 text-right"
                                            />
                                            <span className="text-slate-500">/m²</span>
                                        </label>
                                        <span className="text-sm text-slate-500">
                                            {area.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m² × custo = {(custo * area)
                                                .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                );
                            })}
                        </fieldset>
                    </div>
                )}

                {/* ── CUSTO DE AQUISIÇÃO DO TERRENO ── */}
                <div className="bg-amber-50 border border-amber-200 rounded-[10px] p-4 mb-6">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Custo de Aquisição do Terreno (R$)
                    </label>
                    <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 flex items-center gap-3 max-w-xs">
                        <span className="text-slate-500 font-medium text-sm">R$</span>
                        <MoneyCentsInput
                            value={landCost}
                            placeholder="0,00"
                            onChange={(v) => setLandCost(v === '' ? 0 : Number(v))}
                            onBlur={() => saveLandCost(landCost)}
                            className="flex-1 h-9 px-3 bg-white border border-amber-300 rounded-[6px] focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none text-sm font-medium text-slate-800"
                        />
                    </fieldset>
                    <p className="text-xs text-amber-600 mt-2">
                        Valor usado em: Estática → Aquisição do Terreno
                    </p>
                </div>

                {/* ── SIMPLIFIED MODE ── */}
                {capexMode === 'simplified' && (
                    <div className="space-y-6">
                        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Área */}
                            <div className="bg-slate-50 rounded-[10px] p-4 border border-slate-200">
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    Área Total (m²)
                                </label>
                                {totalBlockArea > 0 && simplifiedAreaSqm === 0 && (
                                    <p className="text-xs text-indigo-500 mb-2">
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
                                        className="w-full h-9 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-[6px] px-3 text-sm font-medium text-slate-800 transition-all pr-14"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">m²</span>
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
                            <div className="bg-slate-50 rounded-[10px] p-4 border border-slate-200">
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    Custo Total por m²
                                </label>
                                <p className="text-xs text-slate-400 mb-2">
                                    All-in: construção + soft costs + overhead
                                </p>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">R$</span>
                                    <MoneyCentsInput
                                        value={simplifiedCostSqm || ''}
                                        onChange={(v) => setSimplifiedCostSqm(v === '' ? 0 : Number(v))}
                                        onBlur={() => saveSimplifiedFields(simplifiedCostSqm, simplifiedAreaSqm)}
                                        className="w-full h-9 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-[6px] pl-9 pr-3 text-sm font-medium text-slate-800 transition-all"
                                    />
                                </div>
                            </div>
                        </fieldset>

                        {/* Total result — §4: KpiCard */}
                        <KpiCard
                            label="Custo Total (CAPEX)"
                            value={fmt(simplifiedTotal)}
                            sub={effectiveArea > 0
                                ? `${Math.round(effectiveArea).toLocaleString('pt-BR')} m² × ${fmt(simplifiedCostSqm)}/m²`
                                : 'Informe a área e o custo/m²'}
                            icon={<Calculator className="w-4 h-4" />}
                            color="indigo"
                            size="lg"
                        />
                    </div>
                )}

                {/* ── DETAILED MODE ── */}
                {capexMode === 'detailed' && (
                    <>
                        {math.esgCostTotal > 0 && (
                            <div className="mb-6 p-4 bg-emerald-50 rounded-[10px] border border-emerald-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-[6px]">
                                        <Leaf className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-emerald-900">Custo Provisionado: Medidas ESG</h4>
                                        <p className="text-xs text-emerald-700">Calculado automaticamente com base nas Iniciativas Sustentáveis (Aba Parecer).</p>
                                    </div>
                                </div>
                                <span className="text-lg font-semibold text-emerald-700">
                                    + {fmt(math.esgCostTotal)}
                                </span>
                            </div>
                        )}

                        {/* O que as rubricas somam no cálculo de VPL/TIR (item 2.4) */}
                        <div className="mb-6 p-4 bg-white rounded-[10px] border border-slate-200">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h4 className="text-sm font-semibold text-slate-800">Rubricas no cálculo</h4>
                                <span className="text-lg font-semibold text-slate-900">{fmt(math.capexRubricas.total)}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-slate-600">
                                <div>Sobre o terreno (mês 1): <span className="font-medium text-slate-800">{fmt(math.capexRubricas.terreno)}</span></div>
                                <div>Sobre a obra (ao longo da obra): <span className="font-medium text-slate-800">{fmt(math.capexRubricas.obra)}</span></div>
                                <div>Sobre o VGV (junto com a receita): <span className="font-medium text-slate-800">{fmt(math.capexRubricas.vgv)}</span></div>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                                {math.capexRubricasAtivas
                                    ? 'No modo Completo, imposto e corretagem vêm destas rubricas (categorias 5 e 7); os campos da aba Dinâmica não entram no cálculo.'
                                    : 'Sem rubricas cadastradas: valem imposto e corretagem da aba Dinâmica.'}
                            </p>
                        </div>

                        {impostosComValor.length > 1 && (
                            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800" role="alert">
                                <span className="font-semibold">Impostos em dobro:</span>{' '}
                                {impostosComValor.map(i => `${i.name} (${i.value}%)`).join(' e ')} estão com valor ao mesmo tempo.
                                RET e regime normal são alternativos — zere o que não se aplica em "7. Impostos".
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mb-4">
                            <button onClick={expandAll} className="h-9 px-3.5 bg-white border border-gray-200 hover:bg-slate-50 text-slate-600 rounded-[6px] font-medium text-[13px] transition-colors">Expandir Tudo</button>
                            <button onClick={collapseAll} className="h-9 px-3.5 bg-white border border-gray-200 hover:bg-slate-50 text-slate-600 rounded-[6px] font-medium text-[13px] transition-colors">Recolher Tudo</button>
                        </div>

                        <div className="space-y-4">
                            {categories.map(category => (
                                <div key={category} className="border border-gray-200 rounded-[10px] overflow-hidden bg-white transition-all">
                                    {/* Cabeçalho: o "Novo" fica FORA do botão de expandir (antes era
                                        <button> dentro de <button>, HTML inválido). */}
                                    <div className="w-full flex items-center bg-slate-50 hover:bg-slate-100 transition-colors">
                                        <button
                                            type="button"
                                            onClick={() => toggleCategory(category)}
                                            aria-expanded={expandedCategories.includes(category)}
                                            className="flex-1 min-w-0 pl-4 pr-3 py-3 flex items-center justify-between gap-3 text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1 rounded-[6px] transition-transform ${expandedCategories.includes(category) ? 'rotate-90 bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-sm font-semibold text-gray-900">{category}</h3>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-slate-700">{fmt(totalDaCategoria(category))}</span>
                                                <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded-[6px] border border-slate-200">
                                                    {groupedItems[category].length} itens
                                                </span>
                                            </div>
                                        </button>
                                        <div className="pr-4 py-3 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => abrirInclusao(category)}
                                                disabled={!pode}
                                                title={!pode ? motivo : `Incluir uma rubrica em ${category}`}
                                                className="h-9 px-3.5 flex items-center gap-1.5 font-medium text-[13px] bg-white hover:bg-slate-100 text-indigo-600 border border-gray-200 rounded-[6px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                                            >
                                                <Plus className="w-[15px] h-[15px]" />
                                                Novo
                                            </button>
                                        </div>
                                    </div>

                                    {expandedCategories.includes(category) && (
                                        <div className="p-0 border-t border-slate-200">
                                          <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0">
                                            <table className="w-full text-left bg-white">
                                                <thead>
                                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                                        <th className="px-6 py-2 border-r border-gray-100">Rubrica / Linha de Custo</th>
                                                        <th className="px-6 py-2 border-r border-gray-100">Tipo</th>
                                                        <th className="px-6 py-2 border-r border-gray-100">Base</th>
                                                        <th className="px-6 py-2 border-r border-gray-100">Valor</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 text-right">No cálculo</th>
                                                        <th className="px-6 py-2 w-12"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {groupedItems[category].map(item => (
                                                        <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={item.name}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value !== item.name && e.target.value.trim()) {
                                                                            handleUpdateItem(item.id, { name: e.target.value });
                                                                        }
                                                                    }}
                                                                    className="bg-transparent border-none focus:ring-0 font-normal text-sm text-slate-700 w-full p-0 py-0.5 hover:bg-slate-100/50 rounded-[6px] transition-colors focus:bg-white focus:px-2"
                                                                />
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                <span className={`text-sm font-normal ${item.value_type === 'percent' ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                                    {item.value_type === 'percent' ? 'Percentual (%)' : 'Moeda (R$)'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                <select
                                                                    value={baseDaRubrica(item)}
                                                                    onChange={(e) => handleUpdateItem(item.id, { base: e.target.value as ImovibCapexBase })}
                                                                    title={item.value_type === 'percent' ? 'Sobre o que o % incide' : 'Quando o valor sai do caixa'}
                                                                    className="text-sm font-normal px-2 py-1 rounded-[6px] border border-gray-100 bg-gray-50 text-gray-900 cursor-pointer"
                                                                >
                                                                    {(Object.keys(BASE_LABEL) as ImovibCapexBase[]).map(b => (
                                                                        <option key={b} value={b}>{BASE_LABEL[b]}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                <div className="relative flex items-center">
                                                                    {item.value_type === 'currency' && (
                                                                        <span className="absolute left-3 text-slate-400 font-normal text-sm">R$</span>
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
                                                                        className={`w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none rounded-[6px] h-8 px-3 text-sm font-normal text-slate-800 transition-all ${item.value_type === 'currency' ? 'pl-9' : 'pr-8 text-right'}`}
                                                                    />
                                                                    {item.value_type === 'percent' && (
                                                                        <span className="absolute right-3 text-slate-400 font-normal text-sm">%</span>
                                                                    )}
                                                                    {isSaving && (
                                                                        <div className="absolute right-3 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                                                {fmt(valorNoCalculo[item.id] || 0)}
                                                            </td>
                                                            <td className="px-6 py-2.5 text-right">
                                                                <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" title="Excluir item" onClick={() => handleDeleteItem(item.id)} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {incluindoEm === category && (
                                                <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={novoNome}
                                                        onChange={(e) => setNovoNome(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') { e.preventDefault(); handleAddItem(category); }
                                                            else if (e.key === 'Escape') { e.preventDefault(); cancelarInclusao(); }
                                                        }}
                                                        placeholder="Nome da nova rubrica"
                                                        aria-label={`Nome da nova rubrica em ${category}`}
                                                        className="h-9 flex-1 min-w-[200px] px-3 bg-white border border-slate-200 rounded-[6px] text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddItem(category)}
                                                        disabled={!novoNome.trim() || adicionando}
                                                        title={!pode ? motivo : !novoNome.trim() ? 'Digite o nome da rubrica' : adicionando ? 'Adicionando…' : undefined}
                                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                                                    >
                                                        <Plus className="w-[15px] h-[15px]" />
                                                        Adicionar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelarInclusao}
                                                        className="h-9 px-3.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-[6px] font-medium text-[13px] transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            )}
                                          </fieldset>
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
