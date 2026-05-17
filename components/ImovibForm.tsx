import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Building2, MapPin, Target, AlertCircle, Loader2 } from 'lucide-react';
import { ImovibStudy, ImovibStudyInsert, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';

interface ImovibFormProps {
    organizationId?: string;
    studyId?: string; // If provided, edit mode. If not, create mode.
    onBack: () => void;
    onSaved: (study: ImovibStudy) => void;
}

const SEGMENTS = ['Residencial', 'Comercial', 'Logístico', 'Misto', 'Loteamento', 'BTS'];
const SUB_CLASSIFICATIONS = ['Econômico', 'Médio', 'Alto', 'Luxo', 'MCMV F1', 'MCMV F2', 'MCMV F3'];
const PHASES = ['Greenfield', 'Brownfield', 'Retrofit', 'Conversão de Uso'];
const MODALITIES = ['Incorporação Própria', 'Built-to-Sell', 'Built-to-Rent', 'Land Banking', 'Permuta'];

const ImovibForm: React.FC<ImovibFormProps> = ({ organizationId, studyId, onBack, onSaved }) => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!studyId);
    const [formData, setFormData] = useState<Partial<ImovibStudy>>({
        name: '',
        cnpj: '',
        developer: '',
        manager: '',
        version: '1.0',
        segment: '',
        sub_classification: '',
        phase: '',
        development_modality: '',
        zoning: '',
        needs_eiv: false,
        ca_basic: 0,
        ca_max: 0,
        occupancy_rate: 0
    });

    useEffect(() => {
        const loadStudy = async () => {
            if (!studyId) return;
            try {
                const data = await imovibService.getStudyById(studyId);
                if (data) {
                    setFormData(data);
                }
            } catch (error) {
                console.error('Error loading study:', error);
            } finally {
                setInitialLoading(false);
            }
        };
        loadStudy();
    }, [studyId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else if (type === 'number') {
            setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            alert('O nome do empreendimento é obrigatório.');
            return;
        }

        try {
            setLoading(true);
            let saved: ImovibStudy;
            if (studyId) {
                saved = await imovibService.updateStudy(studyId, formData as ImovibStudyUpdate);
            } else {
                if (!organizationId) {
                    alert('Por favor, selecione uma organização no menu superior antes de salvar.');
                    setLoading(false);
                    return;
                }
                const newStudy: ImovibStudyInsert = {
                    ...formData,
                    organization_id: organizationId,
                    name: formData.name || 'Novo Estudo',
                    version: formData.version || '1.0',
                } as ImovibStudyInsert;
                saved = await imovibService.createStudy(newStudy);
            }
            onSaved(saved);
        } catch (error) {
            console.error('Error saving study:', error);
            alert('Erro ao salvar o estudo.');
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest animate-pulse">Carregando Estudo...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-12">
            {/* Header */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                            {studyId ? 'Editar Viabilidade' : 'Nova Viabilidade'}
                        </h1>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                            Módulo 0 — Identificação e Classificação
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 active:scale-95 whitespace-nowrap"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Estudo
                </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Coluna 1: Identificação Básica */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Identificação</h2>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nome do Empreendimento / SPE *</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name || ''}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                placeholder="Ex: Residencial Vista Parque"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">CNPJ da SPE (se houver)</label>
                            <input
                                type="text"
                                name="cnpj"
                                value={formData.cnpj || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                placeholder="00.000.000/0000-00"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Incorporadora / Desenvolvedor</label>
                            <input
                                type="text"
                                name="developer"
                                value={formData.developer || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                placeholder="Nome da Construtora/Incorporadora"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Gestor do Projeto</label>
                                <input
                                    type="text"
                                    name="manager"
                                    value={formData.manager || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    placeholder="Nome do Analista"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Versão do Modelo</label>
                                <input
                                    type="text"
                                    name="version"
                                    value={formData.version || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Classificação */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                            <Target className="w-5 h-5" />
                        </div>
                        <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Classificação do Projeto</h2>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Segmento</label>
                            <select
                                name="segment"
                                value={formData.segment || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Subclassificação Padrão</label>
                            <select
                                name="sub_classification"
                                value={formData.sub_classification || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                {SUB_CLASSIFICATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Fase do Empreendimento</label>
                            <select
                                name="phase"
                                value={formData.phase || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                {PHASES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Modalidade de Desenvolvimento</label>
                            <select
                                name="development_modality"
                                value={formData.development_modality || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                {MODALITIES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Coluna 3: Regulatório */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Mapa Regulatório</h2>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Zoneamento Atual</label>
                            <input
                                type="text"
                                name="zoning"
                                value={formData.zoning || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                placeholder="Ex: ZM, ZEU, ZCOR..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">CA Básico</label>
                                <input
                                    type="number"
                                    name="ca_basic"
                                    step="0.1"
                                    value={formData.ca_basic || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-center"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">CA Máximo</label>
                                <input
                                    type="number"
                                    name="ca_max"
                                    step="0.1"
                                    value={formData.ca_max || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-center"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Taxa de Ocupação (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    name="occupancy_rate"
                                    step="1"
                                    max="100"
                                    min="0"
                                    value={formData.occupancy_rate || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex items-start gap-3 mt-4">
                            <input
                                type="checkbox"
                                name="needs_eiv"
                                id="needs_eiv"
                                checked={formData.needs_eiv || false}
                                onChange={handleChange}
                                className="mt-1 w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                            />
                            <label htmlFor="needs_eiv" className="text-xs font-bold text-gray-700 cursor-pointer">
                                Exige Estudo de Impacto de Vizinhança (EIV) ou Impacto Ambiental (EIA)
                            </label>
                        </div>

                        {(formData.ca_basic && formData.ca_max && formData.ca_max > formData.ca_basic) ? (
                            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-3">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold text-amber-700 uppercase leading-snug">
                                    Atenção: A diferença entre o CA Máximo e Básico indica potencial necessidade de compra de outorga onerosa no Módulo 3.
                                </p>
                            </div>
                        ) : null}

                    </div>
                </div>
            </form>
        </div>
    );
};

export default ImovibForm;
