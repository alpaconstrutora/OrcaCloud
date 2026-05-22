import React from 'react';
import {
    Plus, Calculator, Calendar, History,
    AlertTriangle, ChevronRight, Trash2
} from 'lucide-react';
import { PayrollRun } from '../services/payrollService';
import { formatDate } from '../lib/payrollUIHelpers';

interface PayrollRunListProps {
    runs: PayrollRun[];
    orgId: string;
    organizations: Array<{ id: string; name: string }>;
    loading: boolean;
    typeFilter: string;
    monthFilter: string;
    yearFilter: string;
    localOrgId: string;
    onTypeFilter: (v: string) => void;
    onMonthFilter: (v: string) => void;
    onYearFilter: (v: string) => void;
    onLocalOrgId: (v: string) => void;
    onSelectRun: (run: PayrollRun) => void;
    onDeleteRun: (id: string) => void;
    onDuplicateRun: (id: string) => void;
    onNewRun: () => void;
    onRefresh: () => void;
}

const PayrollRunList: React.FC<PayrollRunListProps> = ({
    runs, orgId, organizations, loading,
    typeFilter, monthFilter, yearFilter, localOrgId,
    onTypeFilter, onMonthFilter, onYearFilter, onLocalOrgId,
    onSelectRun, onDeleteRun, onDuplicateRun, onNewRun, onRefresh,
}) => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header com Ações */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestão de Folha de Pagamento</h2>
                <div className="flex flex-wrap items-center gap-3">
                    {/* Tipos de Folha */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {['all', 'mensal', 'ferias', 'decimo_terceiro', 'rescisao'].map(t => (
                            <button
                                key={t}
                                onClick={() => onTypeFilter(t)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${typeFilter === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {t === 'all' ? 'Todas' : t.replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1 hidden md:block" />

                    {/* Seletores de Período */}
                    <div className="flex items-center gap-2">
                        <select
                            value={monthFilter}
                            onChange={e => onMonthFilter(e.target.value)}
                            className="bg-slate-100 border-none rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">Mês (Todos)</option>
                            {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                        <select
                            value={yearFilter}
                            onChange={e => onYearFilter(e.target.value)}
                            className="bg-slate-100 border-none rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">Ano (Todos)</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                    </div>

                    {/* Seletor de Organização (modo consolidado) */}
                    {orgId === 'all' && (
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-[1px] bg-slate-200 mx-1 hidden md:block" />
                            <select
                                value={localOrgId}
                                onChange={e => onLocalOrgId(e.target.value)}
                                className="bg-indigo-50 border-none rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 min-w-[150px]"
                            >
                                <option value="">Empresa (Todas)</option>
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={onRefresh}
                    className="p-3 bg-white text-slate-400 rounded-2xl hover:text-indigo-600 transition-all border border-slate-100 shadow-sm"
                    title="Atualizar Lista"
                >
                    <History className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                    onClick={onNewRun}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 font-black text-xs uppercase tracking-tight"
                >
                    {!orgId || orgId === 'all' ? (
                        <><Calculator className="w-4 h-4" /> Gerar Folhas em Lote</>
                    ) : (
                        <><Plus className="w-4 h-4" /> Nova Folha</>
                    )}
                </button>
            </div>
        </div>

        {/* Tabela de Runs */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="grid grid-cols-[120px_1fr_1fr_140px_40px] gap-0 border-b border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Período</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Organização</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Valor Total</span>
                <span />
            </div>

            {runs.length === 0 ? (
                <div className="py-16 text-center">
                    <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-400 uppercase">Nenhum ciclo encontrado</h3>
                    <p className="text-xs text-slate-400 font-medium mt-1">Clique em "Nova Folha" para iniciar o cálculo do período</p>
                </div>
            ) : (
                runs.map((run, idx) => {
                    const orgName = organizations.find(o => o.id === run.org_id)?.name ?? '—';
                    const isClosed = run.status === 'FECHADO';
                    const hasWarning = run.validation_logs && run.validation_logs.length > 0;
                    return (
                        <div
                            key={run.id}
                            onClick={() => onSelectRun(run)}
                            className={`grid grid-cols-[120px_1fr_1fr_140px_40px] gap-0 items-center px-4 py-3 cursor-pointer group transition-colors hover:bg-slate-50 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}
                        >
                            {/* Status */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${isClosed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {run.status}
                                </span>
                                {hasWarning && (
                                    <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                                )}
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase tracking-tighter border border-slate-200">
                                    {run.type}{run.subtype ? ` · ${run.subtype}` : ''}
                                </span>
                            </div>

                            {/* Período */}
                            <div className="flex items-center gap-2 min-w-0">
                                <Calendar className={`w-3.5 h-3.5 shrink-0 ${isClosed ? 'text-emerald-500' : 'text-amber-500'}`} />
                                <span className="text-sm font-bold text-slate-700 truncate">
                                    {formatDate(run.start_date)}
                                    <span className="text-slate-400 font-medium mx-1">→</span>
                                    {formatDate(run.end_date)}
                                </span>
                            </div>

                            {/* Organização */}
                            <span className="text-sm font-medium text-slate-600 truncate pr-4">{orgName}</span>

                            {/* Valor Total */}
                            <span className="text-sm font-black text-slate-400 text-right tabular-nums">—</span>

                            {/* Ações */}
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={e => { e.stopPropagation(); onDuplicateRun(run.id); }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Duplicar"
                                >
                                    <History className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={e => { e.stopPropagation(); onDeleteRun(run.id); }}
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

export default PayrollRunList;
