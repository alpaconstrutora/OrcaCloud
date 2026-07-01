import React, { useEffect, useState, useCallback } from 'react';
import {
    Mail, Plus, Power, Trash2, Send, Loader2, Clock,
    CheckCircle, AlertCircle, Download, X, Calendar,
} from 'lucide-react';
import Button from './ui/Button';
import { biReportService, BIReportSchedule, NewSchedule, ReportFrequency } from '../services/biReportService';
import type { BIExecutiveSummary } from '../types/bi';

interface Props {
    orgId: string;
    organizationName: string;
    summary: BIExecutiveSummary | null;
    dateFrom: string;
    dateTo: string;
    narrative?: string | null;
}

const FREQ_LABEL: Record<ReportFrequency, string> = {
    daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal',
};
const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const emptySchedule = (orgId: string): NewSchedule => ({
    org_id: orgId,
    name: 'Relatório Executivo Semanal',
    frequency: 'weekly',
    day_of_week: 1,
    day_of_month: 1,
    hour_utc: 7,
    recipients: [],
    include_dre: true,
    include_trend: true,
    include_narrative: true,
    active: true,
});

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

const BIReportScheduler: React.FC<Props> = ({
    orgId, organizationName, summary, dateFrom, dateTo, narrative,
}) => {
    const [schedules, setSchedules]   = useState<BIReportSchedule[]>([]);
    const [loading, setLoading]       = useState(true);
    const [editing, setEditing]       = useState<(NewSchedule & { id?: string }) | null>(null);
    const [busy, setBusy]             = useState<string | null>(null);
    const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);
    const [emailInput, setEmailInput] = useState('');

    const notify = (text: string, ok: boolean) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 4000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try { setSchedules(await biReportService.listSchedules(orgId)); }
        catch { /* ignore */ }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.recipients.length) { notify('Adicione pelo menos um destinatário.', false); return; }
        setBusy('save');
        try {
            await biReportService.saveSchedule(editing);
            setEditing(null);
            load();
            notify('Agendamento salvo.', true);
        } catch (e) { notify((e as Error).message, false); }
        finally { setBusy(null); }
    };

    const handleToggle = async (s: BIReportSchedule) => {
        setBusy(s.id);
        try { await biReportService.toggleSchedule(s.id, !s.active); load(); }
        catch (e) { notify((e as Error).message, false); }
        finally { setBusy(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este agendamento?')) return;
        setBusy(id);
        try { await biReportService.deleteSchedule(id); load(); notify('Agendamento excluído.', true); }
        catch (e) { notify((e as Error).message, false); }
        finally { setBusy(null); }
    };

    const handleSendNow = async (s?: BIReportSchedule) => {
        if (!summary) { notify('Carregue os dados do BI antes de enviar.', false); return; }
        const recipients = s?.recipients ?? (editing?.recipients ?? []);
        if (!recipients.length) { notify('Nenhum destinatário.', false); return; }
        const id = s?.id ?? 'manual';
        setBusy(id);
        try {
            const htmlBody = biReportService.generateReportHtml(summary, dateFrom, dateTo, organizationName, narrative ?? undefined);
            await biReportService.sendNow({
                recipients,
                subject: `Relatório Executivo — ${organizationName} — ${new Date().toLocaleDateString('pt-BR')}`,
                htmlBody,
                scheduleId: s?.id ?? null,
                organizationId: orgId,
            });
            notify(`Relatório enviado para ${recipients.length} destinatário(s).`, true);
            load();
        } catch (e) { notify((e as Error).message, false); }
        finally { setBusy(null); }
    };

    const handleDownload = () => {
        if (!summary) return;
        const html = biReportService.generateReportHtml(summary, dateFrom, dateTo, organizationName, narrative ?? undefined);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-bi-${organizationName.toLowerCase().replace(/\s+/g, '-')}-${dateFrom}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const addEmail = () => {
        if (!editing) return;
        const email = emailInput.trim().toLowerCase();
        if (!email || !email.includes('@')) return;
        if (editing.recipients.includes(email)) return;
        setEditing({ ...editing, recipients: [...editing.recipients, email] });
        setEmailInput('');
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                        <Mail className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white">Agendamento de Relatórios</h3>
                </div>
                <div className="flex items-center gap-2">
                    {summary && (
                        <Button variant="secondary" size="sm" onClick={handleDownload}>
                            <Download size={12} /> Baixar HTML
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={() => setEditing(emptySchedule(orgId))}>
                        <Plus size={12} /> Novo Agendamento
                    </Button>
                </div>
            </div>

            {/* Mensagem */}
            {msg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {msg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {msg.text}
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>
            ) : schedules.length === 0 && !editing ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 py-12 text-center">
                    <Calendar size={28} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-sm text-gray-400">Nenhum agendamento. Crie o primeiro.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {schedules.map(s => (
                        <div key={s.id} className={`bg-white dark:bg-gray-800 rounded-xl border ${s.active ? 'border-gray-100 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700 opacity-60'} p-4 flex items-center gap-3`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${s.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{s.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {FREQ_LABEL[s.frequency]}
                                    {s.frequency === 'weekly' && s.day_of_week != null ? ` — ${DOW_LABEL[s.day_of_week]}s` : ''}
                                    {s.frequency === 'monthly' && s.day_of_month ? ` — dia ${s.day_of_month}` : ''}
                                    {' às '}{s.hour_utc}h UTC
                                    {' · '}{s.recipients.length} destinatário(s)
                                </p>
                                {s.last_sent_at && (
                                    <p className="text-xs text-gray-300 flex items-center gap-1 mt-0.5">
                                        <Clock size={10} /> Último envio: {new Date(s.last_sent_at).toLocaleDateString('pt-BR')}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    disabled={busy === s.id || !summary}
                                    onClick={() => handleSendNow(s)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                                    title="Enviar agora">
                                    {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                </button>
                                <button
                                    disabled={busy === s.id}
                                    onClick={() => handleToggle(s)}
                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40"
                                    title={s.active ? 'Pausar' : 'Ativar'}>
                                    <Power size={14} />
                                </button>
                                <button
                                    disabled={busy === s.id}
                                    onClick={() => setEditing({ ...s })}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40"
                                    title="Editar">
                                    <Calendar size={14} />
                                </button>
                                <button
                                    disabled={busy === s.id}
                                    onClick={() => handleDelete(s.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                    title="Excluir">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal editor */}
            {editing && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)} />
                    <div className="relative bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-gray-900 dark:text-white">
                                {editing.id ? 'Editar Agendamento' : 'Novo Agendamento'}
                            </h3>
                            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={18} />
                            </button>
                        </div>

                        <div>
                            <label className={labelCls}>Nome</label>
                            <input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Frequência</label>
                                <select className={inputCls} value={editing.frequency}
                                    onChange={e => setEditing({ ...editing, frequency: e.target.value as ReportFrequency })}>
                                    <option value="daily">Diário</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensal</option>
                                </select>
                            </div>
                            {editing.frequency === 'weekly' && (
                                <div>
                                    <label className={labelCls}>Dia da semana</label>
                                    <select className={inputCls} value={editing.day_of_week ?? 1}
                                        onChange={e => setEditing({ ...editing, day_of_week: Number(e.target.value) })}>
                                        {DOW_LABEL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                    </select>
                                </div>
                            )}
                            {editing.frequency === 'monthly' && (
                                <div>
                                    <label className={labelCls}>Dia do mês</label>
                                    <input type="number" min={1} max={28} className={inputCls}
                                        value={editing.day_of_month ?? 1}
                                        onChange={e => setEditing({ ...editing, day_of_month: Number(e.target.value) })} />
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Hora (UTC)</label>
                                <input type="number" min={0} max={23} className={inputCls}
                                    value={editing.hour_utc}
                                    onChange={e => setEditing({ ...editing, hour_utc: Number(e.target.value) })} />
                                <p className="text-xs text-gray-400 mt-1">7 UTC = ~4h–8h BRT</p>
                            </div>
                        </div>

                        {/* Destinatários */}
                        <div>
                            <label className={labelCls}>Destinatários</label>
                            <div className="flex gap-2">
                                <input className={inputCls} type="email" placeholder="email@empresa.com"
                                    value={emailInput} onChange={e => setEmailInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }} />
                                <Button onClick={addEmail} size="sm" className="shrink-0">
                                    <Plus size={14} />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {editing.recipients.map(r => (
                                    <span key={r} className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium">
                                        {r}
                                        <button onClick={() => setEditing({ ...editing, recipients: editing.recipients.filter(x => x !== r) })}
                                            className="text-blue-400 hover:text-red-500 ml-0.5">
                                            <X size={11} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Seções */}
                        <div>
                            <label className={labelCls}>Incluir no relatório</label>
                            <div className="space-y-1">
                                {([
                                    ['include_dre',       'DRE Consolidada'],
                                    ['include_trend',     'Tendência (gráfico 6 meses)'],
                                    ['include_narrative', 'Resumo executivo IA'],
                                ] as [keyof NewSchedule, string][]).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={!!editing[key]}
                                            onChange={e => setEditing({ ...editing, [key]: e.target.checked })} />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <button onClick={() => editing.id && handleSendNow({ ...(editing as BIReportSchedule) })}
                                disabled={!summary || !editing.recipients.length || busy === 'manual'}
                                className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold hover:underline disabled:opacity-40">
                                {busy === 'manual' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Enviar agora
                            </button>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                                <Button onClick={handleSave} disabled={busy === 'save'}>
                                    {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null}
                                    Salvar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BIReportScheduler;
