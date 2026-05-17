import React, { useState, useEffect, useRef } from 'react';
import {
    Target, Building2, Users, Plus, Trash2,
    Save, Loader2, AlertCircle, CheckCircle2, ChevronRight, Calendar, Copy, DollarSign, ArrowRightCircle, Banknote, Search, X
} from 'lucide-react';
import { payrollService, Worksite, EmployeeAllocation } from '../services/payrollService';
import { Employee } from '../services/laborService';

interface LaborAllocationsProps {
    orgId: string;
    employees: Employee[];
}

const LaborAllocations: React.FC<LaborAllocationsProps> = ({ orgId, employees }) => {
    const [worksites, setWorksites] = useState<Worksite[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [currentAllocations, setCurrentAllocations] = useState<Omit<EmployeeAllocation, 'id' | 'created_at' | 'reference_period'>[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
    const [error, setError] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);

    // Novos estados para Lançamento Financeiro
    const [closedResult, setClosedResult] = useState<any>(null);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
    const [selectedCostCenter, setSelectedCostCenter] = useState('');
    const [selectedChartOfAccount, setSelectedChartOfAccount] = useState('');
    const [loadingData, setLoadingData] = useState(false);

    // Estados para busca nos dropdowns — Salários
    const [costCenterSearch, setCostCenterSearch] = useState('');
    const [costCenterOpen, setCostCenterOpen] = useState(false);
    const [chartSearch, setChartSearch] = useState('');
    const [chartOpen, setChartOpen] = useState(false);
    const costCenterRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<HTMLDivElement>(null);

    // Estados para Encargos Patronais
    const [selectedEncargoCostCenter, setSelectedEncargoCostCenter] = useState('');
    const [selectedEncargoChartOfAccount, setSelectedEncargoChartOfAccount] = useState('');
    const [encargoCostCenterSearch, setEncargoCostCenterSearch] = useState('');
    const [encargoCostCenterOpen, setEncargoCostCenterOpen] = useState(false);
    const [encargoChartSearch, setEncargoChartSearch] = useState('');
    const [encargoChartOpen, setEncargoChartOpen] = useState(false);
    const encargoCostCenterRef = useRef<HTMLDivElement>(null);
    const encargoChartRef = useRef<HTMLDivElement>(null);

    // Estados para Contribuições de Terceiros
    const [selectedTerceiroCostCenter, setSelectedTerceiroCostCenter] = useState('');
    const [selectedTerceiroChartOfAccount, setSelectedTerceiroChartOfAccount] = useState('');
    const [terceiroCostCenterSearch, setTerceiroCostCenterSearch] = useState('');
    const [terceiroCostCenterOpen, setTerceiroCostCenterOpen] = useState(false);
    const [terceiroChartSearch, setTerceiroChartSearch] = useState('');
    const [terceiroChartOpen, setTerceiroChartOpen] = useState(false);
    const terceiroCostCenterRef = useRef<HTMLDivElement>(null);
    const terceiroChartRef = useRef<HTMLDivElement>(null);

    // Lançamentos individualizados (ex: ADIANTAMENTO)
    const [individualizadoItems, setIndividualizadoItems] = useState<{ code: string; name: string; amount: number; dia_lancamento: number | null }[]>([]);

    useEffect(() => {
        loadBaseData();
    }, [orgId]);

    useEffect(() => {
        if (selectedEmployee) {
            loadEmployeeState(selectedEmployee.id, selectedPeriod);
        } else {
            setClosedResult(null);
        }
    }, [selectedEmployee, selectedPeriod]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (costCenterRef.current && !costCenterRef.current.contains(e.target as Node)) setCostCenterOpen(false);
            if (chartRef.current && !chartRef.current.contains(e.target as Node)) setChartOpen(false);
            if (encargoCostCenterRef.current && !encargoCostCenterRef.current.contains(e.target as Node)) setEncargoCostCenterOpen(false);
            if (encargoChartRef.current && !encargoChartRef.current.contains(e.target as Node)) setEncargoChartOpen(false);
            if (terceiroCostCenterRef.current && !terceiroCostCenterRef.current.contains(e.target as Node)) setTerceiroCostCenterOpen(false);
            if (terceiroChartRef.current && !terceiroChartRef.current.contains(e.target as Node)) setTerceiroChartOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const saveFinClassToStorage = (empId: string, period: string, costCenter: string, chartOfAccount: string, encargoCostCenter?: string, encargoChartOfAccount?: string, terceiroCostCenter?: string, terceiroChartOfAccount?: string) => {
        localStorage.setItem(`labor_fin_${empId}_${period}`, JSON.stringify({ costCenter, chartOfAccount, encargoCostCenter, encargoChartOfAccount, terceiroCostCenter, terceiroChartOfAccount }));
    };

    const loadBaseData = async () => {
        try {
            setLoading(true);
            const [wData, cCenters, cAccounts] = await Promise.all([
                payrollService.listWorksites(orgId),
                (payrollService as any).listCostCenters(orgId),
                (payrollService as any).listChartOfAccounts(orgId)
            ]);
            setWorksites(wData);
            setCostCenters(cCenters || []);
            setChartOfAccounts(cAccounts || []);
        } catch (err) {
            console.error(err);
            setError('Não foi possível carregar os dados de alocação. Verifique sua conexão e tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const loadEmployeeState = async (empId: string, period: string) => {
        // Restaurar seleções do localStorage ANTES de qualquer await para evitar race condition
        const saved = localStorage.getItem(`labor_fin_${empId}_${period}`);
        if (saved) {
            try {
                const { costCenter, chartOfAccount, encargoCostCenter, encargoChartOfAccount, terceiroCostCenter, terceiroChartOfAccount } = JSON.parse(saved);
                setSelectedCostCenter(costCenter || '');
                setSelectedChartOfAccount(chartOfAccount || '');
                setSelectedEncargoCostCenter(encargoCostCenter || '');
                setSelectedEncargoChartOfAccount(encargoChartOfAccount || '');
                setSelectedTerceiroCostCenter(terceiroCostCenter || '');
                setSelectedTerceiroChartOfAccount(terceiroChartOfAccount || '');
            } catch { /* JSON inválido, ignora */ }
        } else {
            setSelectedCostCenter('');
            setSelectedChartOfAccount('');
            setSelectedEncargoCostCenter('');
            setSelectedEncargoChartOfAccount('');
            setSelectedTerceiroCostCenter('');
            setSelectedTerceiroChartOfAccount('');
        }

        setLoadingData(true);
        try {
            // 1. Carregar alocações percentuais
            const data = await payrollService.listAllocations(empId, period);
            setCurrentAllocations(data.map(d => ({
                employee_id: d.employee_id,
                project_id: d.project_id,
                allocation_percent: d.allocation_percent
            })));

            // 2. Carregar resultado da última folha fechada para esse período
            const result = await (payrollService as any).getLatestClosedResultForEmployee(orgId, empId, period);
            setClosedResult(result);

            // 3. Carregar itens de rubrica individualizada (ex: ADIANTAMENTO)
            if (result?.run_id) {
                const items = await (payrollService as any).listIndividualizadoItemsForEmployee(result.run_id, empId);
                setIndividualizadoItems(items || []);
            } else {
                setIndividualizadoItems([]);
            }
        } catch (err) {
            console.error("Erro ao carregar estado do funcionário:", err);
        } finally {
            setLoadingData(false);
        }
    };

    const handleCopyFromPrevious = async () => {
        if (!selectedEmployee) return;
        
        try {
            setCopying(true);
            const [year, month] = selectedPeriod.split('-').map(Number);
            const prevDate = new Date(year, month - 2, 1);
            const prevPeriod = prevDate.toISOString().slice(0, 7);
            
            const prevData = await payrollService.listAllocations(selectedEmployee.id, prevPeriod);
            
            if (prevData.length === 0) {
                alert('Nenhuma alocação encontrada no mês anterior.');
                return;
            }

            setCurrentAllocations(prevData.map(d => ({
                employee_id: d.employee_id,
                project_id: d.project_id,
                allocation_percent: d.allocation_percent
            })));
            
            alert(`Alocações copiadas de ${prevPeriod}! Lembre-se de salvar.`);
        } catch (err) {
            console.error(err);
            setError('Falha ao copiar alocações anteriores');
        } finally {
            setCopying(false);
        }
    };

    const handleAddAllocation = () => {
        if (worksites.length === 0) return;
        const available = worksites.find(w => !currentAllocations.some(a => a.project_id === w.id));
        const targetId = available ? available.id : worksites[0].id;

        setCurrentAllocations([
            ...currentAllocations,
            { 
                employee_id: selectedEmployee!.id, 
                project_id: targetId, 
                allocation_percent: 0 
            }
        ]);
    };

    const handleRemoveAllocation = (index: number) => {
        setCurrentAllocations(currentAllocations.filter((_, i) => i !== index));
    };

    const handleUpdatePercent = (index: number, percent: number) => {
        const next = [...currentAllocations];
        next[index].allocation_percent = Math.min(100, Math.max(0, percent));
        setCurrentAllocations(next);
    };

    const handleUpdateWorksite = (index: number, projectId: string) => {
        const next = [...currentAllocations];
        next[index].project_id = projectId;
        setCurrentAllocations(next);
    };

    const handleSave = async () => {
        if (!selectedEmployee) return;
        
        const total = currentAllocations.reduce((s, a) => s + a.allocation_percent, 0);
        if (total > 100) {
            setError('A alocação total não pode exceder 100%');
            return;
        }

        try {
            setSaving(selectedEmployee.id);
            setError(null);
            await payrollService.saveAllocations(selectedEmployee.id, selectedPeriod, currentAllocations);
            alert('Plano de Alocação salvo com sucesso!');
        } catch (err) {
            console.error(err);
            setError('Falha ao salvar alocações');
        } finally {
            setSaving(null);
        }
    };

    const handleLaunchFinance = async () => {
        if (!selectedEmployee || !closedResult) return;

        const total = currentAllocations.reduce((s, a) => s + (a.allocation_percent || 0), 0);
        if (total === 0) {
            alert("Defina ao menos um percentual de alocação em alguma obra antes de lançar.");
            return;
        }

        if (!selectedCostCenter) {
            alert("Por favor, selecione um Centro de Custo para os Salários.");
            return;
        }

        if (!selectedChartOfAccount) {
            alert("Por favor, selecione um Plano de Pagamento para os Salários.");
            return;
        }

        if (!selectedEncargoCostCenter) {
            alert("Por favor, selecione um Centro de Custo para os Encargos Patronais.");
            return;
        }

        if (!selectedEncargoChartOfAccount) {
            alert("Por favor, selecione um Plano de Pagamento para os Encargos Patronais.");
            return;
        }

        try {
            setSaving('finance');
            
            const [pYear, pMonth] = selectedPeriod.split('-');
            const lastDayOfMonth = new Date(Number(pYear), Number(pMonth), 0).toISOString().slice(0, 10);
            const indivLancamentos = individualizadoItems
                .filter(i => i.amount > 0)
                .map(i => ({
                    rubricCode: i.code,
                    rubricName: i.name,
                    amount:     i.amount,
                    txDate:     i.dia_lancamento
                        ? `${pYear}-${pMonth}-${String(i.dia_lancamento).padStart(2, '0')}`
                        : lastDayOfMonth
                }));

            await (payrollService as any).syncEmployeeToFinance(
                closedResult.run_id,
                selectedEmployee.id,
                selectedEmployee.name,
                closedResult.employer_cost,
                currentAllocations,
                selectedCostCenter,
                selectedChartOfAccount,
                indivLancamentos.length > 0 ? indivLancamentos : undefined,
                closedResult.net,
                selectedEncargoCostCenter,
                selectedEncargoChartOfAccount,
                closedResult.gross,
                selectedTerceiroCostCenter || undefined,
                selectedTerceiroChartOfAccount || undefined
            );

            alert(`Custos do período ${selectedPeriod} lançados com sucesso no financeiro!`);
        } catch (err) {
            console.error("Falha ao lançar no financeiro:", err);
            alert("Houve um erro crítico ao registrar lançamentos.");
        } finally {
            setSaving(null);
        }
    };

    const totalAllocated = currentAllocations.reduce((s, a) => s + a.allocation_percent, 0);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Carregando Estrutura...</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Lista de Colaboradores */}
            <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" /> Colaboradores
                    </h3>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
                        {employees.map(emp => (
                            <button
                                key={emp.id}
                                onClick={() => setSelectedEmployee(emp)}
                                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border
                                    ${selectedEmployee?.id === emp.id 
                                        ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-900/20' 
                                        : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'}`}
                            >
                                <div className="text-left">
                                    <p className={`text-sm font-black ${selectedEmployee?.id === emp.id ? 'text-white' : 'text-slate-900'}`}>
                                        {emp.name}
                                    </p>
                                    <p className={`text-[10px] font-bold uppercase ${selectedEmployee?.id === emp.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        {emp.role || 'Sem Cargo'}
                                    </p>
                                </div>
                                <ChevronRight className={`w-4 h-4 ${selectedEmployee?.id === emp.id ? 'text-white' : 'text-slate-300'}`} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Painel de Alocação e Lançamento */}
            <div className="lg:col-span-8">
                {!selectedEmployee ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                        <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-slate-400 uppercase">Selecione um colaborador</h3>
                        <p className="text-sm text-slate-400 font-medium">Escolha alguém à esquerda para gerenciar alocação e lançamentos financeiros.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* 1. Configuração de Alocação (%) */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8 animate-in zoom-in-95 duration-300">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedEmployee.name}</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Período de Alocação:</p>
                                        <input 
                                            type="month" 
                                            value={selectedPeriod}
                                            onChange={(e) => setSelectedPeriod(e.target.value)}
                                            className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-black text-indigo-600 outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button 
                                        onClick={handleCopyFromPrevious}
                                        disabled={copying || !!saving}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {copying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                                        Copiar Mês Ant.
                                    </button>
                                    <button 
                                        onClick={handleSave}
                                        disabled={!!saving}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-black text-xs uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {saving === selectedEmployee.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Salvar % Alocação
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 text-xs font-bold uppercase tracking-tight">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuração de Rateio (%)</span>
                                </div>
                                {currentAllocations.length === 0 ? (
                                    <div className="py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center">
                                        <p className="text-xs font-bold text-slate-400 uppercase">Nenhuma obra/projeto vinculado</p>
                                    </div>
                                ) : (
                                    currentAllocations.map((alloc, idx) => (
                                        <div key={idx} className="flex flex-col md:flex-row items-center gap-4 p-4 bg-slate-50 rounded-2xl group border border-transparent hover:border-slate-200 transition-all">
                                            <div className="flex-1 w-full">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Projeto / Obra</label>
                                                <select 
                                                    value={alloc.project_id}
                                                    onChange={(e) => handleUpdateWorksite(idx, e.target.value)}
                                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    {worksites.map(w => (
                                                        <option key={w.id} value={w.id}>{w.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="w-32">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Porcentagem (%)</label>
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={alloc.allocation_percent}
                                                    onChange={(e) => handleUpdatePercent(idx, parseInt(e.target.value) || 0)}
                                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveAllocation(idx)}
                                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors mt-5"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}

                                <button 
                                    onClick={handleAddAllocation}
                                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest"
                                >
                                    <Plus className="w-3 h-3" /> Adicionar Linha de Rateio
                                </button>
                            </div>

                            {/* Barra de Totais de Alocação */}
                            <div className="p-5 bg-slate-900 rounded-2xl flex items-center justify-between text-white">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Configurado</p>
                                    <h4 className={`text-xl font-black ${totalAllocated > 100 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {totalAllocated}%
                                    </h4>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Remanescente (Geral)</p>
                                    <p className="text-md font-bold">
                                        {Math.max(0, 100 - totalAllocated)}%
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Lançamento Financeiro (Apenas visível se houver folha fechada) */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-md border-t-4 border-t-emerald-500 space-y-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 opacity-5">
                                <DollarSign className="w-32 h-32 text-emerald-900" />
                            </div>
                            
                            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                        <ArrowRightCircle className="w-5 h-5 text-emerald-600" /> Lançar Custos Reais no Financeiro
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1 font-medium">Exibindo dados da última folha FECHADA ({selectedPeriod})</p>
                                </div>
                            </div>

                            {loadingData ? (
                                <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" /> 
                                    <span className="text-xs font-bold uppercase">Buscando dados da folha...</span>
                                </div>
                            ) : !closedResult ? (
                                <div className="flex items-center gap-3 p-5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700">
                                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold">Nenhuma folha fechada encontrada para {selectedPeriod}.</p>
                                        <p className="text-xs opacity-80 mt-0.5">O lançamento financeiro real só é permitido após o encerramento da folha no menu "Folha de Pagamento".</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                                    {/* Resumo do Custo */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Custo Total (Patronal)</p>
                                            <p className="text-xl font-black text-emerald-900 font-mono">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(closedResult.employer_cost || 0)}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Bruto</p>
                                            <p className="text-md font-bold text-slate-700 font-mono">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(closedResult.gross || 0)}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Líquido</p>
                                            <p className="text-md font-bold text-slate-700 font-mono">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(closedResult.net || 0)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Form de Classificação Financeira — Salários */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                                            Classificação dos Salários
                                        </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                        {/* Centro de Custo — dropdown com busca */}
                                        <div className="space-y-1.5" ref={costCenterRef}>
                                            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Centro de Custo</label>
                                            {/* Valor selecionado */}
                                            {selectedCostCenter && !costCenterOpen && (() => {
                                                const sel = costCenters.find((c: any) => c.name === selectedCostCenter);
                                                return (
                                                    <div
                                                        onClick={() => { setCostCenterOpen(true); setCostCenterSearch(''); }}
                                                        className="flex items-center gap-2 w-full bg-white border border-emerald-400 rounded-xl px-3 py-2 cursor-pointer hover:border-emerald-500"
                                                    >
                                                        {sel?.code && (
                                                            <span className="shrink-0 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 font-mono">
                                                                {sel.code}
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                        <X
                                                            className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                            onClick={(e) => { e.stopPropagation(); setSelectedCostCenter(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, '', selectedChartOfAccount); }}
                                                        />
                                                    </div>
                                                );
                                            })()}
                                            {/* Campo de busca + dropdown */}
                                            {(!selectedCostCenter || costCenterOpen) && (
                                                <div className="relative">
                                                    <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-400">
                                                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                        <input
                                                            autoFocus={costCenterOpen}
                                                            type="text"
                                                            placeholder="Buscar por código ou nome..."
                                                            value={costCenterSearch}
                                                            onChange={(e) => { setCostCenterSearch(e.target.value); setCostCenterOpen(true); }}
                                                            onFocus={() => setCostCenterOpen(true)}
                                                            className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                        />
                                                        {costCenterSearch && (
                                                            <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setCostCenterSearch('')} />
                                                        )}
                                                    </div>
                                                    {costCenterOpen && (
                                                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                            {costCenters
                                                                .filter((c: any) => {
                                                                    const q = costCenterSearch.toLowerCase();
                                                                    return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                })
                                                                .map((c: any) => (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onMouseDown={(e) => { e.preventDefault(); setSelectedCostCenter(c.name); setCostCenterOpen(false); setCostCenterSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, c.name, selectedChartOfAccount); }}
                                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-emerald-50 transition-colors group"
                                                                    >
                                                                        {c.code && (
                                                                            <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-emerald-700 bg-slate-100 group-hover:bg-emerald-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                {c.code}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                    </button>
                                                                ))
                                                            }
                                                            {costCenters.filter((c: any) => {
                                                                const q = costCenterSearch.toLowerCase();
                                                                return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                            }).length === 0 && (
                                                                <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Plano de Pagamento — dropdown com busca */}
                                        <div className="space-y-1.5" ref={chartRef}>
                                            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Plano de Pagamento (Contas)</label>
                                            {/* Valor selecionado */}
                                            {selectedChartOfAccount && !chartOpen && (() => {
                                                const sel = chartOfAccounts.find((c: any) => c.name === selectedChartOfAccount);
                                                return (
                                                    <div
                                                        onClick={() => { setChartOpen(true); setChartSearch(''); }}
                                                        className="flex items-center gap-2 w-full bg-white border border-emerald-400 rounded-xl px-3 py-2 cursor-pointer hover:border-emerald-500"
                                                    >
                                                        {sel?.code && (
                                                            <span className="shrink-0 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 font-mono">
                                                                {sel.code}
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                        <X
                                                            className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                            onClick={(e) => { e.stopPropagation(); setSelectedChartOfAccount(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, ''); }}
                                                        />
                                                    </div>
                                                );
                                            })()}
                                            {/* Campo de busca + dropdown */}
                                            {(!selectedChartOfAccount || chartOpen) && (
                                                <div className="relative">
                                                    <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-400">
                                                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                        <input
                                                            autoFocus={chartOpen}
                                                            type="text"
                                                            placeholder="Buscar por código ou nome..."
                                                            value={chartSearch}
                                                            onChange={(e) => { setChartSearch(e.target.value); setChartOpen(true); }}
                                                            onFocus={() => setChartOpen(true)}
                                                            className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                        />
                                                        {chartSearch && (
                                                            <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setChartSearch('')} />
                                                        )}
                                                    </div>
                                                    {chartOpen && (
                                                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                            {chartOfAccounts
                                                                .filter((c: any) => {
                                                                    const q = chartSearch.toLowerCase();
                                                                    return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                })
                                                                .map((c: any) => (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onMouseDown={(e) => { e.preventDefault(); setSelectedChartOfAccount(c.name); setChartOpen(false); setChartSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, c.name); }}
                                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-emerald-50 transition-colors group"
                                                                    >
                                                                        {c.code && (
                                                                            <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-emerald-700 bg-slate-100 group-hover:bg-emerald-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                {c.code}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                    </button>
                                                                ))
                                                            }
                                                            {chartOfAccounts.filter((c: any) => {
                                                                const q = chartSearch.toLowerCase();
                                                                return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                            }).length === 0 && (
                                                                <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </div>

                                    {/* Form de Classificação Financeira — Encargos Patronais */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
                                            Classificação dos Encargos Patronais
                                            <span className="ml-1 text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (closedResult.employer_cost || 0) - (closedResult.net || 0)))}
                                            </span>
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 bg-orange-50/60 rounded-2xl border border-orange-100">
                                            {/* Centro de Custo — Encargos */}
                                            <div className="space-y-1.5" ref={encargoCostCenterRef}>
                                                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Centro de Custo</label>
                                                {selectedEncargoCostCenter && !encargoCostCenterOpen && (() => {
                                                    const sel = costCenters.find((c: any) => c.name === selectedEncargoCostCenter);
                                                    return (
                                                        <div
                                                            onClick={() => { setEncargoCostCenterOpen(true); setEncargoCostCenterSearch(''); }}
                                                            className="flex items-center gap-2 w-full bg-white border border-orange-400 rounded-xl px-3 py-2 cursor-pointer hover:border-orange-500"
                                                        >
                                                            {sel?.code && (
                                                                <span className="shrink-0 text-[10px] font-black text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-0.5 font-mono">
                                                                    {sel.code}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                            <X
                                                                className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedEncargoCostCenter(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, '', selectedEncargoChartOfAccount); }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                {(!selectedEncargoCostCenter || encargoCostCenterOpen) && (
                                                    <div className="relative">
                                                        <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400">
                                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <input
                                                                autoFocus={encargoCostCenterOpen}
                                                                type="text"
                                                                placeholder="Buscar por código ou nome..."
                                                                value={encargoCostCenterSearch}
                                                                onChange={(e) => { setEncargoCostCenterSearch(e.target.value); setEncargoCostCenterOpen(true); }}
                                                                onFocus={() => setEncargoCostCenterOpen(true)}
                                                                className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                            />
                                                            {encargoCostCenterSearch && (
                                                                <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setEncargoCostCenterSearch('')} />
                                                            )}
                                                        </div>
                                                        {encargoCostCenterOpen && (
                                                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                                {costCenters
                                                                    .filter((c: any) => {
                                                                        const q = encargoCostCenterSearch.toLowerCase();
                                                                        return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                    })
                                                                    .map((c: any) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onMouseDown={(e) => { e.preventDefault(); setSelectedEncargoCostCenter(c.name); setEncargoCostCenterOpen(false); setEncargoCostCenterSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, c.name, selectedEncargoChartOfAccount); }}
                                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-orange-50 transition-colors group"
                                                                        >
                                                                            {c.code && (
                                                                                <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-orange-700 bg-slate-100 group-hover:bg-orange-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                    {c.code}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                        </button>
                                                                    ))
                                                                }
                                                                {costCenters.filter((c: any) => { const q = encargoCostCenterSearch.toLowerCase(); return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).length === 0 && (
                                                                    <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Plano de Pagamento — Encargos */}
                                            <div className="space-y-1.5" ref={encargoChartRef}>
                                                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Plano de Pagamento (Contas)</label>
                                                {selectedEncargoChartOfAccount && !encargoChartOpen && (() => {
                                                    const sel = chartOfAccounts.find((c: any) => c.name === selectedEncargoChartOfAccount);
                                                    return (
                                                        <div
                                                            onClick={() => { setEncargoChartOpen(true); setEncargoChartSearch(''); }}
                                                            className="flex items-center gap-2 w-full bg-white border border-orange-400 rounded-xl px-3 py-2 cursor-pointer hover:border-orange-500"
                                                        >
                                                            {sel?.code && (
                                                                <span className="shrink-0 text-[10px] font-black text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-0.5 font-mono">
                                                                    {sel.code}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                            <X
                                                                className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedEncargoChartOfAccount(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, ''); }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                {(!selectedEncargoChartOfAccount || encargoChartOpen) && (
                                                    <div className="relative">
                                                        <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400">
                                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <input
                                                                autoFocus={encargoChartOpen}
                                                                type="text"
                                                                placeholder="Buscar por código ou nome..."
                                                                value={encargoChartSearch}
                                                                onChange={(e) => { setEncargoChartSearch(e.target.value); setEncargoChartOpen(true); }}
                                                                onFocus={() => setEncargoChartOpen(true)}
                                                                className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                            />
                                                            {encargoChartSearch && (
                                                                <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setEncargoChartSearch('')} />
                                                            )}
                                                        </div>
                                                        {encargoChartOpen && (
                                                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                                {chartOfAccounts
                                                                    .filter((c: any) => {
                                                                        const q = encargoChartSearch.toLowerCase();
                                                                        return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                    })
                                                                    .map((c: any) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onMouseDown={(e) => { e.preventDefault(); setSelectedEncargoChartOfAccount(c.name); setEncargoChartOpen(false); setEncargoChartSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, c.name); }}
                                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-orange-50 transition-colors group"
                                                                        >
                                                                            {c.code && (
                                                                                <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-orange-700 bg-slate-100 group-hover:bg-orange-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                    {c.code}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                        </button>
                                                                    ))
                                                                }
                                                                {chartOfAccounts.filter((c: any) => { const q = encargoChartSearch.toLowerCase(); return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).length === 0 && (
                                                                    <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form de Classificação Financeira — Contribuições de Terceiros */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="inline-block w-2 h-2 rounded-full bg-purple-400"></span>
                                            Classificação das Contribuições de Terceiros
                                            <span className="ml-1 text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.round((closedResult.gross || 0) * 0.058 * 100) / 100)}
                                            </span>
                                            <span className="ml-auto text-[9px] font-medium text-slate-400 italic">5,8% da folha bruta — opcional</span>
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 bg-purple-50/60 rounded-2xl border border-purple-100">
                                            {/* Centro de Custo — Terceiros */}
                                            <div className="space-y-1.5" ref={terceiroCostCenterRef}>
                                                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Centro de Custo</label>
                                                {selectedTerceiroCostCenter && !terceiroCostCenterOpen && (() => {
                                                    const sel = costCenters.find((c: any) => c.name === selectedTerceiroCostCenter);
                                                    return (
                                                        <div
                                                            onClick={() => { setTerceiroCostCenterOpen(true); setTerceiroCostCenterSearch(''); }}
                                                            className="flex items-center gap-2 w-full bg-white border border-purple-400 rounded-xl px-3 py-2 cursor-pointer hover:border-purple-500"
                                                        >
                                                            {sel?.code && (
                                                                <span className="shrink-0 text-[10px] font-black text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 font-mono">
                                                                    {sel.code}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                            <X
                                                                className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedTerceiroCostCenter(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, selectedEncargoChartOfAccount, '', selectedTerceiroChartOfAccount); }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                {(!selectedTerceiroCostCenter || terceiroCostCenterOpen) && (
                                                    <div className="relative">
                                                        <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-purple-400">
                                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <input
                                                                autoFocus={terceiroCostCenterOpen}
                                                                type="text"
                                                                placeholder="Buscar por código ou nome..."
                                                                value={terceiroCostCenterSearch}
                                                                onChange={(e) => { setTerceiroCostCenterSearch(e.target.value); setTerceiroCostCenterOpen(true); }}
                                                                onFocus={() => setTerceiroCostCenterOpen(true)}
                                                                className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                            />
                                                            {terceiroCostCenterSearch && (
                                                                <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setTerceiroCostCenterSearch('')} />
                                                            )}
                                                        </div>
                                                        {terceiroCostCenterOpen && (
                                                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                                {costCenters
                                                                    .filter((c: any) => {
                                                                        const q = terceiroCostCenterSearch.toLowerCase();
                                                                        return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                    })
                                                                    .map((c: any) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onMouseDown={(e) => { e.preventDefault(); setSelectedTerceiroCostCenter(c.name); setTerceiroCostCenterOpen(false); setTerceiroCostCenterSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, selectedEncargoChartOfAccount, c.name, selectedTerceiroChartOfAccount); }}
                                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-purple-50 transition-colors group"
                                                                        >
                                                                            {c.code && (
                                                                                <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-purple-700 bg-slate-100 group-hover:bg-purple-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                    {c.code}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                        </button>
                                                                    ))
                                                                }
                                                                {costCenters.filter((c: any) => { const q = terceiroCostCenterSearch.toLowerCase(); return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).length === 0 && (
                                                                    <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Plano de Pagamento — Terceiros */}
                                            <div className="space-y-1.5" ref={terceiroChartRef}>
                                                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Plano de Pagamento (Contas)</label>
                                                {selectedTerceiroChartOfAccount && !terceiroChartOpen && (() => {
                                                    const sel = chartOfAccounts.find((c: any) => c.name === selectedTerceiroChartOfAccount);
                                                    return (
                                                        <div
                                                            onClick={() => { setTerceiroChartOpen(true); setTerceiroChartSearch(''); }}
                                                            className="flex items-center gap-2 w-full bg-white border border-purple-400 rounded-xl px-3 py-2 cursor-pointer hover:border-purple-500"
                                                        >
                                                            {sel?.code && (
                                                                <span className="shrink-0 text-[10px] font-black text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 font-mono">
                                                                    {sel.code}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-slate-800 truncate flex-1">{sel?.name}</span>
                                                            <X
                                                                className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedTerceiroChartOfAccount(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, selectedEncargoChartOfAccount, selectedTerceiroCostCenter, ''); }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                {(!selectedTerceiroChartOfAccount || terceiroChartOpen) && (
                                                    <div className="relative">
                                                        <div className="flex items-center gap-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-purple-400">
                                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <input
                                                                autoFocus={terceiroChartOpen}
                                                                type="text"
                                                                placeholder="Buscar por código ou nome..."
                                                                value={terceiroChartSearch}
                                                                onChange={(e) => { setTerceiroChartSearch(e.target.value); setTerceiroChartOpen(true); }}
                                                                onFocus={() => setTerceiroChartOpen(true)}
                                                                className="flex-1 text-xs font-medium outline-none bg-transparent placeholder:text-slate-400"
                                                            />
                                                            {terceiroChartSearch && (
                                                                <X className="w-3 h-3 text-slate-400 hover:text-red-500 cursor-pointer shrink-0" onClick={() => setTerceiroChartSearch('')} />
                                                            )}
                                                        </div>
                                                        {terceiroChartOpen && (
                                                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                                {chartOfAccounts
                                                                    .filter((c: any) => {
                                                                        const q = terceiroChartSearch.toLowerCase();
                                                                        return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                                                    })
                                                                    .map((c: any) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onMouseDown={(e) => { e.preventDefault(); setSelectedTerceiroChartOfAccount(c.name); setTerceiroChartOpen(false); setTerceiroChartSearch(''); if (selectedEmployee) saveFinClassToStorage(selectedEmployee.id, selectedPeriod, selectedCostCenter, selectedChartOfAccount, selectedEncargoCostCenter, selectedEncargoChartOfAccount, selectedTerceiroCostCenter, c.name); }}
                                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-purple-50 transition-colors group"
                                                                        >
                                                                            {c.code && (
                                                                                <span className="shrink-0 text-[10px] font-black text-slate-500 group-hover:text-purple-700 bg-slate-100 group-hover:bg-purple-100 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate">
                                                                                    {c.code}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                                                                        </button>
                                                                    ))
                                                                }
                                                                {chartOfAccounts.filter((c: any) => { const q = terceiroChartSearch.toLowerCase(); return !q || (c.code || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).length === 0 && (
                                                                    <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Lançamentos Individualizados (ADIANTAMENTO e similares) */}
                                    {individualizadoItems.length > 0 && (
                                        <div className="space-y-4 p-6 bg-violet-50 rounded-2xl border border-violet-100 animate-in zoom-in-95 duration-200">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Banknote className="w-4 h-4 text-violet-600" />
                                                <h4 className="text-[11px] font-black text-violet-900 uppercase tracking-widest">Parcelas Individualizadas</h4>
                                            </div>
                                            <p className="text-[10px] text-violet-600 font-medium italic">
                                                Estes lançamentos são registrados como parcelas separadas no financeiro com a data informada.
                                            </p>
                                            {individualizadoItems.map(item => (
                                                <div key={item.code} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-white rounded-xl border border-violet-100">
                                                    <div className="flex-1">
                                                        <p className="text-sm font-black text-slate-900">{item.name}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.code}</p>
                                                    </div>
                                                    <p className="text-sm font-black text-violet-700 font-mono whitespace-nowrap">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-xl">
                                                        <Calendar size={11} className="text-violet-500" />
                                                        <span className="text-[10px] font-black text-violet-700 whitespace-nowrap">
                                                            {item.dia_lancamento ? `Dia ${item.dia_lancamento}` : 'Último dia'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="border-t border-slate-100 pt-4">
                                        <p className="text-[11px] text-slate-500 mb-4 italic font-medium">
                                            * Serão gerados três lançamentos por obra: <strong>Salários</strong> ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(closedResult.net || 0)}), <strong>Encargos Patronais</strong> ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (closedResult.employer_cost || 0) - (closedResult.net || 0)))}) e <strong>Contribuições de Terceiros</strong> ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.round((closedResult.gross || 0) * 0.058 * 100) / 100)}), distribuídos na proporção definida acima.
                                        </p>
                                        <button
                                            onClick={handleLaunchFinance}
                                            disabled={saving === 'finance'}
                                            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all disabled:opacity-60 active:scale-[0.99] flex items-center justify-center gap-3"
                                        >
                                            {saving === 'finance' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                            Confirmar e Lançar no Financeiro
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
};

export default LaborAllocations;
