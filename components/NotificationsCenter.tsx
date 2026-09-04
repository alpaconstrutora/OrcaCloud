import React from 'react';
import {
    Bell, Check, Clock, ExternalLink, RefreshCw, Search, X,
    Mail, MessageSquare, Webhook, Zap, AlertTriangle,
    CheckCircle, DollarSign, ClipboardList, Settings, BarChart3,
    ChevronDown, Users, Package, Building2, MoveHorizontal, Trash2,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import {
    ColumnConfig, useTableColumns, useResizableColumns,
    ColumnConfigButton, SortableHeader, usePersistedState,
} from './ui/TableUtils';
import { notificationService, Notification } from '../services/notificationService';
import { notificationLogService, NotificationLogEntry } from '../services/notificationLogService';
import { useOrgContext } from '../hooks/useOrgContext';
import {
    CATEGORY_META, CATEGORY_ORDER, NotifCategory,
    notifCategory, notifTypeMeta,
} from './notifications/notificationTypes';

interface NotificationsCenterProps {
    profile: { group: string; role: string; email?: string };
    onNavigate?: (link: string) => void;
}

type TabId = 'alertas' | 'logs' | 'preferencias';
type NotifStatus = 'unread' | 'read' | '';
type LogChannel = 'email' | 'whatsapp' | 'webhook' | '';
type LogStatus = 'sent' | 'failed' | 'pending' | '';

// O título muda junto com a aba ativa (§19.1/§20) — aba que troca o conteúdo
// inteiro sem trocar o título deixa o <h1> mentindo.
const VIEW_HEADERS: Record<TabId, { title: string; subtitle: string }> = {
    alertas: {
        title: 'Notificações',
        subtitle: 'Alertas recebidos pela sua conta e pelas organizações de que você participa.',
    },
    logs: {
        title: 'Logs de envio',
        subtitle: 'Histórico de disparos por e-mail, WhatsApp e webhook, com o erro de cada falha.',
    },
    preferencias: {
        title: 'Preferências de notificação',
        subtitle: 'Por quais canais você quer receber cada categoria de alerta.',
    },
};

// ── Colunas ─────────────────────────────────────────────────────────────────

const ALERT_COLUMNS: ColumnConfig[] = [
    { key: 'status',    label: 'Situação',     sortable: true  },
    { key: 'title',     label: 'Título',       sortable: true  },
    { key: 'message',   label: 'Mensagem',     sortable: true  },
    { key: 'category',  label: 'Tipo',         sortable: true  },
    { key: 'recipient', label: 'Destinatário', sortable: true  },
    { key: 'createdAt', label: 'Recebida em',  sortable: true  },
    { key: 'actions',   label: 'Ações',        sortable: false },
];

// Soma ≈ 1.310px com o checkbox — perto da largura útil real do app (~1.290px
// com a sidebar montada). Larguras muito menores nascem truncando o texto e
// deixam uma faixa branca à direita até o usuário clicar no autofit.
//
// Os valores saíram de medição no app real (Playwright, 03/09/2026), não de
// chute: com `status` em 100px "Não lida" quebrava em duas linhas, com
// `createdAt` em 160px a data quebrava depois da vírgula, e `category` em 140px
// cortava "Vencimento próximo". Lembre que o `px-6` do §6.6 come 48px de cada
// coluna — é sempre mais do que parece.
const ALERT_COL_WIDTHS: Record<string, number> = {
    status: 116, title: 230, message: 230, category: 180,
    recipient: 186, createdAt: 178, actions: 130,
};

const ALERT_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    status:    { label: 'Situação',     className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    title:     { label: 'Título',       className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    message:   { label: 'Mensagem',     className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    category:  { label: 'Tipo',         className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    recipient: { label: 'Destinatário', className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    createdAt: { label: 'Recebida em',  className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
};

const LOG_COLUMNS: ColumnConfig[] = [
    { key: 'channel',   label: 'Canal',        sortable: true  },
    { key: 'status',    label: 'Situação',     sortable: true  },
    { key: 'recipient', label: 'Destinatário', sortable: true  },
    { key: 'subject',   label: 'Assunto',      sortable: true  },
    { key: 'error',     label: 'Erro',         sortable: true  },
    { key: 'createdAt', label: 'Data',         sortable: true  },
    { key: 'actions',   label: 'Ações',        sortable: false },
];

// Mesma régua da tabela de alertas: "Canal" leva ícone + rótulo, e a data não
// pode quebrar depois da vírgula. Soma ≈ 1.220px (esta tabela não tem checkbox).
const LOG_COL_WIDTHS: Record<string, number> = {
    channel: 130, status: 116, recipient: 206, subject: 280,
    error: 220, createdAt: 178, actions: 90,
};

const LOG_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    channel:   { label: 'Canal',        className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    status:    { label: 'Situação',     className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    recipient: { label: 'Destinatário', className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    subject:   { label: 'Assunto',      className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    error:     { label: 'Erro',         className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
    createdAt: { label: 'Data',         className: 'px-6 py-2 border-r border-gray-100 text-left relative overflow-hidden' },
};

const CHANNEL_LABELS: Record<string, string> = {
    email: 'E-mail', whatsapp: 'WhatsApp', webhook: 'Webhook',
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
    email: Mail, whatsapp: MessageSquare, webhook: Webhook,
};

// §8: status é texto colorido simples — sem pílula, sem fundo, sem uppercase.
const LOG_STATUS: Record<string, { label: string; cls: string }> = {
    sent:    { label: 'Enviado',  cls: 'text-emerald-700' },
    failed:  { label: 'Falhou',   cls: 'text-red-600' },
    pending: { label: 'Pendente', cls: 'text-amber-700' },
};

// ── Ordenação genérica ──────────────────────────────────────────────────────

function compareValues(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
}

function sortRows<T>(rows: T[], key: string | null, dir: 'asc' | 'desc', pick: (row: T, key: string) => unknown): T[] {
    if (!key) return rows;
    const factor = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * compareValues(pick(a, key), pick(b, key)));
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

// ── Componente principal ────────────────────────────────────────────────────

const NotificationsCenter: React.FC<NotificationsCenterProps> = ({ profile, onNavigate }) => {
    const isAdmin = profile.group === 'DESENVOLVEDOR' || profile.group === 'USUARIO';
    const emailFilter = isAdmin ? undefined : profile.email;
    // REGRA #5: `orgId` null = "Todas as organizações". Nunca é guard de
    // carregamento — o service só aplica o recorte quando há org selecionada.
    const { orgId } = useOrgContext();
    const confirm = useConfirm();

    const [activeTab, setActiveTab] = usePersistedState<TabId>('notificacoes:aba', 'alertas');

    // ── Alertas state ──────────────────────────────────────────────────────
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    const [alertsLoading, setAlertsLoading] = React.useState(true);
    const [alertsError, setAlertsError] = React.useState('');
    const [alertQuery, setAlertQuery] = usePersistedState<string>('notificacoes:alertas:busca', '');
    const [alertCategoryFilter, setAlertCategoryFilter] = usePersistedState<NotifCategory | ''>('notificacoes:alertas:categoria', '');
    const [alertStatusFilter, setAlertStatusFilter] = usePersistedState<NotifStatus>('notificacoes:alertas:status', '');
    const [selectedAlertIds, setSelectedAlertIds] = React.useState<Set<string>>(new Set());

    const alertColumns = useTableColumns(ALERT_COLUMNS, 'notificacoesAlertasColumns');
    const alertCols = useResizableColumns(ALERT_COL_WIDTHS, 'notificacoesAlertasColWidths');

    // ── Logs state ─────────────────────────────────────────────────────────
    const [logs, setLogs] = React.useState<NotificationLogEntry[]>([]);
    const [logsLoading, setLogsLoading] = React.useState(false);
    const [logsError, setLogsError] = React.useState('');
    const [logQuery, setLogQuery] = usePersistedState<string>('notificacoes:logs:busca', '');
    const [logChannelFilter, setLogChannelFilter] = usePersistedState<LogChannel>('notificacoes:logs:canal', '');
    const [logStatusFilter, setLogStatusFilter] = usePersistedState<LogStatus>('notificacoes:logs:status', '');
    const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);

    const logColumns = useTableColumns(LOG_COLUMNS, 'notificacoesLogsColumns');
    const logCols = useResizableColumns(LOG_COL_WIDTHS, 'notificacoesLogsColWidths');

    // ── Load alertas ───────────────────────────────────────────────────────
    const loadAlerts = React.useCallback(async () => {
        setAlertsLoading(true);
        setAlertsError('');
        try {
            const data = await notificationService.listNotifications(emailFilter, orgId);
            setNotifications(data);
        } catch {
            setAlertsError('Erro ao carregar notificações.');
        } finally {
            setAlertsLoading(false);
        }
    }, [emailFilter, orgId]);

    React.useEffect(() => {
        loadAlerts();
        const handleUpdate = () => loadAlerts();
        window.addEventListener('notifications_updated', handleUpdate);
        const unsub = notificationService.subscribeToNotifications(handleUpdate, emailFilter);
        return () => {
            window.removeEventListener('notifications_updated', handleUpdate);
            unsub();
        };
    }, [loadAlerts, emailFilter]);

    // ── Load logs ──────────────────────────────────────────────────────────
    const loadLogs = React.useCallback(async () => {
        setLogsLoading(true);
        setLogsError('');
        try {
            const data = await notificationLogService.list();
            setLogs(data);
        } catch {
            setLogsError('Erro ao carregar logs.');
        } finally {
            setLogsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (activeTab === 'logs') loadLogs();
    }, [activeTab, loadLogs]);

    // ── KPIs ───────────────────────────────────────────────────────────────
    const unread = notifications.filter(n => !n.isRead).length;
    const logFailed = logs.filter(l => l.status === 'failed').length;
    const recipients = React.useMemo(
        () => new Set(notifications.map(n => n.recipientEmail)).size,
        [notifications],
    );
    const financeiroCount = React.useMemo(
        () => notifications.filter(n => notifCategory(n.type) === 'financeiro').length,
        [notifications],
    );

    // ── Filtro + ordenação: alertas ────────────────────────────────────────
    const visibleAlerts = React.useMemo(() => {
        const termo = alertQuery.trim().toLowerCase();
        const filtered = notifications.filter(n => {
            const matchTermo = !termo
                || n.title.toLowerCase().includes(termo)
                || n.message.toLowerCase().includes(termo)
                || (n.recipientEmail ?? '').toLowerCase().includes(termo);
            // Compara CATEGORIA, não `n.type` cru: os slugs gravados no banco
            // (`manutencao_vencimento`, `task_alert`…) nunca bateram com os
            // rótulos que a tela oferecia — o filtro voltava vazio sempre.
            const matchCategoria = !alertCategoryFilter || notifCategory(n.type) === alertCategoryFilter;
            const matchStatus = !alertStatusFilter
                || (alertStatusFilter === 'unread' ? !n.isRead : n.isRead);
            return matchTermo && matchCategoria && matchStatus;
        });
        return sortRows(filtered, alertColumns.sortColumn, alertColumns.sortDirection, (n, key) => {
            switch (key) {
                case 'status':    return n.isRead ? 1 : 0;
                case 'title':     return n.title;
                case 'message':   return n.message;
                case 'category':  return CATEGORY_META[notifCategory(n.type)].label;
                case 'recipient': return n.recipientEmail;
                case 'createdAt': return n.createdAt;
                default:          return null;
            }
        });
    }, [notifications, alertQuery, alertCategoryFilter, alertStatusFilter, alertColumns.sortColumn, alertColumns.sortDirection]);

    // ── Filtro + ordenação: logs ───────────────────────────────────────────
    const visibleLogs = React.useMemo(() => {
        const termo = logQuery.trim().toLowerCase();
        const filtered = logs.filter(l => {
            const matchTermo = !termo
                || (l.recipient ?? '').toLowerCase().includes(termo)
                || (l.subject ?? '').toLowerCase().includes(termo);
            const matchCanal = !logChannelFilter || l.channel === logChannelFilter;
            const matchStatus = !logStatusFilter || l.status === logStatusFilter;
            return matchTermo && matchCanal && matchStatus;
        });
        return sortRows(filtered, logColumns.sortColumn, logColumns.sortDirection, (l, key) => {
            switch (key) {
                case 'channel':   return CHANNEL_LABELS[l.channel] ?? l.channel;
                case 'status':    return LOG_STATUS[l.status]?.label ?? l.status;
                case 'recipient': return l.recipient;
                case 'subject':   return l.subject;
                case 'error':     return l.error;
                case 'createdAt': return l.createdAt;
                default:          return null;
            }
        });
    }, [logs, logQuery, logChannelFilter, logStatusFilter, logColumns.sortColumn, logColumns.sortDirection]);

    // ── Larguras totais (§6.1: soma exata, nunca w-full) ───────────────────
    const alertDataKeys = alertColumns.orderedVisibleColumns.filter(k => k !== 'actions');
    const alertTotalWidth = 40
        + alertDataKeys.reduce((sum, key) => sum + alertCols.getWidth(key), 0)
        + (alertColumns.visibleColumns.includes('actions') ? alertCols.getWidth('actions') : 0);

    const logDataKeys = logColumns.orderedVisibleColumns.filter(k => k !== 'actions');
    const logTotalWidth = logDataKeys.reduce((sum, key) => sum + logCols.getWidth(key), 0)
        + (logColumns.visibleColumns.includes('actions') ? logCols.getWidth('actions') : 0);

    // Número de colunas da linha de detalhe do log (colSpan), incluindo o espaçador.
    const logColSpan = logDataKeys.length + 1 + (logColumns.visibleColumns.includes('actions') ? 1 : 0);

    // ── Ações ──────────────────────────────────────────────────────────────
    const toggleSelectAlert = (id: string) => {
        setSelectedAlertIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const allVisibleSelected = visibleAlerts.length > 0
        && visibleAlerts.every(n => selectedAlertIds.has(n.id));

    const toggleAllVisible = () => {
        setSelectedAlertIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                visibleAlerts.forEach(n => next.delete(n.id));
                return next;
            }
            return new Set([...prev, ...visibleAlerts.map(n => n.id)]);
        });
    };

    const markRead = async (id: string) => {
        await notificationService.markAsRead(id);
        // §22: atualiza o array local em vez de recarregar a tabela inteira.
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    };

    const removeAlert = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir notificação?',
            message: 'A notificação sai da sua caixa permanentemente.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await notificationService.deleteNotification(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
        setSelectedAlertIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const markSelectedRead = async () => {
        const ids = [...selectedAlertIds];
        await Promise.all(ids.map(id => notificationService.markAsRead(id)));
        setNotifications(prev => prev.map(n => (selectedAlertIds.has(n.id) ? { ...n, isRead: true } : n)));
        setSelectedAlertIds(new Set());
    };

    const deleteSelected = async () => {
        const ids = [...selectedAlertIds];
        const ok = await confirm({
            title: `Excluir ${ids.length} notificação(ões)?`,
            message: 'As notificações saem da sua caixa permanentemente.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        // Só remove da tela o que o backend confirmou (§22).
        const results = await Promise.allSettled(ids.map(id => notificationService.deleteNotification(id)));
        const removed = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
        setNotifications(prev => prev.filter(n => !removed.has(n.id)));
        setSelectedAlertIds(new Set());
    };

    const markAllRead = async () => {
        await notificationService.markAllAsRead(emailFilter);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    // ── Render ─────────────────────────────────────────────────────────────
    const tabs: Array<{ id: TabId; label: string; badge?: number }> = [
        { id: 'alertas', label: 'Alertas', badge: unread > 0 ? unread : undefined },
        { id: 'logs', label: 'Logs de envio', badge: logFailed > 0 ? logFailed : undefined },
        { id: 'preferencias', label: 'Preferências' },
    ];

    const header = VIEW_HEADERS[activeTab];
    const activeError = activeTab === 'alertas' ? alertsError : activeTab === 'logs' ? logsError : '';

    return (
        <div className="space-y-6 pb-20">
            {/* 1. Cabeçalho de tela — §20 (título muda com a aba ativa) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
            </div>

            {/* 2. Toolbar de abas — §19.1 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {tab.label}
                            {tab.badge !== undefined && (
                                <span className={`px-1.5 rounded-[4px] text-xs ${
                                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. KPI cards — §4, DEPOIS das abas e refletindo a aba ativa (§20.1: mb-3) */}
            {activeTab === 'alertas' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard label="Não lidas" value={unread} icon={<Bell className="w-5 h-5" />} color="indigo" />
                    <KpiCard label="Total" value={notifications.length} icon={<BarChart3 className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Financeiras" value={financeiroCount} icon={<DollarSign className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Destinatários" value={recipients} icon={<Users className="w-5 h-5" />} color="violet" />
                </div>
            )}
            {activeTab === 'logs' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard label="Falhas" value={logFailed} icon={<AlertTriangle className="w-5 h-5" />} color={logFailed > 0 ? 'red' : 'gray'} />
                    <KpiCard label="Enviados" value={logs.filter(l => l.status === 'sent').length} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Pendentes" value={logs.filter(l => l.status === 'pending').length} icon={<Clock className="w-5 h-5" />} color="amber" />
                    <KpiCard label="Total de envios" value={logs.length} icon={<Zap className="w-5 h-5" />} color="blue" />
                </div>
            )}

            {/* Banner de erro — FORA do card acoplado (§5.2) */}
            {activeError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 font-semibold flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {activeError}
                    <button
                        onClick={activeTab === 'alertas' ? loadAlerts : loadLogs}
                        className="ml-auto h-8 px-3 rounded-[6px] border border-red-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50 transition-all"
                    >
                        Tentar novamente
                    </button>
                </div>
            )}

            {/* 4. Toolbar acoplada + tabela — §5.2 */}
            {activeTab === 'alertas' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 min-w-0 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por título, mensagem ou destinatário..."
                                    value={alertQuery}
                                    onChange={e => setAlertQuery(e.target.value)}
                                    className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                                {alertQuery && (
                                    <button
                                        onClick={() => setAlertQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        title="Limpar busca"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <ToolbarSelect
                                value={alertCategoryFilter}
                                onChange={v => setAlertCategoryFilter(v as NotifCategory | '')}
                                options={[
                                    { value: '', label: 'Todos os tipos' },
                                    ...CATEGORY_ORDER.map(c => ({ value: c, label: CATEGORY_META[c].label })),
                                ]}
                            />
                            <ToolbarSelect
                                value={alertStatusFilter}
                                onChange={v => setAlertStatusFilter(v as NotifStatus)}
                                options={[
                                    { value: '', label: 'Todas as situações' },
                                    { value: 'unread', label: 'Não lidas' },
                                    { value: 'read', label: 'Lidas' },
                                ]}
                            />

                            <button
                                onClick={loadAlerts}
                                className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                                title="Atualizar"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={ALERT_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={alertColumns.visibleColumns}
                                    showColumnConfig={alertColumns.showColumnConfig}
                                    onToggleShow={() => alertColumns.setShowColumnConfig(!alertColumns.showColumnConfig)}
                                    onToggleColumn={alertColumns.toggleColumn}
                                    onReset={alertColumns.resetColumns}
                                />
                                {/* Autofit sob comando explícito — nunca automático (§6.1.2). */}
                                <button
                                    onClick={() => alertCols.autoFit()}
                                    className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                    title="Ajustar largura das colunas ao conteúdo"
                                >
                                    <MoveHorizontal className="w-4 h-4" />
                                </button>
                            </div>

                            {visibleAlerts.some(n => !n.isRead) && (
                                <>
                                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                                    <button
                                        onClick={markAllRead}
                                        className="h-9 flex items-center gap-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 whitespace-nowrap shrink-0"
                                    >
                                        <Check className="w-[15px] h-[15px]" />
                                        Marcar todas como lidas
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {alertsLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando notificações...</p>
                        </div>
                    ) : visibleAlerts.length === 0 ? (
                        <div className="text-center py-12">
                            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma notificação encontrada</h3>
                            <p className="text-sm text-gray-500">Tente ajustar a busca ou os filtros.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table
                                ref={alertCols.tableRef}
                                className="text-sm text-left border-collapse"
                                style={{ tableLayout: 'fixed', width: alertTotalWidth, minWidth: '100%' }}
                            >
                                <colgroup>
                                    <col style={{ width: '40px' }} />
                                    {alertDataKeys.map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${alertCols.getWidth(key)}px` }} />
                                    ))}
                                    {/* espaçador ANTES de "Ações" (§6.1.1) */}
                                    <col />
                                    {alertColumns.visibleColumns.includes('actions') && (
                                        <col data-col-key="actions" style={{ width: `${alertCols.getWidth('actions')}px` }} />
                                    )}
                                </colgroup>
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                                checked={allVisibleSelected}
                                                disabled={visibleAlerts.length === 0}
                                                onChange={toggleAllVisible}
                                                title="Selecionar todas as notificações visíveis"
                                            />
                                        </th>
                                        {alertDataKeys.map(key => {
                                            const def = ALERT_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader
                                                    key={key}
                                                    colKey={key}
                                                    label={def.label}
                                                    sortable={def.sortable !== false}
                                                    uppercase={false}
                                                    sortColumn={alertColumns.sortColumn}
                                                    sortDirection={alertColumns.sortDirection}
                                                    onSort={alertColumns.handleColumnSort}
                                                    onMoveColumn={alertColumns.moveColumn}
                                                    className={def.className}
                                                >
                                                    <alertCols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                        {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                        <th aria-hidden="true" className="border-r border-gray-100" />
                                        {alertColumns.visibleColumns.includes('actions') && (
                                            <th className="px-6 py-2 text-left relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <alertCols.ResizeHandle colKey="actions" />
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {visibleAlerts.map(n => (
                                        <tr
                                            key={n.id}
                                            className={`hover:bg-blue-50/50 transition-colors ${
                                                selectedAlertIds.has(n.id) ? 'bg-blue-50/60' : !n.isRead ? 'bg-indigo-50/30' : ''
                                            }`}
                                        >
                                            <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedAlertIds.has(n.id)}
                                                    onChange={() => toggleSelectAlert(n.id)}
                                                />
                                            </td>
                                            {alertDataKeys.map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderAlertCell(key, n)}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            {alertColumns.visibleColumns.includes('actions') && (
                                                <td className="px-6 py-2.5 last:border-r-0">
                                                    <div className="flex items-center gap-1.5">
                                                        {n.link && (
                                                            <button
                                                                onClick={() => onNavigate?.(n.link!)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all flex items-center gap-1"
                                                            >
                                                                Abrir <ExternalLink className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {!n.isRead && (
                                                            <ActionIconButton
                                                                kind="view"
                                                                title="Marcar como lida"
                                                                icon={<Check className="w-4 h-4" />}
                                                                onClick={() => markRead(n.id)}
                                                            />
                                                        )}
                                                        <ActionIconButton kind="delete" onClick={() => removeAlert(n.id)} />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 min-w-0 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por destinatário ou assunto..."
                                    value={logQuery}
                                    onChange={e => setLogQuery(e.target.value)}
                                    className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                                {logQuery && (
                                    <button
                                        onClick={() => setLogQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        title="Limpar busca"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <ToolbarSelect
                                value={logChannelFilter}
                                onChange={v => setLogChannelFilter(v as LogChannel)}
                                options={[
                                    { value: '', label: 'Todos os canais' },
                                    { value: 'email', label: 'E-mail' },
                                    { value: 'whatsapp', label: 'WhatsApp' },
                                    { value: 'webhook', label: 'Webhook' },
                                ]}
                            />
                            <ToolbarSelect
                                value={logStatusFilter}
                                onChange={v => setLogStatusFilter(v as LogStatus)}
                                options={[
                                    { value: '', label: 'Todas as situações' },
                                    { value: 'sent', label: 'Enviados' },
                                    { value: 'failed', label: 'Falhou' },
                                    { value: 'pending', label: 'Pendente' },
                                ]}
                            />

                            <button
                                onClick={loadLogs}
                                className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                                title="Atualizar"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={LOG_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={logColumns.visibleColumns}
                                    showColumnConfig={logColumns.showColumnConfig}
                                    onToggleShow={() => logColumns.setShowColumnConfig(!logColumns.showColumnConfig)}
                                    onToggleColumn={logColumns.toggleColumn}
                                    onReset={logColumns.resetColumns}
                                />
                                <button
                                    onClick={() => logCols.autoFit()}
                                    className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                    title="Ajustar largura das colunas ao conteúdo"
                                >
                                    <MoveHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {logsLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando logs...</p>
                        </div>
                    ) : visibleLogs.length === 0 ? (
                        <div className="text-center py-12">
                            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum log encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar a busca ou os filtros.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table
                                ref={logCols.tableRef}
                                className="text-sm text-left border-collapse"
                                style={{ tableLayout: 'fixed', width: logTotalWidth, minWidth: '100%' }}
                            >
                                <colgroup>
                                    {logDataKeys.map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${logCols.getWidth(key)}px` }} />
                                    ))}
                                    <col />
                                    {logColumns.visibleColumns.includes('actions') && (
                                        <col data-col-key="actions" style={{ width: `${logCols.getWidth('actions')}px` }} />
                                    )}
                                </colgroup>
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {logDataKeys.map(key => {
                                            const def = LOG_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader
                                                    key={key}
                                                    colKey={key}
                                                    label={def.label}
                                                    sortable={def.sortable !== false}
                                                    uppercase={false}
                                                    sortColumn={logColumns.sortColumn}
                                                    sortDirection={logColumns.sortDirection}
                                                    onSort={logColumns.handleColumnSort}
                                                    onMoveColumn={logColumns.moveColumn}
                                                    className={def.className}
                                                >
                                                    <logCols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                        <th aria-hidden="true" className="border-r border-gray-100" />
                                        {logColumns.visibleColumns.includes('actions') && (
                                            <th className="px-6 py-2 text-left relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <logCols.ResizeHandle colKey="actions" />
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {visibleLogs.map(log => {
                                        const expandable = !!(log.body || log.metadata);
                                        const isExpanded = expandedLogId === log.id;
                                        return (
                                            <React.Fragment key={log.id}>
                                                <tr className="hover:bg-blue-50/50 transition-colors">
                                                    {logDataKeys.map(key => (
                                                        <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            {renderLogCell(key, log)}
                                                        </td>
                                                    ))}
                                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                    {logColumns.visibleColumns.includes('actions') && (
                                                        <td className="px-6 py-2.5 last:border-r-0">
                                                            {expandable && (
                                                                <ActionIconButton
                                                                    kind="view"
                                                                    title={isExpanded ? 'Ocultar payload' : 'Ver payload'}
                                                                    icon={<ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                                                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                                                />
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-gray-50/60">
                                                        <td colSpan={logColSpan} className="px-6 py-3 space-y-2">
                                                            {log.body && (
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-500 mb-1">Corpo</div>
                                                                    <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-[6px] p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{log.body}</pre>
                                                                </div>
                                                            )}
                                                            {log.metadata && (
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-500 mb-1">Metadata</div>
                                                                    <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-[6px] p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'preferencias' && <PreferencesTab />}

            {/* Barra de ações em lote — §10: fixa no rodapé, paleta azul */}
            {activeTab === 'alertas' && selectedAlertIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedAlertIds.size} selecionada{selectedAlertIds.size !== 1 ? 's' : ''}
                    </span>
                    <button
                        onClick={markSelectedRead}
                        className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-[6px] text-sm font-medium hover:bg-blue-50 transition-colors"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Marcar como lida
                    </button>
                    <button
                        onClick={deleteSelected}
                        className="flex items-center gap-2 px-3 py-2 bg-white text-red-600 rounded-[6px] text-sm font-medium hover:bg-red-50 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                    </button>
                    <button
                        onClick={() => setSelectedAlertIds(new Set())}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-[6px] text-sm font-medium hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Células ─────────────────────────────────────────────────────────────────

function renderAlertCell(key: string, n: Notification): React.ReactNode {
    switch (key) {
        case 'status':
            // §8: texto colorido simples, sem pílula/fundo/uppercase.
            // `whitespace-nowrap`: "Não lida" tem espaço e quebrava em duas
            // linhas, desalinhando a altura da <tr> inteira.
            return n.isRead
                ? <span className="whitespace-nowrap text-sm font-normal text-gray-500">Lida</span>
                : <span className="whitespace-nowrap text-sm font-normal text-indigo-700">Não lida</span>;
        case 'title':
            return <span className="block truncate text-sm font-normal text-gray-700" title={n.title}>{n.title}</span>;
        case 'message':
            return <span className="block truncate text-sm font-normal text-gray-600" title={n.message}>{n.message}</span>;
        case 'category': {
            const meta = notifTypeMeta(n.type);
            const cat = CATEGORY_META[meta.category];
            return (
                <span className={`block truncate text-sm font-normal ${cat.textClass}`} title={`${cat.label} · ${meta.label}`}>
                    {meta.label}
                </span>
            );
        }
        case 'recipient':
            return <span className="block truncate text-sm font-normal text-gray-600" title={n.recipientEmail}>{n.recipientEmail}</span>;
        case 'createdAt':
            return <span className="whitespace-nowrap text-sm font-normal text-gray-600">{fmtDateTime(n.createdAt)}</span>;
        default:
            return null;
    }
}

function renderLogCell(key: string, log: NotificationLogEntry): React.ReactNode {
    switch (key) {
        case 'channel': {
            const Icon = CHANNEL_ICONS[log.channel] ?? Zap;
            return (
                <span className="flex items-center gap-2 text-sm font-normal text-gray-700">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    {CHANNEL_LABELS[log.channel] ?? log.channel}
                </span>
            );
        }
        case 'status': {
            const st = LOG_STATUS[log.status] ?? { label: log.status, cls: 'text-gray-600' };
            return <span className={`text-sm font-normal ${st.cls}`}>{st.label}</span>;
        }
        case 'recipient':
            return <span className="block truncate text-sm font-normal text-gray-700" title={log.recipient ?? ''}>{log.recipient || '—'}</span>;
        case 'subject':
            return <span className="block truncate text-sm font-normal text-gray-700" title={log.subject ?? ''}>{log.subject || '—'}</span>;
        case 'error':
            return log.error
                ? <span className="block truncate text-sm font-normal text-red-600" title={log.error}>{log.error}</span>
                : <span className="text-sm font-normal text-gray-400">—</span>;
        case 'createdAt':
            return <span className="whitespace-nowrap text-sm font-normal text-gray-600">{fmtDateTime(log.createdAt)}</span>;
        default:
            return null;
    }
}

// ── Aba Preferências ────────────────────────────────────────────────────────

type PrefChannel = 'in_app' | 'email' | 'whatsapp';

const PREF_TYPES: Array<{ id: NotifCategory; label: string; icon: React.ElementType }> = [
    { id: 'financeiro',  label: 'Financeiro',  icon: DollarSign },
    { id: 'contratos',   label: 'Contratos',   icon: Building2 },
    { id: 'suprimentos', label: 'Suprimentos', icon: Package },
    { id: 'documentos',  label: 'Documentos',  icon: ClipboardList },
    { id: 'operacional', label: 'Operacional', icon: ClipboardList },
    { id: 'qualidade',   label: 'Qualidade',   icon: CheckCircle },
    { id: 'comercial',   label: 'Comercial',   icon: BarChart3 },
    { id: 'sistema',     label: 'Sistema',     icon: Settings },
];

const PREF_CHANNELS: Array<{ id: PrefChannel; label: string; icon: React.ElementType }> = [
    { id: 'in_app', label: 'Na plataforma', icon: Bell },
    { id: 'email', label: 'E-mail', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
];

/**
 * Grade de configuração — não é lista de registros, então **não** vira tabela
 * (§6 governa listagem de registros). As preferências ainda vivem só no
 * `localStorage`; não há persistência no banco nem efeito sobre o envio real —
 * dívida registrada em docs/planos/2026-09-03-notificacoes-tabela-e-novos-avisos.md.
 */
function PreferencesTab() {
    const [prefs, setPrefs] = React.useState<Record<string, boolean>>(() => {
        try {
            return JSON.parse(localStorage.getItem('notif_prefs') ?? '{}');
        } catch {
            return {};
        }
    });
    const [saved, setSaved] = React.useState(false);

    const toggle = (key: string) => {
        setPrefs(p => ({ ...p, [key]: !(p[key] !== false) }));
        setSaved(false);
    };

    const save = () => {
        localStorage.setItem('notif_prefs', JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const isOn = (type: string, channel: PrefChannel) => prefs[`${type}_${channel}`] !== false;

    return (
        <div className="max-w-3xl space-y-4">
            <div className="bg-white border border-gray-100 rounded-[10px] overflow-hidden shadow-sm">
                <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: '1fr repeat(3, 120px)' }}>
                    <div className="px-6 py-2 text-xs font-semibold text-gray-500">Categoria</div>
                    {PREF_CHANNELS.map(ch => (
                        <div key={ch.id} className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                                <ch.icon className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500">{ch.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {PREF_TYPES.map((type, idx) => (
                    <div
                        key={type.id}
                        className={`grid items-center ${idx < PREF_TYPES.length - 1 ? 'border-b border-gray-100' : ''}`}
                        style={{ gridTemplateColumns: '1fr repeat(3, 120px)' }}
                    >
                        <div className="px-6 py-2.5 flex items-center gap-3">
                            <type.icon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-sm font-normal text-gray-700">{type.label}</span>
                        </div>
                        {PREF_CHANNELS.map(ch => {
                            const key = `${type.id}_${ch.id}`;
                            const on = isOn(type.id, ch.id);
                            return (
                                <div key={ch.id} className="px-3 py-2.5 flex justify-center">
                                    <button
                                        onClick={() => toggle(key)}
                                        className={`w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-blue-600' : 'bg-gray-200'}`}
                                        title={`${on ? 'Desativar' : 'Ativar'} ${type.label} por ${ch.label}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                    Salvar preferências
                </button>
                {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                        <CheckCircle className="w-4 h-4" /> Salvo
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function ToolbarSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <div className="relative shrink-0">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
    );
}

export default NotificationsCenter;
