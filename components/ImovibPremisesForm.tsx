import React, { useState, useEffect } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { Building, FileText, PieChart, Activity, Save, Loader2, Map, Layers } from 'lucide-react';
import ImovibRegulatoryMapTab from './ImovibRegulatoryMapTab';
import ImovibBlocksTypologyTab from './ImovibBlocksTypologyTab';
import EstudoTorresUnidades from './torres/EstudoTorresUnidades';


interface ImovibPremisesFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibPremisesForm: React.FC<ImovibPremisesFormProps> = ({ study, onDataChanged }) => {
    const [activeTab, setActiveTab] = useState<'identificacao' | 'mercado' | 'blocos' | 'torres' | 'regulatorio'>('identificacao');
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(study);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setFormData(study);
    }, [study]);


    const handleSaveAllForm = async () => {
        try {
            setIsSaving(true);
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
    // Helper to render input field
    const renderInput = (label: string, field: keyof ImovibStudy, type: 'text' | 'number' | 'date' = 'text', placeholder: string = "", isPercent: boolean = false) => {
        return (
            <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
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
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
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
                    { id: 'torres', label: '3. Torres & Unidades', icon: <Layers className="w-4 h-4" /> },
                    { id: 'regulatorio', label: '4. Mapa Regulatório', icon: <Map className="w-4 h-4" /> },
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
                {activeTab !== 'regulatorio' && activeTab !== 'blocos' && (
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
                <ImovibBlocksTypologyTab study={study} onDataChanged={onDataChanged} />
            )}
            {/* TAB: TORRES & UNIDADES — as MESMAS do empreendimento vinculado (fonte única) */}
            {activeTab === 'torres' && (
                <EstudoTorresUnidades studyId={study.id} origin="imovib" />
            )}
            {/* TAB: MAPA REGULATÓRIO */}
            {activeTab === 'regulatorio' && (
                <ImovibRegulatoryMapTab studyId={study.id} />
            )}

        </div>
    );
};

export default ImovibPremisesForm;
