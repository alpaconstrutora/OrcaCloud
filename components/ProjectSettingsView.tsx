import React from 'react';
import { ProjectSettings } from '../types';
import { BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../constants';
import {
    Settings,
    Database,
    Globe,
    Percent,
    Calculator,
    Cloud,
    Save,
    CheckCircle,
    Loader2,
    AlertTriangle,
    Building2,
    Layers,
    Calendar,
    Ruler,
    ShieldCheck,
    TrendingUp,
    BarChart3,
    PercentCircle
} from 'lucide-react';

interface ProjectSettingsViewProps {
    settings: ProjectSettings;
    onUpdateSettings: (newSettings: ProjectSettings) => void;
}

const ProjectSettingsView: React.FC<ProjectSettingsViewProps> = ({ settings, onUpdateSettings }) => {
    const [formData, setFormData] = React.useState<ProjectSettings>(settings);
    const [isSaving, setIsSaving] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

    // Sync if settings change externally
    React.useEffect(() => {
        setFormData(settings);
    }, [settings]);

    const calculateBdi = (comp: any) => {
        if (!comp) return formData.bdi;
        const ac = (comp.admin || 0) / 100;
        const s = (comp.insurance || 0) / 100;
        const g = (comp.guarantee || 0) / 100;
        const r = (comp.risk || 0) / 100;
        const df = (comp.finance || 0) / 100;
        const l = (comp.profit || 0) / 100;
        const i = (comp.taxes || 0) / 100;

        if (i >= 1) return 0;

        const num = (1 + (ac + s + g + r)) * (1 + df) * (1 + l);
        const den = 1 - i;
        return ((num / den) - 1) * 100;
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus('IDLE');
        try {
            await onUpdateSettings(formData);
            setSaveStatus('SUCCESS');
            setTimeout(() => setSaveStatus('IDLE'), 3000);
        } catch (error) {
            console.error("Error saving settings:", error);
            setSaveStatus('ERROR');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                        {formData.classification === 'OBRA' ? 'Configurações da Obra' : 'Configurações do Orçamento'}
                    </h1>
                    <p className="text-gray-500 text-sm italic">
                        {formData.classification === 'OBRA'
                            ? 'Defina os parâmetros globais e técnicos desta obra e modelo.'
                            : 'Defina os parâmetros globais e técnicos deste orçamento.'}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg ${saveStatus === 'SUCCESS'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                        } disabled:opacity-50`}
                >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> :
                        saveStatus === 'SUCCESS' ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                    {isSaving ? 'SALVANDO...' : saveStatus === 'SUCCESS' ? 'SALVO!' : 'SALVAR ALTERAÇÕES'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Status, Tipo e Parâmetros */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Layers className="w-5 h-5 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800 tracking-tight">Status e Tipo</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Status do Projeto</label>
                            <select
                                value={formData.status || 'Em Andamento'}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Finalizado">Finalizado</option>
                                <option value="Aprovado">Aprovado</option>
                                <option value="Proposta">Proposta</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Tipo de Orçamento</label>
                            <select
                                value={formData.budgetType || 'ANALYTIC'}
                                onChange={(e) => setFormData({ ...formData, budgetType: e.target.value as any })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                <option value="ANALYTIC">Analítico (Detalhado)</option>
                                <option value="PARAMETRIC">Paramétrico (Estimado)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Status do Orçamento</label>
                            <select
                                value={formData.budgetStatus || 'Em Andamento'}
                                onChange={(e) => setFormData({ ...formData, budgetStatus: e.target.value as any })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                <option value="Em Andamento">Em Andamento (Aberto)</option>
                                <option value="Fechado">Fechado (Bloqueado)</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Área Prox. (m²)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    type="number"
                                    value={formData.area}
                                    onChange={(e) => setFormData({ ...formData, area: Number(e.target.value) })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Padrão Construtivo</label>
                            <select
                                value={formData.standard}
                                onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                {Object.entries(CUB_STANDARDS_DATA).map(([key, data]) => (
                                    <option key={key} value={key}>{data.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Base de Referência */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <Database className="w-5 h-5 text-indigo-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800 tracking-tight">Referência de Preços</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Base de Dados</label>
                            <select
                                value={formData.database}
                                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                <option value="SINAPI">SINAPI</option>
                                <option value="Própria">Base Própria</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Mês de Referência</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={formData.referenceMonth}
                                    onChange={(e) => setFormData({ ...formData, referenceMonth: e.target.value })}
                                    placeholder="MM/YYYY"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Localidade (Estado)</label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <select
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            >
                                {Object.keys(BASE_CUB_RATES).sort().map(uf => (
                                    <option key={uf} value={uf}>{uf} - Preços e CUB {uf}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Parâmetros Financeiros */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                        <div className="p-2 bg-amber-50 rounded-lg">
                            <Calculator className="w-5 h-5 text-amber-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800 tracking-tight">Parâmetros Financeiros</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">BDI Padrão (%)</label>
                            <div className="relative">
                                <Percent className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.bdi}
                                    onChange={(e) => setFormData({ ...formData, bdi: Number(e.target.value) })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Encargos Sociais (LS %)</label>
                            <div className="relative">
                                <Percent className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.ls}
                                    onChange={(e) => setFormData({ ...formData, ls: Number(e.target.value) })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Regime de Encargos</label>
                        <select
                            value={formData.socialChargesMode}
                            onChange={(e) => setFormData({ ...formData, socialChargesMode: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                            <option value="Sem Desoneração">Sem Desoneração</option>
                            <option value="Com Desoneração">Com Desoneração</option>
                            <option value="Sem Encargos Sociais">Sem Encargos Sociais (Custom)</option>
                        </select>
                    </div>
                </div>

                {/* Composição Detalhada de BDI */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6 md:col-span-2">
                    <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 rounded-lg">
                                <BarChart3 className="w-5 h-5 text-purple-600" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800 tracking-tight">Composição Detalhada de BDI (Fórmula Científica)</h2>
                        </div>
                        <div className="flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-xl">
                            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">BDI Calculado:</span>
                            <span className="text-lg font-black text-purple-700">{calculateBdi(formData.bdiComposition).toFixed(2)}%</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                        {[
                            { label: 'Adm. Central', key: 'admin', icon: Building2 },
                            { label: 'Seguros', key: 'insurance', icon: ShieldCheck },
                            { label: 'Garantias', key: 'guarantee', icon: CheckCircle },
                            { label: 'Riscos', key: 'risk', icon: AlertTriangle },
                            { label: 'Desp. Fin.', key: 'finance', icon: TrendingUp },
                            { label: 'Lucro', key: 'profit', icon: PercentCircle },
                            { label: 'Impostos', key: 'taxes', icon: Calculator },
                        ].map((item) => (
                            <div key={item.key} className="space-y-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tight px-1 whitespace-nowrap">{item.label} (%)</label>
                                <div className="relative">
                                    <item.icon className="absolute left-3 top-3 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.bdiComposition?.[item.key as keyof typeof formData.bdiComposition] || 0}
                                        onChange={(e) => {
                                            const newComp = {
                                                ...(formData.bdiComposition || { taxes: 0, profit: 0, risk: 0, insurance: 0, admin: 0, guarantee: 0, finance: 0 }),
                                                [item.key]: Number(e.target.value)
                                            };
                                            setFormData({
                                                ...formData,
                                                bdiComposition: newComp,
                                                bdi: calculateBdi(newComp)
                                            });
                                        }}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100/50">
                        <p className="text-[10px] text-purple-800 font-medium leading-relaxed italic">
                            A fórmula científica de BDI é utilizada para garantir que as despesas indiretas e lucros sejam aplicados corretamente sobre o custo direto, considerando a incidência de impostos sobre o faturamento bruto.
                        </p>
                    </div>
                </div>

                {/* Sistema e Segurança */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                            <Cloud className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800 tracking-tight">Sincronização</h2>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg transition-colors ${formData.autoSave ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                                <Cloud className={`w-5 h-5 ${formData.autoSave ? 'animate-pulse' : ''}`} />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-800">Salvamento Automático</h4>
                                <p className="text-[10px] text-gray-500 font-medium">Salva alterações na nuvem em tempo real.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, autoSave: !formData.autoSave })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:ring-2 focus:ring-blue-500 ${formData.autoSave ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.autoSave ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <p className="text-[10px] text-amber-800 font-medium uppercase leading-relaxed tracking-tight">
                            Atenção: A alteração da Base de Dados ou Mês de Referência pode impactar o cálculo de itens SINAPI já existentes no orçamento.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectSettingsView;
