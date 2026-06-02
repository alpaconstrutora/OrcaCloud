import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { payrollService, PayrollRun, PayrollRubric, PayrollEvent, PayrollResultWithEmployee } from '../services/payrollService';
import { payrollEngine } from '../services/payrollEngine';
import { computeDateRange } from '../lib/payrollUIHelpers';
import PayrollRunList from './PayrollRunList';
import PayrollRunDetail from './PayrollRunDetail';
import PayrollEventModal from './PayrollEventModal';
import PaystubModal from './PaystubModal';

// ── Local types ────────────────────────────────────────────────────────────────
interface OrganizationItem {
    id: string;
    name: string;
}


interface LaborPayrollProps {
    orgId: string;
}

const LaborPayroll: React.FC<LaborPayrollProps> = ({ orgId }) => {
    // ── Data ──────────────────────────────────────────────────────────────────
    const [runs, setRuns]               = useState<PayrollRun[]>([]);
    const [rubrics, setRubrics]         = useState<PayrollRubric[]>([]);
    const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
    const [results, setResults]         = useState<PayrollResultWithEmployee[]>([]);
    const [runEvents, setRunEvents]     = useState<PayrollEvent[]>([]);
    const [runTotals, setRunTotals]     = useState<Record<string, number>>({});

    // ── UI state ──────────────────────────────────────────────────────────────
    const [loading, setLoading]         = useState(true);
    const [executing, setExecuting]     = useState(false);
    const [loadError, setLoadError]     = useState<string | null>(null);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);

    // ── Filter state ──────────────────────────────────────────────────────────
    const [typeFilter, setTypeFilter]   = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [yearFilter, setYearFilter]   = useState<string>(new Date().getFullYear().toString());
    const [localOrgId, setLocalOrgId]   = useState<string>('');

    // ── Modal state ───────────────────────────────────────────────────────────
    const [showNewRunModal, setShowNewRunModal] = useState(false);
    const [showEventModal, setShowEventModal]   = useState<{ employeeId: string; employeeName: string } | null>(null);
    const [showPaystub, setShowPaystub]         = useState<{ runId: string; employeeId: string; adiantamentoOnly?: boolean } | null>(null);

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        loadRuns();
        loadRubrics();
        loadOrganizations();
    }, [orgId, typeFilter, monthFilter, yearFilter, localOrgId]);

    useEffect(() => {
        if (selectedRun) loadEvents();
    }, [selectedRun]);

    // ── Loaders ───────────────────────────────────────────────────────────────
    const loadOrganizations = async () => {
        try {
            const { data } = await supabase.from('organizations').select('id, name');
            setOrganizations(data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadRubrics = async () => {
        try {
            const data = await payrollService.listRubrics();
            setRubrics(data);
        } catch (err) {
            console.error(err);
            setLoadError('Não foi possível carregar as rubricas. O cálculo de folha pode ser afetado.');
        }
    };

    const loadRuns = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const activeOrgId = (orgId === 'all' && localOrgId) ? localOrgId : orgId;
            const { start, end } = computeDateRange(yearFilter, monthFilter);
            const data = await payrollService.listRuns(
                activeOrgId,
                typeFilter === 'all' ? undefined : typeFilter,
                start,
                end,
            );
            setRuns(data);
            if (data.length > 0) {
                const totals = await payrollService.getRunsTotals(data.map(r => r.id));
                setRunTotals(totals);
            } else {
                setRunTotals({});
            }
        } catch (err) {
            console.error(err);
            setLoadError('Não foi possível carregar as folhas de pagamento.');
        } finally {
            setLoading(false);
        }
    };

    const loadResults = async (runId: string) => {
        try {
            setResultsLoading(true);
            const res = await payrollService.listResultsByRun(runId);
            setResults(res);
        } finally {
            setResultsLoading(false);
        }
    };

    const loadEvents = async () => {
        if (!selectedRun) return;
        try {
            const events = await payrollService.listEvents(orgId, selectedRun.id);
            setRunEvents(events);
        } catch (err) {
            console.error(err);
        }
    };

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleCreateRun = async (start: string, end: string, type: string = 'mensal', subtype?: string) => {
        try {
            setExecuting(true);
            if (!orgId || orgId === 'all') {
                await payrollEngine.runBulkPayroll(start, end, type as PayrollRun['type'], subtype);
            } else {
                await payrollEngine.runPayroll(orgId, start, end, type as PayrollRun['type'], subtype);
            }
            setShowNewRunModal(false);
            loadRuns();
        } catch (err) {
            console.error(err);
            alert('Erro ao criar folha. Verifique os dados.');
        } finally {
            setExecuting(false);
        }
    };

    const handleSelectRun = (run: PayrollRun) => {
        setSelectedRun(run);
        loadResults(run.id);
    };

    const handleResyncFinance = async () => {
        if (!selectedRun) return;
        try {
            setExecuting(true);
            const result = await payrollService.syncPayrollToFinance(selectedRun.id);
            window.dispatchEvent(new CustomEvent('payroll-synced'));
            const lines: string[] = ['✅ Financeiro re-sincronizado!', ''];
            if (result.rubricasEncontradas?.length) {
                lines.push(`Rubricas individualizadas: ${result.rubricasEncontradas.join(', ')}`);
            } else {
                lines.push('⚠️ Nenhuma rubrica com "Lançamento Individualizado" encontrada.');
                lines.push('Vá em Gestão de Rubricas e ative o campo na rubrica ADIANTAMENTO.');
            }
            if (result.worksites?.length) {
                lines.push('');
                lines.push('Obras atualizadas:');
                for (const w of result.worksites) {
                    lines.push(`  ${w.name}: Salários R$ ${w.netSalary.toFixed(2)} | Encargos R$ ${w.encargos.toFixed(2)} | Contrib. Terceiros R$ ${(w.contribuicoes || 0).toFixed(2)}`);
                }
            }
            alert(lines.join('\n'));
        } catch (err: unknown) {
            console.error(err);
            const error = err instanceof Error ? err : new Error(String(err));
            alert(`Erro ao re-sincronizar financeiro:\n${error.message}`);
        } finally {
            setExecuting(false);
        }
    };

    const handleCloseRun = async () => {
        if (!selectedRun) return;
        try {
            setExecuting(true);
            await payrollService.updateRunStatus(selectedRun.id, 'FECHADO');
            try {
                await payrollService.syncPayrollToFinance(selectedRun.id);
            } catch (syncErr) {
                console.error('[LaborPayroll] Erro na sincronização financeira:', syncErr);
            }
            const updated = await payrollService.getRun(selectedRun.id);
            setSelectedRun(updated);
            loadRuns();
            alert('Folha fechada e custos sincronizados com o financeiro com sucesso!');
        } catch (err) {
            console.error(err);
            alert('Erro ao fechar folha.');
        } finally {
            setExecuting(false);
        }
    };

    const handleReopenRun = async () => {
        if (!selectedRun) return;
        if (!confirm('Deseja reabrir esta folha para edições?')) return;
        try {
            setExecuting(true);
            await payrollService.updateRunStatus(selectedRun.id, 'RASCUNHO');
            const updated = await payrollService.getRun(selectedRun.id);
            setSelectedRun(updated);
            loadRuns();
        } catch (err) {
            console.error(err);
            alert('Erro ao reabrir folha. Tente novamente.');
        } finally {
            setExecuting(false);
        }
    };

    const handleReprocessRun = async () => {
        if (!selectedRun) return;
        if (!confirm('Isso irá recalcular todos os valores desta folha. Os lançamentos manuais serão mantidos. Deseja continuar?')) return;
        try {
            setExecuting(true);
            const updatedRun = await payrollEngine.runPayroll(
                selectedRun.org_id,
                selectedRun.start_date,
                selectedRun.end_date,
                selectedRun.type,
                selectedRun.subtype,
                selectedRun.id,
            );
            setSelectedRun(updatedRun);
            await loadResults(updatedRun.id);
            alert('Folha reprocessada com sucesso!');
        } catch (err) {
            console.error(err);
            alert('Erro ao reprocessar a folha de pagamento.');
        } finally {
            setExecuting(false);
        }
    };

    const handleDeleteRun = async (id: string) => {
        if (!confirm('Deseja realmente excluir este ciclo de folha? Todos os dados processados e eventos serão removidos permanentemente.')) return;
        try {
            await payrollService.deleteRun(id);
            setSelectedRun(null);
            loadRuns();
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir folha.');
        }
    };

    const handleDuplicateRun = async (id: string) => {
        try {
            setExecuting(true);
            const copy = await payrollService.duplicateRun(id);
            await payrollEngine.runPayroll(orgId, copy.start_date, copy.end_date, copy.type, copy.subtype);
            loadRuns();
            alert('Folha duplicada com sucesso!');
        } catch (err) {
            console.error(err);
            alert('Erro ao duplicar folha.');
        } finally {
            setExecuting(false);
        }
    };

    const handleEventSaved = async () => {
        await loadEvents();
        if (selectedRun) await loadResults(selectedRun.id);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Carregando Histórico...</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {loadError && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="font-bold">{loadError}</p>
                </div>
            )}

            {selectedRun ? (
                <PayrollRunDetail
                    run={selectedRun}
                    orgId={orgId}
                    results={results}
                    resultsLoading={resultsLoading}
                    executing={executing}
                    onBack={() => setSelectedRun(null)}
                    onCloseRun={handleCloseRun}
                    onReopenRun={handleReopenRun}
                    onReprocessRun={handleReprocessRun}
                    onDeleteRun={handleDeleteRun}
                    onOpenEventModal={(empId, empName) => setShowEventModal({ employeeId: empId, employeeName: empName })}
                    onViewPaystub={(runId, empId) => setShowPaystub({ runId, employeeId: empId })}
                    onResyncFinance={handleResyncFinance}
                />
            ) : (
                <PayrollRunList
                    runs={runs}
                    orgId={orgId}
                    organizations={organizations}
                    loading={loading}
                    typeFilter={typeFilter}
                    monthFilter={monthFilter}
                    yearFilter={yearFilter}
                    localOrgId={localOrgId}
                    runTotals={runTotals}
                    onTypeFilter={setTypeFilter}
                    onMonthFilter={setMonthFilter}
                    onYearFilter={setYearFilter}
                    onLocalOrgId={setLocalOrgId}
                    onSelectRun={handleSelectRun}
                    onDeleteRun={handleDeleteRun}
                    onDuplicateRun={handleDuplicateRun}
                    onNewRun={() => setShowNewRunModal(true)}
                    onRefresh={loadRuns}
                />
            )}

            {/* Modal: Nova Folha */}
            {showNewRunModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-6 overflow-y-auto max-h-[90vh]">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Loader2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase">Novo Ciclo de Folha</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Folha</label>
                                <select
                                    id="payroll_type"
                                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                    onChange={e => {
                                        const subtype = document.getElementById('payroll_subtype_container');
                                        if (subtype) subtype.style.display = e.target.value === 'decimo_terceiro' ? 'block' : 'none';
                                    }}
                                >
                                    <option value="mensal">Mensal Padrão</option>
                                    <option value="adiantamento">Adiantamento</option>
                                    <option value="ferias">Férias</option>
                                    <option value="decimo_terceiro">13º Salário</option>
                                    <option value="rescisao">Rescisão</option>
                                </select>
                            </div>
                            <div id="payroll_subtype_container" className="space-y-2" style={{ display: 'none' }}>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parcela (13º)</label>
                                <select id="payroll_subtype" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="1_parcela">1ª Parcela (50%)</option>
                                    <option value="2_parcela">2ª Parcela (Integral com desc.)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início do Período</label>
                                    <input id="payroll_start" type="date" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                        defaultValue={new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fim do Período</label>
                                    <input id="payroll_end" type="date" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                        defaultValue={new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]} />
                                </div>
                            </div>
                        </div>

                        {(!orgId || orgId === 'all') && (
                            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                                <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest leading-relaxed text-center">
                                    O sistema identificará automaticamente as empresas com funcionários ativos e gerará as folhas individuais em lote.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    const start   = (document.getElementById('payroll_start') as HTMLInputElement).value || new Date().toISOString().split('T')[0];
                                    const end     = (document.getElementById('payroll_end') as HTMLInputElement).value || new Date().toISOString().split('T')[0];
                                    const type    = (document.getElementById('payroll_type') as HTMLSelectElement).value;
                                    const subtype = (document.getElementById('payroll_subtype') as HTMLSelectElement).value;
                                    handleCreateRun(start, end, type, type === 'decimo_terceiro' ? subtype : undefined);
                                }}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200"
                            >
                                {!orgId || orgId === 'all' ? 'Processar Todas as Empresas' : 'Iniciar Cálculo'}
                            </button>
                            <button
                                onClick={() => setShowNewRunModal(false)}
                                className="w-full py-3 text-slate-400 font-bold text-xs uppercase hover:text-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Eventos */}
            {showEventModal && selectedRun && (
                <PayrollEventModal
                    run={selectedRun}
                    orgId={orgId}
                    employeeId={showEventModal.employeeId}
                    employeeName={showEventModal.employeeName}
                    rubrics={rubrics}
                    runEvents={runEvents}
                    results={results}
                    executing={executing}
                    onClose={() => setShowEventModal(null)}
                    onEventSaved={handleEventSaved}
                    onViewPaystub={(runId, empId) => setShowPaystub({ runId, employeeId: empId, adiantamentoOnly: true })}
                />
            )}

            {/* Modal: Holerite */}
            {showPaystub && (
                <PaystubModal
                    orgId={orgId}
                    runId={showPaystub.runId}
                    employeeId={showPaystub.employeeId}
                    adiantamentoOnly={showPaystub.adiantamentoOnly}
                    onClose={() => setShowPaystub(null)}
                />
            )}
        </div>
    );
};

export default LaborPayroll;
