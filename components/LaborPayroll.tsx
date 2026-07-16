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
import { usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

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

    // ── Filter state (F2: sobrevive a navegação/reload) ─────────────────────────
    const [typeFilter, setTypeFilter]   = usePersistedState<string>('payrollRunList:type', 'all');
    const [monthFilter, setMonthFilter] = usePersistedState<string>('payrollRunList:month', 'all');
    const [yearFilter, setYearFilter]   = usePersistedState<string>('payrollRunList:year', new Date().getFullYear().toString());
    const [localOrgId, setLocalOrgId]   = usePersistedState<string>('payrollRunList:localOrg', '');
    const [search, setSearch]           = usePersistedState<string>('payrollRunList:search', '');

    // ── Modal state ───────────────────────────────────────────────────────────
    const [showNewRunModal, setShowNewRunModal] = useState(false);
    const [showEventModal, setShowEventModal]   = useState<{ employeeId: string; employeeName: string } | null>(null);
    const [showPaystub, setShowPaystub]         = useState<{ runId: string; employeeId: string } | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const confirm = useConfirm();

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

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
            notify('Folha criada com sucesso.');
        } catch (err) {
            console.error(err);
            notify('Erro ao criar folha. Verifique os dados.', 'error');
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
            const updated = await payrollService.getRun(selectedRun.id);
            setSelectedRun(updated);
            loadRuns();
            // Sync financeiro em background — não bloqueia a UI
            payrollService.syncPayrollToFinance(selectedRun.id).catch(syncErr => {
                console.error('[LaborPayroll] Erro na sincronização financeira:', syncErr);
            });
            notify('Folha fechada! Os lançamentos financeiros serão sincronizados em instantes.');
        } catch (err) {
            console.error(err);
            notify('Erro ao fechar folha.', 'error');
        } finally {
            setExecuting(false);
        }
    };

    const handleReopenRun = async () => {
        if (!selectedRun) return;
        const ok = await confirm({
            title: 'Reabrir folha?',
            message: 'A folha voltará para rascunho e poderá ser editada novamente.',
            variant: 'warning',
            confirmLabel: 'Reabrir',
        });
        if (!ok) return;
        try {
            setExecuting(true);
            await payrollService.updateRunStatus(selectedRun.id, 'RASCUNHO');
            const updated = await payrollService.getRun(selectedRun.id);
            setSelectedRun(updated);
            loadRuns();
            notify('Folha reaberta para edição.');
        } catch (err) {
            console.error(err);
            notify('Erro ao reabrir folha. Tente novamente.', 'error');
        } finally {
            setExecuting(false);
        }
    };

    const handleReprocessRun = async () => {
        if (!selectedRun) return;
        const ok = await confirm({
            title: 'Reprocessar folha?',
            message: 'Isso irá recalcular todos os valores desta folha. Os lançamentos manuais serão mantidos.',
            variant: 'warning',
            confirmLabel: 'Reprocessar',
        });
        if (!ok) return;
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
            notify('Folha reprocessada com sucesso.');
        } catch (err) {
            console.error(err);
            notify('Erro ao reprocessar a folha de pagamento.', 'error');
        } finally {
            setExecuting(false);
        }
    };

    const handleDeleteRun = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir ciclo de folha?',
            message: 'Todos os dados processados e eventos deste ciclo serão removidos permanentemente. Esta ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await payrollService.deleteRun(id);
            setSelectedRun(null);
            loadRuns();
            notify('Folha excluída.');
        } catch (err) {
            console.error(err);
            notify('Erro ao excluir folha.', 'error');
        }
    };

    const handleDuplicateRun = async (id: string) => {
        try {
            setExecuting(true);
            const copy = await payrollService.duplicateRun(id);
            await payrollEngine.runPayroll(orgId, copy.start_date, copy.end_date, copy.type, copy.subtype);
            loadRuns();
            notify('Folha duplicada com sucesso.');
        } catch (err) {
            console.error(err);
            notify('Erro ao duplicar folha.', 'error');
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
        <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando histórico...</p>
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
                    search={search}
                    runTotals={runTotals}
                    onTypeFilter={setTypeFilter}
                    onMonthFilter={setMonthFilter}
                    onYearFilter={setYearFilter}
                    onLocalOrgId={setLocalOrgId}
                    onSearch={setSearch}
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
                            <h3 className="text-xl font-black text-slate-900">Novo ciclo de folha</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Tipo de folha</label>
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
                                <label className="text-xs font-semibold text-slate-500">Parcela (13º)</label>
                                <select id="payroll_subtype" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="1_parcela">1ª Parcela (50%)</option>
                                    <option value="2_parcela">2ª Parcela (Integral com desc.)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">Início do período</label>
                                    <input id="payroll_start" type="date" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                        defaultValue={new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">Fim do período</label>
                                    <input id="payroll_end" type="date" className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                        defaultValue={new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]} />
                                </div>
                            </div>
                        </div>

                        {(!orgId || orgId === 'all') && (
                            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                                <p className="text-xs font-semibold text-indigo-700 leading-relaxed text-center">
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
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-button uppercase tracking-widest shadow-lg shadow-indigo-200"
                            >
                                {!orgId || orgId === 'all' ? 'Processar Todas as Empresas' : 'Iniciar Cálculo'}
                            </button>
                            <button
                                onClick={() => setShowNewRunModal(false)}
                                className="w-full py-3 text-slate-400 font-bold text-button uppercase hover:text-slate-600 transition-colors"
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
                />
            )}

            {/* Modal: Holerite */}
            {showPaystub && (
                <PaystubModal
                    orgId={orgId}
                    runId={showPaystub.runId}
                    employeeId={showPaystub.employeeId}
                    onClose={() => setShowPaystub(null)}
                />
            )}

            {/* Toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default LaborPayroll;
