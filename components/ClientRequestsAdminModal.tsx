import React from 'react';
import { X, Loader2, Plus, Wrench, ClipboardList, ChevronDown, AlertCircle, Clock, Save, Bell } from 'lucide-react';
import { Client } from '../types';
import { clientRequestsService, ClientRequest, ClientServiceOrder } from '../services/clientRequestsService';
import { clientMessagesService } from '../services/clientMessagesService';

interface Props {
    client: Client;
    organizationId: string;
    onClose: () => void;
}

type ActiveTab = 'requests' | 'orders';

const PRIORITY_COLORS: Record<string, string> = {
    Baixa: 'bg-gray-100 text-gray-500',
    Média: 'bg-blue-100 text-blue-600',
    Alta: 'bg-amber-100 text-amber-700',
    Urgente: 'bg-red-100 text-red-600',
};

const REQ_STATUS_COLORS: Record<string, string> = {
    Aberto: 'bg-amber-100 text-amber-700',
    'Em Andamento': 'bg-blue-100 text-blue-700',
    Aguardando: 'bg-purple-100 text-purple-700',
    Resolvido: 'bg-emerald-100 text-emerald-700',
    Cancelado: 'bg-gray-100 text-gray-400',
};

const OS_STATUS_COLORS: Record<string, string> = {
    Aberta: 'bg-blue-100 text-blue-700',
    'Em Execução': 'bg-amber-100 text-amber-700',
    Concluída: 'bg-emerald-100 text-emerald-700',
    Cancelada: 'bg-gray-100 text-gray-400',
};

const NEW_REQUEST_BLANK = { title: '', description: '', category: 'Geral', priority: 'Média' as const };
const NEW_OS_BLANK = { number: '', title: '', description: '', status: 'Aberta' as const, priority: 'Média' as const, scheduled_date: '', value: '' };

