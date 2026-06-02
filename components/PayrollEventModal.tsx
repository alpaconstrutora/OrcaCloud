import React, { useState, useEffect } from 'react';
import { X, Plus, Loader2, Edit2, Trash2, Check } from 'lucide-react';
import { payrollService, PayrollRun, PayrollRubric, PayrollEvent, PayrollItem, PayrollAuditLog, PayrollResultWithEmployee } from '../services/payrollService';
import { payrollEngine } from '../services/payrollEngine';
import {
    suggestEventUnit,
    computeEventAmount,
    isDuplicateRubric,
} from '../lib/payrollUIHelpers';

interface PayrollEventModalProps {
    run: PayrollRun;
    orgId: string;
    employeeId: string;
    employeeName: string;
    rubrics: PayrollRubric[];
    runEvents: PayrollEvent[];
    results: PayrollResultWithEmployee[];
    executing: boolean;
    onClose: () => void;
    onEventSaved: () => Promise<void>;
    onViewPaystub?: (runId: string, employeeId: string) => void;
}

const PayrollEventModal: React.FC<PayrollEventModalProps> = ({
    run, orgId, employeeId, employeeName,
    rubrics, runEvents, results, executing,
    onClose, onEventSaved, onViewPaystub,
}) => {
    const [runItems, setRunItems]               = useState<PayrollItem[]>([]);
    const [eventHistory, setEventHistory]       = useState<PayrollAuditLog[]>([]);
    const [showEventHistory, setShowEventHistory] = useState(false);
    const [editingEvent, setEditingEvent]       = useState<string | null>(null);
    const [localExecuting, setLocalExecuting]   = useState(false);
    const [adiantamentoSalvo, setAdiantamentoSalvo] = useState(false);

    // Form state
    const [selectedRubricCode, setSelectedRubricCode] = useState('');
    const [eventAmount, setEventAmount]               = useState(0);
    const [eventDescription, setEventDescription]     = useState('');
    const [eventUnit, setEventUnit]                   = useState<'fixed' | 'days' | 'hours'>('fixed');
    const [eventQuantity, setEventQuantity]           = useState(0);

    const isExecuting = executing || localExecuting;

    // Carrega itens do colaborador ao abrir
    useEffect(() => {
        loadRunItems();
        resetForm();
    }, [employeeId]);

    // Auto-sugere unidade e descrição ao selecionar rubrica
    useEffect(() => {
        if (!selectedRubricCode) return;
        const rubric = rubrics.find(r => r.code === selectedRubricCode);
        if (!rubric) return;
        setEventDescription(rubric.name);
        setEventUnit(suggestEventUnit(rubric.name, rubric.code));
    }, [selectedRubricCode]);

    // Auto-calcula valor ao mudar quantidade/unidade
    useEffect(() => {
        if (eventUnit === 'fixed') return;
        const empResult = results.find(r => r.employee_id === employeeId);
        const baseSalary = empResult?.employee?.base_salary ?? 0;
        const rubric = rubrics.find(r => r.code === selectedRubricCode);
        if (!rubric || baseSalary <= 0) return;
        setEventAmount(computeEventAmount(eventUnit, eventQuantity, baseSalary, rubric.code, rubric.name));
    }, [eventUnit, eventQuantity, selectedRubricCode]);

    const loadRunItems = async () => {
        try {
            const items = await payrollService.getEmployeeItems(run.id, employeeId);
            setRunItems(items);
        } catch (err) {
            console.error('[PayrollEventModal] loadRunItems:', err);
        }
    };

    const loadEventHistory = async () => {
        try {
            const empResult = results.find(r => r.employee_id === employeeId);
            const actualOrgId = empResult?.employee?.org_id || orgId;
            const logs = await payrollService.listAuditLogs(actualOrgId, 'EVENT');
            setEventHistory(logs);
        } catch (err) {
            console.error('[PayrollEventModal] loadEventHistory:', err);
        }
    };

    const resetForm = () => {
        setSelectedRubricCode('');
        setEventAmount(0);
        setEventDescription('');
        setEventUnit('fixed');
        setEventQuantity(0);
        setEditingEvent(null);
    };

    const handleSave = async () => {
        const rubric = rubrics.find(r => r.code === selectedRubricCode);
        if (!rubric || eventAmount === 0) {
            alert('Selecione uma rubrica e informe o valor.');
            return;
        }

        try {
            setLocalExecuting(true);

            if (editingEvent) {
                await payrollService.updateEvent(editingEvent, {
                    description: eventDescription,
                    amount: eventAmount,
                    unit: eventUnit,
                    quantity: eventQuantity,
                    rubric_code: selectedRubricCode,
                });
            } else {
                if (isDuplicateRubric(runEvents, employeeId, selectedRubricCode)) {
                    alert(`A rubrica ${selectedRubricCode} já está lançada para este colaborador. Utilize o botão de editar (lápis) nela para fazer alterações.`);
                    return;
                }

                const empResult = results.find(r => r.employee_id === employeeId);
                const actualOrgId = empResult?.employee?.org_id || orgId;

                await payrollService.saveEvent({
                    org_id: actualOrgId,
                    employee_id: employeeId,
                    payroll_run_id: run.id,
                    rubric_code: selectedRubricCode,
                    type: rubric.type,
                    amount: eventAmount,
                    description: eventDescription || rubric.name,
                    reference_date: new Date().toISOString().split('T')[0],
                    quantity: eventQuantity,
                    unit: eventUnit,
                });
            }

            await payrollEngine.calculateEmployeePayroll(employeeId, run.id);
            await onEventSaved();
            await loadRunItems();
            if (showEventHistory) await loadEventHistory();
            if (selectedRubricCode === 'ADIANTAMENTO') setAdiantamentoSalvo(true);
            resetForm();
        } catch (err) {
            console.error(err);
            alert('Erro ao processar evento');
        } finally {
            setLocalExecuting(false);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        try {
            await payrollService.deleteEvent(id);
            if (run) await payrollEngine.calculateEmployeePayroll(employeeId, run.id);
            await onEventSaved();
            await loadRunItems();
            if (showEventHistory) await loadEventHistory();
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir evento e atualizar cálculos');
        }
    };

    const startEditing = (ev: PayrollEvent) => {
        setEditingEvent(ev.id ?? null);
        setSelectedRubricCode(ev.rubric_code || ev.code || '');
        setEventAmount(ev.amount);
        setEventDescription(ev.description || '');
        setEventUnit(ev.unit || 'fixed');
        setEventQuantity(ev.quantity || 0);
    };

    const myEvents = runEvents.filter(e => e.employee_id === employeeId);
    const autoItems = runItems.filter(i => {
        const isManualByOrigin = ['manual', 'recorrente'].includes(i.origin || '');
        const isManualByCode = myEvents.some(e => e.rubric_code === i.code || e.code === i.code);
        return !isManualByOrigin && !isManualByCode && i.type !== 'encargo';
    });

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl p-8 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase">Eventos: {employeeName}</h3>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lançamento de Bônus e Descontos Manuais</p>
                            <button
                                onClick={() => {
                                    setShowEventHistory(!showEventHistory);
                                    if (!showEventHistory) loadEventHistory();
                                }}
                                className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all ${showEventHistory ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'}`}
                            >
                                {showEventHistory ? 'Voltar para Lançamentos' : 'Ver Histórico'}
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Formulário de lançamento */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-50 p-4 rounded-2xl mb-4 shadow-inner border border-slate-100">
                        <div className="md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Rubrica</label>
                            <select
                                value={selectedRubricCode}
                                onChange={e => setSelectedRubricCode(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">Selecione...</option>
                                {rubrics
                                    .filter(r => !r.is_automatic && !r.is_clt_mandatory)
                                    .map(r => (
                                        <option key={r.code} value={r.code}>[{r.type[0].toUpperCase()}] {r.name}</option>
                                    ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Unidade</label>
                            <select
                                value={eventUnit}
                                onChange={e => setEventUnit(e.target.value as 'fixed' | 'days' | 'hours')}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="fixed">Valor (R$)</option>
                                <option value="days">Dias</option>
                                <option value="hours">Horas</option>
                            </select>
                        </div>
                        {eventUnit !== 'fixed' && (
                            <div className="md:col-span-2 animate-in zoom-in duration-200">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                                    Quantidade {eventUnit === 'days' ? '(Dias)' : '(Hrs)'}
                                </label>
                                <input
                                    type="number" step="0.01" placeholder="0.00"
                                    value={eventQuantity}
                                    onChange={e => setEventQuantity(parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        )}
                        <div className={eventUnit === 'fixed' ? 'md:col-span-5' : 'md:col-span-3'}>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Descrição Adicional</label>
                            <input
                                type="text" placeholder="Obs fixas ou detalhes"
                                value={eventDescription}
                                onChange={e => setEventDescription(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div className="md:col-span-3">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor (R$)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number" step="0.01" placeholder="0.00"
                                    value={eventAmount}
                                    onChange={e => setEventAmount(parseFloat(e.target.value) || 0)}
                                    readOnly={eventUnit !== 'fixed'}
                                    className={`w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none ${eventUnit !== 'fixed' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'}`}
                                />
                                <button
                                    disabled={isExecuting || !selectedRubricCode}
                                    onClick={handleSave}
                                    className={`p-2 rounded-xl text-white shadow-lg transition-all ${editingEvent ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 active:scale-95'} disabled:opacity-50 disabled:scale-100`}
                                    title={editingEvent ? 'Confirmar Edição' : 'Adicionar Evento'}
                                >
                                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingEvent ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Banner de edição ativa */}
                {editingEvent && (
                    <div className="mb-4 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Editando Lançamento</span>
                        </div>
                        <button onClick={resetForm} className="text-[10px] font-black text-emerald-400 uppercase hover:text-emerald-600 underline">
                            Cancelar Edição
                        </button>
                    </div>
                )}

                {/* Banner: Recibo de Adiantamento disponível */}
                {adiantamentoSalvo && onViewPaystub && (
                    <div className="mb-4 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">
                                Adiantamento registrado — Recibo de Pagamento disponível
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onViewPaystub(run.id, employeeId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                            >
                                Ver Recibo
                            </button>
                            <button
                                onClick={() => setAdiantamentoSalvo(false)}
                                className="p-1 text-indigo-300 hover:text-indigo-600 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Conteúdo: histórico ou lançamentos */}
                {showEventHistory ? (
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 mb-4">Registro de Alterações</h4>
                        {eventHistory.length === 0 ? (
                            <div className="p-12 text-center text-slate-300 italic text-xs uppercase font-bold">Nenhum histórico registrado</div>
                        ) : (
                            eventHistory.map(log => (
                                <div key={log.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{log.action}</span>
                                        <span className="text-[8px] font-bold text-slate-400">{new Date(log.created_at || 0).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-700">{log.description}</p>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[7px] font-black text-slate-500 uppercase">
                                            {log.user_email?.substring(0, 1)}
                                        </div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{log.user_email}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                        {/* Verbas Automáticas */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Memória de Cálculo (Automático)</h4>
                            {autoItems.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-2xl border border-slate-100 opacity-60">
                                    <div>
                                        <p className="text-[11px] font-black text-slate-700 uppercase">{item.code} - {(item as unknown as { description?: string }).description || item.code}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                            {item.type === 'informativa' ? 'Apenas Informativo' : 'Cálculo Automático'}
                                        </p>
                                    </div>
                                    <p className={`text-xs font-black ${item.type === 'provento' ? 'text-indigo-600' : item.type === 'desconto' ? 'text-rose-500' : 'text-slate-500'}`}>
                                        {item.type === 'provento' ? '+' : item.type === 'desconto' ? '-' : ' '} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Lançamentos Manuais */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Lançamentos Manuais</h4>
                            {myEvents.length === 0 ? (
                                <p className="text-center py-4 text-[11px] font-bold text-slate-300 uppercase italic">Nenhum evento manual lançado</p>
                            ) : (
                                myEvents.map(ev => (
                                    <div key={ev.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all group">
                                        <div className="flex-1 flex justify-between items-center pr-2">
                                            <div>
                                                <p className="text-[11px] font-black text-slate-700 uppercase">{ev.rubric_code} - {ev.description || ev.rubric_code}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                                    {ev.type === 'provento' ? 'Provento' : ev.type === 'desconto' ? 'Desconto' : 'Informativa'}
                                                    {(ev.quantity ?? 0) > 0 && ` • ${(ev.quantity ?? 0).toLocaleString('pt-BR')} ${ev.unit === 'days' ? 'dias' : 'hrs'}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <p className={`text-xs font-black ${ev.type === 'provento' ? 'text-indigo-600' : ev.type === 'desconto' ? 'text-rose-500' : 'text-slate-500'}`}>
                                                    {ev.type === 'provento' ? '+' : ev.type === 'desconto' ? '-' : ' '} R$ {ev.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                {run.status !== 'FECHADO' && (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button
                                                            onClick={() => startEditing(ev)}
                                                            className="p-1.5 text-slate-300 hover:text-indigo-600 transition-all rounded-lg hover:bg-indigo-50"
                                                            title="Editar Lançamento"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (confirm('Deseja excluir este lançamento manual?')) {
                                                                    handleDeleteEvent(ev.id!);
                                                                }
                                                            }}
                                                            className="p-1.5 text-slate-300 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50"
                                                            title="Excluir Lançamento"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PayrollEventModal;
