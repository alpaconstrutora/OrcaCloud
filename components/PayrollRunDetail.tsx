import React, { useState } from 'react';
import {
    Play, FileText, CheckCircle2, History, Loader2, AlertCircle,
    ArrowRight, X, Trash2, ShieldAlert, Plus, RefreshCw
} from 'lucide-react';
import { PayrollRun } from '../services/payrollService';
import { formatDate } from '../lib/payrollUIHelpers';

interface PayrollRunDetailProps {
    run: PayrollRun;
    orgId: string;
    results: any[];
    resultsLoading: boolean;
    executing: boolean;
    onBack: () => void;
    onCloseRun: () => void;
    onReopenRun: () => void;
    onResyncFinance?: () => void;
    onReprocessRun: () => void;
    onDeleteRun: (id: string) => void;
    onOpenEventModal: (employeeId: string, employeeName: string) => void;
    onViewPaystub: (runId: string, employeeId: string) => void;
}

const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PayrollRunDetail: React.FC<PayrollRunDetailProps> = ({
    run, orgId, results, resultsLoading, executing,
    onBack, onCloseRun, onReopenRun, onReprocessRun, onDeleteRun,
    onOpenEventModal, onViewPaystub, onResyncFinance,
}) => {
    const [showAuditModal, setShowAuditModal] = useState(false);

    const totalGross        = results.reduce((s, r) => s + (r.gross || 0), 0);
    const totalDiscounts    = results.reduce((s, r) => s + (r.discounts || 0), 0);
    const totalNet          = results.reduce((s, r) => s + (r.net || 0), 0);
    const totalEmployerCost = results.reduce((s, r) => s + (r.employer_cost || 0), 0);

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-bold text-xs uppercase transition-colors"
            >
                <ArrowRight className="w-4 h-4 rotate-180" /> Voltar à Lista
            </button>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Detalhes da Folha</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Período: {formatDate(run.start_date)} a {formatDate(run.end_date)}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest leading-none ${run.status === 'FECHADO' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                            {run.status}
                        </span>

                        {run.status === 'FECHADO' ? (
                            <>
                                <button
                                    disabled={executing}
                                    onClick={onResyncFinance}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                                    title="Re-executa a sincronização com o módulo financeiro sem reabrir a folha"
                                >
                                    {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                    Re-sincronizar Financeiro
                                </button>
                                <button
                                    disabled={executing}
                                    onClick={onReopenRun}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                                >
                                    <History className="w-3 h-3" /> Reabrir Folha
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    disabled={executing}
                                    onClick={onReprocessRun}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                                >
                                    {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                    Reprocessar
                                </button>
                                <button
                                    disabled={executing}
                                    onClick={onCloseRun}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-3 h-3" /> Fechar Folha
                                </button>
                            </>
                        )}

                        {run.validation_logs && run.validation_logs.length > 0 && (
                            <button
                                onClick={() => setShowAuditModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-bold text-[10px] uppercase tracking-widest border border-rose-100"
                            >
                                <ShieldAlert size={14} /> Auditoria ({run.validation_logs.length})
                            </button>
                        )}

                        <button
                            onClick={() => onDeleteRun(run.id)}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                            title="Excluir Ciclo"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Cards de Resumo */}
                {results.length > 0 && !resultsLoading && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Colaboradores</p>
                            <p className="text-2xl font-black text-slate-900">{results.length}</p>
                        </div>
                        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Proventos</p>
                            <p className="text-lg font-black text-indigo-700">R$ {fmt(totalGross)}</p>
                            <p className="text-[9px] text-indigo-400 font-bold">Desc: R$ {fmt(totalDiscounts)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total Líquido</p>
                            <p className="text-lg font-black text-emerald-700">R$ {fmt(totalNet)}</p>
                        </div>
                        <div className="bg-slate-900 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Total Empresa</p>
                            <p className="text-lg font-black text-white">R$ {fmt(totalEmployerCost)}</p>
                        </div>
                    </div>
                )}

                {/* Modal de Auditoria */}
                {showAuditModal && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                        <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50/30">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                        <ShieldAlert size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Relatório de Auditoria</h3>
                                        <p className="text-xs text-rose-600 font-bold uppercase tracking-widest">Divergências detectadas vs Referência Oficial</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowAuditModal(false)} className="p-2 hover:bg-rose-100 text-rose-400 rounded-xl transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-6">
                                {run.validation_logs?.map((log: any, idx: number) => (
                                    <div key={idx} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{log.employee_name}</p>
                                            <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-bold rounded-lg uppercase tracking-tight">Erro Fiscal</span>
                                        </div>
                                        <div className="space-y-2">
                                            {log.differences.map((diff: any, dIdx: number) => (
                                                <div key={dIdx} className="grid grid-cols-4 gap-2 items-center text-[11px] p-2 bg-white rounded-xl shadow-sm">
                                                    <div className="font-bold text-slate-400 uppercase tracking-widest">{diff.field}</div>
                                                    <div className="text-slate-600">Sis: <span className="font-bold text-slate-800">R$ {diff.system.toLocaleString()}</span></div>
                                                    <div className="text-slate-600">Ref: <span className="font-bold text-indigo-600">R$ {diff.reference.toLocaleString()}</span></div>
                                                    <div className="text-right font-black text-rose-600">Δ R$ {diff.diff.toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                                <button onClick={() => setShowAuditModal(false)} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all">Fechar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabela de Resultados */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-50">
                                {!orgId && <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Org</th>}
                                <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Salário Base</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proventos</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descontos</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Líquido</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Empresa</th>
                                <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pr-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resultsLoading ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center">
                                        <Loader2 className="w-8 h-8 text-indigo-300 mx-auto mb-2 animate-spin" />
                                        <p className="text-xs font-bold text-slate-400 uppercase">Carregando resultados...</p>
                                    </td>
                                </tr>
                            ) : results.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center">
                                        <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                        <p className="text-xs font-bold text-slate-400 uppercase">Nenhum resultado processado</p>
                                        {run.status === 'RASCUNHO' && (
                                            <button onClick={onReprocessRun} className="mt-2 text-indigo-500 font-black text-[10px] uppercase hover:underline">Processar agora</button>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                results.map((res: any) => (
                                    <tr key={res.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                                        {!orgId && (
                                            <td className="py-4">
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black rounded-md uppercase border border-slate-200">
                                                    {res.employee?.org_id?.substring(0, 8)}
                                                </span>
                                            </td>
                                        )}
                                        <td className="py-4">
                                            <p className="text-sm font-black text-slate-900">{res.employee?.name}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{res.employee?.role}</p>
                                        </td>
                                        <td className="py-4 text-right text-sm font-bold text-slate-600">
                                            R$ {res.employee?.base_salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td
                                            onClick={() => onOpenEventModal(res.employee_id, res.employee?.name)}
                                            className="py-4 text-right text-sm font-black text-indigo-600 cursor-pointer hover:underline"
                                        >
                                            R$ {res.gross.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td
                                            onClick={() => onOpenEventModal(res.employee_id, res.employee?.name)}
                                            className="py-4 text-right text-sm font-black text-rose-500 cursor-pointer hover:underline"
                                        >
                                            R$ {res.discounts.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-4 text-right text-sm font-black text-emerald-600">
                                            R$ {res.net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-4 text-right text-sm font-black text-slate-900">
                                            R$ {res.employer_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-4 text-right pr-4 flex items-center justify-end gap-2">
                                            <button
                                                onClick={e => { e.stopPropagation(); onViewPaystub(run.id, res.employee_id); }}
                                                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-emerald-600 transition-all"
                                                title="Ver Holerite"
                                            >
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            {['RASCUNHO', 'PROCESSANDO'].includes(run.status) && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); onOpenEventModal(res.employee_id, res.employee?.name); }}
                                                    className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"
                                                    title="Lançar Bônus/Desconto"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {results.length > 1 && !resultsLoading && (
                            <tfoot>
                                <tr className="border-t-2 border-slate-200 bg-slate-50">
                                    {!orgId && <td />}
                                    <td className="py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Total ({results.length})</td>
                                    <td className="py-4 text-right text-sm font-black text-slate-700">
                                        R$ {fmt(results.reduce((s, r) => s + (r.employee?.base_salary || 0), 0))}
                                    </td>
                                    <td className="py-4 text-right text-sm font-black text-indigo-700">R$ {fmt(totalGross)}</td>
                                    <td className="py-4 text-right text-sm font-black text-rose-600">R$ {fmt(totalDiscounts)}</td>
                                    <td className="py-4 text-right text-sm font-black text-emerald-700">R$ {fmt(totalNet)}</td>
                                    <td className="py-4 text-right text-sm font-black text-slate-900">R$ {fmt(totalEmployerCost)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PayrollRunDetail;
