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

        {/* Grid de Runs */}
        <div className="grid grid-cols-1 gap-4">
            {runs.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                    <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-400 uppercase">Nenhum ciclo encontrado</h3>
                    <p className="text-sm text-slate-400 font-medium">Clique em "Nova Folha" para iniciar o cálculo do período</p>
                </div>
            ) : (
                runs.map(run => (
                    <div
                        key={run.id}
                        onClick={() => onSelectRun(run)}
                        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 group cursor-pointer"
                    >
                        <div className="flex items-center gap-4 flex-1">
                            <div className={`p-4 rounded-2xl ${run.status === 'FECHADO' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                <Calendar className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-lg font-black text-slate-900">
                                    Período de {formatDate(run.start_date)}
                                </h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Fim: {formatDate(run.end_date)}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${run.status === 'FECHADO' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                                        {run.status}
                                    </span>
                                    {run.validation_logs && run.validation_logs.length > 0 && (
                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[9px] font-black uppercase tracking-tighter border border-rose-200 flex items-center gap-1">
                                            <AlertTriangle size={10} /> Inconsistente
                                        </span>
                                    )}
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase tracking-tighter border border-slate-200">
                                        {run.type} {run.subtype ? `- ${run.subtype}` : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={e => { e.stopPropagation(); onDuplicateRun(run.id); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Duplicar Ciclo"
                            >
                                <History className="w-5 h-5" />
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); onDeleteRun(run.id); }}
                                className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Excluir Ciclo"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                ))
            )}
        </div>
    </div>
);

export default PayrollRunList;
