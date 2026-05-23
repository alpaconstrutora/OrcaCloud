import React from 'react';
import {
    Bell, Check, Trash2, Clock, ExternalLink, RefreshCw, Search,
    Filter, Mail, MessageSquare, Webhook, Zap, AlertTriangle,
    CheckCircle, XCircle, Info, Building2, Package, DollarSign,
    ClipboardList, Settings, BarChart3, ChevronDown, X, Users
} from 'lucide-react';
import { notificationService, Notification } from '../services/notificationService';
import { notificationLogService, NotificationLogEntry } from '../services/notificationLogService';

interface NotificationsCenterProps {
    profile: { group: string; role: string; email?: string };
    onNavigate?: (link: string) => void;
}

type TabId = 'alertas' | 'logs' | 'preferencias';
type NotifType = 'sistema' | 'financeiro' | 'suprimentos' | 'operacional' | 'qualidade' | 'fiscal' | '';
type NotifStatus = 'unread' | 'read' | '';
type LogChannel = 'email' | 'whatsapp' | 'webhook' | '';
type LogStatus = 'sent' | 'failed' | 'pending' | '';

const TYPE_ICONS: Record<string, React.ElementType> = {
    sistema: Settings,
    financeiro: DollarSign,
    suprimentos: Package,
    operacional: ClipboardList,
    qualidade: CheckCircle,
    fiscal: Building2,
};

const TYPE_LABELS: Record<string, string> = {
    sistema: 'Sistema',
    financeiro: 'Financeiro',
    suprimentos: 'Suprimentos',
    operacional: 'Operacional',
    qualidade: 'Qualidade',
    fiscal: 'Fiscal',
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
    email: Mail,
    whatsapp: MessageSquare,
    webhook: Webhook,
};

