import React, { useState, useEffect } from 'react';
import {
    User, Clock, Umbrella, BookOpen, FileText, DollarSign,
    LogOut, Loader2, AlertTriangle, CheckCircle2, ChevronRight,
    Calendar, Shield, QrCode, Copy, X, Plus, RefreshCw,
    Smartphone, Key, Trash2, Search, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { atsService, PortalToken, PortalEmployeeSummary } from '../services/atsService';
import { laborService, Employee } from '../services/laborService';
import { PayrollRun } from '../services/payrollService';
import { supabase } from '../lib/supabase';
import PaystubModal from './PaystubModal';
import { STALE } from '../lib/queryClient';

// Helper: chama RPC SECURITY DEFINER e retorna array (funciona sem sessão Supabase)
async function portalRpc<T>(fn: string, employeeId: string): Promise<T[]> {
    const { data, error } = await supabase.rpc(fn, { p_employee_id: employeeId });
    if (error) throw error;
    return (data as T[]) ?? [];
}

// ── View: Portal do Colaborador (tela que o funcionário vê no celular) ────────

interface PortalViewProps {
    employeeId: string;
    orgId: string;
    onLogout: () => void;
}

export const PortalView: React.FC<PortalViewProps> = ({ employeeId, orgId, onLogout }) => {
    const [activeSection, setActiveSection] = useState<'home' | 'ponto' | 'ferias' | 'docs' | 'treino' | 'folha'>('home');
    const [paystubOpen, setPaystubOpen] = useState<{ runId: string } | null>(null);

    const summaryKey = ['portal', 'summary', employeeId];
    const { data: summary, isLoading } = useQuery<PortalEmployeeSummary>({
        queryKey: summaryKey,
        queryFn: () => atsService.getPortalSummary(employeeId),
        staleTime: STALE.fast,
    });

    const { data: recentEntries = [] } = useQuery({
        queryKey: ['portal', 'timeEntries', employeeId],
        queryFn: () => portalRpc<any>('portal_get_time_entries', employeeId),
        staleTime: STALE.fast,
        enabled: activeSection === 'ponto',
    });

    const { data: absences = [] } = useQuery({
        queryKey: ['portal', 'absences', employeeId],
        queryFn: () => portalRpc<any>('portal_get_absences', employeeId),
        staleTime: STALE.normal,
        enabled: activeSection === 'ferias',
    });

    const { data: trainings = [] } = useQuery({
        queryKey: ['portal', 'trainings', employeeId],
        queryFn: () => portalRpc<any>('portal_get_trainings', employeeId),
        staleTime: STALE.normal,
        enabled: activeSection === 'treino',
    });

    const { data: documents = [] } = useQuery({
        queryKey: ['portal', 'docs', employeeId],
        queryFn: () => portalRpc<any>('portal_get_documents', employeeId),
        staleTime: STALE.normal,
        enabled: activeSection === 'docs',
    });

    const { data: folhaRuns = [] } = useQuery<Array<PayrollRun & { net: number }>>({
        queryKey: ['portal', 'folha', employeeId],
        queryFn: () => portalRpc<PayrollRun & { net: number }>('portal_get_payroll_runs', employeeId),
        staleTime: STALE.normal,
        enabled: activeSection === 'folha',
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Carregando...</p>
            </div>
        );
    }

    const emp = summary?.employee;

    return (
        <div className="max-w-md mx-auto h-full flex flex-col bg-white">
            {/* Header */}
            <div className="px-5 pt-8 pb-5 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-black">
                            {emp?.name.charAt(0) || '?'}
                        </div>
                        <div>
                            <p className="text-base font-black">{emp?.name || '—'}</p>
                            <p className="text-indigo-200 text-xs">{emp?.role}</p>
                        </div>
                    </div>
                    <button onClick={onLogout} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>

                {/* Cards resumo */}
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { label: 'Dias de Férias',    value: `${summary?.ferias_saldo ?? 0}d`,   icon: Umbrella, alert: (summary?.ferias_saldo ?? 0) === 0 },
                        { label: 'Pontos Pendentes',  value: summary?.pontos_pendentes ?? 0,      icon: Clock,    alert: (summary?.pontos_pendentes ?? 0) > 0 },
                        { label: 'Trein. Vencendo',   value: summary?.treinamentos_vencendo ?? 0, icon: BookOpen, alert: (summary?.treinamentos_vencendo ?? 0) > 0 },
                        { label: 'Ausências no Mês',  value: summary?.ausencias_mes ?? 0,         icon: Calendar, alert: false },
                    ].map(({ label, value, icon: Icon, alert }) => (
                        <div key={label} className={`p-3 rounded-2xl ${alert ? 'bg-amber-400/30 border border-amber-300/30' : 'bg-white/10'}`}>
                            <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-white/80" />
                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{label}</span>
                            </div>
                            <p className="text-2xl font-black text-white mt-1">{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex border-b border-slate-100 px-2 shrink-0">
                {([
                    ['home',   'Início',    User],
                    ['ponto',  'Ponto',     Clock],
                    ['ferias', 'Férias',    Umbrella],
                    ['folha',  'Folha',     DollarSign],
                    ['docs',   'Docs',      FileText],
                    ['treino', 'Trein.',    BookOpen],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} onClick={() => setActiveSection(id)}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeSection === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Holerite Modal */}
            {paystubOpen && (
                <PaystubModal
                    orgId={orgId}
                    runId={paystubOpen.runId}
                    employeeId={employeeId}
                    onClose={() => setPaystubOpen(null)}
                />
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">

                {/* Home */}
                {activeSection === 'home' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                            <p className="text-xs font-black text-indigo-800 mb-1">Matrícula</p>
                            <p className="text-lg font-black text-indigo-900">{emp?.matricula || '—'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-xs font-black text-slate-500 mb-1">Data de Admissão</p>
                            <p className="text-sm font-bold text-slate-800">{emp?.hire_date || '—'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setActiveSection('ponto')} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all">
                                <Clock className="w-6 h-6 text-indigo-500" />
                                <span className="text-xs font-black text-slate-700">Meu Ponto</span>
                            </button>
                            <button onClick={() => setActiveSection('ferias')} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all">
                                <Umbrella className="w-6 h-6 text-blue-500" />
                                <span className="text-xs font-black text-slate-700">Férias</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Ponto */}
                {activeSection === 'ponto' && (
                    <div className="space-y-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Últimos Registros</p>
                        {recentEntries.length === 0 ? (
                            <div className="text-center py-10">
                                <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-sm text-slate-400">Nenhum registro de ponto</p>
                            </div>
                        ) : (
                            recentEntries.slice(0, 10).map(e => (
                                <div key={e.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{e.date}</p>
                                        <p className="text-xs text-slate-400">{e.project_name || 'Sem obra'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-slate-900">{e.hours_worked}h{e.overtime_hours > 0 ? ` +${e.overtime_hours}HE` : ''}</p>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${e.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : e.status === 'REJEITADO' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {e.status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Férias */}
                {activeSection === 'ferias' && (
                    <div className="space-y-3">
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                            <Umbrella className="w-5 h-5 text-blue-600 shrink-0" />
                            <div>
                                <p className="text-xs font-black text-blue-800">Saldo disponível</p>
                                <p className="text-2xl font-black text-blue-900">{summary?.ferias_saldo ?? 0} dias</p>
                            </div>
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Histórico</p>
                        {absences.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">Nenhuma ausência registrada</p>
                        ) : (
                            absences.slice(0, 8).map(a => (
                                <div key={a.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{a.tipo.replace('_', ' ')}</p>
                                        <p className="text-xs text-slate-400">{a.data_inicio} → {a.data_fim}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-slate-900">{a.dias}d</p>
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${a.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : a.status === 'REJEITADO' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {a.status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Documentos */}
                {activeSection === 'docs' && (
                    <div className="space-y-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Meus Documentos</p>
                        {documents.length === 0 ? (
                            <div className="text-center py-10">
                                <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-sm text-slate-400">Nenhum documento disponível</p>
                            </div>
                        ) : (
                            documents.map(d => {
                                const today = new Date().toISOString().split('T')[0];
                                const expired = d.expiry_date && d.expiry_date < today;
                                return (
                                    <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border ${expired ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}>
                                        <FileText className={`w-4 h-4 shrink-0 ${expired ? 'text-rose-500' : 'text-indigo-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{d.title}</p>
                                            <p className="text-xs text-slate-400">{d.category}{d.expiry_date ? ` · vence ${d.expiry_date}` : ''}</p>
                                        </div>
                                        {expired && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Folha de Pagamento */}
                {activeSection === 'folha' && (
                    <div className="space-y-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Holerites Disponíveis</p>
                        {folhaRuns.length === 0 ? (
                            <div className="text-center py-10">
                                <DollarSign className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-sm text-slate-400">Nenhum holerite disponível</p>
                            </div>
                        ) : (
                            folhaRuns.map(run => {
                                const typeLabel =
                                    run.type === 'mensal' ? 'Folha Mensal' :
                                    run.type === 'ferias' ? 'Férias' :
                                    run.type === 'decimo_terceiro' ? '13º Salário' :
                                    run.type === 'rescisao' ? 'Rescisão' : run.type;
                                const [y, m] = run.start_date.split('-');
                                const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                                const periodLabel = `${months[parseInt(m) - 1]}/${y}`;
                                return (
                                    <button
                                        key={run.id}
                                        onClick={() => setPaystubOpen({ runId: run.id })}
                                        className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                                                <DollarSign className="w-4 h-4 text-indigo-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{typeLabel}</p>
                                                <p className="text-xs text-slate-400">{periodLabel}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-emerald-700">
                                                {(run.net ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                            <p className="text-[10px] text-slate-400">líquido</p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Treinamentos */}
                {activeSection === 'treino' && (
                    <div className="space-y-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Meus Treinamentos</p>
                        {trainings.length === 0 ? (
                            <div className="text-center py-10">
                                <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-sm text-slate-400">Nenhum treinamento registrado</p>
                            </div>
                        ) : (
                            trainings.map(t => {
                                const today = new Date().toISOString().split('T')[0];
                                const expired = t.data_validade && t.data_validade < today;
                                const expiring = t.data_validade && !expired && t.data_validade <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                                return (
                                    <div key={t.id} className={`p-3 rounded-xl border ${expired ? 'border-rose-200 bg-rose-50' : expiring ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-800">{t.course_nome}</p>
                                                {t.nr_referencia && <p className="text-[10px] font-black text-rose-600">{t.nr_referencia}</p>}
                                                <p className="text-xs text-slate-400 mt-0.5">{t.data_realizacao}{t.data_validade ? ` → ${t.data_validade}` : ''}</p>
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${expired ? 'bg-rose-100 text-rose-700' : expiring ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {expired ? 'Vencido' : expiring ? 'Vencendo' : 'Válido'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── View: Gestão de Tokens (para o gestor de RH) ──────────────────────────────

interface PortalManagementProps {
    orgId: string;
    employees: Employee[];
}

const PortalManagement: React.FC<PortalManagementProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [previewEmployee, setPreviewEmployee] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const tokensKey = ['portal', 'tokens', orgId];

    const { data: tokens = [], isLoading } = useQuery<PortalToken[]>({
        queryKey: tokensKey,
        queryFn: () => atsService.listPortalTokens(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: tokensKey });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => atsService.revokePortalToken(id),
        onSuccess: invalidate,
    });

    const handleGenerate = async (emp: Employee) => {
        if (!orgId) {
            alert('Selecione uma organização antes de gerar o acesso.');
            return;
        }
        setGeneratingId(emp.id);
        try {
            const token = await atsService.generatePortalToken(emp.id, orgId);
            await navigator.clipboard.writeText(`${window.location.origin}/portal?token=${token}`);
            setCopiedToken(emp.id);
            setTimeout(() => setCopiedToken(null), 3000);
            invalidate();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setGeneratingId(null); }
    };

    const handleCopy = async (token: PortalToken) => {
        const url = `${window.location.origin}/portal?token=${token.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedToken(token.id);
        setTimeout(() => setCopiedToken(null), 3000);
    };

    const tokenByEmployee = new Map(tokens.map(t => [t.employee_id, t]));
    const activeEmployees = employees.filter(e =>
        e.status === 'ATIVO' &&
        (!search || e.name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Info */}
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                <Smartphone className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-black text-indigo-900">Portal do Colaborador</p>
                    <p className="text-[11px] text-indigo-700 mt-1">
                        Gere um link seguro para cada colaborador acessar seu portal via celular.
                        O link expira em 30 dias. Não é necessário criar conta — basta o link.
                    </p>
                </div>
            </div>

            {/* Preview do Portal */}
            {previewEmployee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-sm h-[700px] overflow-hidden relative">
                        <button onClick={() => setPreviewEmployee(null)} className="absolute top-3 right-3 z-10 p-2 bg-white/80 hover:bg-white rounded-xl shadow">
                            <X className="w-4 h-4 text-slate-600" />
                        </button>
                        <div className="h-full overflow-y-auto">
                            <PortalView employeeId={previewEmployee} orgId={orgId} onLogout={() => setPreviewEmployee(null)} />
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 justify-between">
                <p className="text-sm font-black text-slate-700">{activeEmployees.length} colaboradores ativos</p>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-44" />
                </div>
            </div>

            {/* Lista */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {isLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                : activeEmployees.length === 0 ? (
                    <div className="text-center py-16">
                        <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-black text-slate-400">Nenhum colaborador ativo</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {activeEmployees.map(emp => {
                            const tok = tokenByEmployee.get(emp.id);
                            const isExpired = tok && tok.expires_at < new Date().toISOString();
                            const copied = copiedToken === tok?.id || copiedToken === emp.id;
                            const generating = generatingId === emp.id;

                            return (
                                <div key={emp.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50">
                                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-black text-indigo-600 shrink-0">
                                        {emp.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                                        <p className="text-xs text-slate-400">{emp.role}</p>
                                    </div>
                                    {tok && tok.is_active && !isExpired ? (
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                Ativo
                                                {tok.last_used_at && <span className="text-slate-400 ml-1">· Último acesso {tok.last_used_at.split('T')[0]}</span>}
                                            </div>
                                            <button onClick={() => setPreviewEmployee(emp.id)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors" title="Prévia do portal">
                                                <Smartphone className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleCopy(tok)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copied ? 'Copiado!' : 'Copiar link'}
                                            </button>
                                            <button onClick={() => handleGenerate(emp)} disabled={generating} className="p-1.5 hover:bg-amber-50 rounded-lg text-slate-300 hover:text-amber-500 transition-colors" title="Regenerar token">
                                                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            </button>
                                            <button onClick={() => { if (confirm('Revogar acesso ao portal?')) revokeMutation.mutate(tok.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleGenerate(emp)}
                                            disabled={generating}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${generating ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'}`}
                                        >
                                            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                            {generating ? 'Gerando...' : (isExpired ? 'Renovar' : 'Gerar acesso')}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Componente principal (seletor de view) ────────────────────────────────────

interface LaborPortalProps {
    orgId: string;
    employees: Employee[];
}

const LaborPortal: React.FC<LaborPortalProps> = ({ orgId, employees }) => {
    const [tokenParam] = useState(() => new URLSearchParams(window.location.search).get('portal_token'));
    const [portalSession, setPortalSession] = useState<{ employeeId: string; orgId: string } | null>(null);
    const [view, setView] = useState<'management' | 'portal'>('management');

    return (
        <div className="h-full">
            {portalSession ? (
                <PortalView
                    employeeId={portalSession.employeeId}
                    orgId={portalSession.orgId}
                    onLogout={() => setPortalSession(null)}
                />
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
                        <button onClick={() => setView('management')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'management' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                            <Key className="w-3.5 h-3.5" /> Gestão de Acessos
                        </button>
                        <button onClick={() => setView('portal')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'portal' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                            <Smartphone className="w-3.5 h-3.5" /> Prévia do Portal
                        </button>
                    </div>

                    {view === 'management' && (
                        <PortalManagement orgId={orgId} employees={employees} />
                    )}

                    {view === 'portal' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="p-4 bg-slate-50 rounded-3xl border border-slate-200 w-full max-w-sm">
                                <p className="text-sm font-black text-slate-700 mb-3 text-center">Simular Portal como Colaborador</p>
                                <select
                                    onChange={e => e.target.value && setPortalSession({ employeeId: e.target.value, orgId })}
                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                                >
                                    <option value="">Selecione um colaborador...</option>
                                    {employees.filter(e => e.status === 'ATIVO').map(e => (
                                        <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LaborPortal;
