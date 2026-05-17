import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Filter, Edit2, Trash2, CheckCircle2,
    XCircle, AlertTriangle, Shield, X,
    Info, Calculator, AlertCircle, Save, Building2,
    TrendingUp, Loader2, DollarSign, Users, Banknote, Calendar
} from 'lucide-react';
import { payrollService, PayrollRubric } from '../services/payrollService';
import { rubricValidationService, ValidationResult } from '../services/rubricValidationService';

const LaborRubrics: React.FC = () => {
    const [rubrics, setRubrics] = useState<PayrollRubric[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [showInactive, setShowInactive] = useState(false);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRubric, setEditingRubric] = useState<PayrollRubric | null>(null);
    const [formData, setFormData] = useState<PayrollRubric>({
        code: '',
        name: '',
        type: 'provento',
        incidence_inss: false,
        incidence_fgts: false,
        incidence_irrf: false,
        is_automatic: false,
        is_clt_mandatory: false,
        calculation_type: 'manual',
        calculation_config: {},
        active: true,
        lancamento_individualizado: false,
        dia_lancamento: undefined
    });

    const [validation, setValidation] = useState<ValidationResult>({ valid: true, errors: [], warnings: [] });
    const [isSaving, setIsSaving] = useState(false);
    const [isUsed, setIsUsed] = useState(false);
    const [activeTab, setActiveTab] = useState<'form' | 'calculation' | 'history'>('form');
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const loadRubrics = async () => {
        setLoading(true);
        try {
            const data = await payrollService.listRubrics(true);
            setRubrics(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRubrics();
    }, []);

    const filteredRubrics = useMemo(() => {
        return rubrics.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                r.code.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === 'all' || r.type === filterType;
            const matchesStatus = showInactive || r.active;
            return matchesSearch && matchesType && matchesStatus;
        });
    }, [rubrics, searchTerm, filterType, showInactive]);
    const handleOpenModal = async (rubric: PayrollRubric | null) => {
        setValidation({ valid: true, errors: [], warnings: [] });
        setActiveTab('form');
        setHistory([]);
        if (rubric) {
            setEditingRubric(rubric);
            setFormData({ ...rubric });
            const used = await payrollService.isRubricUsed(rubric.code);
            setIsUsed(used);
            
            // Carregar histórico em paralelo
            loadHistory(rubric.code);
        } else {
            setEditingRubric(null);
            setFormData({
                code: '',
                name: '',
                type: 'provento',
                incidence_inss: false,
                incidence_fgts: false,
                incidence_irrf: false,
                is_automatic: false,
                is_clt_mandatory: false,
                calculation_type: 'manual',
                calculation_config: {},
                active: true,
                lancamento_individualizado: false,
                dia_lancamento: undefined
            });
            setIsUsed(false);
        }
        setIsModalOpen(true);
    };

    const loadHistory = async (code: string) => {
        setLoadingHistory(true);
        try {
            const logs = await payrollService.listAuditLogs('SYSTEM', 'RUBRIC', code);
            setHistory(logs);
        } catch (err: any) {
            console.error(err);
            if (err.code === 'PGRST205') {
                setHistory([{ id: 'loading', description: 'O banco de dados está atualizando o cache. Por favor, aguarde alguns segundos e tente abrir o modal novamente.', user_email: 'SISTEMA', action: 'INFO', created_at: new Date().toISOString() }]);
            }
        } finally {
            setLoadingHistory(false);
        }
    };

    const validate = async (data: PayrollRubric) => {
        const res = await rubricValidationService.validateRubricChange(editingRubric, data);
        setValidation(res);
        return res.valid;
    };

    const handleSave = async () => {
        const isValid = await validate(formData);
        if (!isValid) return;

        setIsSaving(true);
        try {
            if (editingRubric) {
                await payrollService.updateRubric(editingRubric.code, formData);
            } else {
                await payrollService.createRubric(formData);
            }
            setIsModalOpen(false);
            loadRubrics();
        } catch (err: any) {
            setValidation((v: ValidationResult) => ({ ...v, errors: [err.message || 'Erro ao salvar rubrica'] }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (code: string) => {
        if (!confirm('Deseja realmente excluir esta rubrica?')) return;
        try {
            await payrollService.deleteRubric(code);
            loadRubrics();
        } catch (err: any) {
            alert(err.message);
        }
    };

    if (loading && rubrics.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Carregando Rubricas...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestão de Rubricas</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Configuração do motor de cálculo</p>
                </div>
                <button 
                    onClick={() => handleOpenModal(null)}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-black text-xs uppercase tracking-widest"
                >
                    <Plus size={16} /> Nova Rubrica
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex-1 min-w-[300px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-2xl">
                    <Filter size={16} className="text-slate-400" />
                    <select 
                        className="bg-transparent border-none text-xs font-black text-slate-600 outline-none uppercase tracking-widest"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">Todos os Tipos</option>
                        <option value="provento">Proventos</option>
                        <option value="desconto">Descontos</option>
                        <option value="encargo">Encargos</option>
                        <option value="informativa">Informativas</option>
                    </select>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inativos</span>
                    <button 
                        onClick={() => setShowInactive(!showInactive)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${showInactive ? 'bg-indigo-500' : 'bg-slate-200'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showInactive ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cód / Nome</th>
                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidências</th>
                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredRubrics.map(r => (
                            <tr key={r.code} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                                            r.type === 'provento' ? 'bg-emerald-50 text-emerald-600' : 
                                            r.type === 'desconto' ? 'bg-rose-50 text-rose-600' : 
                                            r.type === 'informativa' ? 'bg-slate-100 text-slate-500' :
                                            'bg-amber-50 text-amber-600'
                                        }`}>
                                            {r.code.substring(0, 3)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{r.name}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{r.code}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                            r.type === 'provento' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            r.type === 'desconto' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                            r.type === 'informativa' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                                            'bg-amber-50 text-amber-600 border-amber-100'
                                    }`}>
                                        {r.type}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex gap-1.5">
                                        {['inss', 'fgts', 'irrf'].map(tax => {
                                            const active = !!(r as any)[`incidence_${tax}`];
                                            return (
                                                <div 
                                                    key={tax}
                                                    title={tax.toUpperCase()}
                                                    className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-colors ${
                                                        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-300'
                                                    }`}
                                                >
                                                    {tax}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-2">
                                        {r.active ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600">
                                                <CheckCircle2 size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Ativo</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <XCircle size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Inativo</span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-8 py-5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button 
                                            onClick={() => handleOpenModal(r)}
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            title="Editar"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(r.code)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            title="Excluir"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredRubrics.length === 0 && (
                    <div className="p-20 text-center">
                        <Info className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhuma rubrica encontrada</h3>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    
                    <div className="relative bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                        {/* Modal Header */}
                        <div className="bg-slate-900 p-8 pb-4 text-white">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                                        <Shield className="text-indigo-400" />
                                        {editingRubric ? 'Editar Rubrica' : 'Nova Rubrica'}
                                    </h3>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Configurações de incidência tributária</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            {editingRubric && (
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => setActiveTab('form')}
                                        className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'form' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                                    >
                                        Configuração
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('calculation')}
                                        className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'calculation' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                                    >
                                        Cálculo
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('history')}
                                        className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'history' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                                    >
                                        Histórico de Alterações
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-8 overflow-y-auto space-y-8">
                            {activeTab === 'form' ? (
                                <>
                                    {/* Validation Errors/Warnings */}
                                    {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                                        <div className="space-y-2">
                                            {validation.errors.map((err, i) => (
                                                <div key={i} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3">
                                                    <AlertCircle className="text-rose-600 shrink-0" size={18} />
                                                    <p className="text-xs font-bold text-rose-700">{err}</p>
                                                </div>
                                            ))}
                                            {validation.warnings.map((warn, i) => (
                                                <div key={i} className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
                                                    <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                                                    <p className="text-xs font-bold text-amber-700">{warn}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Form Grid */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código</label>
                                            <input 
                                                type="text"
                                                disabled={!!editingRubric}
                                                placeholder="EX: SALARIO"
                                                value={formData.code}
                                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 uppercase"
                                            />
                                            {editingRubric && <p className="text-[9px] text-slate-400 font-bold ml-1 italic">* Código não pode ser alterado após criação.</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                                            <input 
                                                type="text"
                                                placeholder="EX: Salário Base"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Rubrica</label>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {['provento', 'desconto', 'encargo', 'informativa'].map(t => (
                                                    <button
                                                        key={t}
                                                        disabled={isUsed}
                                                        onClick={() => setFormData({ ...formData, type: t as any })}
                                                        className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                            formData.type === t 
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                                            : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
                                                        } ${isUsed ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                            {isUsed && <p className="text-[9px] text-amber-600 font-bold ml-1 italic">* Tipo bloqueado: rubrica já utilizada em lançamentos.</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Configurações</label>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <button 
                                                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                                                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${
                                                        formData.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'
                                                    }`}
                                                >
                                                    {formData.active ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{formData.active ? 'Ativa' : 'Inativa'}</span>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => setFormData({ ...formData, is_automatic: !formData.is_automatic })}
                                                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${
                                                        formData.is_automatic ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-white text-slate-300 border-slate-100'
                                                    }`}
                                                >
                                                    <Calculator size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Automática</span>
                                                </button>

                                                <button
                                                    onClick={() => setFormData({ ...formData, is_clt_mandatory: !formData.is_clt_mandatory })}
                                                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${
                                                        formData.is_clt_mandatory ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm' : 'bg-white text-slate-300 border-slate-100'
                                                    }`}
                                                    title="Se ativado, esta rubrica será incluída automaticamente para TODOS os colaboradores CLT"
                                                >
                                                    <Users size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Padrão CLT</span>
                                                </button>

                                                <button
                                                    onClick={() => setFormData({ ...formData, lancamento_individualizado: !formData.lancamento_individualizado, dia_lancamento: !formData.lancamento_individualizado ? formData.dia_lancamento : undefined })}
                                                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${
                                                        formData.lancamento_individualizado ? 'bg-violet-50 text-violet-600 border-violet-100 shadow-sm' : 'bg-white text-slate-300 border-slate-100'
                                                    }`}
                                                    title="Se ativado, ao fechar a folha este lançamento é registrado separadamente no financeiro por funcionário"
                                                >
                                                    <Banknote size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Lançamento Individualizado</span>
                                                </button>
                                            </div>

                                            {formData.lancamento_individualizado && (
                                                <div className="space-y-2 mt-3 animate-in zoom-in-95 duration-200">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                        <Calendar size={11} className="text-violet-500" />
                                                        Dia do Lançamento no Financeiro
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={28}
                                                        placeholder="Ex: 15"
                                                        value={formData.dia_lancamento ?? ''}
                                                        onChange={(e) => {
                                                            const v = parseInt(e.target.value);
                                                            setFormData({ ...formData, dia_lancamento: isNaN(v) ? undefined : Math.min(28, Math.max(1, v)) });
                                                        }}
                                                        className="w-full px-5 py-3 bg-violet-50 border border-violet-100 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 transition-all"
                                                    />
                                                    <p className="text-[9px] text-violet-600 font-bold ml-1 italic">
                                                        * Dia do mês (1–28) em que o lançamento será criado no financeiro. Se não informado, usa o último dia da folha.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Incidences Matrix */}
                                    <div className="bg-slate-50 p-6 rounded-[32px] space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <TrendingUp size={14} className="text-indigo-500" /> Matriz de Incidência Tributária
                                            </h4>
                                            {formData.type === 'desconto' && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 rounded-lg border border-amber-100 animate-pulse">
                                                    <Info size={10} className="text-amber-600" />
                                                    <span className="text-[8px] font-bold text-amber-700 uppercase tracking-tight">Abate Base p/ Descontos</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            {[
                                                { key: 'incidence_inss', label: 'INSS', icon: Shield },
                                                { key: 'incidence_fgts', label: 'FGTS', icon: Building2 },
                                                { key: 'incidence_irrf', label: 'IRRF', icon: DollarSign }
                                            ].map(tax => {
                                                const active = !!(formData as any)[tax.key];
                                                const isProtected = editingRubric && ['INSS', 'IRRF', 'FGTS'].includes(editingRubric.code);
                                                return (
                                                    <button
                                                        key={tax.key}
                                                        disabled={!!isProtected}
                                                        onClick={() => setFormData({ ...formData, [tax.key]: !active })}
                                                        className={`p-4 rounded-2xl flex flex-col items-center gap-2 border transition-all ${
                                                            active 
                                                            ? 'bg-white text-indigo-600 border-indigo-200 shadow-sm' 
                                                            : 'bg-white/50 text-slate-300 border-slate-100 opacity-60'
                                                        } ${isProtected ? 'cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                                                    >
                                                        <div className={`p-2 rounded-lg ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                            <tax.icon size={16} />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{tax.label}</span>
                                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${active ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${active ? 'left-4.5' : 'left-0.5'}`} />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {editingRubric && ['INSS', 'IRRF', 'FGTS'].includes(editingRubric.code) && (
                                            <p className="text-[9px] text-rose-500 font-bold text-center italic mt-2 flex items-center justify-center gap-1">
                                                <AlertCircle size={10} /> Esta é uma rubrica fiscal protegida. As incidências são fixas.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : activeTab === 'calculation' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="bg-indigo-50 p-6 rounded-[32px] border border-indigo-100 flex items-start gap-4">
                                        <Calculator className="text-indigo-600 mt-1" size={20} />
                                        <div>
                                            <h4 className="text-sm font-black text-indigo-900 tracking-tight">Motor de Cálculo Automático</h4>
                                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Configuração de fórmulas e parâmetros</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Cálculo</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {[
                                                    { id: 'manual', label: 'Manual' },
                                                    { id: 'fixed', label: 'Valor Fixo' },
                                                    { id: 'percentage', label: 'Percentual' },
                                                    { id: 'formula', label: 'Fórmula' }
                                                ].map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => setFormData({ 
                                                            ...formData, 
                                                            calculation_type: t.id as any,
                                                            is_automatic: t.id !== 'manual' 
                                                        })}
                                                        className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                            formData.calculation_type === t.id 
                                                            ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                                                            : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        {t.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {formData.calculation_type === 'fixed' && (
                                            <div className="space-y-2 animate-in zoom-in-95 duration-200">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Unitário Fixo</label>
                                                <div className="relative">
                                                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                    <input 
                                                        type="number"
                                                        step="0.01"
                                                        value={formData.calculation_config?.amount || 0}
                                                        onChange={(e) => setFormData({ 
                                                            ...formData, 
                                                            calculation_config: { ...formData.calculation_config, amount: parseFloat(e.target.value) } 
                                                        })}
                                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                                                    />
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-bold ml-1 italic">Este valor será aplicado automaticamente em todas as folhas.</p>
                                            </div>
                                        )}

                                        {formData.calculation_type === 'percentage' && (
                                            <div className="grid grid-cols-2 gap-6 animate-in zoom-in-95 duration-200">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Base de Cálculo</label>
                                                    <select 
                                                        value={formData.calculation_config?.base || 'SALARIO'}
                                                        onChange={(e) => setFormData({ 
                                                            ...formData, 
                                                            calculation_config: { ...formData.calculation_config, base: e.target.value } 
                                                        })}
                                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all appearance-none uppercase"
                                                    >
                                                        <option value="SALARIO">Salário Base</option>
                                                        <option value="TOTAL_PROVENTOS">Total de Proventos</option>
                                                        <option value="HORAS_TRABALHADAS">Horas Trabalhadas</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Percentual (%)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="number"
                                                            step="0.1"
                                                            placeholder="Ex: 40"
                                                            value={(formData.calculation_config?.percentage || 0) * 100}
                                                            onChange={(e) => setFormData({ 
                                                                ...formData, 
                                                                calculation_config: { ...formData.calculation_config, percentage: parseFloat(e.target.value) / 100 } 
                                                            })}
                                                            className="w-full pl-5 pr-12 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {formData.calculation_type === 'formula' && (
                                            <div className="space-y-4 animate-in zoom-in-95 duration-200">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fórmula Customizada</label>
                                                    <textarea 
                                                        placeholder="Ex: SALARIO * 0.05"
                                                        value={formData.formula || ''}
                                                        onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-[24px] text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all h-24 resize-none"
                                                    />
                                                </div>
                                                <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Calculator size={14} className="text-amber-600" />
                                                        <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Variáveis Disponíveis</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                                                        {['SALARIO', 'HE50_HRS', 'HE100_HRS', 'AD_NOT_HRS', 'HOURLY_RATE', 'PERC', 'VALOR'].map(v => (
                                                            <button 
                                                                key={v} 
                                                                type="button"
                                                                onClick={() => setFormData({ ...formData, formula: (formData.formula || '') + (formData.formula ? ' ' : '') + v })}
                                                                className="flex items-center justify-between px-2 py-1.5 bg-amber-100/50 hover:bg-amber-100 border border-amber-200/50 rounded-xl transition-all group/btn"
                                                            >
                                                                <code className="text-[9px] font-black text-amber-700 uppercase tracking-tighter">{v}</code>
                                                                <Plus size={10} className="text-amber-400 group-hover/btn:text-amber-600 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[8px] text-amber-600 font-bold uppercase mt-3 leading-tight">
                                                        Use operadores matemáticos básicos: + - * / ( )
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {formData.calculation_type === 'manual' && (
                                            <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 flex items-start gap-4 animate-in zoom-in-95 duration-200">
                                                <Info className="text-slate-400 mt-1" size={20} />
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-700 tracking-tight">Lançamento Comercial/Manual</h4>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                                        O valor desta rubrica não é calculado automaticamente. Ele deve ser informado mensalmente via tela de Lançamentos ou Eventos de Folha.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {loadingHistory ? (
                                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
                                    ) : history.length > 0 ? (
                                        <div className="space-y-4">
                                            {history.map(log => (
                                                <div key={log.id} className="bg-slate-50 p-6 rounded-3xl space-y-3 relative overflow-hidden group border border-slate-100">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                                            log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                                            log.action === 'UPDATE' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                            {log.action}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            {new Date(log.created_at).toLocaleString('pt-BR')}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-700">{log.description}</p>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-black text-slate-500 uppercase">
                                                            {log.user_email.substring(0, 1)}
                                                        </div>
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{log.user_email}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center text-slate-400">
                                            <Search className="mx-auto mb-3 opacity-20" />
                                            <p className="text-[10px] font-black uppercase tracking-wider">Nenhum histórico encontrado para esta rubrica.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 bg-slate-50 flex items-center justify-between border-t border-slate-100">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-3 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-black text-xs uppercase tracking-widest disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                                {editingRubric ? 'Salvar Alterações' : 'Criar Rubrica'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaborRubrics;