const ClientRequestsAdminModal: React.FC<Props> = ({ client, organizationId, onClose }) => {
    const showRequests = client.category === 'Locação' || client.category !== 'Serviços';
    const showOrders   = client.category === 'Serviços' || client.category !== 'Locação';
    const defaultTab: ActiveTab = client.category === 'Serviços' ? 'orders' : 'requests';

    const [activeTab, setActiveTab] = React.useState<ActiveTab>(defaultTab);
    const [requests, setRequests] = React.useState<ClientRequest[]>([]);
    const [orders, setOrders]     = React.useState<ClientServiceOrder[]>([]);
    const [loading, setLoading]   = React.useState(true);
    const [saving, setSaving]     = React.useState(false);
    const [error, setError]       = React.useState<string | null>(null);

    // inline edit state
    const [notifyClient, setNotifyClient] = React.useState(false);

    const [editingReqId, setEditingReqId]   = React.useState<string | null>(null);
    const [editingReqData, setEditingReqData] = React.useState<Partial<ClientRequest>>({});
    const [editingOsId, setEditingOsId]     = React.useState<string | null>(null);
    const [editingOsData, setEditingOsData] = React.useState<Partial<ClientServiceOrder>>({});

    // new item forms
    const [showNewReq, setShowNewReq] = React.useState(false);
    const [newReq, setNewReq]         = React.useState({ ...NEW_REQUEST_BLANK });
    const [showNewOs, setShowNewOs]   = React.useState(false);
    const [newOs, setNewOs]           = React.useState({ ...NEW_OS_BLANK });

    React.useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [reqs, oss] = await Promise.all([
                clientRequestsService.listRequests(organizationId, client.id),
                clientRequestsService.listServiceOrders(organizationId, client.id),
            ]);
            setRequests(reqs);
            setOrders(oss);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    // ── Chamados ──────────────────────────────────────────────────────────────
    const startEditReq = (req: ClientRequest) => {
        setEditingReqId(req.id);
        setEditingReqData({ status: req.status, assigned_to: req.assigned_to ?? '', admin_notes: req.admin_notes ?? '' });
    };

    const saveReq = async (id: string) => {
        setSaving(true);
        try {
            await clientRequestsService.updateRequest(id, editingReqData);
            const updated = requests.find(r => r.id === id);
            if (notifyClient && editingReqData.status && updated) {
                await clientMessagesService.sendMessage(organizationId, client.id, {
                    sender_name: 'Equipe',
                    type: 'status_update',
                    title: `Chamado atualizado: ${editingReqData.status}`,
                    body: `Seu chamado "${updated.title}" foi atualizado para: ${editingReqData.status}.${editingReqData.admin_notes ? `\n\n${editingReqData.admin_notes}` : ''}`,
                    reference_type: 'chamado',
                    reference_id: id,
                });
            }
            setRequests(prev => prev.map(r => r.id === id ? { ...r, ...editingReqData } : r));
            setEditingReqId(null);
            setNotifyClient(false);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const createReq = async () => {
        if (!newReq.title.trim()) return;
        setSaving(true);
        try {
            const created = await clientRequestsService.createRequest(organizationId, client.id, {
                ...newReq,
                status: 'Aberto',
                opened_at: new Date().toISOString().slice(0, 10),
            } as any);
            setRequests(prev => [created, ...prev]);
            setNewReq({ ...NEW_REQUEST_BLANK });
            setShowNewReq(false);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao criar chamado');
        } finally {
            setSaving(false);
        }
    };

    // ── Ordens de Serviço ─────────────────────────────────────────────────────
    const startEditOs = (os: ClientServiceOrder) => {
        setEditingOsId(os.id);
        setEditingOsData({
            status: os.status,
            assigned_to: os.assigned_to ?? '',
            scheduled_date: os.scheduled_date ?? '',
            admin_notes: os.admin_notes ?? '',
        });
    };

    const saveOs = async (id: string) => {
        setSaving(true);
        try {
            await clientRequestsService.updateServiceOrder(id, editingOsData);
            const updated = orders.find(o => o.id === id);
            if (notifyClient && editingOsData.status && updated) {
                await clientMessagesService.sendMessage(organizationId, client.id, {
                    sender_name: 'Equipe',
                    type: 'status_update',
                    title: `OS atualizada: ${editingOsData.status}`,
                    body: `Sua ordem de serviço "${updated.title}" (${updated.number}) foi atualizada para: ${editingOsData.status}.${editingOsData.scheduled_date ? `\nAgendada para: ${new Date(editingOsData.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}${editingOsData.admin_notes ? `\n\n${editingOsData.admin_notes}` : ''}`,
                    reference_type: 'os',
                    reference_id: id,
                });
            }
            setOrders(prev => prev.map(o => o.id === id ? { ...o, ...editingOsData } : o));
            setEditingOsId(null);
            setNotifyClient(false);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const createOs = async () => {
        if (!newOs.title.trim() || !newOs.number.trim()) return;
        setSaving(true);
        try {
            const created = await clientRequestsService.createServiceOrder(organizationId, client.id, {
                number: newOs.number,
                title: newOs.title,
                description: newOs.description,
                status: newOs.status,
                priority: newOs.priority,
                scheduled_date: newOs.scheduled_date || undefined,
                value: newOs.value ? Number(newOs.value) : undefined,
            } as any);
            setOrders(prev => [created, ...prev]);
            setNewOs({ ...NEW_OS_BLANK });
            setShowNewOs(false);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao criar OS');
        } finally {
            setSaving(false);
        }
    };

    const CATEGORY_COLOR: Record<string, string> = {
        Locação: 'bg-blue-100 text-blue-700',
        Serviços: 'bg-amber-100 text-amber-700',
        Vendas: 'bg-emerald-100 text-emerald-700',
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Chamados & OS</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-bold text-gray-500">{client.name}</span>
                            {client.category && (
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CATEGORY_COLOR[client.category] ?? 'bg-gray-100 text-gray-500'}`}>
                                    {client.category}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                {showRequests && showOrders && (
                    <div className="flex gap-1 px-8 pt-4 shrink-0">
                        {([['requests', 'Chamados', Wrench], ['orders', 'Ordens de Serviço', ClipboardList]] as const).map(([id, label, Icon]) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-button font-black uppercase tracking-widest transition-all ${activeTab === id ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                            >
                                <Icon className="w-3.5 h-3.5" />{label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Error banner */}
                {error && (
                    <div className="mx-8 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 shrink-0">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                    ) : activeTab === 'requests' ? (
                        <>
                            {/* New request form */}
                            {showNewReq ? (
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3">
                                    <p className="text-xs font-black text-blue-600 uppercase tracking-widest">Novo Chamado</p>
                                    <input className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-400" placeholder="Título *" value={newReq.title} onChange={e => setNewReq(p => ({ ...p, title: e.target.value }))} />
                                    <textarea className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-400 resize-none" rows={2} placeholder="Descrição" value={newReq.description} onChange={e => setNewReq(p => ({ ...p, description: e.target.value }))} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest block mb-1">Categoria</label>
                                            <select className="w-full rounded-xl border border-blue-200 px-3 py-2 text-sm bg-white outline-none" value={newReq.category} onChange={e => setNewReq(p => ({ ...p, category: e.target.value }))}>
                                                {['Elétrica','Hidráulica','Estrutural','Pintura','Serralheria','Geral','Outro'].map(c => <option key={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest block mb-1">Prioridade</label>
                                            <select className="w-full rounded-xl border border-blue-200 px-3 py-2 text-sm bg-white outline-none" value={newReq.priority} onChange={e => setNewReq(p => ({ ...p, priority: e.target.value as any }))}>
                                                {['Baixa','Média','Alta','Urgente'].map(c => <option key={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={createReq} disabled={saving || !newReq.title.trim()} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all">
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Criar Chamado'}
                                        </button>
                                        <button onClick={() => setShowNewReq(false)} className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setShowNewReq(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-200 text-blue-500 rounded-2xl text-button font-black uppercase tracking-widest hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                                    <Plus className="w-4 h-4" /> Novo Chamado
                                </button>
                            )}

                            {requests.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <Wrench className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                                    <p className="text-sm font-bold">Nenhum chamado registrado</p>
                                </div>
                            ) : requests.map(req => (
                                <div key={req.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-gray-900 uppercase tracking-tight truncate">{req.title}</p>
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                {req.category} · {new Date(req.opened_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${PRIORITY_COLORS[req.priority]}`}>{req.priority}</span>
                                            {editingReqId !== req.id && (
                                                <button onClick={() => startEditReq(req)} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {req.description && <p className="text-xs text-gray-500 mb-3 leading-relaxed">{req.description}</p>}

                                    {editingReqId === req.id ? (
                                        <div className="space-y-3 pt-3 border-t border-gray-100">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status</label>
                                                    <select className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white outline-none" value={editingReqData.status} onChange={e => setEditingReqData(p => ({ ...p, status: e.target.value as any }))}>
                                                        {['Aberto','Em Andamento','Aguardando','Resolvido','Cancelado'].map(s => <option key={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Responsável</label>
                                                    <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="Nome" value={editingReqData.assigned_to ?? ''} onChange={e => setEditingReqData(p => ({ ...p, assigned_to: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Notas Internas</label>
                                                <textarea className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-none" rows={2} value={editingReqData.admin_notes ?? ''} onChange={e => setEditingReqData(p => ({ ...p, admin_notes: e.target.value }))} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                                                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Bell className="w-3 h-3" /> Notificar cliente</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button onClick={() => saveReq(req.id)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all">
                                                        <Save className="w-3.5 h-3.5" />{saving ? 'Salvando...' : 'Salvar'}
                                                    </button>
                                                    <button onClick={() => { setEditingReqId(null); setNotifyClient(false); }} className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Cancelar</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${REQ_STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-400'}`}>{req.status}</span>
                                            {req.assigned_to && <span className="text-xs text-gray-400 font-bold">· {req.assigned_to}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {/* New OS form */}
                            {showNewOs ? (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-3">
                                    <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Nova Ordem de Serviço</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Número *</label>
                                            <input className="w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400" placeholder="OS-2026-001" value={newOs.number} onChange={e => setNewOs(p => ({ ...p, number: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Prioridade</label>
                                            <select className="w-full rounded-xl border border-indigo-200 px-3 py-2.5 text-sm bg-white outline-none" value={newOs.priority} onChange={e => setNewOs(p => ({ ...p, priority: e.target.value as any }))}>
                                                {['Baixa','Média','Alta','Urgente'].map(c => <option key={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <input className="w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Título *" value={newOs.title} onChange={e => setNewOs(p => ({ ...p, title: e.target.value }))} />
                                    <textarea className="w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400 resize-none" rows={2} placeholder="Descrição" value={newOs.description} onChange={e => setNewOs(p => ({ ...p, description: e.target.value }))} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Data Agendada</label>
                                            <input type="date" className="w-full rounded-xl border border-indigo-200 px-3 py-2.5 text-sm bg-white outline-none" value={newOs.scheduled_date} onChange={e => setNewOs(p => ({ ...p, scheduled_date: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Valor (R$)</label>
                                            <input type="number" className="w-full rounded-xl border border-indigo-200 px-3 py-2.5 text-sm bg-white outline-none" placeholder="0,00" value={newOs.value} onChange={e => setNewOs(p => ({ ...p, value: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={createOs} disabled={saving || !newOs.title.trim() || !newOs.number.trim()} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all">
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Criar OS'}
                                        </button>
                                        <button onClick={() => setShowNewOs(false)} className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setShowNewOs(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-2xl text-button font-black uppercase tracking-widest hover:border-indigo-400 hover:bg-indigo-50/30 transition-all">
                                    <Plus className="w-4 h-4" /> Nova Ordem de Serviço
                                </button>
                            )}

                            {orders.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                                    <p className="text-sm font-bold">Nenhuma OS registrada</p>
                                </div>
                            ) : orders.map(os => (
                                <div key={os.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0 flex items-center gap-2">
                                            <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg shrink-0">{os.number}</span>
                                            <p className="text-sm font-black text-gray-900 uppercase tracking-tight truncate">{os.title}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${PRIORITY_COLORS[os.priority]}`}>{os.priority}</span>
                                            {editingOsId !== os.id && (
                                                <button onClick={() => startEditOs(os)} className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {os.description && <p className="text-xs text-gray-500 mb-3 leading-relaxed">{os.description}</p>}
                                    <div className="flex items-center gap-3 text-xs text-gray-400 font-bold mb-2">
                                        {os.scheduled_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(os.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                                        {os.value != null && <span className="flex items-center gap-1">R$ {os.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                                    </div>

                                    {editingOsId === os.id ? (
                                        <div className="space-y-3 pt-3 border-t border-gray-100">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status</label>
                                                    <select className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white outline-none" value={editingOsData.status} onChange={e => setEditingOsData(p => ({ ...p, status: e.target.value as any }))}>
                                                        {['Aberta','Em Execução','Concluída','Cancelada'].map(s => <option key={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Responsável</label>
                                                    <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Nome" value={editingOsData.assigned_to ?? ''} onChange={e => setEditingOsData(p => ({ ...p, assigned_to: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Data Agendada</label>
                                                <input type="date" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white outline-none" value={editingOsData.scheduled_date ?? ''} onChange={e => setEditingOsData(p => ({ ...p, scheduled_date: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Notas Internas</label>
                                                <textarea className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none" rows={2} value={editingOsData.admin_notes ?? ''} onChange={e => setEditingOsData(p => ({ ...p, admin_notes: e.target.value }))} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                                                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Bell className="w-3 h-3" /> Notificar cliente</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button onClick={() => saveOs(os.id)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all">
                                                        <Save className="w-3.5 h-3.5" />{saving ? 'Salvando...' : 'Salvar'}
                                                    </button>
                                                    <button onClick={() => { setEditingOsId(null); setNotifyClient(false); }} className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Cancelar</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${OS_STATUS_COLORS[os.status] ?? 'bg-gray-100 text-gray-400'}`}>{os.status}</span>
                                            {os.assigned_to && <span className="text-xs text-gray-400 font-bold">· {os.assigned_to}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">
                        {activeTab === 'requests' ? `${requests.length} chamado${requests.length !== 1 ? 's' : ''}` : `${orders.length} OS`}
                    </span>
                    <button onClick={onClose} className="px-5 py-2 border border-gray-200 text-gray-500 rounded-xl text-button font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default ClientRequestsAdminModal;
