import React, { useState, useEffect, useCallback } from 'react';
import {
    Bell,
    Settings,
    History,
    Plus,
    Trash2,
    Edit2,
    Play,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Loader2,
    ChevronDown,
    ChevronUp,
    X,
    RefreshCw,
    Mail,
    Clock,
} from 'lucide-react';
import { dunningService, DunningRule, DunningEvent, DUNNING_VARS } from '../services/dunningService';

// ── helpers ──────────────────────────────────────────────────

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const fmtOffset = (n: number) => {
    if (n < 0) return `${Math.abs(n)} dia${Math.abs(n) !== 1 ? 's' : ''} antes`;
    if (n === 0) return 'No dia do vencimento';
    return `${n} dia${n !== 1 ? 's' : ''} após`;
};

const STATUS_CFG = {
    sent:    { label: 'Enviado',  icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200' },
    failed:  { label: 'Falhou',   icon: XCircle,      cls: 'text-red-600   bg-red-50   border-red-200'   },
    skipped: { label: 'Pulado',   icon: AlertTriangle,cls: 'text-gray-500  bg-gray-50  border-gray-200'  },
};

function StatusBadge({ status }: { status: 'sent' | 'failed' | 'skipped' }) {
    const cfg = STATUS_CFG[status];
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            <Icon className="w-3 h-3" />
            {cfg.label}
        </span>
    );
}

// ── Rule Modal ────────────────────────────────────────────────

