import React, { useState, useEffect } from 'react';
import { ImovibStudy, ImovibBlock, ImovibUnit } from '../types';
import { imovibService } from '../services/imovibService';
import { Plus, Trash2, MapPin, Building, Calculator, FileText, PieChart, Users, ChevronRight, Activity, Save, Loader2 } from 'lucide-react';

interface ImovibPremisesFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibPremisesForm: React.FC<ImovibPremisesFormProps> = ({ study, onDataChanged }) => {
    const [activeTab, setActiveTab] = useState<'identificacao' | 'terreno' | 'mercado' | 'blocos'>('identificacao');
    const [addingBlock, setAddingBlock] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(study);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setFormData(study);
    }, [study]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const handleSaveAllForm = async () => {
        try {
            setIsSaving(true);
            // Sanitizar: remover campos que não são colunas da tabela imovib_studies
            const { id, created_at, updated_at, blocks, capex_items, organization_id, ...cleanData } = formData as any;
            await imovibService.updateStudy(study.id, cleanData);
            alert('Premissas salvas com sucesso!');
            onDataChanged();
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar premissas.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddBlock = async () => {
        if (!newBlockName.trim()) return;
        try {
            setAddingBlock(true);
            await imovibService.createBlock({
                study_id: study.id,
                name: newBlockName,
                construction_cost_sqm: 0,
                sales_price_sqm: 0,
            });
            setNewBlockName('');
            onDataChanged();
        } catch (e) {
            console.error(e);
        } finally {
            setAddingBlock(false);
        }
    };

    const handleDeleteBlock = async (id: string) => {
        if (confirm('Deseja excluir este bloco?')) {
            await imovibService.deleteBlock(id);
            onDataChanged();
        }
    };

    const handleUpdateBlock = async (block: ImovibBlock, field: keyof ImovibBlock, value: string) => {
        try {
            await imovibService.updateBlock(block.id, {
                [field]: field === 'name' ? value : parseFloat(value) || 0
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddUnit = async (blockId: string) => {
        try {
            await imovibService.createUnit({
                block_id: blockId,
                name: 'Nova Tipologia',
                quantity: 1,
                private_area: 0,
                common_area: 0
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateUnit = async (unit: ImovibUnit, field: keyof ImovibUnit, value: string) => {
        try {
            await imovibService.updateUnit(unit.id, {
                [field]: field === 'name' ? value : parseFloat(value) || 0
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteUnit = async (id: string) => {
        await imovibService.deleteUnit(id);
        onDataChanged();
    };

    // Helper to render input field
    const renderInput = (label: string, field: keyof ImovibStudy, type: 'text' | 'number' | 'date' = 'text', placeholder: string = "", isPercent: boolean = false) => {
        return (
            <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                    {label} {isPercent && '(%)'}
                </label>
                <input
                    type={type}
                    value={(formData[field as keyof ImovibStudy] as string | number) ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => {
                        const val = type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value;
                        setFormData(prev => ({ ...prev, [field]: val }));
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all font-medium text-slate-700"
                />
            </div>
        );
    };

    // Helper for Textarea
    const renderTextarea = (label: string, field: keyof ImovibStudy, placeholder: string = "", rows: number = 3) => {
        return (
            <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                    {label}
                </label>
                <textarea
                    value={(formData[field as keyof ImovibStudy] as string) ?? ''}
                    placeholder={placeholder}
                    rows={rows}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all font-medium text-slate-700 resize-none"
                />
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Header / Tabs */}
            <div className="bg-white rounded-3xl p-2 border border-slate-100 shadow-sm flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                {[
                    { id: 'identificacao', label: '0. Identificação', icon: <FileText className="w-4 h-4" /> },
                    { id: 'terreno', label: '1. Terreno & Gerais', icon: <MapPin className="w-4 h-4" /> },
                    { id: 'mercado', label: '2. Mercado', icon: <PieChart className="w-4 h-4" /> },
                    { id: 'blocos', label: '3. Blocos & Tipologias', icon: <Building className="w-4 h-4" /> }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all ${activeTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
                </div>
                {activeTab !== 'blocos' && (
                    <button
                        onClick={handleSaveAllForm}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-70"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Salvando...' : 'Salvar Premissas'}
                    </button>
                )}
            </div>

            {/* TAB: IDENTIFICAÇÃO */}
            {activeTab === 'identificacao' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                Módulo 0 — Ficha de Identificação
                            </h2>
                            <p className="text-slate-500 text-sm mt-1 font-medium">Informações legais e contextuais da análise.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderInput('CNPJ da SPE', 'spe_cnpj', 'text', 'Ex: 00.000.000/0001-00')}
                            {renderInput('Incorporadora / Desenvolvedor', 'developer_name', 'text', 'Nome da Empresa')}
                            {renderInput('Gestor do Projeto', 'project_manager', 'text', 'Nome do Responsável')}
                            {renderInput('Data-base da Análise', 'base_date', 'date')}
                            {renderInput('Modalidade de Desenvolvimento', 'development_modality', 'text', 'Ex: Incorporação / Permuta / BTS')}
                        </div>

                        <div className="pt-6 border-t border-slate-100">
                            <h3 className="text-sm font-black text-slate-800 tracking-wider uppercase mb-6">Mapa Regulatório</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {renderInput('CA Básico', 'ca_basic', 'number')}
                                {renderInput('CA Máximo', 'ca_max', 'number')}
                                {renderInput('Taxa de Ocupação Máx', 'occupancy_rate_max', 'number', '', true)}
                            </div>
                            {renderTextarea('Zoneamento e Compatibilidade', 'zoning_info', 'Detalhes sobre zoneamento, ZEIS, outorga onerosa, etc.')}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: TERRENO E GERAIS */}
            {activeTab === 'terreno' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-indigo-500" />
                                Módulo 1 — Entradas Gerais & Terreno
                            </h2>
                            <p className="text-slate-500 text-sm mt-1 font-medium">Premissas de lote, eficiência e indexadores.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {renderInput('Custo de Aquisição (R$)', 'land_cost', 'number')}
                            {renderInput('Testada do Lote (m)', 'land_frontage', 'number')}
                            {renderInput('Formato do Lote', 'land_shape_raw', 'text', 'Ex: Retangular, Irregular')}
                            {renderInput('Eficiência Construtiva', 'efficiency_percent', 'number', '', true)}
                            {renderInput('Custo de Oportunidade', 'opportunity_cost_percent', 'number', 'Meta min. de retorno', true)}
                        </div>

                        <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderInput('Índice de Reajuste (Obra)', 'inflation_index_obra', 'text', 'Ex: INCC-M')}
                            {renderInput('Índice de Reajuste (Vendas/Repasse)', 'inflation_index_vendas', 'text', 'Ex: IGPM, IPCA')}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: MERCADO */}
            {activeTab === 'mercado' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                <Activity className="w-5 h-5 text-indigo-500" />
                                Módulo 2 — Análise de Mercado
                            </h2>
                            <p className="text-slate-500 text-sm mt-1 font-medium">Inteligência de mercado, demanda e concorrência.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                            {renderTextarea('Macrolocalização (Cidade/Região)', 'location_macro', 'Dinâmica econômica local...')}
                            {renderTextarea('Microlocalização (Bairro/Vizinhança)', 'location_micro', 'Infraestrutura de transportes, saúde...')}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {renderInput('Score de Localização (1-10)', 'location_score', 'number')}
                                {renderInput('VSO Histórica Região', 'vso_regional_percent', 'number', '', true)}
                            </div>

                            {renderTextarea('Público Alvo / Buyer Persona', 'target_audience', 'Perfil de renda, ocupação familiar...')}
                            {renderTextarea('Demanda e Déficit', 'demand_deficit', 'Déficit habitacional por faixa de renda...')}
                            {renderTextarea('Análise de Concorrentes', 'competitors_analysis', 'Oferta ativa num raio de influência, tickets médios...')}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: BLOCOS & TIPOLOGIAS */}
            {activeTab === 'blocos' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Building className="w-5 h-5 text-indigo-500" />
                            Blocos e Tipologias
                        </h2>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Nome do Bloco/Fase"
                                value={newBlockName}
                                onChange={(e) => setNewBlockName(e.target.value)}
                                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm font-medium"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                            />
                            <button
                                onClick={handleAddBlock}
                                disabled={addingBlock || !newBlockName.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Add Bloco
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {(!study.blocks || study.blocks.length === 0) ? (
                            <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-12 text-center">
                                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-slate-700">Nenhum bloco cadastrado</h3>
                                <p className="text-slate-500 font-medium mt-1">Adicione o primeiro bloco para iniciar a definição de tipologias de unidades.</p>
                            </div>
                        ) : (
                            study.blocks.map(block => (
                                <div key={block.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                                    {/* Block Header */}
                                    <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex-1 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold shrink-0">
                                                {block.name.charAt(0).toUpperCase()}
                                            </div>
                                            <input
                                                type="text"
                                                className="font-black text-xl text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                defaultValue={block.name}
                                                onBlur={(e) => handleUpdateBlock(block, 'name', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 flex-wrap bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                                            <div className="flex items-center gap-3 px-3 border-r border-slate-100">
                                                <Calculator className="w-5 h-5 text-rose-400" />
                                                <div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">Custo Obra</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-slate-500 font-medium text-xs">R$</span>
                                                        <input
                                                            type="number"
                                                            defaultValue={block.construction_cost_sqm}
                                                            onBlur={(e) => handleUpdateBlock(block, 'construction_cost_sqm', e.target.value)}
                                                            className="w-20 bg-transparent border-none p-0 text-sm font-black text-slate-800 focus:ring-0"
                                                        />
                                                        <span className="text-slate-500 font-medium text-xs">/m²</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 px-3">
                                                <Calculator className="w-5 h-5 text-emerald-400" />
                                                <div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">Venda VGV</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-slate-500 font-medium text-xs">R$</span>
                                                        <input
                                                            type="number"
                                                            defaultValue={block.sales_price_sqm}
                                                            onBlur={(e) => handleUpdateBlock(block, 'sales_price_sqm', e.target.value)}
                                                            className="w-20 bg-transparent border-none p-0 text-sm font-black text-slate-800 focus:ring-0"
                                                        />
                                                        <span className="text-slate-500 font-medium text-xs">/m²</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteBlock(block.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                                                title="Excluir Bloco"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Units List */}
                                    <div className="p-0 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-white border-b border-slate-100 text-[10px] font-black tracking-widest uppercase text-slate-400">
                                                    <th className="px-6 py-4">Tipologia da Unidade</th>
                                                    <th className="px-6 py-4 w-24 text-center">Unds.</th>
                                                    <th className="px-6 py-4 w-32 text-right">Área Priv. (m²)</th>
                                                    <th className="px-6 py-4 w-32 text-right">Área Com. (m²)</th>
                                                    <th className="px-6 py-4 w-16"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {block.units?.map(unit => (
                                                    <tr key={unit.id} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="px-6 py-3">
                                                            <input
                                                                type="text"
                                                                defaultValue={unit.name}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'name', e.target.value)}
                                                                className="w-full bg-transparent border-none p-1 focus:ring-1 focus:ring-indigo-500 rounded font-bold text-slate-700"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <input
                                                                type="number"
                                                                defaultValue={unit.quantity}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'quantity', e.target.value)}
                                                                className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-center font-medium text-slate-800"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3 relative">
                                                            <input
                                                                type="number"
                                                                defaultValue={unit.private_area}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'private_area', e.target.value)}
                                                                className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-right font-medium text-slate-800"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <input
                                                                type="number"
                                                                defaultValue={unit.common_area}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'common_area', e.target.value)}
                                                                className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-right font-medium text-slate-800"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <button
                                                                onClick={() => handleDeleteUnit(unit.id)}
                                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors w-full flex justify-center opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-4 bg-slate-50/50">
                                                        <button
                                                            onClick={() => handleAddUnit(block.id)}
                                                            className="text-xs font-black tracking-widest uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors"
                                                        >
                                                            <Plus className="w-3 h-3" /> Adicionar Tipologia
                                                        </button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default ImovibPremisesForm;
