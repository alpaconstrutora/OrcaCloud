import React, { useState, useEffect } from 'react';
import { ImovibStudy, ImovibBlock, ImovibUnit, ImovibRegulatoryZone } from '../types';
import { imovibService } from '../services/imovibService';
import { Plus, Trash2, MapPin, Building, Calculator, FileText, PieChart, Users, ChevronRight, Activity, Save, Loader2, Map } from 'lucide-react';
import ImovibRegulatoryMapTab from './ImovibRegulatoryMapTab';

const parseRegVal = (v: string | undefined): number | null => {
    if (!v || v === 'N.A.' || v.trim() === '') return null;
    return parseFloat(v.replace(',', '.')) || null;
};

interface ImovibPremisesFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibPremisesForm: React.FC<ImovibPremisesFormProps> = ({ study, onDataChanged }) => {
    const [activeTab, setActiveTab] = useState<'identificacao' | 'mercado' | 'blocos' | 'regulatorio'>('identificacao');
    const [regulatoryZones, setRegulatoryZones] = useState<ImovibRegulatoryZone[]>([]);
    const [addingBlock, setAddingBlock] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    const [blockNameError, setBlockNameError] = useState(false);
    
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(study);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setFormData(study);
    }, [study]);

    useEffect(() => {
        if (activeTab === 'blocos') {
            imovibService.getRegulatoryZones(study.id).then(setRegulatoryZones).catch(console.error);
        }
    }, [activeTab, study.id]);

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
        if (!newBlockName.trim()) {
            setBlockNameError(true);
            setTimeout(() => setBlockNameError(false), 2000);
            return;
        }
        try {
            setAddingBlock(true);
            setBlockNameError(false);
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
                    { id: 'mercado', label: '1. Mercado', icon: <PieChart className="w-4 h-4" /> },
                    { id: 'blocos', label: '2. Blocos e Tipologia', icon: <Building className="w-4 h-4" /> },
                    { id: 'regulatorio', label: '3. Mapa Regulatório', icon: <Map className="w-4 h-4" /> },
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
                {activeTab !== 'regulatorio' && (
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
                    {/* ── Dados do Terreno ── */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mb-6">
                            <MapPin className="w-5 h-5 text-indigo-500" />
                            Dados do Terreno
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                            {[
                                { label: 'Frente (m)', key: 'terreno_frente' },
                                { label: 'Fundos (m)', key: 'terreno_fundos' },
                                { label: 'Lateral Direita (m)', key: 'terreno_lateral_direita' },
                                { label: 'Lateral Esquerda (m)', key: 'terreno_lateral_esquerda' },
                                { label: 'Área do Terreno (m²)', key: 'terreno_area' },
                            ].map(({ label, key }) => (
                                <div key={key}>
                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">{label}</label>
                                    <input
                                        type="number"
                                        value={(formData as any)[key] ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, [key]: parseFloat(e.target.value) || null }))}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium transition-all"
                                        placeholder="0"
                                    />
                                </div>
                            ))}
                        </div>

                        {/* ── Potencial Construtivo (Mapa Regulatório) ── */}
                        {(() => {
                            const area = (formData as any).terreno_area as number | null;
                            if (!regulatoryZones.length) return (
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                    <p className="text-xs text-slate-400 font-medium">
                                        Preencha o <strong>3. Mapa Regulatório</strong> para visualizar o potencial construtivo.
                                    </p>
                                </div>
                            );
                            const zone = regulatoryZones[0];
                            const fmtArea = (v: number | null) =>
                                v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
                            const calc = (raw: string | undefined) => {
                                const n = parseRegVal(raw);
                                if (n == null) return 'N.A.';
                                if (!area) return '— (sem área)';
                                return fmtArea(n * area);
                            };
                            const CALCS = [
                                { label: 'C.A. Mínimo', raw: zone.ca_minimo,              suffix: zone.ca_minimo !== 'N.A.' ? ` (×${zone.ca_minimo})` : '' },
                                { label: 'C.A. Básico', raw: zone.ca_basico,              suffix: zone.ca_basico !== 'N.A.' ? ` (×${zone.ca_basico})` : '' },
                                { label: 'C.A. Máximo', raw: zone.ca_maximo,              suffix: zone.ca_maximo !== 'N.A.' ? ` (×${zone.ca_maximo})` : '' },
                                { label: 'T.O. Máx.',   raw: zone.taxa_ocupacao_maxima,   suffix: zone.taxa_ocupacao_maxima !== 'N.A.' ? ` (×${zone.taxa_ocupacao_maxima})` : '' },
                                { label: 'T.Perm. Mín.',raw: zone.taxa_permeabilidade_minima, suffix: zone.taxa_permeabilidade_minima !== 'N.A.' ? ` (×${zone.taxa_permeabilidade_minima})` : '' },
                                { label: 'Gabarito',    raw: zone.gabarito_altura_maxima,  isGabarito: true },
                            ];
                            return (
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                                            Potencial Construtivo — {zone.zona || 'Zona'}{regulatoryZones.length > 1 ? ` (+${regulatoryZones.length - 1})` : ''}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        {CALCS.map(({ label, raw, suffix, isGabarito }) => {
                                            const display = isGabarito
                                                ? (raw && raw !== 'N.A.' ? raw + ' m' : 'N.A.')
                                                : calc(raw);
                                            const isNA = display === 'N.A.' || display.startsWith('—');
                                            return (
                                                <div key={label} className={`rounded-2xl p-4 border ${isNA ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-100'}`}>
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                                        {label}{suffix}
                                                    </p>
                                                    <p className={`text-base font-black ${isNA ? 'text-slate-400' : 'text-indigo-700'}`}>
                                                        {display}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* ── Blocos e Tipologias ── */}
                    <div className="flex items-center justify-between mb-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Building className="w-5 h-5 text-indigo-500" />
                            Blocos e Tipologias
                        </h2>
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Nome do Bloco/Fase"
                                    value={newBlockName}
                                    onChange={(e) => { setNewBlockName(e.target.value); setBlockNameError(false); }}
                                    className={`px-4 py-2 bg-slate-50 border rounded-xl focus:border-indigo-500 outline-none text-sm font-medium transition-colors ${blockNameError ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                                />
                                <button
                                    onClick={handleAddBlock}
                                    disabled={addingBlock}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> Add Bloco
                                </button>
                            </div>
                            {blockNameError && (
                                <p className="text-xs text-red-500 font-medium">Digite um nome para o bloco</p>
                            )}
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
                                        {(() => {
                                            const terrArea = (formData as any).terreno_area as number | null;
                                            const toVal = regulatoryZones.length ? parseRegVal(regulatoryZones[0].taxa_ocupacao_maxima) : null;
                                            const toBase = (terrArea && toVal != null) ? toVal * terrArea : null;
                                            return (
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-white border-b border-slate-100 text-[10px] font-black tracking-widest uppercase text-slate-400">
                                                    <th className="px-6 py-4">Tipologia da Unidade</th>
                                                    <th className="px-6 py-4 w-32 text-center">Unidades por Pavimento</th>
                                                    <th className="px-6 py-4 w-32 text-right">Área Priv. (m²)</th>
                                                    <th className="px-6 py-4 w-32 text-right">Área Com. (m²)</th>
                                                    <th className="px-6 py-4 w-36 text-right">Área Livre (m²)</th>
                                                    <th className="px-6 py-4 w-28 text-center">Pavimentos</th>
                                                    <th className="px-6 py-4 w-32 text-center">Unidades Totais</th>
                                                    <th className="px-6 py-4 w-36 text-right">Área Total (m²)</th>
                                                    <th className="px-6 py-4 w-16"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {block.units?.map(unit => {
                                                    const areaLivre = toBase != null
                                                        ? toBase - (((unit.private_area || 0) * (unit.quantity || 0)) + (unit.common_area || 0))
                                                        : null;
                                                    const livreFmt = areaLivre == null
                                                        ? '—'
                                                        : areaLivre.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
                                                    const livreNeg = areaLivre != null && areaLivre < 0;
                                                    return (
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
                                                        <td className="px-6 py-3 text-right">
                                                            <span className={`text-sm font-bold ${areaLivre == null ? 'text-slate-300' : livreNeg ? 'text-red-500' : 'text-emerald-600'}`}>
                                                                {livreFmt}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <input
                                                                type="number"
                                                                defaultValue={unit.pavimentos ?? 1}
                                                                min={1}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'pavimentos' as any, e.target.value)}
                                                                className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-center font-medium text-slate-800"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <span className="text-sm font-bold text-slate-700">
                                                                {(unit.quantity || 0) * (unit.pavimentos ?? 1)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            {(() => {
                                                                const pav = unit.pavimentos ?? 1;
                                                                // T.O. × Área do Terreno × Pavimentos
                                                                const areaTotal = toBase != null ? toBase * pav : null;
                                                                const totalFmt = areaTotal == null ? '—'
                                                                    : areaTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
                                                                return (
                                                                    <span className={`text-sm font-bold ${areaTotal == null ? 'text-slate-300' : 'text-indigo-700'}`}>
                                                                        {totalFmt}
                                                                    </span>
                                                                );
                                                            })()}
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
                                                    );
                                                })}
                                                {/* Linha de totalização */}
                                                {toBase != null && block.units && block.units.length > 0 && (
                                                    <tr className="bg-indigo-50/60 border-t-2 border-indigo-100">
                                                        <td colSpan={7} className="px-6 py-3 text-right">
                                                            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-400">Total Área</span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className="text-sm font-black text-indigo-700">
                                                                {block.units.reduce((sum, u) => sum + toBase * (u.pavimentos ?? 1), 0)
                                                                    .toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                                                            </span>
                                                        </td>
                                                        <td />
                                                    </tr>
                                                )}
                                                <tr>
                                                    <td colSpan={9} className="px-6 py-4 bg-slate-50/50">
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
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB: MAPA REGULATÓRIO */}
            {activeTab === 'regulatorio' && (
                <ImovibRegulatoryMapTab studyId={study.id} />
            )}

        </div>
    );
};

export default ImovibPremisesForm;
