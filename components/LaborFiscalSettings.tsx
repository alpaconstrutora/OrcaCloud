import React, { useState, useEffect } from 'react';
import {
    Calendar, Shield, Building2, AlertCircle,
    Plus, Save, History, TrendingUp, Info, Loader2
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { fiscalService, INSSBracket, IRRFBracket, FGTSConfig } from '../services/fiscalService';

const LaborFiscalSettings: React.FC = () => {
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [inssBrackets, setInssBrackets] = useState<INSSBracket[]>([]);
    const [irrfBrackets, setIrrfBrackets] = useState<IRRFBracket[]>([]);
    const [fgtsConfig, setFgtsConfig] = useState<FGTSConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingINSS, setEditingINSS] = useState(false);
    const [editingIRRF, setEditingIRRF] = useState(false);
    const [editingFGTS, setEditingFGTS] = useState(false);
    const [saving, setSaving] = useState(false);

    const years = [2023, 2024, 2025, 2026];

    const loadData = async () => {
        setLoading(true);
        const refDate = `${selectedYear}-06-01`; 
        try {
            const [inss, irrf, fgts] = await Promise.all([
                fiscalService.getINSSBrackets(refDate),
                fiscalService.getIRRFBrackets(refDate),
                fiscalService.getFGTSConfig(refDate)
            ]);
            setInssBrackets(inss);
            setIrrfBrackets(irrf);
            setFgtsConfig(fgts);
        } catch (err) {
            console.error('Erro ao carregar dados fiscais:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveINSS = async () => {
        if (!editingINSS) {
            setEditingINSS(true);
            return;
        }

        setSaving(true);
        try {
            await Promise.all(inssBrackets.map(b => 
                b.id ? fiscalService.updateINSSBracket(b.id, b) : Promise.resolve()
            ));
            setEditingINSS(false);
            showToast('Tabela INSS atualizada com sucesso!', 'success');
        } catch (err) {
            showToast('Erro ao salvar INSS', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveIRRF = async () => {
        if (!editingIRRF) {
            setEditingIRRF(true);
            return;
        }

        setSaving(true);
        try {
            await Promise.all(irrfBrackets.map(b => 
                b.id ? fiscalService.updateIRRFBracket(b.id, b) : Promise.resolve()
            ));
            setEditingIRRF(false);
            showToast('Tabela IRRF atualizada com sucesso!', 'success');
        } catch (err) {
            showToast('Erro ao salvar IRRF', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveFGTS = async () => {
        if (!editingFGTS) {
            setEditingFGTS(true);
            return;
        }
        if (!fgtsConfig?.id) return;

        setSaving(true);
        try {
            await fiscalService.updateFGTSConfig(fgtsConfig.id, fgtsConfig);
            setEditingFGTS(false);
            showToast('FGTS atualizado com sucesso!', 'success');
        } catch (err) {
            showToast('Erro ao salvar FGTS', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicateYear = async () => {
        const sourceStr = prompt('Duplicar de qual ano? (Ex: 2024)', (selectedYear - 1).toString());
        if (!sourceStr) return;
        const sourceYear = parseInt(sourceStr);
        
        setSaving(true);
        try {
            await fiscalService.duplicateYear(sourceYear, selectedYear);
            showToast(`Tabelas de ${sourceYear} clonadas para ${selectedYear} com sucesso!`, 'success');
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Erro ao clonar tabelas', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleAddINSSBracket = async () => {
        const newBracket: Omit<INSSBracket, 'id'> = {
            valid_from: `${selectedYear}-01-01`,
            valid_to: `${selectedYear}-12-31`,
            min_value: 0,
            max_value: 0,
            rate: 0,
            deduction: 0
        };
        try {
            const created = await fiscalService.createINSSBracket(newBracket);
            setInssBrackets([...inssBrackets, created]);
            setEditingINSS(true);
        } catch (err) {
            showToast('Erro ao adicionar faixa', 'error');
        }
    };

    const handleAddIRRFBracket = async () => {
        const newBracket: Omit<IRRFBracket, 'id'> = {
            valid_from: `${selectedYear}-01-01`,
            valid_to: `${selectedYear}-12-31`,
            min_value: 0,
            max_value: 0,
            rate: 0,
            deduction: 0
        };
        try {
            const created = await fiscalService.createIRRFBracket(newBracket);
            setIrrfBrackets([...irrfBrackets, created]);
            setEditingIRRF(true);
        } catch (err) {
            showToast('Erro ao adicionar faixa', 'error');
        }
    };

    const handleDeleteINSSBracket = async (id?: string) => {
        if (!id) return;
        if (!await confirm({ title: 'Excluir faixa de INSS?', message: 'Tem certeza que deseja excluir esta faixa?', variant: 'danger' })) return;
        try {
            await fiscalService.deleteINSSBracket(id);
            setInssBrackets(inssBrackets.filter(b => b.id !== id));
        } catch (err) {
            showToast('Erro ao excluir faixa', 'error');
        }
    };

    const handleDeleteIRRFBracket = async (id?: string) => {
        if (!id) return;
        if (!await confirm({ title: 'Excluir faixa de IRRF?', message: 'Tem certeza que deseja excluir esta faixa?', variant: 'danger' })) return;
        try {
            await fiscalService.deleteIRRFBracket(id);
            setIrrfBrackets(irrfBrackets.filter(b => b.id !== id));
        } catch (err) {
            showToast('Erro ao excluir faixa', 'error');
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedYear]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header com Seletor de Data */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[10px] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configurações Fiscais</h2>
                    <p className="text-slate-500 text-xs mt-1.5 font-medium">Consultar tabelas por competência</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDuplicateYear}
                        disabled={saving || loading}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-50 text-indigo-600 rounded-[6px] font-medium text-[13px] hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                    >
                        {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <TrendingUp className="w-[15px] h-[15px]" />}
                        Clonar tabelas
                    </button>
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[10px] border border-slate-100">
                        <div className="flex items-center gap-3 px-4 py-2">
                            <Calendar size={18} className="text-indigo-600" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-semibold text-slate-500">Ano de Referência</span>
                                <select 
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                    className="bg-transparent border-none p-0 text-sm font-black text-slate-700 focus:ring-0 outline-none w-32 cursor-pointer"
                                >
                                    {years.map(y => (
                                        <option key={y} value={y}>Tabelas {y}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* INSS */}
                <div className="bg-white rounded-[10px] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
                    <div className="p-8 bg-slate-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-[10px] flex items-center justify-center border border-indigo-500/30">
                                <Shield className="text-indigo-400" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight">Tabela INSS</h3>
                                <p className="text-indigo-400 text-xs font-medium">Cálculo Progressivo</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleSaveINSS}
                                disabled={saving}
                                className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium transition-all ${
                                    editingINSS ? 'bg-indigo-500 text-white animate-pulse' : 'bg-white/10 text-indigo-400 hover:bg-white/20'
                                }`}
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : editingINSS ? <Save size={14} /> : 'Editar'}
                                {editingINSS ? 'Salvar' : ''}
                            </button>
                            <button className="p-2 hover:bg-white/10 rounded-[6px] transition-all" title="Ver Histórico">
                                <History size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="p-8 flex-1">
                        <div className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-50 rounded-[10px] animate-pulse" />)}
                                </div>
                            ) : inssBrackets.length > 0 ? (
                                <div className="space-y-3">
                                    {inssBrackets.map((bracket, idx) => (
                                        <div key={idx} className="group relative bg-slate-50 p-4 rounded-[10px] border border-transparent hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-[6px] bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">
                                                        {idx + 1}º
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-500 mb-0.5">Faixa de Base</p>
                                                        {editingINSS ? (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-semibold text-slate-500 w-12">Ano Civil:</span>
                                                                    <select 
                                                                        value={bracket.valid_from.split('-')[0]}
                                                                        onChange={(e) => {
                                                                            const year = e.target.value;
                                                                            const newBrackets = [...inssBrackets];
                                                                            newBrackets[idx].valid_from = `${year}-01-01`;
                                                                            newBrackets[idx].valid_to = `${year}-12-31`;
                                                                            setInssBrackets(newBrackets);
                                                                        }}
                                                                        className="bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-xs font-black text-indigo-600 outline-none"
                                                                    >
                                                                        {years.map(y => <option key={y} value={y.toString()}>{y}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-semibold text-slate-500 w-12">Base:</span>
                                                                    <input 
                                                                        type="number" 
                                                                        value={bracket.min_value}
                                                                        onChange={(e) => {
                                                                            const newBrackets = [...inssBrackets];
                                                                            newBrackets[idx].min_value = parseFloat(e.target.value);
                                                                            setInssBrackets(newBrackets);
                                                                        }}
                                                                        className="w-20 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-form-input font-black"
                                                                    />
                                                                    <span className="text-slate-400 text-xs">até</span>
                                                                    <input 
                                                                        type="number" 
                                                                        value={bracket.max_value || 0}
                                                                        onChange={(e) => {
                                                                            const newBrackets = [...inssBrackets];
                                                                            newBrackets[idx].max_value = parseFloat(e.target.value);
                                                                            setInssBrackets(newBrackets);
                                                                        }}
                                                                        className="w-20 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-form-input font-black"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm font-black text-slate-700">
                                                                R$ {bracket.min_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                                                {bracket.max_value ? ` até R$ ${bracket.max_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ' em diante'}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-xs font-semibold text-slate-500 mb-0.5">Alíquota</p>
                                                        {editingINSS ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <input 
                                                                    type="number" 
                                                                    step="0.1"
                                                                    value={bracket.rate * 100}
                                                                    onChange={(e) => {
                                                                        const newBrackets = [...inssBrackets];
                                                                        newBrackets[idx].rate = parseFloat(e.target.value) / 100;
                                                                        setInssBrackets(newBrackets);
                                                                    }}
                                                                    className="w-16 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-right font-black text-indigo-600"
                                                                />
                                                                <span className="text-indigo-600 font-black">%</span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-lg font-black text-indigo-600">{(bracket.rate * 100).toFixed(1)}%</p>
                                                        )}
                                                    </div>
                                                    {editingINSS && (
                                                        <ActionIconButton kind="delete" title="Excluir Faixa" onClick={() => handleDeleteINSSBracket(bracket.id)} />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-20 text-center bg-slate-50 rounded-[10px] border border-dashed border-slate-200">
                                    <AlertCircle className="mx-auto text-slate-300 mb-4" size={40} />
                                    <p className="text-slate-400 font-medium text-xs">Nenhuma tabela cadastrada para {selectedYear}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="px-8 pb-8">
                        <button
                            onClick={handleAddINSSBracket}
                            className="w-full flex items-center justify-center gap-1.5 h-9 bg-indigo-600 text-white rounded-[6px] font-medium text-[13px] hover:bg-indigo-700 transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Nova vigência INSS
                        </button>
                    </div>
                </div>

                {/* IRRF */}
                <div className="bg-white rounded-[10px] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
                    <div className="p-8 bg-slate-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-rose-500/20 rounded-[10px] flex items-center justify-center border border-rose-500/30">
                                <TrendingUp className="text-rose-400" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight">Tabela IRRF</h3>
                                <p className="text-rose-400 text-xs font-medium">Imposto de Renda</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleSaveIRRF}
                                disabled={saving}
                                className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium transition-all ${
                                    editingIRRF ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/10 text-rose-400 hover:bg-white/20'
                                }`}
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : editingIRRF ? <Save size={14} /> : 'Editar'}
                                {editingIRRF ? 'Salvar' : ''}
                            </button>
                            <button className="p-2 hover:bg-white/10 rounded-[6px] transition-all" title="Ver Histórico">
                                <History size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="p-8 flex-1">
                        <div className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-50 rounded-[10px] animate-pulse" />)}
                                </div>
                            ) : irrfBrackets.length > 0 ? (
                                <div className="space-y-3">
                                    {irrfBrackets.map((bracket, idx) => (
                                        <div key={idx} className="group relative bg-slate-50 p-4 rounded-[10px] border border-transparent hover:border-rose-100 hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-[6px] bg-rose-50 text-rose-600 flex items-center justify-center text-xs font-black">
                                                        {idx + 1}º
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-500 mb-0.5">Faixa de Base</p>
                                                        {editingIRRF ? (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-semibold text-slate-500 w-12">Ano Civil:</span>
                                                                    <select 
                                                                        value={bracket.valid_from.split('-')[0]}
                                                                        onChange={(e) => {
                                                                            const year = e.target.value;
                                                                            const newBrackets = [...irrfBrackets];
                                                                            newBrackets[idx].valid_from = `${year}-01-01`;
                                                                            newBrackets[idx].valid_to = `${year}-12-31`;
                                                                            setIrrfBrackets(newBrackets);
                                                                        }}
                                                                        className="bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-xs font-black text-rose-600 outline-none"
                                                                    >
                                                                        {years.map(y => <option key={y} value={y.toString()}>{y}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-semibold text-slate-500 w-12">Base:</span>
                                                                    <input 
                                                                        type="number" 
                                                                        value={bracket.min_value}
                                                                        onChange={(e) => {
                                                                            const newBrackets = [...irrfBrackets];
                                                                            newBrackets[idx].min_value = parseFloat(e.target.value);
                                                                            setIrrfBrackets(newBrackets);
                                                                        }}
                                                                        className="w-20 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-form-input font-black"
                                                                    />
                                                                    <span className="text-slate-400 text-xs">até</span>
                                                                    <input 
                                                                        type="number" 
                                                                        value={bracket.max_value || 0}
                                                                        onChange={(e) => {
                                                                            const newBrackets = [...irrfBrackets];
                                                                            newBrackets[idx].max_value = parseFloat(e.target.value);
                                                                            setIrrfBrackets(newBrackets);
                                                                        }}
                                                                        className="w-20 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-form-input font-black"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm font-black text-slate-700">
                                                                R$ {bracket.min_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                                                {bracket.max_value ? ` até R$ ${bracket.max_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ' em diante'}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-4 items-center">
                                                    <div className="text-right">
                                                        <p className="text-xs font-semibold text-slate-500 mb-0.5">Dedução</p>
                                                        {editingIRRF ? (
                                                            <input 
                                                                type="number" 
                                                                value={bracket.deduction}
                                                                onChange={(e) => {
                                                                    const newBrackets = [...irrfBrackets];
                                                                    newBrackets[idx].deduction = parseFloat(e.target.value);
                                                                    setIrrfBrackets(newBrackets);
                                                                }}
                                                                className="w-20 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-right font-black text-slate-400 text-form-input"
                                                            />
                                                        ) : (
                                                            <p className="text-xs font-black text-slate-400">R$ {bracket.deduction.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-semibold text-slate-500 mb-0.5">Alíquota</p>
                                                        {editingIRRF ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <input 
                                                                    type="number" 
                                                                    step="0.1"
                                                                    value={bracket.rate * 100}
                                                                    onChange={(e) => {
                                                                        const newBrackets = [...irrfBrackets];
                                                                        newBrackets[idx].rate = parseFloat(e.target.value) / 100;
                                                                        setIrrfBrackets(newBrackets);
                                                                    }}
                                                                    className="w-16 bg-white border border-slate-200 rounded-[6px] px-1 py-0.5 text-right font-black text-rose-600"
                                                                />
                                                                <span className="text-rose-600 font-black">%</span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-lg font-black text-rose-600">{(bracket.rate * 100).toFixed(1)}%</p>
                                                        )}
                                                    </div>
                                                    {editingIRRF && (
                                                        <ActionIconButton kind="delete" title="Excluir Faixa" onClick={() => handleDeleteIRRFBracket(bracket.id)} />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-20 text-center bg-slate-50 rounded-[10px] border border-dashed border-slate-200">
                                    <AlertCircle className="mx-auto text-slate-300 mb-4" size={40} />
                                    <p className="text-slate-400 font-medium text-xs">Nenhuma tabela cadastrada para {selectedYear}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="px-8 pb-8">
                        <button
                            onClick={handleAddIRRFBracket}
                            className="w-full flex items-center justify-center gap-1.5 h-9 bg-rose-600 text-white rounded-[6px] font-medium text-[13px] hover:bg-rose-700 transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Nova vigência IRRF
                        </button>
                    </div>
                </div>
            </div>

            {/* FGTS config row */}
            <div className="bg-white p-8 rounded-[10px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-amber-50 rounded-[10px] flex items-center justify-center">
                        <Building2 className="text-amber-600" size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Fundo de Garantia (FGTS)</h3>
                        <p className="text-slate-500 text-xs font-medium">Custo direto do empregador</p>
                    </div>
                </div>

                <div className="flex items-center gap-8 px-8 py-4 bg-slate-50 rounded-[10px] border border-slate-100 min-w-[300px]">
                    <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Alíquota Vigente</p>
                        {editingFGTS ? (
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number" 
                                    step="0.1"
                                    value={fgtsConfig ? (fgtsConfig.rate * 100) : 8}
                                    onChange={(e) => {
                                        if (fgtsConfig) {
                                            setFgtsConfig({ ...fgtsConfig, rate: parseFloat(e.target.value) / 100 });
                                        }
                                    }}
                                    className="w-20 bg-white border border-slate-200 rounded-[6px] px-2 py-1 text-3xl font-black text-amber-600 focus:ring-0 outline-none"
                                />
                                <span className="text-3xl font-black text-amber-600">%</span>
                            </div>
                        ) : (
                            <p className="text-3xl font-black text-slate-800">
                                {fgtsConfig ? (fgtsConfig.rate * 100).toFixed(1) : '8.0'}%
                            </p>
                        )}
                    </div>
                    <div className="h-10 w-px bg-slate-200" />
                    <button
                        onClick={handleSaveFGTS}
                        disabled={saving}
                        className={`flex items-center gap-1.5 h-9 px-3.5 border rounded-[6px] font-medium text-[13px] transition-all active:scale-95 ${
                            editingFGTS ? 'bg-amber-100 border-amber-300 text-amber-700 animate-pulse' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : editingFGTS ? <Save className="w-[15px] h-[15px]" /> : <Save className="w-[15px] h-[15px] text-indigo-600" />}
                        {editingFGTS ? 'Confirmar' : 'Atualizar taxa'}
                    </button>
                </div>
            </div>

            <div className="bg-indigo-50/50 p-6 rounded-[10px] border border-indigo-100 flex items-start gap-4">
                <Info className="text-indigo-600 shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-indigo-900">Dica de Versionamento</p>
                    <p className="text-sm text-indigo-700 leading-relaxed font-medium">
                        Ao criar uma nova vigência, o sistema automaticamente encerra a vigência anterior um dia antes do início da nova. 
                        Isso garante que folhas de períodos passados permaneçam com o cálculo histórico correto.
                    </p>
                </div>
            </div>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default LaborFiscalSettings;