function RuleModal({
    rule,
    organizationId,
    onSave,
    onClose,
}: {
    rule: DunningRule | null;
    organizationId: string;
    onSave: () => void;
    onClose: () => void;
}) {
    const [form, setForm] = useState<DunningRule>(rule ?? {
        organization_id:  organizationId,
        name:             '',
        days_offset:      3,
        trigger_hour:     9,
        channel:          'email',
        subject_template: 'Lembrete: {{descricao}} — {{valor}}',
        body_template:    'Olá {{nome}},<br><br>Sua parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> vence em <strong>{{vencimento}}</strong>.<br><br>Att,<br>Equipe',
        is_active:        true,
        sort_order:       99,
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);
    const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');

    const patch = (p: Partial<DunningRule>) => setForm(f => ({ ...f, ...p }));

    const handleSave = async () => {
        if (!form.name.trim()) { setErr('Nome obrigatório.'); return; }
        setSaving(true);
        setErr(null);
        try {
            await dunningService.upsertRule(form);
            onSave();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    const insertVar = (field: 'subject_template' | 'body_template', v: string) => {
        patch({ [field]: (form[field] ?? '') + v });
    };

    const previewBody = form.body_template
        .replace(/{{nome}}/g, 'João Silva')
        .replace(/{{valor}}/g, 'R$ 5.000,00')
        .replace(/{{vencimento}}/g, '25/06/2026')
        .replace(/{{descricao}}/g, 'Parcela 3/6')
        .replace(/{{projeto}}/g, 'Residencial Alfa')
        .replace(/{{dias_atraso}}/g, String(Math.max(0, form.days_offset)));

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold text-gray-900">{rule ? 'Editar regra' : 'Nova regra'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" /> {err}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {/* Nome */}
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nome da regra *</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => patch({ name: e.target.value })}
                                placeholder="Ex: 1ª Cobrança — 7 dias atraso"
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        {/* Offset */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                Disparar em (dias do vencimento)
                            </label>
                            <input
                                type="number"
                                value={form.days_offset}
                                onChange={e => patch({ days_offset: parseInt(e.target.value) || 0 })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">{fmtOffset(form.days_offset)}</p>
                        </div>

                        {/* Hora */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Horário de envio (BRT)</label>
                            <select
                                value={form.trigger_hour}
                                onChange={e => patch({ trigger_hour: parseInt(e.target.value) })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                {[7, 8, 9, 10, 11, 12, 14, 16, 18].map(h => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>

                        {/* Ativo */}
                        <div className="col-span-2 flex items-center gap-3">
                            <button
                                onClick={() => patch({ is_active: !form.is_active })}
                                className={['w-10 h-5 rounded-full transition-colors relative shrink-0',
                                    form.is_active ? 'bg-blue-600' : 'bg-gray-300'].join(' ')}
                            >
                                <span className={['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                                    form.is_active ? 'translate-x-5' : 'translate-x-0.5'].join(' ')} />
                            </button>
                            <span className="text-xs text-gray-700">{form.is_active ? 'Ativa' : 'Inativa'}</span>
                        </div>
                    </div>

                    {/* Assunto */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Assunto do e-mail</label>
                        <input
                            type="text"
                            value={form.subject_template}
                            onChange={e => patch({ subject_template: e.target.value })}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {DUNNING_VARS.slice(0, 4).map(v => (
                                <button
                                    key={v.key}
                                    onClick={() => insertVar('subject_template', v.key)}
                                    className="text-[9px] bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-1.5 py-0.5 rounded font-mono"
                                >
                                    {v.key}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Corpo */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide">Corpo do e-mail (HTML)</label>
                            <div className="flex bg-gray-100 rounded-lg overflow-hidden">
                                {(['edit', 'preview'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setPreviewTab(tab)}
                                        className={['px-2.5 py-1 text-[10px] font-medium',
                                            previewTab === tab ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'].join(' ')}
                                    >
                                        {tab === 'edit' ? 'Editar' : 'Preview'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {previewTab === 'edit' ? (
                            <>
                                <textarea
                                    value={form.body_template}
                                    onChange={e => patch({ body_template: e.target.value })}
                                    rows={6}
                                    className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {DUNNING_VARS.map(v => (
                                        <button
                                            key={v.key}
                                            onClick={() => insertVar('body_template', v.key)}
                                            title={v.label}
                                            className="text-[9px] bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-1.5 py-0.5 rounded font-mono"
                                        >
                                            {v.key}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div
                                className="border border-gray-200 rounded-lg p-4 text-sm bg-gray-50 min-h-[120px] prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: previewBody }}
                            />
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Régua Tab ─────────────────────────────────────────────────

function ReguaTab({ organizationId }: { organizationId: string }) {
    const [rules, setRules]     = useState<DunningRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [editing, setEditing] = useState<DunningRule | null | 'new'>('new' as unknown as null);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);

    // reset editing to null after first load
    const [ready, setReady] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await dunningService.listRules(organizationId);
            setRules(data);
            if (!ready) { setReady(true); setEditing(null); }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar regras.');
        } finally {
            setLoading(false);
        }
    }, [organizationId, ready]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir esta regra?')) return;
        try {
            await dunningService.deleteRule(id);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao excluir.');
        }
    };

    const handleToggle = async (rule: DunningRule) => {
        try {
            await dunningService.upsertRule({ ...rule, is_active: !rule.is_active });
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro.');
        }
    };

    const handleRun = async () => {
        setRunning(true);
        setRunResult(null);
        try {
            const res = await dunningService.triggerManual(organizationId);
            setRunResult(`Enviados: ${res.totalSent} | Pulados: ${res.totalSkipped} | Falhas: ${res.totalFailed}`);
        } catch (e: unknown) {
            setRunResult(`Erro: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setRunning(false);
        }
    };

    const handleSeed = async () => {
        if (!window.confirm('Isso criará 6 regras padrão. Continuar?')) return;
        setSeeding(true);
        try {
            await dunningService.seedDefaults(organizationId);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao criar regras padrão.');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-sm font-bold text-gray-800">Régua de Cobrança</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Configure quando e como notificar clientes sobre vencimentos.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRun}
                        disabled={running}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                        title="Dispara a régua agora (ignora horário configurado)"
                    >
                        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Executar agora
                    </button>
                    <button
                        onClick={() => setEditing({} as DunningRule)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nova regra
                    </button>
                </div>
            </div>

            {/* Run result */}
            {runResult && (
                <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span>{runResult}</span>
                    <button onClick={() => setRunResult(null)}><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2">
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Carregando regras…</span>
                </div>
            )}

            {/* Empty state */}
            {!loading && rules.length === 0 && (
                <div className="text-center py-14 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <Bell className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-500">Nenhuma regra configurada</p>
                    <p className="text-xs text-gray-400 mt-1 mb-4">Crie a primeira regra ou carregue as 6 regras padrão.</p>
                    <button
                        onClick={handleSeed}
                        disabled={seeding}
                        className="flex items-center gap-1.5 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                    >
                        {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Carregar regras padrão
                    </button>
                </div>
            )}

            {/* Rules list */}
            {!loading && rules.length > 0 && (
                <div className="space-y-2">
                    {rules.map(rule => (
                        <div
                            key={rule.id}
                            className={['flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
                                rule.is_active
                                    ? 'bg-white border-gray-200 hover:border-blue-200'
                                    : 'bg-gray-50 border-gray-100 opacity-60'].join(' ')}
                        >
                            {/* Toggle */}
                            <button
                                onClick={() => handleToggle(rule)}
                                className={['w-8 h-4 rounded-full transition-colors relative shrink-0',
                                    rule.is_active ? 'bg-blue-600' : 'bg-gray-300'].join(' ')}
                            >
                                <span className={['absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
                                    rule.is_active ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
                            </button>

                            {/* Offset badge */}
                            <span className={['shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full',
                                rule.days_offset < 0 ? 'bg-blue-100 text-blue-700' :
                                rule.days_offset === 0 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'].join(' ')}>
                                {rule.days_offset > 0 ? '+' : ''}{rule.days_offset}d
                            </span>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{rule.name}</p>
                                <p className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                                    <Clock className="w-3 h-3" />{String(rule.trigger_hour).padStart(2,'0')}:00 BRT
                                    <span>·</span>
                                    <Mail className="w-3 h-3" />{rule.channel}
                                    <span>·</span>
                                    {fmtOffset(rule.days_offset)}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => setEditing(rule)}
                                    className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => rule.id && handleDelete(rule.id)}
                                    className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {editing !== null && (
                <RuleModal
                    rule={(editing && (editing as DunningRule).organization_id) ? editing as DunningRule : null}
                    organizationId={organizationId}
                    onSave={() => { setEditing(null); load(); }}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}

// ── Histórico Tab ─────────────────────────────────────────────

function HistoricoTab({ organizationId }: { organizationId: string }) {
    const [events, setEvents]   = useState<DunningEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await dunningService.listEvents(organizationId, {
                status: filterStatus || undefined,
            });
            setEvents(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar histórico.');
        } finally {
            setLoading(false);
        }
    }, [organizationId, filterStatus]);

    useEffect(() => { load(); }, [load]);

    const fmtBRL = (n?: number) => n != null
        ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';

    const fmtDue = (s?: string) => {
        if (!s) return '—';
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-sm font-bold text-gray-800">Histórico de Cobranças</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Todos os disparos da régua automática.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">Todos os status</option>
                        <option value="sent">Enviados</option>
                        <option value="failed">Falhas</option>
                        <option value="skipped">Pulados</option>
                    </select>
                    <button onClick={load} className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {error && <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2">{error}</div>}

            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            )}

            {!loading && events.length === 0 && (
                <div className="text-center py-14 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <History className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">Nenhum disparo registrado ainda.</p>
                </div>
            )}

            {!loading && events.length > 0 && (
                <div className="space-y-1">
                    {events.map(ev => (
                        <div key={ev.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                            >
                                <StatusBadge status={ev.status} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">
                                        {ev.party_name ?? ev.recipient_email ?? 'Destinatário desconhecido'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        {fmtBRL(ev.amount)}
                                        {ev.due_date ? ` · venc. ${fmtDue(ev.due_date)}` : ''}
                                        {' · '}
                                        {fmtDate(ev.sent_at)}
                                    </p>
                                </div>
                                {expanded === ev.id
                                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                }
                            </button>
                            {expanded === ev.id && (
                                <div className="px-4 pb-4 pt-0 border-t border-gray-100 text-xs text-gray-600 space-y-1.5 bg-gray-50">
                                    <p><span className="font-medium text-gray-500">E-mail:</span> {ev.recipient_email ?? '—'}</p>
                                    <p><span className="font-medium text-gray-500">Canal:</span> {ev.channel}</p>
                                    {ev.error_message && (
                                        <p className="text-red-600"><span className="font-medium">Erro:</span> {ev.error_message}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────

interface Props {
    organizationId: string;
}

export default function DunningModule({ organizationId }: Props) {
    const [tab, setTab] = useState<'regua' | 'historico'>('regua');

    const TABS = [
        { key: 'regua',     label: 'Régua',    icon: Bell },
        { key: 'historico', label: 'Histórico', icon: History },
    ] as const;

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Cobrança Automatizada</h1>
                    <p className="text-xs text-gray-500">Régua de e-mails automáticos por dias de vencimento</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={['flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                tab === t.key
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'].join(' ')}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div>
                {tab === 'regua'     && <ReguaTab     organizationId={organizationId} />}
                {tab === 'historico' && <HistoricoTab organizationId={organizationId} />}
            </div>
        </div>
    );
}
