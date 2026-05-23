import React from 'react';
import { Bell, X, Check, ExternalLink, Trash2, Clock } from 'lucide-react';
import { notificationService, Notification } from '../services/notificationService';

interface NotificationPanelProps {
    email?: string;
    onClose: () => void;
    onNavigate?: (link: string) => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ email, onClose, onNavigate }) => {
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState<'active' | 'history'>('active');

    const loadNotifications = React.useCallback(async () => {
        try {
            const data = await notificationService.listNotifications(email);
            setNotifications(data);
        } catch (error) {
            console.error("Error loading notifications:", error);
        } finally {
            setLoading(false);
        }
    }, [email]);

    React.useEffect(() => {
        loadNotifications();

        // Listen to local updates
        const handleLocalUpdate = () => loadNotifications();
        window.addEventListener('notifications_updated', handleLocalUpdate);

        // Real-time sync for the panel (Supabase)
        const unsubscribe = notificationService.subscribeToNotifications(() => {
            loadNotifications();
        }, email);

        return () => {
            window.removeEventListener('notifications_updated', handleLocalUpdate);
            unsubscribe();
        };
    }, [loadNotifications, email]);

    const handleMarkAsRead = async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationService.markAllAsRead(email);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (error) {
            console.error("Error marking all as read:", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await notificationService.deleteNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (error) {
            console.error("Error deleting notification:", error);
        }
    };

    const filteredNotifications = React.useMemo(() => {
        return notifications.filter(n => activeTab === 'active' ? !n.isRead : n.isRead);
    }, [notifications, activeTab]);

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex flex-col h-full bg-white shadow-2xl border-l border-gray-100 animate-in slide-in-from-right duration-300 w-80 md:w-96"
        >
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Notificações</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Acompanhe seus alertas</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex p-1 bg-white border border-gray-100 rounded-xl shadow-sm">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Ativas
                        {notifications.filter(n => !n.isRead).length > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === 'active' ? 'bg-white text-indigo-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                {notifications.filter(n => !n.isRead).length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Histórico
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="p-4 flex items-center justify-between border-b border-gray-50">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        {activeTab === 'active' ? 'Pendentes de leitura' : 'Alertas anteriores'}
                    </span>
                    {activeTab === 'active' && notifications.filter(n => !n.isRead).length > 0 && (
                        <button
                            onClick={handleMarkAllAsRead}
                            className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-all"
                        >
                            <Check className="w-3 h-3" />
                            Marcar todas como lidas
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Carregando Notificações...</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center h-full opacity-40">
                        <Bell className="w-12 h-12 text-gray-200 mb-4" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            {activeTab === 'active' ? 'Nenhuma notificação nova' : 'O histórico está vazio'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {filteredNotifications.map((n) => (
                            <div
                                key={n.id}
                                className={`p-6 transition-all hover:bg-gray-50 group relative ${!n.isRead ? 'bg-indigo-50/20' : ''}`}
                            >
                                {!n.isRead && (
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                                )}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-tight mb-1">{n.title}</h3>
                                        <p className="text-sm text-gray-600 font-medium leading-relaxed mb-3">{n.message}</p>
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                                <Clock className="w-3 h-3" />
                                                {new Date(n.createdAt).toLocaleDateString()}
                                            </span>
                                            {!email && n.recipientEmail && (
                                                <span className="text-[10px] font-bold text-indigo-400 truncate max-w-[120px]" title={n.recipientEmail}>
                                                    @{n.recipientEmail.split('@')[0]}
                                                </span>
                                            )}
                                            {n.link && (
                                                <button
                                                    onClick={() => onNavigate ? onNavigate(n.link!) : window.location.href = n.link!}
                                                    className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                                                >
                                                    Ver Detalhes
                                                    <ExternalLink className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!n.isRead && (
                                            <button
                                                onClick={() => handleMarkAsRead(n.id)}
                                                className="p-1.5 bg-white border border-gray-100 text-green-600 rounded-lg hover:bg-green-50 shadow-sm transition-all active:scale-95"
                                                title="Marcar como lida"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(n.id)}
                                            className="p-1.5 bg-white border border-gray-100 text-red-600 rounded-lg hover:bg-red-50 shadow-sm transition-all active:scale-95"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-gray-50 bg-gray-50/30 flex items-center justify-between">
                <button
                    onClick={loadNotifications}
                    className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                >
                    Atualizar
                </button>
                <button
                    onClick={() => { onNavigate?.('notifications-center'); onClose(); }}
                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors flex items-center gap-1"
                >
                    Ver todas
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
        </div>
    );
};

export default NotificationPanel;