function NotifTypeBadge({ type }: { type?: string }) {
    if (!type) return null;
    const Icon = TYPE_ICONS[type] ?? Bell;
    const colorMap: Record<string, string> = {
        sistema: 'bg-gray-100 text-gray-600',
        financeiro: 'bg-emerald-100 text-emerald-700',
        suprimentos: 'bg-orange-100 text-orange-700',
        operacional: 'bg-blue-100 text-blue-700',
        qualidade: 'bg-purple-100 text-purple-700',
        fiscal: 'bg-yellow-100 text-yellow-700',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${colorMap[type] ?? 'bg-gray-100 text-gray-600'}`}>
            <Icon className="w-3 h-3" />
            {TYPE_LABELS[type] ?? type}
        </span>
    );
}

function LogStatusBadge({ status }: { status: string }) {
    const map: Record<string, { cls: string; icon: React.ElementType; label: string }> = {
        sent: { cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, label: 'Enviado' },
        failed: { cls: 'bg-red-100 text-red-700', icon: XCircle, label: 'Falhou' },
        pending: { cls: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pendente' },
    };
    const { cls, icon: Icon, label } = map[status] ?? { cls: 'bg-gray-100 text-gray-600', icon: Info, label: status };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
        </span>
    );
}

// ── Aba Preferências ────────────────────────────────────────────────────────

type PrefChannel = 'in_app' | 'email' | 'whatsapp';
type PrefKey = `${NotifType extends '' ? never : NotifType}_${PrefChannel}`;

const PREF_TYPES: Array<{ id: string; label: string; icon: React.ElementType }> = [
    { id: 'sistema', label: 'Sistema', icon: Settings },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'suprimentos', label: 'Suprimentos', icon: Package },
    { id: 'operacional', label: 'Operacional', icon: ClipboardList },
    { id: 'qualidade', label: 'Qualidade', icon: CheckCircle },
    { id: 'fiscal', label: 'Fiscal', icon: Building2 },
];

const PREF_CHANNELS: Array<{ id: PrefChannel; label: string; icon: React.ElementType }> = [
    { id: 'in_app', label: 'Na plataforma', icon: Bell },
    { id: 'email', label: 'E-mail', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
];

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
        setPrefs(p => ({ ...p, [key]: !p[key] }));
        setSaved(false);
    };

    const save = () => {
        localStorage.setItem('notif_prefs', JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const isOn = (type: string, channel: PrefChannel) => prefs[`${type}_${channel}`] !== false;

    return (
        <div className="p-6 max-w-3xl">
            <div className="mb-6">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-1">Canais por tipo de notificação</h3>
                <p className="text-xs text-gray-500">Defina por quais canais você quer receber cada categoria de alerta.</p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '1fr repeat(3, 120px)' }}>
                    <div className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoria</div>
                    {PREF_CHANNELS.map(ch => (
                        <div key={ch.id} className="p-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                                <ch.icon className="w-4 h-4 text-gray-400" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{ch.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {PREF_TYPES.map((type, idx) => (
                    <div
                        key={type.id}
                        className={`grid items-center ${idx < PREF_TYPES.length - 1 ? 'border-b border-gray-50' : ''}`}
                        style={{ gridTemplateColumns: '1fr repeat(3, 120px)' }}
                    >
                        <div className="p-4 flex items-center gap-3">
                            <div className="p-1.5 bg-gray-100 rounded-lg">
                                <type.icon className="w-3.5 h-3.5 text-gray-600" />
                            </div>
                            <span className="text-sm font-bold text-gray-800">{type.label}</span>
                        </div>
                        {PREF_CHANNELS.map(ch => {
                            const key = `${type.id}_${ch.id}`;
                            const on = isOn(type.id, ch.id);
                            return (
                                <div key={ch.id} className="p-4 flex justify-center">
                                    <button
                                        onClick={() => toggle(key)}
                                        className={`w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
                <button
                    onClick={save}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-colors"
                >
                    Salvar preferências
                </button>
                {saved && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                        <CheckCircle className="w-4 h-4" /> Salvo!
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Componente principal ────────────────────────────────────────────────────

const NotificationsCenter: React.FC<NotificationsCenterProps> = ({ profile, onNavigate }) => {
    const isAdmin = profile.group === 'DESENVOLVEDOR' || profile.group === 'USUARIO';
    const emailFilter = isAdmin ? undefined : profile.email;

    const [activeTab, setActiveTab] = React.useState<TabId>('alertas');

    // ── Alertas state ──────────────────────────────────────────────────────
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    const [alertsLoading, setAlertsLoading] = React.useState(true);
    const [alertsError, setAlertsError] = React.useState('');
    const [alertSearch, setAlertSearch] = React.useState('');
    const [alertTypeFilter, setAlertTypeFilter] = React.useState<NotifType>('');
    const [alertStatusFilter, setAlertStatusFilter] = React.useState<NotifStatus>('');
    const [alertOrgFilter, setAlertOrgFilter] = React.useState('');
    const [selectedAlertIds, setSelectedAlertIds] = React.useState<Set<string>>(new Set());

    // ── Logs state ─────────────────────────────────────────────────────────
    const [logs, setLogs] = React.useState<NotificationLogEntry[]>([]);
    const [logsLoading, setLogsLoading] = React.useState(false);
    const [logsError, setLogsError] = React.useState('');
    const [logSearch, setLogSearch] = React.useState('');
    const [logChannelFilter, setLogChannelFilter] = React.useState<LogChannel>('');
    const [logStatusFilter, setLogStatusFilter] = React.useState<LogStatus>('');

    // ── Load alertas ───────────────────────────────────────────────────────
    const loadAlerts = React.useCallback(async () => {
        setAlertsLoading(true);
        setAlertsError('');
        try {
            const data = await notificationService.listNotifications(emailFilter);
            setNotifications(data);
        } catch (err: any) {
            setAlertsError('Erro ao carregar notificações.');
        } finally {
            setAlertsLoading(false);
        }
    }, [emailFilter]);

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
            const { supabase } = await import('../lib/supabase');
            const { data, error } = await supabase
                .from('notification_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            setLogs((data ?? []).map(notificationLogService.map));
        } catch (err: any) {
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
    const byType = React.useMemo(() => {
        const counts: Record<string, number> = {};
        notifications.forEach(n => {
            if (n.type) counts[n.type] = (counts[n.type] ?? 0) + 1;
        });
        return counts;
    }, [notifications]);
    const logFailed = logs.filter(l => l.status === 'failed').length;

    // ── Filtros alertas ────────────────────────────────────────────────────
    const filteredAlerts = React.useMemo(() => {
        return notifications.filter(n => {
            const matchSearch = !alertSearch ||
                n.title.toLowerCase().includes(alertSearch.toLowerCase()) ||
                n.message.toLowerCase().includes(alertSearch.toLowerCase());
            const matchType = !alertTypeFilter || n.type === alertTypeFilter;
            const matchStatus = !alertStatusFilter || (alertStatusFilter === 'unread' ? !n.isRead : n.isRead);
            const matchOrg = !alertOrgFilter || n.recipientEmail?.includes(alertOrgFilter);
            return matchSearch && matchType && matchStatus && matchOrg;
        });
    }, [notifications, alertSearch, alertTypeFilter, alertStatusFilter, alertOrgFilter]);

    // ── Filtros logs ───────────────────────────────────────────────────────
    const filteredLogs = React.useMemo(() => {
        return logs.filter(l => {
            const matchSearch = !logSearch ||
                (l.recipient ?? '').toLowerCase().includes(logSearch.toLowerCase()) ||
                (l.subject ?? '').toLowerCase().includes(logSearch.toLowerCase());
            const matchChannel = !logChannelFilter || l.channel === logChannelFilter;
            const matchStatus = !logStatusFilter || l.status === logStatusFilter;
            return matchSearch && matchChannel && matchStatus;
        });
    }, [logs, logSearch, logChannelFilter, logStatusFilter]);

    // ── Ações em massa ─────────────────────────────────────────────────────
    const toggleSelectAlert = (id: string) => {
        setSelectedAlertIds(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const selectAll = () => {
        setSelectedAlertIds(new Set(filteredAlerts.map(n => n.id)));
    };

    const clearSelection = () => setSelectedAlertIds(new Set());

    const markSelectedRead = async () => {
        await Promise.all([...selectedAlertIds].map(id => notificationService.markAsRead(id)));
        await loadAlerts();
        clearSelection();
    };

    const deleteSelected = async () => {
        await Promise.all([...selectedAlertIds].map(id => notificationService.deleteNotification(id)));
        await loadAlerts();
        clearSelection();
    };

    const markAllRead = async () => {
        await notificationService.markAllAsRead(emailFilter);
        await loadAlerts();
    };

    // ── Render ─────────────────────────────────────────────────────────────
    const tabs: Array<{ id: TabId; label: string; icon: React.ElementType; badge?: number }> = [
        { id: 'alertas', label: 'Alertas', icon: Bell, badge: unread > 0 ? unread : undefined },
        { id: 'logs', label: 'Logs de envio', icon: Zap, badge: logFailed > 0 ? logFailed : undefined },
        { id: 'preferencias', label: 'Preferências', icon: Settings },
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-6 py-5 shrink-0">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                        <Bell className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-gray-900 uppercase tracking-widest">Central de Notificações</h1>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alertas, envios e preferências</p>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <KPICard label="Não lidas" value={unread} icon={Bell} color="indigo" />
                    <KPICard label="Total" value={notifications.length} icon={BarChart3} color="gray" />
                    <KPICard label="Falhas (log)" value={logFailed} icon={AlertTriangle} color={logFailed > 0 ? 'red' : 'gray'} />
                    <KPICard label="Destinatários" value={new Set(notifications.map(n => n.recipientEmail)).size} icon={Users} color="gray" />
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                            {tab.badge !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'alertas' && (
                    <AlertsTab
                        filteredAlerts={filteredAlerts}
                        loading={alertsLoading}
                        error={alertsError}
                        search={alertSearch}
                        setSearch={setAlertSearch}
                        typeFilter={alertTypeFilter}
                        setTypeFilter={setAlertTypeFilter}
                        statusFilter={alertStatusFilter}
                        setStatusFilter={setAlertStatusFilter}
                        orgFilter={alertOrgFilter}
                        setOrgFilter={setAlertOrgFilter}
                        isAdmin={isAdmin}
                        selectedIds={selectedAlertIds}
                        onToggleSelect={toggleSelectAlert}
                        onSelectAll={selectAll}
                        onClearSelection={clearSelection}
                        onMarkSelectedRead={markSelectedRead}
                        onDeleteSelected={deleteSelected}
                        onMarkAllRead={markAllRead}
                        onRefresh={loadAlerts}
                        onNavigate={onNavigate}
                        onMarkRead={async (id) => {
                            await notificationService.markAsRead(id);
                            await loadAlerts();
                        }}
                        onDelete={async (id) => {
                            await notificationService.deleteNotification(id);
                            await loadAlerts();
                        }}
                    />
                )}
                {activeTab === 'logs' && (
                    <LogsTab
                        filteredLogs={filteredLogs}
                        loading={logsLoading}
                        error={logsError}
                        search={logSearch}
                        setSearch={setLogSearch}
                        channelFilter={logChannelFilter}
                        setChannelFilter={setLogChannelFilter}
                        statusFilter={logStatusFilter}
                        setStatusFilter={setLogStatusFilter}
                        onRefresh={loadLogs}
                    />
                )}
                {activeTab === 'preferencias' && <PreferencesTab />}
            </div>
        </div>
    );
};

// ── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
    const colorMap: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-600',
        red: 'bg-red-50 text-red-600',
        gray: 'bg-gray-100 text-gray-600',
        emerald: 'bg-emerald-50 text-emerald-600',
    };
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.gray}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div>
                <div className="text-xl font-black text-gray-900">{value}</div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</div>
            </div>
        </div>
    );
}

// ── Aba Alertas ─────────────────────────────────────────────────────────────

interface AlertsTabProps {
    filteredAlerts: Notification[];
    loading: boolean;
    error: string;
    search: string;
    setSearch: (v: string) => void;
    typeFilter: NotifType;
    setTypeFilter: (v: NotifType) => void;
    statusFilter: NotifStatus;
    setStatusFilter: (v: NotifStatus) => void;
    orgFilter: string;
    setOrgFilter: (v: string) => void;
    isAdmin: boolean;
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onSelectAll: () => void;
    onClearSelection: () => void;
    onMarkSelectedRead: () => void;
    onDeleteSelected: () => void;
    onMarkAllRead: () => void;
    onRefresh: () => void;
    onNavigate?: (link: string) => void;
    onMarkRead: (id: string) => void;
    onDelete: (id: string) => void;
}

function AlertsTab({
    filteredAlerts, loading, error, search, setSearch,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter,
    orgFilter, setOrgFilter, isAdmin,
    selectedIds, onToggleSelect, onSelectAll, onClearSelection,
    onMarkSelectedRead, onDeleteSelected, onMarkAllRead, onRefresh,
    onNavigate, onMarkRead, onDelete
}: AlertsTabProps) {
    return (
        <div className="p-6 space-y-4">
            {/* Filtros */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-48 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar título ou mensagem..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <Select
                        value={typeFilter}
                        onChange={v => setTypeFilter(v as NotifType)}
                        options={[
                            { value: '', label: 'Todos os tipos' },
                            ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))
                        ]}
                    />
                    <Select
                        value={statusFilter}
                        onChange={v => setStatusFilter(v as NotifStatus)}
                        options={[
                            { value: '', label: 'Todos os status' },
                            { value: 'unread', label: 'Não lidas' },
                            { value: 'read', label: 'Lidas' },
                        ]}
                    />
                    {isAdmin && (
                        <input
                            value={orgFilter}
                            onChange={e => setOrgFilter(e.target.value)}
                            placeholder="Filtrar por e-mail..."
                            className="px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                        />
                    )}
                    <button
                        onClick={onRefresh}
                        className="p-2 bg-gray-50 border border-gray-100 rounded-xl hover:bg-gray-100 transition-colors"
                        title="Atualizar"
                    >
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Toolbar de seleção */}
            {selectedIds.size > 0 ? (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-black text-indigo-700 uppercase tracking-widest">{selectedIds.size} selecionada(s)</span>
                    <button onClick={onMarkSelectedRead} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors">
                        <Check className="w-3 h-3" /> Marcar como lida
                    </button>
                    <button onClick={onDeleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                    <button onClick={onClearSelection} className="ml-auto p-1.5 hover:bg-indigo-100 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                </div>
            ) : (
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <button onClick={onSelectAll} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">
                            Selecionar tudo ({filteredAlerts.length})
                        </button>
                    </div>
                    {filteredAlerts.some(n => !n.isRead) && (
                        <button
                            onClick={onMarkAllRead}
                            className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                            <Check className="w-3 h-3" /> Marcar todas como lidas
                        </button>
                    )}
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <CenteredSpinner label="Carregando notificações..." />
            ) : error ? (
                <ErrorState message={error} onRetry={onRefresh} />
            ) : filteredAlerts.length === 0 ? (
                <EmptyState icon={Bell} message="Nenhuma notificação encontrada" />
            ) : (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                    {filteredAlerts.map(n => (
                        <div
                            key={n.id}
                            className={`p-5 group relative flex items-start gap-4 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-indigo-50/30' : ''}`}
                        >
                            {/* Indicador não lida */}
                            {!n.isRead && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                            )}

                            {/* Checkbox */}
                            <input
                                type="checkbox"
                                checked={selectedIds.has(n.id)}
                                onChange={() => onToggleSelect(n.id)}
                                className="mt-1 w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
                            />

                            {/* Conteúdo */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h3 className={`text-xs font-black uppercase tracking-tight ${!n.isRead ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</h3>
                                    <NotifTypeBadge type={n.type} />
                                    {!n.isRead && (
                                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest">Nova</span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 font-medium leading-relaxed mb-2">{n.message}</p>
                                <div className="flex items-center gap-4 flex-wrap">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                        <Clock className="w-3 h-3" />
                                        {new Date(n.createdAt).toLocaleString('pt-BR')}
                                    </span>
                                    {isAdmin && n.recipientEmail && (
                                        <span className="text-[10px] font-bold text-indigo-400">{n.recipientEmail}</span>
                                    )}
                                    {n.link && (
                                        <button
                                            onClick={() => onNavigate ? onNavigate(n.link!) : void 0}
                                            className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                                        >
                                            Ver detalhes <ExternalLink className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Ações rápidas */}
                            <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {!n.isRead && (
                                    <button
                                        onClick={() => onMarkRead(n.id)}
                                        className="p-1.5 bg-white border border-gray-100 text-emerald-600 rounded-lg hover:bg-emerald-50 shadow-sm transition-all"
                                        title="Marcar como lida"
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => onDelete(n.id)}
                                    className="p-1.5 bg-white border border-gray-100 text-red-500 rounded-lg hover:bg-red-50 shadow-sm transition-all"
                                    title="Excluir"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Aba Logs ────────────────────────────────────────────────────────────────

interface LogsTabProps {
    filteredLogs: NotificationLogEntry[];
    loading: boolean;
    error: string;
    search: string;
    setSearch: (v: string) => void;
    channelFilter: LogChannel;
    setChannelFilter: (v: LogChannel) => void;
    statusFilter: LogStatus;
    setStatusFilter: (v: LogStatus) => void;
    onRefresh: () => void;
}

function LogsTab({ filteredLogs, loading, error, search, setSearch, channelFilter, setChannelFilter, statusFilter, setStatusFilter, onRefresh }: LogsTabProps) {
    const [expanded, setExpanded] = React.useState<string | null>(null);

    return (
        <div className="p-6 space-y-4">
            {/* Filtros */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-48 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar destinatário ou assunto..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <Select
                        value={channelFilter}
                        onChange={v => setChannelFilter(v as LogChannel)}
                        options={[
                            { value: '', label: 'Todos os canais' },
                            { value: 'email', label: 'E-mail' },
                            { value: 'whatsapp', label: 'WhatsApp' },
                            { value: 'webhook', label: 'Webhook' },
                        ]}
                    />
                    <Select
                        value={statusFilter}
                        onChange={v => setStatusFilter(v as LogStatus)}
                        options={[
                            { value: '', label: 'Todos os status' },
                            { value: 'sent', label: 'Enviados' },
                            { value: 'failed', label: 'Falhou' },
                            { value: 'pending', label: 'Pendente' },
                        ]}
                    />
                    <button onClick={onRefresh} className="p-2 bg-gray-50 border border-gray-100 rounded-xl hover:bg-gray-100 transition-colors" title="Atualizar">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {loading ? (
                <CenteredSpinner label="Carregando logs..." />
            ) : error ? (
                <ErrorState message={error} onRetry={onRefresh} />
            ) : filteredLogs.length === 0 ? (
                <EmptyState icon={Zap} message="Nenhum log encontrado" />
            ) : (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                    {filteredLogs.map(log => {
                        const ChannelIcon = CHANNEL_ICONS[log.channel] ?? Zap;
                        const isExpanded = expanded === log.id;
                        return (
                            <div key={log.id} className="p-5 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 bg-gray-100 rounded-lg shrink-0 mt-0.5">
                                        <ChannelIcon className="w-4 h-4 text-gray-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="text-xs font-black text-gray-800 uppercase tracking-tight">{log.channel.toUpperCase()}</span>
                                            <LogStatusBadge status={log.status} />
                                            {log.orderId && (
                                                <span className="text-[10px] font-bold text-gray-400">Pedido #{log.orderId.slice(0, 8)}</span>
                                            )}
                                        </div>
                                        {log.subject && <p className="text-sm font-bold text-gray-700 mb-0.5">{log.subject}</p>}
                                        {log.recipient && <p className="text-xs text-gray-500 mb-1">{log.recipient}</p>}
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                            <Clock className="w-3 h-3" />
                                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                                        </span>
                                        {log.error && (
                                            <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg">
                                                <p className="text-xs text-red-600 font-medium">{log.error}</p>
                                            </div>
                                        )}
                                    </div>
                                    {(log.body || log.metadata) && (
                                        <button
                                            onClick={() => setExpanded(isExpanded ? null : log.id)}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                                            title="Ver detalhes"
                                        >
                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>
                                    )}
                                </div>
                                {isExpanded && (
                                    <div className="mt-3 ml-14 space-y-2">
                                        {log.body && (
                                            <div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Corpo</div>
                                                <pre className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{log.body}</pre>
                                            </div>
                                        )}
                                        {log.metadata && (
                                            <div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Metadata</div>
                                                <pre className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 font-medium cursor-pointer"
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
    );
}

function CenteredSpinner({ label }: { label: string }) {
    return (
        <div className="p-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">{label}</p>
        </div>
    );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="p-16 text-center">
            <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-red-500 mb-3">{message}</p>
            <button onClick={onRetry} className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">Tentar novamente</button>
        </div>
    );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
    return (
        <div className="p-16 text-center opacity-40">
            <Icon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{message}</p>
        </div>
    );
}

export default NotificationsCenter;
