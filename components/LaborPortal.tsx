import React, { useState, useEffect, useMemo } from 'react';
import {
    User, Clock, Umbrella, BookOpen, FileText, DollarSign,
    LogOut, Loader2, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight,
    Calendar, Shield, QrCode, Copy, X, Plus, RefreshCw,
    Smartphone, Key, ChevronDown
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { atsService, PortalToken, PortalEmployeeSummary } from '../services/atsService';
import { laborService, Employee } from '../services/laborService';
import { PayrollRun } from '../services/payrollService';
import { supabase } from '../lib/supabase';
import PaystubModal from './PaystubModal';
import { STALE } from '../lib/queryClient';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import { chavePorNome, chavePorRotulo } from '../utils/agruparLinhas';
import TabsBar from './ui/TabsBar';
import AcademyPlayerView from './academy/AcademyPlayerView';
import { createPortalChannel } from './academy/academyChannel';
import { academyPortalService } from '../services/academyPortalService';
import { academyKeys } from '../lib/queryKeys';
import type { AcademyPortalEnrollment } from '../types/academy';

/**
 * Leitura do portal. Duas variantes da MESMA consulta, escolhidas pela presença
 * do token:
 *
 *   com token  → `fn_colab_portal_*(p_token)`  — acesso externo, sessão anon.
 *                O recorte vem do token, que é secreto, expira e é revogável.
 *   sem token  → `portal_get_*(p_employee_id)` — só o caminho interno, onde há
 *                sessão autenticada (admin simulando o portal pelo módulo RH).
 *
 * Por que isso existe: até 2026-09-02 TODAS as chamadas iam por `p_employee_id`,
 * e as RPCs eram executáveis por `anon` — bastava o UUID do colaborador para ler
 * folha de pagamento de qualquer um. Achado C3-02 da auditoria; um UUID não é
 * credencial: não expira, não se revoga e é enumerável.
 */
type PortalLeitura = 'time_entries' | 'absences' | 'trainings' | 'ged_documents' | 'payroll_runs';

async function portalRpc<T>(
    leitura: PortalLeitura,
    employeeId: string,
    portalToken?: string,
): Promise<T[]> {
    const { data, error } = portalToken
        ? await supabase.rpc(`fn_colab_portal_${leitura}`, { p_token: portalToken })
        : await supabase.rpc(`portal_get_${leitura}`, { p_employee_id: employeeId });
    if (error) throw error;
    return (data as T[]) ?? [];
}

// ── View: Portal do Colaborador (tela que o funcionário vê no celular) ────────

interface PortalViewProps {
    employeeId: string;
    orgId: string | null;
    onLogout: () => void;
    /**
     * Token do link do portal. Presente só no acesso externo (`/portal?token=`).
     * É o que habilita a Academia: todos os RPCs de treinamento recortam pelo
     * token, nunca por employee_id cru.
     */
    portalToken?: string;
}

export const PortalView: React.FC<PortalViewProps> = ({ employeeId, orgId, onLogout, portalToken }) => {
    const [activeSection, setActiveSection] = useState<'home' | 'ponto' | 'ferias' | 'docs' | 'treino' | 'folha'>('home');
    const [paystubOpen, setPaystubOpen] = useState<{ runId: string } | null>(null);
    // Matrícula aberta na Academia — troca o conteúdo do portal pela sala de aula.
    const [academiaAberta, setAcademiaAberta] = useState<AcademyPortalEnrollment | null>(null);

    const portalChannel = React.useMemo(
        () => portalToken ? createPortalChannel(portalToken) : null,
        [portalToken]
    );

    const {
        data: academia = [], isLoading: academiaCarregando, error: academiaErro,
    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    } = useQuery({
        queryKey: portalToken ? academyKeys.portalEnrollments(portalToken) : ['portal', 'academy', 'none'],
        queryFn: () => academyPortalService.listEnrollments(portalToken!),
        staleTime: STALE.fast,
        enabled: !!portalToken && activeSection === 'treino',
    });

    const summaryKey = ['portal', 'summary', portalToken ?? employeeId];
    const { data: summary, isLoading } = useQuery<PortalEmployeeSummary>({
        queryKey: summaryKey,
        queryFn: () => atsService.getPortalSummary(employeeId, portalToken),
        staleTime: STALE.fast,
    });

    const { data: recentEntries = [] } = useQuery({
        queryKey: ['portal', 'timeEntries', portalToken ?? employeeId],
        queryFn: () => portalRpc<any>('time_entries', employeeId, portalToken),
        staleTime: STALE.fast,
        enabled: activeSection === 'ponto',
    });

    const { data: absences = [] } = useQuery({
        queryKey: ['portal', 'absences', portalToken ?? employeeId],
        queryFn: () => portalRpc<any>('absences', employeeId, portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'ferias',
    });

    const { data: trainings = [] } = useQuery({
        queryKey: ['portal', 'trainings', portalToken ?? employeeId],
        queryFn: () => portalRpc<any>('trainings', employeeId, portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'treino',
    });

    // GED (opura_documents) é a fonte única da aba Documentos — substitui o antigo
    // employee_documents; só aparece aqui o que foi compartilhado via botão
    // "Compartilhar" do módulo Gestão de Documentos (ver migration 20270821000010).
    const { data: documents = [] } = useQuery({
        queryKey: ['portal', 'docs', portalToken ?? employeeId],
        queryFn: () => portalRpc<any>('ged_documents', employeeId, portalToken),
        staleTime: STALE.normal,
        enabled: activeSection === 'docs',
    });

    const handleDownloadDoc = async (storagePath?: string) => {
        if (!storagePath) return;
        try {
            const { data, error } = await supabase.functions.invoke('labor-portal-ged-download', {
                body: portalToken ? { token: portalToken, storagePath } : { employeeId, storagePath },
            });
            if (error) throw error;
            if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de download.');
            window.open(data.signedUrl, '_blank');
        } catch (err: any) {
            console.error('[LaborPortal] Erro ao baixar documento:', err);
            alert(err.message || 'Erro ao baixar o documento.');
        }
    };

    const { data: folhaRuns = [] } = useQuery<Array<PayrollRun & { net: number }>>({
        queryKey: ['portal', 'folha', portalToken ?? employeeId],
        queryFn: () => portalRpc<PayrollRun & { net: number }>('payroll_runs', employeeId, portalToken),
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

    // Sala de aula da Academia — troca o conteúdo do portal (não é overlay).
    // Mesmo componente do app logado; só o canal muda.
    if (academiaAberta && portalChannel) {
        return (
            <div className="max-w-md mx-auto h-full overflow-y-auto bg-white p-4">
                <AcademyPlayerView
                    enrollmentId={academiaAberta.id}
                    titulo={academiaAberta.curso}
                    subtitulo={academiaAberta.nr_referencia}
                    channel={portalChannel}
                    compacto
                    onVoltar={() => setAcademiaAberta(null)}
                />
            </div>
        );
    }

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
                                <span className="text-xs font-black text-white/60 uppercase tracking-widest">{label}</span>
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
                        className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeSection === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>
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
                            <Button variant="secondary" onClick={() => setActiveSection('ponto')} className="p-4 rounded-2xl flex flex-col items-center gap-2 h-auto normal-case tracking-normal">
                                <Clock className="w-6 h-6 text-indigo-500" />
                                <span className="text-xs font-black text-slate-700">Meu Ponto</span>
                            </Button>
                            <Button variant="secondary" onClick={() => setActiveSection('ferias')} className="p-4 rounded-2xl flex flex-col items-center gap-2 h-auto normal-case tracking-normal">
                                <Umbrella className="w-6 h-6 text-blue-500" />
                                <span className="text-xs font-black text-slate-700">Férias</span>
                            </Button>
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
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${e.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : e.status === 'REJEITADO' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
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
                                        <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${a.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : a.status === 'REJEITADO' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
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
                                const expired = d.data_validade && d.data_validade < today;
                                return (
                                    <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border ${expired ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}>
                                        <FileText className={`w-4 h-4 shrink-0 ${expired ? 'text-rose-500' : 'text-indigo-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{d.nome}</p>
                                            <p className="text-xs text-slate-400">{d.categoria}{d.data_validade ? ` · vence ${d.data_validade}` : ''}</p>
                                        </div>
                                        {expired && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                                        {d.storage_path && (
                                            <ActionIconButton kind="download" size="sm" className="shrink-0" onClick={() => handleDownloadDoc(d.storage_path)} />
                                        )}
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
                                    <Button
                                        key={run.id}
                                        variant="secondary"
                                        onClick={() => setPaystubOpen({ runId: run.id })}
                                        className="w-full flex items-center justify-between p-3 rounded-xl hover:border-indigo-100 text-left h-auto normal-case tracking-normal"
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
                                            <p className="text-xs text-slate-400">líquido</p>
                                        </div>
                                    </Button>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Treinamentos */}
                {activeSection === 'treino' && (
                    <div className="space-y-3">
                        {/* Academia — treinamentos A FAZER (conteúdo EAD). Fica antes
                            da evidência porque é o que exige ação do colaborador. */}
                        {portalChannel && (
                            <div className="space-y-3 pb-2">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Academia ÒPURA</p>

                                {/* Estes três estados existiam e eram invisíveis: a seção
                                    inteira sumia quando a lista vinha vazia OU quando a
                                    chamada falhava, e o colaborador só via "nenhum
                                    treinamento registrado" logo abaixo. */}
                                {academiaCarregando && (
                                    <div className="flex items-center gap-2 py-4">
                                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                        <span className="text-sm text-slate-400">Carregando treinamentos...</span>
                                    </div>
                                )}

                                {!academiaCarregando && academiaErro && (
                                    <div className="p-3 rounded-xl border border-rose-200 bg-rose-50">
                                        <p className="text-sm font-bold text-rose-800">
                                            Não foi possível carregar seus treinamentos
                                        </p>
                                        <p className="text-xs text-rose-600 mt-1">
                                            {(academiaErro as Error)?.message || 'Tente abrir o link novamente.'}
                                        </p>
                                    </div>
                                )}

                                {!academiaCarregando && !academiaErro && academia.length === 0 && (
                                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                                        <p className="text-sm text-slate-500">
                                            Nenhum treinamento atribuído a você no momento.
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Se você esperava algum, confirme com o RH se a atribuição
                                            foi feita para o seu cadastro.
                                        </p>
                                    </div>
                                )}

                                {academia.map(m => {
                                    const concluido = m.status === 'CONCLUIDO';
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => setAcademiaAberta(m)}
                                            className={`w-full text-left p-3 rounded-xl border transition-colors ${
                                                concluido ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{m.curso}</p>
                                                    {m.nr_referencia && (
                                                        <p className="text-xs font-black text-rose-600">{m.nr_referencia}</p>
                                                    )}
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        v{m.versao}
                                                        {m.data_limite ? ` · prazo ${m.data_limite.split('-').reverse().join('/')}` : ''}
                                                    </p>
                                                </div>
                                                <span className="text-xs font-black text-slate-500 shrink-0">
                                                    {Math.round(m.percentual)}%
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mt-2">
                                                <div
                                                    className={`h-full ${concluido ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                    style={{ width: `${Math.min(100, m.percentual)}%` }}
                                                />
                                            </div>
                                            <p className="text-xs font-bold text-indigo-700 mt-2">
                                                {concluido ? 'Ver certificado' : m.status === 'NAO_INICIADO' ? 'Começar' : 'Continuar'}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

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
                                                {t.nr_referencia && <p className="text-xs font-black text-rose-600">{t.nr_referencia}</p>}
                                                <p className="text-xs text-slate-400 mt-0.5">{t.data_realizacao}{t.data_validade ? ` → ${t.data_validade}` : ''}</p>
                                            </div>
                                            <span className={`text-xs font-black px-2 py-0.5 rounded-full shrink-0 ${expired ? 'bg-rose-100 text-rose-700' : expiring ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
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

type SituacaoAcesso = 'ativo' | 'expirado' | 'sem_acesso';
const SITUACAO_LABEL: Record<SituacaoAcesso, string> = { ativo: 'Ativo', expirado: 'Expirado', sem_acesso: 'Sem acesso' };
const SITUACAO_COR: Record<SituacaoAcesso, string> = { ativo: 'text-emerald-700', expirado: 'text-amber-700', sem_acesso: 'text-gray-500' };

/** Uma linha por colaborador ativo; `tok` é o link dele, se já gerou algum. */
interface LinhaAcesso { emp: Employee; tok?: PortalToken; situacao: SituacaoAcesso }

const ACESSOS_COLUMNS: StandardTableColumn[] = [
    { key: 'name',         label: 'Colaborador',   sortable: true, width: 240 },
    { key: 'role',         label: 'Cargo',         sortable: true, width: 200 },
    { key: 'situacao',     label: 'Situação',      sortable: true, width: 150 },
    { key: 'expires_at',   label: 'Expira em',     sortable: true, width: 160 },
    { key: 'last_used_at', label: 'Último acesso', sortable: true, width: 180 },
];

// "Agrupar" dos acessos (guia de UI §6.12). Chave = o MESMO texto que a célula mostra.
// Constante de módulo: o StandardTable memoiza os grupos pela identidade deste objeto.
const SEM_GRUPO_ACESSO: Record<string, string> = { situacao: 'Sem situação', role: 'Sem cargo' };
const AGRUPAR_ACESSOS = {
    opcoes: [
        { value: 'situacao', label: 'Situação' },
        { value: 'role', label: 'Cargo' },
    ],
    chave: (campo: string, l: LinhaAcesso) => {
        switch (campo) {
            case 'situacao': return chavePorRotulo(l.situacao, SITUACAO_LABEL);
            case 'role': return chavePorNome(l.emp.role);
            default: return null;
        }
    },
    semRotulo: (campo: string) => SEM_GRUPO_ACESSO[campo] ?? 'Sem valor',
    // Situação na ordem do fluxo (ativo → expirado → sem acesso); cargo, alfabética.
    ordem: (campo: string): 'rotulo' | string[] => (campo === 'situacao' ? Object.keys(SITUACAO_LABEL) : 'rotulo'),
    title: 'Agrupar os colaboradores',
};

const fmtDataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;

interface PortalManagementProps {
    orgId: string | null;
    employees: Employee[];
}

const PortalManagement: React.FC<PortalManagementProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    // Guarda o token junto: sem ele as queries da Academia ficam desabilitadas
    // (`enabled: !!portalToken`) e a prévia mostraria a seção vazia, dando a
    // impressão de que o colaborador não tem treinamento nenhum.
    const [previewEmployee, setPreviewEmployee] = useState<{ id: string; token: string } | null>(null);
    // Toast §13
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const tokensKey = ['portal', 'tokens', orgId];

    const { data: tokens = [], isLoading } = useQuery<PortalToken[]>({
        queryKey: tokensKey,
        queryFn: () => atsService.listPortalTokens(orgId),
        staleTime: STALE.normal,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: tokensKey });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => atsService.revokePortalToken(id),
        onSuccess: () => { invalidate(); notify('Acesso revogado.'); },
        onError: (e: Error) => notify(e.message || 'Não foi possível revogar o acesso.', 'error'),
    });

    const handleGenerate = async (emp: Employee) => {
        if (!orgId) {
            notify('Selecione uma organização no topo antes de gerar o acesso.', 'error');
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
            notify(err?.message || 'Não foi possível gerar o acesso.', 'error');
        } finally { setGeneratingId(null); }
    };

    const handleCopy = async (token: PortalToken) => {
        const url = `${window.location.origin}/portal?token=${token.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedToken(token.id);
        setTimeout(() => setCopiedToken(null), 3000);
    };

    // `useMemo`: o StandardTable zera a página/agrupamento pela identidade de `rows`.
    const linhas = useMemo<LinhaAcesso[]>(() => {
        const tokenByEmployee = new Map(tokens.map(t => [t.employee_id, t]));
        const agora = new Date().toISOString();
        return employees.filter(e => e.status === 'ATIVO').map(emp => {
            const tok = tokenByEmployee.get(emp.id);
            const expirado = !!tok && tok.expires_at < agora;
            const situacao: SituacaoAcesso = tok && tok.is_active && !expirado ? 'ativo' : expirado ? 'expirado' : 'sem_acesso';
            return { emp, tok, situacao };
        });
    }, [employees, tokens]);

    const semOrg = !orgId;

    return (
        <>
            {/* Preview do Portal */}
            {previewEmployee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-sm h-[700px] overflow-hidden relative">
                        <button onClick={() => setPreviewEmployee(null)} className="absolute top-3 right-3 z-10 p-2 bg-white/80 hover:bg-white rounded-xl shadow">
                            <X className="w-4 h-4 text-slate-600" />
                        </button>
                        <div className="h-full overflow-y-auto">
                            <PortalView employeeId={previewEmployee.id} orgId={orgId} portalToken={previewEmployee.token} onLogout={() => setPreviewEmployee(null)} />
                        </div>
                    </div>
                </div>
            )}

            <StandardTable<LinhaAcesso>
                storageKey="rh:portal-colaborador:acessos"
                columns={ACESSOS_COLUMNS}
                rows={linhas}
                rowKey={l => l.emp.id}
                loading={isLoading}
                searchText={l => `${l.emp.name} ${l.emp.role ?? ''}`}
                searchPlaceholder="Buscar por colaborador ou cargo..."
                agrupamento={AGRUPAR_ACESSOS}
                sortValue={(k, l) => {
                    switch (k) {
                        case 'name': return l.emp.name;
                        case 'role': return l.emp.role ?? '';
                        case 'situacao': return SITUACAO_LABEL[l.situacao];
                        case 'expires_at': return l.tok?.expires_at ?? '';
                        case 'last_used_at': return l.tok?.last_used_at ?? '';
                        default: return '';
                    }
                }}
                renderCell={(k, l) => {
                    switch (k) {
                        case 'name': return <span className="block truncate text-sm font-normal text-gray-700" title={l.emp.name}>{l.emp.name}</span>;
                        case 'role': return <span className="block truncate text-sm font-normal text-gray-600" title={l.emp.role}>{l.emp.role || '—'}</span>;
                        case 'situacao': return <span className={`text-sm font-normal ${SITUACAO_COR[l.situacao]}`}>{SITUACAO_LABEL[l.situacao]}</span>;
                        case 'expires_at': return <span className="text-sm font-normal text-gray-600">{l.tok ? fmtDataHora(l.tok.expires_at) : '—'}</span>;
                        case 'last_used_at': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(l.tok?.last_used_at) ?? (l.tok ? <span className="text-gray-400">Nunca</span> : '—')}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 260,
                    render: ({ emp, tok, situacao }) => {
                        const generating = generatingId === emp.id;
                        if (tok && situacao === 'ativo') {
                            const copied = copiedToken === tok.id || copiedToken === emp.id;
                            return (
                                <div className="flex items-center justify-end gap-1.5">
                                    <ActionIconButton kind="view" icon={<Smartphone className="w-4 h-4" />} title="Prévia do portal — ver como este colaborador"
                                        onClick={() => setPreviewEmployee({ id: emp.id, token: tok.token })} />
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(tok)}
                                        className="flex items-center gap-1 h-8 px-2 rounded-[6px] text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-all"
                                    >
                                        {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copiado!' : 'Copiar link'}
                                    </button>
                                    <ActionIconButton kind="edit" icon={generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        title={semOrg ? 'Selecione uma organização no topo para regenerar o link' : 'Regenerar link — o anterior deixa de valer'}
                                        disabled={generating || semOrg} onClick={() => handleGenerate(emp)} />
                                    <ActionIconButton kind="delete" title="Revogar acesso ao portal" onClick={async () => {
                                        const ok = await confirm({ title: 'Revogar acesso ao portal?', message: 'O colaborador perderá o acesso até que um novo link seja gerado.', variant: 'danger', confirmLabel: 'Revogar' });
                                        if (ok) revokeMutation.mutate(tok.id);
                                    }} />
                                </div>
                            );
                        }
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleGenerate(emp)}
                                    disabled={generating || semOrg}
                                    title={semOrg ? 'Selecione uma organização no topo para gerar o acesso' : undefined}
                                    className="flex items-center gap-1.5 h-8 px-2 rounded-[6px] text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                    {generating ? 'Gerando...' : (situacao === 'expirado' ? 'Renovar' : 'Gerar acesso')}
                                </button>
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum colaborador ativo',
                    subtitle: 'Cadastre colaboradores em Recursos Humanos para gerar o acesso ao portal.',
                }}
            />

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </>
    );
};

// ── Componente principal (seletor de view) ────────────────────────────────────

interface LaborPortalProps {
    orgId: string | null;
    employees: Employee[];
    organizations?: Array<{ id: string; name: string }>;
    onRefresh?: () => void;
}

// Título e subtítulo acompanham a aba ativa (§19.1/§20) — aba que troca o conteúdo
// inteiro sem trocar o <h1> deixa o título mentindo.
type LaborPortalView = 'management' | 'portal';
const VIEW_HEADERS: Record<LaborPortalView, { title: string; subtitle: string }> = {
    management: {
        title: 'Portal do Colaborador',
        subtitle: 'Link self-service para ponto, férias, documentos e holerite pelo celular. O link expira em 30 dias e não exige conta.',
    },
    portal: {
        title: 'Prévia do portal',
        subtitle: 'Veja o portal como um colaborador o vê no celular.',
    },
};

const LaborPortal: React.FC<LaborPortalProps> = ({ orgId, employees, organizations = [], onRefresh }) => {
    const initialTokenParam = new URLSearchParams(window.location.search).get('portal_token');
    const [tokenParam] = useState(initialTokenParam);
    const [portalSession, setPortalSession] = useState<{ employeeId: string; orgId: string | null } | null>(null);
    const [view, setView] = useState<LaborPortalView>('management');

    return (
        <div className="h-full">
            {portalSession ? (
                <PortalView
                    employeeId={portalSession.employeeId}
                    orgId={portalSession.orgId}
                    onLogout={() => setPortalSession(null)}
                />
            ) : (
                <div className="space-y-6">
                    {/* 1. Título */}
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[view].title}</h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[view].subtitle}</p>
                    </div>

                    {/* Toolbar de abas (§19.1) */}
                    <TabsBar
                        tabs={[
                            { id: 'management', label: 'Gestão de Acessos', icon: <Key className="w-4 h-4" /> },
                            { id: 'portal', label: 'Prévia do Portal', icon: <Smartphone className="w-4 h-4" /> },
                        ]}
                        value={view}
                        onChange={setView}
                    />

                    {view === 'management' && (
                        <PortalManagement orgId={orgId} employees={employees} />
                    )}

                    {view === 'portal' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="p-4 bg-white rounded-[10px] border border-gray-100 shadow-sm w-full max-w-sm space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500">Simular portal como colaborador</label>
                                <select
                                    onChange={e => e.target.value && setPortalSession({ employeeId: e.target.value, orgId })}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
